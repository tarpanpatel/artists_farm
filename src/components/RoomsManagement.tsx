import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, AlertCircle, Pencil, Check, X, Sparkles } from './icons/FlowbiteIcons';
import { Drawer, Alert } from 'flowbite-react';
import { t } from '../i18n/en';
import { Button } from './Button';
import { Input } from './Input';
import { useConfirm } from './ConfirmDialogContext';
import { useToast } from './ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../services/api';

interface Room {
  id: number;
  name: string;
  slug: string;
  room_order: number;
  is_active: number;
  created_at: string;
  default_tariff: number | null;
  checkin_time?: string | null;
  checkout_time?: string | null;
}

interface Property {
  id: number;
  tenant_id: number;
  name: string;
  slug: string;
  property_type: string;
  room_count: number;
  rooms: Room[];
  currency?: string;
}

interface OverviewData {
  total_rooms: number;
  total_occupied: number;
  total_revenue: number;
  rooms: any[];
}

interface RoomsManagementProps {
  propertyId: number;
  propertySlug: string;
  propertyType?: string;
  onUpdated?: () => void;
  // "Manage" navigates straight into that room's own Edit Property form (name/
  // tariff/checkin/checkout - see the 'edit_property' initialTab below), using
  // the same direct-state-update callback every other room-navigation entry
  // point in the app already uses (App.tsx's handleNavigateToRoom), rather
  // than only setting window.location.hash and hoping the hashchange
  // listener's own room-slug lookup (a separately-fetched room list) matches.
  onNavigateToRoom?: (roomSlug: string, initialTab?: string) => void;
}

export const RoomsManagement: React.FC<RoomsManagementProps> = ({
  propertyId,
  propertySlug: _propertySlug,
  propertyType,
  onUpdated,
  onNavigateToRoom,
}) => {
  const { showToast } = useToast();
  const [property, setProperty] = useState<Property | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [newRoom, setNewRoom] = useState({ name: '', slug: '', default_tariff: '' });
  const [roomNameTouched, setRoomNameTouched] = useState(false);
  const [addingRoom, setAddingRoom] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState<number | null>(null);
  const [slotUsage, setSlotUsage] = useState<{ total_slots: number; used_slots: number; remaining_slots: number } | null>(null);
  // Inline tariff edit - a room row's tariff can be edited in place, no
  // separate "edit room" screen exists for anything else on this page yet.
  const [editingTariffRoomId, setEditingTariffRoomId] = useState<number | null>(null);
  const [tariffDraft, setTariffDraft] = useState('');
  const [savingTariff, setSavingTariff] = useState(false);
  const [housekeepingStatuses, setHousekeepingStatuses] = useState<Record<number, string>>({});
  const [markingReadyRoomId, setMarkingReadyRoomId] = useState<number | null>(null);

  const { isAuthenticated, authChecked, currentUser } = useAuth();
  const { confirm } = useConfirm();

  const loadData = async () => {
    try {
      setLoading(true);
      const [propRes, overviewRes, housekeepingRes] = await Promise.all([
        apiFetch(`/php/api/router.php?action=get_multikey_property&property_id=${propertyId}`),
        apiFetch(`/php/api/router.php?action=get_multikey_overview&property_id=${propertyId}`),
        apiFetch(`/php/api/router.php?action=get_housekeeping_statuses&property_id=${propertyId}`),
      ]);

      const [propData, overviewData, housekeepingData] = await Promise.all([propRes.json(), overviewRes.json(), housekeepingRes.json()]);
      if (propData.success) {
        setProperty(propData.data);
        if (propData.data.tenant_id) {
          apiFetch(`/php/api/router.php?action=get_tenant_slot_usage&tenant_id=${propData.data.tenant_id}`)
            .then(r => r.json())
            .then(slotData => { if (slotData.success) setSlotUsage(slotData.data); })
            .catch(() => {});
        }
      }
      if (overviewData.success) {
        setOverview(overviewData.data);
      }
      if (housekeepingData.success) {
        setHousekeepingStatuses(housekeepingData.data || {});
      }
    } catch (err) {
      console.error('Failed to load rooms:', err);
      setError('Failed to load rooms');
    } finally {
      setLoading(false);
    }
  };

  // Shared with the Telegram "Mark Room Ready" button (webhook_handler.php ->
  // markRoomReady() in housekeeping.php) - this is just the app-side entry
  // point into the same function.
  const handleMarkRoomReady = async (roomId: number) => {
    setMarkingReadyRoomId(roomId);
    try {
      const response = await apiFetch('/php/api/router.php?action=set_room_ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, staff_name: currentUser?.name || currentUser?.username || 'Staff' }),
      });
      const data = await response.json();
      if (data.status === 'success') {
        setHousekeepingStatuses((prev) => ({ ...prev, [roomId]: 'Ready' }));
        showToast(t('room_marked_ready_toast', 'Room marked ready'), { type: 'success' });
      } else {
        showToast(data.message || t('room_marked_ready_failed_toast', 'Failed to update room'), { type: 'error' });
      }
    } catch (err) {
      console.error('Failed to mark room ready:', err);
      showToast(t('room_marked_ready_failed_toast', 'Failed to update room'), { type: 'error' });
    } finally {
      setMarkingReadyRoomId(null);
    }
  };

  useEffect(() => {
    if (!authChecked || !isAuthenticated || !propertyId) return;
    loadData();
  }, [isAuthenticated, authChecked, propertyId]);

  const handleAddRoom = async () => {
    if (!newRoom.name || !newRoom.slug) {
      setRoomNameTouched(true);
      setError('Room name and slug required');
      return;
    }

    setAddingRoom(true);
    try {
      const response = await apiFetch('/php/api/router.php?action=add_multikey_room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_property_id: propertyId,
          room_name: newRoom.name,
          room_slug: newRoom.slug,
          default_tariff: newRoom.default_tariff,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setShowAddRoomModal(false);
        setNewRoom({ name: '', slug: '', default_tariff: '' });
        setRoomNameTouched(false);
        await loadData();
        onUpdated?.();
      } else {
        setError(data.message || 'Failed to add room');
      }
    } catch (err) {
      console.error('Failed to add room:', err);
      setError('Failed to add room');
    } finally {
      setAddingRoom(false);
    }
  };

  const handleStartEditTariff = (room: Room) => {
    setEditingTariffRoomId(room.id);
    setTariffDraft(room.default_tariff != null ? String(room.default_tariff) : '');
  };

  const handleSaveTariff = async (roomId: number) => {
    setSavingTariff(true);
    try {
      const response = await apiFetch('/php/api/router.php?action=update_room_tariff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, default_tariff: tariffDraft }),
      });
      const data = await response.json();
      if (data.success) {
        setEditingTariffRoomId(null);
        showToast('Room tariff saved successfully!', { type: 'success' });
        await loadData();
        onUpdated?.();
      } else {
        const msg = data.message || 'Failed to update tariff';
        setError(msg);
        showToast(msg, { type: 'error' });
      }
    } catch (err) {
      console.error('Failed to update tariff:', err);
      const msg = 'Failed to update tariff';
      setError(msg);
      showToast(msg, { type: 'error' });
    } finally {
      setSavingTariff(false);
    }
  };

  const handleDeleteRoom = async (roomId: number) => {
    const confirmed = await confirm({
      title: t('delete_room_confirm_title', 'Delete Room'),
      message: t('delete_room_confirm_message', 'Delete this room? All present and future bookings associated with this room will be deleted. Past bookings and their billing records will stay intact.'),
      confirmText: t('delete_room_confirm_button', 'Delete Room'),
      variant: 'danger',
    });
    if (!confirmed) return;

    setDeletingRoom(roomId);
    try {
      const response = await apiFetch('/php/api/router.php?action=delete_multikey_room', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId }),
      });

      const data = await response.json();
      if (data.success) {
        await loadData();
        onUpdated?.();
      } else {
        setError(data.message || 'Failed to delete room');
      }
    } catch (err) {
      console.error('Failed to delete room:', err);
      setError('Failed to delete room');
    } finally {
      setDeletingRoom(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mr-2" />
        <p className="text-sm text-slate-500">{t('loading_rooms_label', 'Loading rooms...')}</p>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="text-center py-8 text-slate-500 text-sm">{error || t('property_not_found_label', 'Property not found')}</div>
    );
  }

  const isMultiKey = propertyType === 'MULTI_KEY' || property.property_type === 'MULTI_KEY';

  if (!isMultiKey) {
    return null;
  }

  return (
    <div className="rooms-management space-y-4">
      <div className="rooms-management__header flex items-center justify-between">
        <h3 className="rooms-management__subtitle text-base font-semibold text-slate-900 dark:text-white">{t('rooms_heading', 'Rooms')}</h3>
        <div className="flex items-center gap-3">
          {slotUsage && (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              slotUsage.remaining_slots <= 0
                ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
            }`}>
              {slotUsage.used_slots} of {slotUsage.total_slots} units used
            </span>
          )}
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => setShowAddRoomModal(true)}
            disabled={property.room_count >= 10 || (!!slotUsage && slotUsage.remaining_slots <= 0)}
          >
            {t('add_new_unit_button', 'Add New Unit')}
          </Button>
        </div>
      </div>

      {property.rooms.length === 0 && (
        <Alert color="warning" icon={AlertCircle} className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300">
          <p className="text-xs">
            {t('no_units_yet_description', 'No units yet. Add your first room to start taking bookings.')}
          </p>
        </Alert>
      )}

      {property.rooms.length === 0 ? null : (
        <div className="rooms-management__list space-y-3">
          {property.rooms.map((room) => {
            const roomData = overview?.rooms.find(r => r.id === room.id);
            const status = roomData?.occupied > 0 ? 'booked' : 'available';

            return (
              <div
                key={room.id}
                className="rooms-management__room-item p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors border border-slate-200 dark:border-slate-600 space-y-2.5"
              >
                {/* Top Row: Room Name + Status Badge on Left, Action Buttons on Right */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">{room.name}</p>
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-semibold rounded shrink-0 ${
                        status === 'booked'
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300'
                          : 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300'
                      }`}
                    >
                      {status === 'booked' ? t('booked_badge', 'Booked') : t('available_badge', 'Available')}
                    </span>
                    {housekeepingStatuses[room.id] === 'Dirty' && (
                      <button
                        type="button"
                        onClick={() => handleMarkRoomReady(room.id)}
                        disabled={markingReadyRoomId === room.id}
                        title={t('mark_room_ready_tooltip', 'Tap once cleaned to mark it ready')}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded shrink-0 bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors cursor-pointer disabled:opacity-60"
                      >
                        {markingReadyRoomId === room.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        <span>{t('needs_cleaning_badge', 'Needs Cleaning')}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => {
                        if (onNavigateToRoom) {
                          onNavigateToRoom(room.slug, 'edit_property');
                        } else {
                          window.location.href = `#${room.slug}/edit_property`;
                        }
                      }}
                    >
                      {t('manage_button', 'Manage')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleDeleteRoom(room.id)}
                      disabled={deletingRoom === room.id}
                      className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 p-1.5"
                      title={t('delete_room_button', 'Delete Unit')}
                    >
                      {deletingRoom === room.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Bottom Row: Revenue and Default Tariff side-by-side horizontally */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-600/60 text-xs text-slate-600 dark:text-slate-400">
                  <div>
                    {roomData ? (
                      <span>Revenue: <strong className="font-semibold text-slate-900 dark:text-slate-200">{property.currency || '₹'} {roomData.total_revenue.toFixed(0)}</strong></span>
                    ) : (
                      <span>Revenue: <strong className="font-semibold text-slate-900 dark:text-slate-200">{property.currency || '₹'} 0</strong></span>
                    )}
                  </div>

                  <div>
                    {editingTariffRoomId === room.id ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          value={tariffDraft}
                          onChange={(e) => setTariffDraft(e.target.value)}
                          placeholder={t('default_tariff_placeholder', 'e.g. 2000')}
                          className="!h-7 !py-0.5 w-24 text-xs"
                          autoFocus
                        />
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleSaveTariff(room.id)}
                          disabled={savingTariff}
                          className="text-emerald-600 dark:text-emerald-400 p-1"
                          title={t('save_tooltip', 'Save')}
                        >
                          {savingTariff ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setEditingTariffRoomId(null)}
                          disabled={savingTariff}
                          className="text-slate-400 p-1"
                          title={t('cancel_button', 'Cancel')}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleStartEditTariff(room)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                      >
                        <Pencil className="w-3 h-3 text-slate-400 hover:text-blue-600" />
                        <span>
                          {room.default_tariff != null
                            ? t('default_tariff_display', 'Default Tariff: {{currency}} {{amount}}/night')
                                .replace('{{currency}}', property.currency || '₹')
                                .replace('{{amount}}', room.default_tariff.toFixed(0))
                            : t('set_default_tariff_label', 'Set Default Tariff')}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Room Drawer */}
      <Drawer
        open={showAddRoomModal}
        onClose={() => {
          if (!addingRoom) {
            setShowAddRoomModal(false);
            setNewRoom({ name: '', slug: '', default_tariff: '' });
        setRoomNameTouched(false);
          }
        }}
        position="right"
        className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between rooms-management__modal"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <Plus className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white m-0">
              {t('add_new_room_title', 'Add New Room')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!addingRoom) {
                setShowAddRoomModal(false);
                setNewRoom({ name: '', slug: '', default_tariff: '' });
        setRoomNameTouched(false);
              }
            }}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {property.room_count >= 10 && (
            <Alert color="failure" className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300">
              <p className="text-sm">{t('max_rooms_allowed_message', 'Maximum 10 rooms allowed')}</p>
            </Alert>
          )}

          <Input
            label={t('room_name_label', 'Room Name *')}
            value={newRoom.name}
            onChange={(e) => {
              const slug = e.target.value
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
              setNewRoom({ ...newRoom, name: e.target.value, slug });
            }}
            onBlur={() => setRoomNameTouched(true)}
            error={roomNameTouched && !newRoom.name.trim() ? 'This field is required' : undefined}
            placeholder={t('room_name_placeholder', 'e.g., Suite A')}
          />

          <Input
            label={t('room_slug_label', 'Room Slug')}
            value={newRoom.slug}
            onChange={(e) => setNewRoom({ ...newRoom, slug: e.target.value })}
            placeholder={t('room_slug_placeholder', 'e.g., suite-a')}
          />

          <Input
            label={t('default_tariff_label', 'Default Tariff / Night (₹, optional)')}
            type="number"
            value={newRoom.default_tariff}
            onChange={(e) => setNewRoom({ ...newRoom, default_tariff: e.target.value })}
            placeholder={t('default_tariff_placeholder', 'e.g. 2000')}
          />
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setShowAddRoomModal(false);
              setNewRoom({ name: '', slug: '', default_tariff: '' });
        setRoomNameTouched(false);
            }}
            disabled={addingRoom}
          >
            {t('cancel', 'Cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleAddRoom}
            disabled={addingRoom || !newRoom.name || !newRoom.slug}
            leftIcon={addingRoom ? <Loader2 className="w-3 h-3 animate-spin" /> : undefined}
          >
            {addingRoom ? t('adding_room_button', 'Adding...') : t('add_room_button', 'Add Room')}
          </Button>
        </div>
      </Drawer>
    </div>
  );
};
