import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Save, Trash2, IdCard, Loader2, Pencil, CheckCircle2, Share2, LogOut, Upload, CreditCard, AlertTriangle, X, ScanLine, Clock, ExternalLink, Check, Copy } from './icons/FlowbiteIcons';
import { Drawer as FlowbiteDrawer, DrawerItems, Checkbox, Modal } from 'flowbite-react';
import { Button } from './Button';
import { Guest } from '../types';
import { markCFormFiled, checkinGuestInDB, uploadDocumentDB, verifyBookingPaymentDB, API_ROOT_BASE } from '../services/api';
import { scanApplicantIdFromFile } from '../utils/cFormBarcodeScanner';
import { scanUpiScreenshot, scanPassportMrz, isOcrDisabledError, type UpiScanResult, type PassportMrzResult } from '../utils/ocrScanner';
import { useStaff } from '../contexts/StaffContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import { StyledSelect } from './StyledSelect';
import { Input } from './Input';
import { FileInput } from './FileInput';
import { Textarea } from './Textarea';
import { DateRangePicker } from './DateRangePicker';
import { DatePicker } from './DatePicker';
import { CheckinVerificationModal } from './CheckinVerificationModal';
import { MessageQrPreview } from './MessageQrPreview';
import { DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, renderWhatsappVoucherTemplate, type PropertyGuestInfo } from '../utils/whatsappVoucherTemplate';
import { useConfigurationData } from '../contexts/ConfigurationDataContext';
import {
  fetchBookingPaymentsDB,
  addBookingPaymentDB,
  deleteBookingPaymentDB,
  fetchBookingVoucherTokenDB,
  fetchGuestExtraChargesFromDB,
  addGuestExtraChargeDB,
  type BookingPayment,
  type BookingPaymentTotals
} from '../services/api';
import { shareTextContent } from '../utils/shareText';
import { parseDateToYMD, formatDateDDMMYYYY } from '../utils/dateUtils';
import { normalizePhoneNumber, isValidPhoneNumber } from '../utils/phoneUtils';
import { cleanGuestNotes } from '../utils/otaNotesCleaner';
import { OtaBadge } from './OtaBadge';
import { t } from '../i18n/en';
import {
  GUEST_STATUS_BOOKED,
  GUEST_STATUS_CONFIRMED_LEGACY,
  GUEST_STATUS_CHECKED_IN,
  GUEST_STATUS_ACTIVE_LEGACY,
  GUEST_STATUS_CHECKED_OUT,
  GUEST_STATUS_CHECKEDOUT_LEGACY,
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
  /** Refundable deposit for a SINGLE property. A MULTI_KEY room carries its
   *  own on the room object, so this is only the single-unit fallback. */
  propertySecurityDeposit?: number | string | null;
  propertyCheckinTime?: string;
  propertyCheckoutTime?: string;
  propertyInstructions?: string;
  propertyGuestInfo?: PropertyGuestInfo;
  onOpenIdVerification?: () => void;
  onCheckedIn?: (guestId: string) => void;
  // Fired once the guest's ID has actually been verified through this modal's
  // OWN CheckinVerificationModal (the fallback path used when the caller
  // didn't supply onOpenIdVerification). Lets the caller mark the guest
  // verified in its list without this modal round-tripping through onSave -
  // see the onVerificationComplete handler below for why that mattered.
  onIdVerified?: (guestId: string) => void;
  // Same idea for the C-Form section: mark_c_form_filed has already written
  // the row, so the caller just needs telling, not a second save.
  onCFormFiled?: (guestId: string, filedAt: string | null) => void;
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
  isMultiKeyProperty?: boolean;
}

const formatDate = formatDateDDMMYYYY;

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
  propertyWhatsappTemplate = '',
  propertyUpiId = '',
  propertyUpiQrCodeUrl = '',
  propertySecurityDeposit,
  propertyCheckinTime = '',
  propertyCheckoutTime = '',
  propertyInstructions = '',
  propertyGuestInfo,
  onOpenIdVerification,
  onCheckedIn,
  onIdVerified,
  onCFormFiled,
  onCheckout,
  initialFocusSection = null,
  isMultiKeyProperty,
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

  // A booking is past once it's already checked out/cancelled, or its
  // checkout date has slipped behind today - same classification
  // BillingCheckout's own getGuestDetailedStatus uses for the Past tab, kept
  // in sync here so "shows under Past" and "can't be edited" never disagree.
  // Added 1 Sep 2026 after a real booking's dates got corrupted to
  // '0000-00-00' via Edit -> Clear -> Save with no guard: a completed stay
  // has no legitimate reason to have its dates/room/rent rewritten after the
  // fact, and every edit path here (the Edit toggle AND handleSave itself)
  // needs to agree on that, not just the entry-point button.
  const isPastBooking = (() => {
    const statusStr = String(guest?.status || '');
    if (statusStr === GUEST_STATUS_CHECKED_OUT || statusStr === GUEST_STATUS_CHECKEDOUT_LEGACY || statusStr === 'Cancelled') {
      return true;
    }
    const checkoutRaw = guest?.expectedCheckout || (guest as any)?.checkoutDate || '';
    const checkout = String(checkoutRaw).split(' ')[0].split('T')[0];
    if (!checkout) return false;
    const todayStr = new Date().toISOString().split('T')[0];
    return checkout < todayStr;
  })();

  // Check-in is pending/due only when the guest is in Booked status AND their
  // check-in date is today or in the past (an Upcoming booking with a future
  // check-in date is NOT pending check-in yet).
  // Local echoes of the two server-side flips this modal triggers itself:
  // "Mark Checked In" and completing ID verification. Both are already
  // persisted by their own dedicated endpoint by the time they land here, so
  // these exist purely to re-render THIS modal - nothing else.
  //
  // FIXED 4 Sep 2026 (live report: "i just uploaded guest id, bt the banner
  // stays there"). The two paths were broken in different ways:
  //   - check-in wrote `guest.status = ...` straight onto the prop object, a
  //     mutation React never re-renders for;
  //   - ID verification round-tripped through onSave(), which is worse -
  //     complete_checkin_verification has ALREADY bumped the row's updated_at
  //     by then, so the follow-up update_guest was rejected 409 stale_booking
  //     (see update_guest's expected_updated_at handling in guests.php), the
  //     caller's setState never ran, and nothing surfaced the failure. It was
  //     deterministic, not a race - it could never have worked.
  // Reset per guest so reusing one mounted modal for a different booking
  // (TodayOverview swaps selectedGuest without unmounting) never carries a
  // previous guest's state across.
  const [checkedInLocally, setCheckedInLocally] = useState(false);
  const [idVerifiedLocally, setIdVerifiedLocally] = useState(false);
  useEffect(() => {
    setCheckedInLocally(false);
    setIdVerifiedLocally(false);
  }, [guest.id]);

  const effectiveStatus = checkedInLocally ? GUEST_STATUS_CHECKED_IN : String(guest?.status || '');
  const isIdVerified = idVerifiedLocally || guest.idVerificationStatus === 'Complete';

  const isCheckinDue = (() => {
    const statusStr = effectiveStatus;
    if (statusStr !== GUEST_STATUS_BOOKED && statusStr !== GUEST_STATUS_CONFIRMED_LEGACY) {
      return false;
    }
    const checkinRaw = guest?.checkinDate || '';
    const checkin = String(checkinRaw).split(' ')[0].split('T')[0];
    if (!checkin) return false;
    const todayStr = new Date().toISOString().split('T')[0];
    return checkin <= todayStr;
  })();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [highlightReceiverFields, setHighlightReceiverFields] = useState(false);
  const [isIdModalOpen, setIsIdModalOpen] = useState(false);
  const [isSharePreviewOpen, setIsSharePreviewOpen] = useState(false);
  const [sharePreviewMessage, setSharePreviewMessage] = useState('');
  const [isEditingSharePreview, setIsEditingSharePreview] = useState(false);
  const [editableSharePreview, setEditableSharePreview] = useState('');

  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [paymentProofModalOpen, setPaymentProofModalOpen] = useState(false);
  const [localPaymentStatus, setLocalPaymentStatus] = useState<string>(guest.paymentStatus || (guest as any).payment_status || 'Pending');

  const [isScanningUpi, setIsScanningUpi] = useState(false);
  const [upiScanProgress, setUpiScanProgress] = useState(0);
  const [upiScanStatusText, setUpiScanStatusText] = useState('');
  const [upiScanResult, setUpiScanResult] = useState<UpiScanResult | null>(null);
  const [copiedUtr, setCopiedUtr] = useState(false);

  const [isScanningPassport, setIsScanningPassport] = useState(false);
  const [passportScanProgress, setPassportScanProgress] = useState(0);
  const [passportScanStatusText, setPassportScanStatusText] = useState('');
  const [passportScanResult, setPassportScanResult] = useState<PassportMrzResult | null>(null);

  useEffect(() => {
    if (!paymentProofModalOpen) {
      setIsScanningUpi(false);
      setUpiScanProgress(0);
      setUpiScanStatusText('');
      setUpiScanResult(null);
      setCopiedUtr(false);
    }
  }, [paymentProofModalOpen]);

  const paymentProofUrl = guest.paymentProofUrl || (guest as any).payment_proof_url || null;

  const handleScanUpi = async () => {
    if (!paymentProofUrl || isScanningUpi) return;
    setIsScanningUpi(true);
    setUpiScanProgress(5);
    setUpiScanStatusText(t('scanning_ocr_in_progress', 'Scanning image...'));
    setUpiScanResult(null);
    try {
      const fullUrl = paymentProofUrl.startsWith('http') ? paymentProofUrl : `${API_ROOT_BASE}${paymentProofUrl}`;
      const result = await scanUpiScreenshot(fullUrl, (pct, msg) => {
        setUpiScanProgress(pct);
        setUpiScanStatusText(msg);
      });
      setUpiScanResult(result);
      if (result.utr || result.amount) {
        showToast(t('ocr_scan_successful', 'OCR scan completed successfully'), { type: 'success' });
      } else {
        showToast('OCR scan completed, but no UPI details could be detected.', { type: 'warning' });
      }
    } catch (err: any) {
      if (isOcrDisabledError(err)) {
        showToast('Document scanning is currently disabled by the administrator.', { type: 'warning' });
      } else {
        console.error('UPI OCR Scan failed:', err);
        showToast(t('ocr_scan_failed', 'OCR scan failed. Please try again.'), { type: 'error' });
      }
    } finally {
      setIsScanningUpi(false);
    }
  };

  const handleScanPassportFile = async (file: File) => {
    if (!file || isScanningPassport) return;
    setIsScanningPassport(true);
    setPassportScanProgress(5);
    setPassportScanStatusText(t('scanning_ocr_in_progress', 'Scanning image...'));
    setPassportScanResult(null);
    try {
      const result = await scanPassportMrz(file, (pct, msg) => {
        setPassportScanProgress(pct);
        setPassportScanStatusText(msg);
      });
      setPassportScanResult(result);
      if (result.passportNumber) {
        if (!cFormNumberState.trim()) {
          setCFormNumberState(result.passportNumber);
        }
        setEditIsForeignGuest(true);
        showToast(`Passport detected: ${result.passportNumber} (${result.nationality || 'Foreign'})`, { type: 'success' });
      } else {
        showToast('OCR completed, but could not detect passport MRZ characters.', { type: 'warning' });
      }
    } catch (err: any) {
      if (isOcrDisabledError(err)) {
        showToast('Document scanning is currently disabled by the administrator.', { type: 'warning' });
      } else {
        console.error('Passport OCR Scan failed:', err);
        showToast(t('ocr_scan_failed', 'OCR scan failed. Please try again.'), { type: 'error' });
      }
    } finally {
      setIsScanningPassport(false);
    }
  };

  const handleConfirmBookingPayment = async () => {
    setIsVerifyingPayment(true);
    try {
      const res = await verifyBookingPaymentDB(guest.id, 'confirm');
      if (res.success) {
        setLocalPaymentStatus('Paid');
        showToast('Booking payment verified & confirmed!', { type: 'success' });
        if (onSave) {
          await onSave({ ...guest, ...(res.data || {}), paymentStatus: 'Paid' });
        }
      } else {
        showToast(res.message || 'Failed to verify payment', { type: 'error' });
      }
    } catch (err: any) {
      showToast(err?.message || 'Error verifying payment', { type: 'error' });
    } finally {
      setIsVerifyingPayment(false);
    }
  };

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
      setCheckedInLocally(true);
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
  const [cFormUploadProgress, setCFormUploadProgress] = useState<number | null>(null);
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

  // Pulls every edit* field back from the guest's real saved data - shared
  // by the mount/guest-change effect below AND by Cancel/Close (see there):
  // without this second use, clearing the Booking Dates picker then hitting
  // Cancel used to leave editCheckin/editCheckout latched onto the blanked
  // value (setIsEditing(false) alone never touched them), which the very
  // next Save - now with no guard on empty dates either - happily persisted
  // as a blank checkin/checkout straight to the DB (MySQL then substitutes
  // its own zero-date default, '0000-00-00'). Re-running this same sync is
  // what makes "clear, then back out without picking new dates" actually
  // restore the original booking instead of corrupting it.
  const syncEditFieldsFromGuest = (source: typeof guest) => {
    if (!source) return;
    const g = source as any;
    const noGuests = g.no_of_guests ?? g.numberOfGuests ?? 1;
    // "Room Rent" here means the TOTAL for the whole stay (matches the Add
    // Guest form, which sums every night before submitting, and every save
    // path below, which writes the same number into both base_room_rent AND
    // total_charge) - never per-night. g.base_room_rent is never actually
    // present on a freshly-fetched Guest (services/api.ts's mapping never
    // sets that key), so this used to fall straight through to g.roomRate -
    // which IS per-night for an OTA-synced booking (services/api.ts maps it
    // from the real per_night_charges Channex writes). That silently showed
    // a per-night figure as "Room Rent" for every Airbnb/Booking.com booking
    // (reported live 8 Sep 2026: a 7-night ₹12,515.02 stay displayed
    // "Room Rent: 1787.86"), and fed the same wrong number into the Pending
    // calculation below. g.totalAmount (total_charge) is reliably the true
    // stay total for both OTA and staff-created bookings - see
    // webhook_receiver.php and handleAddGuest, which both write the same
    // value into total_charge and base_room_rent - so it belongs ahead of
    // roomRate in this fallback chain.
    const rent = g.base_room_rent ?? g.totalAmount ?? g.roomRate ?? 0;
    const adv = g.advance_paid ?? g.advanceAmount ?? 0;

    setEditName(source.guestName || '');
    setEditPhone(source.phoneNumber || '');
    let resolvedRoomId = String(g.roomId ?? g.room_id ?? '');
    if ((!resolvedRoomId || resolvedRoomId === 'null' || resolvedRoomId === 'undefined') && source.roomNumber) {
      const matched = rooms.find(
        (r) =>
          r.name.toLowerCase().trim() === source.roomNumber.toLowerCase().trim() ||
          r.slug.toLowerCase().trim() === source.roomNumber.toLowerCase().trim()
      );
      if (matched) {
        resolvedRoomId = String(matched.id);
      }
    }
    if (!resolvedRoomId && rooms.length === 1) {
      resolvedRoomId = String(rooms[0].id);
    }
    setEditRoomId(resolvedRoomId);
    setEditGuests(String(noGuests));
    setEditCheckin(source.checkinDate?.split(' ')[0] || '');
    setEditCheckout(source.expectedCheckout?.split(' ')[0] || source.checkoutDate?.split(' ')[0] || '');
    setEditRoomRent(String(rent));
    setEditAdvance(String(adv));
    setEditAdvanceReceivedBy(g.advance_received_by || source.advanceReceivedBy || '');
    setEditPendingReceivedBy(g.pending_received_by || source.pendingReceivedBy || '');
    setEditBookingSource(source.bookingSource || 'Offline');
    const cleanedNotes = cleanGuestNotes(source.notes || '');
    setEditNotes(cleanedNotes);
    setEditShowNotes(!!cleanedNotes);
    setEditIsForeignGuest(!!source.isForeignGuest);

    const isFiled = !!(source.cFormFiledAt || g.c_form_filed_at || g.c_form_filed || g.cFormFiled);
    setCFormFiledState(isFiled);
    setCFormNumberState(g.c_form_number || g.cFormNumber || '');
    // Section starts open if already genuinely filed (so a returning look
    // at an already-filed guest still shows the saved number/document
    // without an extra click) - otherwise closed until the banner/
    // checkbox/initialFocusSection opens it.
    setCFormSectionOpen(isFiled);
  };

  const isDirty = useMemo(() => {
    if (!guest) return false;
    const g = guest as any;
    const origNoGuests = String(g.no_of_guests ?? g.numberOfGuests ?? 1);
    // Same fallback order as syncEditFieldsFromGuest above - must match, or
    // this dirty-check compares the edited total against a stale per-night
    // baseline and flags an untouched OTA booking as dirty (or vice versa).
    const origRent = String(g.base_room_rent ?? g.totalAmount ?? g.roomRate ?? 0);
    const origAdv = String(g.advance_paid ?? g.advanceAmount ?? 0);
    const origCheckin = guest.checkinDate?.split(' ')[0] || '';
    const origCheckout = guest.expectedCheckout?.split(' ')[0] || guest.checkoutDate?.split(' ')[0] || '';
    const origRoomId = String(g.roomId ?? g.room_id ?? '');
    const origAdvanceReceivedBy = g.advance_received_by || guest.advanceReceivedBy || '';
    const origPendingReceivedBy = g.pending_received_by || guest.pendingReceivedBy || '';
    const origSource = guest.bookingSource || 'Offline';
    const origNotes = guest.notes || '';
    const origForeign = !!guest.isForeignGuest;
    const origCFormFiled = !!(guest.cFormFiledAt || g.c_form_filed_at || g.c_form_filed || g.cFormFiled);
    const origCFormNum = g.c_form_number || g.cFormNumber || '';

    return (
      editName.trim() !== (guest.guestName || '').trim() ||
      editPhone.trim() !== (guest.phoneNumber || '').trim() ||
      editRoomId !== origRoomId ||
      editGuests !== origNoGuests ||
      editCheckin !== origCheckin ||
      editCheckout !== origCheckout ||
      editRoomRent !== origRent ||
      editAdvance !== origAdv ||
      editAdvanceReceivedBy !== origAdvanceReceivedBy ||
      editPendingReceivedBy !== origPendingReceivedBy ||
      editBookingSource !== origSource ||
      editNotes.trim() !== origNotes.trim() ||
      editIsForeignGuest !== origForeign ||
      cFormFiledState !== origCFormFiled ||
      cFormNumberState.trim() !== origCFormNum.trim()
    );
  }, [
    guest,
    editName,
    editPhone,
    editRoomId,
    editGuests,
    editCheckin,
    editCheckout,
    editRoomRent,
    editAdvance,
    editAdvanceReceivedBy,
    editPendingReceivedBy,
    editBookingSource,
    editNotes,
    editIsForeignGuest,
    cFormFiledState,
    cFormNumberState,
  ]);

  useEffect(() => {
    syncEditFieldsFromGuest(guest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Payment history (7 Sep 2026). The advance_paid / advance_received_by
  // scalars below are a roll-up of these rows now - see
  // php/finance/booking_payments.php for why a booking needs more than one.
  const [payments, setPayments] = useState<BookingPayment[]>([]);
  const [showAddPayment, setShowAddPayment] = useState(false);
  // Totals as the SERVER recomputed them after the last payment write.
  //
  // Needed because `guest` is a prop from a list this modal cannot refresh:
  // recording or deleting a payment changes guests.advance_paid and
  // pending_amount server-side, and every local derivation from the prop is
  // stale from that moment on. Deleting the last payment was the case that made
  // it visible - paid correctly went to 0 while Pending stayed at the
  // mid-payment figure, because the prop still held the pre-delete advance.
  // Null until a write happens, so an untouched booking keeps displaying
  // exactly as it always did.
  const [serverTotals, setServerTotals] = useState<BookingPaymentTotals | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [payReceivedBy, setPayReceivedBy] = useState('');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const { miscCharges } = useConfigurationData();
  const [guestExtraCharges, setGuestExtraCharges] = useState<any[]>([]);
  const [selectedExtraChargeCategory, setSelectedExtraChargeCategory] = useState<string>('');
  const [extraChargeNote, setExtraChargeNote] = useState<string>('');
  const [isAddingExtraChargeOnly, setIsAddingExtraChargeOnly] = useState(false);

  const loadGuestExtraCharges = React.useCallback(async () => {
    if (!guest?.id) return;
    const all = await fetchGuestExtraChargesFromDB(guest.id);
    setGuestExtraCharges(all.filter((c: any) => String(c.guestId || c.guest_id) === String(guest.id)));
  }, [guest?.id]);

  useEffect(() => { loadGuestExtraCharges(); }, [loadGuestExtraCharges]);

  const extraChargeCatalogOptions = useMemo(() => {
    const list = miscCharges && Array.isArray(miscCharges) ? miscCharges : [];
    const base = [
      { value: '', label: '-- Standard Payment (No Extra Charge) --' },
    ];
    list.forEach((m: any) => {
      const label = m.label || m.name || 'Misc';
      const price = m.default_amount ?? m.defaultPrice ?? 0;
      base.push({
        value: label,
        label: price > 0 ? `${label} (₹${price.toLocaleString('en-IN')})` : label,
      });
    });
    return base;
  }, [miscCharges]);

  const handleSelectExtraChargeInPayment = (val: string) => {
    setSelectedExtraChargeCategory(val);
    if (!val) return;
    const matched = miscCharges?.find((m: any) => (m.label || m.name) === val);
    const price = matched ? (matched.default_amount ?? (matched as any).defaultPrice ?? 0) : 0;
    if (price > 0) {
      setPayAmount(String(price));
    }
  };

  const loadPayments = React.useCallback(async () => {
    if (!guest?.id) return;
    setPayments(await fetchBookingPaymentsDB(guest.id));
  }, [guest?.id]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  // Public voucher link (7 Sep 2026). Minted on demand so a booking only gets a
  // permanent public URL once somebody actually opens it here - and left empty
  // on failure, which drops the whole line from the message rather than sending
  // a broken link.
  const [voucherToken, setVoucherToken] = useState('');
  useEffect(() => {
    if (!guest?.id) return;
    let cancelled = false;
    fetchBookingVoucherTokenDB(guest.id).then((tok) => { if (!cancelled) setVoucherToken(tok); });
    return () => { cancelled = true; };
  }, [guest?.id]);

  const handleAddPayment = async () => {
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast('Enter an amount greater than zero.', { type: 'error' });
      return;
    }
    setIsSavingPayment(true);
    try {
      if (selectedExtraChargeCategory) {
        await addGuestExtraChargeDB({
          guest_id: guest.id,
          category: selectedExtraChargeCategory,
          amount: amt,
          note: extraChargeNote.trim() || undefined,
        });
        await loadGuestExtraCharges();
      }

      const noteText = selectedExtraChargeCategory
        ? `Extra Charge: ${selectedExtraChargeCategory}${extraChargeNote ? ` (${extraChargeNote})` : ''}`
        : undefined;

      const res = await addBookingPaymentDB({
        booking_id: guest.id,
        amount: amt,
        method: payMethod,
        received_by_name: payReceivedBy,
        received_at: payDate,
        kind: 'payment',
        note: noteText,
      });
      if (!res.success) {
        showToast(res.message || 'Could not record the payment.', { type: 'error' });
        return;
      }
      setPayments(res.payments);
      if (res.totals) setServerTotals(res.totals);
      // The Advance Paid box is bound to its own edit-state string, seeded once
      // from the booking prop - so without this it keeps showing the pre-payment
      // figure while the list right below it shows the new payment (found on
      // staging, 7 Sep 2026). Synced from the rows the server just returned, not
      // from a local guess.
      setEditAdvance(
        String(res.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0))
      );
      setPayAmount('');
      setPayReceivedBy('');
      setSelectedExtraChargeCategory('');
      setExtraChargeNote('');
      setShowAddPayment(false);
      showToast(`Recorded ₹${amt.toLocaleString('en-IN')}${selectedExtraChargeCategory ? ` for ${selectedExtraChargeCategory}` : ''}.`, { type: 'success' });
    } catch (err: any) {
      showToast(err?.message || 'Failed to record payment.', { type: 'error' });
    } finally {
      setIsSavingPayment(false);
    }
  };

  const handleAddExtraChargeOnly = async () => {
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast('Enter a valid charge amount.', { type: 'error' });
      return;
    }
    if (!selectedExtraChargeCategory) {
      showToast('Please select an extra charge category.', { type: 'error' });
      return;
    }
    setIsAddingExtraChargeOnly(true);
    try {
      const res = await addGuestExtraChargeDB({
        guest_id: guest.id,
        category: selectedExtraChargeCategory,
        amount: amt,
        note: extraChargeNote.trim() || undefined,
      });
      if (!res.success) {
        showToast(res.message || 'Could not add extra charge.', { type: 'error' });
        return;
      }
      await loadGuestExtraCharges();
      if (serverTotals) {
        setServerTotals({ ...serverTotals, pending: serverTotals.pending + amt });
      }
      setPayAmount('');
      setSelectedExtraChargeCategory('');
      setExtraChargeNote('');
      setShowAddPayment(false);
      showToast(`Added ${selectedExtraChargeCategory} (₹${amt.toLocaleString('en-IN')}) to bill.`, { type: 'success' });
    } catch (err: any) {
      showToast(err?.message || 'Failed to add charge.', { type: 'error' });
    } finally {
      setIsAddingExtraChargeOnly(false);
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    const res = await deleteBookingPaymentDB(paymentId);
    if (!res.success) {
      showToast(res.message || 'Could not remove the payment.', { type: 'error' });
      return;
    }
    // res.totals present means the server answered with its recomputed state,
    // so res.payments is authoritative even when empty - deleting the last
    // payment legitimately returns []. Only fall back to a re-fetch when the
    // response carried no totals at all.
    const remaining = res.totals ? res.payments : await fetchBookingPaymentsDB(guest.id);
    setPayments(remaining);
    if (res.totals) setServerTotals(res.totals);
    // Same reason as the record path above - the Advance Paid box holds its own
    // state and would keep showing the deleted payment's total otherwise.
    setEditAdvance(String(remaining.reduce((sum, p) => sum + Number(p.amount || 0), 0)));
    showToast('Payment removed.', { type: 'info' });
  };


  const noOfGuests = g.no_of_guests ?? g.numberOfGuests ?? 1;
  // Same fallback order as syncEditFieldsFromGuest above (see its comment) -
  // this is the value the Pending calculation below is measured against, so
  // getting it wrong for an OTA booking doesn't just mislabel the field, it
  // also feeds a per-night figure into "roomRent - advancePaid" instead of
  // the stay's real total.
  const roomRent = g.base_room_rent ?? g.totalAmount ?? g.roomRate ?? 0;
  // Paid-so-far comes from the payment rows whenever any exist - they are the
  // record, and guests.advance_paid is the scalar they roll up into. Falling
  // back to the scalar keeps every pre-existing booking (and any row written
  // before this table landed) displaying exactly as it did before.
  const paymentsTotal = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  // The advance as this booking's row still holds it. Kept separate from the
  // derived total below because extrasBaked has to be measured against the same
  // advance that storedPending was computed from - mixing the fresh total with
  // the stale pending makes the two cancel out, and the Pending field then does
  // not move when a payment is recorded (found on staging, 7 Sep 2026).
  const propAdvancePaid = g.advance_paid ?? g.advanceAmount ?? 0;
  const advancePaid = serverTotals ? serverTotals.paid : (payments.length > 0 ? paymentsTotal : propAdvancePaid);
  // OTA (Airbnb/Booking.com/etc via Channex) bookings arrive pre-paid by the
  // channel itself - front desk never actually collects or hands off the
  // advance/pending amount, so tracking "who received it" doesn't apply and
  // the unassigned-receiver warning would just be a false alarm on every
  // OTA booking. Same otaSource check already used above to hide Delete.
  const isOtaBooking = Boolean(guest.otaSource || g.ota_source);
  
  const storedPending = g.pending_amount ?? g.pendingAmount;
  const extrasBaked = typeof storedPending === 'number'
    ? Math.max(0, storedPending - Math.max(0, roomRent - propAdvancePaid))
    : 0;
  const pendingDisplay = isEditing
    ? Math.max(0, (parseFloat(editRoomRent) || 0) - (parseFloat(editAdvance) || 0) + extrasBaked)
    : serverTotals
    ? serverTotals.pending
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
    const isMultiKey = isMultiKeyProperty ?? (rooms && rooms.length > 1);

    // 1. External OTA (iCal-synced) blocked dates - removed 3 Sep 2026,
    // iCal sync retired app-wide (was already gated off since 1 Sep behind
    // ICAL_BLOCKING_ENABLED, and icalBlockedDates is now permanently empty
    // regardless - see GuestManagement.tsx, its only source).

    // 2. Existing guest bookings for the currently selected room.
    (checkedInGuests || [])
      .filter((other) => other.id !== guest.id)
      .filter((other) => {
        if ((other.status as string) === GUEST_STATUS_CHECKED_OUT || (other.status as string) === GUEST_STATUS_CHECKEDOUT_LEGACY || (other.status as string) === 'Cancelled') {
          return false;
        }

        // On a single-unit property (where isMultiKey is false), ALL active bookings block dates for this property!
        if (!isMultiKey) return true;

        const otherRoomId = (other as any).roomId ?? (other as any).room_id;
        if (selectedRoomId != null && otherRoomId != null && Number(otherRoomId) === Number(selectedRoomId)) {
          return true;
        }

        const selectedRoomObj = rooms.find((r) => String(r.id) === editRoomId);
        const targetRoom = selectedRoomObj?.name || guest.roomNumber;
        if (targetRoom && targetRoom.toLowerCase().trim() !== 'unassigned' && other.roomNumber && other.roomNumber.toLowerCase().trim() === targetRoom.toLowerCase().trim()) {
          return true;
        }

        // If the booking's room is unassigned on a multi-key property, block dates for other bookings on default/unassigned
        if (!selectedRoomId && (!targetRoom || targetRoom.toLowerCase().trim() === 'unassigned')) {
          return true;
        }

        return false;
      })
      .forEach((other) => {
        const startYmd = parseDateToYMD(other.checkinDate || '');
        const endYmd = parseDateToYMD(other.expectedCheckout || other.checkoutDate || other.checkinDate || '');
        if (!startYmd) return;

        const [sy, sm, sd] = startYmd;
        const [ey, em, ed] = endYmd || startYmd;

        const start = new Date(sy, sm - 1, sd, 12, 0, 0);
        const end = new Date(ey, em - 1, ed, 12, 0, 0);

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
    // Defense in depth alongside the Save button's own disabled state above -
    // a cleared-but-unsaved date range must never reach the backend. Without
    // this, MySQL silently substitutes '0000-00-00' for an empty date string,
    // which is exactly how a real booking ended up permanently showing
    // 00/00/0000 (found live, 1 Sep 2026).
    if (!editCheckin || !editCheckout) {
      showToast('Pick both check-in and check-out dates before saving.', { type: 'error' });
      return;
    }
    if (!editPhone.trim()) {
      showToast('Phone number is required.', { type: 'error' });
      return;
    }
    // Same gap as GuestManagement.tsx's Add Booking form (fixed together, 7
    // Sep 2026): nothing stopped an edit from saving an over-long domestic
    // number here either.
    if (!isValidPhoneNumber(editPhone, editIsForeignGuest)) {
      showToast(
        editIsForeignGuest ? 'Enter a valid international phone number.' : 'Enter a valid 10-digit mobile number.',
        { type: 'error' }
      );
      return;
    }
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
        // Past bookings keep their original dates no matter what editCheckin/
        // editCheckout currently hold - the picker above is disabled for
        // them, but this is the actual enforcement point (the same defense-
        // in-depth reasoning as the blank-date guard just above).
        checkinDate: isPastBooking ? guest.checkinDate : editCheckin,
        expectedCheckout: isPastBooking ? guest.expectedCheckout : editCheckout,
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
      const msg = err instanceof Error && err.message ? err.message : 'Failed to update booking. Please try again.';
      showToast(msg, { type: 'error' });
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
    const upiVal = (propertyUpiId || g.upi_id || 'payments@upi').trim();
    const upiPaymentDeepLink = `upi://pay?pa=${encodeURIComponent(upiVal)}&pn=${encodeURIComponent(propertyName || 'Resort')}&cu=INR`;
    let qrVal = propertyUpiQrCodeUrl || (g as any).upi_qr_code_url || `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(upiPaymentDeepLink)}`;
    if (qrVal && qrVal.startsWith('/') && typeof window !== 'undefined') {
      qrVal = window.location.origin + qrVal;
    }
    const checkinTimeVal = propertyCheckinTime || '14:00';
    const checkoutTimeVal = propertyCheckoutTime || '11:00';
    const notesVal = propertyInstructions || g.instructions || g.notes || '';

    // Nights: computed from the dates rather than read from guests.total_days,
    // which the frontend Guest object does not carry. Checkout is exclusive -
    // the morning after the last night - so this is a plain difference, not +1.
    const checkinDateOnly = (guest.checkinDate || '').split(' ')[0].split('T')[0];
    const checkoutDateOnly = (guest.expectedCheckout || guest.checkoutDate || '').split(' ')[0].split('T')[0];
    const nightsVal = (() => {
      const a = new Date(checkinDateOnly + 'T00:00:00').getTime();
      const b = new Date(checkoutDateOnly + 'T00:00:00').getTime();
      if (isNaN(a) || isNaN(b) || b <= a) return 1;
      return Math.round((b - a) / 86400000);
    })();

    // Refundable deposit. A MULTI_KEY room carries its own (getMultiKeyProperty
    // returns security_deposit per room); a SINGLE property carries it on the
    // property itself, which arrives as the propertySecurityDeposit prop. Zero
    // or unset drops the line entirely - no property has one configured today,
    // so this stays invisible until somebody sets one.
    const depositVal = Number(
      (matchedRoom as any)?.security_deposit ?? propertySecurityDeposit ?? 0
    );

    // The tenant's own template if they have written one, otherwise the
    // shipped default (7 Sep 2026). This prop was threaded through ten
    // components to reach here and then ignored - it arrived as
    // `_propertyWhatsappTemplate`, so a property could be given a custom
    // template that the backend saved, the payload returned, and nothing on
    // earth ever sent. Already resolved property-override -> tenant-default by
    // the caller, so only the built-in fallback is left to apply here.
    const activeTemplate = propertyWhatsappTemplate.trim() || DEFAULT_WHATSAPP_VOUCHER_TEMPLATE;

    return renderWhatsappVoucherTemplate(activeTemplate, {
      booking_id: String(guest.id ?? ''),
      // Absolute, and pointing at the public route - a relative '#voucher?...'
      // is meaningless once it has been pasted into WhatsApp.
      voucher_link: voucherToken
        ? `${window.location.origin}${window.location.pathname}#voucher?token=${voucherToken}`
        : '',
      // Empty unless children were actually recorded on this booking - see the
      // optionalTokens note in whatsappVoucherTemplate.ts.
      // "5,000 on 15/07/2026 (Cash)" per payment - the thing that was
      // impossible before, because no date was stored anywhere. Suppressed for
      // a single payment: the Advance Paid line above already states that
      // amount, and repeating it under a "Payments" heading reads as two
      // separate collections.
      payments_list: payments.length > 1
        ? '\n' + payments
            .map((p) => `  • ₹${Number(p.amount).toLocaleString('en-IN')} on ${formatDate(String(p.received_at).split(' ')[0])}${p.method ? ` (${p.method})` : ''}`)
            .join('\n')
        : '',
      guest_breakdown: (() => {
        const kids = Number((guest as any).children ?? 0);
        if (kids <= 0) return '';
        const grown = Math.max(0, Number(noOfGuests) - kids);
        return `${grown} adult${grown === 1 ? '' : 's'}, ${kids} child${kids === 1 ? '' : 'ren'}`;
      })(),
      guest_name: guest.guestName,
      guest_phone: guest.phoneNumber || '',
      nights: String(nightsVal),
      // Already computed above for the modal's own money panel - reusing it
      // means the balance a guest is told matches the balance staff see, rather
      // than a second derivation that can drift from it.
      balance_due: pendingDisplay > 0 ? pendingDisplay.toFixed(2) : '',
      security_deposit: depositVal > 0 ? depositVal.toFixed(2) : '',
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
      // Empty values drop their whole line - see renderWhatsappVoucherTemplate's
      // optionalTokens - so a property with no wifi recorded sends the voucher
      // exactly as before, with no blank labels.
      wifi_network: propertyGuestInfo?.wifiNetwork || '',
      wifi_password: propertyGuestInfo?.wifiPassword || '',
      house_manual: propertyGuestInfo?.houseManual || '',
    });
  };

  // 28 Aug 2026, explicit request: Share used to fire navigator.share()/clipboard-copy
  // immediately with no way to see the actual message first. Now Share just opens a
  // preview of the exact text that will go out; the preview's own Send button is what
  // actually triggers shareTextContent() below. This is a Modal, not a second Drawer,
  // per DESIGN.md's "nested dialogs never stack a second Drawer" rule - it opens from
  // inside the already-open Booking Details Drawer.
  const handleShareBooking = () => {
    setSharePreviewMessage(buildShareMessage());
    setIsEditingSharePreview(false);
    setIsSharePreviewOpen(true);
  };

  // Opens straight into the guest's own WhatsApp chat instead of a generic OS
  // share sheet / contact picker (12 Sep 2026, explicit request: "when clicked
  // on send, it should automatically choose the guest phone number") - same
  // 10-digit-India-first wa.me pattern GuestManagement.tsx's own send flows
  // already use. Falls back to the old copy-to-clipboard-only behavior only
  // if the browser can't open a new tab/window at all (shouldn't happen in
  // practice, but keeps this from being a dead button on an odd browser).
  const handleConfirmSendBooking = async () => {
    const cleanPhone = (guest.phoneNumber || '').replace(/\D/g, '');
    const waUrl = cleanPhone.length === 10
      ? `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(sharePreviewMessage)}`
      : cleanPhone.length > 10
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(sharePreviewMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(sharePreviewMessage)}`;

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(sharePreviewMessage).catch(() => {});
    }

    const opened = window.open(waUrl, '_blank');
    if (!opened) {
      await shareTextContent(
        'Booking Details',
        sharePreviewMessage,
        showToast,
        "Booking details copied - paste them wherever you'd like to send them.",
        'Could not share or copy booking details.',
      );
    }
    setIsSharePreviewOpen(false);
  };

  // Edit/Save (28 Aug 2026, explicit request) - lets staff tweak the generated message
  // (e.g. add a personal note) before sending, without a separate editable-by-default
  // textarea always being in the way of the plain preview.
  const handleEditSharePreview = () => {
    setEditableSharePreview(sharePreviewMessage);
    setIsEditingSharePreview(true);
  };

  const handleSaveSharePreview = () => {
    setSharePreviewMessage(editableSharePreview);
    setIsEditingSharePreview(false);
  };

  // Cancel out of edit mode back to the read-only preview, discarding the
  // in-progress edit buffer - does NOT close the modal (12 Sep 2026, explicit
  // request: "close button should take back to share preview"). Previously
  // the modal's only close affordance was the header X, which unconditionally
  // closed the whole preview even mid-edit - there was no way to back out of
  // an edit without either saving it or losing the preview entirely.
  const handleCancelEditSharePreview = () => {
    setIsEditingSharePreview(false);
  };

  const financialHandlers = staff.filter((s) => s.isFinancialHandler).map((s) => ({ value: s.name, label: s.name }));
  const baseHandlers = financialHandlers.length > 0 ? financialHandlers : staff.map((s) => ({ value: s.name, label: s.name }));
  const availableHandlers = [
    { value: '', label: '- Not Selected -' },
    ...baseHandlers,
    ...(editAdvanceReceivedBy && editAdvanceReceivedBy !== '- Not Selected -' && !baseHandlers.some((h) => h.value === editAdvanceReceivedBy)
      ? [{ value: editAdvanceReceivedBy, label: editAdvanceReceivedBy }]
      : []),
    ...(editPendingReceivedBy && editPendingReceivedBy !== '- Not Selected -' && editPendingReceivedBy !== editAdvanceReceivedBy && !baseHandlers.some((h) => h.value === editPendingReceivedBy)
      ? [{ value: editPendingReceivedBy, label: editPendingReceivedBy }]
      : []),
  ];

  return (
    <>
      <FlowbiteDrawer
        open={Boolean(guest)}
        onClose={() => { syncEditFieldsFromGuest(guest); onClose(); setIsEditing(false); }}
        position="right"
        className="z-60 w-full sm:max-w-lg md:max-w-xl h-full bg-white dark:bg-gray-800 p-0 flex flex-col shadow-2xl transition-transform border-l border-gray-200 dark:border-gray-700"
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-800">
          <h2 className="booking-details-modal__title text-base sm:text-lg font-semibold text-slate-900 dark:text-white flex flex-wrap items-center gap-2 pr-2">
            <span>{isEditing ? t('edit_booking_header', 'Edit Booking') : t('today_booking_details_heading', 'Booking Details')}</span>
            <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
              #{guest.id}
            </span>
            {guest.otaSource && (
              <OtaBadge
                source={guest.otaSource}
                sourceLabel={guest.otaSourceLabel}
                reservationCode={guest.otaReservationCode}
                className="booking-details-modal__ota-badge"
              />
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
          {guest.otaCancelledDetectedAt && (
            <div className="w-full mb-3 px-3.5 py-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 flex items-center gap-2 shadow-2xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                {t('ota_cancelled_detected_banner', 'This reservation appears to have been cancelled on {{source}} - verify with the guest before proceeding.').replace('{{source}}', guest.otaSourceLabel || guest.otaSource || 'the OTA')}
              </span>
            </div>
          )}

          {/* Action Banner 0.5: Check-in Pending (only if due today or past) */}
          {canActOnBooking && isCheckinDue && (
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
              <Button
                type="button"
                variant="warning"
                size="sm"
                onClick={handleMarkCheckedIn}
                leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                className="h-8 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shrink-0 border-transparent shadow-none"
              >
                <span>{t('mark_checked_in_button', 'Mark Checked In')}</span>
              </Button>
            </div>
          )}

          {/* Action Banner 1: Check-in ID Verification */}
          <div
            data-tour="checkin-folio"
            className={`booking-details-modal__id-btn w-full mb-3 px-3.5 py-2.5 rounded-lg border flex items-center justify-between gap-2 transition-colors ${
              isIdVerified
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
            }`}
          >
            <span className={`flex items-center gap-2 text-xs font-semibold ${
              isIdVerified
                ? 'text-emerald-900 dark:text-emerald-200'
                : 'text-rose-900 dark:text-rose-200'
            }`}>
              {isIdVerified ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <IdCard className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              )}
              {/* Says what the state IS, not what the section is about - the old
                  label read "Check-in ID Verification" in both states, so a
                  green banner still looked like an outstanding task. */}
              {isIdVerified
                ? t('checkin_id_uploaded_label', 'Guest ID Uploaded')
                : t('checkin_id_verification_label', 'Check-in ID Verification')}
            </span>
            {canActOnBooking && (
              <Button
                type="button"
                variant={isIdVerified ? 'success' : 'danger'}
                size="sm"
                onClick={handleOpenId}
                leftIcon={<Upload className="w-3.5 h-3.5" />}
                className="h-8 text-xs font-semibold shrink-0 shadow-none border-transparent"
              >
                <span>{isIdVerified ? 'View / Re-upload ID' : 'Upload Guest ID'}</span>
              </Button>
            )}
          </div>

          {/* Action Banner 1.2: UPI Payment Proof Verification */}
          {(localPaymentStatus === 'Pending Verification' || (paymentProofUrl && localPaymentStatus !== 'Paid' && localPaymentStatus !== 'Confirmed')) && (
            <div className="w-full mb-3 px-3.5 py-2.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <div>
                  <span className="font-bold">Payment Pending Confirmation</span>
                  <span className="text-2xs font-normal text-amber-700 dark:text-amber-300 block">
                    Guest uploaded UPI payment screenshot during instant quote booking.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {paymentProofUrl && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setPaymentProofModalOpen(true)}
                    className="h-8 text-xs font-semibold gap-1 justify-center"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View Screenshot
                  </Button>
                )}
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={isVerifyingPayment}
                  onClick={handleConfirmBookingPayment}
                  className="h-8 text-xs font-bold gap-1 justify-center bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isVerifyingPayment ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Confirming...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Confirm Booking & Payment
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Action Banner 1.5: Foreign Guest C-Form Warning */}
          {editIsForeignGuest && !isCFormFiled && canActOnBooking && (
            <div className="w-full mb-3 px-3.5 py-2.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 flex items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-900 dark:text-rose-200">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>Foreign Guest: C-Form Filing Required</span>
              </div>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => setCFormSectionOpen(true)}
                className="h-8 text-xs font-semibold shrink-0 shadow-none border-transparent"
              >
                Mark C-Form Filed
              </Button>
            </div>
          )}

          {/* Action Banner 2: Unsettled Bill at Checkout */}
          {(() => {
            const isCheckedOut = ((guest.status as string) === 'Checked Out' || (g.status as string) === 'Checked Out');
            const isCheckedOutUnsettled = isCheckedOut && pendingDisplay > 0;

            if (isEditing || !isCheckedOutUnsettled) return null;

            return (
              <div className="w-full mb-3 px-3.5 py-2.5 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 flex items-center justify-between gap-2 shadow-2xs">
                <div className="flex items-center gap-2 text-xs font-semibold text-red-900 dark:text-red-200">
                  <CreditCard className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                  <span>
                    Unsettled Bill: Owes ₹{pendingDisplay.toLocaleString('en-IN')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => startEditing(true)}
                  className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all cursor-pointer shadow-2xs shrink-0 flex items-center gap-1"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Settle Bill
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
                  label={isEditing ? t('today_guest_name_label', 'Guest Name *') : 'Guest Name * (1: Transparent Notch)'}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={!isEditing}
                  disabledVariant="transparent"
                  placeholder="Enter guest's full name"
                  required
                />
              </div>
              <div>
                <Input
                  label={isEditing ? t('contact_phone_label', 'Phone Number *') : 'Phone * (2: Rounded Badge)'}
                  type="tel"
                  value={editPhone}
                  // No maxLength - see GuestManagement.tsx's onChange comment (23 Aug 2026): a
                  // native maxLength truncates raw typed characters before this digit-stripping
                  // runs, silently dropping trailing digits from any formatted phone number.
                  onChange={(e) => setEditPhone(normalizePhoneNumber(e.target.value))}
                  placeholder="10-digit mobile number"
                  disabled={!isEditing}
                  disabledVariant="badge"
                  required
                  error={
                    isEditing && editPhone.trim().length > 0 && !isValidPhoneNumber(editPhone, editIsForeignGuest)
                      ? (editIsForeignGuest ? 'Enter a valid international phone number' : 'Enter a valid 10-digit mobile number')
                      : undefined
                  }
                />
              </div>
            </div>

            {/* Row 1: Assigned Room (multi-key properties only) */}
            {rooms.length > 0 && (
              <div>
                <StyledSelect
                  label={t('assigned_room_label', 'Assigned Place *')}
                  value={editRoomId}
                  onChange={setEditRoomId}
                  disabled={!isEditing}
                  placeholder="-- Select Assigned Place --"
                  options={[
                    ...(!editRoomId || !rooms.some(r => String(r.id) === String(editRoomId))
                      ? [{ value: '', label: guest.roomNumber && guest.roomNumber !== 'Unassigned' ? guest.roomNumber : '-- Unassigned / Select Place --' }]
                      : []),
                    ...rooms.map((room) => {
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
                    }),
                  ]}
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
                    ...(editBookingSource && editBookingSource !== 'Offline' && editBookingSource !== 'Online'
                      ? [{ value: editBookingSource, label: guest.otaSourceLabel || editBookingSource }]
                      : []),
                  ]}
                />
              </div>
              <div>
                <Input
                  label={isEditing ? t('no_of_guests_label', 'No. of Guests') : 'Guests (3: Inset Inside)'}
                  type="number"
                  min={1}
                  value={editGuests}
                  onChange={(e) => setEditGuests(e.target.value)}
                  disabled={!isEditing}
                  disabledVariant="inset"
                />
              </div>
            </div>

            {/* Row 3: Booking Dates (DateRangePicker) - locked once the
                booking is past (see isPastBooking above): a completed stay's
                dates are historical record, not something Settle Bill/Assign
                Receiver's post-checkout editing should ever be able to touch. */}
            <div>
              <DateRangePicker
                label={isPastBooking ? 'Booking Dates (locked - past booking)' : 'Booking Dates *'}
                checkinDate={editCheckin}
                checkoutDate={editCheckout}
                onCheckinChange={setEditCheckin}
                onCheckoutChange={setEditCheckout}
                disabled={!isEditing || isPastBooking}
                disablePastDates
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

            {/* Row 5: Advance Paid (+ Advance Received By, non-OTA only - OTA
                bookings are pre-paid by the channel, front desk never
                receives it so there's no one to attribute it to). */}
            <div className={`grid gap-3 sm:gap-4 ${isOtaBooking ? 'grid-cols-1' : 'grid-cols-2'}`}>
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
              {!isOtaBooking && (
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
              )}
            </div>

            {/* Row 6: Pending (+ Pending Received By, non-OTA only). Hidden
                entirely once nothing is actually pending (8 Sep 2026,
                explicit request) - a "Pending ₹0" field on an already
                fully-paid booking is just clutter, and "Pending Received By"
                has nothing left to record either. Stays visible while
                isEditing regardless of the current computed value, so a
                staff member actively adjusting Room Rent/Advance can still
                see Pending update live and use Pending Received By to record
                a collection - it only disappears in the read-only view once
                settled. */}
            {(isEditing || pendingDisplay >= 0.01) && (
              <div className={`grid gap-3 sm:gap-4 ${isOtaBooking ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <div>
                  <Input
                    label={t('today_pending_label', 'Pending (₹)')}
                    type="text"
                    value={`₹${pendingDisplay.toLocaleString('en-IN')}`}
                    disabled={true}
                  />
                </div>
                {!isOtaBooking && (
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
                )}
              </div>
            )}

            {/* Payment history (7 Sep 2026). Sits directly under the advance /
                pending pair those rows now summarise, so it reads as the detail
                behind them rather than an unrelated feature. */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                <span className="text-2xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  {t('payments_heading', 'Payments received')}
                </span>
                {!isOtaBooking && (
                  <button
                    type="button"
                    onClick={() => setShowAddPayment((prev) => !prev)}
                    className="text-2xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    {showAddPayment ? t('cancel_button', 'Cancel') : t('record_payment_button', '+ Record a payment')}
                  </button>
                )}
              </div>

              {payments.length === 0 ? (
                <p className="px-3 py-2.5 text-2xs text-slate-500 dark:text-slate-400">
                  {t('payments_empty', 'Nothing recorded yet.')}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white">
                          ₹{Number(p.amount).toLocaleString('en-IN')}
                          <span className="font-normal text-slate-500 dark:text-slate-400">
                            {' '}on {formatDate(String(p.received_at).split(' ')[0])}
                          </span>
                        </div>
                        <div className="text-2xs text-slate-500 dark:text-slate-400 truncate">
                          {p.kind === 'ota_auto' ? (
                            <span className="font-medium text-blue-700 dark:text-blue-300">
                              {p.method ? `Pre-paid via ${p.method}` : 'Pre-paid via OTA'}
                            </span>
                          ) : (
                            <>
                              {p.method}
                              {p.received_by_name ? ` · ${t('received_by_prefix', 'received by')} ${p.received_by_name}` : ''}
                              {p.note ? ` · ${p.note}` : ''}
                            </>
                          )}
                        </div>
                      </div>
                      {/* System-seeded OTA merchant-of-record row (kind
                          'ota_auto', see webhook_receiver.php) - not deletable
                          from here. It isn't something staff recorded, it's the
                          synced reflection of what the OTA already collected;
                          deleting it would zero out guests.advance_paid via
                          recalcBookingPaymentTotals until the next Channex
                          re-sync happens to rewrite it. */}
                      {p.kind !== 'ota_auto' && (
                        <button
                          type="button"
                          onClick={() => handleDeletePayment(p.id)}
                          aria-label={t('delete_button', 'Delete')}
                          className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* Extra Charges already on folio */}
              {guestExtraCharges.length > 0 && (
                <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700 bg-amber-50/40 dark:bg-amber-950/20">
                  <div className="text-2xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400 mb-1 flex items-center justify-between">
                    <span>Attached Extra Charges ({guestExtraCharges.length})</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      ₹{guestExtraCharges.reduce((s, c) => s + Number(c.amount || 0), 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {guestExtraCharges.map((ec, idx) => (
                      <li key={ec.id || idx} className="flex items-center justify-between text-2xs text-slate-700 dark:text-slate-300">
                        <span className="font-medium">{ec.category || ec.name || 'Extra Charge'}{ec.note ? ` (${ec.note})` : ''}</span>
                        <span className="font-semibold text-slate-900 dark:text-white">₹{Number(ec.amount || 0).toLocaleString('en-IN')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {showAddPayment && (
                <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 space-y-2">
                  <div>
                    <StyledSelect
                      label="Extra Charge / Fee Category (Optional)"
                      value={selectedExtraChargeCategory}
                      onChange={handleSelectExtraChargeInPayment}
                      options={extraChargeCatalogOptions}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label={t('amount_label', 'Amount (₹)')}
                      type="number"
                      min="0"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                    />
                    <DatePicker
                      label={t('payment_date_label', 'Received on')}
                      value={payDate}
                      onChange={setPayDate}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <StyledSelect
                      label={t('payment_method_label', 'Method')}
                      value={payMethod}
                      onChange={setPayMethod}
                      options={[
                        { value: 'Cash', label: 'Cash' },
                        { value: 'UPI', label: 'UPI' },
                        { value: 'Bank Transfer', label: 'Bank Transfer' },
                        { value: 'Card', label: 'Card' },
                      ]}
                    />
                    <StyledSelect
                      label={t('received_by_label', 'Received by')}
                      value={payReceivedBy}
                      onChange={setPayReceivedBy}
                      placeholder="-- Select Staff/User --"
                      options={availableHandlers}
                    />
                  </div>
                  {selectedExtraChargeCategory && (
                    <div>
                      <Input
                        label="Charge Note (Optional)"
                        placeholder="e.g. Late checkout 2pm, extra mattress"
                        value={extraChargeNote}
                        onChange={(e) => setExtraChargeNote(e.target.value)}
                      />
                    </div>
                  )}
                  {selectedExtraChargeCategory ? (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleAddPayment}
                        disabled={isSavingPayment || isAddingExtraChargeOnly}
                      >
                        {isSavingPayment ? 'Saving...' : 'Charge & Record Paid'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleAddExtraChargeOnly}
                        disabled={isSavingPayment || isAddingExtraChargeOnly}
                      >
                        {isAddingExtraChargeOnly ? 'Adding...' : 'Add to Bill Only (Pay Later)'}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      block
                      onClick={handleAddPayment}
                      disabled={isSavingPayment}
                    >
                      {isSavingPayment ? t('saving_label', 'Saving...') : t('record_payment_button_confirm', 'Record payment')}
                    </Button>
                  )}
                </div>
              )}
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
            {(editShowNotes || cleanGuestNotes(guest.notes)) && (
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

            {/* Foreign Guest C-Form Section (only visible if Foreign National Guest is selected) */}
            {editIsForeignGuest && (
              <div data-tour="cform-filing" id="c-form-checkbox-container" className="pt-1 border-t border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between gap-2">
                <label className={`flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100 select-none ${canActOnBooking ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                  <Checkbox
                    id="c-form-filed-checkbox"
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
                          // Not onSave() - markCFormFiled above has already
                          // written the row and moved its updated_at on, so an
                          // update_guest behind it is rejected 409 stale_booking
                          // (the same trap the ID banner fell into, 4 Sep 2026).
                          onCFormFiled?.(guest.id, null);
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
                      // Compression must stay OFF here (found 3 Sep 2026, code
                      // review): scanApplicantIdFromFile below renders/decodes
                      // the barcode at 2x scale specifically because a phone
                      // photo shrunk much below that can drop the bars below
                      // what the decoder can reliably tell apart (see
                      // cFormBarcodeScanner.ts's own comment on this) - letting
                      // FileInput downscale the source file first would work
                      // directly against that.
                      autoCompressImage={false}
                      isUploading={isSavingCForm && !!cFormFile}
                      progress={cFormUploadProgress}
                      uploadProgressLabel="Uploading C-Form document..."
                      uploadProgressColor="green"
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
                          // Try Passport MRZ OCR
                          try {
                            const passportRes = await scanPassportMrz(file);
                            if (passportRes.passportNumber) {
                              setCFormNumberState(passportRes.passportNumber);
                              setPassportScanResult(passportRes);
                              setEditIsForeignGuest(true);
                              setBarcodeScanStatus('found');
                              showToast(`Passport detected: ${passportRes.passportNumber}`, { type: 'success' });
                              return;
                            }
                          } catch {
                            // ignore fallback error
                          }
                          setBarcodeScanStatus('not_found');
                        }
                      }}
                    />
                    {barcodeScanStatus === 'scanning' && (
                      <p className="mt-1 flex items-center gap-1 text-2xs text-slate-500 dark:text-slate-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> Reading document...
                      </p>
                    )}
                    {barcodeScanStatus === 'found' && (
                      <p className="mt-1 flex items-center gap-1 text-2xs text-emerald-600 dark:text-emerald-400">
                        <ScanLine className="w-3 h-3" /> ID read from document - double-check it below before saving.
                      </p>
                    )}
                    {barcodeScanStatus === 'not_found' && (
                      <p className="mt-1 text-2xs text-amber-600 dark:text-amber-400">
                        Couldn't read a barcode or passport MRZ from that file - enter the Applicant ID / Confirmation No. manually below.
                      </p>
                    )}

                    {/* Passport MRZ Direct Scan trigger */}
                    <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
                      <input
                        type="file"
                        id="cform-passport-ocr-input"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleScanPassportFile(file);
                          e.target.value = '';
                        }}
                      />
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="cform-passport-ocr-input"
                          className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium cursor-pointer"
                        >
                          <ScanLine className="w-3.5 h-3.5" />
                          <span>{t('scan_passport_mrz_button', 'Scan Passport (OCR)')}</span>
                        </label>
                        {isScanningPassport && (
                          <span className="text-2xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                            <span>{passportScanStatusText || `Scanning passport (${passportScanProgress}%)...`}</span>
                          </span>
                        )}
                      </div>

                      {passportScanResult && (
                        <div className="mt-2 p-2.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                              <span>📘</span>
                              <span>{passportScanResult.fullName || 'Foreign Guest Passport'}</span>
                            </span>
                            {passportScanResult.countryCode && (
                              <span className="text-2xs font-medium px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300">
                                {passportScanResult.nationality || passportScanResult.countryCode}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-2xs text-slate-600 dark:text-slate-300">
                            <div>
                              <span className="text-slate-400">Passport: </span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{passportScanResult.passportNumber || 'N/A'}</span>
                            </div>
                            {passportScanResult.dob && (
                              <div>
                                <span className="text-slate-400">DOB: </span>
                                <span className="font-medium">{passportScanResult.dob}</span>
                              </div>
                            )}
                            {passportScanResult.expiryDate && (
                              <div>
                                <span className="text-slate-400">Exp: </span>
                                <span className="font-medium">{passportScanResult.expiryDate}</span>
                              </div>
                            )}
                            {passportScanResult.gender && (
                              <div>
                                <span className="text-slate-400">Sex: </span>
                                <span className="font-medium">{passportScanResult.gender}</span>
                              </div>
                            )}
                          </div>
                          {passportScanResult.passportNumber && cFormNumberState !== passportScanResult.passportNumber && (
                            <button
                              type="button"
                              onClick={() => setCFormNumberState(passportScanResult.passportNumber!)}
                              className="text-2xs text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                            >
                              Fill {passportScanResult.passportNumber} into Confirmation No.
                            </button>
                          )}
                        </div>
                      )}
                    </div>
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
                    <Button
                      type="button"
                      variant="success"
                      size="sm"
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
                          setCFormUploadProgress(0);
                          const uploaded = await uploadDocumentDB(cFormFile, 'c_form', (pct) => setCFormUploadProgress(pct));
                          setCFormUploadProgress(null);
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
                          onCFormFiled?.(guest.id, filedAt);
                        } else {
                          showToast('Failed to save C-Form details', { type: 'error' });
                        }
                      }}
                      leftIcon={isSavingCForm ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      className="h-8 text-xs font-semibold shrink-0 shadow-none border-transparent"
                    >
                      <span>Save C-Form</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        </DrawerItems>

        {/* Modal Actions Footer: Sticky / Pinned at bottom of drawer.
            pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(1.25rem+...)],
            not plain p-4 sm:p-5 (2 Sep 2026, site-wide audit) - see DESIGN.md's
            "Bottom-Anchored Drawer Footer Safe Area" rule. This footer is a
            shrink-0 sibling AFTER DrawerItems (this file's own comment above
            already calls it "Pinned at bottom of drawer") - DESIGN.md's rule
            text cites this exact footer as the non-pinned exempt case, but
            that no longer matches the actual structure here. */}
        <div id="printableBookingDetailsActionsBar" className="booking-details-modal__footer shrink-0 p-4 sm:p-5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-800">
            {!isEditing ? (
              <div className="space-y-3 w-full">

                {/* Checkout & Settle Bill (Full-width action if status is Checked In).
                    canCheckoutBooking (23 Aug 2026, ROLES.md): Staff and Staff Kitchen
                    both lose this action - see this file's top-of-component comment. */}
                {onCheckout && canCheckoutBooking && (effectiveStatus === GUEST_STATUS_CHECKED_IN || effectiveStatus === GUEST_STATUS_ACTIVE_LEGACY) && (
                  /* Two real options once a guest is in-house (4 Sep 2026,
                     explicit request): settle up and leave today, OR just put
                     the ID/details away and come back on the actual checkout
                     day. Checkout used to be the only button here, which read
                     as the only way out of this screen. Everything this modal
                     can change - ID upload, C-Form, check-in - is written by
                     its own endpoint the moment it happens, so "Save & Close"
                     genuinely has nothing left to submit; it confirms and
                     closes rather than pretending to post something. */
                  <div className="grid grid-cols-2 gap-2.5 w-full">
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full h-10 px-3 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 dark:text-blue-300 dark:border-blue-800 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      title={t('save_and_close_hint', 'Keep this booking as it is and check out later')}
                    >
                      <Save className="w-4 h-4 shrink-0" />
                      <span className="truncate">{t('save_and_close_button', 'Save & Close')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={onCheckout}
                      className="w-full h-10 px-3 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5 active:scale-98"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      <span className="truncate">{t('checkout_settle_bill_button', 'Checkout & Settle Bill')}</span>
                    </button>
                  </div>
                )}

                {/* Delete, Share with Guest, Edit - 3 columns when Delete is
                    available (non-OTA bookings), otherwise a real 2-column grid. */}
                {(() => {
                  const canDelete = Boolean(onDelete && canActOnBooking && !isOtaBooking);

                  return (
                    <div className={`grid gap-2.5 w-full ${
                      canDelete ? 'grid-cols-3' : canActOnBooking ? 'grid-cols-2' : 'grid-cols-1'
                    }`}>
                      {canDelete && (
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
                          className="w-full h-10 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 dark:text-blue-300 dark:border-blue-800 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          title={t('edit_button', 'Edit')}
                        >
                          <Pencil className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                          <span className="truncate">{t('edit_button', 'Edit')}</span>
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              /* 2 Columns: Cancel, Save */
              <div className="grid grid-cols-2 gap-2.5 w-full">
                <button
                  type="button"
                  onClick={() => { syncEditFieldsFromGuest(guest); setIsEditing(false); }}
                  disabled={isSaving}
                  className="w-full h-10 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 dark:border-gray-600 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <X className="w-4 h-4 shrink-0" />
                  <span>{t('cancel_button', 'Cancel')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || !isDirty || !editCheckin || !editCheckout}
                  title={
                    !editCheckin || !editCheckout
                      ? 'Pick both check-in and check-out dates before saving'
                      : !isDirty
                      ? 'No changes have been made to save'
                      : undefined
                  }
                  className={`w-full h-10 px-4 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm ${
                    !isDirty || !editCheckin || !editCheckout
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-600 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                  }`}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : isDirty ? (
                    <Save className="w-4 h-4 shrink-0" />
                  ) : null}
                  <span>
                    {isSaving
                      ? t('saving_button', 'Saving...')
                      : isDirty
                      ? t('save_changes_button', 'Save Changes')
                      : t('no_changes_to_save_button', 'No Changes to Save')}
                  </span>
                </button>
              </div>
            )}
        </div>
      </FlowbiteDrawer>

      {isIdModalOpen && (
        <CheckinVerificationModal
          guest={guest}
          isOpen={isIdModalOpen}
          onClose={() => setIsIdModalOpen(false)}
          onVerificationComplete={(guestId) => {
            // No onSave() here on purpose - see the checkedInLocally /
            // idVerifiedLocally comment near the top. complete_checkin_
            // verification has already written this to the DB and bumped the
            // row's updated_at, so an update_guest right behind it is
            // guaranteed to come back 409 stale_booking, which is exactly why
            // the banner used to stay red. Just reflect it locally and let the
            // caller patch its own list.
            setIsIdModalOpen(false);
            setIdVerifiedLocally(true);
            onIdVerified?.(guestId);
          }}
        />
      )}

      {/* Share Preview (28 Aug 2026) - centered Modal, not a Drawer, since this opens
          from inside the already-open Booking Details Drawer (DESIGN.md's "nested
          dialogs never stack a second Drawer" rule - same reason CheckinVerificationModal
          above is a Modal). z-70 matches that same "secondary dialog over an already-open
          page modal" tier. */}
      {isSharePreviewOpen && (
        <Modal
          show
          onClose={() => (isEditingSharePreview ? handleCancelEditSharePreview() : setIsSharePreviewOpen(false))}
          dismissible
          size="lg"
          popup
          className="z-70"
        >
          <div className="flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-lg shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white m-0">
                {t('share_preview_heading', 'Share Preview')}
              </h2>
              <button
                type="button"
                onClick={() => (isEditingSharePreview ? handleCancelEditSharePreview() : setIsSharePreviewOpen(false))}
                className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                aria-label={isEditingSharePreview ? 'Cancel editing, back to preview' : 'Close share preview'}
                title={isEditingSharePreview ? 'Back to preview' : undefined}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 m-0">
                  {t('share_preview_subheading', "This is exactly what will be sent - review it before sending.")}
                </p>
                {!isEditingSharePreview ? (
                  <Button
                    type="button"
                    variant="edit"
                    size="sm"
                    onClick={handleEditSharePreview}
                    leftIcon={<Pencil className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                    className="shrink-0 h-8 text-xs font-semibold shadow-none"
                  >
                    <span>{t('edit_button', 'Edit')}</span>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="success"
                    size="sm"
                    onClick={handleSaveSharePreview}
                    leftIcon={<Save className="w-3.5 h-3.5" />}
                    className="shrink-0 h-8 text-xs font-semibold shadow-none border-transparent"
                  >
                    <span>{t('save_button', 'Save')}</span>
                  </Button>
                )}
              </div>
              {isEditingSharePreview ? (
                <Textarea
                  value={editableSharePreview}
                  onChange={(e) => setEditableSharePreview(e.target.value)}
                  rows={14}
                  className="font-mono text-xs"
                />
              ) : (
                <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                  <MessageQrPreview text={sharePreviewMessage} />
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
              <button
                type="button"
                onClick={handleConfirmSendBooking}
                disabled={isEditingSharePreview}
                title={isEditingSharePreview ? t('save_changes_before_sending_tooltip', 'Save your changes first') : undefined}
                className="w-full h-10 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Share2 className="w-4 h-4 shrink-0" />
                <span>{t('share_preview_send_button', 'Send')}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Payment Proof Lightbox Modal */}
      {paymentProofModalOpen && paymentProofUrl && (
        <Modal
          show={paymentProofModalOpen}
          onClose={() => setPaymentProofModalOpen(false)}
          size="md"
        >
          <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">UPI Payment Screenshot</h3>
              </div>
              <button
                type="button"
                onClick={() => setPaymentProofModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-900 flex items-center justify-center max-h-[70vh] overflow-auto">
              <img
                src={paymentProofUrl.startsWith('http') ? paymentProofUrl : `${API_ROOT_BASE}${paymentProofUrl}`}
                alt="Payment Proof Screenshot"
                className="max-h-[60vh] max-w-full rounded-lg object-contain border border-gray-200 dark:border-gray-700 shadow-sm"
              />
            </div>

            {/* OCR Scanning Progress */}
            {isScanningUpi && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border-t border-blue-200 dark:border-blue-800 flex items-center gap-2.5">
                <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-2xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
                    <span className="truncate">{upiScanStatusText || 'Scanning proof with OCR...'}</span>
                    <span className="shrink-0">{upiScanProgress}%</span>
                  </div>
                  <div className="w-full bg-blue-200 dark:bg-blue-900 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${upiScanProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* OCR Scanned Results Card */}
            {upiScanResult && (
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <ScanLine className="w-3.5 h-3.5 text-blue-600" />
                    <span>Scanned UPI Details</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {upiScanResult.status === 'success' && (
                      <span className="text-2xs font-medium px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Paid
                      </span>
                    )}
                    {upiScanResult.appHint && upiScanResult.appHint !== 'Other' && (
                      <span className="text-2xs font-medium px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                        {upiScanResult.appHint}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <p className="text-2xs text-slate-500 dark:text-slate-400 font-medium">12-Digit UPI UTR</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs font-semibold text-gray-900 dark:text-white">
                        {upiScanResult.utr || <span className="text-slate-400 italic font-normal">Not detected</span>}
                      </span>
                      {upiScanResult.utr && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(upiScanResult.utr!);
                            setCopiedUtr(true);
                            setTimeout(() => setCopiedUtr(false), 2000);
                          }}
                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400 cursor-pointer"
                          title="Copy UTR"
                        >
                          {copiedUtr ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <p className="text-2xs text-slate-500 dark:text-slate-400 font-medium">Detected Amount</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs font-semibold text-gray-900 dark:text-white">
                        {upiScanResult.amount != null ? (
                          `₹${upiScanResult.amount.toLocaleString('en-IN')}`
                        ) : (
                          <span className="text-slate-400 italic font-normal">Not detected</span>
                        )}
                      </span>
                      {upiScanResult.amount != null && guest.advanceAmount != null && (
                        Number(upiScanResult.amount) === Number(guest.advanceAmount) ? (
                          <span className="text-2xs text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" /> Match
                          </span>
                        ) : (
                          <span className="text-2xs text-amber-600 dark:text-amber-400 font-semibold inline-flex items-center gap-0.5" title="Differs from booking advance">
                            <AlertTriangle className="w-3 h-3" /> Differs
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isScanningUpi}
                  onClick={handleScanUpi}
                  leftIcon={isScanningUpi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5 text-blue-600" />}
                >
                  <span>{isScanningUpi ? 'Scanning...' : t('scan_upi_details_button', 'Scan UPI (OCR)')}</span>
                </Button>
                <a
                  href={paymentProofUrl.startsWith('http') ? paymentProofUrl : `${API_ROOT_BASE}${paymentProofUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open original
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPaymentProofModalOpen(false)}
                >
                  Close
                </Button>
                {localPaymentStatus !== 'Paid' && localPaymentStatus !== 'Confirmed' && (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isVerifyingPayment}
                    onClick={async () => {
                      await handleConfirmBookingPayment();
                      setPaymentProofModalOpen(false);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isVerifyingPayment ? 'Confirming...' : 'Confirm Payment'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
