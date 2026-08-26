<?php
/**
 * Offline AI Intent Engine
 * Ground Code Resort & KDS Management System
 *
 * Pure logic, zero dependencies (no database.php, no session, no $pdo) - deliberately kept
 * dependency-free so php/tests/test_ai_intents.php can require this file alone and exercise it
 * directly, without mocking a DB connection or a login session. php/api/ai_assistant.php is the
 * only real caller: it does all the auth/session/rate-limiting/DB work, then hands off to
 * runOfflineIntentEngine() here for the actual "what does this message mean" decision.
 */

// ============================================================================================
// OFFLINE INTENT ENGINE
// ============================================================================================
// Table-driven + scored (24 Aug 2026 rewrite - see php/tests/test_ai_intents.php for the
// coverage suite). The app's whole action surface is small and closed (~10 real actions + a
// handful of info-only queries), so this is a classification problem over a known-finite set,
// not something that needs an ML model or "training" - it needed a matcher that generalizes
// across phrasings without a manual keyword patch for every new one a user happens to type.
//
// WHY SCORED, NOT FIRST-MATCH-WINS: the previous version was a long if/elseif chain checked in a
// fixed order - a match on an earlier, more generic intent (e.g. a bare "bill") could win over a
// later, more specific one it was really about, entirely because of table position, not because
// it was the better match. Scoring picks whichever intent's phrases matched the most/most
// specifically, regardless of where it sits in the table - and every phrase list below is
// intentionally NOT read top-to-bottom as "if none of these matched, try the next block": every
// row is scored independently and the highest score wins.
//
// PHRASE FORMAT: each 'phrases' entry is either
//   - a string:  a literal word/phrase, matched with a word-boundary check (so 'bill' doesn't
//     false-positive inside 'billing'). Score = word count (so "staff meal" outscores a lone
//     "meal" match elsewhere) - more words = more specific = should win over a generic overlap.
//   - an array of strings: an AND-group - ALL words must appear somewhere in the message (not
//     necessarily adjacent), for phrasings where the trigger words can be in either order or
//     have something between them ("add badminton bill" still means "add" + "bill" even though
//     they're not adjacent). Scores the same as a same-length literal phrase.
//
// TO ADD A NEW PHRASING: find the matching intent below and append one phrase/AND-group to its
// list - do NOT add a new if-block. Then add one row to php/tests/test_ai_intents.php so it's
// covered by the test suite instead of only being caught by the next live user who tries it.

/**
 * Whole-word/phrase match. Word-boundary-safe for normal alnum phrases; falls back to a plain
 * substring check for phrases that are pure symbols (e.g. '₹'), since PCRE's \b has no reliable
 * boundary to anchor a symbol-only token against (a symbol is itself "non-word" on both sides).
 */
function phraseMatches(string $lower, string $phrase): bool {
    if (preg_match('/^[a-z0-9\s\-]+$/i', $phrase)) {
        // 's?' before the final boundary (found via the test suite, 24 Aug 2026): a strict
        // trailing \b rejected "show all bookings" against the phrase "all booking", since
        // "booking"+"s" are both word characters with no boundary between them - plurals never
        // matched a singular phrase. Tolerating exactly one optional trailing 's' fixes that
        // without reopening the "bill" vs "billing" false-positive this word-boundary check
        // exists to prevent - "billing" still isn't "bill" or "bills" followed by a boundary.
        return (bool)preg_match('/\b' . preg_quote($phrase, '/') . 's?\b/iu', $lower);
    }
    return str_contains($lower, $phrase);
}

/** @param array<int, string|string[]> $phrases */
function scoreIntentMatch(string $lower, array $phrases): int {
    $score = 0;
    foreach ($phrases as $phrase) {
        if (is_array($phrase)) {
            $allPresent = true;
            foreach ($phrase as $word) {
                if (!phraseMatches($lower, $word)) {
                    $allPresent = false;
                    break;
                }
            }
            if ($allPresent) {
                $score += count($phrase);
            }
        } elseif (phraseMatches($lower, $phrase)) {
            $score += substr_count(trim($phrase), ' ') + 1;
        }
    }
    return $score;
}

/**
 * Staff-name extraction for the staff-meals intent. Prefers a capitalized word from the
 * ORIGINAL (not lowercased) query - real names are usually typed capitalized ("Kinkar") while
 * the surrounding instruction words ("staff", "meal", "for", "select") normally aren't. Falls
 * back to scanning every for/to/staff/select match and taking the LAST non-stopword one (names
 * are usually mentioned toward the end: "...for kinkar", "...select kinkar").
 *
 * Found live (24 Aug 2026): the old version only took the FIRST for/to/staff match, so "open
 * staff meal page, and automatically select Kinkar" matched "staff meal" first, captured "meal"
 * (a stopword, correctly rejected), and never looked further to find "select Kinkar" at all.
 */
function extractStaffNameFromQuery(string $q): ?string {
    $stopWords = ['staff', 'food', 'meal', 'meals', 'lunch', 'dinner', 'thali', 'the', 'a', 'an', 'for', 'to', 'page', 'open', 'select', 'automatically', 'and', 'add', 'log'];

    if (preg_match_all('/\b([A-Z][a-z]+)\b/', $q, $capMatches)) {
        foreach ($capMatches[1] as $candidate) {
            if (!in_array(strtolower($candidate), $stopWords, true)) {
                return $candidate;
            }
        }
    }

    if (preg_match_all('/(?:for|to|staff|select)\s+([A-Za-z]+)/i', $q, $matches)) {
        for ($i = count($matches[1]) - 1; $i >= 0; $i--) {
            $candidate = ucfirst(strtolower(trim($matches[1][$i])));
            if (!in_array(strtolower($candidate), $stopWords, true)) {
                return $candidate;
            }
        }
    }

    return null;
}

/**
 * Name/phone/role/salary extraction for the add-staff-member intent (onboarding a brand NEW
 * employee via StaffManagement.tsx's "Add New Staff Member" drawer, isModalOpen - a different
 * drawer from the one edit_staff deep-links to, which edits an EXISTING roster row by name).
 * Added 24 Aug 2026 as part of the proactive action-surface audit (not a live bug report) - see
 * the "systematic audit" note above getIntentTable(). Deliberately never fills the 6-digit
 * passcode field - that's a credential the admin should type deliberately, not something safe
 * to guess or leave blank from a chat message.
 */
function extractAddStaffDetails(string $q, string $lower): array {
    $phone = null;
    if (preg_match('/\b(\d{10})\b/', $q, $m)) {
        $phone = $m[1];
    }

    // Matches StaffManagement.tsx's roleOptions exactly - only overridden when a specific role
    // word is present; otherwise left null so the form's own default selection stands.
    $role = null;
    if (str_contains($lower, 'kitchen')) {
        $role = 'Staff Kitchen';
    } elseif (str_contains($lower, 'supervisor')) {
        $role = 'Staff Supervisor';
    } elseif (str_contains($lower, 'admin')) {
        $role = 'Admin';
    }

    $salary = null;
    if (preg_match('/salary\D{0,12}(\d{3,7})/i', $q, $m)) {
        $salary = (float)$m[1];
    }

    $stopWords = ['add', 'new', 'staff', 'team', 'member', 'as', 'a', 'an', 'the', 'phone', 'number',
        'salary', 'role', 'onboard', 'hire', 'register', 'create', 'account', 'for', 'with', 'kitchen',
        'supervisor', 'admin'];
    $name = null;
    if (preg_match_all('/\b([A-Z][a-z]+)\b/', $q, $capMatches)) {
        foreach ($capMatches[1] as $candidate) {
            if (!in_array(strtolower($candidate), $stopWords, true)) {
                $name = $candidate;
                break;
            }
        }
    }
    if ($name === null && preg_match('/(?:member|staff)\s+([A-Za-z]+)/i', $q, $m)) {
        $candidate = ucfirst(strtolower(trim($m[1])));
        if (!in_array(strtolower($candidate), $stopWords, true)) {
            $name = $candidate;
        }
    }

    return [$name, $phone, $role, $salary];
}

/**
 * Name/price/category extraction for the add-menu-item intent (KitchenManagement.tsx's "Add New
 * Food Menu Item" drawer, isNewMenuModalOpen - Kitchen ➔ Edit Food Menu tab). Added 24 Aug 2026,
 * same proactive audit as extractAddStaffDetails() above.
 */
function extractAddMenuItemDetails(string $q, string $lower): array {
    $price = null;
    if (preg_match('/(?:rs\.?|rupees|inr|₹)\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:rs|rupees|inr|₹)/i', $q, $m)) {
        $price = (float)(!empty($m[1]) ? $m[1] : $m[2]);
    } elseif (preg_match('/\b(?:for|at|price)\s+(\d+(?:\.\d{1,2})?)\b/i', $q, $m)) {
        $price = (float)$m[1];
    }

    // Matches KitchenManagement.tsx's newItemCategory dropdown options exactly.
    $category = null;
    if (str_contains($lower, 'starter')) {
        $category = 'Starters';
    } elseif (str_contains($lower, 'main course') || str_contains($lower, 'main dish')) {
        $category = 'Main Course';
    } elseif (str_contains($lower, 'beverage') || str_contains($lower, 'drink')) {
        $category = 'Beverages';
    } elseif (str_contains($lower, 'farm special')) {
        $category = 'Farm Specials';
    } elseif (str_contains($lower, 'dessert') || str_contains($lower, 'sweet')) {
        $category = 'Desserts';
    }

    // 'recipe'/'recipes' added 24 Aug 2026 alongside the 'add recipe'/'new recipe' trigger
    // phrases - without it, "add a new recipe for X" left "recipe" stuck in the extracted name.
    $stopWords = ['add', 'new', 'menu', 'item', 'food', 'dish', 'create', 'for', 'at', 'price',
        'rs', 'rupees', 'inr', 'the', 'a', 'an', 'to', 'starter', 'starters', 'main', 'course',
        'beverage', 'beverages', 'drink', 'farm', 'special', 'specials', 'dessert', 'desserts', 'sweet', 'category', 'in',
        'recipe', 'recipes'];
    $words = preg_split('/[\s,]+/', $q);
    $filteredWords = [];
    foreach ($words as $w) {
        $wClean = strtolower(trim(preg_replace('/[^a-zA-Z0-9]/', '', $w)));
        if (empty($wClean) || in_array($wClean, $stopWords, true) || is_numeric($wClean)) {
            continue;
        }
        $filteredWords[] = $w;
    }
    $name = !empty($filteredWords) ? implode(' ', $filteredWords) : null;

    return [$name, $price, $category];
}

/** Amount/category/description extraction for the add-expense intent (unchanged from before). */
function extractExpenseAction(string $q, string $lower): array {
    $extractedAmount = null;
    if (preg_match('/(\d+(?:\.\d{1,2})?)\s*(?:rs|rupees|inr|₹)?/i', $q, $amtMatches)) {
        $extractedAmount = (float)$amtMatches[1];
    }

    $targetCategory = 'Other';
    if (str_contains($lower, 'staff food') || str_contains($lower, 'staff meal') || str_contains($lower, 'food for') || str_contains($lower, 'meal for') || str_contains($lower, 'chai') || str_contains($lower, 'tea')) {
        $targetCategory = 'Staff Meals';
    } elseif (str_contains($lower, 'staff') || str_contains($lower, 'salary') || str_contains($lower, 'advance')) {
        $targetCategory = 'Staff Advance';
    } elseif (str_contains($lower, 'bill') || str_contains($lower, 'utility') || str_contains($lower, 'electricity') || str_contains($lower, 'wifi')) {
        $targetCategory = 'Bills';
    } elseif (str_contains($lower, 'kitchen') || str_contains($lower, 'grocery') || str_contains($lower, 'vegetable') || str_contains($lower, 'milk')) {
        $targetCategory = 'Kitchen';
    }

    $stopWords = ['log', 'add', 'new', 'expense', 'petty', 'cash', 'spent', 'bought', 'buy', 'buying', 'purchase', 'purchased', 'rs', 'rupees', 'inr', '₹', 'of', 'the', 'a', 'an', 'cost', 'bill', 'amount'];
    $words = preg_split('/[\s,]+/', $q);
    $filteredWords = [];
    foreach ($words as $w) {
        $wClean = strtolower(trim(preg_replace('/[^a-zA-Z0-9]/', '', $w)));
        if (!empty($wClean) && !in_array($wClean, $stopWords, true) && !is_numeric($wClean)) {
            $filteredWords[] = $w;
        }
    }
    $extractedDesc = !empty($filteredWords) ? implode(' ', $filteredWords) : $q;

    return [$extractedAmount, $extractedDesc, $targetCategory];
}

/**
 * Room number + requested item extraction for the add-service-request intent. Returns
 * [$roomNumber, $item] - either can be null if not found. Only ever PRE-FILLS the New Service
 * Request form (see ServiceRequestsManagement.tsx's initialRoomNumber/initialRequestItem props) -
 * this deliberately never creates the request itself; the user still reviews and clicks 'Log
 * Request' manually (24 Aug 2026, explicit decision - same "open a pre-filled form, don't submit
 * on the user's behalf" rule the expense and booking intents already follow).
 */
function extractServiceRequestDetails(string $q): array {
    $roomNumber = null;
    if (preg_match('/\broom\s*#?\s*(\d{1,4}[a-zA-Z]?)\b/i', $q, $roomMatch)) {
        $roomNumber = $roomMatch[1];
    } elseif (preg_match('/\b(\d{3,4})\b/', $q, $roomMatch)) {
        $roomNumber = $roomMatch[1];
    }

    $stopWords = ['send', 'to', 'for', 'need', 'needs', 'needed', 'request', 'bring', 'please', 'room', 'the', 'a', 'an', 'extra', 'in', 'give', 'get', 'deliver', 'some', 'more'];
    $words = preg_split('/[\s,]+/', $q);
    $filteredWords = [];
    foreach ($words as $w) {
        $wClean = strtolower(trim(preg_replace('/[^a-zA-Z0-9]/', '', $w)));
        if (empty($wClean) || in_array($wClean, $stopWords, true) || $wClean === strtolower((string)$roomNumber)) {
            continue;
        }
        $filteredWords[] = $w;
    }
    $item = !empty($filteredWords) ? implode(' ', $filteredWords) : null;

    return [$roomNumber, $item];
}

/**
 * Item name + quantity + unit extraction for the request-material (kitchen requisition)
 * intent. Returns [$item, $qty, $unit] - any can be null if not found. The requisition form
 * (KitchenManagement.tsx) only offers kg/liters/pcs/packets as units, no grams - a gram
 * quantity is converted to a kg fraction (100gm -> 0.1kg) rather than silently dropped, since
 * that's the closest thing the form can actually represent.
 */
function extractMaterialRequestDetails(string $q): array {
    $qty = null;
    $unit = null;
    $matchedText = '';

    $unitMap = [
        'kg' => 'kg', 'kgs' => 'kg', 'kilo' => 'kg', 'kilos' => 'kg', 'kilogram' => 'kg', 'kilograms' => 'kg',
        'gm' => 'gm', 'gms' => 'gm', 'gram' => 'gm', 'grams' => 'gm', 'g' => 'gm',
        'l' => 'liters', 'liter' => 'liters', 'liters' => 'liters', 'litre' => 'liters', 'litres' => 'liters',
        'pc' => 'pcs', 'pcs' => 'pcs', 'piece' => 'pcs', 'pieces' => 'pcs',
        'packet' => 'packets', 'packets' => 'packets', 'pack' => 'packets', 'packs' => 'packets',
    ];

    if (preg_match('/(\d+(?:\.\d+)?)\s*(kgs?|kilograms?|kilos?|gms?|grams?|g|l|liters?|litres?|pcs?|pieces?|packets?|packs?)\b/i', $q, $unitMatch)) {
        $matchedText = $unitMatch[0];
        $rawQty = (float)$unitMatch[1];
        $canonical = $unitMap[strtolower($unitMatch[2])] ?? null;
        if ($canonical === 'gm') {
            $qty = $rawQty / 1000;
            $unit = 'kg';
        } elseif ($canonical) {
            $qty = $rawQty;
            $unit = $canonical;
        }
    }

    // Strip the exact matched "100gm"-style token before splitting into words, so it never
    // ends up misread as part of the item name (e.g. "100gm" itself isn't purely numeric, so a
    // plain is_numeric() stopword check alone wouldn't have caught it).
    $remaining = $matchedText !== '' ? str_replace($matchedText, ' ', $q) : $q;
    // 'we'/'are'/'is'/'running'/'low'/'out'/'on'/'restock' added 24 Aug 2026 alongside the
    // 'running low'/'restock'/'out of stock' trigger phrases above - those phrasings have no
    // quantity/unit word to anchor extraction on, so without these the filler words would leak
    // straight into the extracted item text (e.g. "we are running low on rice" -> item "we are
    // running low on rice" instead of "rice").
    $stopWords = ['request', 'need', 'order', 'get', 'raw', 'material', 'stock', 'the', 'a', 'an', 'of', 'for', 'me', 'please', 'more',
        'we', 'are', 'is', 'running', 'low', 'out', 'on', 'restock'];
    $words = preg_split('/[\s,]+/', $remaining);
    $filteredWords = [];
    foreach ($words as $w) {
        $wClean = strtolower(trim(preg_replace('/[^a-zA-Z0-9]/', '', $w)));
        if (!empty($wClean) && !in_array($wClean, $stopWords, true) && !is_numeric($wClean)) {
            $filteredWords[] = $w;
        }
    }
    $item = !empty($filteredWords) ? implode(' ', $filteredWords) : null;

    return [$item, $qty, $unit];
}

/** @return array{type: string, phrases: array, handler: callable} */
function getIntentTable(): array {
    return [
        // --- STRICT SECURITY LOCKDOWN: BLOCK TECH STACK & INTERNAL CODE INQUIRIES ---
        [
            'type' => 'tech_stack_lockdown',
            'phrases' => [
                'technology', 'tech stack', 'what code', 'source code', 'framework',
                'programming language', 'database used', 'what language', 'react', 'tailwind',
                'laravel', 'php version', 'backend code', 'frontend code', 'architecture',
                'mysql', 'how is this built', 'coded in', 'built with', 'which language',
                // Broadened 24 Aug 2026 (proactive coverage pass, not a live report) - more
                // language/stack names plus credential-probing phrases, since "what's the API
                // key" is the same class of internal-info request this intent already refuses.
                'node', 'nodejs', 'node.js', 'javascript', 'typescript', 'python', 'github',
                'repository', 'repo', 'open source', 'server code', 'view source', 'show me the code',
                'hosting provider', 'where is this hosted', 'sql injection', 'vulnerability',
                'admin password', 'root password', 'database password', 'database credentials',
                'db password', 'env file', '.env', 'secret key', 'api key',
                ['show', 'code'], ['your', 'code'], ['app', 'architecture'], ['which', 'database'],
            ],
            'handler' => fn(string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array => [
                'reply' => "🔒 Security Refusal: I am trained exclusively to assist with Ground Code PMS & KDS hotel management operations and user workflows. Internal software architecture, code details, and technology stack information are private and strictly confidential.",
                'action' => null,
            ],
        ],

        // --- OPERATIONAL HOW-TO USER GUIDES ---
        [
            'type' => 'how_to_export_csv',
            'phrases' => [
                'export csv', 'download csv', 'download excel', 'export finances', 'export data',
                ['how', 'export'], ['how', 'csv'], ['how', 'excel'], ['how', 'download'],
                // Broadened 24 Aug 2026 (proactive coverage pass).
                'download report', 'export report', 'get csv', 'get excel', 'excel sheet',
                'export bookings', 'download spreadsheet', 'export sheet',
                ['how', 'spreadsheet'], ['how', 'report'],
            ],
            'handler' => fn(string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array => [
                'reply' => "📊 How to Export CSV & Financial Data:\n\n1. Go to the left sidebar menu and click 'Download Data & Excel' (or go to Finances / Reports).\n2. Click the 'Export CSV' button on top of any table.\n3. Choose your desired date range and click 'Download CSV File'.",
                'action' => ['type' => 'navigate', 'tab' => 'export', 'itemKey' => 'data_export_center'],
            ],
        ],
        [
            'type' => 'how_to_checkin_guest',
            // AND-groups require 'to' as well as the noun (found via the test suite, 24 Aug
            // 2026): ['how','booking'] alone tied with info_summary's 'how many' on "how many
            // bookings today" (both score 2), and this how-to guide won the tie by table
            // position - a genuine collision, not a tie-break that happened to be fine. "how
            // TO ..." vs "how many ..." is exactly the distinction 'to' captures.
            'phrases' => [
                'how to check in', 'how to book', 'check in guest', 'register guest',
                ['how', 'to', 'checkin'], ['how', 'to', 'booking'], ['how', 'to', 'guest'],
                // Broadened 24 Aug 2026 (proactive coverage pass) - kept the 'to' requirement in
                // every AND-group, same reason the original ones needed it (see comment above).
                'how to add guest', 'checkin process', 'checkin steps', 'guest registration process',
                ['how', 'to', 'register'], ['how', 'to', 'add', 'guest'], ['steps', 'to', 'checkin'],
            ],
            'handler' => fn(string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array => [
                'reply' => "🏨 How to Register & Check In a Guest:\n\n1. Click the '+ Add Booking' button in the top header bar or on the Bookings page.\n2. Fill in the guest's name, mobile number, room number, check-in date, and expected checkout.\n3. Upload ID document verification if required and click 'Save Booking'.",
                'action' => ['type' => 'open_add_booking'],
            ],
        ],
        [
            'type' => 'how_to_log_expense',
            'phrases' => [
                'how to log expense', 'how to add expense', 'how to record expense',
                ['how', 'expense'], ['how', 'petty'],
                // Broadened 24 Aug 2026 (proactive coverage pass).
                'how to track expense', 'how to add petty cash', 'petty cash guide', 'expense guide',
                ['guide', 'expense'], ['how', 'record', 'expense'],
            ],
            'handler' => fn(string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array => [
                'reply' => "💸 How to Log a Petty Cash Expense:\n\n1. Go to Expenses on the left sidebar and click '+ Add Expense' (or ask me: 'log 150 rs for wifi').\n2. Select the Category (Bills, Staff Advance, Kitchen, or Other).\n3. Enter the amount, item details, payment source (Property Funds vs Out-of-Pocket), and click 'Add Expense'.",
                'action' => ['type' => 'open_add_expense'],
            ],
        ],
        [
            'type' => 'how_to_use_kds',
            'phrases' => [
                'how to use kds', 'how kitchen works', 'how to take food order',
                ['how', 'kot'], ['how', 'kitchen'],
                // Broadened 24 Aug 2026 (proactive coverage pass).
                'how to place order', 'how to take order', 'kds guide', 'kitchen display guide',
                'how to send kot', ['how', 'ticket'], ['how', 'dish', 'status'],
            ],
            'handler' => fn(string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array => [
                'reply' => "🍳 How to Use Kitchen KDS & Food Orders:\n\n1. Click 'Kitchen ➔ Food Orders' on the sidebar.\n2. Use the 'Take Order' tab to place resident room orders or walk-in table orders.\n3. The Kitchen Display System (KDS) streams live orders to kitchen screens with active ticket timers and dish status buttons (Ready / Served).",
                'action' => ['type' => 'navigate', 'tab' => 'kitchen', 'itemKey' => 'take_food_order'],
            ],
        ],

        // --- ROOT-ADMIN-ONLY ACTIONS ---
        [
            'type' => 'open_telescope',
            'phrases' => [
                'telescope', 'system error', 'error log', 'error monitor',
                // Broadened 24 Aug 2026 (proactive coverage pass).
                'telescope dashboard', 'error dashboard', 'error console', 'crash log', 'crash report',
                'js errors', 'php errors', 'sql errors', 'debug log', 'application errors',
                ['show', 'errors'], ['view', 'errors'], ['check', 'errors'],
            ],
            'handler' => function (string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array {
                if (!$roleFlags['isRootAdmin']) {
                    return ['reply' => "🔒 Access Denied: The Telescope Error Monitor is restricted to Root Admin users. Your current logged-in role is '$userRole'.", 'action' => null];
                }
                return ['reply' => "Opening the Telescope Error Monitor in a new browser tab...", 'action' => ['type' => 'open_telescope']];
            },
        ],
        [
            'type' => 'change_my_passcode',
            // Added 24 Aug 2026 (live report: "Change my passcode" fell through to the generic
            // fallback). Self-service passcode change (AccountSettings.tsx) exists ONLY on the
            // separate Root Admin dashboard route (/root_dashboard/#account_settings) - there is
            // currently no self-service passcode page for a regular Admin/Staff account at all
            // (confirmed: StaffManagement.tsx's passcode field only lives in the Admin-driven
            // "Update User" flow, which changes someone else's account, picked from a dropdown -
            // not a self-service "change my own" form). Root Admin gets routed straight there;
            // everyone else gets told the truth instead of a broken/misleading navigate action.
            'phrases' => [
                'account settings', 'my account', 'my profile',
                ['change', 'passcode'], ['update', 'passcode'], ['reset', 'passcode'], ['my', 'passcode'],
                ['change', 'pin'], ['update', 'pin'], ['my', 'pin'],
                // Broadened 24 Aug 2026 (proactive coverage pass) - passcode/PIN/password are all
                // the same "my own login credential" concept to a real user, phrased differently.
                'change password', 'update password', 'reset password', 'forgot password', 'my login',
                'login settings', ['change', 'login'], ['update', 'login'], ['my', 'password'],
                // AND-group forms too, not just the contiguous literals above - "I forgot MY
                // password" is more natural than the bare literal "forgot password" and wouldn't
                // match a contiguous-only phrase (same reasoning the original passcode/pin
                // AND-groups above were built on).
                ['change', 'password'], ['update', 'password'], ['reset', 'password'], ['forgot', 'password'],
            ],
            'handler' => function (string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array {
                if ($roleFlags['isRootAdmin']) {
                    return ['reply' => "Opening Account Settings...", 'action' => ['type' => 'open_root_dashboard_route', 'route' => '#account_settings']];
                }
                if ($roleFlags['isAdmin']) {
                    // Team & Permissions IS reachable for a plain Admin, and its "Update User"
                    // flow lets them pick their own account from the list - unlike a plain Staff
                    // account, which has no access to that page at all (see the else branch).
                    return [
                        'reply' => "There's no dedicated 'change my own passcode' form - go to Team ➔ Staff & Permissions ➔ Update User, select your own account, and set a new passcode there.",
                        'action' => ['type' => 'navigate', 'tab' => 'staff', 'itemKey' => 'staff_permissions'],
                    ];
                }
                return [
                    'reply' => "There's no self-service passcode change for staff accounts yet - ask an Admin to update it for you from Team ➔ Staff & Permissions.",
                    'action' => null,
                ];
            },
        ],
        [
            'type' => 'configure_ai',
            'phrases' => [
                'configure ai', 'ai setting', 'set api key',
                // Broadened 24 Aug 2026 (proactive coverage pass).
                'ai configuration', 'ai provider', 'gemini setting', 'openai setting', 'chatbot setting',
                'setup ai', 'configure chatbot', ['ai', 'provider'], ['ai', 'key'], ['gemini', 'key'],
                ['openai', 'key'],
            ],
            'handler' => function (string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array {
                if (!$roleFlags['isRootAdmin']) {
                    return ['reply' => "🔒 Access Denied: AI Provider & API Key configurations are restricted to Root Admin users. Your current logged-in role is '$userRole'.", 'action' => null];
                }
                return ['reply' => "Navigating to Root Admin AI Services Configuration...", 'action' => ['type' => 'navigate', 'tab' => 'admin_control', 'itemKey' => 'ai_services']];
            },
        ],

        // --- ADMIN / ROOT-ADMIN ACTIONS ---
        [
            'type' => 'open_telegram_modal',
            'phrases' => [
                'telegram modal', 'telegram setting', 'open telegram', 'telegram alert',
                // Broadened 24 Aug 2026 (proactive coverage pass).
                'telegram bot', 'telegram group', 'telegram channel', 'telegram config',
                'telegram notification', ['telegram', 'group'], ['telegram', 'channel'],
                ['telegram', 'bot'], ['configure', 'telegram'], ['setup', 'telegram'],
            ],
            'handler' => function (string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array {
                if (!$roleFlags['isAdmin']) {
                    return ['reply' => "🔒 Access Denied: Telegram bot configuration is restricted to Admin users. Your current logged-in role is '$userRole'.", 'action' => null];
                }
                return ['reply' => "Opening the Telegram Settings & Channel Config modal...", 'action' => ['type' => 'open_telegram_modal']];
            },
        ],
        [
            'type' => 'edit_property',
            // Broadened 24 Aug 2026 (live report: "add phone number to my property" fell through
            // to the generic fallback) - property-settings fields (phone, GSTIN, address, UPI,
            // WhatsApp template, ...) all live on this ONE Edit Property page, so any "<field> +
            // property/resort" phrasing should land here rather than needing one phrase per field.
            'phrases' => [
                'edit property', 'resort setting', 'property detail',
                ['property', 'phone'], ['property', 'gstin'], ['property', 'address'],
                ['property', 'upi'], ['property', 'whatsapp'], ['property', 'maps'],
                ['add', 'property'], ['update', 'property'], ['change', 'property'],
                // Broadened 24 Aug 2026 (proactive coverage pass) - more property-settings fields,
                // plus 'resort'/'hotel' as synonyms for 'property' since staff naturally use
                // whichever word matches their own property type.
                'property settings', 'resort details', 'hotel settings', 'hotel detail', 'update resort',
                'change resort', ['property', 'name'], ['property', 'logo'], ['property', 'checkin'],
                ['property', 'checkout'], ['property', 'wifi'], ['resort', 'phone'], ['resort', 'address'],
                ['hotel', 'phone'], ['hotel', 'address'],
            ],
            'handler' => function (string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array {
                if (!$roleFlags['isAdmin']) {
                    return ['reply' => "🔒 Access Denied: Editing property details & settings is restricted to Admin users. Your current logged-in role is '$userRole'.", 'action' => null];
                }
                return ['reply' => "Navigating to Edit Property settings...", 'action' => ['type' => 'navigate', 'tab' => 'edit_property', 'itemKey' => 'edit_property']];
            },
        ],
        [
            'type' => 'edit_staff',
            // Added 24 Aug 2026 (live report: "change phone number for staff Kamlesh" fell
            // through to the generic fallback - this intent plus its role/salary/status variants
            // didn't exist at all). Deep-links straight to that person's roster row already in
            // edit mode - see StaffManagement.tsx's initialEditStaffName prop/effect.
            'phrases' => [
                'staff directory', 'staff roster', 'edit staff',
                ['change', 'phone'], ['update', 'phone'], ['edit', 'phone'],
                ['change', 'number'], ['update', 'number'], ['edit', 'number'],
                ['staff', 'phone'], ['staff', 'salary'], ['staff', 'role'], ['staff', 'status'],
                ['update', 'staff'], ['change', 'staff'], ['staff', 'details'],
                // Broadened 24 Aug 2026 (proactive coverage pass) - 'employee' as a synonym for an
                // EXISTING staff record (edit-verbs only, so 'add employee' still correctly routes
                // to add_staff_member below instead of colliding here).
                'staff information', 'staff record', 'staff profile', 'update employee', 'change employee',
                'edit employee', ['employee', 'phone'], ['employee', 'salary'], ['edit', 'role'],
                ['update', 'role'], ['change', 'role'], ['edit', 'salary'], ['update', 'salary'],
                ['edit', 'status'], ['update', 'status'],
            ],
            'handler' => function (string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array {
                if (!$roleFlags['isAdmin']) {
                    return ['reply' => "🔒 Access Denied: Editing staff member details is restricted to Admin users. Your current logged-in role is '$userRole'.", 'action' => null];
                }
                $staffName = extractStaffNameFromQuery($q);
                return [
                    'reply' => "Navigating to the Staff Directory" . ($staffName ? " ➔ '$staffName'" : "") . "...",
                    'action' => ['type' => 'navigate', 'tab' => 'staff', 'itemKey' => 'staff_directory_salaries', 'staffName' => $staffName],
                ];
            },
        ],
        [
            'type' => 'add_staff_member',
            // Added 24 Aug 2026 - NOT a live bug report, found via the proactive action-surface
            // audit (grepping every isXModalOpen across src/components) after the user asked
            // "how do we make the AI know all actions in advance" a second time. Deliberately a
            // DIFFERENT intent from edit_staff above: that one deep-links into an EXISTING
            // roster row by name (isTeamMemberModalOpen's update flow); this one opens the
            // blank "Add New Staff Member" drawer (isModalOpen) for onboarding someone new.
            'phrases' => [
                'add staff member', 'add new staff', 'new staff member', 'add team member', 'new team member',
                'onboard staff', 'hire staff', 'register new staff',
                ['add', 'staff', 'member'], ['new', 'staff', 'member'], ['add', 'new', 'staff'],
                ['add', 'team', 'member'], ['new', 'team', 'member'], ['create', 'staff'], ['onboard', 'staff'],
                ['hire', 'staff'],
                // Broadened 24 Aug 2026 (proactive coverage pass) - 'employee'/'worker' as
                // synonyms, add-verbs only (edit_staff above owns the update/change/edit verbs on
                // the same nouns, so there's no overlap).
                'add new employee', 'new employee', 'add employee', 'hire employee', 'onboard employee',
                'recruit staff', 'add new worker', 'new worker',
                ['add', 'new', 'employee'], ['hire', 'employee'], ['onboard', 'employee'],
                ['recruit', 'staff'], ['add', 'worker'], ['new', 'worker'],
            ],
            'handler' => function (string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array {
                if (!$roleFlags['isAdmin']) {
                    return ['reply' => "🔒 Access Denied: Adding a new staff member is restricted to Admin users. Your current logged-in role is '$userRole'.", 'action' => null];
                }
                [$name, $phone, $role, $salary] = extractAddStaffDetails($q, $lower);
                $bits = [];
                if ($name) $bits[] = "'$name'";
                if ($phone) $bits[] = "phone $phone";
                if ($role) $bits[] = "role $role";
                if ($salary) $bits[] = "₹$salary salary";
                $replyMsg = "Opening 'Add New Staff Member' form" . (!empty($bits) ? " pre-filled with " . implode(', ', $bits) : " for you") . "...";
                return [
                    'reply' => $replyMsg,
                    'action' => ['type' => 'navigate', 'tab' => 'staff', 'itemKey' => 'staff_directory_salaries', 'addStaffName' => $name, 'addStaffPhone' => $phone, 'addStaffRole' => $role, 'addStaffSalary' => $salary],
                ];
            },
        ],
        [
            'type' => 'add_menu_item',
            // Added 24 Aug 2026, same proactive audit as add_staff_member above.
            'phrases' => [
                'add menu item', 'new menu item', 'add food item', 'new food item', 'add new dish', 'create new dish',
                ['add', 'menu', 'item'], ['new', 'menu', 'item'], ['add', 'food', 'item'], ['add', 'new', 'dish'],
                ['create', 'new', 'dish'], ['add', 'dish'], ['new', 'dish'],
                // Broadened 24 Aug 2026 (proactive coverage pass).
                'add new food', 'new food', 'add recipe', 'new recipe', 'create menu item', 'add starter',
                'add main course', 'add beverage', 'add dessert',
                ['add', 'new', 'food'], ['create', 'menu'], ['add', 'recipe'], ['new', 'recipe'],
            ],
            'handler' => function (string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array {
                if (!$roleFlags['isAdmin']) {
                    return ['reply' => "🔒 Access Denied: Adding a new menu item is restricted to Admin users. Your current logged-in role is '$userRole'.", 'action' => null];
                }
                [$name, $price, $category] = extractAddMenuItemDetails($q, $lower);
                $bits = [];
                if ($name) $bits[] = "'$name'";
                if ($price) $bits[] = "₹$price";
                if ($category) $bits[] = "category $category";
                $replyMsg = "Opening 'Add New Menu Item' form" . (!empty($bits) ? " pre-filled with " . implode(', ', $bits) : " for you") . "...";
                return [
                    'reply' => $replyMsg,
                    'action' => ['type' => 'navigate', 'tab' => 'kitchen', 'itemKey' => 'edit_food_menu', 'newMenuItemName' => $name, 'newMenuItemPrice' => $price, 'newMenuItemCategory' => $category],
                ];
            },
        ],
        [
            'type' => 'license_management',
            'phrases' => [
                'license', 'subscription', 'billing setting',
                // Broadened 24 Aug 2026 (proactive coverage pass).
                'my license', 'license expiry', 'license renewal', 'homestay license', 'fssai license',
                'fire safety license', 'gst license', 'expiring license',
                ['license', 'expiry'], ['license', 'renewal'], ['renew', 'license'], ['upload', 'license'],
            ],
            'handler' => function (string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array {
                if (!$roleFlags['isAdmin']) {
                    return ['reply' => "🔒 Access Denied: License & Subscription management is restricted to Admin users. Your current logged-in role is '$userRole'.", 'action' => null];
                }
                return ['reply' => "Navigating to License & Subscription Management...", 'action' => ['type' => 'navigate', 'tab' => 'licenses', 'itemKey' => 'license_management']];
            },
        ],

        // --- STAFF ACTIONS (open to all logged-in roles) ---
        [
            'type' => 'request_material',
            // Added 24 Aug 2026 (live report: "Request 100gm besan" - a kitchen staff member
            // requesting a raw ingredient/stock item, NOT a guest service request - see
            // add_service_request above for that different intent). 'request'/'need'/'order' +
            // a quantity/unit word is the anchor, since a bare item name alone ("besan") is too
            // ambiguous to trigger this on its own.
            'phrases' => [
                'request material', 'request stock', 'raw material',
                // Every verb x unit combo, not a hand-picked subset - a partial list is exactly
                // how "order 2 liters milk" (found via the test suite, 24 Aug 2026) fell through:
                // 'order' only had kg/gm/gram paired with it, not liter/litre/packet/pcs/piece.
                ['request', 'kg'], ['request', 'gm'], ['request', 'gram'], ['request', 'liter'], ['request', 'litre'], ['request', 'packet'], ['request', 'pcs'], ['request', 'piece'],
                ['need', 'kg'], ['need', 'gm'], ['need', 'gram'], ['need', 'liter'], ['need', 'litre'], ['need', 'packet'], ['need', 'pcs'], ['need', 'piece'],
                ['order', 'kg'], ['order', 'gm'], ['order', 'gram'], ['order', 'liter'], ['order', 'litre'], ['order', 'packet'], ['order', 'pcs'], ['order', 'piece'],
                // Broadened 24 Aug 2026 (proactive coverage pass) - stockout phrasing that has no
                // quantity/unit word at all ("we're running low on rice"); extractMaterialRequestDetails()'s
                // stopword list was extended to match so these don't leak filler words into the item text.
                'running low', 'restock', 'out of stock', 'need ingredients', 'need supplies', 'stock shortage',
                ['low', 'on'], ['need', 'more', 'stock'],
            ],
            'handler' => function (string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array {
                [$item, $qty, $unit] = extractMaterialRequestDetails($q);
                $replyMsg = "Opening 'Request Material' form";
                if ($item || $qty) {
                    $replyMsg .= " pre-filled with" . ($qty ? " $qty $unit" : "") . ($item ? " '$item'" : "") . "...";
                } else {
                    $replyMsg .= " for you...";
                }
                return [
                    'reply' => $replyMsg,
                    'action' => ['type' => 'navigate', 'tab' => 'kitchen', 'itemKey' => 'kitchen_requisitions', 'reqItemName' => $item, 'reqQty' => $qty, 'reqUnit' => $unit],
                ];
            },
        ],
        [
            'type' => 'open_add_booking',
            'phrases' => [
                'add booking', 'new booking', 'create booking', 'book room', 'add guest', 'new guest', 'register guest',
                // Broadened 24 Aug 2026 (proactive coverage pass).
                'new reservation', 'add reservation', 'walk in guest', 'walkin guest', 'check in new guest',
                ['add', 'reservation'], ['new', 'reservation'], ['book', 'a', 'room'], ['reserve', 'room'],
            ],
            'handler' => fn(string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array => [
                'reply' => "Opening the 'Add Guest Booking' drawer form for you...",
                'action' => ['type' => 'open_add_booking'],
            ],
        ],
        [
            'type' => 'staff_meals',
            // Broadened 24 Aug 2026 (live report: "add meal for kinkar" and "...select Kinkar"
            // both fell through to the generic fallback) - the original list required the
            // literal word "staff" adjacent to "meal", which real phrasing doesn't reliably
            // include. The AND-groups below catch "<food word> for/to <name>" generically.
            // 'chai'/'tea' added the same day (test-suite case "log a chai for Priya") - specific
            // beverage/food words work the same way as the generic 'meal'/'food' ones.
            'phrases' => [
                'staff meal', 'staff food', 'food for staff', 'meal for staff', 'staff thali', 'staff lunch', 'staff dinner',
                ['meal', 'for'], ['food', 'for'], ['thali', 'for'], ['lunch', 'for'], ['dinner', 'for'], ['chai', 'for'], ['tea', 'for'],
                ['meal', 'to'], ['food', 'to'], ['chai', 'to'], ['tea', 'to'],
                ['add', 'meal'], ['log', 'meal'], ['add', 'chai'], ['log', 'chai'], ['add', 'tea'], ['log', 'tea'],
                // Broadened 24 Aug 2026 (proactive coverage pass) - snack/breakfast/tiffin work
                // the same way as the existing meal/food/chai/tea words.
                'staff snack', 'staff breakfast', 'staff tiffin',
                ['snack', 'for'], ['snack', 'to'], ['add', 'snack'], ['log', 'snack'],
                ['breakfast', 'for'], ['breakfast', 'to'], ['add', 'breakfast'], ['log', 'breakfast'],
                ['tiffin', 'for'], ['add', 'tiffin'], ['log', 'tiffin'],
            ],
            'handler' => function (string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array {
                $staffName = extractStaffNameFromQuery($q);
                return [
                    'reply' => "Navigating to Kitchen ➔ Staff Meals page for " . ($staffName ? "'$staffName'" : "'$q'") . "...",
                    'action' => ['type' => 'navigate', 'tab' => 'kitchen', 'itemKey' => 'staff_meals', 'staffName' => $staffName],
                ];
            },
        ],
        [
            'type' => 'add_service_request',
            // Added 24 Aug 2026 (live report: "send towels to room 102"). 'room' is required in
            // every group as the anchor - a bare 3-4 digit number alone is too ambiguous to
            // assume it's a room reference without something nearby signaling it is. Opens the
            // New Service Request form pre-filled (room + best-guess request type/description) -
            // never auto-creates the request itself, same "user reviews and clicks submit" rule
            // open_add_booking/open_add_expense already follow.
            'phrases' => [
                ['send', 'room'], ['bring', 'room'], ['need', 'room'], ['request', 'room'], ['deliver', 'room'], ['give', 'room'],
                ['towel', 'room'], ['pillow', 'room'], ['blanket', 'room'], ['soap', 'room'], ['water', 'room'], ['toiletries', 'room'],
                // Broadened 24 Aug 2026 (proactive coverage pass) - more common in-room request
                // items, plus maintenance-complaint verbs ("AC not working room 105" is the same
                // "open a pre-filled service request" action as a supply request).
                ['bedsheet', 'room'], ['bucket', 'room'], ['hanger', 'room'], ['iron', 'room'],
                ['charger', 'room'], ['slipper', 'room'], ['tissue', 'room'], ['ac', 'room'],
                ['fan', 'room'], ['light', 'room'], ['wifi', 'room'], ['key', 'room'], ['clean', 'room'],
                ['fix', 'room'], ['repair', 'room'], ['broken', 'room'],
            ],
            'handler' => function (string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array {
                [$roomNumber, $item] = extractServiceRequestDetails($q);
                $replyMsg = "Opening 'New Service Request' form";
                if ($item || $roomNumber) {
                    $replyMsg .= " pre-filled with" . ($item ? " '$item'" : "") . ($roomNumber ? " for Room $roomNumber" : "") . "...";
                } else {
                    $replyMsg .= " for you...";
                }
                return [
                    'reply' => $replyMsg,
                    'action' => ['type' => 'open_add_service_request', 'roomNumber' => $roomNumber, 'item' => $item],
                ];
            },
        ],
        [
            'type' => 'open_add_expense',
            'phrases' => [
                'expense', 'petty cash', 'spent', 'bought',
                ['add', 'bill'], ['add', 'cost'], ['add', 'salary'], ['add', 'advance'],
                ['log', 'rs'], ['log', 'rupee'], ['log', '₹'], ['log', 'cost'], ['log', 'bill'], ['log', 'amount'],
                // Broadened 24 Aug 2026 (proactive coverage pass).
                'record expense', 'new expense', 'petty cash entry', 'add cash expense',
                ['spent', 'on'], ['paid', 'for'], ['bought', 'for'], ['record', 'spent'], ['out', 'of', 'pocket'],
                // Live bug fix (24 Aug 2026): only the past tense 'bought' was covered, so a
                // present-tense purchase request ("Buy 2 air freshers") fell all the way through
                // to the generic fallback reply instead of opening Add Expense. 'order'/'ordered'
                // deliberately excluded - too ambiguous with the kitchen_kds food-order phrases below.
                'buy', 'buying', 'purchase', 'purchased',
            ],
            'handler' => function (string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array {
                [$extractedAmount, $extractedDesc, $targetCategory] = extractExpenseAction($q, $lower);

                $replyMsg = "Opening 'Add Expense' form";
                if ($extractedAmount || $extractedDesc) {
                    $replyMsg .= " pre-filled with " . ($extractedAmount ? "₹$extractedAmount" : "") . ($extractedDesc ? " for '$extractedDesc'" : "") . "...";
                } else {
                    $replyMsg .= " for you...";
                }

                return [
                    'reply' => $replyMsg,
                    'action' => ['type' => 'open_add_expense', 'amount' => $extractedAmount, 'description' => $extractedDesc, 'category' => $targetCategory],
                ];
            },
        ],
        [
            'type' => 'kitchen_kds',
            'phrases' => [
                'kitchen', 'kds', 'food order', 'go to kitchen',
                // Broadened 24 Aug 2026 (proactive coverage pass).
                'live orders', 'live tickets', 'order screen', 'kitchen screen', 'take order', 'new order',
                ['live', 'order'], ['order', 'screen'], ['take', 'order'],
            ],
            'handler' => fn(string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array => [
                'reply' => "Navigating to Kitchen KDS & Food Orders...",
                'action' => ['type' => 'navigate', 'tab' => 'kitchen', 'itemKey' => 'take_food_order'],
            ],
        ],
        [
            'type' => 'all_bookings',
            'phrases' => [
                'all booking', 'guest list', 'show booking', 'go to booking',
                // Broadened 24 Aug 2026 (proactive coverage pass).
                'guest directory', 'bookings list', 'view bookings', 'reservation list',
                ['view', 'booking'], ['see', 'booking'],
            ],
            'handler' => fn(string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array => [
                'reply' => "Navigating to Bookings & Guest Management...",
                'action' => ['type' => 'navigate', 'tab' => 'guests', 'itemKey' => 'all_bookings'],
            ],
        ],

        // --- VISITOR & PRODUCT SALES INTENT ---
        // Named/framed for an anonymous pre-sales visitor, but this table has only ever had one
        // real caller (php/api/ai_assistant.php - see this file's own top comment), which requires
        // a real logged-in session (401s otherwise) - so there is no code path where an actual
        // anonymous visitor ever reaches this. 'what is'/'tell me'/'about'/'how does' were removed
        // 25 Aug 2026 (reported live: "offline ai not able reply to simple questions") - they're
        // near-universal prefixes for genuine operational questions ("what is today's revenue",
        // "tell me about room 5's booking", "how does the C-Form work"), so EVERY logged-in staff
        // member's ordinary phrasing was getting hijacked into this sales pitch instead of a real
        // answer (or the honest generic fallback). Kept only the phrases that are unambiguously
        // about the product/company itself, never a real operational question.
        [
            'type' => 'visitor_product_info',
            'phrases' => [
                'ground code', 'features', 'pricing', 'price', 'cost', 'demo', 'sales', 'license',
                'contact', 'contact us', 'signup', 'sign up', 'trial', 'free trial', 'get started',
            ],
            'handler' => function (string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array {
                if (str_contains($lower, 'price') || str_contains($lower, 'cost') || str_contains($lower, 'license') || str_contains($lower, 'plan')) {
                    return [
                        'reply' => "💳 Ground Code PMS/KDS Pricing & Licenses:\n\n• Flexible property licensing per room / per month.\n• Zero setup fee or hidden charges.\n• Includes Front-Desk PMS, Kitchen KDS, Petty Cash, WhatsApp Vouchers, and Telegram Alerts.\n\nSign in above or contact sales to get a demo license for your property!",
                        'action' => null
                    ];
                }
                if (str_contains($lower, 'kitchen') || str_contains($lower, 'kds') || str_contains($lower, 'food') || str_contains($lower, 'order')) {
                    return [
                        'reply' => "🍳 Ground Code KDS & Kitchen Display Module:\n\n• Live Kitchen Display System (KDS) with active ticket timers.\n• Instant staff KOT orders & walk-in table billing.\n• Master Stock Catalog with automatic raw ingredient stock depletion per dish recipe.\n• Staff Meals & Food tracking integrated with Petty Cash.",
                        'action' => null
                    ];
                }
                if (str_contains($lower, 'whatsapp') || str_contains($lower, 'telegram') || str_contains($lower, 'alert') || str_contains($lower, 'message')) {
                    return [
                        'reply' => "📲 Instant Guest & Staff Notifications:\n\n• WhatsApp Business API: Sends automatic booking confirmation vouchers & checkout receipts to guests.\n• Telegram Bot: Streams instant alerts to staff for new KOT food orders, material requisitions, and petty cash drawer approvals.",
                        'action' => null
                    ];
                }
                return [
                    'reply' => "✨ Welcome to Ground Code PMS & KDS!\n\nGround Code is a Multi-Tenant Hospitality SaaS platform designed for hotels, resorts, and homestays featuring:\n\n1. 🏨 Front-Desk PMS & Room Calendar\n2. 🍳 KDS Kitchen Display & Auto-Stock Depletion\n3. 💸 Petty Cash & Expense Management\n4. 👥 Staff Attendance & Permission Roles\n5. 📲 Automated WhatsApp Vouchers & Telegram Alerts\n\nWhat specific feature would you like to know more about?",
                    'action' => null
                ];
            },
        ],

        // --- LIVE DATA CONTEXT QUERIES (info-only, no action) ---
        [
            'type' => 'info_upcoming',
            'phrases' => ['upcoming', 'future booking', 'future reservation', ['upcoming', 'guest']],
            'handler' => function (string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array {
                if ($ctx['upcomingCount'] === 0) {
                    return ['reply' => "You currently have 0 upcoming bookings. All current bookings are active today or in the past. To create a new upcoming booking, click '+ Add Booking' on the Bookings tab.", 'action' => null];
                }
                return ['reply' => "You currently have {$ctx['upcomingCount']} upcoming booking(s) scheduled.", 'action' => null];
            },
        ],
        [
            'type' => 'info_today',
            'phrases' => [
                'today', 'active booking', 'checked in',
                'in house', 'in-house guest', 'staying today', 'current guest', ['in', 'house'],
            ],
            'handler' => function (string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array {
                $guestStr = !empty($ctx['activeGuests']) ? " (Guests: " . implode(', ', $ctx['activeGuests']) . ")" : "";
                if ($ctx['todayCount'] === 0) {
                    return ['reply' => "You currently have 0 active bookings today.", 'action' => null];
                }
                return ['reply' => "You currently have {$ctx['todayCount']} active booking(s) today$guestStr.", 'action' => null];
            },
        ],
        [
            'type' => 'info_summary',
            'phrases' => [
                'how many', 'summary', 'total booking',
                'occupancy summary', 'booking count', 'statistics', 'dashboard summary',
            ],
            'handler' => function (string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array {
                $guestStr = !empty($ctx['activeGuests']) ? " (Guests: " . implode(', ', $ctx['activeGuests']) . ")" : "";
                return ['reply' => "Current Booking Summary:\n• Today's Active: {$ctx['todayCount']}$guestStr\n• Upcoming: {$ctx['upcomingCount']}\n• Past: {$ctx['pastCount']}", 'action' => null];
            },
        ],

        // --- GENERAL INFORMATION ANSWERS (info-only, no action) ---
        [
            'type' => 'info_receipt',
            'phrases' => [
                'receipt', 'bill', 'checkout', 'check out',
                'invoice', 'gst bill', 'print bill', 'generate receipt', ['print', 'receipt'], ['generate', 'bill'],
            ],
            'handler' => fn(string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array => [
                'reply' => "To generate a receipt or checkout a guest, click 'Checkout' on their booking card in the Bookings or Today tab. Review room charges, advance payments, and food bills, then print the GST receipt or send it directly on WhatsApp.",
                'action' => null,
            ],
        ],
        [
            'type' => 'info_tariff',
            'phrases' => [
                'tariff', 'price', 'rate', 'room rent',
                'room price', 'room charge', 'nightly rate', ['room', 'price'], ['nightly', 'rate'],
            ],
            'handler' => fn(string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array => [
                'reply' => "Default room rates can be configured under Room Management. When adding a new booking, selecting a room auto-fills the room rent field, which can still be edited manually if custom discounts apply.",
                'action' => null,
            ],
        ],
        [
            'type' => 'info_cform',
            'phrases' => [
                'c-form', 'foreign', 'passport',
                'foreigner', 'foreign guest', 'c form status', ['foreign', 'guest'],
            ],
            'handler' => fn(string $q, string $lower, array $ctx, string $userRole, array $roleFlags): array => [
                'reply' => "Foreign guests require a C-Form filing. You can mark C-Form status as 'Pending' or 'Filed' directly from the guest details modal or guest list.",
                'action' => null,
            ],
        ],
    ];
}

function matchBestIntent(string $lower, array $table): ?array {
    $best = null;
    $bestScore = 0;
    foreach ($table as $intent) {
        $score = scoreIntentMatch($lower, $intent['phrases']);
        if ($score > $bestScore) {
            $bestScore = $score;
            $best = $intent;
        }
    }
    return $best;
}

/**
 * @param array $extraIntents Same shape as getIntentTable()'s rows, appended AFTER the
 *        hand-written table (24 Aug 2026 - see php/ai/nav_menu_intents.php, the only real
 *        caller: auto-generated per-page "navigate to X" intents from nav_menu_items). Checked
 *        first is not "checked only if the first fails" here - matchBestIntent() scores every
 *        row regardless of position - but on an exact score TIE the first one encountered wins,
 *        so hand-written intents (which usually have more specific, multi-word phrasing anyway)
 *        naturally take priority over a same-scoring auto-generated page-title match.
 */
function runOfflineIntentEngine(string $q, ?array $context, string $userRole, array $extraIntents = []): array {
    $lower = strtolower($q);
    // Split a digit directly glued to a unit word ("100gm" -> "100 gm") before phrase-matching -
    // found via the test suite, 24 Aug 2026: request_material's ['request','gm'] AND-group never
    // matched "Request 100gm besan" because "gm" has no word boundary while stuck to "100" (a
    // digit is itself a "word" character in \b's sense, so there's no boundary between them).
    // $q itself (used for regex-based extraction, e.g. extractMaterialRequestDetails()) is left
    // untouched - those already handle "100gm" as one glued token correctly on their own.
    $lower = preg_replace('/(\d)([a-z])/', '$1 $2', $lower);

    $ctx = [
        'todayCount' => (int)($context['today_count'] ?? 0),
        'upcomingCount' => (int)($context['upcoming_count'] ?? 0),
        'pastCount' => (int)($context['past_count'] ?? 0),
        'activeGuests' => $context['active_guests'] ?? [],
    ];

    $roleLower = strtolower(trim($userRole));
    $roleFlags = [
        'isRootAdmin' => str_contains($roleLower, 'root'),
        'isAdmin' => str_contains($roleLower, 'admin') || str_contains($roleLower, 'root'),
    ];

    $intent = matchBestIntent($lower, array_merge(getIntentTable(), $extraIntents));
    if ($intent !== null) {
        return ($intent['handler'])($q, $lower, $ctx, $userRole, $roleFlags);
    }

    return [
        'reply' => "Ground Code helps you manage room bookings, live kitchen orders (KDS), room tariffs, petty cash expenses, and guest billing. You currently have {$ctx['todayCount']} active booking(s) today, {$ctx['upcomingCount']} upcoming, and {$ctx['pastCount']} past.",
        'action' => null,
    ];
}
