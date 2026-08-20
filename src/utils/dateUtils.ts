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

  // Fallback: try the base formatter
  return formatDateDDMMYYYY(cleaned);
};

const pad = (n: number | string): string => String(n).padStart(2, '0');