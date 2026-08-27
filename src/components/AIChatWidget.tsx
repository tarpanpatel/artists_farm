import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Loader2 } from './icons/FlowbiteIcons';
import { WhatsappIcon } from './icons/WhatsappIcon';
import { TelegramIcon } from './icons/TelegramIcon';
import { Guest, StaffMember } from '../types';
import { t } from '../i18n/en';
import { getPropertySlug } from '../services/api';

// Support contact links (added 27 Aug 2026, human-escalation feature) - Ground Code's own
// support contact, not a per-property/tenant value, so fixed constants rather than threaded
// down as props. Same numbers as the WhatsApp/Telegram links this replaced in Header.tsx.
const SUPPORT_WHATSAPP_URL = 'https://wa.me/919571263474';
const SUPPORT_TELEGRAM_URL = 'https://t.me/GroundCodeCom';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  actionText?: string;
  modeBadge?: string;
  // Every action type is confirm-first now (27 Aug 2026, explicit request: "ai should always
  // ask that" - extended from an earlier pass that only covered `navigate`). Stores whatever
  // the backend's `res.action` carried, plus a human label for the button; handleConfirmAction
  // below is the single place that actually dispatches on `type` and runs the real side
  // effect, so the "ask first" behavior can't drift out of sync between action types again.
  pendingAction?: {
    type: string;
    label: string;
    tab?: string;
    itemKey?: string;
    route?: string;
    amount?: number;
    description?: string;
    category?: string;
    roomNumber?: string;
    item?: string;
    extraData?: {
      staffName?: string; reqItemName?: string; reqQty?: number; reqUnit?: string;
      addStaffName?: string; addStaffPhone?: string; addStaffRole?: string; addStaffSalary?: number;
      newMenuItemName?: string; newMenuItemPrice?: number; newMenuItemCategory?: string;
    };
  };
}

interface AIChatWidgetProps {
  userRole?: string;
  propertyName?: string;
  isOpen?: boolean;
  onClose?: () => void;
  guests?: Guest[];
  staff?: StaffMember[];
  onNavigate?: (tab: string, itemKey?: string, extraData?: {
    staffName?: string; reqItemName?: string; reqQty?: number; reqUnit?: string;
    addStaffName?: string; addStaffPhone?: string; addStaffRole?: string; addStaffSalary?: number;
    newMenuItemName?: string; newMenuItemPrice?: number; newMenuItemCategory?: string;
  }) => void;
  onOpenAddBooking?: () => void;
  onOpenAddExpense?: (data?: { amount?: number; description?: string; category?: string }) => void;
  onOpenTelegramModal?: () => void;
  onOpenAddServiceRequest?: (data?: { roomNumber?: string; item?: string }) => void;
}

export const AIChatWidget: React.FC<AIChatWidgetProps> = ({
  userRole = 'Staff',
  propertyName = 'Ground Code Resort',
  isOpen: externalIsOpen,
  onClose,
  guests = [],
  staff = [],
  onNavigate,
  onOpenAddBooking,
  onOpenAddExpense,
  onOpenTelegramModal,
  onOpenAddServiceRequest,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isChatOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentModeBadge, setCurrentModeBadge] = useState<string>('Offline Engine Active');
  // TEMPORARY, time-boxed (24 Aug 2026) - visibility into the Gemini trial period's real usage,
  // Root-Admin-only (the server only ever sends a non-null 'usage_summary' for that role - this
  // state just stays null for anyone else). Safe to remove alongside ai_assistant.php's matching
  // fields once the trial's done - see that file's recordGeminiUsage() doc comment.
  const [geminiUsage, setGeminiUsage] = useState<{
    today: { requests: number; tokens: number; rate_limited: number };
    last_7_days: { requests: number; tokens: number; rate_limited: number };
  } | null>(null);

  // Human-escalation trigger (added 27 Aug 2026, replaces the standalone WhatsApp/Telegram
  // header menu - see AI.md). Counts consecutive replies the backend flagged as `matched: false`
  // (the offline engine's own "nothing scored confidently, this is the generic fallback" signal -
  // see ai_assistant.php). Deliberately NOT sentiment analysis: this is a free, deterministic
  // signal already computed server-side, whereas guessing at frustration would need the paid
  // online provider running at all times and is inherently unreliable. Resets to 0 on any
  // matched reply - this is "2 in a row", not a lifetime total.
  const [consecutiveUnmatched, setConsecutiveUnmatched] = useState(0);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: `Hello! I am your Ground Code AI Assistant. Ask me questions or tell me to perform tasks like "+ Add Booking", "Log Expense", or "Go to Kitchen"!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isChatOpen) {
      scrollToBottom();
    }
  }, [messages, isChatOpen]);

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      setInternalIsOpen(false);
    }
  };

  // Fires the actual side effect once the user taps the confirm button in the chat bubble
  // (see ChatMessage.pendingAction's own comment for why nothing runs automatically). The
  // widget deliberately does NOT close afterward (27 Aug 2026, explicit request: "once it
  // takes me to that page the ai should keep chat box open and ask if that's where I want to
  // be" - previously every action closed the widget the instant it fired, on the assumption
  // the user was "done"; now the chat stays open and follows up instead, so a wrong guess or a
  // multi-step task doesn't mean reopening the widget from scratch). `open_root_dashboard_route`
  // is the one exception - it's a full `window.location.href` navigation to an entirely
  // separate app shell, not a same-page action, so the whole React tree (including this
  // widget) is about to unmount anyway; nothing to keep open or follow up on.
  const handleConfirmAction = (messageId: string, action: NonNullable<ChatMessage['pendingAction']>) => {
    let notice = '';
    let followUpText = "Done! Let me know if you need anything else.";

    switch (action.type) {
      case 'open_telescope':
        window.open('/php/errors/', '_blank');
        notice = '⚡ Executed: Opened Telescope Error Monitor';
        followUpText = 'Opened Telescope in a new tab. Let me know if you need anything else.';
        break;
      case 'open_root_dashboard_route':
        window.location.href = '/root_dashboard/' + (action.route || '');
        return; // page is navigating away entirely - no state left to update
      case 'open_add_booking':
        onOpenAddBooking?.();
        notice = '⚡ Executed: Add Booking form opened';
        break;
      case 'open_add_expense':
        onOpenAddExpense?.({ amount: action.amount, description: action.description, category: action.category });
        notice = '⚡ Executed: Add Expense form opened';
        break;
      case 'open_add_service_request':
        onOpenAddServiceRequest?.({ roomNumber: action.roomNumber, item: action.item });
        notice = '⚡ Executed: New Service Request form opened';
        break;
      case 'open_telegram_modal':
        onOpenTelegramModal?.();
        notice = '⚡ Executed: Telegram Settings modal opened';
        break;
      case 'navigate':
        if (action.tab) {
          onNavigate?.(action.tab, action.itemKey, action.extraData);
          notice = `⚡ Executed: Navigated to ${action.tab}`;
          followUpText = "Is that where you wanted to be? Let me know if you need anything else.";
        }
        break;
      default:
        return;
    }

    setMessages((prev) => [
      ...prev.map((msg) =>
        msg.id === messageId ? { ...msg, pendingAction: undefined, actionText: notice } : msg
      ),
      {
        id: `ai-followup-${Date.now()}`,
        sender: 'ai',
        text: followUpText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    // Deliberately no handleClose() here - see this function's own comment above.
  };

  const getLiveContext = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    let todayCount = 0;
    let upcomingCount = 0;
    let pastCount = 0;
    const activeGuestsList: string[] = [];

    (guests || []).forEach((g) => {
      if (!g) return;
      const checkinRaw = (g.checkinDate || '').trim();
      const checkoutRaw = (g.expectedCheckout || g.checkoutDate || '').trim();

      const checkin = checkinRaw.split(' ')[0].split('T')[0];
      const checkout = checkoutRaw.split(' ')[0].split('T')[0];

      if (checkout === todayStr || checkin === todayStr || (checkin < todayStr && todayStr < checkout)) {
        todayCount++;
        activeGuestsList.push(`${g.roomNumber || 'Room'}: ${g.guestName || 'Guest'}`);
      } else if (checkin > todayStr) {
        upcomingCount++;
      } else {
        pastCount++;
      }
    });

    // Staff summary (added 27 Aug 2026 - live bug: asked "how many team members / what are their
    // names", both online and offline modes had nothing to answer from and could only punt to the
    // Staff Directory page). Deliberately name + role ONLY, never phone/salary - this app already
    // sends this same live_context to a third-party online provider (Gemini/OpenAI/OpenCode Zen)
    // when online mode is enabled, and this question doesn't need anything more than that to
    // answer. Active only, matching what a user actually means by "my team" (excludes anyone
    // marked Inactive/terminated).
    const activeStaff = (staff || []).filter((s) => (s.status || 'Active') === 'Active');

    return {
      today_count: todayCount,
      upcoming_count: upcomingCount,
      past_count: pastCount,
      active_guests: activeGuestsList,
      staff_count: activeStaff.length,
      staff_names: activeStaff.map((s) => `${s.name || 'Unnamed'} (${s.role || 'Staff'})`),
    };
  };

  const handleSend = async (queryText?: string) => {
    const text = queryText || input;
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!queryText) setInput('');
    setLoading(true);

    try {
      // property_slug is required server-side to resolve which property this request belongs to
      // (see getCurrentPropertyId() in ai_assistant.php) - every other endpoint gets this via
      // apiFetch()'s automatic query-param attachment; this one uses a plain fetch (ai_assistant.php
      // isn't an ?action= router.php endpoint, so the full apiFetch wrapper isn't a clean fit) and
      // has to attach it by hand instead. user_role/property_name are no longer sent - the backend
      // now derives both from the actual logged-in session, never from client input (24 Aug 2026
      // security fix: the old client-supplied user_role trivially bypassed every RBAC check below).
      // conversation_history (added 25 Aug 2026, real bug found live): the backend used to see
      // every message in total isolation - no memory of what it just said. A reply like "Yes,
      // staff name Kamlesh" to the AI's own prior question was answered completely blind, with
      // nothing to anchor "yes" to, and got matched to an unrelated action. Send the last few
      // turns (excluding the static 'welcome' message, which isn't part of the real exchange) so
      // an online provider can actually follow a multi-turn exchange. Capped to the last 8 - a
      // trailing window is enough context for a short clarification exchange without unbounded
      // request size/cost as a chat grows long.
      const recentHistory = messages
        .filter((m) => m.id !== 'welcome')
        .slice(-8)
        .map((m) => ({ sender: m.sender, text: m.text }));

      const response = await fetch(`/php/api/ai_assistant.php?property_slug=${encodeURIComponent(getPropertySlug())}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userMsg.text,
          live_context: getLiveContext(),
          conversation_history: recentHistory,
        }),
      });
      if (response.status === 401) {
        setMessages((prev) => [...prev, {
          id: `err-${Date.now()}`,
          sender: 'ai',
          text: 'Your session has expired. Please log in again to keep using the AI Assistant.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }]);
        setLoading(false);
        return;
      }
      if (response.status === 429) {
        setMessages((prev) => [...prev, {
          id: `err-${Date.now()}`,
          sender: 'ai',
          text: "You're sending messages too quickly - please wait a few minutes and try again.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }]);
        setLoading(false);
        return;
      }
      const res = await response.json();

      let actionNotice = '';
      let pendingAction: ChatMessage['pendingAction'] = undefined;
      if (res.mode === 'online') {
        setCurrentModeBadge(`Online AI (${res.provider || 'API'})`);
      } else {
        setCurrentModeBadge('Offline Engine Active');
      }
      if (res.usage_summary) setGeminiUsage(res.usage_summary);

      // Human-escalation counter - see consecutiveUnmatched's own doc comment above.
      // res.matched is only absent on a malformed/unexpected response shape; treat that the same
      // as "answered" rather than nudging toward escalation over a shape we don't recognize.
      setConsecutiveUnmatched((prev) => (res.matched === false ? prev + 1 : 0));

      // Build a pending action instead of executing immediately - every action type is
      // confirm-first now (27 Aug 2026, explicit request: "ai should always ask that", extended
      // from an earlier pass that only covered `navigate`). handleConfirmAction is the single
      // place that actually runs the side effect, once the user taps the button this renders.
      if (res.action) {
        const type = res.action.type;
        const actionLabels: Record<string, string> = {
          open_telescope: 'Open Telescope Error Monitor',
          open_root_dashboard_route: 'Open Account Settings',
          open_add_booking: 'Open Add Booking form',
          open_add_expense: 'Open Add Expense form',
          open_add_service_request: 'Open New Service Request form',
          open_telegram_modal: 'Open Telegram Settings',
        };
        if (type === 'navigate' && res.action.tab) {
          pendingAction = {
            type,
            label: `Take me to ${res.action.tab.replace(/_/g, ' ')}`,
            tab: res.action.tab,
            itemKey: res.action.itemKey,
            extraData: {
              staffName: res.action.staffName,
              reqItemName: res.action.reqItemName,
              reqQty: res.action.reqQty,
              reqUnit: res.action.reqUnit,
              addStaffName: res.action.addStaffName,
              addStaffPhone: res.action.addStaffPhone,
              addStaffRole: res.action.addStaffRole,
              addStaffSalary: res.action.addStaffSalary,
              newMenuItemName: res.action.newMenuItemName,
              newMenuItemPrice: res.action.newMenuItemPrice,
              newMenuItemCategory: res.action.newMenuItemCategory,
            },
          };
        } else if (actionLabels[type]) {
          pendingAction = {
            type,
            label: actionLabels[type],
            route: res.action.route,
            amount: res.action.amount,
            description: res.action.description,
            category: res.action.category,
            roomNumber: res.action.roomNumber,
            item: res.action.item,
          };
        }
      }

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: res.reply || t('ai_no_response', 'No response received. Please try again.'),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionText: actionNotice,
        pendingAction,
        modeBadge: res.mode === 'online' ? `Online: ${res.provider || 'API'}` : 'Offline Engine',
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'ai',
        text: 'Sorry, I encountered a network connection issue. Please check your network and try again.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  if (!isChatOpen) {
    return null;
  }

  return (
    <div className="fixed top-16 right-4 sm:right-24 z-60 font-sans print:hidden animate-in fade-in slide-in-from-top-2">
      <div className="w-80 sm:w-96 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl flex flex-col h-125 overflow-hidden transition-all duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 bg-linear-to-r from-blue-600 to-indigo-600 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-white/10 rounded-lg backdrop-blur-xs">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-xs leading-none">Ground Code AI</h4>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-white/20 text-white">
                  {currentModeBadge}
                </span>
              </div>
              <span className="text-2xs text-blue-100 font-normal">Role: {userRole} • {propertyName}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 text-white/80 hover:text-white rounded-lg transition-colors cursor-pointer"
            aria-label="Close AI Help Chatbot"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Gemini trial usage (TEMPORARY, Root Admin only - see geminiUsage state comment) */}
        {geminiUsage && (
          <div className="px-4 py-1.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-2xs text-amber-800 dark:text-amber-300 shrink-0">
            Gemini trial usage — Today: {geminiUsage.today.requests} req / {geminiUsage.today.tokens.toLocaleString()} tokens
            {geminiUsage.today.rate_limited > 0 && <span className="font-bold"> ({geminiUsage.today.rate_limited}x rate-limited)</span>}
            {' · '}7d: {geminiUsage.last_7_days.requests} req / {geminiUsage.last_7_days.tokens.toLocaleString()} tokens
          </div>
        )}

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs bg-slate-50/50 dark:bg-gray-900/50">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.sender === 'ai' && (
                <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
              )}
              <div
                className={`p-3 rounded-2xl max-w-[82%] leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none shadow-xs'
                    : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-tl-none border border-gray-200/80 dark:border-gray-700 shadow-xs'
                }`}
              >
                <p className="whitespace-pre-wrap wrap-break-word">{m.text}</p>
                {m.actionText && (
                  <span className="block mt-1.5 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-2xs font-semibold text-emerald-700 dark:text-emerald-300">
                    {m.actionText}
                  </span>
                )}
                {m.pendingAction && (
                  <button
                    type="button"
                    onClick={() => handleConfirmAction(m.id, m.pendingAction!)}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-2xs font-semibold cursor-pointer transition-colors active:scale-95"
                  >
                    {m.pendingAction.label} →
                  </button>
                )}
                <div className="flex items-center justify-between gap-2 mt-1">
                  {m.modeBadge && (
                    <span className="text-[8px] font-semibold text-slate-400 dark:text-slate-500 uppercase">
                      {m.modeBadge}
                    </span>
                  )}
                  <span
                    className={`text-[9px] ms-auto ${
                      m.sender === 'user' ? 'text-blue-200' : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {m.timestamp}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2.5 items-center">
              <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-2xl rounded-tl-none border border-gray-200/80 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-xs flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                <span>Processing...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Human escalation banner (added 27 Aug 2026) - surfaces once the offline engine has
            given 2 replies in a row it couldn't actually match (see consecutiveUnmatched's own
            doc comment). Reuses the same WhatsApp/Telegram links that used to be a standalone
            Header.tsx menu - now they're the escalation path instead of the front door. */}
        {consecutiveUnmatched >= 2 && (
          <div className="px-3 py-2.5 border-t border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 shrink-0 space-y-1.5">
            <p className="text-2xs font-semibold text-amber-900 dark:text-amber-200 m-0">
              Still stuck? Talk to a real person instead.
            </p>
            <div className="flex items-center gap-1.5">
              <a
                href={SUPPORT_WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-2xs font-semibold whitespace-nowrap transition-colors cursor-pointer no-underline"
              >
                <WhatsappIcon className="w-3.5 h-3.5" />
                WhatsApp
              </a>
              <a
                href={SUPPORT_TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-full text-2xs font-semibold whitespace-nowrap transition-colors cursor-pointer no-underline"
              >
                <TelegramIcon className="w-3.5 h-3.5" />
                Telegram
              </a>
            </div>
          </div>
        )}

        {/* Quick Suggested Action Chips */}
        <div className="px-3 py-2 flex gap-1.5 overflow-x-auto border-t border-gray-100 dark:border-gray-700/80 bg-white dark:bg-gray-800 shrink-0 scrollbar-none">
          <button
            type="button"
            onClick={() => handleSend('add booking')}
            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-full text-2xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
          >
            ⚡ + Add Booking
          </button>
          <button
            type="button"
            onClick={() => handleSend('add expense')}
            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-full text-2xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
          >
            ⚡ Log Expense
          </button>
          <button
            type="button"
            onClick={() => handleSend('go to kitchen')}
            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950 dark:hover:bg-amber-900 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-full text-2xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
          >
            ⚡ KDS Kitchen
          </button>
          {/* Always-visible escape hatch (not just after 2 unmatched replies) - for anyone who
              wants a human immediately without arguing with the bot first. */}
          <a
            href={SUPPORT_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-full text-2xs font-semibold whitespace-nowrap transition-colors cursor-pointer no-underline ml-auto"
          >
            Talk to a person
          </a>
        </div>

        {/* Input Footer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask AI or perform a task..."
            className="flex-1 bg-slate-100 dark:bg-gray-900 text-gray-900 dark:text-white text-xs rounded-xl px-3.5 py-2.5 outline-none border border-transparent focus:border-blue-500 font-sans"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors shrink-0 cursor-pointer"
            title="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
