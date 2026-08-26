<?php
/**
 * AI Assistant REST Endpoint
 * Ground Code Resort & KDS Management System
 * Handles auth/session/rate-limiting/DB context, then hands off to the offline intent engine
 * (php/ai/offline_intent_engine.php - table-driven + scored, see that file's own doc comment)
 * for the actual "what does this message mean" decision, with strict RBAC enforcement &
 * pre-filled task execution. Online AI providers (Gemini/OpenAI) are still supported as an
 * opt-in alternative (see ai_config.php) but the offline engine is what actually runs by default
 * - deliberately kept free of any external API dependency (24 Aug 2026, explicit decision:
 * online usage costs scale with traffic, and this app's action set is small/closed enough that a
 * well-built offline matcher covers it without that ongoing cost).
 */

// SECURITY (24 Aug 2026, found in review): this endpoint is never routed through router.php, so
// it never got router.php's login/property-ownership gates - it had ZERO auth check at all.
// $userRole used to come straight from the client's own request body, so the "STRICT SECURITY
// RULE"/RBAC checks below were trivially bypassed by sending user_role: "Root Admin" in the POST
// body. Session bootstrap must match router.php/ical_sync.php exactly so the same login cookie
// is recognized (see access_control.php's own doc comment for this contract).
// session_set_cookie_params() (restored 27 Aug 2026 alongside this file itself - see AI.md and
// CLAUDE.md's "Session Cookie / Remember Me" section) computed inline, same as
// calendar_session.php - this bootstrap runs before config/database.php is required below, so
// APP_IS_LOCAL_ENV isn't defined yet at this point.
$__session_host = $_SERVER['SERVER_NAME'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost';
$__session_is_local = $__session_host === 'localhost' || $__session_host === '127.0.0.1' || str_contains($__session_host, '192.168.');
ini_set('session.gc_maxlifetime', 86400 * 30);
session_set_cookie_params([
    'lifetime' => 86400 * 30,
    'path' => '/',
    'domain' => '',
    'secure' => !$__session_is_local,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_name('artists_farm_session');
session_start();

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../errors/logger.php';
require_once __DIR__ . '/../security/access_control.php';
require_once __DIR__ . '/../config/property_resolver.php';
require_once __DIR__ . '/../security/rate_limiter.php';
require_once __DIR__ . '/../ai/offline_intent_engine.php';
require_once __DIR__ . '/../ai/nav_menu_intents.php';

header('Content-Type: application/json');

if (empty($_SESSION['username'])) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Authentication required.']);
    exit();
}

$currentPropertyId = getCurrentPropertyId($pdo);
if (!isPropertyAccessAllowed($pdo, $currentPropertyId)) {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Access denied for this property.']);
    exit();
}

// SECURITY (24 Aug 2026): read the authenticated session's role only - NOT $input['user_role'].
// The comment here used to describe that intent while the code right below it still had the
// client-input fallback left in, unnoticed - found while touching this file again. $_SESSION['username']
// is already required above (401 otherwise), so a real session's role is always present here;
// 'Visitor' only ever applies as a defensive default, never a value an attacker can supply.
$userRole = $_SESSION['role'] ?? 'Visitor';
$currentProperty = getCurrentProperty($pdo, $currentPropertyId);
$propertyName = $currentProperty['name'] ?? 'Resort';

// Rate limit per logged-in user (not per-IP: a shared office/property network shouldn't
// throttle every staff member together).
$rateLimiter = new RateLimiter($pdo);
$rateLimiter->setMaxAttempts(30)->setWindowSeconds(300);
$rateLimiter->checkAndBlock($_SESSION['username'], 'ai_assistant'); // exits with 429 if exceeded

$rawInput = file_get_contents('php://input');
$jsonInput = !empty($rawInput) ? json_decode($rawInput, true) : null;
$input = is_array($jsonInput) ? $jsonInput : $_POST;

$prompt = trim($input['prompt'] ?? '');
$liveContext = $input['live_context'] ?? null;

if (empty($prompt)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Prompt cannot be empty.']);
    exit();
}

// Load AI Configuration
// api_keys (25 Aug 2026 - see ai_config.php's matching comment for the full bug this fixes): one
// key slot per provider, not a single shared field - a single field meant switching the provider
// dropdown silently reused whatever key was saved for a DIFFERENT provider last, with no warning,
// which is exactly what was happening live (OpenCode Zen being called with an OpenAI-shaped key).
$configFilePath = __DIR__ . '/../config/ai_config.json';
$aiConfig = [
    'enabled' => false,
    'provider' => 'gemini',
    'api_keys' => ['gemini' => '', 'openai' => '', 'opencode_zen' => '', 'claude' => '', 'custom_ollama' => ''],
    'custom_endpoint' => 'http://localhost:11434/v1',
];

if (file_exists($configFilePath)) {
    $parsedConfig = json_decode(file_get_contents($configFilePath), true);
    if (is_array($parsedConfig)) {
        $aiConfig = array_merge($aiConfig, $parsedConfig);
    }
}

// Log query into Telescope Logger (portal: ai_chat)
if (class_exists('TelescopeLogger')) {
    TelescopeLogger::log('ai_chat', 'AI Query', $prompt, "Role: $userRole | Mode: " . ($aiConfig['enabled'] ? 'ONLINE (' . $aiConfig['provider'] . ')' : 'OFFLINE'), [
        'property' => $propertyName,
        'user_role' => $userRole,
        'ai_enabled' => $aiConfig['enabled'],
        'provider' => $aiConfig['provider'],
    ]);
}

$contextSummary = "";
if (is_array($liveContext)) {
    $todayCount = (int)($liveContext['today_count'] ?? 0);
    $upcomingCount = (int)($liveContext['upcoming_count'] ?? 0);
    $pastCount = (int)($liveContext['past_count'] ?? 0);
    $activeGuests = $liveContext['active_guests'] ?? [];

    $activeStr = !empty($activeGuests) ? implode(', ', $activeGuests) : 'None';
    $contextSummary = "Current Property Live Status ($propertyName):\n- Active/Today Bookings: $todayCount (Guests: $activeStr)\n- Upcoming Bookings: $upcomingCount\n- Past Bookings: $pastCount\n- Logged-In User Role: $userRole\n";
}

// SECURITY (24 Aug 2026): the ONLY real access-control backstop for actions an ONLINE AI
// provider's raw text reply asks to execute (only reachable if Online AI is explicitly enabled
// in ai_config.php - offline is the default and does its own RBAC check per-intent below
// instead). The system prompt's "STRICT SECURITY RULE" is advisory to the model only - a crafted
// user message could get a compliant model to emit a privileged action regardless of that prose
// instruction (prompt injection). This function re-validates any extracted action in PHP before
// it's ever echoed back to the client.
function isActionPermittedForRole(?array $action, string $userRole): bool {
    if (!$action || empty($action['type'])) {
        return true; // no action requested - nothing to gate
    }
    $roleLower = strtolower(trim($userRole));
    $isRootAdmin = str_contains($roleLower, 'root');
    $isAdmin = str_contains($roleLower, 'admin') || $isRootAdmin;

    $type = $action['type'];
    if ($type === 'open_telescope') return $isRootAdmin;
    if ($type === 'open_root_dashboard_route') return $isRootAdmin;
    if ($type === 'open_telegram_modal') return $isAdmin;
    if ($type === 'navigate') {
        $tab = $action['tab'] ?? '';
        $itemKey = $action['itemKey'] ?? '';
        if (in_array($tab, ['edit_property', 'licenses', 'admin_control'], true) || in_array($itemKey, ['ai_services', 'staff_directory_salaries', 'staff_permissions'], true)) {
            return $isAdmin;
        }
        return true; // ordinary staff navigation (kitchen, guests, staff_meals, ...)
    }
    return true; // open_add_booking / open_add_expense - open to all logged-in staff roles
}

/**
 * Logs the OUTCOME of a query (24 Aug 2026) - separate from the "AI Query" log above, which
 * fires before any provider/engine has run and only ever captures the incoming prompt. This one
 * captures what actually happened: which action type matched (or 'NONE' if the message fell
 * through to a plain-text/fallback reply), and whether it came from the offline engine or an
 * online provider. Without this, Telescope only ever shows "what was asked", never "what the AI
 * did about it" - which is the missing half needed to review a batch of real traffic afterward
 * (e.g. running Gemini for a trial period, then mining its real query->action outcomes to convert
 * into permanent offline phrase/extractor coverage, instead of only guessing at phrasing).
 */
/**
 * TEMPORARY, time-boxed feature (24 Aug 2026) - built for a ~1-week trial of Gemini online mode
 * to see what real staff phrasing looks like (see logAiOutcome() above), not meant as permanent
 * infrastructure. Safe to delete this function, recordGeminiUsage()'s call sites, the
 * 'usage_summary' response field, and AIChatWidget.tsx's matching display block once the trial's
 * done and online mode is switched back off.
 *
 * Deliberately does NOT hardcode a "you have used X of Y" limit - Google's actual free-tier
 * request/token quotas for this model change over time (confirmed materially cut Dec 2025) and
 * aren't queryable from this same API, so any hardcoded number here would just go stale and lie
 * to whoever's reading it. Instead this logs real observed counts (so the trend is visible) AND
 * actual 429 rate-limit-exceeded responses (ground truth for "did we actually hit it today",
 * rather than guessing from a number that might already be wrong) - Root Admin can line the
 * observed numbers up against Google AI Studio's own live quota dashboard for the authoritative
 * current limit.
 */
function recordGeminiUsage(int $tokens, bool $rateLimited): void {
    $path = __DIR__ . '/../config/ai_usage_log.json';
    $fp = @fopen($path, 'c+');
    if (!$fp) return;
    if (!flock($fp, LOCK_EX)) { fclose($fp); return; }

    $raw = stream_get_contents($fp);
    $log = json_decode((string)$raw, true);
    if (!is_array($log)) $log = [];

    $today = date('Y-m-d');
    if (!isset($log[$today]) || !is_array($log[$today])) {
        $log[$today] = ['requests' => 0, 'tokens' => 0, 'rate_limited' => 0];
    }
    $log[$today]['requests']++;
    $log[$today]['tokens'] += $tokens;
    if ($rateLimited) $log[$today]['rate_limited']++;

    // Keep only the trailing 14 days - this is a trial-period log, not a permanent record.
    $cutoff = date('Y-m-d', strtotime('-14 days'));
    foreach (array_keys($log) as $day) {
        if ($day < $cutoff) unset($log[$day]);
    }

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($log, JSON_PRETTY_PRINT));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

/** @return array{today: array, last_7_days: array}|null null if the log doesn't exist yet (no online calls made yet this trial) */
function getGeminiUsageSummary(): ?array {
    $path = __DIR__ . '/../config/ai_usage_log.json';
    if (!file_exists($path)) return null;
    $log = json_decode((string)file_get_contents($path), true);
    if (!is_array($log) || empty($log)) return null;

    $today = date('Y-m-d');
    $todayStats = $log[$today] ?? ['requests' => 0, 'tokens' => 0, 'rate_limited' => 0];

    $weekCutoff = date('Y-m-d', strtotime('-6 days'));
    $weekRequests = 0; $weekTokens = 0; $weekRateLimited = 0;
    foreach ($log as $day => $stats) {
        if ($day >= $weekCutoff && is_array($stats)) {
            $weekRequests += (int)($stats['requests'] ?? 0);
            $weekTokens += (int)($stats['tokens'] ?? 0);
            $weekRateLimited += (int)($stats['rate_limited'] ?? 0);
        }
    }

    return [
        'today' => ['requests' => (int)$todayStats['requests'], 'tokens' => (int)$todayStats['tokens'], 'rate_limited' => (int)$todayStats['rate_limited']],
        'last_7_days' => ['requests' => $weekRequests, 'tokens' => $weekTokens, 'rate_limited' => $weekRateLimited],
    ];
}

// $replyText (added 25 Aug 2026): the whole point of this log during a Gemini trial week is to
// mine real query->outcome pairs for new offline intents (see this function's own doc comment
// above) - without the actual generated reply text, Telescope only ever showed "what was asked",
// never "what Gemini actually said back", which is the half that matters most for writing a
// matching offline reply. All 3 call sites already have $replyText in scope at the point they
// call this - it just wasn't being passed through.
function logAiOutcome(string $prompt, string $userRole, string $mode, string $provider, ?array $action, string $replyText = ''): void {
    if (!class_exists('TelescopeLogger')) return;
    $actionType = $action['type'] ?? 'NONE';
    TelescopeLogger::log('ai_chat', 'AI Outcome', $prompt, "Role: $userRole | Mode: $mode ($provider) | Action: $actionType", [
        'action_type' => $actionType,
        'action' => $action,
        'mode' => $mode,
        'provider' => $provider,
        'reply' => mb_substr($replyText, 0, 2000),
    ]);
}

/**
 * Sanitizes the client-supplied conversation_history into a safe, bounded array of
 * ['sender' => 'user'|'ai', 'text' => string] turns (added 25 Aug 2026, real bug found live: a
 * follow-up reply like "Yes, staff name Kamlesh" was answered completely blind because the
 * backend never saw the AI's own prior question - see AI.md/this session's fix notes). Never
 * trust the shape/size of client JSON directly:
 * - caps to the last 8 turns even if the client sends more (matches the frontend's own cap, but
 *   this is the real enforcement point - a client is never trusted to have applied its own limit)
 * - drops any entry missing a non-empty string 'text' or an unrecognized 'sender'
 * - truncates each turn's text to 1000 chars so one huge pasted message can't blow up the
 *   provider request/cost
 */
function sanitizeConversationHistory($rawHistory): array {
    if (!is_array($rawHistory)) return [];
    $clean = [];
    foreach ($rawHistory as $turn) {
        if (!is_array($turn)) continue;
        $sender = $turn['sender'] ?? '';
        $text = trim((string)($turn['text'] ?? ''));
        if ($sender !== 'user' && $sender !== 'ai') continue;
        if ($text === '') continue;
        $clean[] = ['sender' => $sender, 'text' => mb_substr($text, 0, 1000)];
    }
    return array_slice($clean, -8);
}

$conversationHistory = sanitizeConversationHistory($input['conversation_history'] ?? []);

// IF ONLINE AI API IS ENABLED (opt-in, off by default - see ai_config.php): Try Provider API
if ($aiConfig['enabled'] === true) {
    $provider = $aiConfig['provider'];
    // Per-provider key lookup (25 Aug 2026 fix). Falls back to the legacy flat 'api_key' field for
    // the transition window before this environment's next real save via ai_config.php's POST
    // handler (the only thing that actually rewrites the on-disk file into the new api_keys shape
    // - a GET there only migrates it in memory for that one response, never persists it) - without
    // this fallback, an environment that hasn't re-saved since this fix deployed would go dark
    // instead of keeping whatever was already working.
    $providerKey = $aiConfig['api_keys'][$provider] ?? '';
    if (empty($providerKey) && !empty($aiConfig['api_key'])) {
        $providerKey = $aiConfig['api_key'];
    }
    $apiKey = !empty($providerKey) ? $providerKey : getenv('GEMINI_API_KEY');

    // ACTION_REFERENCE kept in sync by hand with offline_intent_engine.php's hand-written intent
    // table (24 Aug 2026) - without this, an online provider only ever knew about
    // open_add_booking (the one example baked into the old prompt), so it could never demonstrate
    // any of the newer parameterized actions (staff meals, service requests, material requests,
    // staff/menu adding, edit flows) even when asked directly. Shared by BOTH provider branches
    // below (Gemini and OpenAI), not duplicated, so there's one place to update.
    //
    // REVERSED 27 Aug 2026 (this comment previously said the opposite - kept here so the mistake
    // isn't repeated): this used to deliberately NOT enumerate the auto-generated nav_menu_items
    // pages, reasoning "the offline engine already covers plain go-to-X navigation, nothing to
    // gain teaching an online provider that subset too." That reasoning only accounted for
    // NAVIGATION. Live bug, twice in one sitting: asked "process of adding recipes" then "how to
    // mark attendance", Gemini confidently answered "that feature doesn't exist" for BOTH -
    // Recipe Builder (beta_recipe_builder) and Attendance Calendar (attendance_calendar) are both
    // real, live nav_menu_items pages, just never in this hand-curated list. The online provider
    // isn't only asked "take me there" - it's asked "does X exist", and the FACTUAL ACCURACY RULE
    // below actively instructs it to deny/hedge on anything not in this prompt. An incomplete
    // list there doesn't cost nothing, it manufactures false negatives. Fixed by appending the
    // real, always-current nav_menu_items list below, same source buildNavMenuIntents() already
    // uses for the offline engine - so this can't drift out of sync with the real app again.
    $knownPagesList = "";
    try {
        $navStmt = $pdo->query("SELECT unique_key, title, tab_key, roles_json FROM nav_menu_items WHERE is_visible = 1");
        $navRows = $navStmt->fetchAll();
        $pageLines = [];
        foreach ($navRows as $navRow) {
            $navTitle = trim((string)($navRow['title'] ?? ''));
            $navTabKey = trim((string)($navRow['tab_key'] ?? ''));
            $navUniqueKey = trim((string)($navRow['unique_key'] ?? ''));
            if ($navTitle === '' || $navTabKey === '' || $navUniqueKey === '') continue; // header/group rows
            $navRoles = json_decode((string)($navRow['roles_json'] ?? ''), true);
            if (!isNavItemVisibleForRole(is_array($navRoles) ? $navRoles : [], $userRole)) continue;
            $pageLines[] = "$navTitle (tab=$navTabKey, itemKey=$navUniqueKey)";
        }
        if (!empty($pageLines)) {
            $knownPagesList = "\n\nKNOWN REAL PAGES/FEATURES IN THIS APP (this list is authoritative and complete for this user's role - if asked whether something exists, check here first; these can be reached via the navigate action above using the tab/itemKey shown):\n" . implode(', ', $pageLines);
        }
    } catch (Exception $eNavList) {
        // nav_menu_items unreachable - degrade to the hand-written ACTIONS list only, same as
        // buildNavMenuIntents()'s own fallback for the offline engine.
    }
    $actionReference = "AVAILABLE ACTIONS - emit AT MOST ONE as a JSON block at the very end of your reply, exact shape shown, only when the user's message clearly asks for one of these (never invent a different type or field):\n"
            . "- Open blank Add Booking form: {\"action\":{\"type\":\"open_add_booking\"}}\n"
            . "- Open Add Expense form pre-filled: {\"action\":{\"type\":\"open_add_expense\",\"amount\":500,\"description\":\"vegetables\",\"category\":\"Kitchen\"}} (category one of: Bills, Staff Advance, Kitchen, Staff Meals, Other)\n"
            . "- Open New Service Request form pre-filled (guest room supply/maintenance request): {\"action\":{\"type\":\"open_add_service_request\",\"roomNumber\":\"102\",\"item\":\"towels\"}}\n"
            . "- Open Telegram settings (Admin/Root Admin only): {\"action\":{\"type\":\"open_telegram_modal\"}}\n"
            . "- Open Telescope error monitor (Root Admin only): {\"action\":{\"type\":\"open_telescope\"}}\n"
            . "- Navigate to a page, optionally pre-filling a form on it: {\"action\":{\"type\":\"navigate\",\"tab\":\"...\",\"itemKey\":\"...\"}} plus these extra fields when relevant:\n"
            . "  - Kitchen raw-material requisition: tab=kitchen, itemKey=kitchen_requisitions, reqItemName, reqQty, reqUnit (kg/liters/pcs/packets)\n"
            . "  - Log a staff meal: tab=kitchen, itemKey=staff_meals, staffName\n"
            . "  - Edit an EXISTING staff member (Admin only): tab=staff, itemKey=staff_directory_salaries, staffName\n"
            . "  - Add a NEW staff member (Admin only): tab=staff, itemKey=staff_directory_salaries, addStaffName, addStaffPhone, addStaffRole, addStaffSalary\n"
            . "  - Add a new menu item (Admin only): tab=kitchen, itemKey=edit_food_menu, newMenuItemName, newMenuItemPrice, newMenuItemCategory\n"
            . "  - Recipe Builder (Admin only) - a REAL, separate feature from the menu item form above: set per-dish ingredients, yield factor, and servings so raw stock auto-depletes whenever that dish sells: tab=kitchen, itemKey=beta_recipe_builder\n"
            . "  - Kitchen KDS / live orders: tab=kitchen, itemKey=take_food_order\n"
            . "  - All bookings: tab=guests, itemKey=all_bookings\n"
            . "  - Edit property settings (Admin only): tab=edit_property, itemKey=edit_property\n"
            . "  - License management (Admin only): tab=licenses, itemKey=license_management\n"
            . "  - AI provider settings (Root Admin only): tab=admin_control, itemKey=ai_services\n"
            . "Every one of these actions only OPENS a form pre-filled or navigates - it never submits/saves/creates anything by itself. The user always reviews and clicks the real Save/Submit button themselves.\n"
            . "If nothing above matches, just answer in plain text with NO action JSON."
            . $knownPagesList;

    // FACTUAL ACCURACY RULE (added 25 Aug 2026, real bug found live): without this, an online
    // model answers from generic "what a hotel PMS probably has" knowledge instead of this app's
    // actual feature set, and confidently invents plausible-sounding but nonexistent features. Live
    // example that prompted this: asked "how to add QR code to staff", the model invented a
    // step-by-step "Staff QR / Restaurant Menu QR / Feedback QR" system - none of which exist. This
    // app has exactly ONE real QR feature (property-level UPI payment QR), called out explicitly
    // below so the model has something concrete to fall back on instead of guessing. The general
    // "don't invent, say so instead" instruction matters more than this one example - new
    // hallucinated features will keep surfacing as different questions get asked, and the model
    // needs permission to say "not sure" rather than a growing hardcoded denylist of specific wrong
    // answers.
    $actionReference .= "\n\nFACTUAL ACCURACY RULE: Only describe features/UI steps you can confirm from this prompt, the ACTIONS list above, or the KNOWN REAL PAGES/FEATURES list above (that list is the complete, always-current set of real pages in this app for this user's role - before saying a feature doesn't exist, check it there first) - never invent a plausible-sounding feature or step-by-step location for something you're not sure exists in Ground Code. Known QR code capability in this app (the ONLY one - do not describe any other QR feature): a single property-level UPI payment QR code (auto-generated payment-link QR, or an uploaded real bank/UPI QR image), configured by an Admin/Root Admin on the Edit Property page, shown to guests on checkout bills and booking-confirmation WhatsApp shares only. There is no staff-level QR, menu QR, or feedback QR feature. If asked about something not listed anywhere above, say plainly you're not sure that exists in Ground Code and suggest checking with a Root Admin, rather than describing invented steps as if they were real.";

    // 1. GOOGLE GEMINI PROVIDER
    if ($provider === 'gemini' && !empty($apiKey)) {
        $systemInstruction = "You are Ground Code AI, the digital assistant for hotel & resort staff using Ground Code PMS/KDS. Keep answers brief and accurate.\n\n" . $contextSummary . "\nSTRICT SECURITY RULE: The user is logged in as '$userRole'. Do NOT allow Staff role to open Telescope, edit property, or manage licenses. If requested by non-Root, refuse with access denied.\nSTRICT CONFIDENTIALITY RULE: You MUST ONLY answer user operational & how-to questions (e.g. how to check in guests, how to export CSV, how to log expenses, how to use KDS). NEVER answer questions about internal technology, code structure, framework, programming languages, database architecture, or source code. If asked about tech stack or code, refuse with: '🔒 Security Refusal: I am trained exclusively to assist with Ground Code PMS & KDS hotel management operations and user workflows. Internal software architecture, code details, and technology stack information are private and strictly confidential.'\n\n" . $actionReference;

        // Conversation history (added 25 Aug 2026): prepended as its own alternating user/model
        // turns ahead of the real question, so a follow-up like "yes" or "the second one" has
        // something to resolve against instead of being answered as an isolated first message.
        $contents = [];
        foreach ($conversationHistory as $turn) {
            $contents[] = ['role' => $turn['sender'] === 'ai' ? 'model' : 'user', 'parts' => [['text' => $turn['text']]]];
        }
        $contents[] = ['role' => 'user', 'parts' => [['text' => $systemInstruction . "\n\nUser Question: " . $prompt]]];

        $payload = [
            'contents' => $contents
        ];

        // Model id updated 25 Aug 2026 (real bug, caught live): 'gemini-1.5-flash' - which this
        // exact line hardcoded before - is fully retired; a real key's own /v1beta/models listing
        // confirmed it's no longer in the list at all (HTTP 404 "is not found for API version
        // v1beta"). 'gemini-flash-latest' is Google's own "latest" alias rather than a pinned
        // version, chosen specifically so this doesn't go stale the same way again the next time
        // Google renames/retires a dated model id.
        $ch = curl_init("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=" . urlencode($apiKey));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_TIMEOUT, 8);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        // curl_errno/curl_error (added 27 Aug 2026, found live): HTTP 0 with an empty response
        // means curl never got a reply at all (DNS/TLS/timeout/connection-level failure) - the
        // 'response_snippet' below is always empty in that case, which made a real live "HTTP 0"
        // failure undiagnosable from Telescope alone and needed a manual SSH re-test to explain.
        // Must be read BEFORE curl_close() - both return empty/0 once the handle is closed.
        $curlErrno = curl_errno($ch);
        $curlError = curl_error($ch);
        curl_close($ch);

        // 429 = rate limit exceeded - the one ground-truth signal for "we actually hit the quota
        // today" (see recordGeminiUsage()'s doc comment on why this app doesn't guess a limit
        // number). Recorded even though this falls through to the offline engine below just like
        // any other Gemini failure - the trial period still needs to know it happened.
        if ($httpCode === 429) {
            recordGeminiUsage(0, true);
        } elseif ($httpCode !== 200 && class_exists('TelescopeLogger')) {
            // Any OTHER failure (bad/deprecated model id, invalid key, network error, ...) used to
            // silently fall through to the offline engine below with zero record anywhere - during
            // a trial period that's meant to be exercising the online path, that would look
            // identical to "everything's fine" while actually never calling Gemini at all. Logged
            // here so a wrong/stale model id (this app hardcodes 'gemini-flash-latest' - it's an
            // alias, but Google can still retire/rename what it points to; re-check via a real
            // key's own /v1beta/models listing if this starts 404ing again) shows up instead of
            // silently downgrading every single message for a week with nothing to show for it.
            // A 503 specifically means Google's own "model temporarily overloaded, retry later" -
            // confirmed live 27 Aug 2026, not a key/config problem on this app's side at all.
            TelescopeLogger::log('ai_chat', 'Gemini Call Failed', "HTTP $httpCode", "Prompt: $prompt", [
                'http_code' => $httpCode,
                'curl_errno' => $curlErrno,
                'curl_error' => $curlError,
                'response_snippet' => substr((string)$response, 0, 500),
            ]);
        }

        if ($httpCode === 200 && $response) {
            $resData = json_decode($response, true);
            $replyText = $resData['candidates'][0]['content']['parts'][0]['text'] ?? null;
            if (!empty($replyText)) {
                $extractedAction = null;
                if (preg_match('/\{"action":\s*\{[^}]+\}\}/i', $replyText, $matches)) {
                    $parsed = json_decode($matches[0], true);
                    if (isset($parsed['action'])) {
                        $extractedAction = $parsed['action'];
                    }
                    $replyText = str_replace($matches[0], '', $replyText);
                }

                if ($extractedAction && !isActionPermittedForRole($extractedAction, $userRole)) {
                    $replyText = trim($replyText) . "\n\n🔒 Access Denied: that action isn't available for your role ('$userRole').";
                    $extractedAction = null;
                }

                recordGeminiUsage((int)($resData['usageMetadata']['totalTokenCount'] ?? 0), false);
                logAiOutcome($prompt, $userRole, 'online', 'gemini', $extractedAction, $replyText);
                echo json_encode([
                    'status' => 'success',
                    'reply' => trim($replyText),
                    'action' => $extractedAction,
                    'mode' => 'online',
                    'provider' => 'gemini',
                    // A real LLM call, not a phrase miss - always treated as "answered" for the
                    // human-escalation banner (see AIChatWidget.tsx's consecutiveUnmatched).
                    'matched' => true,
                    'usage_summary' => str_contains(strtolower(trim($userRole)), 'root') ? getGeminiUsageSummary() : null,
                ]);
                exit();
            }
        }
    }

    // 2. OPENAI PROVIDER (gpt-4o-mini)
    if ($provider === 'openai' && !empty($apiKey)) {
        // Parity fix (24 Aug 2026) - this branch never extracted/returned an 'action' field at
        // all before, so OpenAI mode could only ever answer in plain text and could never open a
        // pre-filled form/navigate, unlike the Gemini branch above. Reuses the same
        // $actionReference built above so both online providers are taught the identical action
        // vocabulary from one place, not two independently-maintained copies.
        $messages = [
            ['role' => 'system', 'content' => "You are Ground Code AI, the digital assistant for hotel & resort staff using Ground Code PMS/KDS. Keep answers brief and accurate.\n\n" . $contextSummary . "\nSTRICT SECURITY RULE: The user is logged in as '$userRole'. Do NOT allow Staff role to open Telescope, edit property, or manage licenses. If requested by non-Root, refuse with access denied.\nSTRICT CONFIDENTIALITY RULE: You MUST ONLY answer user operational & how-to questions. NEVER answer questions about internal technology, code structure, framework, or source code.\n\n" . $actionReference],
        ];
        // Conversation history (added 25 Aug 2026) - see the Gemini branch's matching comment above.
        foreach ($conversationHistory as $turn) {
            $messages[] = ['role' => $turn['sender'] === 'ai' ? 'assistant' : 'user', 'content' => $turn['text']];
        }
        $messages[] = ['role' => 'user', 'content' => $prompt];

        $ch = curl_init("https://api.openai.com/v1/chat/completions");
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['model' => 'gpt-4o-mini', 'messages' => $messages]));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'Authorization: Bearer ' . $apiKey]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 8);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErrno = curl_errno($ch);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($httpCode === 200 && $response) {
            $resData = json_decode($response, true);
            $replyText = $resData['choices'][0]['message']['content'] ?? null;
            if (!empty($replyText)) {
                $extractedAction = null;
                if (preg_match('/\{"action":\s*\{[^}]+\}\}/i', $replyText, $matches)) {
                    $parsed = json_decode($matches[0], true);
                    if (isset($parsed['action'])) {
                        $extractedAction = $parsed['action'];
                    }
                    $replyText = str_replace($matches[0], '', $replyText);
                }

                if ($extractedAction && !isActionPermittedForRole($extractedAction, $userRole)) {
                    $replyText = trim($replyText) . "\n\n🔒 Access Denied: that action isn't available for your role ('$userRole').";
                    $extractedAction = null;
                }

                logAiOutcome($prompt, $userRole, 'online', 'openai', $extractedAction, $replyText);
                echo json_encode([
                    'status' => 'success',
                    'reply' => trim($replyText),
                    'action' => $extractedAction,
                    'mode' => 'online',
                    'provider' => 'openai',
                    'matched' => true,
                    // Gemini-only usage log (this app's trial provider) - still surfaced here since
                    // Root Admin should see it regardless of which provider handled THIS message.
                    'usage_summary' => str_contains(strtolower(trim($userRole)), 'root') ? getGeminiUsageSummary() : null,
                ]);
                exit();
            }
        } elseif (class_exists('TelescopeLogger')) {
            // PARITY FIX (25 Aug 2026, found live): unlike the Gemini and OpenCode Zen branches,
            // this one never logged a failure at all - a bad key, no billing/quota, or a network
            // error all silently fell through to the offline engine with zero record anywhere.
            // Confirmed live: a real saved OpenAI key returned HTTP 429 insufficient_quota (no
            // payment method on that OpenAI account) and was completely invisible in Telescope
            // until the key was tested directly against OpenAI's API by hand.
            TelescopeLogger::log('ai_chat', 'OpenAI Call Failed', "HTTP $httpCode", "Prompt: $prompt", [
                'http_code' => $httpCode,
                'curl_errno' => $curlErrno,
                'curl_error' => $curlError,
                'response_snippet' => substr((string)$response, 0, 500),
            ]);
        }
    }

    // 3. OPENCODE ZEN PROVIDER (added 25 Aug 2026 - the actual provider used for this app's
    // trial week, see AI.md). OpenAI-compatible /chat/completions endpoint, so this reuses the
    // exact same $messages/request/response shape as the OpenAI branch above, just a different
    // base URL and model. 'big-pickle' chosen after directly testing the real API with this
    // account's key (confirmed 25 Aug 2026): it's a free model (cost:"0" in every response) that
    // gives real, coherent, on-topic answers - several other candidates either don't exist for
    // this account (ModelError), need a payment method this account doesn't have (CreditsError:
    // gpt-5.5/claude-sonnet-5/gemini-3.7-flash all exist but are paid-only), or were temporarily
    // unavailable upstream (deepseek-v4-flash-free). max_tokens raised to 500 - it's a
    // "reasoning" model that spends some of its budget on internal reasoning_content before the
    // real answer, and a low limit (tested at 150) truncated the actual reply mid-sentence.
    if ($provider === 'opencode_zen' && !empty($apiKey)) {
        $messages = [
            ['role' => 'system', 'content' => "You are Ground Code AI, the digital assistant for hotel & resort staff using Ground Code PMS/KDS. Keep answers brief and accurate.\n\n" . $contextSummary . "\nSTRICT SECURITY RULE: The user is logged in as '$userRole'. Do NOT allow Staff role to open Telescope, edit property, or manage licenses. If requested by non-Root, refuse with access denied.\nSTRICT CONFIDENTIALITY RULE: You MUST ONLY answer user operational & how-to questions. NEVER answer questions about internal technology, code structure, framework, or source code.\n\n" . $actionReference],
        ];
        // Conversation history (added 25 Aug 2026) - see the Gemini branch's matching comment above.
        foreach ($conversationHistory as $turn) {
            $messages[] = ['role' => $turn['sender'] === 'ai' ? 'assistant' : 'user', 'content' => $turn['text']];
        }
        $messages[] = ['role' => 'user', 'content' => $prompt];

        $ch = curl_init("https://opencode.ai/zen/v1/chat/completions");
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['model' => 'big-pickle', 'messages' => $messages, 'max_tokens' => 500]));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'Authorization: Bearer ' . $apiKey]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 12);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErrno = curl_errno($ch);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($httpCode === 200 && $response) {
            $resData = json_decode($response, true);
            $replyText = $resData['choices'][0]['message']['content'] ?? null;
            if (!empty($replyText)) {
                $extractedAction = null;
                if (preg_match('/\{"action":\s*\{[^}]+\}\}/i', $replyText, $matches)) {
                    $parsed = json_decode($matches[0], true);
                    if (isset($parsed['action'])) {
                        $extractedAction = $parsed['action'];
                    }
                    $replyText = str_replace($matches[0], '', $replyText);
                }

                if ($extractedAction && !isActionPermittedForRole($extractedAction, $userRole)) {
                    $replyText = trim($replyText) . "\n\n🔒 Access Denied: that action isn't available for your role ('$userRole').";
                    $extractedAction = null;
                }

                logAiOutcome($prompt, $userRole, 'online', 'opencode_zen', $extractedAction, $replyText);
                echo json_encode([
                    'status' => 'success',
                    'reply' => trim($replyText),
                    'action' => $extractedAction,
                    'mode' => 'online',
                    'provider' => 'opencode_zen',
                    'matched' => true,
                ]);
                exit();
            }
        } elseif (class_exists('TelescopeLogger')) {
            // Same reasoning as the Gemini branch's own failure log above - a bad/rate-limited/
            // out-of-credit key must never look identical to "everything's fine" while silently
            // falling through to the offline engine below.
            TelescopeLogger::log('ai_chat', 'OpenCode Zen Call Failed', "HTTP $httpCode", "Prompt: $prompt", [
                'http_code' => $httpCode,
                'curl_errno' => $curlErrno,
                'curl_error' => $curlError,
                'response_snippet' => substr((string)$response, 0, 500),
            ]);
        }
    }
}

// Auto-generated "navigate to X" fallback intents for every page in nav_menu_items - see that
// file's doc comment. Merged in AFTER the hand-written table so a hand-written intent still wins
// any scoring tie.
$result = runOfflineIntentEngine($prompt, $liveContext, $userRole, buildNavMenuIntents($pdo));
logAiOutcome($prompt, $userRole, 'offline', 'offline', $result['action'], $result['reply']);
echo json_encode([
    'status' => 'success',
    'reply' => $result['reply'],
    'action' => $result['action'],
    'mode' => 'offline',
    'provider' => 'offline',
    // Human-escalation signal (added 27 Aug 2026, corrected same day - see AI.md's
    // human-escalation section and offline_intent_engine.php's runOfflineIntentEngine() doc
    // comment): must read the engine's own 'matched' flag, not re-derive it from action.type -
    // an earlier version of this line treated every info-only intent (tariff, C-Form, greeting -
    // anything that answers correctly but sets no UI action) as "unmatched," which would have
    // pushed a user toward the "talk to a real person" banner after two perfectly good answers.
    'matched' => $result['matched'] ?? true,
    'usage_summary' => str_contains(strtolower(trim($userRole)), 'root') ? getGeminiUsageSummary() : null,
]);
