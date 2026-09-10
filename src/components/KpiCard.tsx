import React from 'react';
import { Badge } from './Badge';

export interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  badge?: { text: string; color: string };
  valueClassName?: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  layout?: 'inline' | 'stacked';
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  subtext,
  badge,
  valueClassName = 'text-gray-900 dark:text-white',
  icon: Icon,
  className = '',
  layout = 'inline',
}) => {
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
      className={`kpi-card flex items-center justify-between gap-1.5 sm:gap-3 px-4 py-3 sm:px-3 sm:py-2.5 md:p-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xs sm:shadow-2xs hover:shadow-xs transition-shadow ${className}`}
    >
      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
        {Icon && (
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gray-100 dark:bg-gray-700/60 flex items-center justify-center text-gray-600 dark:text-gray-300 shrink-0">
            <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        )}
        <div className="min-w-0">
          {layout === 'inline' ? (
            <div className="flex items-center gap-1 sm:gap-2 min-w-0">
              <p className="text-[10px] sm:text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider leading-none truncate m-0">
                {label}
              </p>
              <span className={`text-sm sm:text-base md:text-lg font-extrabold tracking-tight leading-none inline-flex items-center whitespace-nowrap shrink-0 ${value === 0 ? 'text-gray-500 dark:text-gray-400' : valueClassName}`}>
                {value}
              </span>
            </div>
          ) : (
            <>
              <p className="text-[10px] sm:text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide leading-tight m-0 truncate">
                {label}
              </p>
              <div className={`text-base sm:text-xl md:text-2xl font-extrabold tracking-tight inline-flex items-center leading-none mt-0.5 whitespace-nowrap ${value === 0 ? 'text-gray-500 dark:text-gray-400' : valueClassName}`}>
                {value}
              </div>
            </>
          )}
          {subtext && (
            <p className="text-2xs text-gray-400 dark:text-gray-500 font-medium mt-0.5 truncate">
              {subtext}
            </p>
          )}
        </div>
      </div>

      {badge && (
        <Badge variant={badgeVariant} size="sm" className="shrink-0 font-medium text-[9px] sm:text-2xs px-1.5 py-0.5 sm:px-2 pointer-events-none">
          {badge.text}
        </Badge>
      )}
    </div>
  );
};

