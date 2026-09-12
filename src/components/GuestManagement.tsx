import React, { useState, useEffect, useMemo } from 'react';
import { DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, DEFAULT_MAKE_BOOKING_TEMPLATE, renderWhatsappVoucherTemplate, type PropertyGuestInfo } from '../utils/whatsappVoucherTemplate';
import { Button, Checkbox } from 'flowbite-react';
import { Badge } from './Badge';
import {
  Trash2,
  Plus,
  Loader2,
  MessageCircle,
  Share2,
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
import { parseDateToYMD, formatDateDDMMYYYY, formatDateOrdinal } from '../utils/dateUtils';
import { normalizePhoneNumber, isValidPhoneNumber } from '../utils/phoneUtils';
import { DateRangePicker } from './DateRangePicker';
import { StyledSelect } from './StyledSelect';
import { Input, FloatingTextarea } from './Input';
import { BillingCheckout } from './BillingCheckout';
import { PricingPage } from './PricingPage';
import { t } from '../i18n/en';
import { createBookingHoldDB, fetchRateRulesDB, fetchBookingVoucherTokenDB } from '../services/api';

interface Room {
  id: number;
  name: string;
  slug: string;
  room_order?: number;
  is_active?: number;
  default_tariff?: number | null;
  // Per-room, since each room is its own Airbnb listing for a MULTI_KEY property -
  // already returned by the backend's room fetch (multikey_properties.php's
  // extendedRoomCols), just not previously read anywhere in this file (12 Sep 2026).
  cancellation_policy?: string | null;
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
  onDispatchTelegram?: (eventType: string, message: string, channelFilter?: 'all' | 'kitchen' | 'finance' | 'admin', replyMarkup?: any, templateKey?: string, mediaUrls?: string[], deepLinkParams?: Record<string, string | number>) => void;
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
  // "Make Booking" pre-booking invite (12 Sep 2026) - property-level override, no
  // tenant tier (see PropertyEditForm.tsx's own comment on why this one's simpler
  // than propertyWhatsappTemplate above).
  propertyMakeBookingTemplate?: string;
  /** SINGLE-property cancellation policy fallback. A MULTI_KEY room carries its
   *  own on the room object (see Room.cancellation_policy above) and takes
   *  precedence when present - same shape as propertySecurityDeposit below. */
  propertyCancellationPolicy?: string;
  propertyUpiId?: string;
  propertyUpiQrCodeUrl?: string;
  /** Refundable deposit for a SINGLE property. A MULTI_KEY room carries its
   *  own on the room object, so this is only the single-unit fallback. */
  propertySecurityDeposit?: number | string | null;
  propertyAddress?: string;
  propertyInstructions?: string;
  propertyGuestInfo?: PropertyGuestInfo;
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

// Channex's own 2-letter day codes - matches room_rate_rules.days_of_week and
// the exact precedence OperationalDashboard.tsx/TodayOverview.tsx's own
// getDayPrice()/resolvedRateRules already use, so a night priced here is the
// same price the calendar shows and Airbnb/Booking.com actually receive.
const DAY_CODE_BY_JS_DAY = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];

/** Most specific rule wins: room-specific over property-wide, then newest. */
const sortRateRules = (rules: any[]): any[] =>
  [...rules].sort((a, b) => {
    const roomA = a.room_id ? Number(a.room_id) : 0;
    const roomB = b.room_id ? Number(b.room_id) : 0;
    if (roomA !== roomB) return roomB - roomA;
    const timeA = a.created_at ? Date.parse(String(a.created_at).replace(' ', 'T')) : 0;
    const timeB = b.created_at ? Date.parse(String(b.created_at).replace(' ', 'T')) : 0;
    if (timeA !== timeB) return timeB - timeA;
    return Number(b.id || 0) - Number(a.id || 0);
  });

/**
 * What ONE night actually costs, honouring room_rate_rules under variable
 * pricing and falling back to the room's flat rate otherwise.
 *
 * Module-level and shared (8 Sep 2026) so the booking form's rent pre-fill and
 * the "Share All Available Places & Prices" message cannot drift on what a night
 * costs - they used to have separate copies of this, and the form's copy read
 * default_tariff straight off the room, which is exactly the bug already
 * reported against the share button on 7 Sep ("it is displaying base prices").
 */
const pickNightRate = (
  sortedRules: any[],
  pricingMode: string,
  roomId: number | undefined,
  dateStr: string,
  fallback: number
): number => {
  let rate = fallback;
  if (pricingMode === 'variable') {
    const dayCode = DAY_CODE_BY_JS_DAY[new Date(dateStr + 'T00:00:00').getDay()];
    const fixedMatch = sortedRules.find((r) => {
      const roomMatch = !r.room_id || (roomId && Number(r.room_id) === Number(roomId));
      const dayMatch = !r.days_of_week || String(r.days_of_week).split(',').includes(dayCode);
      return roomMatch && dayMatch && r.start_date <= dateStr && r.end_date >= dateStr
        && r.rate_per_night != null && r.rule_type !== 'floor';
    });
    if (fixedMatch && fixedMatch.rate_per_night != null) {
      rate = Number(fixedMatch.rate_per_night);
    }

    // Check floor rules: guarantees price never drops below highest applicable floor
    const applicableFloors = sortedRules.filter((r) => {
      const roomMatch = !r.room_id || (roomId && Number(r.room_id) === Number(roomId));
      const dayMatch = !r.days_of_week || String(r.days_of_week).split(',').includes(dayCode);
      return roomMatch && dayMatch && r.start_date <= dateStr && r.end_date >= dateStr
        && r.rate_per_night != null && r.rule_type === 'floor';
    });

    if (applicableFloors.length > 0) {
      const highestFloor = Math.max(...applicableFloors.map((r) => Number(r.rate_per_night || 0)));
      if (highestFloor > rate) {
        rate = highestFloor;
      }
    }
  }
  return rate;
};

/** Every night of a stay as YYYY-MM-DD: check-in up to, not including, check-out. */
const nightsOfStay = (checkin: string, checkout: string): string[] => {
  const cIn = new Date(checkin + 'T00:00:00');
  const cOut = new Date(checkout + 'T00:00:00');
  if (isNaN(cIn.getTime()) || isNaN(cOut.getTime()) || cOut <= cIn) return [];
  const out: string[] = [];
  const nights = Math.round((cOut.getTime() - cIn.getTime()) / 86400000);
  for (let i = 0; i < nights; i++) {
    const d = new Date(cIn);
    d.setDate(d.getDate() + i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
};

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
  propertyMakeBookingTemplate = '',
  propertyCancellationPolicy = '',
  propertyUpiId = '',
  propertyUpiQrCodeUrl = '',
  propertySecurityDeposit,
  propertyAddress = '',
  propertyInstructions = '',
  propertyGuestInfo,
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
  const [savedBooking, setSavedBooking] = useState<Guest | null>(null);
  const [isSharingBooking, setIsSharingBooking] = useState(false);
  const [roomNumber, setRoomNumber] = useState('');
  const [, setGuestNameTouched] = useState(false);
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
  const [noOfGuests, setNoOfGuests] = useState(2);
  // Optional split of noOfGuests, not an addition to it (7 Sep 2026). Guests
  // stays the total that occupancy pricing reads; this only says how many of
  // them are children, so the confirmation can say "3 adults, 2 children".
  const [childrenCount, setChildrenCount] = useState(0);
  // Whether the kids field is shown at all (7 Sep 2026, explicit request: "no one
  // does that in industry... give a check box to add kids"). An always-visible
  // "Of which children" box asked every booking a question that is "no" almost
  // every time, and asked it in a form nobody uses - the industry pattern is one
  // guest count, with children declared only when there are any.
  //
  // Kept as its own flag rather than inferred from `childrenCount > 0`, because
  // those differ in the state that matters: unticking must clear the count (see
  // the toggle handler), while a ticked box showing 0 is a legitimate mid-typing
  // state that must not collapse the field the user is typing into.
  const [hasChildren, setHasChildren] = useState(false);

  // "Inquiry -> Instant Quote" (5 Sep 2026) - lets staff send a guest who
  // called or messaged a WhatsApp link with the room/dates/price already
  // filled in, instead of finalizing the booking themselves. Reuses this
  // exact form's own room/date/guest fields rather than a separate drawer,
  // since it's the same information either way. Generating the link locks
  // the room server-side for the duration picked below (see
  // booking_holds.php) - if the guest never confirms, it quietly expires and
  // the room frees up again. Revising the price and clicking it again simply
  // resends - the staff member's own earlier quote for this room/dates is
  // superseded rather than blocking the new one (6 Sep 2026, reported live).
  const [sendingQuote, setSendingQuote] = useState(false);
  const [sharingAllRooms, setSharingAllRooms] = useState(false);
  const [holdHours, setHoldHours] = useState('2');

  // Live duplicate-booking check (26 Aug 2026, part of the site-wide real-time
  // validation sweep - see CLAUDE.md's "Real-Time Form Validation" note)
  // - mirrors the submit-time `isDuplicate` guard inside the Add Guest form's
  // onSubmit below exactly (same phone+check-in-date rule, same excluded
  // statuses), just recomputed reactively so it's visible on the Contact
  // Phone Number field as you type instead of only after clicking Save. Only
  // judges once a full 10-digit number is entered - a partial number isn't
  // "wrong", it's just unfinished, so it stays quiet until then.
  //
  // !savedBooking added 12 Sep 2026 (reported live, "this is a bug, there is
  // no reservation on 17th") - once a booking successfully saves, the form
  // switches to the post-save Share/Add Another/Close state but the phone
  // number and dates are still sitting in state at the values that were just
  // submitted. `guests` refreshes to include the row that just got created,
  // so this check found the just-saved booking matching ITSELF and showed a
  // false "already exists" error on a form that had already succeeded. Once
  // `savedBooking` is null again (either "Add Another Booking" resets it, or
  // the drawer is closed and reopened fresh), this re-arms normally.
  const duplicateBookingLive = !isSubmitting && !savedBooking && phoneNumber.length === 10 && guests.some((g) => {
    if (g.status === 'CheckedOut' || (g.status as string) === GUEST_STATUS_CHECKED_OUT || (g.status as string) === 'Cancelled') return false;
    const gPhone = (g.phoneNumber || '').trim();
    const gCheckin = (g.checkinDate || '').split(' ')[0];
    return gPhone === phoneNumber.trim() && gCheckin === checkinDate;
  });

  // Live phone-format validation (7 Sep 2026, explicit report: "phone number
  // cant be this long" - a domestic booking accepted a 15-digit repeated-digit
  // string with no feedback at all). Only judges once the field is non-empty,
  // same gating style as every other live check in this file.
  const phoneFormatInvalid = phoneNumber.trim().length > 0 && !isValidPhoneNumber(phoneNumber, isForeignGuest);

  // Live room/date-conflict check (12 Sep 2026, explicit report: picking dates
  // FIRST and an already-booked room/place SECOND gave zero feedback in the
  // form - the server's 409 at Save Booking was still the real guard (per
  // CLAUDE.md's "no overlapping bookings" rule), but nothing told the user
  // which of the two fields to change until they'd already tried to submit.
  // Mirrors getBlockedDateStrings()' own room-matching just above (single-key:
  // every active booking counts, since the property IS the one room; multi-key:
  // match by room id, falling back to name) and the same half-open overlap
  // rule used by the server, handleShareAllAvailableRooms() below, and every
  // other conflict check in this codebase (gIn < checkout && gOut > checkin -
  // same-day turnover is not a conflict). Only judges once both dates are
  // chosen AND, for multi-key, a room is chosen too - an incomplete form isn't
  // "wrong", it's unfinished.
  //
  // !savedBooking added same day (12 Sep 2026) as the same fix on
  // duplicateBookingLive just above - same root cause: after a successful
  // save the just-created booking is now sitting in `guests` and the form
  // fields still hold the values that created it, so this matched the
  // booking against itself and showed "already booked" on a form that had
  // already succeeded.
  const roomDateConflictLive =
    !savedBooking &&
    !!checkinDate &&
    !!expectedCheckout &&
    checkinDate < expectedCheckout &&
    (!isMultiKeyProperty || !!roomNumber) &&
    guests
      .filter((g) => g.status === GUEST_STATUS_CHECKED_IN || (g.status as string) === GUEST_STATUS_ACTIVE_LEGACY || g.status === GUEST_STATUS_BOOKED)
      .some((g) => {
        if (isMultiKeyProperty) {
          const selectedRoomObj = rooms.find((r) => r.name === roomNumber || r.slug === roomNumber);
          const selectedRoomId = selectedRoomObj?.id;
          const gRoomId = (g as any).roomId || (g as any).room_id;
          const matchesRoom =
            (selectedRoomId && gRoomId && Number(gRoomId) === Number(selectedRoomId)) ||
            (g.roomNumber && roomNumber && g.roomNumber.toLowerCase().trim() === roomNumber.toLowerCase().trim());
          if (!matchesRoom) return false;
        }
        const gIn = (g.checkinDate || '').split(' ')[0];
        const gOut = (g.expectedCheckout || g.checkoutDate || g.checkinDate || '').split(' ')[0];
        return gIn < expectedCheckout && gOut > checkinDate;
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
      }
      // No fallback to rooms[0] (removed 7 Sep 2026, explicit request). The two
      // branches above pre-select only when the drawer was opened FROM a specific
      // room, where the answer is genuinely known. Reaching it via "Add Booking"
      // carries no such context, and defaulting to whichever room happens to sort
      // first is a guess presented as an answer - one Save away from putting a
      // guest in the wrong unit, with nothing on screen ever having looked wrong.
      // Left empty, the field reads as the required, unanswered question it is
      // (its own `roomTouched` error already covers submitting without one).

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
  // Rate rules for the pre-fill below. Loaded once per mount - the booking form
  // is short-lived, and the share button still fetches fresh rules of its own at
  // click time, so a stale rule here can never reach a guest-facing message.
  const [rateRules, setRateRules] = useState<any[]>([]);
  const [ratePricingMode, setRatePricingMode] = useState<string>('flat');
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

  // Live "advance can't exceed the bill" guard (7 Sep 2026, reported live:
  // Advance Paid ₹3,535 against a ₹2,829 room rent drove Pending Balance to
  // -₹706 with no warning). The most a guest can owe on this form is the room
  // tariff plus any extra charges toggled on; an advance past that would post a
  // negative pending balance and a phantom overpayment to the ledger. The same
  // rule is enforced at submit below and gates the Save button.
  const bookingTotalDue = bookingRoomTariff + calcTotalBookingExtraCharges(bookingExtraChargesList, showBookingExtraCharges);
  const advanceExceedsTotal = bookingAdvance > 0 && bookingTotalDue > 0 && bookingAdvance > bookingTotalDue;

  // Every condition that would make the submit handler below reject this
  // booking, recomputed reactively so the Save button can be greyed until they
  // all pass. Per CLAUDE.md, the button stays CLICKABLE (opacity only, never
  // `disabled`) - clicking it still runs onSubmit, which sets the touched flags
  // and toasts the specific reason, so a greyed button always explains itself.
  const canSubmitBooking =
    phoneNumber.trim().length > 0 &&
    !phoneFormatInvalid &&
    !duplicateBookingLive &&
    !!checkinDate && !!expectedCheckout &&
    (!isMultiKeyProperty || (!!roomNumber && roomNumber.trim().length > 0)) &&
    !roomDateConflictLive &&
    !advanceExceedsTotal;

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
  // Rate rules for the pre-fill below. Failure is deliberately silent: with no
  // rules the pre-fill falls back to each room's flat rate, which is the old
  // behaviour, so there is nothing here worth interrupting a booking over.
  useEffect(() => {
    let cancelled = false;
    fetchRateRulesDB()
      .then(({ rules, pricing_mode }) => {
        if (cancelled) return;
        setRateRules(Array.isArray(rules) ? rules : []);
        setRatePricingMode(pricing_mode || 'flat');
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const sortedRateRules = useMemo(() => sortRateRules(rateRules), [rateRules]);

  /**
   * Pre-fill the rent from the room AND the dates (8 Sep 2026, explicit
   * request: "I just want the tariff to be pre-filled in the fields as property
   * and dates are already chosen").
   *
   * Two things changed from the old pre-fill:
   *
   *  1. It is an effect on the VALUES, not a line inside the dropdown's change
   *     handler. Two of the three paths that set a room never went through that
   *     handler - opening the drawer FROM a specific room, and the post-save
   *     reset - so the rent sat empty while a room was plainly selected, which
   *     is exactly how it was reported.
   *  2. It counts NIGHTS. `default_tariff` is one night's price; a 3-night stay
   *     pre-filled with it under-quoted by two thirds, and since Pending is
   *     literally rent minus advance, that shortfall flowed straight into what
   *     the guest was told they still owe. It now sums each night at its real
   *     rate, matching what the calendar shows and what the OTAs receive.
   *
   * `tariffManuallyEdited` still wins: once staff type their own number this
   * stops touching the field for the rest of the booking.
   */
  useEffect(() => {
    if (tariffManuallyEdited) return;
    if (!checkinDate || !expectedCheckout) return;
    const nights = nightsOfStay(checkinDate, expectedCheckout);
    if (nights.length === 0) return;

    // Multi-key only: a single-unit property has no rooms array in this form, so
    // there is no per-room rate to read and the field stays for staff to fill.
    const hasRoomList = isMultiKeyProperty && rooms && rooms.length > 0;
    const selectedRoom = hasRoomList ? rooms.find((r) => r.name === roomNumber) : undefined;
    if (hasRoomList && !selectedRoom) return;

    const fallbackRate = Number(
      (selectedRoom as any)?.baseRate ??
      selectedRoom?.default_tariff ??
      (selectedRoom as any)?.roomTariff ??
      (selectedRoom as any)?.price ??
      0
    );
    if (!fallbackRate && ratePricingMode !== 'variable') return;

    const total = nights.reduce(
      (sum, dateStr) => sum + pickNightRate(sortedRateRules, ratePricingMode, selectedRoom?.id, dateStr, fallbackRate),
      0
    );
    if (!total || total <= 0) return;

    setBookingRoomTariff((prev) => (prev === total ? prev : total));
  }, [
    roomNumber,
    checkinDate,
    expectedCheckout,
    rooms,
    isMultiKeyProperty,
    sortedRateRules,
    ratePricingMode,
    tariffManuallyEdited,
  ]);

  // Just sets the room now - the rent pre-fill moved to an effect keyed on the
  // room AND the dates (8 Sep 2026). Hanging it off this handler meant only a
  // manual dropdown pick ever filled the rent: opening the drawer FROM a room
  // (the mount effect at the top of this file) and the post-save reset both set
  // roomNumber directly, so the rent stayed blank with a room clearly showing -
  // which is exactly how it was reported.
  const handleRoomChange = (roomName: string) => {
    setRoomNumber(roomName);
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
    setNoOfGuests(2);
    // Children were never reset here (found 7 Sep 2026 while adding the kids
    // checkbox). A booking saved with 2 children left childrenCount at 2, so the
    // NEXT booking silently carried them - previously only visible as a stale
    // number in the "Of which children" box, now it would also leave the checkbox
    // ticked. Both cleared together, since hasChildren gates the field.
    setChildrenCount(0);
    setHasChildren(false);
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
    // Same rule as the mount effect (7 Sep 2026): restore only a pre-selection
    // the CONTEXT actually justifies, never rooms[0]. This is the reset after a
    // successful save, so the form is a fresh "add booking" - if it was opened
    // from a specific room, that room is still the context and comes back;
    // otherwise the field returns to empty rather than silently arming the next
    // booking with whichever room sorts first. The mount effect cannot cover this
    // (its deps have not changed), so the rule has to be stated in both places.
    setSavedBooking(null);
    if (isMultiKeyProperty && rooms && rooms.length > 0) {
      const contextRoom =
        (preSelectRoom && rooms.find((r) => r.name === preSelectRoom)?.name) ||
        (selectedRoomSlug && rooms.find((r) => r.slug === selectedRoomSlug)?.name) ||
        '';
      setRoomNumber(contextRoom);
    } else {
      setRoomNumber('');
    }
  };

  const handleShareSavedBooking = async () => {
    if (!savedBooking) return;
    setIsSharingBooking(true);
    try {
      let voucherToken = '';
      try {
        if (savedBooking.id) {
          voucherToken = await fetchBookingVoucherTokenDB(savedBooking.id);
        }
      } catch (err) {
        console.warn('Could not fetch voucher token:', err);
      }

      const activeTemplate = propertyWhatsappTemplate?.trim() || DEFAULT_WHATSAPP_VOUCHER_TEMPLATE;
      const cIn = (savedBooking.checkinDate || '').split(' ')[0];
      const cOut = ((savedBooking.expectedCheckout || savedBooking.checkinDate) || '').split(' ')[0];
      const stayNights = nightsOfStay(cIn, cOut).length || 1;
      const totalCharge = Number(savedBooking.roomRate || 0);
      const advPaid = Number(savedBooking.advanceAmount || 0);
      const balDue = Number(savedBooking.pendingAmount || 0);
      const depositVal = propertySecurityDeposit && Number(propertySecurityDeposit) > 0 ? Number(propertySecurityDeposit) : 0;

      const waText = renderWhatsappVoucherTemplate(activeTemplate, {
        booking_id: String(savedBooking.id ?? ''),
        voucher_link: voucherToken
          ? `${window.location.origin}${window.location.pathname}#voucher?token=${voucherToken}`
          : '',
        payments_list: '',
        guest_breakdown: (() => {
          const kids = Number(savedBooking.children ?? 0);
          if (kids <= 0) return '';
          const grown = Math.max(0, Number(savedBooking.numberOfGuests || 0) - kids);
          return `${grown} adult${grown === 1 ? '' : 's'}, ${kids} child${kids === 1 ? '' : 'ren'}`;
        })(),
        guest_name: savedBooking.guestName || 'Guest',
        guest_phone: savedBooking.phoneNumber || '',
        nights: String(stayNights),
        balance_due: balDue > 0 ? balDue.toFixed(2) : '',
        security_deposit: depositVal > 0 ? depositVal.toFixed(2) : '',
        // Single property: nothing distinct beyond the Property line above it
        // (12 Sep 2026, explicit request) - '' drops the whole line.
        room_name: isMultiKeyProperty ? (savedBooking.roomNumber || '') : '',
        room_number: savedBooking.roomNumber || '',
        property_name: propertyName || 'our property',
        checkin_date: formatDateOrdinal(cIn),
        checkin_time: checkinTime || propertyCheckinTime || '2:00 PM',
        checkout_date: formatDateOrdinal(cOut),
        checkout_time: checkoutTime || propertyCheckoutTime || '11:00 AM',
        guest_count: String(savedBooking.numberOfGuests || 2),
        room_tariff: totalCharge.toFixed(2),
        total_amount: totalCharge.toFixed(2),
        advance_paid: advPaid.toFixed(2),
        address: propertyAddress || '',
        property_address: propertyAddress || '',
        contact_phone: propertyPhone || '',
        property_phone: propertyPhone || '',
        phone: propertyPhone || '',
        maps_link: propertyMapsLink || '',
        google_maps_link: propertyMapsLink || '',
        upi_id: propertyUpiId || '',
        upi_qr_code_url: propertyUpiQrCodeUrl || '',
        qr_code: propertyUpiQrCodeUrl || '',
        other_notes: savedBooking.notes || '',
        instructions: propertyInstructions || '',
        wifi_network: propertyGuestInfo?.wifiNetwork || '',
        wifi_password: propertyGuestInfo?.wifiPassword || '',
        house_manual: propertyGuestInfo?.houseManual || '',
      });

      const cleanPhone = (savedBooking.phoneNumber || '').replace(/\D/g, '');
      const waUrl = cleanPhone.length === 10
        ? `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(waText)}`
        : cleanPhone.length > 10
        ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`
        : `https://wa.me/?text=${encodeURIComponent(waText)}`;

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(waText).catch(() => {});
      }

      window.open(waUrl, '_blank');
      showToast('Booking voucher ready to send on WhatsApp!', { type: 'success' });
    } catch (err: any) {
      showToast(err?.message || 'Failed to share booking', { type: 'error' });
    } finally {
      setIsSharingBooking(false);
    }
  };

  const handleSendInstantQuote = async () => {
    if (!checkinDate || !expectedCheckout) {
      showToast('Pick check-in and check-out dates first.', { type: 'error' });
      return;
    }
    if (isMultiKeyProperty && (!roomNumber || !roomNumber.trim())) {
      showToast('Select a room first.', { type: 'error' });
      return;
    }

    const selectedRoomObj = rooms.find((r) => r.name === roomNumber || r.slug === roomNumber);
    const hoursNum = Number(holdHours) || 2;
    const holdLabel = hoursNum === 1 ? '1 hour' : hoursNum < 1 ? `${Math.round(hoursNum * 60)} minutes` : `${hoursNum} hours`;

    setSendingQuote(true);
    try {
      const result = await createBookingHoldDB({
        room_id: selectedRoomObj?.id,
        checkin_date: checkinDate,
        checkout_date: expectedCheckout,
        guest_name: guestName.trim() || undefined,
        phone: phoneNumber.trim() || undefined,
        num_guests: noOfGuests,
        hold_hours: hoursNum,
      });

      if (!result.success || !result.data) {
        showToast(result.message || 'Failed to create quote link', { type: 'error' });
        return;
      }

      const quote = result.data;
      // A REAL, tracked confirmation link tied to this exact hold's token - better
      // than a generic #book?checkin=&checkout= link, since it lets the guest
      // confirm the SPECIFIC reservation just held for them, not just browse.
      const shareUrl = `${window.location.origin}${window.location.pathname}#book?quote=${quote.quote_token}`;

      // Upgraded 12 Sep 2026 from a hardcoded waText to the customizable "Make
      // Booking" template (property may override; DEFAULT_MAKE_BOOKING_TEMPLATE
      // otherwise) - the same render function BookingDetailsModal's confirmation
      // voucher already uses, so this preview can never drift from what actually
      // sends. cancellation_policy resolves per-room for a MULTI_KEY property
      // (each room is its own listing, see Room.cancellation_policy) or from the
      // property-wide fallback for a SINGLE property - same precedence shape as
      // propertySecurityDeposit elsewhere in this file.
      const activeMakeBookingTemplate = propertyMakeBookingTemplate?.trim() || DEFAULT_MAKE_BOOKING_TEMPLATE;
      // Empty cancellation policy used to render the "CANCELLATION POLICY"
      // heading with nothing under it - a guest reading a blank line has no
      // idea whether that means "free cancellation" or "we forgot to answer".
      // Falls back to a real sentence instead (12 Sep 2026, explicit request).
      const cancellationPolicyValue = isMultiKeyProperty
        ? (selectedRoomObj?.cancellation_policy || 'Contact host for cancellation policy.')
        : (propertyCancellationPolicy || 'Contact host for cancellation policy.');
      const waText = renderWhatsappVoucherTemplate(activeMakeBookingTemplate, {
        property_name: propertyName || 'our property',
        // A single property has nothing distinct to name beyond the Property
        // line above it - '' drops the whole "Unit / Room" line (12 Sep 2026,
        // explicit request, see {room_name} in renderWhatsappVoucherTemplate's
        // optionalTokens).
        room_name: isMultiKeyProperty ? quote.room_name : '',
        room_tariff: (Number(bookingRoomTariff) || (quote.total_tariff / Math.max(1, quote.nights))).toFixed(2),
        checkin_date: quote.checkin_date,
        checkin_time: checkinTime,
        checkout_date: quote.checkout_date,
        checkout_time: checkoutTime,
        nights: String(quote.nights),
        guest_count: String(noOfGuests),
        cancellation_policy: cancellationPolicyValue,
        address: propertyAddress || '',
        maps_link: propertyMapsLink || '',
        contact_phone: propertyPhone || '',
        // Held for {holdLabel} isn't a template token - it's specific to THIS
        // send, not something a property would want to word themselves, so it's
        // appended after rendering rather than added as another token.
        booking_link: shareUrl,
      }) + `\n\n_(Room held for the next ${holdLabel})_`;

      // Open straight into the guest's own chat instead of a contact-picker/
      // "Message yourself" default (12 Sep 2026, explicit request) - same
      // 10-digit-India-first pattern already used by handleSendInstantQuote's
      // sibling send flows a little further down this file.
      const cleanPhone = (phoneNumber || '').replace(/\D/g, '');
      const waUrl = cleanPhone.length === 10
        ? `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(waText)}`
        : cleanPhone.length > 10
        ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`
        : `https://wa.me/?text=${encodeURIComponent(waText)}`;

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(waText).catch(() => {});
      }

      window.open(waUrl, '_blank');
      showToast(`Quote link created - room held for ${holdLabel}.`, { type: 'success' });
    } catch (err: any) {
      showToast(err?.message || 'Network error creating quote', { type: 'error' });
    } finally {
      setSendingQuote(false);
    }
  };


  const handleShareAllAvailableRooms = async () => {
    if (!checkinDate || !expectedCheckout) {
      showToast('Pick check-in and check-out dates first.', { type: 'error' });
      return;
    }
    if (checkinDate >= expectedCheckout) {
      showToast('Check-out date must be after check-in date.', { type: 'error' });
      return;
    }

    const cIn = new Date(checkinDate + 'T00:00:00');
    const cOut = new Date(expectedCheckout + 'T00:00:00');
    const nights = Math.max(1, Math.round((cOut.getTime() - cIn.getTime()) / (1000 * 60 * 60 * 24)));
    const nightDateStrs: string[] = [];
    for (let i = 0; i < nights; i++) {
      const d = new Date(cIn);
      d.setDate(d.getDate() + i);
      nightDateStrs.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }

    // Filter available rooms for these dates
    const availableRooms = rooms.filter((r) => {
      return !guests.some((g) => {
        if (g.status === 'CheckedOut' || (g.status as string) === GUEST_STATUS_CHECKED_OUT || (g.status as string) === 'Cancelled') return false;
        const gRoomId = (g as any).roomId || (g as any).room_id;
        const matchesRoom = (gRoomId && r.id && Number(gRoomId) === Number(r.id)) ||
          (g.roomNumber && r.name && g.roomNumber.toLowerCase().trim() === r.name.toLowerCase().trim());
        if (!matchesRoom) return false;
        const gIn = (g.checkinDate || '').split(' ')[0];
        const gOut = (g.expectedCheckout || g.checkoutDate || g.checkinDate || '').split(' ')[0];
        return gIn < expectedCheckout && gOut > checkinDate;
      });
    });

    if (availableRooms.length === 0) {
      showToast('No rooms are available for the selected dates.', { type: 'warning' });
      return;
    }

    setSharingAllRooms(true);
    try {
      // Real rates, not each room's flat default_tariff (7 Sep 2026, explicit
      // report: "it is displaying base prices"). variable pricing_mode means
      // a room's actual nightly rate can be overridden per date/day-of-week
      // by room_rate_rules - skipping that and reading default_tariff
      // straight off the room quoted a price the guest would never actually
      // be charged.
      const { rules, pricing_mode } = await fetchRateRulesDB();
      const resolvedRules = sortRateRules(rules);
      const getNightRate = (roomId: number | undefined, dateStr: string, fallback: number): number =>
        pickNightRate(resolvedRules, pricing_mode, roomId, dateStr, fallback);

      const shareUrl = `${window.location.origin}${window.location.pathname}#book?checkin=${checkinDate}&checkout=${expectedCheckout}`;
      const greeting = guestName.trim() ? `Hi ${guestName.trim()}, ` : 'Hi, ';
      let waText = `${greeting}here are our available rooms for ${formatDateDDMMYYYY(checkinDate)} to ${formatDateDDMMYYYY(expectedCheckout)} (${nights} night${nights > 1 ? 's' : ''}):\n\n`;

      availableRooms.forEach((r, idx) => {
        const fallbackRate = (r as any).baseRate || r.default_tariff || (r as any).roomTariff || (r as any).price || 0;
        const nightlyRates = nightDateStrs.map((d) => getNightRate(r.id, d, fallbackRate));
        const totalTariff = nightlyRates.reduce((sum, rate) => sum + rate, 0);
        // Only worth showing a per-night figure when every night is the same
        // rate - a mixed-rate stay (e.g. weekday/weekend) only has one
        // honest number: the total.
        const allSameRate = nightlyRates.every((rate) => rate === nightlyRates[0]);
        const perNightLabel = allSameRate
          ? ` — ₹${nightlyRates[0].toLocaleString('en-IN')}/night (Total: ₹${totalTariff.toLocaleString('en-IN')})`
          : ` — Total: ₹${totalTariff.toLocaleString('en-IN')} (${nights} nights)`;
        waText += `${idx + 1}. *${r.name}*${perNightLabel}\n`;
      });

      waText += `\nTap here to view room details, photos, and book directly:\n${shareUrl}`;

      // Target specific guest phone if entered
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const waUrl = cleanPhone.length === 10
        ? `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(waText)}`
        : cleanPhone.length > 10
        ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`
        : `https://wa.me/?text=${encodeURIComponent(waText)}`;

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(waText).catch(() => {});
      }

      window.open(waUrl, '_blank');
      showToast('Available rooms and rates ready to send on WhatsApp!', { type: 'success' });
    } finally {
      setSharingAllRooms(false);
    }
  };

  // Dedicated Pricing page (Bookings > Pricing in the sidebar, 9 Sep 2026,
  // explicit request) - renders the same PricingRulesPanel content the
  // "Dynamic Pricing" modal already uses, just as a standalone page
  // instead of an overlay. See PricingPage.tsx's own header comment.
  if (activeMenuItemKey === 'pricing') {
    return <PricingPage rooms={rooms} />;
  }

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
            setPhoneNumberTouched(true);
            setDatesTouched(true);
            setRoomTouched(true);

            const newCheckinStr = checkinTime ? `${checkinDate} ${checkinTime}:00` : checkinDate;
            const newCheckoutStr = checkoutTime ? `${expectedCheckout} ${checkoutTime}:00` : expectedCheckout;

            if (!phoneNumber.trim()) {
              return;
            }
            if (!isValidPhoneNumber(phoneNumber, isForeignGuest)) {
              return;
            }
            if (!checkinDate || !expectedCheckout) {
              return;
            }

            if (isMultiKeyProperty && (!roomNumber || !roomNumber.trim())) {
              return;
            }

            if (advanceExceedsTotal) {
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
              showToast(`${roomNumber} is already booked for these dates.`, { type: 'error' });
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
              roomNumber: selectedRoomObj ? selectedRoomObj.name : roomNumber,
              roomId: selectedRoomId,
              room_id: selectedRoomId,
              checkinDate: newCheckinStr,
              expectedCheckout: newCheckoutStr,
              status: 'Booked',
              bookingSource: bookingSourceLocal,
              numberOfGuests: noOfGuests,
              children: childrenCount,
              adults: Math.max(0, noOfGuests - childrenCount),
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
              setSavedBooking(guestObj);
              showToast('Guest booked successfully!', { type: 'success' });
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
                label={t('guest_name_label', 'Guest Name')}
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onBlur={() => setGuestNameTouched(true)}
                placeholder="Enter guest's full name (optional)"
                helperText="Defaults to 'Resident Guest' if left blank."
              />
            </div>

            {/* Row 1 & 2: Symmetrical 2-Column Pairing across Multi-Key and Single-Key properties */}
            {isMultiKeyProperty && rooms && rooms.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <Input
                      label={t('contact_phone_label', 'Phone Number *')}
                      type="tel"
                      value={phoneNumber}
                      onChange={e => setPhoneNumber(normalizePhoneNumber(e.target.value))}
                      onBlur={() => setPhoneNumberTouched(true)}
                      placeholder="Enter 10-digit mobile number"
                      required
                      error={
                        phoneNumberTouched && !phoneNumber.trim()
                          ? 'Phone number is required'
                          : phoneFormatInvalid
                          ? (isForeignGuest ? 'Enter a valid international phone number' : 'Enter a valid 10-digit mobile number')
                          : duplicateBookingLive
                          ? 'A reservation for this contact on this check-in date already exists'
                          : undefined
                      }
                    />
                  </div>

                  <div>
                    <StyledSelect
                      label={t('assigned_room_label', 'Assigned Place *')}
                      value={roomNumber}
                      onChange={(val) => {
                        handleRoomChange(val);
                        setRoomTouched(true);
                      }}
                      options={rooms.map((room) => ({ value: room.name, label: room.name }))}
                      error={
                        isMultiKeyProperty && roomTouched && (!roomNumber || !roomNumber.trim())
                          ? 'An assigned place selection is required'
                          : roomDateConflictLive
                          ? 'This place is already booked for the selected dates'
                          : undefined
                      }
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
                      onChange={(e) => {
                        const next = Math.max(1, Number(e.target.value));
                        setNoOfGuests(next);
                        // Children can never exceed the total it is a subset of.
                        setChildrenCount((prev) => Math.min(prev, next));
                      }}
                      helperText={childrenCount > 0
                        ? `${Math.max(0, noOfGuests - childrenCount)} adult${noOfGuests - childrenCount === 1 ? '' : 's'}, ${childrenCount} child${childrenCount === 1 ? '' : 'ren'}`
                        : undefined}
                    />
                  </div>
                  {/* Kids are declared only when there are any (7 Sep 2026).
                      The checkbox sits in the guests grid's second column so it
                      lands directly under the count it qualifies, and the number
                      field appears in its place once ticked. */}
                  <div className="flex items-center gap-2 self-center">
                    <Checkbox
                      id="booking-has-children-cb"
                      checked={hasChildren}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setHasChildren(on);
                        // Unticking must clear the count, not just hide it -
                        // otherwise a hidden non-zero silently rides along onto
                        // the booking and the confirmation claims children the
                        // staff member can no longer see or correct.
                        if (!on) setChildrenCount(0);
                      }}
                    />
                    <label
                      htmlFor="booking-has-children-cb"
                      className="text-xs font-medium text-gray-900 dark:text-gray-300 cursor-pointer select-none"
                    >
                      Travelling with kids
                    </label>
                  </div>
                  {hasChildren && (
                    <div>
                      <Input
                        label={t('children_count_label', 'Number of Kids')}
                        type="number"
                        min="0"
                        max={noOfGuests}
                        value={childrenCount}
                        onChange={(e) => setChildrenCount(Math.min(noOfGuests, Math.max(0, Number(e.target.value))))}
                        helperText="Included in the guest count above, not added to it."
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <Input
                      label={t('contact_phone_label', 'Phone Number *')}
                      type="tel"
                      value={phoneNumber}
                      onChange={e => setPhoneNumber(normalizePhoneNumber(e.target.value))}
                      onBlur={() => setPhoneNumberTouched(true)}
                      placeholder="Enter 10-digit mobile number"
                      required
                      error={
                        phoneNumberTouched && !phoneNumber.trim()
                          ? 'Phone number is required'
                          : phoneFormatInvalid
                          ? (isForeignGuest ? 'Enter a valid international phone number' : 'Enter a valid 10-digit mobile number')
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
                      onChange={(e) => {
                        const next = Math.max(1, Number(e.target.value));
                        setNoOfGuests(next);
                        // Children can never exceed the total it is a subset of.
                        setChildrenCount((prev) => Math.min(prev, next));
                      }}
                      helperText={childrenCount > 0
                        ? `${Math.max(0, noOfGuests - childrenCount)} adult${noOfGuests - childrenCount === 1 ? '' : 's'}, ${childrenCount} child${childrenCount === 1 ? '' : 'ren'}`
                        : undefined}
                    />
                  </div>
                  {/* Kids are declared only when there are any (7 Sep 2026).
                      The checkbox sits in the guests grid's second column so it
                      lands directly under the count it qualifies, and the number
                      field appears in its place once ticked. */}
                  <div className="flex items-center gap-2 self-center">
                    <Checkbox
                      id="booking-has-children-cb"
                      checked={hasChildren}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setHasChildren(on);
                        // Unticking must clear the count, not just hide it -
                        // otherwise a hidden non-zero silently rides along onto
                        // the booking and the confirmation claims children the
                        // staff member can no longer see or correct.
                        if (!on) setChildrenCount(0);
                      }}
                    />
                    <label
                      htmlFor="booking-has-children-cb"
                      className="text-xs font-medium text-gray-900 dark:text-gray-300 cursor-pointer select-none"
                    >
                      Travelling with kids
                    </label>
                  </div>
                  {hasChildren && (
                    <div>
                      <Input
                        label={t('children_count_label', 'Number of Kids')}
                        type="number"
                        min="0"
                        max={noOfGuests}
                        value={childrenCount}
                        onChange={(e) => setChildrenCount(Math.min(noOfGuests, Math.max(0, Number(e.target.value))))}
                        helperText="Included in the guest count above, not added to it."
                      />
                    </div>
                  )}
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
                error={
                  datesTouched && (!checkinDate || !expectedCheckout)
                    ? 'Check-in and check-out dates are required'
                    : roomDateConflictLive
                    ? (isMultiKeyProperty ? 'The selected place is not available for these dates' : 'This property is already booked for these dates')
                    : undefined
                }
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

            {/* Money sits directly under Room Rent (7 Sep 2026, explicit request:
                "move advance paid below room rent"). Advance and Pending are both
                derived from the rent - Pending is literally rent minus advance - so
                separating them with the Guest Notes / Foreign National / Additional
                Charges checkboxes put unrelated toggles in the middle of one
                calculation. Both rows moved together rather than Advance alone,
                since splitting a figure from the number it is subtracted from would
                be worse than the original order. */}
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
                    error={advanceExceedsTotal
                      ? `Can't be more than the total booking amount (₹${bookingTotalDue.toLocaleString('en-IN')})`
                      : undefined}
                  />
                </div>

                {bookingAdvance > 0 ? (
                  <div>
                    <StyledSelect
                      label={t('advance_received_by', 'Advance Received By')}
                      value={advanceReceivedBy}
                      onChange={setAdvanceReceivedBy}
                      placeholder="-- Select Staff/User --"
                      options={[
                        { value: '', label: '- Not Selected -' },
                        ...(staff.filter(s => s.isFinancialHandler).length > 0
                          ? staff.filter(s => s.isFinancialHandler)
                          : staff
                        ).map(s => ({ value: s.name, label: s.name }))
                      ]}
                    />
                  </div>
                ) : <div />}
              </div>
            )}

            {/* Pending Balance + Pending Received By (2 columns on all screens) */}
            {bookingAdvance > 0 && bookingPending > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Input
                    label={t('pending_balance_label', 'Pending Balance (₹)')}
                    type="number"
                    value={bookingPending || ''}
                    onChange={e => handlePendingChange(Number(e.target.value))}
                    placeholder="0.00"
                    error={bookingPending < 0
                      ? 'Pending balance cannot be negative — lower the advance paid'
                      : undefined}
                  />
                </div>

                <div>
                  <StyledSelect
                    label={t('pending_received_by_label', 'Pending Received By')}
                    value={pendingReceivedBy}
                    onChange={setPendingReceivedBy}
                    placeholder="-- Select Staff/User --"
                    options={[
                      { value: '', label: '- Not Selected -' },
                      ...(staff.filter(s => s.isFinancialHandler).length > 0
                        ? staff.filter(s => s.isFinancialHandler)
                        : staff
                      ).map(s => ({ value: s.name, label: s.name }))
                    ]}
                  />
                </div>
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
                  <Button color="light" size="sm" onClick={handleAddBookingExtraChargeLine}>
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
                            options={
                              miscChargesList.length > 0
                                ? [
                                    ...miscChargesList.map((m) => {
                                      const chargeLabel = m.label || (m as any).name || 'Misc Charge';
                                      const price = m.default_amount ?? (m as any).defaultPrice ?? 0;
                                      return {
                                        value: chargeLabel,
                                        label: price > 0 ? `${chargeLabel} (₹${price.toLocaleString('en-IN')})` : chargeLabel,
                                      };
                                    }),
                                    { value: 'Misc', label: 'Misc (Custom Note)' },
                                  ]
                                : [
                                    { value: 'Decoration & Event Setup', label: 'Decoration & Event Setup' },
                                    { value: 'Early Check-in Fee', label: 'Early Check-in Fee' },
                                    { value: 'Extra Bed / Mattress', label: 'Extra Bed / Mattress' },
                                    { value: 'Late Check-out Fee', label: 'Late Check-out Fee' },
                                    { value: 'Pet Stay Fee', label: 'Pet Stay Fee' },
                                    { value: 'Room Damage', label: 'Room Damage' },
                                    { value: 'Misc', label: 'Misc (Custom Note)' },
                                  ]
                            }
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

            <Button
              type="submit"
              color={savedBooking ? 'light' : 'blue'}
              disabled={isSubmitting}
              className={`w-full mt-4 font-semibold flex items-center justify-center gap-2 transition-opacity ${!canSubmitBooking ? 'opacity-50' : ''}`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>{t('saving_booking_button', 'Saving Booking...')}</span>
                </>
              ) : savedBooking ? (
                <span>Saved Booking ✓</span>
              ) : (
                <span>{t('save_guest_booking_button', 'Save Booking')}</span>
              )}
            </Button>

            {savedBooking && (
              <div className="space-y-2 mt-2">
                <Button
                  type="button"
                  color="green"
                  disabled={isSharingBooking}
                  onClick={handleShareSavedBooking}
                  className="w-full font-semibold flex items-center justify-center gap-2"
                >
                  {isSharingBooking ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>Preparing Link...</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4 shrink-0" />
                      <span>Share Booking</span>
                    </>
                  )}
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    color="light"
                    onClick={() => {
                      setSavedBooking(null);
                      resetBookingForm();
                    }}
                    className="flex-1 text-xs font-medium"
                  >
                    + Add Another Booking
                  </Button>
                  {onClose && (
                    <Button
                      type="button"
                      color="light"
                      onClick={onClose}
                      className="flex-1 text-xs font-medium"
                    >
                      Close
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* "Or" row between Save Booking and inquiry/quote options */}
            <div className="flex items-center gap-3 my-3" aria-hidden="true">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              <span className="text-2xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Or</span>
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>

            {/* "Inquiry -> Instant Quote" (5 Sep 2026) - for a guest who called
                or messaged, send a WhatsApp link with this exact room/dates
                already filled in instead of finalizing the booking yourself.
                Reuses the room/date/guest fields above; type="button" so it
                never triggers this form's own submit validation, which
                requires guest name + phone (a quote link can be sent before
                either is known). Revising the price and clicking it again
                just resends - see handleSendInstantQuote/booking_holds.php. */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-3 space-y-2">
              <div>
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">Ask guest to book.</h4>
                <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Holds the room for the chosen time and sends a payment link.
                </p>
              </div>

              {/* One row at every width now (8 Sep 2026). It was already
                  side-by-side from `sm` up; the phone kept stacking, which is the
                  screen the request came from. Shortening the button label is
                  what makes ~190px enough for it next to a ~140px select - the
                  duration options were shortened for the same reason. */}
              <div className="flex flex-row items-end gap-2">
                <div className="w-32 sm:w-44 shrink-0">
                  <StyledSelect
                    label="Hold Room For"
                    value={holdHours}
                    onChange={setHoldHours}
                    options={[
                      { value: '0.25', label: '15 min' },
                      { value: '0.5', label: '30 min' },
                      { value: '1', label: '1 hour' },
                      { value: '2', label: '2 hours' },
                      { value: '4', label: '4 hours' },
                      { value: '6', label: '6 hours' },
                      { value: '12', label: '12 hours' },
                      { value: '24', label: '24 hours' },
                      { value: '48', label: '48 hours' },
                    ]}
                  />
                </div>
                <Button
                  type="button"
                  color="green"
                  disabled={sendingQuote}
                  onClick={handleSendInstantQuote}
                  className="flex-1 min-w-0 font-semibold flex items-center justify-center gap-2"
                >
                  {sendingQuote ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span className="truncate">Creating Link...</span>
                    </>
                  ) : (
                    <>
                      <MessageCircle className="w-4 h-4 shrink-0" />
                      <span className="truncate">Share Quote</span>
                    </>
                  )}
                </Button>
              </div>

              {/* The other inquiry, presented as the ALTERNATIVE it is (8 Sep
                  2026, explicit request). Stacked plainly under the Quote button
                  it read as "and also do this"; the "or" says these are two
                  answers to two different questions - quote the one place they
                  asked about, or send everything that is free.

                  Drawn as a real hairline rather than typed dashes: a literal
                  "--- or ---" is a fixed-length text drawing of a rule, so it
                  cannot centre or scale with the drawer, and looks wrong at one
                  width or the other. Two flex-1 borders always meet in the
                  middle at any size, in both themes.

                  BOTH the divider and the button live inside this one condition
                  on purpose - the button is multi-room only, so a divider left
                  outside it would leave a single-unit property with a dangling
                  "or" followed by nothing.

                  Still NOT the same as the sidebar's "Share Availability", which
                  only sends a link to the public booking page with no dates and
                  no prices. This computes what is actually free for the dates in
                  this form and sends the real rates. */}
              {isMultiKeyProperty && rooms && rooms.length > 1 && (
                <>
                  <div className="flex items-center gap-3 pt-1" aria-hidden="true">
                    <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                    <span className="text-2xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">or</span>
                    <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                  </div>
                  <Button
                    type="button"
                    color="light"
                    disabled={sharingAllRooms}
                    onClick={handleShareAllAvailableRooms}
                    className="w-full font-semibold flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                  >
                    {sharingAllRooms ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span>Checking Prices...</span>
                      </>
                    ) : (
                      <>
                        <MessageCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        {/* "Places", not "Keys" - the Assigned Place field right
                            above already calls a unit a place, so this drops the
                            hotel jargon in favour of the word this form itself
                            uses. */}
                        <span>Share All Available Places &amp; Prices</span>
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }
  return (
    <BillingCheckout
      propertySecurityDeposit={propertySecurityDeposit}
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
          propertyGuestInfo={propertyGuestInfo}
      propertyCheckinTime={propertyCheckinTime}
      propertyCheckoutTime={propertyCheckoutTime}
      propertyUpiId={propertyUpiId}
      propertyUpiQrCodeUrl={propertyUpiQrCodeUrl}
    />
  );
};
