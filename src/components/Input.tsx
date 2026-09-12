import React, { forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';
import { AlertTriangle, CheckCircle2 } from './icons/FlowbiteIcons';
import { FloatingInput, FloatingBgMode } from './FloatingInput';
import { FieldHelpPopover, FieldHelpText, useFieldHelpMode } from './FieldHelpPopover';

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
  bgMode?: FloatingBgMode;
  color?: string;
  // See FloatingInput's doc comment - same opt-out, forwarded through
  // unchanged on the floating (default) path, applied directly below on the
  // standard-fallback path since that one renders its own native <input>.
  allowNegative?: boolean;
  disabledVariant?: 'transparent' | 'badge' | 'inset';
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
      allowNegative = false,
      disabledVariant,
      ...props
    },
    ref
  ) => {
    // If floating variant and label is provided, use Flowbite Floating Label
    // Read before the early return below - hooks must run unconditionally on every render path.
    const helpMode = useFieldHelpMode();

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
          allowNegative={allowNegative}
          disabledVariant={disabledVariant}
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
      ? 'disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:text-gray-900 dark:disabled:text-gray-300 disabled:border-gray-300 dark:disabled:border-gray-600'
      : '';

    // Same negative-number guard as FloatingInput (see its doc comment) -
    // this standard-fallback branch renders its own native <input> instead
    // of delegating to FloatingInput, so it needs its own copy of the guard
    // rather than inheriting one.
    const blockNegative = props.type === 'number' && !allowNegative;
    const effectiveMin = blockNegative && props.min === undefined ? 0 : props.min;
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (blockNegative && (e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract')) {
        e.preventDefault();
      }
      props.onKeyDown?.(e);
    };
    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      if (blockNegative && e.clipboardData.getData('text').includes('-')) {
        e.preventDefault();
      }
      props.onPaste?.(e);
    };

    return (
      <div className={`app-input-wrapper ${fullWidth ? 'w-full min-w-0' : 'inline-block'} input`}>
        {label && (
          <div className="mb-1.5 flex items-center gap-1.5">
            <label
              htmlFor={inputId}
              className={`app-label text-xs font-semibold text-slate-700 dark:text-slate-200 ${labelClassName || ''} input__label`}
            >
              {label}
            </label>
            {helpMode === 'popover' && helperText && !errorMessage && !successMessage && (
              <FieldHelpPopover content={helperText} title={label} />
            )}
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
            min={effectiveMin}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
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
        ) : helpMode === 'inline' && helperText ? (
          <FieldHelpText content={helperText} id={`${inputId}-helper`} />
        ) : (!label && helperText) ? (
          <div id={`${inputId}-helper`} className="app-helper-text mt-1.5 flex items-center input__helper">
            <FieldHelpPopover content={helperText} title={label} />
          </div>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { FloatingInput, getBgToken } from './FloatingInput';
export type { FloatingInputProps, FloatingBgMode } from './FloatingInput';
export { FloatingSelect } from './FloatingSelect';
export type { FloatingSelectProps } from './FloatingSelect';
export { FloatingTextarea } from './FloatingTextarea';
export type { FloatingTextareaProps } from './FloatingTextarea';
