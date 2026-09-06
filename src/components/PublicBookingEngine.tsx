import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Phone,
  Loader2,
  Sparkles,
  ArrowRight,
  X,
  Building,
  AlertCircle,
  Copy,
  Check,
  Upload,
} from './icons/FlowbiteIcons';
import { Dropdown, DropdownItem } from 'flowbite-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from './Button';
import { Badge } from './Badge';
import { DateRangePicker } from './DateRangePicker';
import { FloatingInput } from './FloatingInput';
import { FloatingSelect } from './FloatingSelect';
import { buildUpiPaymentLink } from '../utils/upiQrCode';
import { apiFetch, API_ROOT_BASE, getBookingHoldDB, confirmBookingHoldDB, BookingHoldDetails } from '../services/api';

interface PublicRoom {
  id: number;
  name: string;
  slug: string;
  default_tariff?: number | null;
  pricing_mode?: string | null;
  checkin_time?: string | null;
  checkout_time?: string | null;
  // Listing content (6 Sep 2026). Imported from Airbnb; every field optional,
  // because a property that has never connected a channel has none of it and the
  // card must still render exactly as it did before.
  description?: string | null;
  amenities?: string | null;
  bed_configuration?: string | null;
  bedrooms?: number | null;
  beds_count?: number | null;
  bathrooms?: number | null;
  max_capacity?: number | null;
}

/** "WIRELESS_INTERNET" -> "Wireless Internet". Display only. */
const humanizeKey = (k: string) =>
  k.trim().toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const parseJsonArray = (raw?: string | null): any[] => {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/**
 * The one-line "2 guests · 1 bedroom · 1 double bed · 1.5 baths" summary.
 * Returns '' when the room carries none of it, so the caller renders nothing
 * rather than an empty row of separators.
 */
const buildRoomFacts = (room: PublicRoom): string => {
  const parts: string[] = [];
  if (room.max_capacity && room.max_capacity > 0) {
    parts.push(`${room.max_capacity} guest${room.max_capacity > 1 ? 's' : ''}`);
  }
  if (room.bedrooms && room.bedrooms > 0) {
    parts.push(`${room.bedrooms} bedroom${room.bedrooms > 1 ? 's' : ''}`);
  }
  const bedRooms = parseJsonArray(room.bed_configuration);
  const bedTally = new Map<string, number>();
  bedRooms.forEach((br: any) =>
    (br?.beds || []).forEach((b: any) => {
      if (!b?.type) return;
      bedTally.set(b.type, (bedTally.get(b.type) || 0) + (Number(b.quantity) || 1));
    })
  );
  bedTally.forEach((qty, type) => {
    parts.push(`${qty} ${humanizeKey(type)}${qty > 1 ? 's' : ''}`);
  });
  if (!bedTally.size && room.beds_count && room.beds_count > 0) {
    parts.push(`${room.beds_count} bed${room.beds_count > 1 ? 's' : ''}`);
  }
  if (room.bathrooms && room.bathrooms > 0) {
    parts.push(`${room.bathrooms} bath${room.bathrooms > 1 ? 's' : ''}`);
  }
  return parts.join(' · ');
};

interface OccupiedBlock {
  room_id: number;
  checkin_date: string;
  expected_checkout: string;
  status?: string;
}

interface PublicProperty {
  id: number;
  name: string;
  slug: string;
  address: string;
  currency: string;
  phone?: string;
  google_maps_link?: string;
  upi_id?: string;
  upi_qr_code_url?: string;
  instructions?: string;
  checkin_time: string;
  checkout_time: string;
  pricing_mode: string;
  default_tariff: number;
}

interface BookingConfirmation {
  booking_id: number;
  reference_number: string;
  property_name: string;
  room_name: string;
  guest_name: string;
  phone: string;
  checkin_date: string;
  checkout_date: string;
  nights: number;
  total_tariff: number;
  payment_method: string;
  payment_status: string;
  upi_id?: string | null;
  checkin_time: string;
  checkout_time: string;
  address: string;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Format YYYY-MM-DD to DD MMM YYYY (e.g. 09 Sep 2026) per DESIGN.md
function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split(' ')[0].split('-');
  if (parts.length !== 3) return dateStr;
  const day = parts[2].padStart(2, '0');
  const monthIdx = parseInt(parts[1], 10) - 1;
  const month = SHORT_MONTHS[monthIdx] || parts[1];
  const year = parts[0];
  return `${day} ${month} ${year}`;
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const PublicBookingEngine: React.FC<{ propertySlug?: string }> = ({ propertySlug: initialSlugProp }) => {
  const currentSlug = useMemo(() => {
    return initialSlugProp || (typeof window !== 'undefined' ? window.location.pathname.split('/')[1] : '') || 'patel-colony';
  }, [initialSlugProp]);

  const [property, setProperty] = useState<PublicProperty | null>(null);
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [occupiedBlocks, setOccupiedBlocks] = useState<OccupiedBlock[]>([]);
  const [dailyRatesMap, setDailyRatesMap] = useState<{ [roomId: number]: { [dateStr: string]: number } }>({});
  const [dailyRestrictionsMap, setDailyRestrictionsMap] = useState<{ [roomId: number]: { [dateStr: string]: any } }>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Month Navigation State (Default to current month & year)
  const now = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => formatDateISO(now), [now]);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);

  // Check if we are at the minimum selectable month (current month)
  const isAtCurrentMonth = useMemo(() => {
    return selectedYear === currentYear && selectedMonth === currentMonth;
  }, [selectedYear, selectedMonth, currentYear, currentMonth]);

  // Date Range Selection State in Toolbar
  const [checkinDate, setCheckinDate] = useState<string>('');
  const [checkoutDate, setCheckoutDate] = useState<string>('');
  const [filterRoomId, setFilterRoomId] = useState<number | 'all'>('all');

  // Calendar click range selection
  const [pendingStart, setPendingStart] = useState<{ roomId: number; roomName: string; dateStr: string } | null>(null);
  const [bookingDrawerRoom, setBookingDrawerRoom] = useState<{
    roomId: number;
    roomName: string;
    checkin: string;
    checkout: string;
    nights: number;
    totalTariff: number;
    avgNightlyRate: number;
    /** The room's real capacity, so the guest picker can stop at it (6 Sep
     *  2026). 0/undefined = never set, which falls back to the old 1-5 list. */
    maxCapacity?: number | null;
  } | null>(null);

  // Booking Form Fields
  const [guestName, setGuestName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [numGuests, setNumGuests] = useState(2);
  const [specialRequests, setSpecialRequests] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  // "Inquiry -> Instant Quote" (5 Sep 2026) - a `#book?quote=<token>` URL
  // (generated by GuestManagement.tsx's "Share Quote and Payment Link" button)
  // skips the whole browse/search flow below entirely. The quote already
  // carries its own room/dates/price (computed server-side the same way at
  // creation time), so there's nothing left to search for - just a summary, a
  // live countdown (the hold duration is host-chosen, see booking_holds.php),
  // and a name/phone form. See api.ts's own doc comment on
  // getBookingHoldDB/confirmBookingHoldDB for the full picture.
  const quoteToken = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const hashQuery = window.location.hash.split('?')[1] || '';
    return new URLSearchParams(hashQuery).get('quote');
  }, []);

  const [quoteState, setQuoteState] = useState<'loading' | 'ready' | 'expired' | 'converted' | 'cancelled' | 'notfound' | 'error'>('loading');
  const [quoteHold, setQuoteHold] = useState<BookingHoldDetails | null>(null);
  const [quoteSecondsLeft, setQuoteSecondsLeft] = useState(0);
  const [quoteGuestName, setQuoteGuestName] = useState('');
  const [quotePhone, setQuotePhone] = useState('');
  const [quoteEmail, setQuoteEmail] = useState('');
  const [quoteNumGuests, setQuoteNumGuests] = useState(2);
  const [quoteSpecialRequests, setQuoteSpecialRequests] = useState('');
  const [quoteSubmitting, setQuoteSubmitting] = useState(false);
  const [quoteFormError, setQuoteFormError] = useState<string | null>(null);

  // Converted persistent voucher booking info
  const [convertedBooking, setConvertedBooking] = useState<any | null>(null);

  // Payment proof screenshot state
  const [paymentScreenshotFile, setPaymentScreenshotFile] = useState<File | null>(null);
  const [paymentScreenshotBase64, setPaymentScreenshotBase64] = useState<string>('');
  const [paymentScreenshotPreview, setPaymentScreenshotPreview] = useState<string>('');
  const [paymentScreenshotError, setPaymentScreenshotError] = useState<string | null>(null);
  const [copiedUpi, setCopiedUpi] = useState(false);

  const handleCopyUpi = (upiId: string) => {
    if (!upiId) return;
    navigator.clipboard.writeText(upiId).then(() => {
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2500);
    }).catch(() => {});
  };

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPaymentScreenshotError('Please select an image file (JPEG, PNG, WebP).');
      return;
    }

    setPaymentScreenshotError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1200;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          setPaymentScreenshotBase64(compressed);
          setPaymentScreenshotPreview(compressed);
          setPaymentScreenshotFile(file);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveScreenshot = () => {
    setPaymentScreenshotFile(null);
    setPaymentScreenshotBase64('');
    setPaymentScreenshotPreview('');
    setPaymentScreenshotError(null);
  };

  useEffect(() => {
    if (!quoteToken) return;
    let cancelled = false;
    (async () => {
      const result = await getBookingHoldDB(quoteToken);
      if (cancelled) return;
      if (!result.success || !result.data) {
        setQuoteState('notfound');
        return;
      }
      if (result.data.hold_status === 'converted') {
        if (result.data.converted_booking) {
          setConvertedBooking(result.data.converted_booking);
        }
        setQuoteState('converted');
        return;
      }
      if (result.data.hold_status !== 'active') {
        setQuoteState(result.data.hold_status);
        return;
      }
      setQuoteHold(result.data);
      setQuoteGuestName(result.data.guest_name || '');
      setQuotePhone(result.data.phone || '');
      setQuoteNumGuests(result.data.no_of_guests || 2);
      setQuoteSecondsLeft(result.data.expires_in_seconds || 0);
      setQuoteState('ready');
    })();
    return () => { cancelled = true; };
  }, [quoteToken]);

  // Live countdown - ticks client-side once we know expires_in_seconds; the
  // server is still the actual authority (confirmBookingHoldDB re-validates
  // expiry itself), this is purely so the guest sees time actually running out.
  useEffect(() => {
    if (quoteState !== 'ready') return;
    const iv = setInterval(() => {
      setQuoteSecondsLeft((s) => {
        if (s <= 1) {
          setQuoteState('expired');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [quoteState]);

  const handleConfirmQuoteBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteHold || !quoteToken) return;
    if (!quotePhone.trim()) {
      setQuoteFormError('Please enter your phone number.');
      return;
    }

    if (!paymentScreenshotBase64) {
      setQuoteFormError('Please upload your payment screenshot before confirming.');
      return;
    }

    setQuoteSubmitting(true);
    setQuoteFormError(null);
    try {
      const result = await confirmBookingHoldDB({
        quote_token: quoteToken,
        guest_name: quoteGuestName.trim() || 'Guest',
        phone: quotePhone.trim(),
        email: quoteEmail.trim() || undefined,
        num_guests: quoteNumGuests,
        special_requests: quoteSpecialRequests.trim() || undefined,
        payment_proof_base64: paymentScreenshotBase64,
      });

      if (result.success && result.data) {
        setConfirmation(result.data);
        setConvertedBooking(result.data);
        setQuoteState('converted');
      } else if ((result.message || '').toLowerCase().includes('expired')) {
        setQuoteState('expired');
      } else {
        setQuoteFormError(result.message || 'Failed to complete reservation. Please try again.');
      }
    } catch (err: any) {
      setQuoteFormError(err.message || 'Network error completing reservation');
    } finally {
      setQuoteSubmitting(false);
    }
  };

  // Fetch Public Property Data - skipped entirely in quote mode (above),
  // which needs none of the room/calendar browsing data this loads.
  const fetchPublicData = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=get_public_booking_info&property_slug=${encodeURIComponent(currentSlug)}`);
      const json = await res.json();
      if (json && json.status === 'success' && json.data) {
        setProperty(json.data.property);
        setRooms(json.data.rooms || []);
        setOccupiedBlocks(json.data.occupied_blocks || []);
        setDailyRatesMap(json.data.daily_rates || {});
        setDailyRestrictionsMap(json.data.daily_restrictions || {});
      } else {
        setFetchError(json?.message || 'Could not load property availability');
      }
    } catch (err: any) {
      setFetchError(err.message || 'Network error loading property availability');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (quoteToken) return;
    fetchPublicData();
  }, [currentSlug, quoteToken]);

  // Currency symbol - falls back to the quote's own currency in quote mode,
  // since `property` is never fetched there.
  const currencySym = useMemo(() => {
    const c = (property?.currency || quoteHold?.currency || 'INR').toUpperCase();
    if (c === 'INR') return '₹';
    if (c === 'USD') return '$';
    if (c === 'EUR') return '€';
    if (c === 'GBP') return '£';
    return `${c} `;
  }, [property?.currency, quoteHold?.currency]);

  // Navigate Months (Guarded against past months)
  const handlePrevMonth = () => {
    if (isAtCurrentMonth) return;
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    // Limit to max 12 months ahead
    if (selectedYear > currentYear + 1) return;
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  // Month days computation
  const monthInfo = useMemo(() => {
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const firstDayOfWeek = firstDay.getDay(); // 0 = Sun, 6 = Sat
    const monthName = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;
    return { daysInMonth, firstDayOfWeek, monthName };
  }, [selectedYear, selectedMonth]);

  // Days of the month to display in the multi-room table
  // When viewing current month, only keep 1 past date (yesterday = today - 1)
  // to remove older past dates and keep the calendar compact on mobile & desktop
  const tableDays = useMemo(() => {
    const totalDays = monthInfo.daysInMonth;
    const startDay = isAtCurrentMonth ? Math.max(1, now.getDate() - 1) : 1;
    const days: number[] = [];
    for (let d = startDay; d <= totalDays; d++) {
      days.push(d);
    }
    return days;
  }, [monthInfo.daysInMonth, isAtCurrentMonth, now]);

  // Rate resolver for a given room and date
  const getRoomDailyPrice = (room: PublicRoom, dateStr: string): number => {
    if (dailyRatesMap[room.id] && dailyRatesMap[room.id][dateStr] !== undefined) {
      return dailyRatesMap[room.id][dateStr];
    }
    if (room.default_tariff && Number(room.default_tariff) > 0) {
      return Number(room.default_tariff);
    }
    if (property?.default_tariff && Number(property.default_tariff) > 0) {
      return Number(property.default_tariff);
    }
    return 0;
  };

  // Check if room is occupied on date
  const isRoomOccupied = (roomId: number, dateStr: string): boolean => {
    return occupiedBlocks.some((b) => {
      const match =
        b.room_id === roomId ||
        Number(b.room_id) === Number(roomId) ||
        Number(b.room_id) === Number(property?.id) ||
        b.room_id === 0;
      return match && dateStr >= b.checkin_date && dateStr < b.expected_checkout;
    });
  };

  // Real-Time Available Rooms Calculation for selected Check-in & Check-out dates
  const availableRoomResults = useMemo(() => {
    if (!checkinDate || !checkoutDate || checkinDate >= checkoutDate) {
      return [];
    }

    const eligibleRooms = filterRoomId === 'all' ? rooms : rooms.filter((r) => r.id === filterRoomId);
    const results: Array<{
      room: PublicRoom;
      nights: number;
      totalTariff: number;
      avgNightlyRate: number;
    }> = [];

    for (const room of eligibleRooms) {
      const cur = new Date(checkinDate + 'T00:00:00');
      const end = new Date(checkoutDate + 'T00:00:00');
      let isAvailable = true;
      let totalTariff = 0;
      let nightCount = 0;

      while (cur < end) {
        const dStr = formatDateISO(cur);
        if (isRoomOccupied(room.id, dStr)) {
          isAvailable = false;
          break;
        }
        totalTariff += getRoomDailyPrice(room, dStr);
        nightCount++;
        cur.setDate(cur.getDate() + 1);
      }

      if (isAvailable && nightCount > 0) {
        results.push({
          room,
          nights: nightCount,
          totalTariff,
          avgNightlyRate: Math.round(totalTariff / nightCount),
        });
      }
    }

    return results;
  }, [checkinDate, checkoutDate, filterRoomId, rooms, occupiedBlocks, dailyRatesMap, property]);

  // Open booking drawer for a specific room and dates
  const handleOpenBookingDrawer = (room: PublicRoom, cIn: string, cOut: string) => {
    const cur = new Date(cIn + 'T00:00:00');
    const end = new Date(cOut + 'T00:00:00');
    let total = 0;
    let nights = 0;

    while (cur < end) {
      const dStr = formatDateISO(cur);
      total += getRoomDailyPrice(room, dStr);
      nights++;
      cur.setDate(cur.getDate() + 1);
    }

    setBookingDrawerRoom({
      roomId: room.id,
      roomName: room.name,
      checkin: cIn,
      checkout: cOut,
      nights: Math.max(1, nights),
      totalTariff: total,
      avgNightlyRate: nights > 0 ? Math.round(total / nights) : total,
      maxCapacity: room.max_capacity ?? null,
    });
    // numGuests defaults to 2 and persists between drawer opens, so without this
    // a 1-guest room would open showing "2 Guests" with no such option in the
    // list - and submit a booking for more people than the room holds.
    const cap = Number(room.max_capacity) || 0;
    if (cap > 0) setNumGuests((n) => Math.min(n, cap));
    setFormError(null);
  };

  // Cell click on calendar table (2-click range selection)
  const handleCellClick = (room: PublicRoom, dateStr: string, occupied: boolean, past: boolean) => {
    if (occupied || past) return;

    if (!pendingStart || pendingStart.roomId !== room.id || dateStr <= pendingStart.dateStr) {
      setPendingStart({ roomId: room.id, roomName: room.name, dateStr });
      setCheckinDate(dateStr);
      // Auto-set checkout to next day if empty or invalid
      const nextDay = new Date(dateStr + 'T00:00:00');
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = formatDateISO(nextDay);
      if (!isRoomOccupied(room.id, nextDayStr)) {
        setCheckoutDate(nextDayStr);
      }
      return;
    }

    // Finished 2nd click: pendingStart.dateStr -> dateStr
    const cur = new Date(pendingStart.dateStr + 'T00:00:00');
    const end = new Date(dateStr + 'T00:00:00');
    let hasConflict = false;

    while (cur < end) {
      const curStr = formatDateISO(cur);
      if (isRoomOccupied(room.id, curStr)) {
        hasConflict = true;
        break;
      }
      cur.setDate(cur.getDate() + 1);
    }

    if (hasConflict) {
      setPendingStart({ roomId: room.id, roomName: room.name, dateStr });
      setCheckinDate(dateStr);
      return;
    }

    setCheckinDate(pendingStart.dateStr);
    setCheckoutDate(dateStr);
    handleOpenBookingDrawer(room, pendingStart.dateStr, dateStr);
    setPendingStart(null);
  };

  // Top row date header click (1st click checkin, 2nd click checkout)
  const handleTopRowDateClick = (dateStr: string, past: boolean) => {
    if (past) return;

    if (!checkinDate || (checkinDate && checkoutDate) || dateStr <= checkinDate) {
      setCheckinDate(dateStr);
      setCheckoutDate('');
      setPendingStart(null);
    } else {
      setCheckoutDate(dateStr);
      setPendingStart(null);
    }
  };

  // Submit direct reservation
  const handleConfirmReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingDrawerRoom || !property) return;
    if (!phone.trim()) {
      setFormError('Please enter your phone number.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=create_public_booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: property.id,
          room_id: bookingDrawerRoom.roomId,
          guest_name: guestName.trim() || 'Guest',
          phone: phone.trim(),
          email: email.trim(),
          checkin_date: bookingDrawerRoom.checkin,
          checkout_date: bookingDrawerRoom.checkout,
          num_guests: numGuests,
          special_requests: specialRequests.trim(),
          payment_method: 'Payment requested',
        }),
      });

      const json = await res.json();
      if (json && json.status === 'success' && json.data) {
        setConfirmation(json.data);
        setBookingDrawerRoom(null);
        fetchPublicData();
      } else {
        setFormError(json?.message || 'Failed to complete reservation. Please try again.');
      }
    } catch (err: any) {
      setFormError(err.message || 'Network error completing reservation');
    } finally {
      setSubmitting(false);
    }
  };

  // Shared between quote mode and the normal browse-and-book flow below, so
  // both end at the exact same success screen (and its already-fixed WhatsApp
  // share button) rather than maintaining two copies.
  const confirmationModal = confirmation && (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4 animate-scale-up">
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h3 className="text-base font-black text-gray-900 dark:text-white">Reservation Submitted!</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            We've held your room and notified the property manager for confirmation.
          </p>
          <div className="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs font-mono font-bold text-gray-800 dark:text-gray-200">
            Ref: {confirmation.reference_number}
          </div>
        </div>

        {/* Voucher Details */}
        <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-4 border border-gray-200 dark:border-gray-700 space-y-2.5 text-xs">
          <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-2">
            <span className="text-gray-500">Property</span>
            <span className="font-bold text-gray-900 dark:text-white">{confirmation.property_name}</span>
          </div>
          <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-2">
            <span className="text-gray-500">Room</span>
            <span className="font-bold text-blue-600 dark:text-blue-400">{confirmation.room_name}</span>
          </div>
          <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-2">
            <span className="text-gray-500">Dates</span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {formatDateDisplay(confirmation.checkin_date)} → {formatDateDisplay(confirmation.checkout_date)} ({confirmation.nights}N)
            </span>
          </div>
          <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-2">
            <span className="text-gray-500">Total Tariff</span>
            <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
              {currencySym}{confirmation.total_tariff.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-2">
            <span className="text-gray-500">Payment Status</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-2xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
              <AlertCircle className="w-3 h-3" />
              Payment requested
            </span>
          </div>
          {confirmation.address && (
            <div className="flex justify-between items-start pt-1">
              <span className="text-gray-500 shrink-0">Address</span>
              <span className="text-right text-gray-800 dark:text-gray-200">{confirmation.address}</span>
            </div>
          )}
        </div>

        {/* Actions - always 2 columns (not stacked on mobile), WhatsApp button
            matching the site-wide "Share via WhatsApp" convention (emerald,
            plain wa.me link) instead of the generic blue primary Button - see
            WalkInTabBillModal.tsx for the same pattern. */}
        <div className="grid grid-cols-2 gap-2.5">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`🏨 Booking Confirmation (${confirmation.property_name})\nRef: ${confirmation.reference_number}\nRoom: ${confirmation.room_name}\nDates: ${formatDateDisplay(confirmation.checkin_date)} to ${formatDateDisplay(confirmation.checkout_date)}\nTotal: ${currencySym}${confirmation.total_tariff}\nGuest: ${confirmation.guest_name}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-2 rounded-lg flex items-center justify-center h-10 cursor-pointer text-center"
          >
            Share on WhatsApp
          </a>
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              setConfirmation(null);
              setBookingDrawerRoom(null);
              if (quoteToken) {
                setQuoteState('converted');
              }
            }}
            className="h-10 text-xs font-semibold justify-center"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );

  // QUOTE MODE - entirely separate render branch, before any of the normal
  // browse-mode loading/error/property checks below (none of which apply -
  // quote mode never calls fetchPublicData() at all).
  if (quoteToken) {
    if (quoteState === 'loading') {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin dark:text-blue-400 mb-3" />
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Loading your quote...</p>
        </div>
      );
    }

    if (quoteState !== 'ready') {
      if (quoteState === 'converted') {
        const booking = convertedBooking || confirmation;
        return (
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 flex flex-col items-center">
            <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="bg-emerald-600 text-white p-5 text-center space-y-1.5">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-base sm:text-lg font-black tracking-tight">Reservation Confirmed & Dates Locked!</h2>
                <p className="text-xs text-emerald-100">
                  Your reservation is registered in our management system.
                </p>
                {booking?.reference_number && (
                  <div className="inline-block mt-1 px-3 py-1 bg-black/20 rounded-lg text-xs font-mono font-bold text-white">
                    Ref: {booking.reference_number}
                  </div>
                )}
              </div>

              <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Status: Payment Pending Verification</span>
                  <span className="text-2xs text-amber-700 dark:text-amber-300">
                    Your payment screenshot has been uploaded. Property staff will verify the transaction and confirm your booking.
                  </span>
                </div>
              </div>

              <div className="p-5 space-y-3 text-xs">
                <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-2">
                  <span className="text-gray-500 dark:text-gray-400">Property</span>
                  <span className="font-bold text-gray-900 dark:text-white text-right">
                    {booking?.property_name || quoteHold?.property_name}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-2">
                  <span className="text-gray-500 dark:text-gray-400">Room</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400 text-right">
                    {booking?.room_name || quoteHold?.room_name}
                  </span>
                </div>
                {(booking?.guest_name || quoteGuestName) && (
                  <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-2">
                    <span className="text-gray-500 dark:text-gray-400">Guest</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {booking?.guest_name || quoteGuestName} {booking?.phone || quotePhone ? `(${booking?.phone || quotePhone})` : ''}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-2">
                  <span className="text-gray-500 dark:text-gray-400">Dates</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {formatDateDisplay(booking?.checkin_date || quoteHold?.checkin_date || '')} → {formatDateDisplay(booking?.checkout_date || quoteHold?.checkout_date || '')} ({booking?.nights || quoteHold?.nights}N)
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-2">
                  <span className="text-gray-500 dark:text-gray-400">Total Payable</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                    {currencySym}{(booking?.total_tariff || quoteHold?.total_tariff || 0).toLocaleString('en-IN')}
                  </span>
                </div>

                {(booking?.payment_proof_url || paymentScreenshotPreview) && (
                  <div className="pt-2">
                    <span className="text-2xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1.5">
                      Uploaded Payment Proof
                    </span>
                    <a
                      href={booking?.payment_proof_url ? `${API_ROOT_BASE}${booking.payment_proof_url}` : paymentScreenshotPreview}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2.5 p-2 bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 transition-colors"
                    >
                      <img
                        src={booking?.payment_proof_url ? `${API_ROOT_BASE}${booking.payment_proof_url}` : paymentScreenshotPreview}
                        alt="Payment Proof"
                        className="w-12 h-12 object-cover rounded border border-gray-200 dark:border-gray-600"
                      />
                      <div className="text-left">
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 block">
                          View Screenshot Proof
                        </span>
                        <span className="text-3xs text-gray-400 block">Click to open full size</span>
                      </div>
                    </a>
                  </div>
                )}

                {(booking?.address || quoteHold?.address) && (
                  <div className="pt-1 text-2xs text-gray-500 dark:text-gray-400">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Property Address:</span> {booking?.address || quoteHold?.address}
                  </div>
                )}
              </div>

              <div className="p-5 bg-gray-50 dark:bg-gray-750 border-t border-gray-200 dark:border-gray-700 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`🏨 Booking Confirmation (${booking?.property_name || quoteHold?.property_name})\nRef: ${booking?.reference_number}\nRoom: ${booking?.room_name || quoteHold?.room_name}\nDates: ${formatDateDisplay(booking?.checkin_date || '')} to ${formatDateDisplay(booking?.checkout_date || '')}\nTotal: ${currencySym}${booking?.total_tariff}\nGuest: ${booking?.guest_name || quoteGuestName}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-2 rounded-lg flex items-center justify-center h-10 cursor-pointer text-center"
                >
                  Share on WhatsApp
                </a>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => window.print()}
                  className="h-10 text-xs font-semibold justify-center"
                >
                  Print Voucher
                </Button>
              </div>

              <div className="p-3 bg-gray-100 dark:bg-gray-850 text-center text-3xs text-gray-500 dark:text-gray-400">
                🔒 This quote has been finalized. The booking form is closed for this quote.
              </div>
            </div>
            {confirmationModal}
          </div>
        );
      }

      const copy: Record<string, { title: string; body: string }> = {
        expired: {
          title: 'This Quote Has Expired',
          body: 'The hold on this room has passed its time limit. Please contact the property for a new quote.',
        },
        converted: {
          title: 'Already Booked',
          body: 'This quote has already been confirmed into a reservation.',
        },
        cancelled: {
          title: 'Quote Cancelled',
          body: 'This quote is no longer active - the property may have sent you an updated one. Please check for a newer message, or contact them directly.',
        },
        notfound: {
          title: 'Quote Not Found',
          body: 'This link looks incomplete or incorrect. Please ask the property to resend it.',
        },
        error: {
          title: 'Something Went Wrong',
          body: 'We could not load this quote right now. Please try again in a moment.',
        },
      };
      const { title, body } = copy[quoteState] || copy.error;
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4 text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mb-3" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{title}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">{body}</p>
        </div>
      );
    }

    const quote = quoteHold!;
    // Hold duration is host-chosen (up to MAX_BOOKING_HOLD_HOURS, see
    // booking_holds.php) so this can run well past 99 minutes - fall back to
    // an H:MM:SS display once it does, rather than a MM:SS format that would
    // silently wrap/truncate.
    const hrs = Math.floor(quoteSecondsLeft / 3600);
    const mins = Math.floor((quoteSecondsLeft % 3600) / 60);
    const secs = quoteSecondsLeft % 60;
    const countdownDisplay = hrs > 0
      ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-5 sm:p-6 space-y-4">
          <div className="text-center space-y-1">
            <Badge variant="warning">Room Held For You</Badge>
            <h2 className="text-lg font-black text-gray-900 dark:text-white">Your Instant Quote</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{quote.property_name}</p>
          </div>

          {/* Countdown */}
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-center">
            <p className="text-2xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Confirm Within</p>
            <p className="text-2xl font-black font-mono text-amber-800 dark:text-amber-300 tabular-nums">
              {countdownDisplay}
            </p>
          </div>

          {/* Stay Summary */}
          <div className="bg-blue-50/60 dark:bg-blue-950/40 rounded-lg p-4 border border-blue-200 dark:border-blue-800/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-900 dark:text-blue-200">{quote.room_name}</span>
              <Badge variant="info">{quote.nights} Night{(quote.nights || 0) > 1 ? 's' : ''}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-2xs text-gray-500 dark:text-gray-400 block">Check-in</span>
                <span className="font-semibold text-gray-900 dark:text-white">{formatDateDisplay(quote.checkin_date || '')}</span>
                <span className="text-3xs text-gray-400 block">From {quote.checkin_time}</span>
              </div>
              <div>
                <span className="text-2xs text-gray-500 dark:text-gray-400 block">Check-out</span>
                <span className="font-semibold text-gray-900 dark:text-white">{formatDateDisplay(quote.checkout_date || '')}</span>
                <span className="text-3xs text-gray-400 block">Until {quote.checkout_time}</span>
              </div>
            </div>
            <div className="pt-2 border-t border-blue-200/60 dark:border-blue-800/60 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Total Payable:</span>
              <span className="text-base font-black text-blue-700 dark:text-blue-300">
                {currencySym}{(quote.total_tariff || 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Guest Details Form */}
          <form onSubmit={handleConfirmQuoteBooking} className="space-y-3.5">
            {quoteFormError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{quoteFormError}</span>
              </div>
            )}

            <FloatingInput
              type="text"
              label="Full Name (Optional)"
              placeholder=" "
              value={quoteGuestName}
              onChange={(e) => setQuoteGuestName(e.target.value)}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FloatingInput
                type="tel"
                required
                label="Phone / WhatsApp *"
                placeholder=" "
                value={quotePhone}
                onChange={(e) => setQuotePhone(e.target.value)}
              />
              <FloatingInput
                type="email"
                label="Email Address (Optional)"
                placeholder=" "
                value={quoteEmail}
                onChange={(e) => setQuoteEmail(e.target.value)}
              />
            </div>
            <FloatingSelect
              label="Number of Guests"
              value={quoteNumGuests}
              onChange={(e) => setQuoteNumGuests(Number(e.target.value))}
              options={[
                { value: 1, label: '1 Guest' },
                { value: 2, label: '2 Guests' },
                { value: 3, label: '3 Guests' },
                { value: 4, label: '4 Guests' },
                { value: 5, label: '5+ Guests' },
              ]}
            />
            <div>
              <label className="block text-2xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Special Requests / Expected Arrival Time
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Arriving around 3 PM, extra towels"
                value={quoteSpecialRequests}
                onChange={(e) => setQuoteSpecialRequests(e.target.value)}
                className="w-full p-3 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* UPI Payment Card with QR Code and 1-Click Copy */}
            <div className="bg-gradient-to-br from-blue-50/90 to-indigo-50/90 dark:from-gray-800 dark:to-gray-800/90 rounded-xl p-4 border border-blue-200 dark:border-blue-900/60 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                    UPI
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white">Pay via UPI / QR</h4>
                    <p className="text-2xs text-gray-500 dark:text-gray-400">Scan QR or copy UPI ID to transfer</p>
                  </div>
                </div>
                <span className="text-xs font-black text-blue-700 dark:text-blue-300">
                  {currencySym}{(quote.total_tariff || 0).toLocaleString('en-IN')}
                </span>
              </div>

              {/* QR Code + UPI ID Display */}
              <div className="flex flex-col sm:flex-row items-center gap-4 bg-white dark:bg-gray-750 p-3.5 rounded-lg border border-blue-100 dark:border-gray-700">
                <div className="bg-white p-2 rounded-lg border border-gray-200 dark:border-gray-600 shadow-2xs shrink-0 flex items-center justify-center">
                  {quote.upi_qr_code_url ? (
                    <img
                      src={quote.upi_qr_code_url}
                      alt="UPI QR Code"
                      className="w-32 h-32 object-contain"
                    />
                  ) : (
                    <QRCodeSVG
                      value={buildUpiPaymentLink({
                        upiId: quote.upi_id || 'tarpan.a.patel@gmail',
                        payeeName: quote.property_name || 'Ground Code Resort',
                        amount: quote.total_tariff,
                        note: `Booking ${quote.room_name || ''}`.trim(),
                      })}
                      size={128}
                      level="M"
                    />
                  )}
                </div>

                <div className="flex-1 w-full space-y-2 text-center sm:text-left">
                  <div className="space-y-0.5">
                    <span className="text-2xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                      Property UPI ID
                    </span>
                    <div className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700/60 rounded-md border border-gray-200 dark:border-gray-600 font-mono text-xs font-bold text-gray-900 dark:text-white max-w-full break-all">
                      <span>{quote.upi_id || 'tarpan.a.patel@gmail'}</span>
                    </div>
                  </div>

                  <div>
                    <Button
                      type="button"
                      variant={copiedUpi ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => handleCopyUpi(quote.upi_id || 'tarpan.a.patel@gmail')}
                      className="w-full sm:w-auto h-8 text-xs font-semibold gap-1.5 justify-center"
                    >
                      {copiedUpi ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy UPI ID</span>
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-3xs text-gray-400 dark:text-gray-500">
                    Open GPay, PhonePe, Paytm, or your banking app and transfer the amount.
                  </p>
                </div>
              </div>

              {/* Payment Screenshot Upload Section */}
              <div className="space-y-2 pt-1 border-t border-blue-200/50 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Upload Payment Screenshot *</span>
                  </label>
                  <span className="text-3xs font-semibold text-rose-500 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-800">
                    Required to Confirm
                  </span>
                </div>

                {paymentScreenshotPreview ? (
                  <div className="flex items-center justify-between p-2.5 bg-white dark:bg-gray-750 border border-emerald-300 dark:border-emerald-700/60 rounded-lg">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={paymentScreenshotPreview}
                        alt="Payment proof preview"
                        className="w-12 h-12 rounded object-cover border border-gray-200 dark:border-gray-600 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                          {paymentScreenshotFile?.name || 'payment_screenshot.jpg'}
                        </p>
                        <p className="text-2xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          Ready ({Math.round((paymentScreenshotBase64.length * 0.75) / 1024)} KB)
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveScreenshot}
                      className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs shrink-0"
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-blue-300 dark:border-blue-800 hover:border-blue-500 dark:hover:border-blue-600 bg-white/70 dark:bg-gray-750/70 rounded-lg cursor-pointer transition-colors group">
                    <Upload className="w-6 h-6 text-blue-500 dark:text-blue-400 mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                      Choose or Capture Screenshot
                    </span>
                    <span className="text-3xs text-gray-400 dark:text-gray-500 mt-0.5">
                      PNG, JPG, or WebP photo of transfer receipt
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleScreenshotChange}
                    />
                  </label>
                )}

                {paymentScreenshotError && (
                  <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{paymentScreenshotError}</span>
                  </p>
                )}
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={quoteSubmitting || !paymentScreenshotBase64}
              className="w-full h-11 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed justify-center"
            >
              {quoteSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                  Locking Room & Confirming...
                </>
              ) : (
                <>
                  Confirm Booking ({currencySym}{(quote.total_tariff || 0).toLocaleString('en-IN')})
                  <ArrowRight className="w-4 h-4 ms-1.5" />
                </>
              )}
            </Button>

            {!paymentScreenshotBase64 && (
              <p className="text-2xs text-center text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>Upload payment screenshot to enable the Confirm Booking button.</span>
              </p>
            )}
          </form>
        </div>

        {confirmationModal}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin dark:text-blue-400 mb-3" />
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Checking live availability & rates...</p>
      </div>
    );
  }

  if (fetchError || !property) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4 text-center">
        <Building className="w-12 h-12 text-gray-400 mb-3" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Property Unavailable</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mb-4">{fetchError || 'Unable to load room availability.'}</p>
        <Button variant="primary" size="sm" onClick={() => fetchPublicData()}>Retry</Button>
      </div>
    );
  }

  const displayedRooms = filterRoomId === 'all' ? rooms : rooms.filter((r) => r.id === filterRoomId);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col font-sans">
      {/* Top Header / Property Banner */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-xs shrink-0">
              {property.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white tracking-tight leading-tight truncate">
                {property.name}
              </h1>
              <p className="text-2xs sm:text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                <Sparkles className="w-3 h-3 shrink-0" />
                Live Availability & Direct Rates · 0% Commission
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {property.phone && (
              <a
                href={`tel:${property.phone}`}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <Phone className="w-3.5 h-3.5 text-blue-600" />
                {property.phone}
              </a>
            )}
            <Badge variant="info">Direct Host Booking</Badge>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Date Range Selection & Filter Toolbar */}
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs w-full lg:w-auto">
              <div className="w-full sm:w-auto min-w-[280px]">
                <DateRangePicker
                  checkinDate={checkinDate}
                  checkoutDate={checkoutDate}
                  onCheckinChange={(d) => {
                    setCheckinDate(d);
                    if (checkoutDate && d >= checkoutDate) {
                      const next = new Date(d + 'T00:00:00');
                      next.setDate(next.getDate() + 1);
                      setCheckoutDate(formatDateISO(next));
                    }
                  }}
                  onCheckoutChange={(d) => {
                    setCheckoutDate(d);
                  }}
                  disablePastDates
                  fromPlaceholder="Check-in date"
                  toPlaceholder="Check-out date"
                />
              </div>

              {rooms.length > 1 && (
                <Dropdown
                  label=""
                  dismissOnClick
                  renderTrigger={() => (
                    <button
                      type="button"
                      className="h-10 inline-flex items-center justify-between gap-2 px-3 text-xs font-semibold text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:hover:bg-gray-700 cursor-pointer shadow-xs min-w-[140px]"
                    >
                      <span className="truncate">
                        {filterRoomId === 'all'
                          ? `All Rooms (${rooms.length})`
                          : rooms.find((r) => r.id === filterRoomId)?.name || 'Select Room'}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    </button>
                  )}
                >
                  <DropdownItem
                    onClick={() => setFilterRoomId('all')}
                    className={filterRoomId === 'all' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-semibold' : ''}
                  >
                    All Rooms ({rooms.length})
                  </DropdownItem>
                  {rooms.map((r) => (
                    <DropdownItem
                      key={r.id}
                      onClick={() => setFilterRoomId(r.id)}
                      className={filterRoomId === r.id ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-semibold' : ''}
                    >
                      {r.name}
                    </DropdownItem>
                  ))}
                </Dropdown>
              )}

              {(checkinDate || checkoutDate) && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setCheckinDate('');
                    setCheckoutDate('');
                    setPendingStart(null);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 font-medium px-2"
                >
                  Clear dates
                </Button>
              )}
            </div>

            {/* Availability Legend (Available & Booked only, No Past Legend) */}
            <div className="flex items-center gap-4 text-xs font-medium text-gray-600 dark:text-gray-300">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e] inline-block border border-green-600" />
                <span>Available</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] inline-block border border-red-600" />
                <span>Booked / Closed</span>
              </div>
            </div>
          </div>

          {/* REAL-TIME AVAILABLE ROOM CARDS SECTION (Horizontal Space-Saving Layout per DESIGN.md) */}
          {checkinDate && checkoutDate && checkinDate < checkoutDate && (
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Available Options for {formatDateDisplay(checkinDate)} → {formatDateDisplay(checkoutDate)}
                </h3>
                <Badge variant="success">
                  {availableRoomResults.length} {availableRoomResults.length === 1 ? 'room' : 'rooms'} available
                </Badge>
              </div>

              {availableRoomResults.length === 0 ? (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="font-semibold">No rooms available for the selected dates</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {availableRoomResults.map(({ room, nights, totalTariff }) => (
                    <div
                      key={room.id}
                      className="p-3.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-200 dark:border-blue-800">
                          <Building className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                              {room.name}
                            </h4>
                            <Badge variant="info">{nights} Night{nights > 1 ? 's' : ''}</Badge>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {formatDateDisplay(checkinDate)} → {formatDateDisplay(checkoutDate)}
                          </p>

                          {/* Listing content (6 Sep 2026). Each block renders only
                              when the room actually has that field, so a property
                              with nothing imported looks exactly as it did before. */}
                          {(() => {
                            const facts = buildRoomFacts(room);
                            return facts ? (
                              <p className="mt-1 text-xs font-medium text-gray-600 dark:text-gray-300">{facts}</p>
                            ) : null;
                          })()}

                          {room.description ? (
                            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                              {room.description}
                            </p>
                          ) : null}

                          {(() => {
                            const amenities = parseJsonArray(room.amenities).filter(
                              (a): a is string => typeof a === 'string'
                            );
                            if (!amenities.length) return null;
                            const shown = amenities.slice(0, 6);
                            const rest = amenities.length - shown.length;
                            return (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {shown.map((a) => (
                                  <span
                                    key={a}
                                    className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-2xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                  >
                                    {humanizeKey(a)}
                                  </span>
                                ))}
                                {rest > 0 ? (
                                  <span className="px-1 py-0.5 text-2xs font-medium text-gray-400 dark:text-gray-500">
                                    +{rest} more
                                  </span>
                                ) : null}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-gray-700 shrink-0">
                        <div className="text-left sm:text-right">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 block">Total Stay</span>
                          <span className="text-base font-black text-emerald-600 dark:text-emerald-400 block">
                            {currencySym}{totalTariff.toLocaleString('en-IN')} <span className="text-2xs font-semibold text-gray-400 dark:text-gray-400">for {nights} Night{nights > 1 ? 's' : ''}</span>
                          </span>
                        </div>

                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleOpenBookingDrawer(room, checkinDate, checkoutDate)}
                          className="h-9 text-xs font-semibold px-4 shrink-0"
                        >
                          Book Now
                          <ArrowRight className="w-3.5 h-3.5 ms-1.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* CALENDAR SECTION */}
        <section className="space-y-4">
          {/* Month Navigation Header with Flowbite Buttons per DESIGN.md */}
          <div className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-2.5 rounded-lg shadow-sm">
            <Button
              variant="secondary"
              size="xs"
              onClick={handlePrevMonth}
              disabled={isAtCurrentMonth}
              leftIcon={<ChevronLeft className="w-4 h-4" />}
              className="h-8 text-xs font-semibold"
            >
              Previous
            </Button>

            <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
              {monthInfo.monthName}
            </h2>

            <Button
              variant="secondary"
              size="xs"
              onClick={handleNextMonth}
              rightIcon={<ChevronRight className="w-4 h-4" />}
              className="h-8 text-xs font-semibold"
            >
              Next
            </Button>
          </div>

          {/* MULTI-KEY TABLE VIEW (Matches availability.php Layout) */}
          {displayedRooms.length > 1 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                <table
                  className="w-full border-collapse text-center text-xs"
                  style={{ minWidth: `${Math.max(600, 150 + tableDays.length * 34)}px` }}
                >
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400">
                      <th className="sticky left-0 z-20 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-left font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider text-2xs min-w-[150px] border-r border-gray-200 dark:border-gray-700 shadow-xs">
                        Room
                      </th>
                      {tableDays.map((d) => {
                        const dStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                        const dayDate = new Date(selectedYear, selectedMonth - 1, d);
                        const dayInitial = dayDate.toLocaleDateString('default', { weekday: 'narrow' });
                        const isToday = dStr === todayStr;
                        const isPast = dStr < todayStr;
                        const isSelected = checkinDate && checkoutDate && dStr >= checkinDate && dStr < checkoutDate;
                        const isStart = dStr === checkinDate;
                        const isEnd = dStr === checkoutDate;

                        return (
                          <th
                            key={d}
                            onClick={() => handleTopRowDateClick(dStr, isPast)}
                            title={isPast ? 'Past date' : `Click to select ${dStr}`}
                            className={`p-1.5 font-semibold text-2xs border-r border-gray-200 dark:border-gray-700 min-w-[34px] select-none transition-colors ${
                              isPast
                                ? 'opacity-40 cursor-not-allowed bg-gray-100/50 dark:bg-gray-900/50 text-gray-400 dark:text-gray-600'
                                : isStart || isSelected
                                ? 'bg-blue-600 text-white font-bold cursor-pointer'
                                : isEnd
                                ? 'bg-blue-500 text-white font-bold cursor-pointer'
                                : isToday
                                ? 'bg-blue-100/70 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-900/60'
                                : 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-600 dark:hover:text-blue-300'
                            }`}
                          >
                            <div className="text-3xs opacity-80">{dayInitial}</div>
                            <div className="font-bold text-xs">{d}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {displayedRooms.map((room) => {
                      return (
                        <tr key={room.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                          <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-3 py-2 text-left font-bold text-gray-900 dark:text-white text-xs border-r border-gray-200 dark:border-gray-700 shadow-xs">
                            <div className="truncate max-w-[140px]">{room.name}</div>
                          </td>

                          {tableDays.map((d) => {
                            const dStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                            const isPast = dStr < todayStr;
                            const occupied = isRoomOccupied(room.id, dStr);
                            const rate = getRoomDailyPrice(room, dStr);
                            const isSelected = checkinDate && checkoutDate && dStr >= checkinDate && dStr < checkoutDate;
                            const isPendingStart = pendingStart?.roomId === room.id && pendingStart?.dateStr === dStr;

                            // Dynamic restriction badges
                            const roomRestrictions = dailyRestrictionsMap[room.id] || {};
                            const dayRest = roomRestrictions[dStr];

                            return (
                              <td
                                key={dStr}
                                onClick={() => handleCellClick(room, dStr, occupied, isPast)}
                                className={`p-1 h-12 border-r border-gray-200 dark:border-gray-800 text-center transition-all ${
                                  isPast
                                    ? 'bg-gray-100/50 dark:bg-gray-900/50 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                                    : occupied
                                    ? 'bg-[#fef2f2] dark:bg-red-950/20 text-[#b91c1c] dark:text-red-400 cursor-not-allowed'
                                    : isPendingStart || isSelected
                                    ? 'bg-blue-600 text-white cursor-pointer ring-1 ring-blue-600 font-bold'
                                    : 'bg-[#f0fdf4] dark:bg-emerald-950/20 text-[#15803d] dark:text-emerald-400 hover:bg-[#dcfce7] dark:hover:bg-emerald-900/40 cursor-pointer font-bold'
                                }`}
                              >
                                {isPast ? (
                                  <span className="text-2xs opacity-40">-</span>
                                ) : occupied ? (
                                  <span className="text-2xs opacity-0">-</span>
                                ) : (
                                  <div className="flex flex-col items-center justify-center">
                                    {rate > 0 && (
                                      <span className={`text-2xs font-bold leading-none ${isPendingStart || isSelected ? 'text-white' : ''}`}>
                                        {rate.toLocaleString('en-IN')}
                                      </span>
                                    )}
                                    {dayRest?.closed_to_arrival && (
                                      <span className="text-3xs bg-red-100 text-red-700 px-1 rounded-xs mt-0.5">CTA</span>
                                    )}
                                    {dayRest?.min_stay_arrival > 1 && (
                                      <span className="text-3xs bg-amber-100 text-amber-700 px-1 rounded-xs mt-0.5">
                                        {dayRest.min_stay_arrival}N
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* SINGLE-KEY / SINGLE-ROOM 7-DAY GRID (Matches availability.php Single Grid) */
            displayedRooms.map((room) => {
              return (
                <div key={room.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                  <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 text-center">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dw) => (
                      <div key={dw} className="bg-gray-50 dark:bg-gray-800 py-2 text-2xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                        {dw}
                      </div>
                    ))}

                    {/* Prepend empty cells for the first day of week */}
                    {Array.from({ length: monthInfo.firstDayOfWeek }, (_, idx) => (
                      <div key={`empty-${idx}`} className="bg-gray-50/50 dark:bg-gray-800/40 min-h-[4.5rem] opacity-30" />
                    ))}

                    {/* Days of Month */}
                    {Array.from({ length: monthInfo.daysInMonth }, (_, i) => i + 1).map((d) => {
                      const dStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                      const isPast = dStr < todayStr;
                      const occupied = isRoomOccupied(room.id, dStr);
                      const rate = getRoomDailyPrice(room, dStr);
                      const isToday = dStr === todayStr;
                      const isSelected = checkinDate && checkoutDate && dStr >= checkinDate && dStr < checkoutDate;
                      const isPendingStart = pendingStart?.roomId === room.id && pendingStart?.dateStr === dStr;

                      return (
                        <div
                          key={dStr}
                          onClick={() => handleCellClick(room, dStr, occupied, isPast)}
                          className={`bg-white dark:bg-gray-800 p-2 min-h-[4.5rem] flex flex-col justify-between transition-all ${
                            isPast
                              ? 'bg-gray-50 dark:bg-gray-800/40 opacity-40 cursor-not-allowed'
                              : occupied
                              ? 'bg-[#fef2f2] dark:bg-red-950/20 text-[#b91c1c] dark:text-red-400 cursor-not-allowed'
                              : isPendingStart || isSelected
                              ? 'bg-blue-600 text-white cursor-pointer ring-2 ring-blue-600'
                              : 'bg-[#f0fdf4] dark:bg-emerald-950/20 hover:bg-[#dcfce7] dark:hover:bg-emerald-900/40 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${isToday ? 'text-blue-600 dark:text-blue-400 font-extrabold' : ''}`}>
                              {d}
                            </span>
                            {isToday && (
                              <span className="text-3xs uppercase font-bold text-blue-600 dark:text-blue-400">Today</span>
                            )}
                          </div>

                          {!isPast && !occupied && (
                            <div className="mt-auto text-right">
                              {rate > 0 && (
                                <span className={`text-xs font-bold block ${isPendingStart || isSelected ? 'text-white' : 'text-emerald-700 dark:text-emerald-300'}`}>
                                  {rate.toLocaleString('en-IN')}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </section>
      </main>

      {/* SLIDE-OVER BOOKING DRAWER */}
      {bookingDrawerRoom && (
        <div
          className="fixed inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-xs flex justify-end animate-fade-in"
          onClick={() => setBookingDrawerRoom(null)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-gray-800 h-full shadow-2xl flex flex-col justify-between border-l border-gray-200 dark:border-gray-700 animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50/50 dark:bg-gray-750">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Complete Your Booking</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{property.name}</p>
              </div>
              <button
                onClick={() => setBookingDrawerRoom(null)}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form with Scrollable Body & Fixed Footer */}
            <form onSubmit={handleConfirmReservation} className="flex-1 flex flex-col justify-between overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                {formError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Stay Summary Card */}
                <div className="bg-blue-50/60 dark:bg-blue-950/40 rounded-lg p-4 border border-blue-200 dark:border-blue-800/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-900 dark:text-blue-200">{bookingDrawerRoom.roomName}</span>
                    <Badge variant="info">{bookingDrawerRoom.nights} Night{bookingDrawerRoom.nights > 1 ? 's' : ''}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-2xs text-gray-500 dark:text-gray-400 block">Check-in</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatDateDisplay(bookingDrawerRoom.checkin)}
                      </span>
                      <span className="text-3xs text-gray-400 block">From {property.checkin_time}</span>
                    </div>
                    <div>
                      <span className="text-2xs text-gray-500 dark:text-gray-400 block">Check-out</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatDateDisplay(bookingDrawerRoom.checkout)}
                      </span>
                      <span className="text-3xs text-gray-400 block">Until {property.checkout_time}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-blue-200/60 dark:border-blue-800/60 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Total Payable:</span>
                    <span className="text-base font-black text-blue-700 dark:text-blue-300">
                      {currencySym}{bookingDrawerRoom.totalTariff.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Guest Details */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                    Guest Information
                  </h4>

                  <FloatingInput
                    type="text"
                    label="Full Name (Optional)"
                    placeholder=" "
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FloatingInput
                      type="tel"
                      required
                      label="Phone / WhatsApp *"
                      placeholder=" "
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                    <FloatingInput
                      type="email"
                      label="Email Address (Optional)"
                      placeholder=" "
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <FloatingSelect
                    label="Number of Guests"
                    value={numGuests}
                    onChange={(e) => setNumGuests(Number(e.target.value))}
                    // Was a hardcoded 1-5 list, which both let a 2-person studio
                    // be booked for "5+ Guests" and stopped a 6-person villa from
                    // taking 6. Now derived from the room's own capacity; a room
                    // that has never had one set keeps the old 1-5 range. The old
                    // "5+" label was also wrong for pricing - extra-guest charges
                    // compute off this exact number, so it has to mean 5, not "5
                    // or more". 6 Sep 2026.
                    options={Array.from(
                      { length: Math.max(1, Number(bookingDrawerRoom.maxCapacity) || 5) },
                      (_, i) => ({ value: i + 1, label: `${i + 1} Guest${i > 0 ? 's' : ''}` })
                    )}
                  />

                  <div>
                    <label className="block text-2xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Special Requests / Expected Arrival Time
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Arriving around 3 PM, extra towels"
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                      className="w-full p-3 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Payment Method */}
                <div className="space-y-2.5 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                    Payment Method
                  </h4>

                  <div className="p-3.5 rounded-lg border border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-gray-900 dark:text-white">
                        Payment requested
                      </p>
                      <p className="text-2xs text-gray-600 dark:text-gray-400">
                        No advance payment needed right now. Your booking request will be reviewed and confirmed by the host.
                      </p>
                      {property.upi_id && (
                        <p className="text-2xs text-emerald-700 dark:text-emerald-300 font-medium pt-1">
                          💡 Advance UPI: <span className="font-mono font-bold">{property.upi_id}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Fixed Bottom Drawer Footer with Safe Area Support per DESIGN.md */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-end gap-2 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] shrink-0">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setBookingDrawerRoom(null)}
                  className="h-10 text-xs font-semibold px-4"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={submitting}
                  className="h-10 text-xs font-bold px-5"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 me-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      Submit Reservation ({currencySym}{bookingDrawerRoom.totalTariff.toLocaleString('en-IN')})
                      <ArrowRight className="w-4 h-4 ms-1.5" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmationModal}
    </div>
  );
};
