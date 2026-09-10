import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal } from 'flowbite-react';
import { Button } from './Button';
import { RateRule, saveRateRuleDB, deleteRateRuleDB, apiFetch } from '../services/api';
import { Trash2, Plus, Loader2, Pencil, Edit2, ChevronDown, ChevronUp, Check, Home, Info, AlertTriangle, AlertCircle, X, Search, Calendar, List } from './icons/FlowbiteIcons';
import { useToast } from './ToastContext';
import { TablePagination } from './TablePagination';
import { FloatingInput } from './FloatingInput';
import { FloatingSelect } from './FloatingSelect';
import { DateRangePicker } from './DateRangePicker';
import { formatDateOrdinal, formatDateDDMMYY } from '../utils/dateUtils';
import { HolidaysGuideModal } from './HolidaysGuideModal';
import { Popover } from './Popover';
import { ToggleSwitch } from './ToggleSwitch';

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
 * The actual "Dynamic Pricing" content - base price editing, the
 * dynamic pricing rule form (day-of-week, min/max stay, stop sell, floor/fixed
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
  const [rulesSearchQuery, setRulesSearchQuery] = useState<string>('');

  // Editing state for existing dynamic pricing rules
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Mobile-friendly inline unit picker
  const [isUnitsPickerOpen, setIsUnitsPickerOpen] = useState<boolean>(false);

  // Indian Holidays & Wedding Muhurats Guide Modal state
  const [showHolidaysModal, setShowHolidaysModal] = useState<boolean>(false);

  const handleApplyHolidayDates = (start: string, end: string, suggestedName?: string) => {
    setStartDate(start);
    setEndDate(end);
    if (suggestedName && !ruleName.trim()) {
      setRuleName(suggestedName);
    }
    showToast(
      `Applied dates for ${suggestedName || 'selected occasion'} (${formatDateDDMMYY(start)} → ${formatDateDDMMYY(end)})`,
      { type: 'success' }
    );
  };

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
  //
  // Round-tripped, not authored (fixed 10 Sep 2026). Hardcoding these to false
  // did not mean "never set them" - the payload below sends
  // `closed_to_arrival: closedToArrival ? 1 : 0` on EVERY save, so editing any
  // older rule that carried CTA/CTD silently cleared it. The rules list still
  // renders those badges, so the owner could watch a "CTA" badge disappear
  // after editing something as unrelated as the price, with no warning. Holding
  // the rule's own values in state and sending them back unchanged keeps the
  // stated intent (this form never AUTHORS them) without destroying them.
  const [closedToArrival, setClosedToArrival] = useState(false);
  const [closedToDeparture, setClosedToDeparture] = useState(false);
  // Day-of-week scoping (4 Sep 2026, "Monday to Friday 3000, Saturday and
  // Sunday 4000") - all 7 selected = applies every day (unchanged default
  // behavior), matching what saveRateRule() on the backend normalizes an
  // "every day" selection to (NULL, not a literal 7-item list).
  const [selectedDays, setSelectedDays] = useState<string[]>([...ALL_DAY_CODES]);
  const [dayPresetSelection, setDayPresetSelection] = useState<'all' | 'weekdays' | 'weekends' | 'custom'>('all');

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
        id: editingRuleId || undefined,
        start_date: startDate,
        end_date: endDate,
        // Block mode hides the rate and stay sections entirely, so it must not
        // save what it stopped showing (fixed 10 Sep 2026). Typing a price and
        // THEN switching "Block these dates" on used to save both - an invisible
        // rate that AriDrainWorker still pushes to Airbnb and Booking.com as the
        // nightly price for those dates. That is exactly the silent rate push
        // the whole Push Confirmation Gate exists to prevent (CHANNEX.md 5.4b),
        // arrived at through a form that told the owner a block needs "dates and
        // a unit, nothing more". The local state is deliberately NOT cleared, so
        // toggling Block back off restores whatever they had typed.
        rate_per_night: stopSell ? null : rateNum,
        rule_name: ruleName.trim() || undefined,
        // [null] means "the property itself" and is ONLY valid for a
        // single-unit property, which has no room rows. With units present the
        // guard above has already required a real selection.
        room_ids: rooms.length === 0 ? [null] : selectedRoomIds,
        min_stay_arrival: stopSell ? null : (minStayType === 'arrival' ? minStayNum : null),
        min_stay_through: stopSell ? null : (minStayType === 'through' ? minStayNum : null),
        max_stay: stopSell ? null : maxStayNum,
        stop_sell: stopSell ? 1 : 0,
        closed_to_arrival: closedToArrival ? 1 : 0,
        closed_to_departure: closedToDeparture ? 1 : 0,
        // A one-night rule covers exactly one weekday, so day-of-week scoping
        // can only ever be a no-op or a contradiction. Always send "every day"
        // there rather than whatever the (hidden) picker happens to hold - it
        // could still be a narrowed selection left over from a wider range.
        // Same for a "Block these dates" rule: the day picker is hidden in
        // block mode, and a block must cover every day of the chosen range.
        days_of_week: isSingleNight || stopSell ? [...ALL_DAY_CODES] : selectedDays,
        rule_type: (!stopSell && rateNum !== null) ? ruleType : 'fixed',
      };

      const res = await saveRateRuleDB(payload);
      if (res.success) {
        showToast(editingRuleId ? 'Pricing rule updated.' : 'Saved. These dates are updated everywhere.', { type: 'success' });
        setEditingRuleId(null);
        setRatePerNight('');
        setRuleType('fixed');
        setRuleName('');
        setMinStay('');
        setMaxStay('');
        setHasStayRestrictions(false);
        setStopSell(false);
        setClosedToArrival(false);
        setClosedToDeparture(false);
        setSelectedDays([...ALL_DAY_CODES]);
        setDayPresetSelection('all');
        setSelectedRoomIds([]);
        setShowConfirmModal(false);
        onRulesUpdated();
      } else {
        showToast(res.message || 'Could not save this pricing rule', { type: 'error' });
      }
    } catch {
      showToast('Network problem - this pricing rule was not saved', { type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditRule = (rule: RateRule) => {
    if (!rule.id) return;
    setEditingRuleId(rule.id);
    setStartDate(rule.start_date);
    setEndDate(rule.end_date);
    if (rule.room_id) {
      setSelectedRoomIds([rule.room_id]);
    } else {
      setSelectedRoomIds(rooms.map((r) => r.id));
    }
    setRatePerNight(rule.rate_per_night != null ? String(Math.round(rule.rate_per_night)) : '');
    setRuleType(rule.rule_type || 'fixed');
    setRuleName(rule.rule_name || '');
    if (rule.min_stay_arrival != null) {
      setMinStay(String(rule.min_stay_arrival));
      setMinStayType('arrival');
    } else if (rule.min_stay_through != null) {
      setMinStay(String(rule.min_stay_through));
      setMinStayType('through');
    } else {
      setMinStay('');
    }
    setMaxStay(rule.max_stay != null ? String(rule.max_stay) : '');
    setHasStayRestrictions(rule.min_stay_arrival != null || rule.min_stay_through != null || rule.max_stay != null);
    setStopSell(!!rule.stop_sell);
    setClosedToArrival(!!rule.closed_to_arrival);
    setClosedToDeparture(!!rule.closed_to_departure);
    if (rule.days_of_week) {
      const days = rule.days_of_week.split(',').filter(Boolean);
      setSelectedDays(days);
      const isWeekdaysOnly = days.length === 5 && WEEKDAY_CODES.every((d) => days.includes(d));
      const isWeekendsOnly = days.length === 2 && WEEKEND_CODES.every((d) => days.includes(d));
      setDayPresetSelection(isWeekdaysOnly ? 'weekdays' : isWeekendsOnly ? 'weekends' : 'custom');
    } else {
      setSelectedDays([...ALL_DAY_CODES]);
      setDayPresetSelection('all');
    }
    // The rules list now opens in its own modal (10 Sep 2026) - close it
    // first, or scrollIntoView below would try to scroll the page behind an
    // overlay that's still covering it, and the editor would be invisible
    // until the user closed the modal themselves.
    setShowRulesList(false);
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
    showToast(`Loaded rule #${rule.id} into the editor.`, { type: 'info' });
  };

  const cancelEdit = () => {
    setEditingRuleId(null);
    setRatePerNight('');
    setRuleType('fixed');
    setRuleName('');
    setMinStay('');
    setMaxStay('');
    setHasStayRestrictions(false);
    setStopSell(false);
    setClosedToArrival(false);
    setClosedToDeparture(false);
    setSelectedDays([...ALL_DAY_CODES]);
    setDayPresetSelection('all');
    setSelectedRoomIds([]);
  };

  const handleDeleteRule = async (id?: number) => {
    if (!id) return;
    try {
      const res = await deleteRateRuleDB(id);
      if (res.success) {
        showToast('Pricing rule removed.', { type: 'info' });
        if (editingRuleId === id) {
          cancelEdit();
        }
        onRulesUpdated();
      } else {
        showToast(res.message || 'Could not delete this pricing rule', { type: 'error' });
      }
    } catch {
      showToast('Network problem - this pricing rule was not deleted', { type: 'error' });
    }
  };

  const toggleDay = (code: string) => {
    setDayPresetSelection('custom');
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

  const filteredRules = useMemo(() => {
    // Newest additions first (10 Sep 2026, explicit request) - `id` is a
    // plain auto-increment on room_rate_rules, so a higher id is always a
    // more recently created row; there's no separate created_at column to
    // sort by instead. An edited rule keeps its original id (saveRateRule()
    // UPDATEs in place rather than re-inserting), so this orders by when a
    // rule was first created, not last touched - matches "last additions".
    const sorted = [...rateRules].sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
    if (!rulesSearchQuery.trim()) return sorted;
    const q = rulesSearchQuery.toLowerCase().trim();
    return sorted.filter((rule) => {
      const roomName = (rule.room_name || 'all rooms / property').toLowerCase();
      const ruleName = (rule.rule_name || '').toLowerCase();
      const startFormatted = formatDateDDMMYY(rule.start_date).toLowerCase();
      const endFormatted = formatDateDDMMYY(rule.end_date).toLowerCase();
      const price = rule.rate_per_night != null ? String(Math.round(rule.rate_per_night)) : '';
      const days = rule.days_of_week ? formatDaysOfWeek(rule.days_of_week).toLowerCase() : 'every day';
      const restrictions = [
        rule.stop_sell ? 'stop sell' : '',
        rule.min_stay_arrival != null ? `min ${rule.min_stay_arrival}` : '',
        rule.min_stay_through != null ? `min ${rule.min_stay_through}` : '',
        rule.max_stay != null ? `max ${rule.max_stay}` : '',
        rule.closed_to_arrival ? 'cta' : '',
        rule.closed_to_departure ? 'ctd' : '',
      ].join(' ').toLowerCase();

      return (
        roomName.includes(q) ||
        ruleName.includes(q) ||
        rule.start_date.includes(q) ||
        rule.end_date.includes(q) ||
        startFormatted.includes(q) ||
        endFormatted.includes(q) ||
        price.includes(q) ||
        days.includes(q) ||
        restrictions.includes(q)
      );
    });
  }, [rateRules, rulesSearchQuery]);

  useEffect(() => {
    setRulesPage(1);
  }, [rulesSearchQuery]);

  return (
    <div className="space-y-6">
        <div className="space-y-5">
          {!isBasePriceOpen ? (
            /* Collapsed Base Price Summary Card */
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <span className="text-base font-bold leading-none select-none">₹</span>
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
                    Default nightly rate when no dynamic rules are set.
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
                    Default nightly rate when no dynamic rules are set.
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
                        className="p-3 bg-white dark:bg-gray-800 flex items-center justify-between gap-3 hover:bg-gray-50/70 dark:hover:bg-gray-750 transition-colors"
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

                        <div className="flex items-center gap-2 shrink-0 ml-auto">
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
            {/* Create / Bulk-Apply Rate & Restriction Rule Form */}
            <form ref={formRef} onSubmit={handleSaveRule} className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      {editingRuleId ? <Edit2 className="w-3.5 h-3.5 text-blue-600" /> : <Plus className="w-3.5 h-3.5 text-blue-600" />}
                      {editingRuleId ? `Edit dynamic pricing rule #${editingRuleId}` : 'Add a dynamic pricing rule'}
                    </h4>
                    <Popover
                      placement="bottom"
                      trigger="click"
                      title="How dynamic pricing works"
                      content={
                        <div className="p-3 text-xs text-gray-700 dark:text-gray-200 space-y-2 leading-relaxed max-w-xs">
                          <p>• Pick the dates. Set the price for them.</p>
                          <p>• e.g. Charge more for Diwali. Charge less in a quiet month.</p>
                          <p>• Or ask for 3 nights minimum on New Year.</p>
                          <p>• Dates you don't touch keep their normal price.</p>
                          <p>• Saved prices go to Airbnb, Booking.com and your page.</p>
                        </div>
                      }
                    >
                      <button
                        type="button"
                        aria-label="How dynamic pricing works"
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Help?
                      </button>
                    </Popover>
                  </div>
                  <span className="text-2xs text-gray-400">Sent to Airbnb, Booking.com & your own booking page</span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => setShowHolidaysModal(true)}
                  className="self-start sm:self-auto text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800"
                  leftIcon={<Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />}
                >
                  Indian Festivals & Wedding Dates
                </Button>
              </div>

              {/* Editing Rule Active Banner */}
              {editingRuleId && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Edit2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-blue-900 dark:text-blue-100 block truncate">
                        Editing Rule #{editingRuleId}
                      </span>
                      <p className="text-2xs text-blue-700 dark:text-blue-300">
                        Make your changes below and click Update to apply them.
                      </p>
                    </div>
                  </div>
                  <Button variant="secondary" size="xs" onClick={cancelEdit}>
                    Cancel Edit
                  </Button>
                </div>
              )}

              {/* Chosen Unit / Target Room Selector */}
              {rooms.length > 1 ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-2xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 shrink-0">
                        Selected Unit
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

                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      onClick={() => setIsUnitsPickerOpen((v) => !v)}
                      className="w-full sm:w-auto shrink-0"
                      leftIcon={<Home className="w-3.5 h-3.5" />}
                      rightIcon={isUnitsPickerOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    >
                      {isUnitsPickerOpen ? 'Done Selecting' : 'Select Units'}
                    </Button>
                  </div>

                  {isUnitsPickerOpen && (
                    <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2.5">
                      <div className="flex items-center justify-between px-1">
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

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-0.5">
                        {rooms.map((room) => {
                          const isChecked = selectedRoomIds.includes(room.id);
                          return (
                            <label
                              key={room.id}
                              className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                                isChecked
                                  ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200'
                                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100/60 dark:hover:bg-gray-750'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleRoomSelection(room.id)}
                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                              />
                              <span className="text-xs font-medium truncate flex-1">{room.name}</span>
                              {room.default_tariff != null && (
                                <span className="text-2xs text-gray-400 dark:text-gray-400 shrink-0 ms-1">
                                  (₹{Math.round(room.default_tariff)})
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>

                      <div className="flex justify-end pt-1">
                        <Button
                          type="button"
                          variant="primary"
                          size="xs"
                          onClick={() => setIsUnitsPickerOpen(false)}
                        >
                          Done
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : rooms.length === 1 ? (
                <div className="flex items-center gap-2">
                  <span className="text-2xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                    Selected Unit:
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

              {/* Block these dates - moved below the unit/date pickers (10 Sep
                  2026, explicit request) so the dates being blocked are chosen
                  first and this toggle reads as "block THIS selection" rather
                  than a mode switch at the top of an otherwise-empty form.
                  When ON, the rate/pricing/stay sections below are hidden
                  entirely: a block needs dates + a unit, nothing more. */}
              <div className={`p-3.5 rounded-xl border transition-colors ${
                stopSell
                  ? 'bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-800'
                  : 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {stopSell && <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />}
                      <span className="text-xs font-semibold text-gray-900 dark:text-white">
                        {stopSell ? 'These dates are blocked' : 'Block these dates'}
                      </span>
                    </div>
                    <p className="text-2xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {stopSell
                        ? 'Nobody can book these nights. Save to apply.'
                        : 'Nobody can book. Use it for repairs, or when you need the room yourself.'}
                    </p>
                  </div>
                  <ToggleSwitch enabled={stopSell} onChange={setStopSell} />
                </div>
              </div>

              {/* Rate, days & stay rules are irrelevant for a block - hide all
                  of the below when "Block these dates" is switched on so the
                  form reduces to just picks dates + unit and save. */}
              {!stopSell && (
                <>
              {/* Day-of-Week Scoping - radio options for Every Day, Weekdays, Weekends, Custom */}
              <div className="p-3.5 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-900 dark:text-white">
                    Applicable Days
                  </label>
                  <p className="text-2xs text-gray-500 dark:text-gray-400">
                    Choose whether this price/rule applies Every Day, on Weekdays, on Weekends, or Custom Days.
                  </p>
                </div>

                {/* Radio Options: Every Day, Weekdays, Weekends, Custom */}
                <div className="flex flex-wrap items-center gap-4 sm:gap-6 py-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
                    <input
                      type="radio"
                      name="day_preset_option"
                      value="all"
                      checked={dayPresetSelection === 'all'}
                      onChange={() => {
                        setDayPresetSelection('all');
                        setSelectedDays([...ALL_DAY_CODES]);
                      }}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                    />
                    <span>Every Day</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
                    <input
                      type="radio"
                      name="day_preset_option"
                      value="weekdays"
                      checked={dayPresetSelection === 'weekdays'}
                      onChange={() => {
                        setDayPresetSelection('weekdays');
                        setSelectedDays([...WEEKDAY_CODES]);
                      }}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                    />
                    <span>Weekdays</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
                    <input
                      type="radio"
                      name="day_preset_option"
                      value="weekends"
                      checked={dayPresetSelection === 'weekends'}
                      onChange={() => {
                        setDayPresetSelection('weekends');
                        setSelectedDays([...WEEKEND_CODES]);
                      }}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                    />
                    <span>Weekends</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
                    <input
                      type="radio"
                      name="day_preset_option"
                      value="custom"
                      checked={dayPresetSelection === 'custom'}
                      onChange={() => {
                        // Start from a clean slate (10 Sep 2026, explicit
                        // request) - switching to Custom used to keep
                        // whatever days the previous preset (e.g. Weekends)
                        // had selected, so it looked like Sat/Sun were a
                        // deliberate custom choice when they were really just
                        // leftovers. Custom Days means "you pick", not
                        // "inherit the last preset".
                        setDayPresetSelection('custom');
                        setSelectedDays([]);
                      }}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                    />
                    <span>Custom Days</span>
                    {dayPresetSelection === 'custom' && (
                      <span className="px-1.5 py-0.5 text-2xs font-semibold rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                        Select the days below
                      </span>
                    )}
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

              {/* Nightly Rate & Label - always one row, even on mobile (10
                  Sep 2026, explicit request) - was grid-cols-1 sm:grid-cols-2,
                  stacking into two rows below the sm breakpoint. */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
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

              {/* Pricing Rule Type: Exact Price vs Minimum Price (Always visible) -
                  "Floor" is internal-only terminology (the rule_type column's
                  actual value); every user-facing label reads "Minimum Price"
                  instead (10 Sep 2026, explicit request). */}
              <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 block">
                    Pricing Rule Type
                  </span>
                  <span className="text-2xs font-medium text-gray-500 dark:text-gray-400">
                    {ruleType === 'floor' ? 'Minimum Price Mode' : 'Fixed Price Mode'}
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
                        Force Minimum Price
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
                      How long guests can stay (Optional)
                    </span>
                    <span className="text-2xs text-gray-500 dark:text-gray-400 block">
                      Require a minimum stay or limit the maximum nights a guest can book. Pushed to Airbnb, Booking.com & direct booking.
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
              </>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                {editingRuleId && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={cancelEdit}
                  >
                    Cancel Edit
                  </Button>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSaving}
                  leftIcon={isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editingRuleId ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                >
                  {editingRuleId
                    ? 'Update Rate & Restrictions'
                    : stopSell
                    ? 'Block These Dates'
                    : ruleType === 'floor' && ratePerNight.trim() !== ''
                    ? `Force Minimum Price (≥ ₹${ratePerNight})`
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
                      {editingRuleId ? `Confirm Updates to Rule #${editingRuleId}` : 'Confirm Changes Before Saving'}
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
                                Minimum price should not be less than ₹{ratePerNight}/night
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
                    {isSaving ? (editingRuleId ? 'Updating Rule...' : 'Applying Changes...') : (editingRuleId ? 'Confirm & Update Rule' : 'Confirm & Apply Rule')}
                  </Button>
                </div>
              </div>
            </Modal>

            {/* Existing Rate Rules Section - a button that opens the full
                searchable, paginated list in a modal (10 Sep 2026, explicit
                request) rather than growing inline in the page - a property
                with thousands of rules made the page itself thousands of
                pixels tall every time "Show list" was expanded. */}
            <div className="space-y-3">
              <div className="pricing-rules-panel__gutter">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Active rules ({rateRules.length})
                </h4>
              </div>

              {rateRules.length === 0 ? (
                <div className="pricing-rules-panel__gutter text-center py-6 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700 text-xs text-gray-400">
                  No custom rate rules set. All dates use standard base tariffs and restrictions.
                </div>
              ) : (
                <div className="pricing-rules-panel__gutter text-center py-4 px-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2.5">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {rateRules.length} active rule{rateRules.length === 1 ? '' : 's'} cover your dates. Setting a rate above adds a new one or overrides these for the dates it touches.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => { setShowRulesList(true); setRulesPage(1); }}
                    leftIcon={<List className="w-3.5 h-3.5" />}
                  >
                    View Active Rules ({rateRules.length})
                  </Button>
                </div>
              )}
            </div>

            {/* Active Rules Modal - same search/list/load-more/pagination
                content that used to render inline; pricing-rules-panel__gutter
                classes inside are now inert (that CSS rule only matches
                .app-shell__main .pricing-page, which a modal isn't) but left
                as-is rather than stripped from every line - harmless either
                way. */}
            <Modal show={showRulesList && rateRules.length > 0} onClose={() => setShowRulesList(false)} size="4xl">
              <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[85vh]">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Active Rules ({rateRules.length})</h3>
                  <button
                    type="button"
                    onClick={() => setShowRulesList(false)}
                    className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4 overflow-y-auto space-y-3">
                  {/* Search Bar Toolbar */}
                  <div className="pricing-rules-panel__gutter flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-gray-50 dark:bg-gray-800/60 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-gray-400">
                        <Search className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={rulesSearchQuery}
                        onChange={(e) => setRulesSearchQuery(e.target.value)}
                        placeholder="Search rules by room, label, date (dd/mm/yy), or price..."
                        className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full ps-9 pe-8 h-10"
                      />
                      {rulesSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setRulesSearchQuery('')}
                          className="absolute inset-y-0 end-0 flex items-center pe-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                          aria-label="Clear search"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-2 text-2xs text-gray-500 dark:text-gray-400 shrink-0 px-1">
                      <span>
                        Showing <strong className="text-gray-900 dark:text-white">{filteredRules.length}</strong> of {rateRules.length} rules
                      </span>
                    </div>
                  </div>

                  {filteredRules.length === 0 ? (
<div className="pricing-rules-panel__gutter text-center py-8 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700 text-xs text-gray-400">
                      No rate rules match "{rulesSearchQuery}".
                    </div>
                  ) : (
                    <>
                      {/* Mobile Cards View (md:hidden) */}
                      <div className="md:hidden space-y-3">
                        {filteredRules.slice(0, rulesPage * RULES_PAGE_SIZE).map((rule) => (
                          <div
                            key={rule.id}
                            className="p-3.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xs space-y-2.5"
                          >
                            {/* Top Row: Scope, Label & Actions */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                <span className="px-2 py-0.5 text-2xs font-semibold rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 shrink-0">
                                  {rule.room_name || 'All Units'}
                                </span>
                                {rule.rule_name && (
                                  <span className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                                    {rule.rule_name}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Button
                                  variant="edit"
                                  size="xs"
                                  onClick={() => handleEditRule(rule)}
                                  leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="danger"
                                  size="xs"
                                  onClick={() => handleDeleteRule(rule.id)}
                                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                                >
                                  Delete
                                </Button>
                              </div>
                            </div>

                            {/* Date Range Row (dd/mm/yy format) */}
                            <div className="flex items-center gap-2 flex-wrap text-xs text-gray-900 dark:text-white">
                              <div className="flex items-center gap-1.5 font-semibold">
                                <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <span>
                                  {formatDateOrdinal(rule.start_date)} <span className="font-normal text-gray-400">→</span> {formatDateOrdinal(rule.end_date)}
                                </span>
                              </div>
                              {rule.days_of_week && (
                                <span className="text-2xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded">
                                  {formatDaysOfWeek(rule.days_of_week)}
                                </span>
                              )}
                            </div>

                            {/* Bottom Row: Price & Restrictions */}
                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/60 flex-wrap">
                              <div>
                                {rule.rate_per_night != null ? (
                                  rule.rule_type === 'floor' ? (
                                    // "Floor" is internal-only terminology - every
                                    // user-facing label reads as a plain sentence
                                    // instead (10 Sep 2026, explicit request).
                                    <span className="font-bold text-amber-700 dark:text-amber-400 text-xs">
                                      Minimum price should not be less than ₹{Math.round(rule.rate_per_night)}
                                    </span>
                                  ) : (
                                    <span className="font-bold text-emerald-700 dark:text-emerald-400 text-xs">
                                      ₹{Math.round(rule.rate_per_night)}
                                      <span className="text-2xs text-gray-500 font-normal"> /night</span>
                                    </span>
                                  )
                                ) : (
                                  <span className="text-gray-400 text-xs font-normal">Base Rate</span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-1">
                                {!!rule.stop_sell && (
                                  <span className="px-1.5 py-0.5 text-2xs font-bold rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                                    Stop Sell
                                  </span>
                                )}
                                {rule.min_stay_arrival != null && (
                                  <span className="px-1.5 py-0.5 text-2xs font-semibold rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                                    Min {rule.min_stay_arrival}N
                                  </span>
                                )}
                                {rule.min_stay_through != null && (
                                  <span className="px-1.5 py-0.5 text-2xs font-semibold rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                                    Min {rule.min_stay_through}N (Thr)
                                  </span>
                                )}
                                {rule.max_stay != null && (
                                  <span className="px-1.5 py-0.5 text-2xs font-semibold rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                                    Max {rule.max_stay}N
                                  </span>
                                )}
                                {!!rule.closed_to_arrival && (
                                  <span className="px-1.5 py-0.5 text-2xs font-semibold rounded bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300">
                                    CTA
                                  </span>
                                )}
                                {!!rule.closed_to_departure && (
                                  <span className="px-1.5 py-0.5 text-2xs font-semibold rounded bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300">
                                    CTD
                                  </span>
                                )}
                                {!rule.stop_sell && rule.min_stay_arrival == null && rule.min_stay_through == null && rule.max_stay == null && !rule.closed_to_arrival && !rule.closed_to_departure && (
                                  <span className="text-gray-400 text-2xs italic">No stay limits</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Desktop Table View (hidden md:block) */}
                      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-semibold uppercase text-2xs border-b border-gray-200 dark:border-gray-700">
                            <tr>
                              <th className="px-3 py-2.5">Date Range (dd/mm/yy)</th>
                              <th className="px-3 py-2.5">Scope / Room</th>
                              <th className="px-3 py-2.5">Label</th>
                              <th className="px-3 py-2.5">Price / night</th>
                              <th className="px-3 py-2.5">Restrictions</th>
                              <th className="px-3 py-2.5 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                            {filteredRules.slice(0, rulesPage * RULES_PAGE_SIZE).map((rule) => (
                              <tr key={rule.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50">
                                <td className="px-3 py-2 font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                                  <div>
                                    {formatDateOrdinal(rule.start_date)} <span className="font-normal text-gray-400">→</span> {formatDateOrdinal(rule.end_date)}
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
                                      <span className="font-bold text-amber-700 dark:text-amber-400">
                                        Minimum price should not be less than ₹{Math.round(rule.rate_per_night)}
                                      </span>
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
                                      <span className="px-1.5 py-0.5 text-2xs font-bold rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                                        Stop Sell
                                      </span>
                                    )}
                                    {rule.min_stay_arrival != null && (
                                      <span className="px-1.5 py-0.5 text-2xs font-semibold rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                                        Min {rule.min_stay_arrival}N (Arr)
                                      </span>
                                    )}
                                    {rule.min_stay_through != null && (
                                      <span className="px-1.5 py-0.5 text-2xs font-semibold rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                                        Min {rule.min_stay_through}N (Thr)
                                      </span>
                                    )}
                                    {rule.max_stay != null && (
                                      <span className="px-1.5 py-0.5 text-2xs font-semibold rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                                        Max {rule.max_stay}N
                                      </span>
                                    )}
                                    {!!rule.closed_to_arrival && (
                                      <span className="px-1.5 py-0.5 text-2xs font-semibold rounded bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300">
                                        CTA
                                      </span>
                                    )}
                                    {!!rule.closed_to_departure && (
                                      <span className="px-1.5 py-0.5 text-2xs font-semibold rounded bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300">
                                        CTD
                                      </span>
                                    )}
                                    {!rule.stop_sell && rule.min_stay_arrival == null && rule.min_stay_through == null && rule.max_stay == null && !rule.closed_to_arrival && !rule.closed_to_departure && (
                                      <span className="text-gray-400 text-2xs italic">None</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <Button
                                      variant="edit"
                                      size="xs"
                                      onClick={() => handleEditRule(rule)}
                                      leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      variant="danger"
                                      size="xs"
                                      onClick={() => handleDeleteRule(rule.id)}
                                      leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Load More (10 Sep 2026, explicit request) - grows the
                          accumulated view by one more page of the newest-first
                          list instead of jumping straight to a numbered page.
                          Shares `rulesPage` with the TablePagination below it
                          (both call setRulesPage), so Next/Previous there just
                          grows/shrinks the same accumulated view rather than
                          isolating a single page - "load more" and "jump to a
                          page" are the same mechanism, not two competing ones. */}
                      {rulesPage * RULES_PAGE_SIZE < filteredRules.length && (
                        <div className="pricing-rules-panel__gutter flex justify-center">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setRulesPage((p) => p + 1)}
                          >
                            Load more ({filteredRules.length - rulesPage * RULES_PAGE_SIZE} more)
                          </Button>
                        </div>
                      )}

                      <TablePagination
                        page={rulesPage}
                        totalItems={filteredRules.length}
                        pageSize={RULES_PAGE_SIZE}
                        onPageChange={setRulesPage}
                        itemLabel="rules"
                      />
                    </>
                  )}
                </div>
              </div>
            </Modal>
          </div>

      {/* Indian Holidays, Festivals & Wedding Muhurats Guide Modal */}
      <HolidaysGuideModal
        isOpen={showHolidaysModal}
        onClose={() => setShowHolidaysModal(false)}
        onSelectRange={handleApplyHolidayDates}
      />
    </div>
  );
};
export default PricingRulesPanel;
