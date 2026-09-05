import React, { forwardRef } from 'react';
import { AlertTriangle } from './icons/FlowbiteIcons';
import { Textarea as FlowbiteTextarea, Label as FlowbiteLabel } from 'flowbite-react';
import { FloatingTextarea } from './FloatingTextarea';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string | boolean;
  success?: string | boolean;
  helperText?: string;
  fullWidth?: boolean;
  variant?: 'standard' | 'floating';
  bgMode?: 'modal' | 'page' | 'drawer' | 'card';
}

const textareaTheme = {
  base: "block w-full rounded-lg border text-sm disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-400 disabled:border-gray-300 dark:disabled:border-gray-600 disabled:opacity-100 transition-colors",
  colors: {
    gray: "bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500",
    failure: "border-red-500 bg-red-50 text-red-900 placeholder-red-700 focus:border-red-500 focus:ring-red-500 dark:border-red-400 dark:bg-red-100 dark:focus:border-red-500 dark:focus:ring-red-500",
    success: "border-green-500 bg-green-50 text-green-900 placeholder-green-700 focus:border-green-500 focus:ring-green-500 dark:border-green-400 dark:bg-green-100 dark:focus:border-green-500 dark:focus:ring-green-500",
  },
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      success,
      helperText,
      fullWidth = true,
      className = '',
      disabled,
      id,
      color,
      variant = 'floating',
      bgMode = 'modal',
      placeholder,
      rows = 3,
      ...props
    },
    ref
  ) => {
    if (label && variant === 'floating') {
      return (
        <FloatingTextarea
          ref={ref}
          id={id}
          label={label}
          disabled={disabled}
          error={error}
          success={success}
          helperText={helperText}
          bgMode={bgMode}
          rows={rows}
          placeholder={placeholder || ' '}
          className={className}
          containerClassName={fullWidth ? 'w-full min-w-0' : 'inline-block'}
          {...props}
        />
      );
    }
    const textareaId = id || (label ? `textarea-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
    const hasError = Boolean(error);
    const errorMessage = typeof error === 'string' ? error : undefined;

    return (
      <div className={`${fullWidth ? 'w-full' : 'inline-block'} textarea`}>
        {label && (
          // mb-2/mt-2 match Flowbite's own canonical form spacing (27 Aug 2026, same report
          // as Input.tsx's identical fix - see that file's comment for the full why).
          <div className="mb-2 block">
            <FlowbiteLabel
              htmlFor={textareaId}
              className="text-xs font-semibold text-slate-700 dark:text-slate-200 textarea__label"
            >
              {label}
            </FlowbiteLabel>
          </div>
        )}
        <FlowbiteTextarea
          ref={ref}
          id={textareaId}
          disabled={disabled}
          theme={textareaTheme as any}
          color={hasError ? 'failure' : (color as any)}
          className={`w-full ${className} textarea__field form-field__textarea`}
          {...(props as any)}
        />
        {errorMessage ? (
          <p id={`${textareaId}-error`} className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1 textarea__error">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {errorMessage}
          </p>
        ) : helperText ? (
          <p id={`${textareaId}-helper`} className="mt-2 text-xs text-slate-500 dark:text-slate-400 textarea__helper">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
