const MONTH_SHORT_TO_NUM: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

const normalizeMonth = (month: string): string | undefined =>
  MONTH_SHORT_TO_NUM[month.charAt(0).toUpperCase() + month.slice(1).toLowerCase()];

const pad = (n: string | number): string => String(n).padStart(2, '0');

// All front-end date displays use dd/mm/YY (2-digit year) per product spec.
// formatDateDDMMYY is the canonical display formatter; the YYYY-named alias
// below returns the same 2-digit-year string so existing call sites render
// dd/mm/YY without per-call-site changes.
export const formatDateDDMMYY = (dateStr?: string | null): string => {
  return formatDateDDMMYYYY(dateStr);
};

export const formatDateDDMMYYYY = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  const cleaned = String(dateStr).trim();
  if (!cleaned) return '';

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleaned)) {
    const parts = cleaned.split('/');
    return `${pad(parts[0])}/${pad(parts[1])}/${String(parts[2]).slice(-2)}`;
  }

  const dmy = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3})[.,]?\s+(\d{4})/);
  if (dmy) {
    const month = normalizeMonth(dmy[2]);
    if (month) return `${pad(dmy[1])}/${month}/${String(dmy[3]).slice(-2)}`;
  }

  const ymd = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[3]}/${ymd[2]}/${String(ymd[1]).slice(-2)}`;

  const dt = new Date(cleaned);
  if (!isNaN(dt.getTime())) {
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${String(dt.getFullYear()).slice(-2)}`;
  }

  return cleaned;
};

export const formatDateTimeDDMMYYYY = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  const cleaned = String(dateStr).trim();
  if (!cleaned) return '';

  const dmy = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3})[.,]?\s+(\d{4})\s*-\s*(.+)$/);
  if (dmy) {
    const month = normalizeMonth(dmy[2]);
    if (month) return `${pad(dmy[1])}/${month}/${String(dmy[3]).slice(-2)} - ${dmy[4]}`;
  }

  const dtMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})[T ](.+)$/);
  if (dtMatch) return `${dtMatch[3]}/${dtMatch[2]}/${String(dtMatch[1]).slice(-2)} ${dtMatch[4]}`;

  return formatDateDDMMYYYY(cleaned);
};
