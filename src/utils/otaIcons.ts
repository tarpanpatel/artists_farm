import type { FC, SVGProps } from 'react';
import { AirbnbIcon } from '../components/icons/AirbnbIcon';
import { BookingComIcon } from '../components/icons/BookingComIcon';

export type OtaIconComponent = FC<SVGProps<SVGSVGElement> & { className?: string }>;

/**
 * Resolves a guest/booking's OTA source string (Guest.otaSource /
 * Guest.otaSourceLabel - whatever Channex's own `ota_name` sent, e.g.
 * "AirBNB", "BookingCom", see webhook_receiver.php) to its real brand icon
 * component, so a booking capsule/detail drawer/channel page can show the
 * channel's actual logo instead of just plain text. Added 3 Sep 2026
 * (explicit request: "use the attached svg icons for airbnb and
 * booking.com... wherever those words come").
 *
 * Returns null for a direct/offline booking or an OTA without a brand icon
 * yet (e.g. Expedia, VRBO) - callers fall back to plain text/a generic
 * globe icon in that case, same as expenseIcons.ts's keyword-rule pattern
 * this mirrors.
 */
export function getOtaIcon(source: string | null | undefined): OtaIconComponent | null {
  if (!source) return null;
  const raw = source.trim().toLowerCase();
  if (!raw) return null;

  // Normalized: strip spaces, dots, hyphens, underscores, brackets
  const normalized = raw.replace(/[\s._\-()]+/g, '');

  // 1. Airbnb match
  if (normalized === 'airbnb' || raw.includes('airbnb')) {
    return AirbnbIcon;
  }

  // 2. Booking.com ONLY match (do NOT match "Instant Booking Page", "JoodBooking", "Julian Alps Booking", etc.)
  if (
    normalized === 'bookingcom' ||
    normalized === 'booking' ||
    normalized === 'bookingcomxml' ||
    normalized === 'bookingdotcom' ||
    normalized === 'bcom' ||
    /^booking(\.|\s|_|-)?com(\s*\(xml\))?$/i.test(raw)
  ) {
    return BookingComIcon;
  }

  return null;
}
