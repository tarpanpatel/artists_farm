import React, { useState, useEffect } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from 'flowbite-react';
import { Lock, CheckCircle as CheckCircle2, ExternalLink, FileText, Scale, Lock as ShieldCheck } from './icons/FlowbiteIcons';
import { Button } from './Button';

interface TermsAcceptanceModalProps {
  tenantId?: number | string;
  tenantName?: string;
  isOpen?: boolean;
  onAccept?: () => void;
}

export const TermsAcceptanceModal: React.FC<TermsAcceptanceModalProps> = ({
  tenantId = 'default',
  tenantName = 'Your Property',
  isOpen: propIsOpen,
  onAccept,
}) => {
  const storageKey = `groundcode_terms_accepted_${tenantId}`;
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isChecked, setIsChecked] = useState<boolean>(false);

  useEffect(() => {
    if (propIsOpen !== undefined) {
      setIsOpen(propIsOpen);
      return;
    }
    const accepted = localStorage.getItem(storageKey);
    if (!accepted) {
      setIsOpen(true);
    }
  }, [storageKey, propIsOpen]);

  const handleConfirm = () => {
    if (!isChecked) return;
    localStorage.setItem(storageKey, new Date().toISOString());
    setIsOpen(false);
    if (onAccept) {
      onAccept();
    }
  };

  if (!isOpen) return null;

  return (
    <Modal show={isOpen} onClose={() => {}} size="lg" className="terms-acceptance-modal">
      <ModalHeader className="border-b border-slate-200 dark:border-slate-700 bg-slate-900 text-white rounded-t-lg">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <h3 className="text-base font-bold text-white">Terms of Service & Privacy Agreement</h3>
            <p className="text-2xs text-slate-300 font-normal">Service compliance terms for {tenantName}</p>
          </div>
        </div>
      </ModalHeader>

      <ModalBody className="p-6 space-y-4 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>1-Month Universal Free Trial • Zero Risk & No Lock-In</span>
          </div>
          <p className="text-emerald-700 dark:text-emerald-400 leading-relaxed text-2xs">
            Every property receives a 30-Day Free Trial. Billed at ₹1,499/month (1st key) + ₹350/extra key/month after trial via direct invoice. Cancel anytime.
          </p>
        </div>

        <div className="space-y-3 text-xs">
          <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-2xs text-slate-400">
            Key Policy Terms:
          </h4>

          <div className="flex items-start gap-2.5 p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
            <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-bold text-slate-900 dark:text-white block mb-0.5">Strict Zero Data Selling Guarantee</span>
              <span className="text-2xs text-slate-500 dark:text-slate-400">
                Your guest databases, booking registers, and financial income logs are 100% private to your property and never shared or monetized.
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
            <Scale className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-bold text-slate-900 dark:text-white block mb-0.5">Police C-Form & Statutory GST/FSSAI Compliance</span>
              <span className="text-2xs text-slate-500 dark:text-slate-400">
                Property owners are responsible for maintaining valid local police verification registers, guest ID proofs, FSSAI food licenses, and GST tax filings.
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
            <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-bold text-slate-900 dark:text-white block mb-0.5">Direct Offline Invoicing</span>
              <span className="text-2xs text-slate-500 dark:text-slate-400">
                Subscriptions are managed directly by Ground Code administration. No automated credit card recurring debits are performed without your explicit consent.
              </span>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
          <a
            href="./TERMS_AND_PRIVACY.md"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold"
          >
            <span>Read Complete Terms of Service & Privacy Policy Document</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <label className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => setIsChecked(e.target.checked)}
            className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
          />
          <span className="text-xs text-slate-800 dark:text-slate-200 leading-snug font-medium">
            I have read, understood, and agree to Ground Code's <strong>Terms of Service</strong>, <strong>Privacy Policy</strong>, and <strong>Cookie Policy</strong>.
          </span>
        </label>
      </ModalBody>

      <ModalFooter className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 flex items-center justify-between gap-3">
        <span className="text-2xs text-slate-500 dark:text-slate-400">
          {isChecked ? 'Ready to proceed' : 'Please check the agreement box to continue'}
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={handleConfirm}
          disabled={!isChecked}
          className="shadow-md"
        >
          <CheckCircle2 className="w-4 h-4 mr-1.5" />
          <span>Accept &amp; Continue to Dashboard</span>
        </Button>
      </ModalFooter>
    </Modal>
  );
};
