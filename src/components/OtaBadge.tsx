import React from 'react';
import { Badge } from './Badge';
import { Popover } from './Popover';
import { Globe, ExternalLink } from './icons/FlowbiteIcons';
import { getOtaIcon, formatOtaLabel } from '../utils/otaIcons';
import { t } from '../i18n/en';

export interface OtaBadgeProps {
  source: string | null | undefined;
  sourceLabel?: string | null | undefined;
  // The OTA's own guest-facing confirmation code (Guest.otaReservationCode -
  // Airbnb's "HM4D9SCN3Q" etc, see channex/webhook_receiver.php). Only
  // Airbnb has a known, working "view this reservation" URL built from it
  // (airbnb.co.in/hosting/stay/<code>, confirmed live 8 Sep 2026) - when
  // both this and an Airbnb source are present, the badge's popover gets a
  // real "View on Airbnb" action instead of just explanatory text. Every
  // other case (code not synced yet, or a non-Airbnb OTA with no known
  // reservation URL) falls through to the plain hover-tooltip this always had.
  reservationCode?: string | null;
  size?: 'sm' | 'md';
  title?: string;
  className?: string;
}

/**
 * Standardized OTA Channel Badge conforming to the OTA Badges & Branding Rule:
 * Renders in a white-background badge (dark:bg-gray-800) with the official OTA brand logo
 * preceding the channel name, with a Flowbite popover for OTA synchronization details.
 */
export const OtaBadge: React.FC<OtaBadgeProps> = ({
  source,
  sourceLabel,
  reservationCode,
  size = 'sm',
  title,
  className = '',
}) => {
  if (!source && !sourceLabel) return null;

  const rawSource = sourceLabel || source || '';
  const label = formatOtaLabel(rawSource);
  const OtaIcon = getOtaIcon(rawSource);
  const tooltipText =
    title ||
    t(
      'ota_converted_badge_tooltip',
      'Converted from an OTA calendar sync - editing this only changes this app, not the original platform.'
    );

  const badgeInner = (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {OtaIcon ? (
        <OtaIcon className="w-3.5 h-3.5 shrink-0 rounded-[2px]" />
      ) : (
        <Globe className="w-3 h-3 shrink-0 text-gray-500 dark:text-gray-400" />
      )}
      <span className="font-semibold text-gray-900 dark:text-white">{label}</span>
    </span>
  );

  // Airbnb + a real reservation code: the popover gets something to DO, not
  // just read, so this variant switches the trigger to 'click' instead of
  // reusing Badge's own hover-only wrapping - a touchscreen has no hover to
  // hold open while reaching for a button inside it (see CLAUDE.md's mobile
  // popover rule). The trigger itself has to be a real DOM element Popover
  // can attach a ref/onClick to directly (confirmed via Popover.tsx's
  // cloneElement - a plain React component that doesn't forward those
  // props, like Badge, silently drops them), so this renders a real
  // <button> carrying the same badge look instead of nesting <Badge>.
  if (label === 'Airbnb' && reservationCode) {
    const airbnbUrl = `https://www.airbnb.co.in/hosting/stay/${encodeURIComponent(reservationCode)}`;
    return (
      <Popover
        trigger="click"
        placement="top"
        content={
          <div className="p-2.5 flex flex-col gap-2 max-w-57.5">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-200 leading-snug">
              {tooltipText}
            </p>
            <a
              href={airbnbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="app-badge inline-flex items-center justify-center gap-1.5 self-start rounded font-medium text-2xs px-2.5 py-1 bg-white text-gray-800 border border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 shadow-2xs hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
            >
              {OtaIcon && <OtaIcon className="w-3.5 h-3.5 shrink-0 rounded-[2px]" />}
              {t('view_on_airbnb_button', 'View on Airbnb')}
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>
        }
      >
        <button
          type="button"
          className={`app-badge app-ota-badge app-ota-badge--clickable inline-flex items-center gap-1.5 font-medium rounded select-none tabular-nums whitespace-nowrap shrink-0 shadow-2xs cursor-pointer bg-white text-gray-800 border border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            size === 'md' ? 'text-xs px-2.5 py-0.5' : 'text-2xs px-2 py-0.5'
          } ${className}`}
        >
          {badgeInner}
        </button>
      </Popover>
    );
  }

  return (
    <Badge
      variant="white"
      size={size}
      title={tooltipText}
      className={`app-ota-badge inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-2xs ${className}`}
    >
      {badgeInner}
    </Badge>
  );
};
