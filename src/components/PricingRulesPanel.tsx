import React, { useState, useEffect } from 'react';
import { Dropdown, Modal } from 'flowbite-react';
import { Button } from './Button';
import { RateRule, saveRateRuleDB, deleteRateRuleDB, apiFetch } from '../services/api';
import { Trash2, Plus, DollarSign, Loader2, Pencil, ChevronDown, ChevronUp, Check, Home, Info, AlertTriangle, AlertCircle, X } from './icons/FlowbiteIcons';
import { useToast } from './ToastContext';
import { TablePagination } from './TablePagination';
import { FloatingInput } from './FloatingInput';
import { FloatingSelect } from './FloatingSelect';
import { DateRangePicker } from './DateRangePicker';
import { formatDateOrdinal } from '../utils/dateUtils';

// Channex's own 2-letter day codes (used verbatim in the API's `days`
// param) - single source of truth for the picker below and for reading a
// saved rule's days_of_week back for display.
const ALL_DAY_CODES = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const;
const DAY_LABELS: Record<string, string> = { mo: 'Mon', tu: 'Tue', we: 'Wed', th: 'Thu', fr: 'Fri', sa: 'Sat', su: 'Sun' };
const WEEKDAY_CODES = ['mo', 'tu', 'we', 'th', 'fr'];
const WEEKEND_CODES = ['sa', 'su'];

// DateRangePicker speaks in checkin/checkout (checkout = the day after,
// exclusive) - this panel's own startDate/endDate are both INCLUSIVE
// calendar dates, and a single-day rule (startDate === endDate, see
// isSingleNight below) is a fully valid, already-supported state. Framing
// endDate as "the night after" here (exactly like CalendarEditorPanel's own
// night/checkout conversion) keeps that case working: checkout always ends
// up at least a day after checkin, which is what the picker's own
// checkin !== checkout completion logic requires, even when the rule itself
// is for exactly one date.
function addOneDay(dateIso: string): string {
  const d = new Date(dateIso + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function subtractOneDay(dateIso: string): string {
  const d = new Date(dateIso + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Short human label for a rule's days_of_week ('' or all 7 = every day).
function formatDaysOfWeek(daysOfWeek?: string | null): string {
  if (!daysOfWeek) return 'Every day';
  const days = daysOfWeek.split(',').filter(Boolean);
  if (days.length === 0 || days.length === 7) return 'Every day';
  const sorted = [...days].sort((a, b) => ALL_DAY_CODES.indexOf(a as any) - ALL_DAY_CODES.indexOf(b as any));
  if (sorted.length === 5 && WEEKDAY_CODES.every((d) => sorted.includes(d))) return 'Weekdays';
  if (sorted.length === 2 && WEEKEND_CODES.every((d) => sorted.includes(d))) return 'Weekends';
  return sorted.map((d) => DAY_LABELS[d] || d).join(', ');
}

function countNights(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0;
  const s = new Date(startStr + 'T00:00:00');
  const e = new Date(endStr + 'T00:00:00');
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 1;
}

export interface PricingRulesPanelProps {
  propertyId?: number;
  rooms?: Array<{ id: number; name: string; default_tariff?: number }>;
  rateRules: RateRule[];
  defaultTariff?: number | null;
  onRulesUpdated: () => void;
  initialStartDate?: string;
  initialEndDate?: string;
  // Prefill for the "Change Prices" calendar flow (click a date range on a
  // room row -> open this same panel already scoped to that room + range).
  // Seeded once on mount only (see the mount-effect below) - a caller that
  // wants a fresh seed on every "open" (RateRuleModal) gets that for free
  // since flowbite-react's <Modal show={false}> unmounts its children
  // entirely, so each reopen is a genuinely fresh mount of this panel.
  initialRoomIds?: number[];
  initialRatePerNight?: string;
  // Fires whenever the in-form "Target Unit" selection changes (mount
  // included). Selection state lives entirely inside this panel now (it used
  // to be lifted into RateRuleModal.tsx directly) - RateRuleModal.tsx uses
  // this purely to keep its own header badge in sync, PricingPage.tsx has no
  // use for it and simply omits the prop.
  onSelectionChange?: (roomIds: number[]) => void;
}

/**
 * The actual "Prices & Booking Rules" content - base price editing, the
 * date-range rule form (day-of-week, min/max stay, stop sell, floor/fixed
 * pricing), and the active rules table. Deliberately has no Modal/Drawer
 * chrome of its own (no header bar, no X, no backdrop) so it can be reused
 * verbatim by both `RateRuleModal.tsx` (wraps this in a `<Modal>`) and
 * `PricingPage.tsx` (wraps this in ordinary page chrome) - one component,
 * two homes, so a change here reaches both automatically instead of the two
 * drifting apart (9 Sep 2026, explicit request: "if i make any code/features
 * etc changes on this new dedicated page, it should automatically apply to
 * the drawer and modal... wherever applicable automatically").
 *
 * The calendar-grid drag-select quick-edit drawer (CalendarEditorPanel.tsx)
 * is deliberately NOT folded into this component - it edits a rectangle of
 * already-rendered grid cells and has no meaning without that grid (see its
 * own header comment), so it stays a separate, grid-only entry point.
 */
export const PricingRulesPanel: React.FC<PricingRulesPanelProps> = ({
  propertyId: _propertyId,
  rooms = [],
  rateRules,
  defaultTariff,
  onRulesUpdated,
  initialStartDate,
  initialEndDate,
  initialRoomIds,
  initialRatePerNight,
  onSelectionChange,
}) => {
  const { showToast } = useToast();
  const [startDate, setStartDate] = useState(initialStartDate || new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(initialEndDate || new Date().toISOString().split('T')[0]);
  const [ratePerNight, setRatePerNight] = useState<string>('');
  const [ruleName, setRuleName] = useState<string>('');
  const [selectedRoomIds, setSelectedRoomIds] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  // The rules table is collapsed by default and its rows are paginated (4
  // Sep 2026, 10/page added 4 Sep 2026). A one-shot price import (e.g. a
  // full year of PriceLabs daily prices) can leave thousands of one-night
  // rules here, and rendering every row - each with its own <Button> - on
  // first render froze the whole "Change Prices" flow for several seconds.
  const RULES_PAGE_SIZE = 10;
  const [showRulesList, setShowRulesList] = useState(false);
  const [rulesPage, setRulesPage] = useState(1);

  // Restriction state fields
  const [hasStayRestrictions, setHasStayRestrictions] = useState<boolean>(false);
  const [minStay, setMinStay] = useState<string>('');
  const [minStayType, setMinStayType] = useState<'arrival' | 'through'>('arrival');
  const [maxStay, setMaxStay] = useState<string>('');
  const [stopSell, setStopSell] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  // No check-ins / No check-outs (closed-to-arrival / closed-to-departure) were
  // removed from this form 6 Sep 2026 at the owner's request - genuinely niche
  // channel-manager restrictions most hosts never need, and two more checkboxes
  // to read past on an already dense page. Kept as constants rather than ripped
  // out of the payload: the columns still exist, older rules may still carry
  // them, and the rules list below still displays them - this form simply never
  // sets them any more.
  const closedToArrival = false;
  const closedToDeparture = false;
  // Day-of-week scoping (4 Sep 2026, "Monday to Friday 3000, Saturday and
  // Sunday 4000") - all 7 selected = applies every day (unchanged default
  // behavior), matching what saveRateRule() on the backend normalizes an
  // "every day" selection to (NULL, not a literal 7-item list).
  const [selectedDays, setSelectedDays] = useState<string[]>([...ALL_DAY_CODES]);

  // A rule covering a single night spans exactly one weekday, so the
  // day-of-week picker below can only ever do nothing (all days selected) or
  // make the rule apply to no nights at all (that day deselected). Reported
  // 6 Sep 2026 as plainly confusing - "it is showing option to choose days of
  // the week, but i have chosen only one night" - so it is hidden entirely in
  // that case rather than shown as a control that cannot help.
  const isSingleNight = !!startDate && !!endDate && startDate === endDate;

  const [ruleType, setRuleType] = useState<'fixed' | 'floor'>('fixed');

  // Flat Base Rate inline room tariff editing
  const [localRooms, setLocalRooms] = useState<Array<{ id: number; name: string; default_tariff?: number }>>(rooms);
  const [roomTariffs, setRoomTariffs] = useState<Record<number, string>>({});
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [isSavingTariff, setIsSavingTariff] = useState(false);
  const [isBasePriceOpen, setIsBasePriceOpen] = useState(false);
  const [bulkTariff, setBulkTariff] = useState('');
  const [isSavingBulkTariff, setIsSavingBulkTariff] = useState(false);

  const validTariffs = localRooms
    .map((r) => (r.default_tariff != null ? Number(r.default_tariff) : null))
    .filter((t): t is number => t !== null && !isNaN(t));
  const minTariff = validTariffs.length > 0 ? Math.min(...validTariffs) : null;
  const maxTariff = validTariffs.length > 0 ? Math.max(...validTariffs) : null;
  const priceRangeDisplay =
    minTariff !== null && maxTariff !== null
      ? minTariff === maxTariff
        ? `₹${Math.round(minTariff)}/night`
        : `₹${Math.round(minTariff)} – ₹${Math.round(maxTariff)}/night`
      : defaultTariff != null
      ? `₹${Math.round(defaultTariff)}/night`
      : 'Not set';

  useEffect(() => {
    if (rooms && rooms.length > 0) {
      setLocalRooms(rooms);
    }
  }, [rooms]);

  useEffect(() => {
    if (initialStartDate) setStartDate(initialStartDate);
    if (initialEndDate) setEndDate(initialEndDate);
  }, [initialStartDate, initialEndDate]);

  // "Change Prices" calendar flow: seed the room + rate the caller selected.
  // Runs once on mount, not on an isOpen rising edge (unlike the original
  // in-modal version this was extracted from) - RateRuleModal.tsx unmounts
  // this panel entirely on close (flowbite-react's <Modal show={false}>
  // renders null), so every reopen is already a fresh mount with its own
  // fresh run of this effect. PricingPage.tsx has no open/close lifecycle at
  // all, so "once on mount" is the only sensible reading there too.
  useEffect(() => {
    if (initialRoomIds && initialRoomIds.length > 0) {
      setSelectedRoomIds(initialRoomIds);
    } else if (rooms && rooms.length > 0) {
      setSelectedRoomIds(rooms.map((r) => r.id));
    }
    if (initialRatePerNight != null && initialRatePerNight !== '') setRatePerNight(initialRatePerNight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onSelectionChange?.(selectedRoomIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoomIds]);

  const handleSaveRoomTariff = async (roomId: number, tariffStr: string) => {
    setIsSavingTariff(true);
    const numTariff = tariffStr.trim() !== '' ? parseFloat(tariffStr) : undefined;
    try {
      const res = await apiFetch('/php/api/router.php?action=update_room_tariff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, default_tariff: tariffStr.trim() !== '' ? tariffStr.trim() : null }),
      });
      const data = await res.json();
      if (data.success) {
        setLocalRooms((prev) =>
          prev.map((r) => (r.id === roomId ? { ...r, default_tariff: numTariff } : r))
        );
        setEditingRoomId(null);
        showToast(
          numTariff != null
            ? `Room base tariff updated to ₹${Math.round(numTariff)}/night.`
            : 'Room base tariff cleared.',
          { type: 'success' }
        );
        onRulesUpdated();
      } else {
        showToast(data.message || 'Failed to update base tariff', { type: 'error' });
      }
    } catch {
      showToast('Network error updating base tariff', { type: 'error' });
    } finally {
      setIsSavingTariff(false);
    }
  };

  const handleSaveAllRoomsTariff = async () => {
    if (!bulkTariff || isNaN(parseFloat(bulkTariff)) || parseFloat(bulkTariff) < 0) {
      showToast('Please enter a valid rate per night.', { type: 'error' });
      return;
    }
    const numTariff = parseFloat(bulkTariff);
    setIsSavingBulkTariff(true);
    try {
      const roomIds = localRooms.map((r) => r.id);
      const res = await apiFetch('/php/api/router.php?action=update_room_tariff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_ids: roomIds, default_tariff: numTariff }),
      });
      const data = await res.json();
      if (data.success) {
        setLocalRooms((prev) =>
          prev.map((r) => ({ ...r, default_tariff: numTariff }))
        );
        setBulkTariff('');
        showToast(`Base tariff updated to ₹${Math.round(numTariff)}/night for all ${roomIds.length} units.`, {
          type: 'success',
        });
        onRulesUpdated();
      } else {
        showToast(data.message || 'Failed to update all room tariffs', { type: 'error' });
      }
    } catch {
      showToast('Network error updating room tariffs', { type: 'error' });
    } finally {
      setIsSavingBulkTariff(false);
    }
  };

  const handleSaveRule = (e: React.FormEvent) => {
    e.preventDefault();
    const rateNum = ratePerNight.trim() !== '' ? parseFloat(ratePerNight) : null;
    const minStayNum = hasStayRestrictions && minStay.trim() !== '' ? parseInt(minStay, 10) : null;
    const maxStayNum = hasStayRestrictions && maxStay.trim() !== '' ? parseInt(maxStay, 10) : null;

    if (!startDate || !endDate) {
      showToast('Please enter valid start and end dates.', { type: 'error' });
      return;
    }

    if (startDate > endDate) {
      showToast('Start date cannot be after end date.', { type: 'error' });
      return;
    }

    // Skipped for a one-night rule: the day picker is hidden in that case
    // (see isSingleNight), so there is no control for the user to fix.
    if (!isSingleNight && selectedDays.length === 0) {
      showToast('Select at least one day for this rule to apply on.', { type: 'error' });
      return;
    }

    const hasRestriction = minStayNum !== null || maxStayNum !== null || stopSell || closedToArrival || closedToDeparture;

    if (rateNum === null && !hasRestriction) {
      showToast('Enter a price, or set at least one rule (shortest stay, blocked dates, no check-ins or no check-outs).', { type: 'error' });
      return;
    }

    if (rateNum !== null && (isNaN(rateNum) || rateNum < 0)) {
      showToast('Nightly rate must be a non-negative number.', { type: 'error' });
      return;
    }

    if (maxStayNum !== null && minStayNum !== null && maxStayNum < minStayNum) {
      showToast('Maximum stay cannot be less than minimum stay.', { type: 'error' });
      return;
    }

    if (rooms.length > 0 && selectedRoomIds.length === 0) {
      showToast('Select at least one unit for this rule to apply to.', { type: 'error' });
      return;
    }

    // Input validations passed -> open preview confirmation modal
    setShowConfirmModal(true);
  };

  const executeSaveRule = async () => {
    setIsSaving(true);
    try {
      const rateNum = ratePerNight.trim() !== '' ? parseFloat(ratePerNight) : null;
      const minStayNum = hasStayRestrictions && minStay.trim() !== '' ? parseInt(minStay, 10) : null;
      const maxStayNum = hasStayRestrictions && maxStay.trim() !== '' ? parseInt(maxStay, 10) : null;

      const payload = {
        start_date: startDate,
        end_date: endDate,
        rate_per_night: rateNum,
        rule_name: ruleName.trim() || undefined,
        // [null] means "the property itself" and is ONLY valid for a
        // single-unit property, which has no room rows. With units present the
        // guard above has already required a real selection.
        room_ids: rooms.length === 0 ? [null] : selectedRoomIds,
        min_stay_arrival: minStayType === 'arrival' ? minStayNum : null,
        min_stay_through: minStayType === 'through' ? minStayNum : null,
        max_stay: maxStayNum,
        stop_sell: stopSell ? 1 : 0,
        closed_to_arrival: closedToArrival ? 1 : 0,
        closed_to_departure: closedToDeparture ? 1 : 0,
        // A one-night rule covers exactly one weekday, so day-of-week scoping
        // can only ever be a no-op or a contradiction. Always send "every day"
        // there rather than whatever the (hidden) picker happens to hold - it
        // could still be a narrowed selection left over from a wider range.
        days_of_week: isSingleNight ? [...ALL_DAY_CODES] : selectedDays,
        rule_type: rateNum !== null ? ruleType : 'fixed',
      };

      const res = await saveRateRuleDB(payload);
      if (res.success) {
        showToast('Saved. These dates are updated everywhere.', { type: 'success' });
        setRatePerNight('');
        setRuleType('fixed');
        setRuleName('');
        setMinStay('');
        setMaxStay('');
        setHasStayRestrictions(false);
        setStopSell(false);
        setSelectedDays([...ALL_DAY_CODES]);
        setSelectedRoomIds([]);
        setShowConfirmModal(false);
        onRulesUpdated();
      } else {
        showToast(res.message || 'Failed to save rate rule', { type: 'error' });
      }
    } catch {
      showToast('Network error saving rate rule', { type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRule = async (id?: number) => {
    if (!id) return;
    try {
      const res = await deleteRateRuleDB(id);
      if (res.success) {
        showToast('Rate rule removed.', { type: 'info' });
        onRulesUpdated();
      } else {
        showToast(res.message || 'Failed to delete rate rule', { type: 'error' });
      }
    } catch {
      showToast('Network error deleting rate rule', { type: 'error' });
    }
  };

  const toggleDay = (code: string) => {
    setSelectedDays((prev) => (prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]));
  };

  const toggleRoomSelection = (roomId: number) => {
    setSelectedRoomIds((prev) =>
      prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]
    );
  };

  const toggleAllRooms = () => {
    if (selectedRoomIds.length === rooms.length) {
      setSelectedRoomIds([]);
    } else {
      setSelectedRoomIds(rooms.map((r) => r.id));
    }
  };

  return (
    <div className="space-y-6">
        <div className="space-y-5">
          {!isBasePriceOpen ? (
            /* Collapsed Base Price Summary Card */
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                      Base Price {localRooms.length > 0 ? `(${localRooms.length} units)` : ''}
                    </h4>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {priceRangeDisplay}
                    </span>
                  </div>
                  <p className="text-2xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Default nightly rate when no special date rules are set.
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsBasePriceOpen(true)}
                leftIcon={<Pencil className="w-3.5 h-3.5" />}
                className="shrink-0"
              >
                Edit Base Price
              </Button>
            </div>
          ) : (
            /* Uncollapsed Base Price Editor */
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                      Base Price {localRooms.length > 0 ? `(${localRooms.length} units)` : ''}
                    </h4>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {priceRangeDisplay}
                    </span>
                  </div>
                  <p className="text-2xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Default nightly rate when no special date rules are set.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setIsBasePriceOpen(false);
                    setEditingRoomId(null);
                  }}
                  rightIcon={<ChevronUp className="w-3.5 h-3.5" />}
                  className="shrink-0"
                >
                  Collapse
                </Button>
              </div>

              {/* Inform user: What is a Base Price? (GroundCode Brand Manifesto: <= 10 words per line, friendly homestay tone) */}
              <div className="p-3.5 rounded-lg border border-blue-100 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/30 flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Info className="w-4 h-4" />
                </div>
                <div className="space-y-1 text-2xs text-gray-600 dark:text-gray-300">
                  <p className="font-bold text-gray-900 dark:text-white text-xs">What is Base Price?</p>
                  <p>• Your property’s default nightly rate.</p>
                  <p>• Used when no seasonal or holiday rules exist.</p>
                  <p>• Direct bookings and OTA channels use this price.</p>
                </div>
              </div>

              {/* Bulk Apply to All Units */}
              {localRooms.length > 1 && (
                <div className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">
                      Apply to all {localRooms.length} units
                    </p>
                    <p className="text-2xs text-gray-500 dark:text-gray-400">
                      Set the same base rate across every room.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="Rate / night"
                        value={bulkTariff}
                        onChange={(e) => setBulkTariff(e.target.value)}
                        className="w-28 h-8 pl-6 pr-2 text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <Button
                      variant="primary"
                      size="xs"
                      disabled={isSavingBulkTariff || !bulkTariff}
                      onClick={handleSaveAllRoomsTariff}
                      leftIcon={isSavingBulkTariff ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    >
                      {isSavingBulkTariff ? 'Applying...' : 'Apply to All'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Individual Units List */}
              {localRooms.length > 0 ? (
                <div className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden">
                  {localRooms.map((room) => {
                    const isEditing = editingRoomId === room.id;
                    const currentVal =
                      roomTariffs[room.id] !== undefined
                        ? roomTariffs[room.id]
                        : room.default_tariff != null
                        ? String(room.default_tariff)
                        : '';

                    return (
                      <div
                        key={room.id}
                        className="p-3 bg-white dark:bg-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/70 dark:hover:bg-gray-750 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0 text-gray-600 dark:text-gray-300">
                            <Home className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                              {room.name}
                            </p>
                            <p className="text-2xs text-gray-500 dark:text-gray-400">
                              Base Rate: <span className="font-bold text-emerald-600 dark:text-emerald-400">{room.default_tariff != null ? `₹${Math.round(room.default_tariff)}/night` : 'Not set'}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">₹</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  placeholder="Rate / night"
                                  value={currentVal}
                                  onChange={(e) => setRoomTariffs({ ...roomTariffs, [room.id]: e.target.value })}
                                  className="w-28 h-8 pl-6 pr-2 text-xs bg-white dark:bg-gray-900 border border-blue-400 dark:border-blue-500 rounded-lg text-gray-900 dark:text-white font-semibold focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                  autoFocus
                                />
                              </div>
                              <Button
                                variant="primary"
                                size="xs"
                                disabled={isSavingTariff}
                                onClick={() => handleSaveRoomTariff(room.id, currentVal)}
                              >
                                {isSavingTariff ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                              </Button>
                              <Button
                                variant="secondary"
                                size="xs"
                                disabled={isSavingTariff}
                                onClick={() => setEditingRoomId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="edit"
                              size="xs"
                              onClick={() => {
                                setEditingRoomId(room.id);
                                setRoomTariffs({
                                  ...roomTariffs,
                                  [room.id]: room.default_tariff != null ? String(room.default_tariff) : '',
                                });
                              }}
                              leftIcon={<Pencil className="w-3 h-3 text-blue-600 dark:text-blue-400" />}
                            >
                              Edit Rate
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700">
                  <div>
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Property Base Tariff</p>
                    <p className="text-2xs text-gray-500 dark:text-gray-400">Applies to all direct bookings and connected channels</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {defaultTariff ? `₹${Math.round(defaultTariff)}/night` : 'Not set'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

          <div className="space-y-6">
            {/* Dynamic Notice Banner */}
            <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <DollarSign className="w-4 h-4" />
              </div>
              <div>
                <h5 className="text-xs font-bold text-emerald-900 dark:text-emerald-200 uppercase tracking-wider">
                  Prices vary by date
                </h5>
                {/* Plain-language explainer (4 Sep 2026). This page is the one
                    place an owner meets channel-manager vocabulary - Stop Sell,
                    CTA, CTD, "min stay type" - none of which says what it
                    actually does to a booking. Say the effect in ordinary words
                    and keep the industry term only as a quiet subtitle, so it
                    can still be matched against what Airbnb calls the same
                    setting. */}
                <p className="text-xs text-emerald-800/90 dark:text-emerald-300 mt-1 leading-relaxed">
                  Charge more during Diwali. Charge less in a slow month. Ask for 3 nights minimum on New Year.
                  You pick the dates and set the price — that's it. Dates you don't touch stay at their
                  normal price, and anything you save here reaches Airbnb, Booking.com and your own
                  booking page on its own.
                </p>
              </div>
            </div>

            {/* Create / Bulk-Apply Rate & Restriction Rule Form */}
            <form onSubmit={handleSaveRule} className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-blue-600" />
                  Set prices & rules for a date range
                </h4>
                <span className="text-2xs text-gray-400">Sent to Airbnb, Booking.com & your own booking page</span>
              </div>

              {/* Chosen Unit / Target Room Selector (Flowbite Dropdown with Checkboxes) */}
              {rooms.length > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <span className="text-2xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                      Target Unit
                    </span>
                    <span className={`px-2.5 py-0.5 text-2xs font-semibold rounded-md border ${
                      selectedRoomIds.length > 0 && selectedRoomIds.length === rooms.length
                        ? 'bg-emerald-100 dark:bg-emerald-900/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200'
                        : selectedRoomIds.length === 0
                        ? 'bg-amber-100 dark:bg-amber-900/60 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200'
                        : selectedRoomIds.length === 1
                        ? 'bg-blue-100 dark:bg-blue-900/60 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 font-bold'
                        : 'bg-purple-100 dark:bg-purple-900/60 border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-200'
                    }`}>
                      {/* Name the units, always (6 Sep 2026, explicit request:
                          "always show selected properties"). "3 Units Selected"
                          said how many rooms a price was about to change but not
                          WHICH - the one detail that matters before saving a rate
                          that reaches Airbnb. */}
                      {selectedRoomIds.length === 0
                        ? 'No units selected'
                        : selectedRoomIds.length === rooms.length
                        ? `All ${rooms.length} units`
                        : rooms
                            .filter((r) => selectedRoomIds.includes(r.id))
                            .map((r) => r.name)
                            .join(', ')}
                    </span>
                  </div>

                  <Dropdown
                    label=""
                    dismissOnClick={false}
                    placement="bottom-end"
                    renderTrigger={() => (
                      <button
                        type="button"
                        id="dropdownUnitsButton"
                        className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-xs px-3.5 py-2 text-center inline-flex items-center gap-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800 cursor-pointer shadow-xs"
                      >
                        <span>Select Units</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    )}
                    className="z-50 w-72 bg-white rounded-lg shadow-lg dark:bg-gray-700 border border-gray-200 dark:border-gray-600 p-2 text-xs"
                  >
                    <div className="flex items-center justify-between px-2 py-1.5 mb-1 border-b border-gray-200 dark:border-gray-600">
                      <span className="text-2xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {selectedRoomIds.length} of {rooms.length} selected
                      </span>
                      <button
                        type="button"
                        onClick={toggleAllRooms}
                        className="text-2xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        {selectedRoomIds.length === rooms.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <ul className="p-1 space-y-1 max-h-60 overflow-y-auto" aria-labelledby="dropdownUnitsButton">
                      {rooms.map((room) => {
                        const isChecked = selectedRoomIds.includes(room.id);
                        return (
                          <li key={room.id}>
                            <label className="flex items-center p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer transition-colors">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleRoomSelection(room.id)}
                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:bg-gray-600 dark:border-gray-500 cursor-pointer"
                              />
                              <span className="ms-2.5 text-xs font-medium text-gray-900 dark:text-gray-200 flex-1 flex items-center justify-between">
                                <span className="truncate">{room.name}</span>
                                {room.default_tariff != null && (
                                  <span className="text-2xs text-gray-400 dark:text-gray-400 shrink-0 ms-2">
                                    (₹{Math.round(room.default_tariff)})
                                  </span>
                                )}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </Dropdown>
                </div>
              ) : rooms.length === 1 ? (
                <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-2">
                  <span className="text-2xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                    Target Unit:
                  </span>
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-md bg-blue-100 dark:bg-blue-900/60 border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200">
                    🏠 {rooms[0].name}
                  </span>
                </div>
              ) : null}

              {/* Date range row - the app's standard calendar
                  (flowbite-datepicker via DateRangePicker), not a plain
                  native <input type="date"> popping the OS's own picker
                  (9 Sep 2026, explicit request: "All calendar and UI
                  elements should be visually same"). */}
              <DateRangePicker
                checkinDate={startDate}
                checkoutDate={endDate ? addOneDay(endDate) : ''}
                onCheckinChange={(date) => date && setStartDate(date)}
                onCheckoutChange={(date) => date && setEndDate(subtractOneDay(date))}
                fromLabel="First date *"
                toLabel="Last date *"
              />

              {/* Day-of-Week Scoping (4 Sep 2026, "Monday to Friday 3000,
                  Saturday and Sunday 4000") - all 7 selected (the default)
                  means every day, identical to before this existed. Two
                  quick presets for the two most common patterns, plus the
                  individual day toggles for anything else.
                  Hidden for a single-night rule - see isSingleNight. */}
              {!isSingleNight && (() => {
                const isAllDays = selectedDays.length === 7;
                const isWeekdaysOnly = selectedDays.length === 5 && WEEKDAY_CODES.every((d) => selectedDays.includes(d));
                const isWeekendsOnly = selectedDays.length === 2 && WEEKEND_CODES.every((d) => selectedDays.includes(d));
                const dayPreset = isAllDays ? 'all' : isWeekdaysOnly ? 'weekdays' : isWeekendsOnly ? 'weekends' : 'custom';

                return (
                  <div className="space-y-2">
                    <label className="block text-2xs font-semibold text-gray-700 dark:text-gray-300">
                      Only on these days
                    </label>

                    {/* Radio Options: Every Day, Weekdays, Weekends, Custom */}
                    <div className="flex flex-wrap items-center gap-4 sm:gap-6 py-1">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
                        <input
                          type="radio"
                          name="day_preset_option"
                          value="all"
                          checked={dayPreset === 'all'}
                          onChange={() => setSelectedDays([...ALL_DAY_CODES])}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                        />
                        <span>Every Day</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
                        <input
                          type="radio"
                          name="day_preset_option"
                          value="weekdays"
                          checked={dayPreset === 'weekdays'}
                          onChange={() => setSelectedDays([...WEEKDAY_CODES])}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                        />
                        <span>Weekdays</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
                        <input
                          type="radio"
                          name="day_preset_option"
                          value="weekends"
                          checked={dayPreset === 'weekends'}
                          onChange={() => setSelectedDays([...WEEKEND_CODES])}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                        />
                        <span>Weekends</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
                        <input
                          type="radio"
                          name="day_preset_option"
                          value="custom"
                          checked={dayPreset === 'custom'}
                          onChange={() => {}}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                        />
                        <span>Custom Days</span>
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {ALL_DAY_CODES.map((code) => {
                        const isChecked = selectedDays.includes(code);
                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => toggleDay(code)}
                            className={`w-11 h-8 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                              isChecked
                                ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-50'
                            }`}
                          >
                            {DAY_LABELS[code]}
                          </button>
                        );
                      })}
                    </div>
                    {selectedDays.length === 0 && (
                      <p className="text-2xs text-red-600 dark:text-red-400 mt-1">Select at least one day, or this rule will never apply.</p>
                    )}
                  </div>
                );
              })()}

              {/* Nightly Rate & Label */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FloatingInput
                  type="number"
                  min="0"
                  step="1"
                  label="Price per night (₹)"
                  placeholder=" "
                  value={ratePerNight}
                  onChange={(e) => setRatePerNight(e.target.value)}
                  helperText="Leave empty to keep your usual price"
                />
                <FloatingInput
                  type="text"
                  label="Name this rule (Optional)"
                  placeholder=" "
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  helperText="e.g. Diwali week, Weekend price"
                />
              </div>

              {/* Pricing Rule Type: Exact Price vs Minimum Floor (Always visible) */}
              <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 block">
                    Pricing Rule Type
                  </span>
                  <span className="text-2xs font-medium text-gray-500 dark:text-gray-400">
                    {ruleType === 'floor' ? 'Floor Price Mode' : 'Fixed Price Mode'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      ruleType === 'fixed'
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200 shadow-xs'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="rule_type_option"
                      value="fixed"
                      checked={ruleType === 'fixed'}
                      onChange={() => setRuleType('fixed')}
                      className="mt-0.5 w-4 h-4 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                    />
                    <div className="text-xs">
                      <span className="font-semibold block text-gray-900 dark:text-white">
                        {ratePerNight.trim() !== '' ? `Set Exact Price (₹${ratePerNight})` : 'Set Exact Price'}
                      </span>
                      <span className="text-2xs text-gray-500 dark:text-gray-400 block mt-0.5">
                        {ratePerNight.trim() !== ''
                          ? `Overrides all selected dates to exactly ₹${ratePerNight}.`
                          : 'Overrides all selected dates to the exact price entered above.'}
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      ruleType === 'floor'
                        ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 shadow-xs'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="rule_type_option"
                      value="floor"
                      checked={ruleType === 'floor'}
                      onChange={() => setRuleType('floor')}
                      className="mt-0.5 w-4 h-4 text-amber-600 focus:ring-amber-500 dark:focus:ring-amber-600 dark:ring-offset-gray-800 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                    />
                    <div className="text-xs">
                      <span className="font-semibold block text-gray-900 dark:text-white">
                        {ratePerNight.trim() !== '' ? `Minimum Floor (Never below ₹${ratePerNight})` : 'Minimum Floor (Never below ₹X)'}
                      </span>
                      <span className="text-2xs text-gray-500 dark:text-gray-400 block mt-0.5">
                        {ratePerNight.trim() !== ''
                          ? `Only raises dates below ₹${ratePerNight}. Dates already higher stay untouched.`
                          : 'Guarantees price never drops below this rate. Dates already higher (like weekend surges) stay untouched.'}
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Minimum & Maximum Stay Restrictions */}
              <div className="p-3.5 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hasStayRestrictions}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setHasStayRestrictions(checked);
                      if (!checked) {
                        setMinStay('');
                        setMaxStay('');
                      }
                    }}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-semibold text-gray-900 dark:text-white block">
                      How long guests can stay
                    </span>
                    <span className="text-2xs text-gray-500 dark:text-gray-400 block">
                      Require a minimum stay or limit the maximum nights a guest can book.
                    </span>
                  </div>
                </label>

                {hasStayRestrictions && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <FloatingInput
                      type="number"
                      min="1"
                      label="Fewest nights"
                      placeholder=" "
                      value={minStay}
                      onChange={(e) => setMinStay(e.target.value)}
                      bgMode="card"
                    />

                    <FloatingSelect
                      label="Who does that apply to?"
                      value={minStayType}
                      onChange={(e) => setMinStayType(e.target.value as 'arrival' | 'through')}
                      bgMode="card"
                      options={[
                        { value: 'arrival', label: 'Guests arriving on these dates' },
                        { value: 'through', label: 'Anyone staying over these dates' },
                      ]}
                    />

                    <FloatingInput
                      type="number"
                      min="1"
                      label="Most nights"
                      placeholder=" "
                      value={maxStay}
                      onChange={(e) => setMaxStay(e.target.value)}
                      bgMode="card"
                    />
                  </div>
                )}
              </div>

              {/* Availability & Check-in/out Block Controls (Stop Sell / CTA / CTD) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <label className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  stopSell
                    ? 'bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-800 text-red-900 dark:text-red-300'
                    : 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}>
                  <input
                    type="checkbox"
                    checked={stopSell}
                    onChange={(e) => setStopSell(e.target.checked)}
                    className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-xs">
                    <span className="font-semibold block">Block these dates</span>
                    <span className="text-2xs opacity-75">Nobody can book. Use it for repairs, or when you need the room yourself.</span>
                  </span>
                </label>

              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSaving}
                  leftIcon={isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                >
                  {ruleType === 'floor' && ratePerNight.trim() !== ''
                    ? `Save Minimum Floor (≥ ₹${ratePerNight})`
                    : 'Save Rate & Restrictions Rule'}
                </Button>
              </div>
            </form>

            {/* Confirmation & Preview Modal before saving */}
            <Modal
              show={showConfirmModal}
              onClose={() => !isSaving && setShowConfirmModal(false)}
              size="md"
              popup
              className="z-70"
            >
              <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-xl border border-gray-200 dark:border-gray-700">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                      Confirm Changes Before Saving
                    </h3>
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

                {/* Body */}
                <div className="p-5 space-y-4">
                  {/* Irreversible Warning Callout */}
                  <div className="p-3.5 rounded-lg border border-red-200 dark:border-red-800/80 bg-red-50 dark:bg-red-950/40 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-red-800 dark:text-red-200 uppercase tracking-wide">
                        This change is not reversible
                      </p>
                      <p className="text-2xs text-red-700 dark:text-red-300 mt-0.5 leading-relaxed">
                        Once confirmed, this will immediately overwrite existing nightly prices and rules for the selected dates across Airbnb, Booking.com, and direct bookings.
                      </p>
                    </div>
                  </div>

                  {/* Structured Preview of Changes */}
                  <div className="bg-gray-50 dark:bg-gray-900/60 rounded-lg border border-gray-200 dark:border-gray-700 p-3.5 space-y-3 text-xs">
                    {/* Target Properties / Units */}
                    <div>
                      <span className="text-2xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block mb-1">
                        Properties / Units Affected ({rooms.length > 0 ? `${selectedRoomIds.length} of ${rooms.length}` : 'Entire Property'})
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {rooms.length > 0 ? (
                          selectedRoomIds.length === rooms.length ? (
                            <span className="px-2 py-0.5 rounded text-2xs font-semibold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200">
                              All {rooms.length} Units ({rooms.map((r) => r.name).join(', ')})
                            </span>
                          ) : (
                            rooms
                              .filter((r) => selectedRoomIds.includes(r.id))
                              .map((room) => (
                                <span
                                  key={room.id}
                                  className="px-2 py-0.5 rounded text-2xs font-semibold bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200"
                                >
                                  {room.name}
                                </span>
                              ))
                          )
                        ) : (
                          <span className="px-2 py-0.5 rounded text-2xs font-semibold bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200">
                            Entire Property
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-gray-200 dark:border-gray-700">
                      <div>
                        <span className="text-2xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block">
                          Date Range
                        </span>
                        <p className="font-semibold text-gray-900 dark:text-white text-xs mt-0.5">
                          {formatDateOrdinal(startDate)} → {formatDateOrdinal(endDate)}
                        </p>
                        <span className="text-2xs text-gray-500">
                          {countNights(startDate, endDate)} nights total
                        </span>
                      </div>

                      <div>
                        <span className="text-2xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block">
                          Applicable Days
                        </span>
                        <p className="font-semibold text-gray-900 dark:text-white text-xs mt-0.5">
                          {isSingleNight
                            ? 'Single Night'
                            : formatDaysOfWeek(selectedDays.length === 7 ? null : selectedDays.join(','))}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-gray-200 dark:border-gray-700">
                      <div>
                        <span className="text-2xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block">
                          Price / Rule Action
                        </span>
                        <p className="font-semibold text-gray-900 dark:text-white text-xs mt-0.5">
                          {stopSell ? (
                            <span className="text-red-600 dark:text-red-400 font-bold">🚫 Dates Blocked</span>
                          ) : ratePerNight.trim() !== '' ? (
                            ruleType === 'floor' ? (
                              <span className="text-amber-600 dark:text-amber-400 font-bold">
                                Floor ≥ ₹{ratePerNight}/night
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                Exact ₹{ratePerNight}/night
                              </span>
                            )
                          ) : (
                            <span className="text-gray-500">Keep current prices</span>
                          )}
                        </p>
                      </div>

                      <div>
                        <span className="text-2xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block">
                          Stay Limits
                        </span>
                        <p className="font-semibold text-gray-900 dark:text-white text-xs mt-0.5">
                          {hasStayRestrictions && (minStay || maxStay) ? (
                            <span>
                              {minStay ? `Min ${minStay}n` : ''}
                              {minStay && maxStay ? ', ' : ''}
                              {maxStay ? `Max ${maxStay}n` : ''}
                            </span>
                          ) : (
                            <span className="text-gray-500">No stay limits</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-3 flex justify-end gap-2.5 bg-gray-50/50 dark:bg-gray-800/50">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isSaving}
                    onClick={() => setShowConfirmModal(false)}
                  >
                    Cancel & Go Back
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isSaving}
                    onClick={executeSaveRule}
                    leftIcon={isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  >
                    {isSaving ? 'Applying Changes...' : 'Confirm & Apply Rule'}
                  </Button>
                </div>
              </div>
            </Modal>

            {/* Existing Rate Rules Table - collapsed by default, rows paginated
                (see the showRulesList / rulesPage comment above). */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Active Date-Range Rules ({rateRules.length})
                </h4>
                {rateRules.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setShowRulesList((v) => !v); setRulesPage(1); }}
                    className="text-2xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer shrink-0"
                  >
                    {showRulesList ? 'Hide list' : 'Show list'}
                  </button>
                )}
              </div>

              {rateRules.length === 0 ? (
                <div className="text-center py-6 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700 text-xs text-gray-400">
                  No custom rate rules set. All dates use standard base tariffs and restrictions.
                </div>
              ) : !showRulesList ? (
                <div className="text-center py-4 px-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                  {rateRules.length} active rule{rateRules.length === 1 ? '' : 's'} cover your dates. Setting a rate above adds a new one or overrides these for the dates it touches.{' '}
                  <button
                    type="button"
                    onClick={() => setShowRulesList(true)}
                    className="text-blue-600 dark:text-blue-400 font-semibold cursor-pointer"
                  >
                    Show the full list
                  </button>{' '}
                  to review or delete individual rules.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-semibold uppercase text-2xs border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="px-3 py-2.5">Date Range</th>
                        <th className="px-3 py-2.5">Scope / Room</th>
                        <th className="px-3 py-2.5">Label</th>
                        <th className="px-3 py-2.5">Price / night</th>
                        <th className="px-3 py-2.5">Restrictions</th>
                        <th className="px-3 py-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                      {rateRules.slice((rulesPage - 1) * RULES_PAGE_SIZE, rulesPage * RULES_PAGE_SIZE).map((rule) => (
                        <tr key={rule.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50">
                          <td className="px-3 py-2 font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                            <div>
                              {rule.start_date} <span className="font-normal text-gray-400">→</span> {rule.end_date}
                            </div>
                            {rule.days_of_week && (
                              <div className="text-2xs font-normal text-blue-600 dark:text-blue-400">
                                {formatDaysOfWeek(rule.days_of_week)}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                            {rule.room_name || 'All Rooms / Property'}
                          </td>
                          <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                            {rule.rule_name || '-'}
                          </td>
                          <td className="px-3 py-2">
                            {rule.rate_per_night != null ? (
                              rule.rule_type === 'floor' ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 text-2xs font-bold rounded bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
                                    Floor
                                  </span>
                                  <span className="font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                                    ≥ ₹{Math.round(rule.rate_per_night)}
                                  </span>
                                </div>
                              ) : (
                                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                  ₹{Math.round(rule.rate_per_night)}
                                </span>
                              )
                            ) : (
                              <span className="text-gray-400 font-normal">Base Rate</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {!!rule.stop_sell && (
                                <span className="px-1.5 py-0.5 text-2xs font-bold rounded-md bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800">
                                  Stop Sell
                                </span>
                              )}
                              {rule.min_stay_arrival != null && (
                                <span className="px-1.5 py-0.5 text-2xs font-semibold rounded-md bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                  Min {rule.min_stay_arrival}N (Arr)
                                </span>
                              )}
                              {rule.min_stay_through != null && (
                                <span className="px-1.5 py-0.5 text-2xs font-semibold rounded-md bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                  Min {rule.min_stay_through}N (Thr)
                                </span>
                              )}
                              {rule.max_stay != null && (
                                <span className="px-1.5 py-0.5 text-2xs font-semibold rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700">
                                  Max {rule.max_stay}N
                                </span>
                              )}
                              {!!rule.closed_to_arrival && (
                                <span className="px-1.5 py-0.5 text-2xs font-semibold rounded-md bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
                                  CTA
                                </span>
                              )}
                              {!!rule.closed_to_departure && (
                                <span className="px-1.5 py-0.5 text-2xs font-semibold rounded-md bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
                                  CTD
                                </span>
                              )}
                              {!rule.stop_sell && rule.min_stay_arrival == null && rule.min_stay_through == null && rule.max_stay == null && !rule.closed_to_arrival && !rule.closed_to_departure && (
                                <span className="text-gray-400 text-2xs italic">None</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              variant="danger"
                              size="xs"
                              onClick={() => handleDeleteRule(rule.id)}
                              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                            >
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <TablePagination
                    page={rulesPage}
                    totalItems={rateRules.length}
                    pageSize={RULES_PAGE_SIZE}
                    onPageChange={setRulesPage}
                    itemLabel="rules"
                  />
                </div>
              )}
            </div>
          </div>
    </div>
  );
};
export default PricingRulesPanel;
