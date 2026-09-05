import React, { forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';
import { AlertTriangle, CheckCircle2 } from './icons/FlowbiteIcons';

export interface FloatingTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string | boolean;
  success?: string | boolean;
  helperText?: string;
  bgMode?: 'modal' | 'page' | 'drawer' | 'card';
  containerClassName?: string;
}

export const FloatingTextarea = forwardRef<HTMLTextAreaElement, FloatingTextareaProps>(
  (
    {
      label,
      error,
      success,
      helperText,
      bgMode = 'modal',
      containerClassName = '',
      className = '',
      disabled,
      id,
      placeholder: _ignoredPlaceholder,
      value,
      defaultValue,
      rows = 3,
      ...props
    },
    ref
  ) => {
    const textareaId = id || `floating-textarea-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const hasError = Boolean(error);
    const errorMessage = typeof error === 'string' ? error : undefined;
    const hasSuccess = !hasError && Boolean(success);
    const successMessage = typeof success === 'string' ? success : undefined;

    const bgToken =
      bgMode === 'page'
        ? 'bg-white dark:bg-gray-900'
        : bgMode === 'card'
        ? 'bg-gray-50 dark:bg-gray-800'
        : 'bg-white dark:bg-gray-800';

    const borderAndFocusColor = hasError
      ? 'border-red-600 dark:border-red-500 focus:border-red-600 dark:focus:border-red-500 text-red-900 dark:text-white'
      : hasSuccess
      ? 'border-green-600 dark:border-green-500 focus:border-green-600 dark:focus:border-green-500 text-green-900 dark:text-white'
      : 'border-gray-300 dark:border-gray-600 focus:border-blue-600 dark:focus:border-blue-500 text-gray-900 dark:text-white';

    const labelColor = hasError
      ? 'text-red-600 dark:text-red-500 peer-focus:text-red-600 peer-focus:dark:text-red-500'
      : hasSuccess
      ? 'text-green-600 dark:text-green-500 peer-focus:text-green-600 peer-focus:dark:text-green-500'
      : 'text-gray-500 dark:text-gray-400 peer-focus:text-blue-600 peer-focus:dark:text-blue-500';

    const disabledClasses = disabled
      ? 'disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/90 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:border-gray-200 dark:disabled:border-gray-700'
      : '';

    const hasExplicitValue = value !== undefined && value !== '' && value !== null;

    const labelTransform = hasExplicitValue
      ? '-translate-y-4 scale-75 top-2'
      : '-translate-y-4 scale-75 top-2 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-3 peer-placeholder-shown:top-0 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4';

    return (
      <div className={twMerge('w-full min-w-0', containerClassName)}>
        <div className="relative">
          <textarea
            ref={ref}
            id={textareaId}
            disabled={disabled}
            placeholder=" "
            value={value}
            defaultValue={defaultValue}
            rows={rows}
            className={twMerge(
              'block px-2.5 pb-2.5 pt-4 w-full text-sm bg-transparent rounded-lg border appearance-none focus:outline-none focus:ring-0 peer transition-all duration-200 resize-y',
              borderAndFocusColor,
              disabledClasses,
              className
            )}
            {...props}
          />
          <label
            htmlFor={textareaId}
            className={twMerge(
              'floating-label absolute text-sm duration-300 transform origin-[0] px-2 peer-focus:px-2 start-2 pointer-events-none transition-all z-10',
              labelTransform,
              bgToken,
              disabled ? 'text-gray-400 dark:text-gray-500' : labelColor
            )}
          >
            {label}
          </label>
        </div>

        {/* Validation Error / Success / Helper Text */}
        {errorMessage ? (
          <p id={`${textareaId}-error`} className="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1 font-medium">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {errorMessage}
          </p>
        ) : successMessage ? (
          <p id={`${textareaId}-success`} className="mt-1.5 text-xs text-green-600 dark:text-green-500 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {successMessage}
          </p>
        ) : helperText ? (
          <p id={`${textareaId}-helper`} className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

FloatingTextarea.displayName = 'FloatingTextarea';
