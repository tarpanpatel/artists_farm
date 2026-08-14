import React, { useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { t } from '../i18n/en';
import { Button } from './Button';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { WhatsAppEditor } from './WhatsAppEditor';

/**
 * Shared "Edit Property" form. Renders every editable property field (name,
 * email, phone, GSTIN, address, Google Maps link, instructions, WhatsApp
 * voucher template, Telegram toggle) and saves via `update_property`.
 */
interface PropertyEditFormProps {
  property: {
    id: number;
    name?: string;
    email?: string;
    phone?: string;
    gstin?: string;
    address?: string;
    google_maps_link?: string;
    instructions?: string;
    whatsapp_voucher_template?: string;
    telegram_template_customization_enabled?: number | boolean;
    property_type?: string;
    default_tariff?: number | null;
  };
  onCancel?: () => void;
  onSaved?: () => void;
  cancelLabel?: string;
  submitLabel?: string;
}

export const PropertyEditForm: React.FC<PropertyEditFormProps> = ({
  property,
  onCancel,
  onSaved,
  cancelLabel,
  submitLabel,
}) => {
  const [name, setName] = useState(property.name || '');
  const [email, setEmail] = useState(property.email || '');
  const [phone, setPhone] = useState(property.phone || '');
  const [gstin, setGstin] = useState(property.gstin || '');
  const [address, setAddress] = useState(property.address || '');
  const [mapsLink, setMapsLink] = useState(property.google_maps_link || '');
  const [instructions, setInstructions] = useState(property.instructions || '');
  const [checkinTime, setCheckinTime] = useState((property as any).checkin_time || '14:00');
  const [checkoutTime, setCheckoutTime] = useState((property as any).checkout_time || '11:00');
  // Only meaningful for SINGLE properties - a MULTI_KEY parent isn't itself
  // bookable, each of its rooms has its own tariff (set in RoomsManagement.tsx).
  const [defaultTariff, setDefaultTariff] = useState(
    property.default_tariff != null ? String(property.default_tariff) : ''
  );
  const [whatsappTemplate, setWhatsappTemplate] = useState(property.whatsapp_voucher_template || '');
  const [telegramCustomization, setTelegramCustomization] = useState(
    !!property.telegram_template_customization_enabled
  );
  const [previewTab, setPreviewTab] = useState<'whatsapp' | 'email'>('whatsapp');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const sampleGuest = {
    guest_name: 'Tarpan Patel',
    room_number: 'Room 101',
    checkin_date: '08 Aug 2026',
    checkout_date: '11 Aug 2026',
    checkin_time: '14:00',
    checkout_time: '11:00',
    total_amount: '₹4,500',
    booking_id: 'BK-7892',
  };

  const defaultTemplate = `Hello {guest_name}! 👋

Thank you for booking with *{property_name}*! Your reservation is confirmed.

📋 *Booking Details:*
• Booking ID: {booking_id}
• Room: {room_number}
• Check-in: {checkin_date} from {checkin_time}
• Check-out: {checkout_date} until {checkout_time}
• Total Amount: {total_amount}

📍 *Address:* {property_address}
📞 *Contact:* {property_phone}
🗺️ *Google Maps:* {google_maps_link}

📝 *Important Notes:*
{instructions}

We look forward to welcoming you!`;

  const getInterpolatedText = () => {
    const raw = whatsappTemplate.trim() || defaultTemplate;
    return raw
      .replace(/\{property_name\}/g, name.trim() || '[Property Name]')
      .replace(/\{property_email\}|\{email\}/g, email.trim() || '[Property Email]')
      .replace(/\{property_phone\}|\{phone\}/g, phone.trim() || '[Property Phone]')
      .replace(/\{property_address\}|\{address\}/g, address.trim() || '[Property Address]')
      .replace(/\{google_maps_link\}|\{maps_link\}/g, mapsLink.trim() || '[Maps Link]')
      .replace(/\{instructions\}|\{other_notes\}/g, instructions.trim() || '[No additional notes]')
      .replace(/\{gstin\}/g, gstin.trim() || '[GSTIN]')
      .replace(/\{guest_name\}/g, sampleGuest.guest_name)
      .replace(/\{room_number\}/g, sampleGuest.room_number)
      .replace(/\{checkin_date\}/g, sampleGuest.checkin_date)
      .replace(/\{checkout_date\}/g, sampleGuest.checkout_date)
      .replace(/\{checkin_time\}/g, sampleGuest.checkin_time)
      .replace(/\{checkout_time\}/g, sampleGuest.checkout_time)
      .replace(/\{total_amount\}/g, sampleGuest.total_amount)
      .replace(/\{booking_id\}/g, sampleGuest.booking_id);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setError(null);
    setSuccess(false);
    setIsSaving(true);
    try {
      const res = await fetch('/php/api/router.php?action=update_property', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: property.id,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          gstin: gstin.trim().toUpperCase(),
          address: address.trim(),
          google_maps_link: mapsLink.trim(),
          instructions,
          checkin_time: checkinTime,
          checkout_time: checkoutTime,
          default_tariff: defaultTariff,
          whatsapp_voucher_template: whatsappTemplate,
          telegram_template_customization_enabled: telegramCustomization,
        }),
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
        <div className="property-edit-form__error flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="property-edit-form__success flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {t('property_updated_success_message', 'Property details saved')}
        </div>
      )}

      <div className="property-edit-form__field">
        <Input
          label={t('tenant_property_name_label', 'Property Name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

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
            type="text"
            label={t('tenant_contact_phone_label', 'Contact Phone')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t('contact_phone_placeholder', '99999 99999')}
          />
        </div>
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

      <div className="property-edit-form__field">
        <Input
          type="text"
          label={t('address_label', 'Address')}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={t('full_property_address_placeholder', 'Full property address')}
        />
      </div>

      <div className="property-edit-form__row grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="property-edit-form__field">
          <Input
            type="time"
            label={t('checkin_time_label', 'Check-in Time')}
            value={checkinTime}
            onChange={(e) => setCheckinTime(e.target.value)}
            helperText={t('checkin_time_help', 'Applied to all rooms under this property.')}
          />
        </div>
        <div className="property-edit-form__field">
          <Input
            type="time"
            label={t('checkout_time_label', 'Check-out Time')}
            value={checkoutTime}
            onChange={(e) => setCheckoutTime(e.target.value)}
            helperText={t('checkout_time_help', 'Applied to all rooms under this property.')}
          />
        </div>
      </div>

      {/* Multi-key parent properties aren't themselves bookable - each room has
          its own tariff, set in RoomsManagement.tsx instead. */}
      {property.property_type !== 'MULTI_KEY' && (
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

      <div className="property-edit-form__field">
        <Input
          type="text"
          label={t('google_maps_link_label', 'Google Maps Link')}
          value={mapsLink}
          onChange={(e) => setMapsLink(e.target.value)}
          placeholder={t('google_maps_link_placeholder', 'https://maps.app.goo.gl/...')}
        />
      </div>

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

      <label className="property-edit-form__telegram-toggle flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={telegramCustomization}
          onChange={(e) => setTelegramCustomization(e.target.checked)}
          className="property-edit-form__telegram-checkbox w-4 h-4 mt-0.5 rounded accent-indigo-600 cursor-pointer"
        />
        <span className="property-edit-form__telegram-label block text-sm font-semibold text-slate-700 dark:text-slate-300">{t('allow_telegram_template_customization_label', 'Enable Telegram Template Customization')}</span>
      </label>

      <div className="property-edit-form__whatsapp-section pt-2 border-t border-slate-100 dark:border-slate-800 space-y-4">
        <div>
          <p className="property-edit-form__section-heading text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">{t('whatsapp_booking_confirmation_heading', 'WhatsApp Booking Confirmation')}</p>
          <p className="property-edit-form__section-help text-xs text-slate-400 dark:text-slate-500 mb-3">{t('whatsapp_share_help_text', 'Included in the "Share via WhatsApp" message on the booking voucher. Left blank, the built-in default template is used.')}</p>
          
          {/* Quick variable insert buttons */}
          <div className="property-edit-form__tag-row mb-2 flex flex-wrap items-center gap-1.5">
            <span className="property-edit-form__tag-hint text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">Insert Tag:</span>
             {['{guest_name}', '{property_name}', '{room_number}', '{checkin_date}', '{checkout_date}', '{checkin_time}', '{checkout_time}', '{google_maps_link}', '{property_phone}', '{total_amount}'].map((tag) => (
               <Button key={tag} variant="secondary" size="xs" className="px-2 py-0.5 font-mono border dark:border-slate-700 rounded-md" type="button" onClick={() => setWhatsappTemplate((prev) => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + tag)}>
                 + {tag}
               </Button>
             ))}
          </div>

          <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('whatsapp_voucher_template_label', 'WhatsApp Voucher Template')}</label>
          <Textarea
            value={whatsappTemplate}
            onChange={(e) => setWhatsappTemplate(e.target.value)}
            placeholder={t('whatsapp_voucher_template_placeholder', 'e.g. Welcome to {property_name}! Your booking is confirmed…')}
            rows={4}
            className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
          />
        </div>

        {/* Live Guest Message Preview Box */}
        <div className="mt-4 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                💬
              </span>
              <div>
                <h4 className="property-edit-form__caption text-[10px] font-semibold text-slate-900 dark:text-white uppercase tracking-wider">Live Guest Notification Preview</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Updates live as you edit property details & template</p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-slate-200/60 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setPreviewTab('whatsapp')}
                className={`px-2.5 py-1 rounded-md transition font-medium ${
                  previewTab === 'whatsapp' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('email')}
                className={`px-2.5 py-1 rounded-md transition font-medium ${
                  previewTab === 'email' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                Email
              </button>
            </div>
          </div>

          {previewTab === 'whatsapp' ? (
            <div className="bg-[#e5ddd5] dark:bg-[#111b21] p-3 rounded-xl max-w-md mx-auto shadow-inner border border-slate-300/40 dark:border-slate-800">
              <div className="bg-white dark:bg-[#202c33] p-3 rounded-lg shadow-xs text-xs text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed border-l-4 border-emerald-500">
                {getInterpolatedText()}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xs">
              <div className="bg-indigo-600 p-3 text-white">
                <p className="text-[10px] uppercase tracking-wider text-indigo-200">Guest Booking Confirmation</p>
                <h3 className="property-edit-form__subtitle text-sm font-semibold mt-0.5">{name.trim() || 'Property Name'}</h3>
                <p className="text-xs text-indigo-100 mt-1">{email.trim() || 'contact@property.com'} · {phone.trim() || '+91 99999 99999'}</p>
              </div>
              <div className="p-4 text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                {getInterpolatedText()}
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/80 px-4 py-2.5 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>To: Tarpan Patel</span>
                <span>Sent via Guest Voucher System</span>
              </div>
            </div>
          )}
        </div>
      </div>

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
