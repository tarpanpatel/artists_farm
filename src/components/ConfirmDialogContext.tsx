import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertTriangle, Info, Trash2, X } from 'lucide-react';

export type ConfirmVariant = 'danger' | 'warning' | 'info';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  alertModal: (options: ConfirmOptions | string) => Promise<void>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmDialogProvider');
  }
  return ctx;
}

interface PendingDialog {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
  isAlert?: boolean;
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [pendingDialog, setPendingDialog] = useState<PendingDialog | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const normalizedOpts: ConfirmOptions =
        typeof options === 'string' ? { message: options } : options;
      setPendingDialog({ options: normalizedOpts, resolve, isAlert: false });
    });
  }, []);

  const alertModal = useCallback((options: ConfirmOptions | string): Promise<void> => {
    return new Promise<void>((resolve) => {
      const normalizedOpts: ConfirmOptions =
        typeof options === 'string' ? { message: options } : options;
      setPendingDialog({
        options: normalizedOpts,
        resolve: () => resolve(),
        isAlert: true,
      });
    });
  }, []);

  const handleConfirm = () => {
    if (pendingDialog) {
      pendingDialog.resolve(true);
      setPendingDialog(null);
    }
  };

  const handleCancel = () => {
    if (pendingDialog) {
      pendingDialog.resolve(false);
      setPendingDialog(null);
    }
  };

  return (
    <ConfirmContext.Provider value={{ confirm, alertModal }}>
      {children}
      {pendingDialog && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={handleCancel}
        >
          <div
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-w-md w-full p-6 text-left transform transition-all animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div
                className={`p-3 rounded-xl shrink-0 ${
                  pendingDialog.options.variant === 'danger'
                    ? 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400'
                    : pendingDialog.options.variant === 'info'
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
                    : 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
                }`}
              >
                {pendingDialog.options.variant === 'danger' ? (
                  <Trash2 className="w-6 h-6" />
                ) : pendingDialog.options.variant === 'info' ? (
                  <Info className="w-6 h-6" />
                ) : (
                  <AlertTriangle className="w-6 h-6" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {pendingDialog.options.title ||
                    (pendingDialog.options.variant === 'danger'
                      ? 'Confirm Action'
                      : 'Confirmation')}
                </h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                  {pendingDialog.options.message}
                </p>
              </div>

              <button
                onClick={handleCancel}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              {!pendingDialog.isAlert && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  {pendingDialog.options.cancelText || 'Cancel'}
                </button>
              )}
              <button
                type="button"
                onClick={handleConfirm}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs text-white transition-all shadow-md cursor-pointer ${
                  pendingDialog.options.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700 active:bg-red-800'
                    : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
                }`}
              >
                {pendingDialog.options.confirmText ||
                  (pendingDialog.isAlert ? 'OK' : 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
