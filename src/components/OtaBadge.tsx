import React from 'react';
import { Badge } from './Badge';
import { Globe } from './icons/FlowbiteIcons';
import { getOtaIcon, formatOtaLabel } from '../utils/otaIcons';
import { t } from '../i18n/en';

export interface OtaBadgeProps {
  source: string | null | undefined;
  sourceLabel?: string | null | undefined;
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
  size = 'sm',
  title,
  className = '',
}) => {
  if (!source && !sourceLabel) return null;

  const rawSource = sourceLabel || source || '';
  const label = formatOtaLabel(rawSource);
  const OtaIcon = getOtaIcon(rawSource);

  return (
    <Badge
      variant="white"
      size={size}
      title={
        title ||
        t(
          'ota_converted_badge_tooltip',
          'Converted from an OTA calendar sync - editing this only changes this app, not the original platform.'
        )
      }
      className={`app-ota-badge inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-2xs ${className}`}
    >
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        {OtaIcon ? (
          <OtaIcon className="w-3.5 h-3.5 shrink-0 rounded-[2px]" />
        ) : (
          <Globe className="w-3 h-3 shrink-0 text-gray-500 dark:text-gray-400" />
        )}
        <span className="font-semibold text-gray-900 dark:text-white">{label}</span>
      </span>
    </Badge>
  );
};
