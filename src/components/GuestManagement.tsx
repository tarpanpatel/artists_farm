import React, { useState, useEffect } from 'react';
import { Button, Badge, Checkbox } from 'flowbite-react';
import {
  Trash2,
  Plus,
} from './icons/FlowbiteIcons';
import { Guest, BillingReceipt, MiscChargeTemplate, MenuItem } from '../types';
import { Tooltip } from './Tooltip';
import { useToast } from './ToastContext';
import { useStaff } from '../contexts/StaffContext';
import { useConfigurationData } from '../contexts/ConfigurationDataContext';
import {
  GUEST_STATUS_CHECKED_IN,
  GUEST_STATUS_CHECKED_OUT,
  GUEST_STATUS_BOOKED,
  GUEST_STATUS_ACTIVE_LEGACY,
  GUEST_STATUS_CHECKEDOUT_LEGACY,
} from '../constants/guestStatus';
import { getPropertySlug } from '../services/api';
import { DateRangePicker } from './DateRangePicker';
import { StyledSelect } from './StyledSelect';
import { Input } from './Input';
import { BillingCheckout } from './BillingCheckout';
import { t } from '../i18n/en';

interface Room {
  id: number;
  name: string;
  slug: string;
  room_order?: number;
  is_active?: number;
  default_tariff?: number | null;
}

export interface BookingExtraChargeLine {
  id: string;
  category: string;
  miscNote: string;
  amount: number | '';
}

interface GuestManagementProps {
  guests: Guest[];
  receipts: BillingReceipt[];
  menu: MenuItem[];
  // Promise<void>, not void (23 Aug 2026, ROADMAP.md verification pass) - the submit handler
  // below needs to await this and catch a real rejection (App.tsx's handleAddGuest now throws on
  // a genuine backend validation failure) instead of always showing a hardcoded success toast.
  onAddGuest: (guest: Guest) => Promise<void>;
  onCheckoutGuest: (receipt: BillingReceipt) => void;
  onUpdateGuest?: (updatedGuest: Guest) => void;
  onDeleteGuest?: (guestId: string) => Promise<void>;
  onCheckInGuest?: (guestId: string) => Promise<void>;
  onGuestVerificationUpdated?: (guestId: string, verified: boolean) => void;
  onCFormFiledUpdated?: (guestId: string, filedAt: string | null) => void;
  activeMenuItemKey?: string;
  onDispatchTelegram?: (eventType: string, message: string, channelFilter?: 'all' | 'kitchen' | 'finance' | 'admin', replyMarkup?: any, templateKey?: string) => void;
  isMultiKeyProperty?: boolean;
  rooms?: Room[];
  onNavigateToBilling?: (guestId: string) => void;
  onSetActiveMenuItemKey?: (key: string) => void;
  selectedRoomSlug?: string | null;
  preSelectRoom?: string;
  onClose?: () => void;
  focusGuestId?: string | null;
  onClearFocusGuest?: () => void;
  kitchenModuleEnabled?: boolean;
  propertyGstin?: string;
  propertyName?: string;
  propertyMapsLink?: string;
  propertyPhone?: string;
  propertyWhatsappTemplate?: string;
  propertyUpiId?: string;
  propertyUpiQrCodeUrl?: string;
  propertyAddress?: string;
  propertyInstructions?: string;
  propertyCheckinTime?: string;
  propertyCheckoutTime?: string;
}



export interface IncidentalsItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface AdjustmentItem {
  id: string;
  reason: string;
  amount: number;
  type: 'charge' | 'discount';
}

export interface PaymentSplitRow {
  id: number;
  amount: number;
  mode: 'Cash' | 'UPI';
  recipient: string;
}

export const GuestManagement: React.FC<GuestManagementProps> = ({
  guests,
  receipts,
  menu: _menu,
  onAddGuest,
  onCheckoutGuest,
  onUpdateGuest,
  onDeleteGuest: _onDeleteGuest,
  activeMenuItemKey,
  onDispatchTelegram: _onDispatchTelegram,
  isMultiKeyProperty = false,
  rooms = [],
  onNavigateToBilling,
  onSetActiveMenuItemKey: _onSetActiveMenuItemKey,
  selectedRoomSlug,
  preSelectRoom,
  onClose,
  focusGuestId = null,
  onClearFocusGuest,
  // No longer used within this component (was only for the now-removed
  // GuestHistory/"Past Guests" archive view) - kept in the prop interface
  // since MultiKeyPropertyOverview/OperationalDashboard still forward it
  // down from App.tsx, and BookingDetailsModal (opened via Edit Booking)
  // handles C-Form filing on its own now.
  onCFormFiledUpdated: _onCFormFiledUpdated,
  kitchenModuleEnabled = true,
  propertyGstin = '',
  propertyName = '',
  propertyMapsLink = '',
  propertyPhone = '',
  propertyWhatsappTemplate = '',
  propertyUpiId = '',
  propertyUpiQrCodeUrl = '',
  propertyAddress = '',
  propertyInstructions = '',
  propertyCheckinTime = '',
  propertyCheckoutTime = '',
}) => {
  const { showToast } = useToast();
  const { staff } = useStaff();
  const { miscCharges } = useConfigurationData();

  // Form Checkin State
  const [guestName, setGuestName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [bookingSourceLocal, setBookingSourceLocal] = useState('Offline');
  const [advanceReceivedBy, setAdvanceReceivedBy] = useState('');
  const [pendingReceivedBy, setPendingReceivedBy] = useState('');
  const [checkinDate, setCheckinDate] = useState(new Date().toISOString().split('T')[0]);
  const [checkinTime, setCheckinTime] = useState('14:00');
  const [expectedCheckout, setExpectedCheckout] = useState(
    new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]
  );
  const [checkoutTime, setCheckoutTime] = useState('11:00');
  const [notes, setNotes] = useState('');
  const [showGuestNotes, setShowGuestNotes] = useState(false);
  const [isForeignGuest, setIsForeignGuest] = useState(false);
  const [noOfGuests, setNoOfGuests] = useState(1);

  // BillingCheckout's own effect (child, so it fires first within the same
  // commit) reads focusGuestId to jump to the right tab and pre-fill the
  // search box - clearing it here right after just resets App.tsx's state so
  // a later, unrelated visit to this tab doesn't stay stuck filtered to
  // whichever guest was last checked out from the calendar.
  useEffect(() => {
    if (focusGuestId) onClearFocusGuest?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusGuestId]);

  // Set default room for MultiKey properties on component mount
  useEffect(() => {
    if (isMultiKeyProperty && rooms && rooms.length > 0) {
      let roomToSelect = null;

      // If preSelectRoom is provided (e.g., from modal on room view), use that
      if (preSelectRoom) {
        // Check if preSelectRoom exactly matches a room name
        const exactMatch = rooms.find((r) => r.name === preSelectRoom);
        if (exactMatch) {
          roomToSelect = preSelectRoom;
        } else {
          // Try to find room by extracting number from name
          roomToSelect = preSelectRoom;
        }
      } else if (selectedRoomSlug) {
        // If coming from a specific room view, pre-select that room
        const selectedRoom = rooms.find((r) => r.slug === selectedRoomSlug);
        if (selectedRoom) {
          roomToSelect = selectedRoom.name;
        }
      } else if (!roomNumber) {
        // Otherwise, pre-select the first room
        roomToSelect = rooms[0].name;
      }

      if (roomToSelect) {
        setRoomNumber(roomToSelect);
      }
    }
  }, [isMultiKeyProperty, rooms.length, selectedRoomSlug, preSelectRoom]);

  // Registration Form State
  const [bookingRoomTariff, setBookingRoomTariff] = useState<number>(0);
  // Tracks whether the rent field's current value came from the STAFF typing
  // it, as opposed to an auto-fill from a room's default_tariff - see
  // handleRoomChange()'s doc comment below for why this exists separately
  // from bookingRoomTariff itself (found + fixed 21 Aug 2026, verifying the
  // multi-key per-room tariff pre-fill).
  const [tariffManuallyEdited, setTariffManuallyEdited] = useState(false);
  const [bookingAdvance, setBookingAdvance] = useState<number>(0);
  const [bookingPending, setBookingPending] = useState<number>(0);
  const [showBookingExtraCharges, setShowBookingExtraCharges] = useState<boolean>(false);
  const [bookingExtraChargesList, setBookingExtraChargesList] = useState<BookingExtraChargeLine[]>([]);
  const [miscChargesList, setMiscChargesList] = useState<MiscChargeTemplate[]>([]);

  const calcTotalBookingExtraCharges = (list: BookingExtraChargeLine[], active: boolean): number => {
    if (!active) return 0;
    return list.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  };

  const handleToggleExtraChargesCheckbox = (checked: boolean) => {
    setShowBookingExtraCharges(checked);
    if (checked) {
      if (bookingExtraChargesList.length === 0) {
        const initialList: BookingExtraChargeLine[] = [
          { id: `charge-${Date.now()}`, category: '', miscNote: '', amount: '' }
        ];
        setBookingExtraChargesList(initialList);
        const totalExtra = calcTotalBookingExtraCharges(initialList, true);
        setBookingPending(bookingRoomTariff + totalExtra - bookingAdvance);
      }
    } else {
      setBookingExtraChargesList([]);
      setBookingPending(bookingRoomTariff - bookingAdvance);
    }
  };

  const handleAddBookingExtraChargeLine = () => {
    const newLine: BookingExtraChargeLine = {
      id: `charge-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      category: '',
      miscNote: '',
      amount: '',
    };
    const updated = [...bookingExtraChargesList, newLine];
    setBookingExtraChargesList(updated);
  };

  const handleRemoveBookingExtraChargeLine = (id: string) => {
    const updated = bookingExtraChargesList.filter((line) => line.id !== id);
    setBookingExtraChargesList(updated);

    // AUTO-UNCHECK RULE: If deleting this line leaves 0 lines, automatically uncheck checkbox!
    if (updated.length === 0) {
      setShowBookingExtraCharges(false);
      setBookingPending(bookingRoomTariff - bookingAdvance);
    } else {
      const totalExtra = calcTotalBookingExtraCharges(updated, true);
      setBookingPending(bookingRoomTariff + totalExtra - bookingAdvance);
    }
  };

  const handleUpdateBookingExtraChargeLine = (id: string, field: keyof BookingExtraChargeLine, value: any) => {
    const updated = bookingExtraChargesList.map((line) => {
      if (line.id === id) {
        const lineCopy = { ...line, [field]: value };
        if (field === 'category') {
          // Same label/price fallback as the dropdown options below (which
          // build `value` from this same m.label / (m as any).name pair) -
          // matching here has to use the identical logic or it silently
          // never finds the template whose price it should auto-fill.
          const matched = miscChargesList.find((m) => {
            const chargeLabel = m.label || (m as any).name || 'Misc Charge';
            return chargeLabel.toLowerCase() === String(value).toLowerCase();
          });
          const chargePrice = matched ? (matched.default_amount ?? (matched as any).defaultPrice ?? 0) : 0;
          if (chargePrice > 0) {
            lineCopy.amount = chargePrice;
          }
        }
        return lineCopy;
      }
      return line;
    });
    setBookingExtraChargesList(updated);
    const totalExtra = calcTotalBookingExtraCharges(updated, showBookingExtraCharges);
    setBookingPending(bookingRoomTariff + totalExtra - bookingAdvance);
  };
  const [blockedDates, setBlockedDates] = useState<Array<{
    event_start: string;
    event_end: string;
    event_title: string;
    reservation_url?: string;
    source?: string;
    source_label?: string;
    room_id?: number;
  }>>([]);

  useEffect(() => {
    setMiscChargesList(miscCharges as MiscChargeTemplate[]);
  }, [miscCharges]);

  // Fetch blocked dates from iCal
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

  // Get all blocked date strings for DatePicker
  const getBlockedDateStrings = (): string[] => {
    const blocked: string[] = [];

    // Resolved once, used by both sections below - iCal blocks need this too
    // (see 1.), not just existing guest bookings (2.).
    const selectedRoomObj = rooms.find((r) => r.name === roomNumber || r.slug === roomNumber);
    const selectedRoomId = selectedRoomObj?.id;

    // 1. iCal blocked dates - only the currently selected room's own blocks.
    // For a multi-key property, ical_sync.php's get_blocked_dates returns every
    // room's synced events in one call (room_id per row) so the calendar view
    // can show all of them - but here, picking a date for Room 101 must not
    // also disable dates that are only actually blocked on Room 102's feed.
    // isMultiKeyProperty ? undefined room_id rows (shouldn't happen once every
    // sync is tied to a room) fall through and are ignored, not blocked -
    // safer to under-block than to falsely block an available room.
    blockedDates
      .filter((bd) => !isMultiKeyProperty || (selectedRoomId != null && Number(bd.room_id) === Number(selectedRoomId)))
      .forEach((bd) => {
        const start = new Date(bd.event_start.split(' ')[0]);
        const end = new Date(bd.event_end.split(' ')[0]);
        let current = new Date(start);
        while (current < end) {
          const year = current.getFullYear();
          const month = String(current.getMonth() + 1).padStart(2, '0');
          const day = String(current.getDate()).padStart(2, '0');
          blocked.push(`${year}-${month}-${day}`);
          current = new Date(current.getTime() + 86400000);
        }
      });

    // 2. Existing guest bookings for the currently selected room

    guests
      .filter((g) => g.status === GUEST_STATUS_CHECKED_IN || (g.status as string) === GUEST_STATUS_ACTIVE_LEGACY || g.status === GUEST_STATUS_BOOKED)
      .filter((g) => {
        const gRoomId = (g as any).roomId || (g as any).room_id;
        if (selectedRoomId && gRoomId && Number(gRoomId) === Number(selectedRoomId)) return true;
        if (g.roomNumber && roomNumber && g.roomNumber.toLowerCase().trim() === roomNumber.toLowerCase().trim()) return true;
        return false;
      })
      .forEach((g) => {
        const checkinStr = (g.checkinDate || '').split(' ')[0].split('T')[0];
        const checkoutStr = (g.expectedCheckout || g.checkoutDate || g.checkinDate || '').split(' ')[0].split('T')[0];
        if (!checkinStr) return;

        const [sy, sm, sd] = checkinStr.split('-').map(Number);
        const [ey, em, ed] = (checkoutStr || checkinStr).split('-').map(Number);

        if (!sy || !sm || !sd) return;

        const start = new Date(sy, sm - 1, sd, 12, 0, 0);
        const end = ey && em && ed ? new Date(ey, em - 1, ed, 12, 0, 0) : new Date(start);

        const current = new Date(start);
        while (current < end) {
          const y = current.getFullYear();
          const m = String(current.getMonth() + 1).padStart(2, '0');
          const d = String(current.getDate()).padStart(2, '0');
          blocked.push(`${y}-${m}-${d}`);
          current.setDate(current.getDate() + 1);
        }
      });

    return blocked;
  };

  const handleTariffChange = (val: number) => {
    setBookingRoomTariff(val);
    setTariffManuallyEdited(true);
    setBookingPending(val - bookingAdvance);
  };
  // Pre-fills the rent field from the newly-selected room's own default_tariff
  // (per-room, not shared across a multi-key property - see CLAUDE.md/DESIGN
  // notes on luxe-stays-style properties having distinct real tariffs per
  // room). Used to gate the pre-fill on `bookingRoomTariff === 0` instead of
  // this tariffManuallyEdited flag - which meant it only ever worked for
  // whichever room got picked FIRST: selecting Room 101 (₹4800) correctly
  // filled the field, but then switching to Room 102 (₹5300) left the stale
  // ₹4800 in place, because the field was no longer 0 (found + fixed 21 Aug
  // 2026, verifying per-room tariff pre-fill). Gating on "has the staff
  // actually typed a value" instead correctly re-fills on every room switch
  // right up until the staff deliberately overrides it, and then respects
  // that override for the rest of this booking.
  const handleRoomChange = (roomName: string) => {
    setRoomNumber(roomName);
    if (!tariffManuallyEdited) {
      const selectedRoom = rooms.find(r => r.name === roomName);
      if (selectedRoom && selectedRoom.default_tariff != null) {
        setBookingRoomTariff(selectedRoom.default_tariff);
      }
    }
  };
  const handleAdvanceChange = (val: number) => {
    setBookingAdvance(val);
    setBookingPending(bookingRoomTariff - val);
  };
  const handlePendingChange = (val: number) => {
    setBookingPending(val);
    setBookingAdvance(bookingRoomTariff - val);
  };

  // Used right after a successful save (the form previously stayed populated
  // with the just-submitted guest's details - the "Booking saved" toast fired,
  // but nothing was actually cleared for the next entry) and by the voucher's
  // Close button.
  const resetBookingForm = () => {
    setGuestName('');
    setPhoneNumber('');
    setBookingSourceLocal('Offline');
    setAdvanceReceivedBy('');
    setPendingReceivedBy('');
    setCheckinDate(new Date().toISOString().split('T')[0]);
    setCheckinTime('14:00');
    setExpectedCheckout(new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]);
    setCheckoutTime('11:00');
    setNotes('');
    setShowGuestNotes(false);
    setIsForeignGuest(false);
    setNoOfGuests(1);
    setBookingRoomTariff(0);
    setTariffManuallyEdited(false);
    setBookingAdvance(0);
    setBookingPending(0);
    setShowBookingExtraCharges(false);
    setBookingExtraChargesList([]);
    if (isMultiKeyProperty && rooms && rooms.length > 0) {
      setRoomNumber(rooms[0].name);
    }
  };

  if (activeMenuItemKey === 'guest_registration') {
    return (
      <div className={`guest-management w-full flex justify-center items-center ${onClose ? '' : 'min-h-[calc(100vh-120px)] my-auto'}`}>
        <div className={`guest-management__registration-card space-y-4 w-full ${onClose ? '' : 'max-w-xl bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md p-6'}`}>
          {!onClose && (
            <div className="border-b border-gray-200 dark:border-gray-700 pb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <span>{t('add_guest_booking_header', 'Add Guest Booking')}</span>
                {isMultiKeyProperty && roomNumber && (
                  <Badge color="blue" size="sm">
                    {roomNumber}
                  </Badge>
                )}
              </h3>
            </div>
          )}
          
          <form noValidate className="app-form app-form--add-guest space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            const newCheckinStr = checkinTime ? `${checkinDate} ${checkinTime}:00` : checkinDate;
            const newCheckoutStr = checkoutTime ? `${expectedCheckout} ${checkoutTime}:00` : expectedCheckout;

            if (!guestName.trim()) {
              showToast('Booking Rejected: Guest name is required.', { type: 'error' });
              return;
            }
            if (!phoneNumber.trim()) {
              showToast('Booking Rejected: Phone number is required.', { type: 'error' });
              return;
            }
            if (!checkinDate || !expectedCheckout) {
              showToast('Booking Rejected: Check-in and check-out dates are required.', { type: 'error' });
              return;
            }

            if (isMultiKeyProperty && (!roomNumber || !roomNumber.trim())) {
              showToast('Booking Rejected: An assigned room/villa selection is required.', { type: 'error' });
              return;
            }

            // 1. Strict Conflict Check: Check if room is already booked for overlapping dates
            const selectedRoomObj = rooms.find((r) => r.name === roomNumber || r.slug === roomNumber);
            const selectedRoomId = selectedRoomObj?.id;

            const hasRoomConflict = guests.some((g) => {
              if ((g.status as string) === GUEST_STATUS_CHECKED_OUT || (g.status as string) === GUEST_STATUS_CHECKEDOUT_LEGACY || (g.status as string) === 'Cancelled') return false;
              const gRoomId = (g as any).roomId || (g as any).room_id;

              const isSameRoom = (selectedRoomId && gRoomId && Number(gRoomId) === Number(selectedRoomId)) ||
                (g.roomNumber && roomNumber && g.roomNumber.toLowerCase().trim() === roomNumber.toLowerCase().trim());

              if (!isSameRoom) return false;

              const existingCheckin = new Date(g.checkinDate);
              const existingCheckout = new Date(g.expectedCheckout || g.checkoutDate || g.checkinDate);
              const newCheckin = new Date(newCheckinStr);
              const newCheckout = new Date(newCheckoutStr);

              return newCheckin < existingCheckout && existingCheckin < newCheckout;
            });

            if (hasRoomConflict) {
              showToast(`Booking Rejected! ${roomNumber} is ALREADY booked for these dates.`, { type: 'error' });
              return;
            }

            // 2. Strict Duplicate Check: Prevent duplicate entry for same guest on same check-in date
            const isDuplicate = guests.some((g) => {
              if (g.status === 'CheckedOut' || (g.status as string) === GUEST_STATUS_CHECKED_OUT || (g.status as string) === 'Cancelled') return false;
              const gPhone = (g.phoneNumber || '').trim();
              const gCheckin = (g.checkinDate || '').split(' ')[0];
              return gPhone === phoneNumber.trim() && gCheckin === checkinDate;
            });

            if (isDuplicate) {
              showToast('Booking Rejected! A reservation for this contact on this check-in date already exists.', { type: 'error' });
              return;
            }

            const chargedExtraLines = bookingExtraChargesList.filter((line) => (Number(line.amount) || 0) > 0);
            const extraChargeDetail = chargedExtraLines
              .map((line) => {
                const noteText = line.category === 'Misc' && line.miscNote.trim()
                  ? `Misc (${line.miscNote.trim()})`
                  : line.category;
                return `${noteText} - ₹${line.amount}`;
              })
              .join(', ');
            const finalNotes = [showGuestNotes ? notes.trim() : '', extraChargeDetail ? `Extra Charges: ${extraChargeDetail}` : ''].filter(Boolean).join(' | ');
            const extraCharges = chargedExtraLines.map((line) => ({
              category: line.category || 'Misc',
              amount: Number(line.amount) || 0,
              note: line.category === 'Misc' ? line.miscNote.trim() : '',
            }));

            const guestObj: Guest = {
              id: Math.random().toString(36).substr(2, 9),
              guestName: guestName.trim(),
              phoneNumber: phoneNumber.trim(),
              roomNumber,
              checkinDate: newCheckinStr,
              expectedCheckout: newCheckoutStr,
              status: 'Booked',
              bookingSource: bookingSourceLocal,
              numberOfGuests: noOfGuests,
              roomRate: bookingRoomTariff,
              advanceAmount: bookingAdvance,
              advanceReceivedBy: bookingAdvance > 0 ? advanceReceivedBy : '',
              pendingAmount: bookingPending,
              pendingReceivedBy: bookingPending > 0 ? pendingReceivedBy : '',
              notes: finalNotes,
              isForeignGuest,
              extraCharges,
            };

            // await + try/catch (23 Aug 2026, ROADMAP.md verification pass) - this used to fire
            // onAddGuest without awaiting it at all, then unconditionally reset the form and show
            // a hardcoded success toast regardless of whether the booking actually saved.
            // Reproduced live: an invalid phone number got a real 400 from the backend, but the
            // guest still showed up everywhere (Dashboard Alerts, calendar, Arrivals count) as a
            // real booking, indistinguishable from one that actually saved, until the next reload
            // silently dropped it. onAddGuest now throws with the real reason on failure (see
            // App.tsx's handleAddGuest / api.ts's addGuestToDB) instead of masking it.
            try {
              await onAddGuest(guestObj);
              resetBookingForm();
              showToast('Guest booked successfully!', { type: 'success' });
            } catch (err) {
              const message = err instanceof Error && err.message ? err.message : 'Failed to save booking. Please try again.';
              showToast(message, { type: 'error' });
            }
          }}>
            {/* Row 0: Guest Name (Full width) */}
            <div>
              <Input
                label={t('guest_name_label', 'Guest Name *')}
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Enter guest's full name"
                required
              />
            </div>

            {/* Row 1 & 2: Symmetrical 2-Column Pairing across Multi-Key and Single-Key properties */}
            {isMultiKeyProperty && rooms && rooms.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    {/* No maxLength attribute (23 Aug 2026, ROADMAP.md verification pass) - a
                        native maxLength counts RAW typed characters BEFORE this onChange's own
                        digit-stripping ever runs, so a formatted number with any separator
                        ("98765-43210", 11 chars) got truncated to 10 raw chars first ("98765-4321")
                        and THEN stripped to digits, silently losing the trailing digit
                        ("987654321", 9 digits) - reproduced live. The .slice(0, 10) below already
                        caps to 10 real digits correctly on its own; maxLength was redundant on the
                        happy path and actively wrong on this one. Same fix applied to every other
                        "10-digit mobile number" input site-wide (grep this exact onChange pattern). */}
                    <Input
                      label={t('contact_phone_label', 'Contact Phone Number *')}
                      type="tel"
                      value={phoneNumber}
                      onChange={e => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="Enter 10-digit mobile number"
                      required
                    />
                  </div>

                  <div>
                    <StyledSelect
                      label={t('assigned_room_label', 'Assigned Room / Villa *')}
                      value={roomNumber}
                      onChange={handleRoomChange}
                      options={rooms.map((room) => ({ value: room.name, label: room.name }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <StyledSelect
                      label={t('booking_source_label', 'Booking Source')}
                      value={bookingSourceLocal}
                      onChange={setBookingSourceLocal}
                      options={[
                        { value: 'Offline', label: 'Offline' },
                        { value: 'Online', label: 'Online' },
                      ]}
                    />
                  </div>
                  <div>
                    <Input
                      label={t('no_of_guests_label', 'No. of Guests')}
                      type="number"
                      min="1"
                      value={noOfGuests}
                      onChange={(e) => setNoOfGuests(Math.max(1, Number(e.target.value)))}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    {/* No maxLength attribute (23 Aug 2026, ROADMAP.md verification pass) - a
                        native maxLength counts RAW typed characters BEFORE this onChange's own
                        digit-stripping ever runs, so a formatted number with any separator
                        ("98765-43210", 11 chars) got truncated to 10 raw chars first ("98765-4321")
                        and THEN stripped to digits, silently losing the trailing digit
                        ("987654321", 9 digits) - reproduced live. The .slice(0, 10) below already
                        caps to 10 real digits correctly on its own; maxLength was redundant on the
                        happy path and actively wrong on this one. Same fix applied to every other
                        "10-digit mobile number" input site-wide (grep this exact onChange pattern). */}
                    <Input
                      label={t('contact_phone_label', 'Contact Phone Number *')}
                      type="tel"
                      value={phoneNumber}
                      onChange={e => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="Enter 10-digit mobile number"
                      required
                    />
                  </div>
                  <div>
                    <Input
                      label={t('no_of_guests_label', 'No. of Guests')}
                      type="number"
                      min="1"
                      value={noOfGuests}
                      onChange={(e) => setNoOfGuests(Math.max(1, Number(e.target.value)))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <StyledSelect
                      label={t('booking_source_label', 'Booking Source')}
                      value={bookingSourceLocal}
                      onChange={setBookingSourceLocal}
                      options={[
                        { value: 'Offline', label: 'Offline' },
                        { value: 'Online', label: 'Online' },
                      ]}
                    />
                  </div>
                  <div>
                    <Input
                      label={t('room_rent', 'Room Rent / Price (₹)')}
                      type="number"
                      value={bookingRoomTariff || ''}
                      onChange={e => handleTariffChange(Number(e.target.value))}
                      placeholder="Enter room rent in ₹"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Row 3: Checkin & Checkout Date Range */}
            <div>
              <DateRangePicker
                label="Booking Dates *"
                checkinDate={checkinDate}
                checkoutDate={expectedCheckout}
                onCheckinChange={setCheckinDate}
                onCheckoutChange={setExpectedCheckout}
                blockedDates={getBlockedDateStrings()}
                disablePastDates
              />
            </div>

            {/* Row 4: Check-In & Check-Out Time (2 columns on all screens) */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Input
                  label={t('checkin_time_label', 'Check-In Time')}
                  type="time"
                  value={checkinTime}
                  onChange={e => setCheckinTime(e.target.value)}
                />
              </div>
              <div>
                <Input
                  label={t('checkout_time_label', 'Check-Out Time')}
                  type="time"
                  value={checkoutTime}
                  onChange={e => setCheckoutTime(e.target.value)}
                />
              </div>
            </div>

            {/* Total Room Tariff (Rendered separately on MultiKey where room selector is present) */}
            {isMultiKeyProperty && rooms && rooms.length > 0 && (
              <div>
                <Input
                  label={t('room_rent', 'Room Rent / Price (₹)')}
                  type="number"
                  value={bookingRoomTariff || ''}
                  onChange={e => handleTariffChange(Number(e.target.value))}
                  placeholder="Enter room rent in ₹"
                />
              </div>
            )}

            {/* Checkboxes Row: Flowbite Standard Checkbox Elements */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 py-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="booking-guest-notes-cb"
                  checked={showGuestNotes}
                  onChange={e => setShowGuestNotes(e.target.checked)}
                />
                <label
                  htmlFor="booking-guest-notes-cb"
                  className="text-xs font-medium text-gray-900 dark:text-gray-300 cursor-pointer select-none"
                >
                  Guest Notes
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="booking-foreign-guest-cb"
                  checked={isForeignGuest}
                  onChange={e => setIsForeignGuest(e.target.checked)}
                />
                <label
                  htmlFor="booking-foreign-guest-cb"
                  className="text-xs font-medium text-gray-900 dark:text-gray-300 cursor-pointer select-none"
                >
                  Foreign National Guest
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="booking-additional-charges-cb"
                  checked={showBookingExtraCharges}
                  onChange={e => handleToggleExtraChargesCheckbox(e.target.checked)}
                />
                <label
                  htmlFor="booking-additional-charges-cb"
                  className="text-xs font-medium text-gray-900 dark:text-gray-300 cursor-pointer select-none"
                >
                  {t('additional_charges_label', 'Additional Charges')}
                </label>
              </div>
            </div>

            {/* Guest Notes Textarea (if checked) */}
            {showGuestNotes && (
              <div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Enter guest preferences or notes..."
                  className="w-full p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-blue-500 focus:border-blue-500 outline-none"
                  rows={2}
                />
              </div>
            )}

            {/* Multi-Line Additional Charges Block (if checked) */}
            {showBookingExtraCharges && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3 shadow-md">
                <div className="flex items-center justify-between">
<Button color="blue" size="sm" onClick={handleAddBookingExtraChargeLine}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Charges
                  </Button>
                  <span className="text-2xs text-gray-500 dark:text-gray-400">e.g. Pet Stay, Decoration, Misc</span>
                </div>

                <div className="space-y-2">
                  {bookingExtraChargesList.map((line) => (
                    <div key={line.id} className="p-2.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <StyledSelect
                            value={line.category}
                            onChange={(val) => handleUpdateBookingExtraChargeLine(line.id, 'category', val)}
                            placeholder="-- Select Type --"
                            options={[
                              ...miscChargesList.map((m) => {
                                const chargeLabel = m.label || (m as any).name || 'Misc Charge';
                                return { value: chargeLabel, label: chargeLabel };
                              }),
                              { value: 'Decoration Fees', label: 'Decoration Fees' },
                              { value: 'Extra Housekeeping', label: 'Extra Housekeeping' },
                              { value: 'Pet Stay Charges', label: 'Pet Stay Charges' },
                              { value: 'Misc', label: 'Misc (Custom Note)' },
                            ]}
                            searchable
                          />
                        </div>

                        <div className="w-32 shrink-0">
                          <Input
                            type="number"
                            min="0"
                            value={line.amount || ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? '' : Number(e.target.value);
                              handleUpdateBookingExtraChargeLine(line.id, 'amount', val);
                            }}
                            placeholder="Amount (₹)"
                            required
                          />
                        </div>

                        <Tooltip content="Delete Charge Line">
                          <button
                            type="button"
                            onClick={() => handleRemoveBookingExtraChargeLine(line.id)}
                            className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      </div>

                      {line.category === 'Misc' && (
                        <div>
                          <Input
                            type="text"
                            value={line.miscNote}
                            onChange={(e) => handleUpdateBookingExtraChargeLine(line.id, 'miscNote', e.target.value)}
                            placeholder="Misc Explanation Note * (e.g. Broken lamp, late checkout)"
                            required
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Advance Paid + Advance Received By (2 columns on all screens) */}
            {bookingRoomTariff > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Input
                    label={t('advance_paid', 'Advance Paid (₹)')}
                    type="number"
                    value={bookingAdvance || ''}
                    onChange={e => handleAdvanceChange(Number(e.target.value))}
                    placeholder="0.00"
                  />
                </div>

                {bookingAdvance > 0 ? (
                  <div>
                    <StyledSelect
                      label={t('advance_received_by', 'Advance Received By *')}
                      value={advanceReceivedBy}
                      onChange={setAdvanceReceivedBy}
                      placeholder="-- Select Staff/User --"
                      options={staff.filter(s => s.isFinancialHandler).map(s => ({ value: s.name, label: s.name }))}
                    />
                  </div>
                ) : <div />}
              </div>
            )}

            {/* Pending Balance + Pending Received By (2 columns on all screens) */}
            {bookingAdvance > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Input
                    label={t('pending_balance_label', 'Pending Balance (₹)')}
                    type="number"
                    value={bookingPending || ''}
                    onChange={e => handlePendingChange(Number(e.target.value))}
                    placeholder="0.00"
                  />
                </div>

                {bookingPending > 0 ? (
                  <div>
                    <StyledSelect
                      label={t('pending_received_by_label', 'Pending Received By')}
                      value={pendingReceivedBy}
                      onChange={setPendingReceivedBy}
                      placeholder="-- Select Staff/User --"
                      options={staff.filter(s => s.isFinancialHandler).map(s => ({ value: s.name, label: s.name }))}
                    />
                  </div>
                ) : <div />}
              </div>
            )}

            <Button type="submit" color="blue" className="w-full mt-4 font-semibold">
              {t('save_guest_booking_button', 'Save Guest Booking')}
            </Button>
          </form>
        </div>
      </div>
    );
  }
  return (
    <BillingCheckout
      guests={guests}
      receipts={receipts}
      onCheckoutGuest={onCheckoutGuest}
      onUpdateGuest={onUpdateGuest}
      onAddGuest={onAddGuest}
      isMultiKeyProperty={isMultiKeyProperty}
      rooms={rooms}
      onCheckoutClick={onNavigateToBilling}
      kitchenModuleEnabled={kitchenModuleEnabled}
      propertyGstin={propertyGstin}
      focusGuestId={focusGuestId}
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
    />
  );
};
