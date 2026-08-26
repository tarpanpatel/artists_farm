import React, { forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';
import { AlertTriangle, CheckCircle2 } from './icons/FlowbiteIcons';
import { TextInput as FlowbiteTextInput, Label as FlowbiteLabel } from 'flowbite-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  labelClassName?: string;
  error?: string | boolean;
  /**
   * Real-time positive validation (Flowbite's success form-validation state - see
   * https://github.com/themesberg/flowbite/blob/main/content/components/forms.md) - a green
   * border/ring plus a green checkmark message, for confirming something is valid as the user
   * types (e.g. "Passcodes match") rather than only ever flagging what's wrong. Ignored while
   * `error` is also set - an error always wins visually.
   */
  success?: string | boolean;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

// BUG (found 27 Aug 2026, live on the login screen's phone field): flowbite-react's own
// <TextInput> applies its `className` prop to the OUTER WRAPPER <div>, never to the actual
// <input> element - the input's classes come ENTIRELY from the `theme` prop
// (node_modules/flowbite-react/dist/components/TextInput/TextInput.js: `twMerge(theme.base,
// className)` on the wrapper div; the <input> itself is built from `theme.field.input.*` with
// no `className` folded in at all). So every custom className every caller of this shared Input
// ever passed - `pl-16` to clear a wide custom leftIcon, `font-mono tracking-[0.25em]`, etc. -
// was silently landing on the wrong DOM node. Confirmed live: the login screen's phone field
// couldn't clear its own "+91" badge because `pl-16` never reached the input, which stayed
// stuck at this file's old fixed `ps-10` with no way for a caller to override it.
// Fixed by building the input's `theme.field.input.base` per-render (buildInputTheme below),
// folding the caller's className into it via `twMerge` so a caller's own `pl-16` correctly wins
// over the `pl-10`/`pr-10` defaults applied here when leftIcon/rightIcon are present, instead of
// both classes existing simultaneously with the winner left to arbitrary Tailwind generation
// order. leftIcon is also rendered as a manually-positioned overlay now (mirroring rightIcon,
// just below) instead of being routed through Flowbite's own `icon` prop slot - that slot is
// sized for one small icon and is exactly what was clamping every caller to a fixed `ps-10`
// with no way out. The unused `icon` prop (nothing in this app ever passed it - checked) was
// dropped along with that routing rather than left declared-but-dead.
const buildInputTheme = (className: string, hasLeftIcon: boolean, hasRightIcon: boolean) => ({
  field: {
    input: {
      base: twMerge(
        "block w-full border text-sm rounded-lg disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-400 disabled:border-gray-300 dark:disabled:border-gray-600 disabled:opacity-100 transition-colors",
        hasLeftIcon ? "pl-10" : "",
        hasRightIcon ? "pr-10" : "",
        className
      ),
      colors: {
        gray: "bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500",
        failure: "border-red-500 bg-red-50 text-red-900 placeholder-red-700 focus:border-red-500 focus:ring-red-500 dark:border-red-400 dark:bg-red-100 dark:focus:border-red-500 dark:focus:ring-red-500",
        success: "border-green-500 bg-green-50 text-green-900 placeholder-green-700 focus:border-green-500 focus:ring-green-500 dark:border-green-400 dark:bg-green-100 dark:focus:border-green-500 dark:focus:ring-green-500",
      },
    },
  },
});

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
      color,
      placeholder,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? `input-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : undefined);
    const hasError = Boolean(error);
    const errorMessage = typeof error === 'string' ? error : undefined;
    const hasSuccess = !hasError && Boolean(success);
    const successMessage = typeof success === 'string' ? success : undefined;

    const dynamicTheme = buildInputTheme(className, Boolean(leftIcon), Boolean(rightIcon));

    return (
      <div className={`app-input-wrapper ${fullWidth ? 'w-full min-w-0' : 'inline-block'} input`}>
        {label && (
          // mb-2 matches Flowbite's own canonical form spacing (their real forms.md/
          // application-ui examples all use `mb-2` between a label and its input, not the
          // tighter mb-1.5 this used to have - found 27 Aug 2026, user report: "Form Label
          // and instruction below fields look not in right padding, refer to flowbite forms").
          <div className="mb-2 block">
            <FlowbiteLabel
              htmlFor={inputId}
              className={`app-label text-xs font-semibold text-slate-700 dark:text-slate-200 ${labelClassName || ''} input__label`}
            >
              {label}
            </FlowbiteLabel>
          </div>
        )}
        <div className="input__field-wrapper relative flex items-center">
          {leftIcon && (
            <div className="input__icon input__icon--left absolute left-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500 z-10">
              {leftIcon}
            </div>
          )}
          <FlowbiteTextInput
            ref={ref}
            id={inputId}
            disabled={disabled}
            placeholder={placeholder}
            color={hasError ? 'failure' : hasSuccess ? 'success' : (color as any)}
            theme={dynamicTheme as any}
            className="w-full h-10"
            {...(props as any)}
          />
          {rightIcon && (
            <div className="input__icon input__icon--right absolute right-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500 z-10">
              {rightIcon}
            </div>
          )}
        </div>
        {/* mt-2 matches Flowbite's own canonical helper-text spacing (mt-1 was tighter than
            their real forms.md examples - same 27 Aug 2026 report as the label's mb-2 above). */}
        {errorMessage ? (
          <p id={`${inputId}-error`} className="app-error-text mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1 input__error">
            <AlertTriangle className="w-3.5 h-3.5" /> {errorMessage}
          </p>
        ) : successMessage ? (
          <p id={`${inputId}-success`} className="app-success-text mt-2 text-xs text-green-600 dark:text-green-500 flex items-center gap-1 input__success">
            <CheckCircle2 className="w-3.5 h-3.5" /> {successMessage}
          </p>
        ) : helperText ? (
          <p id={`${inputId}-helper`} className="app-helper-text mt-2 text-xs text-slate-500 dark:text-slate-400 input__helper">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
