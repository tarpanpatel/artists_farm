import React, { useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { t } from '../i18n/en';
import { Button } from './Button';
import { Input } from './Input';
import { WhatsAppEditor } from './WhatsAppEditor';

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
  const [name, setName] = useState(property.name || '');
  const [email, setEmail] = useState(property.email || '');
  const [phone, setPhone] = useState(property.phone || '');
  const [gstin, setGstin] = useState(property.gstin || '');
  const [upiId, setUpiId] = useState(property.upi_id || '');
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

      <div className="property-edit-form__field">
        <Input
          label={isRoom ? t('room_name_label', 'Room Name') : t('tenant_property_name_label', 'Property Name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {!isRoom && (
        <div className="property-edit-form__row grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="property-edit-form__field">
            <Input
              type="email"
              label={t('email_label', 'Email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('email_placeholder', 'info@example.com')}
            />
          </div>
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
        </div>
      )}

      {!isRoom && (
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
      )}

      {!isRoom && (
        <div className="property-edit-form__field">
          <Input
            type="text"
            label={t('upi_id_optional_label', 'UPI ID (optional)')}
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            placeholder="yourproperty@okicici"
            helperText={t('upi_id_help_text', 'A scannable UPI QR code and this ID are added to booking confirmation and bill messages shared over WhatsApp.')}
          />
        </div>
      )}

      {!isRoom && (
        <div className="property-edit-form__field">
          <Input
            type="text"
            label={t('address_label', 'Address')}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t('full_property_address_placeholder', 'Full property address')}
          />
        </div>
      )}

      <div className="property-edit-form__row grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <div className="property-edit-form__field">
          <Input
            type="number"
            label={t('default_tariff_label', 'Default Tariff / Night (â‚¹, optional)')}
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
            type="text"
            label={t('google_maps_link_label', 'Google Maps Link')}
            value={mapsLink}
            onChange={(e) => setMapsLink(e.target.value)}
            placeholder={t('google_maps_link_placeholder', 'https://maps.app.goo.gl/...')}
          />
        </div>
      )}

      {!isRoom && (
      <div className="property-edit-form__field">
        <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('other_notes_label', 'Other Notes')}</label>
        <WhatsAppEditor
          value={instructions}
          onChange={setInstructions}
          placeholder={t('other_notes_placeholder', 'e.g. How to reach, check-in instructions, parking notesâ€¦')}
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
