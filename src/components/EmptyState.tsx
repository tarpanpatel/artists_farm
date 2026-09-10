import React from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: React.ElementType;
  actionVariant?: 'primary' | 'secondary';
  compact?: boolean;
  className?: string;
}

/**
 * Standard Flowbite-compliant Empty State component across GroundCode PMS.
 * Strictly adheres to Flowbite tokens, dark mode classes, and typography discipline.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon: ActionIcon,
  actionVariant = 'primary',
  compact = false,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center rounded-none sm:rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 transition-all ${
        compact ? 'p-4 sm:p-6' : 'p-6 sm:p-10'
      } ${className}`}
    >
      {Icon && (
        <div
          className={`${
            compact ? 'w-10 h-10 mb-2.5' : 'w-12 h-12 mb-3.5'
          } rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0 shadow-xs`}
        >
          <Icon className={compact ? 'w-5 h-5' : 'w-6 h-6'} />
        </div>
      )}

      <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white tracking-tight">
        {title}
      </h3>

      {description && (
        <p className="text-2xs text-gray-500 dark:text-gray-400 max-w-sm mt-1 leading-relaxed">
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <div className="mt-4">
          <Button
            variant={actionVariant}
            size="sm"
            onClick={onAction}
            leftIcon={ActionIcon && <ActionIcon className="w-3.5 h-3.5" />}
            className="h-8 text-xs font-semibold shadow-none"
          >
            <span>{actionLabel}</span>
          </Button>
        </div>
      )}
    </div>
  );
};
