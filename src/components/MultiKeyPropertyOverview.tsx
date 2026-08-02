import React, { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical, Loader, AlertCircle, BarChart3, Users, DollarSign, TrendingUp, ChevronLeft } from 'lucide-react';
import { navigateToRoomHash } from '../services/api';
import { OperationalDashboard } from './OperationalDashboard';
import { GuestManagement } from './GuestManagement';

interface Room {
  id: number;
  name: string;
  slug: string;
  room_order: number;
  is_active: number;
  created_at: string;
}

interface MultiKeyProperty {
  id: number;
  tenant_id: number;
  name: string;
  slug: string;
  property_type: string;
  address: string;
  currency: string;
  timezone: string;
  is_active: number;
  created_at: string;
  room_count: number;
  rooms: Room[];
  shared_data: {
    staff?: any[];
    kitchen?: any;
  };
}

interface OverviewData {
  property_id: number;
  property_name: string;
  total_rooms: number;
  total_occupied: number;
  occupancy_rate: number;
  total_revenue: number;
  rooms: any[];
}

interface MultiKeyPropertyOverviewProps {
  propertyId: number;
  propertySlug: string;
  onNavigateToRoom: (roomSlug: string) => void;
  onBackToOverview?: () => void;
  selectedRoomSlug?: string | null;
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
  guests?: any[];
  menu?: any[];
  receipts?: any[];
  onAddGuest?: (guest: any) => void;
  onCheckoutGuest?: (guest: any) => void;
  onAddMenuItem?: (item: any) => void;
  onUpdateStock?: (item: any) => void;
  onAddInventoryItem?: (item: any) => void;
  onUpdateItemImage?: (id: number, url: string) => void;
  onDispatchTelegram?: (config: any) => void;
  activeMenuItemKey?: string;
  onSetActiveMenuItemKey?: (key: string) => void;
  isTestingMode?: boolean;
  kitchenModuleEnabled?: boolean;
}

export const MultiKeyPropertyOverview: React.FC<MultiKeyPropertyOverviewProps> = ({
  propertyId,
  propertySlug,
  onNavigateToRoom,
  onBackToOverview,
  selectedRoomSlug,
  activeTab,
  setActiveTab,
  guests = [],
  menu = [],
  receipts = [],
  onAddGuest,
  onCheckoutGuest,
  onAddMenuItem,
  onUpdateStock,
  onAddInventoryItem,
  onUpdateItemImage,
  onDispatchTelegram,
  activeMenuItemKey = '',
  onSetActiveMenuItemKey,
  isTestingMode = false,
  kitchenModuleEnabled = false,
}) => {
  const [property, setProperty] = useState<MultiKeyProperty | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [newRoom, setNewRoom] = useState({ name: '', slug: '' });
  const [addingRoom, setAddingRoom] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState<number | null>(null);
  const [draggedRoom, setDraggedRoom] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, [propertyId]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load property details
      const propRes = await fetch(`/php/api/router.php?action=get_multikey_property&property_id=${propertyId}`, {
        credentials: 'include',
      });
      const propData = await propRes.json();
      if (propData.success) {
        setProperty(propData.data);
      }

      // Load overview data
      const overviewRes = await fetch(`/php/api/router.php?action=get_multikey_overview&property_id=${propertyId}`, {
        credentials: 'include',
      });
      const overviewData = await overviewRes.json();
      if (overviewData.success) {
        setOverview(overviewData.data);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load property data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRoom = async () => {
    if (!newRoom.name || !newRoom.slug) {
      setError('Room name and slug required');
      return;
    }

    setAddingRoom(true);
    try {
      const response = await fetch('/php/api/router.php?action=add_multikey_room', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
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
    if (!window.confirm('Delete this room? Booking history will be preserved.')) return;

    setDeletingRoom(roomId);
    try {
      const response = await fetch('/php/api/router.php?action=delete_multikey_room', {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ room_id: roomId }),
      });

      const data = await response.json();
      if (data.success) {
        await loadData();
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading property...</p>
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-4" />
          <p className="text-red-600 dark:text-red-400">Property not found</p>
        </div>
      </div>
    );
  }

  // If a room is selected, show that room's dashboard/content
  if (selectedRoomSlug) {
    const selectedRoom = property.rooms.find((r: any) => r.slug === selectedRoomSlug);

    if (!selectedRoom) {
      return (
        <div className="space-y-6">
          <button
            onClick={() => onBackToOverview?.()}
            className="flex items-center gap-2 px-3 py-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Overview
          </button>
          <div className="text-center py-8">
            <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-4" />
            <p className="text-red-600 dark:text-red-400">Room not found</p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Back Button */}
        <button
          onClick={() => onBackToOverview?.()}
          className="flex items-center gap-2 px-3 py-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Overview
        </button>

        {/* Room Header */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{selectedRoom.name}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">in {property.name}</p>
        </div>

        {/* Show room's dashboard and content based on activeTab */}
        {activeTab === 'dashboard' && (
          <OperationalDashboard
            guests={guests}
            onNavigate={(tab) => setActiveTab?.(tab)}
            onOpenCheckin={() => setActiveTab?.('guests', 'guest_registration', selectedRoomSlug)}
            kitchenModuleEnabled={kitchenModuleEnabled}
          />
        )}

        {activeTab === 'guests' && (
          <GuestManagement
            guests={guests}
            receipts={receipts}
            onAddGuest={onAddGuest}
            onCheckoutGuest={onCheckoutGuest}
            activeMenuItemKey={activeMenuItemKey}
            onDispatchTelegram={onDispatchTelegram}
            menu={menu}
            isMultiKeyProperty={true}
            rooms={property.rooms}
            selectedRoomSlug={selectedRoomSlug}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{property.name}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{property.address || 'No address'}</p>
        </div>
        <button
          onClick={() => setShowAddRoomModal(true)}
          disabled={property.room_count >= 10}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Room
        </button>
      </div>

      {/* Stats */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-blue-600 dark:text-blue-400 opacity-60" />
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Total Rooms</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{overview.total_rooms}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-green-600 dark:text-green-400 opacity-60" />
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Occupied</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{overview.total_occupied}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-purple-600 dark:text-purple-400 opacity-60" />
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Occupancy</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{overview.occupancy_rate}%</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-amber-600 dark:text-amber-400 opacity-60" />
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Revenue</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{property.currency} {overview.total_revenue.toFixed(0)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rooms List */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Rooms</h2>

        {property.rooms.length === 0 ? (
          <p className="text-center text-gray-600 dark:text-gray-400 py-8">No rooms yet. Add one to get started!</p>
        ) : (
          <div className="space-y-2">
            {property.rooms.map((room) => {
              const roomData = overview?.rooms.find(r => r.id === room.id);
              const status = roomData?.occupied > 0 ? 'booked' : 'available';

              return (
                <div
                  key={room.id}
                  className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <GripVertical className="w-4 h-4 text-gray-400 dark:text-gray-500 cursor-grab" />

                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium text-gray-900 dark:text-white">{room.name}</h3>
                      <span
                        className={`px-2 py-1 text-xs font-bold rounded ${
                          status === 'booked'
                            ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300'
                            : 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300'
                        }`}
                      >
                        {status === 'booked' ? 'Booked' : 'Available'}
                      </span>
                    </div>
                    {roomData && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Revenue: {property.currency} {roomData.total_revenue.toFixed(0)}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => onNavigateToRoom?.(room.slug)}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                  >
                    Manage
                  </button>

                  <button
                    onClick={() => handleDeleteRoom(room.id)}
                    disabled={deletingRoom === room.id}
                    className="p-2 hover:bg-red-100 dark:hover:bg-red-950/30 rounded text-red-600 dark:text-red-400 transition-colors disabled:opacity-50"
                    title="Delete room"
                  >
                    {deletingRoom === room.id ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Room Modal */}
      {showAddRoomModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Add New Room</h3>

            {property.room_count >= 10 && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded">
                <p className="text-sm text-red-800 dark:text-red-300">Maximum 10 rooms allowed</p>
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Room Name *
                </label>
                <input
                  type="text"
                  value={newRoom.name}
                  onChange={(e) => {
                    setNewRoom({ ...newRoom, name: e.target.value });
                    // Auto-generate slug
                    const slug = e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-|-$/g, '');
                    setNewRoom(prev => ({ ...prev, slug }));
                  }}
                  placeholder="e.g., Suite A"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Room Slug
                </label>
                <input
                  type="text"
                  value={newRoom.slug}
                  onChange={(e) => setNewRoom({ ...newRoom, slug: e.target.value })}
                  placeholder="e.g., suite-a"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAddRoomModal(false);
                  setNewRoom({ name: '', slug: '' });
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRoom}
                disabled={addingRoom || !newRoom.name || !newRoom.slug}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {addingRoom ? (
                  <>
                    <Loader className="w-3 h-3 animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add Room'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
