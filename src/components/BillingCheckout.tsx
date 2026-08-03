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
  const [activeTab, setActiveTab] = useState<'checkin_today' | 'checkout_today' | 'upcoming' | 'past_bookings'>('checkin_today');
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>('all');
  const [selectedGuestForCheckout, setSelectedGuestForCheckout] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [guestForReceipt, setGuestForReceipt] = useState<Guest | null>(null);
  const [modalMode, setModalMode] = useState<'edit-only' | 'edit-and-checkout'>('edit-only');

  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  // Helper to categorize guest into tabs
  const getGuestTabCategory = (g: Guest) => {
    const statusStr = String(g.status || '');
    if (statusStr === 'CheckedOut' || statusStr === 'Cancelled') return 'past_bookings';

    const checkinRaw = g.checkinDate || '';
    const checkoutRaw = g.expectedCheckout || g.checkoutDate || g.checkinDate || '';

    const checkin = checkinRaw.split(' ')[0].split('T')[0];
    const checkout = checkoutRaw.split(' ')[0].split('T')[0];

    if (!checkin || checkin.length < 8) return 'past_bookings';

    if (checkout === todayStr) {
      return 'checkout_today';
    }
    if (checkin === todayStr || (checkin < todayStr && todayStr < checkout)) {
      return 'checkin_today';
    }
    if (checkin > todayStr) {
      return 'upcoming';
    }
    if (checkout < todayStr) {
      return 'past_bookings';
    }
    return 'past_bookings';
  };

  // Helper for badge labels on cards
  const getGuestStayStatus = (guest: Guest) => {
    const cat = getGuestTabCategory(guest);
    if (cat === 'checkin_today') {
      return { key: 'staying', label: 'Checked In Today', color: 'bg-emerald-600 text-white dark:bg-emerald-600' };
    } else if (cat === 'checkout_today') {
      return { key: 'checkout', label: 'Checkout Today', color: 'bg-amber-600 text-white dark:bg-amber-600' };
    } else if (cat === 'upcoming') {
      return { key: 'upcoming', label: 'Upcoming Booking', color: 'bg-blue-600 text-white dark:bg-blue-600' };
    } else {
      return { key: 'past', label: 'Past Booking', color: 'bg-purple-600 text-white dark:bg-purple-600' };
    }
  };

  // Deduplicate guests array to ensure no duplicate cards ever appear
  const uniqueGuests = useMemo(() => {
    const seenIds = new Set<string>();
    const seenKeys = new Set<string>();
    const clean: Guest[] = [];

    for (const g of guests) {
      if (!g) continue;
      const id = String(g.id || '');
      const name = (g.guestName || '').toLowerCase().trim();
      const phone = (g.phoneNumber || '').trim();
      const checkin = (g.checkinDate || '').split(' ')[0].split('T')[0];
      const room = (g.roomNumber || '').toLowerCase().trim();

      if (id && seenIds.has(id)) continue;
      const key = `${name}|${phone}|${checkin}|${room}`;
      if (phone && checkin && seenKeys.has(key)) continue;

      if (id) seenIds.add(id);
      if (phone && checkin) seenKeys.add(key);
      clean.push(g);
    }
    return clean;
  }, [guests]);

  // Calculate count for each tab
  const tabCounts = useMemo(() => {
    const res = { checkin_today: 0, checkout_today: 0, upcoming: 0, past_bookings: 0 };
    uniqueGuests.forEach((g) => {
      const cat = getGuestTabCategory(g);
      res[cat] = (res[cat] || 0) + 1;
    });
    return res;
  }, [uniqueGuests, todayStr]);

  // Room filter dropdown options
  const roomOptions = useMemo(() => {
    return [
      { value: 'all', label: 'Filter Room: All' },
      ...rooms.map((r) => ({ value: r.name, label: `Room: ${r.name}` })),
    ];
  }, [rooms]);

  // Target guests matching active tab and selected room filter
  const targetGuests = useMemo(() => {
    return uniqueGuests.filter((g) => {
      // 1. Tab category match
      const cat = getGuestTabCategory(g);
      if (cat !== activeTab) return false;

      // 2. Room filter match
      if (selectedRoomFilter !== 'all') {
        const roomObj = rooms.find((r) => r.name === selectedRoomFilter || r.slug === selectedRoomFilter);
        const roomId = roomObj?.id;
        const gRoomId = (g as any).roomId || (g as any).room_id;

        if (roomId && gRoomId && Number(gRoomId) === Number(roomId)) {
          // match
        } else {
          const gRoom = g.roomNumber ? g.roomNumber.toLowerCase().trim() : '';
          const target = selectedRoomFilter.toLowerCase().trim();
          if (gRoom !== target && !gRoom.includes(target) && !target.includes(gRoom)) return false;
        }
      }

      return true;
    });
  }, [guests, activeTab, selectedRoomFilter, rooms, todayStr]);

  // Group guests by room for MultiKey properties
  const groupedByRoom = useMemo(() => {
    if (!isMultiKeyProperty || !rooms.length) {
      return [
        {
          roomId: 0,
          roomName: selectedRoomFilter !== 'all' ? selectedRoomFilter : 'All Bookings',
          roomSlug: 'all',
          guests: targetGuests,
        },
      ];
    }

    // For MultiKey: group by room
    const matchedGuestIds = new Set<string>();
    const grouped: GroupedRoomBooking[] = rooms
      .filter((room) => selectedRoomFilter === 'all' || room.name === selectedRoomFilter || room.slug === selectedRoomFilter)
      .map((room) => {
        const roomNum = room.name.match(/\d+/)?.[0];
        const matched = targetGuests.filter((g) => {
          const gRoomId = (g as any).roomId || (g as any).room_id;
          if (gRoomId && Number(gRoomId) === Number(room.id)) return true;

          const gRoom = g.roomNumber ? g.roomNumber.toLowerCase().trim() : '';
          const rName = room.name.toLowerCase().trim();
          const rSlug = room.slug.toLowerCase().trim();

          return (
            gRoom === rName ||
            gRoom === rSlug ||
            (roomNum && gRoom === roomNum) ||
            (roomNum && gRoom === `room ${roomNum}`)
          );
        });

        matched.forEach((g) => matchedGuestIds.add(g.id));

        return {
          roomId: room.id,
          roomName: room.name,
          roomSlug: room.slug,
          guests: matched,
        };
      })
      .filter((group) => group.guests.length > 0);

    // Group any unmatched guests under "Other / Unassigned Rooms"
    if (selectedRoomFilter === 'all') {
      const unmatched = targetGuests.filter((g) => !matchedGuestIds.has(g.id));
      if (unmatched.length > 0) {
        grouped.push({
          roomId: 9999,
          roomName: 'Other / Unassigned Rooms',
          roomSlug: 'unassigned',
          guests: unmatched,
        });
      }
    }

    return grouped;
  }, [isMultiKeyProperty, rooms, targetGuests, selectedRoomFilter]);

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

  // Handle edit only
  const handleEditGuest = (guest: Guest) => {
    setSelectedGuestForCheckout(guest.id);
    setGuestForReceipt(guest);
    setModalMode('edit-only');
    setReceiptModalOpen(true);
  };

  // Handle edit and checkout
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

  const totalFilteredGuestsCount = filteredGroups.reduce((acc, g) => acc + g.guests.length, 0);

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
                ? `${filteredGroups.length} room(s) displayed`
                : `${totalFilteredGuestsCount} guest(s) displayed`}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
            <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
              {totalFilteredGuestsCount} Guest Record{totalFilteredGuestsCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation & Search Bar */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs p-4 space-y-4">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-3">
          <button
            onClick={() => setActiveTab('checkin_today')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'checkin_today'
                ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-600/30'
                : 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span>Check In Today</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'checkin_today' ? 'bg-white/20 text-white font-extrabold' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold'}`}>
              {tabCounts.checkin_today}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('checkout_today')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'checkout_today'
                ? 'bg-amber-600 text-white shadow-md ring-2 ring-amber-600/30'
                : 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span>Checkout Today</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'checkout_today' ? 'bg-white/20 text-white font-extrabold' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold'}`}>
              {tabCounts.checkout_today}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('upcoming')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'upcoming'
                ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-600/30'
                : 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span>Upcoming</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'upcoming' ? 'bg-white/20 text-white font-extrabold' : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-bold'}`}>
              {tabCounts.upcoming}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('past_bookings')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'past_bookings'
                ? 'bg-purple-600 text-white shadow-md ring-2 ring-purple-600/30'
                : 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span>Past Bookings</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'past_bookings' ? 'bg-white/20 text-white font-extrabold' : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-bold'}`}>
              {tabCounts.past_bookings}
            </span>
          </button>
        </div>

        {/* Search Bar & Room Filter Dropdown */}
        <div className="flex flex-col sm:flex-row gap-3">
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
          <div className="w-full sm:w-56">
            <StyledSelect
              value={selectedRoomFilter}
              onChange={setSelectedRoomFilter}
              options={roomOptions}
            />
          </div>
        </div>
      </div>

      {/* Room Groups Grid (Convert room blocks into side-by-side columns) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
        {filteredGroups.map((group) => {
          const checkedInInRoom = group.guests.filter((g) => getGuestStayStatus(g).key === 'staying').length;
          const upcomingInRoom = group.guests.filter((g) => getGuestStayStatus(g).key === 'upcoming').length;

          let roomStatusLabel = '';
          if (checkedInInRoom > 0) {
            roomStatusLabel = `${checkedInInRoom} checked in${upcomingInRoom > 0 ? ` (${upcomingInRoom} upcoming)` : ''}`;
          } else if (upcomingInRoom > 0) {
            roomStatusLabel = `Vacant today (${upcomingInRoom} upcoming)`;
          } else {
            roomStatusLabel = `${group.guests.length} booking(s)`;
          }

          return (
            <div
              key={`${group.roomId}-${group.roomSlug}`}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col justify-between"
            >
              {/* Room Header */}
              {isMultiKeyProperty && (
                <div className="bg-gradient-to-r from-blue-50 to-blue-100/70 dark:from-slate-700 dark:to-slate-700/50 px-4 py-3 border-b border-blue-200/60 dark:border-slate-600 flex justify-between items-center">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
                      <Building className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      {group.roomName}
                    </h3>
                    <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 mt-0.5 truncate">
                      {roomStatusLabel}
                    </p>
                  </div>
                  <span className="text-[11px] font-extrabold bg-white/90 dark:bg-slate-800/90 text-slate-800 dark:text-slate-200 px-2.5 py-1 rounded-full border border-blue-200 dark:border-slate-600 shrink-0 shadow-2xs">
                    Total: ₹{group.guests.reduce((sum, g) => sum + calculateGuestTotal(g), 0).toFixed(2)}
                  </span>
                </div>
              )}

              {/* Guest Card(s) stacked inside Room Column */}
              <div className="p-4 space-y-4">
                {group.guests.map((guest) => {
                  const amountDue = calculateGuestTotal(guest);
                  const nights = calculateNights(guest.checkinDate, guest.expectedCheckout);
                  const nightsDisplay = nights > 0 ? `${nights} night${nights !== 1 ? 's' : ''}` : 'Same day stay';
                  const stayStatus = getGuestStayStatus(guest);

                  return (
                    <div
                      key={guest.id}
                      className="bg-slate-50/80 dark:bg-slate-900/50 rounded-xl p-3.5 border border-slate-200/80 dark:border-slate-700/80 hover:border-blue-400 dark:hover:border-blue-500/50 transition-all flex flex-col justify-between space-y-3"
                    >
                      {/* Top Header: Guest Name & Status Badge */}
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                              {guest.guestName}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {guest.phoneNumber || 'No contact'}
                            </p>
                          </div>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 shadow-2xs ${stayStatus.color}`}>
                            {stayStatus.label}
                          </span>
                        </div>

                        {/* Stay Dates */}
                        <div className="mt-2 text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200/60 dark:border-slate-700">
                          <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                            <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span>{formatDate(guest.checkinDate)} → {formatDate(guest.expectedCheckout)}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 pl-5">
                            {nightsDisplay}
                          </div>
                        </div>
                      </div>

                      {/* Financial Breakdown */}
                      <div className="space-y-1 text-xs border-t border-slate-200/80 dark:border-slate-700/80 pt-2">
                        {guest.roomRate ? (
                          <div className="flex justify-between text-slate-600 dark:text-slate-400 text-[11px]">
                            <span>Room Charges:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">₹{guest.roomRate.toFixed(2)}</span>
                          </div>
                        ) : null}
                        {guest.foodBill > 0 && (
                          <div className="flex justify-between text-slate-600 dark:text-slate-400 text-[11px]">
                            <span>Food & Incidentals:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">₹{guest.foodBill.toFixed(2)}</span>
                          </div>
                        )}
                        {guest.advanceAmount > 0 && (
                          <div className="flex justify-between text-emerald-600 dark:text-emerald-400 text-[11px]">
                            <span>Less: Advance Paid</span>
                            <span className="font-semibold">-₹{guest.advanceAmount.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center text-xs font-extrabold pt-1 border-t border-dashed border-slate-200 dark:border-slate-700">
                          <span className="text-slate-700 dark:text-slate-300">Amount Due:</span>
                          <span className={amountDue > 0 ? "text-amber-600 dark:text-amber-400 text-sm" : "text-emerald-600 dark:text-emerald-400 text-sm"}>
                            ₹{amountDue.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="grid grid-cols-2 gap-2 pt-0.5">
                        <button
                          onClick={() => handleEditGuest(guest)}
                          disabled={isProcessing}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-2 rounded-lg transition-colors flex items-center justify-center gap-1 text-xs cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleEditAndCheckoutGuest(guest)}
                          disabled={isProcessing}
                          className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-1.5 px-2 rounded-lg transition-colors flex items-center justify-center gap-1 text-xs cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          Checkout
                        </button>
                      </div>

                      {/* Guest Notes */}
                      {guest.notes && (
                        <div className="p-2 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 rounded-lg flex gap-1.5 text-[10px]">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <p className="text-amber-800 dark:text-amber-200 line-clamp-2">
                            <span className="font-bold">Notes:</span> {guest.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty Search Result */}
      {filteredGroups.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs p-12 text-center">
          <Search className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-1">
            No Guest Records Found
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No guest records match the current tab filter or search term. Switch tabs or room filter to view other reservations.
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
