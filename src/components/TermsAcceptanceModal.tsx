import React, { useState, useEffect, useRef } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from 'flowbite-react';
import { Lock, CheckCircle as CheckCircle2, ExternalLink, FileText, Scale, Lock as ShieldCheck, AlertTriangle } from './icons/FlowbiteIcons';
import { Button } from './Button';
import { useToast } from './ToastContext';
import termsDocRaw from '../../TERMS_AND_PRIVACY.md?raw';

interface TermsAcceptanceModalProps {
  tenantId?: number | string;
  tenantName?: string;
  isOpen?: boolean;
  onAccept?: () => void;
}

// Highlights shown inline in the acceptance modal - hand-picked from TERMS_AND_PRIVACY.md's real
// clauses (not invented), grouped to mirror that document's own PART I/II/III structure. The full
// document itself is rendered verbatim (see renderMarkdownLite below) in the separate "Read
// Complete..." modal, so these are a genuine summary of the same source, not a second, drifting
// copy of the terms.
const HIGHLIGHT_SECTIONS: { title: string; icon: React.FC<any>; points: string[] }[] = [
  {
    title: 'Terms of Service',
    icon: Scale,
    points: [
      'You must be 18+ and legally authorized to operate your homestay, villa, guesthouse, or resort, and responsible for local hospitality, FSSAI, and Police Verification (C-Form) compliance.',
      'Every property gets a 30-Day Free Trial - no credit card required, no lock-in.',
      'GroundCode Pro: ₹1,499/month (or ₹14,990/year) for the first key, plus ₹350/month per additional key.',
      'Billing is direct and offline via manual invoice - no automated recurring card debits without your explicit authorization.',
      'You control staff PINs/access roles and are responsible for accurate GST/tax filings.',
      "Telegram alerts and iCal/OTA calendar sync are provided as-is - Ground Code isn't responsible for delays or inaccuracies from third-party OTA feeds.",
      'Cancel anytime, no penalty - and request a full data export before closing your account.',
      '99.9% uptime target; not liable for indirect damages from outages, ISP failures, or third-party hardware issues.',
    ],
  },
  {
    title: 'Privacy Policy',
    icon: Lock,
    points: [
      '100% Data Ownership: your guest records, folios, financial logs, and inventory data remain exclusively yours.',
      'Strict Zero Data Selling Guarantee - your data is never sold, rented, or monetized to ad networks, data brokers, or competitors.',
      "Multi-tenant database isolation keeps your property's data inaccessible to other subscribers.",
      'Data collected is limited to what the PMS needs: your business details, guest ID/contact info for statutory police registers, and staff PIN hashes/access logs.',
      'Security: TLS/HTTPS encryption in transit, one-way hashed PIN credentials, and guest ID uploads restricted to authorized staff only.',
    ],
  },
  {
    title: 'Cookie & Session Policy',
    icon: FileText,
    points: [
      'Only essential session cookies and local storage are used - to keep you logged in, remember your property workspace, and secure API requests.',
      'No third-party ad-tracking or cross-site telemetry cookies are used inside the dashboard.',
    ],
  },
];

// Minimal markdown -> JSX renderer covering exactly the subset TERMS_AND_PRIVACY.md actually
// uses (#/##/### headings, ---, * bullets, 1. numbered lists, **bold**, *italic*, plain
// paragraphs). Not a general-purpose parser - deliberately small rather than pulling in a
// markdown dependency for one document.
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*.+?\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={`${keyPrefix}-b-${i++}`}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={`${keyPrefix}-i-${i++}`}>{token.slice(1, -1)}</em>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function renderMarkdownLite(md: string): React.ReactNode[] {
  const lines = md.split('\n');
  const nodes: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let key = 0;

  const flushList = () => {
    if (listBuffer.length && listType) {
      const items = listBuffer.map((item, idx) => <li key={idx}>{renderInline(item, `li-${key}-${idx}`)}</li>);
      nodes.push(
        listType === 'ul'
          ? <ul key={`list-${key++}`} className="list-disc pl-5 space-y-1 mb-3">{items}</ul>
          : <ol key={`list-${key++}`} className="list-decimal pl-5 space-y-1 mb-3">{items}</ol>
      );
    }
    listBuffer = [];
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { flushList(); continue; }
    if (line === '---') { flushList(); nodes.push(<hr key={`hr-${key++}`} className="my-3 border-slate-200 dark:border-slate-700" />); continue; }
    if (line.startsWith('### ')) { flushList(); nodes.push(<h4 key={`h4-${key++}`} className="text-sm font-bold text-slate-900 dark:text-white mt-4 mb-1.5">{renderInline(line.slice(4), `h4-${key}`)}</h4>); continue; }
    if (line.startsWith('## ')) { flushList(); nodes.push(<h3 key={`h3-${key++}`} className="text-base font-bold text-slate-900 dark:text-white mt-5 mb-2">{renderInline(line.slice(3), `h3-${key}`)}</h3>); continue; }
    if (line.startsWith('# ')) { flushList(); nodes.push(<h2 key={`h2-${key++}`} className="text-lg font-extrabold text-slate-900 dark:text-white mb-2">{renderInline(line.slice(2), `h2-${key}`)}</h2>); continue; }

    const bulletMatch = line.match(/^\*\s+(.*)$/);
    const numberedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (bulletMatch) {
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listBuffer.push(bulletMatch[1]);
      continue;
    }
    if (numberedMatch) {
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listBuffer.push(numberedMatch[1]);
      continue;
    }
    flushList();

    // Whole-line italic, e.g. *Last Updated: August 27, 2026*
    if (/^\*[^*].*[^*]\*$/.test(line)) {
      nodes.push(<p key={`p-${key++}`} className="text-xs italic text-slate-500 dark:text-slate-400 mb-2">{line.slice(1, -1)}</p>);
      continue;
    }
    nodes.push(<p key={`p-${key++}`} className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-2">{renderInline(line, `p-${key}`)}</p>);
  }
  flushList();
  return nodes;
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
  const [hasScrolledHighlights, setHasScrolledHighlights] = useState<boolean>(false);
  const [showFullDocModal, setShowFullDocModal] = useState<boolean>(false);
  const highlightsRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

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

  // If the highlights box doesn't actually need scrolling (tall viewport, short content),
  // don't leave the checkbox permanently locked with nothing to scroll toward.
  useEffect(() => {
    if (isOpen && highlightsRef.current) {
      const el = highlightsRef.current;
      if (el.scrollHeight <= el.clientHeight + 4) {
        setHasScrolledHighlights(true);
      }
    }
  }, [isOpen]);

  const handleHighlightsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 16) {
      setHasScrolledHighlights(true);
    }
  };

  const handleConfirm = () => {
    localStorage.setItem(storageKey, new Date().toISOString());
    setIsOpen(false);
    if (onAccept) {
      onAccept();
    }
  };

  // Accept & Continue stays visually greyed-out but genuinely clickable while the gate isn't
  // satisfied, specifically so a click on it can explain WHY instead of silently doing nothing
  // (a real `disabled` button swallows the click entirely).
  const handleAcceptClick = () => {
    if (!hasScrolledHighlights) {
      showToast('Please scroll through the highlights above before accepting.', { type: 'error' });
      return;
    }
    if (!isChecked) {
      showToast('Please check the agreement box to continue.', { type: 'error' });
      return;
    }
    handleConfirm();
  };

  const canAccept = hasScrolledHighlights && isChecked;

  if (!isOpen) return null;

  return (
    <>
      <Modal show={isOpen} onClose={() => {}} size="lg" className="terms-acceptance-modal">
        <ModalHeader className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-t-lg">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-emerald-400 shrink-0" />
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Terms of Service & Privacy Agreement</h3>
              <p className="text-2xs text-slate-500 dark:text-slate-300 font-normal">Service compliance terms for {tenantName}</p>
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

          <div className="space-y-2">
            <h4 className="font-bold uppercase tracking-wider text-2xs text-slate-500 dark:text-slate-400">
              Highlights:
            </h4>
            <div
              ref={highlightsRef}
              onScroll={handleHighlightsScroll}
              className="max-h-56 overflow-y-auto pr-1 space-y-4 border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-800/30"
            >
              {HIGHLIGHT_SECTIONS.map((section) => (
                <div key={section.title}>
                  <h5 className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    <section.icon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    {section.title}
                  </h5>
                  <ul className="space-y-1.5">
                    {section.points.map((point, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 leading-snug">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {!hasScrolledHighlights && (
              <p className="text-2xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Scroll to the end of the highlights above to continue.
              </p>
            )}
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setShowFullDocModal(true)}
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
            >
              <span>Read Complete Terms of Service & Privacy Policy Document</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          <label
            className={`flex items-start gap-3 p-3 rounded-xl select-none border transition-colors ${
              hasScrolledHighlights
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/60 cursor-pointer'
                : 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-75'
            }`}
          >
            <input
              type="checkbox"
              checked={isChecked}
              disabled={!hasScrolledHighlights}
              onChange={(e) => setIsChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
            />
            <span className={`text-xs leading-snug font-medium ${hasScrolledHighlights ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>
              I have read, understood, and agree to Ground Code's <strong>Terms of Service</strong>, <strong>Privacy Policy</strong>, and <strong>Cookie Policy</strong>.
              {!hasScrolledHighlights && (
                <span className="block mt-1 text-2xs italic">Scroll through the highlights above to enable this checkbox.</span>
              )}
            </span>
          </label>
        </ModalBody>

        <ModalFooter className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 flex items-center justify-between gap-3">
          <span className="text-2xs text-slate-500 dark:text-slate-400">
            {canAccept ? 'Ready to proceed' : !hasScrolledHighlights ? 'Scroll through the highlights to continue' : 'Please check the agreement box to continue'}
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={handleAcceptClick}
            className={`shadow-md ${!canAccept ? 'opacity-50 cursor-not-allowed hover:bg-blue-600!' : ''}`}
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            <span>Accept &amp; Continue to Dashboard</span>
          </Button>
        </ModalFooter>
      </Modal>

      {/* Secondary modal, stacked above the acceptance modal itself. flowbite-react's own
          Modal root base (theme.js) is "fixed inset-x-0 top-0 z-50 ... md:inset-0" - a real
          z-50, not something the app-wide ".fixed.inset-0.z-50" bump rule in custom.css
          actually matches (that rule targets hand-rolled backdrop divs elsewhere in the app
          that use the literal "inset-0" class; flowbite's Modal never does). Since both
          modals here would otherwise sit at the same real z-50, this one gets an explicit
          override so it's guaranteed to paint above the acceptance modal regardless of
          mount/portal order. */}
      <Modal
        show={showFullDocModal}
        onClose={() => setShowFullDocModal(false)}
        size="3xl"
        theme={{ root: { base: 'fixed inset-x-0 top-0 z-[60] h-screen overflow-y-auto overflow-x-hidden md:inset-0 md:h-full' } }}
      >
        <ModalHeader className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-t-lg">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Terms of Service, Privacy & Cookie Policy</h3>
          </div>
        </ModalHeader>
        <ModalBody className="p-6 bg-white dark:bg-slate-900 max-h-[70vh] overflow-y-auto">
          {renderMarkdownLite(termsDocRaw)}
        </ModalBody>
        <ModalFooter className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setShowFullDocModal(false)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};
