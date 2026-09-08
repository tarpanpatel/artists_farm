import React, { useState, useMemo } from 'react';
import { Search } from './icons/FlowbiteIcons';
import { Guest } from '../types';
import { BookingCard } from './BookingCard';
import { useConfirm } from './ConfirmDialogContext';
import { getWhatsAppPhone } from '../utils/phoneUtils';
import { t } from '../i18n/en';

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
  selectedGuestId: _selectedGuestId,
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
        <div className="billing-checkout__empty-state p-12 text-center">
          <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <h3 className="billing-checkout__subtitle text-lg font-semibold text-gray-800 dark:text-gray-200">
            {searchQuery.trim() || hideSearchAndFilter
              ? t('no_bookings_matching_criteria', 'No bookings found matching your criteria.')
              : t('no_guest_records_found', 'No bookings found.')}
          </h3>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGuests.map((guest) => (
            <BookingCard
              key={guest.id}
              guest={guest}
              showRoomBadge={true}
              canActOnBooking={canEdit}
              canCheckoutBookingRole={canCheckout}
              onEditGuest={() => onSelectGuest?.(guest.id)}
              onEditAndCheckoutGuest={() => onCheckoutGuest?.(guest.id)}
              onOpenWhatsApp={handleOpenWhatsApp}
            />
          ))}
        </div>
      )}

    </div>
  );
};
