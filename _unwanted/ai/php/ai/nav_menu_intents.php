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
            'phrases' => [$cleanPhrase],
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
