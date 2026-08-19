import React, { useState, useEffect } from 'react';
import { Card, Table, TableHead, TableBody, TableRow, TableCell } from 'flowbite-react';
import { ShieldCheck, RefreshCw, Save, Loader2, CheckCircle2, XCircle, HelpCircle, FolderCog } from 'lucide-react';
import { t } from '../i18n/en';
import { Input } from './Input';

interface TelegramPropertyStatus {
  propertyId: number;
  propertyName: string;
  propertySlug: string;
  botReachable: boolean | null;
  botUsername: string | null;
  error: string | null;
}

interface TelegramHealthEvent {
  timestamp: string | null;
  severity: string | null;
  msg: string | null;
}

interface TelegramHealthData {
  moduleLoaded: boolean;
  localFileExists: boolean;
  isStagingEnv: boolean;
  fallbackPathConfigured: string | null;
  fallbackPathIsDefault: boolean;
  fallbackFileExists: boolean | null;
  recentEvents: TelegramHealthEvent[];
  properties: TelegramPropertyStatus[];
}

const StatusRow: React.FC<{ ok: boolean | null; label: string; detail: string }> = ({ ok, label, detail }) => (
  <div
    className={`flex items-start gap-2.5 p-3 rounded-lg border ${
      ok === true
        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
        : ok === false
        ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
        : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700'
    }`}
  >
    {ok === true ? (
      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
    ) : ok === false ? (
      <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
    ) : (
      <HelpCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
    )}
    <div className="min-w-0">
      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{label}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{detail}</p>
    </div>
  </div>
);

export const TelegramHealthPanel: React.FC = () => {
  const [fallbackPath, setFallbackPath] = useState('');
  const [savedFallbackPath, setSavedFallbackPath] = useState('');
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [health, setHealth] = useState<TelegramHealthData | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch(`/php/api/router.php?action=get_system_settings`, { credentials: 'include' });
        const data = await res.json();
        if (data.status === 'success' && data.data?.telegram_fallback_source_path) {
          setFallbackPath(data.data.telegram_fallback_source_path);
          setSavedFallbackPath(data.data.telegram_fallback_source_path);
        }
      } catch (err) {
        console.error('Failed to load Telegram fallback path setting:', err);
      } finally {
        setLoadingSettings(false);
      }
    };
    loadSettings();
  }, []);

  const runHealthCheck = async () => {
    setChecking(true);
    try {
      const res = await fetch(`/php/api/router.php?action=check_telegram_health`, { credentials: 'include' });
      const data = await res.json();
      if (data.status === 'success') {
        setHealth(data.data);
        setCheckedAt(new Date().toLocaleTimeString());
        if (!fallbackPath && data.data.fallbackPathConfigured) {
          setFallbackPath(data.data.fallbackPathConfigured);
          setSavedFallbackPath(data.data.fallbackPathConfigured);
        }
      }
    } catch (err) {
      console.error('Telegram health check failed:', err);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    runHealthCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSavePath = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/php/api/router.php?action=save_system_settings`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setting_key: 'telegram_fallback_source_path',
          setting_value: fallbackPath.trim(),
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setSavedFallbackPath(fallbackPath.trim());
        setToast(t('telegram_fallback_path_saved', 'Fallback path saved successfully.'));
        setTimeout(() => setToast(null), 3000);
        runHealthCheck();
      }
    } catch (err) {
      console.error('Failed to save fallback path:', err);
    } finally {
      setSaving(false);
    }
  };

  const hasPathChanges = fallbackPath.trim() !== savedFallbackPath.trim();

  return (
    <Card className="border-gray-200 dark:border-gray-700 telegram-health-panel">
      <div className="pb-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            {t('telegram_platform_health_title', 'Telegram Platform Health')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
            {t(
              'telegram_platform_health_subtitle',
              "This server's malware scanner has quarantined php/telegram/telegram.php before - if it happens again, only the whitelisted copy at the path below can be trusted to still exist. Check status here before assuming a broken \"Save\" button on a property's Telegram Setup is a code bug."
            )}
          </p>
        </div>
        <button
          onClick={runHealthCheck}
          disabled={checking}
          className="px-3 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-xs font-semibold text-gray-700 dark:text-gray-200 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 disabled:opacity-60 shrink-0"
        >
          {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {t('run_health_check_button', 'Run Health Check')}
        </button>
      </div>

      <div className="space-y-5">
        <div>
          <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <FolderCog className="w-3.5 h-3.5" />
            {t('telegram_fallback_path_label', 'Whitelisted fallback file path (staging self-heal)')}
          </label>
          {loadingSettings ? (
            <p className="text-xs text-gray-400">{t('loading_message', 'Loading...')}</p>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={fallbackPath}
                onChange={(e) => setFallbackPath(e.target.value)}
                placeholder="/home/apartment/public_html/php/telegram/telegram.php"
                className="flex-1 font-mono text-xs"
              />
              <button
                onClick={handleSavePath}
                disabled={!hasPathChanges || saving}
                className={`px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 shrink-0 ${
                  hasPathChanges
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-gray-200 dark:bg-slate-700 text-gray-400 cursor-not-allowed'
                }`}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {t('save_button', 'Save')}
              </button>
            </div>
          )}
          <p className="text-[11px] text-gray-400 mt-1.5">
            {t(
              'telegram_fallback_path_hint',
              "When staging's own copy of telegram.php goes missing (the scanner only ever spares the exact path above), the server automatically copies it back from here before the next request that needs it."
            )}
          </p>
        </div>

        {health && (
          <div className="space-y-4 border-t border-gray-100 dark:border-gray-700 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatusRow
                ok={health.moduleLoaded}
                label={t('telegram_module_loaded_label', 'Telegram module loaded')}
                detail={
                  health.moduleLoaded
                    ? t('telegram_module_loaded_ok', 'handleTelegramRequests() is available - every Telegram action will work.')
                    : t('telegram_module_loaded_fail', 'telegram.php failed to load - every Telegram action is currently returning an error.')
                }
              />
              <StatusRow
                ok={health.localFileExists}
                label={t('telegram_local_file_label', 'Local telegram.php present on disk')}
                detail={
                  health.localFileExists
                    ? t('telegram_local_file_ok', 'Found on this server.')
                    : t('telegram_local_file_fail', 'Missing - likely quarantined by the malware scanner again.')
                }
              />
              {health.isStagingEnv && (
                <StatusRow
                  ok={health.fallbackFileExists}
                  label={t('telegram_fallback_file_label', 'Whitelisted fallback copy present')}
                  detail={
                    health.fallbackFileExists
                      ? t('telegram_fallback_file_ok', 'Found - self-heal can recover from a deleted local copy.') +
                        (health.fallbackPathIsDefault ? ' ' + t('telegram_fallback_using_default', '(using built-in default path - nothing saved above yet.)') : '')
                      : t('telegram_fallback_file_fail', 'Missing at the configured path too - self-heal cannot recover right now.')
                  }
                />
              )}
            </div>

            {health.properties.length > 0 && (
              <div>
                <h4 className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  {t('telegram_bot_reachability_heading', 'Bot reachability by property')}
                </h4>
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <Table className="w-full">
                    <TableHead>
                      <TableRow>
                        <TableCell className="text-left font-semibold">{t('property_column_label', 'Property')}</TableCell>
                        <TableCell className="text-left font-semibold">{t('status_column_label', 'Status')}</TableCell>
                        <TableCell className="text-left font-semibold">{t('detail_column_label', 'Detail')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {health.properties.map((p) => (
                        <TableRow key={p.propertyId}>
                          <TableCell className="font-medium whitespace-nowrap text-gray-700 dark:text-gray-200">{p.propertyName}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {p.botReachable ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                                <CheckCircle2 className="w-3.5 h-3.5" /> {t('reachable_label', 'Reachable')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold">
                                <XCircle className="w-3.5 h-3.5" /> {t('unreachable_label', 'Unreachable')}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-gray-500 dark:text-gray-400">
                            {p.botReachable ? `@${p.botUsername}` : p.error}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {health.recentEvents.length > 0 && (
              <div>
                <h4 className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  {t('telegram_recent_events_heading', 'Recent Telegram-related events')}
                </h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {health.recentEvents.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px] bg-gray-50 dark:bg-slate-900/40 px-3 py-2 rounded-lg">
                      <span className="font-mono text-gray-400 shrink-0">{e.timestamp}</span>
                      <span className="text-gray-600 dark:text-gray-300">{e.msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {checkedAt && (
              <p className="text-[10px] text-gray-400">
                {t('checked_at_label', 'Checked at')} {checkedAt}
              </p>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-lg shadow-2xl animate-toast-in">
          {toast}
        </div>
      )}
    </Card>
  );
};
