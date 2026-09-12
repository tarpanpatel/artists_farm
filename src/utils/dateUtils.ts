export const formatDateDDMMYYYY = (dateStr: string | null): string => {
  if (!dateStr) return '';
  const cleaned = String(dateStr).trim();
  if (!cleaned) return '';

  // Accept YYYY-MM-DD (ISO) or MM/DD/YYYY or DD/MM/YYYY formats
  // and always output DD/MM/YYYY
  const ymd = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;

  const dmy = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    // Safe assumption: treat as DD/MM/YYYY per product spec
    return `${dmy[1].padStart(2, '0')}/${dmy[2].padStart(2, '0')}/${dmy[3]}`;
  }

  // Try parsing as a JS Date from ISO string - but ONLY if it looks like an ISO date
  // (starting with year). Otherwise, treat the string as-is and try to parse.
  const dt = new Date(cleaned);
  if (!isNaN(dt.getTime())) {
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
  }

  return cleaned;
};

export const parseDateToYMD = (dateStr?: string | null): [number, number, number] | null => {
  if (!dateStr) return null;
  const cleaned = String(dateStr).trim();
  if (!cleaned) return null;
  const raw = cleaned.split(' ')[0].split('T')[0].trim();
  if (!raw) return null;

  const parts = raw.split(/[\/\-]/).map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;

  let y: number, m: number, d: number;
  if (parts[0] > 1000) {
    [y, m, d] = parts;
  } else if (parts[2] > 1000) {
    [d, m, y] = parts;
  } else {
    return null;
  }

  if (y < 2000 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return [y, m, d];
};

export const formatDateDDMMYY = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  const ymd = parseDateToYMD(dateStr);
  if (!ymd) {
    const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1].slice(-2)}`;
    return String(dateStr);
  }
  const [y, m, d] = ymd;
  const yy = String(y).slice(-2);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${yy}`;
};

/**
 * Formats a date into ordinal day and short month (e.g. "3rd Sep", "8th Sep", "21st Oct").
 * When the date is NOT in the current year, appends the 4-digit year (e.g. "7th Jan 2027", "15th Dec 2025").
 */
export const formatDateOrdinal = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  const ymd = parseDateToYMD(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const getOrdinal = (n: number): string => {
    if (n > 3 && n < 21) return `${n}th`;
    switch (n % 10) {
      case 1: return `${n}st`;
      case 2: return `${n}nd`;
      case 3: return `${n}rd`;
      default: return `${n}th`;
    }
  };

  const currentYear = new Date().getFullYear();

  if (ymd) {
    const [y, m, d] = ymd;
    const yearSuffix = y !== currentYear ? ` ${y}` : '';
    return `${getOrdinal(d)} ${months[m - 1] || ''}${yearSuffix}`;
  }

  const dt = new Date(dateStr);
  if (!isNaN(dt.getTime())) {
    const y = dt.getFullYear();
    const yearSuffix = y !== currentYear ? ` ${y}` : '';
    return `${getOrdinal(dt.getDate())} ${months[dt.getMonth()] || ''}${yearSuffix}`;
  }

  return String(dateStr);
};

export const formatDateTimeDDMMYYYY = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  const cleaned = String(dateStr).trim();
  if (!cleaned) return '';

  const stripSeconds = (timeStr: string): string => {
    return timeStr.replace(/:(\d{2}):\d{2}/g, ':$1');
  };

  // Handle "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD HH:mm"
  const dtMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})\s(.+)$/);
  if (dtMatch) return `${dtMatch[3]}/${dtMatch[2]}/${dtMatch[1]} ${stripSeconds(dtMatch[4])}`;

  // Handle "DD/MM/YYYY HH:mm:ss" or "DD/MM/YYYY HH:mm"
  const dmyMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s(.+)$/);
  if (dmyMatch) return `${dmyMatch[1].padStart(2, '0')}/${dmyMatch[2].padStart(2, '0')}/${dmyMatch[3]} ${stripSeconds(dmyMatch[4])}`;

  // Handle "DD/MM/YYYY" only
  const dmyOnly = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyOnly) return `${dmyOnly[1].padStart(2, '0')}/${dmyOnly[2].padStart(2, '0')}/${dmyOnly[3]}`;

  // Handle native <input type="datetime-local"> value format "YYYY-MM-DDTHH:mm"
  const isoLocalMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (isoLocalMatch) return `${isoLocalMatch[3]}/${isoLocalMatch[2]}/${isoLocalMatch[1]} ${isoLocalMatch[4]}:${isoLocalMatch[5]}`;

  // JS Date ISO string fallback
  const dt = new Date(cleaned);
  if (!isNaN(dt.getTime()) && (cleaned.includes('T') || cleaned.includes('-'))) {
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }

  // Fallback: try the base formatter
  return stripSeconds(formatDateDDMMYYYY(cleaned));
};

const pad = (n: number | string): string => String(n).padStart(2, '0');

// Reverse of formatDateTimeDDMMYYYY's isoLocalMatch branch above: produces the
// exact "YYYY-MM-DDTHH:mm" string a native <input type="datetime-local">'s
// `value` prop requires. Feeding it a display-formatted (DD/MM/YYYY) string
// instead - an easy mistake since that's this app's format everywhere else -
// makes the browser silently reject the value and render the picker blank
// (confirmed 21 Aug 2026: KitchenManagement.tsx's Staff Meals field did
// exactly this before being fixed to call this helper instead).
export const toDatetimeLocalValue = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

/**
 * Today's date as `YYYY-MM-DD` in the VIEWER'S OWN timezone.
 *
 * Use this for every "is this date today / past / upcoming" comparison. Never
 * use `new Date().toISOString().split('T')[0]` for that - `toISOString()`
 * converts to UTC first, so for the 5.5 hours between local midnight and
 * 05:30 IST it returns YESTERDAY's date, and every comparison against it is
 * off by one day.
 *
 * Found live 13 Sep 2026 at 00:45 IST: a booking that checked out on the 12th
 * was correctly filed under the "Past" tab (that code derived today from the
 * local clock) while its own badge read "Checkout Today" (that code used
 * toISOString). Two different definitions of "today" in one card. Every
 * overnight-shift user in India sits inside that window, which is exactly when
 * a night manager is looking at which guests leave today.
 */
export const getTodayKey = (): string => toLocalDateKey(new Date());

/**
 * Any Date as `YYYY-MM-DD` in the viewer's own timezone. Same reasoning as
 * getTodayKey - use this instead of `someDate.toISOString().split('T')[0]`,
 * which shifts the date for anyone east of UTC.
 */
export const toLocalDateKey = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** `YYYY-MM-DD`, local, N days from now. Negative N goes backwards. */
export const getDateKeyOffsetFromToday = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalDateKey(d);
};