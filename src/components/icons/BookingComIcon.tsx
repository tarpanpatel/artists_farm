import React from 'react';

export interface BookingComIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

/**
 * Booking.com Brand Icon (SVG lettermark) - added 3 Sep 2026 alongside
 * AirbnbIcon.tsx, same reasoning: an OTA booking should be instantly
 * recognizable by its real channel logo instead of just the text
 * "Booking.com" - used wherever a guest's `otaSource`/`otaSourceLabel` is
 * "booking.com"/"booking" (calendar capsules, booking details, channel
 * manager pages). Reconstructed as a navy rounded-square "B." lettermark
 * (brand navy #003580 + cyan accent dot) rather than a traced bezier path
 * (no source vector was available, unlike Airbnb's), same fixed-brand-color
 * approach as AirbnbIcon.tsx - not `currentColor`.
 */
export const BookingComIcon: React.FC<BookingComIconProps> = ({ className = 'w-4 h-4', ...props }) => (
  <svg
    viewBox="0 0 48 48"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <rect x="0" y="0" width="48" height="48" rx="11" fill="#003580" />
    <text
      x="12"
      y="34.5"
      fontFamily="Arial, Helvetica, sans-serif"
      fontWeight="800"
      fontSize="27"
      fill="#FFFFFF"
    >
      B
    </text>
    <circle cx="35.5" cy="32.5" r="4.2" fill="#00B9F1" />
  </svg>
);
