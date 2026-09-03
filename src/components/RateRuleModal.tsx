import React, { useState, useEffect } from 'react';
import { Modal } from 'flowbite-react';
import { Button } from './Button';
import { RateRule, saveRateRuleDB, deleteRateRuleDB, updatePricingModeDB } from '../services/api';
import { Trash2, Plus, DollarSign, X, Loader2 } from './icons/FlowbiteIcons';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';

interface RateRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId?: number;
  rooms?: Array<{ id: number; name: string; default_tariff?: number }>;
  rateRules: RateRule[];
  pricingMode: 'flat' | 'variable';
  defaultTariff?: number | null;
  onRulesUpdated: () => void;
  initialStartDate?: string;
  initialEndDate?: string;
}

export const RateRuleModal: React.FC<RateRuleModalProps> = ({
  isOpen,
  onClose,
  propertyId: _propertyId,
  rooms = [],
  rateRules,
  pricingMode,
  defaultTariff,
  onRulesUpdated,
  initialStartDate,
  initialEndDate,
}) => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [currentPricingMode, setCurrentPricingMode] = useState<'flat' | 'variable'>(pricingMode);
  const [startDate, setStartDate] = useState(initialStartDate || new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(initialEndDate || new Date().toISOString().split('T')[0]);
  const [ratePerNight, setRatePerNight] = useState<string>('');
  const [ruleName, setRuleName] = useState<string>('');
  const [selectedRoomIds, setSelectedRoomIds] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Restriction state fields
  const [minStay, setMinStay] = useState<string>('');
  const [minStayType, setMinStayType] = useState<'arrival' | 'through'>('arrival');
  const [maxStay, setMaxStay] = useState<string>('');
  const [stopSell, setStopSell] = useState<boolean>(false);
  const [closedToArrival, setClosedToArrival] = useState<boolean>(false);
  const [closedToDeparture, setClosedToDeparture] = useState<boolean>(false);

  useEffect(() => {
    setCurrentPricingMode(pricingMode);
  }, [pricingMode]);

  useEffect(() => {
    if (initialStartDate) setStartDate(initialStartDate);
    if (initialEndDate) setEndDate(initialEndDate);
  }, [initialStartDate, initialEndDate]);

  const handleTogglePricingMode = async (newMode: 'flat' | 'variable') => {
    if (newMode === currentPricingMode) return;

    // Both directions now immediately re-push live availability/rates to
    // Airbnb/Booking.com (4 Sep 2026 - the toggle used to only affect this
    // property's own internal calendar display; every saved rate rule
    // stayed live on OTAs regardless of which mode was selected, which is
    // exactly the kind of silent drift CLAUDE.md's Channex protocol asks to
    // gate behind an explicit confirmation). Same reasoning ChannelManager.tsx's
    // handlePushAri confirm dialog already uses for a manual ARI push.
    //
    // Skipped entirely when there are no saved rules at all (5 Sep 2026,
    // live feedback: switching tabs to just compare them interrupted every
    // single click with a warning dialog + toast) - with zero rules there is
    // nothing to suspend or activate, so the switch is genuinely a no-op
    // everywhere and the warning would be pure noise. updatePricingMode()'s
    // own outbox re-push already no-ops the same way (its date-range query
    // over room_rate_rules comes back empty), so this mirrors the real
    // backend effect instead of just hiding the dialog cosmetically.
    if (rateRules.length > 0) {
      const confirmed = await confirm({
        title: newMode === 'flat' ? 'Switch to Flat Base Rate?' : 'Switch to Dynamic Rules?',
        message: newMode === 'flat'
          ? `This immediately suspends every saved rate rule for this ${rooms.length > 1 ? 'room/property' : 'property'} everywhere - your own calendar, Airbnb, Booking.com, and your public availability page all switch to the flat base rate with no restrictions right away. Any dates a rule had Stop Sell-blocked will reopen. Rules stay saved and can be reactivated by switching back.`
          : `This immediately activates every saved rate rule for this ${rooms.length > 1 ? 'room/property' : 'property'} everywhere - your own calendar, Airbnb, Booking.com, and your public availability page will start showing rule rates and enforcing any Stop Sell/stay restrictions right away.`,
        confirmText: newMode === 'flat' ? 'Switch to Flat Rate' : 'Switch to Dynamic Rules',
        variant: 'warning',
      });
      if (!confirmed) return;
    }

    try {
      const res = await updatePricingModeDB(newMode);
      if (res.success) {
        setCurrentPricingMode(newMode);
        showToast(`Pricing mode set to ${newMode === 'variable' ? 'Dynamic Date-Range' : 'Flat Base Rate'}.`, { type: 'success' });
        onRulesUpdated();
      } else {
        showToast(res.message || 'Failed to update pricing mode', { type: 'error' });
      }
    } catch {
      showToast('Network error updating pricing mode', { type: 'error' });
    }
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const rateNum = ratePerNight.trim() !== '' ? parseFloat(ratePerNight) : null;
    const minStayNum = minStay.trim() !== '' ? parseInt(minStay, 10) : null;
    const maxStayNum = maxStay.trim() !== '' ? parseInt(maxStay, 10) : null;

    if (!startDate || !endDate) {
      showToast('Please enter valid start and end dates.', { type: 'error' });
      return;
    }

    if (startDate > endDate) {
      showToast('Start date cannot be after end date.', { type: 'error' });
      return;
    }

    const hasRestriction = minStayNum !== null || maxStayNum !== null || stopSell || closedToArrival || closedToDeparture;

    if (rateNum === null && !hasRestriction) {
      showToast('Please enter a nightly rate or at least one restriction (minimum stay, stop sell, CTA/CTD).', { type: 'error' });
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

    setIsSaving(true);
    try {
      const payload = {
        start_date: startDate,
        end_date: endDate,
        rate_per_night: rateNum,
        rule_name: ruleName.trim() || undefined,
        room_ids: selectedRoomIds.length > 0 ? selectedRoomIds : [null],
        min_stay_arrival: minStayType === 'arrival' ? minStayNum : null,
        min_stay_through: minStayType === 'through' ? minStayNum : null,
        max_stay: maxStayNum,
        stop_sell: stopSell ? 1 : 0,
        closed_to_arrival: closedToArrival ? 1 : 0,
        closed_to_departure: closedToDeparture ? 1 : 0,
      };

      const res = await saveRateRuleDB(payload);
      if (res.success) {
        showToast('Dynamic rate & restriction rule saved successfully.', { type: 'success' });
        setRatePerNight('');
        setRuleName('');
        setMinStay('');
        setMaxStay('');
        setStopSell(false);
        setClosedToArrival(false);
        setClosedToDeparture(false);
        setSelectedRoomIds([]);
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
    <Modal
      show={isOpen}
      onClose={onClose}
      size="3xl"
      dismissible
      className="z-50"
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <DollarSign className="w-4 h-4" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white m-0">
            Pricing Mode, Rates & Stay Restrictions
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 overflow-y-auto max-h-[82vh] space-y-6">
        {/* Pricing Mode Toggle Card */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Active Pricing Mode
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {currentPricingMode === 'variable'
                ? 'Dynamic rules override standard base rates for matching date ranges.'
                : `Using flat base rate (₹${defaultTariff ? Math.round(defaultTariff) : '0'}/night) for all dates.`}
            </p>
          </div>

          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={() => handleTogglePricingMode('flat')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                currentPricingMode === 'flat'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Flat Base Rate
            </button>
            <button
              type="button"
              onClick={() => handleTogglePricingMode('variable')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                currentPricingMode === 'variable'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Dynamic Rules
            </button>
          </div>
        </div>

        {/* Create / Bulk-Apply Rate & Restriction Rule Form */}
        <form onSubmit={handleSaveRule} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-blue-600" />
              Set Date-Range Rates & Restrictions
            </h4>
            <span className="text-2xs text-slate-400">OTA & Direct channel synced</span>
          </div>

          {/* Date range row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-2xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Start Date *
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-10 px-3 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-2xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                End Date (Inclusive) *
              </label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-10 px-3 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Nightly Rate & Label */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-2xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nightly Rate (₹) <span className="font-normal text-slate-400">(Optional if restrictions set)</span>
              </label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 4500 (or leave empty for base rate)"
                value={ratePerNight}
                onChange={(e) => setRatePerNight(e.target.value)}
                className="w-full h-10 px-3 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white font-semibold"
              />
            </div>
            <div>
              <label className="block text-2xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Rule Label (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Weekend Peak, Diwali 3N Min, Stop Sell"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                className="w-full h-10 px-3 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Minimum & Maximum Stay Restrictions */}
          <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 space-y-3">
            <span className="text-2xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block">
              Stay Duration Restrictions
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-2xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Min Stay Nights
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 2, 3, 5"
                  value={minStay}
                  onChange={(e) => setMinStay(e.target.value)}
                  className="w-full h-9 px-2.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-2xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Min Stay Type
                </label>
                <select
                  value={minStayType}
                  onChange={(e) => setMinStayType(e.target.value as 'arrival' | 'through')}
                  className="w-full h-9 px-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="arrival">Arrival Day Only (Standard)</option>
                  <option value="through">Through (Any stay spanning date)</option>
                </select>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Max Stay Nights (Optional)
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 14, 30"
                  value={maxStay}
                  onChange={(e) => setMaxStay(e.target.value)}
                  className="w-full h-9 px-2.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Availability & Check-in/out Block Controls (Stop Sell / CTA / CTD) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <label className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
              stopSell
                ? 'bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-800 text-red-900 dark:text-red-300'
                : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}>
              <input
                type="checkbox"
                checked={stopSell}
                onChange={(e) => setStopSell(e.target.checked)}
                className="rounded border-slate-300 text-red-600 focus:ring-red-500"
              />
              <span className="text-xs font-semibold">Stop Sell (Close Dates)</span>
            </label>

            <label className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
              closedToArrival
                ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-300'
                : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}>
              <input
                type="checkbox"
                checked={closedToArrival}
                onChange={(e) => setClosedToArrival(e.target.checked)}
                className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-xs font-semibold">Closed to Arrival (CTA)</span>
            </label>

            <label className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
              closedToDeparture
                ? 'bg-purple-50 dark:bg-purple-950/60 border-purple-300 dark:border-purple-800 text-purple-900 dark:text-purple-300'
                : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}>
              <input
                type="checkbox"
                checked={closedToDeparture}
                onChange={(e) => setClosedToDeparture(e.target.checked)}
                className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-xs font-semibold">Closed to Departure (CTD)</span>
            </label>
          </div>

          {/* Multi-Room Bulk Checkboxes (if multiple rooms available) */}
          {rooms.length > 1 && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xs font-semibold text-slate-700 dark:text-slate-300">
                  Apply To Specific Rooms (leave unselected for property-wide rule):
                </span>
                <button
                  type="button"
                  onClick={toggleAllRooms}
                  className="text-2xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                >
                  {selectedRoomIds.length === rooms.length ? 'Clear All' : 'Select All Rooms'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {rooms.map((room) => {
                  const isChecked = selectedRoomIds.includes(room.id);
                  return (
                    <label
                      key={room.id}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer border transition-colors ${
                        isChecked
                          ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRoomSelection(room.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{room.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSaving}
              leftIcon={isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            >
              Save Rate & Restrictions Rule
            </Button>
          </div>
        </form>

        {/* Existing Rate Rules Table */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Active Date-Range Rules ({rateRules.length})
          </h4>

          {rateRules.length === 0 ? (
            <div className="text-center py-6 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-400">
              No custom rate rules set. All dates use standard base tariffs and restrictions.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase text-2xs border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-3 py-2.5">Date Range</th>
                    <th className="px-3 py-2.5">Scope / Room</th>
                    <th className="px-3 py-2.5">Label</th>
                    <th className="px-3 py-2.5">Nightly Rate</th>
                    <th className="px-3 py-2.5">Restrictions</th>
                    <th className="px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                  {rateRules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                      <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        {rule.start_date} <span className="font-normal text-slate-400">→</span> {rule.end_date}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                        {rule.room_name || 'All Rooms / Property'}
                      </td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                        {rule.rule_name || '-'}
                      </td>
                      <td className="px-3 py-2 font-bold text-emerald-700 dark:text-emerald-400">
                        {rule.rate_per_night != null ? `₹${Math.round(rule.rate_per_night)}` : <span className="text-slate-400 font-normal">Base Rate</span>}
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
                            <span className="px-1.5 py-0.5 text-2xs font-semibold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
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
                            <span className="text-slate-400 text-2xs italic">None</span>
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
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
export default RateRuleModal;
