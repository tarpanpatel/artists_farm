import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from './icons/FlowbiteIcons';
import { Button } from './Button';
import { Popover } from './Popover';

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
    <div className="update-available-banner fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 bg-slate-900 dark:bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg border border-slate-700 animate-toast-in">
        <RefreshCw className="w-4 h-4 text-blue-400 shrink-0" />
        <span className="flex-1 text-xs font-semibold">A new version of the app is available.</span>
        <Button variant="primary" size="sm" onClick={() => window.location.reload()}>
                Reload
              </Button>
        <Popover
          trigger="hover"
          content={
            <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
              Dismiss
            </div>
          }
        >
          <button
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
            className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </Popover>
      </div>
    </div>
  );
};
