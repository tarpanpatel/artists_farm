import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Loader, AlertCircle } from 'lucide-react';
import { t } from '../i18n/en';
import { Button } from './Button';
import { Input } from './Input';
import { useConfirm } from './ConfirmDialogContext';
import { apiFetch } from '../services/api';

interface Room {
  id: number;
  name: string;
  slug: string;
  room_order: number;
  is_active: number;
  created_at: string;
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
}

export const RoomsManagement: React.FC<RoomsManagementProps> = ({
  propertyId,
  propertySlug: _propertySlug,
  propertyType,
  onUpdated,
}) => {
  const [property, setProperty] = useState<Property | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [newRoom, setNewRoom] = useState({ name: '', slug: '' });
  const [addingRoom, setAddingRoom] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState<number | null>(null);
  const [slotUsage, setSlotUsage] = useState<{ total_slots: number; used_slots: number; remaining_slots: number } | null>(null);

  const { confirm } = useConfirm();

  const loadData = async () => {
    try {
      setLoading(true);
      const [propRes, overviewRes] = await Promise.all([
        apiFetch(`/php/api/router.php?action=get_multikey_property&property_id=${propertyId}`),
        apiFetch(`/php/api/router.php?action=get_multikey_overview&property_id=${propertyId}`),
      ]);

      const [propData, overviewData] = await Promise.all([propRes.json(), overviewRes.json()]);
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
    } catch (err) {
      console.error('Failed to load rooms:', err);
      setError('Failed to load rooms');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!propertyId) return;
    loadData();
  }, [propertyId]);

  const handleAddRoom = async () => {
    if (!newRoom.name || !newRoom.slug) {
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
        }),
      });

      const data = await response.json();
      if (data.success) {
        setShowAddRoomModal(false);
        setNewRoom({ name: '', slug: '' });
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
        <Loader className="w-6 h-6 animate-spin text-indigo-600 mr-2" />
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">{t('rooms_heading', 'Rooms')}</h3>
        <div className="flex items-center gap-3">
          {slotUsage && (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
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
        <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            {t('no_units_yet_description', 'No units yet. Add your first room to start taking bookings.')}
          </p>
        </div>
      )}

      {property.rooms.length === 0 ? null : (
        <div className="space-y-3">
          {property.rooms.map((room) => {
            const roomData = overview?.rooms.find(r => r.id === room.id);
            const status = roomData?.occupied > 0 ? 'booked' : 'available';

            return (
              <div
                key={room.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors border border-slate-200 dark:border-slate-600"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white text-sm mb-1 truncate">{room.name}</p>
                  <span
                    className={`inline-block px-2 py-1 text-xs font-bold rounded ${
                      status === 'booked'
                        ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300'
                        : 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300'
                    }`}
                  >
                    {status === 'booked' ? t('booked_badge', 'Booked') : t('available_badge', 'Available')}
                  </span>
                  {roomData && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      Revenue: {property.currency} {roomData.total_revenue.toFixed(0)}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => window.location.href = `#${room.slug}`}
                  >
                    {t('manage_button', 'Manage')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleDeleteRoom(room.id)}
                    disabled={deletingRoom === room.id}
                    className="text-red-600 dark:text-red-400"
                  >
                    {deletingRoom === room.id ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Room Modal */}
      {showAddRoomModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{t('add_new_room_title', 'Add New Room')}</h3>

            {property.room_count >= 10 && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded">
                <p className="text-sm text-red-800 dark:text-red-300">{t('max_rooms_allowed_message', 'Maximum 10 rooms allowed')}</p>
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
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
                  placeholder={t('room_name_placeholder', 'e.g., Suite A')}
                />
              </div>

              <div>
                <Input
                  label={t('room_slug_label', 'Room Slug')}
                  value={newRoom.slug}
                  onChange={(e) => setNewRoom({ ...newRoom, slug: e.target.value })}
                  placeholder={t('room_slug_placeholder', 'e.g., suite-a')}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setShowAddRoomModal(false);
                  setNewRoom({ name: '', slug: '' });
                }}
              >
                {t('cancel_button', 'Cancel')}
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleAddRoom}
                disabled={addingRoom || !newRoom.name || !newRoom.slug}
                leftIcon={addingRoom ? <Loader className="w-3 h-3 animate-spin" /> : undefined}
              >
                {addingRoom ? t('adding_room_button', 'Adding...') : t('add_room_button', 'Add Room')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
