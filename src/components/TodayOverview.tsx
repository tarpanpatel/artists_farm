import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, Calendar, LogOut, Bell, User, ArrowRight } from 'lucide-react';
import { Guest } from '../types';
import { BookingDetailsModal } from './BookingDetailsModal';
import { t } from '../i18n/en';

interface TodayOverviewProps {
  guests: Guest[];
  rooms?: Array<{ id: number; name: string; slug: string }>;
  isMultiKeyProperty?: boolean;
  kitchenModuleEnabled?: boolean;
  onNavigateToRoom?: (roomSlug: string) => void;
  onNavigate?: (tab: any, menuItemKey?: string) => void;
  onAddBooking?: () => void;
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
  serviceRequests?: any[];
}

export const TodayOverview: React.FC<TodayOverviewProps> = ({
  guests,
  rooms = [],
  isMultiKeyProperty = false,
  kitchenModuleEnabled: _kitchenModuleEnabled = true,
  onNavigateToRoom: _onNavigateToRoom,
  onNavigate,
  onAddBooking,
  onUpdateGuest,
  onDeleteGuest,
  propertyName = '',
  propertyMapsLink = '',
  propertyPhone = '',
  propertyWhatsappTemplate = '',
  serviceRequests = [],
}) => {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);

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
  const COLUMN_WIDTH = 64; // px - matches the w-16 column classes below
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
    const startIdx = Math.max(0, Math.floor(el.scrollLeft / COLUMN_WIDTH));
    const endIdx = Math.min(
      days.length - 1,
      Math.max(startIdx, Math.ceil((el.scrollLeft + el.clientWidth) / COLUMN_WIDTH) - 1)
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

  const getGuestColor = (guestId: any, status?: any) => {
    if (isCheckedOutStatus(status)) {
      return 'bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 border border-slate-400/40 dark:border-slate-500/40';
    }
    const colors = [
      'bg-teal-600 dark:bg-teal-600 hover:bg-teal-700 text-white border border-teal-700/30',
      'bg-emerald-600 dark:bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700/30',
      'bg-blue-600 dark:bg-blue-600 hover:bg-blue-700 text-white border border-blue-700/30',
      'bg-indigo-600 dark:bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-700/30',
      'bg-purple-600 dark:bg-purple-600 hover:bg-purple-700 text-white border border-purple-700/30',
      'bg-cyan-600 dark:bg-cyan-600 hover:bg-cyan-700 text-white border border-cyan-700/30',
    ];
    const numId = parseInt(String(guestId), 10) || 0;
    return colors[numId % colors.length];
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

  // Position the initial scroll so "today - 2 days" sits at the left edge
  // (only meaningful right after mount/paging, while today is still inside
  // the buffer), then compute the month label for wherever that lands.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const todayIdx = daysArray.findIndex((d) => isSameDate(d, today));
    const targetIdx = todayIdx >= 0 ? Math.max(0, todayIdx - 2) : 0;
    const timer = setTimeout(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollLeft = targetIdx * COLUMN_WIDTH;
      updateVisibleMonthLabel(daysArray);
    }, 50);
    return () => clearTimeout(timer);
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
        {onAddBooking && (
          <button
            onClick={onAddBooking}
            className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-semibold rounded-xl text-xs px-3.5 py-2 flex items-center gap-2 shadow-2xs transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{t('add_booking_button', 'Add Booking')}</span>
          </button>
        )}
      </div>

      {/* Metric Blocks Grid - Sleek 1-Row Horizontal Cards */}
      <div className={`today-overview__metrics grid grid-cols-1 ${isMultiKeyProperty ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'} gap-2.5 md:gap-4`}>
        {/* Arrivals Block */}
        <div className="bg-white dark:bg-slate-800 rounded-xl md:rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs hover:shadow-md transition-all p-3 md:p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/35 text-blue-600 dark:text-blue-400 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Arrivals:</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{todaysArrivals}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">checking in today</span>
              </div>
            </div>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate('guests')}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 flex items-center gap-1"
              title="View Bookings"
            >
              <span>Bookings</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Departures Block */}
        <div className="bg-white dark:bg-slate-800 rounded-xl md:rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs hover:shadow-md transition-all p-3 md:p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/35 text-amber-600 dark:text-amber-400 shrink-0">
              <LogOut className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Departures:</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{todaysDepartures}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">checking out today</span>
              </div>
            </div>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate('guests')}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 flex items-center gap-1"
              title="View Bookings"
            >
              <span>Bookings</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Guests in-house Block (Only for multi-key property) */}
        {isMultiKeyProperty && (
          <div className="bg-white dark:bg-slate-800 rounded-xl md:rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs hover:shadow-md transition-all p-3 md:p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/35 text-emerald-600 dark:text-emerald-400 shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Guests In-House:</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{inHouseCount}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">active guests</span>
                </div>
              </div>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('guests')}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                title="View Bookings"
              >
                <span>Guests</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Service Requests Block */}
        <div className="bg-white dark:bg-slate-800 rounded-xl md:rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs hover:shadow-md transition-all p-3 md:p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-900/35 text-red-600 dark:text-red-400 shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Service Requests:</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{pendingRequests}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">active requests</span>
              </div>
            </div>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate('service_requests')}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 flex items-center gap-1"
              title="View Service Requests"
            >
              <span>Requests</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Calendar View Section */}
      <div className="today-overview__calendar bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 space-y-4">
        {/* Header with navigation */}
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

      {/* Calendar Container with scroll */}
      <div
        ref={scrollRef}
        onScroll={() => updateVisibleMonthLabel(daysArray)}
        className="today-overview__calendar-scroll overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg relative"
      >
        <div className="min-w-max">
          {/* Date Header */}
          <div className="flex bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600">
            <div className="w-24 px-2 py-1 font-semibold text-slate-700 dark:text-slate-300 text-xs sticky left-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-600 flex items-center z-30">
              {t('room_column', 'Room')}
            </div>            {daysArray.map((day) => {
              const dayName = day.toLocaleString('default', { weekday: 'short' });
              const isToday = isSameDate(day, today);

              return (
                <div
                  key={day.toISOString()}
                  className={`w-16 px-1 py-1 text-center border-r border-slate-200 dark:border-slate-600 text-xs font-semibold ${
                    isToday
                      ? 'bg-teal-500 dark:bg-teal-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800'
                  }`}
                >
                  <div className="text-[8px] uppercase tracking-wide">{dayName}</div>
                  <div className={`text-sm font-semibold ${isToday ? 'text-white' : ''}`}>{day.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Room Rows */}
          {rooms && rooms.length > 0 ? (
            rooms.filter((r) => r.id !== undefined).map((room) => {
              const roomGuests = getGuestsForRoom(room.id, room.name);

              // Filter guests overlapping the visible rolling window
              const activeWindowGuests = roomGuests.filter((guest) => {
                const checkinDate = new Date(guest.checkinDate);
                const checkoutDate = new Date(guest.expectedCheckout || guest.checkoutDate || guest.checkinDate);
                return checkinDate <= windowEnd && checkoutDate >= windowStart;
              });

              // Sort by checkinDate ascending
              activeWindowGuests.sort(
                (a, b) => new Date(a.checkinDate).getTime() - new Date(b.checkinDate).getTime()
              );

              // Lane assignment algorithm for non-overlapping vertical alignment
              const dayMs = 24 * 60 * 60 * 1000;
              const laneEndDates: Date[] = [];
              const guestLanesInfo = activeWindowGuests.map((guest) => {
                const checkinDate = new Date(guest.checkinDate);
                const checkoutDate = new Date(guest.expectedCheckout || guest.checkoutDate || guest.checkinDate);

                // Clamp to the visible window, then convert to a 1-indexed
                // column position (matching the `(startCol - 1) * 64` pixel
                // offset used below) - was previously the raw day-of-month
                // number, now a position relative to windowStart since the
                // window can span a month boundary.
                const clampedCheckin = checkinDate < windowStart ? windowStart : checkinDate;
                const clampedCheckout = checkoutDate > windowEnd ? new Date(windowEnd.getTime() + dayMs) : checkoutDate;
                const startCol = Math.round((clampedCheckin.getTime() - windowStart.getTime()) / dayMs) + 1;
                const endCol = Math.round((clampedCheckout.getTime() - windowStart.getTime()) / dayMs) + 1;

                const span = Math.max(1, endCol - startCol);

                const amount = (guest as any).totalCharge || (guest as any).totalAmount || (guest as any).total_charge || 0;
                const nightlyRate = Math.round(amount / Math.max(1, span));

                let assignedLane = 0;
                let foundLane = false;
                for (let l = 0; l < laneEndDates.length; l++) {
                  if (laneEndDates[l] <= checkinDate) {
                    assignedLane = l;
                    laneEndDates[l] = checkoutDate;
                    foundLane = true;
                    break;
                  }
                }
                if (!foundLane) {
                  assignedLane = laneEndDates.length;
                  laneEndDates.push(checkoutDate);
                }

                return {
                  guest,
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
                  <div className="w-24 min-w-[6rem] px-2 py-0 font-semibold text-slate-900 dark:text-white text-xs sticky left-0 bg-slate-50 dark:bg-slate-800/50 border-r border-slate-100 dark:border-slate-700/50 flex items-center z-30 shrink-0">
                    {room.name}
                  </div>

                  {/* Days Grid - Background with diagonal stripes */}
                  <div className="flex relative flex-1 overflow-hidden" style={{ width: `${daysArray.length * 64}px`, minWidth: `${daysArray.length * 64}px` }}>
                    {daysArray.map((day) => {
                      const isToday = isSameDate(day, today);
                      return (
                        <div
                          key={`bg-${day.toISOString()}`}
                          className={`w-16 border-r border-slate-100 dark:border-slate-700/50 transition ${
                            isToday ? 'bg-teal-50/60 dark:bg-teal-900/15' : 'bg-white dark:bg-slate-800/30'
                          }`}
                          style={{
                            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(203, 213, 225, 0.08) 8px, rgba(203, 213, 225, 0.08) 16px)'
                          }}
                        />
                      );
                    })}

                    {/* Spanning capsules overlaid */}
                    <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
                      {guestLanesInfo.map((info, idx) => {
                        const topOffset = (dynamicHeight - maxLanes * laneHeight) / 2 + info.lane * laneHeight + (laneHeight - capsuleHeight) / 2;

                        return (
                          <div
                            key={`${info.guest.id}-${idx}`}
                            className={`px-2.5 rounded-md font-semibold cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all absolute ${getGuestColor(
                              info.guest.id,
                              info.guest.status
                            )} pointer-events-auto shadow-xs flex items-center justify-between gap-1 z-20 overflow-hidden`}
                            style={{
                              left: `${(info.startCol - 1) * 64 + 3}px`,
                              width: `${Math.max(48, info.span * 64 - 6)}px`,
                              top: `${topOffset}px`,
                              height: `${capsuleHeight}px`,
                            }}
                            onClick={() => setSelectedGuest(info.guest)}
                            title={`${info.guest.guestName} (₹${info.nightlyRate}/night)`}
                          >
                            <span className="font-semibold truncate text-[11px] leading-none">{info.guest.guestName}</span>
                            <span className="text-[10px] font-medium opacity-90 whitespace-nowrap leading-none shrink-0">₹{info.nightlyRate}</span>
                          </div>
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
        />
      )}
    </div>
  );
};

