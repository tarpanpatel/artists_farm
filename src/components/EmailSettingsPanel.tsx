import React, { useState, useEffect } from 'react';
import { Card } from 'flowbite-react';
import { Mail, Send, Loader2, CheckCircle2, XCircle, MessageCircle } from './icons/FlowbiteIcons';
import { StyledSelect } from './StyledSelect';
import { Button } from './Button';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { TENANT_WELCOME_VARIABLES, DEFAULT_TENANT_WELCOME_TEMPLATE, renderTenantWelcomeTemplate } from '../utils/tenantWelcomeTemplate';
import {
  DEFAULT_WHATSAPP_VOUCHER_TEMPLATE,
  VOUCHER_TOKENS,
  renderWhatsappVoucherTemplate,
} from '../utils/whatsappVoucherTemplate';
import { t } from '../i18n/en';

/**
 * Root Admin panel: SMTP connection details (used to send tenant welcome
 * emails - see php/utils/mailer.php) plus the editable welcome message
 * template shared by both the email and the "Share via WhatsApp" button on
 * the Add Tenant flow. Settings live in the generic `system_settings`
 * key/value store (php/api/configuration.php), same place Appearance/Custom
 * CSS already persist to.
 */
interface EmailSettingsPanelProps {
  onLogout: () => void;
}

export const EmailSettingsPanel: React.FC<EmailSettingsPanelProps> = ({ onLogout }) => {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [smtpUsername, setSmtpUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fromName, setFromName] = useState('Ground Code');
  const [fromEmail, setFromEmail] = useState('');
  const [encryption, setEncryption] = useState<'tls' | 'ssl' | 'none'>('tls');
  const [template, setTemplate] = useState('');
  const [voucherTemplate, setVoucherTemplate] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const [testEmail, setTestEmail] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/php/api/router.php?action=get_system_settings', { credentials: 'include' });
        if (res.status === 401 || res.status === 403) {
          // Same fix as RootAdminDashboard.tsx's loadNavItems() (23 Aug 2026) -
          // an expired session must not leave this form silently sitting on
          // empty/default values that look like real (blank) settings, go
          // straight back to login instead.
          onLogout();
          return;
        }
        const json = await res.json();
        if (json.status === 'success' && json.data) {
          const d = json.data;
          setHost(d.smtp_host || '');
          setPort(d.smtp_port || '587');
          setSmtpUsername(d.smtp_username || '');
          setPassword(d.smtp_password || '');
          setFromName(d.smtp_from_name || 'Ground Code');
          setFromEmail(d.smtp_from_email || '');
          setEncryption((d.smtp_encryption as any) || 'tls');
          let welcomeTpl = d.tenant_welcome_template || '';
          if (welcomeTpl.includes('??')) {
            welcomeTpl = DEFAULT_TENANT_WELCOME_TEMPLATE;
          }
          setTemplate(welcomeTpl);
          setVoucherTemplate(d.default_whatsapp_voucher_template || '');
        }
      } catch (err) {
        console.error('Failed to load email settings:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const saveSetting = async (key: string, value: string) => {
    const res = await fetch('/php/api/router.php?action=save_system_settings', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setting_key: key, setting_value: value }),
    });
    const json = await res.json();
    return json.status === 'success';
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      const results = await Promise.all([
        saveSetting('smtp_host', host),
        saveSetting('smtp_port', port),
        saveSetting('smtp_username', smtpUsername),
        saveSetting('smtp_password', password),
        saveSetting('smtp_from_name', fromName),
        saveSetting('smtp_from_email', fromEmail),
        saveSetting('smtp_encryption', encryption),
        saveSetting('tenant_welcome_template', template),
        saveSetting('default_whatsapp_voucher_template', voucherTemplate),
      ]);
      setSaveStatus(results.every(Boolean) ? 'success' : 'error');
    } catch (err) {
      console.error('Failed to save email settings:', err);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveStatus('idle'), 4000);
    }
  };

  const handleSendTest = async () => {
    if (!testEmail) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/php/api/router.php?action=send_test_email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testEmail,
          smtp_host: host,
          smtp_port: port,
          smtp_username: smtpUsername,
          smtp_password: password,
          smtp_from_name: fromName,
          smtp_from_email: fromEmail,
          smtp_encryption: encryption,
        }),
      });
      const json = await res.json();
      setTestResult({ success: !!json.success, message: json.message || (json.success ? 'Sent!' : 'Failed to send') });
    } catch (err) {
      setTestResult({ success: false, message: 'Failed to reach the server' });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-slate-400 text-sm">{t('loading_email_settings_label', 'Loading email settings...')}</div>;
  }

  return (
    <div className="space-y-4">
      {/* SMTP Connection */}
      <Card className="border-gray-200 dark:border-gray-700">
        <h3 className="email-settings-panel__subtitle text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
          <Mail className="w-5 h-5 text-indigo-500" /> {t('smtp_connection_heading', 'SMTP Connection')}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          {t('smtp_connection_description', 'Used to send the tenant welcome email (login link, username, temporary passcode) when a new tenant is created.')}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <Input
              label={t('smtp_host_label', 'SMTP Host')}
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder={t('smtp_host_placeholder', 'smtp.example.com')}
            />
          </div>
          <div>
            <Input
              label={t('port_label', 'Port')}
              type="text"
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
              placeholder={t('port_placeholder')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <Input
              label={t('smtp_username_label', 'SMTP Username')}
              type="text"
              value={smtpUsername}
              onChange={(e) => setSmtpUsername(e.target.value)}
              placeholder={t('smtp_username_placeholder', 'you@example.com')}
            />
          </div>
          <div>
            <Input
              label={t('smtp_password_label', 'SMTP Password')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('password_dots_placeholder')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <Input
              label={t('from_name_label', 'From Name')}
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              className="email-settings-panel__input"
            />
          </div>
          <div>
            <Input
              label={t('from_email_label', 'From Email')}
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder={t('from_email_placeholder', 'noreply@example.com')}
              className="email-settings-panel__input"
            />
          </div>
          <div>
            <StyledSelect
              label={t('encryption_label', 'Encryption')}
              value={encryption}
              onChange={(val) => setEncryption(val as any)}
              options={[
                { value: 'tls', label: t('tls_option', 'STARTTLS (port 587)') },
                { value: 'ssl', label: t('ssl_option', 'Implicit TLS/SSL (port 465)') },
                { value: 'none', label: t('none_option', 'None') },
              ]}
              className="email-settings-panel__select"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-100 dark:border-gray-700 email-settings-panel__actions">
          <Button
            variant="primary"
            size="md"
            onClick={handleSave}
            disabled={isSaving}
            className="email-settings-panel__save-btn"
          >
            {isSaving ? t('saving_ellipsis_button', 'Saving...') : t('save_settings_button', 'Save Settings')}
          </Button>
          {saveStatus === 'success' && (
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 email-settings-panel__status email-settings-panel__status--success">
              <CheckCircle2 className="w-3.5 h-3.5" /> {t('saved_badge')}
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1 email-settings-panel__status email-settings-panel__status--error">
              <XCircle className="w-3.5 h-3.5" /> {t('failed_to_save_text')}
            </span>
          )}

          <div className="flex items-center gap-2 ml-auto email-settings-panel__test-email-wrapper">
            <div className="w-56">
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder={t('test_email_placeholder', 'test@example.com')}
                className="email-settings-panel__test-input"
              />
            </div>
            <Button
              variant="secondary"
              size="md"
              onClick={handleSendTest}
              disabled={isTesting || !testEmail}
              leftIcon={isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              className="email-settings-panel__test-btn"
            >
              {t('send_test_email_button', 'Send Test Email')}
            </Button>
          </div>
        </div>
        {testResult && (
          <p className={`text-xs font-semibold mt-2 ${testResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'} email-settings-panel__test-result`}>
            {testResult.message}
          </p>
        )}
      </Card>

      {/* Welcome Template */}
      <Card className="border-gray-200 dark:border-gray-700 email-settings-panel__section email-settings-panel__section--welcome">
        <div className="flex items-center justify-between mb-1.5 email-settings-panel__welcome-header">
          <h3 className="text-base font-bold text-gray-900 dark:text-white email-settings-panel__section-title">{t('tenant_welcome_message_heading', 'Tenant Welcome Message')}</h3>
          <button
            type="button"
            onClick={() => setTemplate(DEFAULT_TENANT_WELCOME_TEMPLATE)}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer font-semibold"
          >
            {t('reset_to_default_button', 'Reset to default')}
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {t('tenant_welcome_message_description', 'Sent as the welcome email and used to build the "Share via WhatsApp" message when a new tenant is created.')}
        </p>

        <Textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          placeholder={DEFAULT_TENANT_WELCOME_TEMPLATE}
          rows={10}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const token = e.dataTransfer.getData('text/plain');
            if (token) setTemplate((prev) => (prev || DEFAULT_TENANT_WELCOME_TEMPLATE) + ' ' + token);
          }}
          className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-2">
          {t('template_helper_text', 'Click a variable to insert it, or drag and drop into text:')}
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {TENANT_WELCOME_VARIABLES.map((v) => (
            <span
              key={v.token}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', v.token);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => setTemplate((prev) => (prev || DEFAULT_TENANT_WELCOME_TEMPLATE) + ' ' + v.token)}
              title={v.label}
              className="text-xs font-mono px-2 py-1 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 cursor-grab active:cursor-grabbing border border-indigo-200 dark:border-indigo-800 select-none transition-colors"
            >
              + {v.token}
            </span>
          ))}
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 dark:text-gray-400 font-semibold">{t('preview_sample_data_label', 'Preview with sample data')}</summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-700 dark:text-gray-300">
            {renderTenantWelcomeTemplate(template || DEFAULT_TENANT_WELCOME_TEMPLATE, {
              tenant_name: 'Vrikshawan',
              login_url: 'https://example.com/artists_farm/',
              username: '9876543210',
              temp_passcode: '482913',
            })}
          </pre>
        </details>
      </Card>

      {/* Guest Booking Confirmation Voucher Template (Root Global Default) */}
      <Card className="border-gray-200 dark:border-gray-700 email-settings-panel__section">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-emerald-500" />
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              {t('default_voucher_template_heading', 'Guest Booking Confirmation Voucher Template')}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setVoucherTemplate(DEFAULT_WHATSAPP_VOUCHER_TEMPLATE)}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer font-semibold"
          >
            {t('reset_to_default_button', 'Reset to default')}
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {t('default_voucher_template_description', 'Global default booking confirmation voucher sent to guests across all properties. Property managers can customize their own wording or reset back to this default version at any time.')}
        </p>

        <Textarea
          value={voucherTemplate}
          onChange={(e) => setVoucherTemplate(e.target.value)}
          placeholder={DEFAULT_WHATSAPP_VOUCHER_TEMPLATE}
          rows={14}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const token = e.dataTransfer.getData('text/plain');
            if (token) setVoucherTemplate((prev) => (prev || DEFAULT_WHATSAPP_VOUCHER_TEMPLATE) + ' ' + token);
          }}
          className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-2">
          {t('voucher_tokens_drag_hint', 'Click to insert or drag and drop tokens into the message:')}
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {VOUCHER_TOKENS.map((tok) => (
            <span
              key={tok}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', tok);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => setVoucherTemplate((prev) => (prev || DEFAULT_WHATSAPP_VOUCHER_TEMPLATE) + ' ' + tok)}
              className="text-xs font-mono px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 cursor-grab active:cursor-grabbing border border-emerald-200 dark:border-emerald-800 transition-colors select-none"
            >
              + {tok}
            </span>
          ))}
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 dark:text-gray-400 font-semibold">{t('preview_sample_data_label', 'Preview with sample data')}</summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-700 dark:text-gray-300">
            {renderWhatsappVoucherTemplate(voucherTemplate || DEFAULT_WHATSAPP_VOUCHER_TEMPLATE, {
              booking_id: '1042',
              guest_name: 'Tarpan Patel',
              guest_phone: '98765 43210',
              room_name: 'Room 101',
              checkin_date: '08/08/2026',
              checkin_time: '14:00',
              checkout_date: '11/08/2026',
              checkout_time: '11:00',
              nights: '3',
              guest_count: '5',
              guest_breakdown: '3 adults, 2 children',
              room_tariff: '4,500.00',
              advance_paid: '2,000.00',
              payments_list: '₹1,000 on 15/07/2026 (UPI), ₹1,000 on 25/07/2026 (Cash)',
              balance_due: '2,500.00',
              security_deposit: '',
              address: 'Jaipur, Rajasthan, India',
              contact_phone: '98765 43210',
              maps_link: 'https://maps.google.com/?q=26.9124,75.7873',
              upi_id: 'hotel@upi',
              upi_qr_code_url: '',
              other_notes: 'Quiet hours start at 10 PM. Swimming pool accessible from 7 AM to 8 PM.',
              wifi_network: 'GroundCode_Guest',
              wifi_password: 'welcome_guest',
              house_manual: 'https://ground-code.com/manual/jaipur',
              voucher_link: 'https://ground-code.com/voucher/demo',
              property_name: 'Patel Colony Resort',
            })}
          </pre>
        </details>

        <div className="pt-3 mt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <Button
            variant="primary"
            size="md"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? t('saving_ellipsis_button', 'Saving...') : t('save_settings_button', 'Save Settings')}
          </Button>
          {saveStatus === 'success' && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Settings saved successfully
            </span>
          )}
        </div>
      </Card>
    </div>
  );
};

