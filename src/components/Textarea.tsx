import React, { forwardRef } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string | boolean;
  helperText?: string;
  fullWidth?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      helperText,
      fullWidth = true,
      className = '',
      disabled,
      id,
      ...props
    },
    ref
  ) => {
    const textareaId = id || (label ? `textarea-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
    const hasError = Boolean(error);
    const errorMessage = typeof error === 'string' ? error : undefined;

    return (
      <div className={`${fullWidth ? 'w-full' : 'inline-block'} textarea`}>
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5 textarea__label"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={
            errorMessage ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined
          }
          className={`
              w-full px-3.5 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 outline-none
              bg-[var(--input-bg-default)] text-[var(--input-text-default)] placeholder:text-slate-400 dark:placeholder:text-slate-500
              border ${
                disabled
                  ? 'border-[var(--input-border-disabled)] bg-[var(--input-bg-disabled)] text-[var(--input-text-disabled)] cursor-not-allowed opacity-60'
                  : hasError
                  ? 'border-[var(--input-border-error)] bg-[var(--input-bg-error)] focus:ring-4 focus:ring-[var(--input-ring-error)]'
                  : 'border-[var(--input-border-default)] hover:border-slate-400 dark:hover:border-slate-500 focus:border-[var(--input-border-focus)] focus:ring-4 focus:ring-[var(--input-ring-focus)]'
              }
              ${className}
              textarea__field
            `}
          {...props}
        />
        {errorMessage ? (
          <p id={`${textareaId}-error`} className="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1 textarea__error">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {errorMessage}
          </p>
        ) : helperText ? (
          <p id={`${textareaId}-helper`} className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 textarea__helper">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
