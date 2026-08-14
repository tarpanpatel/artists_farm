import React from 'react';
import { X as CloseIcon, Share, Plus, ArrowLeft, ArrowRight, BookOpen, Copy, Printer, Bookmark } from 'lucide-react';

interface IOSInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  isIPad: boolean;
}

/**
 * Full illustrated walkthrough for installing on iOS/iPadOS. Safari gives no
 * website an API to trigger "Add to Home Screen" itself - only the user
 * tapping Share, themselves, can do it (a hard Apple platform restriction,
 * not a gap in this app) - so the best this can do is make each step
 * unmistakable. Each step below is a small drawn mockup of the actual Safari
 * UI (toolbar / share sheet / add-confirmation dialog) rather than plain
 * text, since "tap Share" alone doesn't tell anyone WHERE that is or WHAT
 * it looks like. No real screenshots are embedded (nothing here is a
 * network image) - these are built entirely from divs, borders and Lucide
 * icons, close enough to be immediately recognizable against the real UI.
 */
export const IOSInstallModal: React.FC<IOSInstallModalProps> = ({ isOpen, onClose, isIPad }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 ios-install-modal">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200 ios-install-modal__dialog">
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 p-5 pb-4 flex items-start justify-between gap-3 ios-install-modal__header">
          <div>
            <h3 className="ios-install-modal__subtitle font-semibold text-slate-900 dark:text-white text-lg">Install Ground Code App</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              iPhone/iPad's browser doesn't let a website install itself - only you tapping these steps can. Takes about 10 seconds.
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg cursor-pointer"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 ios-install-modal__steps">
          {/* Step 1: Tap Share */}
          <div className="flex gap-3">
            <div className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center mt-0.5">1</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
                Tap <strong>Share</strong> {isIPad ? 'at the top of the screen' : 'in the bar at the bottom of your screen'}
              </p>
              {/* Mockup: Safari toolbar with Share highlighted */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-2.5 flex items-center justify-between">
                <ArrowLeft className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                <span className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 shadow-md ring-4 ring-blue-200 dark:ring-blue-900/50 animate-pulse">
                  <Share className="w-4 h-4 text-white" />
                </span>
                <Bookmark className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                <BookOpen className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              </div>
            </div>
          </div>

          {/* Step 2: Add to Home Screen */}
          <div className="flex gap-3">
            <div className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center mt-0.5">2</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
                Scroll the share sheet down and tap <strong>"Add to Home Screen"</strong>
              </p>
              {/* Mockup: share sheet with Add to Home Screen highlighted */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
                <div className="flex justify-center pt-2 pb-1">
                  <div className="w-8 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                </div>
                <div className="flex items-center justify-center gap-3 px-3 pb-3">
                  {['bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500'].map((c, i) => (
                    <span key={i} className={`w-7 h-7 rounded-full ${c} opacity-60`} />
                  ))}
                </div>
                <div className="border-t border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2.5 px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </div>
                  <div className="flex items-center gap-2.5 px-3 py-2 bg-blue-50 dark:bg-blue-950/40 ring-1 ring-inset ring-blue-300 dark:ring-blue-700">
                    <span className="w-3.5 h-3.5 rounded-[4px] bg-blue-600 flex items-center justify-center shrink-0">
                      <Plus className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                    </span>
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Add to Home Screen</span>
                  </div>
                  <div className="flex items-center gap-2.5 px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
                    <Printer className="w-3.5 h-3.5" /> Print
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3: Tap Add */}
          <div className="flex gap-3">
            <div className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center mt-0.5">3</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
                Tap <strong>"Add"</strong> in the top-right corner
              </p>
              {/* Mockup: confirmation dialog with Add highlighted */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">Cancel</span>
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">New Home Screen Icon</span>
                  <span className="text-[11px] font-semibold text-white bg-blue-600 px-2 py-0.5 rounded-md ring-2 ring-blue-200 dark:ring-blue-900/50">Add</span>
                </div>
                <div className="flex items-center gap-2.5 px-3 py-3">
                  <div className="w-9 h-9 rounded-xl bg-[var(--app-primary-600,#2563eb)] text-white flex items-center justify-center text-xs font-semibold shrink-0">AF</div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">Ground Code App</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">artistic-sthan.com</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 pt-0 ios-install-modal__footer">
          <button
            onClick={onClose}
            className="w-full text-center text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 py-2 cursor-pointer"
          >
            Got it, maybe later
          </button>
        </div>
      </div>
    </div>
  );
};

