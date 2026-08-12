import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, Calendar, LogOut, Bell, User } from 'lucide-react';
import { Guest } from '../types';
import { BookingDetailsModal } from './BookingDetailsModal';
import { t } from '../i18n/en';

interface TodayOverviewProps {
  guests: Guest[];
  rooms?: Array<{ id: number; name: string; slug: string }>;
  isMultiKeyProperty?: boolean;
  kitchenModuleEnabled?: boolean;
  onNavigateToRoom?: (roomSlug: string) => void;
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
  onAddBooking,
  onUpdateGuest,
  onDeleteGuest,
  propertyName = '',
  propertyMapsLink = '',
  propertyPhone = '',
  propertyWhatsappTemplate = '',
  serviceRequests = [],
}) => {
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const calendarScrollRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

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

  // The booking API uses `Booked` and `Checked In` as well as the legacy
  // `Active` state. A calendar represents room occupancy/availability, not
  // only the legacy active-resident state, so all non-final stays belong here.
  // Cancelled bookings never actually happened, so they stay excluded - but a
  // Checked Out stay is real history and should still show, just visually
  // distinct (greyed out) from what's actually happening right now, so a user
  // browsing past months isn't looking at a calendar that's silently missing
  // most of it.
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

  const year = currentYear;
  const month = currentMonth;
  const monthName = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Note: In a multi-key property, we pass room objects with IDs
  // For single properties, we match by room name
  const getGuestsForRoom = (roomId: number, roomName?: string) => {
    return calendarGuests
      .filter((guest) => {
        // Match by room_id if available (most reliable)
        if (roomId) {
          const guestRoomId = (guest as any).roomId || (guest as any).room_id;
          if (guestRoomId && Number(guestRoomId) === Number(roomId)) return true;
        }
        // Fallback to room name for backward compatibility
        if (roomName && guest.roomNumber === roomName) return true;
        return false;
      })
      .sort((a, b) => new Date(a.checkinDate).getTime() - new Date(b.checkinDate).getTime());
  };

  const getGuestColor = (guestId: any, status?: any) => {
    if (isCheckedOutStatus(status)) {
      // Deliberately flat/muted, distinct from every active-stay color below,
      // so a completed stay reads as "history" at a glance rather than
      // looking like it's still an active booking.
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

  const navigateMonth = (direction: number) => {
    let newMonth = currentMonth + direction;
    let newYear = currentYear;
    if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    }
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  };

  // Autoscroll calendar container to position the current day on the left
  useEffect(() => {
    if (!calendarScrollRef.current) return;
    const now = new Date();
    if (currentMonth === now.getMonth() && currentYear === now.getFullYear()) {
      const todayDate = now.getDate();
      const targetScrollLeft = Math.max(0, (todayDate - 1) * 64);
      const timer = setTimeout(() => {
        if (calendarScrollRef.current) {
          calendarScrollRef.current.scrollLeft = targetScrollLeft;
        }
      }, 50);
      return () => clearTimeout(timer);
    } else {
      if (calendarScrollRef.current) {
        calendarScrollRef.current.scrollLeft = 0;
      }
    }
  }, [currentMonth, currentYear]);

  return (
    <div className="today-overview space-y-6">
      {/* Sleek Dashboard Header with Top Right Add Booking Button */}
      <div className="today-overview__page-header flex flex-row items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight truncate">
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
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Arrivals:</span>
                <span className="text-sm font-extrabold text-slate-900 dark:text-white">{todaysArrivals}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">checking in today</span>
              </div>
            </div>
          </div>
        </div>

        {/* Departures Block */}
        <div className="bg-white dark:bg-slate-800 rounded-xl md:rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs hover:shadow-md transition-all p-3 md:p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/35 text-amber-600 dark:text-amber-400 shrink-0">
              <LogOut className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Departures:</span>
                <span className="text-sm font-extrabold text-slate-900 dark:text-white">{todaysDepartures}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">checking out today</span>
              </div>
            </div>
          </div>
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
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Guests In-House:</span>
                  <span className="text-sm font-extrabold text-slate-900 dark:text-white">{inHouseCount}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">active guests</span>
                </div>
              </div>
            </div>
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
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Service Requests:</span>
                <span className="text-sm font-extrabold text-slate-900 dark:text-white">{pendingRequests}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">active requests</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Calendar View Section */}
      <div className="today-overview__calendar bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 space-y-4">
        {/* Header with navigation */}
        <div className="flex justify-between items-center">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">{monthName}</h2>
          <div className="flex items-center gap-2">
          <button
            onClick={() => navigateMonth(-1)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => navigateMonth(1)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Calendar Container with scroll */}
      <div ref={calendarScrollRef} className="today-overview__calendar-scroll overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg relative">
        <div className="min-w-max">
          {/* Date Header */}
          <div className="flex bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600">
            <div className="w-24 px-2 py-1 font-semibold text-slate-700 dark:text-slate-300 text-xs sticky left-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-600 flex items-center z-30">
              {t('room_column', 'Room')}
            </div>            {daysArray.map((day) => {
              const date = new Date(year, month, day);
              const dayName = date.toLocaleString('default', { weekday: 'short' });
              const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();

              return (
                <div
                  key={day}
                  className={`w-16 px-1 py-1 text-center border-r border-slate-200 dark:border-slate-600 text-xs font-semibold ${
                    isToday
                      ? 'bg-teal-500 dark:bg-teal-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800'
                  }`}
                >
                  <div className="text-[8px] uppercase tracking-wide">{dayName}</div>
                  <div className={`text-sm font-bold ${isToday ? 'text-white' : ''}`}>{day}</div>
                </div>
              );
            })}
          </div>

          {/* Room Rows */}
          {rooms && rooms.length > 0 ? (
            rooms.filter((r) => r.id !== undefined).map((room) => {
              const roomGuests = getGuestsForRoom(room.id, room.name);

              const monthStart = new Date(year, month, 1);
              const monthEnd = new Date(year, month + 1, 0);

              // Filter guests overlapping current month
              const activeMonthGuests = roomGuests.filter((guest) => {
                const checkinDate = new Date(guest.checkinDate);
                const checkoutDate = new Date(guest.expectedCheckout || guest.checkoutDate || guest.checkinDate);
                return checkinDate <= monthEnd && checkoutDate >= monthStart;
              });

              // Sort by checkinDate ascending
              activeMonthGuests.sort(
                (a, b) => new Date(a.checkinDate).getTime() - new Date(b.checkinDate).getTime()
              );

              // Lane assignment algorithm for non-overlapping vertical alignment
              const laneEndDates: Date[] = [];
              const guestLanesInfo = activeMonthGuests.map((guest) => {
                const checkinDate = new Date(guest.checkinDate);
                const checkoutDate = new Date(guest.expectedCheckout || guest.checkoutDate || guest.checkinDate);

                let startDay = checkinDate < monthStart ? 1 : checkinDate.getDate();
                let endDay = checkoutDate > monthEnd ? daysInMonth + 1 : checkoutDate.getDate();

                const startCol = startDay;
                const span = Math.max(1, endDay - startDay);

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
                      const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
                      return (
                        <div
                          key={`bg-${day}`}
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
                            <span className="font-bold truncate text-[11px] leading-none">{info.guest.guestName}</span>
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

