import React from 'react';

/**
 * Flowbite Default Progress Bar Component
 * https://flowbite.com/docs/components/progress/#default-progress-bar
 */
export interface ProgressBarProps {
  progress: number; // 0 to 100
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple';
  showPercentage?: boolean;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  label,
  size = 'md',
  color = 'blue',
  showPercentage = true,
  className = '',
}) => {
  const clamped = Math.min(100, Math.max(0, Math.round(progress)));

  const heightClasses = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  }[size];

  const colorClasses = {
    blue: 'bg-blue-600 dark:bg-blue-500',
    green: 'bg-emerald-600 dark:bg-emerald-500',
    red: 'bg-red-600 dark:bg-red-500',
    yellow: 'bg-yellow-400 dark:bg-yellow-500',
    purple: 'bg-purple-600 dark:bg-purple-500',
  }[color];

  return (
    <div className={`w-full ${className}`}>
      {(label || showPercentage) && (
        <div className="flex justify-between mb-1 text-2xs font-medium text-slate-700 dark:text-slate-300">
          {label ? <span className="truncate pr-2">{label}</span> : <span />}
          {showPercentage && (
            <span className="font-semibold text-blue-600 dark:text-blue-400 shrink-0">
              {clamped}%
            </span>
          )}
        </div>
      )}
      <div className={`w-full bg-gray-200 rounded-full ${heightClasses} dark:bg-gray-700 overflow-hidden`}>
        <div
          className={`${colorClasses} ${heightClasses} rounded-full transition-all duration-300 ease-out`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
};
