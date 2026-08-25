import React, { forwardRef } from 'react';
import { AlertTriangle } from './icons/FlowbiteIcons';
import { TextInput as FlowbiteTextInput, Label as FlowbiteLabel } from 'flowbite-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  labelClassName?: string;
  error?: string | boolean;
  helperText?: string;
  leftIcon?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const inputTheme = {
  field: {
    input: {
      base: "block w-full border text-sm rounded-lg disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-400 disabled:border-gray-300 dark:disabled:border-gray-600 disabled:opacity-100 transition-colors",
      colors: {
        gray: "bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500",
        failure: "border-red-500 bg-red-50 text-red-900 placeholder-red-700 focus:border-red-500 focus:ring-red-500 dark:border-red-400 dark:bg-red-100 dark:focus:border-red-500 dark:focus:ring-red-500",
        success: "border-green-500 bg-green-50 text-green-900 placeholder-green-700 focus:border-green-500 focus:ring-green-500 dark:border-green-400 dark:bg-green-100 dark:focus:border-green-500 dark:focus:ring-green-500",
      },
      withIcon: {
        on: "ps-10",
        off: "",
      },
    },
  },
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      labelClassName,
      error,
      helperText,
      leftIcon,
      icon,
      rightIcon,
      fullWidth = true,
      className = '',
      disabled,
      id,
      color,
      placeholder,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? `input-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : undefined);
    const hasError = Boolean(error);
    const errorMessage = typeof error === 'string' ? error : undefined;

    // Resolve icon component for Flowbite TextInput
    const resolvedIcon = icon || (leftIcon && React.isValidElement(leftIcon) ? () => leftIcon as React.ReactElement : undefined);

    return (
      <div className={`app-input-wrapper ${fullWidth ? 'w-full' : 'inline-block'} input`}>
        {label && (
          <div className="mb-1.5 block">
            <FlowbiteLabel
              htmlFor={inputId}
              className={`app-label text-xs font-semibold text-slate-700 dark:text-slate-200 ${labelClassName || ''} input__label`}
            >
              {label}
            </FlowbiteLabel>
          </div>
        )}
        <div className="input__field-wrapper relative flex items-center">
          <FlowbiteTextInput
            ref={ref}
            id={inputId}
            disabled={disabled}
            placeholder={placeholder}
            icon={resolvedIcon}
            color={hasError ? 'failure' : (color as any)}
            theme={inputTheme as any}
            className={`w-full h-10 ${className}`}
            {...(props as any)}
          />
          {rightIcon && (
            <div className="input__icon input__icon--right absolute right-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500 z-10">
              {rightIcon}
            </div>
          )}
        </div>
        {errorMessage ? (
          <p id={`${inputId}-error`} className="app-error-text mt-1 text-xs text-red-600 dark:text-red-400 flex items-center gap-1 input__error">
            <AlertTriangle className="w-3.5 h-3.5" /> {errorMessage}
          </p>
        ) : helperText ? (
          <p id={`${inputId}-helper`} className="app-helper-text mt-1 text-xs text-slate-500 dark:text-slate-400 input__helper">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
