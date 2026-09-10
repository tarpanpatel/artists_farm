import React from 'react';
import { Badge } from './Badge';

/**
 * Two metrics sharing one card and one badge (10 Sep 2026, explicit request:
 * "Merge arrival and departure cards and have only one Today badge in the
 * right. Do the same for cards below and have only one active badge in the
 * right"). KpiCard.tsx is one metric + one badge; this is the sibling for
 * exactly two metrics that would otherwise each carry an identical badge
 * (Arrivals/Departures both said "Today", Checked-In/Service Requests both
 * said "Active") - the duplication was the actual complaint, not the
 * layout, so this keeps KpiCard's own visual language (icon chip, label,
 * value, badge on the right) and just renders two label/value groups
 * side by side with a divider instead of one.
 */
export interface MergedKpiCardItem {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  valueClassName?: string;
}

export interface MergedKpiCardProps {
  items: [MergedKpiCardItem, MergedKpiCardItem];
  badge?: { text: string; color: string };
  className?: string;
}

export const MergedKpiCard: React.FC<MergedKpiCardProps> = ({ items, badge, className = '' }) => {
  const badgeVariant = (
    badge?.color === 'failure' || badge?.color === 'danger'
      ? 'danger'
      : badge?.color === 'warning'
      ? 'warning'
      : badge?.color === 'info'
      ? 'info'
      : badge?.color === 'success'
      ? 'success'
      : 'neutral'
  );

  return (
    <div
      className={`kpi-card flex items-center justify-between gap-1.5 sm:gap-3 p-2 sm:p-2.5 md:p-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xs sm:shadow-2xs hover:shadow-xs transition-shadow ${className}`}
    >
      <div className="flex items-center gap-2.5 sm:gap-4 min-w-0 flex-1">
        {items.map((item, idx) => {
          const isZero = item.value === 0;
          return (
            <React.Fragment key={item.label}>
              {idx === 1 && (
                <div className="w-px self-stretch bg-gray-200 dark:bg-gray-700 shrink-0" aria-hidden="true" />
              )}
              <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
                {item.icon && (
                  <div className="flex items-center justify-center text-gray-400 dark:text-gray-500 shrink-0">
                    <item.icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] sm:text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider leading-none truncate m-0">
                    {item.label}
                  </p>
                  <span className={`text-sm sm:text-base md:text-lg font-extrabold tracking-tight leading-none inline-flex items-center whitespace-nowrap mt-0.5 ${isZero ? 'text-gray-500 dark:text-gray-400' : (item.valueClassName || 'text-gray-900 dark:text-white')}`}>
                    {item.value}
                  </span>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {badge && (
        <Badge variant={badgeVariant} size="sm" className="shrink-0 font-medium text-[9px] sm:text-2xs px-1.5 py-0.5 sm:px-2">
          {badge.text}
        </Badge>
      )}
    </div>
  );
};
