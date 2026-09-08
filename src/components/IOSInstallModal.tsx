import React from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from 'flowbite-react';
import { Share, Plus, ArrowLeft, ArrowRight, BookOpen, Copy, Printer, Bookmark } from './icons/FlowbiteIcons';
import { Button } from './Button';

interface IOSInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  isIPad: boolean;
}

export const IOSInstallModal: React.FC<IOSInstallModalProps> = ({ isOpen, onClose, isIPad }) => {
  return (
    <Modal show={isOpen} onClose={onClose} className="z-[9999]" size="md" dismissible>
      <ModalHeader as="div">
        <div>
          <h3 className="ios-install-modal__subtitle font-semibold text-slate-900 dark:text-white text-lg">Install Ground Code App</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-normal">
            iPhone/iPad's browser doesn't let a website install itself - only you tapping these steps can. Takes about 10 seconds.
          </p>
        </div>
      </ModalHeader>
      <ModalBody className="space-y-5 ios-install-modal__steps">
        {/* Step 1: Tap Share */}
        <div className="flex gap-3">
          <div className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center mt-0.5">1</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
              Tap <strong>Share</strong> {isIPad ? 'at the top of the screen' : 'in the bar at the bottom of your screen'}
            </p>
            {/* Mockup: Safari toolbar with Share highlighted */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-2.5 flex items-center justify-between">
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
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-md">
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
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-md overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                <span className="text-[11px] text-slate-400 dark:text-slate-500">Cancel</span>
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">New Home Screen Icon</span>
                <span className="text-[11px] font-semibold text-white bg-blue-600 px-2 py-0.5 rounded-md ring-2 ring-blue-200 dark:ring-blue-900/50">Add</span>
              </div>
              <div className="flex items-center gap-2.5 px-3 py-3">
                <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-semibold shrink-0">AF</div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">Ground Code App</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">ground-code.com</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ModalBody>
      <ModalFooter className="justify-center">
        <Button variant="secondary" onClick={onClose} size="sm">
          Got it, maybe later
        </Button>
      </ModalFooter>
    </Modal>
  );
};

