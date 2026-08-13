import React, { useState, useEffect } from 'react';
import { Mail, Send, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { StyledSelect } from './StyledSelect';
import { Button } from './Button';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { TENANT_WELCOME_VARIABLES, DEFAULT_TENANT_WELCOME_TEMPLATE, renderTenantWelcomeTemplate } from '../utils/tenantWelcomeTemplate';
import { t } from '../i18n/en';

/**
 * Root Admin panel: SMTP connection details (used to send tenant welcome
 * emails - see php/utils/mailer.php) plus the editable welcome message
 * template shared by both the email and the "Share via WhatsApp" button on
 * the Add Tenant flow. Settings live in the generic `system_settings`
 * key/value store (php/api/configuration.php), same place Appearance/Custom
 * CSS already persist to.
 */
export const EmailSettingsPanel: React.FC = () => {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [smtpUsername, setSmtpUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fromName, setFromName] = useState('Ground Code');
  const [fromEmail, setFromEmail] = useState('');
  const [encryption, setEncryption] = useState<'tls' | 'ssl' | 'none'>('tls');
  const [template, setTemplate] = useState('');

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
          setTemplate(d.tenant_welcome_template || '');
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
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
          <Mail className="w-4 h-4 text-indigo-500" /> {t('smtp_connection_heading', 'SMTP Connection')}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          {t('smtp_connection_description', 'Used to send the tenant welcome email (login link, username, temporary passcode) when a new tenant is created.')}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('smtp_host_label', 'SMTP Host')}</label>
            <Input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder={t('smtp_host_placeholder', 'smtp.example.com')}
            />
          </div>
          <div>
            <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('port_label', 'Port')}</label>
            <Input
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
            <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('smtp_username_label', 'SMTP Username')}</label>
            <Input
              type="text"
              value={smtpUsername}
              onChange={(e) => setSmtpUsername(e.target.value)}
              placeholder={t('smtp_username_placeholder', 'you@example.com')}
            />
          </div>
          <div>
            <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('smtp_password_label', 'SMTP Password')}</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('password_dots_placeholder')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5 email-settings-panel__label">{t('from_name_label', 'From Name')}</label>
            <Input
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              className="email-settings-panel__input"
            />
          </div>
          <div>
            <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5 email-settings-panel__label">{t('from_email_label', 'From Email')}</label>
            <Input
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder={t('from_email_placeholder', 'noreply@example.com')}
              className="email-settings-panel__input"
            />
          </div>
          <div>
            <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5 email-settings-panel__label">{t('encryption_label', 'Encryption')}</label>
            <StyledSelect
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

        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-700 email-settings-panel__actions">
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
      </div>

      {/* Welcome Template */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 email-settings-panel__section email-settings-panel__section--welcome">
        <div className="flex items-center justify-between mb-1.5 email-settings-panel__welcome-header">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white email-settings-panel__section-title">{t('tenant_welcome_message_heading', 'Tenant Welcome Message')}</h3>
          <button
            type="button"
            onClick={() => setTemplate('')}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
          >
            {t('reset_to_default_button', 'Reset to default')}
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          {t('tenant_welcome_message_description', 'Sent as the welcome email and used to build the "Share via WhatsApp" message when a new tenant is created.')}
        </p>

        <Textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          placeholder={DEFAULT_TENANT_WELCOME_TEMPLATE}
          rows={10}
          className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 mb-2">
          {t('template_helper_text', 'Blank = use the default shown above as a placeholder. Click a variable to insert it:')}
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {TENANT_WELCOME_VARIABLES.map((v) => (
            <button
              key={v.token}
              type="button"
              onClick={() => setTemplate((prev) => (prev || DEFAULT_TENANT_WELCOME_TEMPLATE) + v.token)}
              title={v.label}
              className="text-[10px] font-mono px-2 py-1 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 cursor-pointer"
            >
              + {v.token}
            </button>
          ))}
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-slate-500 dark:text-slate-400 font-semibold">{t('preview_sample_data_label', 'Preview with sample data')}</summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-slate-700 dark:text-slate-300">
            {renderTenantWelcomeTemplate(template || DEFAULT_TENANT_WELCOME_TEMPLATE, {
              tenant_name: 'Vrikshawan',
              login_url: 'https://example.com/artists_farm/',
              username: '9876543210',
              temp_passcode: '482913',
            })}
          </pre>
        </details>

        <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-700">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors cursor-pointer"
          >
            {isSaving ? t('saving_ellipsis_button', 'Saving...') : t('save_settings_button', 'Save Settings')}
          </button>
        </div>
      </div>
    </div>
  );
};

