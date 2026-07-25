import React, { useState, useEffect } from 'react';
import {
  Radio,
  Bug,
  Database,
  Code,
  Send,
  ShieldAlert,
  Unlink,
  Search,
  RefreshCw,
  X,
  Clock,
  Terminal,
  Server,
  Trash2
} from 'lucide-react';
import { getTelescopeLogs, clearTelescopeLogs, TelescopeLogEntry } from '../utils/telescopeLogger';

interface LogEntry extends TelescopeLogEntry {}

export const TelescopeErrorCenter: React.FC = () => {
  const [activePortal, setActivePortal] = useState<string>('telegram');
  const [search, setSearch] = useState<string>('');
  const [timeframe, setTimeframe] = useState<string>('all');
  const [isLivePolling, setIsLivePolling] = useState<boolean>(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({
    requests: 0,
    php: 0,
    sql: 0,
    js: 0,
    telegram: 0,
    security: 0,
    404: 0,
  });
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    let allLogs: LogEntry[] = getTelescopeLogs();

    try {
      setErrorStatus(null);
      const res = await fetch(
        `/php/errors/index.php?action=fetch_logs&portal=${activePortal}&search=${encodeURIComponent(
          search
        )}&timeframe=${timeframe}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.logs)) {
          // Merge server logs if available
          const existingIds = new Set(allLogs.map((l) => l.id));
          for (const sLog of data.logs) {
            if (!existingIds.has(sLog.id)) {
              allLogs.push(sLog);
            }
          }
        }
      }
    } catch (err: any) {
      // Standalone client mode notice
    }

    // Compute portal counts across all logs
    const newCounts: Record<string, number> = {
      requests: 0,
      php: 0,
      sql: 0,
      js: 0,
      telegram: 0,
      security: 0,
      404: 0,
    };

    allLogs.forEach((log) => {
      const p = (log.portal || '').toLowerCase();
      if (newCounts[p] !== undefined) {
        newCounts[p]++;
      } else {
        newCounts.requests++;
      }
    });
    setCounts(newCounts);

    // Filter by active portal
    let filtered = allLogs.filter((log) => {
      const logPortal = (log.portal || '').toLowerCase();
      return logPortal === activePortal.toLowerCase();
    });

    // Filter by search term
    if (search.trim()) {
      const term = search.toLowerCase();
      filtered = filtered.filter(
        (log) =>
          (log.msg || '').toLowerCase().includes(term) ||
          (log.origin || '').toLowerCase().includes(term) ||
          (log.severity || '').toLowerCase().includes(term) ||
          JSON.stringify(log.details || {}).toLowerCase().includes(term)
      );
    }

    // Filter by timeframe
    if (timeframe !== 'all') {
      const now = new Date().getTime();
      filtered = filtered.filter((log) => {
        const logTime = new Date(log.timestamp).getTime();
        if (isNaN(logTime)) return true;
        const diffHours = (now - logTime) / (1000 * 60 * 60);
        if (timeframe === 'today') return diffHours <= 24;
        if (timeframe === 'yesterday') return diffHours > 24 && diffHours <= 48;
        if (timeframe === '7days') return diffHours <= 168;
        return true;
      });
    }

    setLogs(filtered);
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [activePortal, timeframe]);

  useEffect(() => {
    const handleLogAdded = () => {
      fetchLogs();
    };
    window.addEventListener('telescope_log_added', handleLogAdded);
    return () => window.removeEventListener('telescope_log_added', handleLogAdded);
  }, [activePortal, timeframe, search]);

  useEffect(() => {
    if (!isLivePolling) return;
    const timer = setInterval(() => {
      fetchLogs();
    }, 4000);
    return () => clearInterval(timer);
  }, [isLivePolling, activePortal, timeframe, search]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs();
  };

  const getPortalIcon = (p: string) => {
    switch (p) {
      case 'requests':
        return <Radio className="w-4 h-4 text-cyan-400" />;
      case 'php':
        return <Bug className="w-4 h-4 text-rose-400" />;
      case 'sql':
        return <Database className="w-4 h-4 text-emerald-400" />;
      case 'js':
        return <Code className="w-4 h-4 text-amber-400" />;
      case 'telegram':
        return <Send className="w-4 h-4 text-sky-400" />;
      case 'security':
        return <ShieldAlert className="w-4 h-4 text-purple-400" />;
      case '404':
        return <Unlink className="w-4 h-4 text-pink-400" />;
      default:
        return <Terminal className="w-4 h-4 text-slate-400" />;
    }
  };

  const getSeverityBadgeClass = (sev: string) => {
    const s = (sev || '').toLowerCase();
    if (s.includes('fatal') || s.includes('error') || s.includes('exception')) {
      return 'text-rose-300 bg-rose-950/80 border border-rose-800/50';
    }
    if (s.includes('warning') || s.includes('notice')) {
      return 'text-amber-300 bg-amber-950/80 border border-amber-800/50';
    }
    if (s.includes('sql') || s.includes('js') || s.includes('telegram')) {
      return 'text-cyan-300 bg-cyan-950/80 border border-cyan-800/50';
    }
    return 'text-slate-300 bg-slate-800 border border-slate-700';
  };

  const portalsList = [
    { key: 'requests', label: 'Requests Trail', icon: <Radio className="w-4 h-4 text-cyan-400" /> },
    { key: 'php', label: 'PHP Failures', icon: <Bug className="w-4 h-4 text-rose-400" /> },
    { key: 'sql', label: 'SQL Profiler', icon: <Database className="w-4 h-4 text-emerald-400" /> },
    { key: 'js', label: 'JS Browser', icon: <Code className="w-4 h-4 text-amber-400" /> },
    { key: 'telegram', label: 'Telegram API', icon: <Send className="w-4 h-4 text-sky-400" /> },
    { key: 'security', label: 'Security Audits', icon: <ShieldAlert className="w-4 h-4 text-purple-400" /> },
    { key: '404', label: '404 Sentinel', icon: <Unlink className="w-4 h-4 text-pink-400" /> },
  ];

  return (
    <div className="bg-[#0b0f19] text-slate-100 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden font-mono min-h-[600px] flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#0f172a] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-wider uppercase flex items-center gap-2">
              Telescope Error Center
              <span className="bg-cyan-950 text-cyan-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-cyan-800">
                Independent Filesystem Storage
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 font-sans tracking-wider">
              Zero-Database Log Stream (Captures PHP, JS & API exceptions even when MySQL is offline)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-sans">
          <button
            onClick={() => {
              if (confirm('Clear all Telescope logs and reset to defaults?')) {
                clearTelescopeLogs();
                fetchLogs();
              }
            }}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition border border-slate-700 cursor-pointer"
            title="Clear and reset Telescope logs"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Reset Logs</span>
          </button>

          <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white transition">
            <input
              type="checkbox"
              checked={isLivePolling}
              onChange={(e) => setIsLivePolling(e.target.checked)}
              className="accent-cyan-500 rounded cursor-pointer"
            />
            <span className="flex items-center gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${isLivePolling ? 'animate-spin text-cyan-400' : 'text-slate-500'}`} />
              Live Polling
            </span>
          </label>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar Portals */}
        <aside className="w-64 border-r border-slate-800 bg-[#0f172a]/60 p-4 flex flex-col gap-6 flex-shrink-0">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2 font-sans">
              Timeframe Filter
            </label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:border-cyan-500 transition font-sans cursor-pointer"
            >
              <option value="all">All Time (Default)</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7days">Last 7 Days</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2 font-sans">
              Category Portals
            </label>
            <nav className="space-y-1 font-sans text-xs">
              {portalsList.map((portal) => {
                const isActive = activePortal === portal.key;
                return (
                  <button
                    key={portal.key}
                    onClick={() => setActivePortal(portal.key)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition ${
                      isActive
                        ? 'bg-slate-800/90 border-l-4 border-cyan-400 text-cyan-300 font-semibold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      {portal.icon}
                      {portal.label}
                    </span>
                    <span className="px-2 py-0.5 text-[10px] rounded-full bg-slate-900 border border-slate-800 text-slate-300 font-mono">
                      {counts[portal.key] || 0}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Right Content Table */}
        <main className="flex-1 flex flex-col p-6 overflow-hidden bg-[#0b0f19]">
          {errorStatus && (
            <div className="mb-3 px-4 py-2 bg-amber-950/60 border border-amber-800/50 text-amber-300 text-xs rounded-lg flex items-center gap-2">
              <Server className="w-4 h-4 text-amber-400" />
              <span>{errorStatus}</span>
            </div>
          )}

          {/* Search bar */}
          <form onSubmit={handleSearchSubmit} className="mb-4 flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search system logs by route, severity, keywords, exception stack or IP..."
                className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-4 py-2.5 outline-none focus:border-cyan-500 transition font-sans"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-sans text-xs font-semibold rounded-xl border border-slate-700 transition"
            >
              Filter
            </button>
          </form>

          {/* Logs Table */}
          <div className="flex-1 bg-slate-900/60 border border-slate-800 rounded-xl overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-800/80 text-slate-400 font-sans border-b border-slate-800 sticky top-0 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3 w-40">Timestamp</th>
                  <th className="px-4 py-3 w-32">Severity</th>
                  <th className="px-4 py-3">Log Message</th>
                  <th className="px-4 py-3 w-64">Origin Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-slate-500 italic font-sans">
                      No events recorded in this category portal.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-slate-800/50 transition cursor-pointer"
                    >
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{log.timestamp}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getSeverityBadgeClass(log.severity)}`}>
                          {log.severity || 'LOG'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-200 font-mono truncate max-w-md">{log.msg}</td>
                      <td className="px-4 py-3 text-slate-400 font-sans truncate">{log.origin}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-6"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col p-6 text-xs text-slate-200 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                {getPortalIcon(selectedLog.portal)}
                Log Event Details #{selectedLog.id?.substring(0, 8)}
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="w-7 h-7 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto font-mono text-slate-300 space-y-4 whitespace-pre-wrap break-all pr-2">
              {Object.entries(selectedLog).map(([key, value]) => {
                if (value === null || value === '') return null;
                return (
                  <div key={key}>
                    <span className="text-slate-500 font-sans uppercase text-[10px] font-bold block mb-1">
                      {key}:
                    </span>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-200">
                      {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
