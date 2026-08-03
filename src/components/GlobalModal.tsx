import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

type ModalType = 'alert' | 'confirm' | 'success' | 'error';

interface ModalOptions {
  type: ModalType;
  title?: string;
  message: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export const GlobalModal = () => {
  const [modal, setModal] = useState<ModalOptions | null>(null);

  useEffect(() => {
    // Override window.alert
    const originalAlert = window.alert;
    window.alert = (message: any) => {
      setModal({
        type: 'alert',
        title: 'Notification',
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
        title: 'Please Confirm',
        message,
        onConfirm,
        onCancel,
      });
    };

    (window as any).showAlert = (message: string, type: ModalType = 'alert', title?: string) => {
      setModal({
        type,
        title: title || (type === 'error' ? 'Error' : type === 'success' ? 'Success' : 'Notification'),
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

  const getIcon = () => {
    switch (modal.type) {
      case 'error': return <AlertTriangle className="w-6 h-6 text-red-600" />;
      case 'success': return <CheckCircle className="w-6 h-6 text-emerald-600" />;
      case 'confirm': return <AlertTriangle className="w-6 h-6 text-amber-600" />;
      default: return <Info className="w-6 h-6 text-cyan-600" />;
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-5 flex items-start gap-4">
          <div className="shrink-0 bg-slate-50 p-2 rounded-full border border-slate-100">
            {getIcon()}
          </div>
          <div className="flex-1 pt-1">
            <h3 className="font-extrabold text-slate-900 text-lg mb-1">{modal.title}</h3>
            <p className="text-slate-600 text-sm font-medium leading-relaxed">{modal.message}</p>
          </div>
        </div>
        <div className="bg-slate-50 border-t border-slate-100 p-4 flex justify-end gap-3">
          {modal.type === 'confirm' ? (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-xl text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-2 rounded-xl bg-cyan-600 text-white font-bold text-sm shadow-md hover:bg-cyan-700 transition-colors"
              >
                Confirm
              </button>
            </>
          ) : (
            <button
              onClick={handleClose}
              className="px-5 py-2 rounded-xl bg-cyan-600 text-white font-bold text-sm shadow-md hover:bg-cyan-700 transition-colors"
            >
              Okay
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
