import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Phone,
  Loader2,
  Share2,
  Sparkles,
  ArrowRight,
  X,
  Building,
} from './icons/FlowbiteIcons';
import { Button } from './Button';
import { Badge } from './Badge';
import { apiFetch, API_ROOT_BASE } from '../services/api';

interface PublicRoom {
  id: number;
  name: string;
  slug: string;
  default_tariff?: number | null;
  checkin_time?: string | null;
  checkout_time?: string | null;
}

interface OccupiedBlock {
  room_id: number;
  checkin_date: string;
  expected_checkout: string;
  status?: string;
}

interface PropertySummary {
  id: number;
  name: string;
  slug: string;
  property_type: string;
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

// Format YYYY-MM-DD to DD MMM YYYY (e.g. 05 Sep 2026) per DESIGN.md
function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const PublicBookingEngine: React.FC<{ propertySlug?: string }> = ({ propertySlug: initialSlugProp }) => {
  const [currentSlug, setCurrentSlug] = useState<string>(() => {
    return initialSlugProp || (typeof window !== 'undefined' ? window.location.pathname.split('/')[1] : '') || 'patel-colony';
  });

  const [property, setProperty] = useState<PublicProperty | null>(null);
  const [allProperties, setAllProperties] = useState<PropertySummary[]>([]);
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [occupiedBlocks, setOccupiedBlocks] = useState<OccupiedBlock[]>([]);
  const [rateRules, setRateRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Quick Date Picker State in Toolbar
  const [quickCheckin, setQuickCheckin] = useState('');
  const [quickCheckout, setQuickCheckout] = useState('');
  const [selectedFilterRoomId, setSelectedFilterRoomId] = useState<number | 'all'>('all');

  // Range selection state
  const [pendingStart, setPendingStart] = useState<{ roomId: number; roomName: string; dateStr: string } | null>(null);
  const [selectedRange, setSelectedRange] = useState<{
    roomId: number;
    roomName: string;
    checkin: string;
    checkout: string;
    nights: number;
    totalTariff: number;
    dailyTariff: number;
  } | null>(null);

  // Booking Form State
  const [guestName, setGuestName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [numGuests, setNumGuests] = useState(2);
  const [specialRequests, setSpecialRequests] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  // Calendar Window Configuration (Today + 90 days rolling)
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [windowStart, setWindowStart] = useState<Date>(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return d;
  });

  const WINDOW_DAYS = 90;

  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < WINDOW_DAYS; i++) {
      const d = new Date(windowStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [windowStart]);

  const columnWidth = 58;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visibleMonthLabel, setVisibleMonthLabel] = useState('');

  const formatDateStr = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const monthYearLabel = (d: Date) => d.toLocaleString('default', { month: 'long', year: 'numeric' });
  const monthOnlyLabel = (d: Date) => d.toLocaleString('default', { month: 'long' });

  const updateVisibleMonthLabel = () => {
    const el = scrollRef.current;
    if (!el || calendarDays.length === 0) return;
    const startIdx = Math.max(0, Math.floor(el.scrollLeft / columnWidth));
    const endIdx = Math.min(
      calendarDays.length - 1,
      Math.max(startIdx, Math.ceil((el.scrollLeft + el.clientWidth) / columnWidth) - 1)
    );
    const startDate = calendarDays[startIdx];
    const endDate = calendarDays[endIdx];
    const sameMonth = startDate.getFullYear() === endDate.getFullYear() && startDate.getMonth() === endDate.getMonth();
    const sameYear = startDate.getFullYear() === endDate.getFullYear();
    setVisibleMonthLabel(
      sameMonth
        ? monthYearLabel(startDate)
        : sameYear
        ? `${monthOnlyLabel(startDate)} - ${monthYearLabel(endDate)}`
        : `${monthYearLabel(startDate)} - ${monthYearLabel(endDate)}`
    );
  };

  const navigateWindow = (direction: number) => {
    setWindowStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + direction * 30);
      return d;
    });
  };

  // Fetch Public Property Data
  const fetchPublicData = async (slugToFetch: string) => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=get_public_booking_info&property_slug=${encodeURIComponent(slugToFetch)}`);
      const json = await res.json();
      if (json && json.status === 'success' && json.data) {
        setProperty(json.data.property);
        setRooms(json.data.rooms || []);
        setOccupiedBlocks(json.data.occupied_blocks || []);
        setRateRules(json.data.rate_rules || []);
        if (json.data.all_properties) {
          setAllProperties(json.data.all_properties);
        }
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
    fetchPublicData(currentSlug);
  }, [currentSlug]);

  useEffect(() => {
    updateVisibleMonthLabel();
  }, [calendarDays]);

  const handlePropertyChange = (newSlug: string) => {
    setCurrentSlug(newSlug);
    setPendingStart(null);
    setSelectedRange(null);
    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState(null, '', `/${newSlug}/#book`);
    }
  };

  // Compute daily price for a room on a date
  const getRoomDailyPrice = (room: PublicRoom, dateStr: string): number => {
    if (rateRules.length > 0) {
      const activeRule = rateRules.find((r) => {
        const matchesRoom = !r.room_id || Number(r.room_id) === room.id;
        const inRange = dateStr >= r.start_date && dateStr <= r.end_date;
        return matchesRoom && inRange && r.rate_per_night;
      });
      if (activeRule && activeRule.rate_per_night) {
        return Number(activeRule.rate_per_night);
      }
    }
    return room.default_tariff ? Number(room.default_tariff) : 2400;
  };

  // Check if a room is occupied on a given date (night)
  const isRoomOccupiedOnDate = (roomId: number, dateStr: string): boolean => {
    return occupiedBlocks.some((b) => {
      const matchesRoom = b.room_id === roomId || Number(b.room_id) === Number(roomId);
      return matchesRoom && dateStr >= b.checkin_date && dateStr < b.expected_checkout;
    });
  };

  // Handle clicking a calendar cell
  const handleCellClick = (room: PublicRoom, dateStr: string, isOccupied: boolean) => {
    if (isOccupied) return;

    if (!pendingStart || pendingStart.roomId !== room.id || dateStr <= pendingStart.dateStr) {
      if (pendingStart && pendingStart.roomId === room.id && dateStr === pendingStart.dateStr) {
        setPendingStart(null);
        return;
      }
      setPendingStart({ roomId: room.id, roomName: room.name, dateStr });
      return;
    }

    // Candidate range: pendingStart.dateStr -> dateStr
    const cur = new Date(pendingStart.dateStr + 'T00:00:00');
    const end = new Date(dateStr + 'T00:00:00');
    let hasConflict = false;
    let totalPrice = 0;
    let nightCount = 0;

    while (cur < end) {
      const curStr = formatDateStr(cur);
      if (isRoomOccupiedOnDate(room.id, curStr)) {
        hasConflict = true;
        break;
      }
      totalPrice += getRoomDailyPrice(room, curStr);
      nightCount++;
      cur.setDate(cur.getDate() + 1);
    }

    if (hasConflict) {
      setPendingStart({ roomId: room.id, roomName: room.name, dateStr });
      return;
    }

    setSelectedRange({
      roomId: room.id,
      roomName: room.name,
      checkin: pendingStart.dateStr,
      checkout: dateStr,
      nights: nightCount,
      totalTariff: totalPrice,
      dailyTariff: Math.round(totalPrice / nightCount),
    });
    setPendingStart(null);
    setSubmitError(null);
  };

  // Apply Quick Date Range Pickers
  const handleApplyQuickDates = (targetRoomId: number | 'all') => {
    if (!quickCheckin || !quickCheckout || quickCheckin >= quickCheckout) {
      alert('Please choose valid check-in and check-out dates');
      return;
    }

    const eligibleRooms = targetRoomId === 'all' ? rooms : rooms.filter((r) => r.id === targetRoomId);
    let chosenRoom: PublicRoom | null = null;

    for (const room of eligibleRooms) {
      const cur = new Date(quickCheckin + 'T00:00:00');
      const end = new Date(quickCheckout + 'T00:00:00');
      let conflict = false;
      while (cur < end) {
        if (isRoomOccupiedOnDate(room.id, formatDateStr(cur))) {
          conflict = true;
          break;
        }
        cur.setDate(cur.getDate() + 1);
      }
      if (!conflict) {
        chosenRoom = room;
        break;
      }
    }

    if (!chosenRoom) {
      alert('No rooms are available for the entire selected date range. Please try different dates.');
      return;
    }

    // Compute total tariff
    const cur = new Date(quickCheckin + 'T00:00:00');
    const end = new Date(quickCheckout + 'T00:00:00');
    let totalPrice = 0;
    let nightCount = 0;
    while (cur < end) {
      totalPrice += getRoomDailyPrice(chosenRoom, formatDateStr(cur));
      nightCount++;
      cur.setDate(cur.getDate() + 1);
    }

    setSelectedRange({
      roomId: chosenRoom.id,
      roomName: chosenRoom.name,
      checkin: quickCheckin,
      checkout: quickCheckout,
      nights: nightCount,
      totalTariff: totalPrice,
      dailyTariff: Math.round(totalPrice / nightCount),
    });
  };

  // Submit Reservation
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRange || !property) return;
    if (!guestName.trim() || !phone.trim()) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=create_public_booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: property.id,
          room_id: selectedRange.roomId,
          guest_name: guestName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          checkin_date: selectedRange.checkin,
          checkout_date: selectedRange.checkout,
          num_guests: numGuests,
          special_requests: specialRequests.trim(),
          payment_method: 'Pay on Arrival (Cash / UPI / Card)',
        }),
      });

      const json = await res.json();
      if (json && json.status === 'success' && json.data) {
        setConfirmation(json.data);
        setSelectedRange(null);
        fetchPublicData(currentSlug);
      } else {
        setSubmitError(json?.message || 'Failed to complete reservation. Please try again.');
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Network error completing reservation');
    } finally {
      setSubmitting(false);
    }
  };

  const displayedRooms = useMemo(() => {
    if (selectedFilterRoomId === 'all') return rooms;
    return rooms.filter((r) => r.id === selectedFilterRoomId);
  }, [rooms, selectedFilterRoomId]);

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
        <Button variant="primary" size="sm" onClick={() => fetchPublicData(currentSlug)}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col font-sans">
      {/* Top Header / Property Banner */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-xs shrink-0">
              {property.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white tracking-tight leading-tight truncate">
                  {property.name}
                </h1>
                {/* Property Dropdown Switcher */}
                {allProperties.length > 1 && (
                  <select
                    value={property.slug}
                    onChange={(e) => handlePropertyChange(e.target.value)}
                    className="text-2xs font-semibold bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 text-gray-700 dark:text-gray-200 focus:ring-1 focus:ring-blue-500"
                  >
                    {allProperties.map((p) => (
                      <option key={p.id} value={p.slug}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-3xs sm:text-2xs text-gray-500 dark:text-gray-400 mt-0.5">
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 truncate">
                  <Sparkles className="w-2.5 h-2.5 shrink-0" />
                  Best Rate Guaranteed (0% Commission)
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {property.phone && (
              <a
                href={`tel:${property.phone}`}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <Phone className="w-3.5 h-3.5 text-blue-600" />
                {property.phone}
              </a>
            )}
            <Badge variant="success">Instant Confirmation</Badge>
          </div>
        </div>
      </header>

      {/* Main Multi-Room Calendar Section */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-4">
        {/* Date Range & Room Filter Bar */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
              <span className="text-2xs font-semibold text-gray-500 uppercase">Check-in:</span>
              <input
                type="date"
                min={formatDateStr(today)}
                value={quickCheckin}
                onChange={(e) => setQuickCheckin(e.target.value)}
                className="bg-transparent text-xs font-bold text-gray-900 dark:text-white border-0 p-0 focus:ring-0 cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
              <span className="text-2xs font-semibold text-gray-500 uppercase">Check-out:</span>
              <input
                type="date"
                min={quickCheckin || formatDateStr(today)}
                value={quickCheckout}
                onChange={(e) => setQuickCheckout(e.target.value)}
                className="bg-transparent text-xs font-bold text-gray-900 dark:text-white border-0 p-0 focus:ring-0 cursor-pointer"
              />
            </div>

            <select
              value={selectedFilterRoomId}
              onChange={(e) => setSelectedFilterRoomId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="h-8 text-xs font-medium bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Rooms ({rooms.length})</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>

            {quickCheckin && quickCheckout && (
              <Button
                variant="primary"
                size="xs"
                onClick={() => handleApplyQuickDates(selectedFilterRoomId)}
                className="h-8 text-xs font-semibold px-3"
              >
                Check & Book
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 text-2xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
              Available
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-gray-300 dark:bg-gray-700 inline-block" />
              Booked
            </span>
          </div>
        </div>

        {/* Multi-Calendar Grid Card */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs overflow-hidden">
          {/* Calendar Month Navigation Header */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                {visibleMonthLabel || 'Availability & Rates Calendar'}
              </span>
              <span className="text-2xs text-gray-400 dark:text-gray-500">
                ({displayedRooms.length} {displayedRooms.length === 1 ? 'room' : 'rooms'})
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => navigateWindow(-1)}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigateWindow(1)}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Horizontally Scrollable Multi-Room Grid */}
          <div
            ref={scrollRef}
            onScroll={updateVisibleMonthLabel}
            className="overflow-x-auto select-none"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="inline-block min-w-full align-middle">
              {/* Day Headers Row */}
              <div className="flex border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/80">
                <div className="w-36 sm:w-48 shrink-0 px-3.5 py-2 text-2xs font-bold text-gray-500 uppercase tracking-wider sticky left-0 z-20 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-800 flex items-center">
                  Room / Villa
                </div>
                <div className="flex">
                  {calendarDays.map((d) => {
                    const dStr = formatDateStr(d);
                    const isToday = dStr === formatDateStr(today);
                    const dayName = d.toLocaleDateString('default', { weekday: 'short' });
                    const isWeekend = dayName === 'Sat' || dayName === 'Sun';

                    return (
                      <div
                        key={dStr}
                        style={{ width: `${columnWidth}px` }}
                        className={`shrink-0 py-1.5 text-center border-r border-gray-100 dark:border-gray-800/60 ${
                          isToday ? 'bg-blue-50/80 dark:bg-blue-950/60' : isWeekend ? 'bg-gray-100/40 dark:bg-gray-800/40' : ''
                        }`}
                      >
                        <p className="text-3xs font-semibold text-gray-400 uppercase">{dayName}</p>
                        <p className={`text-xs font-bold ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                          {d.getDate()}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Room Rows */}
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {displayedRooms.map((room) => {
                  return (
                    <div key={room.id} className="flex group hover:bg-gray-50/30 dark:hover:bg-gray-800/30 transition-colors">
                      {/* Sticky Left Room Name Card */}
                      <div className="w-36 sm:w-48 shrink-0 p-3 sticky left-0 z-10 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex items-center shadow-xs">
                        <p className="text-xs font-bold text-gray-900 dark:text-white truncate" title={room.name}>
                          {room.name}
                        </p>
                      </div>

                      {/* Day Cells */}
                      <div className="flex">
                        {calendarDays.map((d) => {
                          const dateStr = formatDateStr(d);
                          const isOccupied = isRoomOccupiedOnDate(room.id, dateStr);
                          const price = getRoomDailyPrice(room, dateStr);
                          const isPast = dateStr < formatDateStr(today);
                          const isSelectedStart = pendingStart?.roomId === room.id && pendingStart?.dateStr === dateStr;

                          return (
                            <div
                              key={dateStr}
                              style={{ width: `${columnWidth}px` }}
                              onClick={() => !isPast && handleCellClick(room, dateStr, isOccupied)}
                              className={`shrink-0 h-11 p-0.5 border-r border-gray-100 dark:border-gray-800/60 flex flex-col items-center justify-center transition-all ${
                                isPast
                                  ? 'bg-gray-100/40 dark:bg-gray-900/40 text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-40'
                                  : isOccupied
                                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-70'
                                  : isSelectedStart
                                  ? 'bg-blue-600 text-white cursor-pointer ring-2 ring-blue-600 z-10'
                                  : 'bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/50 cursor-pointer'
                              }`}
                            >
                              {isOccupied || isPast ? (
                                <span className="text-2xs font-semibold text-gray-400 dark:text-gray-500">-</span>
                              ) : (
                                <span
                                  className={`text-2xs font-bold tracking-tight ${
                                    isSelectedStart ? 'text-white' : 'text-emerald-700 dark:text-emerald-300'
                                  }`}
                                >
                                  ₹{price}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Slide-Over Booking Form Drawer */}
      {selectedRange && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-xs flex justify-end animate-fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-gray-900 h-full shadow-2xl flex flex-col justify-between border-l border-gray-200 dark:border-gray-800 animate-slide-in-right">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Complete Your Booking</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{property.name}</p>
              </div>
              <button
                onClick={() => setSelectedRange(null)}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleConfirmBooking} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {submitError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300">
                  {submitError}
                </div>
              )}

              {/* Selected Stay Summary Card */}
              <div className="bg-blue-50/60 dark:bg-blue-950/40 rounded-xl p-4 border border-blue-200 dark:border-blue-800/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 dark:text-blue-200">{selectedRange.roomName}</span>
                  <Badge variant="info">{selectedRange.nights} Night{selectedRange.nights > 1 ? 's' : ''}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-2xs text-gray-500 dark:text-gray-400 block">Check-in</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {formatDateDisplay(selectedRange.checkin)}
                    </span>
                    <span className="text-3xs text-gray-400 block">From {property.checkin_time}</span>
                  </div>
                  <div>
                    <span className="text-2xs text-gray-500 dark:text-gray-400 block">Check-out</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {formatDateDisplay(selectedRange.checkout)}
                    </span>
                    <span className="text-3xs text-gray-400 block">Until {property.checkout_time}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-blue-200/60 dark:border-blue-800/60 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Total Payable on Arrival:</span>
                  <span className="text-base font-black text-blue-700 dark:text-blue-300">
                    ₹{selectedRange.totalTariff.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Guest Details Fields */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Guest Information
                </h4>

                <div>
                  <label className="block text-2xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="w-full h-10 px-3 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-2xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Phone / WhatsApp *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="+91 98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full h-10 px-3 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-2xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Email Address (Optional)
                    </label>
                    <input
                      type="email"
                      placeholder="rahul@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-10 px-3 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-2xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Number of Guests
                  </label>
                  <select
                    value={numGuests}
                    onChange={(e) => setNumGuests(Number(e.target.value))}
                    className="w-full h-10 px-3 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={1}>1 Guest</option>
                    <option value={2}>2 Guests</option>
                    <option value={3}>3 Guests</option>
                    <option value={4}>4 Guests</option>
                    <option value={5}>5+ Guests</option>
                  </select>
                </div>

                <div>
                  <label className="block text-2xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Special Requests / Expected Arrival Time
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Arriving around 3 PM, need extra pillow"
                    value={specialRequests}
                    onChange={(e) => setSpecialRequests(e.target.value)}
                    className="w-full p-3 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Payment Option: Offline Pay on Arrival */}
              <div className="space-y-2.5 pt-3 border-t border-gray-200 dark:border-gray-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Payment Method
                </h4>

                <div className="p-3.5 rounded-xl border-2 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-900 dark:text-white">
                      Pay at Property (Cash / UPI / Card on Arrival)
                    </p>
                    <p className="text-2xs text-gray-600 dark:text-gray-400">
                      No online payment needed right now. Your reservation will be immediately confirmed and dates locked on our calendar.
                    </p>
                    {property.upi_id && (
                      <p className="text-2xs text-emerald-700 dark:text-emerald-300 font-medium pt-1">
                        💡 Advance UPI: <span className="font-mono font-bold">{property.upi_id}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 flex items-center gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={submitting}
                  className="flex-1 h-11 text-xs font-bold justify-center"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 me-2 animate-spin" />
                      Locking Reservation...
                    </>
                  ) : (
                    <>
                      Confirm Reservation (₹{selectedRange.totalTariff.toLocaleString('en-IN')})
                      <ArrowRight className="w-4 h-4 ms-2" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Voucher Modal */}
      {confirmation && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4 animate-scale-up">
            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-black text-gray-900 dark:text-white">Reservation Confirmed!</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                We've locked your room and notified the property manager.
              </p>
              <div className="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-mono font-bold text-gray-800 dark:text-gray-200">
                Ref: {confirmation.reference_number}
              </div>
            </div>

            {/* Voucher Details */}
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-4 border border-gray-200 dark:border-gray-700 space-y-2.5 text-xs">
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
                  {formatDateDisplay(confirmation.checkin_date)} $\to$ {formatDateDisplay(confirmation.checkout_date)} ({confirmation.nights}N)
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-2">
                <span className="text-gray-500">Total Tariff</span>
                <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                  ₹{confirmation.total_tariff.toLocaleString('en-IN')} (Pay on Arrival)
                </span>
              </div>
              {confirmation.address && (
                <div className="flex justify-between items-start pt-1">
                  <span className="text-gray-500 shrink-0">Address</span>
                  <span className="text-right text-gray-800 dark:text-gray-200">{confirmation.address}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  const text = `🏨 Booking Confirmation (${confirmation.property_name})\nRef: ${confirmation.reference_number}\nRoom: ${confirmation.room_name}\nDates: ${formatDateDisplay(confirmation.checkin_date)} to ${formatDateDisplay(confirmation.checkout_date)}\nTotal: ₹${confirmation.total_tariff}\nGuest: ${confirmation.guest_name}`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                }}
                className="flex-1 justify-center h-10 text-xs font-bold"
              >
                <Share2 className="w-4 h-4 me-1.5" />
                Share on WhatsApp
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  setConfirmation(null);
                  setSelectedRange(null);
                }}
                className="h-10 text-xs font-semibold justify-center"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
