import React from 'react';
import { Badge as FlowbiteBadge, createTheme } from 'flowbite-react';
import { Tooltip } from './Tooltip';

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  title?: string;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  children: React.ReactNode;
  className?: string;
}

const dotVariantClasses: Record<BadgeVariant, string> = {
  success: 'bg-green-500',
  danger: 'bg-red-500',
  warning: 'bg-yellow-500',
  info: 'bg-cyan-500',
  neutral: 'bg-gray-400',
};

// Literal stock Tailwind/Flowbite tokens (19 Aug 2026: per-tenant CSS-variable
// branding dropped in favor of one consistent Flowbite look site-wide).
const badgeTheme = createTheme({
  root: {
    base: 'app-badge inline-flex items-center gap-1.5 font-semibold rounded-full border shadow-2xs select-none tabular-nums',
    color: {
      success: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-300 dark:border-green-700',
      danger: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-300 dark:border-red-700',
      warning: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900 dark:text-yellow-300 dark:border-yellow-700',
      info: 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900 dark:text-cyan-300 dark:border-cyan-700',
      neutral: 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600',
    },
    size: {
      sm: 'text-[11px] px-2 py-0.5',
      md: 'text-xs px-2.5 py-0.5',
    },
  },
});

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'sm',
  dot = false,
  title,
  onClick,
  children,
  className = '',
}) => {
  const badge = (
    <FlowbiteBadge
      theme={badgeTheme}
      color={variant}
      size={size}
      onClick={onClick}
      className={`app-badge-${variant} badge ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotVariantClasses[variant]}`}
          aria-hidden="true"
        />
      )}
      {children}
    </FlowbiteBadge>
  );

  // `title` used to forward straight to the DOM (a native browser tooltip) -
  // DESIGN.md bans that everywhere. Wrapping here, once, fixes every caller
  // across the app automatically instead of chasing each <Badge title=...>
  // call site individually (found 22 Aug 2026 auditing Phase 5).
  return title ? <Tooltip content={title}>{badge}</Tooltip> : badge;
};
