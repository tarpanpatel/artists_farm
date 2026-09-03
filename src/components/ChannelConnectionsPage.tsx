import React, { useEffect, useState } from 'react';
import { Plug, Loader2, RefreshCw, Plus, Trash2, Send } from './icons/FlowbiteIcons';
import { apiFetch, API_ROOT_BASE } from '../services/api';
import { PageHeader } from './PageHeader';
import { Button } from './Button';
import { Badge } from './Badge';
import { ChannelConnectWizard } from './ChannelConnectWizard';
import { useConfirm } from './ConfirmDialogContext';
import { useToast } from './ToastContext';
import { t } from '../i18n/en';
import { getOtaIcon } from '../utils/otaIcons';

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
      const today = new Date().toISOString().split('T')[0];
      const future = new Date();
      future.setDate(future.getDate() + 500);
      const dateTo = future.toISOString().split('T')[0];

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
      const today = new Date().toISOString().split('T')[0];
      const future = new Date();
      future.setDate(future.getDate() + 500);
      const dateTo = future.toISOString().split('T')[0];

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
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6 max-w-5xl mx-auto">
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
              Sync All ARI
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => fetchConnections(true)} disabled={refreshing} className="h-10 text-xs font-medium">
            <RefreshCw className={`w-4 h-4 me-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            {t('refresh_label', 'Refresh')}
          </Button>
          <Button variant="primary" size="sm" onClick={() => handleOpenWizard()} className="h-10 text-xs font-medium">
            <Plus className="w-4 h-4 me-1.5" />
            {t('connect_new_channel_button', 'Connect a Channel')}
          </Button>
        </div>
      </PageHeader>

      {connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-center space-y-3">
          <Plug className="w-10 h-10 text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('no_channels_connected_title', 'No channels connected yet')}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
            {t('no_channels_connected_body', 'Connect Airbnb, Booking.com, or another OTA to automatically sync availability and rates and receive bookings directly in Ground Code.')}
          </p>
          <Button variant="primary" size="sm" onClick={() => handleOpenWizard()} className="mt-2">
            <Plus className="w-4 h-4 me-1.5" />
            {t('connect_new_channel_button', 'Connect a Channel')}
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Connected Channels List */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 shadow-xs">
            {connections.map((c) => {
              const badge = STATUS_BADGE[c.status] || STATUS_BADGE.draft;
              const resumable = c.status !== 'active' && c.status !== 'staff_action_required';
              const ChannelIcon = getOtaIcon(c.channel_code);
              return (
                <div key={c.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {ChannelIcon && <ChannelIcon className="w-5 h-5 shrink-0 rounded-md" />}
                      <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.channel_code}</span>
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
                  <div className="flex items-center gap-2 shrink-0">
                    {resumable && (
                      <Button variant="secondary" size="sm" onClick={() => handleOpenWizard(c.channel_code)} className="h-9 text-xs">
                        {t('continue_setup_button', 'Continue Setup')}
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleRemoveConnection(c)}
                      disabled={removingCode === c.channel_code}
                      className="h-9 text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                      title={t('remove_connection_button', 'Remove connection')}
                    >
                      {removingCode === c.channel_code ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Individual Room Listings with Dedicated Sync Buttons */}
          {localRooms.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                    Individual Listings ({localRooms.length})
                  </h4>
                  <p className="text-2xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Sync live rates and availability to Airbnb & connected channels per individual listing.
                  </p>
                </div>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {localRooms.map((room) => {
                  const isSyncingThis = syncingRoomId === room.local_room_id;
                  return (
                    <div key={room.local_room_id || room.name} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300 text-xs font-bold shrink-0">
                          {room.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{room.name}</p>
                          <p className="text-2xs text-gray-500 dark:text-gray-400">
                            {room.channex_rate_plan_id ? 'Mapped & Active' : 'Connected to Property'}
                          </p>
                        </div>
                      </div>

                      <Button
                        variant="secondary"
                        size="xs"
                        disabled={isSyncingThis || !room.local_room_id}
                        onClick={() => handleSyncSingleRoom(room)}
                        className="text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 h-8 self-start sm:self-auto"
                        leftIcon={isSyncingThis ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      >
                        {isSyncingThis ? 'Syncing...' : 'Sync Listing'}
                      </Button>
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
