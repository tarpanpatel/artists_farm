import React, { useState } from 'react';
import { RefreshCw } from './icons/FlowbiteIcons';
import { useToast } from './ToastContext';

interface SyncBookingsButtonProps {
  /** Drains the OTA feed, refetches bookings, and reports how many were pulled in. */
  onSync: () => Promise<{ pulled: number }>;
  className?: string;
}

/**
 * "Refresh" for a booking calendar - shared by the multi-room grid (TodayOverview) and the
 * single-property month grid (OperationalDashboard) so the two stay in step, the same way
 * their bar conventions do.
 *
 * Deliberately worded as a refresh rather than a "sync", because that is what it honestly is
 * most of the time: OTA bookings already arrive within seconds over the Channex webhook, with
 * a 5-minute feed drain behind it. What goes stale is the open browser tab. Telling the owner
 * it "synced" would credit it with fixing a delay that was never in the sync.
 */
export const SyncBookingsButton: React.FC<SyncBookingsButtonProps> = ({ onSync, className = '' }) => {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { pulled } = await onSync();
      showToast(
        pulled > 0
          ? `${pulled} new booking${pulled === 1 ? '' : 's'} pulled in from your channels`
          : 'Calendar is up to date',
        { type: 'success' },
      );
    } catch {
      showToast('Could not refresh the calendar. Check your connection and try again.', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      // Never natively `disabled` while idle - only while the request is genuinely in flight,
      // which is the one case CLAUDE.md's "greyed-out buttons must still be clickable" rule
      // leaves `disabled` correct for.
      disabled={busy}
      aria-label="Refresh bookings from your OTA channels"
      title="Refresh bookings from your OTA channels"
      className={`text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 font-medium rounded-lg text-xs px-2.5 py-1.5 inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:cursor-wait disabled:opacity-70 ${className}`}
    >
      <RefreshCw className={`w-3.5 h-3.5 text-blue-600 dark:text-blue-400${busy ? ' animate-spin' : ''}`} />
      <span>{busy ? 'Refreshing…' : 'Refresh'}</span>
    </button>
  );
};
