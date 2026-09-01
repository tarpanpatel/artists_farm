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
  // True whenever the checkin shown is "pending" - settled, but its
  // checkout was just force-blanked and hasn't had an explicit follow-up
  // pick yet (1 Sep 2026, second pass). Needed because the ORIGINAL fix
  // only checked "did checkin change from last settle" - which only catches
  // a re-pick landing on top of an already-COMPLETE range. While pending,
  // the internal end is still mirrored to checkin (kept for the swap math's
  // own sake - see the correction below), which means the library's normal
  // start<=end swap has no way to tell "user is completing checkout for the
  // pending checkin" apart from "user wants an entirely different checkin"
  // - it just compares the click to that hidden mirror. A click AFTER the
  // pending checkin silently became a checkout completion while checkin
  // stayed put (invisible, since checkout wasn't shown either way); a click
  // BEFORE it did something equally wrong on the other side (found live, 1
  // Sep 2026: reported as "first click always reselects the old checkin,
  // only the second click does what I want" - each first click was quietly
  // being reinterpreted as a checkout pick or a lopsided swap instead of
  // the fresh checkin it looked like on screen). While this is true, every
  // click gets explicitly routed by comparing it to prevStartIsoRef instead
  // of trusting whatever the library's own swap decided.
  const awaitingCheckoutPickRef = useRef(false);
  // Last settled checkout, mirroring prevStartIsoRef (fourth pass, 1 Sep
  // 2026) - needed alongside it to correctly identify which of the two raw
  // post-click values is the NEW one a click actually introduced. Re-
  // picking checkin on an already-COMPLETE (non-pending) range hit the
  // exact same swap trap awaitingCheckoutPickRef's branch already guards
  // against, just not yet caught there too: clicking a date later than the
  // OLD checkout swaps the OLD checkout into the start slot (not the OLD
  // checkin), so comparing the raw start value only against prevStartIsoRef
  // silently accepted that stale checkout as the "new checkin" instead of
  // whatever the user actually clicked (found live, 1 Sep 2026: clicking
  // day 5 on a checkin=31/checkout=2 range settled as checkin=2, not 5).
  const prevEndIsoRef = useRef('');

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
      // on the Close-button injection succeeding. Capture phase (1 Sep
      // 2026) - matches Picker.js's own onClickPicker listener on this same
      // element, which it registers with {capture:true}. A bubble-phase
      // listener here measurably fired AFTER this same click's own settle
      // pass had already run (verified with an in-page execution-order
      // probe) even though dispatchEvent is synchronous and nothing here
      // calls stopPropagation - capture runs before the library's bubble-
      // phase day-cell handler (main's onClickView) even starts, so it
      // can't lose that race.
      dp.pickerElement?.addEventListener('click', (ev) => {
        const target = ev.target;
        const matched = target instanceof Element && target.closest('.datepicker-cell.day:not(.disabled)');
        if (matched) {
          userClickPendingRef.current = true;
        }
      }, true);

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

    // Recomputes disabled dates for BOTH sub-pickers together, not split
    // one-per-side (31 Aug 2026, second pass). This picker runs with
    // autohide:false as one continuous calendar - clicking a start date
    // does NOT switch the visible popover over to the *other* Datepicker
    // instance, it's still datepickers[0]'s own popover for the very next
    // click too (confirmed by inspecting the live DOM: after picking day 27
    // as start, day 28 still carried a literal `disabled` class - not from
    // maxDate, from datesDisabled, which an earlier version of this fix had
    // only relaxed on datepickers[1], the side that was never actually the
    // one rendering that click). So both instances get the SAME dynamic
    // datesDisabled: the full blocked list while no start is picked yet (so
    // the very first click can't land on an occupied night), and - once a
    // start exists - that same list with just the immediate boundary date
    // (the earliest blocked night on/after start) excluded, since checking
    // out ON that date is fine.
    //
    // No maxDate ceiling here (1 Sep 2026, third pass - removed, was here
    // briefly) - it was meant to stop a checkout being picked past the next
    // blocked night, but goToPrevOrNext (events/functions.js) clamps ANY
    // month navigation into [minDate,maxDate] via limitToRange, and since
    // both instances always share whatever the nearer of start/end
    // currently is (see the "always datepickers[0]" note above), a close
    // maxDate silently breaks Next/Prev entirely - clicking either one
    // clamps right back into the same month, looking like the buttons do
    // nothing (found live, 1 Sep 2026: editing a booking with a real block
    // just a few days out made the calendar impossible to navigate at all,
    // only "Clear" un-stuck it). Crossing into a blocked night by drawing a
    // range past one is still caught - firstBlockedInRange below rejects it
    // with an error message once the range is drawn, same as it always has
    // for a range that skips over a blocked day entirely (its own
    // longstanding job, independent of this ceiling).
    const syncDisabledAndCeiling = (startIso: string) => {
      const cap = earliestBlockedOnOrAfter(startIso, blockedDatesRef.current);
      const baseBlocked = blockedDatesRef.current ?? [];
      const effectiveBlocked = startIso && cap
        ? baseBlocked.filter((d) => d.slice(0, 10) !== cap)
        : baseBlocked;
      const options = {
        datesDisabled: toDisabledDates(effectiveBlocked),
        maxDate: NO_END_CEILING,
      };
      rangepicker.datepickers[0].setOptions(options);
      rangepicker.datepickers[1].setOptions(options);
      try {
        (rangepicker.datepickers[0] as any).picker?.render();
        (rangepicker.datepickers[1] as any).picker?.render();
      } catch (e) {}
    };
    syncEndCeilingRef.current = syncDisabledAndCeiling;
    syncDisabledAndCeiling(toIsoDate(rangepicker.dates[0]));
    // Seed prevStartIsoRef/prevEndIsoRef from the picker's actual
    // constructed state (not the checkinDate/checkoutDate props) - see
    // processSettledRange's own comment on why this can't wait for a
    // settle pass.
    prevStartIsoRef.current = toIsoDate(rangepicker.dates[0]);
    prevEndIsoRef.current = toIsoDate(rangepicker.dates[1]);

    const processSettledRange = () => {
      if (suppressRangeValidationRef.current) return;

      const wasUserClick = userClickPendingRef.current;
      userClickPendingRef.current = false;

      const [start, end] = rangepicker.dates;
      const rawStartIso = toIsoDate(start);
      const rawEndIso = toIsoDate(end);
      let startIso = rawStartIso;
      let endIso = rawEndIso;

      // Re-picking checkin bug fix (1 Sep 2026, fourth pass) - see
      // awaitingCheckoutPickRef's and prevEndIsoRef's own comments above for
      // the full mechanics. prevStartIsoRef/prevEndIsoRef are seeded once
      // right after construction (below), from whatever range the picker
      // loaded with - NOT from a settle pass, since the library's
      // constructor reads an existing input value directly into
      // datepicker.dates without going through setDate, so no 'changeDate'
      // event - and therefore no settle - ever fires for it.
      let forcedEmptyCheckout = false;
      if (wasUserClick && prevStartIsoRef.current) {
        const pendingCheckin = prevStartIsoRef.current;
        const pendingCheckout = prevEndIsoRef.current;
        // Whichever raw value ISN'T one of the two values true immediately
        // before this click is what the click actually introduced -
        // regardless of which side the library's own swap math filed it
        // under. This matters even outside the pending-checkout state: re-
        // picking checkin on an already-COMPLETE range hits the identical
        // trap (clicking a date later than the OLD checkout swaps that OLD
        // checkout into the start slot, not the old checkin - naively
        // trusting "start" as the new checkin silently kept the stale
        // checkout instead of the date actually clicked).
        const newValue = (rawStartIso && rawStartIso !== pendingCheckin && rawStartIso !== pendingCheckout) ? rawStartIso
          : (rawEndIso && rawEndIso !== pendingCheckin && rawEndIso !== pendingCheckout) ? rawEndIso
          : null;

        if (newValue && awaitingCheckoutPickRef.current && newValue > pendingCheckin) {
          // Checkin is pending (checkout force-blanked by an earlier pass)
          // and this click is later than it - a genuine checkout pick. Pin
          // checkin back to exactly what it was (the swap ordinarily
          // already puts it there correctly on its own; this only corrects
          // it if it didn't) and accept newValue as checkout.
          startIso = pendingCheckin;
          endIso = newValue;
          if (rawStartIso !== startIso || rawEndIso !== endIso) {
            suppressRangeValidationRef.current = true;
            try {
              rangepicker.setDates(
                fromIsoDate(startIso) ?? { clear: true },
                fromIsoDate(endIso) ?? { clear: true },
              );
            } finally {
              suppressRangeValidationRef.current = false;
            }
          }
          awaitingCheckoutPickRef.current = false;
        } else if (newValue) {
          // Every other case reads as "the user picked a new checkin":
          // not currently pending at all (re-picking on a complete range),
          // or pending but this click landed on/before the pending checkin
          // (not a valid checkout, so - the user's changed their mind about
          // checkin itself). Whatever the library's own swap/mirror math
          // landed the checkout on must be discarded either way; the user
          // always gets an explicit second pick for it.
          startIso = newValue;
          forcedEmptyCheckout = true;
        }
      }

      if (forcedEmptyCheckout) {
        // Mirror BOTH sides to the (possibly just-reassigned) checkin
        // internally (the only stable state allowOneSidedRange:false
        // permits - see awaitingCheckoutPickRef's comment above) so the
        // NEXT click's swap comparison runs against the current checkin,
        // not a stale value from whatever the checkout used to be.
        //
        // BOTH sides, not just datepickers[1] (fifth pass, 1 Sep 2026) -
        // startIso only equals rawStartIso (what datepickers[0] already
        // holds) when newValue itself came from rawStartIso. When newValue
        // came from rawEndIso instead - the library's own swap filed the
        // user's actual click under the END slot, with some OLDER value
        // (the previous checkout, or a misclick like a trailing-month
        // padding cell) left sitting in datepickers[0] - startIso and
        // rawStartIso genuinely differ, and datepickers[0] needs correcting
        // too, or it - and the START field's own displayed text, which
        // setDate's own refreshUI re-stamps from datepickers[0].dates -
        // stay on that stale value while the app's own state silently holds
        // the right one (found live, 1 Sep 2026: reported startIso matched
        // what got typed into React state, but the visible start FIELD kept
        // showing the old value). rangepicker._updating (the same private
        // flag the library's own setDates() method uses for exactly this)
        // stops the two setDate calls below from triggering a nested swap
        // against each other while they're set one at a time.
        const startDate = fromIsoDate(startIso);
        if (startDate) {
          suppressRangeValidationRef.current = true;
          (rangepicker as unknown as { _updating?: boolean })._updating = true;
          try {
            rangepicker.datepickers[0].setDate(startDate, { render: false });
            rangepicker.datepickers[1].setDate(startDate, { render: false });
          } finally {
            delete (rangepicker as unknown as { _updating?: boolean })._updating;
            suppressRangeValidationRef.current = false;
          }
        }
        endIso = '';
        skipNextPropsSyncRef.current = true;
        awaitingCheckoutPickRef.current = true;
      }

      prevStartIsoRef.current = startIso;
      prevEndIsoRef.current = endIso;
      if (startIso && endIso) {
        // Equal, not just both-truthy (fifth pass, 1 Sep 2026 - found live:
        // broke the ordinary FRESH-form flow, first click mirroring
        // start=end=X via the library's own "no one-sided range" branch,
        // not forcedEmptyCheckout - since that path never touches
        // awaitingCheckoutPickRef at all, it stayed permanently false, so
        // the very next click's genuine-checkout math never engaged and a
        // later date just became a brand new checkin instead). Equal means
        // a solo pick still awaiting its real completion, whichever branch
        // produced it; genuinely different means a complete range that's
        // done needing one.
        awaitingCheckoutPickRef.current = startIso === endIso;
      }

      syncDisabledAndCeiling(startIso);
      // Blanking the END field's displayed text has to happen AFTER
      // syncDisabledAndCeiling, not before (1 Sep 2026, second pass) -
      // that call's own setOptions() does an unconditional full refreshUI
      // on datepickers[1], which restamps its input value from the
      // internal (deliberately re-mirrored, non-blank) date and clobbers an
      // earlier write here. The internal state stays mirrored to checkin
      // either way - only the on-screen text is forced blank, and only
      // here, once nothing else downstream will touch this input again.
      if (forcedEmptyCheckout) {
        endEl.value = '';
      }

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

          // Same _updating-guarded per-instance setDate pattern as the
          // forcedEmptyCheckout correction above, not a bare
          // rangepicker.setDates(realDate, {clear:true}) call (fifth pass,
          // 1 Sep 2026 - found live: rejecting a range that crossed a real
          // booking wiped checkin too, not just the invalid checkout, even
          // though keepStartIso was correctly non-empty and reported to
          // React state - the library's own "prevent one-sided range"
          // normalization doesn't care that ONE side came from a
          // deliberate rollback rather than a genuine clear, it reacts to
          // the SAME shape (one real date, one cleared) either way).
          const keepDate = keepStartIso ? fromIsoDate(keepStartIso) : undefined;
          suppressRangeValidationRef.current = true;
          (rangepicker as unknown as { _updating?: boolean })._updating = true;
          try {
            if (keepDate) {
              rangepicker.datepickers[0].setDate(keepDate, { render: false });
              rangepicker.datepickers[1].setDate(keepDate, { render: false });
            } else {
              rangepicker.datepickers[0].setDate({ clear: true }, { render: false });
              rangepicker.datepickers[1].setDate({ clear: true }, { render: false });
            }
          } finally {
            delete (rangepicker as unknown as { _updating?: boolean })._updating;
            suppressRangeValidationRef.current = false;
          }
          endEl.value = '';
          prevStartIsoRef.current = keepStartIso;
          prevEndIsoRef.current = '';
          awaitingCheckoutPickRef.current = !!keepStartIso;
          skipNextPropsSyncRef.current = true;

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

    if (disablePastDates) {
      // disablePastDates sets minDate to today - correct for stopping a NEW
      // pick from landing in the past, but a booking being loaded here can
      // already legitimately have a checkin (or checkout) before today: any
      // guest who has actually checked in, or whose stay dates simply
      // elapsed while the record sat unedited. datepicker.setDate() silently
      // drops a date outside [minDate,maxDate] - it doesn't clamp or error,
      // the side just stays empty - and the library's own "no one-sided
      // range" normalization (DateRangePicker.js's onChangeDate) then
      // copies the OTHER, successfully-set side onto it. Net effect,
      // reproduced live (1 Sep 2026): loading a guest checked in yesterday
      // showed checkin AND checkout both as today's date, not the guest's
      // real checkin. Relaxing minDate down to whichever of today/checkin/
      // checkout is earliest - only when a load is about to set an
      // out-of-range value - keeps "can't pick a NEW past date" intact
      // while letting an already-past value actually load and display.
      const todayMidnight = new Date(new Date().setHours(0, 0, 0, 0));
      const loadedDates = [fromIsoDate(checkinDate), fromIsoDate(checkoutDate)]
        .filter((d): d is Date => d !== undefined);
      const effectiveMinDate = loadedDates.reduce(
        (min, d) => (d < min ? d : min),
        todayMidnight,
      );
      rangepicker.datepickers[0].setOptions({ minDate: effectiveMinDate });
      rangepicker.datepickers[1].setOptions({ minDate: effectiveMinDate });
    }

    rangepicker.setDates(
      fromIsoDate(checkinDate) ?? { clear: true },
      fromIsoDate(checkoutDate) ?? { clear: true }
    );
  }, [checkinDate, checkoutDate, disablePastDates]);

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
