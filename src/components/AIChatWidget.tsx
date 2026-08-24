import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Loader2 } from './icons/FlowbiteIcons';
import { Guest } from '../types';
import { t } from '../i18n/en';
import { getPropertySlug } from '../services/api';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  actionText?: string;
  modeBadge?: string;
}

interface AIChatWidgetProps {
  userRole?: string;
  propertyName?: string;
  isOpen?: boolean;
  onClose?: () => void;
  guests?: Guest[];
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

    return {
      today_count: todayCount,
      upcoming_count: upcomingCount,
      past_count: pastCount,
      active_guests: activeGuestsList,
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
      const response = await fetch(`/php/api/ai_assistant.php?property_slug=${encodeURIComponent(getPropertySlug())}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userMsg.text,
          live_context: getLiveContext(),
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
      if (res.mode === 'online') {
        setCurrentModeBadge(`Online AI (${res.provider || 'API'})`);
      } else {
        setCurrentModeBadge('Offline Engine Active');
      }

      // Execute Action Command if authorized by backend RBAC
      if (res.action) {
        const type = res.action.type;
        if (type === 'open_telescope') {
          window.open('/php/errors/', '_blank');
          actionNotice = '⚡ Executed: Opened Telescope Error Monitor';
          handleClose();
        } else if (type === 'open_root_dashboard_route') {
          // Same-tab, not a new tab (unlike Telescope above) - this is the SAME logged-in
          // session just switching to the separate Root Admin dashboard shell, not an
          // independent tool with its own login.
          window.location.href = '/root_dashboard/' + (res.action.route || '');
          actionNotice = '⚡ Executed: Opened Account Settings';
          handleClose();
        } else if (type === 'open_add_booking' && onOpenAddBooking) {
          onOpenAddBooking();
          actionNotice = '⚡ Executed: Add Booking form opened';
          handleClose();
        } else if (type === 'open_add_expense' && onOpenAddExpense) {
          onOpenAddExpense({ amount: res.action.amount, description: res.action.description, category: res.action.category });
          actionNotice = '⚡ Executed: Add Expense form opened';
          handleClose();
        } else if (type === 'open_add_service_request' && onOpenAddServiceRequest) {
          onOpenAddServiceRequest({ roomNumber: res.action.roomNumber, item: res.action.item });
          actionNotice = '⚡ Executed: New Service Request form opened';
          handleClose();
        } else if (type === 'open_telegram_modal' && onOpenTelegramModal) {
          onOpenTelegramModal();
          actionNotice = '⚡ Executed: Telegram Settings modal opened';
          handleClose();
        } else if (type === 'navigate' && onNavigate && res.action.tab) {
          onNavigate(res.action.tab, res.action.itemKey, {
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
          });
          actionNotice = `⚡ Executed: Navigated to ${res.action.tab}`;
        }
      }

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: res.reply || t('ai_no_response', 'No response received. Please try again.'),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionText: actionNotice,
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
