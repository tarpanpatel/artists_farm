import React, { useState, useEffect } from 'react';
import { Modal, ModalHeader, ModalBody, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell, Checkbox, Popover } from 'flowbite-react';
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
} from 'lucide-react';
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
  propertyName?: string;
  propertyMapsLink?: string;
  propertyPhone?: string;
  propertyWhatsappTemplate?: string;
  propertyUpiId?: string;
  propertyUpiQrCodeUrl?: string;
  propertyAddress?: string;
  propertyGoogleMapsLink?: string;
  propertyInstructions?: string;
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
  propertyName = '',
  propertyMapsLink = '',
  propertyPhone = '',
  propertyWhatsappTemplate = '',
  propertyUpiId = '',
  propertyUpiQrCodeUrl = '',
  propertyAddress: _propertyAddress = '',
  propertyGoogleMapsLink: _propertyGoogleMapsLink = '',
  propertyInstructions: _propertyInstructions = '',
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
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthName = today.toLocaleString('default', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const todayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

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
  const combinedAlerts = Array.from(guestAlertMap.values()).sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'red' ? -1 : 1
  );
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
          subtitle={t('dashboard_subheading', "Who's arriving, what's ready, and what needs you now.")}
        >
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
                {combinedAlerts.slice(0, 5).map(({ guest: g, severity, reasons }) => (
                  <div
                    key={g.id}
                    className="py-2.5 px-1 flex items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-700/30 rounded-lg transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center flex-wrap gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100">
                        <span>{g.guestName}</span>
                        <span className="text-2xs font-normal text-slate-400 shrink-0">• {g.roomNumber}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 text-[11px] mt-0.5">
                        {reasons.map((r, i) => (
                          <span
                            key={i}
                            className={`font-semibold ${
                              severity === 'red' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {r.label}{r.detail ? ` (${r.detail})` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedBooking(g)}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-md text-white transition-all cursor-pointer whitespace-nowrap shrink-0 shadow-md ${
                        severity === 'red'
                          ? 'bg-red-600 hover:bg-red-700 active:bg-red-800'
                          : 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800'
                      }`}
                    >
                      {t('view_resolve_button', 'Resolve')}
                    </button>
                  </div>
                ))}
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

        {/* Column 2: Kitchen KDS Card */}
        {kitchenModuleEnabled ? (
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
            <p>{t('kitchen_module_disabled', 'Kitchen Module Disabled')}</p>
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
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-500" />
              <h3 className="operational-dashboard__subtitle font-bold text-gray-900 dark:text-white text-base">
                {roomName ? `${roomName} Calendar` : t('booking_calendar_heading', 'Booking Calendar')}
              </h3>
            </div>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-600">
              {monthName}
            </span>
          </div>
          <div className="flex items-center gap-2">
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

        {/* Calendar Grid - Full Width Dividers */}
        {(() => {
          const allOccupiedDateStrings = [
            ...guests.flatMap((g) => expandRangeToDayStrings(g.checkinDate, g.expectedCheckout || (g as any).checkoutDate || g.checkinDate)),
            ...blockedDates.flatMap((bd) => expandRangeToDayStrings(bd.event_start, bd.event_end)),
          ];
          return (
        <div className="grid grid-cols-7 divide-x divide-y divide-gray-200 dark:divide-gray-700 text-xs">
          {Array.from({ length: firstDay }).map((_, idx) => (
            <div key={`empty-${idx}`} className="min-h-[96px] sm:min-h-[110px] p-2 bg-gray-50/50 dark:bg-gray-800/40" />
          ))}

          {daysArray.map((d) => {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            // .filter(), not .find() - a property-wide calendar (no roomName,
            // see the heading above) can have several rooms occupied the same
            // night. The cell still only shows one chip (below) to keep the
            // existing single-booking layout untouched, but the rest are no
            // longer silently dropped - see the "+N more" pill.
            const dayBookingsForDate = guests.filter(
              (g) => dateStr >= g.checkinDate && dateStr < (g.checkoutDate || g.expectedCheckout)
            );
            const dayBooking = dayBookingsForDate[0];
            const dayBookingOverflowCount = dayBookingsForDate.length - 1;
            // OTA-synced block for this day, on this room's own feed (this
            // component already fetches get_blocked_dates scoped to whichever
            // room's page it's rendered on). Only relevant when there's no
            // direct guest booking already occupying the day - a synced OTA
            // event usually corresponds 1:1 with a guest row once it's been
            // turned into an actual booking, and the guest row should win.
            const otaBlock = !dayBooking
              ? blockedDates.find((bd) => {
                  const start = bd.event_start.split(' ')[0].split('T')[0];
                  const end = bd.event_end.split(' ')[0].split('T')[0];
                  return dateStr >= start && dateStr < end;
                })
              : null;
            const isToday = d === today.getDate();

            const amount = (dayBooking as any)?.totalCharge || (dayBooking as any)?.totalAmount || (dayBooking as any)?.total_charge || 0;
            const nightlyRate = Math.round(amount / Math.max(1, 1));

            // Flowbite semantic chip colors
            const checkedOutColor = 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600';
            const isDayBookingCheckedOut = (() => {
              const s = String((dayBooking as any)?.status || '').trim().toLowerCase();
              return s === 'checkedout' || s === 'checked out';
            })();

            const isOtaBooking = !!(dayBooking as any)?.otaSource;
            const otaBookingColor = 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800';
            const directBookingColor = 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800';

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
                {dayBooking && (
                  <button
                    onClick={() => setSelectedBooking(dayBooking)}
                    className={`rounded-md px-2 py-1 ${isDayBookingCheckedOut ? checkedOutColor : isOtaBooking ? otaBookingColor : directBookingColor} text-xs font-medium flex flex-col justify-center shadow-2xs hover:opacity-90 transition-opacity cursor-pointer truncate w-full text-left`}
                  >
                    <div className="truncate font-semibold flex items-center gap-1">
                      {isOtaBooking && <Globe className="w-2.5 h-2.5 shrink-0" />}
                      <span className="truncate">{dayBooking.guestName.split(' ')[0]}</span>
                    </div>
                    {nightlyRate > 0 && <div className="text-2xs font-normal opacity-85">₹{nightlyRate}</div>}
                  </button>
                )}
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
                                  <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{g.guestName}</div>
                                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                    {g.roomNumber}{amt > 0 ? ` · ₹${Math.round(amt)}` : ''}
                                  </div>
                                </div>
                                <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
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
                      className="rounded px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[9px] font-semibold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors cursor-pointer w-full truncate"
                    >
                      +{dayBookingOverflowCount} more
                    </button>
                  </Popover>
                )}
                {otaBlock && (
                  // Native title, not Tooltip.tsx: this cell sits in a grid whose
                  // parent clips overflow for the calendar's layout, which also
                  // clips an absolutely-positioned hover tooltip trying to render
                  // outside it (found 16 Aug 2026 - rendered as a clipped black
                  // bar, not readable text). A native tooltip is drawn by the
                  // browser, so it can't be clipped by page CSS, and it dismisses
                  // itself on click with no lingering-above-the-modal z-index fight.
                  <button
                    type="button"
                    onClick={() => {
                      const ownDays = new Set(expandRangeToDayStrings(otaBlock.event_start, otaBlock.event_end));
                      setOtaConversionTarget({
                        block: otaBlock,
                        blockedDateStrings: allOccupiedDateStrings.filter((dstr) => !ownDays.has(dstr)),
                      });
                    }}
                    title={t('ota_blocked_tooltip_convertible', '{{source}} - not yet a booking. Click to convert.').replace('{{source}}', otaBlock.source_label || otaBlock.source || 'external calendar')}
                    className="rounded-md px-2 py-1.5 bg-slate-500 dark:bg-slate-600 hover:bg-slate-600 dark:hover:bg-slate-500 text-white text-xs font-semibold flex flex-col justify-center shadow-md truncate w-full cursor-pointer transition-colors"
                  >
                    <div className="truncate font-semibold">{otaBlock.source_label || otaBlock.source || t('ota_blocked_label', 'Blocked')}</div>
                  </button>
                )}
              </div>
            );
          })}
        </div>
          );
        })()}

        {/* Calendar Legend */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-blue-100 dark:bg-blue-900/50 border border-blue-400" />
            <span>{t('legend_today', 'Today')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-slate-500 dark:bg-slate-600" />
            <span>{t('legend_ota_blocked', 'OTA-Blocked (not yet a booking)')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-slate-300 dark:bg-slate-600" />
            <span>{t('legend_checked_out', 'Checked Out (past stay)')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-teal-600" />
            <span>{t('legend_active_resident', 'Confirmed Stay')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-amber-600" />
            <span>{t('legend_ota_converted_booking', 'OTA-Converted Booking')}</span>
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
          propertyMapsLink={propertyMapsLink}
          propertyPhone={propertyPhone}
          propertyWhatsappTemplate={propertyWhatsappTemplate}
          propertyUpiId={propertyUpiId}
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
            fetchBlockedDates();
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

      {/* Add Guest Modal */}
      <Modal show={showAddGuestModal} onClose={() => setShowAddGuestModal(false)} dismissible size="lg" className="z-[99999]">
        <ModalBody className="p-0 max-h-[90vh] overflow-y-auto rounded-lg">
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
        </ModalBody>
      </Modal>

      {/* All System Alerts Modal */}
      <Modal show={showAllAlertsModal} onClose={() => setShowAllAlertsModal(false)} dismissible size="2xl" className="z-58">
        <ModalHeader as="div">
          <h3 className="operational-dashboard__subtitle font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span>All System Alerts ({combinedAlerts.length})</span>
          </h3>
        </ModalHeader>
        <ModalBody className="max-h-[85vh] overflow-y-auto">
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
                {combinedAlerts.map(({ guest: g, severity, reasons }) => (
                  <TableRow
                    key={g.id}
                    className={severity === 'red' ? 'bg-red-50/60 dark:bg-red-900/10' : 'bg-amber-50/60 dark:bg-amber-900/10'}
                  >
                    <TableCell className="operational-dashboard__cell align-top">
                      <div className={`text-sm font-semibold ${severity === 'red' ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}`}>
                        {g.guestName}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{g.roomNumber}</div>
                    </TableCell>
                    <TableCell className="operational-dashboard__cell align-top">
                      <div className="space-y-1">
                        {reasons.map((r, i) => (
                          <div
                            key={i}
                            className={`text-xs font-medium ${severity === 'red' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}
                          >
                            <div>{r.label}</div>
                            <div className="text-[10px] opacity-80">{r.detail}</div>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="operational-dashboard__cell align-top">
                      <button
                        onClick={() => {
                          setShowAllAlertsModal(false);
                          setSelectedBooking(g);
                        }}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-colors cursor-pointer whitespace-nowrap ${
                          severity === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
                        }`}
                      >
                        {t('view_resolve_button', 'View & Resolve')}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ModalBody>
      </Modal>
    </div>
  );
};





