import React from 'react';

export interface WhatsappIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

/**
 * Authentic WhatsApp Brand Icon (SVG) - same pattern as TelegramIcon.tsx,
 * used together for the Header's "Contact Support" quick links (27 Aug 2026).
 */
export const WhatsappIcon: React.FC<WhatsappIconProps> = ({ className = 'w-4 h-4 text-emerald-500', ...props }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.847 9.847 0 0 0 12.04 2zm5.8 14.14c-.24.68-1.4 1.3-1.93 1.38-.49.08-1.11.11-1.79-.11-.41-.13-.94-.3-1.62-.59-2.85-1.23-4.71-4.1-4.85-4.29-.14-.19-1.16-1.54-1.16-2.94s.72-2.09.98-2.37c.26-.29.56-.36.75-.36.19 0 .38 0 .54.01.17.01.41-.07.64.49.24.58.81 2 .88 2.15.07.15.12.32.02.51-.09.19-.14.3-.28.47-.14.16-.29.36-.42.48-.14.13-.28.28-.12.55.16.27.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.23 1.38.26.14.42.12.58-.07.16-.19.68-.79.86-1.06.18-.27.36-.22.6-.13.24.09 1.55.73 1.82.87.26.13.44.19.5.3.07.11.07.65-.17 1.33z" />
  </svg>
);
