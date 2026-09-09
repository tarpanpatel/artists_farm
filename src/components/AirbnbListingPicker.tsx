import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building, ExternalLink, Loader2, Lock, MapPin, RefreshCw } from './icons/FlowbiteIcons';
import { AirbnbIcon } from './icons/AirbnbIcon';
import { Button } from './Button';
import { apiFetch, API_ROOT_BASE } from '../services/api';

/**
 * Airbnb connection + listing picker, shared by every surface that imports listings
 * (`PropertyCreationWizard`'s Listings step and `SelfOnboardingWizard`'s step 3).
 *
 * One implementation on purpose. Two copies of a picker means the location guidance, the
 * selection defaults and the cross-location warning drift apart, and the whole point of the
 * guidance is that it appears at the moment the decision is made — every time.
 *
 * SELECTION DEFAULT (9 Sep 2026). This used to pre-tick every listing on the account, which
 * quietly contradicted the guidance sitting right above it: the banner said "select only one
 * location" while the UI had already selected all of them, so the default action was to flatten
 * an entire multi-location portfolio into one property. Now:
 *
 *   - all listings in one city  -> all selected (the common case, no friction added)
 *   - listings across cities    -> only the largest city group is selected
 *
 * so the default always obeys "one property = one location" and the owner opts INTO mixing
 * rather than opting out.
 *
 * `city` is a WEAK proxy and this never blocks or auto-splits on it — two buildings in one city
 * are still two locations for staffing purposes (this account's own Patel Colony and Winter are
 * both in Jaipur). The banner is the real safeguard; the city logic only catches the worst case.
 */

/** A listing already taken by another property of the same tenant. */
export interface ListingClaim {
  property_id: number;
  property_name: string;
  room_name: string | null;
}

export interface DiscoveredListing {
  id: string;
  title: string;
  max_occupancy?: number | null;
  listing_type?: string;
  city?: string;
}

interface AirbnbListingPickerProps {
  /** The property the channel attaches to. Null until the host has created its draft. */
  propertyId: number | null;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  /** Fired once when listings first arrive - lets the host default a property name from them. */
  onListingsLoaded?: (listings: DiscoveredListing[]) => void;
  /** Fired whenever the Airbnb connection state is determined. */
  onConnectionChange?: (connected: boolean) => void;
}

const UNKNOWN_CITY = 'Location not set';

const cityOf = (l: DiscoveredListing): string =>
  l.city && l.city.trim() ? l.city.trim() : UNKNOWN_CITY;

/** All listings in one city -> everything; otherwise the biggest city group only. */
export const defaultListingSelection = (listings: DiscoveredListing[]): string[] => {
  if (listings.length === 0) return [];
  const groups = new Map<string, DiscoveredListing[]>();
  listings.forEach((l) => {
    const c = cityOf(l);
    groups.set(c, [...(groups.get(c) || []), l]);
  });
  if (groups.size <= 1) return listings.map((l) => l.id);
  let biggest: DiscoveredListing[] = [];
  groups.forEach((g) => {
    if (g.length > biggest.length) biggest = g;
  });
  return biggest.map((l) => l.id);
};

export const AirbnbListingPicker: React.FC<AirbnbListingPickerProps> = ({
  propertyId,
  selectedIds,
  onSelectionChange,
  onListingsLoaded,
  onConnectionChange,
}) => {
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(false);
  const [loadingListings, setLoadingListings] = useState(false);
  const [listings, setListings] = useState<DiscoveredListing[]>([]);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [authOpened, setAuthOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [claimed, setClaimed] = useState<Record<string, ListingClaim>>({});

  const checkConnection = useCallback(async () => {
    if (!propertyId) return;
    setChecking(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_connection_status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId }),
      });
      const json = await res.json();
      const conn = (json?.data?.connections || []).find((c: any) => c.channel_code === 'AirBNB');
      const isConnected = !!conn && ['mapping', 'ready_to_activate', 'active'].includes(conn.status);
      setConnected(isConnected);
      onConnectionChange?.(isConnected);
      if (!isConnected) return;

      setLoadingListings(true);
      const mapRes = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_mapping_details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, channel_code: 'AirBNB' }),
      });
      const mapJson = await mapRes.json();
      if (mapJson?.status === 'success' && Array.isArray(mapJson.data?.rooms)) {
        const found: DiscoveredListing[] = mapJson.data.rooms;
        const claims: Record<string, ListingClaim> = mapJson.data?.claimed_listings || {};
        setListings(found);
        setClaimed(claims);
        onListingsLoaded?.(found);
        // Seed the selection ONCE. Re-seeding on every refocus would silently undo the owner's
        // own ticks each time they tab back from the Airbnb window.
        if (!seeded && found.length > 0) {
          // Claimed listings are excluded from the default - the server refuses them anyway
          // (409), so pre-ticking one would only produce a failed import.
          onSelectionChange(defaultListingSelection(found.filter((l) => !claims[l.id])));
          setSeeded(true);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Could not check your Airbnb connection.');
    } finally {
      setChecking(false);
      setLoadingListings(false);
    }
    // onSelectionChange/onListingsLoaded are host callbacks that change identity every render;
    // depending on them would re-run this on every keystroke in the host form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, seeded]);

  useEffect(() => {
    void checkConnection();
  }, [checkConnection]);

  // The OAuth window is a separate tab, so returning focus is the signal it finished.
  useEffect(() => {
    if (!propertyId || connected) return;
    const onFocus = () => void checkConnection();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [propertyId, connected, checkConnection]);

  const handleConnect = async () => {
    if (!propertyId) return;
    if (authUrl) {
      window.open(authUrl, '_blank', 'noopener');
      setAuthOpened(true);
      return;
    }
    setGeneratingLink(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_airbnb_connection_link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId }),
      });
      const json = await res.json();
      const url = json?.data?.url;
      if (json?.status === 'success' && url) {
        setAuthUrl(url);
        window.open(url, '_blank', 'noopener');
        setAuthOpened(true);
      } else {
        setError(json?.message || 'Could not start the Airbnb connection.');
      }
    } catch (err: any) {
      setError(err?.message || 'Could not start the Airbnb connection.');
    } finally {
      setGeneratingLink(false);
    }
  };

  const groups = useMemo(() => {
    const map = new Map<string, DiscoveredListing[]>();
    listings.forEach((l) => {
      const c = cityOf(l);
      map.set(c, [...(map.get(c) || []), l]);
    });
    return Array.from(map.entries());
  }, [listings]);

  const selectedCities = useMemo(() => {
    const seen = new Set<string>();
    listings.forEach((l) => {
      if (selectedIds.includes(l.id)) seen.add(cityOf(l));
    });
    return Array.from(seen);
  }, [listings, selectedIds]);

  const toggle = (id: string) => {
    if (claimed[id]) return; // owned by another property - not selectable
    onSelectionChange(selectedIds.includes(id) ? selectedIds.filter((i) => i !== id) : [...selectedIds, id]);
  };

  if (!propertyId) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Save this step first — your listings attach to the property once it exists.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {checking && listings.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking your Airbnb connection…
        </div>
      )}

      {!checking && !connected && (
        <div className="space-y-2">
          <Button variant="primary" className="w-full justify-center" onClick={handleConnect} disabled={generatingLink}>
            {generatingLink ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing…</>
            ) : (
              <><AirbnbIcon className="mr-2 h-4 w-4" /> Connect Airbnb</>
            )}
          </Button>
          <p className="text-center text-2xs text-slate-500 dark:text-slate-400">
            {authOpened
              ? 'Finish in the Airbnb tab, then come back here — this updates on its own.'
              : 'Airbnb opens in a new tab. This page stays open.'}
          </p>
          {authOpened && (
            <Button variant="secondary" size="xs" className="w-full justify-center" onClick={() => void checkConnection()}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Check again
            </Button>
          )}
        </div>
      )}

      {connected && loadingListings && (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading your listings from Airbnb…
        </div>
      )}

      {connected && !loadingListings && listings.length === 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          Airbnb is connected, but no active listings came back. You can continue and fill this
          property in by hand.
        </p>
      )}

      {connected && listings.length > 0 && (
        <>
          {/* Guidance BEFORE the checkboxes - after them it is advice about a decision already
              made. Staff, expenses, kitchen and menu all attach to the parent property, so one
              property per location is what lets an owner run separate teams and separate books. */}
          <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
            <Building className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <div className="text-xs text-blue-900 dark:text-blue-200">
              <p className="font-bold">Select only the listings at one location.</p>
              <p className="mt-1 font-normal">
                They become rooms under this one property. Anything at a different address should
                be a separate property, created the same way afterwards &mdash; that is what lets
                you give each location its own staff, expenses and kitchen.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {listings.length} listing{listings.length === 1 ? '' : 's'} found
            </span>
            <span className="text-2xs text-slate-500 dark:text-slate-400">
              {selectedIds.length} selected
            </span>
          </div>

          <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
            {groups.map(([city, items]) => {
              const ids = items.filter((l) => !claimed[l.id]).map((l) => l.id);
              const allPicked = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
              return (
                <div key={city}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1 text-2xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <MapPin className="h-3 w-3" /> {city} ({items.length})
                    </span>
                    {groups.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onSelectionChange(allPicked ? [] : ids)}
                        className="text-2xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {allPicked ? 'Clear' : 'Select only these'}
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {items.map((listing) => {
                      const claim = claimed[listing.id];
                      const isSelected = selectedIds.includes(listing.id);
                      return (
                        <div
                          key={listing.id}
                          onClick={() => toggle(listing.id)}
                          className={`flex items-center justify-between gap-3 rounded-lg border p-3 transition-all ${
                            claim
                              ? 'cursor-not-allowed border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60'
                              : isSelected
                              ? 'cursor-pointer border-indigo-300 bg-indigo-50/60 dark:border-indigo-700 dark:bg-indigo-950/30'
                              : 'cursor-pointer border-slate-200 bg-slate-50 opacity-60 dark:border-slate-700 dark:bg-slate-900'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className={`truncate text-xs font-bold ${claim ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                              {listing.title}
                            </div>
                            {claim ? (
                              /* Named, not just disabled. "Already imported" with no owner
                                 leaves the operator hunting for which property took it. */
                              <div className="mt-0.5 flex items-center gap-1 text-2xs font-semibold text-slate-500 dark:text-slate-400">
                                <Lock className="h-3 w-3 shrink-0" />
                                <span className="truncate">
                                  Already imported into &ldquo;{claim.property_name}&rdquo;
                                  {claim.room_name ? ` as ${claim.room_name}` : ''}
                                </span>
                              </div>
                            ) : listing.max_occupancy ? (
                              <div className="mt-0.5 text-2xs text-slate-500 dark:text-slate-400">
                                Sleeps {listing.max_occupancy} guests
                              </div>
                            ) : null}
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!!claim}
                            onChange={() => toggle(listing.id)}
                            className="h-4 w-4 rounded-sm text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {selectedCities.length > 1 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="text-xs text-amber-900 dark:text-amber-300">
                <p className="font-bold">
                  You have picked listings in {selectedCities.length} different places: {selectedCities.join(', ')}.
                </p>
                <p className="mt-1 font-normal">
                  They would all become rooms of this one property, sharing one staff list. If they
                  are separate places, import one now and create another property for the rest.
                </p>
              </div>
            </div>
          )}

          <p className="flex items-center gap-1 text-2xs text-slate-500 dark:text-slate-400">
            <ExternalLink className="h-3 w-3" />
            Nothing is sent to Airbnb — this only reads your listings.
          </p>
        </>
      )}
    </div>
  );
};

export default AirbnbListingPicker;
