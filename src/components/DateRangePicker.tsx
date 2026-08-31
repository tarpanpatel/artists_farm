import React, { useEffect, useRef, useState } from 'react';
import FlowbiteDateRangePicker from 'flowbite-datepicker/DateRangePicker';
import { AlertTriangle } from './icons/FlowbiteIcons';

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
  error?: string | boolean;
  disablePastDates?: boolean;
  blockedDates?: string[];
  isOpen?: boolean;
  onClose?: () => void;
  onClear?: () => void;
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

const errorFieldClass =
  'bg-red-50 border border-red-500 text-red-900 placeholder-red-700 focus:ring-red-500 focus:border-red-500 block w-full ps-9 p-2.5 dark:bg-red-100 dark:border-red-400 dark:placeholder-red-700 dark:text-red-900 dark:focus:ring-red-500 dark:focus:border-red-500 disabled:cursor-not-allowed disabled:opacity-100 transition-colors';

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

// flowbite-datepicker's own `datesDisabled` option takes Date objects (or
// parseable strings, but ISO "YYYY-MM-DD" round-trips through its internal
// dd/mm/yyyy `format` option incorrectly, so Date objects are the only safe
// choice here - see fromIsoDate above, already used elsewhere in this file
// for the exact same reason).
function toDisabledDates(blockedDates: string[] | undefined): Date[] {
  if (!blockedDates || blockedDates.length === 0) return [];
  return blockedDates
    .map((d) => fromIsoDate(d))
    .filter((d): d is Date => d !== undefined);
}

// The earliest blocked date a checkout-style stay [start, end) would cover, or
// null when the range is clean/incomplete. The checkout day itself is free
// (turnover), so a block ON endIso is fine; a block on the check-in day or any
// night in between is not. flowbite-datepicker's `datesDisabled` only stops a
// blocked day being *clicked* - it still lets a range be drawn straight across
// one (pick the 8th, then the 12th, over a booked 11th), so the range has to be
// validated after the fact here.
function firstBlockedInRange(
  startIso: string,
  endIso: string,
  blockedDates: string[] | undefined,
): string | null {
  if (!startIso || !endIso || !blockedDates || blockedDates.length === 0) return null;
  let earliest: string | null = null;
  for (const raw of blockedDates) {
    const d = raw.slice(0, 10);
    if (d >= startIso && d < endIso && (earliest === null || d < earliest)) {
      earliest = d;
    }
  }
  return earliest;
}

// The earliest blocked date on/after a chosen start, or null when nothing
// ahead is blocked. Used to cap the *end*-side calendar so a night that
// crosses a blocked date can't be clicked at all, rather than being pickable
// and then rejected afterwards (see firstBlockedInRange's own note above -
// datesDisabled alone doesn't stop a range being drawn across a blocked day).
function earliestBlockedOnOrAfter(
  startIso: string,
  blockedDates: string[] | undefined,
): string | null {
  if (!startIso || !blockedDates || blockedDates.length === 0) return null;
  let earliest: string | null = null;
  for (const raw of blockedDates) {
    const d = raw.slice(0, 10);
    if (d >= startIso && (earliest === null || d < earliest)) {
      earliest = d;
    }
  }
  return earliest;
}

// Effectively "no cap" - flowbite-datepicker's setOptions treats `undefined`
// as "leave whatever was there before" rather than "clear it" (confirmed
// against vanillajs-datepicker, which it wraps), so clearing a previously
// set maxDate needs an explicit far-future stand-in instead.
const NO_END_CEILING = new Date(2099, 0, 1);

function formatIsoNice(iso: string): string {
  const d = fromIsoDate(iso);
  return d
    ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : iso;
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
 * Today/Clear by default, confirmed against flowbite's own docs - Today is
 * turned off site-wide below, 22 Aug 2026, so the footer is Clear + the
 * injected Close button only) - Close is injected as a real DOM button into
 * each side's own popover footer right after construction, since Picker's
 * own constructor already synchronously builds and appends its element
 * before this effect's next line runs.
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
  error,
  disablePastDates = false,
  blockedDates,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const rangepickerRef = useRef<InstanceType<typeof FlowbiteDateRangePicker> | null>(null);
  const callbacksRef = useRef({ onCheckinChange, onCheckoutChange });
  callbacksRef.current = { onCheckinChange, onCheckoutChange };
  // The mount effect below binds the changeDate handler once, so it needs a
  // live ref to the latest blockedDates rather than the value it closed over.
  const blockedDatesRef = useRef(blockedDates);
  blockedDatesRef.current = blockedDates;
  const suppressRangeValidationRef = useRef(false);
  const syncEndCeilingRef = useRef<(startIso: string) => void>(() => {});

  const [rangeError, setRangeError] = useState<string | undefined>(undefined);
  const hasError = Boolean(error) || Boolean(rangeError);
  const errorMessage = rangeError ?? (typeof error === 'string' ? error : undefined);
  const currentFieldClass = hasError ? errorFieldClass : fieldClass;
  const lastBlockedDatesKeyRef = useRef<string>('');

  useEffect(() => {
    const container = containerRef.current;
    const startEl = startInputRef.current;
    const endEl = endInputRef.current;
    if (!container || !startEl || !endEl) return;

    const rangepicker = new FlowbiteDateRangePicker(container, {
      format: 'dd/mm/yyyy',
      autohide: false,
      todayBtn: false,
      clearBtn: true,
      todayHighlight: true,
      language: 'en',
      ...(disablePastDates ? { minDate: new Date(new Date().setHours(0, 0, 0, 0)) } : {}),
      datesDisabled: toDisabledDates(blockedDates),
    });
    rangepickerRef.current = rangepicker;
    lastBlockedDatesKeyRef.current = (blockedDates ?? []).join(',');

    rangepicker.datepickers.forEach((dp) => {
      const footerControls = dp.pickerElement?.querySelector('.datepicker-footer .datepicker-controls');
      if (!footerControls || footerControls.querySelector('.datepicker-close-btn')) return;
      footerControls.querySelectorAll('.clear-btn').forEach((btn) => {
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

    // Caps the *end*-side popover so a night that would cross a blocked date
    // is greyed out and unclickable, instead of being pickable and only
    // rejected once both dates are chosen (see firstBlockedInRange below,
    // now a fallback safety net rather than the primary guard).
    const syncEndCeiling = (startIso: string) => {
      const cap = earliestBlockedOnOrAfter(startIso, blockedDatesRef.current);
      rangepicker.datepickers[1].setOptions({
        maxDate: cap ? (fromIsoDate(cap) ?? NO_END_CEILING) : NO_END_CEILING,
      });
    };
    syncEndCeilingRef.current = syncEndCeiling;
    syncEndCeiling(toIsoDate(rangepicker.dates[0]));

    const reportCurrentRange = () => {
      if (suppressRangeValidationRef.current) return;

      const [start, end] = rangepicker.dates;
      const startIso = toIsoDate(start);
      const endIso = toIsoDate(end);

      syncEndCeiling(startIso);

      // Fallback safety net - syncEndCeiling above should already make an
      // invalid end date unclickable, so this should rarely fire in
      // practice, but stays in place in case a range is set programmatically
      // (setDates, or a prop sync) rather than through a calendar click.
      if (startIso && endIso) {
        const clash = firstBlockedInRange(startIso, endIso, blockedDatesRef.current);
        if (clash) {
          const startItselfBlocked = (blockedDatesRef.current ?? []).some(
            (d) => d.slice(0, 10) === startIso,
          );
          const keepStartIso = startItselfBlocked ? '' : startIso;

          suppressRangeValidationRef.current = true;
          try {
            rangepicker.setDates(
              keepStartIso ? (fromIsoDate(keepStartIso) ?? { clear: true }) : { clear: true },
              { clear: true },
            );
          } finally {
            suppressRangeValidationRef.current = false;
          }

          setRangeError(`${formatIsoNice(clash)} isn't available - pick a range that doesn't cover it.`);
          callbacksRef.current.onCheckinChange(keepStartIso);
          callbacksRef.current.onCheckoutChange('');
          return;
        }
      }

      setRangeError(undefined);
      callbacksRef.current.onCheckinChange(startIso);
      callbacksRef.current.onCheckoutChange(endIso);
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

  useEffect(() => {
    const rangepicker = rangepickerRef.current;
    if (!rangepicker) return;
    const key = (blockedDates ?? []).join(',');
    if (key === lastBlockedDatesKeyRef.current) return;
    lastBlockedDatesKeyRef.current = key;
    rangepicker.setOptions({ datesDisabled: toDisabledDates(blockedDates) });
    // Blocked dates can change while the form is still open (another save
    // elsewhere drains into this same list) - re-cap the end side against
    // whatever start is currently picked, not just against clicks.
    syncEndCeilingRef.current(toIsoDate(rangepicker.dates[0]));
  }, [blockedDates]);

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
            className={currentFieldClass}
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
            className={currentFieldClass}
            placeholder={toPlaceholder}
          />
        </div>
      </div>
      {errorMessage && (
        <p className="app-error-text mt-1 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {errorMessage}
        </p>
      )}
    </div>
  );
};
