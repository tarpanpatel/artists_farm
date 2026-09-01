import React, { useState, useEffect, useMemo } from 'react';
import { Card, Drawer, TextInput, Checkbox, Tabs, TabItem, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from 'flowbite-react';
import { Button } from './Button';
import { TablePagination } from './TablePagination';
import { attachedTabsTheme, attachedTabsClearTheme } from '../utils/tabsTheme';
import { lazyWithRetry } from '../utils/lazyWithRetry';
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
  Globe,
  Edit2,
  Pencil,
  Eye,
  X,
} from './icons/FlowbiteIcons';
import { Guest, BillingReceipt } from '../types';
import { t } from '../i18n/en';
import { GUEST_STATUS_CHECKEDOUT_LEGACY, GUEST_STATUS_CHECKED_OUT } from '../constants/guestStatus';
import { Badge } from './Badge';
import { Popover } from './Popover';
import { useToast } from './ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { MobileBookingCardStack } from './MobileBookingCardStack';
import { ReceiptEditModal } from './ReceiptEditModal';
import { BookingDetailsModal } from './BookingDetailsModal';
import { PageHeader, PageHeaderButton } from './PageHeader';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { isCFormGenuinelyFiled } from '../utils/cFormStatus';
import { markCFormFiled } from '../services/api';

interface BillingCheckoutProps {
  guests: Guest[];
  receipts: BillingReceipt[];
  onCheckoutGuest: (receipt: BillingReceipt) => void;
  onUpdateGuest?: (updatedGuest: Guest) => void;
  onAddGuest?: (guest: Guest) => Promise<void>;
  isMultiKeyProperty?: boolean;
  rooms?: Array<{ id: number; name: string; slug: string }>;
  onCheckoutClick?: (guestId: string) => void;
  onNavigateToGuestRegistration?: () => void;
  kitchenModuleEnabled?: boolean;
  isLoading?: boolean;
  propertyGstin?: string;
  propertyName?: string;
  propertyPhone?: string;
  propertyMapsLink?: string;
  propertyWhatsappTemplate?: string;
  propertyAddress?: string;
  propertyInstructions?: string;
  propertyCheckinTime?: string;
  propertyCheckoutTime?: string;
  propertyUpiId?: string;
  propertyUpiQrCodeUrl?: string;
  focusGuestId?: string | null;
  // Threaded straight to BookingDetailsModal's Edit Booking calendar (1 Sep
  // 2026) - see that component's own prop comment for why this needs to
  // exist here at all (GuestManagement.tsx already fetches this once for
  // its own Add Booking flow; this avoids a second, redundant fetch).
  icalBlockedDates?: Array<{
    event_start: string;
    event_end: string;
    room_id?: number;
  }>;
}

interface GroupedRoomBooking {
  roomId: number;
  roomName: string;
  roomSlug: string;
  guests: Guest[];
}

const LazyGuestManagement = lazyWithRetry(
  () => import('./GuestManagement').then(m => ({ default: m.GuestManagement })),
  'GuestManagement'
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
  isLoading = false,
  propertyGstin = '',
  propertyName = '',
  propertyPhone = '',
  propertyMapsLink = '',
  propertyWhatsappTemplate = '',
  propertyAddress = '',
  propertyInstructions = '',
  propertyCheckinTime = '',
  propertyCheckoutTime = '',
  propertyUpiId = '',
  propertyUpiQrCodeUrl = '',
  focusGuestId = null,
  icalBlockedDates = [],
}) => {
  const { showToast } = useToast();
  const { activeRole } = useAuth();
  // ROLES.md (24 Aug 2026): same role gate BookingDetailsModal.tsx already
  // enforces (23 Aug 2026) - Staff Kitchen is view-only on bookings (no
  // edit/checkout), Staff can edit but not checkout. This page has its own
  // room-card and Past-bookings-table Edit/Checkout buttons that open
  // ReceiptEditModal/BookingDetailsModal directly, bypassing that modal's own
  // gate entirely - found 24 Aug 2026 (Staff Kitchen could still see and use
  // both here). Read directly from AuthContext, same pattern.
  const normalizedActiveRole = (activeRole || '').toLowerCase().trim();
  const isStaffKitchenRole = normalizedActiveRole === 'staff kitchen';
  const canActOnBooking = !isStaffKitchenRole;
  const canCheckoutBookingRole = !isStaffKitchenRole && normalizedActiveRole !== 'staff';
  const getInitialBookingsTab = (): 'today' | 'upcoming' | 'past_bookings' => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '').trim().toLowerCase();
      if (hash.includes('upcoming')) return 'upcoming';
      if (hash.includes('past')) return 'past_bookings';
      if (hash.includes('today')) return 'today';
      const stored = sessionStorage.getItem('artists_farm_bookings_tab');
      if (stored === 'upcoming' || stored === 'past_bookings' || stored === 'today') {
        return stored;
      }
    }
    return 'today';
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming' | 'past_bookings'>(getInitialBookingsTab);

  const handleTabSelect = (tab: 'today' | 'upcoming' | 'past_bookings') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('artists_farm_bookings_tab', tab);
      const currentRaw = window.location.hash.replace('#', '').trim();
      const basePart = currentRaw.split('?')[0].split('/')[0];
      const validBase = basePart && ['bookings', 'all_bookings', 'guests', 'guest_registration', 'billing_checkout'].includes(basePart)
        ? basePart
        : 'bookings';
      const newHash = tab === 'today' ? `#${validBase}` : `#${validBase}/${tab === 'past_bookings' ? 'past' : tab}`;
      if (window.location.hash !== newHash) {
        window.history.replaceState(null, '', newHash);
      }
    }
  };

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '').trim().toLowerCase();
      if (hash.includes('upcoming')) setActiveTab('upcoming');
      else if (hash.includes('past')) setActiveTab('past_bookings');
      else if (hash.includes('today')) setActiveTab('today');
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);
  const [pastBookingsDesktopPage, setPastBookingsDesktopPage] = useState(1);
  const PAST_BOOKINGS_PAGE_SIZE = 15;
  const [isProcessing] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [showAddBookingModal, setShowAddBookingModal] = useState(false);
  const [guestForReceipt, setGuestForReceipt] = useState<Guest | null>(null);
  const [modalMode, setModalMode] = useState<'edit-only' | 'edit-and-checkout'>('edit-only');
  const [selectedGuestForDetails, setSelectedGuestForDetails] = useState<Guest | null>(null);
  // Carries "which section to jump straight to" into BookingDetailsModal
  // when it's opened from a warning badge/popover here rather than a plain
  // Edit click (24 Aug 2026 - "if someone clicks such button from
  // dashboard or notification or bookings page this whole process should
  // happen"). null for the ordinary Edit/View Booking path.
  const [detailsModalFocusSection, setDetailsModalFocusSection] = useState<'c_form' | 'checkin' | 'id_verification' | null>(null);
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
  // When focusGuestId is passed (e.g. from clicking Checkout & Settle Bill on
  // Dashboard), switch to the guest's tab and open their Checkout modal directly
  // over the Bookings page while keeping all tab bookings visible in the background.
  useEffect(() => {
    if (!focusGuestId) return;
    const target = guests.find((g) => String(g.id) === String(focusGuestId));
    if (!target) return;
    setActiveTab(getGuestTabCategory(target));
    setGuestForReceipt(target);
    setModalMode('edit-and-checkout');
    setReceiptModalOpen(true);
    setSearchTerm('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusGuestId]);

  // Deep-link to a specific booking from URL (e.g. #guests?booking_id=708 or ?guest_id=708)
  useEffect(() => {
    const checkDeepLink = () => {
      if (!guests || guests.length === 0) return;
      if (typeof window === 'undefined') return;

      const rawHash = window.location.hash.replace('#', '').trim();
      const hashQuery = rawHash.includes('?') ? rawHash.split('?')[1] : '';
      const searchParams = new URLSearchParams(hashQuery || window.location.search);
      const targetBookingId = searchParams.get('booking_id') || searchParams.get('guest_id') || searchParams.get('id');

      if (targetBookingId) {
        const cleanTargetId = targetBookingId.trim();
        const matched = guests.find((g) =>
          String(g.id) === cleanTargetId ||
          String((g as any).bookingId) === cleanTargetId ||
          String((g as any).booking_id) === cleanTargetId
        );
        if (matched) {
          setSelectedGuestForDetails(matched);
          const category = getGuestTabCategory(matched);
          if (category === 'today' || category === 'upcoming' || category === 'past_bookings') {
            setActiveTab(category);
          }
        }
      }
    };

    checkDeepLink();
    window.addEventListener('hashchange', checkDeepLink);
    return () => window.removeEventListener('hashchange', checkDeepLink);
  }, [guests]);


  // Helper for badge labels on cards
  const getGuestStayStatus = (guest: Guest) => {
    // A cancelled booking is otherwise indistinguishable from a genuinely
    // finished one - getGuestDetailedStatus() folds 'Cancelled' into
    // 'past_bookings' regardless of dates, so a booking cancelled today with a
    // future check-in would read as "Past Booking". Surface it explicitly.
    if (String(guest.status || '') === 'Cancelled') {
      return { key: 'cancelled', label: t('cancelled_badge', 'Cancelled'), variant: 'danger' as const };
    }
    const cat = getGuestDetailedStatus(guest);
    if (cat === 'checkin_today') {
      return { key: 'staying', label: t('checked_in_today_badge', 'Checked In Today'), variant: 'success' as const };
    } else if (cat === 'checkout_today') {
      return { key: 'checkout', label: t('checkout_today_badge', 'Checkout Today'), variant: 'warning' as const };
    } else if (cat === 'upcoming') {
      return { key: 'upcoming', label: t('upcoming_booking_badge', 'Upcoming Booking'), variant: 'info' as const };
    } else {
      return { key: 'past', label: t('past_booking_badge', 'Past Booking'), variant: 'neutral' as const };
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

  // Handle edit only. focusSection is optional (see detailsModalFocusSection
  // above) - the plain Edit/View Booking buttons call this with none.
  const handleEditGuest = (guest: Guest, focusSection: 'c_form' | 'checkin' | 'id_verification' | null = null) => {
    setDetailsModalFocusSection(focusSection);
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
        return (
          <Card
            key={`${group.roomId}-${group.roomSlug}`}
            // flowbite-react's Card always wraps children in its own inner
            // div (theme's root.children: gap-4 + p-6) - className above
            // only reaches the outer bordered div, not that inner wrapper,
            // so the !p-0 below never actually removed the real 24px
            // padding/16px gap around the header. That stray padding+gap is
            // what made the header read as a disconnected, borderless card
            // floating inside this one (found 20 Aug 2026). Overriding
            // root.children directly (the documented way to reach it) is
            // what actually removes it.
            theme={{ root: { children: 'flex h-full flex-col gap-0 p-0' } }}
            className="billing-checkout__room-card shadow-md overflow-hidden flex flex-col justify-between !p-0"
          >
            {/* Room Header */}
            <div className="billing-checkout__room-card-header bg-gray-50 dark:bg-gray-700 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="billing-checkout__room-card-title text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5 truncate">
                <Building className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />
                {group.roomName}
              </h3>
            </div>

            {/* Guest Card(s) stacked inside Room Column */}
            <div className="billing-checkout__room-card-body p-4 space-y-4">
              {group.guests.map((guest) => {
                const amountDue = calculateGuestTotal(guest);
                const nights = calculateNights(guest.checkinDate, guest.expectedCheckout);
                const nightsDisplay = nights > 0 ? `${nights} night${nights !== 1 ? 's' : ''}` : t('same_day_stay', 'Same day stay');
                const stayStatus = getGuestStayStatus(guest);
                const canCheckout = stayStatus.key === 'staying' || stayStatus.key === 'checkout';

                return (
                  <div
                    key={guest.id}
                    // No bg/border/shadow/rounded/padding here - the parent
                    // Card (billing-checkout__room-card) already provides
                    // that frame; giving each guest its own box on top of it
                    // read as a nested "card inside a card" with doubled
                    // padding, since room-card-body already applies its own
                    // p-4 (found 19 Aug 2026). A room can only ever have one
                    // active booking (see CLAUDE.md's "1 room = 1 active
                    // booking maximum"), so this is virtually always a single
                    // item - space-y-4 on the parent is enough separation
                    // for the rare case of more than one.
                    className="billing-checkout__guest-card flex flex-col justify-between space-y-3"
                  >
                    {/* Top Header: Guest Name & Status Badge */}
                    <div>
                      <div className="billing-checkout__guest-card-header flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white m-0">
                              {guest.guestName}
                            </h4>
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-normal shrink-0">
                              ({guest.numberOfGuests || 1} {(guest.numberOfGuests || 1) === 1 ? 'guest' : 'guests'})
                            </span>
                            {guest.phoneNumber ? (
                              <a
                                href={`tel:${guest.phoneNumber}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline font-semibold shrink-0"
                                title={`Call ${guest.phoneNumber}`}
                              >
                                <Phone className="w-3 h-3 text-blue-500" />
                                <span>{guest.phoneNumber}</span>
                              </a>
                            ) : (
                              <span className="text-xs text-slate-400 dark:text-slate-500 italic shrink-0">
                                ({t('no_contact', 'No contact')})
                              </span>
                            )}
                            {guest.otaSource && (
                              // Click-triggered Popover (24 Aug 2026) - was a hover-only Badge
                              // `title` (rendered via Badge.tsx's Tooltip wrapper), which can't
                              // hold a clickable link and is a stuck-open risk on mobile taps
                              // (see CLAUDE.md's hover-popover rule). Room number dropped from
                              // the badge text itself - it's already the room card's own
                              // header, repeating it here is redundant.
                              <Popover
                                trigger="click"
                                placement="bottom"
                                content={
                                  <div className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed max-w-xs space-y-1.5">
                                    <p>{t('ota_converted_badge_tooltip', 'Converted from an OTA calendar sync - editing this only changes this app, not the original platform.')}</p>
                                    <p>
                                      <a href="#ical_sync" className="text-blue-600 dark:text-blue-400 font-semibold underline cursor-pointer">
                                        {t('manage_calendar_sync_link', 'Manage Calendar Sync Settings')}
                                      </a>
                                    </p>
                                  </div>
                                }
                              >
                                <span className="inline-flex cursor-pointer">
                                  <Badge
                                    variant="warning"
                                    size="sm"
                                    className="billing-checkout__ota-badge whitespace-nowrap shrink-0"
                                  >
                                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                      <Globe className="w-2.5 h-2.5 shrink-0" />
                                      <span>{guest.otaSourceLabel || guest.otaSource}</span>
                                    </span>
                                  </Badge>
                                </span>
                              </Popover>
                            )}
                          </div>
                        </div>
                        {/* Right Side Stack: Stay Status Badge (Checked In Today, etc.) + Warnings directly below */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <Badge variant={stayStatus.variant} size="sm" className="whitespace-nowrap">
                            {stayStatus.label}
                          </Badge>

                          {guest.isForeignGuest && (
                            // isCFormGenuinelyFiled(), not a bare cFormFiledAt check (25 Aug
                            // 2026) - see that helper's own comment.
                            isCFormGenuinelyFiled(guest) ? (
                              <Badge variant="success" size="sm" className="whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                                  <span>{t('c_form_filed_badge', 'C-Form Filed')}</span>
                                </span>
                              </Badge>
                            ) : (
                              // Click-triggered Popover (24 Aug 2026, same request/pattern
                              // as the "requiring attention today" pill above and the
                              // OTA badge elsewhere in this card) - a button straight to
                              // where the C-Form actually gets filed, instead of a
                              // dead-end warning with nowhere to go from here.
                              <Popover
                                trigger="click"
                                placement="bottom"
                                content={
                                  <div className="p-3 space-y-2 max-w-[220px]">
                                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                      {t('c_form_pending_popover_text', 'This foreign guest still needs a C-Form filed.')}
                                    </p>
                                    <Button variant="warning" size="xs" block onClick={() => handleEditGuest(guest, 'c_form')}>
                                      {t('resolve_c_form_button', 'Go to C-Form')}
                                    </Button>
                                  </div>
                                }
                              >
                                <span className="inline-flex cursor-pointer">
                                  <Badge variant="warning" size="sm" className="whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                      <AlertCircle className="w-3 h-3 shrink-0" />
                                      <span>{t('c_form_pending_badge', 'C-Form Pending')}</span>
                                    </span>
                                  </Badge>
                                </span>
                              </Popover>
                            )
                          )}
                          {guest.idVerificationStatus !== 'Complete' && (
                            <Popover
                              trigger="click"
                              placement="bottom"
                              content={
                                <div className="p-3 space-y-2 max-w-[220px]">
                                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                    {t('id_pending_popover_text', 'This guest\'s ID verification is still incomplete.')}
                                  </p>
                                  <Button variant="warning" size="xs" block onClick={() => handleEditGuest(guest, 'id_verification')}>
                                    {t('resolve_id_button', 'Go to ID Upload')}
                                  </Button>
                                </div>
                              }
                            >
                              <span className="inline-flex cursor-pointer">
                                <Badge variant="warning" size="sm" className="whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                    <AlertCircle className="w-3 h-3 shrink-0" />
                                    <span>{t('id_verification_pending_badge', 'ID Pending')}</span>
                                  </span>
                                </Badge>
                              </span>
                            </Popover>
                          )}
                        </div>
                      </div>

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

                    {/* Action Buttons - canActOnBooking/canCheckoutBookingRole
                        (ROLES.md, 24 Aug 2026): Staff Kitchen gets a single
                        view-only button that opens the same modal in its
                        already-read-only state; Staff gets Edit but never
                        Checkout even when the stay-status-based `canCheckout`
                        below would otherwise show it. */}
                    {!canActOnBooking ? (
                      <div className="billing-checkout__guest-card-actions pt-0.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          block
                          onClick={() => handleEditGuest(guest)}
                          leftIcon={<Eye className="w-3.5 h-3.5 shrink-0" />}
                        >
                          {t('view_booking_button', 'View Booking')}
                        </Button>
                      </div>
                    ) : canCheckout && canCheckoutBookingRole ? (
                      <div className="billing-checkout__guest-card-actions grid grid-cols-2 gap-2 pt-0.5">
                        <Button variant="edit" size="sm" onClick={() => handleEditGuest(guest)} leftIcon={<Edit2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}>
                          {t('edit_button', 'Edit')}
                        </Button>
                        <Button
                          variant="warning"
                          size="sm"
                          onClick={() => handleEditAndCheckoutGuest(guest)}
                          disabled={isProcessing}
                          leftIcon={<LogOut className="w-3.5 h-3.5 shrink-0" />}
                        >
                          {t('checkout_button', 'Checkout')}
                        </Button>
                      </div>
                    ) : (
                      <div className="billing-checkout__guest-card-actions pt-0.5">
                        <Button
                          variant="edit"
                          size="sm"
                          block
                          disabled={isProcessing}
                          onClick={() => handleEditGuest(guest)}
                          leftIcon={<Pencil className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
                        >
                          {t('edit_booking_button', 'Edit Booking')}
                        </Button>
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
          </Card>
        );
      })}
    </div>
  );


  const pastBookingsColumns = [
    {
      name: t('guest_details_column', 'Guest Details'),
      cell: (row: Guest) => (
        <div className="flex flex-col py-1">
          <div className="font-bold text-gray-900 dark:text-white text-sm">{row.guestName}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-0.5">
            <span>({row.numberOfGuests || 1} {(row.numberOfGuests || 1) === 1 ? 'guest' : 'guests'})</span>
            {row.phoneNumber ? (
              <a
                href={`tel:${row.phoneNumber}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                title={`Call ${row.phoneNumber}`}
              >
                <Phone className="w-3 h-3 text-blue-500" />
                <span>{row.phoneNumber}</span>
              </a>
            ) : (
              <span>{t('no_contact', 'No contact')}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      name: t('stay_dates_column', 'Stay Dates'),
      cell: (row: Guest) => (
        <div className="flex flex-col py-1 text-xs">
          <div className="font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
            <span className="text-2xs font-semibold uppercase text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">{t('checkin_badge', 'IN')}</span>
            <span>{formatDateDDMMYYYY(row.checkinDate)}</span>
          </div>
          <div className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mt-1">
            <span className="text-2xs font-semibold uppercase text-rose-700 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-800">{t('checkout_badge', 'OUT')}</span>
            <span>{formatDateDDMMYYYY(row.checkoutDate || row.expectedCheckout) || '—'}</span>
          </div>
        </div>
      ),
    },
    {
      name: t('cottage_room_column', 'Cottage / Room'),
      cell: (row: Guest) => (
        <div className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-white text-xs">
          <Home className="w-4 h-4 text-gray-400" />
          <span>{row.roomNumber || t('unassigned_label', 'Unassigned')}</span>
        </div>
      ),
    },
    {
      name: t('stay_status_column', 'Stay Status'),
      cell: (row: Guest) => {
        const status = getGuestStayStatus(row);
        return (
          <Badge variant={status.variant} size="sm">
            {status.label}
          </Badge>
        );
      },
    },
    {
      name: t('financial_ledger_column', 'Financial Ledger'),
      cell: (row: Guest) => (
        <div className="flex flex-col py-1 text-xs">
          <div className="flex items-center gap-1 font-semibold text-gray-900 dark:text-white">
            <span>{t('bill_field', 'Bill:')}</span>
            <span className="tabular-nums text-blue-600 dark:text-blue-400">₹{(row.totalAmount ?? row.roomRate ?? 0).toFixed(2)}</span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap gap-x-2">
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
      cell: (row: Guest) => {
        if (!row.isForeignGuest) {
          return <span className="text-gray-400 dark:text-gray-500 text-xs">{t('na_indian_national_label', 'N/A (Indian National)')}</span>;
        }
        // isCFormGenuinelyFiled(), not a bare cFormFiledAt check (25 Aug 2026) - see that
        // helper's own comment. cFormMissingProof covers the case this very checkbox used to
        // CAUSE: it toggled filed=true with no way to enter a confirmation number at all, so
        // every "Filed" it produced was exactly the unproven state the helper now excludes.
        const isFiled = isCFormGenuinelyFiled(row);
        const cFormMissingProof = !!row.cFormFiledAt && !isFiled;
        const isSaving = savingCFormId === row.id;
        return (
<label className="flex items-center gap-2 cursor-pointer py-1 text-xs select-none">
                  <Checkbox
                    checked={isFiled}
                    disabled={isSaving}
                    onChange={e => {
                      if (e.target.checked) {
                        // FIXED 25 Aug 2026 (live report: a booking showed "Filed" with an
                        // empty confirmation number, traced back to exactly this checkbox -
                        // it had no field to ever collect one) - checking this now opens the
                        // real C-Form section (which requires a number/document before it
                        // will save) instead of blindly toggling filed=true with nothing
                        // behind it. Unchecking still toggles directly - clearing "filed"
                        // never needed a number either, on this checkbox or in the modal.
                        handleEditGuest(row, 'c_form');
                      } else {
                        handleToggleCForm(row, false);
                      }
                    }}
                  />{" "}
                  <span className={`font-semibold ${cFormMissingProof ? 'text-amber-600 dark:text-amber-400' : isFiled ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
              {cFormMissingProof ? (
                <span>{t('filed_no_reference_badge', 'Filed (no reference)')}</span>
              ) : isFiled ? (
                <span className="flex items-center gap-1">
                  <span>{t('filed_badge', 'Filed')}</span>
                  <span className="text-2xs text-gray-400 font-normal">({formatDateDDMMYYYY(row.cFormFiledAt)})</span>
                </span>
              ) : (
                <span>{t('pending_filing_badge', 'Pending Filing')}</span>
              )}
            </span>
            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
          </label>
        );
      },
    },
    {
      name: t('actions_column', 'Actions'),
      cell: (row: Guest) => (
        // Standard <Button size="sm"> per DESIGN.md's DataTable Action
        // Buttons rule (20 Aug 2026) - was a hand-rolled <button> that had
        // drifted from the shared Button component used for this exact same
        // action elsewhere on this page (the room-card Edit button above).
        <div className="whitespace-nowrap flex items-center gap-2">
          {canActOnBooking ? (
            <Button
              variant="edit"
              size="sm"
              onClick={() => handleEditGuest(row)}
              leftIcon={<Pencil className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
            >
              {t('edit_booking_button', 'Edit Booking')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleEditGuest(row)}
              leftIcon={<Eye className="w-3.5 h-3.5 shrink-0" />}
            >
              {t('view_booking_button', 'View Booking')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div data-tour="bookings-manager" className="billing-checkout space-y-6">
      <PageHeader
        title={t('bookings_page_title', 'Bookings')}
        hideBorder
        forceRow
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

      {/* Booking desk: tabs are their own floating elements attached to the
          top of the card below (touching, zero gap) rather than sharing one
          outer bordered box with it - see DESIGN.md's "Attached Tabs
          Specification" and utils/tabsTheme.ts's attachedTabsTheme (which
          this reuses rather than redefining) for the full mechanism (20 Aug
          2026). This wrapper div carries NO border/bg/shadow of its own -
          it's purely a layout grouping so Tabs+Card behave as one zero-gap
          unit inside the page's outer space-y-6 flow, without visually
          enclosing the tabs inside the card the way a shared border would.
          Each TabItem is deliberately childless: the actual tab content
          (room grid / table / empty state) renders in the Card below,
          driven by the same activeTab state, rather than as this
          component's own tabpanel. */}
      <div className="billing-checkout__desk">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <Tabs
            aria-label="Booking Status Tabs"
            variant="default"
            theme={attachedTabsTheme}
            clearTheme={attachedTabsClearTheme}
            onActiveTabChange={(tabIndex: number) => {
              const tabs: ('today' | 'upcoming' | 'past_bookings')[] = ['today', 'upcoming', 'past_bookings'];
              if (tabs[tabIndex]) handleTabSelect(tabs[tabIndex]);
            }}
          >
            <TabItem
              active={activeTab === 'today'}
              title={
                <span className="inline-flex items-center gap-1.5">
                  <span>{t('today_tab', 'Today')}</span>
                  {tabCounts.today > 0 && (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-2xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      {tabCounts.today}
                    </span>
                  )}
                </span>
              }
            />
            <TabItem
              active={activeTab === 'upcoming'}
              title={
                <span className="inline-flex items-center gap-1.5">
                  <span>{t('upcoming_tab', 'Upcoming')}</span>
                  {tabCounts.upcoming > 0 && (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-2xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      {tabCounts.upcoming}
                    </span>
                  )}
                </span>
              }
            />
            <TabItem
              active={activeTab === 'past_bookings'}
              title={
                <span className="inline-flex items-center gap-1.5">
                  <span>{t('past_bookings_tab', 'Past')}</span>
                  {tabCounts.past_bookings > 0 && (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-2xs font-semibold rounded-full bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                      {tabCounts.past_bookings}
                    </span>
                  )}
                </span>
              }
            />
          </Tabs>

          {/* "N requiring attention today" pill removed (25 Aug 2026, explicit
              request) - the underlying C-Form/ID-verification alerting this
              summed up is already surfaced more prominently on the Dashboard's
              System Alerts panel (OperationalDashboard.tsx), so this was a
              redundant second surface for the same signal. */}
        </div>

        <Card className="billing-checkout__desk-body shadow-md space-y-4 rounded-t-none border-t-0 -mt-px">

          {/* Search Bar - covers room too (guest name, phone, OR room number) */}
          <div className="billing-checkout__search flex flex-col items-center gap-3 sm:flex-row">
            <div className="billing-checkout__search-input flex-1 w-full">
              <TextInput
                id="bookings-search"
                type="text"
                icon={Search}
                placeholder={t('search_guest_placeholder', 'Search by guest, phone, or room...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Rooms & booking content live inside the same card as the
              header/search above (merged 20 Aug 2026) rather than as
              separate cards stacked below it - this border-t is the only
              remaining seam between the two, matching the header row's own
              border-b above. Individual room tiles below keep their own
              Card framing (a grid of distinct rooms, not a duplicate box
              around the same content), but the past-bookings table and the
              empty-state message had their own redundant outer Card removed
              since they fill this whole area rather than sitting alongside
              other items in it. */}
          <div className="billing-checkout__list-content border-t border-gray-200 pt-4 dark:border-gray-700">
          {/* Upcoming & Past Bookings: Mobile Card Stack on phone viewports (md:hidden), Desktop Flowbite Table on md+ */}
          {(activeTab === 'upcoming' || activeTab === 'past_bookings') ? (
            <>
              <div className="md:hidden">
                <MobileBookingCardStack
                  guests={searchedGuests}
                  rooms={rooms}
                  hideSearchAndFilter
                  canEdit={canActOnBooking}
                  canCheckout={canCheckoutBookingRole}
                  onSelectGuest={(guestId) => {
                    const guest = searchedGuests.find((g) => g.id === guestId);
                    if (guest) setSelectedGuestForDetails(guest);
                  }}
                  onCheckoutGuest={(guestId) => {
                    const guest = searchedGuests.find((g) => g.id === guestId);
                    if (guest) {
                      setGuestForReceipt(guest);
                      setReceiptModalOpen(true);
                    }
                  }}
                />
              </div>

              <div className="hidden md:block billing-checkout__past-table overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                {searchedGuests.length === 0 ? (
                  <div className="p-12 text-center">
                    {isLoading ? (
                      <div className="flex flex-col items-center justify-center">
                        <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin mx-auto mb-3" />
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Loading bookings...</p>
                      </div>
                    ) : (
                      <>
                        <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                        <h3 className="billing-checkout__subtitle text-lg font-semibold text-gray-800 dark:text-gray-200">
                          {activeTab === 'upcoming'
                            ? t('no_upcoming_bookings', 'No upcoming bookings.')
                            : activeTab === 'past_bookings'
                            ? t('no_past_bookings', 'No past bookings.')
                            : t('no_bookings_today', 'No bookings today.')}
                        </h3>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <Table hoverable>
                      <TableHead>
                        <TableRow>
                          {pastBookingsColumns.map((col) => (
                            <TableHeadCell key={col.name}>{col.name}</TableHeadCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {searchedGuests.slice((pastBookingsDesktopPage - 1) * PAST_BOOKINGS_PAGE_SIZE, pastBookingsDesktopPage * PAST_BOOKINGS_PAGE_SIZE).map((row) => (
                          <TableRow key={row.id} className="bg-white dark:bg-gray-800">
                            {pastBookingsColumns.map((col) => (
                              <TableCell key={col.name}>{col.cell(row)}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <TablePagination
                      page={pastBookingsDesktopPage}
                      totalItems={searchedGuests.length}
                      pageSize={PAST_BOOKINGS_PAGE_SIZE}
                      onPageChange={setPastBookingsDesktopPage}
                      itemLabel="bookings"
                    />
                  </>
                )}
              </div>
            </>
          ) : (
            renderRoomGroupsGrid(filteredGroups)
          )}

          {/* Empty Search Result - Today room-grid only; the Upcoming/Past
              Bookings table has its own noDataComponent above. */}
          {activeTab === 'today' && filteredGroups.length === 0 && (
            <div className="billing-checkout__empty-state p-12 text-center">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center">
                  <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Loading bookings...</p>
                </div>
              ) : (
                <>
                  <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <h3 className="billing-checkout__subtitle text-lg font-semibold text-gray-800 dark:text-gray-200">
                    {t('no_bookings_today', 'No bookings today.')}
                  </h3>
                </>
              )}
            </div>
          )}
          </div>
        </Card>
      </div>

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
        propertyUpiId={propertyUpiId}
        propertyUpiQrCodeUrl={propertyUpiQrCodeUrl}
      />

      {/* Standard Booking Details & Editing Modal */}
      {selectedGuestForDetails && (
        <BookingDetailsModal
          guest={selectedGuestForDetails}
          initialFocusSection={detailsModalFocusSection}
          onClose={() => { setSelectedGuestForDetails(null); setDetailsModalFocusSection(null); }}
          onSave={async (updatedGuest) => {
            onUpdateGuest?.(updatedGuest);
            setSelectedGuestForDetails(null);
            showToast(`Booking changes saved successfully!`, { type: 'success' });
          }}
          rooms={rooms}
          isMultiKeyProperty={isMultiKeyProperty}
          checkedInGuests={guests}
          icalBlockedDates={icalBlockedDates}
          propertyName={propertyName}
          propertyPhone={propertyPhone}
          propertyMapsLink={propertyMapsLink}
          propertyWhatsappTemplate={propertyWhatsappTemplate}
          propertyAddress={propertyAddress}
          propertyInstructions={propertyInstructions}
          propertyCheckinTime={propertyCheckinTime}
          propertyCheckoutTime={propertyCheckoutTime}
          propertyUpiId={propertyUpiId}
          propertyUpiQrCodeUrl={propertyUpiQrCodeUrl}
          onCheckout={() => {
            const guest = selectedGuestForDetails;
            setSelectedGuestForDetails(null);
            if (guest) handleEditAndCheckoutGuest(guest);
          }}
        />
      )}

      {/* Add Booking Drawer */}
      <React.Suspense fallback={null}>
        <Drawer
          open={showAddBookingModal}
          onClose={() => setShowAddBookingModal(false)}
          position="right"
          className="z-58 w-full sm:max-w-lg md:max-w-xl p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
        >
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Plus className="w-4 h-4" />
              </div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white m-0">
                Add Guest Booking
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowAddBookingModal(false)}
              className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <LazyGuestManagement
              guests={guests}
              receipts={receipts}
              menu={[]}
              rooms={rooms}
              onAddGuest={async (guest) => {
                // Does NOT close here (31 Aug 2026) - a second, parallel copy
                // of the same bug already fixed in App.tsx's own Add Booking
                // drawer wrapper. Closing inside this wrapper ran BEFORE it
                // resolved, which is BEFORE the nested GuestManagement's own
                // onSubmit reached its resetBookingForm()/showToast('Guest
                // booked successfully!') right after awaiting this same call
                // - close-then-toast, backwards. onClose is already wired
                // below and GuestManagement's onSubmit calls it itself, right
                // after showToast fires - this wrapper just needs to await
                // and let errors propagate, same as before.
                await onAddGuest?.(guest);
              }}
              onCheckoutGuest={onCheckoutGuest}
              activeMenuItemKey="guest_registration"
              isMultiKeyProperty={isMultiKeyProperty}
              onClose={() => setShowAddBookingModal(false)}
              propertyName={propertyName}
              propertyUpiId={propertyUpiId}
              propertyUpiQrCodeUrl={propertyUpiQrCodeUrl}
            />
          </div>
        </Drawer>
      </React.Suspense>
    </div>
  );
};

