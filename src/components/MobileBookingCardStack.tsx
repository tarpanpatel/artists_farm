import React, { useState, useMemo } from 'react';
import { Pencil, Eye, LogIn, LogOut, Users, IndianRupee, CheckCircle2, AlertCircle } from './icons/FlowbiteIcons';
import { Guest } from '../types';
import { Badge } from './Badge';
import { WhatsappIcon } from './icons/WhatsappIcon';
import { BookingContactActions } from './BookingContactActions';
import { useConfirm } from './ConfirmDialogContext';
import { isCFormGenuinelyFiled } from '../utils/cFormStatus';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { getWhatsAppPhone } from '../utils/phoneUtils';

interface MobileBookingCardStackProps {
  guests: Guest[];
  rooms?: any[];
  onSelectGuest?: (guestId: string) => void;
  onCheckoutGuest?: (guestId: string) => void;
  onOpenWhatsApp?: (guest: Guest) => void;
  onAddBooking?: () => void;
  selectedGuestId?: string;
  hideSearchAndFilter?: boolean;
  canEdit?: boolean;
  canCheckout?: boolean;
}

export const MobileBookingCardStack: React.FC<MobileBookingCardStackProps> = ({
  guests,
  rooms: _rooms = [],
  onSelectGuest,
  onCheckoutGuest,
  onOpenWhatsApp,
  onAddBooking: _onAddBooking,
  selectedGuestId,
  hideSearchAndFilter = false,
  canEdit = true,
  canCheckout = true,
}) => {
  const { confirm } = useConfirm();
  const [filterStatus, setFilterStatus] = useState<'all' | 'checked_in' | 'upcoming' | 'checked_out'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const handleOpenWhatsApp = async (phoneNumber: string) => {
    const guest = guests.find((g) => g.phoneNumber === phoneNumber);
    if (onOpenWhatsApp && guest) {
      onOpenWhatsApp(guest);
      return;
    }
    const confirmed = await confirm({
      title: 'Open WhatsApp chat?',
      message: `Open a WhatsApp chat with ${phoneNumber}?`,
      confirmText: 'Open WhatsApp',
      cancelText: 'Cancel',
      variant: 'info',
    });
    if (confirmed) {
      window.open(`https://wa.me/${getWhatsAppPhone(phoneNumber)}`, '_blank', 'noopener,noreferrer');
    }
  };

  const filteredGuests = useMemo(() => {
    return guests.filter((g) => {
      const statusLower = (g.status || '').toLowerCase();
      const matchesFilter =
        filterStatus === 'all'
          ? true
          : filterStatus === 'checked_in'
          ? statusLower === 'checked in' || statusLower === 'active'
          : filterStatus === 'upcoming'
          ? statusLower === 'booked' || statusLower === 'upcoming' || statusLower === 'reserved'
          : filterStatus === 'checked_out'
          ? statusLower === 'checked out' || statusLower === 'completed'
          : true;

      const q = searchQuery.toLowerCase().trim();
      const numOnly = q.replace(/^#/, '');
      const matchesSearch =
        !q ||
        (g.guestName || '').toLowerCase().includes(q) ||
        (g.roomNumber || '').toLowerCase().includes(q) ||
        (g.phoneNumber || '').toLowerCase().includes(q) ||
        (numOnly.length > 0 && String(g.id || '').includes(numOnly));

      return matchesFilter && matchesSearch;
    });
  }, [guests, filterStatus, searchQuery]);

  const counts = useMemo(() => {
    return {
      all: guests.length,
      checked_in: guests.filter((g) => ['checked in', 'active'].includes((g.status || '').toLowerCase())).length,
      upcoming: guests.filter((g) => ['booked', 'upcoming', 'reserved'].includes((g.status || '').toLowerCase())).length,
      checked_out: guests.filter((g) => ['checked out', 'completed'].includes((g.status || '').toLowerCase())).length,
    };
  }, [guests]);

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'checked in' || s === 'active') {
      return (
        <Badge variant="success" dot size="sm">
          Checked In
        </Badge>
      );
    }
    if (s === 'booked' || s === 'upcoming' || s === 'reserved') {
      return (
        <Badge variant="info" dot size="sm">
          Upcoming
        </Badge>
      );
    }
    if (s === 'cancelled') {
      return (
        <Badge variant="danger" dot size="sm">
          Cancelled
        </Badge>
      );
    }
    return (
      <Badge variant="neutral" dot size="sm">
        Checked Out
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search and Status Filters */}
      {!hideSearchAndFilter && (
        <div className="space-y-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by guest, room, or ID..."
            className="w-full text-xs px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                filterStatus === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('checked_in')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                filterStatus === 'checked_in'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              Checked In ({counts.checked_in})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('upcoming')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                filterStatus === 'upcoming'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              Upcoming ({counts.upcoming})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('checked_out')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                filterStatus === 'checked_out'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              Past ({counts.checked_out})
            </button>
          </div>
        </div>
      )}

      {/* Guest Card Stack */}
      {filteredGuests.length === 0 ? (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">
          No bookings found matching your criteria.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGuests.map((guest) => {
            const isSelected = selectedGuestId === guest.id;
            const isCheckedIn = (guest.status || '').toLowerCase() === 'checked in' || (guest.status || '').toLowerCase() === 'active';
            const totalTariff = Number(guest.totalAmount ?? guest.roomRate ?? 0);
            const advancePaid = Number(guest.advanceAmount ?? 0);
            const foodBill = Number(guest.foodBill ?? 0);
            const pendingDue = totalTariff - advancePaid + foodBill;

            return (
              <div
                key={guest.id}
                onClick={() => onSelectGuest?.(guest.id)}
                className={`bg-white dark:bg-gray-800 rounded-lg border transition-all p-4 sm:p-5 space-y-3 cursor-pointer ${
                  isSelected
                    ? 'border-blue-500 dark:border-blue-500 ring-2 ring-blue-500/20 shadow-md'
                    : 'border-gray-200 dark:border-gray-700 shadow-sm hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {/* Header Row: Guest Name, Room Pill, Guest Count, Status & Contact */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">{guest.guestName}</h4>
                      <span className="inline-flex items-center px-1.5 py-0.5 text-2xs font-semibold rounded bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                        #{guest.id}
                      </span>
                      {guest.roomNumber && (
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-semibold border border-blue-200 dark:border-blue-800">
                          {guest.roomNumber}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 text-xs font-semibold">
                        <Users className="w-3 h-3 text-emerald-500" />
                        {guest.numberOfGuests || 1} Person(s)
                      </span>
                      {guest.phoneNumber && (
                        <BookingContactActions
                          phoneNumber={guest.phoneNumber}
                          onOpenWhatsApp={handleOpenWhatsApp}
                        />
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 whitespace-nowrap">{getStatusBadge(guest.status)}</div>
                </div>

                {/* Sub-Grid: Check-In & Check-Out Dates */}
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    <LogIn className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[9px] text-slate-400 font-semibold uppercase">Check-In</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {guest.checkinDate ? formatDateDDMMYYYY(guest.checkinDate) : 'N/A'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    <LogOut className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[9px] text-slate-400 font-semibold uppercase">Check-Out</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {guest.checkoutDate || guest.expectedCheckout ? formatDateDDMMYYYY(guest.checkoutDate || guest.expectedCheckout) : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* C-Form Filing Badge (if foreign guest or past booking) */}
                {guest.isForeignGuest && (
                  <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/40 p-2 rounded-lg border border-slate-100 dark:border-slate-800 text-xs">
                    <span className="text-2xs text-slate-400 uppercase font-semibold">C-Form Filing:</span>
                    {isCFormGenuinelyFiled(guest) ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        <span>Filed ({formatDateDDMMYYYY(guest.cFormFiledAt)})</span>
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold text-[11px] inline-flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-amber-500" />
                        <span>Pending Filing</span>
                      </span>
                    )}
                  </div>
                )}

                {/* Financial Summary Bar: Clean Total, Total Paid, and Due ONLY if due */}
                <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-400 text-2xs uppercase font-semibold block">Total</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-0.5">
                      {totalTariff > 0 ? (
                        <>
                          <IndianRupee className="w-3 h-3 text-slate-400" />
                          {totalTariff.toLocaleString('en-IN')}
                        </>
                      ) : (
                        <span className="text-xs font-normal text-slate-400 italic">Not set</span>
                      )}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 text-2xs uppercase font-semibold block">Total Paid</span>
                    <span className={`font-bold flex items-center gap-0.5 ${advancePaid > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      <IndianRupee className="w-3 h-3" />
                      {advancePaid.toLocaleString('en-IN')}
                    </span>
                  </div>

                  {pendingDue > 0 && (
                    <div>
                      <span className="text-slate-400 text-2xs uppercase font-semibold block">Amount Due</span>
                      <span className="font-bold flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                        <IndianRupee className="w-3 h-3" />
                        {pendingDue.toLocaleString('en-IN')}
                      </span>
                    </div>
                  )}

                  {pendingDue < 0 && (
                    <div>
                      <span className="text-slate-400 text-2xs uppercase font-semibold block">Refund Due</span>
                      <span className="font-bold flex items-center gap-0.5 text-rose-600 dark:text-rose-400">
                        <IndianRupee className="w-3 h-3" />
                        {Math.abs(pendingDue).toLocaleString('en-IN')}
                      </span>
                    </div>
                  )}

                  {pendingDue === 0 && (totalTariff > 0 || advancePaid > 0) && (
                    <div>
                      <span className="text-slate-400 text-2xs uppercase font-semibold block">Status</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 text-xs">
                        <CheckCircle2 className="w-3 h-3" />
                        Settled
                      </span>
                    </div>
                  )}
                </div>

                {/* 44px Hit Target Bottom Action Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  {guest.phoneNumber && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenWhatsApp(guest.phoneNumber);
                      }}
                      aria-label="Open WhatsApp"
                      className="min-h-11 min-w-11 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center justify-center transition-colors shrink-0"
                    >
                      <WhatsappIcon className="w-4 h-4 text-emerald-600" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectGuest?.(guest.id);
                    }}
                    className="min-h-11 flex-1 px-3 py-2 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    {canEdit ? <Pencil className="w-4 h-4 text-blue-600 shrink-0" /> : <Eye className="w-4 h-4 text-blue-600 shrink-0" />}
                    <span>{canEdit ? 'Edit' : 'View'}</span>
                  </button>

                  {canCheckout && isCheckedIn && onCheckoutGuest && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCheckoutGuest(guest.id);
                      }}
                      className="min-h-11 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0 whitespace-nowrap"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Checkout</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
