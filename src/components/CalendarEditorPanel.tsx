import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Lock, Check } from './icons/FlowbiteIcons';
import { Button } from './Button';
import { ToggleSwitch } from './ToggleSwitch';
import { useToast } from './ToastContext';
import { saveRateRuleDB } from '../services/api';

/**
 * Airbnb-Multi-Calendar-style editor panel (6 Sep 2026, explicit request:
 * "make the whole system of prices and booking more like how airbnb does").
 *
 * Replaces the old "Change Prices mode -> two clicks -> big modal" flow. On
 * Airbnb you drag a rectangle across the grid (any number of listings x any
 * number of dates) and a side panel appears showing exactly what you picked,
 * with the few things you can actually change: availability, nightly price,
 * minimum stay. That is what this is.
 *
 * Three deliberate differences from a normal modal in this app:
 *
 *  1. NO BACKDROP. The whole point is that the calendar stays visible and
 *     usable underneath - you adjust the selection and watch the panel follow.
 *     A scrim would defeat that, so this is a plain fixed side column, not a
 *     flowbite Drawer. z-[58] is the modal tier from custom.css's z-index
 *     scale (it has to clear the z-[57] header), it just isn't inset-0.
 *  2. It is an EDITOR FOR A SELECTION, not a form with its own room/date
 *     pickers. The grid is the picker. Dates stay editable here only because
 *     nudging one end by a day is faster typed than re-dragged.
 *  3. Booking and pricing live in ONE panel, because the owner already said
 *     two modes was confusing. Airbnb has no "add booking" (guests book), so
 *     that half has no upstream equivalent to copy - it is simply the other
 *     thing you might want to do with a rectangle of free nights.
 */

export interface CalendarSelection {
  roomIds: number[];
  roomNames: string[];
  /** Inclusive first NIGHT (not a check-in), YYYY-MM-DD. */
  startDate: string;
  /** Inclusive last NIGHT (not a check-out), YYYY-MM-DD. */
  endDate: string;
}

interface CalendarEditorPanelProps {
  selection: CalendarSelection | null;
  /** Lowest / highest nightly price currently in effect across the selection. */
  priceLow: number;
  priceHigh: number;
  /** How many (unit x night) cells in the selection are currently blocked. */
  blockedCells: number;
  totalCells: number;
  /** How many cells hold a real booking - those can be neither priced nor booked. */
  bookedCells: number;
  onChangeDates: (start: string, end: string) => void;
  onClose: () => void;
  onSaved: () => void;
  /** Only supplied when the selection is exactly one unit with no booked nights. */
  onAddBooking?: () => void;
  onOpenAllRules?: () => void;
}

const nightsBetween = (start: string, end: string): number => {
  const a = new Date(start + 'T00:00:00').getTime();
  const b = new Date(end + 'T00:00:00').getTime();
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
};

const shortDate = (dateStr: string): string => {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export const CalendarEditorPanel: React.FC<CalendarEditorPanelProps> = ({
  selection,
  priceLow,
  priceHigh,
  blockedCells,
  totalCells,
  bookedCells,
  onChangeDates,
  onClose,
  onSaved,
  onAddBooking,
  onOpenAllRules,
}) => {
  const { showToast } = useToast();

  const [price, setPrice] = useState('');
  const [minStay, setMinStay] = useState('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 'available' | 'blocked' | null. Null only happens when the selection spans
  // both states - Airbnb shows neither radio filled in that case, and so do we,
  // because there is no honest way to show one without implying the other half
  // does not exist.
  const isAllBlocked = totalCells > 0 && blockedCells === totalCells;
  const isMixed = blockedCells > 0 && blockedCells < totalCells;
  const [availability, setAvailability] = useState<'available' | 'blocked' | null>(null);

  const selectionKey = selection
    ? `${selection.roomIds.join(',')}|${selection.startDate}|${selection.endDate}`
    : '';

  // Every new selection starts clean. Carrying a half-typed price from the last
  // rectangle into the next one is how somebody prices the wrong dates.
  useEffect(() => {
    setPrice('');
    setMinStay('');
    setNote('');
    setAvailability(isMixed ? null : isAllBlocked ? 'blocked' : 'available');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  const nights = selection ? nightsBetween(selection.startDate, selection.endDate) : 0;

  const priceHint = useMemo(() => {
    if (!priceLow && !priceHigh) return '';
    if (Math.round(priceLow) === Math.round(priceHigh)) return String(Math.round(priceLow));
    return `${Math.round(priceLow)}-${Math.round(priceHigh)}`;
  }, [priceLow, priceHigh]);

  if (!selection) return null;

  const unitLabel =
    selection.roomNames.length === 1
      ? selection.roomNames[0]
      : `${selection.roomNames.length} units`;

  const currentAvailability = isMixed ? null : isAllBlocked ? 'blocked' : 'available';
  const availabilityChanged = availability !== null && availability !== currentAvailability;
  const hasPrice = price.trim() !== '';
  const hasMinStay = minStay.trim() !== '';
  const canSave = hasPrice || hasMinStay || availabilityChanged;

  const handleSave = async () => {
    if (isMixed && availability === null) {
      showToast('Some of these nights are blocked and some are not - pick Available or Blocked first.', { type: 'error' });
      return;
    }
    const rateNum = hasPrice ? parseFloat(price) : null;
    if (rateNum !== null && (isNaN(rateNum) || rateNum < 0)) {
      showToast('Enter a nightly price of zero or more.', { type: 'error' });
      return;
    }
    const minStayNum = hasMinStay ? parseInt(minStay, 10) : null;
    if (minStayNum !== null && (isNaN(minStayNum) || minStayNum < 1)) {
      showToast('Minimum stay must be at least 1 night.', { type: 'error' });
      return;
    }

    setIsSaving(true);
    try {
      const res = await saveRateRuleDB({
        start_date: selection.startDate,
        end_date: selection.endDate,
        rate_per_night: rateNum,
        rule_name: note.trim() || undefined,
        room_ids: selection.roomIds.length > 0 ? selection.roomIds : [null],
        min_stay_arrival: minStayNum,
        min_stay_through: null,
        max_stay: null,
        stop_sell: availability === 'blocked' ? 1 : 0,
        closed_to_arrival: 0,
        closed_to_departure: 0,
        // The selection IS the date scope here - there is no day-of-week
        // concept in this panel (Airbnb has none either), so always "every
        // day", which the backend normalizes to NULL.
        days_of_week: ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'],
        // Availability is always a deliberate statement on this panel, never a
        // field that happens to ride along - so it must reach the channels even
        // when its value matches the neutral baseline. Without this, "make these
        // dates Available again" computes as an unchanged field and is silently
        // dropped from the push, leaving the dates open here and still blocked
        // on Airbnb. See computeChannexFieldDiff() in php/channex/outbox.php.
        explicit_fields: ['stop_sell'],
      });
      if (res.success) {
        showToast(
          availability === 'blocked'
            ? `Blocked ${nights} night${nights === 1 ? '' : 's'} for ${unitLabel}.`
            : 'Saved. These dates are updated everywhere.',
          { type: 'success' },
        );
        onSaved();
      } else {
        showToast(res.message || 'Could not save these dates.', { type: 'error' });
      }
    } catch {
      showToast('Network error saving these dates.', { type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <aside
      className="fixed z-[58] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col
                 inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t
                 sm:left-auto sm:right-0 sm:bottom-0 sm:w-[380px] sm:max-h-none sm:rounded-none sm:border-t-0 sm:border-l
                 sm:top-[calc(4rem+env(safe-area-inset-top,0px))]"
      role="dialog"
      aria-label="Edit selected dates"
    >
      {/* Header: what is selected, stated plainly. */}
      <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <div className="min-w-0">
          <div className="text-base font-bold text-slate-900 dark:text-white">
            {shortDate(selection.startDate)}
            {nights > 1 && <span className="text-slate-400 font-normal"> &ndash; </span>}
            {nights > 1 && shortDate(selection.endDate)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {nights} night{nights === 1 ? '' : 's'} &middot; {unitLabel}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-1.5 -m-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Which units, named. Never a bare count - a price about to reach
            Airbnb should say out loud what it is about to change. */}
        {selection.roomNames.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {selection.roomNames.map((n) => (
              <span
                key={n}
                className="px-2 py-0.5 text-2xs font-semibold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
              >
                {n}
              </span>
            ))}
          </div>
        )}

        {/* Dates, still editable - a one-day nudge is faster typed than redrawn. */}
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              First night
            </span>
            <input
              type="date"
              value={selection.startDate}
              onChange={(e) => e.target.value && onChangeDates(e.target.value, selection.endDate)}
              className="w-full text-sm rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:ring-blue-500 focus:border-blue-500"
            />
          </label>
          <label className="block">
            <span className="block text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Last night
            </span>
            <input
              type="date"
              value={selection.endDate}
              onChange={(e) => e.target.value && onChangeDates(selection.startDate, e.target.value)}
              className="w-full text-sm rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:ring-blue-500 focus:border-blue-500"
            />
          </label>
        </div>

        {bookedCells > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg p-2.5">
            {bookedCells} night{bookedCells === 1 ? ' in this selection is' : 's in this selection are'} already
            booked. Those stay exactly as they are &mdash; anything you save here applies to the free nights only.
          </p>
        )}

        {onAddBooking && (
          <Button variant="primary" block leftIcon={<Plus className="w-4 h-4" />} onClick={onAddBooking}>
            Add booking for these dates
          </Button>
        )}

        {/* --- Availability --- */}
        <div className="space-y-2">
          <h4 className="text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Availability
          </h4>
          {isMixed && availability === null && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Some of these nights are blocked and some are open. Pick one &mdash; it applies to all{' '}
              {nights * Math.max(1, selection.roomIds.length)} of them.
            </p>
          )}
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
              {availability === 'blocked' ? (
                <Lock className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              )}
              {availability === 'blocked' ? 'Blocked' : 'Available'}
            </span>
            {/* Available when on, Blocked when off (7 Sep 2026, explicit
                request replacing the two radios above). A mixed selection
                (availability === null) still renders on - Save stays gated
                by the same isMixed/availability===null guard in
                handleSave() either way, so this is a visual default only,
                never an implicit "apply Available" - the amber note above
                already says a real choice is required first. */}
            <ToggleSwitch
              enabled={availability !== 'blocked'}
              onChange={(enabled) => setAvailability(enabled ? 'available' : 'blocked')}
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {availability === 'blocked'
              ? 'Nobody can book. Use it for repairs, or when you need the place yourself.'
              : 'Guests can book these nights.'}
          </p>
        </div>

        {/* --- Nightly price --- */}
        <div>
          <h4 className="text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
            Nightly price
          </h4>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 text-sm pointer-events-none">
              &#8377;
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={priceHint}
              className="w-full ps-7 pe-3 py-2.5 text-base font-semibold rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <p className="text-2xs text-slate-400 dark:text-slate-500 mt-1">
            {priceHint
              ? priceHint.includes('-')
                ? `Currently between ₹${priceHint.split('-')[0]} and ₹${priceHint.split('-')[1]}. Leave empty to keep it.`
                : `Currently ₹${priceHint}. Leave empty to keep it.`
              : 'Leave empty to keep the current price.'}
          </p>
        </div>

        {/* --- Minimum stay --- */}
        <div>
          <h4 className="text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
            Minimum stay
          </h4>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={minStay}
              onChange={(e) => setMinStay(e.target.value)}
              placeholder="Any"
              className="w-24 px-3 py-2 text-sm rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:ring-blue-500 focus:border-blue-500"
            />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              nights, for guests arriving on these dates
            </span>
          </div>
        </div>

        {/* --- Note --- */}
        <div>
          <h4 className="text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
            Note <span className="font-normal normal-case tracking-normal text-slate-400">(optional)</span>
          </h4>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Diwali weekend"
            maxLength={120}
            className="w-full px-3 py-2 text-sm rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {onOpenAllRules && (
          <button
            type="button"
            onClick={onOpenAllRules}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            See all pricing rules and base prices
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-4 border-t border-slate-200 dark:border-slate-700 shrink-0 bg-white dark:bg-slate-900">
        <Button variant="primary" block onClick={handleSave} disabled={isSaving || !canSave}>
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
        <p className="text-2xs text-slate-400 dark:text-slate-500 text-center mt-2">
          Sent to Airbnb, Booking.com &amp; your own booking page
        </p>
      </div>
    </aside>
  );
};
