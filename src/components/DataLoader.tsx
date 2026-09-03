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
import { useAuthOptional } from '../contexts/AuthContext';
import { normalizeNavItems } from '../utils/navItems';

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
  // True only while the initial guests fetch itself failed/timed out and the
  // background retry below (see anyRealDataFetchFailed) hasn't landed yet -
  // NOT "guests array is empty". A property with zero real guests still
  // gets false here (the fetch succeeded, it just legitimately returned []),
  // so consumers can tell "still loading" apart from "genuinely no bookings"
  // instead of guessing from array length (which can never tell the two
  // apart and would show a loading spinner forever on an empty property).
  guestsFetchPending?: boolean;
}

interface DataLoaderProps {
  children: (data: PreloadedData) => React.ReactNode;
}

export const DataLoader: React.FC<DataLoaderProps> = ({ children }) => {
  const [data, setData] = useState<PreloadedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setCurrentRoomSlug] = useState<string | null>(null);
  const authCtx = useAuthOptional();
  const authChecked = authCtx ? authCtx.authChecked : true;

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

        // Fired now (before the property/modules fetches below) so it's
        // already resolving in the background and adds ~zero latency by the
        // time it's actually awaited further down - see there for why this
        // exists (18 Aug 2026): nav/telegram/guests/receipts/menu are
        // authenticated-only data, but were being preloaded unconditionally
        // here even for a logged-out visitor sitting on the login screen,
        // guaranteed to 401 every single time - and each 401 looks exactly
        // like a transient failure to the retry logic below, so it burned
        // through a full extra retry round chasing something that could
        // never succeed without a session.
        const sessionCheckPromise = apiFetch('/php/api/router.php?action=check_session')
          .then(res => res.json())
          .then(json => !!json?.authenticated)
          .catch(() => false);

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

        // First, fetch the basic property data and session check in parallel for fastest load
        const [rawProperty, isAuthenticated] = await Promise.all([
          fetchCurrentProperty().catch(err => {
            console.error('Failed to fetch current property:', err);
            return null;
          }),
          sessionCheckPromise,
        ]);
        let property = rawProperty;

        const fetchMultiKeyRooms = (propertyId: number) =>
          apiFetch(`/php/api/router.php?action=get_multikey_property&property_id=${propertyId}`)
            .then(response => response.json())
            .then(json => {
              if (!json.success) throw new Error('get_multikey_property returned success:false');
              return json.data;
            });

        let roomsFetchFailed = false;
        if (property && property.property_type === 'MULTI_KEY') {
          if (isAuthenticated) {
            try {
              property = await fetchMultiKeyRooms(property.id);
            } catch (err) {
              console.error('Failed to fetch MultiKey property details:', err);
              roomsFetchFailed = true;
            }
          } else {
            roomsFetchFailed = true;
          }
        }

        // Fetch property modules first to check feature toggles (kitchen, etc.)
        let modulesFetchFailed = false;
        const modules = isAuthenticated
          ? await fetchPropertyModulesFromDB().catch(err => {
              console.error('Failed to fetch modules:', err);
              modulesFetchFailed = true;
              return [];
            })
          : [];

        const isKitchenEnabled = modules.length === 0 || modules.some((m: any) =>
          (m.module_slug === 'kitchen' || m.slug === 'kitchen') &&
          (m.is_enabled === 1 || m.is_enabled === true || m.is_enabled === '1')
        );

        const safeFetch = async <T,>(fn: () => Promise<T>, fallback: T, label: string): Promise<{ value: T; failed: boolean }> => {
          try {
            return { value: await fn(), failed: false };
          } catch (err) {
            console.error(`Failed to fetch ${label}:`, err);
            return { value: fallback, failed: true };
          }
        };

        const safeFetchNavItems = async (): Promise<{ value: any[]; failed: boolean }> => {
          try {
            const value = await fetchNavMenuFromDB();
            if (!Array.isArray(value) || value.length === 0) {
              return { value: [], failed: true };
            }
            return { value: normalizeNavItems(value), failed: false };
          } catch (err) {
            console.error('Failed to fetch nav items:', err);
            return { value: [], failed: true };
          }
        };

        const runRealDataFetches = () => Promise.all([
          safeFetchNavItems(),
          safeFetch(fetchTelegramConfigDB, null as any, 'telegram config'),
          safeFetch(fetchGuestsFromDB, [] as any[], 'preloaded guests'),
          safeFetch(fetchReceiptsFromDB, [] as any[], 'preloaded receipts'),
          isKitchenEnabled
            ? safeFetch(fetchMenuFromDB, [] as any[], 'preloaded menu')
            : Promise.resolve({ value: [] as any[], failed: false }),
        ]);

        // isAuthenticated already resolved further up (see the comment there) so it could
        // also gate the property-rooms/modules fetches above.

        // No valid session - none of the 5 fetches above will ever succeed
        // (see the note by sessionCheckPromise), so skip them entirely
        // rather than firing all 5, having every one 401, then retrying the
        // whole batch again below thinking it was a transient failure.
        // failed:false on each is deliberate - it's what keeps
        // anyRealDataFetchFailed (below) false, so that retry never fires.
        const emptyEntry = { value: [] as any[], failed: false };
        const unauthenticatedResults = [emptyEntry, { value: null as any, failed: false }, emptyEntry, emptyEntry, emptyEntry];

        const realDataPromise = isAuthenticated ? runRealDataFetches() : Promise.resolve(unauthenticatedResults);

        let timedOut = false;
        const results = !isAuthenticated ? unauthenticatedResults : await Promise.race([
          realDataPromise,
          timeoutPromise.then(() => {
            timedOut = true;
            const timedOutEntry = { value: [] as any, failed: true };
            return [timedOutEntry, { value: null, failed: true }, timedOutEntry, timedOutEntry, timedOutEntry];
          }),
        ]);

        const [navItemsR, telegramConfigR, initialGuestsR, initialReceiptsR, initialMenuR] = results as Array<{ value: any; failed: boolean }>;
        const navItems = navItemsR.value;
        const telegramConfig = telegramConfigR.value;
        const initialGuests = initialGuestsR.value;
        const initialReceipts = initialReceiptsR.value;
        const initialMenu = initialMenuR.value;
        const anyRealDataFetchFailed = timedOut || [navItemsR, telegramConfigR, initialGuestsR, initialReceiptsR, initialMenuR].some((r) => r.failed);

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
          guestsFetchPending: initialGuestsR.failed,
        });

        // Rooms fetch failed OR was skipped above (see BUG note near fetchMultiKeyRooms) -
        // retry in the background and patch the real rooms into currentProperty once they
        // land. Bounded loop with a real delay between attempts, not a single immediate
        // retry: the "skipped" case specifically needs actual TIME to pass for the
        // public-demo auto-login (AuthContext's separate 3-round-trip sequence) to
        // finish - retrying instantly would just hit the exact same not-yet-authenticated
        // state again. A genuine fetch failure (transient network/cold-start error)
        // recovers fine within the same loop too.
        if (roomsFetchFailed && property?.id) {
          (async () => {
            const maxAttempts = 4;
            const propId = property.id;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
              if (isStale()) return;
              try {
                const fullProperty = await fetchMultiKeyRooms(propId);
                if (isStale()) return;
                setData((prev) => prev ? { ...prev, currentProperty: fullProperty } : prev);
                return;
              } catch (err) {
                if (attempt === maxAttempts) {
                  console.error('Retry for MultiKey property details exhausted all attempts:', err);
                }
              }
            }
          })();
        }

        // Modules fetch failed above - same treatment, retry once in the background.
        // But not if that failure was just "no session" (isAuthenticated already
        // resolved by this point) - retrying without a session is guaranteed to
        // fail the same way again, it's not a transient error to recover from.
        if (modulesFetchFailed && isAuthenticated) {
          fetchPropertyModulesFromDB()
            .then((freshModules) => {
              if (isStale() || !Array.isArray(freshModules) || freshModules.length === 0) return;
              setData((prev) => prev ? { ...prev, modules: freshModules } : prev);
            })
            .catch((err) => console.error('Retry for property modules also failed:', err));
        }

        // See the notes above realDataPromise: either the timeout won, or an individual
        // fetch genuinely failed within budget - either way, the values just rendered
        // include empty defaults. Issue a fresh retry (timedOut can safely keep awaiting
        // the same in-flight promise; a genuine failure already resolved, so it needs a
        // brand-new call, not another .then() on the same settled promise) and patch in
        // whatever comes back instead of leaving it stuck.
        //
        // Single retry is enough here (simplified 28 Aug 2026 - a bounded 3-attempt loop
        // used to live here specifically for navItems). Found while tracing that fix: this
        // preload's navItems is NOT the authoritative copy - App.tsx has its own completely
        // separate loadWithRetry effect (mounted right after this data arrives) that
        // independently fetches, retries up to 3 times, AND does real transformation this
        // preload never did (filters removed items, reassigns display order, defaults
        // roles). That effect will correct/overwrite whatever lands here within moments
        // regardless of how hard THIS copy tries, so extending this retry loop was
        // duplicating work App.tsx already does more completely - this copy only needs to
        // be "good enough for a fast first paint" (Navigation.tsx's initial render, and the
        // renamed-nav-item hash-routing fallback in App.tsx), not itself exhaustively retried.
        if (anyRealDataFetchFailed) {
          (timedOut ? realDataPromise : runRealDataFetches()).then(([realNav, realTelegram, realGuests, realReceipts, realMenu]) => {
            if (isStale()) return;
            setData((prev) => prev ? {
              ...prev,
              navItems: !realNav.failed && Array.isArray(realNav.value) ? realNav.value : prev.navItems,
              telegramConfig: !realTelegram.failed ? realTelegram.value : prev.telegramConfig,
              initialGuests: !realGuests.failed && Array.isArray(realGuests.value) ? realGuests.value : prev.initialGuests,
              initialReceipts: !realReceipts.failed && Array.isArray(realReceipts.value) ? realReceipts.value : prev.initialReceipts,
              initialMenu: !realMenu.failed && Array.isArray(realMenu.value) ? realMenu.value : prev.initialMenu,
              // Retry has now settled either way (succeeded or exhausted) -
              // stop signalling "still loading" regardless of outcome, or a
              // guests fetch that keeps failing would leave consumers
              // spinning forever instead of falling back to real (empty) data.
              guestsFetchPending: false,
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

  if (isLoading || !authChecked) {
    return <LoadingScreen message={t('loading_screen_default_message')} />;
  }

  if (error && !data) {
    return (
      <div className="fixed inset-0 bg-red-50 dark:bg-red-950 flex items-center justify-center z-50 data-loader__error">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-8 max-w-md shadow-lg border border-red-200 dark:border-red-800 data-loader__error-container">
          <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2 data-loader__error-title">
            {t('error_loading_application_heading')}
          </h2>
          <p className="text-sm text-slate-700 dark:text-slate-300 mb-4 data-loader__error-message">
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors data-loader__error-refresh-btn"
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
