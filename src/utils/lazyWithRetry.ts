import { lazy, ComponentType } from 'react';

/**
 * Whether an error is the "stale chunk after a deploy" class this whole file
 * exists to recover from - used by ErrorBoundary.tsx to show a bare Reload
 * button instead of a normal crash card once lazyWithRetry's own one-shot
 * silent reload above has already been tried and it's STILL failing. Message
 * wording varies by browser (Vite's own phrasing vs. Firefox/Safari's), so
 * this checks for every known variant rather than one exact string.
 */
export function isChunkLoadError(message: string | undefined | null): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes('dynamically imported module') ||
    m.includes('importing a module script failed') ||
    m.includes('loading chunk') ||
    m.includes('loading css chunk')
  );
}

/**
 * Forces a genuinely fresh page load - not just `window.location.reload()`,
 * which re-requests the SAME URL and can be answered by sw.js's own
 * stale-while-revalidate HTML cache with the exact same stale shell that
 * caused the chunk to go missing in the first place (sw.js instantly returns
 * whatever it has cached and only refreshes it in the BACKGROUND - see
 * sw.js's fetch handler). That produces the real-world bug this was written
 * to fix (reported live 5 Sep 2026): switching property hangs on an endless
 * spinner - not even an error - because the promise below is deliberately
 * never resolved/rejected while a reload is "about to" happen, and a reload
 * that keeps re-serving the same stale cache never actually clears that
 * hang. Only a full PWA force-quit (which drops the in-memory JS context
 * entirely, sidestepping the bad cache) recovered.
 *
 * Two independent guarantees fix this, mirroring index.html's own inline
 * recovery script for the same class of failure:
 *   1. A cache-busting query param (`_r=<timestamp>`) makes this a URL
 *      sw.js has never cached, so its fetch handler can't answer from a
 *      stale entry - it MUST fall through to a real network fetch.
 *   2. A hard 2.5s timeout guarantees the navigation actually fires even if
 *      the pre-warming fetch below hangs (slow network, cold server) - so
 *      the never-resolving promise this replaces is bounded, not eternal.
 */
// In-memory only (a real navigation wipes it - it only needs to survive
// this one page's lifetime). Closes a real "reload storm" gap found live
// 5 Sep 2026: this file wraps 25+ lazy components, each with its OWN
// per-chunk sessionStorage guard below, so if a deploy leaves MORE THAN
// ONE of them stale at once - very plausible, since a route-level
// component (e.g. MultiKeyPropertyOverview) and something mounted
// alongside it near the header (TelegramNotificationModal, LegalDrawer)
// can both be loading for the first time on the same fresh navigation -
// EACH failing chunk independently called forceFreshReload(), racing each
// other with competing cache-busted URLs and interrupting one another's
// in-flight navigation. Observed live as 3 separate reload cycles within
// ~20 seconds before the destination property finally landed - much
// longer than the intended one-reload recovery, and easily read as "still
// hanging." Only the FIRST chunk to fail actually triggers a reload; every
// other chunk that fails while one is already in flight just waits on it
// too, since a single fresh reload fixes every stale chunk at once anyway.
let reloadClaimed = false;

function forceFreshReload(): void {
  const url = new URL(window.location.href);
  url.searchParams.set('_r', String(Date.now()));
  const freshUrl = url.toString();

  let navigated = false;
  const go = () => {
    if (navigated) return;
    navigated = true;
    window.location.href = freshUrl;
  };

  // Pre-warm sw.js's cache for freshUrl before navigating, same reasoning
  // as index.html's own copy of this trick - by the time `go()` navigates,
  // the fetch below has already primed the cache, so the real navigation
  // answers instantly instead of waiting on the network a second time.
  fetch(freshUrl, { credentials: 'include', headers: { Accept: 'text/html' } })
    .then(go)
    .catch(go);
  setTimeout(go, 2500);
}

/**
 * Drop-in replacement for React's own lazy() that recovers automatically
 * from a stale-chunk load failure (found 22 Aug 2026, reported as a
 * "Kitchen Management Error" / "'text/html' is not a valid JavaScript MIME
 * type" crash on a tab/PWA left open across a deploy).
 *
 * What happens without this: a tab already running an older build has
 * `import('./components/X')` baked into its bundle pointing at that build's
 * hashed chunk filename (dist/assets/X-<oldhash>.js). Once a new deploy ships
 * and deletes that file, the next time this tab lazy-loads X for the first
 * time in its session, that request 404s - and (see the .htaccess fix
 * alongside this file, dated the same day) used to get silently rewritten
 * into a 200 HTML response instead of a real 404, which is what produced the
 * exact "text/html is not a valid JavaScript MIME type" error. Either way -
 * a real 404 or the old HTML-masquerade - the dynamic import() rejects, and
 * with plain lazy() that rejection has nowhere to go but the nearest
 * ErrorBoundary, which shows a permanent crash card with no way to recover
 * short of the user realizing they need to force-quit and reopen the app.
 *
 * The fix: on a failed chunk load, do exactly what a manual force-quit/
 * reopen would have accomplished - one full, cache-busted page reload (see
 * forceFreshReload() above) that's guaranteed to fetch the CURRENT
 * index.html (referencing the CURRENT chunk hashes), and lets the retry
 * after reload succeed transparently. Guarded via sessionStorage
 * (a reload wipes any in-memory guard, so a plain module-level flag
 * wouldn't survive it) keyed per chunk, so a genuinely persistent failure
 * (offline, a truly broken deploy, a real 404 unrelated to staleness)
 * reloads at most once per chunk per tab session and then falls through to
 * the normal ErrorBoundary crash card instead of reload-looping forever.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  chunkName: string
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      const storageKey = `chunk-reload:${chunkName}`;
      let alreadyRetried = false;
      try {
        alreadyRetried = sessionStorage.getItem(storageKey) === '1';
        if (!alreadyRetried) sessionStorage.setItem(storageKey, '1');
      } catch {
        // Private-browsing/storage-disabled edge case - fall through and
        // treat as "already retried" so this never reload-loops.
        alreadyRetried = true;
      }

      if (!alreadyRetried) {
        // Only the first chunk to fail this page load actually reloads -
        // see reloadClaimed's own doc comment above for why this must be
        // global, not per-chunk.
        if (!reloadClaimed) {
          reloadClaimed = true;
          forceFreshReload();
        }
        // The reload is about to tear this whole JS context down anyway -
        // return a promise that never resolves so React doesn't render the
        // error boundary for the brief moment before navigation lands.
        // forceFreshReload()'s own 2.5s timeout is what keeps this bounded
        // instead of an eternal hang if the navigation is ever slow to fire.
        return new Promise<{ default: T }>(() => {});
      }

      // Already retried once this session and it's STILL failing - a real
      // problem (offline, genuinely broken deploy), not a stale-chunk race.
      // Let it surface normally instead of masking it forever.
      throw error;
    }
  });
}
