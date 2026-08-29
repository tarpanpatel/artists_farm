import React, { useState, useEffect } from 'react';
import { Modal } from 'flowbite-react';
import { Button } from './Button';
import { RateRule, saveRateRuleDB, deleteRateRuleDB, updatePricingModeDB } from '../services/api';
import { Trash2, Plus, DollarSign, Share2, Check, X, Loader2 } from './icons/FlowbiteIcons';
import { useToast } from './ToastContext';

interface RateRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId?: number;
  rooms?: Array<{ id: number; name: string; default_tariff?: number }>;
  rateRules: RateRule[];
  pricingMode: 'flat' | 'variable';
  defaultTariff?: number | null;
  propertySlug?: string;
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
  propertySlug,
  onRulesUpdated,
  initialStartDate,
  initialEndDate,
}) => {
  const { showToast } = useToast();
  const [currentPricingMode, setCurrentPricingMode] = useState<'flat' | 'variable'>(pricingMode);
  const [startDate, setStartDate] = useState(initialStartDate || new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(initialEndDate || new Date().toISOString().split('T')[0]);
  const [ratePerNight, setRatePerNight] = useState<string>('');
  const [ruleName, setRuleName] = useState<string>('');
  const [selectedRoomIds, setSelectedRoomIds] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    setCurrentPricingMode(pricingMode);
  }, [pricingMode]);

  useEffect(() => {
    if (initialStartDate) setStartDate(initialStartDate);
    if (initialEndDate) setEndDate(initialEndDate);
  }, [initialStartDate, initialEndDate]);

  const handleTogglePricingMode = async (newMode: 'flat' | 'variable') => {
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
    const rateNum = parseFloat(ratePerNight);
    if (!startDate || !endDate || isNaN(rateNum) || rateNum < 0) {
      showToast('Please enter valid dates and a positive nightly rate.', { type: 'error' });
      return;
    }

    if (startDate > endDate) {
      showToast('Start date cannot be after end date.', { type: 'error' });
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
      };

      const res = await saveRateRuleDB(payload);
      if (res.success) {
        showToast('Dynamic rate rule saved successfully.', { type: 'success' });
        setRatePerNight('');
        setRuleName('');
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

  const handleCopyPublicLink = () => {
    const slug = propertySlug || '';
    const url = `${window.location.origin}/availability.php${slug ? `?property_slug=${encodeURIComponent(slug)}` : ''}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    showToast('Public availability link copied to clipboard!', { type: 'success' });
    setTimeout(() => setCopiedLink(false), 2500);
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
      size="2xl"
      dismissible
      className="z-50"
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <DollarSign className="w-4 h-4" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white m-0">
            Pricing Mode & Dynamic Rate Rules
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

      <div className="p-6 overflow-y-auto max-h-[80vh] space-y-6">
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

        {/* Create / Bulk-Apply Rate Rule Form */}
        <form onSubmit={handleSaveRule} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-blue-600" />
            Set Date-Range Rate Override
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-2xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Start Date
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
                End Date (Inclusive)
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-2xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nightly Rate (₹)
              </label>
              <input
                type="number"
                required
                min="0"
                step="1"
                placeholder="e.g. 4500"
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
                placeholder="e.g. Weekend Peak, Diwali Season"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                className="w-full h-10 px-3 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
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
              Save Rate Rule
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
              No custom rate rules set. All dates use the standard base tariff.
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
                        ₹{Math.round(rule.rate_per_night)}
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

        {/* Shareable Availability Webpage Footer Bar */}
        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-xs font-semibold text-blue-900 dark:text-blue-300">
              Live Public Availability Page (No Login Required)
            </span>
          </div>
          <Button
            variant="secondary"
            size="xs"
            onClick={handleCopyPublicLink}
            leftIcon={copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
          >
            {copiedLink ? 'Copied Link' : 'Copy Share Link'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
export default RateRuleModal;
