import { lazy, ComponentType } from 'react';

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
 * reopen would have accomplished - one full page reload, which fetches the
 * CURRENT index.html (referencing the CURRENT chunk hashes) and lets the
 * retry after reload succeed transparently. Guarded via sessionStorage
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
        window.location.reload();
        // The reload is about to tear this whole JS context down anyway -
        // return a promise that never resolves so React doesn't render the
        // error boundary for the brief moment before navigation lands.
        return new Promise<{ default: T }>(() => {});
      }

      // Already retried once this session and it's STILL failing - a real
      // problem (offline, genuinely broken deploy), not a stale-chunk race.
      // Let it surface normally instead of masking it forever.
      throw error;
    }
  });
}
