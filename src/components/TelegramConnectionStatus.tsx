import React, { useState } from 'react';
import { ChefHat, ShieldCheck, Wallet, Send, CheckCircle2, Loader2, AlertCircle } from './icons/FlowbiteIcons';
import { PropertyTelegramConfig } from '../types';
import { sendTelegramTestMessage } from '../services/api';
import { t } from '../i18n/en';

// Read-only replacement for the old TelegramSetupWizard (removed 26 Aug 2026)
// per the "Method A" pure White-Glove decision documented in CLAUDE.md: the
// property owner never sees a pairing code, a bot token, or BotFather - full
// stop. This component can only ever show two states per channel (connected
// or "contact support") and can never fall back to revealing a pairing flow,
// by construction - there is no code path here that generates or displays a
// code at all. Actual pairing now happens exclusively from Root Admin's
// TelegramPairingPanel.tsx.
interface ChannelDef {
  key: 'kitchen' | 'admin' | 'finance';
  label: string;
  icon: React.ElementType;
}

const ALL_CHANNELS: ChannelDef[] = [
  { key: 'kitchen', label: 'Kitchen', icon: ChefHat },
  { key: 'admin', label: 'Admin', icon: ShieldCheck },
  { key: 'finance', label: 'Finance', icon: Wallet },
];

interface TestState {
  sending: boolean;
  sent: boolean;
  error: string | null;
}
const EMPTY_TEST_STATE: TestState = { sending: false, sent: false, error: null };

interface TelegramConnectionStatusProps {
  config: PropertyTelegramConfig | null;
  kitchenModuleEnabled: boolean;
}

export const TelegramConnectionStatus: React.FC<TelegramConnectionStatusProps> = ({
  config,
  kitchenModuleEnabled,
}) => {
  const channels = ALL_CHANNELS.filter((c) => c.key !== 'kitchen' || kitchenModuleEnabled);
  const [testStates, setTestStates] = useState<Record<string, TestState>>({});

  const handleSendTest = async (key: string, chatId: string) => {
    setTestStates((prev) => ({ ...prev, [key]: { sending: true, sent: false, error: null } }));
    const result = await sendTelegramTestMessage(chatId);
    setTestStates((prev) => ({
      ...prev,
      [key]: {
        sending: false,
        sent: result.success,
        error: result.success ? null : (result.message || t('telegram_test_ping_failed_generic', 'No group actually received the test message.')),
      },
    }));
    if (result.success) {
      setTimeout(() => {
        setTestStates((prev) => ({ ...prev, [key]: EMPTY_TEST_STATE }));
      }, 3000);
    }
  };

  return (
    <div className="telegram-connection-status bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800">
      {channels.map(({ key, label, icon: Icon }) => {
        const group = config?.groups.find((g) => g.key === key && g.chatId);
        const connected = !!group?.chatId;
        const state = testStates[key] ?? EMPTY_TEST_STATE;

        return (
          <div key={key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
                connected
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-100 dark:border-slate-700'
              }`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">{label}</div>
                {connected ? (
                  <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-3 h-3" />
                    {t('white_glove_managed_label', 'White-Glove Managed')}
                  </span>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('telegram_channel_not_set_up_message', 'Not set up — contact support')}
                  </p>
                )}
              </div>
            </div>

            {connected && (
              <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
                {state.error && (
                  <span className="text-2xs text-red-600 dark:text-red-400 max-w-[16rem] text-right">{state.error}</span>
                )}
                <button
                  type="button"
                  onClick={() => handleSendTest(key, group!.chatId)}
                  disabled={state.sending}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                    state.sent
                      ? 'bg-emerald-600 hover:bg-emerald-600 text-white'
                      : state.error
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {state.sending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : state.sent ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : state.error ? (
                    <AlertCircle className="w-3.5 h-3.5" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {state.sending
                      ? t('sending_button', 'Sending...')
                      : state.sent
                      ? t('ping_sent_button', 'Ping Sent!')
                      : state.error
                      ? t('ping_failed_button', 'Ping Failed')
                      : t('send_test_message_button', 'Send Test Message')}
                  </span>
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
