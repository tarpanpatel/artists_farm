import React from 'react';
import { Button as FlowbiteButton, createTheme } from 'flowbite-react';

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

// App-specific color/size tokens layered onto Flowbite's Button engine (theme
// prop, per flowbite-react's documented customization API) so every existing
// call site keeps its current variant/size names untouched, while rendering,
// focus-ring/disabled handling, and ref forwarding are genuinely Flowbite's,
// not hand-rolled. Colors are literal stock Tailwind/Flowbite tokens (19 Aug
// 2026: per-tenant CSS-variable branding was deliberately dropped in favor of
// one consistent Flowbite look site-wide - see theme-overrides.css's removal
// from index.css).
const buttonTheme = createTheme({
  size: {
    xs: 'text-[11px] px-2.5 h-7',
    sm: 'text-xs px-3 h-8',
    md: 'text-sm px-4 h-10',
    lg: 'text-base px-5 h-12',
  },
  color: {
    primary:
      'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-800 shadow-sm hover:shadow',
    secondary:
      'bg-white border border-gray-200 hover:bg-gray-50 active:bg-gray-100 text-gray-700 focus:ring-4 focus:ring-gray-100 shadow-xs hover:shadow-sm dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 dark:text-gray-300 dark:focus:ring-gray-700',
    tertiary:
      'text-gray-900 bg-gray-100 hover:bg-gray-200 focus:ring-4 focus:ring-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white',
    success:
      'text-white bg-green-600 hover:bg-green-700 active:bg-green-800 focus:ring-4 focus:ring-green-300 dark:focus:ring-green-800 shadow-sm',
    danger:
      'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white focus:ring-4 focus:ring-red-300 dark:focus:ring-red-800 shadow-sm',
    warning:
      'text-white bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 focus:ring-4 focus:ring-yellow-300 dark:focus:ring-yellow-900 shadow-sm',
    dark:
      'text-white bg-gray-800 hover:bg-gray-900 focus:ring-4 focus:ring-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:focus:ring-gray-700',
    link:
      'text-blue-600 hover:text-blue-800 dark:text-blue-500 dark:hover:text-blue-400 underline focus:ring-0 p-0 h-auto active:scale-100',
    ghost:
      'bg-transparent hover:bg-gray-100 active:bg-gray-200 text-gray-700 focus:ring-4 focus:ring-gray-100 border border-transparent dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:ring-gray-700',
  },
});

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
  const markerClasses = `app-btn app-btn-${variant} app-btn-${size}`;

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      className: [markerClasses, className, (children.props as any)?.className].filter(Boolean).join(' '),
      ...props,
    });
  }

  return (
    <FlowbiteButton
      theme={buttonTheme}
      color={variant}
      size={size}
      disabled={disabled}
      fullSized={block}
      className={`${markerClasses} button gap-2 cursor-pointer transition-all duration-200 active:scale-[0.98] select-none ${className}`}
      {...props}
    >
      {leftIcon && <span className="button__icon flex items-center">{leftIcon}</span>}
      {children}
      {rightIcon && <span className="button__icon flex items-center">{rightIcon}</span>}
    </FlowbiteButton>
  );
};
