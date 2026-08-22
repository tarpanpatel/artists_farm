import React, { useState, useRef } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Upload, Trash2 } from './icons/FlowbiteIcons';
import { t } from '../i18n/en';
import { Button } from './Button';
import { Input } from './Input';
import { WhatsAppEditor } from './WhatsAppEditor';
import { uploadImageDBVerbose } from '../services/api';

/**
 * Shared "Edit Property" form - property details only (name, contact,
 * GSTIN/UPI, address, check-in/out times, default tariff, maps link,
 * notes), saved via `update_property`. Guest WhatsApp messaging and the
 * Telegram customization toggle live in WhatsAppTemplateSettings.tsx (the
 * Telegram/messaging settings tab) instead - this page is property details
 * only, not guest/staff notification config.
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(property.name || '');
  const [email, setEmail] = useState(property.email || '');
  const [phone, setPhone] = useState(property.phone || '');
  const [gstin, setGstin] = useState(property.gstin || '');
  const [upiId, setUpiId] = useState(property.upi_id || '');
  const [upiQrCodeUrl, setUpiQrCodeUrl] = useState(property.upi_qr_code_url || '');
  const [walkInTableCount, setWalkInTableCount] = useState(
    property.walk_in_table_count != null ? String(property.walk_in_table_count) : '10'
  );
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [qrUploadError, setQrUploadError] = useState<string | null>(null);
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
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleQrCodeSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
    if (!ALLOWED.includes(file.type)) {
      setQrUploadError(t('qr_code_invalid_type_label', 'Please upload a JPG, PNG, or WEBP image.'));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setQrUploadError(t('qr_code_too_large_label', 'File is too large (max 10MB).'));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setQrUploadError(null);
    setIsUploadingQr(true);
    try {
      // Uploaded as-is (server downscales-only, never crops - see
      // upload_image.php's `qr_code` folder) so the corner finder patterns
      // that make it scannable are never cut off.
      const { url, error: uploadErr } = await uploadImageDBVerbose(file, 'qr_code');
      if (url) {
        setUpiQrCodeUrl(url);
      } else {
        setQrUploadError(uploadErr || t('qr_code_upload_failed_label', 'Failed to upload QR code. Please try again.'));
      }
    } catch (err: any) {
      setQrUploadError(err?.message || 'Failed to upload QR code. Please try again.');
    } finally {
      setIsUploadingQr(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;
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
        if (onSaved) onSaved();
      } else {
        setError(data.message || 'Failed to save property details');
      }
    } catch {
      setError('Network error. Please try again.');
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
      <div className={`grid gap-4 ${isRoom ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <div className="property-edit-form__field">
          <Input
            label={isRoom ? t('room_name_label', 'Room Name') : t('tenant_property_name_label', 'Property Name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
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
        <div className="property-edit-form__row grid grid-cols-2 gap-4">
          <div className="property-edit-form__field">
            <Input
              type="tel"
              label={t('tenant_contact_phone_label', 'Contact Phone')}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder={t('contact_phone_placeholder', 'Enter 10-digit mobile number')}
              maxLength={10}
            />
          </div>
          <div className="property-edit-form__field">
            <Input
              type="text"
              label={t('gstin_optional_label', 'GSTIN (optional)')}
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="27ABCDE1234F1Z5"
              helperText={t('gstin_help_text', 'Printed on GST tax invoices at checkout.')}
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
              helperText={t('upi_id_help_text', 'A scannable UPI QR code and this ID are added to booking confirmation and bill messages shared over WhatsApp.')}
            />
            <div className="property-edit-form__qr-upload mt-2">
              <input
                ref={fileInputRef}
                id="property-qr-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleQrCodeSelected}
                disabled={isUploadingQr}
              />
              {upiQrCodeUrl ? (
                <div className="flex items-center gap-3">
                  <img
                    src={upiQrCodeUrl}
                    alt={t('upi_qr_code_alt', 'UPI QR Code')}
                    className="w-16 h-16 object-contain rounded-md border border-slate-200 dark:border-slate-700 bg-white p-1 shrink-0"
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingQr}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 cursor-pointer hover:underline w-fit disabled:opacity-50"
                    >
                      {isUploadingQr ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {isUploadingQr ? t('uploading_label', 'Uploading...') : t('replace_qr_code_button', 'Replace QR Code')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setUpiQrCodeUrl('')}
                      disabled={isUploadingQr}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:underline w-fit disabled:opacity-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t('remove_qr_code_button', 'Remove')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingQr}
                  className="inline-flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400 border border-dashed border-blue-300 dark:border-blue-800 rounded-lg px-3 py-2 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/30 w-fit disabled:opacity-50"
                >
                  {isUploadingQr ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {isUploadingQr ? t('uploading_label', 'Uploading...') : t('upload_qr_code_button', 'Upload QR Code')}
                </button>
              )}
              <p className="property-edit-form__field-help text-xs text-slate-400 dark:text-slate-500 mt-1">
                {t('upi_qr_code_help_text', "Optional - upload your bank/PhonePe/GPay QR code image to show it as-is at billing and checkout, instead of an auto-generated one.")}
              </p>
              {qrUploadError && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">{qrUploadError}</p>
              )}
            </div>
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
            helperText={t('walk_in_table_count_help', "How many numbered tables (Table 1..N) the Kitchen walk-in order picker offers.")}
          />
        </div>
      )}

      {!isRoom && (
        <div className="property-edit-form__row grid grid-cols-2 gap-4">
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

      <div className="property-edit-form__row grid grid-cols-2 gap-4">
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
      {property.property_type !== 'MULTI_KEY' && (
        <div className="property-edit-form__row grid grid-cols-2 gap-4">
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
        <p className="property-edit-form__field-help text-xs text-slate-400 dark:text-slate-500 mt-1">{t('other_notes_help', 'Supports WhatsApp formatting: *bold*, _italic_, ~strikethrough~, bullet lists, quotes, code.')}</p>
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
