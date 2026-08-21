import React, { useEffect, useRef } from 'react';
import FlowbiteDateRangePicker from 'flowbite-datepicker/DateRangePicker';

interface DateRangePickerProps {
  checkinDate: string;
  checkoutDate: string;
  onCheckinChange: (date: string) => void;
  onCheckoutChange: (date: string) => void;
  fromPlaceholder?: string;
  toPlaceholder?: string;
  className?: string;
  label?: string;
  disabled?: boolean;
  // Optional legacy props for seamless compatibility
  isOpen?: boolean;
  onClose?: () => void;
  onClear?: () => void;
  blockedDates?: string[];
  heading?: string;
  description?: string;
  fromLabel?: string;
  toLabel?: string;
}

const CalendarIcon: React.FC = () => (
  <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 10h16m-8-3V4M7 7V4m10 3V4M5 20h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Zm3-7h.01v.01H8V13Zm4 0h.01v.01H12V13Zm4 0h.01v.01H16V13Zm-8 4h.01v.01H8V17Zm4 0h.01v.01H12V17Zm4 0h.01v.01H16V17Z" />
  </svg>
);

const fieldClass =
  'bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full ps-9 p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-400 disabled:border-gray-300 dark:disabled:border-gray-600 disabled:opacity-100 transition-colors';

function toIsoDate(date: number | Date | undefined): string {
  if (date === undefined) return '';
  const d = typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromIsoDate(value: string): Date | undefined {
  if (!value) return undefined;
  const parts = value.split(' ')[0].split('-');
  if (parts.length !== 3) return undefined;
  const [year, month, day] = parts.map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

/**
 * Checkin/checkout field built directly on flowbite-datepicker's own
 * DateRangePicker - the vanilla-JS library flowbite.com's own docs use for
 * their "Date Range Picker" example.
 *
 * Both inputs are deliberately readOnly + inputMode="none" (found 21 Aug
 * 2026) - the reference markup in flowbite's own component docs
 * (themesberg/flowbite content/components/datepicker.md) uses plain typeable
 * text inputs with no readonly attribute, but that lets a mobile OS keyboard
 * pop up alongside the calendar popover on focus, which fights the popover
 * for screen space and reads as "it's forcing me to type the date" even
 * though tapping a day cell always worked. readOnly still allows focus/
 * click/tap (Datepicker.js's onFocus/onClickInput handlers, which is what
 * actually opens the popover) and doesn't block arrow-key navigation inside
 * it - it only suppresses direct keyboard text entry, which is exactly the
 * "calendar-only" behavior wanted here.
 *
 * The library also ships no dedicated Close button in its footer (only
 * Today/Clear - confirmed against flowbite's own docs) - one is injected as
 * a real DOM button into each side's own popover footer right after
 * construction, since Picker's own constructor already synchronously builds
 * and appends its element before this effect's next line runs.
 */
export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  checkinDate,
  checkoutDate,
  onCheckinChange,
  onCheckoutChange,
  fromPlaceholder = 'Select date start',
  toPlaceholder = 'Select date end',
  className = '',
  label,
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const rangepickerRef = useRef<InstanceType<typeof FlowbiteDateRangePicker> | null>(null);
  const callbacksRef = useRef({ onCheckinChange, onCheckoutChange });
  callbacksRef.current = { onCheckinChange, onCheckoutChange };

  useEffect(() => {
    const container = containerRef.current;
    const startEl = startInputRef.current;
    const endEl = endInputRef.current;
    if (!container || !startEl || !endEl) return;

    const rangepicker = new FlowbiteDateRangePicker(container, {
      format: 'dd/mm/yyyy',
      autohide: false,
      todayBtn: true,
      clearBtn: true,
      todayHighlight: true,
      // Explicit, not relying on the library's own 'en' default - the footer's
      // "Today"/"Clear" button text only gets set when options.locale is
      // present (see picker/Picker.js's processPickerOptions), and that was
      // landing inconsistently for the Today button specifically (blank
      // button rendered before a working "Clear" button, found 20 Aug 2026).
      // Passing language here forces a full, deterministic locale object on
      // every internal options merge instead of depending on it surviving
      // untouched across the range-picker's own update()/render() calls.
      language: 'en',
    });
    rangepickerRef.current = rangepicker;

    // The library has no built-in "Close" button (checked flowbite's own
    // component docs 21 Aug 2026 - only Today/Clear exist in the footer) and
    // its two inputs are plain type="text" fields, so on mobile focusing
    // one to open the calendar also raises the OS keyboard, which visually
    // fights the popover and makes it look like typing is the only option.
    // Both fixed here: readOnly+inputMode="none" below stop the keyboard
    // (tap-to-pick-only, arrow-key/click selection inside the popover still
    // works - readonly doesn't block those), and this injects a real Close
    // button into each side's own footer (built once at construction, since
    // Picker's own constructor already synchronously creates+appends
    // picker.element to its container - see picker/Picker.js).
    rangepicker.datepickers.forEach((dp) => {
      const footerControls = dp.pickerElement?.querySelector('.datepicker-footer .datepicker-controls');
      if (!footerControls || footerControls.querySelector('.datepicker-close-btn')) return;
      footerControls.querySelectorAll('.today-btn, .clear-btn').forEach((btn) => {
        btn.classList.remove('w-1/2');
        btn.classList.add('flex-1');
      });
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = 'Close';
      closeBtn.className = 'datepicker-close-btn flex-1 text-body bg-neutral-secondary-medium border border-default-medium hover:bg-neutral-tertiary-medium focus:ring-4 focus:ring-neutral-tertiary font-medium rounded-base text-sm px-5 py-2 text-center';
      closeBtn.addEventListener('click', () => dp.hide());
      footerControls.appendChild(closeBtn);
    });

    const reportCurrentRange = () => {
      const [start, end] = rangepicker.dates;
      callbacksRef.current.onCheckinChange(toIsoDate(start));
      callbacksRef.current.onCheckoutChange(toIsoDate(end));
    };
    startEl.addEventListener('changeDate', reportCurrentRange);
    endEl.addEventListener('changeDate', reportCurrentRange);

    return () => {
      startEl.removeEventListener('changeDate', reportCurrentRange);
      endEl.removeEventListener('changeDate', reportCurrentRange);
      rangepicker.destroy();
      rangepickerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const rangepicker = rangepickerRef.current;
    if (!rangepicker) return;
    const [currentStart, currentEnd] = rangepicker.dates;
    if (toIsoDate(currentStart) === checkinDate && toIsoDate(currentEnd) === checkoutDate) return;

    rangepicker.setDates(
      fromIsoDate(checkinDate) ?? { clear: true },
      fromIsoDate(checkoutDate) ?? { clear: true }
    );
  }, [checkinDate, checkoutDate]);

  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 block">
          <label className="app-label text-xs font-semibold text-slate-700 dark:text-slate-200">
            {label}
          </label>
        </div>
      )}
      <div ref={containerRef} className={`flex items-center gap-2 ${className}`}>
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3">
            <CalendarIcon />
          </div>
          <input
            ref={startInputRef}
            name="start"
            type="text"
            readOnly
            inputMode="none"
            disabled={disabled}
            className={fieldClass}
            placeholder={fromPlaceholder}
          />
        </div>
        <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">to</span>
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3">
            <CalendarIcon />
          </div>
          <input
            ref={endInputRef}
            name="end"
            type="text"
            readOnly
            inputMode="none"
            disabled={disabled}
            className={fieldClass}
            placeholder={toPlaceholder}
          />
        </div>
      </div>
    </div>
  );
};
