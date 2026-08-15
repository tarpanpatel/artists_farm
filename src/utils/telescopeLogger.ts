import { API_ROOT_BASE } from '../services/api';

export interface TelescopeLogEntry {
  id: string;
  portal: 'requests' | 'php' | 'sql' | 'js' | 'telegram' | 'security' | '404' | string;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'CRITICAL' | string;
  msg: string;
  origin: string;
  timestamp: string;
  execution_time?: string;
  memory_usage?: string;
  ip?: string;
  user_agent?: string;
  details?: Record<string, any>;
}

const STORAGE_KEY = 'telescope_system_logs';

export function getTelescopeLogs(): TelescopeLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeds = getInitialSeedLogs();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
      return seeds;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : getInitialSeedLogs();
  } catch (err) {
    return getInitialSeedLogs();
  }
}

export function recordTelescopeLog(
  entry: Omit<TelescopeLogEntry, 'id' | 'timestamp'> & { timestamp?: string }
): TelescopeLogEntry {
  // Belt-and-suspenders: this function must NEVER throw to its caller, no matter what -
  // logging a telescope event should never be able to break the feature that triggered it.
  try {
    const currentLogs = getTelescopeLogs();
    const now = new Date();
    const formattedTime = entry.timestamp || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const newLog: TelescopeLogEntry = {
      id: `tel-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: formattedTime,
      execution_time: entry.execution_time || `${(Math.random() * 35 + 8).toFixed(1)}ms`,
      memory_usage: entry.memory_usage || '2.4 MB',
      ip: entry.ip || '127.0.0.1 (Local Environment)',
      user_agent: entry.user_agent || (typeof navigator !== 'undefined' ? navigator.userAgent : 'ArtistsFarmApp/1.0'),
      ...entry,
    };

    const updated = [newLog, ...currentLogs].slice(0, 300);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to write to localStorage for Telescope log:', e);
    }

    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('telescope_log_added', { detail: newLog }));
      } catch (e) {
        console.warn('Telescope log_added event dispatch failed:', e);
      }
    }

    // Best-effort mirror to server-side logs.json so the standalone PHP dashboard also
    // shows logs. Uses the same route-independent base path api.ts resolves, so this
    // works correctly regardless of which page/route triggered the log (root_dashboard,
    // tenant_dashboard, any property/room route, etc). Entirely fire-and-forget: the
    // local log above has already succeeded by this point regardless of what happens here.
    //
    // A real-world gap confirmed 15 Aug 2026: a genuine crash (the circular i18n import
    // stack overflow) logged fine to this browser's localStorage but never reached
    // logs.json at all - the badge that's supposed to surface it server-side stayed at
    // 0. The suspected cause is exactly the scenario `fetch` handles worst: an error
    // that's actively tearing the page down (crash loop, HMR reload, tab close) aborts
    // an in-flight fetch before it lands. `sendBeacon` exists specifically for "fire
    // this on the way out" and survives page unload where fetch does not - use it as
    // the primary transport, falling back to fetch (still keepalive) only when
    // sendBeacon is unavailable or the browser rejects the send outright.
    try {
      const payload = JSON.stringify({
        portal: newLog.portal,
        severity: newLog.severity,
        msg: newLog.msg,
        origin: newLog.origin,
        extra: newLog.details || {},
      });
      const url = `${API_ROOT_BASE}/php/errors/index.php?action=log_event`;

      let sent = false;
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        try {
          // application/json Blob, not a raw string - a plain string send defaults to
          // text/plain, which is harmless here (PHP reads php://input regardless of
          // Content-Type) but the Blob form is the documented/correct way to send JSON.
          sent = navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
        } catch (err) {
          sent = false;
        }
      }

      if (!sent) {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: payload,
          keepalive: true,
        }).then((resp) => {
          if (!resp.ok) {
            resp.text().then((text) => {
              console.warn('Telescope log_event failed:', resp.status, text);
            }).catch(() => {
              console.warn('Telescope log_event failed:', resp.status);
            });
          }
        }).catch((err) => {
          console.warn('Telescope log_event network error:', err);
        });
      }
    } catch (err) {
      console.warn('Telescope log_event setup error:', err);
    }

    return newLog;
  } catch (err) {
    console.error('Telescope logging failed unexpectedly (non-fatal, feature continues normally):', err);
    // Still return a well-formed entry so callers that use the return value never crash.
    return {
      id: `tel-fallback-${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      portal: entry.portal,
      severity: entry.severity,
      msg: entry.msg,
      origin: entry.origin,
    };
  }
}

function getInitialSeedLogs(): TelescopeLogEntry[] {
  const now = new Date();
  const timeStr = (offsetMs: number) => {
    const d = new Date(now.getTime() - offsetMs);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  return [
    {
      id: 'tel-seed-01',
      portal: 'telegram',
      severity: 'SUCCESS',
      msg: 'POST https://api.telegram.org/bot8999394059:AAHG.../sendMessage - Status 200 OK',
      origin: '/src/App.tsx -> dispatchTelegramAlert [Test Dispatch]',
      timestamp: timeStr(10000),
      execution_time: '124.2ms',
      memory_usage: '2.1 MB',
      ip: '127.0.0.1',
      details: {
        eventType: 'Test Dispatch',
        targetChannels: ['Admin (-5415746187)', 'Kitchen (-5456387701)', 'Finance (-5303969309)'],
        message: '🧪 TELEGRAM SYSTEM DIAGNOSTIC TEST - Operational ✅',
        httpResponse: '200 OK (ok: true)'
      }
    },
    {
      id: 'tel-seed-02',
      portal: 'requests',
      severity: 'INFO',
      msg: 'POST /api/kitchen/orders - New Order Ticket Created #ORD-104',
      origin: '/src/components/KitchenManagement.tsx',
      timestamp: timeStr(60000),
      execution_time: '18.5ms',
      memory_usage: '1.9 MB',
      ip: '127.0.0.1',
      details: {
        orderId: 'ORD-104',
        guestName: 'Rohit Sharma (Room 102)',
        items: ['2x Paneer Tikka', '1x Cold Coffee'],
        totalAmount: '₹550'
      }
    },
    {
      id: 'tel-seed-03',
      portal: 'sql',
      severity: 'SQL',
      msg: 'SELECT * FROM orders WHERE status != "Fulfilled" ORDER BY id DESC',
      origin: '/kitchen/kitchen.php (Kitchen Board Query)',
      timestamp: timeStr(180000),
      execution_time: '3.2ms',
      memory_usage: '1.1 MB',
      ip: 'localhost',
      details: { rowsFetched: 4, table: 'orders' }
    },
    {
      id: 'tel-seed-04',
      portal: 'telegram',
      severity: 'SUCCESS',
      msg: 'POST https://api.telegram.org/bot.../sendMessage - Kitchen KOT Alert Sent',
      origin: '/src/App.tsx -> handleAddOrder [KOT Order]',
      timestamp: timeStr(240000),
      execution_time: '110.8ms',
      memory_usage: '2.0 MB',
      ip: '127.0.0.1',
      details: {
        eventType: 'KOT Order',
        message: '🛎️ New Kitchen Ticket ORD-104 for Rohit Sharma (102)'
      }
    }
  ];
}
