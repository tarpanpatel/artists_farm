import React, { useEffect, useId, useRef, useState } from 'react';
import FlowbiteDatepicker from 'flowbite-datepicker/Datepicker';
import { twMerge } from 'tailwind-merge';
import { AlertTriangle } from './icons/FlowbiteIcons';
import { FloatingBgMode, getBgToken } from './FloatingInput';

/**
 * A SINGLE calendar-date field, styled and powered identically to
 * DateRangePicker.tsx's own two inputs - same flowbite-datepicker popup (the
 * vanilla-JS library, themed in custom.css), same floating-label input
 * chrome, same calendar icon. Written 9 Sep 2026 (explicit request: "All
 * calendar and UI elements should be visually same") to replace the several
 * standalone `<input type="date">`/`<FloatingInput type="date">` fields
 * still scattered around the app (Booking Details' "Received on", Petty
 * Cash's "Expense Date", Platform Property Management's subscription
 * expiry) - each of those pops the OS's own native date picker instead of
 * this app's one branded calendar, exactly the same complaint already fixed
 * on CalendarEditorPanel.tsx and RateRuleModal.tsx that same day.
 *
 * This file existed before that date as a thin, NEVER-IMPORTED wrapper
 * around flowbite-REACT's own `<Datepicker>` - a different component from a
 * different theme system (react-datepicker/theme.js's own day-grid classes,
 * not flowbite-datepicker's `.datepicker-cell` styling custom.css already
 * carries) that would have looked like a second, subtly different calendar
 * next to DateRangePicker's, not "visually the same" at all. Rewritten in
 * place rather than left alone or deleted, since the name/spot was already
 * exactly right for this.
 *
 * Deliberately much simpler than DateRangePicker: a single field has no
 * "checkin vs checkout" side to coordinate or protect against a swap with,
 * which is where nearly all of that file's complexity comes from - this is
 * closer to its very first, un-hardened version. `autohide: true` (pick a
 * date, done) rather than DateRangePicker's own deliberate two-step
 * pick-then-Save flow, which only exists because a range isn't "complete"
 * after one click and this always is.
 */

interface DatePickerProps {
  /** ISO 'YYYY-MM-DD', or '' for no date selected. */
  value: string;
  onChange: (date: string) => void;
  label?: string;
  disabled?: boolean;
  error?: string | boolean;
  /** Blocks every date before today, same as DateRangePicker's own flag. */
  disablePastDates?: boolean;
  blockedDates?: string[];
  bgMode?: FloatingBgMode;
  className?: string;
}

const CalendarIcon: React.FC = () => (
  <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 10h16m-8-3V4M7 7V4m10 3V4M5 20h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Zm3-7h.01v.01H8V13Zm4 0h.01v.01H12V13Zm4 0h.01v.01H16V13Zm-8 4h.01v.01H8V17Zm4 0h.01v.01H12V17Zm4 0h.01v.01H16V17Z" />
  </svg>
);

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

// Same three-forms-at-once workaround as DateRangePicker.tsx's own
// toDisabledDates - flowbite-datepicker's `datesDisabled` option round-trips
// an ISO "YYYY-MM-DD" string through its internal dd/mm/yyyy `format` option
// incorrectly, so a Date object (plus its own time value and dd/mm/yyyy
// string, since different internal comparisons use different forms) is the
// only combination confirmed to actually block the day.
function toDisabledDates(blockedDates: string[] | undefined): Array<Date | number | string> {
  if (!blockedDates || blockedDates.length === 0) return [];
  const list: Array<Date | number | string> = [];
  for (const raw of blockedDates) {
    const d = fromIsoDate(raw);
    if (!d) continue;
    list.push(d);
    list.push(d.getTime());
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    list.push(`${day}/${month}/${year}`);
  }
  return list;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  label,
  disabled = false,
  error,
  disablePastDates = false,
  blockedDates,
  bgMode = 'modal',
  className = '',
}) => {
  const bgToken = getBgToken(bgMode);
  const inputId = useId();

  const inputRef = useRef<HTMLInputElement>(null);
  const datepickerRef = useRef<InstanceType<typeof FlowbiteDatepicker> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const blockedDatesRef = useRef(blockedDates);
  blockedDatesRef.current = blockedDates;

  const [rangeError, setRangeError] = useState<string | undefined>(undefined);
  const hasError = Boolean(error) || Boolean(rangeError);
  const errorMessage = rangeError ?? (typeof error === 'string' ? error : undefined);

  // Mount once - same pattern as DateRangePicker.tsx's own construction
  // effect. Options that can change after mount (blockedDates, value) are
  // synced by their own effects below via setOptions()/setDate() rather than
  // tearing down and recreating the picker instance on every change.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const dp = new FlowbiteDatepicker(el, {
      format: 'dd/mm/yyyy',
      autohide: true,
      todayBtn: false,
      clearBtn: true,
      todayHighlight: true,
      language: 'en',
      datesDisabled: toDisabledDates(blockedDatesRef.current),
      ...(disablePastDates ? { minDate: new Date(new Date().setHours(0, 0, 0, 0)) } : {}),
    });
    datepickerRef.current = dp;

    if (value) {
      const d = fromIsoDate(value);
      if (d) dp.setDate(d, { clear: true, render: true, autohide: false });
    }

    const handleChangeDate = () => {
      const picked = dp.dates && dp.dates.length > 0 ? dp.dates[0] : undefined;
      const iso = toIsoDate(picked);
      // A blocked date can still be typed/pasted into the input directly
      // (datesDisabled only stops a calendar-cell click) - reject it the
      // same way DateRangePicker's own range validation does, rather than
      // silently reporting a date the caller told us was off-limits.
      if (iso && blockedDatesRef.current?.some((b) => b.slice(0, 10) === iso)) {
        setRangeError('That date is not available.');
        return;
      }
      setRangeError(undefined);
      onChangeRef.current(iso);
    };
    el.addEventListener('changeDate', handleChangeDate);

    return () => {
      el.removeEventListener('changeDate', handleChangeDate);
      dp.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the disabled-dates list live - a save elsewhere can change what's
  // blocked while this field is still open.
  useEffect(() => {
    const dp = datepickerRef.current;
    if (!dp) return;
    dp.setOptions({ datesDisabled: toDisabledDates(blockedDates) });
  }, [blockedDates]);

  // Sync an external value change (a different guest loaded, a reset, etc.)
  // down into the picker - guarded so a change this component itself just
  // reported doesn't bounce back and re-trigger the picker a second time.
  useEffect(() => {
    const dp = datepickerRef.current;
    if (!dp) return;
    const current = toIsoDate(dp.dates[0]);
    if (current === value) return;
    if (!value) {
      dp.setDate({ clear: true });
    } else {
      const d = fromIsoDate(value);
      if (d) dp.setDate(d, { clear: true });
    }
  }, [value]);

  return (
    <div className="w-full">
      <div className={twMerge('relative', className)}>
        <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-gray-400 dark:text-gray-500 z-10">
          <CalendarIcon />
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          readOnly
          inputMode="none"
          disabled={disabled}
          className={`block px-2.5 pb-1.5 pt-3 ps-10 w-full text-sm bg-transparent rounded-lg border appearance-none focus:outline-none focus:ring-0 peer transition-all duration-200 cursor-pointer ${
            hasError
              ? 'border-red-600 dark:border-red-500 text-red-900 dark:text-white'
              : 'border-gray-300 dark:border-gray-600 focus:border-blue-600 dark:focus:border-blue-500 text-gray-900 dark:text-white'
          } ${
            disabled
              ? 'disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:text-gray-900 dark:disabled:text-gray-300 disabled:border-gray-300 dark:disabled:border-gray-600'
              : ''
          }`}
          placeholder=" "
        />
        {label && (
          <label
            htmlFor={inputId}
            className={twMerge(
              'floating-label absolute whitespace-nowrap text-sm duration-300 transform -translate-y-3 scale-75 top-1 z-10 origin-[0] px-2 start-1 pointer-events-none transition-all',
              disabled
                ? 'bg-gray-100 dark:bg-gray-700 border-t border-b-0 border-x-0 border-gray-300 dark:border-gray-600 rounded-t px-2 py-0.5 text-gray-600 dark:text-gray-300 font-semibold text-2xs'
                : hasError
                ? `${bgToken} text-red-600 dark:text-red-500`
                : `${bgToken} text-gray-500 dark:text-gray-400 peer-focus:text-blue-600 peer-focus:dark:text-blue-500 peer-disabled:bg-gray-100 peer-disabled:dark:bg-gray-700 peer-disabled:border-t peer-disabled:border-b-0 peer-disabled:border-x-0 peer-disabled:border-gray-300 peer-disabled:dark:border-gray-600 peer-disabled:rounded-t peer-disabled:px-2 peer-disabled:py-0.5 peer-disabled:text-gray-600 peer-disabled:dark:text-gray-300 peer-disabled:font-semibold peer-disabled:text-2xs`
            )}
          >
            {label}
          </label>
        )}
      </div>
      {errorMessage && (
        <p className="app-error-text mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1 font-medium">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {errorMessage}
        </p>
      )}
    </div>
  );
};
