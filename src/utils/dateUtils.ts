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

export const formatDateDDMMYY = formatDateDDMMYYYY;

export const formatDateTimeDDMMYYYY = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  const cleaned = String(dateStr).trim();
  if (!cleaned) return '';

  // Handle "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD" formats
  const dtMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})\s(.+)$/);
  if (dtMatch) return `${dtMatch[3]}/${dtMatch[2]}/${dtMatch[1]} ${dtMatch[4]}`;

  // Handle "DD/MM/YYYY HH:mm:ss" or "DD/MM/YYYY"
  const dmyMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s(.+)$/);
  if (dmyMatch) return `${dmyMatch[1].padStart(2, '0')}/${dmyMatch[2].padStart(2, '0')}/${dmyMatch[3]} ${dmyMatch[4]}`;

  // Handle "DD/MM/YYYY" only
  const dmyOnly = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyOnly) return `${dmyOnly[1].padStart(2, '0')}/${dmyOnly[2].padStart(2, '0')}/${dmyOnly[3]}`;

  // Handle native <input type="datetime-local"> value format "YYYY-MM-DDTHH:mm"
  // (optionally with :ss/.SSS) - the base formatDateDDMMYYYY() fallback below
  // parses this fine via `new Date(cleaned)` but silently drops the time
  // component (it only ever formats date parts), so a datetime-local value fed
  // through this function used to come out date-only with no time at all
  // (found 21 Aug 2026, via KitchenManagement.tsx's Staff Meals date/time
  // field - see toDatetimeLocalValue() below for the reverse direction).
  const isoLocalMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (isoLocalMatch) return `${isoLocalMatch[3]}/${isoLocalMatch[2]}/${isoLocalMatch[1]} ${isoLocalMatch[4]}:${isoLocalMatch[5]}`;

  // Fallback: try the base formatter
  return formatDateDDMMYYYY(cleaned);
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