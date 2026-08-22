import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from './icons/FlowbiteIcons';
import { Toast as FlowbiteToast, ToastToggle } from 'flowbite-react';

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

// Flowbite's own toast docs (flowbite.com/docs/components/toast) style every
// variant the same way: a neutral card (bg-neutral-primary-soft) with a
// small colored icon "chip" - never a solid-colored toast body. Only the
// chip's soft/fg token pair changes per situation.
const BADGE_CLASSES: Record<ToastType, string> = {
  success: 'text-fg-success bg-success-soft',
  error: 'text-fg-danger bg-danger-soft',
  warning: 'text-fg-warning bg-warning-soft',
  info: 'text-fg-brand bg-brand-soft',
};

const toastTheme = {
  root: {
    base: 'flex w-full max-w-sm items-center rounded-base border border-default bg-neutral-primary-soft p-4 text-body shadow-xs animate-toast-in',
  },
  toggle: {
    base: 'ms-auto flex h-8 w-8 shrink-0 items-center justify-center rounded text-body hover:bg-neutral-secondary-medium hover:text-heading focus:outline-none focus:ring-4 focus:ring-neutral-tertiary',
    icon: 'h-4 w-4',
  },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  return (
    <FlowbiteToast theme={toastTheme} className="pointer-events-auto">
      <div className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded ${BADGE_CLASSES[toast.type]}`}>
        {ICONS[toast.type]}
      </div>
      <div className="ms-3 text-sm font-medium break-words">{toast.message}</div>
      <ToastToggle xIcon={X} onDismiss={() => onDismiss(toast.id)} />
    </FlowbiteToast>
  );
}
