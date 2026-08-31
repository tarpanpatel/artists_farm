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
  // Re-picking checkin bug (1 Sep 2026): this picker always routes calendar
  // clicks through datepickers[0] (see the "one continuous popover" note
  // below), so the library has no way to know whether a given click is
  // "pick a fresh checkin" or "pick the checkout" - it just compares the
  // clicked value against whatever the OTHER side currently holds and
  // swaps/mirrors accordingly. That's exactly how a genuinely blocked
  // trailing-month padding cell (e.g. clicking "3" in the row that's
  // actually showing November while October is in view) can silently
  // become the new checkout via that swap, demoting the OLD checkout into
  // the checkin slot - a single misclick quietly rewrites both ends of an
  // existing range. These four refs implement "picking a new checkin must
  // always require an explicit, separate checkout pick" on top of that
  // swap machinery rather than fighting it:
  //  - scheduledRef/userClickPendingRef: the library's own onChangeDate
  //    normalization (DateRangePicker.js) can synchronously re-dispatch
  //    'changeDate' on both inputs multiple times for a single click (each
  //    setDate call during a swap fires its own event) - queueMicrotask
  //    coalesces those into one settle pass per click, and
  //    userClickPendingRef (armed by a real day-cell click, consumed on
  //    settle) distinguishes an actual click from the props-sync effect's
  //    own programmatic setDates call below, which dispatches the same
  //    event.
  //  - prevStartIsoRef: lets the settle pass detect "checkin actually
  //    changed since we last settled" without caring which DOM input the
  //    event nominally targeted (meaningless here, always datepickers[0]).
  //  - skipNextPropsSyncRef: the correction below re-mirrors
  //    datepickers[1] to the checkin (the only stable state this library's
  //    allowOneSidedRange:false config permits - clearing just one side
  //    makes the library auto-clear the OTHER side too, verified against
  //    DateRangePicker.js's onChangeDate), then blanks the END input's
  //    display only, WITHOUT that flowing back through the props-sync
  //    effect's own rangepicker.setDates call - that call's clear:true
  //    would trigger the exact same "prevent one-sided range" normalization
  //    and wipe the checkin right back out too.
  const scheduledRef = useRef(false);
  const userClickPendingRef = useRef(false);
  const prevStartIsoRef = useRef('');
  const skipNextPropsSyncRef = useRef(false);

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
      // No datesDisabled here (31 Aug 2026) - applied dynamically per current
      // start selection just below instead (syncDisabledAndCeiling), not as
      // a static construction option. A blocked NIGHT shouldn't forbid
      // checking OUT on that same date, and - this picker runs as one
      // continuous popover (autohide:false), not two independently-clicked
      // ones - a static list applied here blocks that regardless of which
      // sub-picker instance it's nominally attached to.
    });
    rangepickerRef.current = rangepicker;
    lastBlockedDatesKeyRef.current = (blockedDates ?? []).join(',');

    rangepicker.datepickers.forEach((dp) => {
      // Arms userClickPendingRef so the settle pass below can tell a real
      // day-cell click apart from a programmatic setDates call (both fire
      // the same 'changeDate' event) - registered unconditionally, ahead of
      // the footerControls early-return just below, since it doesn't depend
      // on the Close-button injection succeeding.
      dp.pickerElement?.addEventListener('click', (ev) => {
        const target = ev.target;
        if (target instanceof Element && target.closest('.datepicker-cell.day:not(.disabled)')) {
          userClickPendingRef.current = true;
        }
      });

      const footerControls = dp.pickerElement?.querySelector('.datepicker-footer .datepicker-controls');
      if (!footerControls || footerControls.querySelector('.datepicker-close-btn')) return;
      footerControls.querySelectorAll('.clear-btn').forEach((btn) => {
        btn.classList.remove('w-1/2');
        btn.classList.add('flex-1');
      });
      // Clear jumps the visible month back to "today" (31 Aug 2026) - the
      // library's own click handler (bound during construction, so it runs
      // before any listener added here) clears the selection via setDate,
      // whose internal view-reset falls back to config.defaultViewDate
      // (captured as `today()` once, at construction time) whenever there's
      // no date left to base the view on - it has no notion of "the month
      // you were already looking at". mousedown fires before click
      // regardless of listener registration order, so it reliably captures
      // the pre-clear view; the click listener registered right after it
      // then fires after the library's own (same event, later registration)
      // and restores that captured month immediately.
      let preClearViewDate: number | null = null;
      footerControls.querySelectorAll('.clear-btn').forEach((btn) => {
        btn.addEventListener('mousedown', () => {
          preClearViewDate = dp.picker.viewDate;
        });
        btn.addEventListener('click', () => {
          if (preClearViewDate !== null) {
            dp.picker.changeFocus(preClearViewDate);
          }
        });
      });
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = 'Close';
      closeBtn.className = 'datepicker-close-btn flex-1 text-body bg-neutral-secondary-medium border border-default-medium hover:bg-neutral-tertiary-medium focus:ring-4 focus:ring-neutral-tertiary font-medium rounded-base text-sm px-5 py-2 text-center';
      closeBtn.addEventListener('click', () => dp.hide());
      footerControls.appendChild(closeBtn);
    });

    // Recomputes disabled dates + the end-side ceiling for BOTH sub-pickers
    // together, not split one-per-side (31 Aug 2026, second pass). This
    // picker runs with autohide:false as one continuous calendar - clicking
    // a start date does NOT switch the visible popover over to the *other*
    // Datepicker instance, it's still datepickers[0]'s own popover for the
    // very next click too (confirmed by inspecting the live DOM: after
    // picking day 27 as start, day 28 still carried a literal `disabled`
    // class - not from maxDate, from datesDisabled, which an earlier version
    // of this fix had only relaxed on datepickers[1], the side that was
    // never actually the one rendering that click). So both instances get
    // the SAME dynamic config: the full blocked list while no start is
    // picked yet (so the very first click can't land on an occupied night),
    // and - once a start exists - that same list with just the immediate
    // boundary date (the earliest blocked night on/after start) excluded,
    // since checking out ON that date is fine, plus maxDate capping
    // anything past it. Falls back to no restriction (NO_END_CEILING) with
    // no start chosen, so the very first click is never capped either.
    const syncDisabledAndCeiling = (startIso: string) => {
      const cap = earliestBlockedOnOrAfter(startIso, blockedDatesRef.current);
      const baseBlocked = blockedDatesRef.current ?? [];
      const effectiveBlocked = startIso && cap
        ? baseBlocked.filter((d) => d.slice(0, 10) !== cap)
        : baseBlocked;
      const options = {
        datesDisabled: toDisabledDates(effectiveBlocked),
        maxDate: startIso && cap ? (fromIsoDate(cap) ?? NO_END_CEILING) : NO_END_CEILING,
      };
      rangepicker.datepickers[0].setOptions(options);
      rangepicker.datepickers[1].setOptions(options);
    };
    syncEndCeilingRef.current = syncDisabledAndCeiling;
    syncDisabledAndCeiling(toIsoDate(rangepicker.dates[0]));
    // Seed prevStartIsoRef from the picker's actual constructed state (not
    // the checkinDate prop) - see processSettledRange's own comment on why
    // this can't wait for a settle pass.
    prevStartIsoRef.current = toIsoDate(rangepicker.dates[0]);

    const processSettledRange = () => {
      if (suppressRangeValidationRef.current) return;

      const wasUserClick = userClickPendingRef.current;
      userClickPendingRef.current = false;

      const [start, end] = rangepicker.dates;
      const startIso = toIsoDate(start);
      let endIso = toIsoDate(end);

      // Re-picking checkin bug fix (1 Sep 2026) - see the refs' own comment
      // above for the full mechanics. prevStartIsoRef is seeded once right
      // after construction (below), from whatever checkin the picker loaded
      // with - NOT from this settle pass, since the library's constructor
      // reads an existing input value directly into datepicker.dates without
      // going through setDate, so no 'changeDate' event - and therefore no
      // settle - ever fires for it (confirmed live: without the explicit
      // seed, the very first click after opening Edit Booking on an
      // existing range slipped straight past this check). A real click that
      // changed checkin on top of an already-settled checkin means whatever
      // the library's own swap/mirror math landed the checkout on - the old
      // value, the new value, anything - must be discarded; the user always
      // gets an explicit second pick.
      if (wasUserClick && prevStartIsoRef.current && startIso && startIso !== prevStartIsoRef.current) {
        // Re-mirror the end side to the checkin internally (the only stable
        // state allowOneSidedRange:false permits - see comment above) so the
        // NEXT click's swap comparison runs against the current checkin,
        // not a stale value from whatever the checkout used to be.
        suppressRangeValidationRef.current = true;
        try {
          rangepicker.datepickers[1].setDate(start as number, { render: false });
        } finally {
          suppressRangeValidationRef.current = false;
        }
        // ...but only that internal mirroring - the visible field stays
        // blank, and skipNextPropsSyncRef stops the props-sync effect from
        // "helpfully" pushing checkoutDate='' back through
        // rangepicker.setDates, which would trigger the same one-sided-range
        // normalization and wipe checkin back out too.
        endEl.value = '';
        endIso = '';
        skipNextPropsSyncRef.current = true;
      }
      prevStartIsoRef.current = startIso;

      syncDisabledAndCeiling(startIso);

      // Fallback safety net - syncDisabledAndCeiling above should already
      // make an invalid end date unclickable, so this should rarely fire in
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

    // Coalesces however many 'changeDate' events a single click produced
    // (the library's own swap normalization re-dispatches on both inputs
    // synchronously, see the refs' comment above) into one settle pass that
    // runs after that whole synchronous cascade has finished.
    const reportCurrentRange = () => {
      if (suppressRangeValidationRef.current) return;
      if (scheduledRef.current) return;
      scheduledRef.current = true;
      queueMicrotask(() => {
        scheduledRef.current = false;
        processSettledRange();
      });
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
    // The re-picking-checkin correction (processSettledRange, mount effect
    // above) already put the picker in the exact state this checkinDate/
    // checkoutDate pair describes - checkin set, checkout internally
    // mirrored to it but blanked on-screen. Following through here with a
    // real rangepicker.setDates(checkin, {clear:true}) would hit the
    // library's own "prevent one-sided range" normalization and clear
    // checkin right back out too (allowOneSidedRange is false), undoing the
    // fix - see that effect's own comment for why.
    if (skipNextPropsSyncRef.current) {
      skipNextPropsSyncRef.current = false;
      return;
    }
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
    // Blocked dates can change while the form is still open (another save
    // elsewhere drains into this same list) - recompute against whatever
    // start is currently picked, not just against clicks.
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
