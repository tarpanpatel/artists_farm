import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
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
  Calendar,
  Users,
  Wifi,
  Snowflake,
  Tv,
  Bath,
  ShowerHead,
  Bed,
  BedDouble,
  Coffee,
  Utensils,
  ChefHat,
  WashingMachine,
  Refrigerator,
  Microwave,
  Fan,
  Car,
  ParkingCircle,
  Dumbbell,
  Waves,
  Flame,
  Droplet,
  Plug,
  Speaker,
  Sofa,
  Shirt,
  Toilet,
  Umbrella,
  Leaf,
  Lightbulb,
  Laptop,
  Monitor,
  Gamepad2,
  BookOpen,
  Camera,
  Wind,
  Clock,
  Home,
  Info,
  Package,
  KeyRound,
  ShieldCheck,
  Music,
  Sun,
  Armchair,
} from './icons/FlowbiteIcons';
import { StyledSelect } from './StyledSelect';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from './Button';
import { Badge } from './Badge';
import { DateRangePicker } from './DateRangePicker';
import { FloatingInput } from './FloatingInput';
import { FloatingSelect } from './FloatingSelect';
import { buildUpiPaymentLink } from '../utils/upiQrCode';
import { humanizeKey } from '../utils/humanizeKey';
import { normalizeAmenityList } from '../utils/amenityCatalog';
import { DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, renderWhatsappVoucherTemplate } from '../utils/whatsappVoucherTemplate';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
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
 * Amenity key -> Flowbite icon (7 Sep 2026). Amenity keys arrive from Airbnb in
 * SCREAMING_SNAKE_CASE ("WIRELESS_INTERNET", "AIR_CONDITIONING") and the list is
 * open-ended, so this matches on SUBSTRINGS of the normalised key rather than
 * trying to enumerate every value Airbnb might send - "POOL", "PRIVATE_POOL" and
 * "SHARED_POOL" all want the same icon and none of them is worth its own entry.
 *
 * Order matters: the first match wins, so the more specific term goes above the
 * more general one it contains ("HAIR_DRYER" before "DRYER", "BEACH" before
 * "BED"). Anything unmatched falls back to a neutral check icon - never nothing,
 * so the list stays visually even.
 *
 * Flowbite icons only, per DESIGN.md's standing rule. Every name here is
 * verified to exist in ./icons/FlowbiteIcons - a missing export is a build
 * error, not a silently blank cell.
 */
const AMENITY_ICON_EXACT: Record<string, React.FC<{ className?: string }>> = {
  // Keys too short to be safe as substrings. "AC" is a real Airbnb key and is a
  // substring of TERRACE, ACCESS, BACKUP and plenty more, so it can only ever be
  // matched exactly - which is also why this table is consulted first.
  AC: Snowflake,
  TV: Tv,
  WIFI: Wifi,
  IRON: Shirt,
  POOL: Waves,
  GYM: Dumbbell,
};

const AMENITY_ICON_RULES: Array<[string[], React.FC<{ className?: string }>]> = [
  [['WIFI', 'WIRELESS', 'INTERNET'], Wifi],
  [['AIR_CONDITION', 'AIRCON', 'AC_UNIT', 'COOLING'], Snowflake],
  // Safety sits ABOVE the vehicle rule on purpose: CARBON_MONOXIDE_ALARM
  // contains "CAR", and a smoke alarm rendered with a car icon is exactly the
  // kind of quiet nonsense a substring matcher produces if the order is casual.
  [['SMOKE', 'CARBON_MONOXIDE', 'ALARM', 'EXTINGUISHER', 'FIRST_AID', 'SAFETY', 'SECURE'], ShieldCheck],
  [['HEAT', 'FIREPLACE', 'GEYSER', 'WATER_HEATER'], Flame],
  [['TV', 'TELEVISION', 'NETFLIX', 'CABLE'], Tv],
  [['HAIR_DRYER'], Wind],
  [['WASHER', 'WASHING', 'LAUNDRY', 'DRYER'], WashingMachine],
  [['REFRIGERATOR', 'FRIDGE', 'FREEZER'], Refrigerator],
  [['MICROWAVE', 'OVEN', 'TOASTER'], Microwave],
  [['COFFEE', 'TEA', 'KETTLE'], Coffee],
  [['KITCHEN', 'COOKING', 'STOVE'], ChefHat],
  [['DISHES', 'SILVERWARE', 'CUTLERY', 'UTENSIL'], Utensils],
  [['BATHTUB', 'BATH'], Bath],
  [['SHOWER'], ShowerHead],
  [['TOILET', 'BIDET'], Toilet],
  [['BEACH', 'POOL', 'LAKE', 'OCEAN', 'HOT_TUB', 'JACUZZI', 'WATERFRONT'], Waves],
  [['LINEN', 'BEDDING', 'PILLOW', 'BLANKET', 'MATTRESS'], Bed],
  [['BED'], BedDouble],
  [['PARKING', 'GARAGE'], ParkingCircle],
  [['CAR', 'TRANSPORT', 'AIRPORT'], Car],
  [['GYM', 'FITNESS', 'EXERCISE'], Dumbbell],
  [['FAN', 'CEILING_FAN'], Fan],
  [['DESK', 'WORKSPACE', 'LAPTOP'], Laptop],
  [['MONITOR', 'PROJECTOR'], Monitor],
  [['GAME', 'CONSOLE', 'PLAYSTATION', 'XBOX'], Gamepad2],
  [['BOOK', 'READING', 'LIBRARY'], BookOpen],
  [['SOUND', 'SPEAKER', 'STEREO', 'BLUETOOTH'], Speaker],
  [['MUSIC', 'PIANO', 'GUITAR'], Music],
  [['SOFA', 'LOUNGE', 'LIVING'], Sofa],
  [['CHAIR', 'SEATING', 'PATIO', 'BALCONY', 'TERRACE'], Armchair],
  [['HANGER', 'CLOSET', 'WARDROBE', 'IRON', 'CLOTH'], Shirt],
  [['SHAMPOO', 'SOAP', 'TOILETRIES', 'ESSENTIAL'], Droplet],
  // Generic water, last of the water-ish rules so HOT_TUB/WATERFRONT/WATER_HEATER
  // have all had their more specific turn above.
  [['WATER', 'DRINKING'], Droplet],
  [['GARDEN', 'PLANT', 'BACKYARD', 'OUTDOOR'], Leaf],
  [['LIGHT', 'LAMP'], Lightbulb],
  [['POWER', 'CHARGER', 'SOCKET', 'OUTLET', 'BACKUP'], Plug],
  [['UMBRELLA', 'RAIN'], Umbrella],
  [['CAMERA', 'CCTV'], Camera],
  [['LOCK', 'KEYPAD', 'SELF_CHECK', 'ENTRANCE', 'ACCESS'], KeyRound],
  [['BREAKFAST', 'MEAL', 'FOOD'], Coffee],
  [['SUN', 'VIEW', 'GARDEN_VIEW'], Sun],
  [['STORAGE', 'LUGGAGE'], Package],
  [['HOME', 'HOUSE', 'PRIVATE'], Home],
];

const amenityIconFor = (key: string): React.FC<{ className?: string }> => {
  const k = key.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (AMENITY_ICON_EXACT[k]) return AMENITY_ICON_EXACT[k];
  for (const [needles, Icon] of AMENITY_ICON_RULES) {
    if (needles.some((n) => k.includes(n))) return Icon;
  }
  return Check;
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
  // Voucher-template resolution (7 Sep 2026) - see getPropertyVoucherFields()
  // on the PHP side. whatsapp_voucher_template is this property's own
  // override; tenant_whatsapp_voucher_template is what it falls back to
  // before the hardcoded DEFAULT_WHATSAPP_VOUCHER_TEMPLATE - same chain
  // PropertyEditForm.tsx already resolves for the offline flow.
  whatsapp_voucher_template?: string | null;
  tenant_whatsapp_voucher_template?: string | null;
  wifi_network?: string | null;
  wifi_password?: string | null;
  house_manual?: string | null;
  security_deposit?: number | null;
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
  // Added 7 Sep 2026 for the shared WhatsApp voucher template (see
  // buildBookingVoucherWhatsAppText below). The WhatsApp-quote confirmation
  // path (handleConfirmBookingHold) has no other property fetch to fall back
  // on - quote mode skips fetchPublicData() entirely - so it carries its own
  // copy of every field the template can reference; the instant-booking path
  // (handleCreatePublicBooking) only strictly needs num_guests/voucher_token
  // here since `property` state already has the rest, but the fields are
  // optional on both so either response shape works without special-casing.
  num_guests?: number;
  voucher_token?: string | null;
  whatsapp_voucher_template?: string | null;
  tenant_whatsapp_voucher_template?: string | null;
  wifi_network?: string | null;
  wifi_password?: string | null;
  house_manual?: string | null;
  security_deposit?: number | null;
  upi_qr_code_url?: string | null;
  google_maps_link?: string | null;
  instructions?: string | null;
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
  // Empty string, never a fallback property (12 Sep 2026). This used to end in
  // `|| 'patel-colony'` - a REAL property slug - so any URL whose first path
  // segment is empty (the bare site root, an <iframe> embed with a truncated
  // src) silently rendered one specific tenant's rooms, rates and availability
  // to a guest who never asked for that property. A guest could complete a
  // real, paid booking at the wrong property and nothing in the UI would say
  // so. An unresolvable slug is a broken link and must be shown as one - see
  // the "Property Unavailable" state below, which this now falls into.
  const currentSlug = useMemo(() => {
    return initialSlugProp || (typeof window !== 'undefined' ? window.location.pathname.split('/')[1] : '') || '';
  }, [initialSlugProp]);

  const [property, setProperty] = useState<PublicProperty | null>(null);
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [occupiedBlocks, setOccupiedBlocks] = useState<OccupiedBlock[]>([]);
  const [dailyRatesMap, setDailyRatesMap] = useState<{ [roomId: number]: { [dateStr: string]: number } }>({});
  const [dailyRestrictionsMap, setDailyRestrictionsMap] = useState<{ [roomId: number]: { [dateStr: string]: any } }>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Read initial date range from URL hash or query params (?checkin=YYYY-MM-DD&checkout=YYYY-MM-DD)
  const urlDates = useMemo(() => {
    if (typeof window === 'undefined') return { checkin: '', checkout: '' };
    const hashQuery = window.location.hash.split('?')[1] || '';
    const hashParams = new URLSearchParams(hashQuery);
    const searchParams = new URLSearchParams(window.location.search);
    const cIn = hashParams.get('checkin') || searchParams.get('checkin') || '';
    const cOut = hashParams.get('checkout') || searchParams.get('checkout') || '';
    const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (isoRegex.test(cIn) && isoRegex.test(cOut) && cIn < cOut) {
      return { checkin: cIn, checkout: cOut };
    }
    return { checkin: '', checkout: '' };
  }, []);

  // Month Navigation State (Default to current month & year, or jump to checkin month if in URL)
  const now = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => formatDateISO(now), [now]);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  const initialYear = useMemo(() => {
    if (urlDates.checkin) {
      const y = parseInt(urlDates.checkin.split('-')[0], 10);
      if (!isNaN(y) && y >= currentYear) return y;
    }
    return currentYear;
  }, [urlDates.checkin, currentYear]);

  const initialMonth = useMemo(() => {
    if (urlDates.checkin) {
      const m = parseInt(urlDates.checkin.split('-')[1], 10);
      if (!isNaN(m) && m >= 1 && m <= 12) return m;
    }
    return currentMonth;
  }, [urlDates.checkin, currentMonth]);

  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(initialMonth);

  // Check if we are at the minimum selectable month (current month)
  const isAtCurrentMonth = useMemo(() => {
    return selectedYear === currentYear && selectedMonth === currentMonth;
  }, [selectedYear, selectedMonth, currentYear, currentMonth]);

  // Date Range Selection State in Toolbar (initialized from URL if present)
  const [checkinDate, setCheckinDate] = useState<string>(() => urlDates.checkin);
  const [checkoutDate, setCheckoutDate] = useState<string>(() => urlDates.checkout);
  const [filterRoomId, setFilterRoomId] = useState<number | 'all'>('all');

  // Real-time hover preview date (Airbnb 2-click & hover track model)

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

  // Party size for the SEARCH toolbar (7 Sep 2026, explicit request: "not all
  // properties have same space"). Deliberately separate from numGuests above,
  // which belongs to the booking form: this one filters which rooms are offered,
  // that one is what gets written on the booking. handleOpenBookingDrawer seeds
  // numGuests from this so the guest is not asked the same question twice.
  //
  // Defaults to 2 to match numGuests and the app-wide "default 2 guests" rule -
  // a filter and a form that disagree on the starting party size would be its
  // own small bug.
  const [partySize, setPartySize] = useState(2);

  // Room whose "Unit Details" slide-over is open, or null.
  const [detailsRoom, setDetailsRoom] = useState<PublicRoom | null>(null);
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

  const availableOptionsRef = React.useRef<HTMLDivElement | null>(null);

  // Auto-scroll to available options if deep-linked with checkin dates
  useEffect(() => {
    if (urlDates.checkin && urlDates.checkout && !loading) {
      const timer = setTimeout(() => {
        availableOptionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [urlDates.checkin, urlDates.checkout, loading]);

  // Keep URL in sync with selected dates so hosts can copy/share directly from browser
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (quoteToken) return; // Preserve quote token in URL
    const currentHash = window.location.hash;
    const baseHash = currentHash.split('?')[0] || '#book';
    if (baseHash !== '#book') return;

    if (checkinDate && checkoutDate && checkinDate < checkoutDate) {
      const newHash = `${baseHash}?checkin=${checkinDate}&checkout=${checkoutDate}${filterRoomId !== 'all' ? `&room=${filterRoomId}` : ''}`;
      if (window.location.hash !== newHash) {
        window.history.replaceState(null, '', newHash);
      }
    } else if (!checkinDate && !checkoutDate && currentHash.includes('checkin=')) {
      window.history.replaceState(null, '', baseHash);
    }
  }, [checkinDate, checkoutDate, filterRoomId, quoteToken]);

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
    // No slug in the URL at all - say so plainly rather than asking the backend
    // to resolve an empty string, which it could only answer with a guess.
    if (!currentSlug) {
      setFetchError("This booking link doesn't say which property it's for. Please use the full link the property shared with you.");
      setLoading(false);
      return;
    }
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

  // Shared WhatsApp voucher text (7 Sep 2026) - same renderWhatsappVoucherTemplate()
  // the offline/staff flow uses (see BookingDetailsModal.tsx), so a guest who
  // books directly through this page gets the exact same rich confirmation
  // message (UPI/QR, nights, advance/balance, notes, voucher link) instead of
  // the old 6-line hardcoded string this used to build inline, twice, nearly
  // verbatim. Resolution order matches PropertyEditForm.tsx's own inheritance:
  // this booking's own copy (only the WhatsApp-quote confirmation carries one,
  // since quote mode never loads `property`) -> the loaded property's own
  // override -> the property's tenant default -> the hardcoded fallback.
  const buildBookingVoucherWhatsAppText = (b: BookingConfirmation): string => {
    const effectiveTemplate =
      (b.whatsapp_voucher_template && b.whatsapp_voucher_template.trim()) ||
      (property?.whatsapp_voucher_template && property.whatsapp_voucher_template.trim()) ||
      (b.tenant_whatsapp_voucher_template && b.tenant_whatsapp_voucher_template.trim()) ||
      (property?.tenant_whatsapp_voucher_template && property.tenant_whatsapp_voucher_template.trim()) ||
      DEFAULT_WHATSAPP_VOUCHER_TEMPLATE;

    const finalUpi = b.upi_id || property?.upi_id || '';
    const uploadedQr = b.upi_qr_code_url || property?.upi_qr_code_url || '';
    // Same auto-generated-QR-from-deep-link fallback PropertyEditForm.tsx's
    // own preview uses when no bank/PhonePe/GPay QR image has been uploaded.
    const upiDeepLink = finalUpi
      ? buildUpiPaymentLink({
          upiId: finalUpi,
          payeeName: b.property_name || property?.name || 'Ground Code Resort',
          amount: b.total_tariff,
          note: `Booking ${b.room_name || ''}`.trim(),
        })
      : '';
    const finalQr = uploadedQr || (upiDeepLink ? `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(upiDeepLink)}` : '');

    const voucherLink = b.voucher_token
      ? `${window.location.origin}${window.location.pathname}#voucher?token=${b.voucher_token}`
      : '';

    const totalStr = Number(b.total_tariff || 0).toFixed(2);
    const depositVal = b.security_deposit ?? property?.security_deposit;

    return renderWhatsappVoucherTemplate(effectiveTemplate, {
      booking_id: String(b.booking_id ?? ''),
      guest_name: b.guest_name || '',
      guest_phone: b.phone || '',
      room_name: b.room_name || '',
      checkin_date: formatDateDDMMYYYY(b.checkin_date),
      checkin_time: b.checkin_time || '',
      checkout_date: formatDateDDMMYYYY(b.checkout_date),
      checkout_time: b.checkout_time || '',
      nights: String(b.nights ?? ''),
      // The online form only ever collects a single guest count, never an
      // adults/children split - guest_breakdown stays empty and its line
      // drops, same as any offline booking that never captured a split.
      guest_count: b.num_guests != null ? String(b.num_guests) : '',
      guest_breakdown: '',
      room_tariff: totalStr,
      // Always 0 for a fresh direct booking - see handleCreatePublicBooking/
      // handleConfirmBookingHold, which both insert advance_paid = 0 and rely
      // on the guest paying afterward ("Payment requested"/"Pending
      // Verification"). Not droppable here on purpose: a brand-new unpaid
      // booking SHOULD say so, unlike an offline booking that might already
      // be part-paid.
      advance_paid: '0.00',
      payments_list: '',
      balance_due: totalStr,
      security_deposit: depositVal ? Number(depositVal).toFixed(2) : '',
      address: b.address || property?.address || '',
      contact_phone: property?.phone || '',
      maps_link: b.google_maps_link || property?.google_maps_link || '',
      upi_id: finalUpi,
      upi_qr_code_url: finalQr,
      other_notes: b.instructions || property?.instructions || '',
      wifi_network: b.wifi_network || property?.wifi_network || '',
      wifi_password: b.wifi_password || property?.wifi_password || '',
      house_manual: b.house_manual || property?.house_manual || '',
      voucher_link: voucherLink,
      property_name: b.property_name || property?.name || '',
    });
  };

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

  // Airbnb-style Date Range Highlighting & Preview Calculations
  // Was `checkoutDate || hoverDate` - the hover half existed only to preview a
  // half-made click selection, which no longer exists. The chosen range is now
  // simply the range in the fields, so there is no longer any such thing as a
  // "tentative" range either (that flag greyed the end cap while a click
  // selection was still half-made) - both are gone rather than left wired to a
  // constant false.
  const effectiveEndDate = checkoutDate;

  const previewNights = useMemo(() => {
    if (!checkinDate || !effectiveEndDate || effectiveEndDate <= checkinDate) return 0;
    const a = new Date(checkinDate + 'T00:00:00').getTime();
    const b = new Date(effectiveEndDate + 'T00:00:00').getTime();
    return Math.round((b - a) / 86400000);
  }, [checkinDate, effectiveEndDate]);

  const BLANK_RANGE_STATUS = {
    isStart: false, isEnd: false, isInRange: false, isSingleDayPick: false,
  };

  /**
   * Night-only range status for a date, ignoring rooms. The CHECK-OUT DATE IS
   * NOT A NIGHT, so it is never highlighted: 9 -> 10 is one night, the 9th.
   *
   * This is the date row's version and the room rows' version both (the latter
   * adds an availability gate on top), because when the two disagreed the header
   * lit the 10th while every room row below it correctly did not - which reads as
   * a rendering bug, not as a deliberate picker convention. One definition of
   * "which days are part of this stay" for the whole grid. 7 Sep 2026.
   */
  const getNightRangeStatus = (dStr: string) => {
    if (!checkinDate) return BLANK_RANGE_STATUS;
    // Only a check-in picked so far - mark just that cell.
    if (!lastNightStr) {
      return dStr === checkinDate
        ? { ...BLANK_RANGE_STATUS, isSingleDayPick: true }
        : BLANK_RANGE_STATUS;
    }
    if (dStr < checkinDate || dStr > lastNightStr) return BLANK_RANGE_STATUS;
    const isStart = dStr === checkinDate;
    const isEnd = dStr === lastNightStr;
    return {
      isStart: isStart && !isEnd,
      isEnd: isEnd && !isStart,
      // A one-night stay is both ends at once - round it on both sides rather
      // than leaving it half-open against nothing.
      isSingleDayPick: isStart && isEnd,
      isInRange: !isStart && !isEnd,
    };
  };

  // The last NIGHT of the selected stay - checkout day itself is not a night.
  // 11 -> 13 is two nights, the 11th and the 12th; nobody occupies the room on
  // the 13th, so nothing on that date belongs to the stay.
  const lastNightStr = useMemo(() => {
    if (!checkinDate || !effectiveEndDate || effectiveEndDate <= checkinDate) return '';
    const d = new Date(effectiveEndDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return formatDateISO(d);
  }, [checkinDate, effectiveEndDate]);

  // Which rooms can actually take the WHOLE stay (7 Sep 2026, reported live).
  //
  // getNightRangeStatus() above answers "is this date part of the stay" for the
  // date row. A room ROW is a different question: it is that room's own
  // availability, so highlighting it purely by date claimed a room was part of
  // the stay when it was free on only one day of it. On Patel Colony, asking for
  // 11->13 lit up The Antique Studio's 13th (free only on the 13th) - so a room
  // the guest cannot book looked selected, and the same rectangle disagreed with
  // the "Available Options" list right above it.
  //
  // Same rule as availableRoomResults uses (every night free, half-open so a
  // same-day turnover still counts as available) - derived once here rather than
  // re-implemented, so the two can never drift apart on what "available" means.
  const availableRoomIdsForRange = useMemo(() => {
    const ids = new Set<number>();
    if (!checkinDate || !effectiveEndDate || effectiveEndDate <= checkinDate) return ids;
    for (const room of rooms) {
      const cur = new Date(checkinDate + 'T00:00:00');
      const end = new Date(effectiveEndDate + 'T00:00:00');
      let ok = true;
      while (cur < end) {
        if (isRoomOccupied(room.id, formatDateISO(cur))) { ok = false; break; }
        cur.setDate(cur.getDate() + 1);
      }
      if (ok) ids.add(room.id);
    }
    return ids;
  }, [checkinDate, effectiveEndDate, rooms, occupiedBlocks]);

  /** Range status for one ROOM's row: the nights above, gated on that room being
   *  able to take the ENTIRE stay. A room that cannot returns all-false, so its
   *  row stays in its normal available/booked colours. */
  const getRoomRangeStatus = (roomId: number, dStr: string) => {
    // Until a full range exists there is no availability to assert, so rows stay
    // neutral - only the date row marks the half-made selection. In practice the
    // hover preview fills effectiveEndDate the moment the pointer moves past the
    // check-in, so this is a momentary state, not a dead one.
    if (!lastNightStr || !availableRoomIdsForRange.has(roomId)) return BLANK_RANGE_STATUS;
    return getNightRangeStatus(dStr);
  };

  // Real-Time Available Rooms Calculation for selected Check-in & Check-out dates
  // Largest capacity on the property, for the party-size dropdown's ceiling.
  // Falls back to 8 only when NOTHING has a capacity set - without a fallback the
  // dropdown would collapse to a single "1 Guest" option on a property that has
  // not filled the field in yet, which is worse than offering a few too many.
  const maxPropertyCapacity = useMemo(() => {
    const caps = rooms.map((r) => Number(r.max_capacity) || 0).filter((n) => n > 0);
    return caps.length ? Math.max(...caps) : 8;
  }, [rooms]);

  const availableRoomResults = useMemo(() => {
    if (!checkinDate || !checkoutDate || checkinDate >= checkoutDate) {
      return [];
    }

    const byRoomFilter = filterRoomId === 'all' ? rooms : rooms.filter((r) => r.id === filterRoomId);

    // Party-size filter. Only excludes a room whose capacity is actually KNOWN and
    // too small - a room with max_capacity 0/null has simply never had the field
    // set (it is the "never answered" sentinel, see PropertyEditForm), and hiding
    // those would empty this list entirely for any property that has not filled in
    // capacities yet. An unknown capacity is not a small one.
    const eligibleRooms = byRoomFilter.filter((r) => {
      const cap = Number(r.max_capacity) || 0;
      return cap <= 0 || cap >= partySize;
    });
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
  }, [checkinDate, checkoutDate, filterRoomId, partySize, rooms, occupiedBlocks, dailyRatesMap, property]);

  // Share all available room options and rates for selected dates via WhatsApp
  // handleShareAvailability was removed 7 Sep 2026 along with its button - see
  // the note at that button's old site in the Available Options header. The
  // equivalent staff-side feature lives in GuestManagement.tsx
  // (handleShareAllAvailableRooms), which is where a host actually is.

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
    // Seed the booking form from the party size the guest already chose in the
    // toolbar (7 Sep 2026) - they picked "4 Guests" to find this room, so opening
    // the form on anything else asks the same question twice and invites a
    // mismatch between what was searched and what gets booked.
    //
    // Still clamped to the room's own capacity: numGuests persists between drawer
    // opens, and without the clamp a 1-guest room would open showing a number its
    // own dropdown does not offer - and submit a booking for more people than the
    // room holds.
    const cap = Number(room.max_capacity) || 0;
    setNumGuests(cap > 0 ? Math.min(partySize, cap) : partySize);
    setFormError(null);
  };

  // handleDateSelection / handleTopRowDateClick were removed 7 Sep 2026. The
  // calendar no longer selects anything: the Check-in/Check-out fields are the
  // single source of the range, and the grid only reflects it. Two independent
  // ways to set the same dates is what allowed the grid to highlight a day the
  // fields did not agree was selected.

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
            <span className="font-black text-emerald-600 dark:text-emerald-400 text-base">
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
            href={`https://wa.me/?text=${encodeURIComponent(buildBookingVoucherWhatsAppText(confirmation))}`}
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
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Loading your quote...</p>
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
                  <span className="font-black text-emerald-600 dark:text-emerald-400 text-base">
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
                        <span className="text-2xs text-gray-400 block">Click to open full size</span>
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
                  href={`https://wa.me/?text=${encodeURIComponent(buildBookingVoucherWhatsAppText({
                    ...(quoteHold as any),
                    ...(booking as any),
                    property_name: booking?.property_name || quoteHold?.property_name || '',
                    room_name: booking?.room_name || quoteHold?.room_name || '',
                    guest_name: booking?.guest_name || quoteGuestName || '',
                  }))}`}
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

              <div className="p-3 bg-gray-100 dark:bg-gray-850 text-center text-2xs text-gray-500 dark:text-gray-400">
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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col items-center justify-center p-4 py-8 pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))] font-sans">
        <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-5 sm:p-6 space-y-4">
          <div className="text-center space-y-1">
            <Badge variant="warning">Room Held For You</Badge>
            <h2 className="text-lg font-black text-gray-900 dark:text-white">Your Instant Quote</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{quote.property_name}</p>
          </div>

          {/* Countdown */}
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-center">
            <p className="text-2xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Confirm Within</p>
            <p className="text-lg font-black font-mono text-amber-800 dark:text-amber-300 tabular-nums">
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
                <span className="text-2xs text-gray-400 block">From {quote.checkin_time}</span>
              </div>
              <div>
                <span className="text-2xs text-gray-500 dark:text-gray-400 block">Check-out</span>
                <span className="font-semibold text-gray-900 dark:text-white">{formatDateDisplay(quote.checkout_date || '')}</span>
                <span className="text-2xs text-gray-400 block">Until {quote.checkout_time}</span>
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
                  <p className="text-2xs text-gray-400 dark:text-gray-500">
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
                  <span className="text-2xs font-semibold text-rose-500 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-800">
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
                    <span className="text-2xs text-gray-400 dark:text-gray-500 mt-0.5">
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
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Checking live availability & rates...</p>
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
            <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-xs shadow-xs shrink-0">
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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-20 sm:pb-24 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] space-y-6">
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
                      setCheckoutDate('');
                    }
                  }}
                  onCheckoutChange={(d) => {
                    setCheckoutDate(d);
                    // Scroll down to the results, which the old click-to-select
                    // flow used to do. These fields are now the only way to pick
                    // dates, so this is the only place left that knows a complete
                    // range was just chosen.
                    if (d) {
                      setTimeout(() => {
                        availableOptionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 150);
                    }
                  }}
                  disablePastDates
                  fromPlaceholder="Check-in date"
                  toPlaceholder="Check-out date"
                />
              </div>

              {/* Party size (7 Sep 2026). Sits beside the dates because it is the
                  same question - "who is coming, and when" - and because rooms
                  here differ in capacity, so dates alone do not decide what is
                  actually bookable. Capped at the largest capacity on the
                  property: offering "8 guests" where the biggest room sleeps 5
                  can only ever return an empty list. */}
              <div className="w-full sm:w-auto min-w-[150px]">
                <StyledSelect
                  value={String(partySize)}
                  onChange={(val) => setPartySize(Number(val) || 1)}
                  options={Array.from(
                    { length: Math.max(1, maxPropertyCapacity) },
                    (_, i) => i + 1
                  ).map((n) => ({
                    value: String(n),
                    label: `${n} Guest${n > 1 ? 's' : ''}`,
                  }))}
                  className="w-full"
                  buttonClassName="h-10 text-xs font-semibold min-w-[150px]"
                />
              </div>

              {rooms.length > 1 && (
                <div className="w-full sm:w-auto min-w-[180px] sm:min-w-[200px]">
                  <StyledSelect
                    value={String(filterRoomId)}
                    onChange={(val) => setFilterRoomId(val === 'all' ? 'all' : Number(val))}
                    options={[
                      { value: 'all', label: `All Rooms (${rooms.length})` },
                      ...rooms.map((r) => ({
                        value: String(r.id),
                        label: r.name,
                      })),
                    ]}
                    className="w-full"
                    buttonClassName="h-10 text-xs font-semibold min-w-[180px] sm:min-w-[200px]"
                  />
                </div>
              )}

              {(checkinDate || checkoutDate) && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setCheckinDate('');
                    setCheckoutDate('');
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

          {/* Airbnb-style Active Check-in / Prompt for Check-out Banner */}
          {checkinDate && !checkoutDate && (
            <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/60 rounded-lg px-3.5 py-2 text-xs text-blue-700 dark:text-blue-300 animate-fade-in">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>
                  Check-in: <strong className="font-semibold text-blue-900 dark:text-white">{formatDateDisplay(checkinDate)}</strong> — Select your check-out date on the calendar
                </span>
              </div>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setCheckinDate('');
                }}
                className="text-2xs text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40"
              >
                Cancel
              </Button>
            </div>
          )}

          {/* REAL-TIME AVAILABLE ROOM CARDS SECTION (Horizontal Space-Saving Layout per DESIGN.md) */}
          {checkinDate && checkoutDate && checkinDate < checkoutDate && (
            <div ref={availableOptionsRef} className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    {/* Dates deliberately dropped from this heading (7 Sep 2026) -
                        they are already in the Check-in/Check-out fields directly
                        above and on every room card below, so a third copy just
                        made the line long enough to wrap on a phone. */}
                    Available Options
                  </h3>
                  <Badge variant="success">
                    {availableRoomResults.length} {availableRoomResults.length === 1 ? 'room' : 'rooms'} available
                  </Badge>
                </div>
                {/* "Share Options via WhatsApp" was removed here 7 Sep 2026. This
                    page is the GUEST's booking view - the host never opens it, so a
                    staff-style share action had no audience on it and only competed
                    with Book Now for attention. Staff share availability from inside
                    the app instead (GuestManagement's own "Share All Available
                    Rooms"), which is where the host actually works. */}
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
                            <h4 className="text-base font-bold text-gray-900 dark:text-white truncate">
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

                          {/* The description paragraph and the amenity chips used
                              to render here (7 Sep 2026, explicit request). A room
                              with a full Airbnb import carries a multi-line
                              description and 20+ amenities, so five rooms of it
                              buried the one thing this list exists to answer -
                              price and "Book Now" - under a wall of prose. They
                              moved wholesale into the Unit Details slide-over
                              below; nothing was dropped, only relocated. The
                              one-line facts summary stays, because capacity/beds/
                              baths is exactly what a guest compares rooms ON. */}
                          {(room.description || parseJsonArray(room.amenities).length > 0 ||
                            parseJsonArray(room.bed_configuration).length > 0) && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="xs"
                              onClick={() => setDetailsRoom(room)}
                              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold"
                            >
                              <Info className="w-3.5 h-3.5 shrink-0" />
                              Unit Details
                            </Button>
                          )}
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

            <h2 className="text-base font-bold text-gray-900 dark:text-white">
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
            <div
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
            >
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
                        const { isStart, isEnd, isInRange, isSingleDayPick } = getNightRangeStatus(dStr);

                        return (
                          // Read-only, exactly like the room cells below (7 Sep
                          // 2026). Dates are entered in the Check-in/Check-out
                          // fields and the grid reflects them - it is not a second
                          // way to set them. That duplication is what let the grid
                          // show a selection the fields did not have.
                          <th
                            key={d}
                            className={`p-1.5 font-semibold text-2xs border-r border-gray-200 dark:border-gray-700 min-w-[34px] select-none transition-colors ${
                              isPast
                                ? 'opacity-40 bg-gray-100/50 dark:bg-gray-900/50 text-gray-400 dark:text-gray-600'
                                : isSingleDayPick
                                ? 'bg-blue-600 text-white font-bold rounded-t-md'
                                : isStart
                                ? 'bg-blue-600 text-white font-bold rounded-tl-md'
                                : isEnd
                                ? 'bg-blue-600 text-white font-bold rounded-tr-md'
                                : isInRange
                                ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-900 dark:text-blue-100 font-bold'
                                : isToday
                                ? 'bg-blue-100/70 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                                : ''
                            }`}
                          >
                            <div className="text-2xs opacity-80">{dayInitial}</div>
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
                            const { isStart, isEnd, isInRange, isSingleDayPick } = getRoomRangeStatus(room.id, dStr);

                            // Dynamic restriction badges
                            const roomRestrictions = dailyRestrictionsMap[room.id] || {};
                            const dayRest = roomRestrictions[dStr];

                            return (
                              // Not clickable (7 Sep 2026, explicit request). Dates are
                              // picked from the Check-in/Check-out fields or the date row
                              // above; a room cell is a read-only availability readout, so
                              // it carries no cursor-pointer or hover colour to imply
                              // otherwise.
                              <td
                                key={dStr}
                                className={`p-1 h-12 border-r border-gray-200 dark:border-gray-800 text-center transition-all select-none ${
                                  isPast
                                    ? 'bg-gray-100/50 dark:bg-gray-900/50 text-gray-400 dark:text-gray-600'
                                    : occupied
                                    ? 'bg-[#fef2f2] dark:bg-red-950/20 text-[#b91c1c] dark:text-red-400'
                                    : isSingleDayPick
                                    ? 'bg-blue-600 text-white ring-1 ring-blue-600 rounded-md font-bold'
                                    : isStart
                                    ? 'bg-blue-600 text-white ring-1 ring-blue-600 rounded-l-md font-bold'
                                    : isEnd
                                    ? 'bg-blue-600 text-white ring-1 ring-blue-600 rounded-r-md font-bold'
                                    : isInRange
                                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 font-bold'
                                    : 'bg-[#f0fdf4] dark:bg-emerald-950/20 text-[#15803d] dark:text-emerald-400 font-bold'
                                }`}
                              >
                                {isPast ? (
                                  <span className="text-2xs opacity-40">-</span>
                                ) : occupied ? (
                                  <span className="text-2xs opacity-0">-</span>
                                ) : (
                                  <div className="flex flex-col items-center justify-center">
                                    {rate > 0 && (
                                      <span className={`text-2xs font-bold leading-none ${isSingleDayPick || isStart || isEnd ? 'text-white' : isInRange ? 'text-blue-900 dark:text-blue-100' : ''}`}>
                                        {rate.toLocaleString('en-IN')}
                                      </span>
                                    )}
                                    {dayRest?.closed_to_arrival && (
                                      <span className="text-2xs font-bold px-1 rounded bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800 mt-0.5">CTA</span>
                                    )}
                                    {dayRest?.min_stay_arrival > 1 && (
                                      <span className="text-2xs font-bold px-1 rounded bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 mt-0.5">
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
                <div
                  key={room.id}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
                    >
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
                      const { isStart, isEnd, isInRange, isSingleDayPick } = getRoomRangeStatus(room.id, dStr);

                      return (
                        // Read-only, same as the desktop table above - see that
                        // cell's comment.
                        <div
                          key={dStr}
                          className={`relative p-2 min-h-[4.5rem] flex flex-col justify-between transition-all select-none ${
                            isPast
                              ? 'bg-gray-50 dark:bg-gray-800/40 opacity-40'
                              : occupied
                              ? 'bg-[#fef2f2] dark:bg-red-950/20 text-[#b91c1c] dark:text-red-400'
                              : isSingleDayPick
                              ? 'bg-blue-600 text-white rounded-lg ring-2 ring-blue-500 shadow-md font-bold z-10'
                              : isStart
                              ? 'bg-blue-600 text-white rounded-l-lg ring-1 ring-blue-600 shadow-md font-bold z-10'
                              : isEnd
                              ? 'bg-blue-600 text-white rounded-r-lg ring-1 ring-blue-500 shadow-md font-bold z-10'
                              : isInRange
                              ? 'bg-blue-100/90 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100 font-semibold'
                              : 'bg-[#f0fdf4] dark:bg-emerald-950/20'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${isSingleDayPick || isStart || isEnd ? 'text-white' : isToday ? 'text-blue-600 dark:text-blue-400 font-extrabold' : ''}`}>
                              {d}
                            </span>
                            {isToday && !isStart && !isEnd && !isSingleDayPick && (
                              <span className="text-2xs uppercase font-bold text-blue-600 dark:text-blue-400">Today</span>
                            )}
                            {isEnd && previewNights > 0 && (
                              <span className="text-2xs px-1.5 py-0.5 rounded bg-white/20 text-white font-bold backdrop-blur-xs">
                                {previewNights}N
                              </span>
                            )}
                          </div>

                          {!isPast && !occupied && (
                            <div className="mt-auto text-right">
                              {rate > 0 && (
                                <span className={`text-xs font-bold block ${isSingleDayPick || isStart || isEnd ? 'text-white' : isInRange ? 'text-blue-900 dark:text-blue-100' : 'text-emerald-700 dark:text-emerald-300'}`}>
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

      {/* Page Footer per Flowbite Layout Rules with Safe Area */}
      <footer className="mt-auto border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-6 px-4 sm:px-6 lg:px-8 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 dark:text-white">{property.name}</span>
            <span>·</span>
            <span>Direct Booking Engine</span>
          </div>
          <p className="text-2xs text-gray-400 dark:text-gray-500">
            Powered by Ground Code PMS · Real-time Availability &amp; 0% Commission
          </p>
        </div>
      </footer>

      {/* UNIT DETAILS MODAL (7 Sep 2026)
          A CENTRED modal, deliberately - this is the one documented exception to
          DESIGN.md's "all dialogs are right slide-overs" rule, made on the owner's
          explicit call ("it should open a modal and not drawer"). See DESIGN.md's
          own note on it so the next person does not "correct" this back to a
          drawer. The reasoning that holds it up: a drawer is for a task you
          perform (the booking form beneath this one), while this is reference
          content you read and dismiss.
          Backdrop click closes it, wired by hand (onClick on the backdrop +
          stopPropagation on the panel) because this is hand-rolled, not
          flowbite-react's own component which gets that for free. */}
      {detailsRoom && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setDetailsRoom(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${detailsRoom.name} unit details`}
            className="w-full max-w-lg max-h-[90vh] bg-white dark:bg-gray-800 rounded-lg shadow-2xl flex flex-col border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50/50 dark:bg-gray-750 rounded-t-lg shrink-0">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">{detailsRoom.name}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Unit details</p>
              </div>
              <button
                onClick={() => setDetailsRoom(null)}
                aria-label="Close unit details"
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
              {/* At-a-glance facts as icon tiles rather than a run-on sentence */}
              {(() => {
                const tiles: Array<{ icon: React.FC<{ className?: string }>; label: string; value: string }> = [];
                if (detailsRoom.max_capacity && detailsRoom.max_capacity > 0) {
                  tiles.push({ icon: Users, label: 'Sleeps', value: `${detailsRoom.max_capacity} guest${detailsRoom.max_capacity > 1 ? 's' : ''}` });
                }
                if (detailsRoom.bedrooms && detailsRoom.bedrooms > 0) {
                  tiles.push({ icon: Home, label: 'Bedrooms', value: String(detailsRoom.bedrooms) });
                }
                if (detailsRoom.beds_count && detailsRoom.beds_count > 0) {
                  tiles.push({ icon: BedDouble, label: 'Beds', value: String(detailsRoom.beds_count) });
                }
                if (detailsRoom.bathrooms && detailsRoom.bathrooms > 0) {
                  tiles.push({ icon: Bath, label: 'Bathrooms', value: String(detailsRoom.bathrooms) });
                }
                if (!tiles.length) return null;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {tiles.map((tl) => (
                      <div
                        key={tl.label}
                        className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-center dark:border-gray-700 dark:bg-gray-900/40"
                      >
                        <tl.icon className="w-4 h-4 mx-auto text-blue-600 dark:text-blue-400" />
                        <div className="mt-1 text-xs font-bold text-gray-900 dark:text-white">{tl.value}</div>
                        <div className="text-2xs font-medium text-gray-500 dark:text-gray-400">{tl.label}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Description - full text here, since truncating it was the whole
                  reason it did not belong on the card. */}
              {detailsRoom.description ? (
                <section>
                  <h4 className="text-2xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                    About this space
                  </h4>
                  <p className="whitespace-pre-line text-xs leading-relaxed text-gray-700 dark:text-gray-300">
                    {detailsRoom.description}
                  </p>
                </section>
              ) : null}

              {/* Bed configuration, per sleeping area */}
              {(() => {
                const bedRooms = parseJsonArray(detailsRoom.bed_configuration).filter(
                  (br: any) => br && Array.isArray(br.beds) && br.beds.length
                );
                if (!bedRooms.length) return null;
                return (
                  <section>
                    <h4 className="text-2xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                      Sleeping arrangement
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {bedRooms.map((br: any, i: number) => (
                        <div
                          key={i}
                          className="rounded-lg border border-gray-200 p-2.5 dark:border-gray-700"
                        >
                          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900 dark:text-white">
                            <Bed className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                            {humanizeKey(String(br.room_type || `Area ${i + 1}`))}
                          </div>
                          <p className="mt-1 text-2xs font-medium text-gray-500 dark:text-gray-400">
                            {br.beds
                              .filter((b: any) => b?.type)
                              .map((b: any) => `${Number(b.quantity) || 1} ${humanizeKey(String(b.type))}`)
                              .join(' · ')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })()}

              {/* Amenities - every one, each with its own Flowbite icon. No
                  "+N more": this drawer exists precisely to be the place with no
                  truncation. */}
              {(() => {
                // Normalised rather than only humanised (7 Sep 2026): a room
                // imported before the importer started writing catalog labels
                // still holds Airbnb's own constants, which humanizeKey would
                // show a guest as "Wireless Internet" while the same amenity
                // ticked by hand reads "Wi-Fi". Normalising here means the two
                // render identically, and a room carrying both only lists it
                // once. Legacy rows get this without waiting for a re-save.
                const amenities = normalizeAmenityList(parseJsonArray(detailsRoom.amenities));
                if (!amenities.length) return null;
                return (
                  <section>
                    <h4 className="text-2xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                      What this place offers
                      <span className="ms-1.5 font-semibold text-gray-400 dark:text-gray-500">({amenities.length})</span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                      {amenities.map((a) => {
                        const Icon = amenityIconFor(a);
                        return (
                          <div key={a} className="flex items-center gap-2 py-0.5">
                            <Icon className="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400" />
                            <span className="text-xs text-gray-700 dark:text-gray-300">{a}</span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })()}

              {/* Arrival / departure times */}
              {(detailsRoom.checkin_time || detailsRoom.checkout_time) && (
                <section>
                  <h4 className="text-2xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                    Check-in &amp; check-out
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {detailsRoom.checkin_time && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
                        <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        Check-in from {detailsRoom.checkin_time}
                      </span>
                    )}
                    {detailsRoom.checkout_time && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
                        <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        Check-out by {detailsRoom.checkout_time}
                      </span>
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* Footer. No safe-area inset here, unlike the booking drawer's: this
                panel is centred and capped at 90vh, so its bottom edge never
                reaches the home-indicator bar that rule exists for. */}
            <div className="shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850 rounded-b-lg">
              <Button variant="ghost" size="sm" onClick={() => setDetailsRoom(null)}>
                Close
              </Button>
              {checkinDate && checkoutDate && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    const r = detailsRoom;
                    setDetailsRoom(null);
                    handleOpenBookingDrawer(r, checkinDate, checkoutDate);
                  }}
                >
                  Book Now
                  <ArrowRight className="w-3.5 h-3.5 ms-1.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

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
                      <span className="text-2xs text-gray-400 block">From {property.checkin_time}</span>
                    </div>
                    <div>
                      <span className="text-2xs text-gray-500 dark:text-gray-400 block">Check-out</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatDateDisplay(bookingDrawerRoom.checkout)}
                      </span>
                      <span className="text-2xs text-gray-400 block">Until {property.checkout_time}</span>
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
