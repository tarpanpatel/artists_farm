import React, { useEffect, useState } from 'react';
import { PageHeader } from './PageHeader';
import { PricingRulesPanel } from './PricingRulesPanel';
import { RateRule, fetchRateRulesDB } from '../services/api';

interface PricingPageProps {
  rooms?: Array<{ id: number; name: string; default_tariff?: number }>;
}

/**
 * Standalone "Pricing" page (Bookings > Pricing in the sidebar, 9 Sep 2026,
 * explicit request). Renders the exact same PricingRulesPanel content as
 * `RateRuleModal.tsx`'s "See all pricing rules and base prices" modal - same
 * base-price editing, same add-rule form, same rules table - just in normal
 * page chrome instead of an overlay, so a change to that shared panel
 * reaches this page and the modal automatically.
 *
 * Fetches its own rateRules/defaultTariff independently (fetchRateRulesDB()
 * has no dependency on any calendar grid being mounted - see
 * TodayOverview.tsx's/OperationalDashboard.tsx's identical loadRateRules()),
 * matching how those two already source the exact same data for the modal
 * and the calendar-selection drawer.
 */
export const PricingPage: React.FC<PricingPageProps> = ({ rooms }) => {
  const [rateRules, setRateRules] = useState<RateRule[]>([]);
  const [defaultTariff, setDefaultTariff] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadRateRules = async () => {
    const data = await fetchRateRulesDB();
    setRateRules(data.rules);
    if (data.default_tariff !== null) setDefaultTariff(data.default_tariff);
  };

  useEffect(() => {
    setIsLoading(true);
    loadRateRules().finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="pricing-page max-w-5xl mx-auto">
      <PageHeader
        title="Pricing"
        subtitle="Set your usual nightly price, then layer date-range rules on top for Diwali, weekends, or a slow month - Charge more, charge less, or block dates outright. Everything here reaches Airbnb, Booking.com and your own booking page automatically."
      />
      {isLoading ? (
        <div className="text-center py-10 text-xs text-gray-400">Loading pricing…</div>
      ) : (
        <PricingRulesPanel
          rooms={rooms}
          rateRules={rateRules}
          defaultTariff={defaultTariff}
          onRulesUpdated={loadRateRules}
        />
      )}
    </div>
  );
};
export default PricingPage;
