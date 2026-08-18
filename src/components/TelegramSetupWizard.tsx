import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Rocket,
  ChefHat,
  ShieldCheck,
  Wallet,
  Copy,
  CheckCircle2,
  Loader2,
  Send,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Bot,
  Save,
  Lightbulb,
} from 'lucide-react';
import { Input } from './Input';
import {
  fetchTelegramBotIdentity,
  generateTelegramPairingCode,
  checkTelegramPairingStatus,
  confirmTelegramPairing,
  sendTelegramTestMessage,
  fetchTelegramConfigDB,
  saveTelegramConfigDB,
} from '../services/api';
import { PropertyTelegramConfig } from '../types';
import { t } from '../i18n/en';
import { ToggleSwitch } from './ToggleSwitch';

interface WizardStep {
  key: 'settings' | 'kitchen' | 'admin' | 'finance';
  label: string;
  icon: React.ElementType;
}

const STEPS: WizardStep[] = [
  { key: 'settings', label: 'Bot & Settings', icon: Bot },
  { key: 'kitchen', label: 'Kitchen', icon: ChefHat },
  { key: 'admin', label: 'Admin', icon: ShieldCheck },
  { key: 'finance', label: 'Finance', icon: Wallet },
];

const ROLE_GUIDANCE = {
  kitchen: 'Add cooks, kitchen helpers, the kitchen manager who takes orders, whoever handles requisitions/purchases, and servers.',
  admin: 'Add the property manager, housekeeping, inventory manager, and reception staff.',
  finance: 'Add only staff who handle money coming in or going out — keep this group tight.',
};

type StepStatus = 'idle' | 'generating' | 'waiting' | 'confirming' | 'connected' | 'expired' | 'error';

interface StepState {
  code: string | null;
  status: StepStatus;
  chatId: string | null;
  testSent: boolean;
  testSending: boolean;
  errorMessage: string | null;
}

const EMPTY_STEP_STATE: StepState = {
  code: null,
  status: 'idle',
  chatId: null,
  testSent: false,
  testSending: false,
  errorMessage: null,
};

interface TelegramSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  propertyName?: string;
}

export const TelegramSetupWizard: React.FC<TelegramSetupWizardProps> = ({
  isOpen,
  onClose,
  onComplete,
  propertyName,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stepStates, setStepStates] = useState<Record<string, StepState>>({});
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [wizardConfig, setWizardConfig] = useState<PropertyTelegramConfig | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showBotFatherGuide, setShowBotFatherGuide] = useState(false);

  const currentStep = STEPS[currentIndex];
  const currentState = stepStates[currentStep.key] ?? EMPTY_STEP_STATE;

  const setCurrentState = (patch: Partial<StepState>) => {
    setStepStates((prev) => ({
      ...prev,
      [currentStep.key]: { ...(prev[currentStep.key] ?? EMPTY_STEP_STATE), ...patch },
    }));
  };

  const clearPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const refreshBotIdentity = () => {
    fetchTelegramBotIdentity().then((identity) => setBotUsername(identity?.username ?? null));
  };

  const loadConfig = async () => {
    try {
      const cfg = await fetchTelegramConfigDB();
      setWizardConfig(cfg);
      setTokenInput(cfg.botToken || '');
    } catch (e) {
      console.error('Failed to load Telegram Config:', e);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadConfig();
    refreshBotIdentity();
  }, [isOpen]);

  const [configLoaded, setConfigLoaded] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setConfigLoaded(false);
    fetchTelegramConfigDB().then((config) => {
      setStepStates((prev) => {
        const next = { ...prev };
        for (const step of STEPS) {
          if (step.key === 'settings') continue;
          const existing = config.groups.find((g) => g.key === step.key && g.chatId);
          if (existing && next[step.key]?.status !== 'connected') {
            next[step.key] = { ...EMPTY_STEP_STATE, status: 'connected', chatId: existing.chatId };
          }
        }
        return next;
      });
      setConfigLoaded(true);
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !configLoaded) return;
    clearPolling();
    if (currentStep.key === 'settings') return;

    const state = stepStates[currentStep.key];
    if (!state || state.status === 'idle') {
      startPairing();
    } else if (state.status === 'waiting' && state.code) {
      startPolling(state.code);
    }
    return clearPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, configLoaded, currentIndex]);

  useEffect(() => {
    if (!isOpen) {
      clearPolling();
      setCurrentIndex(0);
      setStepStates({});
    }
  }, [isOpen]);

  const startPairing = async () => {
    setCurrentState({ status: 'generating', errorMessage: null });
    const groupName = propertyName ? `${propertyName} - ${currentStep.label}` : `${currentStep.label} Group`;
    const code = await generateTelegramPairingCode(currentStep.key, groupName);
    if (!code) {
      setCurrentState({ status: 'error', errorMessage: 'Could not generate a pairing code. Please try again.' });
      return;
    }
    setCurrentState({ code, status: 'waiting' });
    startPolling(code);
  };

  const startPolling = (code: string) => {
    clearPolling();
    pollRef.current = setInterval(async () => {
      const result = await checkTelegramPairingStatus(code);
      if (result.status === 'paired' || result.status === 'confirmed') {
        clearPolling();
        setCurrentState({ status: 'confirming' });
        const confirmed = await confirmTelegramPairing(code);
        if (confirmed.success && confirmed.chatId) {
          setCurrentState({ status: 'connected', chatId: confirmed.chatId });
        } else {
          setCurrentState({ status: 'error', errorMessage: confirmed.message || 'Could not save this connection.' });
        }
      } else if (result.status === 'expired') {
        clearPolling();
        setCurrentState({ status: 'expired' });
      }
    }, 3000);
  };

  const handleSendTest = async () => {
    if (!currentState.chatId) return;
    setCurrentState({ testSending: true });
    const result = await sendTelegramTestMessage(currentState.chatId);
    setCurrentState({
      testSending: false,
      testSent: result.success,
      errorMessage: result.success ? null : result.message || 'Test send failed.',
    });
  };

  const handleReSetup = async () => {
    setCurrentState({ status: 'idle', chatId: null, code: null, testSent: false, testSending: false, errorMessage: null });
    try {
      const config = await fetchTelegramConfigDB();
      const updatedGroups = config.groups.map(g => g.key === currentStep.key ? { ...g, chatId: '' } : g);
      await saveTelegramConfigDB({ ...config, groups: updatedGroups });
    } catch (e) {
      console.error('Failed to clear group chat ID in DB:', e);
    }
    startPairing();
  };

  const handleSaveToken = async () => {
    const trimmed = tokenInput.trim();
    if (!trimmed || !wizardConfig) return;
    setSavingToken(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const ok = await saveTelegramConfigDB({ ...wizardConfig, botToken: trimmed });
      if (!ok) {
        setSaveError('Could not save the token — please try again.');
        return;
      }
      const identity = await fetchTelegramBotIdentity();
      if (identity?.username) {
        setSaveSuccess(true);
        setBotUsername(identity.username);
        setWizardConfig({ ...wizardConfig, botToken: trimmed });
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setSaveError("Saved, but Telegram didn't recognize that token — double-check you copied the whole thing from BotFather.");
      }
    } catch {
      setSaveError('Could not save the token — please try again.');
    } finally {
      setSavingToken(false);
    }
  };

  const handleUpdateConfigField = async (field: keyof PropertyTelegramConfig, value: any) => {
    if (!wizardConfig) return;
    const updated = { ...wizardConfig, [field]: value };
    setWizardConfig(updated);
    try {
      await saveTelegramConfigDB(updated);
    } catch (e) {
      console.error('Failed to save updated config field:', e);
    }
  };

  const handleCopyCode = () => {
    if (currentState.code) navigator.clipboard.writeText(currentState.code);
  };

  const goNext = () => {
    if (currentIndex < STEPS.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      onComplete();
      onClose();
    }
  };

  const goBack = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };

  const skipStep = () => {
    clearPolling();
    goNext();
  };

  if (!isOpen) return null;

  const isLastStep = currentIndex === STEPS.length - 1;
  const isConnected = currentState.status === 'connected' || currentState.chatId !== null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 telegram-setup-wizard__root">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <Rocket className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="telegram-setup-wizard__title text-base font-semibold text-slate-900 dark:text-white m-0">{t('telegram_setup_title', 'Telegram Setup')}</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 m-0">{t('configure_bot_subtitle', 'Configure bot settings and pairing alerts')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Progress Navigation */}
        <div className="flex items-center justify-center gap-2 px-6 pt-5 pb-2">
          {STEPS.map((step, idx) => {
            const isSett = step.key === 'settings';
            const done = isSett ? !!wizardConfig?.botToken : stepStates[step.key]?.status === 'connected' || !!stepStates[step.key]?.chatId;
            const active = idx === currentIndex;
            const StepIcon = step.icon;
            return (
              <React.Fragment key={step.key}>
                {idx > 0 && (
                  <div
                    className={`h-0.5 w-6 sm:w-10 rounded-full ${
                      done || idx <= currentIndex ? 'bg-sky-500' : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className="flex flex-col items-center gap-1 cursor-pointer"
                  title={`Go to ${step.label}`}
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                      done
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : active
                        ? 'bg-sky-600 border-sky-600 text-white shadow-md'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400'
                    }`}
                  >
                    {done && !isSett ? <CheckCircle2 className="w-4.5 h-4.5" /> : <StepIcon className="w-4.5 h-4.5" />}
                  </div>
                  <span
                    className={`text-[10px] font-semibold ${
                      active ? 'text-sky-700 dark:text-sky-400' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {step.label}
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="text-center text-[10px] text-slate-400 dark:text-slate-500 pb-2">
          {t('configure_general_preferences', 'Configure general notification preferences and link groups.')}
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {currentStep.key === 'settings' ? (
            <div className="space-y-4">
              {/* Enabled toggle */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{t('enable_telegram_notifications_label', 'Enable Telegram Notifications')}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('enable_telegram_notifications_description', 'Toggle to enable or disable all Telegram notifications.')}
                  </div>
                </div>
                <ToggleSwitch
                  enabled={!!wizardConfig?.enabled}
                  onChange={(val) => handleUpdateConfigField('enabled', val)}
                />
              </div>

              {/* Bot API Token */}
              <div className="space-y-2">
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('bot_api_token_label', 'Bot API Token')}</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder={t('bot_token_placeholder', 'Enter Bot Token (Leave empty to use platform default)')}
                    className="flex-1 font-mono"
                    fullWidth={false}
                  />
                  <button
                    type="button"
                    onClick={handleSaveToken}
                    disabled={savingToken}
                    className="shrink-0 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-semibold text-xs px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    {savingToken ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {t('save_button', 'Save')}
                  </button>
                </div>
                {saveSuccess && (
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Bot configured successfully!
                  </div>
                )}
                {saveError && (
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-red-600 dark:text-red-400">
                    <X className="w-3.5 h-3.5 shrink-0" /> {saveError}
                  </div>
                )}

                {/* Collapsible/Guided Block */}
                {(!botUsername || showBotFatherGuide) && (
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 mt-2">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex justify-between items-center">
                      <span className="flex items-center gap-1.5">
                        <Bot className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                        {t('how_to_create_bot_heading', 'How to create a Telegram Bot:')}
                      </span>
                      {botUsername && (
                        <button
                          type="button"
                          onClick={() => setShowBotFatherGuide(false)}
                          className="text-[10px] text-slate-500 hover:text-slate-700 cursor-pointer"
                        >
                          {t('hide_guide_button', 'Hide Guide')}
                        </button>
                      )}
                    </div>
                    <div className="space-y-3 text-xs text-slate-600 dark:text-slate-400">
                      <div>
                        1. Open <a href="https://t.me/BotFather?text=%2Fnewbot" target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline font-semibold">BotFather</a> and send <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">/newbot</code>.
                      </div>
                      <div>
                        2. Choose a display name, then choose a unique username ending in <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">bot</code>.
                      </div>
                      <div>
                        3. Copy the token generated (looks like <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">123456:ABC...</code>) and paste it above.
                      </div>
                      <div>
                        4. <b>Critical Step:</b> send <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">/setprivacy</code> to BotFather, select your bot, and choose <b>Disable</b>.
                      </div>
                    </div>
                  </div>
                )}
                {botUsername && !showBotFatherGuide && (
                  <button
                    type="button"
                    onClick={() => setShowBotFatherGuide(true)}
                    className="text-xs font-semibold text-sky-600 hover:underline cursor-pointer block mt-1"
                  >
                    <Lightbulb className="w-3.5 h-3.5 inline-block mr-1" /> {t('show_botfather_guide_button', 'Show BotFather setup guide')}
                  </button>
                )}
              </div>

              {/* Auto-Reminder Interval */}
              <div className="space-y-1 pt-2 border-t border-slate-200 dark:border-slate-800">
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('auto_reminder_interval_label', 'Auto-Reminder Interval (Minutes)')}
                </label>
                <Input
                  type="number"
                  min={1}
                  value={wizardConfig?.reminderThresholdMinutes ?? 5}
                  onChange={(e) => handleUpdateConfigField('reminderThresholdMinutes', Math.max(1, Number(e.target.value) || 5))}
                  className="w-24"
                  fullWidth={false}
                />
                <p className="text-[10px] text-slate-400">
                  {t('auto_reminder_interval_description', 'Minutes to wait before an unaddressed order/dish gets nudged again.')}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Group steps */}
              <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
                Pair your <span className="font-semibold text-slate-700 dark:text-slate-200">{currentStep.label}</span> Telegram group
              </div>

              <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 rounded-lg px-3 py-2 text-[11px] text-sky-800 dark:text-sky-300">
                <span className="font-semibold">{t('who_belongs_here_prefix', 'Who belongs here: ')}</span>
                {ROLE_GUIDANCE[currentStep.key as keyof typeof ROLE_GUIDANCE]}
              </div>

              {!botUsername && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl p-4 text-center space-y-2 text-xs text-amber-800 dark:text-amber-300">
                  <span>Please configure your Bot API Token in the <b>Bot & Settings</b> step first before pairing groups.</span>
                  <button
                    type="button"
                    onClick={() => setCurrentIndex(0)}
                    className="bg-amber-600 text-white font-semibold px-3 py-1.5 rounded-lg block mx-auto cursor-pointer"
                  >
                    {t('go_to_settings_button', 'Go to Settings')}
                  </button>
                </div>
              )}

              {botUsername && isConnected && (
                <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-xl p-4 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="telegram-setup-wizard__caption text-sm font-semibold text-slate-900 dark:text-white">{t('successfully_connected_heading', 'Successfully Connected!')}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Your <b>{currentStep.label}</b> group chat is linked to the bot.
                    </p>
                    <div className="mt-2 text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 py-1.5 px-3 rounded-lg inline-block select-all">
                      Chat ID: {currentState.chatId}
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={handleSendTest}
                      disabled={currentState.testSending}
                      className="w-full bg-sky-600 hover:bg-sky-500 disabled:bg-slate-400 text-white font-semibold text-xs px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      {currentState.testSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      {currentState.testSent ? t('test_message_sent_again_button', 'Test Message Sent (send again)') : t('send_test_message_button', 'Send Test Message')}
                    </button>
                    
                    <button
                      type="button"
                      onClick={handleReSetup}
                      className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> {t('re_setup_group_button', 'Re-setup / Re-pair Group')}
                    </button>

                    {currentState.testSent && (
                      <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        Check your Telegram group — the test message should be there.
                      </div>
                    )}
                    {!currentState.testSending && !currentState.testSent && currentState.errorMessage && (
                      <div className="text-[11px] font-semibold text-red-600 dark:text-red-400">
                        {currentState.errorMessage}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {botUsername && !isConnected && (
                <>
                  <ol className="space-y-2.5 text-sm text-slate-700 dark:text-slate-200 list-none">
                    <li className="flex gap-2.5">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-semibold flex items-center justify-center">1</span>
                      <span>In Telegram, create a new group{propertyName ? ` (e.g. "${propertyName} - ${currentStep.label}")` : ''}.</span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-semibold flex items-center justify-center">2</span>
                      <span>
                        Tap the group name → <b>Add Members</b> → search{' '}
                        <span className="font-mono font-semibold text-sky-700 dark:text-sky-400">@{botUsername}</span> → tap it to add.
                      </span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-semibold flex items-center justify-center">3</span>
                      <span>{t('send_this_code_label', 'Send this code as a message in the group:')}</span>
                    </li>
                  </ol>

                  {/* Code display */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-900 dark:bg-black rounded-xl px-4 py-3 font-mono text-sky-400 text-sm font-semibold tracking-wide text-center border border-slate-700">
                      {currentState.status === 'generating' || !currentState.code ? (
                        <Loader2 className="w-4 h-4 animate-spin inline-block text-slate-400" />
                      ) : (
                        currentState.code
                      )}
                    </div>
                    <button
                      onClick={handleCopyCode}
                      disabled={!currentState.code}
                      className="w-11 h-11 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 flex items-center justify-center cursor-pointer"
                      title={t('copy_code_tooltip', 'Copy code')}
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Live status */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                    {currentState.status === 'waiting' && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t('waiting_for_code_label', 'Waiting for the code to arrive…')}
                      </div>
                    )}
                    {currentState.status === 'confirming' && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t('code_received_connecting_label', 'Code received — connecting…')}
                      </div>
                    )}
                    {currentState.status === 'expired' && (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">{t('code_expired_label', 'This code expired.')}</div>
                        <button
                          onClick={startPairing}
                          className="text-xs font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1.5 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> {t('generate_new_code_button', 'Generate a new code')}
                        </button>
                      </div>
                    )}
                    {currentState.status === 'error' && (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-red-600 dark:text-red-400">{currentState.errorMessage}</div>
                        <button
                          onClick={startPairing}
                          className="text-xs font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1.5 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> {t('try_again_button', 'Try again')}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={goBack}
            disabled={currentIndex === 0}
            className="text-xs font-semibold text-slate-500 dark:text-slate-400 disabled:opacity-0 flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {t('back_button', 'Back')}
          </button>
          <div className="flex items-center gap-3">
            {currentStep.key !== 'settings' && !isConnected && (
              <button
                onClick={skipStep}
                className="text-xs font-semibold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
              >
                {t('skip_for_now_button', 'Skip for now')}
              </button>
            )}
            <button
              onClick={goNext}
              className="bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
            >
              {isLastStep ? t('finish_button', 'Finish') : t('next_button', 'Next')} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

