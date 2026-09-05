import React, { useCallback, useEffect, useState } from 'react';
import { Drawer } from 'flowbite-react';
import { Check, AlertTriangle, X } from './icons/FlowbiteIcons';
import { apiFetch, API_ROOT_BASE } from '../services/api';
import { useToast } from './ToastContext';
import { Button } from './Button';
import { Badge } from './Badge';
import { t } from '../i18n/en';

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
 * Price is never offered at all: an OTA's displayed price carries that channel's
 * commission and taxes, so it is not the owner's base rate.
 */

interface ProposalField {
  label: string;
  current: string | number | null;
  airbnb: string | number;
  differs: boolean;
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
}

/** Key identifying one selectable cell: `${room_id}:${fieldName}`. */
const cellKey = (roomId: number, field: string) => `${roomId}:${field}`;

export const AirbnbConfigImportDrawer: React.FC<AirbnbConfigImportDrawerProps> = ({
  isOpen,
  onClose,
  propertyId,
  onImported,
  onLogAudit,
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [data, setData] = useState<ProposalPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [takeAddress, setTakeAddress] = useState(false);
  const [takeMaps, setTakeMaps] = useState(false);

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
    } catch (err) {
      setLoadError(t('airbnb_import_load_failed', 'Could not read your Airbnb listings.'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

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

  const selectedCount = selected.size + (takeAddress ? 1 : 0) + (takeMaps ? 1 : 0);

  const handleApply = async () => {
    if (selectedCount === 0) {
      showToast(t('airbnb_import_nothing_selected', 'Tick at least one value to import.'), { type: 'error' });
      return;
    }
    setApplying(true);
    try {
      // Build one entry per room carrying only the ticked fields.
      const rooms: Array<Record<string, any>> = [];
      (data?.proposals || []).forEach((p) => {
        const entry: Record<string, any> = { room_id: p.room_id };
        let any = false;
        Object.entries(p.fields || {}).forEach(([name, f]) => {
          if (selected.has(cellKey(p.room_id, name))) {
            entry[name] = f.airbnb;
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
      onImported?.();
      onClose();
    } catch (err) {
      showToast(t('airbnb_import_failed', 'Import failed.'), { type: 'error' });
    } finally {
      setApplying(false);
    }
  };

  const hasAnything = !!data && (data.proposals?.length > 0 || !!data.property);

  return (
    <Drawer open={isOpen} onClose={onClose} position="right" className="w-full max-w-xl p-0">
      <div className="flex h-full flex-col bg-white dark:bg-gray-900">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              {t('airbnb_import_heading', 'Import Details from Airbnb')}
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t(
                'airbnb_import_sub',
                'Your listings already hold this. Tick what you want to bring across - nothing is saved until you apply. Prices are never imported.'
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
              <p className="text-sm text-red-800 dark:text-red-300">{loadError}</p>
            </div>
          )}

          {!loading && !loadError && !hasAnything && (
            <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              {t('airbnb_import_empty', 'Nothing to import - your rooms already match your Airbnb listings.')}
            </p>
          )}

          {!loading && !loadError && data?.proposals?.map((p) => {
            const entries = Object.entries(p.fields || {});
            if (!entries.length) return null;
            return (
              <div key={p.room_id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <div className="mb-3">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{p.room}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{p.listing_title}</p>
                </div>
                <div className="space-y-2">
                  {entries.map(([name, f]) => {
                    const key = cellKey(p.room_id, name);
                    const on = selected.has(key);
                    return (
                      <label
                        key={key}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-gray-100 px-3 py-2 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60"
                      >
                        <span className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(key)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{f.label}</span>
                        </span>
                        <span className="flex items-center gap-2 text-xs">
                          <span className="text-gray-400 line-through dark:text-gray-500">
                            {f.current ?? t('airbnb_import_unset', 'not set')}
                          </span>
                          <span className="font-semibold text-gray-900 dark:text-white">{f.airbnb}</span>
                          {f.differs && <Badge variant="warning">{t('airbnb_import_differs', 'differs')}</Badge>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {!loading && !loadError && data?.property && (
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

          {/* Capacity is shown but never offered for import - the owner's own
              numbers are authoritative here, and Airbnb's disagreed with them on
              half this account's rooms. Surfacing the mismatch is still useful:
              a listing that claims MORE guests than the room holds is live on
              Airbnb right now and only the owner can correct it there. */}
          {!loading && !loadError && !!data?.capacity_context?.some((c) => c.differs) && (
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
                {data.capacity_context!.filter((c) => c.differs).map((c) => (
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
  );
};
