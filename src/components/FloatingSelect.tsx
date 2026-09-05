import React, { forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';
import { AlertTriangle, ChevronDown } from './icons/FlowbiteIcons';

export interface FloatingSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string | boolean;
  helperText?: string;
  bgMode?: 'modal' | 'page' | 'drawer' | 'card';
  containerClassName?: string;
  options?: Array<{ value: string | number; label: string; disabled?: boolean }>;
  children?: React.ReactNode;
}

export const FloatingSelect = forwardRef<HTMLSelectElement, FloatingSelectProps>(
  (
    {
      label,
      error,
      helperText,
      bgMode = 'modal',
      containerClassName = '',
      className = '',
      disabled,
      id,
      options,
      children,
      value,
      defaultValue,
      ...props
    },
    ref
  ) => {
    const selectId = id || `floating-select-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const hasError = Boolean(error);
    const errorMessage = typeof error === 'string' ? error : undefined;

    const bgToken =
      bgMode === 'page'
        ? 'bg-white dark:bg-gray-900'
        : bgMode === 'card'
        ? 'bg-gray-50 dark:bg-gray-800'
        : 'bg-white dark:bg-gray-800';

    const borderAndFocusColor = hasError
      ? 'border-red-600 dark:border-red-500 focus:border-red-600 dark:focus:border-red-500 text-red-900 dark:text-white'
      : 'border-gray-300 dark:border-gray-600 focus:border-blue-600 dark:focus:border-blue-500 text-gray-900 dark:text-white';

    const labelColor = hasError
      ? 'text-red-600 dark:text-red-500'
      : 'text-gray-500 dark:text-gray-400 peer-focus:text-blue-600 peer-focus:dark:text-blue-500';

    const disabledClasses = disabled
      ? 'disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/90 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:border-gray-200 dark:disabled:border-gray-700'
      : '';

    return (
      <div className={twMerge('w-full min-w-0', containerClassName)}>
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            value={value}
            defaultValue={defaultValue}
            className={twMerge(
              'block px-2.5 pb-2.5 pt-4 pe-8 w-full text-sm bg-transparent rounded-lg border appearance-none focus:outline-none focus:ring-0 peer transition-all duration-200 cursor-pointer',
              borderAndFocusColor,
              disabledClasses,
              className
            )}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option key={String(opt.value)} value={opt.value} disabled={opt.disabled} className="dark:bg-gray-800">
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <label
            htmlFor={selectId}
            className={twMerge(
              'floating-label absolute text-sm duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] px-2 start-2 pointer-events-none transition-all',
              bgToken,
              disabled ? 'text-gray-400 dark:text-gray-500' : labelColor
            )}
          >
            {label}
          </label>
          <div className="absolute inset-y-0 end-0 pe-2.5 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>

        {errorMessage ? (
          <p id={`${selectId}-error`} className="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1 font-medium">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {errorMessage}
          </p>
        ) : helperText ? (
          <p id={`${selectId}-helper`} className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

FloatingSelect.displayName = 'FloatingSelect';
