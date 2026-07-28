<?php
/**
 * Telescope Error Center - Independent File-Based Dashboard & API
 * Works without database or MySQL server dependency
 */

require_once __DIR__ . '/logger.php';

// Handle API requests
$action = $_GET['action'] ?? $_POST['action'] ?? null;

if ($action === 'fetch_logs' || $action === 'log_event' || (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false)) {
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

    if ($action === 'log_event') {
        $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
        $portalInput = $input['portal'] ?? 'js';
        $severityInput = $input['severity'] ?? 'JS Exception';
        $msgInput = $input['msg'] ?? 'Client Error';
        $originInput = $input['origin'] ?? 'Browser Client';
        $extraData = $input['extra'] ?? [];

        TelescopeLogger::log($portalInput, $severityInput, $msgInput, $originInput, $extraData);

        echo json_encode(['status' => 'success', 'message' => 'Log entry captured successfully']);
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
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Telescope Error Center</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body { background-color: #0b0f19; color: #f3f4f6; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #111827; }
        ::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }
        .nav-portal-item.active { background-color: #1f2937; border-left: 3px solid #06b6d4; color: #38bdf8; }
    </style>
</head>
<body class="min-h-screen flex flex-col">

    <header class="border-b border-gray-800 bg-[#0f172a] px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <i class="fa-solid fa-radar text-base animate-pulse"></i>
            </div>
            <div>
                <h1 class="text-base font-bold text-white tracking-wider uppercase">Telescope Error Center</h1>
                <p class="text-[10px] text-gray-400 font-sans tracking-widest uppercase">Database-Independent Development Console</p>
            </div>
        </div>
        <div class="flex items-center gap-4 text-xs font-sans">
            <button onclick="resetLogs()" class="flex items-center gap-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition border border-gray-700 cursor-pointer" title="Clear and reset Telescope logs">
                <i class="fa-solid fa-trash text-red-400 text-[11px]"></i>
                <span>Reset Logs</span>
            </button>
            <label class="flex items-center gap-2 cursor-pointer text-gray-300 hover:text-white transition">
                <input type="checkbox" id="livePollingToggle" checked onchange="togglePollingMode()" class="accent-cyan-500 rounded cursor-pointer">
                <span class="flex items-center gap-1.5">
                    <i class="fa-solid fa-sync text-[11px]" id="pollingIcon"></i>
                    Live Polling
                </span>
            </label>
            <a href="../../index.php" class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-md font-semibold transition border border-gray-700">
                &larr; Back to App
            </a>
        </div>
    </header>

    <div class="flex-1 flex overflow-hidden">
        <aside class="w-64 border-r border-gray-800 bg-[#0f172a]/50 p-4 flex flex-col gap-6 flex-shrink-0">
            <div>
                <label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2 font-sans">Timeframe Filter</label>
                <select id="timeframeSelect" onchange="onTimeframeChange()" class="w-full bg-gray-900 border border-gray-800 text-gray-300 text-xs rounded-lg p-2 outline-none font-sans">
                    <option value="all" selected>All Time (Default)</option>
                    <option value="today">Today</option>
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
                <label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2 font-sans">Category Portals</label>
                <nav class="space-y-1 font-sans text-xs">
                    <button onclick="switchPortal('requests', this)" class="nav-portal-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition active">
                        <span class="flex items-center gap-2.5"><i class="fa-solid fa-network-wired text-cyan-400 w-4"></i>Requests Trail</span>
                        <span id="badge-requests" class="px-2 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-300 font-mono">0</span>
                    </button>
                    
                    <button onclick="switchPortal('php', this)" class="nav-portal-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition">
                        <span class="flex items-center gap-2.5"><i class="fa-solid fa-bug text-red-400 w-4"></i>PHP Failures</span>
                        <span id="badge-php" class="px-2 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-300 font-mono">0</span>
                    </button>

                    <button onclick="switchPortal('sql', this)" class="nav-portal-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition">
                        <span class="flex items-center gap-2.5"><i class="fa-solid fa-database text-emerald-400 w-4"></i>SQL Profiler</span>
                        <span id="badge-sql" class="px-2 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-300 font-mono">0</span>
                    </button>

                    <button onclick="switchPortal('js', this)" class="nav-portal-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition">
                        <span class="flex items-center gap-2.5"><i class="fa-solid fa-code text-amber-400 w-4"></i>JS Browser</span>
                        <span id="badge-js" class="px-2 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-300 font-mono">0</span>
                    </button>

                    <button onclick="switchPortal('telegram', this)" class="nav-portal-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition">
                        <span class="flex items-center gap-2.5"><i class="fa-solid fa-paper-plane text-sky-400 w-4"></i>Telegram API</span>
                        <span id="badge-telegram" class="px-2 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-300 font-mono">0</span>
                    </button>

                    <button onclick="switchPortal('security', this)" class="nav-portal-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition">
                        <span class="flex items-center gap-2.5"><i class="fa-solid fa-shield-halved text-purple-400 w-4"></i>Security Audits</span>
                        <span id="badge-security" class="px-2 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-300 font-mono">0</span>
                    </button>

                    <button onclick="switchPortal('404', this)" class="nav-portal-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition">
                        <span class="flex items-center gap-2.5"><i class="fa-solid fa-link-slash text-rose-400 w-4"></i>404 Sentinel</span>
                        <span id="badge-404" class="px-2 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-300 font-mono">0</span>
                    </button>

                    <button onclick="switchPortal('audit', this)" class="nav-portal-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition">
                        <span class="flex items-center gap-2.5"><i class="fa-solid fa-clipboard-list text-teal-400 w-4"></i>Audit Trail</span>
                        <span id="badge-audit" class="px-2 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-300 font-mono">0</span>
                    </button>

                    <button onclick="switchPortal('login', this)" class="nav-portal-item w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition">
                        <span class="flex items-center gap-2.5"><i class="fa-solid fa-lock text-orange-400 w-4"></i>Login Portal</span>
                        <span id="badge-login" class="px-2 py-0.5 text-[10px] rounded-full bg-gray-800 text-gray-300 font-mono">0</span>
                    </button>
                </nav>
            </div>
        </aside>

        <main class="flex-1 flex flex-col p-6 overflow-hidden">
            <div class="mb-4 flex items-center gap-4">
                <div class="relative flex-1">
                    <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-3 text-gray-500 text-xs"></i>
                    <input type="text" id="searchInput" oninput="loadPortalLogs()" placeholder="Search system logs by route, severity, keywords, trace parameters or IP..." class="w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded-xl pl-9 pr-4 py-2.5 outline-none focus:border-cyan-500 transition font-sans">
                </div>
            </div>

            <div class="flex-1 bg-gray-900/60 border border-gray-800 rounded-xl overflow-y-auto">
                <table class="w-full text-xs text-left">
                    <thead class="bg-gray-800/60 text-gray-400 font-sans border-b border-gray-800 sticky top-0 uppercase text-[10px] tracking-wider">
                        <tr>
                            <th class="px-4 py-3 w-40">Timestamp</th>
                            <th class="px-4 py-3 w-28">Severity</th>
                            <th class="px-4 py-3">Log Message</th>
                            <th class="px-4 py-3 w-72">User / Origin Location</th>
                        </tr>
                    </thead>
                    <tbody id="logsTableBody" class="divide-y divide-gray-800/50">
                    </tbody>
                </table>
            </div>
        </main>
    </div>

    <div id="detailModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6 hidden" onclick="closeModal()">
        <div class="bg-gray-900 border border-gray-800 rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col p-6 text-xs" onclick="event.stopPropagation()">
            <div class="flex items-center justify-between border-b border-gray-800 pb-3 mb-4">
                <h3 class="font-bold text-white text-sm" id="modalTitle">Log Event Detail</h3>
                <button onclick="closeModal()" class="text-gray-400 hover:text-white text-base">✕</button>
            </div>
            <div id="modalContent" class="overflow-y-auto font-mono text-gray-300 space-y-4 whitespace-pre-wrap break-all">
            </div>
        </div>
    </div>

    <script>
    const LS_KEY = 'telescope_system_logs';
    let activePortal = 'requests';
    let pollingIntervalToken = null;

    function getClientLogs() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) { return []; }
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
        loadPortalLogs();
    }

    async function loadPortalLogs() {
        const search = document.getElementById('searchInput').value;
        const timeframe = document.getElementById('timeframeSelect').value;
        const dateFrom = document.getElementById('dateFromInput').value;
        const dateTo = document.getElementById('dateToInput').value;
        const tbody = document.getElementById('logsTableBody');
        let allLogs = getClientLogs();

        try {
            const params = new URLSearchParams({ action: 'fetch_logs', portal: activePortal, search, timeframe });
            if (dateFrom) params.set('date_from', dateFrom);
            if (dateTo) params.set('date_to', dateTo);
            const res = await fetch(`index.php?${params.toString()}`);
            const data = await res.json();

            if (data.status === 'success' && Array.isArray(data.logs)) {
                const existingIds = new Set(allLogs.map(l => l.id));
                for (const sLog of data.logs) {
                    if (!existingIds.has(sLog.id)) allLogs.push(sLog);
                }
            }
        } catch (e) {}

        // Fetch audit_logs from DB for the audit portal
        if (activePortal === 'audit') {
            try {
                const aRes = await fetch(`../api/router.php?action=get_audit_logs`);
                const aData = await aRes.json();
                if (Array.isArray(aData.data)) {
                    const auditLogs = aData.data.map(l => ({
                        id: `audit-${l.id}`,
                        portal: 'audit',
                        severity: l.status === 'Failed' ? 'Warning' : 'Info',
                        msg: l.action,
                        origin: l.user || 'System',
                        timestamp: l.timestamp,
                        details: { browser: l.browser, os: l.os, device_type: l.device_type, ip_address: l.ip_address, user_agent: l.user_agent, status: l.status, module: l.module }
                    }));
                    const existingIds = new Set(allLogs.map(l => l.id));
                    for (const al of auditLogs) {
                        if (!existingIds.has(al.id)) allLogs.push(al);
                    }
                }
            } catch (e) {}
        }

        if (activePortal === 'login') {
            try {
                const aRes = await fetch(`../api/router.php?action=get_audit_logs`);
                const aData = await aRes.json();
                if (Array.isArray(aData.data)) {
                    const loginLogs = aData.data.filter(l => l.module === 'login');
                    const existingIds = new Set(allLogs.map(l => l.id));
                    for (const al of loginLogs) {
                        if (!existingIds.has(al.id)) {
                            allLogs.push({
                                id: `login-${al.id}`, portal: 'login',
                                severity: al.status === 'Failed' ? 'Warning' : 'Info',
                                msg: al.action, origin: al.user,
                                timestamp: al.timestamp,
                                details: { browser: al.browser, os: al.os, device_type: al.device_type, ip_address: al.ip_address, user_agent: al.user_agent, status: al.status }
                            });
                        }
                    }
                }
            } catch (e) {}
        }

        const counts = { requests: 0, php: 0, sql: 0, js: 0, telegram: 0, security: 0, 404: 0, audit: 0, login: 0 };
        allLogs.forEach(l => {
            const p = (l.portal || '').toLowerCase();
            if (counts[p] !== undefined) counts[p]++;
            else counts.requests++;
        });
        for (const [key, count] of Object.entries(counts)) {
            const badge = document.getElementById(`badge-${key}`);
            if (badge) badge.innerText = count;
        }

        let filtered = allLogs.filter(l => (l.portal || '').toLowerCase() === activePortal.toLowerCase());

        if (search.trim()) {
            const term = search.toLowerCase();
            filtered = filtered.filter(l =>
                (l.msg || '').toLowerCase().includes(term) ||
                (l.origin || '').toLowerCase().includes(term) ||
                (l.severity || '').toLowerCase().includes(term) ||
                JSON.stringify(l.details || {}).toLowerCase().includes(term)
            );
        }

        // Client-side date filtering for localStorage logs and audit/login portal data
        if (timeframe !== 'all' && timeframe !== 'custom') {
            const now = Date.now();
            filtered = filtered.filter(l => {
                const t = new Date(l.timestamp).getTime();
                if (isNaN(t)) return true;
                const h = (now - t) / 3600000;
                if (timeframe === 'today') return h <= 24;
                if (timeframe === 'yesterday') return h > 24 && h <= 48;
                if (timeframe === '7days') return h <= 168;
                return true;
            });
        }

        if (timeframe === 'custom' && (dateFrom || dateTo)) {
            filtered = filtered.filter(l => {
                if (!l.timestamp) return true;
                const logDate = l.timestamp.split(' ')[0].split('T')[0];
                if (dateFrom && logDate < dateFrom) return false;
                if (dateTo && logDate > dateTo) return false;
                return true;
            });
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-gray-500 italic">No events recorded for this selection.</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(r => {
            let sevClass = 'text-gray-400 bg-gray-800';
            const sev = (r.severity || '').toLowerCase();
            if (sev.includes('fatal') || sev.includes('error') || sev.includes('exception')) sevClass = 'text-red-400 bg-red-950/60 border border-red-800/40';
            else if (sev.includes('warning') || sev.includes('notice')) sevClass = 'text-amber-400 bg-amber-950/60 border border-amber-800/40';
            else if (sev.includes('sql') || sev.includes('js') || sev.includes('telegram')) sevClass = 'text-cyan-400 bg-cyan-950/60 border border-cyan-800/40';
            else if (sev.includes('info') || sev.includes('success')) sevClass = 'text-teal-400 bg-teal-950/60 border border-teal-800/40';

            const rowJson = escapeHtml(JSON.stringify(r));
            return `
                <tr class="hover:bg-gray-800/40 transition cursor-pointer" onclick='openModal(${rowJson})'>
                    <td class="px-4 py-2.5 text-gray-500 whitespace-nowrap">${r.timestamp || ''}</td>
                    <td class="px-4 py-2.5 whitespace-nowrap">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${sevClass}">${r.severity || 'LOG'}</span>
                    </td>
                    <td class="px-4 py-2.5 text-gray-200 truncate max-w-md">${escapeHtml(r.msg || '')}</td>
                    <td class="px-4 py-2.5 text-gray-400 truncate">${escapeHtml(r.origin || '')}</td>
                </tr>
            `;
        }).join('');
    }

    function resetLogs() {
        if (confirm('Clear all Telescope logs and reset to defaults?')) {
            localStorage.removeItem(LS_KEY);
            loadPortalLogs();
        }
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
        document.getElementById('detailModal').classList.remove('hidden');
    }

    function closeModal() {
        document.getElementById('detailModal').classList.add('hidden');
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

    loadPortalLogs();
    togglePollingMode();
    </script>
</body>
</html>
