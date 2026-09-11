import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { PropertyGuestInfo } from '../utils/whatsappVoucherTemplate';
import { Card, Drawer, TextInput, Tabs, TabItem, TabsRef } from 'flowbite-react';
import { BookingCard } from './BookingCard';
import { TablePagination } from './TablePagination';
import { attachedTabsTheme, attachedTabsClearTheme } from '../utils/tabsTheme';
import { useSwipeTabs } from '../utils/useSwipeTabs';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import {
  Search,
  Building,
  Plus,
  Loader2,
  X,
} from './icons/FlowbiteIcons';
import { Guest, BillingReceipt } from '../types';
import { getWhatsAppPhone } from '../utils/phoneUtils';
import { t } from '../i18n/en';
import { GUEST_STATUS_CHECKEDOUT_LEGACY, GUEST_STATUS_CHECKED_OUT } from '../constants/guestStatus';
import { Badge } from './Badge';
import { useToast } from './ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from './ConfirmDialogContext';
import { MobileBookingCardStack } from './MobileBookingCardStack';
import { ReceiptEditModal } from './ReceiptEditModal';
import { BookingDetailsModal } from './BookingDetailsModal';
import { PageHeader, PageHeaderButton } from './PageHeader';

interface BillingCheckoutProps {
  guests: Guest[];
  receipts: BillingReceipt[];
  onCheckoutGuest: (receipt: BillingReceipt) => void;
  onUpdateGuest?: (updatedGuest: Guest) => void;
  // Both of these report something an endpoint has ALREADY written (
  // mark_c_form_filed / complete_checkin_verification), so they exist to keep
  // the app's guest list in step - never to trigger another save. Going back
  // through onUpdateGuest is what broke this: that row's updated_at has just
  // moved, so update_guest rejects it 409 stale_booking (4 Sep 2026).
  onCFormFiledUpdated?: (guestId: string, filedAt: string | null) => void;
  onGuestVerificationUpdated?: (guestId: string) => void;
  onDeleteGuest?: (guestId: string) => Promise<void>;
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
  propertyGuestInfo?: PropertyGuestInfo;
  propertyCheckinTime?: string;
  propertyCheckoutTime?: string;
  propertyUpiId?: string;
  propertyUpiQrCodeUrl?: string;
  /** Refundable deposit for a SINGLE property. A MULTI_KEY room carries its
   *  own on the room object, so this is only the single-unit fallback. */
  propertySecurityDeposit?: number | string | null;
  focusGuestId?: string | null;
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
  onCFormFiledUpdated,
  onGuestVerificationUpdated,
  onDeleteGuest,
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
  propertyGuestInfo,
  propertyCheckinTime = '',
  propertyCheckoutTime = '',
  propertyUpiId = '',
  propertyUpiQrCodeUrl = '',
  propertySecurityDeposit,
  focusGuestId = null,
}) => {
  const { showToast } = useToast();
  const { activeRole } = useAuth();
  const { confirm } = useConfirm();
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
  const tabsRef = useRef<TabsRef>(null);
  const bookingTabKeys: ('today' | 'upcoming' | 'past_bookings')[] = ['today', 'upcoming', 'past_bookings'];
  // Swipe left/right on the desk card below the tabs to move to the next/
  // previous one (11 Sep 2026, explicit request - "wherever there are tabs").
  const swipeHandlers = useSwipeTabs(tabsRef, bookingTabKeys.indexOf(activeTab), bookingTabKeys.length);

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

  const handleOpenWhatsApp = async (phoneNumber: string) => {
    const confirmed = await confirm({
      title: 'Open WhatsApp chat?',
      message: `Open a WhatsApp chat with ${phoneNumber}?`,
      confirmText: 'Open WhatsApp',
      cancelText: 'Cancel',
      variant: 'info',
    });
    if (confirmed) {
      window.open(`https://wa.me/${getWhatsAppPhone(phoneNumber)}`, '_blank', 'noopener,noreferrer');
    }
  };

  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);


  // Fine-grained status (used for per-guest badges, and to derive the
  // coarser tab category below) - distinguishes checking-in-today from
  // checking-out-today, even though both now share one "Today" tab.
  const getGuestDetailedStatus = (g: Guest) => {
    const statusStr = String(g.status || '');
    // A checked-out stay is always history regardless of its original dates
    // (e.g. an early departure) - unlike Cancelled below, there's no
    // still-future case to preserve for it.
    if (statusStr === GUEST_STATUS_CHECKEDOUT_LEGACY || statusStr === GUEST_STATUS_CHECKED_OUT) return 'past_bookings';
    // Cancelled deliberately does NOT get its own unconditional "always past"
    // rule (removed 8 Sep 2026, reported live: an OTA cancellation for a
    // still-future stay was invisible because nobody thought to check "Past"
    // for something that hasn't happened yet). It now falls through to the
    // same date logic below as any other booking, so it's filed by its
    // ORIGINAL dates - Upcoming if the stay was still ahead, Today if it was
    // for today, and only Past once those dates have actually elapsed. The
    // red "Cancelled" badge (getGuestStayStatus below) still marks it clearly
    // in whichever tab it lands in.

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

  // When focusGuestId is passed (e.g. from Telegram "Open in App" or deep-link),
  // switch to the guest's tab and open their Booking Details drawer directly.
  useEffect(() => {
    if (!focusGuestId || !guests || guests.length === 0) return;
    const cleanId = String(focusGuestId).trim().replace(/^#/, '');
    const target = guests.find((g) =>
      String(g.id) === cleanId ||
      String((g as any).bookingId) === cleanId ||
      String((g as any).booking_id) === cleanId
    );
    if (!target) return;
    const category = getGuestTabCategory(target);
    if (category === 'today' || category === 'upcoming' || category === 'past_bookings') {
      setActiveTab(category);
    }
    setSelectedGuestForDetails(target);
    setSearchTerm('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusGuestId, guests]);

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
    const filtered = uniqueGuests.filter((g) => getGuestTabCategory(g) === activeTab);
    // Upcoming needs the SOONEST arrival first (8 Sep 2026, explicit
    // request) - the raw guests array comes back checkin_date DESC from
    // get_guests (right for Today/Past: most recent first), which is
    // backwards here since staff need to see what's arriving soonest, not
    // furthest out. Today/Past keep the existing order untouched.
    if (activeTab === 'upcoming') {
      return [...filtered].sort((a, b) => {
        const aCheckin = (a.checkinDate || '').split(' ')[0].split('T')[0];
        const bCheckin = (b.checkinDate || '').split(' ')[0].split('T')[0];
        return aCheckin < bCheckin ? -1 : aCheckin > bCheckin ? 1 : 0;
      });
    }
    return filtered;
  }, [guests, activeTab, todayStr]);

  // Search applied once, up front, so every view built from it (room-grid,
  // date-grouped, table) reflects the same filtered set.
  const searchedGuests = useMemo(
    () => {
      const q = searchTerm.toLowerCase().trim();
      const numOnly = q.replace(/^#/, '');
      return targetGuests.filter((g) => {
        if (!q) return true;
        const nameMatch = (g.guestName || '').toLowerCase().includes(q);
        const phoneMatch = (g.phoneNumber || '').includes(q);
        const roomMatch = (g.roomNumber || '').toLowerCase().includes(q);
        const idMatch = numOnly.length > 0 && String(g.id || '').includes(numOnly);
        return nameMatch || phoneMatch || roomMatch || idMatch;
      });
    },
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




  // Handle edit only. focusSection is optional (see detailsModalFocusSection
  // above) - the plain Edit/View Booking buttons call this with none.
  const handleEditGuest = (guest: Guest, focusSection: 'c_form' | 'checkin' | 'id_verification' | null = null) => {
    setDetailsModalFocusSection(focusSection);
    setSelectedGuestForDetails(guest);
  };

  // C-Form filing toggle for the Past Bookings table (moved here from the
  // removed GuestHistory/"Past Guests" page - same API call, same instant-
  // mutate-then-bubble-up pattern BookingDetailsModal already uses).
  // Handle edit and checkout
  const handleEditAndCheckoutGuest = (guest: Guest) => {
    setGuestForReceipt(guest);
    setModalMode('edit-and-checkout');
    setReceiptModalOpen(true);
  };


  // Renders the room-column grid for a given set of room groups - shared by
  // the main Today/Past view and each date-section under Upcoming, so the
  // room card itself (guest list, financials, actions) only exists once.
  const renderRoomGroupsGrid = (groups: GroupedRoomBooking[]) => (
    <div className="billing-checkout__grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 sm:gap-12 md:gap-8 lg:gap-10 items-start">
      {groups.map((group) => {
        const isTurnoverRoom = group.guests.length > 1;

        return (
          <Card
            key={`${group.roomId}-${group.roomSlug}`}
            theme={{ root: { children: 'flex h-full flex-col gap-0 p-0' } }}
            className="billing-checkout__room-card rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm sm:shadow-md overflow-hidden flex flex-col justify-between !p-0 bg-white dark:bg-slate-800"
          >
            {/* Room Header - distinct visual anchor with icon pill & booking count */}
            {rooms.length > 0 && (
              <div className="billing-checkout__room-card-header bg-slate-100/90 dark:bg-slate-800/90 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <h3 className="billing-checkout__room-card-title text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 truncate">
                  <span className="p-1 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shrink-0">
                    <Building className="w-3.5 h-3.5" />
                  </span>
                  <span className="truncate">{group.roomName}</span>
                </h3>
                {isTurnoverRoom ? (
                  <Badge variant="warning" size="sm" className="shrink-0">
                    {t('turnover_badge', 'Turnover (2 Bookings)')}
                  </Badge>
                ) : (
                  <span className="text-2xs font-semibold px-2 py-0.5 rounded bg-slate-200/70 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                    {group.guests.length} {group.guests.length === 1 ? 'Booking' : 'Bookings'}
                  </span>
                )}
              </div>
            )}

            {/* Guest Card(s) stacked inside Room Column */}
            <div className={`billing-checkout__room-card-body p-3.5 sm:p-4 space-y-6 ${isTurnoverRoom ? 'bg-slate-50/50 dark:bg-slate-900/30' : ''}`}>
              {group.guests.map((guest) => (
                <BookingCard
                  key={guest.id}
                  guest={guest}
                  // The room card above already draws the box, so a single
                  // booking inside it renders flush - no card-in-a-card. A
                  // TURNOVER room keeps the per-booking cards: there the border
                  // is the only thing separating two different stays in one
                  // room, and it carries the amber/emerald status colour too.
                  flush={!isTurnoverRoom}
                  isTurnoverRoom={isTurnoverRoom}
                  canActOnBooking={canActOnBooking}
                  canCheckoutBookingRole={canCheckoutBookingRole}
                  onEditGuest={handleEditGuest}
                  onEditAndCheckoutGuest={handleEditAndCheckoutGuest}
                  onOpenWhatsApp={(phone) => handleOpenWhatsApp(phone)}
                  isProcessing={isProcessing}
                />
              ))}

            </div>
          </Card>
        );
      })}
    </div>
  );


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
            ref={tabsRef}
            aria-label="Booking Status Tabs"
            variant="default"
            theme={attachedTabsTheme}
            clearTheme={attachedTabsClearTheme}
            onActiveTabChange={(tabIndex: number) => {
              if (bookingTabKeys[tabIndex]) handleTabSelect(bookingTabKeys[tabIndex]);
            }}
          >
            <TabItem
              active={activeTab === 'today'}
              title={
                <span className="inline-flex items-center gap-1.5">
                  <span>{t('today_tab', 'Today')}</span>
                  {tabCounts.today > 0 && (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-2xs font-semibold rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
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
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-2xs font-semibold rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
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
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-2xs font-semibold rounded-md bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
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

        {/* rounded-tl-none, not rounded-t-none (2 Sep 2026, user report: top-
            right corner should stay rounded like the bottom two, only
            top-left needs to be flush). The Tabs row above only clusters on
            the left (Today/Upcoming/Past), not the card's full width, so only
            the top-left corner actually sits under a tab - the top-right
            corner has empty space above it and looks broken/half-finished
            squared off to match nothing. sm:rounded-tl-none/sm:border-t-0
            alongside the bare versions for the same reason as before: the
            global Card theme (main.tsx) added border-y sm:border, and bare
            vs sm:-prefixed utilities live in different Tailwind variant
            scopes so they don't cancel each other out on their own - the
            sm: rule from the theme kept winning at >=640px. border-t-0 still
            drops the WHOLE top border (not just the left corner's) since the
            seam under the tabs runs the full width, not just under Today. */}
        <Card
          className="billing-checkout__desk-body shadow-md space-y-4 rounded-tl-none border-t-0 sm:rounded-tl-none sm:border-t-0 -mt-px"
          onTouchStart={swipeHandlers.onTouchStart}
          onTouchEnd={swipeHandlers.onTouchEnd}
        >

          {/* Search Bar - covers room too (guest name, phone, OR room number) */}
          <div className="billing-checkout__search flex flex-col items-center gap-3 sm:flex-row">
            <div className="billing-checkout__search-input flex-1 w-full">
              <TextInput
                id="bookings-search"
                type="text"
                placeholder={t('search_guest_placeholder', 'Search by booking ID, guest, phone, or room...')}
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
          <div className="billing-checkout__list-content border-t border-gray-200 pt-4 dark:border-gray-700 px-1 sm:px-0">
          {/* Upcoming & Past Bookings: same <BookingCard> the Today grid uses,
              on every viewport - single-column stack on phones
              (MobileBookingCardStack), a responsive grid on md+ (below).
              Used to be a completely different Flowbite <Table> on desktop -
              exactly the inconsistency the Universal Booking Card
              Consistency Rule (AGENTS.md/DESIGN.md) already calls for (8 Sep
              2026, explicit report + screenshot: "make sure how booking
              cards are on Today tab, they should look the same on upcoming
              and past"). Flat, not room-grouped like Today - a chronological
              Upcoming/Past list spans many rooms, so each card carries its
              own room badge (showRoomBadge) instead of a shared group
              header; that's the "content can differ as per logic" part. */}
          {(activeTab === 'upcoming' || activeTab === 'past_bookings') ? (
            <>
              <div className="md:hidden">
                <MobileBookingCardStack
                  guests={searchedGuests}
                  rooms={rooms}
                  hideSearchAndFilter
                  canEdit={canActOnBooking}
                  canCheckout={canCheckoutBookingRole}
                  onOpenWhatsApp={(guest) => guest.phoneNumber && handleOpenWhatsApp(guest.phoneNumber)}
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

              <div className="hidden md:block billing-checkout__past-cards">
                {searchedGuests.length === 0 ? (
                  <div className="p-12 text-center rounded-lg border border-gray-200 dark:border-gray-700">
                    {isLoading ? (
                      <div className="flex flex-col items-center justify-center">
                        <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin mx-auto mb-3" />
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Loading bookings...</p>
                      </div>
                    ) : (
                      <>
                        <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                        <h3 className="billing-checkout__subtitle text-lg font-semibold text-gray-800 dark:text-gray-200">
                          {searchTerm.trim()
                            ? t('no_bookings_matching_criteria', 'No bookings found matching your criteria.')
                            : activeTab === 'upcoming'
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
                    <div className="billing-checkout__grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {searchedGuests
                        .slice((pastBookingsDesktopPage - 1) * PAST_BOOKINGS_PAGE_SIZE, pastBookingsDesktopPage * PAST_BOOKINGS_PAGE_SIZE)
                        .map((guest) => (
                          <BookingCard
                            key={guest.id}
                            guest={guest}
                            showRoomBadge
                            canActOnBooking={canActOnBooking}
                            canCheckoutBookingRole={canCheckoutBookingRole}
                            onEditGuest={handleEditGuest}
                            onEditAndCheckoutGuest={handleEditAndCheckoutGuest}
                            onOpenWhatsApp={(phone) => handleOpenWhatsApp(phone)}
                            isProcessing={isProcessing}
                          />
                        ))}
                    </div>
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
                  {/* CLAUDE.md hard rule (One Loading Spinner Identity, App-Wide): never a
                      Loader2/icon spinner - it silently falls back to a different glyph
                      (refresh icon) if the icon set has no real spinner shape, which is
                      exactly how this regressed before. Plain CSS border-ring only, same
                      size/style/speed as App.tsx's TabContentFallback (found in review,
                      2 Sep 2026 - this was a Loader2 icon). */}
                  <div className="w-8 h-8 mx-auto mb-3 rounded-full border-[3px] border-blue-100 border-t-blue-500 dark:border-slate-800 dark:border-t-blue-400 loading-screen-spinner-spin" />
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Loading bookings...</p>
                </div>
              ) : (
                <>
                  <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <h3 className="billing-checkout__subtitle text-lg font-semibold text-gray-800 dark:text-gray-200">
                    {searchTerm.trim()
                      ? t('no_bookings_matching_criteria', 'No bookings found matching your criteria.')
                      : t('no_bookings_today', 'No bookings today.')}
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
          propertySecurityDeposit={propertySecurityDeposit}
          guest={selectedGuestForDetails}
          initialFocusSection={detailsModalFocusSection}
          onClose={() => { setSelectedGuestForDetails(null); setDetailsModalFocusSection(null); }}
          onDelete={onDeleteGuest}
          onSave={async (updatedGuest) => {
            onUpdateGuest?.(updatedGuest);
            setSelectedGuestForDetails(null);
            showToast(`Booking changes saved successfully!`, { type: 'success' });
          }}
          rooms={rooms}
          isMultiKeyProperty={isMultiKeyProperty}
          checkedInGuests={guests}
          propertyName={propertyName}
          propertyPhone={propertyPhone}
          propertyMapsLink={propertyMapsLink}
          propertyWhatsappTemplate={propertyWhatsappTemplate}
          propertyAddress={propertyAddress}
          propertyInstructions={propertyInstructions}
          propertyGuestInfo={propertyGuestInfo}
          propertyCheckinTime={propertyCheckinTime}
          propertyCheckoutTime={propertyCheckoutTime}
          propertyUpiId={propertyUpiId}
          propertyUpiQrCodeUrl={propertyUpiQrCodeUrl}
          onCFormFiled={(guestId, filedAt) => {
            setSelectedGuestForDetails((prev) => (prev ? { ...prev, cFormFiledAt: filedAt } : prev));
            onCFormFiledUpdated?.(guestId, filedAt);
          }}
          onIdVerified={(guestId) => {
            setSelectedGuestForDetails((prev) => (prev ? { ...prev, idVerificationStatus: 'Complete' } : prev));
            onGuestVerificationUpdated?.(guestId);
          }}
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
