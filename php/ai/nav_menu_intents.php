<?php
/**
 * AI Assistant - Nav Menu Auto-Intents
 * Ground Code Resort & KDS Management System
 *
 * Auto-generates a baseline "navigate to X" intent for every row in nav_menu_items - the SAME
 * table that drives the real sidebar (see Navigation.tsx). Added 24 Aug 2026 after a run of
 * live reports (Staff Directory, Edit Property fields, Service Requests, ...) where the offline
 * intent table (php/ai/offline_intent_engine.php) simply had never been taught about a page that
 * already existed in the app - each one needed a hand-written phrase list to be discovered.
 *
 * This closes that class of gap structurally instead of one page at a time: since nav_menu_items
 * is the platform's own canonical, always-current list of every real page (editable live via
 * NavMenuEditor.tsx), every row gets AT LEAST a "go to this page" intent for free, and it never
 * goes stale - a page renamed or added in the nav menu is immediately chat-navigable with no code
 * change here. It does NOT replace hand-written intents in offline_intent_engine.php for actions
 * that need extracted parameters (an expense amount, a staff name, a room number) - those still
 * need real handler logic and stay hand-built. This is the floor everything else builds on top of.
 */

/**
 * Mirrors Navigation.tsx's own isVisible() role check exactly (same allow-list semantics, so the
 * chatbot never offers to navigate somewhere the real sidebar would hide) - empty roles_json =
 * visible to everyone; Root/Super Admin always pass regardless of the list; otherwise exact
 * case-insensitive match against roles_json. Defensively also accepts 'root_admin' (underscore) -
 * the one place in this codebase's session-setting code (router.php) that spells it that way
 * instead of the space-separated form Navigation.tsx and nav_menu_items.roles_json both use.
 */
function isNavItemVisibleForRole(array $allowedRoles, string $userRole): bool {
    if (empty($allowedRoles)) {
        return true;
    }
    $normalized = strtolower(trim($userRole));
    if (in_array($normalized, ['super admin', 'root admin', 'root_admin', 'super_admin'], true)) {
        return true;
    }
    foreach ($allowedRoles as $r) {
        if (strtolower(trim($r)) === $normalized) {
            return true;
        }
    }
    return false;
}

/**
 * Extra phrase aliases for specific nav pages, keyed by unique_key (added 27 Aug 2026 - see
 * AI.md's "Gemini trial-week plan": mining real trial transcripts and graduating findings into
 * permanent coverage). Each auto-generated nav intent below only ever gets ONE literal phrase -
 * the page's own title, cleaned up - which misses common real phrasings that don't literally
 * contain the title text ("mark attendance" doesn't contain "attendance calendar" as a substring,
 * so a real trial user asking exactly that got the generic fallback instead of navigating there).
 * Deliberately NOT a hardcoded role check anywhere near this - isNavItemVisibleForRole() below
 * still reads the real, live roles_json for whichever unique_key the alias points at, so this
 * only ever adds phrasing, never duplicates or risks drifting from the DB's own permission state.
 */
const NAV_INTENT_PHRASE_ALIASES = [
    'attendance_calendar' => ['attendance', 'mark attendance', 'staff attendance', ['mark', 'attendance'], ['staff', 'attendance']],
    // Added 27 Aug 2026, live gap: "How do I add or update kitchen inventory/stock items?" scored
    // 0 against this page's own auto-title phrase ("edit kitchen stock") and instead got hijacked
    // by how_to_use_kds's loose ['how','kitchen'] AND-group (same class of over-broad-match risk
    // documented on that intent - fixed here by outscoring it with real, on-topic phrases rather
    // than narrowing the KDS intent and risking a regression on genuine KDS questions).
    'edit_kitchen_stock' => ['kitchen inventory', 'kitchen stock', 'update inventory', 'add inventory', 'stock items', ['update', 'stock'], ['add', 'stock'], ['kitchen', 'inventory']],
    // Added 27 Aug 2026, same FAQ-expansion pass - real inventory page that had zero phrase
    // coverage beyond its own literal title.
    'deficit_shortfalls_log' => ['kitchen wastage', 'stock wastage', 'spoiled stock', 'stock shortfall', ['record', 'wastage'], ['log', 'wastage'], ['stock', 'spoiled']],
    // CORRECTED same day: a 'kitchen_purchases' alias briefly lived here, but that unique_key was
    // deleted from nav_menu_items entirely (menu.php's migration: "kitchen_purchases folded into
    // the unified Expenses page" - App.tsx's own routeMap redirects the old key to
    // tab=petty_cash/key=expenses). This mechanism only augments an EXISTING live row's phrases -
    // with no row left for this unique_key, the alias was dead code that could never actually
    // fire, caught only because the test used a synthetic fixture row instead of real data. See
    // the hand-written 'kitchen_purchase_expense' intent in offline_intent_engine.php instead,
    // which points straight at the real current destination.
    'finances' => ['cash handover', 'hand over cash', 'cash reconciliation', 'reconcile cash',
        ['cash', 'handover'], ['hand', 'over', 'cash'], ['manual', 'adjustment'], ['adjust', 'cash'],
        ['cash', 'drawer']],
];

/**
 * @return array<int, array{type: string, phrases: array, handler: callable}> in the same shape
 *         getIntentTable() (offline_intent_engine.php) returns, ready to be merged onto the end
 *         of it - hand-written intents are checked first by the caller, so a hand-written phrase
 *         that ties with an auto one still wins (matchBestIntent() keeps the first max it finds).
 */
function buildNavMenuIntents(PDO $pdo): array {
    try {
        $stmt = $pdo->query("SELECT unique_key, title, tab_key, roles_json FROM nav_menu_items WHERE is_visible = 1");
        $rows = $stmt->fetchAll();
    } catch (Exception $e) {
        return []; // nav_menu_items unreachable - degrade to hand-written intents only, not a hard failure
    }

    $intents = [];
    foreach ($rows as $row) {
        $title = trim((string)($row['title'] ?? ''));
        $tabKey = trim((string)($row['tab_key'] ?? ''));
        $uniqueKey = trim((string)($row['unique_key'] ?? ''));
        if ($title === '' || $tabKey === '' || $uniqueKey === '') {
            continue; // header/group rows with no real destination - nothing to navigate to
        }

        // Strip punctuation ("Kitchen (Beta)", "Q&A") down to a clean word-boundary-safe phrase -
        // phraseMatches() in offline_intent_engine.php only word-boundary-matches plain
        // alnum/space/hyphen phrases, anything else falls back to a much looser substring check.
        $cleanPhrase = preg_replace('/[^a-z0-9\s\-]/', ' ', strtolower($title));
        $cleanPhrase = trim(preg_replace('/\s+/', ' ', $cleanPhrase));
        if ($cleanPhrase === '') {
            continue;
        }

        $allowedRoles = [];
        $decoded = json_decode((string)($row['roles_json'] ?? ''), true);
        if (is_array($decoded)) {
            $allowedRoles = $decoded;
        }

        $intents[] = [
            'type' => 'nav_auto_' . $uniqueKey,
            'phrases' => array_merge([$cleanPhrase], NAV_INTENT_PHRASE_ALIASES[$uniqueKey] ?? []),
            'handler' => function (string $q, string $lower, array $ctx, string $userRole, array $roleFlags) use ($title, $tabKey, $uniqueKey, $allowedRoles): array {
                if (!isNavItemVisibleForRole($allowedRoles, $userRole)) {
                    return ['reply' => "🔒 Access Denied: '$title' isn't available for your role ('$userRole').", 'action' => null];
                }
                return ['reply' => "Navigating to $title...", 'action' => ['type' => 'navigate', 'tab' => $tabKey, 'itemKey' => $uniqueKey]];
            },
        ];
    }
    return $intents;
}
