import React, { useEffect, useRef, useState } from 'react';
import { Bot, GitFork, Send, X } from 'lucide-react';
import { TabType } from './Navigation';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  quickReplies?: string[];
  timestamp: number;
}

interface PendingIntent {
  intent: string;
  params: Record<string, any>;
}

interface AIChatWidgetProps {
  activeRole: string;
  propertyName?: string;
  onNavigate?: (tabKey: TabType, uniqueKey?: string) => void;
}

const AI_API_URL = (() => {
  const isDev = window.location.port === '3000';
  const base = isDev ? '' : window.location.pathname.replace(/#.*$/, '').replace(/\/[^/]*$/, '');
  return `${base}/php/api/ai_assistant.php`;
})();

const QUICK_ACTIONS = ['+ Add Booking', 'Log Expense', 'KDS Kitchen'];

export const AIChatWidget: React.FC<AIChatWidgetProps> = ({ activeRole, propertyName = 'Artists Farm Jaipur', onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [engine, setEngine] = useState<'offline' | 'gemini' | 'openai'>('offline');
  const [pending, setPending] = useState<PendingIntent | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isOpen]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text: trimmed, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsSending(true);

    try {
      const res = await fetch(AI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, role: activeRole, propertyName, pending }),
      });
      const json = await res.json();

      if (json.status === 'success') {
        setEngine(json.engine || 'offline');
        setPending(json.pending || null);
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', text: json.reply, quickReplies: json.quickReplies, timestamp: Date.now() },
        ]);
        if (json.action?.type === 'navigate' && onNavigate) {
          onNavigate(json.action.tabKey as TabType, json.action.uniqueKey);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', text: "Sorry, I couldn't process that right now.", timestamp: Date.now() },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', text: 'Connection error - please try again.', timestamp: Date.now() },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleQuickAction = (label: string) => {
    if (label === 'KDS Kitchen') {
      onNavigate?.('kitchen', 'kitchen_orders');
      return;
    }
    if (label === '+ Add Booking') {
      sendMessage('Add a new booking');
      return;
    }
    if (label === 'Log Expense') {
      setInput('Buy ');
      return;
    }
    sendMessage(label);
  };

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-lg hover:scale-105 transition-transform"
          aria-label="Open Ground Code AI"
        >
          <GitFork size={24} />
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-end sm:p-5 bg-black/20 sm:bg-transparent">
          <div className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[600px] sm:w-[400px] sm:rounded-2xl dark:bg-gray-900">
            <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-blue-600 to-indigo-700 px-4 py-4 text-white">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <GitFork size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Ground Code AI</span>
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                      {engine === 'offline' ? 'Offline Engine Active' : `${engine} Active`}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-white/80">
                    Role: {activeRole} • {propertyName}
                  </div>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white" aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <div className="flex gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40">
                    <Bot size={14} />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-3 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                    Ask me to log an expense ("Buy 2 air freshener"), add a booking, or jump to any screen ("go to expenses").
                  </div>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id}>
                  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
                    {msg.role === 'assistant' && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40">
                        <Bot size={14} />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm ${
                        msg.role === 'user'
                          ? 'rounded-tr-sm bg-blue-600 text-white'
                          : 'rounded-tl-sm bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                  {msg.quickReplies && msg.quickReplies.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2 pl-9">
                      {msg.quickReplies.map((qr) => (
                        <button
                          key={qr}
                          onClick={() => handleQuickAction(qr)}
                          className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                        >
                          {qr}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {isSending && (
                <div className="flex gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40">
                    <Bot size={14} />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-3 text-sm text-gray-400 dark:bg-gray-800">
                    Thinking...
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 px-4 pb-3 pt-2 dark:border-gray-800">
              <div className="mb-2 flex gap-2 overflow-x-auto">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action}
                    onClick={() => handleQuickAction(action)}
                    className="shrink-0 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    {action}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
                  placeholder="Ask AI or perform a task..."
                  className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-blue-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={isSending || !input.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white disabled:opacity-40"
                  aria-label="Send"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
