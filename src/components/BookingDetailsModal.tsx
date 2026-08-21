import React, { useState, useEffect } from 'react';
import { Save, Trash2, IdCard, Loader2, Pencil, CheckCircle2, Share2, LogOut, Upload, CreditCard, Globe, AlertTriangle, X, IndianRupee, Paperclip, ScanLine } from 'lucide-react';
import { Drawer as FlowbiteDrawer, DrawerItems, Checkbox } from 'flowbite-react';
import { Badge } from './Badge';
import { Guest } from '../types';
import { markCFormFiled, checkinGuestInDB, uploadDocumentDB } from '../services/api';
import { scanApplicantIdFromFile } from '../utils/cFormBarcodeScanner';
import { useStaff } from '../contexts/StaffContext';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import { StyledSelect } from './StyledSelect';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { DateRangePicker } from './DateRangePicker';
import { CheckinVerificationModal } from './CheckinVerificationModal';
import { DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, renderWhatsappVoucherTemplate } from '../utils/whatsappVoucherTemplate';
import { shareTextContent } from '../utils/shareText';
import { t } from '../i18n/en';
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
  propertyUpiQrCodeUrl?: string;
  propertyCheckinTime?: string;
  propertyCheckoutTime?: string;
  propertyInstructions?: string;
  onOpenIdVerification?: () => void;
  onCheckedIn?: (guestId: string) => void;
  // Guest can be checked out and billed anytime during the stay, not just on
  // the original expected checkout date.
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
 * with full disabled booking form (Booking Details), an explicit Edit button
 * switches all fields into editable mode.
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
  propertyUpiQrCodeUrl = '',
  propertyCheckinTime = '',
  propertyCheckoutTime = '',
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
    upi_qr_code_url?: string;
    checkin_time?: string;
    checkout_time?: string;
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
  // The selected Form 'C' file sits here, NOT yet uploaded - it's only
  // actually uploaded (and only then forwarded to Telegram) when "Save
  // C-Form" is clicked below, never just from picking a file. barcodeScan
  // tracks the client-side scan of THAT file so the UI can say what
  // happened without a server round-trip just to read the barcode.
  const [cFormFile, setCFormFile] = useState<File | null>(null);
  const [barcodeScanStatus, setBarcodeScanStatus] = useState<'idle' | 'scanning' | 'found' | 'not_found'>('idle');

  useEffect(() => {
    if (guest) {
      const g = guest as any;
      const noGuests = g.no_of_guests ?? g.numberOfGuests ?? 1;
      const rent = g.base_room_rent ?? g.roomRate ?? 0;
      const adv = g.advance_paid ?? g.advanceAmount ?? 0;

      setEditName(guest.guestName || '');
      setEditPhone(guest.phoneNumber || '');
      setEditRoomId(String(g.roomId ?? g.room_id ?? ''));
      setEditGuests(String(noGuests));
      setEditCheckin(guest.checkinDate?.split(' ')[0] || '');
      setEditCheckout(guest.expectedCheckout?.split(' ')[0] || guest.checkoutDate?.split(' ')[0] || '');
      setEditRoomRent(String(rent));
      setEditAdvance(String(adv));
      setEditAdvanceReceivedBy(g.advance_received_by || guest.advanceReceivedBy || '');
      setEditPendingReceivedBy(g.pending_received_by || guest.pendingReceivedBy || '');
      setEditBookingSource(guest.bookingSource || 'Offline');
      setEditNotes(guest.notes || '');
      setEditShowNotes(!!guest.notes);
      setEditIsForeignGuest(!!guest.isForeignGuest);

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
  
  const storedPending = g.pending_amount ?? g.pendingAmount;
  const extrasBaked = typeof storedPending === 'number'
    ? Math.max(0, storedPending - Math.max(0, roomRent - advancePaid))
    : 0;
  const pendingDisplay = isEditing
    ? Math.max(0, (parseFloat(editRoomRent) || 0) - (parseFloat(editAdvance) || 0) + extrasBaked)
    : Math.max(0, roomRent - advancePaid + extrasBaked);

  const handleEditPendingReceivedByChange = (val: string) => {
    setEditPendingReceivedBy(val);
    if (val) {
      setEditAdvance(String((parseFloat(editRoomRent) || 0) + extrasBaked));
    }
  };

  const startEditing = (highlightReceiver: boolean = false) => {
    setHighlightReceiverFields(highlightReceiver);
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

  const buildShareMessage = () => {
    const matchedRoom = rooms.find((r) => String(r.id) === String(g.roomId ?? g.room_id));
    const unitName = guest.roomNumber || matchedRoom?.name || propDetails.name || 'N/A';

    const addressVal = propertyAddress || propDetails.address || g.address || '';
    const phoneVal = propertyPhone || propDetails.phone || g.phone || '';
    const mapsVal = propertyMapsLink || propDetails.google_maps_link || g.google_maps_link || '';
    const upiVal = propertyUpiId || propDetails.upi_id || g.upi_id || '';
    let qrVal = propertyUpiQrCodeUrl || propDetails.upi_qr_code_url || (g as any).upi_qr_code_url || '';
    if (qrVal && qrVal.startsWith('/') && typeof window !== 'undefined') {
      qrVal = window.location.origin + qrVal;
    }
    const checkinTimeVal = propertyCheckinTime || propDetails.checkin_time || '14:00';
    const checkoutTimeVal = propertyCheckoutTime || propDetails.checkout_time || '11:00';
    const notesVal = propertyInstructions || propDetails.instructions || g.instructions || g.notes || '';

    return renderWhatsappVoucherTemplate(propertyWhatsappTemplate || DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, {
      guest_name: guest.guestName,
      room_name: unitName,
      room_number: unitName,
      property_name: propertyName || propDetails.name || 'our property',
      checkin_date: formatDate(guest.checkinDate?.split(' ')[0] || ''),
      checkin_time: checkinTimeVal,
      checkout_date: formatDate(guest.expectedCheckout?.split(' ')[0] || guest.checkoutDate?.split(' ')[0] || ''),
      checkout_time: checkoutTimeVal,
      guest_count: String(noOfGuests),
      room_tariff: roomRent.toFixed(2),
      total_amount: roomRent.toFixed(2),
      advance_paid: advancePaid.toFixed(2),
      address: addressVal,
      property_address: addressVal,
      contact_phone: phoneVal,
      property_phone: phoneVal,
      phone: phoneVal,
      maps_link: mapsVal,
      google_maps_link: mapsVal,
      upi_id: upiVal,
      upi_qr_code_url: qrVal,
      qr_code: qrVal,
      other_notes: notesVal,
      instructions: notesVal,
    });
  };

  const handleShareBooking = async () => {
    const message = buildShareMessage();
    await shareTextContent(
      'Booking Details',
      message,
      showToast,
      "Booking details copied - paste them wherever you'd like to send them.",
      'Could not share or copy booking details.',
    );
  };

  const financialHandlers = staff.filter((s) => s.isFinancialHandler).map((s) => ({ value: s.name, label: s.name }));
  const availableHandlers = financialHandlers.length > 0 ? financialHandlers : staff.map((s) => ({ value: s.name, label: s.name }));

  return (
    <>
      <FlowbiteDrawer
        open={Boolean(guest)}
        onClose={() => { onClose(); setIsEditing(false); }}
        position="right"
        className="z-60 w-full sm:max-w-lg md:max-w-xl h-full bg-white dark:bg-gray-800 p-0 flex flex-col shadow-2xl transition-transform border-l border-gray-200 dark:border-gray-700"
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-800">
          <h2 className="booking-details-modal__title text-base sm:text-lg font-semibold text-slate-900 dark:text-white flex flex-wrap items-center gap-2 pr-2">
            <span>{isEditing ? t('edit_booking_header', 'Edit Booking') : t('today_booking_details_heading', 'Booking Details')}</span>
            {guest.otaSource && (
              <Badge
                variant="warning"
                size="sm"
                className="booking-details-modal__ota-badge"
                title={t('ota_converted_badge_tooltip', 'Converted from an OTA calendar sync - editing this only changes this app, not the original platform')}
              >
                <Globe className="w-3 h-3 shrink-0" />
                {guest.otaSourceLabel || guest.otaSource}
                {guest.roomNumber && <span className="opacity-70">&middot; {guest.roomNumber}</span>}
              </Badge>
            )}
          </h2>
          <button
            type="button"
            onClick={() => { onClose(); setIsEditing(false); }}
            disabled={isSaving}
            className="text-gray-400 bg-transparent hover:bg-gray-100 hover:text-gray-900 rounded-lg text-sm w-8 h-8 inline-flex items-center justify-center dark:hover:bg-gray-700 dark:hover:text-white cursor-pointer transition-colors shrink-0"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <DrawerItems id="printableBookingDetailsContent" className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Action Banner 0: OTA cancellation drift */}
          {guest.otaCancelledDetectedAt && !isEditing && (
            <div className="w-full mb-3 px-3.5 py-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 flex items-center gap-2 shadow-2xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                {t('ota_cancelled_detected_banner', 'This reservation appears to have been cancelled on {{source}} - verify with the guest before proceeding.').replace('{{source}}', guest.otaSourceLabel || guest.otaSource || 'the OTA')}
              </span>
            </div>
          )}

          {/* Action Banner 1: Check-in ID Verification */}
          {!isEditing && (
            <div
              className={`booking-details-modal__id-btn w-full mb-3 px-3.5 py-2.5 rounded-lg border flex items-center justify-between gap-2 transition-colors ${
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
            <div className="w-full mb-3 px-3.5 py-2.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 flex items-center justify-between gap-2 shadow-2xs">
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
            
            const isAdvanceUnassigned = advancePaid > 0 && !advanceReceiver;
            const isPendingUnassigned = isCheckedOut && pendingDisplay === 0 && !pendingReceiver && (roomRent - advancePaid) > 0;
            const isCheckedOutUnsettled = isCheckedOut && pendingDisplay > 0;
            
            const showBanner = !isEditing && (isAdvanceUnassigned || isPendingUnassigned || isCheckedOutUnsettled);

            if (!showBanner) return null;

            return (
              <div className="w-full mb-3 px-3.5 py-2.5 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 flex items-center justify-between gap-2 shadow-2xs">
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

          {/* Unified Booking Form: Clean, Form-Based Layout (Disabled by Default, Editable on Edit) */}
          <div className="booking-details-modal__body space-y-3.5">
            {/* Row 0: Guest Name + Contact Phone */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Input
                  label={t('today_guest_name_label', 'Guest Name *')}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={!isEditing}
                  placeholder="Enter guest's full name"
                  required
                />
              </div>
              <div>
                <Input
                  label={t('contact_phone_label', 'Contact Phone Number *')}
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  maxLength={10}
                  placeholder="10-digit mobile number"
                  disabled={!isEditing}
                  required
                />
              </div>
            </div>

            {/* Row 1: Assigned Room (multi-key properties only) */}
            {rooms.length > 0 && (
              <div>
                <StyledSelect
                  label={t('assigned_room_label', 'Assigned Room / Villa *')}
                  value={editRoomId}
                  onChange={setEditRoomId}
                  disabled={!isEditing}
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
            )}

            {/* Row 2: Booking Source + No. of Guests */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <StyledSelect
                  label={t('booking_source_label', 'Booking Source')}
                  value={editBookingSource}
                  onChange={setEditBookingSource}
                  disabled={!isEditing}
                  options={[
                    { value: 'Offline', label: 'Offline' },
                    { value: 'Online', label: 'Online' },
                  ]}
                />
              </div>
              <div>
                <Input
                  label={t('no_of_guests_label', 'No. of Guests')}
                  type="number"
                  min={1}
                  value={editGuests}
                  onChange={(e) => setEditGuests(e.target.value)}
                  disabled={!isEditing}
                />
              </div>
            </div>

            {/* Row 3: Booking Dates (DateRangePicker) */}
            <div>
              <DateRangePicker
                label="Booking Dates *"
                checkinDate={editCheckin}
                checkoutDate={editCheckout}
                onCheckinChange={setEditCheckin}
                onCheckoutChange={setEditCheckout}
                disabled={!isEditing}
              />
            </div>

            {/* Row 4: Room Rent + Status */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Input
                  label={t('room_rent', 'Room Rent')}
                  type="number"
                  min={0}
                  value={editRoomRent}
                  onChange={(e) => setEditRoomRent(e.target.value)}
                  disabled={!isEditing}
                  leftIcon={<IndianRupee className="w-3.5 h-3.5" />}
                />
              </div>
              <div>
                <Input
                  label={t('today_status_label', 'Status')}
                  type="text"
                  value={guest.status}
                  disabled={true}
                />
              </div>
            </div>

            {/* Row 5: Advance Paid + Advance Received By */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Input
                  label={t('today_advance_paid_label', 'Advance Paid (₹)')}
                  type="number"
                  min={0}
                  value={editAdvance}
                  onChange={(e) => setEditAdvance(e.target.value)}
                  disabled={!isEditing}
                  leftIcon={<IndianRupee className="w-3.5 h-3.5" />}
                />
              </div>
              <div>
                <StyledSelect
                  label={t('advance_received_by', 'Advance Received By')}
                  value={editAdvanceReceivedBy}
                  onChange={setEditAdvanceReceivedBy}
                  placeholder="-- Select Staff/User --"
                  disabled={!isEditing}
                  options={availableHandlers}
                  className={highlightReceiverFields && !editAdvanceReceivedBy ? 'ring-2 ring-red-400 rounded-lg' : ''}
                />
              </div>
            </div>

            {/* Row 6: Pending + Pending Received By */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Input
                  label={t('today_pending_label', 'Pending (₹)')}
                  type="text"
                  value={`₹${pendingDisplay.toLocaleString('en-IN')}`}
                  disabled={true}
                />
              </div>
              <div>
                <StyledSelect
                  label={t('pending_received_by_label', 'Pending Received By')}
                  value={editPendingReceivedBy}
                  onChange={handleEditPendingReceivedByChange}
                  placeholder="-- Select Staff/User --"
                  disabled={!isEditing}
                  options={availableHandlers}
                  className={highlightReceiverFields && !editPendingReceivedBy && ((guest.status as string) === 'Checked Out' || (g.status as string) === 'Checked Out') ? 'ring-2 ring-red-400 rounded-lg' : ''}
                />
              </div>
            </div>

            {/* Checkboxes Row (Flowbite Standard) */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 py-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="modal-guest-notes-cb"
                  checked={editShowNotes}
                  onChange={e => setEditShowNotes(e.target.checked)}
                  disabled={!isEditing}
                />
                <label
                  htmlFor="modal-guest-notes-cb"
                  className={`text-xs font-medium text-gray-900 dark:text-gray-300 select-none ${isEditing ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'}`}
                >
                  {t('guest_notes_checkbox_label', 'Guest Notes')}
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="modal-foreign-guest-cb"
                  checked={editIsForeignGuest}
                  onChange={e => setEditIsForeignGuest(e.target.checked)}
                  disabled={!isEditing}
                />
                <label
                  htmlFor="modal-foreign-guest-cb"
                  className={`text-xs font-medium text-gray-900 dark:text-gray-300 select-none ${isEditing ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'}`}
                >
                  {t('foreign_national_guest_label', 'Foreign National Guest')}
                </label>
              </div>
            </div>

            {/* Guest Notes Textarea (if checked or existing notes present) */}
            {(editShowNotes || guest.notes) && (
              <div>
                <Textarea
                  label={t('guest_notes_checkbox_label', 'Guest Notes')}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  disabled={!isEditing}
                  rows={2}
                  placeholder={t('guest_notes_placeholder', 'Any special requests or notes...')}
                />
              </div>
            )}

            {/* Foreign Guest C-Form Section (plain, no colored callout box -
                found 21 Aug 2026 this stood out more than any other field
                group on the form for no real reason) */}
            {(editIsForeignGuest || guest.isForeignGuest) && (
              <div id="c-form-checkbox-container" className="pt-1 border-t border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-100 select-none">
                    <Checkbox
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
                    />
                    <span>Mark C-Form as filed</span>
                  </label>
                  <span className={`text-xs font-semibold ${isCFormFiled ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {isCFormFiled ? 'Filed' : 'Filing Pending'}
                  </span>
                </div>

                {cFormFiledState && (
                  <div className="mt-2.5 space-y-2">
                    {/* Upload control comes first, above the number field it
                        fills - reads clearer than the reverse order (fill
                        THIS, or upload to fill it automatically). File is
                        held here only; it's not uploaded to the server (and
                        never reaches Telegram) until "Save C-Form" below
                        actually goes through - see that button's onClick. */}
                    <div>
                      <label
                        htmlFor="c-form-file-input"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                      >
                        <Paperclip className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                        <span className="flex-1 truncate">
                          {cFormFile ? cFormFile.name : 'Upload the filed Form C (PDF or photo) - we\'ll read the Applicant ID from its barcode and fill it in below automatically.'}
                        </span>
                        <input
                          id="c-form-file-input"
                          type="file"
                          accept="application/pdf,image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0] || null;
                            e.target.value = ''; // allow re-selecting the same file after a failed scan
                            if (!file) return;
                            setCFormFile(file);
                            setBarcodeScanStatus('scanning');
                            const applicantId = await scanApplicantIdFromFile(file);
                            if (applicantId) {
                              setCFormNumberState(applicantId);
                              setBarcodeScanStatus('found');
                            } else {
                              setBarcodeScanStatus('not_found');
                            }
                          }}
                        />
                      </label>
                      {barcodeScanStatus === 'scanning' && (
                        <p className="mt-1 flex items-center gap-1 text-2xs text-slate-500 dark:text-slate-400">
                          <Loader2 className="w-3 h-3 animate-spin" /> Reading barcode...
                        </p>
                      )}
                      {barcodeScanStatus === 'found' && (
                        <p className="mt-1 flex items-center gap-1 text-2xs text-emerald-600 dark:text-emerald-400">
                          <ScanLine className="w-3 h-3" /> Applicant ID read from barcode - double-check it below before saving.
                        </p>
                      )}
                      {barcodeScanStatus === 'not_found' && (
                        <p className="mt-1 text-2xs text-amber-600 dark:text-amber-400">
                          Couldn't read a barcode from that file - enter the Applicant ID / Confirmation No. manually below.
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        id="c-form-number-input"
                        type="text"
                        value={cFormNumberState}
                        onChange={(e) => setCFormNumberState(e.target.value)}
                        placeholder="C-Form Confirmation No. / Applicant ID"
                        className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                      <button
                        type="button"
                        disabled={isSavingCForm}
                        onClick={async () => {
                          setIsSavingCForm(true);
                          // Upload (if a file was picked) BEFORE marking filed, so the
                          // saved record - and the Telegram notification it triggers -
                          // carry the document together, in one save, rather than the
                          // file trailing in as a separate later event.
                          let documentUrl: string | undefined;
                          if (cFormFile) {
                            const uploaded = await uploadDocumentDB(cFormFile, 'c_form');
                            if (!uploaded) {
                              setIsSavingCForm(false);
                              showToast('Failed to upload the C-Form file - try again', { type: 'error' });
                              return;
                            }
                            documentUrl = uploaded.url;
                          }
                          const ok = await markCFormFiled(guest.id, true, cFormNumberState, documentUrl);
                          setIsSavingCForm(false);
                          if (ok) {
                            const filedAt = new Date().toISOString();
                            setCFormFiledState(true);
                            showToast(
                              documentUrl ? 'C-Form saved & sent to Telegram with the uploaded document' : 'C-Form saved & Telegram notification sent',
                              { type: 'success' }
                            );
                            await onSave({ ...guest, cFormFiledAt: filedAt, cFormFiled: true, c_form_filed: true, cFormNumber: cFormNumberState, c_form_number: cFormNumberState, cFormDocumentUrl: documentUrl } as any);
                          } else {
                            showToast('Failed to save C-Form details', { type: 'error' });
                          }
                        }}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white transition-all cursor-pointer shadow-2xs shrink-0 flex items-center gap-1"
                      >
                        {isSavingCForm ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        <span>Save C-Form</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Modal Actions Footer: Clean Layout with Checkout on Bottom Right */}
          {/* Modal Actions Footer: 3 Columns for Delete/Share/Edit, 2 Columns for Cancel/Save */}
          <div id="printableBookingDetailsActionsBar" className="booking-details-modal__footer mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
            {!isEditing ? (
              <div className="space-y-3 w-full">
                {/* Mark Checked In (Full-width action if status is Booked) */}
                {(guest.status === GUEST_STATUS_BOOKED || (guest.status as string) === GUEST_STATUS_CONFIRMED_LEGACY) && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await checkinGuestInDB(guest.id);
                      if (ok) {
                        guest.status = GUEST_STATUS_CHECKED_IN as any;
                        onCheckedIn?.(guest.id);
                        showToast(`${guest.guestName} marked as Checked In!`, { type: 'success' });
                      } else {
                        showToast('Failed to check in guest', { type: 'error' });
                      }
                    }}
                    className="w-full h-10 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5 active:scale-98"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{t('mark_checked_in_button', 'Mark Checked In')}</span>
                  </button>
                )}

                {/* Checkout & Settle Bill (Full-width action if status is Checked In) */}
                {onCheckout && (guest.status === GUEST_STATUS_CHECKED_IN || (guest.status as string) === GUEST_STATUS_ACTIVE_LEGACY) && (
                  <button
                    type="button"
                    onClick={onCheckout}
                    className="w-full h-10 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5 active:scale-98"
                  >
                    <LogOut className="w-4 h-4 shrink-0" />
                    <span>{t('checkout_settle_bill_button', 'Checkout & Settle Bill')}</span>
                  </button>
                )}

                {/* Delete, Share with Guest, Edit - 3 columns when Delete is
                    available, otherwise a real 2-column grid so Share/Edit
                    split the full width evenly instead of an invisible
                    placeholder div eating a third column (found 21 Aug 2026). */}
                <div className={`grid gap-2.5 w-full ${onDelete ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {onDelete && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="w-full h-10 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 dark:text-rose-300 dark:border-rose-800 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      title={t('today_delete_booking_button', 'Delete Booking')}
                    >
                      <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span className="truncate">{isDeleting ? t('deleting_button', 'Deleting...') : t('delete_button', 'Delete')}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleShareBooking}
                    className="w-full h-10 px-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300 dark:border-gray-600 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    title={t('share_with_guest_button', 'Share with guest')}
                  >
                    <Share2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="truncate">{t('share_with_guest_button', 'Share')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => startEditing()}
                    className="w-full h-10 px-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300 dark:border-gray-600 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    title={t('edit_button', 'Edit')}
                  >
                    <Pencil className="w-4 h-4 text-gray-600 dark:text-gray-400 shrink-0" />
                    <span className="truncate">{t('edit_button', 'Edit')}</span>
                  </button>
                </div>
              </div>
            ) : (
              /* 2 Columns: Cancel, Save */
              <div className="grid grid-cols-2 gap-2.5 w-full">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                  className="w-full h-10 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 dark:border-gray-600 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <X className="w-4 h-4 shrink-0" />
                  <span>{t('cancel_button', 'Cancel')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Save className="w-4 h-4 shrink-0" />}
                  <span>{t('save_button', 'Save')}</span>
                </button>
              </div>
            )}
          </div>
        </DrawerItems>
      </FlowbiteDrawer>

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
