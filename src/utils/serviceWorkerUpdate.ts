// Shared handle to the active service worker registration, set once by
// main.tsx right after navigator.serviceWorker.register() resolves. Exists
// so a manual "check for updates" trigger (e.g. a header button) can run the
// exact same check main.tsx's own 5-minute timer / on-focus listener
// already runs, instead of duplicating the registration lookup.
let swRegistration: ServiceWorkerRegistration | null = null;

export function setServiceWorkerRegistration(registration: ServiceWorkerRegistration): void {
  swRegistration = registration;
}

/**
 * Manually triggers the same update check main.tsx runs automatically.
 * Resolves to true if a new service worker install was found (the caller
 * doesn't need to do anything else in that case - sw.js's own
 * skipWaiting()+clients.claim() take over within moments, which fires
 * main.tsx's 'controllerchange' listener and shows UpdateAvailableBanner's
 * Reload prompt, same as the automatic check). Resolves to false if already
 * on the latest version, or if there's no service worker to check (e.g.
 * local dev, where main.tsx deliberately unregisters any SW) - callers use
 * that to show "you're already up to date" instead of just doing nothing.
 */
export async function checkForAppUpdate(): Promise<boolean> {
  if (!swRegistration) return false;
  try {
    await swRegistration.update();
    // registration.installing is set synchronously once update() finds a
    // newer sw.js and starts installing it - null means the fetched sw.js
    // was byte-identical to what's already active, i.e. no update.
    return !!swRegistration.installing;
  } catch {
    return false;
  }
}
