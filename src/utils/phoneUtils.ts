/**
 * Phone number normalization, WhatsApp link formatting, and tel: dialing utilities.
 */

/**
 * Normalizes phone numbers pasted or typed into the system:
 * - Strips extra spaces, dashes, hyphens, parentheses, and dots.
 * - If Indian number with +91, 91, or 0 prefix (e.g. "+91 82998 93837" or "08299893837"), extracts the clean 10-digit mobile number ("8299893837").
 * - If international number starting with + (e.g. "+1 (555) 234-5678"), preserves the leading + and digits ("+15552345678").
 * - Limits max digits to 15 (E.164 international standard).
 */
export function normalizePhoneNumber(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const isPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');

  if (!digits) return '';

  // 12 digits starting with 91 (e.g. +91 82998 93837 or 918299893837)
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }

  // 11 digits starting with 0 (e.g. 08299893837)
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }

  // Standard 10-digit mobile
  if (digits.length === 10) {
    return digits;
  }

  // International numbers with +
  if (isPlus) {
    return `+${digits.slice(0, 15)}`;
  }

  // If long digit string without plus, cap at 15
  if (digits.length > 10) {
    return digits.slice(0, 15);
  }

  return digits;
}

/**
 * Returns a WhatsApp-ready phone string (pure digits including country code, e.g. 918299893837 or 15552345678).
 */
export function getWhatsAppPhone(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  // If standard 10-digit Indian number, prepend 91
  if (digits.length === 10) {
    return `91${digits}`;
  }

  return digits;
}

/**
 * Returns a clickable tel: URI for one-tap calling.
 */
export function getTelUri(raw: string): string {
  const normalized = normalizePhoneNumber(raw);
  if (!normalized) return '';
  if (normalized.startsWith('+')) {
    return `tel:${normalized}`;
  }
  if (normalized.length === 10) {
    return `tel:+91${normalized}`;
  }
  return `tel:${normalized}`;
}
