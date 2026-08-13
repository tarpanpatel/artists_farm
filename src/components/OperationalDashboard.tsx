import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  User,
  Phone,
  Calendar,
  Utensils,
  ArrowRight,
  CheckCircle2,
  Plus,
  Pencil,
  LogOut,
  Bell,
  X,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { Guest } from '../types';
import { useInventoryContext } from '../contexts/InventoryContext';
import { useKitchenContext } from '../contexts/KitchenContext';
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
import { Input } from './Input';
import { t } from '../i18n/en';

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
  propertyAddress?: string;
  propertyGoogleMapsLink?: string;
  propertyInstructions?: string;
  onSavePropertyLocation?: (address: string, googleMapsLink: string, instructions: string) => Promise<boolean>;
  isMultiKeyProperty?: boolean;
  serviceRequests?: any[];
  onCheckout?: (guestId: string) => void;
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
  propertyAddress: _propertyAddress = '',
  propertyGoogleMapsLink: _propertyGoogleMapsLink = '',
  propertyInstructions: _propertyInstructions = '',
  onSavePropertyLocation: _onSavePropertyLocation,
  isMultiKeyProperty = false,
  serviceRequests = [],
  onCheckout: _onCheckout,
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
  const [blockedDates, setBlockedDates] = useState<Array<{
    event_start: string;
    event_end: string;
    event_title: string;
    reservation_url?: string;
    source?: string;
    source_label?: string;
  }>>([]);

  // Fetch blocked dates from iCal sync
  useEffect(() => {
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
    fetchBlockedDates();
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
  const todaysCheckins = guests.filter((g) => (g.checkinDate || '').split(' ')[0] === todayStr);

  // Active resident profile - must be currently staying (today is between checkin and checkout)
  const checkedInGuest = guests.find((g) => {
    if (g.status !== GUEST_STATUS_ACTIVE_LEGACY && (g.status as string) !== GUEST_STATUS_CHECKED_IN) return false;
    const checkinDate = new Date(g.checkinDate);
    const checkoutDate = new Date(g.expectedCheckout);
    checkinDate.setHours(0, 0, 0, 0);
    checkoutDate.setHours(0, 0, 0, 0);
    return today >= checkinDate && today < checkoutDate;
  });

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
      <PageHeader
        title={t('dashboard_heading', 'Dashboard')}
        subtitle={t('dashboard_subheading', "Who's arriving, what's ready, and what needs you now.")}
      >
        <PageHeaderButton onClick={() => setShowAddGuestModal(true)} icon={Plus}>
          {t('add_booking_button', 'Add Booking')}
        </PageHeaderButton>
      </PageHeader>

      {/* Metric Blocks Grid - Sleek 1-Row Horizontal Cards */}
      <div className={`operational-dashboard__metrics grid grid-cols-1 ${isMultiKeyProperty ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'} gap-2.5 md:gap-4`}>
        {/* Arrivals Block */}
        <div className="operational-dashboard__metric operational-dashboard__metric--arrivals bg-white dark:bg-slate-800 rounded-xl md:rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs hover:shadow-md transition-all p-3 md:p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/35 text-blue-600 dark:text-blue-400 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Arrivals:</span>
                <span className="text-sm font-extrabold text-slate-900 dark:text-white">{todaysArrivalsCount}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">checking in today</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => onNavigate('guests')}
            className="operational-dashboard__metric-action px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 flex items-center gap-1"
            title="View Bookings"
          >
            <span>Bookings</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Departures Block */}
        <div className="operational-dashboard__metric operational-dashboard__metric--departures bg-white dark:bg-slate-800 rounded-xl md:rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs hover:shadow-md transition-all p-3 md:p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/35 text-amber-600 dark:text-amber-400 shrink-0">
              <LogOut className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Departures:</span>
                <span className="text-sm font-extrabold text-slate-900 dark:text-white">{todaysDeparturesCount}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">checking out today</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => onNavigate('guests')}
            className="operational-dashboard__metric-action px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 flex items-center gap-1"
            title="View Bookings"
          >
            <span>Bookings</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Guests in-house Block (Only for multi-key property) */}
        {isMultiKeyProperty && (
          <div className="operational-dashboard__metric operational-dashboard__metric--inhouse bg-white dark:bg-slate-800 rounded-xl md:rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs hover:shadow-md transition-all p-3 md:p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/35 text-emerald-600 dark:text-emerald-400 shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Guests In-House:</span>
                  <span className="text-sm font-extrabold text-slate-900 dark:text-white">{inHouseCount}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">active guests</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => onNavigate('guests')}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 flex items-center gap-1"
              title="View Bookings"
            >
              <span>Guests</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Service Requests Block */}
        <div className="operational-dashboard__metric operational-dashboard__metric--service-requests bg-white dark:bg-slate-800 rounded-xl md:rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs hover:shadow-md transition-all p-3 md:p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-900/35 text-red-600 dark:text-red-400 shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Service Requests:</span>
                <span className="text-sm font-extrabold text-slate-900 dark:text-white">{pendingRequestsCount}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">active requests</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => onNavigate('service_requests')}
            className="operational-dashboard__metric-action px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 flex items-center gap-1"
            title="View Service Requests"
          >
            <span>Requests</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Room Info / Property Location Bar */}
      {roomName ? (
        <div className="operational-dashboard__room-info flex items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
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
                className="text-2xl font-bold text-slate-900 dark:text-white"
              />
            ) : (
              <div className="flex items-center gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{roomName}</h3>
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
                    <p className="text-xs text-slate-500">in Goa Homes</p>
                    {roomId && <p className="text-xs text-slate-400">(ID: {roomId})</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
      {/* Front-desk Alerts */}
      {(totalAlerts > 0 || clearedGuests.length > 0) && (
        <div className="operational-dashboard__alerts bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5">
          <h3 className="operational-dashboard__alerts-title font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-700">
            <AlertTriangle className="operational-dashboard__alerts-icon w-4 h-4 text-red-600" />
            {t('alerts_heading', 'Alerts')}
            {totalAlerts > 0 && (
              <span className="operational-dashboard__alerts-badge text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300">
                {totalAlerts}
              </span>
            )}
          </h3>
          {totalAlerts === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('no_outstanding_issues', 'No outstanding issues.')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse operational-dashboard__table operational-dashboard__table--checkout">
                <thead className="operational-dashboard__table-header">
                  <tr className="text-left text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 operational-dashboard__table-header-row">
                    <th className="pb-2 pr-3 operational-dashboard__table-header-cell">{t('alerts_col_guest_room', 'Guest / Room')}</th>
                    <th className="pb-2 pr-3 operational-dashboard__table-header-cell">{t('alerts_col_issue', 'Issue')}</th>
                    <th className="pb-2 w-36 operational-dashboard__table-header-cell">{t('alerts_col_action', 'Action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 operational-dashboard__table-body">
                  {combinedAlerts.slice(0, 5).map(({ guest: g, severity, reasons }) => (
                    <tr
                      key={g.id}
                      className={severity === 'red' ? 'bg-red-50/60 dark:bg-red-900/10' : 'bg-amber-50/60 dark:bg-amber-900/10'}
                    >
                      <td className="py-2.5 pr-3 align-top">
                        <div className={`text-sm font-bold ${severity === 'red' ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}`}>
                          {g.guestName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{g.roomNumber}</div>
                      </td>
                      <td className="py-2.5 pr-3 align-top">
                        <div className="space-y-0.5">
                          {reasons.map((r, i) => (
                            <div
                              key={i}
                              className={`text-xs font-medium whitespace-nowrap ${severity === 'red' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}
                            >
                              {r.label} — {r.detail}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 align-top">
                        <button
                          onClick={() => setSelectedBooking(g)}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-colors cursor-pointer whitespace-nowrap ${
                            severity === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
                          }`}
                        >
                          {t('view_resolve_button', 'View & Resolve')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {combinedAlerts.length > 5 && (
            <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700 flex justify-end">
              <button
                onClick={() => setShowAllAlertsModal(true)}
                className="text-xs font-bold text-red-600 hover:text-red-700 dark:text-red-400 flex items-center gap-1.5 cursor-pointer"
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
                className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 cursor-pointer"
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
                        <span className="text-sm font-bold text-emerald-900">
                          {g.guestName} <span className="font-normal opacity-75">· {g.roomNumber}</span>
                        </span>
                        <span className="text-xs font-medium text-emerald-700 whitespace-nowrap inline-flex items-center gap-1">
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
      )}

      {/* C-Form (FRRO) Filing Tracker for foreign guests */}
      {cFormPending.length > 0 && (
        <div className="operational-dashboard__cform-tracker bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5">
          <h3 className="operational-dashboard__cform-title font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-700">
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
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{g.guestName}</p>
                    <p className={`text-xs font-medium ${due.overdue ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
                      {due.label}
                    </p>
                  </button>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer whitespace-nowrap shrink-0">
                    <input
                      type="checkbox"
                      disabled={cFormSavingId === g.id}
                      onChange={() => handleMarkCFormFiled(g.id)}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 cursor-pointer"
                    />
                    {t('mark_filed_label', 'Mark filed')}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 3-Column Operational Row: Guest Staying / Check-ins | Kitchen Queue | Requisitions */}
      <div className="operational-dashboard__columns grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Resident Profile / Today's Check-ins & Pending Actions */}
        <div className="operational-dashboard__col-profile bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 flex flex-col justify-between">
          <div className="operational-dashboard__col-profile-inner">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                {t('current_resident_profile_heading', 'Guest Currently Staying')}
              </h3>
              <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200">
                {t('checked_in_badge', 'Active Stay')}
              </span>
            </div>

            {checkedInGuest ? (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-700/60">
                  <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" /> {t('guest_name_colon_label', 'Guest Name:')}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white text-sm">{checkedInGuest.guestName}</span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-700/60">
                  <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" /> {t('contact_phone_colon_label', 'Contact Phone:')}
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{checkedInGuest.phoneNumber}</span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-700/60">
                  <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" /> {t('dates_colon_label', 'Dates:')}
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {(() => {
                      const formatDate = (dateStr?: string) => {
                        if (!dateStr) return '';
                        const dateOnly = dateStr.split(' ')[0];
                        const parts = dateOnly.split('-');
                        if (parts.length !== 3) return dateStr;
                        return `${parts[2]}/${parts[1]}/${parts[0]}`;
                      };
                      return (
                        <span className="inline-flex items-center gap-1">
                          {formatDate(checkedInGuest.checkinDate)} <ArrowRight className="w-3 h-3" /> {formatDate(checkedInGuest.expectedCheckout)}
                        </span>
                      );
                    })()}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">{t('room_label', 'Room:')}</span>
                  <span className="font-bold bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-white px-2.5 py-1 rounded border border-slate-200 dark:border-slate-600">
                    {checkedInGuest.roomNumber}
                  </span>
                </div>
              </div>
            ) : todaysCheckins.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 mb-2">{t('todays_checkins_heading', "Today's Check-ins & Pending Actions")}</p>
                {todaysCheckins.slice(0, 5).map((g) => {
                  const verified = g.idVerificationStatus === 'Complete';
                  return (
                    <div
                      key={g.id}
                      className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 ${
                        verified ? 'border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50' : 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30'
                      }`}
                    >
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{g.guestName}</p>
                        <p className="text-[11px] text-slate-500">{g.roomNumber}</p>
                      </div>
                      {verified ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                          Verified
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedBooking(g);
                            setShowCheckinVerification(true);
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 cursor-pointer"
                        >
                          <AlertTriangle className="w-3 h-3" /> Verification Pending
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs font-medium">
                {t('no_active_resident_message', 'No guest currently staying.')}
              </div>
            )}
          </div>

          <button
            onClick={() => onNavigate('guests', 'all_bookings')}
            className="mt-4 w-full text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-semibold text-xs py-2 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>View All Bookings & Guests ({guests.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Column 2: Kitchen KDS Card */}
        {kitchenModuleEnabled ? (
          <div className="operational-dashboard__col-kitchen bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 flex flex-col justify-between">
            <div className="operational-dashboard__col-kitchen-inner">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-700">
                <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-blue-600" />
                  {t('live_kitchen_tickets_heading', 'Live Kitchen Tickets')}
                </h3>
                <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200">
                  {pendingOrders.length} {t('tickets_suffix', 'Tickets')}
                </span>
              </div>

              {recentOrders.length > 0 ? (
                <ul className="divide-y divide-slate-100 dark:divide-slate-700 text-xs">
                  {recentOrders.slice(0, 5).map((ord) => (
                    <li key={ord.id} className="py-2.5 flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{ord.id}</span>
                          <span className="text-slate-400 font-normal">({ord.roomNumber})</span>
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
          <div className="operational-dashboard__col-kitchen-disabled bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 flex flex-col justify-center items-center text-center text-slate-400 text-xs">
            <Utensils className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
            <p>{t('kitchen_module_disabled', 'Kitchen Module Disabled')}</p>
          </div>
        )}

        {/* Column 3: Requisitions Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                {t('requisitions_label', 'Requisitions')}
              </h3>
              <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded border border-red-200">
                {stockAlerts.length} {t('items_low_suffix', 'Items Low')}
              </span>
            </div>

            {stockAlerts.length > 0 ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700 text-xs">
                {stockAlerts.slice(0, 5).map((item) => (
                  <li key={item.id} className="py-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">{item.name}</p>
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

      {/* Booking Calendar Row - Full Width Spread Out at Bottom */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
          <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            {roomName ? `${roomName} Calendar` : t('booking_calendar_heading', 'Booking Calendar')}
          </h3>
          <span className="text-xs font-bold text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/40 px-3 py-1 rounded-lg border border-blue-200 dark:border-blue-800">
            {monthName}
          </span>
        </div>

        {/* Days Header */}
        <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-wider">
          <div>Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
        </div>

        {/* Calendar Grid - Full Width Spread Out */}
        <div className="grid grid-cols-7 gap-2 text-xs">
          {Array.from({ length: firstDay }).map((_, idx) => (
            <div key={`empty-${idx}`} className="h-24 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/40" />
          ))}

          {daysArray.map((d) => {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayBooking = guests.find(
              (g) => dateStr >= g.checkinDate && dateStr < (g.checkoutDate || g.expectedCheckout)
            );
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

            const colors = [
              'bg-teal-600 dark:bg-teal-600',
              'bg-emerald-600 dark:bg-emerald-600',
              'bg-blue-600 dark:bg-blue-600',
              'bg-purple-600 dark:bg-purple-600',
              'bg-pink-600 dark:bg-pink-600',
              'bg-orange-600 dark:bg-orange-600',
              'bg-red-600 dark:bg-red-600',
              'bg-indigo-600 dark:bg-indigo-600',
            ];
            // Flat/muted, distinct from every active color above - this calendar
            // never filtered out Checked Out bookings (unlike the multi-room one),
            // but rendered them identically to active stays, which is exactly the
            // "can't tell what's actually happening now" problem greying this out
            // fixes.
            const checkedOutColor = 'bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-200';
            const isDayBookingCheckedOut = (() => {
              const s = String((dayBooking as any)?.status || '').trim().toLowerCase();
              return s === 'checkedout' || s === 'checked out';
            })();

            let guestColorIndex = 0;
            if (dayBooking) {
              const guestIdNum = parseInt(String(dayBooking.id), 10) || 0;
              guestColorIndex = guestIdNum % colors.length;
            }

            return (
              <div
                key={`day-${d}`}
                className={`h-24 rounded-lg border p-2 transition-all flex flex-col justify-between ${
                  isToday
                    ? 'bg-blue-50/70 dark:bg-blue-900/20 border-blue-400 dark:border-blue-500 ring-2 ring-blue-400/30'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                }`}
              >
                <span className={`text-xs font-bold ${isToday ? 'text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'}`}>{d}</span>
                {dayBooking && (
                  <button
                    onClick={() => setSelectedBooking(dayBooking)}
                    className={`rounded-md px-2 py-1.5 ${isDayBookingCheckedOut ? checkedOutColor : `text-white ${colors[guestColorIndex]}`} text-xs font-bold flex flex-col justify-center shadow-xs hover:shadow-md transition-all cursor-pointer truncate w-full`}
                  >
                    <div className="truncate font-bold">{dayBooking.guestName.split(' ')[0]}</div>
                    {nightlyRate > 0 && <div className="text-[10px] font-semibold opacity-90">₹{nightlyRate}</div>}
                  </button>
                )}
                {otaBlock && (
                  <div
                    title={t('ota_blocked_tooltip', 'Blocked via {{source}} - not yet a booking in this system').replace('{{source}}', otaBlock.source_label || otaBlock.source || 'external calendar')}
                    className="rounded-md px-2 py-1.5 bg-slate-500 dark:bg-slate-600 text-white text-xs font-bold flex flex-col justify-center shadow-xs truncate w-full cursor-help"
                  >
                    <div className="truncate font-bold">{otaBlock.source_label || otaBlock.source || t('ota_blocked_label', 'Blocked')}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

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
            <span className="w-3 h-3 rounded bg-orange-600" />
            <span>{t('legend_airbnb_booking', 'Airbnb Booking')}</span>
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
          onOpenIdVerification={() => setShowCheckinVerification(true)}
          onCheckedIn={onGuestCheckedIn}
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
      {showAddGuestModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowAddGuestModal(false)}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
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
            />
          </div>
        </div>
      )}

      {/* All System Alerts Modal */}
      {showAllAlertsModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowAllAlertsModal(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl bg-white dark:bg-slate-800 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span>All System Alerts ({combinedAlerts.length})</span>
              </h3>
              <button
                onClick={() => setShowAllAlertsModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse operational-dashboard__table operational-dashboard__table--alerts">
                <thead className="operational-dashboard__table-header">
                  <tr className="text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 operational-dashboard__table-header-row">
                    <th className="pb-2 pr-3 operational-dashboard__table-header-cell">{t('alerts_col_guest_room', 'Guest / Room')}</th>
                    <th className="pb-2 pr-3 operational-dashboard__table-header-cell">{t('alerts_col_issue', 'Issue')}</th>
                    <th className="pb-2 w-36 operational-dashboard__table-header-cell">{t('alerts_col_action', 'Action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 operational-dashboard__table-body">
                  {combinedAlerts.map(({ guest: g, severity, reasons }) => (
                    <tr
                      key={g.id}
                      className={severity === 'red' ? 'bg-red-50/60 dark:bg-red-900/10' : 'bg-amber-50/60 dark:bg-amber-900/10'}
                    >
                      <td className="py-3 pr-3 align-top">
                        <div className={`text-sm font-bold ${severity === 'red' ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}`}>
                          {g.guestName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{g.roomNumber}</div>
                      </td>
                      <td className="py-3 pr-3 align-top">
                        <div className="space-y-1">
                          {reasons.map((r, i) => (
                            <div
                              key={i}
                              className={`text-xs font-medium ${severity === 'red' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}
                            >
                              {r.label} — {r.detail}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 align-top">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};





