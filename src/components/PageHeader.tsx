import React from 'react';

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: string;
  // Right-side content - typically one <PageHeaderButton>, but any custom
  // action(s) can go here (e.g. multiple buttons, a status pill) and still
  // inherit the consistent title/subtitle/divider frame below.
  children?: React.ReactNode;
}

/**
 * Standard page-header frame: title + subtitle on the left, action(s) on the
 * right, bottom-border divider. This is the "Dashboard" header pattern
 * (OperationalDashboard.tsx) promoted to a shared component on 2026-08-10 so
 * every page's header stays in sync from one place instead of drifting the
 * way Dashboard vs Bookings did (card-wrapped, different button style, etc.)
 * before this existed.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, children }) => (
  <div className="gen_page_head flex flex-row items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800 page-header">
    <div className="min-w-0 flex-1 page-header__left">
       <h1 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight truncate page-header__title flex items-center gap-2">
         {title}
       </h1>
      {subtitle && (
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium line-clamp-1 sm:line-clamp-none page-header__subtitle">
          {subtitle}
        </p>
      )}
    </div>
    {children && <div className="flex flex-wrap items-center gap-2 shrink-0 page-header__actions">{children}</div>}
  </div>
);

interface PageHeaderButtonProps {
  onClick: () => void;
  icon?: React.ElementType;
  // Extra classes merged onto the icon (e.g. 'animate-spin' while a sync is
  // in progress) - kept separate from `icon` so callers don't need to build
  // a whole custom icon element just to toggle one class.
  iconClassName?: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

/**
 * The standard primary action button that goes inside a PageHeader (e.g.
 * "Add Booking"). Matches the Dashboard header's exact button styling.
 */
export const PageHeaderButton: React.FC<PageHeaderButtonProps> = ({
  onClick,
  icon: Icon,
  iconClassName = '',
  children,
  variant = 'primary',
  disabled = false,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={
      (variant === 'primary'
        ? 'text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300'
        : 'text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700') +
      ' font-semibold rounded-xl text-xs px-3.5 py-2 flex items-center gap-2 shadow-2xs transition-all cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed page-header-button'
    }
  >
    {Icon && <Icon className={`w-4 h-4 ${iconClassName} page-header-button__icon`} />}
    <span className="page-header-button__text">{children}</span>
  </button>
);
