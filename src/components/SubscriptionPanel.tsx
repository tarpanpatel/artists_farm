import React, { useEffect, useState } from 'react';
import { Drawer } from 'flowbite-react';
import { CreditCard, Loader2, X, ExternalLink, AlertTriangle, CheckCircle2 } from './icons/FlowbiteIcons';
import { apiFetch, API_ROOT_BASE } from '../services/api';
import { PageHeader } from './PageHeader';
import { Button } from './Button';
import { Badge } from './Badge';
import { Textarea } from './Textarea';
import { useToast } from './ToastContext';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { t } from '../i18n/en';

interface SubscriptionPanelProps {
  // Per-property nav usage (existing): the backend derives tenant_id from the
  // session's own resolved property. Tenant Dashboard usage (added 3 Sep
  // 2026): no single property is ever resolved there, so tenantId is passed
  // explicitly instead - see router.php's get_subscription_summary/
  // request_subscription_action for the two paths this maps to. At least one
  // of the two must be a real id for this component to fetch anything.
  propertyId?: number;
  tenantId?: number;
  onNavigate?: (tab: any, menuItemKey?: string) => void;
  // Tenant Dashboard embeds this inline as one more section on its own page
  // (own header, own max-w-6xl/padding already set by the caller) rather than
  // as a standalone routed screen - suppresses this component's own
  // PageHeader and outer page-padding/max-width wrapper when true.
  embedded?: boolean;
}

type SubscriptionStatus = 'trial' | 'active' | 'suspended' | 'cancelled';
type EffectiveStatus = SubscriptionStatus | 'past_due';

interface ClosureRequest {
  id: number;
  request_type: 'cancel' | 'delete';
  status: 'pending' | 'acknowledged' | 'completed' | 'declined';
  reason: string | null;
  created_at: string;
}

interface SubscriptionSummary {
  plan_name: string;
  subscription_status: SubscriptionStatus;
  subscription_expires_at: string | null;
  billing_cycle: 'monthly' | 'quarterly' | 'annual' | null;
  key_count: number;
  open_request: ClosureRequest | null;
}

interface SaasPricing {
  base_monthly_fee: number;
  per_key_monthly_fee: number;
  annual_discount_pct: number;
  gst_rate_pct: number;
  currency_symbol: string;
}

interface SaasSupport {
  support_phone: string;
  support_email: string;
}

const STATUS_BADGE: Record<EffectiveStatus, { variant: 'success' | 'danger' | 'warning' | 'info' | 'neutral'; label: string }> = {
  trial: { variant: 'info', label: 'Trial' },
  active: { variant: 'success', label: 'Active' },
  past_due: { variant: 'danger', label: 'Past Due' },
  suspended: { variant: 'danger', label: 'Suspended' },
  cancelled: { variant: 'neutral', label: 'Cancelled' },
};

const TRIAL_DAYS = 30;
const msPerDay = 1000 * 60 * 60 * 24;

/**
 * Tenant-facing subscription status + cancel/close-account request screen.
 * Gated ["Super Admin","Admin"] via the nav_menu_self_heal_v10 seed (see
 * php/kitchen/menu.php) - the same live role-based convention every other
 * owner-only screen in this app uses (Channel Manager, Connect Channels).
 * NOT gated on `tenant_users.can_manage_billing` - that column is dead
 * schema, never read or written anywhere else in this codebase (confirmed
 * 3 Sep 2026, code review before this file was written).
 *
 * Ground Code bills offline only (UPI/NEFT, Root Admin sets status/expiry by
 * hand - see PRODUCT_STRATEGY.md) - there is deliberately no "pay now"/
 * "update card" affordance anywhere on this screen, and Cancel/Close below
 * are both just REQUESTS a human acts on, never anything that mutates
 * subscription state or deletes data itself.
 */
export const SubscriptionPanel: React.FC<SubscriptionPanelProps> = ({ propertyId, tenantId, onNavigate, embedded = false }) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [pricing, setPricing] = useState<SaasPricing | null>(null);
  const [support, setSupport] = useState<SaasSupport | null>(null);

  const [activeRequestType, setActiveRequestType] = useState<'cancel' | 'delete' | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Tenant Dashboard has no property_slug in the request at all (see
  // router.php's comment on this action) - passes tenant_id explicitly
  // instead. Harmless to include when a real propertyId is also available;
  // the backend prefers the session's own resolved property in that case and
  // only falls back to this param when it has none.
  const tenantIdQuery = tenantId ? `&tenant_id=${tenantId}` : '';

  const fetchAll = async () => {
    try {
      const [summaryRes, configRes] = await Promise.all([
        apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=get_subscription_summary${tenantIdQuery}`, { credentials: 'include' }),
        apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=get_saas_platform_config`, { credentials: 'include' }),
      ]);
      const summaryJson = await summaryRes.json();
      if (summaryJson?.status === 'success') {
        setSummary(summaryJson.data);
      }
      const configJson = await configRes.json();
      if (configJson?.status === 'success' && configJson.data) {
        if (configJson.data.pricing) setPricing(configJson.data.pricing);
        if (configJson.data.support) setSupport(configJson.data.support);
      }
    } catch (err) {
      console.error('Failed to load subscription summary:', err);
      showToast('Failed to load your subscription details', { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (propertyId || tenantId) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, tenantId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin dark:text-blue-400" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Loading your subscription...</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className={`${embedded ? '' : 'px-4 sm:px-6 lg:px-8 py-6 max-w-3xl mx-auto'} text-center text-sm text-slate-500 dark:text-slate-400`}>
        Couldn't load your subscription details. Please try again shortly.
      </div>
    );
  }

  // Same math as App.tsx's own trial-expiry toast (Math.ceil, day-boundary at
  // 00:00) - do not reimplement this differently, or the two would disagree.
  const daysRemaining = summary.subscription_expires_at
    ? Math.ceil((new Date(`${summary.subscription_expires_at}T00:00:00`).getTime() - Date.now()) / msPerDay)
    : null;

  // The DB enum has no distinct "expired" state - a trial or active
  // subscription whose expiry date has quietly passed (Root Admin hasn't
  // updated it yet) reads as "Past Due" here rather than silently as
  // Trial/Active still being fine.
  const effectiveStatus: EffectiveStatus =
    daysRemaining !== null && daysRemaining < 0 && (summary.subscription_status === 'trial' || summary.subscription_status === 'active')
      ? 'past_due'
      : summary.subscription_status;
  const badge = STATUS_BADGE[effectiveStatus];

  const extraKeys = Math.max(0, summary.key_count - 1);
  const monthlyEstimate = pricing ? pricing.base_monthly_fee + extraKeys * pricing.per_key_monthly_fee : null;
  const monthlyGst = pricing && monthlyEstimate !== null ? monthlyEstimate * (pricing.gst_rate_pct / 100) : null;
  const monthlyTotal = monthlyEstimate !== null && monthlyGst !== null ? monthlyEstimate + monthlyGst : null;
  // Matches OnboardingManager.tsx's own annual formula exactly (base+per-key,
  // times 12, less the configured annual discount, plus GST) - this screen
  // and Root Admin's own pricing calculator must never show two different
  // numbers for the same tenant.
  const annualEstimate =
    pricing && monthlyEstimate !== null ? monthlyEstimate * 12 * (1 - pricing.annual_discount_pct / 100) : null;
  const annualGst = pricing && annualEstimate !== null ? annualEstimate * (pricing.gst_rate_pct / 100) : null;
  const annualTotal = annualEstimate !== null && annualGst !== null ? annualEstimate + annualGst : null;

  const trialDayNumber = daysRemaining !== null ? Math.min(TRIAL_DAYS, Math.max(0, TRIAL_DAYS - daysRemaining)) : null;

  const openRequest = summary.open_request;

  const handleSubmitRequest = async () => {
    if (!activeRequestType) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=request_subscription_action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ request_type: activeRequestType, reason, ...(tenantId ? { tenant_id: tenantId } : {}) }),
      });
      const json = await res.json();
      if (json?.status === 'success') {
        showToast(
          "Request received. Your data is safe and nothing changes yet - your account manager will contact you within 2 business days.",
          { type: 'success', duration: 10000 }
        );
        setActiveRequestType(null);
        setReason('');
        fetchAll();
      } else {
        showToast(json?.message || 'Failed to submit your request', { type: 'error' });
      }
    } catch (err) {
      console.error('Failed to submit subscription request:', err);
      showToast('Failed to submit your request', { type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={embedded ? 'space-y-6' : 'px-4 sm:px-6 lg:px-8 py-6 space-y-6 max-w-3xl mx-auto'}>
      {!embedded && (
        <PageHeader title={t('subscription_heading', 'Subscription')} subtitle={t('subscription_subheading', 'Your plan, renewal date, and account options.')} />
      )}

      {/* Status card */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-bold text-slate-900 dark:text-white">{summary.plan_name}</span>
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
            {summary.key_count > 1 && (
              <p className="text-2xs text-slate-500 dark:text-slate-400 mt-1">{summary.key_count} room keys</p>
            )}
          </div>
        </div>

        <div className="text-xs text-slate-600 dark:text-slate-300">
          {summary.subscription_expires_at ? (
            <>
              {summary.subscription_status === 'trial' ? 'Trial ends' : 'Renews on'}{' '}
              <span className="font-semibold text-slate-900 dark:text-white">{formatDateDDMMYYYY(summary.subscription_expires_at)}</span>
              {daysRemaining !== null && (
                <span className="text-slate-400 dark:text-slate-500">
                  {' '}
                  ({daysRemaining >= 0 ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left` : `${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? '' : 's'} overdue`})
                </span>
              )}
            </>
          ) : (
            <span className="text-slate-400 dark:text-slate-500">Renewal date not yet set - contact your account manager.</span>
          )}
        </div>

        {summary.subscription_status === 'trial' && trialDayNumber !== null && (
          <div className="space-y-1">
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-blue-600 dark:bg-blue-500 transition-all"
                style={{ width: `${(trialDayNumber / TRIAL_DAYS) * 100}%` }}
              />
            </div>
            <p className="text-2xs text-slate-400 dark:text-slate-500">Day {trialDayNumber} of {TRIAL_DAYS}</p>
          </div>
        )}

        {effectiveStatus === 'past_due' && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <p className="text-2xs text-red-700 dark:text-red-300">
              Your access may be limited - contact your account manager to renew
              {support ? ` (${support.support_phone} · ${support.support_email})` : ''}.
            </p>
          </div>
        )}
      </div>

      {/* Amount due at renewal - ESTIMATE only, offline billing, never "charge"/"pay now" */}
      {pricing && monthlyTotal !== null && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-5 space-y-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Amount due at renewal</h3>
          <p className="text-2xs text-slate-500 dark:text-slate-400">
            Estimate only - billed via UPI/NEFT by your account manager, not an automatic charge.
          </p>
          <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1 pt-1">
            <div className="flex justify-between"><span>Base fee</span><span>{pricing.currency_symbol}{pricing.base_monthly_fee}</span></div>
            {extraKeys > 0 && (
              <div className="flex justify-between">
                <span>{extraKeys} extra key{extraKeys === 1 ? '' : 's'} &times; {pricing.currency_symbol}{pricing.per_key_monthly_fee}</span>
                <span>{pricing.currency_symbol}{extraKeys * pricing.per_key_monthly_fee}</span>
              </div>
            )}
            <div className="flex justify-between"><span>GST ({pricing.gst_rate_pct}%)</span><span>{pricing.currency_symbol}{monthlyGst?.toFixed(0)}</span></div>
            <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-1 border-t border-slate-100 dark:border-slate-800">
              <span>Monthly</span><span>{pricing.currency_symbol}{monthlyTotal.toFixed(0)}</span>
            </div>
            {summary.billing_cycle === 'annual' && annualTotal !== null && (
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Annual equivalent</span><span>{pricing.currency_symbol}{annualTotal.toFixed(0)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancel / Close account */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Cancel or close your account</h3>
        {openRequest ? (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-2xs text-amber-700 dark:text-amber-300">
              Request pending ({openRequest.request_type === 'delete' ? 'Close account' : 'Cancel subscription'}, submitted {formatDateDDMMYYYY(openRequest.created_at)}) - our team will contact you.
            </p>
          </div>
        ) : (
          <>
            <p className="text-2xs text-slate-500 dark:text-slate-400">
              Both of these are requests only - nothing changes immediately, and your data stays exactly as it is until your account manager follows up.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setActiveRequestType('cancel')}>Cancel subscription</Button>
              <Button variant="danger" size="sm" onClick={() => setActiveRequestType('delete')}>Close account</Button>
            </div>
          </>
        )}
      </div>

      <Drawer open={activeRequestType !== null} onClose={() => setActiveRequestType(null)} position="right" className="fixed overflow-y-auto transition-transform right-0 top-0 h-screen transform-none z-50 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-900">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {activeRequestType === 'delete' ? 'Request account closure' : 'Request cancellation'}
          </h2>
          <button type="button" onClick={() => setActiveRequestType(null)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {activeRequestType === 'delete'
              ? "This asks us to remove your account and data. It's just a request - nothing is deleted automatically, and your account manager will follow up before anything happens."
              : "This asks us not to renew your subscription. Your access and data stay exactly as they are until your current period ends."}
          </p>
          <button
            type="button"
            onClick={() => onNavigate?.('data_export_center' as any)}
            className="w-full flex items-center justify-between gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 text-left transition-colors"
          >
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Export your data first (bookings, guests, financials)</span>
            <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
          <Textarea
            label="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Let us know why - it helps us improve."
          />
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <Button variant={activeRequestType === 'delete' ? 'danger' : 'primary'} block disabled={submitting} onClick={handleSubmitRequest}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (activeRequestType === 'delete' ? 'Submit closure request' : 'Submit cancellation request')}
          </Button>
        </div>
      </Drawer>
    </div>
  );
};
