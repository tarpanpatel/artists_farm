import React, { useState, useEffect } from 'react';
import { Button, Checkbox } from 'flowbite-react';
import { Badge } from './Badge';
import {
  Trash2,
  Plus,
  Loader2,
} from './icons/FlowbiteIcons';
import { Guest, BillingReceipt, MiscChargeTemplate, MenuItem } from '../types';
import { Popover } from './Popover';
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
import { parseDateToYMD } from '../utils/dateUtils';
import { normalizePhoneNumber } from '../utils/phoneUtils';
import { DateRangePicker } from './DateRangePicker';
import { StyledSelect } from './StyledSelect';
import { Input, FloatingTextarea } from './Input';
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
  onGuestVerificationUpdated?: (guestId: string) => void;
  onCFormFiledUpdated?: (guestId: string, filedAt: string | null) => void;
  activeMenuItemKey?: string;
  onDispatchTelegram?: (eventType: string, message: string, channelFilter?: 'all' | 'kitchen' | 'finance' | 'admin', replyMarkup?: any, templateKey?: string) => void;
  isMultiKeyProperty?: boolean;
  rooms?: Room[];
  onNavigateToBilling?: (guestId: string) => void;
  onSetActiveMenuItemKey?: (key: string) => void;
  selectedRoomSlug?: string | null;
  preSelectRoom?: string;
  // Pre-fill dates (added 3 Sep 2026, calendar click-to-select-a-range) -
  // 'YYYY-MM-DD'. Deliberately separate from preSelectRoom's own effect
  // below rather than reusing it: this is an explicit choice the user just
  // made by clicking two calendar cells, not the "lazy default" the
  // checkinDate/expectedCheckout state's own blank-by-default comment warns
  // against - that concern is about auto-filling with no real user intent
  // behind it, which doesn't apply here.
  preSelectCheckinDate?: string;
  preSelectCheckoutDate?: string;
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
  isLoading?: boolean;
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
  isLoading = false,
  menu: _menu,
  onAddGuest,
  onCheckoutGuest,
  onUpdateGuest,
  onDeleteGuest,
  activeMenuItemKey,
  onDispatchTelegram: _onDispatchTelegram,
  isMultiKeyProperty = false,
  rooms = [],
  onNavigateToBilling,
  onSetActiveMenuItemKey: _onSetActiveMenuItemKey,
  selectedRoomSlug,
  preSelectRoom,
  preSelectCheckinDate,
  preSelectCheckoutDate,
  onClose,
  focusGuestId = null,
  onClearFocusGuest,
  // Not used by this component directly - forwarded to BillingCheckout, whose
  // Past Bookings table and Booking Details modal both file C-Forms and verify
  // IDs. Those write through their own endpoints, so they need a "tell the app
  // it happened" callback rather than a second save (4 Sep 2026 - going back
  // through onUpdateGuest was rejected 409 stale_booking every time).
  onCFormFiledUpdated,
  onGuestVerificationUpdated,
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
  // Suppresses the live duplicate check (below) while a submission is in
  // flight (31 Aug 2026). App.tsx's handleAddGuest adds the new guest to
  // `guests` optimistically, synchronously, before the network call even
  // starts - so for the whole round trip the live check saw the
  // just-submitted booking as an existing one with the same phone+check-in
  // date as the still-populated form, and flagged it as a duplicate of
  // itself. Harmless once the round trip was near-instant, but very visible
  // during the 13-21s the response used to take before the LiteSpeed
  // Content-Length fix (see router.php's ob_start() and outbox.php's
  // triggerEventDrivenChannexDrain()) - and still a real, if brief, false
  // positive without this guard. The actual submit-time duplicate guard
  // further below is unaffected: it runs before the optimistic add happens.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [roomNumber, setRoomNumber] = useState('');
  const [guestNameTouched, setGuestNameTouched] = useState(false);
  const [phoneNumberTouched, setPhoneNumberTouched] = useState(false);
  const [datesTouched, setDatesTouched] = useState(false);
  const [roomTouched, setRoomTouched] = useState(false);
  const [bookingSourceLocal, setBookingSourceLocal] = useState('Offline');
  const [advanceReceivedBy, setAdvanceReceivedBy] = useState('');
  const [pendingReceivedBy, setPendingReceivedBy] = useState('');
  // Left blank deliberately (31 Aug 2026) - defaulting these to today/today+2
  // meant an operator could hit Save without ever having chosen dates, and
  // "today" is exactly the date range most likely to already be occupied or
  // carry an active rate-rule restriction, so a silent default there is the
  // worst place for one. Force an explicit pick every time instead.
  const [checkinDate, setCheckinDate] = useState('');
  const [checkinTime, setCheckinTime] = useState('14:00');
  const [expectedCheckout, setExpectedCheckout] = useState('');
  const [checkoutTime, setCheckoutTime] = useState('11:00');
  const [notes, setNotes] = useState('');
  const [showGuestNotes, setShowGuestNotes] = useState(false);
  const [isForeignGuest, setIsForeignGuest] = useState(false);
  const [noOfGuests, setNoOfGuests] = useState(1);

  // Live duplicate-booking check (26 Aug 2026, part of the site-wide real-time
  // validation sweep - see CLAUDE.md's "Real-Time Form Validation" note)
  // - mirrors the submit-time `isDuplicate` guard inside the Add Guest form's
  // onSubmit below exactly (same phone+check-in-date rule, same excluded
  // statuses), just recomputed reactively so it's visible on the Contact
  // Phone Number field as you type instead of only after clicking Save. Only
  // judges once a full 10-digit number is entered - a partial number isn't
  // "wrong", it's just unfinished, so it stays quiet until then.
  const duplicateBookingLive = !isSubmitting && phoneNumber.length === 10 && guests.some((g) => {
    if (g.status === 'CheckedOut' || (g.status as string) === GUEST_STATUS_CHECKED_OUT || (g.status as string) === 'Cancelled') return false;
    const gPhone = (g.phoneNumber || '').trim();
    const gCheckin = (g.checkinDate || '').split(' ')[0];
    return gPhone === phoneNumber.trim() && gCheckin === checkinDate;
  });

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

  // Pre-fill dates from a calendar click-to-select-a-range (see the prop's
  // own comment above) - single-property signup has no preSelectRoom to key
  // off of, so this is its own effect rather than folded into the one above.
  useEffect(() => {
    if (preSelectCheckinDate) setCheckinDate(preSelectCheckinDate);
    if (preSelectCheckoutDate) setExpectedCheckout(preSelectCheckoutDate);
  }, [preSelectCheckinDate, preSelectCheckoutDate]);

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
  useEffect(() => {
    setMiscChargesList(miscCharges as MiscChargeTemplate[]);
  }, [miscCharges]);

  // Get all blocked date strings for DatePicker
  const getBlockedDateStrings = (): string[] => {
    const blocked: string[] = [];

    // Resolved once, used below for existing-guest-booking overlap checks.
    const selectedRoomObj = rooms.find((r) => r.name === roomNumber || r.slug === roomNumber);
    const selectedRoomId = selectedRoomObj?.id;

    // iCal blocked dates (previously section 1 here) removed 3 Sep 2026 -
    // iCal sync retired app-wide, superseded by the Channex channel manager
    // (see _unwanted/ical/README.md). Was already gated off since 1 Sep
    // behind ICAL_BLOCKING_ENABLED.

    // 2. Existing guest bookings for the currently selected room. Mirrors the
    // iCal filter's !isMultiKeyProperty short-circuit above (31 Aug 2026) -
    // without it, a single-unit property (no room selector, so roomNumber/
    // selectedRoomId never get set to anything) matched nothing here at all:
    // both branches require a non-empty roomNumber/selectedRoomId on both
    // sides, so every existing booking silently failed to block its own
    // dates on the one property type that actually needs this the most.

    guests
      .filter((g) => g.status === GUEST_STATUS_CHECKED_IN || (g.status as string) === GUEST_STATUS_ACTIVE_LEGACY || g.status === GUEST_STATUS_BOOKED)
      .filter((g) => {
        if (!isMultiKeyProperty) return true;
        const gRoomId = (g as any).roomId || (g as any).room_id;
        if (selectedRoomId && gRoomId && Number(gRoomId) === Number(selectedRoomId)) return true;
        if (g.roomNumber && roomNumber && g.roomNumber.toLowerCase().trim() === roomNumber.toLowerCase().trim()) return true;
        return false;
      })
      .forEach((g) => {
        const startYmd = parseDateToYMD(g.checkinDate || '');
        const endYmd = parseDateToYMD(g.expectedCheckout || g.checkoutDate || g.checkinDate || '');
        if (!startYmd) return;

        const [sy, sm, sd] = startYmd;
        const [ey, em, ed] = endYmd || startYmd;

        const start = new Date(sy, sm - 1, sd, 12, 0, 0);
        const end = new Date(ey, em - 1, ed, 12, 0, 0);

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
    setCheckinDate('');
    setCheckinTime('14:00');
    setExpectedCheckout('');
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
    setGuestNameTouched(false);
    setPhoneNumberTouched(false);
    setDatesTouched(false);
    setRoomTouched(false);
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
                <span>{t('add_guest_booking_header', 'Add Booking')}</span>
                {isMultiKeyProperty && roomNumber && (
                  <Badge variant="info" size="sm">
                    {roomNumber}
                  </Badge>
                )}
              </h3>
            </div>
          )}
          
          <form noValidate className="app-form app-form--add-guest space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            setGuestNameTouched(true);
            setPhoneNumberTouched(true);
            setDatesTouched(true);
            setRoomTouched(true);

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

              // Same fix as getBlockedDateStrings() above (31 Aug 2026): on a
              // single-unit property there's no room selector, so roomNumber/
              // selectedRoomId are permanently empty and this check matched
              // nothing - a real overlap only got caught by the backend's own
              // validation, as a generic toast instead of this one's specific
              // room-named rejection.
              const isSameRoom = !isMultiKeyProperty ||
                (selectedRoomId && gRoomId && Number(gRoomId) === Number(selectedRoomId)) ||
                (g.roomNumber && roomNumber && g.roomNumber.toLowerCase().trim() === roomNumber.toLowerCase().trim());

              if (!isSameRoom) return false;

              // Compare stay nights using calendar dates (YYYY-MM-DD).
              // In hotel operations, a departure on date X (11:00 AM) and an arrival on date X (2:00 PM) do not conflict.
              const gCheckinYmd = (g.checkinDate || '').split(' ')[0].split('T')[0];
              const gCheckoutYmd = (g.expectedCheckout || g.checkoutDate || g.checkinDate || '').split(' ')[0].split('T')[0];
              const newCheckinYmd = checkinDate.split(' ')[0].split('T')[0];
              const newCheckoutYmd = expectedCheckout.split(' ')[0].split('T')[0];

              if (!gCheckinYmd || !gCheckoutYmd || !newCheckinYmd || !newCheckoutYmd) return false;

              return newCheckinYmd < gCheckoutYmd && gCheckinYmd < newCheckoutYmd;
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

            setIsSubmitting(true);
            try {
              await onAddGuest(guestObj);
              resetBookingForm();
              showToast('Guest booked successfully!', { type: 'success' });
              // Closes right here, not inside App.tsx's onAddGuest wrapper
              // (31 Aug 2026, second pass at this) - closing there ran BEFORE
              // this line, since it sits earlier in the same awaited call,
              // making the drawer disappear before this toast had even been
              // created. onClose is only wired for the drawer-hosted render
              // (guarded, since the inline/non-drawer usages of this
              // component pass none) - closing after the toast, same tick,
              // no artificial delay in either place.
              onClose?.();
            } catch (err) {
              const message = err instanceof Error && err.message ? err.message : 'Failed to save booking. Please try again.';
              showToast(message, { type: 'error' });
            } finally {
              setIsSubmitting(false);
            }
          }}>
            {/* Row 0: Guest Name (Full width) */}
            <div>
              <Input
                label={t('guest_name_label', 'Guest Name *')}
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onBlur={() => setGuestNameTouched(true)}
                placeholder="Enter guest's full name"
                required
                error={guestNameTouched && !guestName.trim() ? 'Guest name is required' : undefined}
              />
            </div>

            {/* Row 1 & 2: Symmetrical 2-Column Pairing across Multi-Key and Single-Key properties */}
            {isMultiKeyProperty && rooms && rooms.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <Input
                      label={t('contact_phone_label', 'Contact Phone Number *')}
                      type="tel"
                      value={phoneNumber}
                      onChange={e => setPhoneNumber(normalizePhoneNumber(e.target.value))}
                      onBlur={() => setPhoneNumberTouched(true)}
                      placeholder="Enter 10-digit mobile number"
                      required
                      error={
                        phoneNumberTouched && !phoneNumber.trim()
                          ? 'Phone number is required'
                          : duplicateBookingLive
                          ? 'A reservation for this contact on this check-in date already exists'
                          : undefined
                      }
                    />
                  </div>

                  <div>
                    <StyledSelect
                      label={t('assigned_room_label', 'Assigned Room / Villa *')}
                      value={roomNumber}
                      onChange={(val) => {
                        handleRoomChange(val);
                        setRoomTouched(true);
                      }}
                      options={rooms.map((room) => ({ value: room.name, label: room.name }))}
                      error={isMultiKeyProperty && roomTouched && (!roomNumber || !roomNumber.trim()) ? 'An assigned room/villa selection is required' : undefined}
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
                    <Input
                      label={t('contact_phone_label', 'Contact Phone Number *')}
                      type="tel"
                      value={phoneNumber}
                      onChange={e => setPhoneNumber(normalizePhoneNumber(e.target.value))}
                      onBlur={() => setPhoneNumberTouched(true)}
                      placeholder="Enter 10-digit mobile number"
                      required
                      error={
                        phoneNumberTouched && !phoneNumber.trim()
                          ? 'Phone number is required'
                          : duplicateBookingLive
                          ? 'A reservation for this contact on this check-in date already exists'
                          : undefined
                      }
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
                onCheckinChange={(d) => {
                  setCheckinDate(d);
                }}
                onCheckoutChange={(d) => {
                  setExpectedCheckout(d);
                }}
                blockedDates={getBlockedDateStrings()}
                disablePastDates
                error={datesTouched && (!checkinDate || !expectedCheckout) ? 'Check-in and check-out dates are required' : undefined}
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
                <FloatingTextarea
                  label="Guest Preferences / Notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Enter guest preferences or notes..."
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

                        <Popover
                          trigger="hover"
                          content={
                            <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                              Delete Charge Line
                            </div>
                          }
                        >
                          <button
                            type="button"
                            aria-label="Delete Charge Line"
                            onClick={() => handleRemoveBookingExtraChargeLine(line.id)}
                            className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </Popover>
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

            <Button
              type="submit"
              color="blue"
              disabled={isSubmitting}
              className="w-full mt-4 font-semibold flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>{t('saving_booking_button', 'Saving Booking...')}</span>
                </>
              ) : (
                <span>{t('save_guest_booking_button', 'Save Guest Booking')}</span>
              )}
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
      isLoading={isLoading}
      onCheckoutGuest={onCheckoutGuest}
      onUpdateGuest={onUpdateGuest}
      onDeleteGuest={onDeleteGuest}
      onCFormFiledUpdated={onCFormFiledUpdated}
      onGuestVerificationUpdated={onGuestVerificationUpdated}
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
