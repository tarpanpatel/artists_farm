import React from 'react';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, position = 'top', className = '' }) => {
  if (!content) return <>{children}</>;

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 -mt-0.5 border-t-slate-900 dark:border-t-slate-800',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-0.5 border-b-slate-900 dark:border-b-slate-800',
    left: 'left-full top-1/2 -translate-y-1/2 -ml-0.5 border-l-slate-900 dark:border-l-slate-800',
    right: 'right-full top-1/2 -translate-y-1/2 -mr-0.5 border-r-slate-900 dark:border-r-slate-800',
  };

  return (
    <span className={`relative inline-flex group ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`absolute z-[99999] ${positionClasses[position]} w-max max-w-xs px-3 py-2 bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-xs text-white text-xs sm:text-sm font-medium leading-normal rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 pointer-events-none text-center border border-slate-700/60`}
      >
        {content}
        <span className={`absolute border-4 border-transparent ${arrowClasses[position]}`} />
      </span>
    </span>
  );
};
