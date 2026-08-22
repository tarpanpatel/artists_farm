import React, { useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, Calendar, LogOut, Bell, User, Globe, Share2 } from 'lucide-react';
import { Popover } from './Popover';
import { Guest } from '../types';
import { BookingDetailsModal } from './BookingDetailsModal';
import { ConvertOtaBookingModal } from './ConvertOtaBookingModal';
import { KpiCard } from './KpiCard';
import { getPropertySlug } from '../services/api';
import { useToast } from './ToastContext';
import { shareTextContent } from '../utils/shareText';
import { t } from '../i18n/en';

interface TodayOverviewProps {
  guests: Guest[];
  rooms?: Array<{ id: number; name: string; slug: string }>;
  isMultiKeyProperty?: boolean;
  kitchenModuleEnabled?: boolean;
  onNavigateToRoom?: (roomSlug: string) => void;
  onNavigate?: (tab: any, menuItemKey?: string) => void;
  onAddBooking?: () => void;
  onAddGuest?: (guest: Guest) => void;
  onUpdateGuest?: (guest: Guest) => void | Promise<void>;
  onDeleteGuest?: (guestId: string) => void | Promise<void>;
  onCheckInGuest?: (guestId: string) => void;
  onGuestVerificationUpdated?: (guestId: string) => void;
  onCFormFiledUpdated?: (guestId: string, filedAt: string | null) => void;
  onCheckout?: (guestId: string) => void;
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
  serviceRequests?: any[];
}

export const TodayOverview: React.FC<TodayOverviewProps> = ({
  guests,
  rooms = [],
  isMultiKeyProperty = false,
  kitchenModuleEnabled = true,
  onNavigateToRoom: _onNavigateToRoom,
  onNavigate: _onNavigate,
  onAddBooking,
  onAddGuest,
  onUpdateGuest,
  onDeleteGuest,
  onCheckout,
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
  serviceRequests = [],
}) => {
  const { showToast } = useToast();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);

  // Public "Share Menu" link (food_menu.php via the /food_menu/{slug}/
  // rewrite in .htaccess) - lives on the dashboard rather than buried in
  // Edit Food Menu, since this is a "hand it to a guest right now" action,
  // not a menu-editing one. getPropertySlug() reads straight from the URL
  // (already imported/used elsewhere in this file), so no new prop needed.
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

  // OTA-synced blocked dates (Airbnb/Booking.com/etc via connected iCal
  // feeds) - same fetch OperationalDashboard.tsx already does for single
  // properties; this multi-key calendar never had it at all (found 14 Aug
  // 2026), so a room's iCal-blocked dates never showed here regardless of
  // how many feeds were connected. get_blocked_dates itself already expands
  // a MULTI_KEY parent to include all its rooms, but the room-level
  // `room_id` on each returned event is what actually scopes a block to one
  // room's own row below.
  const [blockedDates, setBlockedDates] = useState<Array<{
    event_start: string;
    event_end: string;
    event_title: string;
    external_event_id: string;
    room_id?: number;
    reservation_url?: string;
    source?: string;
    source_label?: string;
  }>>([]);
  const [otaConversionTarget, setOtaConversionTarget] = useState<{ block: (typeof blockedDates)[number]; roomName: string; blockedDateStrings: string[] } | null>(null);

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

  // Rolling window instead of a fixed calendar month (14 Aug 2026 fix): this
  // used to be locked to whichever single calendar month currentMonth/
  // currentYear pointed at (columns 1..daysInMonth only, matching a real
  // date only by coincidence of "today" being that month) - so dates from
  // the next month were never visible without clicking the next-month
  // arrow, even one day before month-end. Now a wide rolling window
  // (PAST_BUFFER_DAYS back, FUTURE_BUFFER_DAYS forward) so the user can
  // freely scroll through past and future months with the native
  // horizontal scrollbar, no arrow-clicking needed for typical use - the
  // arrows just page the whole window further out for longer trips.
  // BUG (found 14 Aug 2026): this used to be a hardcoded `64` (the nominal
  // px value of the day columns' `w-16` Tailwind class at the default 16px
  // root font-size). This app's root font-size is actually 14px, so `w-16`
  // (4rem) renders at 56px, not 64 - every place that did day-index*64 math
  // (capsule left/width, the visible-month-label calc) silently drifted
  // further and further from where the day columns actually are the more
  // days out from the window start it measured, while the columns
  // themselves (plain CSS, unaffected) rendered correctly. That's what
  // made checked-out bookings look like they were sitting near "today"
  // instead of where they actually are, and made the month label fail to
  // pick up the next month even once it was well into view. Now measured
  // from the real rendered column below instead of assumed.
  const [columnWidth, setColumnWidth] = useState(64);
  const columnWidthRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const w = columnWidthRef.current?.getBoundingClientRect().width;
      if (w) setColumnWidth(w);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const PAST_BUFFER_DAYS = 60;
  const FUTURE_BUFFER_DAYS = 89;
  const WINDOW_DAYS = PAST_BUFFER_DAYS + FUTURE_BUFFER_DAYS + 1; // + today itself

  const [windowStart, setWindowStart] = useState<Date>(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - PAST_BUFFER_DAYS);
    return d;
  });

  const navigateWindow = (direction: number) => {
    // Page by ~a month at a time - the window is already wide enough for
    // ordinary scrolling, this is just for reaching further out.
    setWindowStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + direction * 30);
      return d;
    });
  };

  const isSameDate = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const scrollRef = useRef<HTMLDivElement>(null);
  // Header label reflects whichever month(s) are ACTUALLY scrolled into
  // view right now (not a fixed date range) - "August" while only August
  // columns are visible, "August - September" while the view straddles
  // both, then "September" once August scrolls out. Recomputed on every
  // scroll event.
  const [visibleMonthLabel, setVisibleMonthLabel] = useState('');

  const monthYearLabel = (d: Date) => d.toLocaleString('default', { month: 'long', year: 'numeric' });
  const monthOnlyLabel = (d: Date) => d.toLocaleString('default', { month: 'long' });

  const updateVisibleMonthLabel = (days: Date[]) => {
    const el = scrollRef.current;
    if (!el || days.length === 0) return;
    const startIdx = Math.max(0, Math.floor(el.scrollLeft / columnWidth));
    const endIdx = Math.min(
      days.length - 1,
      Math.max(startIdx, Math.ceil((el.scrollLeft + el.clientWidth) / columnWidth) - 1)
    );
    const startDate = days[startIdx];
    const endDate = days[endIdx];
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

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const todaysArrivals = guests.filter((g) => (g.checkinDate || '').split(' ')[0] === todayStr).length;
  const todaysDepartures = guests.filter((g) => (g.expectedCheckout || '').split(' ')[0] === todayStr).length;
  const pendingRequests = (serviceRequests || []).filter((r) => r.status === 'Pending').length;

  const inHouseCount = useMemo(() => {
    return guests.filter((g) => {
      const status = String(g.status || '').trim().toLowerCase();
      if (status !== 'active' && status !== 'checked in') return false;
      const checkinDate = new Date(g.checkinDate);
      const checkoutDate = new Date(g.expectedCheckout);
      checkinDate.setHours(0, 0, 0, 0);
      checkoutDate.setHours(0, 0, 0, 0);
      return today >= checkinDate && today < checkoutDate;
    }).length;
  }, [guests, today]);

  const calendarGuests = useMemo(() => {
    return guests.filter((g) => {
      const status = String(g.status || '').trim().toLowerCase();
      return !['cancelled', 'canceled'].includes(status);
    });
  }, [guests]);

  const isCheckedOutStatus = (status: any) => {
    const s = String(status || '').trim().toLowerCase();
    return s === 'checkedout' || s === 'checked out';
  };

  const getGuestPendingReasons = (guest: any): string[] => {
    const reasons: string[] = [];
    const status = String(guest.status || '').trim().toLowerCase();
    const isCheckedOut = status === 'checkedout' || status === 'checked out';
    if (isCheckedOut || status === 'cancelled' || status === 'canceled') return reasons;

    const isCheckedIn = status === 'active' || status === 'checked in' || status === 'checkedin';
    const isBooked = !isCheckedIn;

    // Check if this is an upcoming booking (arrival date is in the future)
    let isUpcoming = false;
    if (isBooked && guest.checkinDate) {
      const checkinDate = new Date(guest.checkinDate);
      checkinDate.setHours(0, 0, 0, 0);
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      if (todayStart < checkinDate) {
        isUpcoming = true;
      }
    }

    // For upcoming bookings (guest has not arrived yet), ID, C-Form, and check-in are not pending
    if (isUpcoming) {
      return reasons;
    }

    // 1. ID Upload Pending (only for checked-in guests or guests arriving today/overdue)
    if (guest.idVerificationStatus !== 'Complete') {
      reasons.push('ID Pending');
    }

    // 2. Check-in Pending (Arrival date was today or earlier, but stay is not checked in)
    if (isBooked && guest.checkinDate) {
      const checkinDate = new Date(guest.checkinDate);
      checkinDate.setHours(0, 0, 0, 0);
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      if (todayStart >= checkinDate) {
        reasons.push('Check-in Pending');
      }
    }

    // 3. Checkout Pending (Expected checkout is today or earlier, but still checked in)
    if (isCheckedIn && guest.expectedCheckout) {
      const checkoutDate = new Date(guest.expectedCheckout);
      checkoutDate.setHours(0, 0, 0, 0);
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      if (todayStart >= checkoutDate) {
        reasons.push('Checkout Pending');
      }
    }

    // 4. C-Form Pending (Foreign guest without filed C-Form arriving today or currently checked in)
    if (guest.isForeignGuest && !guest.cFormFiledAt && !guest.cFormNumber && !(guest as any).c_form_number) {
      reasons.push('C-Form Pending');
    }

    return reasons;
  };

  const getGuestsForRoom = (roomId: number, roomName?: string) => {
    return calendarGuests
      .filter((guest) => {
        if (roomId) {
          const guestRoomId = (guest as any).roomId || (guest as any).room_id;
          if (guestRoomId && Number(guestRoomId) === Number(roomId)) return true;
        }
        if (roomName && guest.roomNumber === roomName) return true;
        return false;
      })
      .sort((a, b) => new Date(a.checkinDate).getTime() - new Date(b.checkinDate).getTime());
  };

  const getGuestColor = (_guestId: any, status?: any) => {
    if (isCheckedOutStatus(status)) {
      return 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600';
    }
    return 'bg-blue-600 dark:bg-blue-600 hover:bg-blue-700 text-white border border-blue-700/30';
  };

  const daysArray = useMemo(
    () => Array.from({ length: WINDOW_DAYS }, (_, i) => {
      const d = new Date(windowStart);
      d.setDate(d.getDate() + i);
      return d;
    }),
    [windowStart]
  );
  const windowEnd = daysArray[daysArray.length - 1];

  // Column that should sit at the left edge on initial view: "today - 2
  // days" (only meaningful right after mount/paging, while today is still
  // inside the buffer - falls back to the very start of the window
  // otherwise). Referenced by the header cell below and scrolled to via
  // scrollIntoView in the layout effect underneath it.
  const todayIdx = daysArray.findIndex((d) => isSameDate(d, today));
  const scrollTargetIdx = todayIdx >= 0 ? Math.max(0, todayIdx - 2) : 0;
  const scrollTargetRef = useRef<HTMLDivElement>(null);

  // BUG (found 14 Aug 2026): the previous approach computed a pixel offset
  // by hand (targetIdx * COLUMN_WIDTH) and applied it via a bare
  // setTimeout(..., 50) - a guess at how long layout takes, not a real
  // signal that it's actually safe to scroll yet. On a slower/first paint
  // (real data still loading, rooms not rendered yet, etc.) 50ms wasn't
  // always enough, so the scroll landed at whatever position the browser's
  // default (0, or mid-scroll from a still-settling layout) happened to be
  // - reported as the view opening days away from "today" instead of at it,
  // inconsistently between loads. scrollIntoView in a layout effect lets
  // the browser itself handle "is this actually laid out yet" - it runs
  // synchronously after DOM mutations, before paint, so there's no visible
  // jump and no timing to guess at. `block: 'nearest'` stops it from also
  // vertically scrolling the whole page to center this row.
  useLayoutEffect(() => {
    scrollTargetRef.current?.scrollIntoView({ inline: 'start', block: 'nearest' });
    updateVisibleMonthLabel(daysArray);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysArray]);

  return (
    <div className="today-overview space-y-6">
      {/* Sleek Dashboard Header with Top Right Add Booking Button */}
      <div className="today-overview__page-header flex flex-row items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="min-w-0 flex-1">
          <h1 className="today-overview__page-title text-base font-semibold text-slate-900 dark:text-white tracking-tight truncate">
            {t('dashboard_heading', 'Dashboard')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium line-clamp-1 sm:line-clamp-none">
            {t('dashboard_subheading', "Who's arriving, what's ready, and what needs you now.")}
          </p>
        </div>
        <div className="today-overview__header-actions flex items-center gap-2 shrink-0">
          {kitchenModuleEnabled && (
            <button
              onClick={handleShareFoodMenu}
              className="text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 focus:ring-4 focus:ring-slate-200 dark:focus:ring-slate-600 font-semibold rounded-lg text-xs px-3.5 py-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap"
            >
              <Share2 className="w-4 h-4" />
              <span>{t('share_food_menu_button', 'Share Menu')}</span>
            </button>
          )}
          {onAddBooking && (
            <button
              onClick={onAddBooking}
              className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-semibold rounded-lg text-xs px-3.5 py-2 flex items-center gap-2 shadow-md transition-all cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{t('add_booking_button', 'Add Booking')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Metric Blocks Grid - Sleek 1-Row Horizontal Cards */}
      <div className={`today-overview__metrics grid grid-cols-1 ${isMultiKeyProperty ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'} gap-2.5 md:gap-4`}>
        <KpiCard
          label="Arrivals"
          icon={Calendar}
          badge={{ text: 'Today', color: 'info' }}
          value={todaysArrivals}
        />
        <KpiCard
          label="Departures"
          icon={LogOut}
          badge={{ text: 'Today', color: 'warning' }}
          value={todaysDepartures}
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
          value={pendingRequests}
        />
      </div>

      <div className="today-overview__calendar bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md p-4 sm:p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="today-overview__title text-base font-semibold text-slate-900 dark:text-white">{visibleMonthLabel}</h2>
          <div className="flex items-center gap-2">
          <button
            onClick={() => navigateWindow(-1)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => navigateWindow(1)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={() => updateVisibleMonthLabel(daysArray)}
        className="today-overview__scroll-container overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg"
      >
        <div className="min-w-max">
          <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
            {/* w-24 (not w-32) - MUST match each room row's own sticky
                room-name column width below (found 22 Aug 2026, reported as
                "booking dates don't match what I'm seeing"). The header and
                each room row are separate flex rows stacked vertically -
                nothing structurally forces their day-columns to align, so a
                header label column wider than the rows' own label column
                shifts every date header 32px to the right of the actual
                day-column grid lines the capsules are positioned against,
                making bookings appear to sit under the wrong date. */}
            <div className="w-24 min-w-24 sticky left-0 z-20 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700">
              Room
            </div>
            {daysArray.map((day, idx) => {
              const dayName = day.toLocaleString('default', { weekday: 'short' });
              const isToday = isSameDate(day, today);

              return (
                <div
                  key={day.toISOString()}
                  ref={(el) => {
                    if (idx === scrollTargetIdx) scrollTargetRef.current = el;
                    if (idx === 0) columnWidthRef.current = el;
                  }}
                  className={`w-16 min-w-16 shrink-0 px-1 py-1.5 text-center border-r transition-all ${
                    isToday
                      ? 'bg-blue-600 text-white shadow-sm border-blue-700 dark:border-blue-500 z-10'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600'
                  }`}
                >
                  <div className={`text-[8px] uppercase tracking-wider font-bold ${isToday ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>{dayName}</div>
                  <div className="text-sm font-extrabold leading-none mt-0.5">{day.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Room Rows */}
          {rooms && rooms.length > 0 ? (
            rooms.filter((r) => r.id !== undefined).map((room) => {
              const roomGuests = getGuestsForRoom(room.id, room.name);

              const parseLocalDate = (dateVal: any): Date => {
                if (dateVal instanceof Date) {
                  const d = new Date(dateVal);
                  d.setHours(0, 0, 0, 0);
                  return d;
                }
                const str = String(dateVal || '').split(' ')[0].split('T')[0];
                const parts = str.split('-');
                if (parts.length === 3) {
                  const y = parseInt(parts[0], 10);
                  const m = parseInt(parts[1], 10) - 1;
                  const d = parseInt(parts[2], 10);
                  return new Date(y, m, d, 0, 0, 0, 0);
                }
                const fallback = new Date(dateVal);
                fallback.setHours(0, 0, 0, 0);
                return fallback;
              };

              const getDaysDiff = (a: Date, b: Date): number => {
                const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
                const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
                return Math.round((utcA - utcB) / (24 * 60 * 60 * 1000));
              };

              // Filter guests overlapping the visible rolling window
              const activeWindowGuests = roomGuests.filter((guest) => {
                const checkinDate = parseLocalDate(guest.checkinDate);
                const checkoutDate = parseLocalDate(guest.expectedCheckout || guest.checkoutDate || guest.checkinDate);
                return checkinDate <= windowEnd && checkoutDate >= windowStart;
              });

              const roomBlockedDates = blockedDates.filter((bd) => {
                if (Number(bd.room_id) !== Number(room.id)) return false;
                const start = parseLocalDate(bd.event_start);
                const end = parseLocalDate(bd.event_end);
                return start <= windowEnd && end >= windowStart;
              });

              // Every date already spoken for in this room (any other guest stay,
              // or any other still-unclaimed OTA block), expanded to individual
              // day strings - fed to ConvertOtaBookingModal's DateRangePicker so
              // adjusting a converted booking's dates gets the same "already
              // taken" highlighting every other booking flow gets. Deliberately
              // not window-limited (unlike activeWindowGuests/roomBlockedDates
              // above, which only cover the visible scroll range) - a staff
              // member could legitimately pick dates outside today's scroll
              // position.
              const expandRangeToDayStrings = (startVal: any, endVal: any): string[] => {
                const days: string[] = [];
                const cur = parseLocalDate(startVal);
                const end = parseLocalDate(endVal);
                while (cur < end) {
                  days.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
                  cur.setDate(cur.getDate() + 1);
                }
                return days;
              };
              const roomOccupiedDateStrings = [
                ...roomGuests.flatMap((g) => expandRangeToDayStrings(g.checkinDate, g.expectedCheckout || g.checkoutDate || g.checkinDate)),
                ...blockedDates
                  .filter((bd) => Number(bd.room_id) === Number(room.id))
                  .flatMap((bd) => expandRangeToDayStrings(bd.event_start, bd.event_end)),
              ];

              type TimelineItem =
                | { kind: 'guest'; start: Date; end: Date; guest: Guest }
                | { kind: 'ota'; start: Date; end: Date; label: string; tooltip: string; block: (typeof blockedDates)[number] };

              const timelineItems: TimelineItem[] = [
                ...activeWindowGuests.map((guest): TimelineItem => ({
                  kind: 'guest',
                  start: parseLocalDate(guest.checkinDate),
                  end: parseLocalDate(guest.expectedCheckout || guest.checkoutDate || guest.checkinDate),
                  guest,
                })),
                ...roomBlockedDates.map((bd): TimelineItem => ({
                  kind: 'ota',
                  start: parseLocalDate(bd.event_start),
                  end: parseLocalDate(bd.event_end),
                  label: bd.source_label || bd.source || t('ota_blocked_label', 'Blocked'),
                  tooltip: t('ota_blocked_tooltip_convertible', '{{source}} - not yet a booking. Click to convert.').replace('{{source}}', bd.source_label || bd.source || 'external calendar'),
                  block: bd,
                })),
              ];

              // Sort by start date ascending
              timelineItems.sort((a, b) => a.start.getTime() - b.start.getTime());

              // Lane assignment algorithm for non-overlapping vertical alignment
              const laneEndDates: Date[] = [];
              const timelineLanesInfo = timelineItems.map((item) => {
                const clampedStart = item.start < windowStart ? windowStart : item.start;
                const clampedEnd = item.end > windowEnd ? new Date(windowEnd.getFullYear(), windowEnd.getMonth(), windowEnd.getDate() + 1) : item.end;
                const startCol = getDaysDiff(clampedStart, windowStart) + 1;
                const endCol = getDaysDiff(clampedEnd, windowStart) + 1;

                const span = Math.max(1, endCol - startCol);

                let nightlyRate = 0;
                if (item.kind === 'guest') {
                  const amount = (item.guest as any).totalCharge || (item.guest as any).totalAmount || (item.guest as any).total_charge || 0;
                  nightlyRate = Math.round(amount / Math.max(1, span));
                }

                let assignedLane = 0;
                let foundLane = false;
                for (let l = 0; l < laneEndDates.length; l++) {
                  if (laneEndDates[l] <= item.start) {
                    assignedLane = l;
                    laneEndDates[l] = item.end;
                    foundLane = true;
                    break;
                  }
                }
                if (!foundLane) {
                  assignedLane = laneEndDates.length;
                  laneEndDates.push(item.end);
                }

                return {
                  item,
                  startCol,
                  span,
                  nightlyRate,
                  lane: assignedLane,
                };
              });

              const maxLanes = Math.max(1, laneEndDates.length);
              const laneHeight = 32;
              const capsuleHeight = 26;
              const minRowHeight = 44;
              const dynamicHeight = Math.max(minRowHeight, maxLanes * laneHeight + 12);

              return (
                <div
                  key={room.id}
                  className="flex border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition"
                  style={{ height: `${dynamicHeight}px` }}
                >
                  {/* Room Name */}
                  <div className="w-24 min-w-24 px-2 py-0 font-semibold text-slate-900 dark:text-white text-xs sticky left-0 bg-slate-50 dark:bg-slate-800/50 border-r border-slate-100 dark:border-slate-700/50 flex items-center z-30 shrink-0">
                    {room.name}
                  </div>

                  {/* Days Grid - Background with diagonal stripes */}
                  <div className="flex relative flex-1 overflow-hidden" style={{ width: `${daysArray.length * columnWidth}px`, minWidth: `${daysArray.length * columnWidth}px` }}>
                    {daysArray.map((day) => {
                      const isToday = isSameDate(day, today);
                      return (
                        <div
                          key={`bg-${day.toISOString()}`}
                          className={`w-16 min-w-16 shrink-0 border-r transition ${
                            isToday
                              ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-200/60 dark:border-blue-900/40'
                              : 'border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-800/30'
                          }`}
                        />
                      );
                    })}

                    {/* Spanning capsules overlaid */}
                    <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
                      {timelineLanesInfo.map((info, idx) => {
                        const topOffset = (dynamicHeight - maxLanes * laneHeight) / 2 + info.lane * laneHeight + (laneHeight - capsuleHeight) / 2;
                        const commonStyle = {
                          left: `${(info.startCol - 1) * columnWidth + 3}px`,
                          width: `${Math.max(48, info.span * columnWidth - 6)}px`,
                          top: `${topOffset}px`,
                          height: `${capsuleHeight}px`,
                        };

                        if (info.item.kind === 'ota') {
                          const otaItem = info.item;
                          return (
                            <Popover
                              key={`ota-${idx}`}
                              trigger="hover"
                              placement="top"
                              title={
                                <h4 className="font-semibold text-gray-900 dark:text-white text-xs truncate">{otaItem.label}</h4>
                              }
                              content={
                                <div className="w-64 p-3 space-y-1 text-xs text-gray-600 dark:text-gray-300">
                                  <div>{otaItem.tooltip}</div>
                                  <div className="text-2xs text-blue-600 dark:text-blue-400 font-semibold pt-1">
                                    Click to convert into booking
                                  </div>
                                </div>
                              }
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  const ownDays = new Set(expandRangeToDayStrings(otaItem.block.event_start, otaItem.block.event_end));
                                  setOtaConversionTarget({
                                    block: otaItem.block,
                                    roomName: room.name,
                                    blockedDateStrings: roomOccupiedDateStrings.filter((d) => !ownDays.has(d)),
                                  });
                                }}
                                className="px-2.5 rounded-md font-semibold cursor-pointer absolute bg-slate-700 dark:bg-slate-700 hover:bg-slate-600 text-white border border-slate-600 pointer-events-auto shadow-md flex items-center z-20 overflow-hidden transition-colors"
                                style={commonStyle}
                              >
                                <span className="font-semibold truncate text-[11px] leading-none">{otaItem.label}</span>
                              </button>
                            </Popover>
                          );
                        }

                        const guest = info.item.guest;
                        const isOtaBooking = !!(guest as any).otaSource;
                        const isCheckedOut = isCheckedOutStatus(guest.status);
                        const pendingReasons = getGuestPendingReasons(guest);
                        const hasPending = pendingReasons.length > 0;
                        return (
                          <Popover
                            key={`${guest.id}-${idx}`}
                            trigger="hover"
                            placement="top"
                            title={
                              <div className="flex items-center justify-between gap-2">
                                <h4 className="font-semibold text-gray-900 dark:text-white text-xs truncate">{guest.guestName}</h4>
                                {info.nightlyRate > 0 && (
                                  <span className="text-2xs font-bold text-blue-600 dark:text-blue-400 shrink-0">
                                    ₹{info.nightlyRate}/night
                                  </span>
                                )}
                              </div>
                            }
                            content={
                              <div className="w-64 p-3 text-xs space-y-1.5 text-gray-600 dark:text-gray-300">
                                <div className="flex items-center justify-between text-2xs">
                                  <span className="text-gray-500 dark:text-gray-400">Room:</span>
                                  <span className="font-semibold text-gray-900 dark:text-white">{room.name}</span>
                                </div>
                                <div className="flex items-center justify-between text-2xs">
                                  <span className="text-gray-500 dark:text-gray-400">Dates:</span>
                                  <span className="font-medium text-gray-700 dark:text-gray-200">
                                    {guest.checkinDate} → {guest.expectedCheckout || (guest as any).checkoutDate}
                                  </span>
                                </div>
                                {hasPending && (
                                  <div className="pt-1.5 border-t border-gray-100 dark:border-gray-700/60 text-amber-600 dark:text-amber-400 text-2xs font-semibold flex items-center gap-1.5">
                                    <span className="flex w-2 h-2 bg-yellow-400 dark:bg-yellow-300 rounded-full shrink-0 shadow-xs ring-1 ring-yellow-600/40" />
                                    <span>Action Pending: {pendingReasons.join(', ')}</span>
                                  </div>
                                )}
                              </div>
                            }
                          >
                            <div
                              className={`px-2.5 rounded-md font-semibold cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all absolute ${
                                isOtaBooking && !isCheckedOut
                                  ? 'bg-amber-600 dark:bg-amber-700 hover:bg-amber-700 text-white border border-amber-700/30'
                                  : getGuestColor(guest.id, guest.status)
                              } pointer-events-auto shadow-md flex items-center justify-between gap-1.5 z-20 overflow-hidden`}
                              style={commonStyle}
                              onClick={() => setSelectedGuest(guest)}
                            >
                              <span className="font-semibold truncate text-[11px] leading-none flex items-center gap-1.5 min-w-0">
                                {hasPending && (
                                  <span
                                    className="flex w-2.5 h-2.5 bg-yellow-400 dark:bg-yellow-300 rounded-full shrink-0 shadow-xs ring-1 ring-yellow-600/50"
                                  />
                                )}
                                {isOtaBooking && <Globe className="w-2.5 h-2.5 shrink-0" />}
                                <span className="truncate">{guest.guestName}</span>
                              </span>
                              <span className="text-[10px] font-medium opacity-90 whitespace-nowrap leading-none shrink-0">₹{info.nightlyRate}</span>
                            </div>
                          </Popover>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-slate-600 dark:text-slate-400">
              {t('today_no_rooms_message', 'No rooms available')}
            </div>
          )}
        </div>
      </div>

      {/* Multi-Calendar Legend Footer */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
          <span>{t('legend_heading', 'Legend:')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
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
            <span className="w-5 h-3.5 rounded-xs bg-slate-800 dark:bg-slate-900 border border-slate-600 inline-block shadow-md" />
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

      {selectedGuest && onUpdateGuest && (
        <BookingDetailsModal
          guest={selectedGuest}
          onClose={() => setSelectedGuest(null)}
          onSave={async (updated) => { await onUpdateGuest(updated); setSelectedGuest(updated); }}
          onDelete={onDeleteGuest ? async (id) => { await onDeleteGuest(id); setSelectedGuest(null); } : undefined}
          rooms={rooms}
          checkedInGuests={calendarGuests}
          propertyName={propertyName}
          propertyMapsLink={propertyMapsLink}
          propertyPhone={propertyPhone}
          propertyWhatsappTemplate={propertyWhatsappTemplate}
          propertyUpiId={propertyUpiId}
          propertyUpiQrCodeUrl={propertyUpiQrCodeUrl}
          propertyAddress={propertyAddress}
          propertyInstructions={propertyInstructions}
          propertyCheckinTime={propertyCheckinTime}
          propertyCheckoutTime={propertyCheckoutTime}
          onCheckout={onCheckout ? () => { onCheckout(selectedGuest.id); setSelectedGuest(null); } : undefined}
        />
      )}

      {otaConversionTarget && (
        <ConvertOtaBookingModal
          otaBlock={otaConversionTarget.block}
          roomNumber={otaConversionTarget.roomName}
          blockedDates={otaConversionTarget.blockedDateStrings}
          onClose={() => setOtaConversionTarget(null)}
          onConvert={(guest) => {
            onAddGuest?.(guest);
            setOtaConversionTarget(null);
            fetchBlockedDates();
          }}
        />
      )}
    </div>
  );
};

