import React, { useState } from 'react';
import { Card, Alert, Checkbox } from 'flowbite-react';
import { Loader2, CheckCircle2, AlertCircle } from './icons/FlowbiteIcons';
import { t } from '../i18n/en';
import { Button } from './Button';
import { useToast } from './ToastContext';

/**
 * The Telegram template-customization permission toggle - whether THIS
 * property's own Admin/Super Admin may edit the shared Telegram template
 * wording (and, since 26 Aug 2026, its per-template group routing too - see
 * TelegramNotificationModal.tsx's canManageRouting) themselves, or only view
 * Root Admin's platform-wide versions.
 *
 * Used to also hold the guest-facing WhatsApp booking-confirmation template
 * editor + its live preview (moved here 25 Aug 2026 from Edit Property).
 * Removed entirely 26 Aug 2026 (explicit request: "dont let there be
 * facility of whatsapp message customisation... move this at Edit Property
 * page so user can see directly whats his message will look like, as the
 * message anyway pulls data from edit property details") - the message is
 * now a single fixed template (DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, see
 * utils/whatsappVoucherTemplate.ts) for every property, with no per-property
 * override possible any more. The live, accurate preview of that fixed
 * message now lives on PropertyEditForm.tsx instead, right next to the
 * actual fields (phone/address/UPI/instructions/etc.) it pulls from - since
 * it was never really a "messaging" setting, just a readout of property
 * details that happened to live on the wrong page.
 */
interface WhatsAppTemplateSettingsProps {
  property: {
    id: number;
    telegram_template_customization_enabled?: number | boolean;
  };
  onSaved?: () => void;
}

export const WhatsAppTemplateSettings: React.FC<WhatsAppTemplateSettingsProps> = ({ property, onSaved }) => {
  const { showToast } = useToast();
  const [telegramCustomization, setTelegramCustomization] = useState(
    !!property.telegram_template_customization_enabled
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
          id: property.id,
          telegram_template_customization_enabled: telegramCustomization ? 1 : 0,
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setSuccess(true);
        showToast('Settings saved successfully!', { type: 'success' });
        if (onSaved) onSaved();
      } else {
        const msg = data.message || 'Failed to save template';
        setError(msg);
        showToast(msg, { type: 'error' });
      }
    } catch (err: any) {
      const msg = err?.message || 'Error saving template';
      setError(msg);
      showToast(msg, { type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-gray-200 dark:border-gray-700 space-y-4 whatsapp-template-settings">
      <div>
        <h2 className="whatsapp-template-settings__heading text-base font-semibold text-slate-900 dark:text-white">
          {t('telegram_template_permissions_heading', 'Telegram Template Permissions')}
        </h2>
        <p className="whatsapp-template-settings__subtitle text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {t('telegram_template_permissions_subtitle', "Control whether this property's own Admin/Super Admin can edit Telegram message wording and routing, or only view Root Admin's shared versions.")}
        </p>
      </div>

      {error && (
        <Alert color="failure" icon={AlertCircle}>
          <span>{error}</span>
        </Alert>
      )}
      {success && (
        <Alert color="success" icon={CheckCircle2}>
          <span>{t('whatsapp_template_saved_message', 'Settings saved')}</span>
        </Alert>
      )}

      <Checkbox
        checked={telegramCustomization}
        onChange={(e) => setTelegramCustomization(e.target.checked)}
      />{" "}
      <span className="whatsapp-template-settings__telegram-label block text-sm font-semibold text-slate-700 dark:text-slate-300">
        {t('allow_telegram_template_customization_label', 'Enable Telegram Template Customization')}
      </span>

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
    </Card>
  );
};
