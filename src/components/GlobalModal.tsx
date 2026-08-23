import { useEffect, useRef, useState } from 'react';
import { Modal } from 'flowbite-react';
import { AlertTriangle, CheckCircle, Info, X } from './icons/FlowbiteIcons';
import { t } from '../i18n/en';

type ModalType = 'alert' | 'confirm' | 'success' | 'error';

interface ModalOptions {
  type: ModalType;
  title?: string;
  message: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

// Rebuilt as a real Flowbite right-side Drawer on 22 Aug 2026 (part of "only
// use Flowbite" sweep), then rebuilt AGAIN as a real Flowbite centered Modal
// on 23 Aug 2026 - same reason and same day as ConfirmDialogContext.tsx's
// identical rebuild (see that file's own comment): a short 1-2 line
// alert/confirm prompt in a full-height right-side drawer left most of the
// drawer an empty void, a bad fit unlike this app's other, genuinely-long-
// form drawers. This is the biggest single non-Flowbite surface in the app
// since window.alert/showConfirm/showAlert route through this one component
// from everywhere - see DESIGN.md's carve-out note for the "modal, not
// drawer" exception this and ConfirmDialogContext.tsx both fall under.
// z-9999: this app's own z-index scale (custom.css) already reserves an
// "always on top" tier for toasts + the confirm dialog specifically, so it
// stacks above an already-open drawer/page-modal (z-58) - e.g. an
// InventoryManagement.tsx "Delete category?" showConfirm() fired from
// inside an already-open management drawer.
export const GlobalModal = () => {
  const [modal, setModal] = useState<ModalOptions | null>(null);
  const modalRef = useRef(modal);
  modalRef.current = modal;

  // Same fix as ConfirmDialogContext.tsx's route-change auto-cancel, and for
  // the same reason: this modal is mounted once at the app root, so without
  // this, a pending window.showConfirm() (e.g. InventoryManagement.tsx's
  // "Delete category?") queued right before the user clicks to a different
  // tab would silently resurface later, stacked on unrelated UI on a page
  // that has nothing to do with the original action - confirmed 18 Aug 2026.
  useEffect(() => {
    const cancelPending = () => {
      if (modalRef.current) {
        modalRef.current.onCancel?.();
        setModal(null);
      }
    };
    window.addEventListener('hashchange', cancelPending);
    return () => window.removeEventListener('hashchange', cancelPending);
  }, []);

  useEffect(() => {
    // Override window.alert
    const originalAlert = window.alert;
    window.alert = (message: any) => {
      setModal({
        type: 'alert',
        title: t('global_modal_notification_title'),
        message: String(message),
      });
    };

    // Override window.confirm (Note: this makes confirm asynchronous!
    // We cannot fully simulate a synchronous window.confirm.
    // Code relying on `if (confirm('...'))` will break if we just override it like this.
    // We MUST refactor native confirm calls to use a custom promise or callback.
    // For now, we will expose a global function `window.showConfirm`.

    (window as any).showConfirm = (message: string, onConfirm: () => void, onCancel?: () => void) => {
      setModal({
        type: 'confirm',
        title: t('global_modal_confirm_title'),
        message,
        onConfirm,
        onCancel,
      });
    };

    (window as any).showAlert = (message: string, type: ModalType = 'alert', title?: string) => {
      setModal({
        type,
        title: title || (type === 'error' ? t('global_modal_error_title') : type === 'success' ? t('global_modal_success_title') : t('global_modal_notification_title')),
        message,
      });
    };

    return () => {
      window.alert = originalAlert;
    };
  }, []);

  if (!modal) return null;

  const handleClose = () => {
    if (modal.onCancel) modal.onCancel();
    setModal(null);
  };

  const handleConfirm = () => {
    if (modal.onConfirm) modal.onConfirm();
    setModal(null);
  };

  const iconStyles: Record<ModalType, string> = {
    error: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400',
    success: 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400',
    confirm: 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400',
    alert: 'bg-cyan-50 dark:bg-cyan-950 border-cyan-200 dark:border-cyan-800 text-cyan-600 dark:text-cyan-400',
  };

  const getIcon = () => {
    switch (modal.type) {
      case 'error': return <AlertTriangle className="w-5 h-5" />;
      case 'success': return <CheckCircle className="w-5 h-5" />;
      case 'confirm': return <AlertTriangle className="w-5 h-5" />;
      default: return <Info className="w-5 h-5" />;
    }
  };

  return (
    <Modal
      show
      onClose={handleClose}
      dismissible
      size="md"
      popup
      className="z-9999 global-modal"
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-lg global-modal__header">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 global-modal__icon-wrapper ${iconStyles[modal.type]}`}>
            {getIcon()}
          </div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white m-0 global-modal__title">{modal.title}</h2>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer global-modal__close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 global-modal__content">
        <p className="text-slate-600 dark:text-slate-300 text-sm font-medium leading-relaxed whitespace-pre-line global-modal__message">{modal.message}</p>
      </div>
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850 rounded-b-lg global-modal__footer">
        {modal.type === 'confirm' ? (
          <>
            <button
              type="button"
              onClick={handleClose}
              className="h-9 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer global-modal__btn global-modal__btn--cancel"
            >
              {t('cancel_button')}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="h-9 px-5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer global-modal__btn global-modal__btn--confirm"
            >
              {t('confirm_button')}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleClose}
            className="h-9 px-5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer global-modal__btn global-modal__btn--ok"
          >
            {t('okay_button')}
          </button>
        )}
      </div>
    </Modal>
  );
};
