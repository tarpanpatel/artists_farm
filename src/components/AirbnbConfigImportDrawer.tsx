import React, { useCallback, useEffect, useState } from 'react';
import { Drawer } from 'flowbite-react';
import { Check, AlertTriangle, X, Plug, ChevronDown } from './icons/FlowbiteIcons';
import { apiFetch, API_ROOT_BASE } from '../services/api';
import { useToast } from './ToastContext';
import { Button } from './Button';
import { Badge } from './Badge';
import { t } from '../i18n/en';
import { ChannelConnectWizard } from './ChannelConnectWizard';
import type { ChannexChannelConnection, ChannexLocalRoom } from './ChannelConnectionsPage';
import { normalizeAmenityList } from '../utils/amenityCatalog';

/** The amenities cell carries a JSON array string; anything else is left alone. */
const parseJsonArray = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/**
 * Confirm-before-write import of a property's own Airbnb listing configuration.
 *
 * Deliberately a review screen rather than a one-click import (5 Sep 2026).
 * Measured against a real account, Airbnb's capacity disagreed with the owner on
 * 5 of 10 rooms - in both directions - so an import that just wrote OTA values in
 * would have published four rooms as sleeping more guests than they hold. The
 * owner is the only reliable source, so every value is shown next to what is
 * already stored and nothing is written until they tick it.
 *
 * The BASE NIGHTLY PRICE is offered as of 6 Sep 2026, reversing the original
 * "price is never offered" rule. Ground Code is now meant to be the source of
 * truth - imported once at setup, then edited here and pushed out to every OTA
 * through Channex - and under that model not seeding the base price just means
 * the first push overwrites Airbnb with a placeholder. It stays a tick-box like
 * everything else, because an Airbnb price often carries the host's markup for
 * that channel's commission and may not be what they want quoted directly.
 *
 * Applying a price does NOT push it, and does not offer to. `default_tariff` is
 * only the fallback for dates with no room_rate_rules row, so on a property whose
 * rate calendar covers the pushed range the imported value never leaves the
 * building. Pushing lives in Channel Manager, deliberately.
 */

interface ProposalField {
  label: string;
  current: string | number | null;
  airbnb: string | number;
  differs: boolean;
  /** Prose (a house manual, arrival directions) rather than a short value - the
   *  server sets this so the row stacks and clamps instead of squeezing a
   *  paragraph onto one line next to a number. */
  multiline?: boolean;
  /** What actually gets written, when that differs from what is displayed.
   *  Structured fields (amenities, bed configuration) show a readable summary
   *  in `airbnb` and carry the JSON to store here - raw JSON in a review screen
   *  is unreadable, and nobody should tick a box they cannot read. */
  value?: string;
}

interface RoomProposal {
  room_id: number;
  room: string;
  listing_title: string;
  fields: Record<string, ProposalField>;
}

interface CapacityContext {
  room: string;
  stored: number | null;
  airbnb: number | null;
  differs: boolean;
}

interface ProposalPayload {
  proposals: RoomProposal[];
  property: { address?: string | null; google_maps_link?: string | null } | null;
  capacity_context?: CapacityContext[];
  unmatched?: string[];
  error?: string;
}

interface AirbnbConfigImportDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: number;
  /** Fired after a successful apply so the caller can refresh its own view. */
  onImported?: () => void;
  onLogAudit?: (actionText: string, extra?: { status?: string; module?: string }) => void;
  /** Scopes this drawer to ONE room's own listing (7 Sep 2026, explicit
   *  request: "in front of individual listing give option to individual
   *  import from airbnb") - set from ChannelConnectionsPage's per-room
   *  "Import from Airbnb" button. The dry-run still fetches every mapped
   *  room in one batched request (cheap, see getMultipleListingDetails),
   *  it's only the DISPLAY that's filtered down to this room - property-
   *  level fields (address/maps) are hidden too since those aren't
   *  per-room. Omitted entirely, this behaves exactly as before: every
   *  mapped room shown, property-level fields included. */
  focusRoomId?: number;
}

/** Key identifying one selectable cell: `${room_id}:${fieldName}`. */
const cellKey = (roomId: number, field: string) => `${roomId}:${field}`;

export const AirbnbConfigImportDrawer: React.FC<AirbnbConfigImportDrawerProps> = ({
  isOpen,
  onClose,
  propertyId,
  onImported,
  onLogAudit,
  focusRoomId,
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [data, setData] = useState<ProposalPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Accordion state (7 Sep 2026, explicit request: "make this section
  // accordion") - a multi-key property's proposal list is one card per room,
  // which read as a very long, all-expanded scroll. Multiple rooms can be
  // open at once (not strict single-open) so a bulk review can still compare
  // a few rooms side by side while ticking boxes across them.
  const [expandedRoomIds, setExpandedRoomIds] = useState<Set<number>>(new Set());
  const toggleRoomExpanded = (roomId: number) => {
    setExpandedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };
  const [takeAddress, setTakeAddress] = useState(false);
  const [takeMaps, setTakeMaps] = useState(false);

  // "Connect Airbnb" from right here (6 Sep 2026) - the load() call below fails
  // with "No connected Airbnb channel for this property" for any property that
  // hasn't gone through Connect Channels yet, which used to be a dead end: the
  // owner had to cancel out, find Connect Channels in the sidebar themselves,
  // connect there, then come back and reopen this drawer. Reuses the same
  // ChannelConnectWizard Connect Channels itself renders rather than building a
  // second connect flow - only the entry point (this error state) is new.
  const [connections, setConnections] = useState<ChannexChannelConnection[]>([]);
  const [localRooms, setLocalRooms] = useState<ChannexLocalRoom[]>([]);
  const [connectWizardOpen, setConnectWizardOpen] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);

  const handleConnectAirbnb = async () => {
    setConnectLoading(true);
    try {
      const res = await apiFetch(
        `${API_ROOT_BASE}/php/api/router.php?action=channex_channel_connection_status`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ property_id: propertyId }),
        }
      );
      const json = await res.json();
      if (json?.status === 'success') {
        setConnections(json.data?.connections || []);
        setLocalRooms(json.data?.local_rooms || []);
      }
      setConnectWizardOpen(true);
    } catch (err) {
      showToast(t('airbnb_import_load_failed', 'Could not read your Airbnb listings.'), { type: 'error' });
    } finally {
      setConnectLoading(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch(
        `${API_ROOT_BASE}/php/api/router.php?action=channex_import_airbnb_room_config`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // No mode -> dry run. This request never writes anything.
          body: JSON.stringify({ property_id: propertyId }),
        }
      );
      const json = await res.json();
      if (json?.status !== 'success') {
        setLoadError(json?.message || t('airbnb_import_load_failed', 'Could not read your Airbnb listings.'));
        setData(null);
        return;
      }
      const payload: ProposalPayload = json.data || { proposals: [], property: null };
      setData(payload);

      // Pre-tick only the safe cells: a field the room has no value for yet.
      // Anything that would OVERWRITE an existing value starts unticked, so a
      // disagreement is an explicit decision rather than a default.
      const preset = new Set<string>();
      (payload.proposals || []).forEach((p) => {
        Object.entries(p.fields || {}).forEach(([name, f]) => {
          if (!f.differs && (f.current === null || f.current === '')) preset.add(cellKey(p.room_id, name));
        });
      });
      setSelected(preset);
      setTakeAddress(false);
      setTakeMaps(false);

      // Default expanded: the focused room when scoped to one (so there's
      // nothing extra to click - it's already what the user asked to see),
      // otherwise just the first room, so the drawer isn't a wall of empty
      // headers on open but also isn't fully collapsed with nothing visible.
      const proposals = payload.proposals || [];
      const visible = focusRoomId != null ? proposals.filter((p) => p.room_id === focusRoomId) : proposals;
      setExpandedRoomIds(new Set(visible.length ? [visible[0].room_id] : []));
    } catch (err) {
      setLoadError(t('airbnb_import_load_failed', 'Could not read your Airbnb listings.'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [propertyId, focusRoomId]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Scoped down to one room's own proposal when focusRoomId is set (the
  // per-listing "Import from Airbnb" entry point) - property-level fields
  // (address/maps) and the cross-room capacity-disagreement panel are both
  // shared/cross-room concepts, so they're hidden in this scoped view rather
  // than shown against a room that isn't the one being reviewed. Computed
  // here (not just in the render below) because handleApply/selectedCount
  // must ALSO only ever count/submit what's actually visible - otherwise a
  // scoped "individual" import could silently count or apply another room's
  // pre-ticked "safe" cells that the user never saw in this view.
  const visibleProposals = focusRoomId != null
    ? (data?.proposals || []).filter((p) => p.room_id === focusRoomId)
    : (data?.proposals || []);
  const focusedRoomName = focusRoomId != null ? visibleProposals[0]?.room : null;
  const visibleCapacityContext = focusRoomId != null
    ? (data?.capacity_context || []).filter((c) => c.room === focusedRoomName)
    : (data?.capacity_context || []);

  const visibleSelectedCount = visibleProposals.reduce(
    (sum, p) => sum + Object.keys(p.fields || {}).filter((name) => selected.has(cellKey(p.room_id, name))).length,
    0
  );
  const selectedCount = visibleSelectedCount + (takeAddress ? 1 : 0) + (takeMaps ? 1 : 0);

  const handleApply = async () => {
    if (selectedCount === 0) {
      showToast(t('airbnb_import_nothing_selected', 'Tick at least one value to import.'), { type: 'error' });
      return;
    }
    setApplying(true);
    try {
      // Build one entry per room carrying only the ticked fields. Iterates
      // visibleProposals, not data.proposals - see the comment above.
      const rooms: Array<Record<string, any>> = [];
      visibleProposals.forEach((p) => {
        const entry: Record<string, any> = { room_id: p.room_id };
        let any = false;
        Object.entries(p.fields || {}).forEach(([name, f]) => {
          if (selected.has(cellKey(p.room_id, name))) {
            // `value` when the stored form differs from the displayed one.
            const raw = f.value ?? f.airbnb;
            // Amenities are the one field where Airbnb's vocabulary is not ours:
            // the API sends its own constants (WIRELESS_INTERNET,
            // DISHES_AND_SILVERWARE) and the Amenities picker matches on catalog
            // LABELS, so storing them verbatim left every imported amenity sitting
            // in "Custom Added Amenities" next to its own unticked checkbox - and
            // ticking that checkbox then gave the guest two chips for one thing.
            // Translated HERE, at the boundary, so the database only ever holds
            // canonical labels and no downstream reader needs the map
            // (7 Sep 2026). Unknown keys are kept, not dropped.
            entry[name] = name === 'amenities' ? JSON.stringify(normalizeAmenityList(parseJsonArray(raw))) : raw;
            any = true;
          }
        });
        if (any) rooms.push(entry);
      });

      const property: Record<string, any> = {};
      if (takeAddress && data?.property?.address) property.address = data.property.address;
      if (takeMaps && data?.property?.google_maps_link) property.google_maps_link = data.property.google_maps_link;

      const res = await apiFetch(
        `${API_ROOT_BASE}/php/api/router.php?action=channex_import_airbnb_room_config`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            property_id: propertyId,
            mode: 'apply',
            rooms,
            ...(Object.keys(property).length ? { property } : {}),
          }),
        }
      );
      const json = await res.json();
      if (json?.status !== 'success') {
        showToast(json?.message || t('airbnb_import_failed', 'Import failed.'), { type: 'error' });
        return;
      }
      const applied = json.data?.applied?.length || 0;
      showToast(
        t('airbnb_import_done', 'Imported from Airbnb.') + ` (${applied})`,
        { type: 'success' }
      );
      onLogAudit?.(`Imported ${applied} setting group(s) from Airbnb`, { module: 'Channel Manager' });

      // Deliberately NO push prompt here (6 Sep 2026 - the first version had one
      // and it was wrong). An imported base price does not need pushing:
      //   - it came FROM the channel, so sending it straight back is a no-op there;
      //   - `default_tariff` is only ever the FALLBACK for a date with no
      //     room_rate_rules row, so on any property whose rate calendar covers the
      //     pushed range it is never sent at all.
      // Prompting for a wide outward push right after an import invites the owner
      // to fire one for no gain. Pushing stays where it belongs: Channel Manager,
      // deliberately, once the rate calendar is actually ready.
      const priced: Array<{ room: string }> = json.data?.priced_rooms || [];
      if (priced.length > 0) {
        onLogAudit?.(
          `Imported base price from Airbnb for: ${priced.map((r) => r.room).join(', ')}`,
          { module: 'Channel Manager' }
        );
      }

      onImported?.();
      onClose();
    } catch (err) {
      showToast(t('airbnb_import_failed', 'Import failed.'), { type: 'error' });
    } finally {
      setApplying(false);
    }
  };

  const hasAnything = !!data && (visibleProposals.length > 0 || (focusRoomId == null && !!data.property));
  // Matches router.php's exact wording for this one case (both
  // channex_import_airbnb_room_config and channex_airbnb_listing_details use
  // the identical string) - everything else stays a plain, non-actionable error.
  const notConnected = loadError === 'No connected Airbnb channel for this property';

  return (
    <>
    <Drawer open={isOpen && !connectWizardOpen} onClose={onClose} position="right" className="w-full max-w-xl p-0">
      <div className="flex h-full flex-col bg-white dark:bg-gray-900">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              {t('airbnb_import_heading', 'Import Details from Airbnb')}
              {focusedRoomName ? ` - ${focusedRoomName}` : ''}
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t(
                'airbnb_import_sub',
                'Your listings already hold this. Tick what you want to bring across - nothing is saved until you apply. Check any price carefully: an Airbnb price often includes that channel’s commission.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close_label', 'Close')}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <div className="loading-screen-spinner-spin h-8 w-8 rounded-full border-[3px] border-blue-100 border-t-blue-500 dark:border-slate-800 dark:border-t-blue-400" />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('airbnb_import_loading', 'Reading your Airbnb listings...')}
              </p>
            </div>
          )}

          {!loading && loadError && (
            <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              <div className="flex-1">
                <p className="text-sm text-red-800 dark:text-red-300">{loadError}</p>
                {notConnected && (
                  <Button
                    size="sm"
                    onClick={handleConnectAirbnb}
                    disabled={connectLoading}
                    className="mt-3"
                    leftIcon={<Plug className="h-4 w-4" />}
                  >
                    {t('airbnb_import_connect_button', 'Connect Airbnb')}
                  </Button>
                )}
              </div>
            </div>
          )}

          {!loading && !loadError && !hasAnything && (
            <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              {t('airbnb_import_empty', 'Nothing to import - your rooms already match your Airbnb listings.')}
            </p>
          )}

          {!loading && !loadError && visibleProposals.map((p) => {
            const entries = Object.entries(p.fields || {});
            if (!entries.length) return null;
            const differCount = entries.filter(([, f]) => f.differs).length;
            const tickedCount = entries.filter(([name]) => selected.has(cellKey(p.room_id, name))).length;
            const isExpanded = expandedRoomIds.has(p.room_id);
            return (
              <div key={p.room_id} className="rounded-lg border border-gray-200 dark:border-gray-700">
                {/* Accordion header (7 Sep 2026, explicit request: "make this
                    section accordion") - a multi-key property's proposal list
                    read as a very long, all-expanded scroll. Several rooms can
                    stay open at once (not strict single-open), so a bulk
                    review can still compare a few rooms while ticking boxes
                    across them, rather than being forced one at a time. */}
                <button
                  type="button"
                  onClick={() => toggleRoomExpanded(p.room_id)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{p.room}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{p.listing_title}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {tickedCount > 0 && (
                      <Badge variant="info">{tickedCount} {t('airbnb_import_selected_short', 'selected')}</Badge>
                    )}
                    {differCount > 0 && (
                      <Badge variant="warning">{differCount} {t('airbnb_import_differs', 'differs')}</Badge>
                    )}
                    <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 dark:text-gray-400 ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {isExpanded && (
                <div className="space-y-2 border-t border-gray-100 p-4 pt-3 dark:border-gray-800">
                  {entries.map(([name, f]) => {
                    const key = cellKey(p.room_id, name);
                    const on = selected.has(key);
                    return (
                      <label
                        key={key}
                        className={
                          'cursor-pointer rounded-md border border-gray-100 px-3 py-2 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60 ' +
                          (f.multiline
                            ? 'flex flex-col gap-1.5'
                            : 'flex items-center justify-between gap-3')
                        }
                      >
                        <span className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(key)}
                            className="h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{f.label}</span>
                          {f.multiline && f.differs && (
                            <Badge variant="warning">{t('airbnb_import_differs', 'differs')}</Badge>
                          )}
                        </span>
                        {f.multiline ? (
                          // Prose: show only what Airbnb holds, clamped. The stored
                          // value is deliberately not shown alongside - two
                          // paragraphs side by side is unreadable, and "differs"
                          // above already says there is something to replace.
                          <span className="whitespace-pre-line wrap-break-word pl-6.5 text-xs leading-relaxed text-gray-600 line-clamp-4 dark:text-gray-400">
                            {String(f.airbnb)}
                          </span>
                        ) : (
                          <span className="flex items-center gap-2 text-xs">
                            <span className="text-gray-400 line-through dark:text-gray-500">
                              {f.current ?? t('airbnb_import_unset', 'not set')}
                            </span>
                            <span className="font-semibold text-gray-900 dark:text-white">{f.airbnb}</span>
                            {f.differs && <Badge variant="warning">{t('airbnb_import_differs', 'differs')}</Badge>}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
                )}
              </div>
            );
          })}

          {!loading && !loadError && focusRoomId == null && data?.property && (
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
              <p className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
                {t('airbnb_import_property_heading', 'Property details')}
              </p>
              <div className="space-y-2">
                {data.property.address && (
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-gray-100 px-3 py-2 dark:border-gray-800">
                    <input
                      type="checkbox"
                      checked={takeAddress}
                      onChange={() => setTakeAddress((v) => !v)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs">
                      <span className="block font-medium text-gray-700 dark:text-gray-300">
                        {t('address_label', 'Address')}
                      </span>
                      <span className="text-gray-900 dark:text-white">{data.property.address}</span>
                    </span>
                  </label>
                )}
                {data.property.google_maps_link && (
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-gray-100 px-3 py-2 dark:border-gray-800">
                    <input
                      type="checkbox"
                      checked={takeMaps}
                      onChange={() => setTakeMaps((v) => !v)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="break-all text-xs">
                      <span className="block font-medium text-gray-700 dark:text-gray-300">
                        {t('google_maps_link_label', 'Google Maps Link')}
                      </span>
                      <span className="text-gray-900 dark:text-white">{data.property.google_maps_link}</span>
                    </span>
                  </label>
                )}
              </div>
            </div>
          )}

          {/* This panel is the DISAGREEMENT case only: a room that already has a
              capacity, where Airbnb says something else. Those are never offered
              for import - the owner's own number is authoritative, and Airbnb's
              disagreed with it on half this account's rooms. Surfacing it is
              still useful, because a listing claiming MORE guests than the room
              holds is live right now and only the owner can fix it there.

              A room with NO capacity stored is a different case and DOES get a
              normal tick box in its proposal above (6 Sep 2026): 0 is not an
              answer being protected, it just means nobody has been asked, and
              leaving it at 0 degrades the booking page's "sleeps N", the guest
              picker and the extra-guest ceiling. It never reaches this panel,
              since `differs` requires a stored value. */}
          {!loading && !loadError && visibleCapacityContext.some((c) => c.differs) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4" />
                {t('airbnb_import_capacity_heading', 'Capacity differs on Airbnb')}
              </p>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                {t(
                  'airbnb_import_capacity_note',
                  'Not imported - your numbers are kept. Fix these on Airbnb itself: a listing claiming more guests than the room holds can still be booked.'
                )}
              </p>
              <ul className="mt-2 space-y-1">
                {visibleCapacityContext.filter((c) => c.differs).map((c) => (
                  <li key={c.room} className="text-xs text-amber-900 dark:text-amber-200">
                    <span className="font-medium">{c.room}</span>
                    {': '}
                    {t('airbnb_import_you_have', 'you have')} {c.stored}
                    {', '}
                    {t('airbnb_import_airbnb_says', 'Airbnb says')} {c.airbnb}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 p-4 dark:border-gray-700 sm:p-6">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {selectedCount > 0
              ? `${selectedCount} ${t('airbnb_import_selected', 'selected')}`
              : t('airbnb_import_none_selected', 'Nothing selected')}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={applying}>
              {t('cancel_label', 'Cancel')}
            </Button>
            {/* Greyed out rather than natively disabled for the "nothing ticked"
                case, so a click still reaches the handler and explains why nothing
                happened (CLAUDE.md's validation-gate rule). `disabled` IS correct
                while a real request is in flight. */}
            <Button
              onClick={handleApply}
              disabled={applying}
              className={selectedCount === 0 ? 'opacity-50' : ''}
              leftIcon={
                applying ? (
                  <span className="loading-screen-spinner-spin inline-block h-4 w-4 rounded-full border-[3px] border-blue-100 border-t-blue-500 dark:border-slate-800 dark:border-t-blue-400" />
                ) : (
                  <Check className="h-4 w-4" />
                )
              }
            >
              {t('airbnb_import_apply', 'Import Selected')}
            </Button>
          </div>
        </div>
      </div>
    </Drawer>

    <ChannelConnectWizard
      isOpen={connectWizardOpen}
      propertyId={propertyId}
      resumeChannelCode="AirBNB"
      existingConnections={connections}
      localRooms={localRooms}
      onClose={() => setConnectWizardOpen(false)}
      onConnected={() => {
        setConnectWizardOpen(false);
        load();
      }}
    />
    </>
  );
};
