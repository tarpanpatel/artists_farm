import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Modal } from 'flowbite-react';
import { AlertTriangle, Info, Trash2, X } from './icons/FlowbiteIcons';
import { t } from '../i18n/en';

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

// Rebuilt as a real Flowbite right-side Drawer on 22 Aug 2026 (part of "only
// use Flowbite" sweep), then rebuilt AGAIN as a real Flowbite centered Modal
// on 23 Aug 2026 (explicit user request/screenshot: a 2-line yes/no prompt
// rendered as a full-height right-side drawer left most of the drawer an
// empty void, with Cancel/Delete pinned far away at the very bottom - bad
// fit for a short confirmation, unlike the drawer's other users, which are
// genuinely long forms/lists). DESIGN.md's Flowbite Modals & Drawers
// Specification's "drawer, not centered popup" rule is deliberately NOT
// followed here - see this file's own carve-out note added there the same
// day. Kept in flowbite-react's own <Modal>, not hand-rolled, same as the
// drawer version was - just a different Flowbite primitive.
// z-[9999]: this is the one dialog custom.css's own z-index scale comment
// already reserves an "always on top" tier for (toasts + confirm dialog),
// specifically so it can stack above an already-open drawer/page-modal at
// z-58 - e.g. confirming "Delete" from inside an open Booking Details
// drawer, exactly the flow that surfaced this rebuild. The drawer version
// was actually still sitting at z-58, one tier below where its own
// documented spot has always been - fixed as part of this same change.
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

  // A pending confirm() is a promise some now-possibly-unmounted component is
  // still awaiting - this provider sits at the app root above the router, so
  // without this, a delete confirmation queued right before the user clicks
  // to a different tab (an ordinary "clicked delete, had second thoughts,
  // clicked away" flow, not an edge case) would silently resurface later,
  // stacked on top of unrelated UI on a page that has nothing to do with the
  // original delete. Auto-cancel on navigation instead of leaving it pending.
  const pendingDialogRef = useRef(pendingDialog);
  pendingDialogRef.current = pendingDialog;
  useEffect(() => {
    const cancelPending = () => {
      if (pendingDialogRef.current) {
        pendingDialogRef.current.resolve(false);
        setPendingDialog(null);
      }
    };
    window.addEventListener('hashchange', cancelPending);
    return () => window.removeEventListener('hashchange', cancelPending);
  }, []);

  const iconStyles: Record<ConfirmVariant, string> = {
    danger: 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400',
    info: 'bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400',
    warning: 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
  };

  const variant = pendingDialog?.options.variant || 'warning';

  return (
    <ConfirmContext.Provider value={{ confirm, alertModal }}>
      {children}
      {pendingDialog && (
        <Modal
          show
          onClose={handleCancel}
          size="md"
          className="z-9999 confirm-dialog"
        >
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-lg confirm-dialog__header">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 confirm-dialog__icon-wrapper ${iconStyles[variant]}`}>
                {variant === 'danger' ? (
                  <Trash2 className="w-4 h-4 confirm-dialog__icon" />
                ) : variant === 'info' ? (
                  <Info className="w-4 h-4 confirm-dialog__icon" />
                ) : (
                  <AlertTriangle className="w-4 h-4 confirm-dialog__icon" />
                )}
              </div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white m-0 truncate confirm-dialog__title">
                {pendingDialog.options.title ||
                  (variant === 'danger' ? t('confirm_action_title') : t('confirmation_title'))}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer shrink-0 confirm-dialog__close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 confirm-dialog__content">
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line confirm-dialog__message">
              {pendingDialog.options.message}
            </p>
          </div>

          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850 rounded-b-lg confirm-dialog__footer">
            {!pendingDialog.isAlert && (
              <button
                type="button"
                onClick={handleCancel}
                className="h-9 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer confirm-dialog__btn confirm-dialog__btn--cancel"
              >
                {pendingDialog.options.cancelText || t('cancel_button')}
              </button>
            )}
            <button
              type="button"
              onClick={handleConfirm}
              className={`h-9 px-5 rounded-lg text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer confirm-dialog__btn confirm-dialog__btn--confirm ${
                variant === 'danger'
                  ? 'bg-red-600 hover:bg-red-700 active:bg-red-800'
                  : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
              }`}
            >
              {pendingDialog.options.confirmText ||
                (pendingDialog.isAlert ? t('okay_button') : t('confirm_button'))}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}
