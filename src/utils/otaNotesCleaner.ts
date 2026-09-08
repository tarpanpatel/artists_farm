/**
 * Cleans automated/financial metadata lines dumped by OTAs (like Airbnb via Channex)
 * out of human-facing guest notes.
 *
 * Airbnb sends accounting telemetry inside `notes`:
 *   Listing Base Price: 2400.00
 *   Transient Occupancy Tax Paid Amount: N/A
 *   Listing Cancellation Payout: 2148.00
 *   Listing Cancellation Host Fee: 372.00
 *   Occupancy Tax Amount Paid To Host: N/A
 *   Extra Guest Fee: 0.00
 *   Cohost Payout: N/A
 *   Number Of Pets: 0
 *   Management Fee: 5.00
 *
 * This utility strips those machine-generated lines so only genuine guest
 * messages / special requests are preserved.
 */

const OTA_METADATA_PATTERNS = [
  /^\s*Listing Base Price\s*:/i,
  /^\s*Transient Occupancy Tax/i,
  /^\s*Listing Cancellation/i,
  /^\s*Occupancy Tax Amount/i,
  /^\s*Extra Guest Fee\s*:/i,
  /^\s*Cohost Payout\s*:/i,
  /^\s*Number Of Pets\s*:/i,
  /^\s*Management Fee\s*:/i,
  /^\s*Imported Booking\s*$/i,
];

const INLINE_OTA_PATTERNS = [
  /\bImported Booking\b/gi,
  /\bListing Base Price\s*:\s*[^\s\r\n]+(?:\s*[A-Z]{3})?/gi,
  /\bTransient Occupancy Tax(?:\s+Paid\s+Amount)?\s*:\s*[^\s\r\n]+/gi,
  /\bListing Cancellation(?:\s+Payout|\s+Host\s+Fee)?\s*:\s*[^\s\r\n]+/gi,
  /\bOccupancy Tax Amount(?:\s+Paid\s+To\s+Host)?\s*:\s*[^\s\r\n]+/gi,
  /\bExtra Guest Fee\s*:\s*[^\s\r\n]+/gi,
  /\bCohost Payout\s*:\s*[^\s\r\n]+/gi,
  /\bNumber Of Pets\s*:\s*[^\s\r\n]+/gi,
  /\bManagement Fee\s*:\s*[^\s\r\n]+/gi,
  /\bListing Security Deposit\s*:\s*[^\s\r\n]+/gi,
  /\bHost Payout\s*:\s*[^\s\r\n]+/gi,
  /\bListing Cancellation\b[^\r\n]*/gi,
];

export function cleanGuestNotes(rawNotes?: string | null): string {
  if (!rawNotes) return '';
  const lines = rawNotes.split(/\r?\n/);
  const filteredLines = lines
    .map((line) => {
      let current = line;
      for (const pattern of INLINE_OTA_PATTERNS) {
        current = current.replace(pattern, ' ');
      }
      return current.replace(/\s+/g, ' ').replace(/^[:.,;-\s]+/, '').trim();
    })
    .filter((line) => {
      if (!line) return false;
      if (OTA_METADATA_PATTERNS.some((pattern) => pattern.test(line))) return false;
      return /[a-zA-Z0-9]/.test(line);
    });

  const result = filteredLines.join('\n').trim();
  if (!/[a-zA-Z0-9]/.test(result)) {
    return '';
  }
  return result;
}

/**
 * Checks if raw notes consist entirely of OTA automated metadata.
 */
export function isPureOtaMetadata(rawNotes?: string | null): boolean {
  if (!rawNotes) return false;
  return cleanGuestNotes(rawNotes).length === 0;
}
