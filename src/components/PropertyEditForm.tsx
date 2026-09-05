import React, { useState } from 'react';
import { useToast } from './ToastContext';
import { Loader2, CheckCircle2, AlertCircle, MessageCircle } from './icons/FlowbiteIcons';
import { t } from '../i18n/en';
import { Button } from './Button';
import { Input } from './Input';
import { WhatsAppEditor } from './WhatsAppEditor';
import { UpiPaymentBlock, isValidUpiIdSyntax } from '../utils/upiQrCode';
import { DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, renderWhatsappVoucherTemplate } from '../utils/whatsappVoucherTemplate';
import { MessageQrPreview } from './MessageQrPreview';

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
    checkin_time?: string | null;
    checkout_time?: string | null;
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
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Sample guest/booking values - the fields this form actually edits
  // (property_name/phone/address/maps_link/upi/notes/check-in-out times)
  // fill in for real; nothing here is guest- or booking-specific data this
  // page has any business editing.
  const previewSampleValues = {
    guest_name: 'Tarpan Patel',
    room_name: isRoom ? name.trim() || 'Room 101' : 'Room 101',
    room_number: isRoom ? name.trim() || 'Room 101' : 'Room 101',
    checkin_date: '08 Aug 2026',
    checkout_date: '11 Aug 2026',
    guest_count: '2',
    room_tariff: '4,500.00',
    advance_paid: '2,000.00',
  };

  // Same template + substitution logic BookingDetailsModal.tsx's real "Share
  // via WhatsApp" send uses - this preview is only trustworthy if it can
  // never drift from what actually goes out to a guest.
  const getPreviewText = () => {
    const finalUpi = (upiId.trim() || 'payments@upi');
    const upiPaymentDeepLink = `upi://pay?pa=${encodeURIComponent(finalUpi)}&pn=${encodeURIComponent(name.trim() || 'Your Property')}&cu=INR`;
    const finalQr = upiQrCodeUrl.trim() || `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(upiPaymentDeepLink)}`;

    return renderWhatsappVoucherTemplate(DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, {
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
      checkin_time: checkinTime,
      checkout_time: checkoutTime,
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
      };
      if (!isRoom) {
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

  return (
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
            label={isRoom ? t('room_name_label', 'Room Name') : t('tenant_property_name_label', 'Property Name')}
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
              label={t('tenant_contact_phone_label', 'Contact number of property')}
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
              helperText={t('upi_qr_code_help_text', 'A scannable UPI QR code is generated automatically from this ID and added to booking/bill messages shared over WhatsApp.')}
            />
            {upiId.trim() && isValidUpiIdSyntax(upiId) && (
              <div className="mt-2">
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
                {t('whatsapp_preview_subtitle', "Updates live as you edit the fields above - this is exactly what guests receive, wording isn't customizable.")}
              </p>
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
    </div>
  );
};
