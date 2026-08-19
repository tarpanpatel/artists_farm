import React from 'react';
import { Tooltip as FlowbiteTooltip, createTheme } from 'flowbite-react';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

// z-[99999] matches the app's "always on top" tier (see the z-index scale
// note in src/index.css) - Flowbite's default z-10 would get buried under
// z-58 page modals, which is exactly the kind of stacking bug that scale
// exists to prevent.
const tooltipTheme = createTheme({
  base: 'absolute z-[99999] inline-block w-max max-w-xs rounded-xl px-3 py-2 text-xs sm:text-sm font-medium leading-normal shadow-2xl',
  arrow: {
    base: 'absolute z-[99999] h-2 w-2 rotate-45',
    style: {
      dark: 'bg-slate-900/95 dark:bg-slate-800/95',
    },
  },
  style: {
    dark: 'bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-xs text-white border border-slate-700/60',
  },
});

export const Tooltip: React.FC<TooltipProps> = ({ content, children, position = 'top', className = '' }) => {
  if (!content) return <>{children}</>;

  return (
    <FlowbiteTooltip theme={tooltipTheme} content={content} placement={position} className={className}>
      {children}
    </FlowbiteTooltip>
  );
};
