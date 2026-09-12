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
 * Whether a phone number (already run through normalizePhoneNumber, or raw -
 * only the digit count matters) is a plausible length to save. A domestic
 * guest must have exactly a 10-digit Indian mobile number; a foreign guest's
 * number is allowed to vary (7-15 digits, per E.164) since normalizePhoneNumber
 * itself only caps international numbers at 15, it doesn't validate a minimum -
 * found live 7 Sep 2026: a domestic booking's Phone Number field accepted
 * "888888888888888" (15 repeated digits) with zero feedback, because nothing
 * gated that international-length leniency to only apply when the guest is
 * actually marked as foreign.
 */
export function isValidPhoneNumber(raw: string, isForeignGuest: boolean): boolean {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return false;
  if (isForeignGuest) return digits.length >= 7 && digits.length <= 15;
  return digits.length === 10;
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
 * Generates an optimal WhatsApp share URL:
 * - On Mobile (Android/iOS): wa.me deep links open the native WhatsApp mobile app where UTF-8 emojis work properly.
 * - On Desktop (Windows/Mac): opens WhatsApp Web (web.whatsapp.com) directly. This completely prevents the Windows
 *   OS protocol handler bug where launching the Windows native WhatsApp desktop app via wa.me / api.whatsapp.com
 *   corrupts 4-byte UTF-8 emojis into replacement characters (diamond question marks).
 */
export function getWhatsAppShareUrl(rawPhone?: string, text?: string): string {
  const phone = rawPhone ? getWhatsAppPhone(rawPhone) : '';
  const encodedText = text ? encodeURIComponent(text) : '';
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isMobile) {
    // Note: NEVER use wa.me - Meta's wa.me 302 redirect server has a bug that corrupts
    // 4-byte UTF-8 emojis into %EF%BF%BD (replacement diamonds). api.whatsapp.com serves
    // direct 200 responses with emojis completely intact.
    if (phone) {
      return `https://api.whatsapp.com/send/?phone=${phone}${encodedText ? `&text=${encodedText}` : ''}`;
    }
    return `https://api.whatsapp.com/send/?text=${encodedText}`;
  } else {
    // Desktop: use WhatsApp Web directly so the browser decodes UTF-8 natively and preserves all emojis
    if (phone) {
      return `https://web.whatsapp.com/send?phone=${phone}${encodedText ? `&text=${encodedText}` : ''}`;
    }
    return `https://web.whatsapp.com/send?text=${encodedText}`;
  }
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
