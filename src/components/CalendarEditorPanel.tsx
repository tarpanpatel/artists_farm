import React, { useEffect, useMemo, useState } from 'react';
import { Drawer, Modal, Tabs, TabItem } from 'flowbite-react';
import { X, Plus, Lock, Check, Tag, UserPlus, Calendar, AlertCircle, AlertTriangle } from './icons/FlowbiteIcons';
import { Button } from './Button';
import { ToggleSwitch } from './ToggleSwitch';
import { DateRangePicker } from './DateRangePicker';
import { useToast } from './ToastContext';
import { saveRateRuleDB } from '../services/api';
import { attachedTabsTheme, attachedTabsClearTheme } from '../utils/tabsTheme';

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
 * This IS a flowbite `<Drawer position="right">` as of 8 Sep 2026, on explicit
 * request ("convert that into flowbite drawer like everywhere else"), replacing
 * the hand-rolled `<aside>` it shipped as. It now inherits the same chrome,
 * slide-in transition, width scale and Escape-to-close as every other drawer in
 * the app - see DESIGN.md's "Flowbite Modals & Drawers Specification".
 *
 * Two things about it are still deliberate and must not be "tidied" away:
 *
 *  1. `backdrop={false}`. This is the one drawer in the app with no scrim, and
 *     that is the entire point: the calendar has to stay visible and clickable
 *     underneath so the selection can be adjusted while the panel follows it.
 *     A scrim would make the grid unreachable and turn a live editor into a
 *     dead form. flowbite renders its backdrop only on `isOpen && backdrop`
 *     (Drawer.js), so this is a supported prop, not a hack.
 *  2. It is an EDITOR FOR A SELECTION, not a form with its own room/date
 *     pickers. The grid is the picker. Dates stay editable here only because
 *     nudging one end by a day is faster typed than re-dragged.
 *
 * And one product decision: booking and pricing live in ONE panel, because the
 * owner already said two modes was confusing. Airbnb has no "add booking"
 * (guests book), so that half has no upstream equivalent to copy - it is simply
 * the other thing you might want to do with a rectangle of free nights.
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

  const [activeTab, setActiveTab] = useState<'rates' | 'booking'>('rates');
  const [price, setPrice] = useState('');
  const [minStay, setMinStay] = useState('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // Confirm-before-save gate (10 Sep 2026) - declared here, not down by its
  // own usage, because every hook in this component must run before the
  // `if (!selection) return null` guard below (Rules of Hooks). Both call
  // sites currently only mount this component once selection is non-null,
  // so this was harmless in practice - but a hook declared after an early
  // return is a real "Rendered fewer hooks than expected" crash waiting for
  // the next call site that doesn't guarantee that (found in review, 11 Sep
  // 2026).
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Both call sites mount this only while a selection exists, so the Drawer
  // would otherwise appear already-open and skip its slide-in - flowbite
  // animates by swapping a translate class, which needs a frame in the closed
  // state to transition FROM. Flipping on the next frame gives the same
  // entrance as every other drawer in the app without changing either parent's
  // conditional-mount contract.
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setIsOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

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
    setActiveTab('rates');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  const nights = selection ? nightsBetween(selection.startDate, selection.endDate) : 0;

  const priceHint = useMemo(() => {
    if (!priceLow && !priceHigh) return '';
    if (Math.round(priceLow) === Math.round(priceHigh)) return String(Math.round(priceLow));
    return `${Math.round(priceLow)}-${Math.round(priceHigh)}`;
  }, [priceLow, priceHigh]);

  const checkoutDateStr = useMemo(() => {
    if (!selection) return '';
    const d = new Date(selection.endDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [selection]);

  // Inverse of checkoutDateStr above - DateRangePicker speaks in
  // checkin/checkout (checkout = the day the guest leaves, exclusive), while
  // this panel's own CalendarSelection speaks in first/last NIGHT (both
  // inclusive). One day back turns a picked checkout date into the last
  // night this panel actually stores.
  const toLastNight = (checkoutIso: string): string => {
    const d = new Date(checkoutIso + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  if (!selection) return null;

  const unitLabel =
    selection.roomNames.length === 1
      ? selection.roomNames[0]
      : `${selection.roomNames.length} units`;

  const isSingleAvailableUnit = selection.roomNames.length === 1 && bookedCells === 0;

  const currentAvailability = isMixed ? null : isAllBlocked ? 'blocked' : 'available';
  const availabilityChanged = availability !== null && availability !== currentAvailability;
  const hasPrice = price.trim() !== '';
  const hasMinStay = minStay.trim() !== '';
  const canSave = hasPrice || hasMinStay || availabilityChanged;

  // Confirm-before-save gate (10 Sep 2026, explicit request) - scoped to
  // NEWLY blocking a selection specifically, not every save. Unblocking and
  // plain price/min-stay edits stay one click, same as before: the "can't
  // unblock" fix just shipped is about making that direction frictionless,
  // and gating it too would fight that. Blocking is the one action here that
  // closes real nights across Airbnb/Booking.com/direct booking at once, so
  // it gets the same style of review-before-you-push step PricingRulesPanel
  // already has for its own rule form. (showConfirmModal itself is declared
  // above, before the `if (!selection) return null` guard - see that
  // comment for why.)
  const isNewBlock = availability === 'blocked' && availabilityChanged;

  const validateBeforeSave = (): boolean => {
    if (isMixed && availability === null) {
      showToast('Some of these nights are blocked and some are not - pick Available or Blocked first.', { type: 'error' });
      return false;
    }
    if (!hasPrice && !hasMinStay && !availabilityChanged) {
      showToast('Enter a nightly price or choose an availability/restriction change.', { type: 'error' });
      return false;
    }
    const rateNum = hasPrice ? parseFloat(price) : null;
    if (rateNum !== null && (isNaN(rateNum) || rateNum < 0)) {
      showToast('Enter a nightly price of zero or more.', { type: 'error' });
      return false;
    }
    const minStayNum = hasMinStay ? parseInt(minStay, 10) : null;
    if (minStayNum !== null && (isNaN(minStayNum) || minStayNum < 1)) {
      showToast('Minimum stay must be at least 1 night.', { type: 'error' });
      return false;
    }
    return true;
  };

  const handleSave = () => {
    if (!validateBeforeSave()) return;
    if (isNewBlock) {
      setShowConfirmModal(true);
      return;
    }
    executeSave();
  };

  const executeSave = async () => {
    const rateNum = hasPrice ? parseFloat(price) : null;
    const minStayNum = hasMinStay ? parseInt(minStay, 10) : null;

    setShowConfirmModal(false);
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
        setShowConfirmModal(false);
        showToast(
          availability === 'blocked'
            ? `Blocked ${nights} night${nights === 1 ? '' : 's'} for ${unitLabel}.`
            : 'Saved. These dates are updated everywhere.',
          { type: 'success' },
        );
        setTimeout(() => {
          onSaved();
        }, 300);
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
    <>
    <Drawer
      open={isOpen}
      onClose={onClose}
      position="right"
      // The one drawer in this app without a scrim - see the header comment.
      // The grid underneath has to stay clickable so the selection can be
      // adjusted while this panel follows it.
      backdrop={false}
      aria-label="Edit selected dates"
      className="z-58 w-full sm:w-96 p-0 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col"
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

      {/* Mode Switcher Tabs - DESIGN.md's Attached Tabs Specification (10 Sep
          2026): this used to be a hand-rolled pill/segmented switcher, which
          isn't the app's tab pattern. attachedTabsTheme is the shared
          reference implementation every other attached tab bar imports (see
          InventoryManagement.tsx's Master Materials/Categories tabs) - each
          TabItem stays childless per that spec, since the actual content
          lives in the scrollable pane below, driven by the same activeTab
          state, not as this component's own tabpanel. */}
      <div className="px-4 pt-3 shrink-0">
        <Tabs
          aria-label="Calendar editor mode"
          variant="default"
          theme={attachedTabsTheme}
          clearTheme={attachedTabsClearTheme}
          onActiveTabChange={(tabIndex: number) => setActiveTab(tabIndex === 0 ? 'rates' : 'booking')}
        >
          <TabItem active={activeTab === 'rates'} title="Rates & Availability" icon={Tag} />
          <TabItem active={activeTab === 'booking'} title="New Booking" icon={UserPlus} />
        </Tabs>
      </div>

      {/* -mt-px closes the seam with the active tab's bottom edge, same as
          every other attached-tabs card (see tabsTheme.ts) - no rounded/
          border classes to cancel here since this pane, unlike a bordered
          card, never had its own top border or rounded corner to begin with. */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 -mt-px">
        {/* Dates, still editable - a one-day nudge is faster typed than
            redrawn. This is the app's standard calendar (flowbite-datepicker
            via DateRangePicker), not a one-off - it used to be a plain
            native <input type="date">, which on a phone pops the OS's own
            date picker instead of the branded calendar every other date
            field in the app opens (9 Sep 2026, explicit report: "this is not
            our default calendar"). */}
        <DateRangePicker
          checkinDate={selection.startDate}
          checkoutDate={checkoutDateStr}
          onCheckinChange={(date) => date && onChangeDates(date, selection.endDate)}
          onCheckoutChange={(date) => date && onChangeDates(selection.startDate, toLastNight(date))}
          fromLabel="First night"
          toLabel="Last night"
          disablePastDates
          bgMode="bg-white dark:bg-slate-900"
        />

        {activeTab === 'rates' && (
          <>
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

            {bookedCells > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg p-2.5">
                {bookedCells} night{bookedCells === 1 ? ' in this selection is' : 's in this selection are'} already
                booked. Those stay exactly as they are &mdash; anything you save here applies to the free nights only.
              </p>
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
          </>
        )}

        {activeTab === 'booking' && (
          <div className="space-y-4">
            {selection.roomNames.length > 1 ? (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Multiple Rooms Selected</span>
                </div>
                <p>
                  Direct guest reservations can only be created for 1 room at a time. You currently have{' '}
                  <span className="font-semibold">{selection.roomNames.length} rooms</span> selected ({selection.roomNames.join(', ')}).
                </p>
                <p className="text-amber-700 dark:text-amber-400">
                  Please select dates within a single room row on the calendar grid to create a direct booking.
                </p>
              </div>
            ) : bookedCells > 0 ? (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Dates Already Booked</span>
                </div>
                <p>
                  {bookedCells} {bookedCells === 1 ? 'night' : 'nights'} in this date range already {bookedCells === 1 ? 'has' : 'have'} an active booking.
                </p>
                <p className="text-amber-700 dark:text-amber-400">
                  Please choose open, unbooked dates to create a new reservation.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Reservation Summary</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-blue-100 dark:border-blue-900/50">
                      <span className="text-slate-500 dark:text-slate-400">Room</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{unitLabel}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-blue-100 dark:border-blue-900/50">
                      <span className="text-slate-500 dark:text-slate-400">Check-in</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{shortDate(selection.startDate)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-blue-100 dark:border-blue-900/50">
                      <span className="text-slate-500 dark:text-slate-400">Check-out</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{shortDate(checkoutDateStr)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-blue-100 dark:border-blue-900/50">
                      <span className="text-slate-500 dark:text-slate-400">Duration</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{nights} night{nights === 1 ? '' : 's'}</span>
                    </div>
                    {priceLow > 0 && (
                      <div className="flex justify-between items-center py-1">
                        <span className="text-slate-500 dark:text-slate-400">Estimated Tariff</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          &#8377;{(Math.round(priceLow) * nights).toLocaleString('en-IN')}
                          {priceHigh > priceLow ? ` \u2013 \u20B9${(Math.round(priceHigh) * nights).toLocaleString('en-IN')}` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Opens the reservation form with these dates and room prefilled to record guest contact info, custom tariff, and advance payment.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-4 border-t border-slate-200 dark:border-slate-700 shrink-0 bg-white dark:bg-slate-900">
        {activeTab === 'rates' ? (
          <>
            <Button variant="primary" block onClick={handleSave} disabled={isSaving || !canSave}>
              {isSaving ? 'Saving...' : 'Save Rates & Sync'}
            </Button>
            <p className="text-2xs text-slate-400 dark:text-slate-500 text-center mt-2">
              Sent to Airbnb, Booking.com &amp; your own booking page
            </p>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              block
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={onAddBooking}
              disabled={!isSingleAvailableUnit || !onAddBooking}
            >
              Create Booking for these Dates
            </Button>
            <p className="text-2xs text-slate-400 dark:text-slate-500 text-center mt-2">
              Opens the reservation form to enter guest details &amp; advance payment
            </p>
          </>
        )}
      </div>
    </Drawer>

    {/* Confirm-before-block modal (10 Sep 2026) - only ever opens for a new
        block (see isNewBlock above); unblocking and plain edits save
        immediately without this step. Same visual language as
        PricingRulesPanel's own confirm modal - a red "not reversible"
        callout plus a plain-English summary of exactly what's about to
        close, not just a generic "are you sure?". */}
    <Modal show={showConfirmModal} onClose={() => !isSaving && setShowConfirmModal(false)} size="md" popup className="z-70">
      <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Confirm Before Blocking</h3>
          </div>
          <button
            type="button"
            onClick={() => !isSaving && setShowConfirmModal(false)}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-3.5 rounded-lg border border-red-200 dark:border-red-800/80 bg-red-50 dark:bg-red-950/40 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-red-800 dark:text-red-200 uppercase tracking-wide">
                Nobody will be able to book these nights
              </p>
              <p className="text-2xs text-red-700 dark:text-red-300 mt-0.5 leading-relaxed">
                This closes the dates below on Airbnb, Booking.com, and your own booking page as soon as you confirm.
              </p>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900/60 rounded-lg border border-gray-200 dark:border-gray-700 p-3.5 flex flex-wrap gap-4 items-start justify-between text-xs">
            <div className="min-w-0 flex-1">
              <span className="text-2xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block">
                Unit{selection.roomNames.length === 1 ? '' : 's'}
              </span>
              <p className="font-semibold text-gray-900 dark:text-white text-xs mt-0.5 truncate">{unitLabel}</p>
            </div>
            <div className="min-w-0 shrink-0 text-right">
              <span className="text-2xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block">
                Dates
              </span>
              <p className="font-semibold text-gray-900 dark:text-white text-xs mt-0.5 whitespace-nowrap">
                {shortDate(selection.startDate)}
                {nights > 1 && <> &ndash; {shortDate(selection.endDate)}</>}
                <span className="text-gray-400 font-normal"> &middot; {nights} night{nights === 1 ? '' : 's'}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-3 flex justify-end gap-2.5 bg-gray-50/50 dark:bg-gray-800/50">
          <Button
            variant="primary"
            size="sm"
            disabled={isSaving}
            onClick={executeSave}
            leftIcon={isSaving ? undefined : <Lock className="w-3.5 h-3.5" />}
          >
            {isSaving ? 'Blocking...' : 'Confirm & Block These Dates'}
          </Button>
        </div>
      </div>
    </Modal>
    </>
  );
};
