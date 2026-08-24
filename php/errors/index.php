<?php
/**
 * Telescope Error Center - Independent File-Based Dashboard & API
 * Works without database or MySQL server dependency
 */

require_once __DIR__ . '/logger.php';
require_once __DIR__ . '/web_push.php';
require_once __DIR__ . '/telescope_auth.php';

// Handle API requests
$rawBody = file_get_contents('php://input');
$jsonInput = !empty($rawBody) ? json_decode($rawBody, true) : null;
$action = $_GET['action'] ?? $_POST['action'] ?? ($jsonInput['action'] ?? null);

// log_event MUST stay reachable with no login at all - it's the ingestion
// endpoint EVERY visitor's browser posts to automatically on a JS crash
// (recordTelescopeLog() in src/utils/telescopeLogger.ts, via sendBeacon),
// not just the root admin's. Gating this would silently blind the entire
// JS Browser portal again for every real user, not just lock out a stranger.
if ($action === 'log_event') {
    header('Content-Type: application/json');
    $input = is_array($jsonInput) ? $jsonInput : $_POST;
    TelescopeLogger::log(
        $input['portal'] ?? 'js',
        $input['severity'] ?? 'JS Exception',
        $input['msg'] ?? 'Client Error',
        $input['origin'] ?? 'Browser Client',
        $input['extra'] ?? []
    );
    echo json_encode(['status' => 'success', 'message' => 'Log entry captured successfully']);
    exit();
}

// ---- Login gate (added 22 Aug 2026) - everything below this line requires
// a valid telescope_session. See telescope_auth.php's file comment for why
// this is a standalone file-backed password rather than the main app's
// staff/DB login. ----
if ($action === 'telescope_login') {
    header('Content-Type: application/json');
    telescopeStartSession();
    $password = is_array($jsonInput) ? ($jsonInput['password'] ?? '') : ($_POST['password'] ?? '');
    if (hash_equals(getTelescopePassword(), (string) $password)) {
        $_SESSION['telescope_authed'] = true;
        echo json_encode(['status' => 'success']);
    } else {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Incorrect password']);
    }
    exit();
}
if ($action === 'telescope_logout') {
    telescopeStartSession();
    $_SESSION = [];
    session_destroy();
    header('Content-Type: application/json');
    echo json_encode(['status' => 'success']);
    exit();
}

$pushActions = ['get_vapid_public_key', 'save_push_subscription', 'delete_push_subscription', 'send_test_push'];
$isGatedApiAction = $action === 'fetch_logs' || $action === 'reset_logs' || in_array($action, $pushActions, true);
$wantsJson = $isGatedApiAction || (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false);

if (!isTelescopeAuthed()) {
    if ($wantsJson) {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode(['status' => 'error', 'message' => 'Not authenticated']);
        exit();
    }
    renderTelescopeLoginPage(!empty($_GET['login_error']) ? 'Incorrect password.' : null);
    exit();
}

// TEMPORARY one-off diagnostic (24 Aug 2026, live report: "I logged in twice recently but it's
// not showing" in the Login Portal) - lets whoever's already authenticated into Telescope check
// the real audit_logs rows directly, without needing separate DB/SSH/MySQL-MCP access (none of
// which reach staging's DB from outside the server itself - see database.php, host is hardcoded
// 'localhost' for both staging and production, i.e. only reachable from server-side PHP like
// this). Gated by the SAME telescope session check every other action on this page already
// requires (isTelescopeAuthed() above), not a new auth mechanism. Safe to delete this whole block
// once the login-audit-logging bug is actually diagnosed - not meant to be a permanent DB browser.
if ($action === 'debug_login_writes') {
    header('Content-Type: application/json');
    try {
        require_once __DIR__ . '/../config/database.php';
        $rows = $pdo->query("SELECT id, timestamp, user, action, status, property_id FROM audit_logs WHERE module = 'login' ORDER BY id DESC LIMIT 10")->fetchAll();
        echo json_encode(['status' => 'success', 'db' => $db_name ?? null, 'rows' => $rows]);
    } catch (Throwable $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit();
}

if ($wantsJson) {
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit();
    }

    $portal = $_GET['portal'] ?? 'all';
    $search = $_GET['search'] ?? '';
    $timeframe = $_GET['timeframe'] ?? 'all';
    $dateFrom = $_GET['date_from'] ?? '';
    $dateTo = $_GET['date_to'] ?? '';

    if ($action === 'reset_logs') {
        $ok = TelescopeLogger::clear();
        echo json_encode(['status' => $ok ? 'success' : 'error', 'message' => $ok ? 'Telescope logs cleared' : 'Failed to clear log file']);
        exit();
    }

    if ($action === 'get_vapid_public_key') {
        $keys = getVapidKeys();
        echo json_encode(['status' => 'success', 'publicKey' => $keys['public_raw_b64url']]);
        exit();
    }

    if ($action === 'save_push_subscription') {
        $sub = is_array($jsonInput) ? ($jsonInput['subscription'] ?? null) : null;
        if (!is_array($sub) || empty($sub['endpoint']) || empty($sub['keys']['p256dh']) || empty($sub['keys']['auth'])) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Invalid subscription payload']);
            exit();
        }
        wp_add_subscription($sub);
        echo json_encode(['status' => 'success']);
        exit();
    }

    if ($action === 'delete_push_subscription') {
        $endpoint = is_array($jsonInput) ? ($jsonInput['endpoint'] ?? '') : ($_POST['endpoint'] ?? '');
        if ($endpoint) {
            wp_remove_subscription($endpoint);
        }
        echo json_encode(['status' => 'success']);
        exit();
    }

    if ($action === 'send_test_push') {
        $subs = wp_load_subscriptions();
        if (empty($subs)) {
            echo json_encode(['status' => 'error', 'message' => 'No devices subscribed yet - tap "Enable Alerts" first.']);
            exit();
        }
        $results = broadcastWebPush([
            'title' => '✅ Telescope test alert',
            'body' => 'If you can see this, push notifications are working.',
            'url' => '/php/errors/',
            'tag' => 'telescope-test',
        ]);
        $okCount = count(array_filter($results, fn($r) => $r['ok']));
        $failCount = count($results) - $okCount;
        if ($failCount === 0) {
            echo json_encode(['status' => 'success', 'message' => "Delivered to $okCount device(s)."]);
        } else {
            $firstError = '';
            foreach ($results as $r) {
                if (!$r['ok']) { $firstError = $r['error'] ?: ('HTTP ' . $r['status']); break; }
            }
            echo json_encode(['status' => 'error', 'message' => "Delivered to $okCount, failed for $failCount. First error: $firstError"]);
        }
        exit();
    }

    $data = TelescopeLogger::getLogs($portal, $search, $timeframe, $dateFrom, $dateTo);
    echo json_encode([
        'status' => 'success',
        'logs' => $data['logs'],
        'counts' => $data['counts']
    ]);
    exit();
}

// Otherwise, render full standalone PHP dashboard matching user's design
?>
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <!-- viewport-fit=cover (24 Aug 2026, fixing a live overlap bug reported
         via mobile screenshot: the phone's own status-bar clock/icons were
         rendering directly on top of the header title/subtitle text) - without
         this, iOS ignores env(safe-area-inset-*) entirely and always resolves
         it to 0, so the safe-area padding below silently did nothing. Needed
         together with the two apple-mobile-web-app-* tags right below: those
         are what actually put an installed/"Add to Home Screen" iOS session
         into the edge-to-edge mode where the status bar overlays page content
         in the first place (this manifest already declares "display":
         "standalone" for Android's install prompt, but iOS ignores that key
         and needs its own legacy meta tags to behave the same way) - without
         them iOS reserves its own opaque status-bar strip and none of this
         would ever have been visible as a bug to begin with. -->
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Telescope Error Center</title>
    <link rel="manifest" href="manifest.json">
    <meta name="theme-color" content="#0b0f19">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #0b0f19; color: #f3f4f6; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #111827; }
        ::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }
        .nav-portal-item.active { background-color: #1f2937; border-left: 3px solid #06b6d4; color: #38bdf8; }
        .icon { width: 1em; height: 1em; display: inline-block; flex-shrink: 0; }

        /* Mobile-first Telescope console. The desktop layout resumes at 768px.
           Every declaration below carries `!important` (24 Aug 2026, fixing a
           bug reported live via mobile screenshot: this whole block already
           existed and looked correct, but visibly did nothing - header
           buttons still overflowed off-screen, sidebar/main still sat
           side-by-side, log cells still wrapped character-by-character).
           Root cause: this page loads Tailwind via the CDN Play script
           (`<script src="https://cdn.tailwindcss.com">` above), which scans
           the DOM and injects ITS OWN <style> element at runtime, appended to
           <head> - i.e. always AFTER this static block in the rendered DOM,
           regardless of where the <script> tag sits in the raw HTML source.
           Every element these rules target also carries Tailwind utility
           classes directly in its markup (e.g. `.telescope-shell` is also
           `class="... flex ..."`, `.telescope-actions` is also `class="flex
           items-center gap-4 ..."`). A single custom class selector and a
           single Tailwind utility class selector are equal specificity, so
           the tiebreak is pure source order - and Tailwind's runtime-injected
           sheet always loses that race in its own favor, silently overriding
           every rule here. `!important` is the standard, expected way to
           guarantee a scoped override wins against a CDN utility framework
           whose injection point you don't control - safe here specifically
           because this entire block is already gated behind `max-width:
           767px` and exists purely to override the desktop-oriented classes
           baked into the HTML. */
        @media (max-width: 767px) {
            html { -webkit-text-size-adjust: 100% !important; }
            body { min-width: 0 !important; }
            button, input, select, a { -webkit-tap-highlight-color: transparent !important; }

            .telescope-header { padding: max(1rem, env(safe-area-inset-top)) 1rem 1rem 1rem !important; align-items: stretch !important; flex-direction: column !important; gap: .875rem !important; }
            .telescope-brand { width: 100% !important; min-width: 0 !important; align-items: flex-start !important; }
            .telescope-title { font-size: .875rem !important; line-height: 1.25rem !important; letter-spacing: .08em !important; }
            .telescope-subtitle { max-width: 230px !important; line-height: 1.2 !important; }
            #liveClock { margin-left: auto !important; padding-top: .25rem !important; font-size: 1rem !important; }
            .telescope-actions { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: .5rem !important; width: 100% !important; }
            .telescope-actions > *, .telescope-actions > div { min-width: 0 !important; }
            .telescope-actions button, .telescope-actions a, .telescope-actions label {
                min-height: 2.75rem !important; justify-content: center !important; padding: .5rem .625rem !important; text-align: center !important;
            }
            .telescope-actions label { gap: .375rem !important; font-size: .6875rem !important; }
            .telescope-actions .push-control { display: contents !important; }
            #pushToggleBtn { grid-column: span 2 !important; }
            #pushTestBtn { grid-column: span 2 !important; min-height: 2.25rem !important; padding: .5rem !important; }

            .telescope-shell { display: block !important; overflow: visible !important; }
            .telescope-sidebar { width: 100% !important; padding: 1rem !important; gap: 1rem !important; border-right: 0 !important; border-bottom: 1px solid #1f2937 !important; }
            .telescope-sidebar > div:first-child { display: grid !important; grid-template-columns: 7.25rem minmax(0, 1fr) !important; align-items: center !important; gap: .5rem !important; }
            .telescope-sidebar > div:first-child label { margin: 0 !important; }
            .telescope-sidebar > div:first-child select { min-height: 2.75rem !important; }
            #customDateRangePanel { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: .75rem !important; }
            #customDateRangePanel.hidden { display: none !important; }
            #customDateRangePanel > :first-child, #customDateRangePanel button { grid-column: 1 / -1 !important; }
            #customDateRangePanel input { min-height: 2.75rem !important; }
            .portal-label { margin-bottom: .5rem !important; }
            /* Sticky mobile portal selector (roadmap item 1) - the scrollable
               tab row itself sticks to the top of the viewport once you scroll
               past it into the log list, so switching portals never needs a
               scroll back up. Needs an opaque background (not the page's own
               transparent default) since content now scrolls underneath it,
               and a z-index above both the log rows and the sticky table
               header inside .telescope-logs (which itself only sticks within
               its own now-non-scrolling container on mobile, so no conflict). */
            .telescope-portals { position: sticky !important; top: 0 !important; z-index: 20 !important; display: flex !important; overflow-x: auto !important; gap: .5rem !important; padding: .625rem 1rem .5rem !important; margin: 0 -1rem !important; scroll-snap-type: x proximity !important; scrollbar-width: none !important; background: #0b0f19 !important; box-shadow: 0 4px 6px -2px rgba(0,0,0,.3) !important; }
            .telescope-portals::-webkit-scrollbar { display: none !important; }
            .telescope-portals > * { margin: 0 !important; }
            .telescope-portals .nav-portal-item { flex: 0 0 auto !important; width: auto !important; min-width: max-content !important; min-height: 2.75rem !important; padding: .625rem .75rem !important; scroll-snap-align: start !important; }
            .telescope-portals .nav-portal-item.active { border-left: 0 !important; border-bottom: 3px solid #06b6d4 !important; }

            .telescope-main { min-width: 0 !important; padding: 1rem !important; overflow: visible !important; }
            .telescope-search { margin-bottom: 1rem !important; }
            #searchInput { min-height: 2.75rem !important; font-size: .8125rem !important; }
            .telescope-logs { overflow: visible !important; border-radius: .75rem !important; }
            .telescope-logs-scroll { overflow: visible !important; }
            #logsPagination { position: sticky !important; bottom: 0 !important; background: #111827 !important; }
            .telescope-logs table, .telescope-logs tbody, .telescope-logs tr, .telescope-logs td { display: block !important; width: 100% !important; }
            .telescope-logs thead { display: none !important; }
            .telescope-logs tbody { divide: none !important; }
            .telescope-logs tr { position: relative !important; padding: .875rem 3.25rem .875rem 1rem !important; border-bottom: 1px solid rgba(31, 41, 55, .8) !important; }
            .telescope-logs tr:last-child { border-bottom: 0 !important; }
            .telescope-logs td { max-width: none !important; padding: .25rem 0 !important; overflow-wrap: anywhere !important; white-space: normal !important; }
            .telescope-logs td::before { content: attr(data-label); display: block !important; margin-bottom: .125rem !important; color: #6b7280 !important; font: 700 .625rem/1 ui-sans-serif, system-ui, sans-serif !important; letter-spacing: .06em !important; text-transform: uppercase !important; }
            .telescope-logs td:nth-child(2)::before { display: none !important; }
            .telescope-logs td:nth-child(2) { padding-top: .5rem !important; }
            .telescope-logs td:nth-child(3) { color: #e5e7eb !important; font-size: .8125rem !important; line-height: 1.35 !important; }
            .telescope-logs td:only-child { padding: 2rem 1rem !important; text-align: center !important; }
            .telescope-logs td:only-child::before { display: none !important; }
            /* Per-row "Copy this error" button (24 Aug 2026, requested - a
               1-tap copy without needing to open the detail modal first, on
               top of the modal's own Copy Stack Trace/Full Payload buttons
               which still exist for once you're already in there). Pinned to
               the card's top-right corner instead of stacking as its own
               full-width row like the other fields - it's an action, not
               data, and pinning avoids a redundant empty "COPY" label. The
               row's own right padding above makes room for it. */
            .telescope-logs td.telescope-row-copy-cell { position: absolute !important; top: .875rem !important; right: 1rem !important; padding: 0 !important; width: auto !important; }
            .telescope-logs td.telescope-row-copy-cell::before { display: none !important; }

            /* Bottom sheet (roadmap item 1's 4th sub-point) - real slide-up/
               slide-down, not an instant show/hide. #detailModal itself keeps
               display:none/flex via .hidden (openModal/closeModal below still
               toggle that first, for real accessibility/focus semantics) -
               the animation lives entirely on the inner sheet's transform, so
               toggling .open a frame after removing .hidden is what actually
               triggers the transition (a bare display change can't animate). */
            #detailModal { align-items: flex-end !important; padding: 0 !important; }
            #detailModal #detailModalSheet { max-height: 88dvh !important; border-radius: 1rem 1rem 0 0 !important; padding: 1rem !important; transform: translateY(100%) !important; transition: transform .28s cubic-bezier(.32,.72,0,1) !important; }
            #detailModal.open #detailModalSheet { transform: translateY(0) !important; }
            #detailModalGrip { display: block !important; }
            #modalCopyRow button { min-height: 2.75rem !important; }
        }
    </style>
</head>
<body class="min-h-screen flex flex-col">

    <header class="telescope-header border-b border-gray-800 bg-[#0f172a] px-6 py-4 flex items-center justify-between">
        <div class="telescope-brand flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <svg class="icon text-base animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 2v2"/><path d="M12 22v-2"/><path d="m17 20.66-1-1.73"/><path d="M11 10.27 7 6.34"/><path d="m20.66 17-1.73-1"/><path d="m3.34 17 1.73-1"/><path d="m14 7-3.73-3.73"/><path d="m20.66 7-1.73 1"/><path d="m11 13.73-4.95-4.95"/><path d="m6.34 7 1.73 1"/><path d="m14 17 3.73 3.73"/><path d="m9.34 17 1.73 1"/></svg>
            </div>
            <div>
                <h1 class="telescope-title text-base font-bold text-white tracking-wider uppercase">Telescope Error Center</h1>
                <p class="telescope-subtitle text-[10px] text-gray-400 font-sans tracking-widest uppercase">Database-Independent Development Console</p>
            </div>
            <div id="liveClock" class="text-red-500 font-mono font-bold text-lg tracking-wider ml-4"></div>
        </div>
        <div class="telescope-actions flex items-center gap-4 text-xs font-sans">
            <div class="push-control flex items-center gap-1.5">
                <button id="pushToggleBtn" onclick="togglePushSubscription()" class="flex items-center gap-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition border border-gray-700 cursor-pointer" title="Get a real push notification on this device whenever a real error happens - no need to keep this page open">
                    <svg class="icon text-[11px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
                    <span id="pushBtnLabel">Enable Alerts</span>
                </button>
            </div>
            <button id="copyHeaderBtn" onclick="copyVisibleErrors(this)" class="flex items-center gap-1 px-3 py-1.5 bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 rounded-lg transition border border-cyan-800/80 cursor-pointer" title="Copy all currently visible errors on screen to clipboard">
                <svg class="icon text-cyan-400 text-[11px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <span>Copy Visible Errors</span>
            </button>
            <button onclick="resetLogs()" class="flex items-center gap-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition border border-gray-700 cursor-pointer" title="Clear and reset Telescope logs">
                <svg class="icon text-red-400 text-[11px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                <span>Reset Logs</span>
            </button>
            <label class="flex items-center gap-2 cursor-pointer text-gray-300 hover:text-white transition">
                <input type="checkbox" id="livePollingToggle" checked onchange="togglePollingMode()" class="accent-cyan-500 rounded cursor-pointer">
                <span class="flex items-center gap-1.5">
                    <svg class="icon text-[11px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
                    Live Polling
                </span>
            </label>
            <a href="../../index.php" class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-md font-semibold transition border border-gray-700">
                &larr; Back to App
            </a>
            <button onclick="telescopeLogout()" class="px-3 py-1.5 bg-gray-800 hover:bg-red-900/60 text-gray-300 hover:text-red-300 rounded-md font-semibold transition border border-gray-700 cursor-pointer" title="Log out of Telescope">
                Log Out
            </button>
        </div>
    </header>

    <div class="telescope-shell flex-1 flex overflow-hidden">
        <aside class="telescope-sidebar w-64 border-r border-gray-800 bg-[#0f172a]/50 p-4 flex flex-col gap-6 flex-shrink-0">
            <div>
                <label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2 font-sans">Timeframe Filter</label>
                <select id="timeframeSelect" onchange="onTimeframeChange()" class="w-full bg-gray-900 border border-gray-800 text-gray-300 text-xs rounded-lg p-2 outline-none font-sans">
                    <option value="today" selected>Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="7days">Last 7 Days</option>
                    <option value="custom">Custom Date Range</option>
                </select>
            </div>

            <div id="customDateRangePanel" class="hidden space-y-2">
                <label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider block font-sans">Custom Date Range</label>
                <div>
                    <label class="text-[9px] text-gray-500 font-sans block mb-0.5">From Date</label>
                    <input type="date" id="dateFromInput" onchange="loadPortalLogs()" class="w-full bg-gray-900 border border-gray-800 text-gray-300 text-xs rounded-lg p-2 outline-none font-sans">
                </div>
                <div>
                    <label class="text-[9px] text-gray-500 font-sans block mb-0.5">To Date</label>
                    <input type="date" id="dateToInput" onchange="loadPortalLogs()" class="w-full bg-gray-900 border border-gray-800 text-gray-300 text-xs rounded-lg p-2 outline-none font-sans">
                </div>
                <button onclick="clearCustomDates()" class="w-full text-[10px] text-gray-500 hover:text-gray-300 font-sans py-1 transition">Clear Dates</button>
            </div>

            <div>
                <label class="portal-label text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2 font-sans">Category Portals</label>
                <nav class="telescope-portals space-y-1 font-sans text-xs">
                    <button onclick="switchPortal('requests', this)" class="nav-portal-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition active">
                        <span class="flex items-center gap-2.5"><svg class="icon text-cyan-400 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 2v2"/><path d="M12 22v-2"/><path d="m17 20.66-1-1.73"/><path d="M11 10.27 7 6.34"/><path d="m20.66 17-1.73-1"/><path d="m3.34 17 1.73-1"/><path d="m14 7-3.73-3.73"/><path d="m20.66 7-1.73 1"/><path d="m11 13.73-4.95-4.95"/><path d="m6.34 7 1.73 1"/><path d="m14 17 3.73 3.73"/><path d="m9.34 17 1.73 1"/></svg>Requests Trail</span>
                        <span class="flex items-center gap-1">
                            <span id="badge-requests" class="px-2 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-300 font-mono">0</span>
                            <span id="unseen-requests" class="hidden px-2 py-0.5 text-[10px] rounded-full bg-red-500/90 text-white font-mono">0</span>
                        </span>
                    </button>

                    <button onclick="switchPortal('php', this)" class="nav-portal-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition">
                        <span class="flex items-center gap-2.5"><svg class="icon text-red-400 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a6 6 0 0 1 12 0v3c0 3.3-2.7 6-6 6"/><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>PHP Failures</span>
                        <span class="flex items-center gap-1">
                            <span id="badge-php" class="px-2 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-300 font-mono">0</span>
                            <span id="unseen-php" class="hidden px-2 py-0.5 text-[10px] rounded-full bg-red-500/90 text-white font-mono">0</span>
                        </span>
                    </button>

                    <button onclick="switchPortal('sql', this)" class="nav-portal-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition">
                        <span class="flex items-center gap-2.5"><svg class="icon text-emerald-400 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><ellipse cx="12" cy="5" rx="9" ry="3"/></svg>SQL Profiler</span>
                        <span class="flex items-center gap-1">
                            <span id="badge-sql" class="px-2 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-300 font-mono">0</span>
                            <span id="unseen-sql" class="hidden px-2 py-0.5 text-[10px] rounded-full bg-red-500/90 text-white font-mono">0</span>
                        </span>
                    </button>

                    <button onclick="switchPortal('js', this)" class="nav-portal-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition">
                        <span class="flex items-center gap-2.5"><svg class="icon text-amber-400 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>JS Browser</span>
                        <span class="flex items-center gap-1">
                            <span id="badge-js" class="px-2 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-300 font-mono">0</span>
                            <span id="unseen-js" class="hidden px-2 py-0.5 text-[10px] rounded-full bg-red-500/90 text-white font-mono">0</span>
                        </span>
                    </button>

                    <button onclick="switchPortal('telegram', this)" class="nav-portal-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition">
                        <span class="flex items-center gap-2.5"><svg class="icon text-sky-400 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4 20-7z"/></svg>Telegram API</span>
                        <span class="flex items-center gap-1">
                            <span id="badge-telegram" class="px-2 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-300 font-mono">0</span>
                            <span id="unseen-telegram" class="hidden px-2 py-0.5 text-[10px] rounded-full bg-red-500/90 text-white font-mono">0</span>
                        </span>
                    </button>

                    <button onclick="switchPortal('whatsapp', this)" class="nav-portal-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition">
                        <span class="flex items-center gap-2.5"><svg class="icon text-green-400 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 3.11L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/></svg>WhatsApp API</span>
                        <span class="flex items-center gap-1">
                            <span id="badge-whatsapp" class="px-2 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-300 font-mono">0</span>
                            <span id="unseen-whatsapp" class="hidden px-2 py-0.5 text-[10px] rounded-full bg-red-500/90 text-white font-mono">0</span>
                        </span>
                    </button>

                    <button onclick="switchPortal('security', this)" class="nav-portal-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition">
                        <span class="flex items-center gap-2.5"><svg class="icon text-purple-400 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>Security Audits</span>
                        <span class="flex items-center gap-1">
                            <span id="badge-security" class="px-2 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-300 font-mono">0</span>
                            <span id="unseen-security" class="hidden px-2 py-0.5 text-[10px] rounded-full bg-red-500/90 text-white font-mono">0</span>
                        </span>
                    </button>

                    <button onclick="switchPortal('404', this)" class="nav-portal-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition">
                        <span class="flex items-center gap-2.5"><svg class="icon text-rose-400 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>404 Sentinel</span>
                        <span class="flex items-center gap-1">
                            <span id="badge-404" class="px-2 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-300 font-mono">0</span>
                            <span id="unseen-404" class="hidden px-2 py-0.5 text-[10px] rounded-full bg-red-500/90 text-white font-mono">0</span>
                        </span>
                    </button>

                    <button onclick="switchPortal('staff_activity', this)" class="nav-portal-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition">
                        <span class="flex items-center gap-2.5"><svg class="icon text-indigo-400 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Staff Activity</span>
                        <span class="flex items-center gap-1">
                            <span id="badge-staff_activity" class="px-2 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-300 font-mono">0</span>
                            <span id="unseen-staff_activity" class="hidden px-2 py-0.5 text-[10px] rounded-full bg-red-500/90 text-white font-mono">0</span>
                        </span>
                    </button>

                    <button onclick="switchPortal('login', this)" class="nav-portal-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition">
                        <span class="flex items-center gap-2.5"><svg class="icon text-orange-400 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Login Portal</span>
                        <span class="flex items-center gap-1">
                            <span id="badge-login" class="px-2 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-300 font-mono">0</span>
                            <span id="unseen-login" class="hidden px-2 py-0.5 text-[10px] rounded-full bg-red-500/90 text-white font-mono">0</span>
                        </span>
                    </button>
                </nav>
            </div>
        </aside>

        <main class="telescope-main flex-1 flex flex-col p-6 overflow-hidden">
            <div class="telescope-search mb-4 flex items-center gap-3">
                <div class="relative flex-1">
                    <svg class="icon absolute left-3.5 top-3 text-gray-500 text-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    <input type="text" id="searchInput" oninput="loadPortalLogs()" placeholder="Search system logs by route, severity, keywords, trace parameters or IP..." class="w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded-xl pl-9 pr-4 py-2.5 outline-none focus:border-cyan-500 transition font-sans">
                </div>
                <button id="copySearchBtn" onclick="copyVisibleErrors(this)" class="flex items-center gap-1.5 px-3 py-2.5 bg-cyan-950/80 hover:bg-cyan-900/90 text-cyan-300 text-xs rounded-xl transition border border-cyan-800/80 cursor-pointer font-sans whitespace-nowrap" title="Copy all currently filtered error logs to clipboard">
                    <svg class="icon text-cyan-400 w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    <span>Copy Errors (<span id="copyErrorsCount">0</span>)</span>
                </button>
            </div>

            <div class="telescope-logs flex-1 bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
                <div class="telescope-logs-scroll flex-1 overflow-y-auto">
                    <table class="w-full text-xs text-left">
                        <thead class="bg-gray-800/60 text-gray-400 font-sans border-b border-gray-800 sticky top-0 uppercase text-[10px] tracking-wider">
                            <tr>
                                <th class="px-4 py-3 w-40">Timestamp</th>
                                <th class="px-4 py-3 w-28">Severity</th>
                                <th class="px-4 py-3">Log Message</th>
                                <th class="px-4 py-3 w-72">User / Origin Location</th>
                                <th class="px-4 py-3 w-14"></th>
                            </tr>
                        </thead>
                        <tbody id="logsTableBody" class="divide-y divide-gray-800/50">
                        </tbody>
                    </table>
                </div>
                <!-- Pagination footer (24 Aug 2026, requested - "every log"
                     was rendering unbounded, sometimes hundreds of rows in
                     one unpaged list). Pinned outside the scrollable area
                     above so it stays visible instead of scrolling away with
                     the log rows - see loadPortalLogs()/renderLogsPage() for
                     how it's populated. Applies to every portal, since it's
                     driven by whatever window.currentVisibleLogs holds, not
                     hardcoded to one portal's data. -->
                <div id="logsPagination" class="shrink-0"></div>
            </div>
        </main>
    </div>

    <div id="detailModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6 hidden" onclick="closeModal()">
        <div id="detailModalSheet" class="bg-gray-900 border border-gray-800 rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col p-6 text-xs" onclick="event.stopPropagation()">
            <div id="detailModalGrip" class="hidden mx-auto mb-2 h-1 w-10 rounded-full bg-gray-700 shrink-0"></div>
            <div class="flex items-center justify-between border-b border-gray-800 pb-3 mb-3">
                <h3 class="font-bold text-white text-sm" id="modalTitle">Log Event Detail</h3>
                <button onclick="closeModal()" class="text-gray-400 hover:text-white text-base leading-none p-1 -m-1">✕</button>
            </div>
            <div id="modalCopyRow" class="flex items-center gap-2 mb-3 flex-wrap"></div>
            <div id="modalContent" class="overflow-y-auto font-mono text-gray-300 space-y-4 whitespace-pre-wrap break-all">
            </div>
        </div>
    </div>

    <script>
    const LS_KEY = 'telescope_system_logs';
    const LS_SEEN_PREFIX = 'telescope_last_seen_';
    let activePortal = new URLSearchParams(window.location.search).get('portal') || localStorage.getItem('telescope_active_portal') || 'requests';
    let pollingIntervalToken = null;
    // Pagination (24 Aug 2026, requested - applies to every portal, since
    // it's driven by whatever loadPortalLogs() last computed, not
    // per-portal). lastFilterSignature lets loadPortalLogs() tell "the
    // active filters actually changed, reset to page 1" apart from "this is
    // just the 4-second Live Polling tick re-running with the same filters"
    // - without that distinction, polling would silently snap the user back
    // to page 1 every few seconds while they're reading an older page.
    const LOGS_PAGE_SIZE = 10;
    let currentLogsPage = 1;
    let lastFilterSignature = null;

    function getClientLogs() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) { return []; }
    }

    function getLastSeen(portal) {
        const raw = localStorage.getItem(LS_SEEN_PREFIX + portal);
        return raw ? new Date(raw).getTime() : null;
    }

    function markPortalSeen(portal) {
        localStorage.setItem(LS_SEEN_PREFIX + portal, new Date().toISOString());
        const unseenEl = document.getElementById(`unseen-${portal}`);
        if (unseenEl) {
            unseenEl.classList.add('hidden');
            unseenEl.textContent = '0';
        }
    }

        function getUnseenCounts(logs) {
            const counts = { requests: 0, php: 0, sql: 0, js: 0, telegram: 0, whatsapp: 0, security: 0, 404: 0, staff_activity: 0, login: 0 };
        logs.forEach(l => {
            const p = (l.portal || '').toLowerCase();
            if (!counts.hasOwnProperty(p)) return;
            const ts = l.timestamp ? new Date(l.timestamp).getTime() : 0;
            const lastSeen = getLastSeen(p);
            if (!Number.isNaN(ts) && (lastSeen === null || ts > lastSeen)) {
                counts[p]++;
            }
        });
        return counts;
    }

    function updateUnseenBadges(unseenCounts) {
        for (const [key, count] of Object.entries(unseenCounts)) {
            const el = document.getElementById(`unseen-${key}`);
            if (!el) continue;
            if (count > 0) {
                el.classList.remove('hidden');
                el.textContent = count;
            } else {
                el.classList.add('hidden');
                el.textContent = '0';
            }
        }
    }

    function onTimeframeChange() {
        const tf = document.getElementById('timeframeSelect').value;
        const panel = document.getElementById('customDateRangePanel');
        if (tf === 'custom') {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
            document.getElementById('dateFromInput').value = '';
            document.getElementById('dateToInput').value = '';
        }
        loadPortalLogs();
    }

    function clearCustomDates() {
        document.getElementById('dateFromInput').value = '';
        document.getElementById('dateToInput').value = '';
        loadPortalLogs();
    }

    function switchPortal(portalName, buttonEl) {
        document.querySelectorAll('.nav-portal-item').forEach(el => el.classList.remove('active'));
        if (buttonEl) buttonEl.classList.add('active');
        activePortal = portalName;
        localStorage.setItem('telescope_active_portal', portalName);
        markPortalSeen(portalName);
        loadPortalLogs();
    }

    // 24 Aug 2026, fixing a live bug reported as "No data under [a portal]"
    // despite its sidebar badge showing a real nonzero count: this function
    // used to define "today"/"yesterday" as a ROLLING 24-48h window relative
    // to the current moment (e.g. "yesterday" = exactly 24-48 hours ago),
    // while the badge counts come from logger.php's getLogs() on the server,
    // which defines them as CALENDAR days (date('Y-m-d', $logTime) matching
    // literal today's/yesterday's date). Those two definitions only agree
    // when "now" happens to be near midnight - at any other time of day (e.g.
    // 2pm) they disagree on a large chunk of yesterday's actual entries, so
    // the server-computed badge (298) and this function's client-side
    // re-filter of the same entries (0) can legitimately show completely
    // different numbers for the exact same portal/timeframe. Rewritten to
    // match logger.php's calendar-day semantics exactly (see its
    // getLogs()) - '7days' stays a rolling window since PHP's own '7days'
    // check ($logTime < $now - 7*86400) already is one too, so no mismatch
    // there. Assumes the browser's local timezone matches the server's -
    // true for this app's real deployments, not a general-purpose fix for a
    // browser in a different timezone than the server.
    function matchesTimeframe(log, timeframe, dateFrom, dateTo) {
        if (!log || !log.timestamp) return true;
        if (timeframe === 'custom') {
            const logDate = log.timestamp.split(' ')[0].split('T')[0];
            if (dateFrom && logDate < dateFrom) return false;
            if (dateTo && logDate > dateTo) return false;
            return true;
        }
        if (timeframe === 'all') return true;
        const formattedTs = log.timestamp.includes('T') ? log.timestamp : log.timestamp.replace(' ', 'T');
        const t = new Date(formattedTs).getTime();
        if (isNaN(t)) return true;
        if (timeframe === '7days') return t >= (Date.now() - 7 * 86400000);
        const toYMD = (ms) => {
            const d = new Date(ms);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };
        const logYMD = toYMD(t);
        if (timeframe === 'today') return logYMD === toYMD(Date.now());
        if (timeframe === 'yesterday') return logYMD === toYMD(Date.now() - 86400000);
        return true;
    }

    async function loadPortalLogs() {
        const search = document.getElementById('searchInput').value;
        const timeframe = document.getElementById('timeframeSelect').value;
        const dateFrom = document.getElementById('dateFromInput').value;
        const dateTo = document.getElementById('dateToInput').value;
        const tbody = document.getElementById('logsTableBody');
        let allLogs = getClientLogs();
        let serverCounts = null;

        try {
            const params = new URLSearchParams({ action: 'fetch_logs', portal: 'all', search, timeframe });
            if (dateFrom) params.set('date_from', dateFrom);
            if (dateTo) params.set('date_to', dateTo);
            const res = await fetch(`index.php?${params.toString()}`);
            const data = await res.json();

            if (data.status === 'success') {
                // Use server-calculated counts (respects timeframe filter)
                serverCounts = data.counts;

                if (Array.isArray(data.logs)) {
                    const existingIds = new Set(allLogs.map(l => l.id));
                    for (const sLog of data.logs) {
                        // FIXED 25 Aug 2026 (live report: "the log details don't show that I
                        // logged in root dashboard" - the real login WAS logged, but appeared
                        // as two separate confusing-looking rows for the same event). The
                        // "login" portal is deliberately meant to be synthesized ENTIRELY from
                        // get_audit_logs below (loginMapped) - that's the authoritative,
                        // role-labelled, property-labelled source. router.php's own raw
                        // TelescopeLogger::log('login', ...) calls ALSO tag themselves with
                        // portal 'login' though, so without this skip they'd merge into this
                        // same list as a second, differently-worded row for the exact same
                        // login event, every single time. Every other portal still comes from
                        // this raw file-log fetch as normal - only 'login' is excluded here.
                        if ((sLog.portal || '').toLowerCase() === 'login') continue;
                        if (!existingIds.has(sLog.id)) allLogs.push(sLog);
                    }
                }
            }
        } catch (e) {}

        try {
            // scope=all (24 Aug 2026): Telescope is a standalone page with no
            // property-scoped URL of its own, so the parameterless fetch this used
            // to be silently fell through the shared getCurrentPropertyId()
            // resolver's default fallback (hardcoded to property 'jaipur', id 1) -
            // meaning Staff Activity/Login here could only ever show that ONE
            // property's rows, no matter which property an event actually
            // happened on (found live: a real staff edit + its real audit_logs
            // row on a different property never appeared here). Every other
            // portal on this page is already a single shared, non-property-scoped
            // log, so "every property, labelled" - not "pick one property to
            // default to" - is the fix; see audit.php's get_audit_logs handler for
            // the opt-in `scope=all` branch this relies on (default/unscoped
            // behavior for every OTHER caller, e.g. the real app's own
            // single-property Audit Logs page, is unchanged).
            //
            // timeframe/date_from/date_to (24 Aug 2026, found live: an entry that
            // briefly appeared here "disappeared after sometime") - scope=all
            // means this response is now shared across every property's combined
            // activity instead of one property's, so a flat row LIMIT alone can
            // get exhausted by unrelated properties' traffic well before "Today"
            // is actually over. Passing the SAME timeframe this page has
            // selected lets audit.php apply a real SQL date filter server-side
            // (mirroring TelescopeLogger::getLogs()'s own today/yesterday/7days/
            // custom semantics) so the response window tracks the selected
            // timeframe instead of a raw row count - see that handler for the
            // full writeup and its own, much higher, backstop LIMIT.
            const auditParams = new URLSearchParams({ action: 'get_audit_logs', scope: 'all', timeframe });
            if (dateFrom) auditParams.set('date_from', dateFrom);
            if (dateTo) auditParams.set('date_to', dateTo);
            const aRes = await fetch(`../api/router.php?${auditParams.toString()}`);
            const aData = await aRes.json();
            if (Array.isArray(aData.data)) {
                const existingIds = new Set(allLogs.map(l => l.id));
                const propertyLabel = (l) => l.property_name || (l.property_id ? `Property #${l.property_id}` : 'Unknown Property');
                const activityMapped = aData.data.filter(l => (l.module || '').toLowerCase() !== 'login').map(l => ({
                    id: `activity-${l.id}`,
                    portal: 'staff_activity',
                    severity: l.status === 'Failed' ? 'Warning' : 'Info',
                    msg: l.action,
                    origin: `${propertyLabel(l)} · ${l.user || 'System'}`,
                    timestamp: l.timestamp,
                    details: { browser: l.browser, os: l.os, device_type: l.device_type, ip_address: l.ip_address, user_agent: l.user_agent, status: l.status, module: l.module, property_id: l.property_id, property_name: l.property_name, property_slug: l.property_slug }
                }));
                const loginMapped = aData.data.filter(l => (l.module || '').toLowerCase() === 'login').map(l => ({
                    id: `login-${l.id}`,
                    portal: 'login',
                    severity: l.status === 'Failed' ? 'Warning' : 'Info',
                    msg: l.action,
                    origin: `${propertyLabel(l)} · ${l.user || 'System'}`,
                    timestamp: l.timestamp,
                    details: { browser: l.browser, os: l.os, device_type: l.device_type, ip_address: l.ip_address, user_agent: l.user_agent, status: l.status, property_id: l.property_id, property_name: l.property_name, property_slug: l.property_slug }
                }));
                [...activityMapped, ...loginMapped].forEach(al => {
                    if (!existingIds.has(al.id)) {
                        allLogs.push(al);
                        existingIds.add(al.id);
                    }
                });
            }
        } catch (e) {}

        // Update badges with server counts (already filtered by timeframe)
        if (serverCounts) {
            for (const [key, count] of Object.entries(serverCounts)) {
                const badge = document.getElementById(`badge-${key}`);
                if (badge) badge.innerText = count;
            }
        } else {
            // Fallback: count only if server didn't provide counts
            const counts = { requests: 0, php: 0, sql: 0, js: 0, telegram: 0, whatsapp: 0, security: 0, 404: 0, staff_activity: 0, login: 0 };
            allLogs.forEach(l => {
                const p = (l.portal || '').toLowerCase();
                if (counts[p] !== undefined) counts[p]++;
                else counts.requests++;
            });
            for (const [key, count] of Object.entries(counts)) {
                const badge = document.getElementById(`badge-${key}`);
                if (badge) badge.innerText = count;
            }
        }

        // "login" and "staff_activity" portals are synthesized entirely client-side from
        // get_audit_logs (a different data source than the PHP TelescopeLogger file that
        // serverCounts reflects), so serverCounts structurally never knows about them -
        // their badges were always stuck showing whatever the static HTML started with.
        // Compute their counts from the same merged allLogs + timeframe filter used for
        // the visible row list, so the badge always matches what selecting that portal shows.
        const loginCount = allLogs.filter(l => (l.portal || '').toLowerCase() === 'login' && matchesTimeframe(l, timeframe, dateFrom, dateTo)).length;
        const staffActivityCount = allLogs.filter(l => (l.portal || '').toLowerCase() === 'staff_activity' && matchesTimeframe(l, timeframe, dateFrom, dateTo)).length;
        const loginBadgeEl = document.getElementById('badge-login');
        if (loginBadgeEl) loginBadgeEl.innerText = loginCount;
        const staffBadgeEl = document.getElementById('badge-staff_activity');
        if (staffBadgeEl) staffBadgeEl.innerText = staffActivityCount;

        const unseenCounts = getUnseenCounts(allLogs);
        updateUnseenBadges(unseenCounts);

        let filtered = allLogs;

        if (search.trim()) {
            const term = search.toLowerCase();
            // Search across ALL log fields, message, origin, user, severity, portal, and full JSON payload
            filtered = filtered.filter(l =>
                (l.msg || '').toLowerCase().includes(term) ||
                (l.origin || '').toLowerCase().includes(term) ||
                (l.severity || '').toLowerCase().includes(term) ||
                (l.portal || '').toLowerCase().includes(term) ||
                (l.user || '').toLowerCase().includes(term) ||
                JSON.stringify(l).toLowerCase().includes(term)
            );
        } else {
            filtered = filtered.filter(l => (l.portal || '').toLowerCase() === activePortal.toLowerCase());
        }

        filtered = filtered.filter(l => matchesTimeframe(l, timeframe, dateFrom, dateTo));

        window.currentVisibleLogs = filtered;
        const countSpan = document.getElementById('copyErrorsCount');
        if (countSpan) countSpan.innerText = filtered.length;

        // Only reset to page 1 when the actual filters changed - not on
        // every Live Polling re-run of this same function with the same
        // filters (see the globals' comment above).
        const filterSignature = JSON.stringify([activePortal, search, timeframe, dateFrom, dateTo]);
        if (filterSignature !== lastFilterSignature) {
            currentLogsPage = 1;
            lastFilterSignature = filterSignature;
        }

        renderLogsPage();
    }

    function changeLogsPage(delta) {
        currentLogsPage += delta;
        renderLogsPage();
    }

    function renderLogsPage() {
        const tbody = document.getElementById('logsTableBody');
        const paginationEl = document.getElementById('logsPagination');
        const filtered = window.currentVisibleLogs || [];

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-gray-500 italic">No events recorded for this selection.</td></tr>`;
            if (paginationEl) paginationEl.innerHTML = '';
            return;
        }

        const totalPages = Math.max(1, Math.ceil(filtered.length / LOGS_PAGE_SIZE));
        if (currentLogsPage > totalPages) currentLogsPage = totalPages;
        if (currentLogsPage < 1) currentLogsPage = 1;

        const startIdx = (currentLogsPage - 1) * LOGS_PAGE_SIZE;
        const pageItems = filtered.slice(startIdx, startIdx + LOGS_PAGE_SIZE);

        const lastSeen = getLastSeen(activePortal);
        tbody.innerHTML = pageItems.map(r => {
            let sevClass = 'text-gray-400 bg-gray-800';
            const sev = (r.severity || '').toLowerCase();
            if (sev.includes('fatal') || sev.includes('error') || sev.includes('exception')) sevClass = 'text-red-400 bg-red-950/60 border border-red-800/40';
            else if (sev.includes('warning') || sev.includes('notice')) sevClass = 'text-amber-400 bg-amber-950/60 border border-amber-800/40';
            else if (sev.includes('sql') || sev.includes('js') || sev.includes('telegram')) sevClass = 'text-cyan-400 bg-cyan-950/60 border border-cyan-800/40';
            else if (sev.includes('info') || sev.includes('success')) sevClass = 'text-teal-400 bg-teal-950/60 border border-teal-800/40';

            const isUnseen = (() => {
                if (!lastSeen || !r.timestamp) return false;
                const ts = new Date(r.timestamp).getTime();
                return !Number.isNaN(ts) && ts > lastSeen;
            })();

            const rowJson = escapeHtml(JSON.stringify(r));
            const rowClasses = isUnseen ? 'bg-red-950/20 border-l-2 border-l-red-500' : 'hover:bg-gray-800/40';
            return `
                <tr class="${rowClasses} transition cursor-pointer" onclick='openModal(${rowJson})'>
                    <td class="px-4 py-2.5 text-gray-500 whitespace-nowrap">${r.timestamp || ''}</td>
                    <td class="px-4 py-2.5 whitespace-nowrap">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${sevClass}">${r.severity || 'LOG'}</span>
                    </td>
                    <td class="px-4 py-2.5 text-gray-200 truncate max-w-md">${escapeHtml(r.msg || '')}</td>
                    <td class="px-4 py-2.5 text-gray-400 truncate">${escapeHtml(r.origin || '')}</td>
                    <td class="telescope-row-copy-cell px-4 py-2.5 whitespace-nowrap" data-label="">
                        <button type="button" onclick='event.stopPropagation(); copyToClipboard(JSON.stringify(${rowJson}, null, 2), this)' class="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-800 hover:bg-cyan-900/60 text-gray-400 hover:text-cyan-300 border border-gray-700 hover:border-cyan-800/80 transition cursor-pointer" title="Copy this error to clipboard" aria-label="Copy this error">
                            <svg class="icon w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        if (paginationEl) {
            const rangeStart = startIdx + 1;
            const rangeEnd = Math.min(startIdx + LOGS_PAGE_SIZE, filtered.length);
            paginationEl.innerHTML = `
                <div class="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-800 text-[11px] font-sans text-gray-400">
                    <span>Showing ${rangeStart}-${rangeEnd} of ${filtered.length}</span>
                    <div class="flex items-center gap-2">
                        <button type="button" onclick="changeLogsPage(-1)" ${currentLogsPage <= 1 ? 'disabled' : ''} class="px-3 py-1.5 min-h-[2.25rem] rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 border border-gray-700 transition cursor-pointer font-semibold">&lsaquo; Prev</button>
                        <span class="px-1 font-semibold text-gray-300 whitespace-nowrap">Page ${currentLogsPage} / ${totalPages}</span>
                        <button type="button" onclick="changeLogsPage(1)" ${currentLogsPage >= totalPages ? 'disabled' : ''} class="px-3 py-1.5 min-h-[2.25rem] rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 border border-gray-700 transition cursor-pointer font-semibold">Next &rsaquo;</button>
                    </div>
                </div>
            `;
        }
    }

    async function resetLogs() {
        if (!confirm('Clear all Telescope logs and reset to defaults?\n\n(This clears requests/php/sql/js/telegram/security/404 debug logs. Login Portal and Staff Activity are real audit history and are not affected.)')) {
            return;
        }
        localStorage.removeItem(LS_KEY);
        try {
            const res = await fetch('index.php?action=reset_logs', { method: 'POST' });
            const data = await res.json();
            if (data.status !== 'success') {
                console.warn('Server-side log reset failed:', data.message);
            }
        } catch (e) {
            console.warn('Server-side log reset request failed:', e);
        }
        loadPortalLogs();
    }

    async function copyVisibleErrors(btnEl) {
        const logs = window.currentVisibleLogs || [];
        if (!logs.length) {
            if (btnEl) {
                const label = btnEl.querySelector('span') || btnEl;
                const originalText = label.innerText;
                label.innerText = 'No visible errors to copy';
                setTimeout(() => { label.innerText = originalText; }, 1500);
            }
            return;
        }

        const searchVal = document.getElementById('searchInput')?.value || '';
        const timeframeVal = document.getElementById('timeframeSelect')?.value || 'today';

        const header = [
            `=== TELESCOPE LOGS EXPORT ===`,
            `Portal: ${activePortal.toUpperCase()} | Total Visible Count: ${logs.length}`,
            `Search Term: ${searchVal || 'None'} | Timeframe: ${timeframeVal}`,
            `Exported At: ${new Date().toLocaleString()}`,
            `====================================\n`
        ].join('\n');

        const formattedEntries = logs.map((log, index) => {
            const severity = (log.severity || 'LOG').toUpperCase();
            const timestamp = log.timestamp || 'N/A';
            const origin = log.origin || log.user || 'Unknown Origin';
            const message = log.msg || log.action || 'No message text';

            let extraInfo = '';
            if (log.trace) {
                extraInfo = `\nStack Trace:\n${log.trace}`;
            } else if (log.details && typeof log.details === 'object' && Object.keys(log.details).length > 0) {
                extraInfo = `\nDetails:\n${JSON.stringify(log.details, null, 2)}`;
            } else if (log.extra && typeof log.extra === 'object' && Object.keys(log.extra).length > 0) {
                extraInfo = `\nExtra Payload:\n${JSON.stringify(log.extra, null, 2)}`;
            }

            return `[${index + 1}/${logs.length}] ${timestamp} | [${severity}] | ${origin}\nMessage: ${message}${extraInfo}`;
        }).join('\n\n--------------------------------------------------\n\n');

        const fullExport = `${header}\n${formattedEntries}`;
        await copyToClipboard(fullExport, btnEl);
    }

    // 1-tap copy buttons (roadmap item 1's bottom-sheet sub-point). "Stack
    // Trace" only appears when this specific log entry actually has one
    // (PHP fatals/exceptions carry `trace` - see logger.php's exception
    // handler - most other log types don't, so the button would just copy
    // nothing useful for them). "Copy Full Payload" always appears - the
    // complete JSON of every field this entry has, which is the more useful
    // "give me everything" action anyway when field names vary by log type.
    async function copyToClipboard(text, btnEl) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            // Clipboard API needs a secure context/permission - fall back to
            // a hidden textarea + execCommand so this still works on an
            // older mobile browser or a plain-HTTP dev environment.
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (e2) {}
            document.body.removeChild(ta);
        }
        if (btnEl) {
            const original = btnEl.textContent;
            btnEl.textContent = 'Copied!';
            btnEl.disabled = true;
            setTimeout(() => { btnEl.textContent = original; btnEl.disabled = false; }, 1500);
        }
    }

    function buildCopyButtonsHtml(logObj) {
        const btnClass = 'flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition border border-gray-700 cursor-pointer text-[11px] font-sans font-semibold';
        let html = '';
        if (logObj.trace) {
            html += `<button type="button" class="${btnClass}" data-copy-role="trace">📋 Copy Stack Trace</button>`;
        }
        html += `<button type="button" class="${btnClass}" data-copy-role="payload">📋 Copy Full Payload</button>`;
        return html;
    }

    function openModal(logObj) {
        document.getElementById('modalTitle').innerText = `Event ID #${logObj.id || logObj.request_id || ''}`;
        let html = '';
        for (const [key, val] of Object.entries(logObj)) {
            if (val !== null && val !== '') {
                const displayVal = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
                html += `<div><span class="text-gray-500 font-sans uppercase text-[10px] block mb-1">${key}:</span><div class="bg-gray-950 p-2 rounded border border-gray-800 text-gray-200">${escapeHtml(displayVal)}</div></div>`;
            }
        }
        document.getElementById('modalContent').innerHTML = html;

        const copyRow = document.getElementById('modalCopyRow');
        copyRow.innerHTML = buildCopyButtonsHtml(logObj);
        copyRow.querySelectorAll('[data-copy-role]').forEach(btn => {
            btn.addEventListener('click', () => {
                const text = btn.dataset.copyRole === 'trace' ? String(logObj.trace) : JSON.stringify(logObj, null, 2);
                copyToClipboard(text, btn);
            });
        });

        const modal = document.getElementById('detailModal');
        modal.classList.remove('hidden');
        // Slide-up animation: the transition is on #detailModalSheet's
        // transform (see the mobile CSS), triggered by adding .open - has to
        // happen on the NEXT frame, not the same one .hidden was removed on,
        // or the browser coalesces both style changes into one paint and the
        // transition never fires (the sheet would just appear instantly).
        requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('open')));
    }

    function closeModal() {
        const modal = document.getElementById('detailModal');
        modal.classList.remove('open');
        // Let the slide-down transition finish before actually hiding
        // (display:none) - matches the CSS transition duration (280ms) with
        // a little headroom. Only applies visually on mobile (the sheet
        // transform); harmless no-op delay on desktop's centered modal.
        setTimeout(() => modal.classList.add('hidden'), 300);
    }

    function escapeHtml(str) {
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function togglePollingMode() {
        const isChecked = document.getElementById('livePollingToggle').checked;
        if (isChecked) {
            pollingIntervalToken = setInterval(loadPortalLogs, 4000);
        } else {
            clearInterval(pollingIntervalToken);
        }
    }

    window.addEventListener('telescope_log_added', () => loadPortalLogs());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

    // ---- Web Push (added 22 Aug 2026) ----
    // "Enable Alerts" registers this page's own dedicated service worker
    // (sw-telescope.js, scoped to /php/errors/ - separate from the main
    // app's sw.js) and subscribes it to push via the VAPID public key the
    // backend generates/serves. Real notifications arrive even if this tab
    // isn't open, as long as the Telescope PWA has been installed at least
    // once (required on iOS Safari; Chrome/Android/desktop work without
    // installing too, but installing makes delivery far more reliable
    // everywhere since the browser doesn't need to keep a tab process alive).
    let swRegistration = null;

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
        return outputArray;
    }

    async function initPush() {
        const btn = document.getElementById('pushToggleBtn');
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            if (btn) {
                btn.disabled = true;
                btn.title = 'Push notifications are not supported in this browser';
                btn.classList.add('opacity-50', 'cursor-not-allowed');
            }
            return;
        }
        try {
            swRegistration = await navigator.serviceWorker.register('sw-telescope.js', { scope: './' });
        } catch (e) {
            console.warn('Telescope service worker registration failed:', e);
            return;
        }
        const existing = await swRegistration.pushManager.getSubscription();
        updatePushButton(!!existing);
    }

    function updatePushButton(isSubscribed) {
        const label = document.getElementById('pushBtnLabel');
        const btn = document.getElementById('pushToggleBtn');
        if (!label || !btn) return;
        label.textContent = isSubscribed ? 'Alerts On' : 'Enable Alerts';
        btn.classList.toggle('border-emerald-600', isSubscribed);
        btn.classList.toggle('text-emerald-400', isSubscribed);

        let testBtn = document.getElementById('pushTestBtn');
        if (isSubscribed && !testBtn) {
            testBtn = document.createElement('button');
            testBtn.id = 'pushTestBtn';
            testBtn.textContent = 'Send Test';
            testBtn.title = 'Send a test push notification to every subscribed device';
            testBtn.className = 'text-cyan-400 hover:text-cyan-300 underline text-[11px] cursor-pointer';
            testBtn.onclick = sendTestPush;
            btn.insertAdjacentElement('afterend', testBtn);
        } else if (!isSubscribed && testBtn) {
            testBtn.remove();
        }
    }

    async function togglePushSubscription() {
        if (!swRegistration) {
            alert('Push is not ready yet - try again in a moment.');
            return;
        }
        const existing = await swRegistration.pushManager.getSubscription();
        if (existing) {
            await existing.unsubscribe();
            await fetch('index.php?action=delete_push_subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: existing.endpoint }),
            });
            updatePushButton(false);
            return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            alert('Notification permission was not granted.');
            return;
        }

        const res = await fetch('index.php?action=get_vapid_public_key');
        const data = await res.json();
        if (!data || !data.publicKey) {
            alert('Could not fetch the push key from the server.');
            return;
        }

        let subscription;
        try {
            subscription = await swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(data.publicKey),
            });
        } catch (e) {
            alert('Could not subscribe to push notifications: ' + e.message);
            return;
        }

        await fetch('index.php?action=save_push_subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: subscription.toJSON() }),
        });

        updatePushButton(true);
    }

    async function sendTestPush() {
        const res = await fetch('index.php?action=send_test_push', { method: 'POST' });
        const data = await res.json();
        alert(data.message || (data.status === 'success' ? 'Test push sent.' : 'Failed to send test push.'));
    }

    async function telescopeLogout() {
        await fetch('index.php?action=telescope_logout', { method: 'POST' });
        window.location.reload();
    }

    initPush();

    loadPortalLogs();
    togglePollingMode();
    setTimeout(() => loadPortalLogs(), 250);
    // Restore active sidebar button based on persisted portal
    document.querySelectorAll('.nav-portal-item').forEach(btn => {
        const onclick = btn.getAttribute('onclick') || '';
        if (onclick.includes(`'${activePortal}'`)) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    function updateLiveClock() {
        const el = document.getElementById('liveClock');
        if (!el) return;
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        el.textContent = `${hh}:${min}:${ss}`;
    }
    updateLiveClock();
    setInterval(updateLiveClock, 1000);
    </script>
</body>
</html>
