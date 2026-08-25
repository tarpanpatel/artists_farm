/**
 * Root Admin's per-property Telegram group pairing panel.
 *
 * Implements the SaaS-admin half of "Method A" pure White-Glove onboarding (see CLAUDE.md):
 * property owners never see a pairing code or a bot token, so ALL pairing happens here, on the
 * admin's behalf, for whichever property is being edited in Root Admin.
 *
 * Pairing is driven by Telegram's own `?startgroup=` deep link rather than by typing a 6-digit
 * code into the group by hand. Tapping the link opens Telegram, asks which group to add the bot
 * to, and delivers `/start <CODE>` into that group automatically - which is exactly the payload
 * shape matchPairingCodeFromMessage() in php/telegram/pairing.php already parses (see its own
 * comment). Two real advantages over the typed code: nothing to transcribe wrong, and slash
 * commands reach a bot even with privacy mode ENABLED, so the BotFather "/setprivacy -> Disable"
 * step isn't needed.
 *
 * No backend changes were required for any of this: generatePairingCode()/confirmPairing() already
 * take $propertyId explicitly and router.php passes the request's own resolved $propertyId, so
 * targeting another property is purely a matter of sending that property's slug (see apiFetch()'s
 * propertySlugOverride).
 */
import React, { useEffect, useRef, useState } from 'react';
import { ChefHat, ShieldCheck, Wallet, Copy, CheckCircle2, Loader2, RefreshCw, Send } from './icons/FlowbiteIcons';
import { Button } from './Button';
import {
  fetchTelegramBotIdentity,
  fetchTelegramConfigDB,
  generateTelegramPairingCode,
  checkTelegramPairingStatus,
  confirmTelegramPairing,
  sendTelegramTestMessage,
} from '../services/api';

type ChannelKey = 'kitchen' | 'admin' | 'finance';

interface ChannelDef {
  key: ChannelKey;
  label: string;
  icon: React.ElementType;
  hint: string;
}

// Kitchen is deliberately listed but optional per property - the kitchen module can be off, in
// which case that property only needs Admin + Finance (same rule as TelegramSetupWizard's
// ALL_STEPS). Admin and Finance are always required.
const CHANNELS: ChannelDef[] = [
  { key: 'kitchen', label: 'Kitchen', icon: ChefHat, hint: 'Cooks, kitchen manager, requisitions, servers' },
  { key: 'admin', label: 'Admin', icon: ShieldCheck, hint: 'Property manager, housekeeping, reception' },
  { key: 'finance', label: 'Finance', icon: Wallet, hint: 'Only staff handling money in or out' },
];

type ChannelStatus = 'unpaired' | 'generating' | 'awaiting' | 'connected' | 'error';

interface ChannelState {
  status: ChannelStatus;
  code: string | null;
  chatId: string | null;
  error: string | null;
  copied: boolean;
  testing: boolean;
  testResult: string | null;
}

const EMPTY: ChannelState = {
  status: 'unpaired',
  code: null,
  chatId: null,
  error: null,
  copied: false,
  testing: false,
  testResult: null,
};

interface TelegramPairingPanelProps {
  propertySlug: string;
  propertyName: string;
  kitchenModuleEnabled?: boolean;
}

export const TelegramPairingPanel: React.FC<TelegramPairingPanelProps> = ({
  propertySlug,
  propertyName,
  kitchenModuleEnabled = true,
}) => {
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [states, setStates] = useState<Record<string, ChannelState>>({});
  // One interval per mounted panel, shared by whichever channel is currently awaiting a tap -
  // kept in a ref so the cleanup below can always reach the live handle regardless of re-renders.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const channels = CHANNELS.filter((c) => c.key !== 'kitchen' || kitchenModuleEnabled);

  const patch = (key: string, next: Partial<ChannelState>) =>
    setStates((prev) => ({ ...prev, [key]: { ...(prev[key] ?? EMPTY), ...next } }));

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchTelegramBotIdentity(propertySlug), fetchTelegramConfigDB(propertySlug)])
      .then(([identity, config]) => {
        if (cancelled) return;
        setBotUsername(identity?.username ?? null);
        const next: Record<string, ChannelState> = {};
        for (const ch of CHANNELS) {
          const existing = config.groups?.find((g) => g.key === ch.key && g.chatId);
          next[ch.key] = existing
            ? { ...EMPTY, status: 'connected', chatId: existing.chatId }
            : { ...EMPTY };
        }
        setStates(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [propertySlug]);

  const buildDeepLink = (code: string) => `https://t.me/${botUsername}?startgroup=${encodeURIComponent(code)}`;

  const startPairing = async (ch: ChannelDef) => {
    stopPolling();
    patch(ch.key, { status: 'generating', error: null, code: null, testResult: null });
    const groupName = `${propertyName} - ${ch.label}`;
    const code = await generateTelegramPairingCode(ch.key, groupName, propertySlug);
    if (!code) {
      patch(ch.key, { status: 'error', error: 'Could not generate a pairing link. Please try again.' });
      return;
    }
    patch(ch.key, { status: 'awaiting', code });

    // Each status check also drives the server's own getUpdates poll (see
    // pollAndMatchPairingCodes), so this interval is what actually notices the bot being added -
    // there's no webhook needed for pairing to complete.
    pollRef.current = setInterval(async () => {
      const result = await checkTelegramPairingStatus(code, propertySlug);
      if (result.status === 'paired' || result.status === 'confirmed') {
        stopPolling();
        const confirmed = await confirmTelegramPairing(code, propertySlug);
        if (confirmed.success && confirmed.chatId) {
          patch(ch.key, { status: 'connected', chatId: confirmed.chatId, code: null });
        } else {
          patch(ch.key, { status: 'error', error: confirmed.message || 'Could not confirm the group.' });
        }
      } else if (result.status === 'expired' || result.status === 'not_found') {
        stopPolling();
        patch(ch.key, {
          status: 'error',
          // Codes expire after 15 minutes server-side - say so plainly rather than just failing,
          // since the fix (generate a fresh link) isn't obvious otherwise.
          error: 'That link expired before it was used. Generate a new one.',
        });
      }
    }, 3000);
  };

  const copyLink = async (ch: ChannelDef, code: string) => {
    try {
      await navigator.clipboard.writeText(buildDeepLink(code));
      patch(ch.key, { copied: true });
      setTimeout(() => patch(ch.key, { copied: false }), 2000);
    } catch {
      patch(ch.key, { error: 'Could not copy - long-press the link to copy it manually.' });
    }
  };

  const runTest = async (ch: ChannelDef, chatId: string) => {
    patch(ch.key, { testing: true, testResult: null });
    const res = await sendTelegramTestMessage(chatId, propertySlug);
    patch(ch.key, {
      testing: false,
      testResult: res.success ? 'Test message sent' : res.message || 'Test failed',
    });
    setTimeout(() => patch(ch.key, { testResult: null }), 4000);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading Telegram pairing status...
      </div>
    );
  }

  if (!botUsername) {
    return (
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3">
        <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 m-0">No bot assigned yet</p>
        <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-1 mb-0">
          Set this property's Bot API Token above and save, then reopen this panel to generate pairing links.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3">
        <p className="text-[11px] text-gray-600 dark:text-gray-300 m-0">
          Tap a channel's link to add <span className="font-semibold">@{botUsername}</span> to that group. Telegram
          asks which group to use, then the bot configures itself. Links expire after 15 minutes.
        </p>
      </div>

      {channels.map((ch) => {
        const state = states[ch.key] ?? EMPTY;
        const Icon = ch.icon;
        return (
          <div
            key={ch.key}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="w-8 h-8 shrink-0 rounded-lg bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 flex items-center justify-center text-sky-600 dark:text-sky-400">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{ch.label}</div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400">{ch.hint}</div>
                </div>
              </div>

              {state.status === 'connected' && (
                <span className="shrink-0 inline-flex items-center gap-1 text-2xs font-bold px-2 py-1 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <CheckCircle2 className="w-3 h-3" />
                  Connected
                </span>
              )}
            </div>

            <div className="mt-2.5">
              {state.status === 'connected' ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" variant="secondary" onClick={() => runTest(ch, state.chatId!)} disabled={state.testing}>
                    {state.testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span className="ml-1.5">Send Test</span>
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => startPairing(ch)}>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span className="ml-1.5">Re-pair</span>
                  </Button>
                  {state.testResult && (
                    <span className="text-[11px] text-gray-600 dark:text-gray-300">{state.testResult}</span>
                  )}
                </div>
              ) : state.status === 'awaiting' && state.code ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={buildDeepLink(state.code)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white no-underline"
                    >
                      Add bot to {ch.label} group
                    </a>
                    <Button size="sm" variant="secondary" onClick={() => copyLink(ch, state.code!)}>
                      <Copy className="w-3.5 h-3.5" />
                      <span className="ml-1.5">{state.copied ? 'Copied' : 'Copy link'}</span>
                    </Button>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Waiting for the bot to be added...
                  </div>
                </div>
              ) : state.status === 'generating' ? (
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Generating link...
                </div>
              ) : (
                <Button size="sm" variant="primary" onClick={() => startPairing(ch)}>
                  Generate pairing link
                </Button>
              )}

              {state.error && (
                <p className="text-[11px] text-red-600 dark:text-red-400 mt-2 mb-0">{state.error}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
