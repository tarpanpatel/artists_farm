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
 * editor + its live preview (moved here 25 Aug 2026 from Edit Property), then
 * removed 26 Aug 2026 (explicit request: "dont let there be facility of
 * whatsapp message customisation... move this at Edit Property page so user can
 * see directly whats his message will look like, as the message anyway pulls
 * data from edit property details"). The preview moved to PropertyEditForm.tsx,
 * next to the actual fields (phone/address/UPI/instructions) it reads from -
 * it was never really a "messaging" setting, just a readout of property details
 * sitting on the wrong page.
 *
 * CORRECTED 12 Sep 2026 - this docblock used to end by saying the wording was
 * "now a single fixed template for every property, with no per-property override
 * possible any more". That stopped being true on 7 Sep 2026, five days before
 * anyone noticed, and it was quoted as current in the meantime. Editable voucher
 * wording came back that day as a four-level inheritance chain, with the
 * per-property override living on PropertyEditForm.tsx (`voucherTemplate` state,
 * saved as `whatsapp_voucher_template`):
 *
 *   properties.whatsapp_voucher_template   - this one property (Edit Property)
 *   -> tenants.whatsapp_voucher_template   - the account default (Root Admin)
 *   -> system_whatsapp_voucher_template    - the platform default (Root Dashboard)
 *   -> DEFAULT_WHATSAPP_VOUCHER_TEMPLATE   - shipped in whatsappVoucherTemplate.ts
 *
 * An empty override means "inherit" and is deliberately NOT the same as an
 * override whose text happens to equal what it would have inherited - see
 * PropertyEditForm.tsx:106. This chain is for the wa.me SHARE text a staff
 * member sends by hand, which is freely editable; it has nothing to do with the
 * Meta-approved WhatsApp API templates, where only the {{1}}/{{2}} variable
 * VALUES are ours and every word is fixed until Meta re-approves a change (see
 * CLAUDE.md, "WhatsApp Business API - Every Message Must Carry an Action Link").
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
