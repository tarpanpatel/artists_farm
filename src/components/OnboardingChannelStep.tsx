import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch, API_ROOT_BASE } from '../services/api';
import { Button } from './Button';
import { AirbnbIcon } from './icons/AirbnbIcon';
import { CheckCircle2, AlertCircle, Download, LinkIcon } from './icons/FlowbiteIcons';
import { ChannelConnectWizard } from './ChannelConnectWizard';
import type { ChannexChannelConnection, ChannexLocalRoom } from './ChannelConnectionsPage';
import { AirbnbConfigImportDrawer } from './AirbnbConfigImportDrawer';
import { t } from '../i18n/en';

interface OnboardingChannelStepProps {
  propertyId: number;
  onSkip: () => void;
  onDone: () => void;
}

/**
 * "Connect Airbnb, then pull your real settings across" - the onboarding step
 * that exists so a new property is configured from the owner's OTA account
 * rather than retyped and quietly diverging from it (6 Sep 2026).
 *
 * Why this sits AFTER the property is created rather than before: every channel
 * endpoint is addressed by property id, and a Channex channel attaches to a
 * property that already has room types. Registration creates the property and
 * logs the owner in, so by the time this renders there is a real id to connect.
 *
 * Why the wizard survives the Airbnb authorization at all: ChannelConnectWizard
 * opens Channex's connection link with window.open(..., '_blank'), so Airbnb's
 * sign-in happens in a separate popup and THIS page never unmounts. The landing
 * page Channex redirects that popup to tells the owner to close it and come
 * back here - there is no navigation away, so no wizard state to persist.
 *
 * Skipping is a first-class outcome, not a failure: a property with no OTA
 * listing yet (or one only on Booking.com) still has to be able to finish
 * onboarding. That is the "manual" half of the two paths.
 */
export const OnboardingChannelStep: React.FC<OnboardingChannelStepProps> = ({
  propertyId,
  onSkip,
  onDone,
}) => {
  const [connections, setConnections] = useState<ChannexChannelConnection[]>([]);
  const [localRooms, setLocalRooms] = useState<ChannexLocalRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectOpen, setConnectOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [imported, setImported] = useState(false);

  const airbnb = connections.find((c) => c.channel_code === 'AirBNB');
  // "mapping" onwards means the OAuth actually completed - the channel object
  // exists on Channex's side. Anything earlier is a half-finished attempt.
  const airbnbConnected = !!airbnb && ['mapping', 'ready_to_activate', 'active', 'inactive'].includes(airbnb.status);

  const fetchConnections = useCallback(async () => {
    if (!propertyId) return;
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_connection_status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId }),
      });
      const json = await res.json();
      if (json?.status === 'success') {
        setConnections(json.data?.connections || []);
        setLocalRooms(json.data?.local_rooms || []);
      }
    } catch (err) {
      // A failed status read must not strand someone mid-signup - the skip path
      // below stays available whatever happens here.
      console.error('Failed to load channel connections during onboarding:', err);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { void fetchConnections(); }, [fetchConnections]);

  // The owner authorises Airbnb in a popup, so nothing in this tab tells us when
  // they are done. Re-check when the tab regains focus - that is exactly the
  // moment they have closed the popup and come back.
  useEffect(() => {
    const onFocus = () => { void fetchConnections(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchConnections]);

  return (
    <div className="space-y-4">
      <div className="p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-start gap-3">
          <AirbnbIcon className="w-8 h-8 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              {t('onboarding_connect_airbnb_heading', 'Connect Airbnb and import your real settings')}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
              {t(
                'onboarding_connect_airbnb_sub',
                'Your listings already hold your photos, description, check-in times, bed layout, guests included and extra-guest charge. Connecting lets us read them directly instead of you retyping them - which is also what keeps Ground Code and Airbnb from drifting apart later.'
              )}
            </p>
          </div>
        </div>

        {!loading && (
          <div className="mt-4 space-y-3">
            {!airbnbConnected ? (
              <>
                <Button variant="primary" className="w-full" onClick={() => setConnectOpen(true)}>
                  <LinkIcon className="w-4 h-4 mr-2" />
                  {t('onboarding_connect_airbnb_btn', 'Connect Airbnb')}
                </Button>
                <p className="text-2xs text-gray-500 dark:text-gray-400 text-center">
                  {t('onboarding_connect_airbnb_popup_note', 'Airbnb opens in a new window. This page stays open - come back once you have allowed access.')}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    {t('onboarding_airbnb_connected', 'Airbnb connected')}
                  </span>
                </div>
                <Button
                  variant={imported ? 'secondary' : 'primary'}
                  className="w-full"
                  onClick={() => setImportOpen(true)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  {imported
                    ? t('onboarding_review_import_again', 'Review imported details again')
                    : t('onboarding_review_import', 'Review and import your listing details')}
                </Button>
              </>
            )}
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-2xs text-gray-500 dark:text-gray-400 leading-relaxed">
            {t(
              'onboarding_skip_airbnb_note',
              'No Airbnb listing yet? Skip this - you can set everything up by hand and connect later. Just be aware that anything you type here is what gets published to your channels once you do connect.'
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button variant="secondary" className="w-full sm:w-auto" onClick={onSkip}>
          {t('onboarding_skip_channels', 'Skip for now')}
        </Button>
        <Button variant="primary" className="w-full" onClick={onDone}>
          {t('onboarding_channels_continue', 'Continue')}
        </Button>
      </div>

      <ChannelConnectWizard
        isOpen={connectOpen}
        propertyId={propertyId}
        existingConnections={connections}
        localRooms={localRooms}
        onClose={() => { setConnectOpen(false); void fetchConnections(); }}
        onConnected={() => { setConnectOpen(false); void fetchConnections(); }}
      />

      <AirbnbConfigImportDrawer
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        propertyId={propertyId}
        onImported={() => { setImported(true); void fetchConnections(); }}
      />
    </div>
  );
};
