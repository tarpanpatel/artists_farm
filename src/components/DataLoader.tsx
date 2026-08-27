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
import { recordTelescopeLog } from '../utils/telescopeLogger';

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

        // First, fetch the basic property data
        let property = await fetchCurrentProperty().catch(err => {
          console.error('Failed to fetch current property:', err);
          return null;
        });

        // Resolved here (rather than only later, right before the 5 nav/telegram/guests/
        // receipts/menu fetches) so it can ALSO gate the two authenticated-only fetches
        // right below (27 Aug 2026 - found via a wall of 401s in a logged-out console: this
        // component already skips the 5 fetches below for a logged-out visitor per the 18
        // Aug 2026 fix, but get_multikey_property/get_property_modules were still firing
        // unconditionally, guaranteed to 401 every time with no session - same class of bug,
        // just missed here).
        const isAuthenticated = await sessionCheckPromise;

        // BUG (found 15 Aug 2026, still reproducing live after the 13 Aug fixes below):
        // this rooms fetch had its own try/catch that silently swallowed failures with
        // NO retry at all - unlike the realDataPromise fetches further down, it isn't even
        // inside the timeout race, so the existing "timed out -> retry in background" fix
        // never covered it. A cold PHP-FPM worker / cold DB connection on the first couple
        // of requests in a fresh browser session can make this genuinely ERROR (not just
        // run slow) within the time budget - Promise timing there was never the issue, a
        // plain fetch failure was. When it failed, `property` silently kept whatever
        // get_current_property returned (no `.rooms` at all), so roomCount fell back to 0
        // for the rest of that page load: sidebar nav truncated, "Finish Setting Up"
        // wrongly showing "Create your first unit" as not done, calendar reading "No rooms
        // available" - self-correcting only on a real refresh, which lands on warm
        // connections. Same root issue as the nav/guests/receipts/menu fetches below
        // (transient failure silently caught into an empty default, no retry), just not
        // caught by that fix since this call sits outside the race entirely. Fixed the same
        // way: on failure, keep going with what we have so first paint isn't blocked, but
        // retry in the background and patch the real rooms in once they arrive.
        const fetchMultiKeyRooms = (propertyId: number) =>
          apiFetch(`/php/api/router.php?action=get_multikey_property&property_id=${propertyId}`)
            .then(response => response.json())
            .then(json => {
              if (!json.success) throw new Error('get_multikey_property returned success:false');
              return json.data;
            });

        let roomsFetchFailed = false;
        if (isAuthenticated && property && property.property_type === 'MULTI_KEY') {
          try {
            property = await fetchMultiKeyRooms(property.id);
          } catch (err) {
            console.error('Failed to fetch MultiKey property details:', err);
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
        // BUG (found 15 Aug 2026): that fix only retried when the TIMER won the
        // race (timedOut). It missed the equally-routine case where an individual
        // fetch below genuinely errors (same cold-start causes as above) but still
        // resolves - via its own .catch() - well inside the 6s budget: Promise.all
        // still "succeeds" on schedule with an empty value baked in for that one
        // entry, timedOut stays false, and the retry block never ran. Indistinguishable
        // from a real empty result once caught, so nothing downstream could tell the
        // difference either. Each fetch below now reports whether IT failed
        // (safeFetch), so a failure can trigger the same retry path as a timeout.
        const safeFetch = async <T,>(fn: () => Promise<T>, fallback: T, label: string): Promise<{ value: T; failed: boolean }> => {
          try {
            return { value: await fn(), failed: false };
          } catch (err) {
            console.error(`Failed to fetch ${label}:`, err);
            return { value: fallback, failed: true };
          }
        };

        // BUG (found 22 Aug 2026, still reproducing live after the 13/15 Aug
        // fixes above): fetchNavMenuFromDB() (services/api.ts) swallows any
        // non-'success' backend response into an empty [] WITHOUT ever
        // throwing - that's deliberate there, so other callers can just
        // treat "no nav items" as "show nothing". But it means safeFetch()
        // below can only ever detect a failure that surfaces as a thrown JS
        // exception (network unreachable, bad JSON) - a backend that
        // responds 200 with `{status:'error', ...}`, or any other
        // non-success shape, looks IDENTICAL to "genuinely zero nav items"
        // from here, so anyRealDataFetchFailed stays false and the
        // retry-and-patch-in block further down never runs. Confirmed live:
        // nav_menu_items has a full, healthy, platform-wide-shared row set
        // (unscoped by property_id - see get_nav_menu in php/kitchen/
        // menu.php) - so an empty result reaching this component is NEVER
        // legitimately correct, unlike guests/receipts/menu below, which
        // genuinely can be empty for a quiet/new property and must NOT be
        // treated as a failure just for being []. This inline wrapper (nav
        // items only) treats an empty result the same as a thrown failure,
        // so the existing retry machinery actually gets a chance to run for
        // the one fetch where "empty" is an unambiguous failure signal.
        const safeFetchNavItems = async (): Promise<{ value: any[]; failed: boolean }> => {
          try {
            const value = await fetchNavMenuFromDB();
            if (!Array.isArray(value) || value.length === 0) {
              return { value: [], failed: true };
            }
            return { value, failed: false };
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
        });

        // Rooms fetch failed above (see BUG note near fetchMultiKeyRooms) - retry once in
        // the background and patch the real rooms into currentProperty once they land.
        if (roomsFetchFailed && property?.id) {
          fetchMultiKeyRooms(property.id)
            .then((fullProperty) => {
              if (isStale()) return;
              setData((prev) => prev ? { ...prev, currentProperty: fullProperty } : prev);
            })
            .catch((err) => console.error('Retry for MultiKey property details also failed:', err));
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
        // Bounded loop, not a single retry (found 28 Aug 2026, still reproducing live on
        // dev/staging as the chronic "Sidebar Shows Only Kitchen" bug - see CLAUDE.md):
        // a single retry has exactly one more chance to beat whatever cold-start/session-
        // file-locking condition caused the first failure - if the SAME condition is still
        // in effect (a slow PHP-FPM worker staying slow for a couple more requests, not
        // just one), the retry fails too and there was never a third attempt, leaving
        // navItems permanently empty for the rest of the tab's life. Nav items specifically
        // are never legitimately empty (see safeFetchNavItems above), so it's the one field
        // worth extending the loop for; the other four patch in whatever they got on every
        // pass (unchanged from before) but don't extend the loop on their own since an
        // empty guests/receipts/menu list can be genuinely correct.
        if (anyRealDataFetchFailed) {
          (async () => {
            const maxAttempts = 3;
            let source = timedOut ? realDataPromise : runRealDataFetches();
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              const [realNav, realTelegram, realGuests, realReceipts, realMenu] = await source;
              if (isStale()) return;
              setData((prev) => prev ? {
                ...prev,
                navItems: !realNav.failed && Array.isArray(realNav.value) ? realNav.value : prev.navItems,
                telegramConfig: !realTelegram.failed ? realTelegram.value : prev.telegramConfig,
                initialGuests: !realGuests.failed && Array.isArray(realGuests.value) ? realGuests.value : prev.initialGuests,
                initialReceipts: !realReceipts.failed && Array.isArray(realReceipts.value) ? realReceipts.value : prev.initialReceipts,
                initialMenu: !realMenu.failed && Array.isArray(realMenu.value) ? realMenu.value : prev.initialMenu,
              } : prev);

              if (!realNav.failed) return;
              if (attempt === maxAttempts) {
                // Every attempt came back empty - this is the exact state that renders as
                // Navigation.tsx's synthetic "Kitchen" fallback. Log it so this chronic,
                // hard-to-reproduce-on-demand bug becomes something we can actually count
                // instead of only hearing about when a user notices their sidebar looks wrong.
                recordTelescopeLog({
                  portal: 'js',
                  severity: 'WARNING',
                  msg: `Nav menu items never loaded after ${maxAttempts} attempts - sidebar fell back to synthetic Kitchen-only tree`,
                  origin: 'DataLoader.tsx loadAllData retry loop',
                });
                return;
              }
              await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
              source = runRealDataFetches();
            }
          })();
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
