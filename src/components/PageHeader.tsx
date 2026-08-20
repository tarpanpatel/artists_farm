import React from 'react';
import { Button } from './Button';

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
  <div className="gen_page_head flex flex-row items-center justify-between gap-4 pb-4 mb-4 border-b border-gray-200 dark:border-gray-700 page-header">
    <div className="min-w-0 flex-1 page-header__left">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight sm:text-2xl page-header__title">
        {title}
      </h1>
      {subtitle && (
        <p className="text-sm text-gray-500 dark:text-gray-400 font-normal mt-1 page-header__subtitle">
          {subtitle}
        </p>
      )}
    </div>
    {children && <div className="flex flex-wrap items-center gap-2.5 shrink-0 page-header__actions">{children}</div>}
  </div>
);

interface PageHeaderButtonProps {
  onClick: () => void;
  icon?: React.ElementType;
  iconClassName?: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

/**
 * The standard primary action button that goes inside a PageHeader (e.g.
 * "Add Booking"). Matches Flowbite's exact button styling primitives.
 */
export const PageHeaderButton: React.FC<PageHeaderButtonProps> = ({
  onClick,
  icon: Icon,
  iconClassName = '',
  children,
  variant = 'primary',
  disabled = false,
}) => (
  <Button
    variant={variant === 'primary' ? 'primary' : 'secondary'}
    size="sm"
    onClick={onClick}
    disabled={disabled}
    leftIcon={Icon && <Icon className={`w-4 h-4 ${iconClassName} page-header-button__icon`} />}
    className="page-header-button"
  >
    <span className="page-header-button__text">{children}</span>
  </Button>
);
