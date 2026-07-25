<?php
/**
 * Telescope Error Center - Independent File-Based Dashboard & API
 * Works without database or MySQL server dependency
 */

require_once __DIR__ . '/logger.php';

// Handle API requests
$action = $_GET['action'] ?? $_POST['action'] ?? null;

if ($action === 'fetch_logs' || isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false) {
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

    $data = TelescopeLogger::getLogs($portal, $search, $timeframe);
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
            <label class="flex items-center gap-2 cursor-pointer text-gray-300">
                <input type="checkbox" id="livePollingToggle" checked onchange="togglePollingMode()" class="accent-cyan-500 rounded">
                <span>Live Polling</span>
            </label>
            <a href="../../index.php" class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-md font-semibold transition border border-gray-700">
                ← POS Home
            </a>
        </div>
    </header>

    <div class="flex-1 flex overflow-hidden">
        <aside class="w-64 border-r border-gray-800 bg-[#0f172a]/50 p-4 flex flex-col gap-6 flex-shrink-0">
            <div>
                <label class="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2 font-sans">Timeframe Filter</label>
                <select id="timeframeSelect" onchange="loadPortalLogs()" class="w-full bg-gray-900 border border-gray-800 text-gray-300 text-xs rounded-lg p-2 outline-none font-sans">
                    <option value="all" selected>All Time (Default)</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="7days">Last 7 Days</option>
                </select>
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
    let activePortal = 'requests';
    let pollingIntervalToken = null;

    function switchPortal(portalName, buttonEl) {
        document.querySelectorAll('.nav-portal-item').forEach(el => el.classList.remove('active'));
        if (buttonEl) buttonEl.classList.add('active');
        activePortal = portalName;
        loadPortalLogs();
    }

    async function loadPortalLogs() {
        const search = document.getElementById('searchInput').value;
        const timeframe = document.getElementById('timeframeSelect').value;
        const tbody = document.getElementById('logsTableBody');
        
        try {
            const res = await fetch(`index.php?action=fetch_logs&portal=${activePortal}&search=${encodeURIComponent(search)}&timeframe=${timeframe}`);
            const data = await res.json();
            
            if (data.status === 'success') {
                if (data.counts) {
                    for (const [key, count] of Object.entries(data.counts)) {
                        const badge = document.getElementById(`badge-${key}`);
                        if (badge) badge.innerText = count;
                    }
                }
                
                if (data.logs.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-gray-500 italic">No events recorded for this selection.</td></tr>`;
                    return;
                }
                
                tbody.innerHTML = data.logs.map(r => {
                    let sevClass = 'text-gray-400 bg-gray-800';
                    const sev = (r.severity || '').toLowerCase();
                    if (sev.includes('fatal') || sev.includes('error') || sev.includes('exception')) sevClass = 'text-red-400 bg-red-950/60 border border-red-800/40';
                    else if (sev.includes('warning') || sev.includes('notice')) sevClass = 'text-amber-400 bg-amber-950/60 border border-amber-800/40';
                    else if (sev.includes('sql') || sev.includes('js') || sev.includes('telegram')) sevClass = 'text-cyan-400 bg-cyan-950/60 border border-cyan-800/40';

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
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-red-400 italic">Failed to communicate with Telescope log stream.</td></tr>`;
        }
    }

    function openModal(logObj) {
        document.getElementById('modalTitle').innerText = `Event ID #${logObj.id || logObj.request_id || ''}`;
        let html = '';
        for (const [key, val] of Object.entries(logObj)) {
            if (val !== null && val !== '') {
                html += `<div><span class="text-gray-500 font-sans uppercase text-[10px] block">${key}:</span><div class="bg-gray-950 p-2 rounded border border-gray-800 mt-1 text-gray-200">${escapeHtml(String(val))}</div></div>`;
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
            pollingIntervalToken = setInterval(loadPortalLogs, 5000);
        } else {
            clearInterval(pollingIntervalToken);
        }
    }

    loadPortalLogs();
    togglePollingMode();
    </script>
</body>
</html>
