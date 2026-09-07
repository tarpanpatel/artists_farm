import React from 'react';

export interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  compact?: boolean;
  className?: string;
  showHeader?: boolean;
}

/**
 * Standard Flowbite animate-pulse Table Skeleton loader.
 * Replaces jarring central spinners and eliminates Cumulative Layout Shift (CLS).
 */
export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 4,
  cols = 5,
  compact = false,
  className = '',
  showHeader = true,
}) => {
  const rowArray = Array.from({ length: rows });
  const colArray = Array.from({ length: cols });

  // Width variations for natural data appearance
  const getColWidth = (colIdx: number) => {
    if (colIdx === 0) return 'w-24';
    if (colIdx === 1) return 'w-36';
    if (colIdx === cols - 1) return 'w-16';
    return 'w-28';
  };

  return (
    <div
      role="status"
      aria-label="Loading data table..."
      className={`w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xs animate-pulse ${className}`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-gray-500 dark:text-gray-400">
          {showHeader && (
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 text-2xs uppercase text-gray-400 dark:text-gray-500">
              <tr>
                {colArray.map((_, idx) => (
                  <th key={`head-${idx}`} className={`px-4 ${compact ? 'py-2' : 'py-3'}`}>
                    <div className={`h-2.5 bg-gray-200 dark:bg-gray-700 rounded ${getColWidth(idx)} max-w-full`} />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {rowArray.map((_, rowIdx) => (
              <tr
                key={`row-${rowIdx}`}
                className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors"
              >
                {colArray.map((_, colIdx) => (
                  <td key={`cell-${rowIdx}-${colIdx}`} className={`px-4 ${compact ? 'py-2.5' : 'py-3.5'}`}>
                    {colIdx === cols - 1 ? (
                      <div className="h-6 w-14 bg-gray-200 dark:bg-gray-700 rounded-md" />
                    ) : colIdx === cols - 2 ? (
                      <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
                    ) : (
                      <div
                        className={`h-3 bg-gray-200 dark:bg-gray-700 rounded ${getColWidth(
                          colIdx
                        )} max-w-full`}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="sr-only">Loading...</span>
    </div>
  );
};
