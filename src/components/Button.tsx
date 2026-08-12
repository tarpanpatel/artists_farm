import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'success' | 'danger' | 'warning' | 'dark' | 'link' | 'ghost';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  asChild?: boolean;
}

const baseClasses =
  'font-medium leading-5 rounded-lg text-sm outline-none inline-flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer active:scale-[0.98] select-none';

const variantClasses: Record<ButtonVariant, string> = {
    primary:
      'bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] active:bg-[var(--btn-primary-active)] text-[var(--btn-primary-text)] focus:ring-4 focus:ring-[var(--btn-primary-ring)] shadow-sm hover:shadow',
    secondary:
      'bg-[var(--btn-secondary-bg)] border border-[var(--btn-secondary-border)] hover:bg-[var(--btn-secondary-hover)] active:bg-[var(--btn-secondary-active)] text-[var(--btn-secondary-text)] focus:ring-4 focus:ring-[var(--btn-secondary-ring)] shadow-xs hover:shadow-sm',
    tertiary:
      'text-slate-900 bg-slate-100 hover:bg-slate-200 focus:ring-4 focus:ring-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-white',
    success:
      'text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 focus:ring-4 focus:ring-emerald-500/30 shadow-sm',
    danger:
      'bg-[var(--btn-danger-bg)] hover:bg-[var(--btn-danger-hover)] active:bg-[var(--btn-danger-active)] text-[var(--btn-danger-text)] focus:ring-4 focus:ring-[var(--btn-danger-ring)] shadow-sm',
    warning:
      'text-white bg-amber-500 hover:bg-amber-600 active:bg-amber-700 focus:ring-4 focus:ring-amber-400/30 shadow-sm',
    dark:
      'text-white bg-slate-800 hover:bg-slate-900 focus:ring-4 focus:ring-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600',
    link:
      'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline focus:ring-0 p-0 h-auto active:scale-100',
    ghost:
      'bg-[var(--btn-ghost-bg)] hover:bg-[var(--btn-ghost-hover)] active:bg-[var(--btn-ghost-active)] text-[var(--btn-ghost-text)] focus:ring-4 focus:ring-[var(--btn-ghost-ring)] border border-transparent',
};

const sizeClasses: Record<ButtonSize, string> = {
    xs: 'text-[11px] px-2.5 h-7',
    sm: 'text-xs px-3 h-8',
    md: 'text-sm px-4 h-10',
    lg: 'text-base px-5 h-12',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  block = false,
  leftIcon,
  rightIcon,
  asChild = false,
  className = '',
  children,
  disabled,
  ...props
}) => {
  const classes = [
    'app-btn',
    `app-btn-${variant}`,
    `app-btn-${size}`,
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    block ? 'w-full' : '',
    disabled ? 'opacity-50 cursor-not-allowed' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      className: [classes, (children.props as any)?.className].filter(Boolean).join(' '),
      ...props,
    });
  }

  return (
    <button className={classes + ' button'} disabled={disabled} {...props}>
      {leftIcon && <span className="button__icon flex items-center">{leftIcon}</span>}
      {children}
      {rightIcon && <span className="button__icon flex items-center">{rightIcon}</span>}
    </button>
  );
};
