import React from 'react';
import { Badge } from 'flowbite-react';

export interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  badge?: { text: string; color: string };
  valueClassName?: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  subtext,
  badge,
  valueClassName = 'text-gray-900 dark:text-white',
  icon: Icon,
  className = '',
}) => {
  return (
    <div
      className={`kpi-card flex items-center justify-between gap-3 p-3 sm:p-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xs hover:shadow-xs transition-shadow ${className}`}
    >
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700/60 flex items-center justify-center text-gray-600 dark:text-gray-300 shrink-0">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider leading-tight truncate">
            {label}
          </p>
          <div className={`text-xl sm:text-2xl font-extrabold tracking-tight flex items-center leading-none mt-1 ${valueClassName}`}>
            {value}
          </div>
          {subtext && (
            <p className="text-2xs text-gray-400 dark:text-gray-500 font-medium mt-0.5 truncate">
              {subtext}
            </p>
          )}
        </div>
      </div>

      {badge && (
        <Badge color={badge.color as any} size="xs" className="shrink-0 font-medium">
          {badge.text}
        </Badge>
      )}
    </div>
  );
};
