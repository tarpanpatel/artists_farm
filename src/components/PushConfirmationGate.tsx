import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Drawer } from 'flowbite-react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  IndianRupee,
  Loader2,
  Lock,
  ShieldCheck,
  X,
} from './icons/FlowbiteIcons';
import { Button } from './Button';
import { Input } from './Input';
import { apiFetch, API_ROOT_BASE } from '../services/api';
import { t } from '../i18n/en';

/**
 * Push Confirmation Gate (9 Sep 2026)
 *
 * Shown before anything that writes availability or rates to a connected OTA - going live on
 * a channel, or a manual "push everything" run.
 *
 * The reason it is three steps rather than one dialog: a push cannot be undone, and not
 * because we skipped building an undo. We cannot read back what we are about to replace -
 * Airbnb's per-date calendar prices are not readable at all, and a date the host blocked
 * directly on Airbnb's own calendar is invisible to Ground Code. So the only protection that
 * can exist is making the owner look at what is about to go out, first.
 *
 * Each step is a different kind of check, deliberately:
 *
 *   1. Rates    - VERIFIED by us. We know which nights carry no explicit price, so we show
 *                 those nights and the exact rate that would be sent. Not a promise to keep;
 *                 a fact to check.
 *   2. Openings - only the OWNER can check this, because we cannot see their manual OTA
 *                 blocks. So we list the exact dates about to be marked bookable and let them
 *                 scan it. Scanning a date list works; agreeing to a paragraph does not.
 *   3. Typed    - the property's own NAME, not a fixed word like "PUSH". A fixed word becomes
 *                 muscle memory across properties, and pushing to the wrong property is as
 *                 damaging as pushing the wrong values.
 *
 * The typed value is enforced server-side too (`requireChannexPushConfirmation()`), not just
 * here - a consent control on this exact flow shipped once whose value was never actually
 * sent, so the UI looked like a gate and enforced nothing.
 */

interface DateRange {
  from: string;
  to: string;
  nights: number;
}

interface PreflightRoom {
  room_id: number | null;
  room_name: string;
  pricing_mode: 'flat' | 'dynamic';
  default_tariff: number;
  total_nights: number;
  uncovered_nights: number;
  uncovered_ranges: DateRange[];
  opening_nights: number;
  opening_ranges: DateRange[];
}

interface Preflight {
  property_id: number;
  property_name: string;
  confirmation_phrase: string;
  date_from: string;
  date_to: string;
  rooms: PreflightRoom[];
  totals: { rooms: number; uncovered_nights: number; opening_nights: number };
}

interface PushConfirmationGateProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: number;
  /** Heading - e.g. "Go Live on Airbnb" or "Push Availability, Rates & Restrictions". */
  title: string;
  /** Label for the final button once the typed confirmation matches. */
  confirmLabel: string;
  /** Runs the real push. The gate stays open (busy) until this resolves. */
  onConfirm: (typedConfirmation: string) => Promise<void>;
  busy?: boolean;
  /**
   * The range the push will actually cover, when the caller narrows it (ChannelManager's date
   * pickers). Omit for Go Live, which always pushes today -> +500 days. The preview must
   * describe the same window as the push, or it over-reports what is at risk.
   */
  dateFrom?: string;
  dateTo?: string;
}

/** DD/MM/YYYY, per the project-wide date display rule. */
const formatDate = (iso: string): string => {
  const parts = iso.slice(0, 10).split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const formatRange = (r: DateRange): string =>
  r.nights === 1
    ? formatDate(r.from)
    : `${formatDate(r.from)} – ${formatDate(r.to)} (${r.nights} nights)`;

/**
 * Mirrors channexTypedConfirmationMatches() in php/channex/push_preflight.php. Kept forgiving
 * about case, spacing and the curly/straight apostrophe split for the same reason: typing is
 * meant to force a pause, not to test typing accuracy. A gate that rejects "artists farm" for
 * "Artists Farm" just teaches people to paste.
 */
const confirmationMatches = (typed: string, phrase: string): boolean => {
  const norm = (v: string) =>
    v
      .replace(/[‘’]/g, "'")
      .replace(/ /g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  return phrase.trim() !== '' && norm(typed) === norm(phrase);
};

const RangeList: React.FC<{ ranges: DateRange[]; limit?: number }> = ({ ranges, limit = 6 }) => {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? ranges : ranges.slice(0, limit);
  const hidden = ranges.length - shown.length;
  return (
    <>
      <ul className="mt-1.5 space-y-0.5">
        {shown.map((r) => (
          <li key={`${r.from}-${r.to}`} className="text-xs text-slate-700 dark:text-slate-300 font-mono">
            {formatRange(r)}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
        >
          {t('push_gate_show_all', 'Show all')} ({hidden} {t('push_gate_more', 'more')})
        </button>
      )}
    </>
  );
};

const PushConfirmationGate: React.FC<PushConfirmationGateProps> = ({
  isOpen,
  onClose,
  propertyId,
  title,
  confirmLabel,
  onConfirm,
  busy = false,
  dateFrom,
  dateTo,
}) => {
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [attempted, setAttempted] = useState(false);

  const loadPreflight = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch(
        `${API_ROOT_BASE}/php/api/router.php?action=channex_push_preflight`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ property_id: propertyId, date_from: dateFrom, date_to: dateTo }),
        },
      );
      const json = await res.json();
      if (json?.status === 'success' && json.data) {
        setPreflight(json.data as Preflight);
      } else {
        setLoadError(json?.message || t('push_gate_load_failed', 'Could not work out what this push would send.'));
      }
    } catch (err: any) {
      setLoadError(err?.message || t('push_gate_load_failed', 'Could not work out what this push would send.'));
    } finally {
      setLoading(false);
    }
  }, [propertyId, dateFrom, dateTo]);

  useEffect(() => {
    if (!isOpen) return;
    setTyped('');
    setAttempted(false);
    setPreflight(null);
    void loadPreflight();
  }, [isOpen, loadPreflight]);

  const phrase = preflight?.confirmation_phrase || '';
  const matches = useMemo(() => confirmationMatches(typed, phrase), [typed, phrase]);

  // The preflight has to have loaded before anything can be confirmed. Without it the owner
  // would be typing a name to approve a push whose contents they were never shown, which is
  // the checkbox problem this whole screen exists to replace.
  const ready = !!preflight && !loading && !loadError;

  const handleConfirm = async () => {
    if (!ready || !matches) {
      setAttempted(true);
      return;
    }
    await onConfirm(typed);
  };

  const roomsWithGaps = (preflight?.rooms || []).filter((r) => r.uncovered_nights > 0);
  const allFlat =
    !!preflight && preflight.rooms.length > 0 && preflight.rooms.every((r) => r.pricing_mode === 'flat');

  return (
    <Drawer
      open={isOpen}
      onClose={busy ? () => undefined : onClose}
      position="right"
      className="w-full sm:w-[560px] p-0 flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800"
    >
      <div className="flex items-start justify-between gap-3 p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {preflight
                ? `${preflight.property_name} · ${formatDate(preflight.date_from)} – ${formatDate(preflight.date_to)}`
                : t('push_gate_subtitle', 'Checking what this would send…')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label={t('close', 'Close')}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        {loading && (
          <div className="flex items-center gap-3 py-8 justify-center text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t('push_gate_loading', 'Working out exactly what would be sent…')}
          </div>
        )}

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
            <p className="text-xs font-semibold text-red-800 dark:text-red-300">{loadError}</p>
            <p className="mt-1 text-xs text-red-700 dark:text-red-400">
              {t(
                'push_gate_load_failed_hint',
                'The push is blocked until this loads - approving one without seeing its contents is exactly what this screen prevents.',
              )}
            </p>
            <Button variant="secondary" size="xs" className="mt-2" onClick={() => void loadPreflight()}>
              {t('retry', 'Retry')}
            </Button>
          </div>
        )}

        {preflight && !loading && !loadError && (
          <>
            {/* Step 1 - rates. Verified by us, so this states facts rather than asking for a promise. */}
            <section>
              <div className="flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('push_gate_step1', '1. Nights with no price set')}
                </h3>
              </div>

              {preflight.totals.uncovered_nights === 0 ? (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">
                    {t('push_gate_step1_ok', 'Every night in this range has a price set. Nothing falls back to a default rate.')}
                  </p>
                </div>
              ) : (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">
                    {allFlat
                      ? t(
                          'push_gate_step1_flat',
                          'This property is on a flat base rate, so every night below will be sent at the default rate. If you have set different prices for particular dates on Airbnb, those will be replaced.',
                        )
                      : t(
                          'push_gate_step1_gaps',
                          'These nights have no price in Ground Code, so they will be sent at the default rate. If a different price is set for them on Airbnb, it will be replaced.',
                        )}
                  </p>
                  <div className="mt-3 space-y-3">
                    {roomsWithGaps.map((room) => (
                      <div key={String(room.room_id ?? 'self')}>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {room.room_name}
                          {/* A unit with no base rate reports default_tariff = 0 since the
                              fabricated-price fallbacks were removed (11 Sep 2026). Rendering
                              that as "₹0" was wrong twice over: it reads as "about to sell
                              these nights for nothing", and it is not even what happens -
                              AriDrainWorker now omits the rate on exactly these dates rather
                              than sending a number. This whole gate exists to state a
                              checkable fact about the push, so it has to say the real one. */}
                          <span className="ml-1.5 font-normal text-slate-600 dark:text-slate-400">
                            {room.default_tariff > 0 ? (
                              <>
                                — {room.uncovered_nights} {t('push_gate_nights_at', 'nights at')} ₹
                                {room.default_tariff.toLocaleString('en-IN')}
                              </>
                            ) : (
                              <>
                                — {room.uncovered_nights}{' '}
                                {t(
                                  'push_gate_nights_unpriced',
                                  'nights have no price set, so no rate will be sent for them',
                                )}
                              </>
                            )}
                          </span>
                        </p>
                        <RangeList ranges={room.uncovered_ranges} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Step 2 - openings. We cannot verify this one, so the owner's eyes are the check. */}
            <section>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('push_gate_step2', '2. Dates that will be opened for booking')}
                </h3>
              </div>
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">
                  {t(
                    'push_gate_step2_body',
                    'Ground Code cannot see dates you blocked by hand on Airbnb, so please check this list yourself. Any date here will be made bookable — if you blocked one of them on Airbnb, it will reopen and can be sold.',
                  )}
                </p>
                <div className="mt-3 space-y-3">
                  {preflight.rooms
                    .filter((r) => r.opening_nights > 0)
                    .map((room) => (
                      <div key={String(room.room_id ?? 'self')}>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {room.room_name}
                          <span className="ml-1.5 font-normal text-slate-600 dark:text-slate-400">
                            — {room.opening_nights} {t('push_gate_nights', 'nights')}
                          </span>
                        </p>
                        <RangeList ranges={room.opening_ranges} />
                      </div>
                    ))}
                  {preflight.totals.opening_nights === 0 && (
                    <p className="text-xs text-slate-700 dark:text-slate-300">
                      {t('push_gate_step2_none', 'No dates would be opened — every night in this range is already booked or blocked in Ground Code.')}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Step 3 - the typed confirmation. */}
            <section>
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('push_gate_step3', '3. Confirm')}
                </h3>
              </div>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                {t(
                  'push_gate_step3_body',
                  'This replaces prices and availability on every connected channel for this property. It cannot be undone — Ground Code never saw the old values, so there is nothing to restore.',
                )}
              </p>
              <div className="mt-2.5">
                <Input
                  label={`${t('push_gate_type_name', 'Type the property name to confirm')}: ${phrase}`}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={phrase}
                  autoComplete="off"
                  spellCheck={false}
                  error={attempted && !matches ? t('push_gate_name_mismatch', 'This does not match the property name yet.') : undefined}
                  success={matches ? t('push_gate_name_ok', 'Matches — you can push now.') : undefined}
                />
              </div>
            </section>
          </>
        )}
      </div>

      <div className="border-t border-slate-200 p-4 sm:p-6 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" onClick={onClose} disabled={busy} className="flex-1 justify-center">
            {t('cancel', 'Cancel')}
          </Button>
          {/* Deliberately NOT natively `disabled` while merely unconfirmed (28 Aug 2026 rule):
              a disabled button swallows the click, so the owner gets no explanation for why
              nothing happened. Greyed out via opacity, still clickable, and the click surfaces
              the reason on the field itself. `busy` IS a real disable - that is an in-flight
              action, not an incomplete form. */}
          <Button
            variant="danger"
            size="md"
            onClick={handleConfirm}
            disabled={busy}
            className={`flex-1 justify-center ${!ready || !matches ? 'opacity-50' : ''}`}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('push_gate_pushing', 'Pushing…')}
              </>
            ) : (
              <>
                <ShieldCheck className="mr-2 h-4 w-4" />
                {confirmLabel}
              </>
            )}
          </Button>
        </div>
      </div>
    </Drawer>
  );
};

export default PushConfirmationGate;
