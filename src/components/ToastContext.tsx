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
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 pointer-events-none toast-context__container w-full max-w-sm px-4 sm:px-0">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: (
    <CheckCircle2 className="w-5 h-5 shrink-0" />
  ),
  error: (
    <XCircle className="w-5 h-5 shrink-0" />
  ),
  warning: (
    <AlertTriangle className="w-5 h-5 shrink-0" />
  ),
  info: (
    <Info className="w-5 h-5 shrink-0" />
  ),
};

// Official Flowbite Toast contextual styling (https://flowbite.com/docs/components/toast/):
// Colored icon chips (w-8 h-8 rounded-lg), light/dark tokens, and crisp borders
const TOAST_CLASSES: Record<ToastType, { chip: string }> = {
  success: {
    chip: 'text-green-500 bg-green-100 dark:bg-green-800 dark:text-green-200',
  },
  error: {
    chip: 'text-red-500 bg-red-100 dark:bg-red-800 dark:text-red-200',
  },
  warning: {
    chip: 'text-orange-500 bg-orange-100 dark:bg-orange-700 dark:text-orange-200',
  },
  info: {
    chip: 'text-blue-500 bg-blue-100 dark:bg-blue-800 dark:text-blue-200',
  },
};

const toastTheme = {
  root: {
    base: 'flex w-full max-w-sm items-center rounded-lg bg-white dark:bg-gray-800 p-4 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 shadow-lg animate-toast-in',
  },
  toggle: {
    base: 'ms-auto -mx-1.5 -my-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-white focus:ring-2 focus:ring-gray-300 focus:outline-none transition-colors p-1.5',
    icon: 'h-3.5 w-3.5',
  },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const styles = TOAST_CLASSES[toast.type] || TOAST_CLASSES.info;
  return (
    <FlowbiteToast theme={toastTheme} className="pointer-events-auto">
      <div className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${styles.chip}`}>
        {ICONS[toast.type]}
      </div>
      <div className="ms-3 text-sm font-normal break-words text-gray-900 dark:text-white">{toast.message}</div>
      <ToastToggle xIcon={X} onDismiss={() => onDismiss(toast.id)} />
    </FlowbiteToast>
  );
}
