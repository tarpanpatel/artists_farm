import React, { useState, useEffect, useMemo } from 'react';
import DataTable from 'react-data-table-component';
import {
  Calendar,
  CheckCircle2,
  LogOut,
  Search,
  AlertCircle,
  Building,
  Plus,
  ArrowRight,
  Phone,
  Home,
  Loader2,
} from 'lucide-react';
import { Guest, BillingReceipt } from '../types';
import { t } from '../i18n/en';
import { GUEST_STATUS_CHECKEDOUT_LEGACY, GUEST_STATUS_CHECKED_OUT } from '../constants/guestStatus';
import { Button } from './Button';
import { Input } from './Input';
import { Badge } from './Badge';
import { useToast } from './ToastContext';
import { ReceiptEditModal } from './ReceiptEditModal';
import { BookingDetailsModal } from './BookingDetailsModal';
import { PageHeader, PageHeaderButton } from './PageHeader';
import { formatDateDDMMYYYY, formatDateDDMMYY } from '../utils/dateUtils';
import { markCFormFiled } from '../services/api';

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
  const [isProcessing] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [showAddBookingModal, setShowAddBookingModal] = useState(false);
  const [guestForReceipt, setGuestForReceipt] = useState<Guest | null>(null);
  const [modalMode, setModalMode] = useState<'edit-only' | 'edit-and-checkout'>('edit-only');
  const [selectedGuestForDetails, setSelectedGuestForDetails] = useState<Guest | null>(null);
  const [savingCFormId, setSavingCFormId] = useState<string | null>(null);

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
    if (statusStr === GUEST_STATUS_CHECKEDOUT_LEGACY || statusStr === GUEST_STATUS_CHECKED_OUT || statusStr === 'Cancelled') return 'past_bookings';

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

  // Target guests matching the active tab. Room filtering used to be a
  // separate dropdown here too - removed 12 Aug 2026 since the search box
  // below already matches guest name, phone, OR room number, making a
  // second room-only filter pure redundant UI.
  const targetGuests = useMemo(() => {
    return uniqueGuests.filter((g) => getGuestTabCategory(g) === activeTab);
  }, [guests, activeTab, todayStr]);

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
    const unmatched = guestList.filter((g) => !matchedGuestIds.has(g.id));
    if (unmatched.length > 0) {
      grouped.push({
        roomId: 9999,
        roomName: 'Other / Unassigned Rooms',
        roomSlug: 'unassigned',
        guests: unmatched,
      });
    }

    return grouped;
  };

  // Today / Past Bookings: room-first grid, same as always.
  const filteredGroups = useMemo(
    () => buildRoomGroups(searchedGuests),
    [searchedGuests, rooms]
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
  }, [activeTab, searchedGuests, rooms, todayStr]);

  // Calculate totals for a guest
  const calculateGuestTotal = (guest: Guest): number => {
    // guest.roomRate is the PER-NIGHT rate (services/api.ts maps it from
    // per_night_charges); guest.totalAmount is the actual full-stay charge
    // (total_charge, i.e. nights x rate). This previously read roomRate
    // first with totalAmount only as a fallback - since roomRate is always
    // truthy for a real booking, totalAmount was never actually used. For
    // any stay of 2+ nights that made the (correctly-computed, ~30%-of-total)
    // advance look larger than a single night's rate, flipping this into a
    // bogus "Refund Due to Guest" even though nothing was actually owed back.
    const roomCharges = guest.totalAmount ?? guest.roomRate ?? 0;
    const advancePaid = guest.advanceAmount ?? 0;
    const foodBill = guest.foodBill ?? 0;
    return roomCharges - advancePaid + foodBill;
  };

  // Handle edit only
  const handleEditGuest = (guest: Guest) => {
    setSelectedGuestForDetails(guest);
  };

  // C-Form filing toggle for the Past Bookings table (moved here from the
  // removed GuestHistory/"Past Guests" page - same API call, same instant-
  // mutate-then-bubble-up pattern BookingDetailsModal already uses).
  const handleToggleCForm = async (guest: Guest, newFiledState: boolean) => {
    setSavingCFormId(guest.id);
    const ok = await markCFormFiled(guest.id, newFiledState);
    if (ok) {
      const filedAt = newFiledState ? new Date().toISOString() : null;
      onUpdateGuest?.({ ...guest, cFormFiledAt: filedAt });
      showToast(newFiledState ? `C-Form marked as filed for ${guest.guestName}` : `C-Form marked as pending for ${guest.guestName}`, { type: 'success' });
    } else {
      showToast('Failed to update C-Form status', { type: 'error' });
    }
    setSavingCFormId(null);
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
    <div className="billing-checkout__grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
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
            className="billing-checkout__room-card bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs hover:shadow-md transition-all overflow-hidden flex flex-col justify-between"
          >
            {/* Room Header */}
            <div className="billing-checkout__room-card-header bg-slate-50 dark:bg-slate-800/80 px-4 py-3 border-b border-slate-200/80 dark:border-slate-700 flex justify-between items-center">
              <div className="min-w-0 flex-1">
                <h3 className="billing-checkout__room-card-title text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
                  <Building className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  {group.roomName}
                </h3>
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {roomStatusLabel}
                </p>
              </div>
              {(() => {
                const groupTotal = group.guests.reduce((sum, g) => sum + calculateGuestTotal(g), 0);
                return (
                  <span className="summary-line summary-line--group-total text-xs font-bold tabular-nums bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 shrink-0 shadow-2xs">
                    {groupTotal < 0 ? `Refund: ₹${Math.abs(groupTotal).toFixed(2)}` : `Total: ₹${groupTotal.toFixed(2)}`}
                  </span>
                );
              })()}
            </div>

            {/* Guest Card(s) stacked inside Room Column */}
            <div className="billing-checkout__room-card-body p-3.5 space-y-3.5">
              {group.guests.map((guest) => {
                const amountDue = calculateGuestTotal(guest);
                const nights = calculateNights(guest.checkinDate, guest.expectedCheckout);
                const nightsDisplay = nights > 0 ? `${nights} night${nights !== 1 ? 's' : ''}` : t('same_day_stay', 'Same day stay');
                const stayStatus = getGuestStayStatus(guest);
                const canCheckout = stayStatus.key === 'staying' || stayStatus.key === 'checkout';

                return (
                  <div
                    key={guest.id}
                    className="billing-checkout__guest-card bg-slate-50/70 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-200/80 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 transition-all flex flex-col justify-between space-y-3"
                  >
                    {/* Top Header: Guest Name & Status Badge */}
                    <div>
                      <div className="billing-checkout__guest-card-header flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {guest.guestName}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {guest.phoneNumber || t('no_contact', 'No contact')}
                          </p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 shadow-2xs ${stayStatus.color}`}>
                          {stayStatus.label}
                        </span>
                      </div>

                      {/* C-Form Filing Status - foreign guests only (regulatory: Foreigner
                          Registration Office reporting). Was previously only visible on the
                          removed "Past Guests" archive page; the actual filing toggle lives in
                          BookingDetailsModal (Edit Booking), this is just the at-a-glance
                          indicator so a pending filing isn't only discoverable by opening every
                          card one by one. */}
                      {guest.isForeignGuest && (
                        <div className="mt-1.5">
                          {guest.cFormFiledAt ? (
                            <Badge variant="success" size="sm">
                              <CheckCircle2 className="w-3 h-3" />
                              {t('c_form_filed_badge', 'C-Form Filed')}
                            </Badge>
                          ) : (
                            <Badge variant="warning" size="sm">
                              <AlertCircle className="w-3 h-3" />
                              {t('c_form_pending_badge', 'C-Form Pending')}
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Stay Dates */}
                      <div className="billing-checkout__guest-card-dates mt-2 text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200/60 dark:border-slate-700">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 text-[11px]">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="inline-flex items-center gap-1 tabular-nums">{formatDate(guest.checkinDate)} <ArrowRight className="w-3 h-3 text-slate-400" /> {formatDate(guest.expectedCheckout)}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 pl-5">
                          {nightsDisplay}
                        </div>
                      </div>
                    </div>

                    {/* Financial Breakdown */}
                    <div className="billing-checkout__guest-card-financials space-y-1 text-xs border-t border-slate-200/80 dark:border-slate-700/80 pt-2">
                      {(guest.totalAmount || guest.roomRate) ? (
                        <div className="flex justify-between text-slate-600 dark:text-slate-400 text-[11px]">
                          <span>{t('room_charges_label', 'Room Charges:')}</span>
                          <span className="summary-line summary-line--room-rate font-semibold tabular-nums text-slate-800 dark:text-slate-200">₹{(guest.totalAmount ?? guest.roomRate ?? 0).toFixed(2)}</span>
                        </div>
                      ) : null}
                      {guest.foodBill > 0 && (
                        <div className="flex justify-between text-slate-600 dark:text-slate-400 text-[11px]">
                          <span>{t('food_incidentals_label', 'Food & Incidentals:')}</span>
                          <span className="summary-line summary-line--food-bill font-semibold tabular-nums text-slate-800 dark:text-slate-200">₹{guest.foodBill.toFixed(2)}</span>
                        </div>
                      )}
                      {guest.advanceAmount > 0 && (
                        <div className="flex justify-between text-slate-600 dark:text-slate-400 text-[11px]">
                          <span>{t('less_advance_paid_label', 'Less: Advance Paid')}</span>
                          <span className="summary-line summary-line--advance-paid font-semibold tabular-nums text-slate-700 dark:text-slate-300">-₹{guest.advanceAmount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-xs font-semibold pt-1 border-t border-dashed border-slate-200 dark:border-slate-700">
                        <span className="text-slate-700 dark:text-slate-300 font-medium">
                          {amountDue < 0 ? t('refund_due_to_guest_label', 'Refund Due to Guest:') : t('amount_due_label', 'Amount Due:')}
                        </span>
                        <span className="summary-line summary-line--amount-due font-bold text-slate-900 dark:text-white text-sm tabular-nums">
                          ₹{Math.abs(amountDue).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {canCheckout ? (
                      <div className="billing-checkout__guest-card-actions grid grid-cols-2 gap-2 pt-0.5">
                        <button
                          onClick={() => handleEditGuest(guest)}
                          disabled={isProcessing}
                          className="bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold py-1.5 px-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs shadow-2xs cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                          {t('edit_button', 'Edit')}
                        </button>
                        <button
                          onClick={() => handleEditAndCheckoutGuest(guest)}
                          disabled={isProcessing}
                          className="bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-semibold py-1.5 px-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs shadow-2xs cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          {t('checkout_button', 'Checkout')}
                        </button>
                      </div>
                    ) : (
                      <div className="billing-checkout__guest-card-actions pt-0.5">
                        <button
                          onClick={() => handleEditGuest(guest)}
                          disabled={isProcessing}
                          className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-600 font-semibold py-1.5 px-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs shadow-2xs cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                          {t('edit_booking_button', 'Edit Booking')}
                        </button>
                      </div>
                    )}

                    {/* Guest Notes */}
                    {guest.notes && (
                      <div className="p-2 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg flex gap-1.5 text-[10px]">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-slate-700 dark:text-slate-300 line-clamp-2">
                          <span className="font-semibold">{t('notes_prefix', 'Notes:')}</span> {guest.notes}
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

  // Past Bookings: a flat searchable/sortable/paginated table (matching the
  // removed "Past Guests" archive page's format) rather than the room-grid
  // cards Today/Upcoming use - once a stay is history, scanning/sorting a
  // large flat list beats hunting through per-room cards, and this is also
  // where C-Form filing status needs to be visible at a glance across every
  // past guest at once, not one room-card at a time.
  const pastBookingsTableStyles = {
    subHeader: { style: { padding: 0, minHeight: 0, backgroundColor: 'transparent' } },
    headRow: { style: { backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' } },
    headCells: { style: { fontSize: '11px', fontWeight: 600, color: '#64748b', paddingLeft: '12px' } },
    cells: { style: { fontSize: '13px', color: '#334155', padding: '12px' } },
    rows: { style: { minHeight: '52px' } },
  };

  const pastBookingsColumns = [
    {
      name: t('guest_details_column', 'Guest Details'),
      selector: (row: Guest) => row.guestName,
      sortable: true,
      grow: 2,
      cell: (row: Guest) => (
        <div className="flex flex-col py-2">
          <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
            <span>{row.guestName}</span>
            {row.isForeignGuest && (
              <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 rounded-sm">
                {t('passport_badge', 'Passport')}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
            <Phone className="w-3 h-3 text-slate-400" />
            <span>{row.phoneNumber || t('no_contact', 'No contact')}</span>
          </div>
        </div>
      ),
    },
    {
      name: t('stay_dates_column', 'Stay Dates'),
      selector: (row: Guest) => row.checkinDate,
      sortable: true,
      grow: 2,
      cell: (row: Guest) => (
        <div className="flex flex-col py-2">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <span className="text-[10px] uppercase text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-1 py-0.5 rounded-sm">{t('checkin_badge', 'IN')}</span>
            <span>{formatDateDDMMYY(row.checkinDate)}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-1">
            <span className="text-[10px] uppercase text-rose-600 bg-rose-50 dark:bg-rose-950/20 px-1 py-0.5 rounded-sm">{t('checkout_badge', 'OUT')}</span>
            <span>{formatDateDDMMYY(row.checkoutDate || row.expectedCheckout) || '—'}</span>
          </div>
        </div>
      ),
    },
    {
      name: t('cottage_room_column', 'Cottage / Room'),
      selector: (row: Guest) => row.roomNumber,
      sortable: true,
      grow: 1,
      cell: (row: Guest) => (
        <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
          <Home className="w-3.5 h-3.5 text-slate-400" />
          <span>{row.roomNumber || t('unassigned_label', 'Unassigned')}</span>
        </div>
      ),
    },
    {
      name: t('stay_status_column', 'Stay Status'),
      selector: (row: Guest) => row.status,
      sortable: true,
      width: '130px',
      cell: (row: Guest) => {
        const status = getGuestStayStatus(row);
        return (
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${status.color}`}>
            {status.label}
          </span>
        );
      },
    },
    {
      name: t('financial_ledger_column', 'Financial Ledger'),
      selector: (row: Guest) => calculateGuestTotal(row),
      sortable: true,
      grow: 2,
      cell: (row: Guest) => (
        <div className="flex flex-col py-2">
          <div className="flex items-center gap-1 font-semibold text-slate-900 dark:text-white">
            <span>{t('bill_field', 'Bill:')}</span>
            <span className="text-blue-600 dark:text-blue-400">₹{(row.totalAmount ?? row.roomRate ?? 0).toFixed(2)}</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap gap-x-2">
            <span>{t('adv_short_label', 'Adv:')} ₹{(row.advanceAmount ?? 0).toFixed(2)}</span>
            <span>•</span>
            <span className={calculateGuestTotal(row) <= 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-600 dark:text-amber-400 font-semibold'}>
              {calculateGuestTotal(row) <= 0 ? t('paid_label', 'Paid') : t('due_label', 'Due')}
            </span>
          </div>
        </div>
      ),
    },
    {
      name: t('c_form_filing_column', 'C-Form Filing'),
      selector: (row: Guest) => row.cFormFiledAt || '',
      sortable: true,
      grow: 2,
      cell: (row: Guest) => {
        if (!row.isForeignGuest) {
          return <span className="text-slate-400 dark:text-slate-600 text-xs">{t('na_indian_national_label', 'N/A (Indian National)')}</span>;
        }
        const isFiled = !!row.cFormFiledAt;
        const isSaving = savingCFormId === row.id;
        return (
          <label className="flex items-center gap-2 cursor-pointer py-1 text-xs select-none">
            <input
              type="checkbox"
              checked={isFiled}
              disabled={isSaving}
              onChange={(e) => handleToggleCForm(row, e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer disabled:opacity-50"
            />
            <span className={`font-semibold ${isFiled ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
              {isFiled ? (
                <span className="flex items-center gap-1">
                  <span>{t('filed_badge', 'Filed')}</span>
                  <span className="text-[10px] text-slate-400 font-normal">({formatDateDDMMYYYY(row.cFormFiledAt)})</span>
                </span>
              ) : (
                <span>{t('pending_filing_badge', 'Pending Filing')}</span>
              )}
            </span>
            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
          </label>
        );
      },
    },
    {
      name: t('actions_column', 'Actions'),
      width: '130px',
      cell: (row: Guest) => (
        <button
          onClick={() => handleEditGuest(row)}
          className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-600 font-semibold py-1.5 px-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs shadow-2xs cursor-pointer"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
          {t('edit_booking_button', 'Edit Booking')}
        </button>
      ),
    },
  ];

  return (
    <div className="billing-checkout space-y-6">
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
      <div className="billing-checkout__tabs bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 space-y-4">
        {/* Navigation Tabs */}
        <div className="billing-checkout__tab-list flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-3">
          <Button
            variant={activeTab === 'today' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('today')}
            rightIcon={<Badge variant="neutral">{tabCounts.today}</Badge>}
          >
            {t('today_tab', 'Today')}
          </Button>

          <Button
            variant={activeTab === 'upcoming' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('upcoming')}
            rightIcon={<Badge variant="neutral">{tabCounts.upcoming}</Badge>}
          >
            {t('upcoming_tab', 'Upcoming')}
          </Button>

          <Button
            variant={activeTab === 'past_bookings' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('past_bookings')}
            rightIcon={<Badge variant="neutral">{tabCounts.past_bookings}</Badge>}
          >
            {t('past_bookings_tab', 'Past Bookings')}
          </Button>
        </div>

        {/* Search Bar - covers room too (guest name, phone, OR room number),
            so the separate "Filter Room" dropdown next to it was pure
            redundant UI - removed 12 Aug 2026. */}
        <div className="billing-checkout__search flex flex-col sm:flex-row gap-3 items-center">
          <div className="billing-checkout__search-input flex-1 w-full">
            <Input
              leftIcon={<Search className="w-4 h-4 text-slate-400" />}
              placeholder={t('search_guest_placeholder', 'Search guest name, phone, or room...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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
              <h3 className="billing-checkout__subtitle text-[10px] font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                {dateGroup.label}
              </h3>
              {renderRoomGroupsGrid(dateGroup.roomGroups)}
            </div>
          ))}
        </div>
      ) : activeTab === 'past_bookings' ? (
        <div className="billing-checkout__past-table bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xs">
          <DataTable
            columns={pastBookingsColumns}
            data={searchedGuests}
            customStyles={pastBookingsTableStyles}
            pagination
            paginationPerPage={15}
            paginationRowsPerPageOptions={[10, 15, 20, 30, 50]}
            noDataComponent={
              <div className="p-12 text-center">
                <Search className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <h3 className="billing-checkout__subtitle text-lg font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  {t('no_guest_records_found', 'No Guest Records Found')}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {t('no_guest_records_description', 'No guest records match the current tab filter or search term. Switch tabs or room filter to view other reservations.')}
                </p>
              </div>
            }
          />
        </div>
      ) : (
        renderRoomGroupsGrid(filteredGroups)
      )}

      {/* Empty Search Result - Today/Upcoming room-grid only; the Past
          Bookings table has its own noDataComponent above. */}
      {activeTab !== 'past_bookings' && filteredGroups.length === 0 && (
        <div className="billing-checkout__empty-state bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-12 text-center">
          <Search className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="billing-checkout__subtitle text-lg font-semibold text-slate-800 dark:text-slate-200 mb-1">
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

