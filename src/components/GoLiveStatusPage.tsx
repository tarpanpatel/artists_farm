import React, { useEffect, useState } from 'react';
import { apiFetch, API_ROOT_BASE } from '../services/api';
import { PageHeader } from './PageHeader';
import { Badge } from './Badge';
import { Button } from './Button';
import { Input } from './Input';
import { Loader2, CheckCircle2, AlertCircle, AlertTriangle, RefreshCw, ShieldAlert, ShieldCheck } from './icons/FlowbiteIcons';
import { getOtaIcon, formatOtaLabel } from '../utils/otaIcons';
import { useToast } from './ToastContext';

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
 * Go Live status - GO_LIVE_SPEC.md Phases 1, 2a and 5b. 12 Sep 2026.
 *
 * Exists because every incident on 11 Sep shared one root cause: invisible state.
 * A property could sit mapped-but-never-activated for days while the UI showed
 * "Mapped & Active" (LAUNCH_CHECKLIST.md §1.7); a unit with no price silently
 * dropped out of the channel mapping with a success message. This page shows the
 * actual computed facts - reading live from Channex where it matters, never
 * trusting a stored status column alone - instead of an assertion nobody checked.
 *
 * What it can write: a unit's base price (channex_set_unit_price), which is
 * channel-agnostic and never binds anything to a live listing. Nothing here
 * activates a channel or pushes ARI.
 *
 * (This comment said "deliberately read-only: no button here syncs, maps, prices,
 * or activates anything" until Phase 2a added price entry. Updated rather than
 * left standing - a doc comment asserting a safety property the code no longer has
 * is the exact failure this whole page was built in response to.)
 */
export const GoLiveStatusPage: React.FC<GoLiveStatusPageProps> = ({ propertyId }) => {
  const [data, setData] = useState<GoLiveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  // Phase 2 (12 Sep 2026): inline price entry for a unit with none, so the "unit_no_price"
  // blocker can be cleared without leaving this page. Keyed by room_id ('null' for the
  // single-unit property itself, matching the string-keying convention used elsewhere on
  // this page). Deliberately does NOT bind anything to a live channel - see
  // channex_set_unit_price's own doc comment in router.php for exactly what it does and
  // does not do.
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [savingUnit, setSavingUnit] = useState<string | null>(null);

  // Stage 5b - readback verification. Not run on page load: these are real Channex API
  // calls, and a check that fires automatically on every visit becomes background noise
  // rather than something anyone reads. On demand, with the time of the last check shown,
  // so "when did we last actually confirm this" has an answer.
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    checked_at: string;
    window: [string, string];
    days: number;
    checked: { property: string; room: string; nights_checked: number; mismatched_nights: number }[];
    problems: any[];
    is_live: boolean;
  } | null>(null);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_verify_sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, days: 30 }),
      });
      const json = await res.json();
      if (json?.status === 'success') {
        setVerifyResult(json.data);
      } else {
        showToast(json?.message || 'Could not verify against Channex', { type: 'error' });
      }
    } catch (err: any) {
      showToast(err?.message || 'Could not verify against Channex', { type: 'error' });
    } finally {
      setVerifying(false);
    }
  };

  const handleSavePrice = async (roomId: number | null) => {
    const key = roomId === null ? 'null' : String(roomId);
    const draft = priceDrafts[key];
    const price = Number(draft);
    if (!draft || !Number.isFinite(price) || price <= 0) {
      showToast('Enter a real price greater than 0', { type: 'error' });
      return;
    }
    setSavingUnit(key);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_set_unit_price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, price }),
      });
      const json = await res.json();
      if (json?.status === 'success') {
        showToast('Price saved', { type: 'success' });
        setPriceDrafts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        fetchStatus(true);
      } else {
        showToast(json?.message || 'Could not save price', { type: 'error' });
      }
    } catch (err: any) {
      showToast(err?.message || 'Could not save price', { type: 'error' });
    } finally {
      setSavingUnit(null);
    }
  };

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
          {data.units.map((u) => {
            const key = String(u.room_id ?? 'null');
            const isSaving = savingUnit === key;
            return (
              <div
                key={key}
                className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center sm:justify-between"
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
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {!u.has_price ? (
                    // Inline entry closes the exact gap that produced the ₹3,500 incident:
                    // a listing mapped with no price, silently backfilled by fabricated code
                    // instead of a real number. Saving here writes default_tariff and
                    // enqueues the outbox item that lets content sync create a real,
                    // correctly-priced rate plan - it never touches a live channel binding.
                    <>
                      <Input
                        type="number"
                        min="1"
                        placeholder="e.g. 2000"
                        value={priceDrafts[key] ?? ''}
                        onChange={(e) => setPriceDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="w-28"
                        fullWidth={false}
                        disabled={isSaving}
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleSavePrice(u.room_id)}
                        disabled={isSaving || !priceDrafts[key]}
                        leftIcon={isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : undefined}
                      >
                        Save price
                      </Button>
                    </>
                  ) : (
                    <Badge variant="success">Priced</Badge>
                  )}
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
            );
          })}
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

      {/* Stage 5b - the only thing that proves a sync is real. A task id proves a request was
          accepted, not that the numbers agree; this reads back what Channex actually
          publishes and compares it night by night against what Ground Code believes. It is
          the check that would have caught the 3 Sep AVL=0 incident on the day it happened
          instead of days later. Read-only: GETs only, pushes nothing. */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
            Verify against Channex
          </h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleVerify}
            disabled={verifying}
            leftIcon={verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          >
            {verifying ? 'Checking...' : 'Verify now'}
          </Button>
        </div>

        {!verifyResult ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Reads back what Channex is actually publishing for the next 30 nights and compares
            it with this property's own calendar. Nothing is sent - this only reads.
          </p>
        ) : verifyResult.problems.length === 0 && verifyResult.checked.length > 0 ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="text-xs text-emerald-800 dark:text-emerald-300">
              <p className="font-semibold">
                Channex matches Ground Code across {verifyResult.checked.reduce((n, c) => n + c.nights_checked, 0)} nights
                on {verifyResult.checked.length} unit{verifyResult.checked.length === 1 ? '' : 's'}.
              </p>
              <p className="mt-0.5">
                Checked {new Date(verifyResult.checked_at).toLocaleString('en-IN')} · {verifyResult.window[0]} to {verifyResult.window[1]}
              </p>
            </div>
          </div>
        ) : verifyResult.checked.length === 0 && verifyResult.problems.length === 0 ? (
          // Nothing audited is NOT a pass. Saying "all good" here would be a green tick for a
          // property that is not live on anything - precisely the false reassurance this
          // whole page exists to stop.
          <div className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Nothing to verify - no channel is live for this property yet, so there is nothing
              published for Channex to disagree with. This is not a pass or a failure.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
            <p className="flex items-center gap-2 text-sm font-bold text-red-900 dark:text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {verifyResult.problems.length} disagreement{verifyResult.problems.length === 1 ? '' : 's'} between Channex and Ground Code
            </p>
            <ul className="mt-2 space-y-2">
              {verifyResult.problems.map((p, i) => (
                <li key={i} className="text-xs text-red-800 dark:text-red-300">
                  <span className="font-semibold">
                    {p.room ? `${p.room}: ` : ''}
                    {p.type === 'never_published' ? 'Closed on every night checked'
                      : p.type === 'availability_drift' ? `${p.mismatched_nights} of ${p.of_nights_checked} nights disagree`
                      : p.type === 'room_not_published' ? 'Not published to Channex at all'
                      : p.type === 'availability_unverifiable' ? 'Could not be verified'
                      : p.type}
                  </span>
                  {p.note && <span className="block text-red-700/90 dark:text-red-400/90">{p.note}</span>}
                  {p.error && <span className="block text-red-700/90 dark:text-red-400/90">{p.error}</span>}
                  {Array.isArray(p.first_few) && p.first_few.length > 0 && (
                    <span className="block text-red-700/90 dark:text-red-400/90">
                      e.g. {p.first_few.slice(0, 4).map((m: any) => `${m.date}: here ${m.ground_code}, Channex ${m.channex}`).join(' · ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-2xs text-red-700/80 dark:text-red-400/80">
              Checked {new Date(verifyResult.checked_at).toLocaleString('en-IN')} · {verifyResult.window[0]} to {verifyResult.window[1]}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
