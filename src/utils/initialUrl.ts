/**
 * Reads one-shot parameters out of the URL exactly as the browser delivered it,
 * at the very first moment of app boot - before React mounts and before
 * App.tsx's hash router can touch it.
 *
 * WHY THIS EXISTS (13 Sep 2026): the passcode reset link arrives as
 * `/#reset-passcode?token=...`. Reading that inside LoginPage's own mount
 * effect did NOT work - verified on staging, where the screen never appeared
 * even though the hash, the parsing and the deployed bundle were all correct.
 * The app's hash routing owns `window.location.hash` from boot, and
 * `#reset-passcode` is not a route it knows: App.tsx's handleUrlChange treats
 * an unrecognised hash as "not a valid route" and reassigns
 * `window.location.hash = '#dashboard'`. Anything that reads the hash later
 * than this module is racing that rewrite.
 *
 * So the token is captured HERE, synchronously at module evaluation, and
 * main.tsx imports this module first specifically to pin that ordering. The
 * hash is then cleared immediately, which does double duty: the router never
 * sees a route it would bounce to #dashboard, and a single-use credential
 * stops sitting in the address bar where it can be shoulder-surfed,
 * bookmarked, or leaked through a Referer header.
 */

function readInitialResetToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const hash = window.location.hash || '';
    if (!hash.startsWith('#reset-passcode')) return '';
    const queryStart = hash.indexOf('?');
    if (queryStart === -1) return '';
    const token = new URLSearchParams(hash.slice(queryStart + 1)).get('token') || '';
    if (token) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    return token;
  } catch {
    return '';
  }
}

/** The passcode-reset token from the boot URL, or '' if this wasn't a reset link. */
export const INITIAL_RESET_TOKEN = readInitialResetToken();
