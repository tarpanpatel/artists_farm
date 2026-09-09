import React, { useState, useRef } from 'react';
import { FieldHelpModeProvider } from './FieldHelpPopover';
import { Modal } from 'flowbite-react';
import { useToast } from './ToastContext';
import { Loader2, CheckCircle2, AlertCircle, MessageCircle, Plus, Trash2, X, Sparkles, FileText, RotateCcw } from './icons/FlowbiteIcons';
import { t } from '../i18n/en';
import { Button } from './Button';
import { Input } from './Input';
import { FieldHelpText } from './FieldHelpPopover';
import { WhatsAppEditor } from './WhatsAppEditor';
import { AmenitiesSelectModal } from './AmenitiesSelectModal';
import { getAmenityIcon, normalizeAmenityList } from '../utils/amenityCatalog';
import { UpiPaymentBlock, isValidUpiIdSyntax } from '../utils/upiQrCode';
import { DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, VOUCHER_TOKENS, renderWhatsappVoucherTemplate } from '../utils/whatsappVoucherTemplate';
import { MessageQrPreview } from './MessageQrPreview';
import { humanizeKey } from '../utils/humanizeKey';

/**
 * Shared "Edit Property" form - property details only (name, contact,
 * GSTIN/UPI, address, check-in/out times, default tariff, maps link,
 * notes), saved via `update_property`. The Telegram customization toggle
 * lives in WhatsAppTemplateSettings.tsx (the Telegram/messaging settings
 * tab) instead - unrelated to property details.
 *
 * The guest-facing WhatsApp booking-confirmation message itself is NOT
 * customizable (26 Aug 2026, explicit request - was previously a free-text
 * template editor on the Telegram tab, removed) - every property sends the
 * one shared DEFAULT_WHATSAPP_VOUCHER_TEMPLATE. Since that template only
 * ever pulls from fields edited right here (phone/address/UPI/instructions/
 * check-in-out times), a live read-only preview of it is rendered at the
 * bottom of this form instead, built from this component's own in-progress
 * field state - not the last-saved `property` prop - so it updates as you
 * type, before you've even hit Save.
 */
interface PropertyEditFormProps {
  property: {
    id: number;
    name?: string;
    email?: string;
    phone?: string;
    gstin?: string;
    upi_id?: string;
    upi_qr_code_url?: string;
    walk_in_table_count?: number;
    address?: string;
    google_maps_link?: string;
    instructions?: string;
    property_type?: string;
    default_tariff?: number | null;
    max_capacity?: number | null;
    included_occupancy?: number | null;
    extra_guest_charge?: number | null;
    cleaning_fee?: number | null;
    security_deposit?: number | null;
    checkin_time?: string | null;
    checkout_time?: string | null;
    /** This property's own voucher wording. Empty/absent = inherit the account's. */
    whatsapp_voucher_template?: string | null;
    /** The account-wide default this property falls back to. Read-only here. */
    tenant_whatsapp_voucher_template?: string | null;
  };
  onCancel?: () => void;
  onSaved?: () => void;
  cancelLabel?: string;
  submitLabel?: string;
  // A MULTI_KEY_ROOM row (a room's own `properties` record) has no real use
  // for email/phone/GSTIN/UPI/address/maps-link/notes - those are property-
  // wide concepts, already edited on the parent's own Edit Property page.
  // Rooms do carry their own name/checkin_time/checkout_time/default_tariff
  // (same columns, just per-room), so this mode narrows the form to those.
  isRoom?: boolean;
}

export const PropertyEditForm: React.FC<PropertyEditFormProps> = ({
  property,
  onCancel,
  onSaved,
  cancelLabel,
  submitLabel,
  isRoom = false,
}) => {
  const { showToast } = useToast();
  const isMultiKeyParent = !isRoom && property.property_type === 'MULTI_KEY';
  const [name, setName] = useState(property.name || '');
  // Live "required" feedback (26 Aug 2026, CLAUDE.md's "Real-Time Form Validation" sweep) -
  // gated on `nameTouched` (set on blur) rather than length alone, since an EMPTY required
  // field is invalid from the moment the form opens - without a touched gate it would show
  // red before the user has done anything at all, unlike a format rule that's only "wrong"
  // once something's actually been typed.
  const [nameTouched, setNameTouched] = useState(false);
  const [email, setEmail] = useState(property.email || '');
  const [phone, setPhone] = useState(property.phone || '');
  const [gstin, setGstin] = useState(property.gstin || '');
  const [upiId, setUpiId] = useState(property.upi_id || '');
  // Read-only pass-through: no UI path sets this anymore (26 Aug 2026 - upload
  // removed in favor of an always-on auto-generated QR, see UpiPaymentBlock
  // below), but a property that already has a legacy uploaded QR on file
  // still has it preserved on save and still takes precedence at checkout.
  const [upiQrCodeUrl] = useState(property.upi_qr_code_url || '');
  const [walkInTableCount, setWalkInTableCount] = useState(
    property.walk_in_table_count != null ? String(property.walk_in_table_count) : '10'
  );
  const [address, setAddress] = useState(property.address || '');
  const [mapsLink, setMapsLink] = useState(property.google_maps_link || '');
  const [instructions, setInstructions] = useState(property.instructions || '');
  // Voucher wording (7 Sep 2026). Empty string means "inherit" - it is not the
  // same as a property whose override happens to equal the inherited text, and
  // the two must stay distinguishable or every save would freeze a copy.
  const [voucherTemplate, setVoucherTemplate] = useState(property.whatsapp_voucher_template || '');
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [modalTemplate, setModalTemplate] = useState('');
  const voucherTextareaRef = useRef<HTMLTextAreaElement>(null);

  const rootDefaultTemplate =
    ((property as any).system_whatsapp_voucher_template && (property as any).system_whatsapp_voucher_template.trim()) ||
    DEFAULT_WHATSAPP_VOUCHER_TEMPLATE;

  const inheritedTemplate =
    (property.tenant_whatsapp_voucher_template && property.tenant_whatsapp_voucher_template.trim()) ||
    rootDefaultTemplate;

  const inheritedFrom = property.tenant_whatsapp_voucher_template
    ? t('whatsapp_template_inherited_tenant', 'your account default')
    : (property as any).system_whatsapp_voucher_template
    ? t('whatsapp_template_inherited_root', 'the Root Dashboard default')
    : t('whatsapp_template_inherited_system', 'the Ground Code default');

  const effectiveTemplate = voucherTemplate.trim() || inheritedTemplate;

  const handleOpenVoucherModal = () => {
    setModalTemplate(voucherTemplate.trim() || inheritedTemplate);
    setShowVoucherModal(true);
  };

  const handleResetToRootDefault = () => {
    setModalTemplate(rootDefaultTemplate);
  };

  const insertTokenAtCursor = (token: string) => {
    const ta = voucherTextareaRef.current;
    if (!ta) {
      setModalTemplate((prev) => (prev ? prev + ' ' + token : token));
      return;
    }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const before = ta.value.substring(0, start);
    const after = ta.value.substring(end);
    setModalTemplate(before + token + after);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  };

  const handleDropToken = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const token = e.dataTransfer.getData('text/plain');
    if (token) insertTokenAtCursor(token);
  };

  const handleSaveVoucherModal = () => {
    if (modalTemplate.trim() === inheritedTemplate.trim()) {
      setVoucherTemplate('');
    } else {
      setVoucherTemplate(modalTemplate.trim());
    }
    setShowVoucherModal(false);
  };
  // Guest-facing arrival info (6 Sep 2026). NOT gated on !isRoom like the
  // contact/address block below: in a multi-key property each room is its own
  // Airbnb listing with its own network and its own house manual, so these are
  // per-row values, not parent-only ones.
  const [wifiNetwork, setWifiNetwork] = useState((property as any).wifi_network || '');
  const [wifiPassword, setWifiPassword] = useState((property as any).wifi_password || '');
  const [houseManual, setHouseManual] = useState((property as any).house_manual || '');
  // Listing content (6 Sep 2026) - shown to guests on the public booking page.
  const [description, setDescription] = useState((property as any).description || '');
  const [houseRules, setHouseRules] = useState((property as any).house_rules || '');
  const [cancellationPolicy, setCancellationPolicy] = useState((property as any).cancellation_policy || '');
  const numOrBlank = (v: any) => (v === null || v === undefined || v === '' ? '' : String(v));
  const [bedrooms, setBedrooms] = useState(numOrBlank((property as any).bedrooms));
  const [bedsCount, setBedsCount] = useState(numOrBlank((property as any).beds_count));
  const [bathrooms, setBathrooms] = useState(numOrBlank((property as any).bathrooms));

  // Amenities + Bed Configuration (7 Sep 2026) - both already round-trip
  // through the Airbnb importer's own JSON columns, and PublicBookingEngine.tsx
  // already reads and displays both to guests through the shared humanizeKey()
  // helper, but until now there was no manual editor for either anywhere in
  // the app - a property with no Airbnb connection (or one whose owner just
  // wants to add something Airbnb doesn't know about) had no way to fill
  // these in at all.
  // humanizeKey() is applied once here, at load time, to whatever the DB
  // actually holds - an Airbnb-imported value arrives as a raw snake_case
  // key ("double_bed", "air_conditioning") and looked exactly like a
  // variable name in this edit form (reported live 7 Sep 2026) even though
  // guests never saw it that way, since PublicBookingEngine already ran it
  // through the same helper. Humanizing on load, not on every render, keeps
  // this a one-time cleanup - free typing after that (e.g. "WiFi") is left
  // exactly as typed, not re-normalized on each keystroke.
  const parseJsonArraySafe = (raw: any): any[] => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== 'string' || !raw.trim()) return [];
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  // Amenities go a step further than humanizeKey() (7 Sep 2026): they are
  // mapped onto the real catalog labels via normalizeAmenityList(), so an
  // imported WIRELESS_INTERNET arrives as "Wi-Fi" and actually ticks its own
  // checkbox in AmenitiesSelectModal instead of sitting in "Custom Added
  // Amenities" beside an unticked one. Humanizing alone could never do that -
  // it produced "Wireless Internet", which matches no catalog label. Legacy
  // rows heal on the next save; nothing needs a migration.
  const [amenities, setAmenities] = useState<string[]>(() =>
    normalizeAmenityList(parseJsonArraySafe((property as any).amenities))
  );
  const [showAmenitiesModal, setShowAmenitiesModal] = useState(false);
  const removeAmenity = (idx: number) => setAmenities((prev) => prev.filter((_, i) => i !== idx));

  interface BedRoomEntry {
    room_type: string;
    beds: { type: string; quantity: number }[];
  }
  const [bedConfig, setBedConfig] = useState<BedRoomEntry[]>(() =>
    parseJsonArraySafe((property as any).bed_configuration).map((r: any) => ({
      room_type: typeof r?.room_type === 'string' ? humanizeKey(r.room_type) : '',
      beds: Array.isArray(r?.beds)
        ? r.beds.map((b: any) => ({
            type: typeof b?.type === 'string' ? humanizeKey(b.type) : '',
            quantity: Number(b?.quantity) || 1,
          }))
        : [],
    }))
  );
  const addBedRoom = () =>
    setBedConfig((prev) => [...prev, { room_type: `Room ${prev.length + 1}`, beds: [{ type: '', quantity: 1 }] }]);
  const removeBedRoom = (idx: number) => setBedConfig((prev) => prev.filter((_, i) => i !== idx));
  const updateBedRoomName = (idx: number, value: string) =>
    setBedConfig((prev) => prev.map((r, i) => (i === idx ? { ...r, room_type: value } : r)));
  const addBed = (roomIdx: number) =>
    setBedConfig((prev) => prev.map((r, i) => (i === roomIdx ? { ...r, beds: [...r.beds, { type: '', quantity: 1 }] } : r)));
  const removeBed = (roomIdx: number, bedIdx: number) =>
    setBedConfig((prev) =>
      prev.map((r, i) => (i === roomIdx ? { ...r, beds: r.beds.filter((_, bi) => bi !== bedIdx) } : r))
    );
  const updateBedType = (roomIdx: number, bedIdx: number, value: string) =>
    setBedConfig((prev) =>
      prev.map((r, i) =>
        i !== roomIdx ? r : { ...r, beds: r.beds.map((b, bi) => (bi !== bedIdx ? b : { ...b, type: value })) }
      )
    );
  const updateBedQuantity = (roomIdx: number, bedIdx: number, value: string) =>
    setBedConfig((prev) =>
      prev.map((r, i) =>
        i !== roomIdx
          ? r
          : { ...r, beds: r.beds.map((b, bi) => (bi !== bedIdx ? b : { ...b, quantity: Math.max(1, Number(value) || 1) })) }
      )
    );
  const [checkinTime, setCheckinTime] = useState(property.checkin_time || '14:00');
  const [checkoutTime, setCheckoutTime] = useState(property.checkout_time || '11:00');
  // Only meaningful for SINGLE properties - a MULTI_KEY parent isn't itself
  // bookable, each of its rooms has its own tariff (set in RoomsManagement.tsx).
  const [defaultTariff, setDefaultTariff] = useState(
    property.default_tariff != null ? String(property.default_tariff) : ''
  );
  // 0 is the "never set" sentinel every existing row holds (the column was
  // added long ago but nothing ever wrote to it), so it shows as an empty
  // field rather than a literal 0.
  const [maxCapacity, setMaxCapacity] = useState(
    property.max_capacity ? String(property.max_capacity) : ''
  );
  // Occupancy pricing (6 Sep 2026). includedOccupancy defaults to 2 rather than
  // blank because that is the column default and the near-universal real answer -
  // a blank here would read as "nobody is included".
  const [includedOccupancy, setIncludedOccupancy] = useState(
    property.included_occupancy != null ? String(property.included_occupancy) : '2'
  );
  const [extraGuestCharge, setExtraGuestCharge] = useState(
    property.extra_guest_charge ? String(property.extra_guest_charge) : ''
  );
  const [cleaningFee, setCleaningFee] = useState(
    property.cleaning_fee ? String(property.cleaning_fee) : ''
  );
  const [securityDeposit, setSecurityDeposit] = useState(
    property.security_deposit ? String(property.security_deposit) : ''
  );

  // Live validation, same shape as the UPI/passcode fields (see CLAUDE.md's
  // "Real-Time Form Validation"): gated on .length > 0 so an untouched field
  // never shows red, and it does not replace the submit-time guard.
  const isBadMoney = (v: string) =>
    v.length > 0 && (!/^\d+(\.\d{1,2})?$/.test(v) || Number(v) > 1000000);
  const includedOccupancyInvalid =
    includedOccupancy.length > 0 &&
    (!/^\d+$/.test(includedOccupancy) || Number(includedOccupancy) < 1 || Number(includedOccupancy) > 99);
  // A charge that can never apply is a silent no-op rather than an error - worth
  // saying out loud, because it looks like it is working right up until a bill
  // comes out wrong.
  const extraGuestUnreachable =
    Number(extraGuestCharge) > 0 &&
    Number(maxCapacity) > 0 &&
    Number(includedOccupancy) >= Number(maxCapacity);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Sample guest/booking values - the fields this form actually edits
  // (property_name/phone/address/maps_link/upi/notes/check-in-out times)
  // fill in for real; nothing here is guest- or booking-specific data this
  // page has any business editing.
  const previewSampleValues = {
    booking_id: '1042',
    guest_name: 'Tarpan Patel',
    guest_phone: '98765 43210',
    room_name: isRoom ? name.trim() || 'Room 101' : 'Room 101',
    room_number: isRoom ? name.trim() || 'Room 101' : 'Room 101',
    checkin_date: '08 Aug 2026',
    checkout_date: '11 Aug 2026',
    nights: '3',
    guest_count: '5',
    guest_breakdown: '3 adults, 2 children',
    room_tariff: '4,500.00',
    advance_paid: '2,000.00',
    balance_due: '2,500.00',
    payments_list: '\n  • ₹1,000 on 15/07/2026 (UPI)\n  • ₹1,000 on 25/07/2026 (Cash)',
    voucher_link: 'https://your-property.example/#voucher?token=...',
  };

  // Same template + substitution logic BookingDetailsModal.tsx's real "Share
  // via WhatsApp" send uses - this preview is only trustworthy if it can
  // never drift from what actually goes out to a guest.
  const getPreviewText = () => {
    const finalUpi = (upiId.trim() || 'payments@upi');
    const upiPaymentDeepLink = `upi://pay?pa=${encodeURIComponent(finalUpi)}&pn=${encodeURIComponent(name.trim() || 'Your Property')}&cu=INR`;
    const finalQr = upiQrCodeUrl.trim() || `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(upiPaymentDeepLink)}`;

    return renderWhatsappVoucherTemplate(effectiveTemplate, {
      ...previewSampleValues,
      property_name: name.trim() || 'Your Property',
      address: address.trim(),
      property_address: address.trim(),
      contact_phone: phone.trim(),
      property_phone: phone.trim(),
      phone: phone.trim(),
      maps_link: mapsLink.trim(),
      google_maps_link: mapsLink.trim(),
      upi_id: finalUpi,
      upi_qr_code_url: finalQr,
      qr_code: finalQr,
      other_notes: instructions.trim(),
      instructions: instructions.trim(),
      wifi_network: wifiNetwork.trim(),
      wifi_password: wifiPassword.trim(),
      house_manual: houseManual.trim(),
      checkin_time: checkinTime,
      checkout_time: checkoutTime,
      // Not a sample: this form owns the deposit field, so the preview shows
      // what is actually typed in it. Empty or zero and the line vanishes,
      // which is exactly what a real voucher would do.
      security_deposit: Number(securityDeposit) > 0 ? Number(securityDeposit).toFixed(2) : '',
    });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setNameTouched(true);
      return;
    }
    if (upiId.trim() && !isValidUpiIdSyntax(upiId)) {
      const errMsg = t('upi_id_invalid_format_error', 'Enter a valid UPI ID, e.g. name@bank');
      setError(errMsg);
      showToast(errMsg, { type: 'error' });
      return;
    }
    setError(null);
    setSuccess(false);
    setIsSaving(true);
    try {
      const payload: Record<string, any> = {
        property_id: property.id,
        name: name.trim(),
        checkin_time: checkinTime,
        checkout_time: checkoutTime,
        default_tariff: defaultTariff,
        max_capacity: maxCapacity,
        included_occupancy: includedOccupancy,
        extra_guest_charge: extraGuestCharge,
        cleaning_fee: cleaningFee,
        security_deposit: securityDeposit,
        wifi_network: wifiNetwork.trim(),
        wifi_password: wifiPassword.trim(),
        house_manual: houseManual,
        description: description,
        house_rules: houseRules,
        cancellation_policy: cancellationPolicy,
        bedrooms: bedrooms,
        beds_count: bedsCount,
        bathrooms: bathrooms,
        amenities: JSON.stringify(amenities),
        bed_configuration: JSON.stringify(
          bedConfig
            .map((r) => ({
              room_type: r.room_type.trim(),
              beds: r.beds
                .filter((b) => b.type.trim())
                .map((b) => ({ type: b.type.trim(), quantity: Math.max(1, Number(b.quantity) || 1) })),
            }))
            .filter((r) => r.beds.length > 0)
        ),
      };
      if (!isRoom) {
        // '' clears the override and returns the property to the inherited
        // template - the backend stores empty as NULL, so this round-trips.
        payload.whatsapp_voucher_template = voucherTemplate.trim();
        payload.email = email.trim();
        payload.phone = phone.trim();
        payload.gstin = gstin.trim().toUpperCase();
        payload.upi_id = upiId.trim();
        payload.upi_qr_code_url = upiQrCodeUrl.trim();
        payload.walk_in_table_count = walkInTableCount;
        payload.address = address.trim();
        payload.google_maps_link = mapsLink.trim();
        payload.instructions = instructions;
      }
      const res = await fetch('/php/api/router.php?action=update_property', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        showToast(t('property_updated_success_message', 'Property details saved'), { type: 'success' });
        if (onSaved) onSaved();
      } else {
        const msg = data.message || 'Failed to save property details';
        setError(msg);
        showToast(msg, { type: 'error' });
      }
    } catch {
      const msg = 'Network error. Please try again.';
      setError(msg);
      showToast(msg, { type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // Setup screens show field guidance BELOW the field, always visible, rather than behind a
  // "?" popover (9 Sep 2026, explicit request). The owner is meeting each field for the first
  // time here, so the help IS the content - a popover nobody opens is help nobody reads.
  // Scoped to this screen only; the rest of the app keeps the popover.
  return (
    <FieldHelpModeProvider mode="inline">
      <div className="property-edit-form space-y-4">
        {error && (
          <div className="property-edit-form__error flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="property-edit-form__success flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {t('property_updated_success_message', 'Property details saved')}
          </div>
        )}

        {/* Property Name/Email/Contact Phone/GSTIN in a 2x2 grid (20 Aug 2026,
            explicit request) - was Property Name alone, then Email+Phone and
            GSTIN+UPI as two separate sm:-gated pairs, all collapsing to one
            column per row on mobile. Now always 2 columns regardless of
            viewport, with GSTIN moved up to pair with Phone (was paired with
            UPI ID) so these first 4 fields read as one 2x2 block; UPI ID +
            its QR upload block become their own standalone section below
            since nothing else in this range needs to pair with them. Room
            mode keeps Property Name (as "Room Name") alone - none of
            Email/Phone/GSTIN exist for a room. */}
        {/* grid-cols-1 sm:grid-cols-2 (27 Aug 2026, user report + confirmed follow-up: these
            rows forced 2 columns at every viewport width, unlike PropertySetupWizard's mobile-
            first single-column fields - cramped on a ~380px phone screen). Stacks to one column
            below sm, matching that wizard's own convention. */}
        {/* Room mode is a 2x2 form (name + tariff, then check-in + check-out) rather
            than three rows with a half-empty one at the bottom - reported 5 Sep 2026
            as the Edit Room page being too airy. Property mode keeps its own layout. */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <div className="property-edit-form__field">
            <Input
              label={isRoom ? t('room_name_label', 'Room Name') : isMultiKeyParent ? t('tenant_property_name_label_parent', 'Parent Property Name') : t('tenant_property_name_label', 'Property Name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setNameTouched(true)}
              error={nameTouched && !name.trim() ? 'This field is required' : undefined}
            />
          </div>
          {isRoom && property.property_type !== 'MULTI_KEY' && (
            <div className="property-edit-form__field">
              <Input
                type="number"
                label={t('default_tariff_label', 'Default Tariff / Night (₹, optional)')}
                value={defaultTariff}
                onChange={(e) => setDefaultTariff(e.target.value)}
                placeholder={t('default_tariff_placeholder', 'e.g. 2000')}
                helperText={t('default_tariff_help', 'Pre-fills the rate when creating a new booking - still editable per booking.')}
              />
            </div>
          )}
          {!isRoom && (
            <div className="property-edit-form__field">
              <Input
                type="email"
                label={t('email_label', 'Email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('email_placeholder', 'info@example.com')}
              />
            </div>
          )}
        </div>

        {!isRoom && (
          <div className="property-edit-form__row grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="property-edit-form__field">
              <Input
                type="tel"
                label={isMultiKeyParent ? t('tenant_contact_phone_label_parent', 'Parent Property Phone Number') : t('tenant_contact_phone_label', 'Contact number of property')}
                value={phone}
                // No maxLength - see GuestManagement.tsx's onChange comment (23 Aug 2026): it
                // truncates raw typed characters before digit-stripping runs, silently dropping
                // trailing digits from any formatted phone number.
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder={t('contact_phone_placeholder', 'Enter 10-digit mobile number')}
                helperText={t('property_phone_helper_text', 'This is the phone number guests will be shown to contact the property.')}
              />
            </div>
            <div className="property-edit-form__field">
              <Input
                type="text"
                label={t('gstin_optional_label', 'GSTIN (optional)')}
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="27ABCDE1234F1Z5"
              />
            </div>
          </div>
        )}

        {!isRoom && (
          <div className="property-edit-form__field">
            <div>
              <Input
                type="text"
                label={t('upi_id_optional_label', 'UPI ID (optional)')}
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="yourproperty@okicici"
                // Live syntax check (26 Aug 2026, explicit request) - optional field, so an
                // empty value shows neither state; a non-empty one shows red/green the moment
                // it stops/starts matching the standard <handle>@<bank> VPA format, instead of
                // only being caught (or not caught at all) on save.
                error={upiId.trim() && !isValidUpiIdSyntax(upiId) ? t('upi_id_invalid_format_error', 'Enter a valid UPI ID, e.g. name@bank') : undefined}
                success={upiId.trim() && isValidUpiIdSyntax(upiId) ? t('upi_id_valid_format_success', 'Valid UPI ID format') : undefined}
                helperText={t('upi_qr_code_help_text', 'This will be shown to customer at checkout.')}
              />
              {upiId.trim() && isValidUpiIdSyntax(upiId) && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('upi_qr_code_help_text', 'This will be shown to customer at checkout.')}</p>
                  <UpiPaymentBlock upiId={upiId.trim()} payeeName={name.trim() || 'Payment'} qrCodeImageUrl={upiQrCodeUrl} />
                </div>
              )}
            </div>
          </div>
        )}

        {!isRoom && (
          <div className="property-edit-form__field">
            <Input
              type="number"
              min={1}
              max={200}
              label={t('walk_in_table_count_label', 'Number of Tables (Walk-in Orders)')}
              value={walkInTableCount}
              onChange={(e) => setWalkInTableCount(e.target.value)}
              placeholder="10"
              helperText={t('walk_in_table_count_help', "How many number of tables the Kitchen can serve.")}
            />
          </div>
        )}

        {!isRoom && (
          <div className="property-edit-form__row grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="property-edit-form__field">
              <Input
                type="text"
                label={t('address_label', 'Address')}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t('full_property_address_placeholder', 'Full property address')}
              />
            </div>
            <div className="property-edit-form__field">
              <Input
                type="text"
                label={t('google_maps_link_label', 'Google Maps Link')}
                value={mapsLink}
                onChange={(e) => setMapsLink(e.target.value)}
                placeholder={t('google_maps_link_placeholder', 'https://maps.app.goo.gl/...')}
              />
            </div>
          </div>
        )}

        <div className="property-edit-form__row grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Sleeps (added 5 Sep 2026). This is what Channex publishes as the room
              type's capacity/occ_adults to every OTA. Until this field existed the
              sync hardcoded 6 for every room, so a two-person studio was listed as
              sleeping six - see php/channex/content_sync.php. */}
          <div className="property-edit-form__field">
            <Input
              type="number"
              label={t('max_capacity_label', 'Sleeps (max guests)')}
              value={maxCapacity}
              onChange={(e) => setMaxCapacity(e.target.value)}
              placeholder={t('max_capacity_placeholder', 'e.g. 2')}
              error={maxCapacity !== '' && (!/^\d+$/.test(maxCapacity) || Number(maxCapacity) < 1 || Number(maxCapacity) > 99)
                ? t('max_capacity_invalid', 'Enter a whole number of guests between 1 and 99.')
                : undefined}
              helperText={isRoom
                ? t('max_capacity_help_room', "How many guests this room sleeps. Published to Airbnb and Booking.com.")
                : t('max_capacity_help', 'How many guests this property sleeps. Published to Airbnb and Booking.com.')}
            />
          </div>

          {/* Occupancy pricing (6 Sep 2026). Before this a property could express
              exactly one number - a flat nightly rate - so a real "first N guests
              included, then X per head" structure had nowhere to live and survived
              only on the OTAs' own pricing screens. That is the two-sources-of-truth
              problem the Channex guide warns about: staff quote one number and the
              guest pays another. Airbnb already returns both halves for a connected
              listing (guests_included / price_per_extra_person), so these can be
              imported rather than retyped. */}
          <div className="property-edit-form__field">
            <Input
              type="number"
              label={t('included_occupancy_label', 'Guests Included in the Rate')}
              value={includedOccupancy}
              onChange={(e) => setIncludedOccupancy(e.target.value)}
              placeholder={t('included_occupancy_placeholder', 'e.g. 2')}
              error={includedOccupancyInvalid
                ? t('included_occupancy_invalid', 'Enter a whole number of guests between 1 and 99.')
                : undefined}
              helperText={t('included_occupancy_help', 'How many guests the nightly rate already covers. Extra guests are charged below.')}
            />
          </div>
          <div className="property-edit-form__field">
            <Input
              type="number"
              label={t('extra_guest_charge_label', 'Extra Guest Charge / Night')}
              value={extraGuestCharge}
              onChange={(e) => setExtraGuestCharge(e.target.value)}
              placeholder={t('extra_guest_charge_placeholder', 'e.g. 950')}
              error={isBadMoney(extraGuestCharge)
                ? t('extra_guest_charge_invalid', 'Enter an amount up to 1,000,000 with at most 2 decimals.')
                : undefined}
              helperText={extraGuestUnreachable
                ? t('extra_guest_charge_unreachable', 'This never applies - the included guests already fill the room, so nobody can be an extra guest.')
                : t('extra_guest_charge_help', 'Charged per night for each guest beyond the included count.')}
            />
          </div>
          <div className="property-edit-form__field">
            <Input
              type="number"
              label={t('cleaning_fee_label', 'Cleaning Fee (once per stay)')}
              value={cleaningFee}
              onChange={(e) => setCleaningFee(e.target.value)}
              placeholder={t('cleaning_fee_placeholder', 'e.g. 500')}
              error={isBadMoney(cleaningFee)
                ? t('cleaning_fee_invalid', 'Enter an amount up to 1,000,000 with at most 2 decimals.')
                : undefined}
              helperText={t('cleaning_fee_help', 'Added once to the bill, not per night. Leave blank if you do not charge one.')}
            />
          </div>
          <div className="property-edit-form__field">
            <Input
              type="number"
              label={t('security_deposit_label', 'Security Deposit (refundable)')}
              value={securityDeposit}
              onChange={(e) => setSecurityDeposit(e.target.value)}
              placeholder={t('security_deposit_placeholder', 'e.g. 2000')}
              error={isBadMoney(securityDeposit)
                ? t('security_deposit_invalid', 'Enter an amount up to 1,000,000 with at most 2 decimals.')
                : undefined}
              helperText={t('security_deposit_help', 'Held against damage and returned at checkout. Not revenue.')}
            />
          </div>
          <div className="property-edit-form__field">
            <Input
              type="time"
              label={t('checkin_time_label', 'Check-in Time')}
              value={checkinTime}
              onChange={(e) => setCheckinTime(e.target.value)}
              helperText={isRoom ? t('checkin_time_help_room', "This room's own check-in time.") : t('checkin_time_help', 'Applied to all rooms under this property.')}
            />
          </div>
          <div className="property-edit-form__field">
            <Input
              type="time"
              label={t('checkout_time_label', 'Check-out Time')}
              value={checkoutTime}
              onChange={(e) => setCheckoutTime(e.target.value)}
              helperText={isRoom ? t('checkout_time_help_room', "This room's own check-out time.") : t('checkout_time_help', 'Applied to all rooms under this property.')}
            />
          </div>
        </div>

        {/* Multi-key parent properties aren't themselves bookable - each room has
            its own tariff, set here (in room mode) instead. */}
        {!isRoom && property.property_type !== 'MULTI_KEY' && (
          <div className="property-edit-form__row grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="property-edit-form__field">
              <Input
                type="number"
                label={t('default_tariff_label', 'Default Tariff / Night (₹, optional)')}
                value={defaultTariff}
                onChange={(e) => setDefaultTariff(e.target.value)}
                placeholder={t('default_tariff_placeholder', 'e.g. 2000')}
                helperText={t('default_tariff_help', 'Pre-fills the rate when creating a new booking - still editable per booking.')}
              />
            </div>
          </div>
        )}

        {!isRoom && (
        <div className="property-edit-form__field">
          <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('other_notes_label', 'Other Notes')}</label>
          <WhatsAppEditor
            value={instructions}
            onChange={setInstructions}
            placeholder={t('other_notes_placeholder', 'e.g. How to reach, check-in instructions, parking notes…')}
            rows={4}
          />
        </div>
        )}

        {/* Listing content (6 Sep 2026). Rendered on the public booking page under
            the room name - description, the facts line, and amenity chips. Imported
            from Airbnb when a listing is connected, editable here either way. */}
        <div className="property-edit-form__field">
          <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
            {t('property_description_label', 'Description')}
          </label>
          <WhatsAppEditor
            value={description}
            onChange={setDescription}
            placeholder={t('property_description_placeholder', 'What makes this place worth booking - shown to guests on your booking page.')}
            rows={4}
          />
        </div>

        <div className="property-edit-form__field grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label={t('bedrooms_label', 'Bedrooms')}
            type="number"
            min="0"
            value={bedrooms}
            onChange={(e) => setBedrooms(e.target.value)}
            placeholder={t('bedrooms_placeholder', 'e.g. 1')}
          />
          <Input
            label={t('beds_count_label', 'Beds')}
            type="number"
            min="0"
            value={bedsCount}
            onChange={(e) => setBedsCount(e.target.value)}
            placeholder={t('beds_count_placeholder', 'e.g. 2')}
          />
          <Input
            label={t('bathrooms_label', 'Bathrooms')}
            type="number"
            min="0"
            step="0.5"
            value={bathrooms}
            onChange={(e) => setBathrooms(e.target.value)}
            placeholder={t('bathrooms_placeholder', 'e.g. 1.5')}
            helperText={t('bathrooms_help', 'Half counts as 0.5.')}
          />
        </div>

        {/* Bed configuration (7 Sep 2026) - the detailed per-room bed breakdown
            behind the "Beds" count above (e.g. "1 Queen Bed, 1 Sofa Bed" instead
            of just "2"). Shown to guests in PublicBookingEngine's room-facts
            line. Imported from Airbnb when connected, editable here either way -
            bed type is free text (not a fixed picker) so it renders correctly
            either way, since PublicBookingEngine's humanizeKey() just title-cases
            whatever string is stored. */}
        <div className="property-edit-form__field space-y-2">
          <div className="flex items-center gap-2">
            <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200">
              {t('bed_configuration_label', 'Bed Configuration')}
            </label>
          </div>
          <FieldHelpText
            content={t('bed_configuration_help', 'Shown to guests as part of the room facts (e.g. "1 Queen Bed"). Optional.')}
          />
          <div className="space-y-3">
            {bedConfig.map((room, roomIdx) => (
              <div key={roomIdx} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Input
                    value={room.room_type}
                    onChange={(e) => updateBedRoomName(roomIdx, e.target.value)}
                    placeholder={t('bed_room_name_placeholder', 'e.g. Bedroom 1, Living Room')}
                    fullWidth
                  />
                  <button
                    type="button"
                    onClick={() => removeBedRoom(roomIdx)}
                    aria-label={t('remove_room_label', 'Remove room')}
                    className="shrink-0 p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {room.beds.map((bed, bedIdx) => (
                    <div key={bedIdx} className="flex items-center gap-2 pl-2">
                      <Input
                        value={bed.type}
                        onChange={(e) => updateBedType(roomIdx, bedIdx, e.target.value)}
                        placeholder={t('bed_type_placeholder', 'e.g. Queen bed, Sofa bed')}
                        fullWidth
                      />
                      <Input
                        type="number"
                        min="1"
                        value={String(bed.quantity)}
                        onChange={(e) => updateBedQuantity(roomIdx, bedIdx, e.target.value)}
                        className="w-20 shrink-0"
                        fullWidth={false}
                      />
                      <button
                        type="button"
                        onClick={() => removeBed(roomIdx, bedIdx)}
                        aria-label={t('remove_bed_label', 'Remove bed')}
                        className="shrink-0 p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="secondary" size="xs" onClick={() => addBed(roomIdx)} className="flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('add_bed_button', 'Add Bed')}</span>
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={addBedRoom} className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            <span>{t('add_room_button', 'Add Room')}</span>
          </Button>
        </div>

        <div className="property-edit-form__field">
          <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
            {t('house_rules_label', 'House Rules')}
          </label>
          <WhatsAppEditor
            value={houseRules}
            onChange={setHouseRules}
            placeholder={t('house_rules_placeholder', 'e.g. No smoking indoors, quiet hours after 10pm, no parties…')}
            rows={3}
          />
        </div>

        {/* Kept separate from House Rules on purpose (7 Sep 2026): house rules
            govern behaviour during a stay, cancellation governs money before one.
            A guest disputing a refund has to be able to point at the exact terms
            that applied, not search for them inside a list about smoking and quiet
            hours. Both appear on the public booking voucher. */}
        <div className="property-edit-form__field">
          <div className="flex items-center gap-2 mb-1.5">
            <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200">
              {t('cancellation_policy_label', 'Cancellation Policy')}
            </label>
          </div>
          <FieldHelpText
            content={t('cancellation_policy_help', 'Shown to the guest on their booking voucher.')}
          />
          <WhatsAppEditor
            value={cancellationPolicy}
            onChange={setCancellationPolicy}
            placeholder={t('cancellation_policy_placeholder', 'e.g. Free cancellation up to 7 days before check-in. After that, the advance is not refundable.')}
            rows={3}
          />
        </div>

        {/* Amenities (7 Sep 2026) - shown to guests as chips under the room
            description on the public booking page (PublicBookingEngine.tsx).
            Free text, not a fixed checklist - Airbnb's own amenity vocabulary
            keeps growing and this needs to cover anything a property actually
            has, imported or not. Stored as plain human-readable strings; a
            duplicate (case-insensitive) is silently ignored rather than added
            twice. */}
        {/* Amenities (7 Sep 2026) - select via modal or quick add */}
        <div className="property-edit-form__field space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <label className="app-label block text-sm font-semibold text-slate-800 dark:text-slate-100">
                {t('amenities_label', 'Amenities')}
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('amenities_subtitle', 'Shown to guests on your direct booking page.')}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowAmenitiesModal(true)}
              className="shrink-0 flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>{t('select_amenities_button', 'Select Amenities')}</span>
              {amenities.length > 0 && (
                <span className="ms-1 px-1.5 py-0.2 rounded text-2xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
                  {amenities.length}
                </span>
              )}
            </Button>
          </div>

          {amenities.length > 0 ? (
            <div className="flex flex-wrap gap-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/80">
              {amenities.map((a, idx) => {
                const Icon = getAmenityIcon(a);
                return (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium pl-2.5 pr-1.5 py-1 border border-slate-200 dark:border-slate-700 shadow-2xs"
                  >
                    <Icon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                    <span>{a}</span>
                    <button
                      type="button"
                      onClick={() => removeAmenity(idx)}
                      aria-label={t('remove_amenity_label', 'Remove amenity')}
                      className="p-0.5 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col items-center justify-center gap-2">
              <span>{t('no_amenities_added_message', 'No amenities added yet.')}</span>
              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={() => setShowAmenitiesModal(true)}
                className="flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>{t('select_amenities_button', 'Select Amenities')}</span>
              </Button>
            </div>
          )}

          {/* Amenities Selection Modal */}
          <AmenitiesSelectModal
            isOpen={showAmenitiesModal}
            onClose={() => setShowAmenitiesModal(false)}
            selectedAmenities={amenities}
            onSave={(newAmenities) => setAmenities(newAmenities)}
          />
        </div>

        {/* Guest arrival info (6 Sep 2026). Appears on the WhatsApp booking
            voucher via {wifi_network}/{wifi_password}/{house_manual}; an empty
            field drops its whole line, so leaving these blank changes nothing.
            Imported from Airbnb when a listing is connected. */}
        <div className="property-edit-form__field grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={t('wifi_network_label', 'WiFi Network')}
            value={wifiNetwork}
            onChange={(e) => setWifiNetwork(e.target.value)}
            placeholder={t('wifi_network_placeholder', 'e.g. Artistic_Sthan_23')}
            helperText={t('wifi_network_help', 'Shown to the guest on their booking voucher.')}
          />
          <Input
            label={t('wifi_password_label', 'WiFi Password')}
            value={wifiPassword}
            onChange={(e) => setWifiPassword(e.target.value)}
            placeholder={t('wifi_password_placeholder', 'e.g. welcome@123')}
          />
        </div>

        <div className="property-edit-form__field">
          <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
            {t('house_manual_label', 'House Manual')}
          </label>
          <WhatsAppEditor
            value={houseManual}
            onChange={setHouseManual}
            placeholder={t('house_manual_placeholder', 'e.g. How the AC and geyser work, rubbish collection day, what to do if the internet drops…')}
            rows={4}
          />
        </div>

        {/* Live WhatsApp voucher preview (26 Aug 2026) - not editable, see this
            file's own top comment for why. Guest/booking fields (name, dates,
            amounts) are fixed sample values; every property/contact field
            below is read live from this form's own state, not the last-saved
            `property` prop, so it updates as you type. */}
        {!isRoom && (
          <div className="property-edit-form__whatsapp-preview mt-2 border border-slate-200 dark:border-slate-700/80 rounded-lg overflow-hidden bg-slate-50/50 dark:bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200/80 dark:border-slate-800">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                <MessageCircle className="w-3.5 h-3.5" />
              </span>
              <div>
                <h4 className="property-edit-form__preview-caption text-[10px] font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
                  {t('whatsapp_preview_heading', 'Guest booking confirmation message/email')}
                </h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {t('whatsapp_preview_subtitle', 'Updates live as you edit the fields above - this is exactly what guests receive.')}
                </p>
              </div>
              <div className="ms-auto flex items-center gap-2">
                {voucherTemplate.trim() && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setVoucherTemplate('')}
                    className="text-red-600 hover:text-red-700 dark:text-red-400 text-xs"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    <span>{t('reset_to_default_button', 'Reset')}</span>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={handleOpenVoucherModal}
                  className="flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>{t('whatsapp_template_edit', 'Edit wording')}</span>
                </Button>
              </div>
            </div>
            <div className="bg-[#e5ddd5] dark:bg-[#111b21] p-3 rounded-lg max-w-md mx-auto shadow-inner border border-slate-300/40 dark:border-slate-800">
              <div className="bg-white dark:bg-[#202c33] p-3.5 rounded-lg shadow-md text-xs text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed border-l-4 border-emerald-500">
                <MessageQrPreview
                  text={getPreviewText()}
                  cardClassName="my-2.5 p-2 bg-slate-50 dark:bg-[#111b21] rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col items-start gap-1.5 shadow-2xs"
                  captionClassName="text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          {onCancel && (
            <Button variant="secondary" type="button" onClick={onCancel}>
              {cancelLabel || t('cancel_button', 'Cancel')}
            </Button>
          )}
          <Button
            onClick={handleSave}
            variant="primary"
            disabled={isSaving || !name.trim()}
            className="flex items-center gap-2"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitLabel || t('save_changes_button', 'Save Changes')}
          </Button>
        </div>
        {/* Edit Booking Confirmation Voucher Modal */}
        <Modal
          show={showVoucherModal}
          onClose={() => setShowVoucherModal(false)}
          size="2xl"
          dismissible
          className="z-50"
        >
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <MessageCircle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white m-0 leading-tight">
                  {t('edit_booking_voucher_modal_title', 'Edit Booking Confirmation Voucher')}
                </h3>
                <p className="text-2xs text-gray-500 dark:text-gray-400 mt-0.5 m-0">
                  {t('edit_booking_voucher_modal_subtitle', 'Customise the message guests receive when a booking is created or shared on WhatsApp.')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowVoucherModal(false)}
              aria-label={t('close_button', 'Close')}
              className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 sm:p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
              <span className="text-slate-600 dark:text-slate-300">
                {modalTemplate.trim() && modalTemplate.trim() !== inheritedTemplate.trim()
                  ? t('whatsapp_template_overridden', 'Custom wording active for this property.')
                  : `${t('whatsapp_template_inherited', 'Currently matching')} ${inheritedFrom}.`}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={handleResetToRootDefault}
                className="flex items-center gap-1 shrink-0 text-slate-700 dark:text-slate-200"
              >
                <RotateCcw className="w-3 h-3 text-slate-500" />
                <span>{t('reset_to_root_default_button', 'Reset to Root Dashboard Default')}</span>
              </Button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                {t('voucher_template_text_label', 'Voucher Template Text')}
              </label>
              <textarea
                ref={voucherTextareaRef}
                value={modalTemplate}
                onChange={(e) => setModalTemplate(e.target.value)}
                placeholder={inheritedTemplate}
                rows={13}
                spellCheck={false}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={handleDropToken}
                className="w-full px-3 py-2 text-xs font-mono leading-relaxed rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-2xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  {t('available_tokens_label', 'Available Tokens (Click to insert or drag & drop):')}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700/80">
                {VOUCHER_TOKENS.map((token) => (
                  <span
                    key={token}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', token);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => insertTokenAtCursor(token)}
                    className="text-2xs font-mono px-2 py-1 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-grab active:cursor-grabbing select-none transition-colors"
                  >
                    + {token}
                  </span>
                ))}
              </div>
              <p className="text-2xs text-slate-500 dark:text-slate-400">
                {t('whatsapp_template_optional_note', 'A line whose value is empty is removed automatically, so you can keep lines you only sometimes use.')}
              </p>
            </div>
          </div>

          <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-b-lg flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowVoucherModal(false)}
            >
              {t('cancel_button', 'Cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSaveVoucherModal}
            >
              {t('apply_changes_button', 'Apply Changes')}
            </Button>
          </div>
        </Modal>
      </div>
    </FieldHelpModeProvider>
  );
};
