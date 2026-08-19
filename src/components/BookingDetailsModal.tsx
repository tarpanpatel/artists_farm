import React, { useState, useEffect } from 'react';
import { Save, Trash2, IdCard, Loader2, Pencil, CheckCircle2, MessageCircle, LogOut, Upload, CreditCard, Globe, AlertTriangle } from 'lucide-react';
import { Modal, ModalHeader, ModalBody } from 'flowbite-react';
import { Guest } from '../types';
import { markCFormFiled, checkinGuestInDB } from '../services/api';
import { useStaff } from '../contexts/StaffContext';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import { StyledSelect } from './StyledSelect';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { DateRangePicker } from './DateRangePicker';
import { CheckinVerificationModal } from './CheckinVerificationModal';
import { DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, renderWhatsappVoucherTemplate } from '../utils/whatsappVoucherTemplate';
import { t } from '../i18n/en';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import {
  GUEST_STATUS_BOOKED,
  GUEST_STATUS_CONFIRMED_LEGACY,
  GUEST_STATUS_CHECKED_IN,
  GUEST_STATUS_ACTIVE_LEGACY,
} from '../constants/guestStatus';

interface BookingDetailsModalProps {
  guest: Guest | null;
  onClose: () => void;
  onSave: (updatedGuest: Guest) => Promise<void>;
  onDelete?: (guestId: string) => Promise<void>;
  rooms?: Array<{ id: number; name: string; slug: string }>;
  checkedInGuests?: Guest[];
  propertyName?: string;
  propertyAddress?: string;
  propertyMapsLink?: string;
  propertyPhone?: string;
  propertyWhatsappTemplate?: string;
  propertyUpiId?: string;
  propertyInstructions?: string;
  onOpenIdVerification?: () => void;
  onCheckedIn?: (guestId: string) => void;
  // Guest can be checked out and billed anytime during the stay, not just on
  // the original expected checkout date - a premature settlement just means
  // picking today's date in the checkout screen's own date picker instead of
  // the original one, which already shortens the booking (and its calendar
  // bar) correctly. Omit this prop to hide the button entirely (e.g. call
  // sites that don't yet have a checkout screen wired up).
  onCheckout?: () => void;
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const dateOnly = dateStr.split(' ')[0];
  const parts = dateOnly.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

/**
 * The one booking modal every calendar/list in the app should use - opens
 * read-only (Booking Details), an explicit Edit button switches it into the
 * same field set Add Booking collects. Previously TodayOverview (Multi-Key
 * top-level calendar) and OperationalDashboard (Single property + Multi-Key
 * per-room) each had their own separate modal - one Details-first with a
 * partial field set, one always-editable with an even smaller field set.
 * This replaces both.
 */
export const BookingDetailsModal: React.FC<BookingDetailsModalProps> = ({
  guest,
  onClose,
  onSave,
  onDelete,
  rooms = [],
  checkedInGuests = [],
  propertyName = '',
  propertyAddress = '',
  propertyMapsLink = '',
  propertyPhone = '',
  propertyWhatsappTemplate = '',
  propertyUpiId = '',
  propertyInstructions = '',
  onOpenIdVerification,
  onCheckedIn,
  onCheckout,
}) => {
  const { staff } = useStaff();
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [propDetails, setPropDetails] = useState<{
    name?: string;
    address?: string;
    phone?: string;
    google_maps_link?: string;
    upi_id?: string;
    instructions?: string;
  }>({});

  useEffect(() => {
    fetch('/php/api/router.php?action=get_property', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'success' && data.data) {
          setPropDetails(data.data);
        }
      })
      .catch(() => {});
  }, []);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // Set only when edit mode is entered via the "Settle / Assign Receiver"
  // banner, so the empty received-by field(s) it's pointing at get a visual
  // highlight - the generic Edit button shouldn't highlight anything.
  const [highlightReceiverFields, setHighlightReceiverFields] = useState(false);
  const [isIdModalOpen, setIsIdModalOpen] = useState(false);

  const handleOpenId = () => {
    if (onOpenIdVerification) {
      onOpenIdVerification();
    } else {
      setIsIdModalOpen(true);
    }
  };

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRoomId, setEditRoomId] = useState('');
  const [editGuests, setEditGuests] = useState('1');
  const [editCheckin, setEditCheckin] = useState('');
  const [editCheckout, setEditCheckout] = useState('');
  const [editRoomRent, setEditRoomRent] = useState('0');
  const [editAdvance, setEditAdvance] = useState('0');
  const [editAdvanceReceivedBy, setEditAdvanceReceivedBy] = useState('');
  const [editPendingReceivedBy, setEditPendingReceivedBy] = useState('');
  const [editBookingSource, setEditBookingSource] = useState('Offline');
  const [editShowNotes, setEditShowNotes] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editIsForeignGuest, setEditIsForeignGuest] = useState(false);

  const [cFormFiledState, setCFormFiledState] = useState<boolean>(false);
  const [cFormNumberState, setCFormNumberState] = useState<string>('');
  const [isSavingCForm, setIsSavingCForm] = useState<boolean>(false);

  useEffect(() => {
    if (guest) {
      const g = guest as any;
      const isFiled = !!(guest.cFormFiledAt || g.c_form_filed_at || g.c_form_filed || g.cFormFiled);
      setCFormFiledState(isFiled);
      setCFormNumberState(g.c_form_number || g.cFormNumber || '');
    }
  }, [guest]);

  if (!guest) return null;

  const g = guest as any;
  const isCFormFiled = cFormFiledState;
  const noOfGuests = g.no_of_guests ?? g.numberOfGuests ?? 1;
  const roomRent = g.base_room_rent ?? g.roomRate ?? 0;
  const advancePaid = g.advance_paid ?? g.advanceAmount ?? 0;
  // The booking form folds itemized "Additional Charges" (Decoration Fees,
  // Pet Stay Charges, etc.) straight into pendingAmount at creation time -
  // this modal has no visibility into those individual lines (they live in
  // guest_extra_charges, a table this component never reads; it's
  // write-only-from-here, analytics-only-read). Without preserving that gap,
  // recomputing pending as pure roomRent-advancePaid on every edit silently
  // dropped any extra charges from the bill - the guest_name note text
  // ("Extra Charges: ...") the create form also writes was the only
  // surviving trace, which is why it looked like the charge "became" just a
  // note (found 19 Aug 2026). storedPending - the bare rent/advance math is
  // treated as that baked-in extra and carried forward through edits.
  const storedPending = g.pending_amount ?? g.pendingAmount;
  const extrasBaked = typeof storedPending === 'number'
    ? Math.max(0, storedPending - Math.max(0, roomRent - advancePaid))
    : 0;
  const pendingDisplay = isEditing
    ? Math.max(0, (parseFloat(editRoomRent) || 0) - (parseFloat(editAdvance) || 0) + extrasBaked)
    : Math.max(0, roomRent - advancePaid + extrasBaked);

  // Naming someone in "Pending Received By" IS the payment event (confirmed
  // with the user 19 Aug 2026), not mere attribution - it means this person
  // just collected the outstanding balance right now (an early, mid-stay
  // settlement). Fold it into Advance Paid so pendingDisplay reflects that
  // immediately; the explicit Save button (not real-time here, unlike
  // ReceiptEditModal's checkout screen) then commits it along with
  // everything else. Clearing the dropdown back to blank does not reverse
  // this - a mistaken selection must be fixed via Advance Paid directly.
  const handleEditPendingReceivedByChange = (val: string) => {
    setEditPendingReceivedBy(val);
    if (val) {
      setEditAdvance(String((parseFloat(editRoomRent) || 0) + extrasBaked));
    }
  };

  const startEditing = (highlightReceiver: boolean = false) => {
    setHighlightReceiverFields(highlightReceiver);
    setEditName(guest.guestName || '');
    setEditPhone(guest.phoneNumber || '');
    setEditRoomId(String(g.roomId ?? g.room_id ?? ''));
    setEditGuests(String(noOfGuests));
    setEditCheckin(guest.checkinDate?.split(' ')[0] || '');
    setEditCheckout(guest.expectedCheckout?.split(' ')[0] || guest.checkoutDate?.split(' ')[0] || '');
    setEditRoomRent(String(roomRent));
    setEditAdvance(String(advancePaid));
    setEditAdvanceReceivedBy(g.advance_received_by || guest.advanceReceivedBy || '');
    setEditPendingReceivedBy(g.pending_received_by || guest.pendingReceivedBy || '');
    setEditBookingSource(guest.bookingSource || 'Offline');
    setEditNotes(guest.notes || '');
    setEditShowNotes(!!guest.notes);
    setEditIsForeignGuest(!!guest.isForeignGuest);
    setIsEditing(true);
  };

  const handleSave = async () => {
    const newRoom = rooms.find((r) => String(r.id) === editRoomId);
    const newRoomRent = parseFloat(editRoomRent) || 0;
    const newAdvance = parseFloat(editAdvance) || 0;
    const newPending = Math.max(0, newRoomRent - newAdvance + extrasBaked);
    setIsSaving(true);
    try {
      const updated: any = {
        ...guest,
        guestName: editName,
        phoneNumber: editPhone,
        ...(rooms.length > 0
          ? { roomId: editRoomId ? parseInt(editRoomId, 10) : undefined, room_id: editRoomId ? parseInt(editRoomId, 10) : undefined, roomNumber: newRoom?.name || guest.roomNumber }
          : {}),
        checkinDate: editCheckin,
        expectedCheckout: editCheckout,
        numberOfGuests: parseInt(editGuests, 10) || 1,
        no_of_guests: parseInt(editGuests, 10) || 1,
        roomRate: newRoomRent,
        base_room_rent: newRoomRent,
        totalAmount: newRoomRent,
        total_charge: newRoomRent,
        advanceAmount: newAdvance,
        advance_paid: newAdvance,
        advanceReceivedBy: editAdvanceReceivedBy,
        advance_received_by: editAdvanceReceivedBy,
        pendingAmount: newPending,
        pendingReceivedBy: editPendingReceivedBy,
        pending_received_by: editPendingReceivedBy,
        bookingSource: editBookingSource,
        notes: editShowNotes ? editNotes : '',
        isForeignGuest: editIsForeignGuest,
      };
      await onSave(updated);
      setIsEditing(false);
      showToast('Booking updated successfully', { type: 'success' });
    } catch (err) {
      showToast('Failed to update booking. Please try again.', { type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    const ok = await confirm({
      title: t('delete_booking_header', 'Delete Booking'),
      message: `Delete ${guest.guestName}'s booking? This cannot be restored.`,
      confirmText: t('delete_button', 'Delete'),
      cancelText: t('cancel_button', 'Cancel'),
      variant: 'danger',
    });
    if (!ok) return;
    setIsDeleting(true);
    try {
      await onDelete(guest.id);
      onClose();
      showToast('Booking deleted', { type: 'success' });
    } catch (err) {
      showToast('Failed to delete booking. Please try again.', { type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  const buildWhatsAppShareUrl = () => {
    const digits = (guest.phoneNumber || '').replace(/\D/g, '');
    const phone = digits.length === 10 ? '91' + digits : digits;

    const matchedRoom = rooms.find((r) => String(r.id) === String(g.roomId ?? g.room_id));
    const unitName = guest.roomNumber || matchedRoom?.name || propDetails.name || 'N/A';

    const addressVal = propertyAddress || propDetails.address || g.address || '';
    const phoneVal = propertyPhone || propDetails.phone || g.phone || '';
    const mapsVal = propertyMapsLink || propDetails.google_maps_link || g.google_maps_link || '';
    const upiVal = propertyUpiId || propDetails.upi_id || g.upi_id || '';
    const notesVal = propertyInstructions || propDetails.instructions || g.instructions || g.notes || '';

    const message = renderWhatsappVoucherTemplate(propertyWhatsappTemplate || DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, {
      guest_name: guest.guestName,
      room_name: unitName,
      property_name: propertyName || propDetails.name || 'our property',
      checkin_date: formatDate(guest.checkinDate?.split(' ')[0] || ''),
      checkout_date: formatDate(guest.expectedCheckout?.split(' ')[0] || guest.checkoutDate?.split(' ')[0] || ''),
      guest_count: String(noOfGuests),
      room_tariff: roomRent.toFixed(2),
      advance_paid: advancePaid.toFixed(2),
      address: addressVal,
      contact_phone: phoneVal,
      maps_link: mapsVal,
      upi_id: upiVal,
      other_notes: notesVal,
    });
    return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
  };

  const financialHandlers = staff.filter((s) => s.isFinancialHandler).map((s) => ({ value: s.name, label: s.name }));
  const availableHandlers = financialHandlers.length > 0 ? financialHandlers : staff.map((s) => ({ value: s.name, label: s.name }));

  const fieldLabelClass = 'text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase';
  const inputClass = 'mt-1 w-full h-10 px-3.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100/30';

  return (
    <>
      {/* z-60: opened from the calendar/bookings screen with an underlying
          page modal sometimes already open (see the z-index scale note in
          src/index.css). */}
      <Modal
        show
        onClose={() => { onClose(); setIsEditing(false); }}
        dismissible={!isSaving}
        size="md"
        className="z-60 booking-details-modal__overlay"
      >
        <ModalHeader as="div">
          <h2 className="booking-details-modal__title text-base font-semibold text-slate-900 dark:text-white flex flex-wrap items-center gap-2 pr-2">
            <span>{isEditing ? t('edit_booking_header', 'Edit Booking') : t('today_booking_details_heading', 'Booking Details')}</span>
            {guest.otaSource && (
              <span
                className="booking-details-modal__ota-badge inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[10px] font-semibold"
                title={t('ota_converted_badge_tooltip', 'Converted from an OTA calendar sync - editing this only changes this app, not the original platform')}
              >
                <Globe className="w-3 h-3 shrink-0" />
                {guest.otaSourceLabel || guest.otaSource}
                {guest.roomNumber && <span className="opacity-70">&middot; {guest.roomNumber}</span>}
              </span>
            )}
          </h2>
        </ModalHeader>
        <ModalBody id="printableBookingDetailsContent">
          {/* Action Banner 0: OTA cancellation drift - the source calendar no longer
              has this reservation (guest likely cancelled upstream). Informational
              only, staff decide what to do - never auto-cancels/checks out. */}
          {guest.otaCancelledDetectedAt && !isEditing && (
            <div className="w-full mb-3 px-3.5 py-2.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 flex items-center gap-2 shadow-2xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                {t('ota_cancelled_detected_banner', 'This reservation appears to have been cancelled on {{source}} - verify with the guest before proceeding.').replace('{{source}}', guest.otaSourceLabel || guest.otaSource || 'the OTA')}
              </span>
            </div>
          )}

          {/* Action Banner 1: Check-in ID Verification */}
          {!isEditing && (
            <div
              className={`booking-details-modal__id-btn w-full mb-3 px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
                guest.idVerificationStatus === 'Complete'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
              }`}
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-100">
                <IdCard className="w-4 h-4 text-slate-500 shrink-0" />
                {t('checkin_id_verification_label', 'Check-in ID Verification')}
              </span>
              <button
                type="button"
                onClick={handleOpenId}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 shrink-0 ${
                  guest.idVerificationStatus === 'Complete'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse hover:animate-none'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                {guest.idVerificationStatus === 'Complete' ? 'View / Re-upload ID' : 'Upload Guest ID'}
              </button>
            </div>
          )}

          {/* Action Banner 1.5: Foreign Guest C-Form Warning */}
          {guest.isForeignGuest && !isCFormFiled && !isEditing && (
            <div className="w-full mb-3 px-3.5 py-2.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 flex items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-900 dark:text-rose-200">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>Foreign Guest: C-Form Filing Required</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCFormFiledState(true);
                  const el = document.getElementById('c-form-number-input');
                  if (el) el.focus();
                }}
                className="px-3 py-1 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all cursor-pointer shadow-2xs shrink-0"
              >
                Mark C-Form Filed
              </button>
            </div>
          )}

          {/* Action Banner 2: Unsettled Bill / Missing Payment Receiver */}
          {(() => {
            const advanceReceiver = g.advance_received_by || guest.advanceReceivedBy || '';
            const pendingReceiver = g.pending_received_by || guest.pendingReceivedBy || '';
            const isCheckedOut = ((guest.status as string) === 'Checked Out' || (g.status as string) === 'Checked Out');
            
            // Advance paid requires an assigned advanceReceiver
            const isAdvanceUnassigned = advancePaid > 0 && !advanceReceiver;
            
            // Pending receiver is only unassigned if guest checked out / settled pending balance without specifying who collected it
            const isPendingUnassigned = isCheckedOut && pendingDisplay === 0 && !pendingReceiver && (roomRent - advancePaid) > 0;
            
            // Checked out guest who still owes an unpaid balance
            const isCheckedOutUnsettled = isCheckedOut && pendingDisplay > 0;
            
            const showBanner = !isEditing && (isAdvanceUnassigned || isPendingUnassigned || isCheckedOutUnsettled);

            if (!showBanner) return null;

            return (
              <div className="w-full mb-3 px-3.5 py-2.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 flex items-center justify-between gap-2 shadow-2xs">
                <div className="flex items-center gap-2 text-xs font-semibold text-red-900 dark:text-red-200">
                  <CreditCard className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                  <span>
                    {isCheckedOutUnsettled
                      ? `Unsettled Bill: Owes ₹${pendingDisplay.toLocaleString('en-IN')}`
                      : `Payment Receiver Unassigned (${isAdvanceUnassigned ? 'Advance' : ''}${isAdvanceUnassigned && isPendingUnassigned ? ' & ' : ''}${isPendingUnassigned ? 'Pending' : ''})`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => startEditing(true)}
                  className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all cursor-pointer shadow-2xs shrink-0 flex items-center gap-1"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {isCheckedOutUnsettled ? 'Settle Bill' : 'Assign Receiver'}
                </button>
              </div>
            );
          })()}

          <div className="booking-details-modal__body space-y-4">
            {/* Row: Guest Name + Room */}
            <div className={rooms.length > 0 ? 'grid grid-cols-2 gap-4' : ''}>
              <div>
                <label className={fieldLabelClass}>{t('today_guest_name_label', 'Guest Name')}</label>
                {isEditing ? (
                  <Input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} />
                ) : (
                  <div className="mt-1 w-full h-10 px-3.5 flex items-center bg-transparent border border-transparent text-slate-900 dark:text-white text-sm font-medium">
                    {guest.guestName}
                  </div>
                )}
              </div>
              {rooms.length > 0 && (
                <div>
                  <label className={fieldLabelClass}>{t('room_column', 'Room')}</label>
                  {isEditing ? (
                    <div className="mt-1">
                      <StyledSelect
                        value={editRoomId}
                        onChange={setEditRoomId}
                        buttonClassName="w-full h-10 px-3.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100/30"
                        options={rooms.map((room) => {
                          const newCheckin = new Date(editCheckin || guest.checkinDate);
                          const newCheckout = new Date(editCheckout || guest.expectedCheckout);
                          const occupiedByOther = checkedInGuests.some((other) => {
                            if (other.id === guest.id) return false;
                            const otherRoomId = (other as any).roomId ?? (other as any).room_id;
                            if (Number(otherRoomId) !== Number(room.id)) return false;
                            const otherCheckin = new Date(other.checkinDate);
                            const otherCheckout = new Date(other.expectedCheckout || other.checkoutDate || other.checkinDate);
                            return newCheckin < otherCheckout && otherCheckin < newCheckout;
                          });
                          return { value: String(room.id), label: `${room.name}${occupiedByOther ? ' (occupied these dates)' : ''}`, disabled: occupiedByOther };
                        })}
                      />
                    </div>
                  ) : (
                    <div className="mt-1 w-full h-10 px-3.5 flex items-center bg-transparent border border-transparent text-slate-900 dark:text-white text-sm font-medium">
                      {guest.roomNumber}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Row: Phone + No. of Guests */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={fieldLabelClass}>{t('phone_label', 'Phone')}</label>
                {isEditing ? (
                  <Input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    maxLength={10}
                    placeholder="10-digit mobile number"
                  />
                ) : (
                  <div className="mt-1 w-full h-10 px-3.5 flex items-center bg-transparent border border-transparent text-slate-900 dark:text-white text-sm font-medium">
                    {guest.phoneNumber || '—'}
                  </div>
                )}
              </div>
              <div>
                <label className={fieldLabelClass}>{t('no_of_guests_label', 'No. of Guests')}</label>
                {isEditing ? (
                  <Input type="number" min={1} value={editGuests} onChange={(e) => setEditGuests(e.target.value)} />
                ) : (
                  <div className="mt-1 w-full h-10 px-3.5 flex items-center bg-transparent border border-transparent text-slate-900 dark:text-white text-sm font-medium">
                    {noOfGuests} guest{noOfGuests !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </div>

            {/* Row: Check-in + Check-out */}
            {isEditing ? (
              <DateRangePicker
                checkinDate={editCheckin}
                checkoutDate={editCheckout}
                onCheckinChange={setEditCheckin}
                onCheckoutChange={setEditCheckout}
              />
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={fieldLabelClass}>{t('today_check_in_label', 'Check-in')}</label>
                  <div className="mt-1 w-full h-10 px-3.5 flex items-center bg-transparent border border-transparent text-slate-900 dark:text-white text-sm font-medium">
                    {formatDate(guest.checkinDate?.split(' ')[0] || '')}
                  </div>
                </div>
                <div>
                  <label className={fieldLabelClass}>{t('today_check_out_label', 'Check-out')}</label>
                  <div className="mt-1 w-full h-10 px-3.5 flex items-center bg-transparent border border-transparent text-slate-900 dark:text-white text-sm font-medium">
                    {formatDate(guest.expectedCheckout?.split(' ')[0] || '')}
                  </div>
                </div>
              </div>
            )}

            {/* Room Rent */}
            <div>
              <label className={fieldLabelClass}>{t('room_rent', 'Room Rent / Price (₹)')}</label>
              {isEditing ? (
                <Input type="number" min={0} value={editRoomRent} onChange={(e) => setEditRoomRent(e.target.value)} />
              ) : (
                <div className="mt-1 w-full h-10 px-3.5 flex items-center bg-transparent border border-transparent text-slate-900 dark:text-white text-sm font-medium">
                  ₹{roomRent}
                </div>
              )}
            </div>

            {/* Row: Advance Paid + Advance Received By */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={fieldLabelClass}>{t('today_advance_paid_label', 'Advance Paid')}</label>
                {isEditing ? (
                  <Input type="number" min={0} value={editAdvance} onChange={(e) => setEditAdvance(e.target.value)} />
                ) : (
                  <div className="mt-1 w-full h-10 px-3.5 flex items-center bg-transparent border border-transparent text-emerald-600 dark:text-emerald-400 text-sm font-semibold">
                    ₹{advancePaid}
                  </div>
                )}
              </div>
              <div>
                <label className={highlightReceiverFields && !editAdvanceReceivedBy ? 'text-[11px] font-semibold text-red-500 dark:text-red-400 uppercase' : fieldLabelClass}>{t('advance_received_by', 'Advance Received By')}</label>
                {isEditing ? (
                  <div className="mt-1">
                    <StyledSelect
                      value={editAdvanceReceivedBy}
                      onChange={setEditAdvanceReceivedBy}
                      placeholder="-- Select Staff/User --"
                      buttonClassName={`w-full h-10 px-3.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100/30 ${
                        highlightReceiverFields && !editAdvanceReceivedBy
                          ? 'border-red-400 dark:border-red-500 ring-4 ring-red-100 dark:ring-red-900/30'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                      options={availableHandlers}
                    />
                  </div>
                ) : (
                  <div className="mt-1 w-full h-10 px-3.5 flex items-center bg-transparent border border-transparent text-slate-900 dark:text-white text-sm font-medium">
                    {g.advance_received_by || guest.advanceReceivedBy || '—'}
                  </div>
                )}
              </div>
            </div>

            {/* Row: Pending + Pending Received By */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={fieldLabelClass}>{t('today_pending_label', 'Pending')}</label>
                <div className="mt-1 w-full h-10 px-3.5 flex items-center bg-transparent border border-transparent text-amber-600 dark:text-amber-400 text-sm font-semibold">
                  ₹{pendingDisplay}
                </div>
              </div>
              <div>
                <label className={highlightReceiverFields && !editPendingReceivedBy && ((guest.status as string) === 'Checked Out' || (g.status as string) === 'Checked Out') ? 'text-[11px] font-semibold text-red-500 dark:text-red-400 uppercase' : fieldLabelClass}>{t('pending_received_by_label', 'Pending Received By')}</label>
                {isEditing ? (
                  <div className="mt-1">
                    <StyledSelect
                      value={editPendingReceivedBy}
                      onChange={handleEditPendingReceivedByChange}
                      placeholder="-- Select Staff/User --"
                      buttonClassName={`w-full h-10 px-3.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100/30 ${
                        highlightReceiverFields && !editPendingReceivedBy && ((guest.status as string) === 'Checked Out' || (g.status as string) === 'Checked Out')
                          ? 'border-red-400 dark:border-red-500 ring-4 ring-red-100 dark:ring-red-900/30'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                      options={availableHandlers}
                    />
                  </div>
                ) : (
                  <div className="mt-1 w-full h-10 px-3.5 flex items-center bg-transparent border border-transparent text-slate-900 dark:text-white text-sm font-medium">
                    {g.pending_received_by || guest.pendingReceivedBy || t('pending_received_by_not_received', 'Not received')}
                  </div>
                )}
              </div>
            </div>

            {/* Row: Booking Source + Status */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={fieldLabelClass}>{t('booking_source_label', 'Booking Source')}</label>
                {isEditing ? (
                  <div className="mt-1">
                    <StyledSelect value={editBookingSource} onChange={setEditBookingSource} buttonClassName="w-full h-10 px-3.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100/30" options={[{ value: 'Offline', label: 'Offline' }, { value: 'Online', label: 'Online' }]} />
                  </div>
                ) : (
                  <div className="mt-1 w-full h-10 px-3.5 flex items-center bg-transparent border border-transparent text-slate-900 dark:text-white text-sm font-medium">
                    {guest.bookingSource || '—'}
                  </div>
                )}
              </div>
              <div>
                <label className={fieldLabelClass}>{t('today_status_label', 'Status')}</label>
                <div className="mt-1 w-full h-10 px-3.5 flex items-center bg-transparent border border-transparent text-emerald-600 dark:text-emerald-400 text-sm font-semibold">
                  {guest.status}
                </div>
              </div>
            </div>

            {/* Foreign Guest + Notes toggle (edit mode only - view mode shows notes text directly if present) */}
            {isEditing ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
                  <input type="checkbox" checked={editShowNotes} onChange={(e) => setEditShowNotes(e.target.checked)} className="form-field__checkbox shrink-0 w-4.5 h-4.5" />
                  <span>{t('guest_notes_checkbox_label', 'Guest Notes')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
                  <input type="checkbox" checked={editIsForeignGuest} onChange={(e) => setEditIsForeignGuest(e.target.checked)} className="form-field__checkbox shrink-0 w-4.5 h-4.5" />
                  <span>{t('foreign_national_guest_label', 'Foreign National Guest')}</span>
                </label>
              </div>
            ) : (
              (guest.notes || guest.isForeignGuest) && (
                <div className="grid grid-cols-2 gap-4">
                  {guest.notes && (
                    <div>
                      <label className={fieldLabelClass}>{t('guest_notes_checkbox_label', 'Guest Notes')}</label>
                      <p className="text-slate-900 dark:text-white text-sm">{guest.notes}</p>
                    </div>
                  )}
                  {guest.isForeignGuest && (
                    <div
                      id="c-form-checkbox-container"
                      className={`p-3 rounded-xl border transition-all ${
                        !isCFormFiled
                          ? 'border-rose-400 dark:border-rose-700 bg-rose-50/70 dark:bg-rose-950/40 ring-2 ring-rose-300 dark:ring-rose-800 animate-pulse'
                          : 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/30'
                      }`}
                    >
                      <label className={fieldLabelClass}>{t('foreign_national_guest_label', 'Foreign National Guest')}</label>
                      <div className="flex items-center gap-2 mt-1.5">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-100 select-none">
                          <input
                            type="checkbox"
                            checked={cFormFiledState}
                            onChange={async (e) => {
                              const isChecked = e.target.checked;
                              if (!isChecked) {
                                const ok = await markCFormFiled(guest.id, false, '');
                                if (ok) {
                                  setCFormFiledState(false);
                                  setCFormNumberState('');
                                  showToast('C-Form marked as pending', { type: 'success' });
                                  await onSave({ ...guest, cFormFiledAt: null, cFormFiled: false, c_form_filed: false, cFormNumber: '', c_form_number: '' } as any);
                                } else {
                                  showToast('Failed to update C-Form status', { type: 'error' });
                                }
                              } else {
                                setCFormFiledState(true);
                              }
                            }}
                            className="w-4.5 h-4.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                          />
                          <span className={!isCFormFiled ? 'text-rose-700 dark:text-rose-300 font-extrabold' : 'text-emerald-800 dark:text-emerald-300 font-bold'}>
                            {cFormFiledState ? 'C-Form Filed' : '⚠️ C-Form Pending — Check to Mark Filed'}
                          </span>
                          {guest.cFormFiledAt && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal">
                              ({formatDateDDMMYYYY(guest.cFormFiledAt)})
                            </span>
                          )}
                        </label>
                      </div>

                      {cFormFiledState && (
                        <div className="mt-2.5 flex items-center gap-2">
                          <input
                            id="c-form-number-input"
                            type="text"
                            value={cFormNumberState}
                            onChange={(e) => setCFormNumberState(e.target.value)}
                            placeholder="C-Form Confirmation No."
                            className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                          />
                          <button
                            type="button"
                            disabled={isSavingCForm}
                            onClick={async () => {
                              setIsSavingCForm(true);
                              const ok = await markCFormFiled(guest.id, true, cFormNumberState);
                              setIsSavingCForm(false);
                              if (ok) {
                                const filedAt = new Date().toISOString();
                                setCFormFiledState(true);
                                showToast('C-Form saved & Telegram notification sent', { type: 'success' });
                                await onSave({ ...guest, cFormFiledAt: filedAt, cFormFiled: true, c_form_filed: true, cFormNumber: cFormNumberState, c_form_number: cFormNumberState } as any);
                              } else {
                                showToast('Failed to save C-Form details', { type: 'error' });
                              }
                            }}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white transition-all cursor-pointer shadow-2xs shrink-0 flex items-center gap-1"
                          >
                            {isSavingCForm ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            <span>Save</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            )}
            {isEditing && editShowNotes && (
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                placeholder={t('guest_notes_placeholder', 'Any special requests or notes...')}
                className={inputClass}
              />
            )}
          </div>

          <div id="printableBookingDetailsActionsBar" className="booking-details-modal__footer mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
            {!isEditing ? (
              <div className="grid grid-cols-2 gap-2 w-full">
                {(guest.status === GUEST_STATUS_BOOKED || (guest.status as string) === GUEST_STATUS_CONFIRMED_LEGACY) && (
                  <button
                    type="button"
                    onClick={async () => {
                      // update_guest (what onSave calls) never writes the status
                      // column - it only touches booking details - so this used to
                      // look like it worked (optimistic local state) and then
                      // silently revert to Booked on the next reload. checkin_guest
                      // is the actual endpoint that persists the status flip.
                      const ok = await checkinGuestInDB(guest.id);
                      if (ok) {
                        guest.status = GUEST_STATUS_CHECKED_IN as any;
                        onCheckedIn?.(guest.id);
                        showToast(`${guest.guestName} marked as Checked In!`, { type: 'success' });
                      } else {
                        showToast('Failed to check in guest', { type: 'error' });
                      }
                    }}
                    className="w-full h-9 px-3.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 col-span-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{t('mark_checked_in_button', 'Mark Checked In')}</span>
                  </button>
                )}

                {onCheckout && (guest.status === GUEST_STATUS_CHECKED_IN || (guest.status as string) === GUEST_STATUS_ACTIVE_LEGACY) && (
                  <button
                    type="button"
                    onClick={onCheckout}
                    className="w-full h-9 px-3.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 col-span-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{t('checkout_settle_bill_button', 'Checkout & Settle Bill')}</span>
                  </button>
                )}

                <a href={buildWhatsAppShareUrl()} target="_blank" rel="noopener noreferrer" className="col-span-1 min-w-0 block">
                  <button
                    type="button"
                    className="w-full h-9 px-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="truncate">Share with guest</span>
                  </button>
                </a>

                <button
                  type="button"
                  onClick={() => startEditing()}
                  className="col-span-1 min-w-0 w-full h-9 px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Pencil className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t('edit_button', 'Edit')}</span>
                </button>

                {onDelete && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="w-full h-9 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 dark:text-rose-300 dark:border-rose-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 col-span-2"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    <span>{isDeleting ? t('deleting_button', 'Deleting...') : t('today_delete_booking_button', 'Delete Booking')}</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                  className="h-9 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  {t('cancel_button', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="h-9 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>{t('save_button', 'Save')}</span>
                </button>
              </div>
            )}
          </div>
        </ModalBody>
      </Modal>

      {isIdModalOpen && (
        <CheckinVerificationModal
          guest={guest}
          isOpen={isIdModalOpen}
          onClose={() => setIsIdModalOpen(false)}
          onVerificationComplete={async () => {
            setIsIdModalOpen(false);
            await onSave({ ...guest, idVerificationStatus: 'Complete' });
          }}
        />
      )}
    </>
  );
};

