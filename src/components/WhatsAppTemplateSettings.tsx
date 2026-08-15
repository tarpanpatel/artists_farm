import React, { useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { t } from '../i18n/en';
import { Button } from './Button';
import { Textarea } from './Textarea';

/**
 * Guest-facing WhatsApp booking-confirmation template + the Telegram
 * template-customization permission toggle. Moved off Edit Property (which
 * is now property-details-only) onto the Telegram/messaging settings tab,
 * since both are "how guests/staff get notified" settings, not property
 * details - see App.tsx's 'telegram' tab render.
 */
interface WhatsAppTemplateSettingsProps {
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
    whatsapp_voucher_template?: string;
    telegram_template_customization_enabled?: number | boolean;
  };
  onSaved?: () => void;
}

export const WhatsAppTemplateSettings: React.FC<WhatsAppTemplateSettingsProps> = ({ property, onSaved }) => {
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
      .replace(/\{property_name\}/g, property.name?.trim() || '[Property Name]')
      .replace(/\{property_email\}|\{email\}/g, property.email?.trim() || '[Property Email]')
      .replace(/\{property_phone\}|\{phone\}/g, property.phone?.trim() || '[Property Phone]')
      .replace(/\{property_address\}|\{address\}/g, property.address?.trim() || '[Property Address]')
      .replace(/\{google_maps_link\}|\{maps_link\}/g, property.google_maps_link?.trim() || '[Maps Link]')
      .replace(/\{instructions\}|\{other_notes\}/g, property.instructions?.trim() || '[No additional notes]')
      .replace(/\{gstin\}/g, property.gstin?.trim() || '[GSTIN]')
      .replace(/\{upi_id\}/g, property.upi_id?.trim() || '[UPI ID]')
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
          whatsapp_voucher_template: whatsappTemplate,
          telegram_template_customization_enabled: telegramCustomization,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        if (onSaved) onSaved();
      } else {
        setError(data.message || 'Failed to save WhatsApp template');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="whatsapp-template-settings bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 sm:p-6 space-y-4">
      <div>
        <h2 className="whatsapp-template-settings__heading text-base font-semibold text-slate-900 dark:text-white">
          {t('whatsapp_guest_messaging_heading', 'WhatsApp Guest Messaging')}
        </h2>
        <p className="whatsapp-template-settings__subtitle text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {t('whatsapp_guest_messaging_subtitle', 'Customize the booking-confirmation message shared with guests over WhatsApp.')}
        </p>
      </div>

      {error && (
        <div className="whatsapp-template-settings__error flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="whatsapp-template-settings__success flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {t('whatsapp_template_saved_message', 'WhatsApp template saved')}
        </div>
      )}

      <label className="whatsapp-template-settings__telegram-toggle flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={telegramCustomization}
          onChange={(e) => setTelegramCustomization(e.target.checked)}
          className="whatsapp-template-settings__telegram-checkbox w-4 h-4 mt-0.5 rounded accent-indigo-600 cursor-pointer"
        />
        <span className="whatsapp-template-settings__telegram-label block text-sm font-semibold text-slate-700 dark:text-slate-300">
          {t('allow_telegram_template_customization_label', 'Enable Telegram Template Customization')}
        </span>
      </label>

      <div className="whatsapp-template-settings__whatsapp-section pt-2 border-t border-slate-100 dark:border-slate-800 space-y-4">
        <div>
          <p className="whatsapp-template-settings__section-heading text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
            {t('whatsapp_booking_confirmation_heading', 'WhatsApp Booking Confirmation')}
          </p>
          <p className="whatsapp-template-settings__section-help text-xs text-slate-400 dark:text-slate-500 mb-3">
            {t('whatsapp_share_help_text', 'Included in the "Share via WhatsApp" message on the booking voucher. Left blank, the built-in default template is used.')}
          </p>

          <div className="whatsapp-template-settings__tag-row mb-2 flex flex-wrap items-center gap-1.5">
            <span className="whatsapp-template-settings__tag-hint text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">Insert Tag:</span>
            {['{guest_name}', '{property_name}', '{room_number}', '{checkin_date}', '{checkout_date}', '{checkin_time}', '{checkout_time}', '{google_maps_link}', '{property_phone}', '{total_amount}', '{upi_id}'].map((tag) => (
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

        <div className="mt-4 border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                💬
              </span>
              <div>
                <h4 className="whatsapp-template-settings__caption text-[10px] font-semibold text-slate-900 dark:text-white uppercase tracking-wider">Live Guest Notification Preview</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Updates live as you edit the template</p>
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
                <h3 className="whatsapp-template-settings__subtitle text-sm font-semibold mt-0.5">{property.name?.trim() || 'Property Name'}</h3>
                <p className="text-xs text-indigo-100 mt-1">{property.email?.trim() || 'contact@property.com'} · {property.phone?.trim() || '+91 99999 99999'}</p>
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
        <Button
          onClick={handleSave}
          variant="primary"
          disabled={isSaving}
          className="flex items-center gap-2"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          {t('save_changes_button', 'Save Changes')}
        </Button>
      </div>
    </div>
  );
};
