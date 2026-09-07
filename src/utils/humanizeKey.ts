/**
 * "WIRELESS_INTERNET" -> "Wireless Internet", "double_bed" -> "Double Bed",
 * "bedroom" -> "Bedroom". Lowercases, swaps underscores for spaces, then
 * title-cases each word - idempotent on text that's already clean
 * ("Air Conditioning" round-trips unchanged).
 *
 * Shared so admin-facing editors (PropertyEditForm.tsx's Amenities/Bed
 * Configuration) show data the same way guests actually see it
 * (PublicBookingEngine.tsx) - a raw imported Airbnb key like "double_bed"
 * looking like a variable in the edit form, while guests see "Double Bed",
 * was exactly the bug this was extracted to fix (7 Sep 2026).
 */
export const humanizeKey = (k: string): string =>
  k.trim().toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
