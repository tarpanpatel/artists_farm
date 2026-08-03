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
  Search,
  Bot,
  Key,
  ShieldOff,
  CheckCheck,
  Settings2,
} from 'lucide-react';
import {
  fetchTelegramBotIdentity,
  generateTelegramPairingCode,
  checkTelegramPairingStatus,
  confirmTelegramPairing,
  sendTelegramTestMessage,
} from '../services/api';

interface WizardStep {
  key: 'kitchen' | 'admin' | 'finance';
  label: string;
  icon: React.ElementType;
}

const STEPS: WizardStep[] = [
  { key: 'kitchen', label: 'Kitchen', icon: ChefHat },
  { key: 'admin', label: 'Admin', icon: ShieldCheck },
  { key: 'finance', label: 'Finance', icon: Wallet },
];

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

// Small illustrative mockups of the actual Telegram/BotFather conversation, since
// this is a real external app switch a first-time tenant has never done before —
// plain text instructions alone ("send /newbot") are easy to fumble without seeing
// roughly what the screen looks like. No real screenshots/external assets used.
const TelegramBubble: React.FC<{ text: React.ReactNode; outgoing?: boolean; mono?: boolean }> = ({ text, outgoing, mono }) => (
  <div className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
    <div
      className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-[11px] leading-snug ${mono ? 'font-mono' : ''} ${
        outgoing
          ? 'bg-sky-600 text-white rounded-br-sm'
          : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-sm'
      }`}
    >
      {text}
    </div>
  </div>
);

const TelegramMockScreen: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-slate-100 dark:bg-slate-900 rounded-xl p-2.5 space-y-1.5 border border-slate-200 dark:border-slate-700">
    {children}
  </div>
);

const BotFatherGuide: React.FC<{ onOpenConnectionSettings?: () => void }> = ({ onOpenConnectionSettings }) => (
  <div className="space-y-4">
    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-bold">
      <Bot className="w-4 h-4" />
      No Telegram bot is connected yet — this is a one-time setup, done once for the whole platform.
    </div>

    <div className="space-y-2">
      <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
        <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] flex items-center justify-center shrink-0">1</span>
        Search Telegram for <span className="font-mono">BotFather</span>
      </div>
      <TelegramMockScreen>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg px-2.5 py-1.5 border border-slate-300 dark:border-slate-600">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-[11px] text-slate-500 dark:text-slate-400">BotFather</span>
        </div>
        <div className="flex items-center gap-2 px-1">
          <div className="w-6 h-6 rounded-full bg-sky-500 flex items-center justify-center shrink-0">
            <Bot className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">BotFather</span>
          <CheckCheck className="w-3 h-3 text-sky-500" />
        </div>
      </TelegramMockScreen>
    </div>

    <div className="space-y-2">
      <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
        <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] flex items-center justify-center shrink-0">2</span>
        Send <span className="font-mono">/newbot</span> and follow the prompts
      </div>
      <TelegramMockScreen>
        <TelegramBubble outgoing mono text="/newbot" />
        <TelegramBubble text="Alright, a new bot. How are we going to call it?" />
        <TelegramBubble outgoing text="Artists Farm Bot" />
        <TelegramBubble text="Now let's choose a username (must end in 'bot')." />
        <TelegramBubble outgoing mono text="artists_farm_bot" />
      </TelegramMockScreen>
    </div>

    <div className="space-y-2">
      <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
        <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] flex items-center justify-center shrink-0">3</span>
        Copy the API token it gives you
      </div>
      <TelegramMockScreen>
        <TelegramBubble
          text={
            <>
              Done! Use this token to access the HTTP API:
              <br />
              <span className="inline-flex items-center gap-1 mt-1 font-mono font-bold text-sky-700 dark:text-sky-300">
                <Key className="w-3 h-3" /> 123456789:AAH...
              </span>
            </>
          }
        />
      </TelegramMockScreen>
    </div>

    <div className="space-y-2">
      <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
        <span className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-950 text-red-500 text-[11px] flex items-center justify-center shrink-0">4</span>
        Critical: send <span className="font-mono">/setprivacy</span>, pick your bot, choose <b>Disable</b>
      </div>
      <TelegramMockScreen>
        <TelegramBubble outgoing mono text="/setprivacy" />
        <TelegramBubble text="Choose a bot to change group messages settings." />
        <TelegramBubble outgoing text="@artists_farm_bot" />
        <div className="flex justify-end">
          <div className="bg-white dark:bg-slate-800 border border-sky-300 dark:border-sky-700 rounded-lg px-3 py-1 text-[11px] font-bold text-sky-700 dark:text-sky-400 flex items-center gap-1">
            <ShieldOff className="w-3 h-3" /> Disable
          </div>
        </div>
        <TelegramBubble text="Success! Group Privacy is disabled." />
      </TelegramMockScreen>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 pl-6.5">
        Without this, Telegram only forwards commands to the bot — it won't see the pairing codes tenants send as plain messages, and pairing will silently never work.
      </p>
    </div>

    <div className="pt-1">
      <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 mb-2">
        <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] flex items-center justify-center shrink-0">5</span>
        Paste that token into Connection Settings
      </div>
      <button
        onClick={onOpenConnectionSettings}
        disabled={!onOpenConnectionSettings}
        className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer"
      >
        <Settings2 className="w-3.5 h-3.5" /> Open Connection Settings → Bot API Token
      </button>
    </div>
  </div>
);

interface TelegramSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  onOpenConnectionSettings?: () => void;
  propertyName?: string;
}

export const TelegramSetupWizard: React.FC<TelegramSetupWizardProps> = ({
  isOpen,
  onClose,
  onComplete,
  onOpenConnectionSettings,
  propertyName,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stepStates, setStepStates] = useState<Record<string, StepState>>({});
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Fetch the shared bot's @username once, on open, so instructions never hardcode a bot name.
  useEffect(() => {
    if (!isOpen) return;
    fetchTelegramBotIdentity().then((identity) => setBotUsername(identity?.username ?? null));
  }, [isOpen]);

  // Auto-generate a pairing code the moment a step becomes active (if it doesn't have one yet).
  useEffect(() => {
    if (!isOpen) return;
    clearPolling();
    const state = stepStates[currentStep.key];
    if (!state || state.status === 'idle') {
      startPairing();
    } else if (state.status === 'waiting' && state.code) {
      startPolling(state.code);
    }
    return clearPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentIndex]);

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
    setCurrentState({ testSending: false, testSent: result.success, errorMessage: result.success ? null : result.message || 'Test send failed.' });
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
  const isConnected = currentState.status === 'connected';

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <Rocket className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white m-0">Quick Telegram Setup</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 m-0">Connect 3 groups in under a minute</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Progress: circles with text */}
        <div className="flex items-center justify-center gap-2 px-6 pt-5 pb-2">
          {STEPS.map((step, idx) => {
            const done = stepStates[step.key]?.status === 'connected';
            const active = idx === currentIndex;
            const StepIcon = step.icon;
            return (
              <React.Fragment key={step.key}>
                {idx > 0 && (
                  <div
                    className={`h-0.5 w-8 sm:w-12 rounded-full ${
                      done || idx <= currentIndex ? 'bg-sky-500' : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  />
                )}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                      done
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : active
                        ? 'bg-sky-600 border-sky-600 text-white shadow-md'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400'
                    }`}
                  >
                    {done ? <CheckCircle2 className="w-4.5 h-4.5" /> : <StepIcon className="w-4.5 h-4.5" />}
                  </div>
                  <span
                    className={`text-[10px] font-bold ${
                      active ? 'text-sky-700 dark:text-sky-400' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
            Step {currentIndex + 1} of {STEPS.length} — Connect your <span className="font-bold text-slate-700 dark:text-slate-200">{currentStep.label}</span> Telegram group
          </div>

          {!botUsername ? (
            <BotFatherGuide onOpenConnectionSettings={onOpenConnectionSettings} />
          ) : (
            <>
              <ol className="space-y-2.5 text-sm text-slate-700 dark:text-slate-200 list-none">
                <li className="flex gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-bold flex items-center justify-center">1</span>
                  <span>In Telegram, create a new group{propertyName ? ` (e.g. "${propertyName} - ${currentStep.label}")` : ''}.</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-bold flex items-center justify-center">2</span>
                  <span>
                    Tap the group name → <b>Add Members</b> → search{' '}
                    <span className="font-mono font-bold text-sky-700 dark:text-sky-400">@{botUsername}</span> → tap it to add.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-bold flex items-center justify-center">3</span>
                  <span>Send this code as a message in the group:</span>
                </li>
              </ol>

              {/* Code display */}
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-900 dark:bg-black rounded-xl px-4 py-3 font-mono text-sky-400 text-sm font-bold tracking-wide text-center border border-slate-700">
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
                  title="Copy code"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>

              {/* Live status */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                {currentState.status === 'waiting' && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Waiting for the code to arrive…
                  </div>
                )}
                {currentState.status === 'confirming' && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Code received — connecting…
                  </div>
                )}
                {currentState.status === 'connected' && (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      Connected!
                    </div>
                    <button
                      onClick={handleSendTest}
                      disabled={currentState.testSending}
                      className="w-full bg-sky-600 hover:bg-sky-500 disabled:bg-slate-400 text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      {currentState.testSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      {currentState.testSent ? 'Test Message Sent ✓ (send again)' : 'Send Test Message'}
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
                )}
                {currentState.status === 'expired' && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-amber-600 dark:text-amber-400">This code expired.</div>
                    <button
                      onClick={startPairing}
                      className="text-xs font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Generate a new code
                    </button>
                  </div>
                )}
                {currentState.status === 'error' && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-red-600 dark:text-red-400">{currentState.errorMessage}</div>
                    <button
                      onClick={startPairing}
                      className="text-xs font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Try again
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={goBack}
            disabled={currentIndex === 0}
            className="text-xs font-bold text-slate-500 dark:text-slate-400 disabled:opacity-0 flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={skipStep}
              className="text-xs font-semibold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
            >
              Skip for now
            </button>
            <button
              onClick={goNext}
              disabled={!isConnected}
              className="bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
            >
              {isLastStep ? 'Finish' : 'Next'} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
