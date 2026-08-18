import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextValue {
  showToast: (message: string, options?: { type?: ToastType; duration?: number }) => string;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback((message: string, options?: { type?: ToastType; duration?: number }) => {
    const id = `toast-${++counter}`;
    const toast: Toast = {
      id,
      message,
      type: options?.type || 'info',
      duration: options?.duration ?? 3000,
    };

    setToasts(prev => [...prev, toast]);

    if (toast.duration > 0) {
      const timer = setTimeout(() => removeToast(id), toast.duration);
      timersRef.current.set(id, timer);
    }

    return id;
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] flex flex-col items-center gap-2.5 pointer-events-none toast-context__container w-full max-w-sm px-4">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: (
    <CheckCircle2 className="w-4 h-4 shrink-0" />
  ),
  error: (
    <XCircle className="w-4 h-4 shrink-0" />
  ),
  warning: (
    <AlertTriangle className="w-4 h-4 shrink-0" />
  ),
  info: (
    <Info className="w-4 h-4 shrink-0" />
  ),
};

const BG_CLASSES: Record<ToastType, string> = {
  success: 'bg-emerald-600',
  error: 'bg-red-600',
  warning: 'bg-amber-600',
  info: 'bg-blue-600',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  return (
    <div
      className={`pointer-events-auto flex items-start gap-2.5 ${BG_CLASSES[toast.type]} text-white px-4 py-3 rounded-xl shadow-lg text-sm font-semibold animate-toast-in max-w-sm`}
    >
      {ICONS[toast.type]}
      <span className="flex-1 break-words">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 p-0.5 rounded hover:bg-white/20 transition-colors cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
