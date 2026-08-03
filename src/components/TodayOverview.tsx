import React, { useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Guest } from '../types';

interface TodayOverviewProps {
  guests: Guest[];
  rooms?: Array<{ id: number; name: string; slug: string }>;
  isMultiKeyProperty?: boolean;
  kitchenModuleEnabled?: boolean;
  onNavigateToRoom?: (roomSlug: string) => void;
}

export const TodayOverview: React.FC<TodayOverviewProps> = ({
  guests,
  rooms = [],
  isMultiKeyProperty = false,
  kitchenModuleEnabled = true,
  onNavigateToRoom,
}) => {
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  const activeGuests = useMemo(() => {
    return guests.filter((g) => g.status === 'Active');
  }, [guests]);

  const year = currentYear;
  const month = currentMonth;
  const monthName = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const dateOnly = dateStr.split(' ')[0];
      const parts = dateOnly.split('-');
      if (parts.length !== 3) return dateStr;
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    } catch {
      return dateStr;
    }
  };

  // Note: In a multi-key property, we pass room objects with IDs
  // For single properties, we match by room name
  const getGuestsForRoom = (roomId: number, roomName?: string) => {
    return activeGuests
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

  const getGuestColor = (guestId: any) => {
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

  return (
    <div className="p-4 space-y-4">
      {/* Header with navigation */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{monthName}</h2>
        <div className="flex gap-2">
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
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
        <div className="min-w-max">
          {/* Date Header */}
          <div className="flex bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600">
            <div className="w-24 px-2 py-1 font-semibold text-slate-700 dark:text-slate-300 text-xs sticky left-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-600 flex items-center z-20">
              Room
            </div>
            {daysArray.map((day) => {
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
                <div className="w-24 px-2 py-0 font-semibold text-slate-900 dark:text-white text-xs sticky left-0 bg-slate-50 dark:bg-slate-800/50 border-r border-slate-100 dark:border-slate-700/50 flex items-center z-10">
                  {room.name}
                </div>

                {/* Days Grid - Background with diagonal stripes */}
                <div className="flex relative flex-1" style={{ width: `${daysArray.length * 64}px` }}>
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
                  <div className="absolute inset-0 px-1 pointer-events-none">
                    {guestLanesInfo.map((info, idx) => {
                      const topOffset = (dynamicHeight - maxLanes * laneHeight) / 2 + info.lane * laneHeight + (laneHeight - capsuleHeight) / 2;

                      return (
                        <div
                          key={`${info.guest.id}-${idx}`}
                          className={`px-2.5 rounded-md text-white font-semibold cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all absolute ${getGuestColor(
                            info.guest.id
                          )} pointer-events-auto shadow-xs flex items-center justify-between gap-1 z-10 overflow-hidden`}
                          style={{
                            left: `${(info.startCol - 1) * 64 + 3}px`,
                            width: `${Math.max(48, info.span * 64 - 6)}px`,
                            top: `${topOffset}px`,
                            height: `${capsuleHeight}px`,
                          }}
                          onClick={() => {
                            setSelectedGuest(info.guest);
                            if (onNavigateToRoom) {
                              const guestRoomId = (info.guest as any).roomId || (info.guest as any).room_id;
                              const room = rooms?.find((r) => r.id === guestRoomId);
                              if (room) onNavigateToRoom(room.slug);
                            }
                          }}
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
              No rooms available
            </div>
          )}
        </div>
      </div>

      {/* Booking Details Popup */}
      {selectedGuest && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedGuest(null)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Booking Details</h2>
              <button
                onClick={() => setSelectedGuest(null)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Guest Name</label>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{selectedGuest.guestName}</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Room</label>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{selectedGuest.roomNumber}</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Phone</label>
                <p className="text-slate-900 dark:text-white">{selectedGuest.phoneNumber}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Check-in</label>
                  <p className="text-slate-900 dark:text-white">{formatDate(selectedGuest.checkinDate?.split('T')[0] || '')}</p>
                  {selectedGuest.checkinDate && selectedGuest.checkinDate.includes(' ') && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{selectedGuest.checkinDate.split(' ')[1]?.split(':').slice(0, 2).join(':')}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Check-out</label>
                  <p className="text-slate-900 dark:text-white">{formatDate(selectedGuest.expectedCheckout?.split('T')[0] || '')}</p>
                  {selectedGuest.expectedCheckout && selectedGuest.expectedCheckout.includes(' ') && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{selectedGuest.expectedCheckout.split(' ')[1]?.split(':').slice(0, 2).join(':')}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Guests</label>
                <p className="text-slate-900 dark:text-white">{(selectedGuest as any).no_of_guests || 1} guest{(selectedGuest as any).no_of_guests !== 1 ? 's' : ''}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Room Rate</label>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">₹{(selectedGuest as any).per_night_charges || (selectedGuest as any).roomRate || 0}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Total</label>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">₹{(selectedGuest as any).totalCharge || (selectedGuest as any).totalAmount || (selectedGuest as any).total_charge || 0}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Advance Paid</label>
                  <p className="text-emerald-600 dark:text-emerald-400 font-bold">₹{(selectedGuest as any).advance_paid || (selectedGuest as any).advanceAmount || (selectedGuest as any).advance || 0}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Pending</label>
                  <p className="text-amber-600 dark:text-amber-400 font-bold">
                    ₹{Math.max(0, ((selectedGuest as any).totalCharge || (selectedGuest as any).totalAmount || (selectedGuest as any).total_charge || 0) - ((selectedGuest as any).advance_paid || (selectedGuest as any).advanceAmount || (selectedGuest as any).advance || 0))}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Status</label>
                <p className="text-emerald-600 dark:text-emerald-400 font-semibold">{selectedGuest.status}</p>
              </div>
            </div>

            <button
              onClick={() => setSelectedGuest(null)}
              className="w-full mt-6 px-4 py-2 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
