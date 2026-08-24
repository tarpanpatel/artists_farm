import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from './icons/FlowbiteIcons';
import { Toast as FlowbiteToast, ToastToggle } from 'flowbite-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: React.ReactNode;
  type: ToastType;
  duration: number;
}

// message widened from string to React.ReactNode (23 Aug 2026) so a toast can
// carry an inline actionable link (e.g. "No checked-in house guest. <a
// href="#bookings">Go to bookings page</a> to check one in.") instead of only
// ever being plain text - see KitchenManagement.tsx's disabled "Send Order to
// Kitchen" click handler for the first real use. Every existing plain-string
// call site keeps working unchanged since a string is already a valid
// ReactNode.
interface ToastContextValue {
  showToast: (message: React.ReactNode, options?: { type?: ToastType; duration?: number }) => string;
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

  const showToast = useCallback((message: React.ReactNode, options?: { type?: ToastType; duration?: number }) => {
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

// Flowbite Toast contextual styling (flowbite.com/docs/components/toast):
// Distinct colored icon chips, left accent borders, and prominent elevation shadows
const TOAST_CLASSES: Record<ToastType, { chip: string; border: string }> = {
  success: {
    chip: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/80 dark:text-emerald-400',
    border: 'border-l-4 border-l-emerald-500 border-r border-t border-b border-slate-200 dark:border-slate-700/80',
  },
  error: {
    chip: 'text-rose-600 bg-rose-100 dark:bg-rose-950/80 dark:text-rose-400',
    border: 'border-l-4 border-l-rose-500 border-r border-t border-b border-slate-200 dark:border-slate-700/80',
  },
  warning: {
    chip: 'text-amber-600 bg-amber-100 dark:bg-amber-950/80 dark:text-amber-400',
    border: 'border-l-4 border-l-amber-500 border-r border-t border-b border-slate-200 dark:border-slate-700/80',
  },
  info: {
    chip: 'text-blue-600 bg-blue-100 dark:bg-blue-950/80 dark:text-blue-400',
    border: 'border-l-4 border-l-blue-500 border-r border-t border-b border-slate-200 dark:border-slate-700/80',
  },
};

const toastTheme = {
  root: {
    base: 'flex w-full max-w-sm items-center rounded-lg bg-white dark:bg-slate-800 p-3.5 text-slate-800 dark:text-slate-100 shadow-2xl shadow-slate-900/25 dark:shadow-black/70 animate-toast-in',
  },
  toggle: {
    base: 'ms-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white focus:outline-none transition-colors',
    icon: 'h-3.5 w-3.5',
  },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const styles = TOAST_CLASSES[toast.type] || TOAST_CLASSES.info;
  return (
    <FlowbiteToast theme={toastTheme} className={`pointer-events-auto ${styles.border}`}>
      <div className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${styles.chip}`}>
        {ICONS[toast.type]}
      </div>
      <div className="ms-3 text-xs font-semibold break-words text-slate-800 dark:text-slate-100">{toast.message}</div>
      <ToastToggle xIcon={X} onDismiss={() => onDismiss(toast.id)} />
    </FlowbiteToast>
  );
}
