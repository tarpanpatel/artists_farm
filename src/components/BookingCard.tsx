import React from 'react';
import {
  Eye,
  LogOut,
  Calendar,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  IdCard,
  AlertCircle,
} from './icons/FlowbiteIcons';
import { Guest } from '../types';
import { Badge } from './Badge';
import { Button } from './Button';
import { OtaBadge } from './OtaBadge';
import { BookingContactActions } from './BookingContactActions';
import { isCFormGenuinelyFiled } from '../utils/cFormStatus';
import { cleanGuestNotes } from '../utils/otaNotesCleaner';
import { formatDateOrdinal } from '../utils/dateUtils';
import { t } from '../i18n/en';

export interface BookingCardProps {
  guest: Guest;
  showRoomBadge?: boolean;
  isTurnoverRoom?: boolean;
  canActOnBooking?: boolean;
  canCheckoutBookingRole?: boolean;
  onEditGuest: (guest: Guest, focusSection?: 'c_form' | 'checkin' | 'id_verification' | null) => void;
  onEditAndCheckoutGuest?: (guest: Guest) => void;
  onOpenWhatsApp?: (phoneNumber: string) => void;
  isProcessing?: boolean;
  /**
   * Drop this card's own chrome - border, shadow, white background, rounded
   * corners and padding - so it reads as plain content inside whatever already
   * frames it (10 Sep 2026, reported on mobile: a booking sat in its own white
   * card inside the room's white card, a box drawn inside an identical box for
   * no gain). Opt-in, because BookingCard is ALSO rendered by
   * MobileBookingCardStack as a flat list with no room grouping, where the
   * chrome is the only thing separating one booking from the next.
   */
  flush?: boolean;
  className?: string;
}

export const isCheckedInGuest = (g: Guest): boolean => {
  const s = String(g.status || '').toLowerCase().trim();
  return s === 'checked in' || s === 'active';
};

export const calculateGuestTotal = (guest: Guest): number => {
  const totalAmount = Number(guest.totalAmount ?? guest.roomRate ?? 0);
  const advancePaid = Number(guest.advanceAmount ?? 0);
  const foodBill = Number(guest.foodBill ?? 0);
  return totalAmount - advancePaid + foodBill;
};

export const calculateNights = (checkin?: string, checkout?: string): number => {
  if (!checkin || !checkout) return 0;
  try {
    const checkinDate = new Date(checkin);
    const checkoutDate = new Date(checkout);
    if (isNaN(checkinDate.getTime()) || isNaN(checkoutDate.getTime())) return 0;
    const diffTime = Math.abs(checkoutDate.getTime() - checkinDate.getTime());
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
};

export const getGuestDetailedStatus = (g: Guest, todayStr?: string): 'checkin_today' | 'checkout_today' | 'upcoming' | 'past_bookings' => {
  const today = todayStr || new Date().toISOString().split('T')[0];
  const checkin = (g.checkinDate || '').split(' ')[0].split('T')[0];
  const checkout = (g.checkoutDate || g.expectedCheckout || '').split(' ')[0].split('T')[0];

  if (checkout === today) {
    return 'checkout_today';
  }
  if (checkin === today || (checkin < today && today < checkout)) {
    return 'checkin_today';
  }
  if (checkin > today) {
    return 'upcoming';
  }
  return 'past_bookings';
};

export const getGuestStayStatus = (guest: Guest, todayStr?: string) => {
  if (String(guest.status || '') === 'Cancelled') {
    return { key: 'cancelled', label: t('cancelled_badge', 'Cancelled'), variant: 'danger' as const };
  }
  const cat = getGuestDetailedStatus(guest, todayStr);
  if (cat === 'checkin_today') {
    const isCheckedIn = isCheckedInGuest(guest);
    if (!isCheckedIn) {
      return {
        key: 'checkin_pending',
        label: t('checkin_pending_badge', 'Check-in Pending'),
        variant: 'warning' as const,
      };
    }
    return { key: 'staying', label: t('checked_in_today_badge', 'Checked In Today'), variant: 'success' as const };
  } else if (cat === 'checkout_today') {
    return { key: 'checkout', label: t('checkout_today_badge', 'Checkout Today'), variant: 'warning' as const };
  } else if (cat === 'upcoming') {
    return { key: 'upcoming', label: t('upcoming_booking_badge', 'Upcoming Booking'), variant: 'info' as const };
  } else {
    return { key: 'past', label: t('past_booking_badge', 'Past Booking'), variant: 'neutral' as const };
  }
};

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '—';
  return formatDateOrdinal(dateStr) || '—';
};

/**
 * Universal Booking Card:
 * Standard card anatomy across Today, Upcoming, and Past booking lists.
 * Enforces the Universal Booking Card Consistency Rule with right-aligned OTA badge in dates box.
 */
export const BookingCard: React.FC<BookingCardProps> = ({
  guest,
  showRoomBadge = false,
  isTurnoverRoom = false,
  canActOnBooking = true,
  canCheckoutBookingRole = true,
  onEditGuest,
  onEditAndCheckoutGuest,
  onOpenWhatsApp,
  isProcessing = false,
  flush = false,
  className = '',
}) => {
  const amountDue = calculateGuestTotal(guest);
  const nights = calculateNights(guest.checkinDate, guest.checkoutDate || guest.expectedCheckout);
  const nightsDisplay = nights > 0 ? `${nights} night${nights !== 1 ? 's' : ''}` : t('same_day_stay', 'Same day stay');
  const stayStatus = getGuestStayStatus(guest);
  const isCheckedIn = isCheckedInGuest(guest);
  const canCheckout = isCheckedIn && (stayStatus.key === 'staying' || stayStatus.key === 'checkout');
  const roomCharges = Number(guest.totalAmount ?? guest.roomRate ?? 0);
  const advancePaid = Number(guest.advanceAmount ?? 0);
  const foodBill = Number(guest.foodBill ?? 0);
  const isOtaBooking = Boolean(
    guest.otaSource ||
    (guest as any).ota_source ||
    guest.bookingSource === 'AIRBNB' ||
    guest.bookingSource === 'BOOKING_COM' ||
    guest.bookingSource === 'AGODA' ||
    guest.bookingSource === 'EXPEDIA' ||
    guest.bookingSource === 'VRBO' ||
    guest.otaReservationCode
  );
  // Hide Room Charges for OTA bookings when room charges equals total paid
  const shouldHideRoomCharges = isOtaBooking && roomCharges > 0 && Math.abs(roomCharges - advancePaid) < 0.01;
  const paidAmountLabel = isOtaBooking
    ? t('total_paid_label', 'Total Paid:')
    : t('advance_paid_label', 'Advance Paid:');

  return (
    <div
      className={`billing-checkout__guest-card flex flex-col justify-between space-y-3 transition-all ${
        flush
          ? ''
          : `p-3 sm:p-3.5 rounded-lg bg-white dark:bg-slate-800 ${
              isTurnoverRoom
                ? stayStatus.key === 'checkout'
                  ? 'border-2 border-amber-300 dark:border-amber-700/80 shadow-sm'
                  : stayStatus.key === 'checkin_pending'
                  ? 'border-2 border-amber-300 dark:border-amber-700/80 shadow-sm'
                  : stayStatus.key === 'staying'
                  ? 'border-2 border-emerald-300 dark:border-emerald-700/80 shadow-sm'
                  : 'border border-slate-200 dark:border-slate-700 shadow-sm'
                : 'border border-slate-200 dark:border-slate-700/70 shadow-2xs'
            }`
      } ${className}`}
    >
      {/* Guest Name, Contact & Status Badge */}
      <div>
        <div className="billing-checkout__guest-card-header flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white m-0">
                {guest.guestName}
              </h4>
              <span className="inline-flex items-center px-1.5 py-0.5 text-2xs font-semibold rounded bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                #{guest.id}
              </span>
              {showRoomBadge && guest.roomNumber && (
                <span className="inline-flex items-center px-2 py-0.5 text-2xs font-semibold rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {guest.roomNumber}
                </span>
              )}
              <span className="text-xs text-slate-500 dark:text-slate-400 font-normal shrink-0">
                ({guest.numberOfGuests || 1} {(guest.numberOfGuests || 1) === 1 ? 'guest' : 'guests'})
              </span>
              {guest.phoneNumber ? (
                <BookingContactActions phoneNumber={guest.phoneNumber} onOpenWhatsApp={onOpenWhatsApp} />
              ) : (
                <span className="text-xs text-slate-400 dark:text-slate-500 italic shrink-0">
                  ({t('no_contact', 'No contact')})
                </span>
              )}
            </div>
          </div>
          {/* Right Side Stack: Stay Status Badge + Warnings */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {stayStatus.key !== 'staying' && (
              <Badge variant={stayStatus.variant} size="sm" className="whitespace-nowrap">
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  {stayStatus.key === 'checkin_pending' && <AlertTriangle className="w-3 h-3 shrink-0" />}
                  {stayStatus.key === 'checkout' && <LogOut className="w-3 h-3 shrink-0" />}
                  <span>{stayStatus.label}</span>
                </span>
              </Badge>
            )}

            {guest.isForeignGuest && (
              isCFormGenuinelyFiled(guest) ? (
                <Badge variant="success" size="sm" className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    <span>{t('c_form_filed_badge', 'C-Form Filed')}</span>
                  </span>
                </Badge>
              ) : (
                <Badge
                  variant="danger"
                  size="sm"
                  title={t('c_form_pending_popover_text', 'This foreign guest still needs a C-Form filed.')}
                  className="whitespace-nowrap"
                >
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>{t('c_form_pending_badge', 'C-Form Pending')}</span>
                  </span>
                </Badge>
              )
            )}
            {isCheckedIn && guest.idVerificationStatus !== 'Complete' && (
              <Badge
                variant="danger"
                size="sm"
                title={t('id_pending_popover_text', "This guest's ID verification is still incomplete.")}
                className="whitespace-nowrap"
              >
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <IdCard className="w-3 h-3 shrink-0" />
                  <span>{t('id_verification_pending_badge', 'ID Pending')}</span>
                </span>
              </Badge>
            )}
          </div>
        </div>

        {/* Stay Dates with OTA Badge Aligned on the Right */}
        <div className="billing-checkout__guest-card-dates mt-2 text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-200/60 dark:border-slate-700">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 text-[11px]">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="inline-flex items-center gap-1.5 tabular-nums flex-wrap">
                  <span>
                    {formatDate(guest.checkinDate)}
                  </span>
                  <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>
                    {formatDate(guest.checkoutDate || guest.expectedCheckout)}
                  </span>
                </span>
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 pl-5">
                {nightsDisplay}
              </div>
            </div>
            {guest.otaSource && (
              <div className="shrink-0">
                <OtaBadge
                  source={guest.otaSource}
                  sourceLabel={guest.otaSourceLabel}
                  reservationCode={guest.otaReservationCode}
                  className="billing-checkout__ota-badge"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Financial Breakdown: Shows Total Paid (or Advance Paid for offline), Room Charges (or Not set, hidden if OTA and room charges = total paid), and Due ONLY when due */}
      <div className="billing-checkout__guest-card-financials space-y-1 text-xs border-t border-slate-200/80 dark:border-slate-700/80 pt-2">
        {!shouldHideRoomCharges && (
          roomCharges > 0 ? (
            <div className="flex justify-between text-slate-600 dark:text-slate-400 text-[11px]">
              <span>{t('room_charges_label', 'Room Charges:')}</span>
              <span className="summary-line summary-line--room-rate font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                ₹{roomCharges.toFixed(2)}
              </span>
            </div>
          ) : (
            <div className="flex justify-between text-slate-500 dark:text-slate-400 text-[11px]">
              <span>{t('room_charges_label', 'Room Charges:')}</span>
              <span className="tabular-nums text-slate-400 dark:text-slate-500 italic">
                {t('pending_tariff_label', 'Not set')}
              </span>
            </div>
          )
        )}

        {foodBill > 0 && (
          <div className="flex justify-between text-slate-600 dark:text-slate-400 text-[11px]">
            <span>{t('food_incidentals_label', 'Food & Incidentals:')}</span>
            <span className="summary-line summary-line--food-bill font-semibold tabular-nums text-slate-800 dark:text-slate-200">
              ₹{foodBill.toFixed(2)}
            </span>
          </div>
        )}

        <div className="flex justify-between text-slate-600 dark:text-slate-400 text-[11px]">
          <span>{paidAmountLabel}</span>
          <span className={`summary-line summary-line--total-paid font-semibold tabular-nums ${advancePaid > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
            ₹{advancePaid.toFixed(2)}
          </span>
        </div>

        {/* Only show Due if amountDue > 0 */}
        {amountDue > 0 && (
          <div className="flex justify-between items-center text-xs font-semibold pt-1 border-t border-dashed border-slate-200 dark:border-slate-700">
            <span className="text-amber-700 dark:text-amber-300 font-medium">
              {t('amount_due_label', 'Amount Due:')}
            </span>
            <span className="summary-line summary-line--amount-due font-bold text-amber-700 dark:text-amber-300 text-sm tabular-nums">
              ₹{amountDue.toFixed(2)}
            </span>
          </div>
        )}

        {/* Refund if amountDue < 0 */}
        {amountDue < 0 && (
          <div className="flex justify-between items-center text-xs font-semibold pt-1 border-t border-dashed border-slate-200 dark:border-slate-700">
            <span className="text-rose-600 dark:text-rose-400 font-medium">
              {t('refund_due_to_guest_label', 'Refund Due to Guest:')}
            </span>
            <span className="summary-line summary-line--amount-due font-bold text-rose-600 dark:text-rose-400 text-sm tabular-nums">
              ₹{Math.abs(amountDue).toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* Action Buttons: View or View Booking + Checkout */}
      {!canActOnBooking ? (
        <div className="billing-checkout__guest-card-actions pt-0.5">
          <Button
            variant="secondary"
            size="sm"
            block
            onClick={() => onEditGuest(guest)}
            leftIcon={<Eye className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
          >
            {t('view_booking_button', 'View Booking')}
          </Button>
        </div>
      ) : canCheckout && canCheckoutBookingRole ? (
        <div className="billing-checkout__guest-card-actions grid grid-cols-2 gap-2 pt-0.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onEditGuest(guest)}
            leftIcon={<Eye className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
          >
            {t('view_button', 'View')}
          </Button>
          <Button
            variant="warning"
            size="sm"
            onClick={() => onEditAndCheckoutGuest?.(guest)}
            disabled={isProcessing}
            leftIcon={<LogOut className="w-3.5 h-3.5 shrink-0" />}
          >
            {t('checkout_button', 'Checkout')}
          </Button>
        </div>
      ) : (
        <div className="billing-checkout__guest-card-actions pt-0.5">
          <Button
            variant="secondary"
            size="sm"
            block
            disabled={isProcessing}
            onClick={() => onEditGuest(guest)}
            leftIcon={<Eye className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
          >
            {t('view_booking_button', 'View Booking')}
          </Button>
        </div>
      )}

      {/* Guest Notes */}
      {(() => {
        const cleaned = cleanGuestNotes(guest.notes);
        if (!cleaned) return null;
        return (
          <div className="p-2 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg flex gap-1.5 text-[10px]">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-slate-700 dark:text-slate-300 line-clamp-2">
              <span className="font-semibold">{t('notes_prefix', 'Notes:')}</span> {cleaned}
            </p>
          </div>
        );
      })()}
    </div>
  );
};
