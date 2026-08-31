export const formatDateDDMMYYYY = (dateStr: string | null): string => {
  if (!dateStr) return '';
  const cleaned = String(dateStr).trim();
  if (!cleaned) return '';

  // Accept YYYY-MM-DD (ISO) or MM/DD/YYYY or DD/MM/YYYY formats
  // and always output DD/MM/YYYY
  const ymd = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
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

export const formatDateDDMMYY = formatDateDDMMYYYY;

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