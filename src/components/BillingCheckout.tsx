import React, { useState, useEffect, useMemo } from 'react';
import {
  Receipt,
  Users,
  Calendar,
  DollarSign,
  CheckCircle2,
  LogOut,
  Search,
  AlertCircle,
  IndianRupee,
  Building,
} from 'lucide-react';
import { Guest, BillingReceipt } from '../types';
import { useToast } from './ToastContext';
import { ReceiptEditModal } from './ReceiptEditModal';
import { StyledSelect } from './StyledSelect';

interface BillingCheckoutProps {
  guests: Guest[];
  receipts: BillingReceipt[];
  onCheckoutGuest: (receipt: BillingReceipt) => void;
  isMultiKeyProperty?: boolean;
  rooms?: Array<{ id: number; name: string; slug: string }>;
  onCheckoutClick?: (guestId: string) => void;
  onNavigateToGuestRegistration?: () => void;
  kitchenModuleEnabled?: boolean;
}

interface GroupedRoomBooking {
  roomId: number;
  roomName: string;
  roomSlug: string;
  guests: Guest[];
}

export const BillingCheckout: React.FC<BillingCheckoutProps> = ({
  guests,
  receipts,
  onCheckoutGuest,
  isMultiKeyProperty = false,
  rooms = [],
  onCheckoutClick,
  onNavigateToGuestRegistration,
  kitchenModuleEnabled = true,
}) => {
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'Active' | 'All'>('Active');
  const [selectedGuestForCheckout, setSelectedGuestForCheckout] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [guestForReceipt, setGuestForReceipt] = useState<Guest | null>(null);
  const [modalMode, setModalMode] = useState<'edit-only' | 'edit-and-checkout'>('edit-only');

  // Filter active guests
  const activeGuests = useMemo(
    () => guests.filter((g) => g.status === 'Active'),
    [guests]
  );

  // Group guests by room for MultiKey properties
  const groupedByRoom = useMemo(() => {
    if (!isMultiKeyProperty || !rooms.length) {
      // For single-property, return single group with all guests
      return [
        {
          roomId: 0,
          roomName: 'All Bookings',
          roomSlug: 'all',
          guests: filterStatus === 'Active' ? activeGuests : guests,
        },
      ];
    }

    // For MultiKey: group by room
    const grouped: GroupedRoomBooking[] = rooms
      .map((room) => {
        const roomNum = room.name.match(/\d+/)?.[0]; // Extract number from "Room 101"
        return {
          roomId: room.id,
          roomName: room.name,
          roomSlug: room.slug,
          guests: (filterStatus === 'Active' ? activeGuests : guests).filter((g) => {
            // Match against: room name, slug, or extracted room number
            return (
              g.roomNumber === room.name || // "101" === "Room 101"
              g.roomNumber === room.slug || // "101" === "room-101"
              g.roomNumber === roomNum ||   // "101" === "101"
              g.roomNumber === `Room ${roomNum}` // "101" === "Room 101"
            );
          }),
        };
      })
      .filter((group) => group.guests.length > 0); // Only show rooms with bookings

    return grouped;
  }, [isMultiKeyProperty, rooms, guests, activeGuests, filterStatus]);

  // Apply search filter
  const filteredGroups = useMemo(
    () =>
      groupedByRoom.map((group) => ({
        ...group,
        guests: group.guests.filter((g) =>
          g.guestName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          g.phoneNumber.includes(searchTerm) ||
          g.roomNumber.toLowerCase().includes(searchTerm.toLowerCase())
        ),
      })),
    [groupedByRoom, searchTerm]
  );

  // Calculate totals for a guest
  const calculateGuestTotal = (guest: Guest): number => {
    const roomCharges = guest.roomRate ?? guest.totalAmount ?? 0;
    const advancePaid = guest.advanceAmount ?? 0;
    const foodBill = guest.foodBill ?? 0;
    return roomCharges - advancePaid + foodBill;
  };

  // Handle edit only - open receipt modal in edit mode
  const handleEditGuest = (guest: Guest) => {
    setSelectedGuestForCheckout(guest.id);
    setGuestForReceipt(guest);
    setModalMode('edit-only');
    setReceiptModalOpen(true);
  };

  // Handle edit and checkout - open receipt modal in checkout mode
  const handleEditAndCheckoutGuest = (guest: Guest) => {
    setSelectedGuestForCheckout(guest.id);
    setGuestForReceipt(guest);
    setModalMode('edit-and-checkout');
    setReceiptModalOpen(true);
  };


  // Format date for display
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '—';
      return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    } catch {
      return '—';
    }
  };

  // Calculate nights
  const calculateNights = (checkin: string, checkout: string): number => {
    if (!checkin || !checkout) return 0;
    try {
      const checkinDate = new Date(checkin);
      const checkoutDate = new Date(checkout);
      if (isNaN(checkinDate.getTime()) || isNaN(checkoutDate.getTime())) return 0;
      const diffTime = checkoutDate.getTime() - checkinDate.getTime();
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    } catch {
      return 0;
    }
  };

  if (activeGuests.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs p-12 text-center">
        <Building className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">
          No Active Bookings
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          {isMultiKeyProperty
            ? 'No guests are currently checked in across all rooms.'
            : 'No guests are currently checked in. Register a new guest to begin billing.'}
        </p>
        <div className="inline-block bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
          <p className="font-semibold mb-2">📝 Next Step: Register a Guest</p>
          <p className="text-xs mb-3">
            Go to <span className="font-mono bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">Guest Registration</span> to check in guests.
            Once guests are checked in, you'll be able to edit and checkout here.
          </p>
          {onNavigateToGuestRegistration && (
            <button
              onClick={onNavigateToGuestRegistration}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors text-xs cursor-pointer"
            >
              ➜ Go to Guest Registration
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
              <Receipt className="w-7 h-7 text-blue-600" />
              {isMultiKeyProperty ? 'Multi-Room Billing Terminal' : 'Guest Billing & Checkout'}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {isMultiKeyProperty
                ? `${filteredGroups.length} room(s) with active bookings`
                : `${activeGuests.length} active guest(s) checked in`}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
            <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
              {activeGuests.length} Active Booking{activeGuests.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search guest name, phone, or room..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none"
          />
        </div>
        <StyledSelect
          value={filterStatus}
          onChange={(value) => setFilterStatus(value as 'Active' | 'All')}
          options={[
            { value: 'Active', label: 'Active Only' },
            { value: 'All', label: 'All Bookings' },
          ]}
        />
      </div>

      {/* Room Groups (MultiKey) or Flat List (Single Property) */}
      <div className="space-y-4">
        {filteredGroups.map((group) => (
          <div
            key={`${group.roomId}-${group.roomSlug}`}
            className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs overflow-hidden"
          >
            {/* Room Header */}
            {isMultiKeyProperty && (
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-slate-700 dark:to-slate-600 px-6 py-4 border-b border-blue-200 dark:border-slate-600">
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Building className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  {group.roomName}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  {group.guests.length} guest{group.guests.length !== 1 ? 's' : ''} currently in this room
                </p>
              </div>
            )}

            {/* Guests List */}
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {group.guests.map((guest) => {
                const amountDue = calculateGuestTotal(guest);
                const nights = calculateNights(guest.checkinDate, guest.expectedCheckout);
                const nightsDisplay = nights > 0 ? `${nights} night${nights !== 1 ? 's' : ''}` : 'Same day';

                return (
                  <div
                    key={guest.id}
                    className="p-6 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                      {/* Guest Info */}
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <Users className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                              {guest.guestName}
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                              {guest.phoneNumber}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Stay Details */}
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <Calendar className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                              Stay Duration
                            </p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">
                              {formatDate(guest.checkinDate)} → {formatDate(guest.expectedCheckout)}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {nightsDisplay}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Amount Due */}
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <IndianRupee className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                              Amount Due
                            </p>
                            <p className="text-lg font-extrabold text-emerald-700 dark:text-emerald-400">
                              ₹{amountDue.toFixed(2)}
                            </p>
                            {guest.advanceAmount > 0 && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                Advance paid: ₹{guest.advanceAmount.toFixed(2)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Breakdown */}
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 mb-4 space-y-1 text-xs">
                      {guest.roomRate && (
                        <div className="flex justify-between text-slate-700 dark:text-slate-300">
                          <span>Room Charges:</span>
                          <span className="font-bold">₹{guest.roomRate.toFixed(2)}</span>
                        </div>
                      )}
                      {guest.foodBill > 0 && (
                        <div className="flex justify-between text-slate-700 dark:text-slate-300">
                          <span>Food & Incidentals:</span>
                          <span className="font-bold">₹{guest.foodBill.toFixed(2)}</span>
                        </div>
                      )}
                      {guest.advanceAmount > 0 && (
                        <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                          <span>Less: Advance Paid</span>
                          <span className="font-bold">-₹{guest.advanceAmount.toFixed(2)}</span>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleEditGuest(guest)}
                        disabled={isProcessing}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-bold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleEditAndCheckoutGuest(guest)}
                        disabled={isProcessing}
                        className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-400 text-white font-bold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        Edit & Checkout
                      </button>
                    </div>

                    {/* Guest Notes (if any) */}
                    {guest.notes && (
                      <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg flex gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800 dark:text-amber-200">
                          <span className="font-bold">Notes:</span> {guest.notes}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Room Subtotal (MultiKey only) */}
            {isMultiKeyProperty && (
              <div className="bg-slate-100 dark:bg-slate-700/50 px-6 py-3 border-t border-slate-200 dark:border-slate-700">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    Room Total ({group.guests.length} guest{group.guests.length !== 1 ? 's' : ''})
                  </span>
                  <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                    ₹{group.guests.reduce((sum, g) => sum + calculateGuestTotal(g), 0).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty Search Result */}
      {filteredGroups.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs p-12 text-center">
          <Search className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-1">
            No Results Found
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Try adjusting your search filters or check back later
          </p>
        </div>
      )}

      {/* Receipt Edit Modal */}
      <ReceiptEditModal
        isOpen={receiptModalOpen}
        guest={guestForReceipt}
        onClose={() => {
          setReceiptModalOpen(false);
          setGuestForReceipt(null);
        }}
        onCheckout={(receipt) => {
          onCheckoutGuest(receipt);
          setReceiptModalOpen(false);
          setGuestForReceipt(null);
          showToast(`Checkout completed for ${receipt.guestName}!`, { type: 'success' });
        }}
        isProcessing={isProcessing}
        mode={modalMode}
        kitchenModuleEnabled={kitchenModuleEnabled}
      />
    </div>
  );
};
