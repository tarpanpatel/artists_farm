import React, { useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Save, Trash2, Share2, Printer } from 'lucide-react';
import * as htmlToImage from 'html-to-image';
import { Guest } from '../types';
import { DateRangePicker } from './DateRangePicker';
import { StyledSelect } from './StyledSelect';
import { useConfirm } from './ConfirmDialogContext';
import { useToast } from './ToastContext';
import { DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, renderWhatsappVoucherTemplate } from '../utils/whatsappVoucherTemplate';

interface TodayOverviewProps {
  guests: Guest[];
  rooms?: Array<{ id: number; name: string; slug: string }>;
  isMultiKeyProperty?: boolean;
  kitchenModuleEnabled?: boolean;
  onNavigateToRoom?: (roomSlug: string) => void;
  onUpdateGuest?: (guest: Guest) => void | Promise<void>;
  onDeleteGuest?: (guestId: string) => void | Promise<void>;
  propertyName?: string;
  propertyMapsLink?: string;
  propertyPhone?: string;
  propertyWhatsappTemplate?: string;
}

export const TodayOverview: React.FC<TodayOverviewProps> = ({
  guests,
  rooms = [],
  isMultiKeyProperty = false,
  kitchenModuleEnabled = true,
  onNavigateToRoom,
  onUpdateGuest,
  onDeleteGuest,
  propertyName = '',
  propertyMapsLink = '',
  propertyPhone = '',
  propertyWhatsappTemplate = '',
}) => {
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [isEditingBooking, setIsEditingBooking] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCheckin, setEditCheckin] = useState('');
  const [editCheckout, setEditCheckout] = useState('');
  const [editRoomId, setEditRoomId] = useState('');
  const [editGuests, setEditGuests] = useState('');
  const [editRoomRate, setEditRoomRate] = useState('');
  const [editTotal, setEditTotal] = useState('');
  const [editAdvance, setEditAdvance] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
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

  const getBlockedDateStrings = (currentGuest: Guest | null) => {
    if (!currentGuest) return [];
    const guestRoomId = (currentGuest as any).roomId || (currentGuest as any).room_id;
    const blockedStrings: string[] = [];
    activeGuests
      .filter((g) => g.id !== currentGuest.id)
      .filter((g) => {
        const gRoomId = (g as any).roomId || (g as any).room_id;
        return guestRoomId ? Number(gRoomId) === Number(guestRoomId) : g.roomNumber === currentGuest.roomNumber;
      })
      .forEach((g) => {
        const start = new Date(g.checkinDate);
        const end = new Date(g.expectedCheckout || g.checkoutDate || g.checkinDate);
        const current = new Date(start);
        while (current < end) {
          const y = current.getFullYear();
          const m = String(current.getMonth() + 1).padStart(2, '0');
          const d = String(current.getDate()).padStart(2, '0');
          blockedStrings.push(`${y}-${m}-${d}`);
          current.setDate(current.getDate() + 1);
        }
      });
    return blockedStrings;
  };

  const handleSaveEdit = async () => {
    if (!selectedGuest || !onUpdateGuest) return;
    const newRoom = rooms.find((r) => String(r.id) === editRoomId);
    const updated: any = {
      ...selectedGuest,
      guestName: editName,
      phoneNumber: editPhone,
      checkinDate: editCheckin,
      expectedCheckout: editCheckout,
      room_id: editRoomId ? parseInt(editRoomId, 10) : undefined,
      roomId: editRoomId ? parseInt(editRoomId, 10) : undefined,
      roomNumber: newRoom?.name || selectedGuest.roomNumber,
      no_of_guests: parseInt(editGuests, 10) || 1,
      base_room_rent: parseFloat(editRoomRate) || 0,
      total_charge: parseFloat(editTotal) || 0,
      advance_paid: parseFloat(editAdvance) || 0,
    };
    await onUpdateGuest(updated);
    setSelectedGuest(updated);
    setIsEditingBooking(false);
  };

  const handleDeleteBooking = async () => {
    if (!selectedGuest || !onDeleteGuest) return;
    const ok = await confirm({
      title: 'Delete Booking',
      message: `Delete ${selectedGuest.guestName}'s booking? This cannot be restored.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    setIsDeleting(true);
    try {
      await onDeleteGuest(selectedGuest.id);
      setSelectedGuest(null);
      showToast('Booking deleted', { type: 'success' });
    } catch (err) {
      showToast('Failed to delete booking. Please try again.', { type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  // "Share Voucher (PNG)" - same html-to-image pattern used on the booking
  // confirmation voucher and the billing receipt, so this modal offers the
  // same convenience without needing to reopen either of those flows.
  const handleShareVoucherPng = async () => {
    const voucherBox = document.getElementById('printableBookingDetailsContent');
    if (!voucherBox) return;
    const actionsBar = document.getElementById('printableBookingDetailsActionsBar');
    if (actionsBar) actionsBar.style.display = 'none';

    try {
      const blob = await htmlToImage.toBlob(voucherBox, { pixelRatio: 2, backgroundColor: '#ffffff' });
      if (!blob) return;
      const file = new File([blob], `Booking_${selectedGuest?.guestName || 'Details'}_${Date.now()}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Booking Details' });
      } else {
        const link = document.createElement('a');
        link.download = `Booking_${selectedGuest?.guestName || 'Details'}_${Date.now()}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
      }
    } catch (err) {
      showToast('Failed to generate image: ' + (err instanceof Error ? err.message : String(err)), { type: 'error' });
    } finally {
      if (actionsBar) actionsBar.style.display = '';
    }
  };

  // WhatsApp share - same wa.me + per-property customizable template as the
  // post-booking confirmation voucher, so it's reachable from here too
  // without going back through Guest Registration.
  const buildWhatsAppShareUrl = (guest: Guest) => {
    const digits = (guest.phoneNumber || '').replace(/\D/g, '');
    const phone = digits.length === 10 ? '91' + digits : digits;
    const message = renderWhatsappVoucherTemplate(propertyWhatsappTemplate || DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, {
      guest_name: guest.guestName,
      room_name: guest.roomNumber,
      property_name: propertyName || 'us',
      checkin_date: formatDate(guest.checkinDate?.split(' ')[0] || ''),
      checkout_date: formatDate(guest.expectedCheckout?.split(' ')[0] || ''),
      guest_count: String((guest as any).no_of_guests ?? 1),
      room_tariff: ((guest as any).per_night_charges || (guest as any).roomRate || 0).toFixed(2),
      advance_paid: ((guest as any).advance_paid || (guest as any).advanceAmount || (guest as any).advance || 0).toFixed(2),
      maps_link: propertyMapsLink,
      contact_phone: propertyPhone,
    });
    return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
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
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg relative">
        <div className="min-w-max">
          {/* Date Header */}
          <div className="flex bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600">
            <div className="w-24 px-2 py-1 font-semibold text-slate-700 dark:text-slate-300 text-xs sticky left-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-600 flex items-center z-30">
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
                            className={`px-2.5 rounded-md text-white font-semibold cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all absolute ${getGuestColor(
                              info.guest.id
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
              No rooms available
            </div>
          )}
        </div>
      </div>

      {/* Booking Details / Edit Popup */}
      {selectedGuest && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setSelectedGuest(null);
            setIsEditingBooking(false);
          }}
        >
          <div
            id="printableBookingDetailsContent"
            className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {isEditingBooking ? 'Edit Booking' : 'Booking Details'}
              </h2>
              <button
                onClick={() => {
                  setSelectedGuest(null);
                  setIsEditingBooking(false);
                }}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Guest Name</label>
                {isEditingBooking ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                ) : (
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{selectedGuest.guestName}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Room</label>
                {isEditingBooking ? (
                  <div className="mt-1">
                    <StyledSelect
                      value={editRoomId}
                      onChange={setEditRoomId}
                      options={rooms.map((room) => {
                        const newCheckin = new Date(editCheckin || selectedGuest.checkinDate);
                        const newCheckout = new Date(editCheckout || selectedGuest.expectedCheckout);
                        const occupiedByOther = activeGuests.some((g) => {
                          if (g.id === selectedGuest.id) return false;
                          const gRoomId = (g as any).roomId || (g as any).room_id;
                          if (Number(gRoomId) !== Number(room.id)) return false;
                          const gCheckin = new Date(g.checkinDate);
                          const gCheckout = new Date(g.expectedCheckout || g.checkoutDate || g.checkinDate);
                          return newCheckin < gCheckout && gCheckin < newCheckout;
                        });
                        return {
                          value: String(room.id),
                          label: `${room.name}${occupiedByOther ? ' (occupied these dates)' : ''}`,
                          disabled: occupiedByOther,
                        };
                      })}
                    />
                  </div>
                ) : (
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{selectedGuest.roomNumber}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Phone</label>
                {isEditingBooking ? (
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                ) : (
                  <p className="text-slate-900 dark:text-white">{selectedGuest.phoneNumber}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Check-in</label>
                  {isEditingBooking ? (
                    <button
                      type="button"
                      onClick={() => setShowDatePicker(true)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-left hover:border-blue-500 transition"
                    >
                      {editCheckin ? formatDate(editCheckin) : 'Add date'}
                    </button>
                  ) : (
                    <p className="text-slate-900 dark:text-white">{formatDate(selectedGuest.checkinDate?.split('T')[0] || '')}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Check-out</label>
                  {isEditingBooking ? (
                    <button
                      type="button"
                      onClick={() => setShowDatePicker(true)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-left hover:border-blue-500 transition"
                    >
                      {editCheckout ? formatDate(editCheckout) : 'Add date'}
                    </button>
                  ) : (
                    <p className="text-slate-900 dark:text-white">{formatDate(selectedGuest.expectedCheckout?.split('T')[0] || '')}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Guests</label>
                {isEditingBooking ? (
                  <input
                    type="number"
                    min={1}
                    value={editGuests}
                    onChange={(e) => setEditGuests(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                ) : (
                  <p className="text-slate-900 dark:text-white">{(selectedGuest as any).no_of_guests || 1} guest{(selectedGuest as any).no_of_guests !== 1 ? 's' : ''}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Room Rate</label>
                  {isEditingBooking ? (
                    <input
                      type="number"
                      min={0}
                      value={editRoomRate}
                      onChange={(e) => setEditRoomRate(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  ) : (
                    <p className="text-lg font-bold text-slate-900 dark:text-white">₹{(selectedGuest as any).per_night_charges || (selectedGuest as any).roomRate || 0}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Total</label>
                  {isEditingBooking ? (
                    <input
                      type="number"
                      min={0}
                      value={editTotal}
                      onChange={(e) => setEditTotal(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  ) : (
                    <p className="text-lg font-bold text-slate-900 dark:text-white">₹{(selectedGuest as any).totalCharge || (selectedGuest as any).totalAmount || (selectedGuest as any).total_charge || 0}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Advance Paid</label>
                  {isEditingBooking ? (
                    <input
                      type="number"
                      min={0}
                      value={editAdvance}
                      onChange={(e) => setEditAdvance(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  ) : (
                    <p className="text-emerald-600 dark:text-emerald-400 font-bold">₹{(selectedGuest as any).advance_paid || (selectedGuest as any).advanceAmount || (selectedGuest as any).advance || 0}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Pending</label>
                  <p className="text-amber-600 dark:text-amber-400 font-bold">
                    ₹{isEditingBooking
                      ? Math.max(0, (parseFloat(editTotal) || 0) - (parseFloat(editAdvance) || 0))
                      : Math.max(0, ((selectedGuest as any).totalCharge || (selectedGuest as any).totalAmount || (selectedGuest as any).total_charge || 0) - ((selectedGuest as any).advance_paid || (selectedGuest as any).advanceAmount || (selectedGuest as any).advance || 0))}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Status</label>
                <p className="text-emerald-600 dark:text-emerald-400 font-semibold">{selectedGuest.status}</p>
              </div>
            </div>

            <div id="printableBookingDetailsActionsBar">
              <div className="grid grid-cols-2 gap-3 mt-6">
                {isEditingBooking ? (
                  <>
                    <button
                      onClick={() => setIsEditingBooking(false)}
                      className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-bold rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      className="px-4 py-2 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 transition flex items-center justify-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setSelectedGuest(null)}
                      className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-bold rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => {
                        setEditName(selectedGuest.guestName || '');
                        setEditPhone(selectedGuest.phoneNumber || '');
                        setEditCheckin(selectedGuest.checkinDate?.split(' ')[0] || '');
                        setEditCheckout(selectedGuest.expectedCheckout?.split(' ')[0] || selectedGuest.checkoutDate?.split(' ')[0] || '');
                        setEditRoomId(String((selectedGuest as any).roomId || (selectedGuest as any).room_id || ''));
                        setEditGuests(String((selectedGuest as any).no_of_guests || 1));
                        setEditRoomRate(String((selectedGuest as any).per_night_charges || (selectedGuest as any).roomRate || 0));
                        setEditTotal(String((selectedGuest as any).totalCharge || (selectedGuest as any).totalAmount || (selectedGuest as any).total_charge || 0));
                        setEditAdvance(String((selectedGuest as any).advance_paid || (selectedGuest as any).advanceAmount || (selectedGuest as any).advance || 0));
                        setIsEditingBooking(true);
                      }}
                      className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white font-bold rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition flex items-center justify-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Edit
                    </button>
                  </>
                )}
              </div>

              {/* Share + Delete - only while just viewing, not mid-edit */}
              {!isEditingBooking && (
                <>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <a
                      href={buildWhatsAppShareUrl(selectedGuest)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition flex items-center justify-center gap-2 text-sm"
                    >
                      <Share2 className="w-4 h-4" />
                      Share via WhatsApp
                    </a>
                    <button
                      onClick={handleShareVoucherPng}
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-lg transition flex items-center justify-center gap-2 text-sm cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      Share PNG
                    </button>
                  </div>

                  {onDeleteGuest && (
                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                      <button
                        onClick={handleDeleteBooking}
                        disabled={isDeleting}
                        className="w-full px-4 py-2 text-red-600 dark:text-red-400 font-semibold rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition flex items-center justify-center gap-2 text-sm cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        {isDeleting ? 'Deleting...' : 'Delete Booking'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Date Range Picker for editing */}
      <DateRangePicker
        isOpen={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        checkinDate={editCheckin}
        checkoutDate={editCheckout}
        onCheckinChange={setEditCheckin}
        onCheckoutChange={setEditCheckout}
        onClear={() => {
          setEditCheckin('');
          setEditCheckout('');
        }}
        blockedDates={getBlockedDateStrings(selectedGuest)}
      />
    </div>
  );
};
