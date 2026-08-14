import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle, Users, TrendingUp, BarChart3, DollarSign } from 'lucide-react';
import { apiFetch } from '../services/api';
import { t } from '../i18n/en';
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
  phone?: string;
  google_maps_link?: string;
  whatsapp_voucher_template?: string;
  gstin?: string;
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
  onUpdateBooking?: (guest: any) => Promise<void>;
  onDeleteBooking?: (guestId: string) => Promise<void>;
  onGuestVerificationUpdated?: (guestId: string) => void;
  onCFormFiledUpdated?: (guestId: string, filedAt: string | null) => void;
  onGuestCheckedIn?: (guestId: string) => void;
  onAddMenuItem?: (item: any) => void;
  onUpdateStock?: (itemId: string, newStock: number) => void;
  onAddInventoryItem?: (item: any) => void;
  onUpdateItemImage?: (itemId: string, imagePath: string) => void;
  onDispatchTelegram?: (eventType: string, message: string, category?: 'all' | 'kitchen' | 'finance' | 'admin', replyMarkup?: any, templateKey?: string) => void;
  onCheckInGuest?: (guestId: string) => void;
  onCheckout?: (guestId: string) => void;
  activeMenuItemKey?: string;
  onSetActiveMenuItemKey?: (key: string) => void;
  kitchenModuleEnabled?: boolean;
  hideHeader?: boolean;
  serviceRequests?: any[];
}

export const MultiKeyPropertyOverview: React.FC<MultiKeyPropertyOverviewProps> = ({
  propertyId,
  propertySlug,
  onNavigateToRoom: _onNavigateToRoom,
  onBackToOverview: _onBackToOverview,
  selectedRoomSlug,
  activeTab,
  setActiveTab,
  guests = [],
  menu = [],
  receipts = [],
  onAddGuest,
  onCheckoutGuest,
  onUpdateBooking,
  onDeleteBooking,
  onGuestVerificationUpdated,
  onCFormFiledUpdated,
  onGuestCheckedIn,
  onAddMenuItem: _onAddMenuItem,
  onUpdateStock: _onUpdateStock,
  onAddInventoryItem: _onAddInventoryItem,
  onUpdateItemImage: _onUpdateItemImage,
  onDispatchTelegram,
  activeMenuItemKey = '',
  onSetActiveMenuItemKey: _onSetActiveMenuItemKey,
  kitchenModuleEnabled = false,
  hideHeader = false,
  serviceRequests = [],
}) => {
  const [property, setProperty] = useState<MultiKeyProperty | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setStaffCount] = useState<number>(0);
  const [, setSlotUsage] = useState<any>(null);

  // Guards against firing a duplicate/overlapping load for the same
  // propertyId - StrictMode's dev-only double-invoke and rapid re-renders
  // (e.g. navigating dashboard -> room -> dashboard quickly) would otherwise
  // each kick off their own pair of requests.
  const loadedForRef = useRef<number | null>(null);

  useEffect(() => {
    if (!propertyId || loadedForRef.current === propertyId) return;
    loadedForRef.current = propertyId;
    loadData();
  }, [propertyId]);

  const loadData = async () => {
    try {
      setLoading(true);

      // These two calls are independent of each other - fetch in parallel
      // instead of awaiting one before starting the next.
      const [propRes, overviewRes] = await Promise.all([
        apiFetch(`/php/api/router.php?action=get_multikey_property&property_id=${propertyId}`),
        apiFetch(`/php/api/router.php?action=get_multikey_overview&property_id=${propertyId}`),
      ]);

      const propData = await propRes.json();
      if (propData.success) {
        setProperty(propData.data);
        if (propData.data.tenant_id) {
          apiFetch(`/php/api/router.php?action=get_tenant_slot_usage&tenant_id=${propData.data.tenant_id}`)
            .then((r) => r.json())
            .then((slotData) => { if (slotData.success) setSlotUsage(slotData.data); })
            .catch(() => {});
        }
        if (propData.data.slug) {
          apiFetch(`/php/api/router.php?action=get_staff&property_slug=${propData.data.slug}`)
            .then((r) => r.json())
            .then((staffData) => { if (staffData.status === 'success' && Array.isArray(staffData.data)) setStaffCount(staffData.data.length); })
            .catch(() => {});
        }
      }

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">{t('loading_property_label', 'Loading property...')}</p>
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-4" />
          <p className="text-red-600 dark:text-red-400">{t('property_not_found_label', 'Property not found')}</p>
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
          <div className="text-center py-8">
            <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-4" />
            <p className="text-red-600 dark:text-red-400">{t('room_not_found_label', 'Room not found')}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">


        {/* Show room's dashboard and content based on activeTab */}
        {(() => {
          const roomGuests = guests.filter((g) => {
            // Use room_id (database primary key) - authoritative, no ambiguity
            const guestRoomId = g.roomId || g.room_id;
            return guestRoomId && Number(guestRoomId) === Number(selectedRoom.id);
          });
          const roomReceipts = receipts.filter((r) => roomGuests.some((g) => g.id === r.guest_id));

          return (
            <>
              {activeTab === 'dashboard' && (
                <OperationalDashboard
                  guests={roomGuests}
                  receipts={receipts}
                  menu={menu}
                  rooms={property.rooms}
                  roomName={selectedRoom.name}
                  roomId={selectedRoom.id}
                  propertySlug={propertySlug}
                  onNavigate={(tab) => setActiveTab?.(tab)}
                  onOpenCheckin={() => setActiveTab?.('guests')}
                  onAddGuest={onAddGuest}
                  onCheckoutGuest={onCheckoutGuest}
                  onUpdateBooking={onUpdateBooking}
                  onDeleteBooking={onDeleteBooking}
                  onGuestVerificationUpdated={onGuestVerificationUpdated}
                  onCFormFiledUpdated={onCFormFiledUpdated}
                  onGuestCheckedIn={onGuestCheckedIn}
                  onDispatchTelegram={onDispatchTelegram}
                  activeMenuItemKey={activeMenuItemKey}
                  propertyName={property.name}
                  propertyMapsLink={property.google_maps_link || ''}
                  propertyPhone={property.phone || ''}
                  propertyWhatsappTemplate={property.whatsapp_voucher_template || ''}
                  onUpdateRoomName={async (newName) => {
                    try {
                      const response = await fetch('/php/api/router.php?action=update_room_name', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                          property_slug: propertySlug,
                          room_id: selectedRoom.id,
                          new_name: newName
                        }),
                      });
                      if (response.ok) {
                        // Update UI - ideally refresh the room list
                      }
                    } catch (error) {
                      console.error('Failed to update room name:', error);
                    }
                  }}
                  kitchenModuleEnabled={kitchenModuleEnabled}
                  serviceRequests={serviceRequests}
                />
              )}

              {activeTab === 'guests' && (
                <GuestManagement
                  guests={roomGuests}
                  receipts={roomReceipts}
                  onAddGuest={onAddGuest}
                  onCheckoutGuest={onCheckoutGuest}
                  onUpdateGuest={onUpdateBooking}
                  activeMenuItemKey={activeMenuItemKey}
                  onDispatchTelegram={onDispatchTelegram}
                  menu={menu}
                  isMultiKeyProperty={true}
                  rooms={property.rooms}
                  selectedRoomSlug={selectedRoomSlug}
                />
              )}
            </>
          );
        })()}
      </div>
    );
  }

  return (
    <div className="multi-key-property-overview space-y-6">
      {error && (
        <div className="multi-key-property-overview__error flex gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
        </div>
      )}

       {/* Header - hide on dashboard overview. Add Room now lives in the
          Rooms List section below, always visible regardless of hideHeader. */}
       {!hideHeader && (
       <div className="multi-key-property-overview__header flex items-center justify-between">
         <div className="multi-key-property-overview__header-text">
           <h1 className="multi-key-property-overview__page-title text-3xl font-semibold text-slate-900 dark:text-white">{property.name}</h1>
           <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{property.address || t('no_address_label', 'No address')}</p>
         </div>
       </div>
       )}

       {/* Stats - hide on dashboard overview */}
       {!hideHeader && overview && (
         <div className="multi-key-property-overview__stats grid grid-cols-2 md:grid-cols-4 gap-4">
           <div className="multi-key-property-overview__stat-card bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
             <div className="flex items-center gap-3">
               <Users className="w-8 h-8 text-blue-600 dark:text-blue-400 opacity-60" />
               <div>
                 <p className="text-xs text-slate-600 dark:text-slate-400">{t('total_rooms_label', 'Total Rooms')}</p>
                 <p className="text-2xl font-semibold text-slate-900 dark:text-white">{overview.total_rooms}</p>
               </div>
             </div>
           </div>

           <div className="multi-key-property-overview__stat-card bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
             <div className="flex items-center gap-3">
               <TrendingUp className="w-8 h-8 text-green-600 dark:text-green-400 opacity-60" />
               <div>
                 <p className="text-xs text-slate-600 dark:text-slate-400">{t('occupied_label', 'Occupied')}</p>
                 <p className="text-2xl font-semibold text-slate-900 dark:text-white">{overview.total_occupied}</p>
               </div>
             </div>
           </div>

           <div className="multi-key-property-overview__stat-card bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
             <div className="flex items-center gap-3">
               <BarChart3 className="w-8 h-8 text-purple-600 dark:text-purple-400 opacity-60" />
               <div>
                 <p className="text-xs text-slate-600 dark:text-slate-400">{t('occupancy_label', 'Occupancy')}</p>
                 <p className="text-2xl font-semibold text-slate-900 dark:text-white">{overview.occupancy_rate}%</p>
               </div>
             </div>
           </div>

           <div className="multi-key-property-overview__stat-card bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
             <div className="flex items-center gap-3">
               <DollarSign className="w-8 h-8 text-amber-600 dark:text-amber-400 opacity-60" />
               <div>
                 <p className="text-xs text-slate-600 dark:text-slate-400">{t('revenue_label', 'Revenue')}</p>
                 <p className="text-2xl font-semibold text-slate-900 dark:text-white">{property.currency} {overview.total_revenue.toFixed(0)}</p>
               </div>
             </div>
           </div>
         </div>
       )}
     </div>
  );
};
