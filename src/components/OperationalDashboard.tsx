import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  User,
  Phone,
  Calendar,
  Utensils,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  Clock,
  IndianRupee,
  Plus,
  ExternalLink,
  Pencil,
  IdCard,
  Share2,
  Printer
} from 'lucide-react';
import * as htmlToImage from 'html-to-image';
import { Guest, Order } from '../types';
import { useInventoryContext } from '../contexts/InventoryContext';
import { useKitchenContext } from '../contexts/KitchenContext';
import { getPropertySlug, markCFormFiled } from '../services/api';
import { DateRangePicker } from './DateRangePicker';
import { GuestManagement } from './GuestManagement';
import { CheckinVerificationModal } from './CheckinVerificationModal';
import { StyledSelect } from './StyledSelect';
import { useToast } from './ToastContext';
import { DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, renderWhatsappVoucherTemplate } from '../utils/whatsappVoucherTemplate';
import { t } from '../i18n/en';

interface OperationalDashboardProps {
  guests: Guest[];
  receipts?: any[];
  menu?: any[];
  roomName?: string;
  roomId?: number;
  propertySlug?: string;
  rooms?: any[];
  onNavigate: (tab: any) => void;
  onOpenCheckin: () => void;
  onAddGuest?: (guest: Guest) => void;
  onCheckoutGuest?: (receipt: any) => void;
  onDispatchTelegram?: (eventType: string, message: string, channelFilter?: 'all' | 'kitchen' | 'finance' | 'admin', replyMarkup?: any, templateKey?: string) => void;
  onUpdateRoomName?: (newName: string) => void;
  onUpdateBooking?: (guest: Guest) => Promise<void>;
  onDeleteBooking?: (guestId: string) => Promise<void>;
  onGuestVerificationUpdated?: (guestId: string) => void;
  onCFormFiledUpdated?: (guestId: string, filedAt: string | null) => void;
  activeMenuItemKey?: string;
  kitchenModuleEnabled?: boolean;
  propertyName?: string;
  propertyMapsLink?: string;
  propertyPhone?: string;
  propertyWhatsappTemplate?: string;
}

export const OperationalDashboard: React.FC<OperationalDashboardProps> = ({
  guests,
  receipts = [],
  menu = [],
  rooms = [],
  roomName,
  roomId,
  propertySlug,
  onNavigate,
  onOpenCheckin,
  onAddGuest,
  onCheckoutGuest,
  onDispatchTelegram,
  onUpdateRoomName,
  onUpdateBooking,
  onDeleteBooking,
  onGuestVerificationUpdated,
  onCFormFiledUpdated,
  activeMenuItemKey,
  kitchenModuleEnabled = true,
  propertyName = '',
  propertyMapsLink = '',
  propertyPhone = '',
  propertyWhatsappTemplate = '',
}) => {
  const { showToast } = useToast();
  const [isSharingPng, setIsSharingPng] = useState(false);
  const { orders } = useKitchenContext();
  const pendingOrders = orders.filter((o) => o.status === 'Pending' || o.status === 'Preparing');
  const recentOrders = orders.slice(0, 5);
  const { inventory } = useInventoryContext();
  const [selectedBooking, setSelectedBooking] = useState<Guest | null>(null);
  const [editCheckin, setEditCheckin] = useState<string>('');
  const [editCheckout, setEditCheckout] = useState<string>('');
  const [editGuestName, setEditGuestName] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editNoOfGuests, setEditNoOfGuests] = useState<number>(1);
  const [editRoomId, setEditRoomId] = useState<string>('');
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSavingBooking, setIsSavingBooking] = useState(false);
  const [isDeletingBooking, setIsDeletingBooking] = useState(false);
  const [showCheckinVerification, setShowCheckinVerification] = useState(false);
  const [isEditingRoomName, setIsEditingRoomName] = useState(false);
  const [editingRoomName, setEditingRoomName] = useState(roomName || '');
  const [showAddGuestModal, setShowAddGuestModal] = useState(false);
  const [showCleared, setShowCleared] = useState(false);
  const [blockedDates, setBlockedDates] = useState<Array<{
    event_start: string;
    event_end: string;
    event_title: string;
    reservation_url?: string;
    source?: string;
  }>>([]);

  // Get blocked dates from other guests (excluding current guest)
  const getBlockedDateRanges = (currentGuest: Guest | null) => {
    if (!currentGuest) return [];
    return guests
      .filter(g => g.id !== currentGuest.id) // Exclude current guest
      .flatMap(g => {
        const start = new Date(g.checkinDate);
        const end = new Date(g.expectedCheckout);
        return { start, end };
      });
  };

  // Check if a date falls within any blocked range
  const isDateBlocked = (dateStr: string, blockedRanges: Array<{ start: Date; end: Date }>) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    return blockedRanges.some(range => date >= range.start && date < range.end);
  };

  // Convert blocked date ranges to array of individual date strings for DatePicker
  const getBlockedDateStrings = (currentGuest: Guest | null) => {
    if (!currentGuest) return [];
    const blockedRanges = getBlockedDateRanges(currentGuest);
    const blockedStrings: string[] = [];

    blockedRanges.forEach(range => {
      const current = new Date(range.start);
      while (current < range.end) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');
        blockedStrings.push(`${year}-${month}-${day}`);
        current.setDate(current.getDate() + 1);
      }
    });

    return blockedStrings;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const dateOnly = dateStr.split(' ')[0];
    const parts = dateOnly.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  // WhatsApp share - same wa.me + per-property customizable template as the
  // post-booking confirmation voucher and the TodayOverview calendar's
  // Booking Details modal, so it's reachable from here too.
  const buildWhatsAppShareUrl = (guest: Guest) => {
    const digits = (guest.phoneNumber || '').replace(/\D/g, '');
    const phone = digits.length === 10 ? '91' + digits : digits;
    const message = renderWhatsappVoucherTemplate(propertyWhatsappTemplate || DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, {
      guest_name: guest.guestName,
      room_name: guest.roomNumber || roomName || '',
      property_name: propertyName || 'us',
      checkin_date: formatDate(guest.checkinDate?.split(' ')[0] || ''),
      checkout_date: formatDate(guest.expectedCheckout?.split(' ')[0] || ''),
      guest_count: String((guest as any).no_of_guests ?? (guest as any).numberOfGuests ?? 1),
      room_tariff: ((guest as any).per_night_charges || (guest as any).roomRate || 0).toFixed(2),
      advance_paid: ((guest as any).advance_paid || (guest as any).advanceAmount || (guest as any).advance || 0).toFixed(2),
      maps_link: propertyMapsLink || '',
      contact_phone: propertyPhone || '',
    });
    return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
  };

  // "Share Voucher (PNG)" - same html-to-image pattern used on the booking
  // confirmation voucher, the billing receipt, and the TodayOverview
  // calendar's Booking Details modal.
  const handleShareVoucherPng = async () => {
    const voucherBox = document.getElementById('printableRoomBookingContent');
    if (!voucherBox) return;
    const actionsBar = document.getElementById('printableRoomBookingActionsBar');
    if (actionsBar) actionsBar.style.display = 'none';
    setIsSharingPng(true);

    try {
      const blob = await htmlToImage.toBlob(voucherBox, { pixelRatio: 2, backgroundColor: '#ffffff' });
      if (!blob) return;
      const file = new File([blob], `Booking_${selectedBooking?.guestName || 'Details'}_${Date.now()}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Booking Details' });
      } else {
        const link = document.createElement('a');
        link.download = `Booking_${selectedBooking?.guestName || 'Details'}_${Date.now()}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
      }
    } catch (err) {
      showToast('Failed to generate image: ' + (err instanceof Error ? err.message : String(err)), { type: 'error' });
    } finally {
      if (actionsBar) actionsBar.style.display = '';
      setIsSharingPng(false);
    }
  };

  // Update edit state when booking is selected
  useEffect(() => {
    if (selectedBooking) {
      setEditCheckin(selectedBooking.checkinDate?.split(' ')[0] || '');
      setEditCheckout(selectedBooking.expectedCheckout?.split(' ')[0] || '');
      setEditGuestName(selectedBooking.guestName || '');
      setEditPhone(selectedBooking.phoneNumber || '');
      setEditNoOfGuests((selectedBooking as any).no_of_guests || 1);
      const bookingRoomId = (selectedBooking as any).room_id || (selectedBooking as any).roomId;
      setEditRoomId(bookingRoomId ? String(bookingRoomId) : '');
      setShowDateRangePicker(false);
    }
  }, [selectedBooking]);

  // Fetch blocked dates from iCal sync
  useEffect(() => {
    const fetchBlockedDates = async () => {
      try {
        const propertySlug = getPropertySlug();
        const response = await fetch('/artists_farm/php/api/ical_sync.php?action=get_blocked_dates', {
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
  const activeGuest = guests.find((g) => {
    if (g.status !== 'Active') return false;
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

  const overdueCheckins = guests.filter((g) => {
    const checkin = parseDateOnly(g.checkinDate);
    return g.status === 'Booked' && checkin !== null && checkin <= today;
  });
  const overdueCheckouts = guests.filter((g) => {
    const checkout = parseDateOnly(g.expectedCheckout);
    return g.status === 'Active' && checkout !== null && checkout < today;
  });
  const checkinPending = guests.filter(
    (g) => g.status === 'Active' && isCurrentlyInStay(g) && g.idVerificationStatus !== 'Complete'
  );
  const idMissingAfterCheckout = guests.filter(
    (g) => g.status === 'CheckedOut' && g.idVerificationStatus !== 'Complete'
  );
  // Advance doesn't need to be collected at check-in, but the bill must be
  // fully settled by checkout - flag any checked-out guest still owing.
  const unsettledBills = guests.filter(
    (g) => g.status === 'CheckedOut' && (g.totalAmount || 0) > (g.advanceAmount || 0)
  );
  const clearedGuests = guests.filter(
    (g) =>
      g.status === 'CheckedOut' &&
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
    (g) => g.isForeignGuest && g.status === 'Active' && !g.cFormFiledAt
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
    <div className="space-y-6">
      {/* Room Info Header - Compact Layout. The row itself (and the Add
          Booking button) always renders, Single or Multi-Key - only the
          room-name editing UI inside it is room-specific. */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          {roomName && (
            isEditingRoomName ? (
              <input
                type="text"
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
                className="text-2xl font-bold text-gray-900 border-b-2 border-blue-600 focus:outline-none"
              />
            ) : (
              <div className="flex items-center gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-bold text-gray-900 tracking-tight">{roomName}</h3>
                    <button
                      onClick={() => {
                        setIsEditingRoomName(true);
                        setEditingRoomName(roomName || '');
                      }}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition text-gray-600 hover:text-gray-900"
                      title={t('edit_room_name_tooltip', 'Edit room name')}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <p className="text-xs text-gray-500">in Goa Homes</p>
                    {roomId && <p className="text-xs text-gray-400">(ID: {roomId})</p>}
                  </div>
                </div>
              </div>
            )
          )}
          {roomName && isEditingRoomName && <p className="text-xs text-gray-500 mt-1">in Goa Homes {roomId && `(ID: ${roomId})`}</p>}
        </div>
        <button
          onClick={() => setShowAddGuestModal(true)}
          className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-semibold rounded-lg text-sm px-4 py-2 flex items-center gap-2 shadow-2xs transition-all cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>{t('add_booking_button', 'Add Booking')}</span>
        </button>
      </div>

      {/* Front-desk Alerts */}
      {(totalAlerts > 0 || clearedGuests.length > 0) && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 shadow-2xs p-5">
          <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2 mb-3 pb-2 border-b border-gray-100 dark:border-slate-700">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            {t('alerts_heading', 'Alerts')}
            {totalAlerts > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300">
                {totalAlerts}
              </span>
            )}
          </h3>
          {totalAlerts === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('no_outstanding_issues', 'No outstanding issues.')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-slate-700">
                    <th className="pb-2 pr-3">{t('alerts_col_guest_room', 'Guest / Room')}</th>
                    <th className="pb-2 pr-3">{t('alerts_col_issue', 'Issue')}</th>
                    <th className="pb-2 w-36">{t('alerts_col_action', 'Action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                  {combinedAlerts.map(({ guest: g, severity, reasons }) => (
                    <tr
                      key={g.id}
                      className={severity === 'red' ? 'bg-red-50/60 dark:bg-red-900/10' : 'bg-amber-50/60 dark:bg-amber-900/10'}
                    >
                      <td className="py-2.5 pr-3 align-top">
                        <div className={`text-sm font-bold ${severity === 'red' ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}`}>
                          {g.guestName}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{g.roomNumber}</div>
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
          {clearedGuests.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700">
              <button
                onClick={() => setShowCleared((prev) => !prev)}
                className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t('cleared_label', 'Cleared')} ({clearedGuests.length})
                <span className="text-gray-400 font-normal">{showCleared ? '▲' : '▼'}</span>
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
                        <span className="text-xs font-medium text-emerald-700 whitespace-nowrap">
                          {formatAlertDate(g.checkinDate)} → {formatAlertDate(g.checkoutDate || g.expectedCheckout)}
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
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 shadow-2xs p-5">
          <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2 mb-3 pb-2 border-b border-gray-100 dark:border-slate-700">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            {t('cform_filing_due_heading', 'C-Form Filing Due')}
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300">
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
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{g.guestName}</p>
                    <p className={`text-xs font-medium ${due.overdue ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
                      {due.label}
                    </p>
                  </button>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 cursor-pointer whitespace-nowrap shrink-0">
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

      {/* Today's Check-ins & Pending Actions */}
      {todaysCheckins.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-2xs p-5">
          <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
            <IdCard className="w-4 h-4 text-purple-600" />
            {t('todays_checkins_heading', "Today's Check-ins & Pending Actions")}
          </h3>
          <ul className="space-y-2">
            {todaysCheckins.map((g) => {
              const verified = g.idVerificationStatus === 'Complete';
              return (
                <li
                  key={g.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                    verified ? 'border-gray-100 bg-gray-50' : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  <div>
                    <p className="text-sm font-bold text-gray-900">{g.guestName}</p>
                    <p className="text-xs text-gray-500">{g.roomNumber}</p>
                  </div>
                  {verified ? (
                    <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                      {t('id_verified_badge', 'ID Verified')}
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setSelectedBooking(g);
                        setShowCheckinVerification(true);
                      }}
                      className="text-[10px] font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {t('id_upload_pending_button', '⚠️ ID Upload Pending')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Additional stat cards below */}
      {kitchenModuleEnabled && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('kitchen_queue_label', 'Kitchen Queue')}</p>
              <p className="text-lg font-bold text-gray-900 mt-1">
                {pendingOrders.length} {t('tickets_suffix', 'Tickets')}
                </p>
                <p className="text-xs text-amber-600 font-semibold mt-0.5">{t('active_kitchen_queue_label', 'Live Order Queue')}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                <Utensils className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('requisitions_label', 'Requisitions')}</p>
                <p className="text-lg font-bold text-gray-900 mt-1">
                  {stockAlerts.length} {t('items_low_suffix', 'Items Low')}
                </p>
                <p className="text-xs text-red-600 font-semibold mt-0.5">{t('low_stock_warnings_label', 'Low Stock Warnings')}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-100 text-red-700 flex items-center justify-center font-bold">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
        </div>
      )}

      {/* Content Cards Grid */}
      <div className={`grid grid-cols-1 ${kitchenModuleEnabled ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-6`}>
        {/* Resident Card */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-2xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                {t('current_resident_profile_heading', 'Guest Currently Staying')}
              </h3>
              <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200">
                {t('active_stay_badge', 'Active Stay')}
              </span>
            </div>

            {activeGuest ? (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                  <span className="text-gray-500 font-medium flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-gray-400" /> {t('guest_name_colon_label', 'Guest Name:')}
                  </span>
                  <span className="font-bold text-gray-900 text-sm">{activeGuest.guestName}</span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                  <span className="text-gray-500 font-medium flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-gray-400" /> {t('contact_phone_colon_label', 'Contact Phone:')}
                  </span>
                  <span className="font-semibold text-gray-800">{activeGuest.phoneNumber}</span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                  <span className="text-gray-500 font-medium flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" /> {t('dates_colon_label', 'Dates:')}
                  </span>
                  <span className="font-semibold text-gray-800">
                    {(() => {
                      const formatDate = (dateStr?: string) => {
                        if (!dateStr) return '';
                        const dateOnly = dateStr.split(' ')[0];
                        const parts = dateOnly.split('-');
                        if (parts.length !== 3) return dateStr;
                        return `${parts[2]}/${parts[1]}/${parts[0]}`;
                      };
                      return `${formatDate(activeGuest.checkinDate)} → ${formatDate(activeGuest.expectedCheckout)}`;
                    })()}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5">
                  <span className="text-gray-500 font-medium">{t('room_label', 'Room:')}</span>
                  <span className="font-bold bg-gray-100 text-gray-800 px-2.5 py-1 rounded border border-gray-200">
                    {activeGuest.roomNumber}
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-gray-400 text-xs font-medium">
                {t('no_active_resident_message', 'No guest currently staying.')}
              </div>
            )}
          </div>

        </div>

        {/* Kitchen KDS Card — nothing to show for a property with no food service */}
        {kitchenModuleEnabled && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-2xs p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-blue-600" />
                  {t('live_kitchen_tickets_heading', 'Live Kitchen Tickets')}
                </h3>
                <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200">
                  {t('order_queue_badge', 'Order Queue')}
                </span>
              </div>

              {recentOrders.length > 0 ? (
                <ul className="divide-y divide-gray-100 text-xs">
                  {recentOrders.map((ord) => (
                    <li key={ord.id} className="py-2.5 flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-gray-900 flex items-center gap-1.5">
                          <span>{ord.id}</span>
                          <span className="text-gray-400 font-normal">({ord.roomNumber})</span>
                        </div>
                        <p className="text-gray-500 text-[11px] mt-0.5 line-clamp-1">
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
                <div className="py-8 text-center text-gray-400 text-xs font-medium">
                  {t('no_active_kitchen_tickets_message', 'No active kitchen tickets.')}
                </div>
              )}
            </div>

            <button
              onClick={() => onNavigate('kitchen')}
              className="mt-5 w-full text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-semibold text-xs py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>{t('open_kitchen_orders_button', 'Open Kitchen Orders')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Booking Calendar Card */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-2xs p-5 flex flex-col justify-between">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                {roomName ? `${roomName} Calendar` : t('booking_calendar_heading', 'Booking Calendar')}
              </h3>
              <span className="text-xs font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {monthName}
              </span>
            </div>

            {/* Calendar Grid Header */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-400 mb-2">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>

            {/* Calendar Grid with Spanning Capsules */}
            <div className="space-y-2 overflow-x-auto">

              {/* Calendar Grid - Simple per-day bookings */}
              <div className="grid grid-cols-7 gap-1 text-[11px] min-w-max">
                {Array.from({ length: firstDay }).map((_, idx) => (
                  <div key={`empty-${idx}`} className="h-20 rounded bg-gray-50 border border-gray-100" />
                ))}

                {daysArray.map((d) => {
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const dayBooking = guests.find(
                    (g) => dateStr >= g.checkinDate && dateStr < (g.checkoutDate || g.expectedCheckout)
                  );
                  const isToday = d === today.getDate();

                  const amount = (dayBooking as any)?.totalCharge || (dayBooking as any)?.totalAmount || (dayBooking as any)?.total_charge || 0;
                  const nightlyRate = Math.round(amount / Math.max(1, 1));

                  const colors = [
                    'bg-teal-500 dark:bg-teal-600',
                    'bg-emerald-500 dark:bg-emerald-600',
                    'bg-blue-500 dark:bg-blue-600',
                    'bg-purple-500 dark:bg-purple-600',
                    'bg-pink-500 dark:bg-pink-600',
                    'bg-orange-500 dark:bg-orange-600',
                    'bg-red-500 dark:bg-red-600',
                    'bg-indigo-500 dark:bg-indigo-600',
                  ];

                  // Assign color based on guest ID for consistency
                  let guestColorIndex = 0;
                  if (dayBooking) {
                    const guestIdNum = parseInt(String(dayBooking.id), 10) || 0;
                    guestColorIndex = guestIdNum % colors.length;
                  }

                  return (
                    <div
                      key={`day-${d}`}
                      className={`h-20 rounded border p-1.5 transition-all flex flex-col ${
                        isToday
                          ? 'bg-blue-50 border-blue-300'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <span className={`text-[10px] font-semibold mb-1 ${isToday ? 'text-blue-700 font-bold' : 'text-gray-500'}`}>{d}</span>
                      {dayBooking && (
                        <button
                          onClick={() => setSelectedBooking(dayBooking)}
                          className={`rounded px-1.5 py-1 text-white text-[9px] font-bold flex-1 flex flex-col justify-center ${colors[guestColorIndex]} shadow-sm hover:shadow-md hover:scale-105 transition-all cursor-pointer`}
                        >
                          <div className="truncate">{dayBooking.guestName.split(' ')[0]}</div>
                          <div className="text-[8px] font-semibold">₹{nightlyRate}</div>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-blue-100 border border-blue-300" />
                <span>{t('legend_active_resident', 'Active Resident')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-gray-300" />
                <span>{t('legend_checked_out', 'Checked Out')}</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-orange-500" />
                <span>{t('legend_airbnb_booking', 'Airbnb Booking')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-red-100 border border-red-200" />
                <span>{t('legend_blocked', 'Blocked')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Booking Details Modal - Editable */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div id="printableRoomBookingContent" className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('edit_booking_header', 'Edit Booking')}</h2>
              <button onClick={() => setSelectedBooking(null)} className="text-gray-500 hover:text-gray-700 text-2xl">✕</button>
            </div>

            <button
              onClick={() => setShowCheckinVerification(true)}
              className={`w-full mb-4 px-4 py-2.5 rounded-lg border flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                selectedBooking.idVerificationStatus === 'Complete'
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                  : 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <IdCard className="w-4 h-4" />
                {t('checkin_id_verification_label', 'Check-in ID Verification')}
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                selectedBooking.idVerificationStatus === 'Complete'
                  ? 'bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : 'bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200'
              }`}>
                {selectedBooking.idVerificationStatus === 'Complete' ? t('verification_complete_badge', 'Complete') : t('verification_pending_badge', 'Pending')}
              </span>
            </button>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">{t('guest_name_only_label', 'Guest Name')}</label>
                <input
                  type="text"
                  value={editGuestName}
                  onChange={(e) => setEditGuestName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg"
                />
              </div>

              {rooms.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">{t('room_column', 'Room')}</label>
                  <div className="mt-1">
                    <StyledSelect
                      value={editRoomId}
                      onChange={setEditRoomId}
                      options={rooms.map((room) => {
                        const newCheckin = new Date(editCheckin || selectedBooking.checkinDate);
                        const newCheckout = new Date(editCheckout || selectedBooking.expectedCheckout);
                        const occupiedByOther = guests.some((g) => {
                          if (g.id === selectedBooking.id) return false;
                          if (g.status !== 'Active') return false;
                          const gRoomId = (g as any).roomId || (g as any).room_id;
                          if (Number(gRoomId) !== Number(room.id)) return false;
                          const gCheckin = new Date(g.checkinDate);
                          const gCheckout = new Date(g.expectedCheckout || g.checkoutDate || g.checkinDate);
                          return newCheckin < gCheckout && gCheckin < newCheckout;
                        });
                        return {
                          value: String(room.id),
                          label: `${room.name}${occupiedByOther ? ' (occupied these dates)' : ''}`,
                          disabled: occupiedByOther,
                        };
                      })}
                    />
                  </div>
                </div>
              )}

              <div>
                <button
                  onClick={() => setShowDateRangePicker(true)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {editCheckin && editCheckout
                    ? `${new Date(editCheckin).toLocaleDateString('en-GB')} → ${new Date(editCheckout).toLocaleDateString('en-GB')}`
                    : t('select_checkin_checkout_placeholder', 'Select check-in and check-out dates')}
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">{t('phone_label', 'Phone')}</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">{t('number_of_guests_label', 'Number of Guests')}</label>
                <input
                  type="number"
                  min={1}
                  value={editNoOfGuests}
                  onChange={(e) => setEditNoOfGuests(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg"
                />
              </div>
            </div>

            <div id="printableRoomBookingActionsBar">
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedBooking(null)}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold rounded-lg hover:bg-gray-300 transition"
                >
                  {t('cancel_button', 'Cancel')}
                </button>
                <button
                  onClick={async () => {
                    if (!selectedBooking || !onUpdateBooking) return;
                    setIsSavingBooking(true);
                    try {
                      await onUpdateBooking({
                        ...selectedBooking,
                        guestName: editGuestName,
                        phoneNumber: editPhone,
                        checkinDate: editCheckin,
                        expectedCheckout: editCheckout,
                        ...( { no_of_guests: editNoOfGuests } as any),
                        ...(editRoomId ? { room_id: Number(editRoomId) } as any : {}),
                      });
                      showToast('Booking updated successfully', { type: 'success' });
                      setSelectedBooking(null);
                    } catch (err) {
                      showToast('Failed to update booking. Please try again.', { type: 'error' });
                    } finally {
                      setIsSavingBooking(false);
                    }
                  }}
                  disabled={isSavingBooking || !onUpdateBooking}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition"
                >
                  {isSavingBooking ? t('saving_button', 'Saving…') : t('save_button', 'Save')}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex-1 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition"
                >
                  {t('delete_button', 'Delete')}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <a
                  href={buildWhatsAppShareUrl(selectedBooking)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition flex items-center justify-center gap-2 text-sm"
                >
                  <Share2 className="w-4 h-4" />
                  {t('share_whatsapp_button', 'Share via WhatsApp')}
                </a>
                <button
                  onClick={handleShareVoucherPng}
                  disabled={isSharingPng}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition flex items-center justify-center gap-2 text-sm cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  {isSharingPng ? t('preparing_button', 'Preparing…') : t('share_png_button', 'Share PNG')}
                </button>
              </div>
            </div>
          </div>

          {/* Date Range Picker Modal */}
          <DateRangePicker
            isOpen={showDateRangePicker}
            onClose={() => setShowDateRangePicker(false)}
            checkinDate={editCheckin}
            checkoutDate={editCheckout}
            onCheckinChange={setEditCheckin}
            onCheckoutChange={setEditCheckout}
            onClear={() => {
              setEditCheckin('');
              setEditCheckout('');
            }}
            blockedDates={getBlockedDateStrings(selectedBooking)}
          />

          {/* Delete Confirmation Modal */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl max-w-sm w-full p-6">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{t('delete_booking_header', 'Delete Booking')}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
                  Are you sure you want to delete this booking for {selectedBooking?.guestName}? This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold rounded-lg hover:bg-gray-300 transition"
                  >
                    {t('cancel_button', 'Cancel')}
                  </button>
                  <button
                    onClick={async () => {
                      if (!selectedBooking || !onDeleteBooking) return;
                      setIsDeletingBooking(true);
                      try {
                        await onDeleteBooking(selectedBooking.id);
                        showToast('Booking deleted', { type: 'success' });
                        setSelectedBooking(null);
                        setShowDeleteConfirm(false);
                      } catch (err) {
                        showToast('Failed to delete booking. Please try again.', { type: 'error' });
                      } finally {
                        setIsDeletingBooking(false);
                      }
                    }}
                    disabled={isDeletingBooking || !onDeleteBooking}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition"
                  >
                    {isDeletingBooking ? t('deleting_button', 'Deleting…') : t('delete_button', 'Delete')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Check-in ID Verification Modal */}
          {showCheckinVerification && (
            <CheckinVerificationModal
              guest={selectedBooking}
              isOpen={showCheckinVerification}
              onClose={() => {
                setShowCheckinVerification(false);
                // This modal is opened from inside the Edit Booking modal, on
                // top of it - closing (manually, or automatically after
                // completing) should return to the dashboard, not reveal Edit
                // Booking sitting underneath unexpectedly.
                setSelectedBooking(null);
              }}
              onVerificationComplete={(guestId) => {
                onGuestVerificationUpdated?.(guestId);
                setSelectedBooking((prev) => (prev ? { ...prev, idVerificationStatus: 'Complete' } : prev));
              }}
            />
          )}
        </div>
      )}

      {/* Add Guest Modal */}
      {showAddGuestModal && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowAddGuestModal(false)} />
          <div className="fixed z-50 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-2xl overflow-y-auto w-[calc(100%-2rem)] max-w-2xl max-h-[90vh]">
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
                // roomName is only ever passed for the Multi-Key per-room
                // dashboard (see MultiKeyPropertyOverview) - the Single-property
                // dashboard renders this same modal with none of that, and
                // always claiming isMultiKeyProperty broke the form for Single
                // properties once the Add Booking button became unconditional.
                isMultiKeyProperty={!!roomName}
                selectedRoomSlug={roomName}
                preSelectRoom={roomName}
                onClose={() => setShowAddGuestModal(false)}
              />
          </div>
        </>
      )}
    </div>
  );
};
