import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  CheckCircle2,
  LogOut,
  Search,
  AlertCircle,
  Building,
  Plus,
} from 'lucide-react';
import { Guest, BillingReceipt } from '../types';
import { t } from '../i18n/en';
import { Button } from './Button';
import { Input } from './Input';
import { Badge } from './Badge';
import { useToast } from './ToastContext';
import { ReceiptEditModal } from './ReceiptEditModal';
import { StyledSelect } from './StyledSelect';
import { BookingDetailsModal } from './BookingDetailsModal';
import { PageHeader, PageHeaderButton } from './PageHeader';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

interface BillingCheckoutProps {
  guests: Guest[];
  receipts: BillingReceipt[];
  onCheckoutGuest: (receipt: BillingReceipt) => void;
  onUpdateGuest?: (updatedGuest: Guest) => void;
  onAddGuest?: (guest: Guest) => void;
  isMultiKeyProperty?: boolean;
  rooms?: Array<{ id: number; name: string; slug: string }>;
  onCheckoutClick?: (guestId: string) => void;
  onNavigateToGuestRegistration?: () => void;
  kitchenModuleEnabled?: boolean;
  propertyGstin?: string;
  propertyName?: string;
  focusGuestId?: string | null;
}

interface GroupedRoomBooking {
  roomId: number;
  roomName: string;
  roomSlug: string;
  guests: Guest[];
}

const LazyGuestManagement = React.lazy(() =>
  import('./GuestManagement').then(m => ({ default: m.GuestManagement }))
);

export const BillingCheckout: React.FC<BillingCheckoutProps> = ({
  guests,
  receipts,
  onCheckoutGuest,
  onUpdateGuest,
  onAddGuest,
  isMultiKeyProperty = false,
  rooms = [],
  onCheckoutClick: _onCheckoutClick,
  onNavigateToGuestRegistration,
  kitchenModuleEnabled = true,
  propertyGstin = '',
  propertyName = '',
  focusGuestId = null,
}) => {
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming' | 'past_bookings'>('today');
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>('all');
  const [isProcessing] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [showAddBookingModal, setShowAddBookingModal] = useState(false);
  const [guestForReceipt, setGuestForReceipt] = useState<Guest | null>(null);
  const [modalMode, setModalMode] = useState<'edit-only' | 'edit-and-checkout'>('edit-only');
  const [selectedGuestForDetails, setSelectedGuestForDetails] = useState<Guest | null>(null);

  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  // Format date for display
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '—';
    return formatDateDDMMYYYY(dateStr) || '—';
  };

  // Fine-grained status (used for per-guest badges, and to derive the
  // coarser tab category below) - distinguishes checking-in-today from
  // checking-out-today, even though both now share one "Today" tab.
  const getGuestDetailedStatus = (g: Guest) => {
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

  // Tab category: check-in-today and checkout-today are merged into one
  // "Today" tab - that's the single "what needs attention right now" view;
  // splitting it in two meant checking two tabs to see everything happening
  // today.
  const getGuestTabCategory = (g: Guest): 'today' | 'upcoming' | 'past_bookings' => {
    const detailed = getGuestDetailedStatus(g);
    if (detailed === 'checkin_today' || detailed === 'checkout_today') return 'today';
    return detailed;
  };

  // Jump to whichever tab actually has the requested booking, and filter the
  // list down to just that guest via the existing search box - re-runs each
  // time "Manage" is clicked again (including on the same guest), not just
  // on mount.
  useEffect(() => {
    if (!focusGuestId) return;
    const target = guests.find((g) => String(g.id) === String(focusGuestId));
    if (!target) return;
    setActiveTab(getGuestTabCategory(target));
    setSearchTerm(target.guestName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusGuestId]);

  // Helper for badge labels on cards
  const getGuestStayStatus = (guest: Guest) => {
    const cat = getGuestDetailedStatus(guest);
    if (cat === 'checkin_today') {
      return { key: 'staying', label: t('checked_in_today_badge', 'Checked In Today'), color: 'bg-emerald-600 text-white dark:bg-emerald-600' };
    } else if (cat === 'checkout_today') {
      return { key: 'checkout', label: t('checkout_today_badge', 'Checkout Today'), color: 'bg-amber-600 text-white dark:bg-amber-600' };
    } else if (cat === 'upcoming') {
      return { key: 'upcoming', label: t('upcoming_booking_badge', 'Upcoming Booking'), color: 'bg-blue-600 text-white dark:bg-blue-600' };
    } else {
      return { key: 'past', label: t('past_booking_badge', 'Past Booking'), color: 'bg-purple-600 text-white dark:bg-purple-600' };
    }
  };

  // Deduplicate and sanitize guests array to ensure no invalid/orphan cards ever appear
  const uniqueGuests = useMemo(() => {
    const seenIds = new Set<string>();
    const seenKeys = new Set<string>();
    const clean: Guest[] = [];

    for (const g of guests) {
      if (!g) continue;

      const rawName = (g.guestName || '').trim();
      const phone = (g.phoneNumber || '').trim();

      // Filter out invalid/orphaned system placeholders ("Guest" or blank with no contact number)
      if ((rawName.toLowerCase() === 'guest' || rawName === '' || rawName.toLowerCase() === 'unassigned') && (!phone || phone.length < 10)) {
        continue;
      }

      const id = String(g.id || '');
      const name = rawName.toLowerCase();
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
    const res = { today: 0, upcoming: 0, past_bookings: 0 };
    uniqueGuests.forEach((g) => {
      const cat = getGuestTabCategory(g);
      res[cat] = (res[cat] || 0) + 1;
    });
    return res;
  }, [uniqueGuests, todayStr]);

  // Room filter dropdown options
  const roomOptions = useMemo(() => {
    return [
      { value: 'all', label: t('filter_room_all_label', 'Filter Room: All') },
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

  // Search applied once, up front, so every view built from it (room-grid,
  // date-grouped) reflects the same filtered set.
  const searchedGuests = useMemo(
    () =>
      targetGuests.filter((g) =>
        g.guestName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        g.phoneNumber.includes(searchTerm) ||
        g.roomNumber.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [targetGuests, searchTerm]
  );

  // Group an arbitrary guest list by room (Single property is treated as a
  // 1-room unit). Extracted as its own function - not just for the main
  // room-grid view, but reused per-date-section in the Upcoming tab below.
  const buildRoomGroups = (guestList: Guest[]): GroupedRoomBooking[] => {
    const effectiveRooms = rooms.length > 0
      ? rooms
      : [{ id: 1, name: 'Main Property / Villa', slug: 'main-villa' }];

    const matchedGuestIds = new Set<string>();
    const grouped: GroupedRoomBooking[] = effectiveRooms
      .filter((room) => selectedRoomFilter === 'all' || room.name === selectedRoomFilter || room.slug === selectedRoomFilter)
      .map((room) => {
        const roomNum = room.name.match(/\d+/)?.[0];
        const matched = guestList.filter((g) => {
          const gRoomId = (g as any).roomId || (g as any).room_id;
          if (gRoomId && Number(gRoomId) === Number(room.id)) return true;

          const gRoom = g.roomNumber ? g.roomNumber.toLowerCase().trim() : '';
          const rName = room.name.toLowerCase().trim();
          const rSlug = room.slug.toLowerCase().trim();

          return (
            rooms.length === 0 || // for single property, target guests belong to this unit
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
      const unmatched = guestList.filter((g) => !matchedGuestIds.has(g.id));
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
  };

  // Today / Past Bookings: room-first grid, same as always.
  const filteredGroups = useMemo(
    () => buildRoomGroups(searchedGuests),
    [searchedGuests, rooms, selectedRoomFilter]
  );

  // Upcoming: date-first, rooms within each date - "what's happening when"
  // matters more than "what's in room X" when you're planning ahead, unlike
  // Today/Past where the room is the more useful anchor.
  const upcomingByDate = useMemo(() => {
    if (activeTab !== 'upcoming') return [];

    const byDate = new Map<string, Guest[]>();
    searchedGuests.forEach((g) => {
      const checkin = (g.checkinDate || '').split(' ')[0].split('T')[0];
      if (!byDate.has(checkin)) byDate.set(checkin, []);
      byDate.get(checkin)!.push(g);
    });

    const tomorrowStr = (() => {
      const d = new Date(todayStr);
      d.setDate(d.getDate() + 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    })();

    return Array.from(byDate.keys())
      .sort()
      .map((dateStr) => ({
        dateStr,
        label: dateStr === tomorrowStr ? t('tomorrow_label', 'Tomorrow') : formatDate(dateStr),
        roomGroups: buildRoomGroups(byDate.get(dateStr)!),
      }));
  }, [activeTab, searchedGuests, rooms, selectedRoomFilter, todayStr]);

  // Calculate totals for a guest
  const calculateGuestTotal = (guest: Guest): number => {
    const roomCharges = guest.roomRate ?? guest.totalAmount ?? 0;
    const advancePaid = guest.advanceAmount ?? 0;
    const foodBill = guest.foodBill ?? 0;
    return roomCharges - advancePaid + foodBill;
  };

  // Handle edit only
  const handleEditGuest = (guest: Guest) => {
    setSelectedGuestForDetails(guest);
  };

  // Handle edit and checkout
  const handleEditAndCheckoutGuest = (guest: Guest) => {
    setGuestForReceipt(guest);
    setModalMode('edit-and-checkout');
    setReceiptModalOpen(true);
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

  // Renders the room-column grid for a given set of room groups - shared by
  // the main Today/Past view and each date-section under Upcoming, so the
  // room card itself (guest list, financials, actions) only exists once.
  const renderRoomGroupsGrid = (groups: GroupedRoomBooking[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
      {groups.map((group) => {
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
              {(() => {
                const groupTotal = group.guests.reduce((sum, g) => sum + calculateGuestTotal(g), 0);
                // Same "Refund Due" relabeling as the per-guest card below -
                // a raw negative number here read as a bug, not a refund.
                return (
                  <span className="text-[11px] font-extrabold bg-white/90 dark:bg-slate-800/90 text-slate-800 dark:text-slate-200 px-2.5 py-1 rounded-full border border-blue-200 dark:border-slate-600 shrink-0 shadow-2xs">
                    {groupTotal < 0 ? `Refund: ₹${Math.abs(groupTotal).toFixed(2)}` : `Total: ₹${groupTotal.toFixed(2)}`}
                  </span>
                );
              })()}
            </div>

            {/* Guest Card(s) stacked inside Room Column */}
            <div className="p-4 space-y-4">
              {group.guests.map((guest) => {
                const amountDue = calculateGuestTotal(guest);
                const nights = calculateNights(guest.checkinDate, guest.expectedCheckout);
                const nightsDisplay = nights > 0 ? `${nights} night${nights !== 1 ? 's' : ''}` : t('same_day_stay', 'Same day stay');
                const stayStatus = getGuestStayStatus(guest);
                const canCheckout = stayStatus.key === 'staying' || stayStatus.key === 'checkout';

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
                            {guest.phoneNumber || t('no_contact', 'No contact')}
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
                          <span>{t('room_charges_label', 'Room Charges:')}</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">₹{guest.roomRate.toFixed(2)}</span>
                        </div>
                      ) : null}
                      {guest.foodBill > 0 && (
                        <div className="flex justify-between text-slate-600 dark:text-slate-400 text-[11px]">
                          <span>{t('food_incidentals_label', 'Food & Incidentals:')}</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">₹{guest.foodBill.toFixed(2)}</span>
                        </div>
                      )}
                      {guest.advanceAmount > 0 && (
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-400 text-[11px]">
                          <span>{t('less_advance_paid_label', 'Less: Advance Paid')}</span>
                          <span className="font-semibold">-₹{guest.advanceAmount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-xs font-extrabold pt-1 border-t border-dashed border-slate-200 dark:border-slate-700">
                        <span className="text-slate-700 dark:text-slate-300">
                          {amountDue < 0 ? t('refund_due_to_guest_label', 'Refund Due to Guest:') : t('amount_due_label', 'Amount Due:')}
                        </span>
                        <span className={amountDue > 0 ? "text-amber-600 dark:text-amber-400 text-sm" : "text-emerald-600 dark:text-emerald-400 text-sm"}>
                          ₹{Math.abs(amountDue).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {canCheckout ? (
                      <div className="grid grid-cols-2 gap-2 pt-0.5">
                        <button
                          onClick={() => handleEditGuest(guest)}
                          disabled={isProcessing}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-2 rounded-lg transition-colors flex items-center justify-center gap-1 text-xs cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {t('edit_button', 'Edit')}
                        </button>
                        <button
                          onClick={() => handleEditAndCheckoutGuest(guest)}
                          disabled={isProcessing}
                          className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-1.5 px-2 rounded-lg transition-colors flex items-center justify-center gap-1 text-xs cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          {t('checkout_button', 'Checkout')}
                        </button>
                      </div>
                    ) : (
                      <div className="pt-0.5">
                        <button
                          onClick={() => handleEditGuest(guest)}
                          disabled={isProcessing}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-2 rounded-lg transition-colors flex items-center justify-center gap-1 text-xs cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {t('edit_booking_button', 'Edit Booking')}
                        </button>
                      </div>
                    )}

                    {/* Guest Notes */}
                    {guest.notes && (
                      <div className="p-2 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 rounded-lg flex gap-1.5 text-[10px]">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-amber-800 dark:text-amber-200 line-clamp-2">
                          <span className="font-bold">{t('notes_prefix', 'Notes:')}</span> {guest.notes}
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
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('bookings_page_title', 'Bookings')}
        subtitle="Manage all guest stays, reservations, and billing checkouts."
      >
        <PageHeaderButton
          onClick={() => {
            if (onNavigateToGuestRegistration) {
              onNavigateToGuestRegistration();
            } else {
              setShowAddBookingModal(true);
            }
          }}
          icon={Plus}
        >
          {t('add_booking_button', 'Add Booking')}
        </PageHeaderButton>
      </PageHeader>

      {/* Tabs Navigation & Search Bar */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 space-y-4">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-3">
          <Button
            variant={activeTab === 'today' ? 'success' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('today')}
            rightIcon={<Badge variant="success">{tabCounts.today}</Badge>}
          >
            {t('today_tab', 'Today')}
          </Button>

          <Button
            variant={activeTab === 'upcoming' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('upcoming')}
            rightIcon={<Badge variant="info">{tabCounts.upcoming}</Badge>}
          >
            {t('upcoming_tab', 'Upcoming')}
          </Button>

          <Button
            variant={activeTab === 'past_bookings' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('past_bookings')}
            rightIcon={<Badge variant="neutral">{tabCounts.past_bookings}</Badge>}
          >
            {t('past_bookings_tab', 'Past Bookings')}
          </Button>
        </div>

        {/* Search Bar & Room Filter Dropdown */}
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="flex-1 w-full">
            <Input
              leftIcon={<Search className="w-4 h-4 text-slate-400" />}
              placeholder={t('search_guest_placeholder', 'Search guest name, phone, or room...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-60 shrink-0">
            <StyledSelect
              value={selectedRoomFilter}
              onChange={setSelectedRoomFilter}
              options={roomOptions}
            />
          </div>
        </div>
      </div>

      {/* Upcoming: date-first sections, each with its own room grid.
          Today/Past Bookings: a single room-first grid, as before. */}
      {activeTab === 'upcoming' ? (
        <div className="space-y-8">
          {upcomingByDate.map((dateGroup) => (
            <div key={dateGroup.dateStr}>
              <h3 className="text-[10px] font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                {dateGroup.label}
              </h3>
              {renderRoomGroupsGrid(dateGroup.roomGroups)}
            </div>
          ))}
        </div>
      ) : (
        renderRoomGroupsGrid(filteredGroups)
      )}

      {/* Empty Search Result */}
      {filteredGroups.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-12 text-center">
          <Search className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-1">
            {t('no_guest_records_found', 'No Guest Records Found')}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t('no_guest_records_description', 'No guest records match the current tab filter or search term. Switch tabs or room filter to view other reservations.')}
          </p>
        </div>
      )}

      {/* Receipt Edit Modal with Blocked Dates Calendar */}
      <ReceiptEditModal
        isOpen={receiptModalOpen}
        guest={guestForReceipt}
        allGuests={uniqueGuests}
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
        onUpdateGuest={(updatedGuest) => {
          onUpdateGuest?.(updatedGuest);
          showToast(`Booking details updated for ${updatedGuest.guestName}!`, { type: 'success' });
        }}
        isProcessing={isProcessing}
        mode={modalMode}
        kitchenModuleEnabled={kitchenModuleEnabled}
        propertyGstin={propertyGstin}
        propertyName={propertyName}
      />

      {/* Standard Booking Details & Editing Modal */}
      {selectedGuestForDetails && (
        <BookingDetailsModal
          guest={selectedGuestForDetails}
          onClose={() => setSelectedGuestForDetails(null)}
          onSave={async (updatedGuest) => {
            onUpdateGuest?.(updatedGuest);
            setSelectedGuestForDetails(null);
            showToast(`Booking changes saved successfully!`, { type: 'success' });
          }}
          rooms={rooms}
          checkedInGuests={guests}
          propertyName={propertyName}
        />
      )}

      {/* Add Booking Modal */}
      {showAddBookingModal && (
        <React.Suspense fallback={null}>
          <div
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setShowAddBookingModal(false)}
          >
            <div
              className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <LazyGuestManagement
                guests={guests}
                receipts={receipts}
                menu={[]}
                rooms={rooms}
                onAddGuest={(guest) => {
                  onAddGuest?.(guest);
                  setShowAddBookingModal(false);
                }}
                onCheckoutGuest={onCheckoutGuest}
                activeMenuItemKey="guest_registration"
                isMultiKeyProperty={isMultiKeyProperty}
                onClose={() => setShowAddBookingModal(false)}
              />
            </div>
          </div>
        </React.Suspense>
      )}
    </div>
  );
};

