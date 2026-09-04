import React, { forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';
import { AlertTriangle, CheckCircle2 } from './icons/FlowbiteIcons';
import { FloatingInput } from './FloatingInput';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  labelClassName?: string;
  error?: string | boolean;
  success?: string | boolean;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  variant?: 'standard' | 'floating';
  bgMode?: 'modal' | 'page' | 'drawer' | 'card';
  color?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      labelClassName,
      error,
      success,
      helperText,
      leftIcon,
      rightIcon,
      fullWidth = true,
      className = '',
      disabled,
      id,
      color: _color,
      placeholder,
      variant = 'floating',
      bgMode = 'modal',
      ...props
    },
    ref
  ) => {
    // If floating variant and label is provided, use Flowbite Floating Label
    if (label && variant === 'floating') {
      return (
        <FloatingInput
          ref={ref}
          id={id}
          label={label}
          disabled={disabled}
          error={error}
          success={success}
          helperText={helperText}
          leftIcon={leftIcon}
          rightIcon={rightIcon}
          bgMode={bgMode}
          placeholder={placeholder || ' '}
          className={className}
          containerClassName={fullWidth ? 'w-full min-w-0' : 'inline-block'}
          {...props}
        />
      );
    }

    // Standard fallback when no label or variant="standard"
    const inputId = id || (label ? `input-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : undefined);
    const hasError = Boolean(error);
    const errorMessage = typeof error === 'string' ? error : undefined;
    const hasSuccess = !hasError && Boolean(success);
    const successMessage = typeof success === 'string' ? success : undefined;

    const borderAndFocusColor = hasError
      ? 'border-red-600 dark:border-red-500 focus:border-red-600 dark:focus:border-red-500 text-red-900 dark:text-white'
      : hasSuccess
      ? 'border-green-600 dark:border-green-500 focus:border-green-600 dark:focus:border-green-500 text-green-900 dark:text-white'
      : 'border-gray-300 dark:border-gray-600 focus:border-blue-600 dark:focus:border-blue-500 text-gray-900 dark:text-white';

    const disabledClasses = disabled
      ? 'disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800/90 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:border-gray-200 dark:disabled:border-gray-700'
      : '';

    return (
      <div className={`app-input-wrapper ${fullWidth ? 'w-full min-w-0' : 'inline-block'} input`}>
        {label && (
          <div className="mb-1.5 block">
            <label
              htmlFor={inputId}
              className={`app-label text-xs font-semibold text-slate-700 dark:text-slate-200 ${labelClassName || ''} input__label`}
            >
              {label}
            </label>
          </div>
        )}
        <div className="input__field-wrapper relative flex items-center">
          {leftIcon && (
            <div className="input__icon input__icon--left absolute left-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500 z-10">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            placeholder={placeholder}
            className={twMerge(
              'block w-full h-10 px-3 text-xs bg-white dark:bg-gray-800 border rounded-lg appearance-none focus:outline-none focus:ring-0 transition-colors',
              borderAndFocusColor,
              disabledClasses,
              leftIcon ? 'pl-9' : '',
              rightIcon ? 'pr-9' : '',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="input__icon input__icon--right absolute right-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500 z-10">
              {rightIcon}
            </div>
          )}
        </div>
        {errorMessage ? (
          <p id={`${inputId}-error`} className="app-error-text mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1 font-medium input__error">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {errorMessage}
          </p>
        ) : successMessage ? (
          <p id={`${inputId}-success`} className="app-success-text mt-1.5 text-xs text-green-600 dark:text-green-500 flex items-center gap-1 font-medium input__success">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {successMessage}
          </p>
        ) : helperText ? (
          <p id={`${inputId}-helper`} className="app-helper-text mt-1.5 text-xs text-slate-500 dark:text-slate-400 input__helper">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { FloatingInput } from './FloatingInput';
export type { FloatingInputProps } from './FloatingInput';
export { FloatingSelect } from './FloatingSelect';
export type { FloatingSelectProps } from './FloatingSelect';
export { FloatingTextarea } from './FloatingTextarea';
export type { FloatingTextareaProps } from './FloatingTextarea';
