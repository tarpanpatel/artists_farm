import React from 'react';
import { Card, Badge } from 'flowbite-react';

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
    <Card className={`border-gray-200 dark:border-gray-700 shadow-sm ${className}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</p>
        {badge && (
          <Badge color={badge.color as any} size="xs">
            {badge.text}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        {Icon && <Icon className="w-6 h-6 text-gray-500 dark:text-gray-400 shrink-0" />}
        <div className={`text-3xl font-extrabold tracking-tight flex items-center ${valueClassName}`}>
          {value}
        </div>
      </div>
      {subtext && (
        <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-1">
          {subtext}
        </div>
      )}
    </Card>
  );
};
