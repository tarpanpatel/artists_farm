import React, { useEffect, useMemo, useState } from 'react';
import { Drawer as FlowbiteDrawer, DrawerItems } from 'flowbite-react';
import {
  Scale,
  ShieldCheck,
  Cookie,
  Headset,
  X,
  CheckCircle2,
  Mail,
  Phone,
  MessageSquare,
  HelpCircle,
  Search,
  ChevronDown,
  ExternalLink,
  BookOpen,
} from './icons/FlowbiteIcons';
import { WhatsappIcon } from './icons/WhatsappIcon';
import { TelegramIcon } from './icons/TelegramIcon';
import { Button } from './Button';
import { API_ROOT_BASE } from '../services/api';
import { HELP_CATEGORIES, HELP_MANUAL_ITEMS, HelpManualItem } from '../data/helpManual';

export type LegalTabType = 'terms' | 'privacy' | 'cookies' | 'support' | 'faq' | null;

interface LegalDrawerProps {
  activeTab: LegalTabType;
  onClose: () => void;
  /**
   * Used to build real, clickable links inside FAQ answers (added 27 Aug 2026) - e.g. "go to
   * Expenses" becomes an actual link to that page. Both optional: this drawer currently only
   * mounts from TenantDashboard.tsx (a multi-property account page with no single "active"
   * property/tab the way the operational Header.tsx app has), so a real destination has to be
   * built from the tenant + a specific property's slug rather than reusing App.tsx's in-app
   * setActiveTab/setActiveMenuItemKey navigation. Links open in a new tab so the reader doesn't
   * lose their place on the account page. When either is missing, FAQ page-name mentions render
   * as plain bold text instead of a link - never a dead/broken href.
   */
  tenantSlug?: string;
  defaultPropertySlug?: string;
}

export const LegalDrawer: React.FC<LegalDrawerProps> = ({ activeTab, onClose, tenantSlug, defaultPropertySlug }) => {
  const isOpen = activeTab !== null;

  // Operational Manual & FAQ state
  const [faqSearch, setFaqSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleAccordion = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const STOP_WORDS = useMemo(
    () =>
      new Set([
        'how', 'do', 'i', 'to', 'the', 'a', 'an', 'can', 'you', 'me', 'what',
        'where', 'when', 'why', 'is', 'are', 'in', 'of', 'for', 'my', 'we', 'our'
      ]),
    []
  );

  const filteredItems = useMemo(() => {
    const rawTokens = faqSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const meaningfulTokens = rawTokens.filter((t) => !STOP_WORDS.has(t));
    const activeTokens = meaningfulTokens.length > 0 ? meaningfulTokens : rawTokens;

    return HELP_MANUAL_ITEMS.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }

      if (activeTokens.length === 0) return true;

      const searchableText = [
        item.question,
        ...item.keywords,
        item.summary,
        ...item.steps
      ]
        .join(' ')
        .toLowerCase();

      return activeTokens.every((token) => searchableText.includes(token));
    });
  }, [faqSearch, selectedCategory, STOP_WORDS]);

  // When search query is entered, auto-expand matching items so answers are immediately visible
  useEffect(() => {
    const query = faqSearch.trim();
    if (query.length > 0) {
      setExpandedIds(new Set(filteredItems.map((i) => i.id)));
    } else {
      setExpandedIds(new Set());
    }
  }, [faqSearch, filteredItems]);

  /**
   * Renders a page-name reference inside an FAQ answer as a real clickable link when tenant +
   * property context is available (see LegalDrawerProps doc comment above), else as plain bold
   * text - so the FAQ still reads correctly even in the rare case neither prop was passed. Hash
   * fragment matches the exact itemKey scheme App.tsx's own routeMap already resolves (verified
   * against real entries, e.g. '#edit_property', '#expenses', '#attendance_calendar') - a single
   * flat itemKey, not a compound tab+item hash.
   */
  const FaqLink: React.FC<{ itemKey: string; children: React.ReactNode }> = ({ itemKey, children }) => {
    if (!tenantSlug || !defaultPropertySlug) {
      return <strong className="font-semibold text-slate-800 dark:text-slate-100">{children}</strong>;
    }
    const href = `${API_ROOT_BASE}/${tenantSlug}/${defaultPropertySlug}/#${itemKey}`;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-blue-600 dark:text-blue-400 hover:underline underline-offset-2"
      >
        {children}
      </a>
    );
  };

  return (
    <FlowbiteDrawer
      open={isOpen}
      onClose={onClose}
      position="right"
      className="z-58 p-0 w-full sm:max-w-xl bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col font-sans"
    >
      {/* Header Row - light background matching every other real drawer in the app (StaffManagement,
          TelegramNotificationModal, etc. all use bg-white dark:bg-gray-800) - this previously used a
          permanent bg-slate-900 (black regardless of theme), the one drawer in the app styled that
          way, which is exactly the inconsistency DESIGN.md's drawer spec exists to prevent. */}
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-600/30 border border-blue-200 dark:border-blue-500/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            {activeTab === 'terms' && <Scale className="w-5 h-5" />}
            {activeTab === 'privacy' && <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
            {activeTab === 'cookies' && <Cookie className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
            {activeTab === 'support' && <Headset className="w-5 h-5 text-sky-600 dark:text-sky-400" />}
            {activeTab === 'faq' && <HelpCircle className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
              {activeTab === 'terms' && 'Terms of Service'}
              {activeTab === 'privacy' && 'Privacy Policy'}
              {activeTab === 'cookies' && 'Cookie Policy'}
              {activeTab === 'support' && 'Contact Support'}
              {activeTab === 'faq' && 'Frequently Asked Questions'}
            </h3>
            <p className="text-2xs text-slate-500 dark:text-slate-400 font-medium">Ground Code™ SaaS Platform & Policy Agreement</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-white rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Close drawer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {activeTab === 'faq' && (
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0 space-y-2.5 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={faqSearch}
              onChange={(e) => setFaqSearch(e.target.value)}
              placeholder="Search manual (e.g. how to edit booking, add guest, checkout)..."
              className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 shadow-2xs"
            />
            {faqSearch && (
              <button
                type="button"
                onClick={() => setFaqSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-2xs">
            {HELP_CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-full whitespace-nowrap font-semibold border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Drawer Body Items */}
      <DrawerItems className="flex-1 overflow-y-auto p-5 sm:p-6 text-xs text-slate-700 dark:text-slate-200 leading-relaxed space-y-5">
        {activeTab === 'terms' && (
          <div className="space-y-4">
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>1-Month Free Trial • No Credit Card Required • No Lock-In</span>
              </div>
              <p className="text-2xs text-emerald-700 dark:text-emerald-400 leading-normal">
                Every property receives a 30-Day Free Trial. Billed at ₹1,499/month (includes 1st room key) + ₹350/extra key/month after trial via direct manual invoice.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">1. GroundCode Pro Subscription Model</h4>
              <p>
                Ground Code operates on a single unified Pro plan. Subscriptions are billed directly via manual invoices managed by Root Admin. No automated card debits are performed without your explicit consent.
              </p>

              <h4 className="font-bold text-slate-900 dark:text-white text-sm">2. 100% Data Ownership & Tenant Isolation</h4>
              <p>
                All guest records, stay folios, meal logs, petty cash vouchers, and inventory data generated by your property remain your exclusive property. Ground Code claims zero ownership over subscriber data and enforces database-level tenant isolation.
              </p>

              <h4 className="font-bold text-slate-900 dark:text-white text-sm">3. Staff Access Security</h4>
              <p>
                Property Owners are responsible for assigning, maintaining, and revoking staff PINs and access roles (e.g. Supervisor, Front-Desk, Kitchen Staff).
              </p>

              <h4 className="font-bold text-slate-900 dark:text-white text-sm">4. Cancellation & Data Export</h4>
              <p>
                Subscribers may cancel their subscription at any time without lock-in commitment. Prior to cancellation, subscribers can request a full data export in CSV/JSON format.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="space-y-4">
            <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-blue-900 dark:text-blue-300 text-xs">
                <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>STRICT ZERO DATA SELLING GUARANTEE</span>
              </div>
              <p className="text-2xs text-blue-800 dark:text-blue-400 leading-normal">
                Ground Code NEVER sells, rents, or monetizes property data, guest databases, or financial income records to third-party ad networks or OTAs.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">1. Information We Collect</h4>
              <p>
                We collect information strictly necessary to operate your homestay management dashboard: property name, owner phone number (for OTP authentication), guest names, check-in/out dates, and guest ID proof uploads.
              </p>

              <h4 className="font-bold text-slate-900 dark:text-white text-sm">2. Police Verification & C-Form Document Protection</h4>
              <p>
                Guest ID document uploads (Aadhaar, Passport, Driving License) are stored encrypted and accessible strictly by authorized property staff to assist hosts in fulfilling statutory police verification registers.
              </p>

              <h4 className="font-bold text-slate-900 dark:text-white text-sm">3. Security & Encryption</h4>
              <p>
                Data in transit is encrypted using standard TLS/HTTPS encryption. Staff PIN credentials and passwords are stored using one-way cryptographic hashing algorithms.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'cookies' && (
          <div className="space-y-4">
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-300 text-xs">
                <Cookie className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Essential Session Cookies Only</span>
              </div>
              <p className="text-2xs text-amber-800 dark:text-amber-400 leading-normal">
                Ground Code uses session tokens strictly to keep your staff logged into the dashboard securely. We do not use third-party ad tracking cookies.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">1. Session Tokens & Context</h4>
              <p>
                Session cookies and local storage tokens keep property owners and staff logged in across sessions, remember selected property context (<code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">tenant_id</code>), and authorize secure API requests.
              </p>

              <h4 className="font-bold text-slate-900 dark:text-white text-sm">2. No Cross-Site Ad Telemetry</h4>
              <p>
                No third-party advertising cookies or cross-site tracking pixels are executed inside your property operational control panel.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'support' && (
          <div className="space-y-4">
            <div className="p-3.5 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-sky-900 dark:text-sky-300 text-xs">
                <Headset className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                <span>Ground Code Dedicated Support</span>
              </div>
              <p className="text-2xs text-sky-800 dark:text-sky-400 leading-normal">
                Our support team is available 7 days a week to assist with property configuration, staff PINs, KDS menus, and iCal calendar setup.
              </p>
            </div>

            {/* Real click-to-chat links (27 Aug 2026) - see ContactSupportMenu.tsx,
                which is what actually opens this tab now. Kept separate from the
                informational cards below since those describe unrelated things
                (the automated per-property alerts bot, a scheduled call) rather
                than being contact links themselves. */}
            <div className="grid grid-cols-2 gap-3">
              <a
                href="https://wa.me/919571263474"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-emerald-800 dark:text-emerald-300 font-semibold text-xs hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors"
              >
                <WhatsappIcon className="w-4 h-4 shrink-0" />
                <span>WhatsApp</span>
              </a>
              <a
                href="https://t.me/GroundCodeCom"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 rounded-xl text-sky-800 dark:text-sky-300 font-semibold text-xs hover:bg-sky-100 dark:hover:bg-sky-950/50 transition-colors"
              >
                <TelegramIcon className="w-4 h-4 shrink-0" />
                <span>Telegram</span>
              </a>
            </div>

            <div className="space-y-3">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl space-y-3">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">Email Support</span>
                    <a href="mailto:support@ground-code.com" className="text-blue-600 dark:text-blue-400 hover:underline">
                      support@ground-code.com
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-3 border-t border-slate-200 dark:border-slate-700 pt-3">
                  <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">Telegram Staff Alerts Bot</span>
                    <span className="text-2xs text-slate-500 dark:text-slate-400">Native automated property alerts & KDS notifications</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 border-t border-slate-200 dark:border-slate-700 pt-3">
                  <Phone className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">Guided Onboarding Setup Call</span>
                    <span className="text-2xs text-slate-500 dark:text-slate-400">Schedule your personal 30-minute 1-on-1 setup session</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'faq' && (
          <div className="space-y-4">
            {/* Header info card */}
            <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="font-bold text-blue-950 dark:text-blue-200 text-xs">
                  Operational Manual &amp; FAQs
                </span>
              </div>
              <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/60 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                {filteredItems.length} {filteredItems.length === 1 ? 'guide' : 'guides'}
              </span>
            </div>

            {/* Accordion list */}
            {filteredItems.length > 0 ? (
              <div className="space-y-2.5">
                {filteredItems.map((item) => {
                  const isExpanded = expandedIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className="border border-slate-200 dark:border-slate-700/80 rounded-xl overflow-hidden bg-white dark:bg-slate-850 shadow-2xs transition-all"
                    >
                      <button
                        type="button"
                        onClick={() => toggleAccordion(item.id)}
                        className="w-full flex items-center justify-between p-3.5 text-left font-bold text-xs text-slate-900 dark:text-white bg-slate-50/70 dark:bg-slate-800/60 hover:bg-slate-100/80 dark:hover:bg-slate-800 transition-colors cursor-pointer gap-2"
                        aria-expanded={isExpanded}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                          <span className="leading-snug">{item.question}</span>
                        </div>
                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180 text-blue-600 dark:text-blue-400' : ''
                          }`}
                        />
                      </button>

                      {isExpanded && (
                        <div className="p-4 border-t border-slate-200/80 dark:border-slate-700/80 text-2xs text-slate-600 dark:text-slate-300 space-y-3 bg-white dark:bg-slate-900/40">
                          <p className="font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
                            {item.summary}
                          </p>

                          {item.steps && item.steps.length > 0 && (
                            <ol className="space-y-2 pl-0 list-none pt-1">
                              {item.steps.map((step, idx) => (
                                <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 font-bold text-[10px] shrink-0 mt-0.5 border border-blue-200 dark:border-blue-800">
                                    {idx + 1}
                                  </span>
                                  <span className="text-slate-600 dark:text-slate-300">{step}</span>
                                </li>
                              ))}
                            </ol>
                          )}

                          {item.actionLink && (
                            <div className="pt-2">
                              <FaqLink itemKey={item.actionLink.itemKey}>
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 font-semibold text-xs border border-blue-200 dark:border-blue-800 transition-colors">
                                  <span>{item.actionLink.label}</span>
                                  <ExternalLink className="w-3 h-3" />
                                </span>
                              </FaqLink>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 px-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 space-y-3">
                <HelpCircle className="w-8 h-8 text-slate-400 mx-auto" />
                <div>
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                    No matching manual article for "{faqSearch}"
                  </h4>
                  <p className="text-2xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                    Have a specific question not covered in this guide? Chat directly with Ground Code Hospitality Support.
                  </p>
                </div>
                <a
                  href={`https://wa.me/919983196863?text=${encodeURIComponent(`Hi Ground Code Support, I need help with: ${faqSearch}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  <WhatsappIcon className="w-4 h-4" />
                  <span>Ask Support on WhatsApp</span>
                </a>
              </div>
            )}
          </div>
        )}
      </DrawerItems>

      {/* Drawer Footer Actions.
          pb-[calc(1rem+env(safe-area-inset-bottom,0px))], not plain p-4 (2 Sep
          2026, site-wide audit) - see DESIGN.md's "Bottom-Anchored Drawer
          Footer Safe Area" rule. This sits outside DrawerItems (the
          scrollable region) as a shrink-0 sibling pinned to the physical
          bottom edge. */}
      <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-end shrink-0">
        <Button variant="secondary" size="xs" onClick={onClose}>
          Close
        </Button>
      </div>
    </FlowbiteDrawer>
  );
};
