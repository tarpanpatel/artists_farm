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
  const s = (source || '').toLowerCase();
  if (!s) return null;
  if (s.includes('airbnb')) return AirbnbIcon;
  if (s.includes('booking')) return BookingComIcon; // "BookingCom" / "Booking.com"
  return null;
}
