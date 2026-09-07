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

export function cleanGuestNotes(rawNotes?: string | null): string {
  if (!rawNotes) return '';
  const lines = rawNotes.split(/\r?\n/);
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    return !OTA_METADATA_PATTERNS.some((pattern) => pattern.test(trimmed));
  });
  return filtered.join('\n').trim();
}

/**
 * Checks if raw notes consist entirely of OTA automated metadata.
 */
export function isPureOtaMetadata(rawNotes?: string | null): boolean {
  if (!rawNotes) return false;
  return cleanGuestNotes(rawNotes).length === 0;
}
