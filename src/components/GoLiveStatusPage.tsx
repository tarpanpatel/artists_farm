import React, { useEffect, useState } from 'react';
import { apiFetch, API_ROOT_BASE } from '../services/api';
import { PageHeader } from './PageHeader';
import { Badge } from './Badge';
import { Button } from './Button';
import { Loader2, CheckCircle2, AlertCircle, AlertTriangle, RefreshCw, ShieldAlert } from './icons/FlowbiteIcons';
import { getOtaIcon, formatOtaLabel } from '../utils/otaIcons';

interface GoLiveStatusPageProps {
  propertyId: number;
}

interface GoLiveUnit {
  room_id: number | null;
  name: string;
  default_tariff: number;
  has_price: boolean;
  total_nights: number;
  unpriced_nights: number;
  unpriced_ranges: { from: string; to: string; nights: number }[];
  sync_status: string;
  has_rate_plan: boolean;
}

interface GoLiveChannel {
  channel_code: string;
  local_status: string;
  channex_status: 'active' | 'inactive' | 'unknown';
  state_matches: boolean | null;
  mapped_listings: number;
  total_units: number;
  last_error: string | null;
}

interface GoLiveBlocker {
  code: string;
  unit: string;
  message: string;
}

interface GoLiveStatus {
  stage: number;
  is_live: boolean;
  units: GoLiveUnit[];
  channels: GoLiveChannel[];
  blockers: GoLiveBlocker[];
}

const STAGE_LABELS: Record<number, string> = {
  2: 'Pricing needed',
  3: 'Connect & map channels',
  4: 'Ready to go live',
  5: 'Live',
};

/**
 * Go Live — Phase 1 (read-only) of GO_LIVE_SPEC.md, 12 Sep 2026.
 *
 * Exists because every incident on 11 Sep shared one root cause: invisible state.
 * A property could sit mapped-but-never-activated for days while the UI showed
 * "Mapped & Active" (PRE_LAUNCH_CHECK.md §1.7); a unit with no price silently
 * dropped out of the channel mapping with a success message. This page shows the
 * actual computed facts - reading live from Channex where it matters, never
 * trusting a stored status column alone - instead of an assertion nobody checked.
 *
 * Deliberately read-only: no button here syncs, maps, prices, or activates
 * anything. That's Phase 2/3 (see the spec). This phase's entire job is to make
 * the true state visible without being able to cause a new incident.
 */
export const GoLiveStatusPage: React.FC<GoLiveStatusPageProps> = ({ propertyId }) => {
  const [data, setData] = useState<GoLiveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_go_live_status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId }),
      });
      const json = await res.json();
      if (json?.status === 'success') {
        setData(json.data);
      } else {
        setError(json?.message || 'Could not load Go Live status');
      }
    } catch (err: any) {
      setError(err?.message || 'Could not load Go Live status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (propertyId) fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="loading-screen-spinner-spin h-8 w-8 rounded-full border-[3px] border-blue-100 border-t-blue-500 dark:border-slate-800 dark:border-t-blue-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
        <div>
          <p className="text-sm font-semibold text-red-900 dark:text-red-300">{error}</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => fetchStatus()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Go Live Status"
        subtitle="What Ground Code and Channex each actually say about this property - not a summary, the real numbers."
      >
        <div className="flex items-center gap-2">
          <Badge variant={data.is_live ? 'success' : 'warning'}>
            {data.is_live ? 'Live' : STAGE_LABELS[data.stage] || 'Not live yet'}
          </Badge>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchStatus(true)}
            disabled={refreshing}
            leftIcon={refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          >
            Refresh
          </Button>
        </div>
      </PageHeader>

      {/* Blockers - the headline. A unit with no price used to vanish from the
          mapping with a success toast; here it's the first thing shown. */}
      {data.blockers.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {data.blockers.length} thing{data.blockers.length === 1 ? '' : 's'} blocking Go Live
          </p>
          <ul className="mt-2 space-y-1 pl-6 text-xs text-amber-800 dark:text-amber-300" style={{ listStyleType: 'disc' }}>
            {data.blockers.map((b, i) => (
              <li key={i}>{b.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Units */}
      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
          Units ({data.units.length})
        </h3>
        <div className="space-y-2">
          {data.units.map((u) => (
            <div
              key={String(u.room_id ?? 'self')}
              className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{u.name}</p>
                <p className="mt-0.5 text-2xs text-gray-500 dark:text-gray-400">
                  {u.has_price ? (
                    <>
                      Base price ₹{u.default_tariff.toLocaleString('en-IN')}/night
                      {u.unpriced_nights > 0 && (
                        <> · {u.unpriced_nights} of the next {u.total_nights} nights would use this flat rate (no explicit rule)</>
                      )}
                    </>
                  ) : (
                    'No base price set'
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={u.has_price ? 'success' : 'warning'}>
                  {u.has_price ? 'Priced' : 'Needs price'}
                </Badge>
                {u.sync_status === 'pending_price' && (
                  <Badge variant="warning" title="Mapped on Channex but no rate plan yet - waiting on a real price">
                    Pending price
                  </Badge>
                )}
                {u.sync_status !== 'not_synced' && u.sync_status !== 'pending_price' && u.has_rate_plan && (
                  <Badge variant="neutral">Mapped</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Channels */}
      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
          Channels ({data.channels.length})
        </h3>
        {data.channels.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">No channels connected yet.</p>
        ) : (
          <div className="space-y-2">
            {data.channels.map((c) => {
              const Icon = getOtaIcon(c.channel_code);
              return (
                <div
                  key={c.channel_code}
                  className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {Icon && <Icon className="h-5 w-5 shrink-0" />}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {formatOtaLabel(c.channel_code)}
                      </p>
                      <p className="mt-0.5 text-2xs text-gray-500 dark:text-gray-400">
                        {c.mapped_listings} of {c.total_units} unit{c.total_units === 1 ? '' : 's'} mapped
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                    <Badge variant={c.channex_status === 'active' ? 'success' : c.channex_status === 'unknown' ? 'neutral' : 'warning'}>
                      {c.channex_status === 'active' ? 'Live on Channex' : c.channex_status === 'unknown' ? 'Could not verify' : 'Not live'}
                    </Badge>
                    {/* This is the one that would have caught the Patel Colony badge bug -
                        our own stored status disagreeing with what Channex actually holds. */}
                    {c.state_matches === false && (
                      <span className="flex items-center gap-1 text-2xs font-semibold text-red-600 dark:text-red-400">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        Ground Code says "{c.local_status}" - Channex disagrees
                      </span>
                    )}
                    {c.last_error && (
                      <span className="text-2xs text-red-600 dark:text-red-400">{c.last_error}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {data.is_live && data.channels.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-xs text-emerald-800 dark:text-emerald-300">
            At least one channel is genuinely live. Readback verification against Channex's
            actual availability/rates (Phase 2) isn't built yet - this page confirms the
            channel is active, not that every date matches.
          </p>
        </div>
      )}
    </div>
  );
};
