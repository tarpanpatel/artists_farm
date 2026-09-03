import React, { forwardRef } from 'react';
import { AlertTriangle } from './icons/FlowbiteIcons';
import { FileInput as FlowbiteFileInput, Label as FlowbiteLabel } from 'flowbite-react';
import { compressImageFile } from '../utils/imageCompressor';

/**
 * Site-wide file upload input (added 26 Aug 2026, explicit request: "Only use flowbite elements
 * through out the site" for every file upload - see
 * https://github.com/themesberg/flowbite/blob/main/content/forms/file-input.md). Wraps
 * flowbite-react's own <FileInput> exactly the way Input.tsx/Textarea.tsx wrap their Flowbite
 * counterparts - never hand-roll a hidden <input type="file"> behind a custom button/label/
 * dropzone again; use this component instead.
 *
 * A preview (thumbnail image, "N files attached" count, etc.) is each call site's own concern -
 * render it as a sibling below/after this component. That's still "only Flowbite elements" for
 * the actual form control; only the *input* itself needs to stop being reinvented per-screen.
 */
export interface FileInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  error?: string | boolean;
  helperText?: string;
  fullWidth?: boolean;
  /** Flowbite's own size scale for the file-choose button (default 'md'). */
  sizing?: 'sm' | 'md' | 'lg';
  /** Automatically downscale large camera photos on the client before passing to onChange (default true) */
  autoCompressImage?: boolean;
}

// Same blue focus color Input.tsx/Textarea.tsx already use for their "gray" variant, in place of
// Flowbite's default primary-token focus ring - keeps every form control on one focus color.
const fileInputTheme = {
  colors: {
    gray: "border-gray-300 bg-gray-50 text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500",
    failure: "border-red-500 bg-red-50 text-red-900 placeholder-red-700 focus:border-red-500 focus:ring-red-500 dark:border-red-400 dark:bg-red-100 dark:focus:border-red-500 dark:focus:ring-red-500",
  },
};

export const FileInput = forwardRef<HTMLInputElement, FileInputProps>(
  ({ label, error, helperText, fullWidth = true, className = '', disabled, id, color, autoCompressImage = true, onChange, ...props }, ref) => {
    const inputId = id || (label ? `file-input-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : undefined);
    const hasError = Boolean(error);
    const errorMessage = typeof error === 'string' ? error : undefined;

    const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (autoCompressImage && e.target.files && e.target.files.length > 0) {
        const files = Array.from(e.target.files);
        const hasLargeImage = files.some(f => f.type.startsWith('image/') && f.size > 350 * 1024);
        if (hasLargeImage) {
          try {
            const compressedFiles = await Promise.all(
              files.map(f => compressImageFile(f))
            );
            if (typeof DataTransfer !== 'undefined') {
              const dt = new DataTransfer();
              compressedFiles.forEach(f => dt.items.add(f));
              e.target.files = dt.files;
            }
          } catch (err) {
            console.warn('[FileInput] Auto image compression failed, proceeding with original:', err);
          }
        }
      }
      onChange?.(e);
    };

    return (
      <div className={`app-file-input-wrapper ${fullWidth ? 'w-full min-w-0' : 'inline-block'} file-input`}>
        {label && (
          <div className="mb-1.5 block">
            <FlowbiteLabel
              htmlFor={inputId}
              className="app-label text-xs font-semibold text-slate-700 dark:text-slate-200 file-input__label"
            >
              {label}
            </FlowbiteLabel>
          </div>
        )}
        <FlowbiteFileInput
          ref={ref}
          id={inputId}
          disabled={disabled}
          theme={fileInputTheme as any}
          color={hasError ? 'failure' : (color as any)}
          className={`w-full ${className} file-input__field`}
          onChange={handleChange}
          {...(props as any)}
        />
        {errorMessage ? (
          <p id={`${inputId}-error`} className="app-error-text mt-1 text-xs text-red-600 dark:text-red-400 flex items-center gap-1 file-input__error">
            <AlertTriangle className="w-3.5 h-3.5" /> {errorMessage}
          </p>
        ) : helperText ? (
          <p id={`${inputId}-helper`} className="app-helper-text mt-1 text-xs text-slate-500 dark:text-slate-400 file-input__helper">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

FileInput.displayName = 'FileInput';
