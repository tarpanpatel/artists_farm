import React, { forwardRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Textarea as FlowbiteTextarea, Label as FlowbiteLabel } from 'flowbite-react';

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
      color,
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
          <div className="mb-1 block">
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
          color={hasError ? 'failure' : (color as any)}
          className={`
            w-full ${className} textarea__field form-field__textarea
          `}
          {...(props as any)}
        />
        {errorMessage ? (
          <p id={`${textareaId}-error`} className="mt-1 text-xs text-red-600 dark:text-red-400 flex items-center gap-1 textarea__error">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {errorMessage}
          </p>
        ) : helperText ? (
          <p id={`${textareaId}-helper`} className="mt-1 text-xs text-slate-500 dark:text-slate-400 textarea__helper">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
