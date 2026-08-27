import React, { useState, useEffect, useRef } from 'react';
import { Save, Trash2, IdCard, Loader2, Pencil, CheckCircle2, Share2, LogOut, Upload, CreditCard, Globe, AlertTriangle, X, IndianRupee, ScanLine } from './icons/FlowbiteIcons';
import { Drawer as FlowbiteDrawer, DrawerItems, Checkbox } from 'flowbite-react';
import { Badge } from './Badge';
import { Popover } from './Popover';
import { Guest } from '../types';
import { markCFormFiled, checkinGuestInDB, uploadDocumentDB } from '../services/api';
import { scanApplicantIdFromFile } from '../utils/cFormBarcodeScanner';
import { useStaff } from '../contexts/StaffContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import { StyledSelect } from './StyledSelect';
import { Input } from './Input';
import { FileInput } from './FileInput';
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
  // Vestigial (26 Aug 2026) - see the destructuring default below for why
  // this is never read anymore.
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
  // Lets a caller that opened this modal FROM somewhere other than the
  // guest's own "Edit"/banner click - a Dashboard System Alert row, a
  // BillingCheckout warning-badge Popover's "Go to X" button, a future
  // notification - carry the user straight to the same spot a click on the
  // matching in-modal banner would (24 Aug 2026, "if someone clicks such
  // button from dashboard or notification or bookings page this whole
  // process should happen"). 'c_form'/'checkin' scroll to + highlight the
  // relevant section within THIS modal (see the useEffect below); those two
  // still require the user's own explicit Save/Mark-Checked-In click once
  // they're looking at it - this only does the navigating, never the actual
  // save, so a single external click never silently mutates a booking with
  // no modal in front of the user. 'id_verification' opens the (separate)
  // ID upload flow directly, since that one's just opening a place to
  // upload - not a mutation - so there's no equivalent safety concern.
  initialFocusSection?: 'c_form' | 'checkin' | 'id_verification' | null;
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
  // No longer read (26 Aug 2026, explicit request: "dont let there be
  // facility of whatsapp message customisation") - the voucher message is
  // now always DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, see buildShareMessage()
  // below. Left in the props interface (default '', never used) purely so
  // the ~7 call sites that still thread this prop down from App.tsx don't
  // all need editing - see PropertyEditForm.tsx for where the (now
  // non-editable) live preview of this exact message moved to instead.
  propertyWhatsappTemplate: _propertyWhatsappTemplate = '',
  propertyUpiId = '',
  propertyUpiQrCodeUrl = '',
  propertyCheckinTime = '',
  propertyCheckoutTime = '',
  propertyInstructions = '',
  onOpenIdVerification,
  onCheckedIn,
  onCheckout,
  initialFocusSection = null,
}) => {
  const { staff } = useStaff();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { activeRole } = useAuth();
  // ROLES.md (23 Aug 2026): Staff Kitchen is view-only on bookings - no
  // upload ID, C-Form, check-in, checkout, edit, or delete. Plain Staff keeps
  // all of those except checkout specifically. Read directly from AuthContext
  // (like Navigation.tsx already does for its own role-based nav filtering)
  // rather than threading a new prop through every BookingDetailsModal call
  // site - App.tsx alone renders this component from several places.
  const normalizedActiveRole = (activeRole || '').toLowerCase().trim();
  const isStaffKitchenRole = normalizedActiveRole === 'staff kitchen';
  const canActOnBooking = !isStaffKitchenRole;
  const canCheckoutBooking = !isStaffKitchenRole && normalizedActiveRole !== 'staff';

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

  // Extracted 24 Aug 2026 so the new top "Check-in Pending" warning banner
  // (see Action Banner 0.5 below - added same day, reported as "Check in
  // still pending but it's not showing the warning on top") and the
  // pre-existing footer "Mark Checked In" button share one implementation
  // instead of two copies drifting apart over time.
  const handleMarkCheckedIn = async () => {
    const ok = await checkinGuestInDB(guest.id);
    if (ok) {
      guest.status = GUEST_STATUS_CHECKED_IN as any;
      onCheckedIn?.(guest.id);
      showToast(`${guest.guestName} marked as Checked In!`, { type: 'success' });
    } else {
      showToast('Failed to check in guest', { type: 'error' });
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

  // Whether the number-input/upload fields are expanded - deliberately a
  // SEPARATE flag from cFormFiledState (24 Aug 2026 fix). Before this, the
  // "Mark C-Form Filed" banner button and the "Mark C-Form as filed"
  // checkbox both flipped cFormFiledState itself just to reveal these
  // fields, which had two real bugs: (1) the top warning banner (gated on
  // `!isCFormFiled`) vanished the instant you clicked, before anything was
  // actually saved - reported as "banner should stay there"; (2)
  // cFormLocked (added earlier this same session) is `isCFormFiled &&
  // !isEditing` - with the old single-flag design, revealing the fields
  // this way while not in Edit mode *also* immediately locked them right as
  // they appeared, since both conditions flipped true together. Now
  // cFormFiledState/isCFormFiled means ONLY "genuinely saved" (flips true
  // only inside Save C-Form's success handler, or on load from
  // guest.cFormFiledAt), so cFormLocked stays false while this is open but
  // unsaved, and the top banner correctly stays visible the whole time too.
  const [cFormSectionOpen, setCFormSectionOpen] = useState<boolean>(false);
  const cFormSectionRef = useRef<HTMLDivElement>(null);
  const checkinBannerRef = useRef<HTMLDivElement>(null);

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
      // Section starts open if already genuinely filed (so a returning look
      // at an already-filed guest still shows the saved number/document
      // without an extra click) - otherwise closed until the banner/
      // checkbox/initialFocusSection opens it.
      setCFormSectionOpen(isFiled);
    }
  }, [guest]);

  // External "take me to X" entry point (24 Aug 2026) - see initialFocusSection's
  // own doc comment above. Runs once per guest/target combo; deliberately
  // does NOT depend on cFormSectionOpen/isEditing etc. so it doesn't re-fire
  // and re-scroll every time those flip from the user's own later clicks.
  useEffect(() => {
    if (!guest || !initialFocusSection) return;
    if (initialFocusSection === 'c_form') {
      setCFormSectionOpen(true);
    } else if (initialFocusSection === 'id_verification') {
      handleOpenId();
    }
    // 'checkin' needs no state change here - Action Banner 0.5 is already
    // visible whenever the guest is still Booked, purely from guest.status;
    // the scroll-to-it below is all that's left to do.
    // Scroll happens in the next effect, once the target section's ref is
    // actually mounted for this render pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guest?.id, initialFocusSection]);

  // Scrolls to + (via cFormHighlightActive below) highlights whichever
  // section initialFocusSection - or the user's own banner click - just
  // opened. Runs after cFormSectionOpen/initialFocusSection changes, once
  // the target section has actually rendered.
  useEffect(() => {
    if (initialFocusSection === 'checkin' && checkinBannerRef.current) {
      checkinBannerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (cFormSectionOpen && cFormSectionRef.current) {
      cFormSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Focus the number field once the scroll has had a moment to start -
      // same UX the old inline .focus() call gave, just reachable now from
      // every trigger (banner click, checkbox, or an external
      // initialFocusSection), not only the banner's own onClick.
      const focusTimer = setTimeout(() => {
        document.getElementById('c-form-number-input')?.focus();
      }, 300);
      return () => clearTimeout(focusTimer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cFormSectionOpen, initialFocusSection]);

  if (!guest) return null;

  const g = guest as any;
  const isCFormFiled = cFormFiledState;
  // Once a C-Form has actually been filed & saved, lock its number field/
  // upload/Save button the same way every other field on this form is
  // already locked until "Edit" is clicked (24 Aug 2026 - reported as these
  // two staying fully active/editable even while the rest of the form sat
  // greyed out in view mode). Deliberately does NOT gate on canActOnBooking
  // here - that's still the right check for the FIRST-time fill-in flow
  // (see the checkbox/upload/Save button below), this only adds the extra
  // "already filed" lock on top once there's something saved to protect.
  const cFormLocked = isCFormFiled && !isEditing;
  // FOUND 25 Aug 2026 (live report: a past booking showed "Filed" in green with a fully
  // checked box, but the C-Form Confirmation No. field was empty) - "Save C-Form" never
  // required a confirmation number or an uploaded document before marking filed=true, so
  // this state was reachable (and evidently reached) with zero proof of an actual filing
  // behind it. Used below both to block a NEW save with nothing entered (see the Save
  // button's `disabled`) and to keep flagging an ALREADY-saved record like this one instead
  // of quietly showing a clean green "Filed" with nothing to back it up.
  const cFormMissingProof = isCFormFiled && !cFormNumberState.trim() && !cFormFile;
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

  // Booked days for whichever room is currently assigned (editRoomId, live-
  // updated if the admin changes the Assigned Room dropdown while editing),
  // excluding this guest's OWN booking - fed to the Booking Dates picker
  // below so an already-booked day for that room renders greyed-out/struck-
  // through/unselectable instead of silently allowing a double-booking (see
  // CLAUDE.md's Multi-Key Rooms & Bookings: "1 room = 1 active booking").
  // Mirrors GuestManagement.tsx's own getBlockedDateStrings() for the Add
  // Guest flow - kept separate rather than shared since the room-matching
  // fallback here needs guest.roomNumber (single-property, no room selector)
  // instead of GuestManagement's roomNumber state.
  const getEditBlockedDateStrings = (): string[] => {
    const blocked: string[] = [];
    const selectedRoomId = editRoomId ? parseInt(editRoomId, 10) : undefined;

    checkedInGuests
      .filter((other) => other.id !== guest.id)
      .filter((other) => {
        const otherRoomId = (other as any).roomId ?? (other as any).room_id;
        if (selectedRoomId != null && otherRoomId != null) {
          return Number(otherRoomId) === Number(selectedRoomId);
        }
        // Single-property fallback (no Assigned Room dropdown rendered at
        // all when rooms.length === 0) - match by room name instead.
        return !!guest.roomNumber && !!other.roomNumber
          && other.roomNumber.toLowerCase().trim() === guest.roomNumber.toLowerCase().trim();
      })
      .forEach((other) => {
        const checkinStr = (other.checkinDate || '').split(' ')[0].split('T')[0];
        const checkoutStr = (other.expectedCheckout || other.checkoutDate || other.checkinDate || '').split(' ')[0].split('T')[0];
        if (!checkinStr) return;

        const [sy, sm, sd] = checkinStr.split('-').map(Number);
        const [ey, em, ed] = (checkoutStr || checkinStr).split('-').map(Number);
        if (!sy || !sm || !sd) return;

        const start = new Date(sy, sm - 1, sd, 12, 0, 0);
        const end = ey && em && ed ? new Date(ey, em - 1, ed, 12, 0, 0) : new Date(start);

        const current = new Date(start);
        while (current < end) {
          const y = current.getFullYear();
          const m = String(current.getMonth() + 1).padStart(2, '0');
          const d = String(current.getDate()).padStart(2, '0');
          blocked.push(`${y}-${m}-${d}`);
          current.setDate(current.getDate() + 1);
        }
      });

    return blocked;
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
      // Surface the real backend reason (e.g. "Access denied for this property.", "Booking not
      // found") instead of masking every cause behind one generic message - see api.ts's
      // deleteGuestFromDB comment (23 Aug 2026) for why this used to be undiagnosable.
      const message = err instanceof Error && err.message ? err.message : 'Failed to delete booking. Please try again.';
      showToast(message, { type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  const buildShareMessage = () => {
    const matchedRoom = rooms.find((r) => String(r.id) === String(g.roomId ?? g.room_id));
    const unitName = guest.roomNumber || matchedRoom?.name || propertyName || 'N/A';

    const addressVal = propertyAddress || g.address || '';
    const phoneVal = propertyPhone || g.phone || '';
    const mapsVal = propertyMapsLink || g.google_maps_link || '';
    const upiVal = propertyUpiId || g.upi_id || '';
    let qrVal = propertyUpiQrCodeUrl || (g as any).upi_qr_code_url || '';
    if (qrVal && qrVal.startsWith('/') && typeof window !== 'undefined') {
      qrVal = window.location.origin + qrVal;
    }
    const checkinTimeVal = propertyCheckinTime || '14:00';
    const checkoutTimeVal = propertyCheckoutTime || '11:00';
    const notesVal = propertyInstructions || g.instructions || g.notes || '';

    return renderWhatsappVoucherTemplate(DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, {
      guest_name: guest.guestName,
      room_name: unitName,
      room_number: unitName,
      property_name: propertyName || 'our property',
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
              // Click-triggered Popover (24 Aug 2026) - see BillingCheckout.tsx's
              // matching room-card badge for why (was a hover-only Badge `title`,
              // couldn't hold a link, mobile-tap-stuck-open risk). zIndex=70
              // because this Drawer itself is z-60 (Popover.tsx's own comment on
              // needing an explicit higher value for triggers inside a secondary
              // modal, same fix ConvertOtaBookingModal already needed for its Help?
              // popover). Room number already dropped from this badge above (24 Aug
              // 2026) - redundant with "Assigned Room / Villa" a few fields down.
              <Popover
                trigger="click"
                placement="bottom"
                zIndex={70}
                content={
                  <div className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed max-w-xs space-y-1.5">
                    <p>{t('ota_converted_badge_tooltip', 'Converted from an OTA calendar sync - editing this only changes this app, not the original platform.')}</p>
                    <p>
                      <a href="#ical_sync" className="text-blue-600 dark:text-blue-400 font-semibold underline cursor-pointer">
                        {t('manage_calendar_sync_link', 'Manage Calendar Sync Settings')}
                      </a>
                    </p>
                  </div>
                }
              >
                <span className="inline-flex cursor-pointer">
                  <Badge
                    variant="warning"
                    size="sm"
                    className="booking-details-modal__ota-badge whitespace-nowrap shrink-0"
                  >
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <Globe className="w-3 h-3 shrink-0" />
                      <span>{guest.otaSourceLabel || guest.otaSource}</span>
                    </span>
                  </Badge>
                </span>
              </Popover>
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

          {/* Action Banner 0.5: Check-in Pending (added 24 Aug 2026 - reported
              as "Check in still pending but it's not showing the warning on
              top". The action itself already existed as a full-width footer
              button ("Mark Checked In"), but nothing up here where the other
              warnings live said so - easy to miss on a guest who's still just
              "Booked", especially scrolled past the ID/C-Form banners below
              which show regardless of check-in status. Shares
              handleMarkCheckedIn with that same footer button now, not a
              second copy of the same logic. */}
          {canActOnBooking && !isEditing && (guest.status === GUEST_STATUS_BOOKED || (guest.status as string) === GUEST_STATUS_CONFIRMED_LEGACY) && (
            <div
              ref={checkinBannerRef}
              className={`w-full mb-3 px-3.5 py-2.5 rounded-lg border flex items-center justify-between gap-2 shadow-2xs transition-shadow ${
                initialFocusSection === 'checkin'
                  ? 'border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-950/40 ring-2 ring-red-400 dark:ring-red-600'
                  : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>{t('checkin_pending_banner_label', 'Check-in Pending')}</span>
              </div>
              <button
                type="button"
                onClick={handleMarkCheckedIn}
                className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-all cursor-pointer shadow-2xs shrink-0 flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t('mark_checked_in_button', 'Mark Checked In')}
              </button>
            </div>
          )}

          {/* Action Banner 1: Check-in ID Verification */}
          {!isEditing && (
            <div
              data-tour="checkin-folio"
              className={`booking-details-modal__id-btn w-full mb-3 px-3.5 py-2.5 rounded-lg border flex items-center justify-between gap-2 transition-colors ${
                guest.idVerificationStatus === 'Complete'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
              }`}
            >
              <span className={`flex items-center gap-2 text-xs font-semibold ${
                guest.idVerificationStatus === 'Complete'
                  ? 'text-slate-700 dark:text-slate-100'
                  : 'text-rose-900 dark:text-rose-200'
              }`}>
                <IdCard className={`w-4 h-4 shrink-0 ${
                  guest.idVerificationStatus === 'Complete'
                    ? 'text-emerald-500'
                    : 'text-rose-600 dark:text-rose-400'
                }`} />
                {t('checkin_id_verification_label', 'Check-in ID Verification')}
              </span>
              {canActOnBooking && (
                <button
                  type="button"
                  onClick={handleOpenId}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 shrink-0 ${
                    guest.idVerificationStatus === 'Complete'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-rose-600 hover:bg-rose-700 text-white'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {guest.idVerificationStatus === 'Complete' ? 'View / Re-upload ID' : 'Upload Guest ID'}
                </button>
              )}
            </div>
          )}

          {/* Action Banner 1.5: Foreign Guest C-Form Warning */}
          {guest.isForeignGuest && !isCFormFiled && !isEditing && canActOnBooking && (
            <div className="w-full mb-3 px-3.5 py-2.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 flex items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-900 dark:text-rose-200">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>Foreign Guest: C-Form Filing Required</span>
              </div>
              <button
                type="button"
                onClick={() => setCFormSectionOpen(true)}
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
                  // No maxLength - see GuestManagement.tsx's onChange comment (23 Aug 2026): a
                  // native maxLength truncates raw typed characters before this digit-stripping
                  // runs, silently dropping trailing digits from any formatted phone number.
                  onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
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
                blockedDates={getEditBlockedDateStrings()}
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
                  <label className={`flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100 select-none ${canActOnBooking ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                    <Checkbox
                      // Bound to cFormSectionOpen, not cFormFiledState (24 Aug
                      // 2026 fix) - checking this box only REVEALS the fields
                      // below to fill in, it doesn't itself save anything
                      // (that's still "Save C-Form"). It used to flip
                      // cFormFiledState straight away, which prematurely
                      // marked this "Filed" (and, via cFormLocked, immediately
                      // DISABLED the very fields it had just revealed) before
                      // any save actually happened. Unchecking is the one
                      // real exception - that DOES save immediately (an
                      // explicit "actually mark as not filed" action), so it
                      // still flips cFormFiledState itself, and closes the
                      // section back up along with it.
                      checked={cFormSectionOpen}
                      disabled={!canActOnBooking}
                      onChange={async (e) => {
                        if (!canActOnBooking) return;
                        const isChecked = e.target.checked;
                        if (!isChecked) {
                          const ok = await markCFormFiled(guest.id, false, '');
                          if (ok) {
                            setCFormFiledState(false);
                            setCFormSectionOpen(false);
                            setCFormNumberState('');
                            showToast('C-Form marked as pending', { type: 'success' });
                            await onSave({ ...guest, cFormFiledAt: null, cFormFiled: false, c_form_filed: false, cFormNumber: '', c_form_number: '' } as any);
                          } else {
                            showToast('Failed to update C-Form status', { type: 'error' });
                          }
                        } else {
                          setCFormSectionOpen(true);
                        }
                      }}
                    />
                    <span>Mark C-Form as filed</span>
                  </label>
                  <span className={`text-xs font-semibold ${cFormMissingProof ? 'text-amber-600 dark:text-amber-400' : isCFormFiled ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {cFormMissingProof ? 'Filed (no reference on record)' : isCFormFiled ? 'Filed' : 'Filing Pending'}
                  </span>
                </div>

                {cFormMissingProof && (
                  <p className="mt-1.5 text-2xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    Marked filed but no confirmation number or document was ever saved - verify with the guest and fill it in below.
                  </p>
                )}

                {cFormSectionOpen && canActOnBooking && (
                  <div
                    ref={cFormSectionRef}
                    className={`mt-2.5 space-y-2 p-2.5 rounded-lg border transition-colors ${
                      // Red highlight box (24 Aug 2026 - "highlight that in a
                      // box with red") while this is genuinely still
                      // unresolved - clears itself the moment isCFormFiled
                      // actually flips true (a real save), not on a timer.
                      // Also stays up for cFormMissingProof (25 Aug 2026) -
                      // "filed" with nothing behind it is still unresolved,
                      // not a timer-driven state either.
                      !isCFormFiled || cFormMissingProof
                        ? 'border-red-400 dark:border-red-600 bg-red-50/60 dark:bg-red-950/20 ring-2 ring-red-400/60 dark:ring-red-600/60'
                        : 'border-transparent'
                    }`}
                  >
                    {/* Upload control comes first, above the number field it
                        fills - reads clearer than the reverse order (fill
                        THIS, or upload to fill it automatically). File is
                        held here only; it's not uploaded to the server (and
                        never reaches Telegram) until "Save C-Form" below
                        actually goes through - see that button's onClick. */}
                    <div>
                      <FileInput
                        id="c-form-file-input"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        disabled={cFormLocked}
                        // A real file input is always clickable to pick a different file -
                        // no separate "Reupload" trigger needed once a document is attached.
                        helperText={
                          cFormFile
                            ? `Selected: ${cFormFile.name}`
                            : "PDF or photo of the filed Form C - we'll read the Applicant ID from its barcode and fill it in below automatically."
                        }
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
                        disabled={cFormLocked}
                        className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-400 disabled:cursor-not-allowed"
                      />
                      <button
                        type="button"
                        // FIXED 25 Aug 2026 (live report: a past booking was marked "Filed"
                        // with an empty Confirmation No. field, no warning anywhere) - this
                        // had no guard at all against saving filed=true with nothing entered.
                        // Require SOME evidence - a typed confirmation number or an attached
                        // document - before this is clickable at all, not just after the fact.
                        disabled={isSavingCForm || cFormLocked || (!cFormNumberState.trim() && !cFormFile)}
                        title={!cFormNumberState.trim() && !cFormFile ? 'Enter a confirmation number or attach the filed document first' : undefined}
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
                {canActOnBooking && (guest.status === GUEST_STATUS_BOOKED || (guest.status as string) === GUEST_STATUS_CONFIRMED_LEGACY) && (
                  <button
                    type="button"
                    onClick={handleMarkCheckedIn}
                    className="w-full h-10 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5 active:scale-98"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{t('mark_checked_in_button', 'Mark Checked In')}</span>
                  </button>
                )}

                {/* Checkout & Settle Bill (Full-width action if status is Checked In).
                    canCheckoutBooking (23 Aug 2026, ROLES.md): Staff and Staff Kitchen
                    both lose this action - see this file's top-of-component comment. */}
                {onCheckout && canCheckoutBooking && (guest.status === GUEST_STATUS_CHECKED_IN || (guest.status as string) === GUEST_STATUS_ACTIVE_LEGACY) && (
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
                <div className={`grid gap-2.5 w-full ${
                  onDelete && canActOnBooking ? 'grid-cols-3' : canActOnBooking ? 'grid-cols-2' : 'grid-cols-1'
                }`}>
                  {onDelete && canActOnBooking && (
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
                    data-tour="whatsapp-invoicing"
                    onClick={handleShareBooking}
                    className="w-full h-10 px-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300 dark:border-gray-600 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    title={t('share_with_guest_button', 'Share with guest')}
                  >
                    <Share2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="truncate">{t('share_with_guest_button', 'Share')}</span>
                  </button>

                  {canActOnBooking && (
                    <button
                      type="button"
                      onClick={() => startEditing()}
                      className="w-full h-10 px-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300 dark:border-gray-600 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                      title={t('edit_button', 'Edit')}
                    >
                      <Pencil className="w-4 h-4 text-gray-600 dark:text-gray-400 shrink-0" />
                      <span className="truncate">{t('edit_button', 'Edit')}</span>
                    </button>
                  )}
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
