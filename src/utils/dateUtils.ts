const MONTH_SHORT_TO_NUM: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

const normalizeMonth = (month: string): string | undefined =>
  MONTH_SHORT_TO_NUM[month.charAt(0).toUpperCase() + month.slice(1).toLowerCase()];

const pad = (n: string | number): string => String(n).padStart(2, '0');

export const formatDateDDMMYY = (dateStr?: string | null): string => {
  const formatted = formatDateDDMMYYYY(dateStr);
  if (!formatted) return '';
  const parts = formatted.split('/');
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[0]}/${parts[1]}/${parts[2].slice(-2)}`;
  }
  return formatted;
};

export const formatDateDDMMYYYY = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  const cleaned = String(dateStr).trim();
  if (!cleaned) return '';

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleaned)) return cleaned;

  const dmy = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3})[.,]?\s+(\d{4})/);
  if (dmy) {
    const month = normalizeMonth(dmy[2]);
    if (month) return `${pad(dmy[1])}/${month}/${dmy[3]}`;
  }

  const ymd = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;

  const dt = new Date(cleaned);
  if (!isNaN(dt.getTime())) {
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
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
    if (month) return `${pad(dmy[1])}/${month}/${dmy[3]} - ${dmy[4]}`;
  }

  const dtMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})[T ](.+)$/);
  if (dtMatch) return `${dtMatch[3]}/${dtMatch[2]}/${dtMatch[1]} ${dtMatch[4]}`;

  return formatDateDDMMYYYY(cleaned);
};
