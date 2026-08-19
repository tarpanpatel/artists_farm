import React, { useState, useMemo } from 'react';
import { Phone, MessageSquare, CreditCard, LogIn, LogOut, Users, Building, Search, IndianRupee, CheckCircle2, AlertCircle } from 'lucide-react';
import { Guest } from '../types';

interface MobileBookingCardStackProps {
  guests: Guest[];
  rooms?: any[];
  onSelectGuest?: (guestId: string) => void;
  onCheckoutGuest?: (guestId: string) => void;
  onOpenWhatsApp?: (guest: Guest) => void;
  onAddBooking?: () => void;
  selectedGuestId?: string;
  // BillingCheckout already renders its own Today/Upcoming/Past Bookings
  // tabs + search box above this component and hands down an
  // already-filtered guest list - showing this component's own search/
  // filter bar on top of that produced two independent, conflicting
  // filters stacked on the same list (e.g. picking "Checked-Out" here while
  // the outer tab is "Upcoming" showed 0 results, since the outer tab had
  // already excluded checked-out guests). Set true to suppress this
  // component's own bar when the caller already provides equivalent
  // filtering. GuestManagement's usage has no such outer UI, so it leaves
  // this false (default) and keeps this bar as its only filter.
  hideSearchAndFilter?: boolean;
}

export const MobileBookingCardStack: React.FC<MobileBookingCardStackProps> = ({
  guests,
  rooms: _rooms = [],
  onSelectGuest,
  onCheckoutGuest,
  onOpenWhatsApp,
  onAddBooking,
  selectedGuestId,
  hideSearchAndFilter = false,
}) => {
  const [filterStatus, setFilterStatus] = useState<'all' | 'checked_in' | 'upcoming' | 'checked_out'>('all');
  const [searchQuery, setSearchQuery] = useState('');

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
      const matchesSearch =
        !q ||
        (g.guestName || '').toLowerCase().includes(q) ||
        (g.roomNumber || '').toLowerCase().includes(q) ||
        (g.phoneNumber || '').toLowerCase().includes(q);

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
        <span className="inline-flex items-center gap-1 font-semibold px-2.5 py-0.5 rounded-full text-xs bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Checked In
        </span>
      );
    }
    if (s === 'booked' || s === 'upcoming' || s === 'reserved') {
      return (
        <span className="inline-flex items-center gap-1 font-semibold px-2.5 py-0.5 rounded-full text-xs bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          Upcoming
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 font-semibold px-2.5 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        {status}
      </span>
    );
  };

  return (
    <div className="mobile-booking-card-stack md:hidden space-y-4">
      {/* Search & Filter Header Bar */}
      {!hideSearchAndFilter && (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs space-y-3">
          {/* Search Input with Native Keyboard Keypad */}
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="search"
              inputMode="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guest, room, or phone..."
              className="w-full h-11 pl-9 pr-4 text-sm bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Horizontal Scrolling Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                filterStatus === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('checked_in')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                filterStatus === 'checked_in'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              Checked-In ({counts.checked_in})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('upcoming')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                filterStatus === 'upcoming'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              Upcoming ({counts.upcoming})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('checked_out')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                filterStatus === 'checked_out'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              Checked-Out ({counts.checked_out})
            </button>
          </div>
        </div>
      )}

      {/* Booking Cards List */}
      {filteredGuests.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 p-8 rounded-lg border border-gray-200 dark:border-gray-700 text-center space-y-3 shadow-md">
          <Building className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto" />
          <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">No bookings match filter</p>
          {onAddBooking && (
            <button
              type="button"
              onClick={onAddBooking}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm"
            >
              + Create New Booking
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGuests.map((guest) => {
            const isSelected = selectedGuestId === guest.id;
            // guest.roomRate is the PER-NIGHT rate; guest.totalAmount is the
            // actual full-stay charge (nights x rate) - totalAmount must be
            // checked first, see calculateGuestTotal in BillingCheckout.tsx
            // for the multi-night bug this ordering avoids repeating.
            const totalTariff = guest.totalAmount ?? guest.roomRate ?? 0;
            const advancePaid = guest.advanceAmount ?? 0;
            const pendingDue = totalTariff - advancePaid + (guest.foodBill ?? 0);
            const isCheckedIn = ['checked in', 'active'].includes((guest.status || '').toLowerCase());

            return (
              <div
                key={guest.id}
                onClick={() => onSelectGuest?.(guest.id)}
                className={`bg-white dark:bg-gray-800 rounded-lg border transition-all p-4 space-y-3 cursor-pointer ${
                  isSelected
                    ? 'border-blue-500 dark:border-blue-500 ring-2 ring-blue-500/20 shadow-md'
                    : 'border-gray-200 dark:border-gray-700 shadow-md hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {/* Header Row: Guest Name, Room Pill, Guest Count, Status */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">{guest.guestName}</h4>
                      {guest.roomNumber && (
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-semibold border border-blue-200 dark:border-blue-800">
                          {guest.roomNumber}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 text-xs font-semibold">
                        <Users className="w-3 h-3 text-emerald-500" />
                        {guest.numberOfGuests || 1} Person(s)
                      </span>
                    </div>
                    {guest.phoneNumber && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {guest.phoneNumber}
                      </p>
                    )}
                  </div>
                  <div>{getStatusBadge(guest.status)}</div>
                </div>

                {/* Sub-Grid: Check-In & Check-Out Dates */}
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    <LogIn className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[9px] text-slate-400 font-semibold uppercase">Check-In</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {guest.checkinDate ? guest.checkinDate.split(' ')[0] : 'N/A'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    <LogOut className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[9px] text-slate-400 font-semibold uppercase">Check-Out</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {guest.checkoutDate || guest.expectedCheckout ? (guest.checkoutDate || guest.expectedCheckout).split(' ')[0] : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* C-Form Filing Badge (if foreign guest or past booking) */}
                {guest.isForeignGuest && (
                  <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/40 p-2 rounded-lg border border-slate-100 dark:border-slate-800 text-xs">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">C-Form Filing:</span>
                    {guest.cFormFiledAt ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        <span>Filed ({guest.cFormFiledAt})</span>
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold text-[11px] inline-flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-amber-500" />
                        <span>Pending Filing</span>
                      </span>
                    )}
                  </div>
                )}

                {/* Financial Summary Bar */}
                <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-semibold block">Total Tariff</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-0.5">
                      <IndianRupee className="w-3 h-3 text-slate-400" />
                      {totalTariff.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-semibold block">Advance</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                      <IndianRupee className="w-3 h-3" />
                      {advancePaid.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-semibold block">Pending Due</span>
                    <span className={`font-bold flex items-center gap-0.5 ${pendingDue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                      <IndianRupee className="w-3 h-3" />
                      {pendingDue.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* 44px Hit Target Bottom Action Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  {guest.phoneNumber && (
                    <a
                      href={`tel:${guest.phoneNumber}`}
                      onClick={(e) => e.stopPropagation()}
                      className="min-h-[44px] px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0 whitespace-nowrap"
                      title="Call Guest"
                    >
                      <Phone className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      <span>{guest.phoneNumber}</span>
                    </a>
                  )}

                  {onOpenWhatsApp && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenWhatsApp(guest);
                      }}
                      className="min-h-[44px] px-3 py-2 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      title="WhatsApp Voucher"
                    >
                      <MessageSquare className="w-4 h-4 text-emerald-600" />
                      <span>WhatsApp</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectGuest?.(guest.id);
                    }}
                    className="min-h-[44px] flex-1 px-3 py-2 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <CreditCard className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Edit Booking</span>
                  </button>

                  {isCheckedIn && onCheckoutGuest && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCheckoutGuest(guest.id);
                      }}
                      className="min-h-[44px] px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0"
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
