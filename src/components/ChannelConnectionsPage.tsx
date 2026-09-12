import React, { useEffect, useState } from 'react';
import { Plug, Loader2, RefreshCw, Plus, Trash2, Send, Sparkles } from './icons/FlowbiteIcons';
import { apiFetch, API_ROOT_BASE } from '../services/api';
import { getTodayKey, getDateKeyOffsetFromToday } from '../utils/dateUtils';
import { PageHeader } from './PageHeader';
import { Button } from './Button';
import { Badge } from './Badge';
import { ChannelConnectWizard } from './ChannelConnectWizard';
import { AirbnbConfigImportDrawer } from './AirbnbConfigImportDrawer';
import { useConfirm } from './ConfirmDialogContext';
import { useToast } from './ToastContext';
import { t } from '../i18n/en';
import { getOtaIcon, formatOtaLabel } from '../utils/otaIcons';
import { Popover } from './Popover';

interface ChannelConnectionsPageProps {
  propertyId: number;
  onLogAudit?: (actionText: string, extra?: { status?: string; module?: string; user?: string }) => void;
}

export interface ChannexChannelConnection {
  id: number;
  property_id: number;
  channel_code: string;
  channex_channel_id: string | null;
  status: 'draft' | 'awaiting_prerequisite' | 'pending_test' | 'mapping' | 'ready_to_activate' | 'active' | 'staff_action_required' | 'inactive' | 'error';
  settings: Record<string, any> | null;
  last_error: string | null;
  updated_at: string;
}

const STATUS_BADGE: Record<string, { variant: 'success' | 'danger' | 'warning' | 'info' | 'neutral'; label: string }> = {
  draft: { variant: 'neutral', label: 'Draft' },
  awaiting_prerequisite: { variant: 'warning', label: 'Waiting on you' },
  pending_test: { variant: 'info', label: 'Testing...' },
  mapping: { variant: 'info', label: 'Needs room mapping' },
  ready_to_activate: { variant: 'warning', label: 'Ready to activate' },
  active: { variant: 'success', label: 'Live' },
  staff_action_required: { variant: 'warning', label: 'Our team is finishing this' },
  inactive: { variant: 'neutral', label: 'Paused' },
  error: { variant: 'danger', label: 'Needs attention' },
};

export interface ChannexLocalRoom {
  local_room_id: number | null;
  name: string;
  channex_rate_plan_id: string | null;
  // 12 Sep 2026: needed to tell "this unit has no price" apart from "content was never
  // synced" - the two produce the identical symptom (no rate plan) but need opposite
  // advice, and the mapping step was confidently giving the wrong one.
  default_tariff?: number | null;
}

export const ChannelConnectionsPage: React.FC<ChannelConnectionsPageProps> = ({ propertyId, onLogAudit }) => {
  const [connections, setConnections] = useState<ChannexChannelConnection[]>([]);
  const [localRooms, setLocalRooms] = useState<ChannexLocalRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isSyncingAri, setIsSyncingAri] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [resumeChannelCode, setResumeChannelCode] = useState<string | null>(null);
  const [removingCode, setRemovingCode] = useState<string | null>(null);
  // "Push Rates"/"Push All Rates" above are outbound-only (rates &
  // availability TO Airbnb) - this is the separate inbound direction
  // (descriptions, amenities, house rules FROM Airbnb), previously only
  // reachable from Edit Property. Added here too (7 Sep 2026, explicit
  // report: a user on this exact page went looking for it and only found
  // the outbound sync button).
  const [showImporterModal, setShowImporterModal] = useState(false);
  // Set only when a specific listing's own "Import from Airbnb" button
  // (below, in the Individual Listings list) opened the drawer, scoping it
  // to that one room instead of the whole property (7 Sep 2026, explicit
  // request: "in front of individual listing give option to individual
  // import from airbnb"). Reset to null on close so the page-level button
  // above always reopens the full, unscoped drawer.
  const [importFocusRoomId, setImportFocusRoomId] = useState<number | null>(null);
  const { confirm } = useConfirm();
  const { showToast } = useToast();

  const fetchConnections = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
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
      console.error('Failed to load channel connections:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (propertyId) fetchConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const handleSyncAllAri = async () => {
    const confirmed = await confirm({
      title: 'Sync All Rates & Availability to OTAs?',
      message: 'This immediately transmits your current PMS room base rates and availability for the next 500 days to Airbnb, Booking.com, and Channex.',
      confirmText: 'Sync Now',
      variant: 'warning',
    });
    if (!confirmed) return;

    setIsSyncingAri(true);
    try {
      const today = getTodayKey();
      const dateTo = getDateKeyOffsetFromToday(500);

      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_push_ari`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_from: today, date_to: dateTo }),
      });
      const json = await res.json();
      if (json && json.status === 'success') {
        showToast('Rates & availability successfully pushed to Airbnb & connected channels!', { type: 'success' });
        onLogAudit?.('Manual ARI full sync pushed to connected channels', { module: 'ChannelConnectionsPage', status: 'SUCCESS' });
        fetchConnections(true);
      } else {
        showToast(json?.message || 'Failed to sync with channels', { type: 'error' });
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to sync with channels', { type: 'error' });
    } finally {
      setIsSyncingAri(false);
    }
  };

  const handleOpenWizard = (resumeCode?: string) => {
    setResumeChannelCode(resumeCode || null);
    setWizardOpen(true);
  };

  const handleWizardClosed = (didConnect: boolean) => {
    setWizardOpen(false);
    setResumeChannelCode(null);
    if (didConnect) {
      fetchConnections();
    }
  };

  const [syncingRoomId, setSyncingRoomId] = useState<number | null>(null);

  const handleSyncSingleRoom = async (room: ChannexLocalRoom) => {
    if (!room.local_room_id) return;
    setSyncingRoomId(room.local_room_id);
    try {
      const today = getTodayKey();
      const dateTo = getDateKeyOffsetFromToday(500);

      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_push_ari`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: room.local_room_id, date_from: today, date_to: dateTo }),
      });
      const data = await res.json();
      if (data.status === 'success' || data.success) {
        showToast(`Pushed ${room.name} rates & availability to Airbnb & connected channels successfully!`, { type: 'success' });
        onLogAudit?.(`Manual ARI sync pushed for ${room.name}`, { module: 'ChannelConnectionsPage', status: 'SUCCESS' });
      } else {
        showToast(data.message || `Failed to push ${room.name} to channels`, { type: 'error' });
      }
    } catch (err: any) {
      showToast(err?.message || `Failed to push ${room.name} to channels`, { type: 'error' });
    } finally {
      setSyncingRoomId(null);
    }
  };

  const handleRemoveConnection = async (c: ChannexChannelConnection) => {
    const isLive = c.status === 'active';
    const confirmed = await confirm({
      title: isLive ? 'Remove Live Channel' : 'Remove Connection',
      message: isLive
        ? `${c.channel_code} is currently live and syncing bookings. Removing it disconnects it from Channex - existing bookings already received are not affected, but this channel will stop syncing.`
        : `Remove this ${c.channel_code} connection? Any setup progress (settings, room mapping) will be lost and you'll start over if you reconnect.`,
      confirmText: 'Remove',
      variant: 'danger',
    });
    if (!confirmed) return;
    setRemovingCode(c.channel_code);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=channex_channel_delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, channel_code: c.channel_code }),
      });
      const json = await res.json();
      if (json?.status !== 'success') {
        showToast(json?.message || 'Failed to remove the connection', { type: 'error' });
        return;
      }
      onLogAudit?.(`Removed ${c.channel_code} channel connection`, { module: 'ChannelConnectWizard', status: 'SUCCESS' });
      fetchConnections();
    } catch (err: any) {
      showToast(err?.message || 'Failed to remove the connection', { type: 'error' });
    } finally {
      setRemovingCode(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin dark:text-blue-400" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('loading_channels_label', 'Loading channel connections...')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title={t('connect_channels_heading', 'Connect Channels')}
        subtitle={t('connect_channels_subheading', 'Connect your Airbnb, Booking.com, and other OTA listings directly to this property.')}
      >
        <div className="flex flex-wrap items-center gap-2">
          {connections.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSyncAllAri}
              disabled={isSyncingAri}
              className="h-10 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700"
            >
              {isSyncingAri ? (
                <Loader2 className="w-4 h-4 me-1.5 animate-spin" />
              ) : (
                <Send className="w-4 h-4 me-1.5" />
              )}
              Push All Rates
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => fetchConnections(true)} disabled={refreshing} className="h-10 text-xs font-medium">
            <RefreshCw className={`w-4 h-4 me-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            {t('refresh_label', 'Refresh')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowImporterModal(true)} className="h-10 text-xs font-medium">
            <Sparkles className="w-4 h-4 me-1.5 text-amber-500" />
            {t('import_from_airbnb_button', 'Import from Airbnb')}
          </Button>
          <Button variant="primary" size="sm" onClick={() => handleOpenWizard()} className="h-10 text-xs font-medium">
            <Plus className="w-4 h-4 me-1.5" />
            {t('connect_new_channel_button', 'Connect a Channel')}
          </Button>
        </div>
      </PageHeader>

      <AirbnbConfigImportDrawer
        isOpen={showImporterModal}
        onClose={() => {
          setShowImporterModal(false);
          setImportFocusRoomId(null);
        }}
        propertyId={propertyId}
        focusRoomId={importFocusRoomId ?? undefined}
        onImported={() => fetchConnections(true)}
      />

      {connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center space-y-3 shadow-sm">
          <Plug className="w-10 h-10 text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('no_channels_connected_title', 'No channels connected yet')}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
            {t('no_channels_connected_body', 'Connect Airbnb, Booking.com, or another OTA to automatically sync availability and rates and receive bookings directly in Ground Code.')}
          </p>
          <Button variant="primary" size="sm" onClick={() => handleOpenWizard()} className="mt-2 h-10 text-xs font-medium">
            <Plus className="w-4 h-4 me-1.5" />
            {t('connect_new_channel_button', 'Connect a Channel')}
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section: Connected Channels - White block for each channel */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Connected Channels ({connections.length})
              </h3>
            </div>

            <div className="space-y-3">
              {connections.map((c) => {
                const badge = STATUS_BADGE[c.status] || STATUS_BADGE.draft;
                const resumable = c.status !== 'active' && c.status !== 'staff_action_required';
                const ChannelIcon = getOtaIcon(c.channel_code);
                const channelName = formatOtaLabel(c.channel_code) || c.channel_code;

                return (
                  <div
                    key={c.id}
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 flex items-center justify-center shrink-0">
                        {ChannelIcon ? (
                          <ChannelIcon className="w-6 h-6 shrink-0 rounded-[2px]" />
                        ) : (
                          <Plug className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {channelName}
                          </span>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </div>
                        {c.status === 'error' && c.last_error && c.last_error !== 'null' && c.last_error.trim() !== '' && (
                          <p className="text-2xs text-red-600 dark:text-red-400 mt-1 truncate">{c.last_error}</p>
                        )}
                        {c.status === 'staff_action_required' && (
                          <p className="text-2xs text-gray-500 dark:text-gray-400 mt-1">
                            {t('airbnb_staff_pending_note', "Our team will finish connecting your Airbnb account and let you know once it's live.")}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                      {resumable && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenWizard(c.channel_code)}
                          className="h-8 text-xs font-medium"
                        >
                          {t('continue_setup_button', 'Continue Setup')}
                        </Button>
                      )}
                      <Popover
                        trigger="hover"
                        content={
                          <div className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300">
                            {t('remove_connection_button', 'Remove connection')}
                          </div>
                        }
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveConnection(c)}
                          disabled={removingCode === c.channel_code}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                        >
                          {removingCode === c.channel_code ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                          )}
                        </Button>
                      </Popover>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section: Individual Room Listings - White block for each listing */}
          {localRooms.length > 0 && (
            <div className="space-y-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Individual Listings ({localRooms.length})
                </h3>
                <p className="text-2xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Sync live rates and availability to Airbnb & connected channels per individual listing.
                </p>
              </div>

              <div className="space-y-3">
                {localRooms.map((room) => {
                  const isSyncingThis = syncingRoomId === room.local_room_id;
                  // A rate plan id only means "content sync created a rate plan for this
                  // unit" - it says NOTHING about whether any channel is actually live.
                  // This badge used to read `channex_rate_plan_id ? 'Mapped & Active'`, so
                  // every listing showed a green "Active" from the moment of import, while
                  // the channel above it correctly said "Ready to activate" and was pushing
                  // absolutely nothing (found 11 Sep 2026 on Patel Colony: 7 green "Mapped &
                  // Active" listings under a channel that had never been activated).
                  // An import deliberately never activates (CHANNEX.md 5.4a), so that state
                  // is the NORMAL post-import one - which is exactly why it must not be
                  // painted as success. Derived from the connections above, not assumed.
                  const liveChannelCount = connections.filter((c) => c.status === 'active').length;
                  const isMapped = !!room.channex_rate_plan_id;
                  const isLive = isMapped && liveChannelCount > 0;
                  return (
                    <div
                      key={room.local_room_id || room.name}
                      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900/60 flex items-center justify-center text-blue-700 dark:text-blue-300 text-xs font-bold shrink-0">
                          {room.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{room.name}</p>
                            <Badge variant={isLive ? 'success' : isMapped ? 'warning' : 'neutral'}>
                              {isLive
                                ? `Live on ${liveChannelCount} channel${liveChannelCount === 1 ? '' : 's'}`
                                : isMapped
                                  ? 'Mapped - not live yet'
                                  : 'Connected to Property'}
                            </Badge>
                          </div>
                          <p className="text-2xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {!isMapped
                              ? 'Sync live rates and availability'
                              : isLive
                                ? `Rate Plan ID: ${room.channex_rate_plan_id}`
                                : 'Rates and availability are not being sent yet - activate a channel above to go live.'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!room.local_room_id}
                          onClick={() => {
                            setImportFocusRoomId(room.local_room_id);
                            setShowImporterModal(true);
                          }}
                          className="h-8 text-xs font-medium"
                          leftIcon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />}
                        >
                          Import
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isSyncingThis || !room.local_room_id}
                          onClick={() => handleSyncSingleRoom(room)}
                          className="text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 h-8 text-xs font-medium"
                          leftIcon={isSyncingThis ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        >
                          {isSyncingThis ? 'Pushing...' : 'Push Rates'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <ChannelConnectWizard
        isOpen={wizardOpen}
        propertyId={propertyId}
        resumeChannelCode={resumeChannelCode}
        existingConnections={connections}
        localRooms={localRooms}
        onClose={() => handleWizardClosed(false)}
        onConnected={(channelCode) => {
          onLogAudit?.(`Connected ${channelCode} via the self-serve channel wizard`, { module: 'ChannelConnectWizard', status: 'SUCCESS' });
          handleWizardClosed(true);
        }}
      />
    </div>
  );
};
