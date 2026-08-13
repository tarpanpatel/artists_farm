import React, { useEffect, useState, useRef } from 'react';
import { LoadingScreen } from './LoadingScreen';
import { InvalidPropertyPage } from './InvalidPropertyPage';
import {
  fetchCurrentProperty,
  apiFetch,
  fetchPropertyModulesFromDB,
  fetchNavMenuFromDB,
  fetchTelegramConfigDB,
  fetchGuestsFromDB,
  fetchReceiptsFromDB,
  fetchMenuFromDB,
  getPropertySlug,
  getRoomSlugFromHash,
} from '../services/api';
import { t } from '../i18n/en';

export interface PreloadedData {
  currentProperty: any;
  modules: Array<{ slug: string; is_enabled: boolean }>;
  navItems: any[];
  telegramConfig: any;
  isMultiKeyProperty?: boolean;
  currentRoomSlug?: string | null;
  parentPropertyId?: number;
  initialGuests?: any[];
  initialReceipts?: any[];
  initialMenu?: any[];
}

interface DataLoaderProps {
  children: (data: PreloadedData) => React.ReactNode;
}

export const DataLoader: React.FC<DataLoaderProps> = ({ children }) => {
  const [data, setData] = useState<PreloadedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setCurrentRoomSlug] = useState<string | null>(null);

  const [invalidProperty, setInvalidProperty] = useState<string | null>(null);

  // BUG (found 13 Aug 2026): React.StrictMode (see main.tsx) deliberately
  // double-invokes effects in dev - mount, immediately no-op "cleanup"
  // (this effect returns none), mount again - specifically to surface
  // missing-cleanup bugs like this one. This effect had no cancellation
  // guard, so both invocations independently ran the FULL loadAllData()
  // (two complete rounds of every fetch below, in parallel) and both called
  // setData()/setIsLoading(false) on the same component instance. Whichever
  // invocation's setIsLoading(false) landed FIRST let AppBody mount and
  // read preloadedData - and AppBody's own useState(preloadedData.x || [])
  // initializers (see App.tsx) only read that value ONCE, at mount. If the
  // two invocations' Promise.race timing differed even slightly (plausible
  // running two full fetch rounds concurrently), whichever one mounted
  // first could easily be the more-incomplete one, and the second
  // invocation's better result had no effect - permanently, since nothing
  // was watching for it. Symptom: sidebar/setup-banner showing incomplete
  // data on first load, self-correcting on a real refresh (a full page
  // reload only runs the effect once, no StrictMode double-invoke
  // artifact). Same class of bug as hydrationTokenRef elsewhere in
  // App.tsx - applied here the same way: only the LATEST invocation's
  // results are ever committed to state.
  const loadTokenRef = useRef(0);

  useEffect(() => {
    loadTokenRef.current += 1;
    const myToken = loadTokenRef.current;
    const isStale = () => loadTokenRef.current !== myToken;

    const loadAllData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Check if property slug is present in URL
        const propertySlug = getPropertySlug();

        if (!propertySlug || propertySlug === 'default') {
          if (isStale()) return;
          setInvalidProperty(propertySlug);
          setIsLoading(false);
          return;
        }

        // Create a timeout promise that resolves after 6 seconds (was 3s -
        // too tight for a cold first load right after login: several
        // sequential+parallel requests against cold caches/connections
        // routinely took longer than that, see the note below). This is
        // now purely a "paint something soon" cap, not a correctness
        // boundary - see realDataPromise below for why a slow response no
        // longer gets stuck.
        const timeoutPromise = new Promise((resolve) => {
          setTimeout(() => resolve(null), 6000);
        });

        // First, fetch the basic property data
        let property = await fetchCurrentProperty().catch(err => {
          console.error('Failed to fetch current property:', err);
          return null;
        });

        // If it's a MultiKey property, fetch full data with rooms
        if (property && property.property_type === 'MULTI_KEY') {
          try {
            const response = await apiFetch(`/php/api/router.php?action=get_multikey_property&property_id=${property.id}`);
            const data = await response.json();
            if (data.success) {
              property = data.data;
            }
          } catch (err) {
            console.error('Failed to fetch MultiKey property details:', err);
          }
        }

        // Fetch property modules first to check feature toggles (kitchen, etc.)
        const modules = await fetchPropertyModulesFromDB().catch(err => {
          console.error('Failed to fetch modules:', err);
          return [];
        });

        const isKitchenEnabled = modules.length === 0 || modules.some((m: any) =>
          (m.module_slug === 'kitchen' || m.slug === 'kitchen') &&
          (m.is_enabled === 1 || m.is_enabled === true || m.is_enabled === '1')
        );

        // Fetch all other data in parallel with a timeout fallback for a snappy
        // first paint - but keep a reference to the real fetch (realDataPromise)
        // separate from the race, and don't let it just evaporate if the
        // timeout wins.
        //
        // BUG (found 13 Aug 2026): when the real fetch took longer than the
        // 3s timeout - routine right after a fresh login, with cold caches
        // and several sequential+parallel requests still in flight - this
        // used to permanently discard whatever it eventually returned. The
        // sidebar nav (plus guests/receipts/menu/telegram config) got stuck
        // showing the timeout's empty defaults for the rest of that page
        // load, with no retry, only recoverable by a manual refresh (a
        // refresh's fetches land on already-warm caches/connections and
        // reliably beat the timeout). Reported as: full nav menu + correct
        // "Finish Setting Up" state only appearing after a refresh, never on
        // the first load post-login.
        //
        // Fix: still race for the first paint, but if the timeout won, keep
        // awaiting the real fetch in the background and apply its result on
        // top once it resolves - self-correcting instead of getting stuck.
        const realDataPromise = Promise.all([
          fetchNavMenuFromDB().catch(err => {
            console.error('Failed to fetch nav items:', err);
            return [];
          }),
          fetchTelegramConfigDB().catch(err => {
            console.error('Failed to fetch telegram config:', err);
            return null;
          }),
          fetchGuestsFromDB().catch(err => {
            console.error('Failed to fetch preloaded guests:', err);
            return [];
          }),
          fetchReceiptsFromDB().catch(err => {
            console.error('Failed to fetch preloaded receipts:', err);
            return [];
          }),
          isKitchenEnabled
            ? fetchMenuFromDB().catch(err => {
                console.error('Failed to fetch preloaded menu:', err);
                return [];
              })
            : Promise.resolve([]),
        ]);

        let timedOut = false;
        const results = await Promise.race([
          realDataPromise,
          timeoutPromise.then(() => {
            timedOut = true;
            return [[], null, [], [], []]; // Default values on timeout
          }),
        ]);

        const [navItems, telegramConfig, initialGuests, initialReceipts, initialMenu] = results as any[];

        if (!property || (typeof property === 'object' && Object.keys(property).length === 0)) {
          if (isStale()) return;
          setInvalidProperty(propertySlug);
          setIsLoading(false);
          return;
        }

        // A newer invocation has already taken over (StrictMode's second
        // mount, or a genuinely new load) - drop this one's result
        // entirely rather than letting a slower/inferior fetch clobber
        // whatever the current invocation already committed.
        if (isStale()) return;

        const isMultiKeyProperty = property.property_type === 'MULTI_KEY';
        const validRoomSlugs = isMultiKeyProperty ? (property.rooms || []).map((r: any) => r.slug) : [];
        const selectedRoomSlug = isMultiKeyProperty ? getRoomSlugFromHash(validRoomSlugs) : null;

        setCurrentRoomSlug(selectedRoomSlug);

        setData({
          currentProperty: property,
          modules: Array.isArray(modules) ? modules : [],
          navItems: Array.isArray(navItems) ? navItems : [],
          telegramConfig: telegramConfig,
          isMultiKeyProperty,
          currentRoomSlug: selectedRoomSlug,
          parentPropertyId: undefined,
          initialGuests: Array.isArray(initialGuests) ? initialGuests : [],
          initialReceipts: Array.isArray(initialReceipts) ? initialReceipts : [],
          initialMenu: Array.isArray(initialMenu) ? initialMenu : [],
        });

        // See the note above realDataPromise: the timeout won, so the values
        // just rendered are the empty defaults - patch in the real data on
        // top as soon as it actually arrives instead of leaving it stuck.
        if (timedOut) {
          realDataPromise.then(([realNavItems, realTelegramConfig, realGuests, realReceipts, realMenu]) => {
            if (isStale()) return;
            setData((prev) => prev ? {
              ...prev,
              navItems: Array.isArray(realNavItems) ? realNavItems : prev.navItems,
              telegramConfig: realTelegramConfig ?? prev.telegramConfig,
              initialGuests: Array.isArray(realGuests) ? realGuests : prev.initialGuests,
              initialReceipts: Array.isArray(realReceipts) ? realReceipts : prev.initialReceipts,
              initialMenu: Array.isArray(realMenu) ? realMenu : prev.initialMenu,
            } : prev);
          });
        }
      } catch (err) {
        if (isStale()) return;
        console.error('Critical error loading app data:', err);
        setData({
          currentProperty: null,
          modules: [],
          navItems: [],
          telegramConfig: null,
          initialGuests: [],
          initialReceipts: [],
          initialMenu: [],
        });
      } finally {
        if (!isStale()) setIsLoading(false);
      }
    };

    loadAllData();
  }, []);

  if (invalidProperty !== null) {
    return <InvalidPropertyPage propertySlug={invalidProperty} />;
  }

  if (isLoading) {
    return <LoadingScreen message={t('loading_screen_default_message')} />;
  }

  if (error && !data) {
    return (
      <div className="fixed inset-0 bg-red-50 dark:bg-red-950 flex items-center justify-center z-50 data-loader__error">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 max-w-md shadow-lg border border-red-200 dark:border-red-800 data-loader__error-container">
          <h2 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2 data-loader__error-title">
            {t('error_loading_application_heading')}
          </h2>
          <p className="text-sm text-slate-700 dark:text-slate-300 mb-4 data-loader__error-message">
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors data-loader__error-refresh-btn"
          >
            {t('refresh_page_button')}
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <LoadingScreen message={t('initializing_message')} />;
  }

  return <>{children(data)}</>;
};
