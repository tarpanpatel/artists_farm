import React, { useState, useEffect } from 'react';
import { Drawer, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell, Checkbox, Datepicker } from 'flowbite-react';
import { X, ChevronLeft, ChevronRight } from './icons/FlowbiteIcons';
import { Popover } from './Popover';
import {
  AlertTriangle,
  User,
  Calendar,
  Utensils,
  ArrowRight,
  CheckCircle2,
  Plus,
  Pencil,
  LogOut,
  Bell,
  ChevronUp,
  ChevronDown,
  Globe,
} from './icons/FlowbiteIcons';
import { Guest } from '../types';
import { useInventoryContext } from '../contexts/InventoryContext';
import { useKitchenContext } from '../contexts/KitchenContext';
import { ConvertOtaBookingModal } from './ConvertOtaBookingModal';
import {
  GUEST_STATUS_CHECKED_IN,
  GUEST_STATUS_CHECKED_OUT,
  GUEST_STATUS_BOOKED,
  GUEST_STATUS_ACTIVE_LEGACY,
  GUEST_STATUS_CHECKEDOUT_LEGACY,
} from '../constants/guestStatus';
import { getPropertySlug, markCFormFiled } from '../services/api';
import { GuestManagement } from './GuestManagement';
import { CheckinVerificationModal } from './CheckinVerificationModal';
import { BookingDetailsModal } from './BookingDetailsModal';
import { useToast } from './ToastContext';
import { PageHeader, PageHeaderButton } from './PageHeader';
import { KpiCard } from './KpiCard';
import { Input } from './Input';
import { t } from '../i18n/en';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { shareTextContent } from '../utils/shareText';
import { Share2 } from './icons/FlowbiteIcons';

interface OperationalDashboardProps {
  guests: Guest[];
  receipts?: any[];
  menu?: any[];
  roomName?: string;
  roomId?: number;
  propertySlug?: string;
  rooms?: any[];
  onNavigate: (tab: any, menuItemKey?: string) => void;
  onOpenCheckin: () => void;
  onAddGuest?: (guest: Guest) => void;
  onCheckoutGuest?: (receipt: any) => void;
  onDispatchTelegram?: (eventType: string, message: string, channelFilter?: 'all' | 'kitchen' | 'finance' | 'admin', replyMarkup?: any, templateKey?: string) => void;
  onUpdateRoomName?: (newName: string) => void;
  onUpdateBooking?: (guest: Guest) => Promise<void>;
  onDeleteBooking?: (guestId: string) => Promise<void>;
  onGuestVerificationUpdated?: (guestId: string) => void;
  onCFormFiledUpdated?: (guestId: string, filedAt: string | null) => void;
  onGuestCheckedIn?: (guestId: string) => void;
  activeMenuItemKey?: string;
  kitchenModuleEnabled?: boolean;
  // Per-role Kitchen permission (23 Aug 2026), distinct from
  // kitchenModuleEnabled above which is a property-wide feature toggle - see
  // App.tsx's kitchenAccessAllowed for the umbrella-permission check this
  // comes from. Defaults true so this stays harmless if a call site ever
  // forgets to pass it, matching kitchenModuleEnabled's own default below.
  kitchenAccessAllowed?: boolean;
  propertyName?: string;
  propertyMapsLink?: string;
  propertyPhone?: string;
  propertyWhatsappTemplate?: string;
  propertyUpiId?: string;
  propertyUpiQrCodeUrl?: string;
  propertyAddress?: string;
  propertyGoogleMapsLink?: string;
  propertyInstructions?: string;
  propertyCheckinTime?: string;
  propertyCheckoutTime?: string;
  onSavePropertyLocation?: (address: string, googleMapsLink: string, instructions: string) => Promise<boolean>;
  isMultiKeyProperty?: boolean;
  serviceRequests?: any[];
  onCheckout?: (guestId: string) => void;
  // Used when this is embedded next to a room's own Edit Property form (see
  // MultiKeyPropertyOverview's 'edit_property' branch) - just the booking
  // calendar (still fully interactive - clicking a booking still opens
  // BookingDetailsModal), none of the property-wide Arrivals/Departures/
  // Alerts/Kitchen/Requisitions summary widgets that belong on the real
  // Dashboard tab, not a room-editing screen.
  minimalMode?: boolean;
}

export const OperationalDashboard: React.FC<OperationalDashboardProps> = ({
  guests,
  receipts = [],
  menu = [],
  rooms = [],
  roomName,
  roomId,
  propertySlug: _propertySlug,
  onNavigate,
  onOpenCheckin: _onOpenCheckin,
  onAddGuest,
  onCheckoutGuest,
  onDispatchTelegram,
  onUpdateRoomName,
  onUpdateBooking,
  onDeleteBooking,
  onGuestVerificationUpdated,
  onCFormFiledUpdated,
  onGuestCheckedIn,
  activeMenuItemKey: _activeMenuItemKey,
  kitchenModuleEnabled = true,
  kitchenAccessAllowed = true,
  propertyName = '',
  propertyMapsLink = '',
  propertyPhone = '',
  propertyWhatsappTemplate = '',
  propertyUpiId = '',
  propertyUpiQrCodeUrl = '',
  propertyAddress = '',
  propertyGoogleMapsLink = '',
  propertyInstructions = '',
  propertyCheckinTime = '',
  propertyCheckoutTime = '',
  onSavePropertyLocation: _onSavePropertyLocation,
  isMultiKeyProperty = false,
  serviceRequests = [],
  onCheckout,
  minimalMode = false,
}) => {
  const { showToast } = useToast();
  const { orders } = useKitchenContext();
  const pendingOrders = orders.filter((o) => o.status === 'Pending' || o.status === 'Preparing');
  const recentOrders = orders.slice(0, 5);
  const { inventory } = useInventoryContext();
  const [selectedBooking, setSelectedBooking] = useState<Guest | null>(null);
  const [showCheckinVerification, setShowCheckinVerification] = useState(false);
  const [isEditingRoomName, setIsEditingRoomName] = useState(false);
  const [editingRoomName, setEditingRoomName] = useState(roomName || '');
  const [showAddGuestModal, setShowAddGuestModal] = useState(false);
  const [showCleared, setShowCleared] = useState(false);
  const [showAllAlertsModal, setShowAllAlertsModal] = useState(false);
  // Which day cell's "+N more" popover is open, keyed by dateStr - Popover
  // manages its own open state internally by default, but left uncontrolled
  // it doesn't close itself when a row inside it opens BookingDetailsModal,
  // so it's still "open" (just hidden behind the modal's backdrop) and pops
  // back up the moment that modal is closed. One shared piece of state lets
  // every row explicitly close its own popover in the same click that opens
  // the modal.
  const [openOverflowDateStr, setOpenOverflowDateStr] = useState<string | null>(null);
  // Same pattern as above, for the single-booking summary popover on each day
  // cell's chip: clicking the chip used to both toggle a hover-triggered
  // Popover AND fire the chip's own onClick straight into
  // setSelectedBooking() - opening BookingDetailsModal immediately, on the
  // very same click that was supposed to just reveal the popover's summary
  // first. On touch devices especially (no real hover state), this meant a
  // single tap opened the popover AND the modal at once, with the popover
  // rendering on top of the modal it was meant to lead into (found 22 Aug
  // 2026). Fixed by making this popover click-triggered and controlled - the
  // chip only ever toggles it open/closed now; only its own "View More"
  // button opens the modal, closing the popover in that same click.
  // Keyed as `${booking.id}-${dateStr}`, NOT just booking.id (found 22 Aug
  // 2026): a multi-night booking renders one chip per day cell, all sharing
  // the same booking id, so keying by id alone made clicking ANY one of its
  // day cells satisfy `open === id` for every other day cell of that same
  // booking too - all of them popped their popover open at once, stacked on
  // top of each other. Including the specific day cell's own date string
  // scopes "open" to the exact chip that was clicked.
  const [openBookingPopoverId, setOpenBookingPopoverId] = useState<string | null>(null);
  // Same controlled-popover pattern, for the OTA-blocked chip (22 Aug 2026) -
  // see the otaPopoverKey comment at its Popover usage below.
  const [openOtaPopoverId, setOpenOtaPopoverId] = useState<string | null>(null);
  const [blockedDates, setBlockedDates] = useState<Array<{
    event_start: string;
    event_end: string;
    event_title: string;
    external_event_id: string;
    reservation_url?: string;
    source?: string;
    source_label?: string;
  }>>([]);
  const [otaConversionTarget, setOtaConversionTarget] = useState<{ block: (typeof blockedDates)[number]; blockedDateStrings: string[] } | null>(null);

  // Every date already spoken for on this calendar (any other guest stay, or
  // any other still-unclaimed OTA block) - fed to ConvertOtaBookingModal's
  // DateRangePicker so adjusting a converted booking's dates gets the same
  // "already taken" highlighting every other booking flow gets. `guests` here
  // is already scoped to this exact calendar (the whole SINGLE property, or
  // just one room's guests when this is a per-room instance), so no extra
  // room filtering is needed the way TodayOverview.tsx's multi-room table
  // requires.
  const expandRangeToDayStrings = (startVal: any, endVal: any): string[] => {
    const days: string[] = [];
    const cur = new Date(String(startVal || '').split(' ')[0].split('T')[0]);
    const end = new Date(String(endVal || '').split(' ')[0].split('T')[0]);
    cur.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    while (cur < end) {
      days.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  };

  // Hoisted out of the calendar-grid IIFE below (it used to be computed
  // fresh inside there) so the new "unconverted OTA block" alerts section
  // can reuse the exact same list without duplicating the computation -
  // both just need "every date already spoken for on this calendar",
  // nothing calendar-grid-specific.
  const allOccupiedDateStrings = [
    ...guests.flatMap((g) => expandRangeToDayStrings(g.checkinDate, g.expectedCheckout || (g as any).checkoutDate || g.checkinDate)),
    ...blockedDates.flatMap((bd) => expandRangeToDayStrings(bd.event_start, bd.event_end)),
  ];

  // Shared "Convert to Booking" trigger for an OTA-blocked date range -
  // used by both the calendar's own OTA segment (below) and the new
  // System Alerts "unconverted OTA booking" rows, so there's exactly one
  // place building the otaConversionTarget payload.
  const handleConvertOtaBlock = (block: (typeof blockedDates)[number]) => {
    const ownDays = new Set(expandRangeToDayStrings(block.event_start, block.event_end));
    setOtaConversionTarget({
      block,
      blockedDateStrings: allOccupiedDateStrings.filter((dstr) => !ownDays.has(dstr)),
    });
  };

  // Fetch blocked dates from iCal sync. Also re-run after a successful
  // "Convert to Booking" (see otaConversionTarget below) - the backend's
  // getBlockedDates() excludes any block a guest row now claims, so
  // refetching is what makes the capsule disappear immediately instead of
  // waiting for the next mount/reload.
  const fetchBlockedDates = async () => {
    try {
      const propertySlug = getPropertySlug();
      const response = await fetch('/php/api/ical_sync.php?action=get_blocked_dates', {
        headers: { 'X-Property-Slug': propertySlug },
        credentials: 'include',
      });
      const data = await response.json();
      if (data.status === 'success' && data.data) {
        setBlockedDates(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch blocked dates:', error);
    }
  };
  useEffect(() => {
    fetchBlockedDates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Low stock alerts where currentStock <= minThreshold
  const stockAlerts = inventory.filter((item) => item.currentStock <= item.minThreshold);

  // Booking Matrix logic for current month
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Month navigation (22 Aug 2026, explicit request - feature parity with
  // the multi-property calendar in TodayOverview.tsx, which can already
  // browse other months). `monthOffset` is months away from the REAL
  // current month, not a mutated Date - `viewDate` below is what the grid
  // actually renders, kept separate from `today` (which several other
  // things in this component - alerts, in-stay checks, `todayStr` - need to
  // stay pinned to the actual real-world date regardless of which month
  // the calendar is currently displaying).
  const [monthOffset, setMonthOffset] = useState(0);
  const viewDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Month/year dropdown (22 Aug 2026) - the "August 2026" label used to be
  // plain text, only movable one month at a time via the arrow buttons on
  // either side. flowbite-react's own Datepicker already has a built-in
  // Months/Years/Decades picker (click its header title to cycle views) -
  // reused here as a fast "jump straight to November" path instead of
  // building a custom month/year selector from scratch. It only ever
  // DISPLAYS viewDate and reports a new one back via onChange - monthOffset
  // (not the picker) stays the single source of truth for which month the
  // grid below actually renders, same as the arrow buttons already do.
  const handleMonthPickerChange = (date: Date | null) => {
    if (!date) return;
    const newOffset = (date.getFullYear() - today.getFullYear()) * 12 + (date.getMonth() - today.getMonth());
    setMonthOffset(newOffset);
  };
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Pinned to the REAL today (today.getFullYear()/getMonth()), NOT the
  // navigable `year`/`month` above - "Arrivals Today"/"Departures Today"
  // must keep meaning the actual current day even while browsing a
  // different month's grid.
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // --- Front-desk alerts: bookings needing attention, with no time cutoff so
  // stale/forgotten bookings from any point in the past still surface. ---
  const parseDateOnly = (dateStr?: string): Date | null => {
    if (!dateStr) return null;
    const d = new Date(dateStr.split(' ')[0]);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const formatAlertDate = (dateStr?: string) => {
    const dateOnly = (dateStr || '').split(' ')[0];
    const parts = dateOnly.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateOnly;
  };

  // True only while today actually falls inside [checkin, checkout) - some
  // seed/demo data marks bookings Active immediately regardless of date, so
  // status alone isn't enough to say a guest is in-house right now.
  const isCurrentlyInStay = (g: Guest) => {
    const checkin = parseDateOnly(g.checkinDate);
    const checkout = parseDateOnly(g.expectedCheckout);
    return checkin !== null && checkout !== null && today >= checkin && today < checkout;
  };

  const getGuestPendingReasons = (g: Guest): string[] => {
    const reasons: string[] = [];
    const status = String(g.status || '').trim().toLowerCase();
    const isCheckedOut = status === 'checkedout' || status === 'checked out';
    if (isCheckedOut || status === 'cancelled' || status === 'canceled') return reasons;

    const isCheckedIn = status === 'active' || status === 'checked in' || status === 'checkedin';
    const isBooked = !isCheckedIn;

    // Check if this is an upcoming booking (arrival date is in the future)
    let isUpcoming = false;
    if (isBooked && g.checkinDate) {
      const checkinDate = parseDateOnly(g.checkinDate);
      if (checkinDate !== null && today < checkinDate) {
        isUpcoming = true;
      }
    }

    // For upcoming bookings (guest has not arrived yet), ID, C-Form, and check-in are not pending
    if (isUpcoming) {
      return reasons;
    }

    // 1. ID Upload Pending (only for checked-in guests or guests arriving today/overdue)
    if (g.idVerificationStatus !== 'Complete') {
      reasons.push('ID Pending');
    }

    // 2. Check-in Pending (Arrival date was today or earlier, but stay is not checked in)
    if (isBooked && g.checkinDate) {
      const checkinDate = parseDateOnly(g.checkinDate);
      if (checkinDate !== null && today >= checkinDate) {
        reasons.push('Check-in Pending');
      }
    }

    // 3. Checkout Pending (Expected checkout is today or earlier, but still checked in)
    if (isCheckedIn && g.expectedCheckout) {
      const checkoutDate = parseDateOnly(g.expectedCheckout);
      if (checkoutDate !== null && today >= checkoutDate) {
        reasons.push('Checkout Pending');
      }
    }

    // 4. C-Form Pending (Foreign guest without filed C-Form arriving today or currently checked in)
    if (g.isForeignGuest && !g.cFormFiledAt && !g.cFormNumber && !(g as any).c_form_number) {
      reasons.push('C-Form Pending');
    }

    return reasons;
  };

  const todaysArrivalsCount = guests.filter((g) => (g.checkinDate || '').split(' ')[0] === todayStr).length;
  const todaysDeparturesCount = guests.filter((g) => (g.expectedCheckout || '').split(' ')[0] === todayStr).length;
  const inHouseCount = guests.filter((g) => (g.status === GUEST_STATUS_ACTIVE_LEGACY || g.status === GUEST_STATUS_CHECKED_IN) && isCurrentlyInStay(g)).length;
  const pendingRequestsCount = (serviceRequests || []).filter((r) => r.status === 'Pending').length;

  const overdueCheckins = guests.filter((g) => {
    const checkin = parseDateOnly(g.checkinDate);
    return g.status === GUEST_STATUS_BOOKED && checkin !== null && checkin <= today;
  });
  const overdueCheckouts = guests.filter((g) => {
    const checkout = parseDateOnly(g.expectedCheckout);
    return (g.status === GUEST_STATUS_ACTIVE_LEGACY || (g.status as string) === GUEST_STATUS_CHECKED_IN) && checkout !== null && checkout < today;
  });
  const checkinPending = guests.filter(
    (g) => (g.status === GUEST_STATUS_ACTIVE_LEGACY || (g.status as string) === GUEST_STATUS_CHECKED_IN) && isCurrentlyInStay(g) && g.idVerificationStatus !== 'Complete'
  );
  const idMissingAfterCheckout = guests.filter(
    (g) => (g.status === GUEST_STATUS_CHECKEDOUT_LEGACY || (g.status as string) === GUEST_STATUS_CHECKED_OUT) && g.idVerificationStatus !== 'Complete'
  );
  // Advance doesn't need to be collected at check-in, but the bill must be
  // fully settled by checkout - flag any checked-out guest still owing.
  const unsettledBills = guests.filter(
    (g) => (g.status === GUEST_STATUS_CHECKEDOUT_LEGACY || (g.status as string) === GUEST_STATUS_CHECKED_OUT) && (g.totalAmount || 0) > (g.advanceAmount || 0)
  );
  const clearedGuests = guests.filter(
    (g) =>
      (g.status === GUEST_STATUS_CHECKEDOUT_LEGACY || (g.status as string) === GUEST_STATUS_CHECKED_OUT) &&
      g.idVerificationStatus === 'Complete' &&
      (g.totalAmount || 0) <= (g.advanceAmount || 0)
  );
  // A guest can independently match more than one of the checks below (most
  // commonly: checked out with no ID on file AND still owing money). Rather
  // than listing that guest once per matching category, merge everything
  // that applies to a given guest into a single row with one badge per
  // reason - so "same guest" alerts always read together, not scattered
  // across sections.
  type AlertReason = { label: string; detail: string };
  type GuestAlert = { guest: Guest; severity: 'red' | 'amber'; reasons: AlertReason[] };
  // Discriminated union so the System Alerts panel can list both
  // guest-based alerts (overdue check-in/out, etc.) and OTA-block alerts
  // (see otaAlerts below) in one merged, severity-sorted list.
  type CombinedAlertItem =
    | ({ kind: 'guest' } & GuestAlert)
    | { kind: 'ota'; block: (typeof blockedDates)[number]; severity: 'red' | 'amber'; reasons: AlertReason[] };
  const guestAlertMap = new Map<string, GuestAlert>();
  const addAlertReason = (
    list: Guest[],
    label: string,
    severity: 'red' | 'amber',
    detail: (g: Guest) => string
  ) => {
    list.forEach((g) => {
      const existing = guestAlertMap.get(g.id);
      if (existing) {
        existing.reasons.push({ label, detail: detail(g) });
        if (severity === 'red') existing.severity = 'red';
      } else {
        guestAlertMap.set(g.id, { guest: g, severity, reasons: [{ label, detail: detail(g) }] });
      }
    });
  };
  addAlertReason(overdueCheckins, 'Overdue Check-in', 'red', (g) => `Expected ${formatAlertDate(g.checkinDate)}`);
  addAlertReason(overdueCheckouts, 'Overdue Checkout', 'red', (g) => `Due ${formatAlertDate(g.expectedCheckout)}`);
  addAlertReason(checkinPending, 'Check-in Pending', 'amber', () => 'ID verification needed');
  addAlertReason(idMissingAfterCheckout, 'ID Missing', 'amber', () => 'Checked out without ID on file');
  addAlertReason(
    unsettledBills,
    'Unsettled Bill',
    'amber',
    (g) => `Owes ₹${((g.totalAmount || 0) - (g.advanceAmount || 0)).toLocaleString('en-IN')}`
  );
  // --- Unconverted OTA block alerts: any synced external-calendar hold
  // (Airbnb/Booking.com/etc - see blockedDates above) whose date range has
  // already started - present (a guest may be in-house right now with no
  // booking record at all) or fully past (a guest already left, still
  // never recorded) - but was never converted into a real booking.
  // blockedDates only ever contains still-unclaimed blocks in the first
  // place (getBlockedDates() on the PHP side excludes anything a guests
  // row already claims via ical_external_event_id), so everything that
  // passes the date filter below is, by definition, still unconverted -
  // no separate "not converted" check needed. Deliberately excludes
  // purely-future blocks (event_start > today): those don't need
  // attention yet, there's still time before the guest arrives.
  const otaAlerts: CombinedAlertItem[] = blockedDates
    .filter((bd) => (bd.event_start || '').split(' ')[0].split('T')[0] <= todayStr)
    .map((bd) => {
      const endStr = (bd.event_end || '').split(' ')[0].split('T')[0];
      const isOngoing = endStr >= todayStr;
      const sourceLabel = bd.source_label || bd.source || 'OTA';
      return {
        kind: 'ota',
        block: bd,
        severity: isOngoing ? 'amber' : 'red',
        reasons: [
          {
            label: 'OTA Not Converted',
            detail: isOngoing
              ? `${sourceLabel} · ongoing since ${formatAlertDate(bd.event_start)}`
              : `${sourceLabel} · ended ${formatAlertDate(bd.event_end)}, still not converted`,
          },
        ],
      };
    });

  const combinedAlerts: CombinedAlertItem[] = [
    ...Array.from(guestAlertMap.values()).map((a): CombinedAlertItem => ({ kind: 'guest', ...a })),
    ...otaAlerts,
  ].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'red' ? -1 : 1));
  const totalAlerts = combinedAlerts.length;

  // --- C-Form (FRRO) filing tracker: foreign guests must be filed within
  // 24h of check-in. Ticks every minute so the countdown stays live without
  // re-rendering the whole dashboard constantly. ---
  const [cFormNow, setCFormNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setCFormNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);
  const [cFormSavingId, setCFormSavingId] = useState<string | null>(null);
  const cFormPending = guests.filter(
    (g) => g.isForeignGuest && (g.status === GUEST_STATUS_ACTIVE_LEGACY || (g.status as string) === GUEST_STATUS_CHECKED_IN) && !g.cFormFiledAt
  );
  const formatCFormDue = (checkinDate: string): { label: string; overdue: boolean } => {
    const checkin = new Date((checkinDate || '').replace(' ', 'T'));
    if (isNaN(checkin.getTime())) return { label: 'Due date unknown', overdue: true };
    const dueAt = checkin.getTime() + 24 * 60 * 60 * 1000;
    const diffMs = dueAt - cFormNow;
    const overdue = diffMs < 0;
    const abs = Math.abs(diffMs);
    const hours = Math.floor(abs / (60 * 60 * 1000));
    const minutes = Math.floor((abs % (60 * 60 * 1000)) / 60000);
    const span = `${hours}h ${minutes}m`;
    return { label: overdue ? `Overdue by ${span}` : `Due in ${span}`, overdue };
  };
  const handleMarkCFormFiled = async (guestId: string) => {
    setCFormSavingId(guestId);
    const ok = await markCFormFiled(guestId, true);
    if (ok) {
      onCFormFiledUpdated?.(guestId, new Date().toISOString());
      showToast('C-Form marked as filed', { type: 'success' });
    } else {
      showToast('Failed to update C-Form status', { type: 'error' });
    }
    setCFormSavingId(null);
  };

  // Public "Share Menu" link (food_menu.php via the /food_menu/{slug}/
  // rewrite in .htaccess) - same pattern as TodayOverview.tsx's (the
  // multi-key dashboard) and MenuManager.tsx's Share Menu buttons, added
  // here for the single-property Dashboard, which had no way to hand a
  // guest the public menu link at all (found 22 Aug 2026). Only rendered in
  // the non-minimal branch below - minimalMode is this same component
  // reused per-room inside MultiKeyPropertyOverview.tsx, and the food menu
  // is one shared thing per property, not per-room, so a per-room Share
  // Menu button would be redundant (TodayOverview.tsx already covers the
  // multi-key case once, at the property level).
  const handleShareFoodMenu = () => {
    const propertySlug = getPropertySlug();
    const menuUrl = `${window.location.origin}/food_menu/${propertySlug}/`;
    const message = `🍽️ Check out the menu at ${propertyName || 'our place'}!\n${menuUrl}`;
    shareTextContent(
      `${propertyName || 'Food'} Menu`,
      message,
      showToast,
      'Menu link copied - paste it wherever you\'d like to share it.',
      'Could not share or copy the menu link.',
    );
  };

  return (
    <div className="operational-dashboard space-y-6">
      {minimalMode ? (
        <div className="operational-dashboard__minimal-header flex justify-end">
          <PageHeaderButton onClick={() => setShowAddGuestModal(true)} icon={Plus}>
            {t('add_booking_button', 'Add Booking')}
          </PageHeaderButton>
        </div>
      ) : (
        <PageHeader
          title={t('dashboard_heading', 'Dashboard')}
        >
          <PageHeaderButton onClick={handleShareFoodMenu} icon={Share2} variant="secondary">
            {t('share_food_menu_button', 'Share Menu')}
          </PageHeaderButton>
          <PageHeaderButton onClick={() => setShowAddGuestModal(true)} icon={Plus}>
            {t('add_booking_button', 'Add Booking')}
          </PageHeaderButton>
        </PageHeader>
      )}

      {/* Metric Blocks Grid - Sleek 1-Row Horizontal Cards */}
      {!minimalMode && (
      <div className={`operational-dashboard__metrics grid grid-cols-1 ${isMultiKeyProperty ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'} gap-2.5 md:gap-4`}>
        <KpiCard
          label="Arrivals"
          icon={Calendar}
          badge={{ text: 'Today', color: 'info' }}
          value={todaysArrivalsCount}
        />
        <KpiCard
          label="Departures"
          icon={LogOut}
          badge={{ text: 'Today', color: 'warning' }}
          value={todaysDeparturesCount}
        />
        {isMultiKeyProperty && (
          <KpiCard
            label="Guests In-House"
            icon={User}
            badge={{ text: 'Active', color: 'success' }}
            value={inHouseCount}
          />
        )}
        <KpiCard
          label="Service Requests"
          icon={Bell}
          badge={{ text: 'Active', color: 'failure' }}
          value={pendingRequestsCount}
        />
      </div>
      )}

      {/* Room Info / Property Location Bar */}
      {!minimalMode && roomName ? (
        <div className="operational-dashboard__room-info flex items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md">
          <div className="operational-dashboard__room-info-content flex-1">
            {isEditingRoomName ? (
              <Input
                value={editingRoomName}
                onChange={(e) => setEditingRoomName(e.target.value)}
                onBlur={() => {
                  if (editingRoomName && editingRoomName !== roomName) {
                    onUpdateRoomName?.(editingRoomName);
                  } else {
                    setEditingRoomName(roomName || '');
                  }
                  setIsEditingRoomName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (editingRoomName && editingRoomName !== roomName) {
                      onUpdateRoomName?.(editingRoomName);
                    } else {
                      setEditingRoomName(roomName || '');
                    }
                    setIsEditingRoomName(false);
                  }
                  if (e.key === 'Escape') {
                    setEditingRoomName(roomName || '');
                    setIsEditingRoomName(false);
                  }
                }}
                autoFocus
                className="text-2xl font-semibold text-slate-900 dark:text-white"
              />
            ) : (
              <div className="flex items-center gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="operational-dashboard__subtitle text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">{roomName}</h3>
                    <button
                      onClick={() => {
                        setIsEditingRoomName(true);
                        setEditingRoomName(roomName || '');
                      }}
                      className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition text-slate-600 hover:text-slate-900"
                      title={t('edit_room_name_tooltip', 'Edit room name')}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    {propertyName && <p className="text-xs text-slate-500">in {propertyName}</p>}
                    {roomId && <p className="text-xs text-slate-400">(ID: {roomId})</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* C-Form (FRRO) Filing Tracker for foreign guests */}
      {!minimalMode && cFormPending.length > 0 && (
        <div className="operational-dashboard__cform-tracker bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md p-4 sm:p-6">
          <h3 className="operational-dashboard__cform-title font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-700">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            {t('cform_filing_due_heading', 'C-Form Filing Due')}
            <span className="operational-dashboard__cform-badge text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300">
              {cFormPending.length}
            </span>
          </h3>
          <ul className="space-y-1.5">
            {cFormPending.map((g) => {
              const due = formatCFormDue(g.checkinDate);
              return (
                <li
                  key={g.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-2.5 ${
                    due.overdue
                      ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
                      : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
                  }`}
                >
                  <button
                    onClick={() => setSelectedBooking(g)}
                    className="text-left cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{g.guestName}</p>
                    <p className={`text-xs font-medium ${due.overdue ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
                      {due.label}
                    </p>
                  </button>
                  <Checkbox
                      disabled={cFormSavingId === g.id}
                      onChange={() => handleMarkCFormFiled(g.id)}
                    />{t('mark_filed_label', 'Mark filed')}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 3-Column Operational Row: System Alerts | Kitchen Queue | Requisitions */}
      {!minimalMode && (
      <div className="operational-dashboard__columns grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: System Alerts Box (replaces Guest Currently Staying for single property) */}
        <div className="operational-dashboard__col-alerts bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md p-4 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                {t('alerts_heading', 'System Alerts')}
              </h3>
              {totalAlerts > 0 ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300">
                  {totalAlerts}
                </span>
              ) : (
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-2 py-0.5 rounded border border-emerald-200">
                  All Clear
                </span>
              )}
            </div>

            {totalAlerts === 0 ? (
              <div className="text-center py-6 text-slate-500 dark:text-slate-400 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto opacity-80" />
                <p className="text-xs font-medium">{t('no_outstanding_issues', 'No outstanding issues or pending alerts.')}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {combinedAlerts.slice(0, 5).map((item) => {
                  const key = item.kind === 'guest' ? item.guest.id : `ota-${item.block.external_event_id}`;
                  const title = item.kind === 'guest' ? item.guest.guestName : (item.block.source_label || item.block.source || 'OTA Block');
                  const subtitle = item.kind === 'guest' ? item.guest.roomNumber : roomName;
                  return (
                    <div
                      key={key}
                      className="py-2.5 px-1 flex items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-700/30 rounded-lg transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center flex-wrap gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100">
                          <span>{title}</span>
                          {subtitle && <span className="text-2xs font-normal text-slate-400 shrink-0">• {subtitle}</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 text-[11px] mt-0.5">
                          {item.reasons.map((r, i) => (
                            <span
                              key={i}
                              className={`font-semibold ${
                                item.severity === 'red' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {r.label}{r.detail ? ` (${r.detail})` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => (item.kind === 'guest' ? setSelectedBooking(item.guest) : handleConvertOtaBlock(item.block))}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-md text-white transition-all cursor-pointer whitespace-nowrap shrink-0 shadow-md ${
                          item.severity === 'red'
                            ? 'bg-red-600 hover:bg-red-700 active:bg-red-800'
                            : 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800'
                        }`}
                      >
                        {item.kind === 'guest' ? t('view_resolve_button', 'Resolve') : t('convert_to_booking_button', 'Convert to Booking')}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {combinedAlerts.length > 5 && (
              <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                <button
                  onClick={() => setShowAllAlertsModal(true)}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>View All System Alerts ({combinedAlerts.length})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {clearedGuests.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button
                  onClick={() => setShowCleared((prev) => !prev)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {t('cleared_label', 'Cleared')} ({clearedGuests.length})
                  {showCleared ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                </button>
                {showCleared && (
                  <ul className="space-y-1.5 mt-2">
                    {clearedGuests.map((g) => (
                      <li key={g.id}>
                        <button
                          onClick={() => setSelectedBooking(g)}
                          className="w-full flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-left cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <span className="text-xs font-semibold text-emerald-900">
                            {g.guestName} <span className="font-normal opacity-75">· {g.roomNumber}</span>
                          </span>
                          <span className="text-[10px] font-medium text-emerald-700 whitespace-nowrap inline-flex items-center gap-1">
                            {formatAlertDate(g.checkinDate)} <ArrowRight className="w-3 h-3" /> {formatAlertDate(g.checkoutDate || g.expectedCheckout)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => onNavigate('guests', 'all_bookings')}
            className="mt-4 w-full text-white bg-blue-700 hover:bg-blue-800 font-semibold text-xs py-2 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>View All Bookings & Guests ({guests.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Column 2: Kitchen KDS Card - gated on BOTH the property-wide
            kitchenModuleEnabled toggle AND the viewer's own per-role
            kitchenAccessAllowed permission (23 Aug 2026 fix - this card used
            to show real live order data and an "Open Kitchen Orders" button
            to every role regardless of Kitchen permission, since it only
            ever checked the module toggle). */}
        {kitchenModuleEnabled && kitchenAccessAllowed ? (
          <div className="operational-dashboard__col-kitchen bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md p-4 sm:p-6 flex flex-col justify-between">
            <div className="operational-dashboard__col-kitchen-inner">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-700">
                <h3 className="operational-dashboard__subtitle font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-blue-600" />
                  {t('live_kitchen_tickets_heading', 'Live Kitchen Tickets')}
                </h3>
                <span className="bg-blue-100 text-blue-800 text-[10px] font-semibold px-2 py-0.5 rounded border border-blue-200">
                  {pendingOrders.length} {t('tickets_suffix', 'Tickets')}
                </span>
              </div>

              {recentOrders.length > 0 ? (
                <ul className="divide-y divide-slate-100 dark:divide-slate-700 text-xs">
                  {recentOrders.slice(0, 5).map((ord) => (
                    <li key={ord.id} className="py-2.5 flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{ord.id}</span>
                          {ord.roomNumber && <span className="text-slate-400 font-normal">({ord.roomNumber})</span>}
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5 line-clamp-1">
                          {ord.items.map((i) => `${i.name} (${i.quantity})`).join(', ')}
                        </p>
                      </div>

                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          ord.status === 'Pending'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : ord.status === 'Preparing'
                            ? 'bg-blue-100 text-blue-800 border border-blue-300'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}
                      >
                        {ord.status}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="py-8 text-center text-slate-400 text-xs font-medium">
                  {t('no_active_kitchen_tickets_message', 'No active kitchen tickets.')}
                </div>
              )}
            </div>

            <button
              onClick={() => onNavigate('kitchen')}
              className="mt-4 w-full text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-semibold text-xs py-2 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>{t('open_kitchen_orders_button', 'Open Kitchen Orders')} ({pendingOrders.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="operational-dashboard__col-kitchen-disabled bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md p-4 sm:p-6 flex flex-col justify-center items-center text-center text-slate-400 text-xs">
            <Utensils className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
            <p>
              {kitchenModuleEnabled
                ? t('kitchen_access_restricted', 'Kitchen access not available for your role')
                : t('kitchen_module_disabled', 'Kitchen Module Disabled')}
            </p>
          </div>
        )}

        {/* Column 3: Requisitions Card */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md p-4 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-700">
              <h3 className="operational-dashboard__subtitle font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                {t('requisitions_label', 'Requisitions')}
              </h3>
              <span className="bg-red-100 text-red-800 text-[10px] font-semibold px-2 py-0.5 rounded border border-red-200">
                {stockAlerts.length} {t('items_low_suffix', 'Items Low')}
              </span>
            </div>

            {stockAlerts.length > 0 ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700 text-xs">
                {stockAlerts.slice(0, 5).map((item) => (
                  <li key={item.id} className="py-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{item.name}</p>
                      <p className="text-slate-500 text-[11px]">{item.category}</p>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300">
                      {item.currentStock} / {item.minThreshold} {item.unit}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs font-medium">
                {t('all_stocks_sufficient', 'All inventory items sufficient.')}
              </div>
            )}
          </div>

          <button
            onClick={() => onNavigate('stock_requests')}
            className="mt-4 w-full text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-semibold text-xs py-2 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>{t('view_stock_requests_button', 'View Stock Requests')} ({stockAlerts.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      )}

      {/* Booking Calendar Row - Flowbite Application UI Calendar Standard */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden space-y-0">
        {/* Header Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 order-2 sm:order-1">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-500" />
              <h3 className="operational-dashboard__subtitle font-bold text-gray-900 dark:text-white text-base">
                {roomName ? `${roomName} Calendar` : t('booking_calendar_heading', 'Booking Calendar')}
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMonthOffset((o) => o - 1)}
                aria-label={t('previous_month_button', 'Previous month')}
                className="p-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <Datepicker
                value={viewDate}
                onChange={handleMonthPickerChange}
                readOnly
                language="en"
                showClearButton={false}
                showTodayButton={false}
                sizing="sm"
                className="w-48 [&_input]:cursor-pointer [&_input]:text-center [&_input]:text-xs [&_input]:font-semibold"
                title={t('jump_to_month_tooltip', 'Jump to any month/date')}
              />
              <button
                type="button"
                onClick={() => setMonthOffset((o) => o + 1)}
                aria-label={t('next_month_button', 'Next month')}
                className="p-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => onNavigate('new_booking')}
              className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-xs px-3 py-1.5 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('new_booking_btn', 'New Booking')}</span>
            </button>
          </div>
        </div>

        {/* Days Header */}
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 py-2.5">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-xs font-semibold uppercase tracking-wider text-center text-gray-500 dark:text-gray-400">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Grid - true week-segmented spanning capsules (22 Aug 2026
            full rewrite, explicit request after being shown Airbnb's own
            host multi-calendar as the target: a multi-night booking should
            be ONE continuous bar, not per-day chips glued together with
            negative margins - that lighter merge (still in git history/the
            comments removed here) always left a faint 1px seam at the
            grid's own `divide-x` line between cells, which can't be
            removed without this: bars are now absolutely positioned OVER a
            per-WEEK grid, spanning exactly the columns they cover via CSS
            Grid's `gridColumn` placement, with no cell boundary crossing
            through the bar itself at all - same reason TodayOverview's own
            bars never show a seam.
            Scope note: this still only shows the "primary" (first, by array
            order) booking per day plus a "+N more" overflow count, exactly
            like before - it does NOT add multi-lane stacking for several
            simultaneously-active bookings on different rooms the same
            night (a real, common case for this property-wide calendar).
            That's a materially bigger feature (proper lane assignment
            across the whole month, like TodayOverview's timelineLanesInfo)
            and wasn't what was asked for - only the already-shown "primary"
            booking becomes a true spanning bar instead of a chip. */}
        {(() => {
          const checkedOutColor = 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600';
          const otaBookingColor = 'bg-amber-600 dark:bg-amber-700 text-white border border-amber-700/30';
          const directBookingColor = 'bg-blue-600 dark:bg-blue-600 text-white border border-blue-700/30';

          // Precompute once per day - reused both for the day cell's own
          // content (date number, "+more" overflow) and for grouping
          // contiguous days into spanning-bar segments below.
          const daysInfo = daysArray.map((d) => {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            // .filter(), not .find() - a property-wide calendar (no roomName,
            // see the heading above) can have several rooms occupied the
            // same night. The cell still only shows one bar (below) to keep
            // the existing single-booking layout untouched, but the rest
            // are no longer silently dropped - see the "+N more" pill.
            // Bug found 22 Aug 2026 while verifying the spanning-bar
            // rewrite: `dateStr < g.expectedCheckout` compared a bare date
            // ("2026-08-21") against a full datetime ("2026-08-21
            // 11:00:00") as plain strings - since the bare date is a
            // literal PREFIX of the datetime string, JS string comparison
            // ranks it as "less than" the datetime, so the filter kept
            // matching on the actual checkout day too (one extra day past
            // the real stay). Harder to notice as separate per-day chips;
            // impossible to miss once that extra day became part of one
            // visibly-too-long spanning bar. Stripping the time component
            // before comparing (same normalization the OTA-block matching
            // just below already does) fixes it for both. checkoutDate is
            // already a bare date column, not touched.
            const dayBookingsForDate = guests.filter(
              (g) => dateStr >= g.checkinDate && dateStr < (g.checkoutDate || (g.expectedCheckout || '').split(' ')[0].split('T')[0])
            );
            const dayBooking = dayBookingsForDate[0] || null;
            const dayBookingOverflowCount = dayBookingsForDate.length - 1;
            // OTA-synced block for this day, on this room's own feed (this
            // component already fetches get_blocked_dates scoped to
            // whichever room's page it's rendered on). Only relevant when
            // there's no direct guest booking already occupying the day - a
            // synced OTA event usually corresponds 1:1 with a guest row
            // once it's been turned into an actual booking, and the guest
            // row should win.
            const otaBlock = !dayBooking
              ? blockedDates.find((bd) => {
                  const start = bd.event_start.split(' ')[0].split('T')[0];
                  const end = bd.event_end.split(' ')[0].split('T')[0];
                  return dateStr >= start && dateStr < end;
                }) || null
              : null;
            // monthOffset === 0 is required too, not just the day number -
            // the calendar can navigate away from the real current month
            // (added 22 Aug 2026), so a day number matching today's could
            // otherwise light up in whatever OTHER month is being viewed.
            const isToday = monthOffset === 0 && d === today.getDate();
            const amount = (dayBooking as any)?.totalCharge || (dayBooking as any)?.totalAmount || (dayBooking as any)?.total_charge || 0;
            const nightlyRate = Math.round(amount / Math.max(1, 1));
            const isDayBookingCheckedOut = (() => {
              const s = String((dayBooking as any)?.status || '').trim().toLowerCase();
              return s === 'checkedout' || s === 'checked out';
            })();
            const isOtaBooking = !!(dayBooking as any)?.otaSource;
            return { d, dateStr, dayBookingsForDate, dayBooking, dayBookingOverflowCount, otaBlock, isToday, nightlyRate, isDayBookingCheckedOut, isOtaBooking };
          });

          type DayInfo = (typeof daysInfo)[number];
          // Same slot layout the old single grid used: `firstDay` blanks,
          // then one entry per day of the month - chunked into groups of 7
          // this gives each week row starting on the correct weekday,
          // matching CSS Grid's own auto-wrap exactly (including a short
          // last row; no trailing blanks are added, same as before).
          const slots: (DayInfo | null)[] = [
            ...Array.from({ length: firstDay }, () => null),
            ...daysInfo,
          ];
          const weeks: (DayInfo | null)[][] = [];
          for (let i = 0; i < slots.length; i += 7) {
            weeks.push(slots.slice(i, i + 7));
          }

          type Segment = { startCol: number; endCol: number; kind: 'booking' | 'ota'; info: DayInfo };

          return (
            <div className="divide-y divide-gray-200 dark:divide-gray-700 text-xs">
              {weeks.map((week, weekIdx) => {
                // Group this week's columns into contiguous same-booking /
                // same-OTA-block runs - each run becomes one spanning bar. A
                // blank slot, or a change in which booking/block occupies
                // the day, always ends the current run (bookings from
                // different rooms never merge into one bar just because
                // they're adjacent).
                const segments: Segment[] = [];
                let runStart: number | null = null;
                let runKind: 'booking' | 'ota' | null = null;
                let runKey: string | null = null;
                const flush = (endCol: number) => {
                  if (runStart !== null && runKind !== null) {
                    segments.push({ startCol: runStart, endCol, kind: runKind, info: week[runStart]! });
                  }
                  runStart = null;
                  runKind = null;
                  runKey = null;
                };
                week.forEach((slot, col) => {
                  const key = slot?.dayBooking ? `b-${slot.dayBooking.id}` : slot?.otaBlock ? `o-${slot.otaBlock.event_start}-${slot.otaBlock.event_end}` : null;
                  const kind: 'booking' | 'ota' | null = slot?.dayBooking ? 'booking' : slot?.otaBlock ? 'ota' : null;
                  if (key !== runKey) {
                    flush(col - 1);
                    if (key !== null) {
                      runStart = col;
                      runKind = kind;
                      runKey = key;
                    }
                  }
                });
                flush(6);

                return (
                  <div key={`week-${weekIdx}`} className="relative grid grid-cols-7 divide-x divide-gray-200 dark:divide-gray-700">
                    {week.map((slot, col) => {
                      if (!slot) {
                        return <div key={`blank-${col}`} className="min-h-[96px] sm:min-h-[110px] p-2 bg-gray-50/50 dark:bg-gray-800/40" />;
                      }
                      const { d, dateStr, dayBookingsForDate, dayBookingOverflowCount, isToday } = slot;
                      return (
                        <div
                          key={`day-${d}`}
                          className={`min-h-[96px] sm:min-h-[110px] p-1.5 sm:p-2 flex flex-col justify-between transition-colors ${
                            isToday
                              ? 'bg-blue-50/40 dark:bg-blue-900/10'
                              : 'bg-white dark:bg-gray-800 hover:bg-gray-50/60 dark:hover:bg-gray-700/30'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            {isToday ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold shadow-xs">
                                {d}
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 ml-0.5">
                                {d}
                              </span>
                            )}
                          </div>
                          {/* Invisible spacer reserving the same two-line
                              height the overlay bar occupies, so the
                              "+more" button below sits at the same spot it
                              always has - the real, visible bar is drawn by
                              the absolute overlay beneath this grid, not
                              here. */}
                          <div className="invisible px-2 py-1 text-xs" aria-hidden="true">
                            <div>&nbsp;</div>
                            <div className="text-2xs">&nbsp;</div>
                          </div>
                          {dayBookingOverflowCount > 0 && (
                            <Popover
                              trigger="click"
                              placement="auto"
                              open={openOverflowDateStr === dateStr}
                              onOpenChange={(isOpen) => setOpenOverflowDateStr(isOpen ? dateStr : null)}
                              content={
                                <div className="w-60 p-2">
                                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-1 pb-2">
                                    {formatDateDDMMYYYY(dateStr)} · {dayBookingsForDate.length} bookings
                                  </div>
                                  <div className="space-y-1 max-h-64 overflow-y-auto">
                                    {dayBookingsForDate.map((g) => {
                                      const amt = (g as any).totalCharge || (g as any).totalAmount || (g as any).total_charge || 0;
                                      const itemPendingReasons = getGuestPendingReasons(g);
                                      const hasItemPending = itemPendingReasons.length > 0;
                                      return (
                                        <button
                                          key={g.id}
                                          type="button"
                                          onClick={() => {
                                            setSelectedBooking(g);
                                            setOpenOverflowDateStr(null);
                                          }}
                                          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-left transition-colors cursor-pointer"
                                        >
                                          <div className="min-w-0">
                                            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                                              {hasItemPending && (
                                                <span
                                                  className="flex w-2 h-2 bg-yellow-400 dark:bg-yellow-300 rounded-full shrink-0 shadow-xs ring-1 ring-yellow-600/50"
                                                  title={`Action Pending: ${itemPendingReasons.join(', ')}`}
                                                />
                                              )}
                                              <span className="truncate">{g.guestName}</span>
                                            </div>
                                            <div className="text-2xs text-slate-500 dark:text-slate-400">
                                              {g.roomNumber}{amt > 0 ? ` · ₹${Math.round(amt)}` : ''}
                                            </div>
                                          </div>
                                          <span className="text-2xs font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                                            {t('view_booking_button', 'View')} →
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              }
                            >
                              <button
                                type="button"
                                className="text-2xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline py-0.5 text-left cursor-pointer transition-colors block w-full truncate"
                              >
                                +{dayBookingOverflowCount} more
                              </button>
                            </Popover>
                          )}
                        </div>
                      );
                    })}

                    {/* Absolute overlay: one true spanning bar per
                        contiguous run computed above, positioned via CSS
                        Grid column placement so the math (which columns it
                        covers) is declarative rather than hand-rolled
                        percentage/pixel positioning. top-[30px]/[32px]
                        matches the day cell's own padding (p-1.5/p-2) plus
                        its date-number row height (the w-6 h-6 today-circle,
                        24px) - verified against the invisible spacer above
                        via Playwright, not guessed. */}
                    <div className="absolute inset-x-0 top-[30px] sm:top-[32px] pointer-events-none grid grid-cols-7 px-1.5 sm:px-2">
                      {segments.map((seg, segIdx) => {
                        const gridColumn = `${seg.startCol + 1} / span ${seg.endCol - seg.startCol + 1}`;
                        if (seg.kind === 'booking') {
                          const dayBooking = seg.info.dayBooking!;
                          const { isDayBookingCheckedOut, isOtaBooking, nightlyRate } = seg.info;
                          const dayPendingReasons = getGuestPendingReasons(dayBooking);
                          const hasDayPending = dayPendingReasons.length > 0;
                          const popoverKey = `${dayBooking.id}-${seg.info.dateStr}`;
                          return (
                            <div key={`seg-b-${weekIdx}-${segIdx}`} style={{ gridColumn }} className="pointer-events-auto px-0.5">
                              <Popover
                                trigger="click"
                                placement="top"
                                open={openBookingPopoverId === popoverKey}
                                onOpenChange={(isOpen) => setOpenBookingPopoverId(isOpen ? popoverKey : null)}
                                title={
                                  <div className="flex items-center justify-between gap-2">
                                    <h4 className="font-semibold text-gray-900 dark:text-white text-xs truncate">{dayBooking.guestName}</h4>
                                    {nightlyRate > 0 && (
                                      <span className="text-2xs font-bold text-blue-600 dark:text-blue-400 shrink-0">
                                        ₹{nightlyRate}/night
                                      </span>
                                    )}
                                  </div>
                                }
                                content={
                                  <div className="w-64 text-xs">
                                    <div className="p-3 space-y-1.5 text-gray-600 dark:text-gray-300">
                                      {dayBooking.roomNumber && (
                                        <div className="flex items-center justify-between text-2xs">
                                          <span className="text-gray-500 dark:text-gray-400">Room:</span>
                                          <span className="font-semibold text-gray-900 dark:text-white">{dayBooking.roomNumber}</span>
                                        </div>
                                      )}
                                      <div className="flex items-center justify-between text-2xs">
                                        <span className="text-gray-500 dark:text-gray-400">Dates:</span>
                                        <span className="font-medium text-gray-700 dark:text-gray-200">
                                          {dayBooking.checkinDate} → {dayBooking.expectedCheckout || (dayBooking as any).checkoutDate}
                                        </span>
                                      </div>
                                      {hasDayPending && (
                                        <div className="pt-1.5 border-t border-gray-100 dark:border-gray-700/60 text-amber-600 dark:text-amber-400 text-2xs font-semibold flex items-center gap-1.5">
                                          <span className="flex w-2 h-2 bg-yellow-400 dark:bg-yellow-300 rounded-full shrink-0 shadow-xs ring-1 ring-yellow-600/40" />
                                          <span>Action Pending: {dayPendingReasons.join(', ')}</span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700/60 bg-gray-50/50 dark:bg-gray-800/50">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedBooking(dayBooking);
                                          setOpenBookingPopoverId(null);
                                        }}
                                        className="w-full text-center text-2xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline cursor-pointer transition-colors"
                                      >
                                        {t('view_more_button', 'View More')} →
                                      </button>
                                    </div>
                                  </div>
                                }
                              >
                                <button
                                  type="button"
                                  className={`w-full rounded-md px-2 py-1 ${isDayBookingCheckedOut ? checkedOutColor : isOtaBooking ? otaBookingColor : directBookingColor} text-xs font-medium flex items-center gap-1.5 shadow-2xs hover:opacity-90 transition-opacity cursor-pointer truncate text-left`}
                                >
                                  {hasDayPending && (
                                    <span className="flex w-2 h-2 bg-yellow-400 dark:bg-yellow-300 rounded-full shrink-0 shadow-xs ring-1 ring-yellow-600/50" />
                                  )}
                                  {isOtaBooking && <Globe className="w-2.5 h-2.5 shrink-0" />}
                                  <span className="truncate font-semibold min-w-0">{dayBooking.guestName.split(' ')[0]}</span>
                                  {nightlyRate > 0 && <span className="text-2xs font-normal opacity-85 shrink-0 ml-auto">₹{nightlyRate}</span>}
                                </button>
                              </Popover>
                            </div>
                          );
                        }
                        // OTA-blocked segment - same popover-first pattern as
                        // the guest-booking segment above (22 Aug 2026,
                        // explicit request: clicking should show a popover
                        // first with a button to proceed, not act
                        // immediately - and a hover trigger has the same
                        // stuck-open-on-mobile-tap problem documented on
                        // Popover.tsx/CLAUDE.md mistake #15).
                        const otaBlock = seg.info.otaBlock!;
                        const otaPopoverKey = `${otaBlock.event_start}-${seg.info.dateStr}`;
                        const handleConvert = () => {
                          handleConvertOtaBlock(otaBlock);
                          setOpenOtaPopoverId(null);
                        };
                        return (
                          <div key={`seg-o-${weekIdx}-${segIdx}`} style={{ gridColumn }} className="pointer-events-auto px-0.5">
                            <Popover
                              trigger="click"
                              placement="top"
                              open={openOtaPopoverId === otaPopoverKey}
                              onOpenChange={(isOpen) => setOpenOtaPopoverId(isOpen ? otaPopoverKey : null)}
                              title={
                                <h4 className="font-semibold text-gray-900 dark:text-white text-xs truncate">
                                  {otaBlock.source_label || otaBlock.source || t('ota_blocked_label', 'Blocked')}
                                </h4>
                              }
                              content={
                                <div className="w-64 text-xs">
                                  <div className="p-3 space-y-1.5 text-gray-600 dark:text-gray-300">
                                    <div>
                                      {t('ota_blocked_tooltip_convertible', '{{source}} - not yet a booking.').replace('{{source}}', otaBlock.source_label || otaBlock.source || 'external calendar')}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={handleConvert}
                                    className="w-full text-center py-2 text-2xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-t border-gray-100 dark:border-gray-700/60 transition-colors"
                                  >
                                    {t('convert_to_booking_button', 'Convert to Booking')} →
                                  </button>
                                </div>
                              }
                            >
                              <button
                                type="button"
                                className="w-full rounded-md px-2 py-1 bg-slate-700 dark:bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white text-xs font-medium flex flex-col justify-center shadow-2xs truncate text-left cursor-pointer transition-colors"
                              >
                                <div className="truncate font-semibold">{otaBlock.source_label || otaBlock.source || t('ota_blocked_label', 'Blocked')}</div>
                              </button>
                            </Popover>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Calendar Legend - wording/colors matched exactly to
            TodayOverview.tsx's multi-property calendar footer legend (22
            Aug 2026, explicit style-parity request), reusing its same i18n
            keys so one translation entry drives both calendars' labels
            instead of two separately-maintained near-duplicates. The
            "Today" swatch is kept as an extra first item - a real thing
            this calendar highlights that the other doesn't need to (it has
            no month-grid to mark a day within), not a mismatch to fix. */}
        <div className="pt-4 p-4 border-t border-slate-100 dark:border-slate-700 flex flex-wrap items-center justify-start gap-3 text-xs font-medium text-gray-600 dark:text-gray-300">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2">
              <span className="w-5 h-3.5 rounded-xs bg-blue-50 dark:bg-blue-900/50 border border-blue-400 inline-block shadow-md" />
              <span>{t('legend_today', 'Today')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-3.5 rounded-xs bg-blue-600 inline-block shadow-md" />
              <span>{t('legend_direct_booking', 'Direct Booking')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-3.5 rounded-xs bg-amber-600 inline-flex items-center justify-center text-white text-[9px] shadow-md">
                <Globe className="w-2.5 h-2.5" />
              </span>
              <span>{t('legend_ota_converted', 'OTA Booking (Airbnb / Booking.com)')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-3.5 rounded-xs bg-slate-700 dark:bg-slate-700 border border-slate-600 inline-block shadow-md" />
              <span>{t('legend_ota_blocked', 'OTA Blocked Date')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-3.5 rounded-xs bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 inline-block shadow-md" />
              <span>{t('legend_checked_out', 'Checked Out Stay')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex w-2.5 h-2.5 bg-yellow-400 dark:bg-yellow-300 rounded-full shadow-xs ring-1 ring-yellow-600/50" />
              <span>{t('legend_pending_action', 'Action Pending (ID, C-Form, Check-in/out)')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Booking Details Modal - Editable */}
      {selectedBooking && !showCheckinVerification && (
        <BookingDetailsModal
          guest={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onSave={async (updated) => {
            if (!onUpdateBooking) return;
            await onUpdateBooking(updated);
            setSelectedBooking(updated);
          }}
          onDelete={onDeleteBooking ? async (id) => { await onDeleteBooking(id); setSelectedBooking(null); } : undefined}
          rooms={rooms}
          checkedInGuests={guests}
          propertyName={propertyName}
          propertyMapsLink={propertyMapsLink || propertyGoogleMapsLink}
          propertyPhone={propertyPhone}
          propertyWhatsappTemplate={propertyWhatsappTemplate}
          propertyUpiId={propertyUpiId}
          propertyUpiQrCodeUrl={propertyUpiQrCodeUrl}
          propertyAddress={propertyAddress}
          propertyInstructions={propertyInstructions}
          propertyCheckinTime={propertyCheckinTime}
          propertyCheckoutTime={propertyCheckoutTime}
          onOpenIdVerification={() => setShowCheckinVerification(true)}
          onCheckedIn={onGuestCheckedIn}
          onCheckout={onCheckout ? () => { onCheckout(selectedBooking.id); setSelectedBooking(null); } : undefined}
        />
      )}

      {/* Convert OTA Block to Booking */}
      {otaConversionTarget && (
        <ConvertOtaBookingModal
          otaBlock={otaConversionTarget.block}
          roomNumber={roomName}
          blockedDates={otaConversionTarget.blockedDateStrings}
          onClose={() => setOtaConversionTarget(null)}
          onConvert={(guest) => {
            onAddGuest?.(guest);
            setOtaConversionTarget(null);
            // Optimistic removal of exactly the block just claimed, matched by
            // its stable external_event_id - NOT a fetchBlockedDates() refetch
            // (found 22 Aug 2026, reported as "converted a booking, now there
            // are 2 capsules"). onAddGuest fires the add_guest write but isn't
            // awaited (same fire-and-forget optimistic pattern this whole flow
            // already uses - see ConvertOtaBookingModal's own comment), so a
            // refetch here routinely raced ahead of that write actually landing:
            // the server's getBlockedDates() only excludes a block once a guest
            // row with a matching ical_external_event_id exists, so refetching
            // too early got back the STILL-unclaimed block and overwrote local
            // state with it - stuck showing next to the brand-new booking until
            // a full reload. Removing it from local state directly can't race
            // anything.
            const convertedId = otaConversionTarget.block.external_event_id;
            setBlockedDates((prev) => prev.filter((bd) => bd.external_event_id !== convertedId));
          }}
        />
      )}

      {/* Check-in ID Verification Modal */}
      {showCheckinVerification && (
        <CheckinVerificationModal
          guest={selectedBooking}
          isOpen={showCheckinVerification}
          onClose={() => {
            setShowCheckinVerification(false);
            // This modal is opened from inside Booking Details, on top of it -
            // closing (manually, or automatically after completing) should
            // return to the dashboard, not reveal Booking Details sitting
            // underneath unexpectedly.
            setSelectedBooking(null);
          }}
          onVerificationComplete={(guestId) => {
            onGuestVerificationUpdated?.(guestId);
            setSelectedBooking((prev) => (prev ? { ...prev, idVerificationStatus: 'Complete' } : prev));
          }}
        />
      )}

      {/* Add Guest Drawer */}
      <Drawer
        open={showAddGuestModal}
        onClose={() => setShowAddGuestModal(false)}
        position="right"
        className="z-58 w-full sm:max-w-4xl lg:max-w-5xl p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <User className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white m-0">
              {t('add_guest_heading', 'Add Guest')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowAddGuestModal(false)}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <GuestManagement
            guests={guests}
            receipts={receipts}
            menu={menu}
            rooms={rooms}
            onAddGuest={(guest) => {
              onAddGuest?.(guest);
              setShowAddGuestModal(false);
            }}
            onCheckoutGuest={onCheckoutGuest || (() => {})}
            onDispatchTelegram={onDispatchTelegram}
            activeMenuItemKey="guest_registration"
            isMultiKeyProperty={!!roomName}
            selectedRoomSlug={roomName}
            preSelectRoom={roomName}
            onClose={() => setShowAddGuestModal(false)}
            propertyName={propertyName}
            propertyMapsLink={propertyMapsLink}
            propertyPhone={propertyPhone}
            propertyWhatsappTemplate={propertyWhatsappTemplate}
            propertyUpiId={propertyUpiId}
            propertyUpiQrCodeUrl={propertyUpiQrCodeUrl}
          />
        </div>
      </Drawer>

      {/* All System Alerts Drawer */}
      <Drawer
        open={showAllAlertsModal}
        onClose={() => setShowAllAlertsModal(false)}
        position="right"
        className="z-58 w-full sm:max-w-2xl lg:max-w-3xl p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 flex items-center justify-center text-red-600 dark:text-red-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h2 className="operational-dashboard__subtitle font-semibold text-slate-900 dark:text-white text-base m-0">
              All System Alerts ({combinedAlerts.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowAllAlertsModal(false)}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="overflow-x-auto">
            <Table className="operational-dashboard__table operational-dashboard__table--alerts">
              <TableHead>
                <TableRow>
                  <TableHeadCell>{t('alerts_col_guest_room', 'Guest / Room')}</TableHeadCell>
                  <TableHeadCell>{t('alerts_col_issue', 'Issue')}</TableHeadCell>
                  <TableHeadCell className="w-36">{t('alerts_col_action', 'Action')}</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody className="divide-y divide-slate-100 dark:divide-slate-700/60 operational-dashboard__table-body">
                {combinedAlerts.map((item) => {
                  const key = item.kind === 'guest' ? item.guest.id : `ota-${item.block.external_event_id}`;
                  const title = item.kind === 'guest' ? item.guest.guestName : (item.block.source_label || item.block.source || 'OTA Block');
                  const subtitle = item.kind === 'guest' ? item.guest.roomNumber : roomName;
                  return (
                    <TableRow
                      key={key}
                      className={item.severity === 'red' ? 'bg-red-50/60 dark:bg-red-900/10' : 'bg-amber-50/60 dark:bg-amber-900/10'}
                    >
                      <TableCell className="operational-dashboard__cell align-top">
                        <div className={`text-sm font-semibold ${item.severity === 'red' ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}`}>
                          {title}
                        </div>
                        {subtitle && <div className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</div>}
                      </TableCell>
                      <TableCell className="operational-dashboard__cell align-top">
                        <div className="space-y-1">
                          {item.reasons.map((r, i) => (
                            <div
                              key={i}
                              className={`text-xs font-medium ${item.severity === 'red' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}
                            >
                              <div>{r.label}</div>
                              <div className="text-2xs opacity-80">{r.detail}</div>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="operational-dashboard__cell align-top">
                        <button
                          onClick={() => {
                            setShowAllAlertsModal(false);
                            if (item.kind === 'guest') setSelectedBooking(item.guest);
                            else handleConvertOtaBlock(item.block);
                          }}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-colors cursor-pointer whitespace-nowrap ${
                            item.severity === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
                          }`}
                        >
                          {item.kind === 'guest' ? t('view_resolve_button', 'View & Resolve') : t('convert_to_booking_button', 'Convert to Booking')}
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </Drawer>
    </div>
  );
};





