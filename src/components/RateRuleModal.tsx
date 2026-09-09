import React, { useState } from 'react';
import { Modal } from 'flowbite-react';
import { RateRule } from '../services/api';
import { DollarSign, X } from './icons/FlowbiteIcons';
import { PricingRulesPanel } from './PricingRulesPanel';

interface RateRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId?: number;
  rooms?: Array<{ id: number; name: string; default_tariff?: number }>;
  rateRules: RateRule[];
  // No longer read anywhere (the old flat/variable mode toggle was removed 6
  // Sep 2026 - see PricingRulesPanel's own header comment) - kept accepted-
  // but-unused so neither existing caller (TodayOverview.tsx,
  // OperationalDashboard.tsx) needs touching just to drop it.
  pricingMode?: 'flat' | 'variable';
  defaultTariff?: number | null;
  onRulesUpdated: () => void;
  initialStartDate?: string;
  initialEndDate?: string;
  // Prefill for the "Change Prices" calendar flow (click a date range on a
  // room row -> open this same modal already scoped to that room + range).
  initialRoomIds?: number[];
  initialRatePerNight?: string;
}

/**
 * Thin Modal chrome around PricingRulesPanel - the actual "Prices & Booking
 * Rules" content (base price, add-rule form, rules table) lives there so
 * this Modal and the standalone `PricingPage.tsx` (Bookings > Pricing in the
 * sidebar) render the exact same component (9 Sep 2026, explicit request:
 * a change to the page must reach both automatically, not be hand-copied).
 *
 * flowbite-react's <Modal show={false}> unmounts its children entirely
 * (Modal.js: `if (!show) return null`), so PricingRulesPanel gets a fresh
 * mount - and therefore a fresh run of its own seed-from-selection effect -
 * every time this modal reopens, with no isOpen prop needed on the panel
 * itself.
 */
export const RateRuleModal: React.FC<RateRuleModalProps> = ({
  isOpen,
  onClose,
  propertyId,
  rooms = [],
  rateRules,
  defaultTariff,
  onRulesUpdated,
  initialStartDate,
  initialEndDate,
  initialRoomIds,
  initialRatePerNight,
}) => {
  // Mirrors PricingRulesPanel's own live "Target Unit" selection purely so
  // this header badge can track it - the panel doesn't lift that state up
  // itself (PricingPage.tsx has no header to keep in sync), so it reports
  // changes via onSelectionChange instead. Seeded from the same initial
  // props the panel itself seeds from, so the badge is correct even before
  // the panel's own mount effect has had a chance to fire.
  const [selectedRoomIdsForBadge, setSelectedRoomIdsForBadge] = useState<number[]>(
    initialRoomIds && initialRoomIds.length > 0 ? initialRoomIds : rooms.map((r) => r.id)
  );

  return (
    // No `dismissible` (9 Sep 2026, "as soon as i will click on any date in
    // the calendar, the modal will close, its a bug"). flowbite-react's
    // dismissible option (@floating-ui/react's useDismiss) closes on any
    // mousedown outside this Modal's own floating DOM subtree -
    // flowbite-datepicker (DateRangePicker inside PricingRulesPanel) always
    // appends its calendar popup straight to document.body regardless of
    // where its input lives (Datepicker.js's own default
    // `container: document.body`, never overridden here), so every click on
    // a day cell physically lands outside the modal's DOM and reads as an
    // outside click. The X button (below) is still a real, explicit close -
    // this only drops the click-anywhere-outside/Escape shortcut, which
    // isn't worth silently discarding an in-progress rate rule for.
    <Modal
      show={isOpen}
      onClose={onClose}
      size="3xl"
      className="z-50"
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <DollarSign className="w-4 h-4" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white m-0">
            Prices & Booking Rules
          </h3>
          {rooms.length > 0 && (
            <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-md border ${
              selectedRoomIdsForBadge.length === 0
                ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                : selectedRoomIdsForBadge.length === 1
                ? 'bg-blue-100 dark:bg-blue-900/60 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200'
                : 'bg-purple-50 dark:bg-purple-950/60 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300'
            }`}>
              {selectedRoomIdsForBadge.length === 0
                ? 'No units selected'
                : selectedRoomIdsForBadge.length === 1
                ? `🏠 ${rooms.find((r) => r.id === selectedRoomIdsForBadge[0])?.name || '1 Unit'}`
                : `${selectedRoomIdsForBadge.length} Units`}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 overflow-y-auto max-h-[82vh]">
        <PricingRulesPanel
          propertyId={propertyId}
          rooms={rooms}
          rateRules={rateRules}
          defaultTariff={defaultTariff}
          onRulesUpdated={onRulesUpdated}
          initialStartDate={initialStartDate}
          initialEndDate={initialEndDate}
          initialRoomIds={initialRoomIds}
          initialRatePerNight={initialRatePerNight}
          onSelectionChange={setSelectedRoomIdsForBadge}
        />
      </div>
    </Modal>
  );
};
export default RateRuleModal;
