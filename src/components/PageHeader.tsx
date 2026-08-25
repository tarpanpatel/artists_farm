import React from 'react';
import { Button } from './Button';
import { Popover } from './Popover';

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: string;
  // Right-side content - typically one <PageHeaderButton>, but any custom
  // action(s) can go here (e.g. multiple buttons, a status pill) and still
  // inherit the consistent title/subtitle/divider frame below.
  children?: React.ReactNode;
  // Deprecated, no longer has any effect (21 Aug 2026) - the bottom-border
  // divider was removed from PageHeader app-wide (see below), so there's
  // nothing left to suppress. Kept as an accepted-but-inert prop rather
  // than a breaking removal, since every existing call site still passes
  // it - safe to actually delete once nothing references it anymore.
  hideBorder?: boolean;
}

/**
 * Standard page-header frame: title + subtitle on the left, action(s) on the
 * right. This is the "Dashboard" header pattern (OperationalDashboard.tsx)
 * promoted to a shared component on 2026-08-10 so every page's header stays
 * in sync from one place instead of drifting the way Dashboard vs Bookings
 * did (card-wrapped, different button style, etc.) before this existed.
 *
 * Used to also render a bottom-border divider under the title/subtitle -
 * removed app-wide (21 Aug 2026, explicit request) rather than toggled per
 * page via `hideBorder`, since it read as a stray extra line on every page,
 * not just the ones that had already opted out with that prop.
 *
 * `subtitle` no longer renders as always-visible text under the title (23
 * Aug 2026, explicit request - "subtext should appear when clicked on help
 * icon"). It's now a "Help?" link next to the title that opens it in a
 * click-triggered Popover, matching the pattern a few pages (CashDrawerManager,
 * MiscChargesManagement) had already been hand-rolling inside their own
 * `title` prop - baking it into PageHeader itself means every page using
 * `subtitle` gets it for free and stays in sync, instead of each page
 * re-implementing its own "Help?" popover. Those two pages' existing
 * hand-rolled versions are untouched (they pass their description via
 * `title`, not `subtitle`) - harmless duplication of the same pattern, not
 * a conflict.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, children }) => (
  // flex-col on mobile, flex-row from sm: up (found 21 Aug 2026) - this was
  // always flex-row, so on a narrow phone a page with 2+ action buttons
  // (e.g. "Manage Custom Types" + "New Request") left the title/subtitle
  // column almost no room: min-w-0 flex-1 let it shrink indefinitely while
  // the shrink-0 buttons kept their full width, wrapping the title one or
  // two words per line instead of the buttons dropping to their own row.
  // RE-FIXED 25 Aug 2026: the 23 Aug "Help?" popover commit had silently
  // reverted this back to unconditional flex-row (edited from a stale
  // pre-21-Aug copy of this file) while this exact comment stayed put right
  // above the regressed class - reported as the Dashboard header's title,
  // "Help?" link, and action buttons all colliding on a real phone.
  <div className="gen_page_head flex flex-col items-start sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-4 page-header">
    <div className="min-w-0 flex-1 page-header__left">
      <div className="flex items-center flex-wrap gap-2 page-header__title-row">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight sm:text-2xl page-header__title">
          {title}
        </h1>
        {subtitle && (
          <Popover
            placement="bottom"
            trigger="click"
            title="About this page"
            content={
              <div className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed max-w-xs">
                {subtitle}
              </div>
            }
          >
            <button
              type="button"
              aria-label="About this page"
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer shrink-0 page-header__help-toggle"
            >
              Help?
            </button>
          </Popover>
        )}
      </div>
    </div>
    {children && <div className="flex flex-wrap items-center gap-2.5 sm:shrink-0 page-header__actions">{children}</div>}
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
