import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from './icons/FlowbiteIcons';
import { Button } from './Button';

// Listens for the 'sw-update-available' event dispatched by main.tsx when a
// new service worker has taken control of an already-running session (see
// main.tsx for why that's distinct from the page's first-ever SW install,
// which has nothing to reload for). Shown as a dismissible, persistent
// banner rather than auto-reloading - a POS app force-reloading itself
// mid-checkout would be worse than the staleness it's fixing.
export const UpdateAvailableBanner: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handleUpdate = () => setUpdateAvailable(true);
    window.addEventListener('sw-update-available', handleUpdate);
    return () => window.removeEventListener('sw-update-available', handleUpdate);
  }, []);

  if (!updateAvailable || dismissed) return null;

  return (
    // Sits ABOVE the mobile bottom nav, not on top of it (13 Sep 2026, caught
    // on a 390px viewport). At a flat bottom-4 this banner covered the nav
    // outright - only a sliver of the centre "+" button showed - so while an
    // update was pending the primary navigation could not be tapped at all,
    // and the more often we deploy the more often that happens. The offset
    // matches the nav's real height (h-[calc(4rem+env(safe-area-inset-bottom))])
    // plus the original 1rem gap, so it clears a notched/home-indicator device
    // too. md:bottom-4 restores the plain offset once the nav is gone at md.
    <div className="update-available-banner fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+1rem)] md:bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white p-4 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 animate-toast-in">
        <div className="inline-flex items-center justify-center shrink-0 w-8 h-8 text-blue-500 bg-blue-100 rounded-lg dark:bg-blue-800 dark:text-blue-200">
          <RefreshCw className="w-4 h-4 shrink-0" />
        </div>
        <span className="flex-1 text-sm font-normal text-gray-900 dark:text-white">A new version is available.</span>
        <Button variant="primary" size="xs" onClick={() => window.location.reload()}>
          Reload
        </Button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          className="ms-auto -mx-1.5 -my-1.5 bg-white text-gray-400 hover:text-gray-900 rounded-lg focus:ring-2 focus:ring-gray-300 p-1.5 hover:bg-gray-100 inline-flex items-center justify-center h-8 w-8 dark:text-gray-500 dark:hover:text-white dark:bg-gray-800 dark:hover:bg-gray-700 cursor-pointer"
        >
          <span className="sr-only">Close</span>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
