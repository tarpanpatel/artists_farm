import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch, API_ROOT_BASE } from '../services/api';
import { Button } from './Button';
import { AirbnbIcon } from './icons/AirbnbIcon';
import { CheckCircle2, AlertCircle, Download, LinkIcon, Sparkles, Loader2 } from './icons/FlowbiteIcons';
import { ChannelConnectWizard } from './ChannelConnectWizard';
import type { ChannexChannelConnection, ChannexLocalRoom } from './ChannelConnectionsPage';
import { AirbnbConfigImportDrawer } from './AirbnbConfigImportDrawer';
import { AirbnbListingPicker } from './AirbnbListingPicker';
import { useToast } from './ToastContext';
import { t } from '../i18n/en';

interface OnboardingChannelStepProps {
  propertyId: number;
  onSkip: () => void;
  onDone: () => void;
}

/**
 * "Connect Airbnb, then pull your real settings across" - unified onboarding step
 * using the shared AirbnbListingPicker for coordinate clustering, claimed listing
 * guards, and safe selected-only provisioning.
 */
export const OnboardingChannelStep: React.FC<OnboardingChannelStepProps> = ({
  propertyId,
  onSkip,
  onDone,
}) => {
  const { showToast } = useToast();
  const [connections, setConnections] = useState<ChannexChannelConnection[]>([]);
  const [localRooms, setLocalRooms] = useState<ChannexLocalRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectOpen, setConnectOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [autoProvisioning, setAutoProvisioning] = useState(false);

  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([]);
  const [airbnbConnectedFromPicker, setAirbnbConnectedFromPicker] = useState(false);

  const airbnb = connections.find((c) => c.channel_code === 'AirBNB');
  const airbnbConnected =
    airbnbConnectedFromPicker ||
    (!!airbnb && ['mapping', 'ready_to_activate', 'active', 'inactive'].includes(airbnb.status));

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
      console.warn('Failed to fetch channel connections', err);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleAutoProvision = async () => {
    if (!propertyId) return;
    if (selectedListingIds.length === 0) {
      showToast('Select at least one listing to import', { type: 'warning' });
      return;
    }
    setAutoProvisioning(true);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_auto_provision_from_airbnb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, selected_listing_ids: selectedListingIds }),
      });
      const json = await res.json();
      if (json?.status === 'success') {
        showToast(
          json?.message ||
            'Imported from Airbnb. Nothing was sent to Airbnb - the channel is not live yet.',
          { type: 'success' },
        );
        onDone();
      } else {
        showToast(json?.message || 'Failed to auto-provision from Airbnb', { type: 'error' });
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to auto-provision from Airbnb', { type: 'error' });
    } finally {
      setAutoProvisioning(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 space-y-4">
        <div className="flex items-start gap-3">
          <AirbnbIcon className="w-8 h-8 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              {t('onboarding_connect_airbnb_heading', 'Connect Airbnb and import your real settings')}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
              {t(
                'onboarding_connect_airbnb_sub',
                'Your listings already hold your photos, description, check-in times, bed layout, guests included and extra-guest charge. Connecting lets us read them directly instead of you retyping them - keeping Ground Code and Airbnb synchronized.'
              )}
            </p>
          </div>
        </div>

        {!loading && (
          <div className="space-y-3">
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
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    {t('onboarding_airbnb_connected', 'Airbnb connected')}
                  </span>
                </div>

                {/* Unified listing picker */}
                <AirbnbListingPicker
                  propertyId={propertyId}
                  selectedIds={selectedListingIds}
                  onSelectionChange={setSelectedListingIds}
                  onConnectionChange={setAirbnbConnectedFromPicker}
                />

                <Button
                  variant="primary"
                  className="w-full justify-center"
                  onClick={handleAutoProvision}
                  disabled={autoProvisioning || selectedListingIds.length === 0}
                >
                  {autoProvisioning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Importing Selected Listings...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2 text-amber-300" />
                      Import {selectedListingIds.length || ''} Selected Listing{selectedListingIds.length === 1 ? '' : 's'}
                    </>
                  )}
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-center"
                  onClick={() => setImportOpen(true)}
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  {t('onboarding_review_import', 'Review and import your listing details manually')}
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="pt-3 border-t border-gray-100 dark:border-gray-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-2xs text-gray-500 dark:text-gray-400 leading-relaxed">
            {t(
              'onboarding_skip_airbnb_note',
              'No Airbnb listing yet? Skip this - you can set everything up by hand and connect later. Anything you configure here is what gets published to your channels once you do connect.'
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
        onImported={() => { void fetchConnections(); }}
      />
    </div>
  );
};
