import React, { useState } from 'react';
import { X, Save, Share2, Printer, Trash2, IdCard, Loader2, Pencil, CheckCircle2, AlertTriangle } from 'lucide-react';
import * as htmlToImage from 'html-to-image';
import { Guest } from '../types';
import { markCFormFiled } from '../services/api';
import { useStaff } from '../contexts/StaffContext';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import { StyledSelect } from './StyledSelect';
import { DateRangePicker } from './DateRangePicker';
import { Button } from './Button';
import { DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, renderWhatsappVoucherTemplate } from '../utils/whatsappVoucherTemplate';
import { t } from '../i18n/en';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

interface BookingDetailsModalProps {
  guest: Guest | null;
  onClose: () => void;
  onSave: (updatedGuest: Guest) => Promise<void>;
  onDelete?: (guestId: string) => Promise<void>;
  rooms?: Array<{ id: number; name: string; slug: string }>;
  checkedInGuests?: Guest[];
  propertyName?: string;
  propertyMapsLink?: string;
  propertyPhone?: string;
  propertyWhatsappTemplate?: string;
  onOpenIdVerification?: () => void;
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
  propertyMapsLink = '',
  propertyPhone = '',
  propertyWhatsappTemplate = '',
  onOpenIdVerification,
}) => {
  const { staff } = useStaff();
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

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

  if (!guest) return null;

  const g = guest as any;
  const noOfGuests = g.no_of_guests ?? g.numberOfGuests ?? 1;
  const roomRent = g.base_room_rent ?? g.roomRate ?? 0;
  const advancePaid = g.advance_paid ?? g.advanceAmount ?? 0;
  const pendingDisplay = isEditing
    ? Math.max(0, (parseFloat(editRoomRent) || 0) - (parseFloat(editAdvance) || 0))
    : Math.max(0, roomRent - advancePaid);

  const startEditing = () => {
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

  const getBlockedDateStrings = () => {
    const guestRoomId = g.roomId ?? g.room_id;
    const blocked: string[] = [];
    checkedInGuests
      .filter((other) => other.id !== guest.id)
      .filter((other) => {
        const otherRoomId = (other as any).roomId ?? (other as any).room_id;
        return guestRoomId ? Number(otherRoomId) === Number(guestRoomId) : other.roomNumber === guest.roomNumber;
      })
      .forEach((other) => {
        const start = new Date(other.checkinDate);
        const end = new Date(other.expectedCheckout || other.checkoutDate || other.checkinDate);
        const cur = new Date(start);
        while (cur < end) {
          blocked.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
          cur.setDate(cur.getDate() + 1);
        }
      });
    return blocked;
  };

  const handleSave = async () => {
    const newRoom = rooms.find((r) => String(r.id) === editRoomId);
    const newRoomRent = parseFloat(editRoomRent) || 0;
    const newAdvance = parseFloat(editAdvance) || 0;
    const newPending = Math.max(0, newRoomRent - newAdvance);
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
        advanceReceivedBy: newAdvance > 0 ? editAdvanceReceivedBy : '',
        advance_received_by: newAdvance > 0 ? editAdvanceReceivedBy : '',
        pendingAmount: newPending,
        pendingReceivedBy: newPending > 0 ? editPendingReceivedBy : '',
        pending_received_by: newPending > 0 ? editPendingReceivedBy : '',
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
    const message = renderWhatsappVoucherTemplate(propertyWhatsappTemplate || DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, {
      guest_name: guest.guestName,
      room_name: guest.roomNumber,
      property_name: propertyName || 'us',
      checkin_date: formatDate(guest.checkinDate?.split(' ')[0] || ''),
      checkout_date: formatDate(guest.expectedCheckout?.split(' ')[0] || ''),
      guest_count: String(noOfGuests),
      room_tariff: roomRent.toFixed(2),
      advance_paid: advancePaid.toFixed(2),
      maps_link: propertyMapsLink,
      contact_phone: propertyPhone,
    });
    return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
  };

  const handleShareVoucherPng = async () => {
    const box = document.getElementById('printableBookingDetailsContent');
    if (!box) return;
    const actionsBar = document.getElementById('printableBookingDetailsActionsBar');
    if (actionsBar) actionsBar.style.display = 'none';
    try {
      const blob = await htmlToImage.toBlob(box, { pixelRatio: 2, backgroundColor: '#ffffff' });
      if (!blob) return;
      const file = new File([blob], `Booking_${guest.guestName || 'Details'}_${Date.now()}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Booking Details' });
      } else {
        const link = document.createElement('a');
        link.download = `Booking_${guest.guestName || 'Details'}_${Date.now()}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
      }
    } catch (err) {
      showToast('Failed to generate image: ' + (err instanceof Error ? err.message : String(err)), { type: 'error' });
    } finally {
      if (actionsBar) actionsBar.style.display = '';
    }
  };

  const financialHandlers = staff.filter((s) => s.isFinancialHandler).map((s) => ({ value: s.name, label: s.name }));

  const fieldLabelClass = 'text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase';
  const inputClass = 'mt-1 w-full h-10 px-3.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100/30';

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { onClose(); setIsEditing(false); }}>
        <div
          id="printableBookingDetailsContent"
          className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-700 pb-3">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
              {isEditing ? t('edit_booking_header', 'Edit Booking') : t('today_booking_details_heading', 'Booking Details')}
            </h2>
            <button onClick={() => { onClose(); setIsEditing(false); }} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer text-slate-400">
              <X className="w-5 h-5" />
            </button>
          </div>

          {onOpenIdVerification && !isEditing && (
            <button
              onClick={onOpenIdVerification}
              className={`w-full mb-4 px-4 py-2.5 rounded-xl border flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                guest.idVerificationStatus === 'Complete'
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                  : 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50'
              }`}
            >
              <span className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-100">
                <IdCard className="w-4 h-4 text-slate-500" />
                {t('checkin_id_verification_label', 'Check-in ID Verification')}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                guest.idVerificationStatus === 'Complete'
                  ? 'bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : 'bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200'
              }`}>
                {guest.idVerificationStatus === 'Complete' ? t('verification_complete_badge', 'Complete') : t('verification_pending_badge', 'Pending')}
              </span>
            </button>
          )}

          <div className="space-y-4">
            {/* Row: Guest Name + Room */}
            <div className={rooms.length > 0 ? 'grid grid-cols-2 gap-4' : ''}>
              <div>
                <label className={fieldLabelClass}>{t('today_guest_name_label', 'Guest Name')}</label>
                {isEditing ? (
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className={inputClass} />
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
                  <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className={inputClass} />
                ) : (
                  <div className="mt-1 w-full h-10 px-3.5 flex items-center bg-transparent border border-transparent text-slate-900 dark:text-white text-sm font-medium">
                    {guest.phoneNumber || '—'}
                  </div>
                )}
              </div>
              <div>
                <label className={fieldLabelClass}>{t('no_of_guests_label', 'No. of Guests')}</label>
                {isEditing ? (
                  <input type="number" min={1} value={editGuests} onChange={(e) => setEditGuests(e.target.value)} className={inputClass} />
                ) : (
                  <div className="mt-1 w-full h-10 px-3.5 flex items-center bg-transparent border border-transparent text-slate-900 dark:text-white text-sm font-medium">
                    {noOfGuests} guest{noOfGuests !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </div>

            {/* Row: Check-in + Check-out */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={fieldLabelClass}>{t('today_check_in_label', 'Check-in')}</label>
                {isEditing ? (
                  <button type="button" onClick={() => setShowDatePicker(true)} className={`${inputClass} text-left hover:border-blue-500 transition cursor-pointer`}>
                    {editCheckin ? formatDate(editCheckin) : t('today_add_date_button', 'Add date')}
                  </button>
                ) : (
                  <div className="mt-1 w-full h-10 px-3.5 flex items-center bg-transparent border border-transparent text-slate-900 dark:text-white text-sm font-medium">
                    {formatDate(guest.checkinDate?.split(' ')[0] || '')}
                  </div>
                )}
              </div>
              <div>
                <label className={fieldLabelClass}>{t('today_check_out_label', 'Check-out')}</label>
                {isEditing ? (
                  <button type="button" onClick={() => setShowDatePicker(true)} className={`${inputClass} text-left hover:border-blue-500 transition cursor-pointer`}>
                    {editCheckout ? formatDate(editCheckout) : t('today_add_date_button', 'Add date')}
                  </button>
                ) : (
                  <div className="mt-1 w-full h-10 px-3.5 flex items-center bg-transparent border border-transparent text-slate-900 dark:text-white text-sm font-medium">
                    {formatDate(guest.expectedCheckout?.split(' ')[0] || '')}
                  </div>
                )}
              </div>
            </div>

            {/* Room Rent */}
            <div>
              <label className={fieldLabelClass}>{t('room_rent', 'Room Rent / Price (₹)')}</label>
              {isEditing ? (
                <input type="number" min={0} value={editRoomRent} onChange={(e) => setEditRoomRent(e.target.value)} className={inputClass} />
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
                  <input type="number" min={0} value={editAdvance} onChange={(e) => setEditAdvance(e.target.value)} className={inputClass} />
                ) : (
                  <div className="mt-1 w-full h-10 px-3.5 flex items-center bg-transparent border border-transparent text-emerald-600 dark:text-emerald-400 text-sm font-semibold">
                    ₹{advancePaid}
                  </div>
                )}
              </div>
              <div>
                <label className={fieldLabelClass}>{t('advance_received_by', 'Advance Received By')}</label>
                {isEditing ? (
                  (parseFloat(editAdvance) || 0) > 0 ? (
                    <div className="mt-1">
                      <StyledSelect value={editAdvanceReceivedBy} onChange={setEditAdvanceReceivedBy} placeholder="-- Select Staff/User --" buttonClassName="w-full h-10 px-3.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100/30" options={financialHandlers} />
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400 italic">—</p>
                  )
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
                <label className={fieldLabelClass}>{t('pending_received_by_label', 'Pending Received By')}</label>
                {isEditing ? (
                  pendingDisplay > 0 ? (
                    <div className="mt-1">
                      <StyledSelect value={editPendingReceivedBy} onChange={setEditPendingReceivedBy} placeholder="-- Select Staff/User --" buttonClassName="w-full h-10 px-3.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100/30" options={financialHandlers} />
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400 italic">—</p>
                  )
                ) : (
                  <div className="mt-1 w-full h-10 px-3.5 flex items-center bg-transparent border border-transparent text-slate-900 dark:text-white text-sm font-medium">
                    {g.pending_received_by || guest.pendingReceivedBy || '—'}
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
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
                  <input type="checkbox" checked={editShowNotes} onChange={(e) => setEditShowNotes(e.target.checked)} />
                  {t('guest_notes_checkbox_label', 'Guest Notes')}
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
                  <input type="checkbox" checked={editIsForeignGuest} onChange={(e) => setEditIsForeignGuest(e.target.checked)} />
                  {t('foreign_national_guest_label', 'Foreign National Guest')}
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
                    <div>
                      <label className={fieldLabelClass}>{t('foreign_national_guest_label', 'Foreign National Guest')}</label>
                      <div className="flex items-center gap-2 mt-1">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800 dark:text-slate-200 select-none">
                          <input
                            type="checkbox"
                            checked={!!guest.cFormFiledAt}
                            onChange={async (e) => {
                              const isChecked = e.target.checked;
                              const ok = await markCFormFiled(guest.id, isChecked);
                              if (ok) {
                                const filedAt = isChecked ? new Date().toISOString() : null;
                                guest.cFormFiledAt = filedAt;
                                showToast(isChecked ? `✔ C-Form marked as filed` : `C-Form marked as pending`, { type: 'success' });
                              } else {
                                showToast('Failed to update C-Form status', { type: 'error' });
                              }
                            }}
                            className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500 cursor-pointer"
                          />
                          <span>C-Form Filed</span>
                          {guest.cFormFiledAt && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal">
                              ({formatDateDDMMYYYY(guest.cFormFiledAt)})
                            </span>
                          )}
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )
            )}
            {isEditing && editShowNotes && (
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                placeholder={t('guest_notes_placeholder', 'Any special requests or notes...')}
                className={inputClass}
              />
            )}
          </div>

          <div id="printableBookingDetailsActionsBar" className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
            {!isEditing ? (
              <>
                <div className="flex items-center gap-2">
                  {onDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      leftIcon={<Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />}
                      className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      {isDeleting ? t('deleting_button', 'Deleting...') : t('today_delete_booking_button', 'Delete Booking')}
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {(guest.status === 'Booked' || (guest.status as string) === 'Reserved') && (
                    <button
                      type="button"
                      onClick={async () => {
                        const updated = { ...guest, status: 'Active' as const };
                        await onSave(updated);
                        showToast(`✔ ${guest.guestName} marked as Checked In!`, { type: 'success' });
                      }}
                      className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5 active:scale-95"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{t('mark_checked_in_button', 'Mark Checked In')}</span>
                    </button>
                  )}

                  <a href={buildWhatsAppShareUrl()} target="_blank" rel="noopener noreferrer">
                    <Button variant="secondary" size="sm" leftIcon={<Share2 className="w-4 h-4 text-emerald-600" />}>
                      {t('today_share_via_whatsapp_button', 'Share Voucher')}
                    </Button>
                  </a>
                  <Button variant="secondary" size="sm" onClick={handleShareVoucherPng} leftIcon={<Printer className="w-4 h-4 text-cyan-600" />}>
                    {t('share_png_button', 'Share PNG')}
                  </Button>
                  <Button variant="primary" size="sm" onClick={startEditing} leftIcon={<Pencil className="w-4 h-4" />}>
                    {t('edit_button', 'Edit')}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={onClose}>
                    {t('close_button', 'Close')}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 ml-auto">
                <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)} disabled={isSaving}>
                  {t('cancel_button', 'Cancel')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                  leftIcon={isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                >
                  {t('save_button', 'Save')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <DateRangePicker
        isOpen={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        checkinDate={editCheckin}
        checkoutDate={editCheckout}
        onCheckinChange={setEditCheckin}
        onCheckoutChange={setEditCheckout}
        onClear={() => { setEditCheckin(''); setEditCheckout(''); }}
        blockedDates={getBlockedDateStrings()}
      />
    </>
  );
};

