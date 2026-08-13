import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Bot, User, Settings2, Wifi, WifiOff, Loader2, AlertCircle } from 'lucide-react';
import { t } from '../i18n/en';

interface LocalLLMChatProps {
  propertyId?: number;
  propertyName?: string;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface Model {
  id: string;
  name: string;
  modified_at: string;
}

export const LocalLLMChat: React.FC<LocalLLMChatProps> = ({ propertyId, propertyName }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hello! I'm your local AI assistant for ${propertyName || 'your property'}. I can help you with reservations, inventory, kitchen operations, and more. How can I assist you today?`,
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [errorMessage, setErrorMessage] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  const checkConnection = useCallback(async () => {
    try {
      const response = await fetch('/php/api/local_llm.php?action=list_local_llm_models');
      if (response.ok) {
        const data = await response.json();
        if (data.models && Array.isArray(data.models)) {
          setModels(data.models);
          setSelectedModel(data.models[0]?.id || '');
          setConnectionStatus('connected');
        } else {
          setConnectionStatus('error');
          setErrorMessage('No models found on local LLM server');
        }
      } else {
        setConnectionStatus('error');
        setErrorMessage(`Server responded with ${response.status}`);
      }
    } catch (err) {
      setConnectionStatus('error');
      setErrorMessage('Cannot connect to local LLM server. Make sure Ollama, LM Studio, or llama.cpp is running.');
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setStreamingContent('');

    try {
      const response = await fetch('/php/api/local_llm.php?action=local_llm_chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          })),
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let assistantContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              assistantContent += content;
              setStreamingContent(assistantContent);
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
      }]);
      setStreamingContent('');

    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Failed to get response from LLM'}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="local-llm-chat h-[calc(100vh-120px)] flex flex-col max-w-4xl mx-auto">
      {/* Header */}
      <div className="local-llm-chat__header flex items-center justify-between mb-4">
        <div className="local-llm-chat__header-left">
          <h2 className="local-llm-chat__title local-llm-chat__heading text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bot className="w-6 h-6 text-purple-600" />
            {t('local_llm_chat_heading', 'Local AI Assistant')}
          </h2>
          <p className="local-llm-chat__description text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('local_llm_chat_description', 'Chat with a local LLM about your property operations')}
          </p>
        </div>
        <div className="local-llm-chat__header-right flex items-center gap-3">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="local-llm-chat__model-select text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          >
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.name || m.id}</option>
            ))}
          </select>
          <div className={`local-llm-chat__status flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full ${
            connectionStatus === 'connected'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
              : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'
          }`}>
            {connectionStatus === 'connected' ? (
              <><Wifi className="w-3.5 h-3.5" /> Connected</>
            ) : connectionStatus === 'checking' ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking...</>
            ) : (
              <><WifiOff className="w-3.5 h-3.5" /> Disconnected</>
            )}
          </div>
        </div>
      </div>

      {/* Connection Error Banner */}
      {connectionStatus === 'error' && (
        <div className="local-llm-chat__error-banner mb-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="local-llm-chat__error-body flex-1">
            <p className="local-llm-chat__error-title text-sm text-red-800 dark:text-red-200 font-medium">Local LLM Server Unavailable</p>
            <p className="local-llm-chat__error-message text-xs text-red-600 dark:text-red-400 mt-1">{errorMessage}</p>
            <p className="local-llm-chat__error-hint text-xs text-red-600 dark:text-red-400 mt-1">
              Start Ollama (ollama serve), LM Studio, or llama.cpp server, then refresh.
            </p>
          </div>
          <button
            onClick={checkConnection}
            className="local-llm-chat__retry-btn text-xs bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="local-llm-chat__messages flex-1 overflow-y-auto bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm mb-4">
        <div className="local-llm-chat__messages-list p-4 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`local-llm-chat__message local-llm-chat__message--${msg.role} flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role !== 'user' && (
                <div className="local-llm-chat__avatar local-llm-chat__avatar--bot w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
              )}
              <div className={`local-llm-chat__bubble max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-md'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-bl-md'
              }`}>
                <p className="local-llm-chat__bubble-text text-sm whitespace-pre-wrap">{msg.content}</p>
                <p className={`local-llm-chat__timestamp text-[10px] mt-1.5 ${msg.role === 'user' ? 'text-blue-100' : 'text-slate-400'}`}>
                  {msg.timestamp.toLocaleTimeString()}
                </p>
              </div>
              {msg.role === 'user' && (
                <div className="local-llm-chat__avatar local-llm-chat__avatar--user w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
              )}
            </div>
          ))}
          {isLoading && streamingContent && (
            <div className="local-llm-chat__message local-llm-chat__message--streaming flex gap-3 justify-start">
              <div className="local-llm-chat__avatar local-llm-chat__avatar--bot w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="local-llm-chat__bubble max-w-[80%] rounded-2xl rounded-bl-md px-4 py-3 bg-slate-100 dark:bg-slate-700">
                <p className="local-llm-chat__bubble-text text-sm whitespace-pre-wrap">{streamingContent}</p>
              </div>
            </div>
          )}
          {isLoading && !streamingContent && (
            <div className="local-llm-chat__message local-llm-chat__message--loading flex gap-3 justify-start">
              <div className="local-llm-chat__avatar local-llm-chat__avatar--bot w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="local-llm-chat__bubble rounded-2xl rounded-bl-md px-4 py-3 bg-slate-100 dark:bg-slate-700">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="local-llm-chat__composer flex gap-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('local_llm_input_placeholder', 'Type your message...')}
          rows={1}
          className="local-llm-chat__input flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          disabled={isLoading || connectionStatus !== 'connected'}
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !input.trim() || connectionStatus !== 'connected'}
          className="local-llm-chat__send-btn bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white font-bold py-2 px-4 rounded-xl transition-colors flex items-center gap-2"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Context Info */}
      <div className="local-llm-chat__context mt-3 flex items-center gap-4 text-xs text-slate-400">
        <span className="local-llm-chat__context-model flex items-center gap-1">
          <Settings2 className="w-3.5 h-3.5" />
          Model: {selectedModel || 'None selected'}
        </span>
        {propertyId && (
          <span className="local-llm-chat__context-property">Property: {propertyName || propertyId}</span>
        )}
      </div>
    </div>
  );
};
