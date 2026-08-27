import React, { useEffect, useRef, useState } from 'react';
import { Drawer as FlowbiteDrawer, DrawerItems } from 'flowbite-react';
import { Scale, ShieldCheck, Cookie, Headset, X, CheckCircle2, Mail, Phone, MessageSquare, HelpCircle, Search } from './icons/FlowbiteIcons';
import { WhatsappIcon } from './icons/WhatsappIcon';
import { TelegramIcon } from './icons/TelegramIcon';
import { Button } from './Button';
import { API_ROOT_BASE } from '../services/api';

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

  // FAQ search (added 27 Aug 2026) - deliberately DOM-based rather than restructuring the 55+
  // hand-written Q&A cards into a data array: every card already carries a `data-faq-card`
  // marker (see the JSX below), so filtering is just a matter of checking each card's own
  // rendered text against the query and toggling display - no risk of transcribing 55 answers
  // into a new format and introducing a mismatch. Category headers hide themselves too when
  // every card inside them is filtered out, so search never leaves a floating empty heading.
  const [faqSearch, setFaqSearch] = useState('');
  const faqContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab !== 'faq') return;
    const container = faqContainerRef.current;
    if (!container) return;
    const query = faqSearch.trim().toLowerCase();
    const cards = container.querySelectorAll<HTMLElement>('[data-faq-card]');
    cards.forEach((card) => {
      const matches = query === '' || (card.textContent || '').toLowerCase().includes(query);
      card.style.display = matches ? '' : 'none';
    });
    // Category wrapper = the card-group's own parent (`.space-y-2.5` holds the cards directly;
    // its parent is the `pt-*` div carrying the category title span above it).
    const groups = container.querySelectorAll<HTMLElement>('.space-y-2\\.5');
    groups.forEach((group) => {
      const anyVisible = Array.from(group.querySelectorAll<HTMLElement>('[data-faq-card]')).some(
        (card) => card.style.display !== 'none'
      );
      const categoryWrapper = group.parentElement;
      if (categoryWrapper) categoryWrapper.style.display = anyVisible ? '' : 'none';
    });
  }, [faqSearch, activeTab]);

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
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={faqSearch}
              onChange={(e) => setFaqSearch(e.target.value)}
              placeholder="Search the FAQ..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
            />
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
          <div className="space-y-4" ref={faqContainerRef}>
            <div className="p-3.5 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 rounded-xl">
              <div className="flex items-center gap-1.5 font-bold text-purple-900 dark:text-purple-300 text-xs">
                <HelpCircle className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                <span>Frequently Asked Questions (FAQ)</span>
              </div>
            </div>

            <div className="space-y-3">
              {/* Category 1: General & Pricing */}
              <div className="pt-1">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">General &amp; Subscription</span>
                
                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: What is Ground Code?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Ground Code is a specialized property management system (PMS) designed for homestays, villas, guest houses, and boutique resorts in India. It helps hosts manage bookings, guest check-ins, kitchen orders (KDS), petty cash, and staff attendance with zero booking commission.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: How does the 30-Day Free Trial work?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      You get 100% full access to GroundCode Pro for 30 days without entering a credit card or signing a contract. Our team hops on a personal 1-on-1 setup call to help configure your room keys, staff PINs, and booking calendar.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: How much does Ground Code cost after the trial?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Ground Code operates on ONE single simple plan: <strong>GroundCode Pro</strong> at ₹1,499/month (includes 1st villa or room key). Extra room keys cost just +₹350/room/month. You can also save 2 months free with annual billing (₹14,990/year).
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 2: Bookings & OTA Calendar Sync */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Bookings &amp; iCal Calendar Sync</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Do you charge any booking commission?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      No, never! Ground Code charges ZERO commission on any booking. Unlike OTAs that take 15–25% per reservation, you keep 100% of your guest revenue.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: How does calendar sync with Airbnb &amp; Booking.com work?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      We provide standard iCal (.ics) feed synchronization. Import and export links automatically poll availability across your connected OTAs with a ~15–30 minute update window.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 3: Staff Roles & Kitchen KDS */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Staff Roles &amp; Kitchen (KDS)</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can my cook and front-desk staff use different screens?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes! You can assign specific staff roles and PINs. Your cook gets a Kitchen Order Screen (KDS), front-desk staff get guest check-in &amp; petty cash tools, while revenue reports remain private to the owner.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: How do Telegram phone alerts work?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      You can connect your property's Telegram bot in 2 minutes to receive instant phone alerts for new guest bookings, check-in arrivals, and cash drawer adjustments.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 4: Data Privacy & Compliance */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Data Protection &amp; Compliance</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Is my property and guest data safe?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      100% safe. We enforce a strict Zero Data Selling Guarantee. Your guest lists, ID proofs, and property income logs are private to your property and never shared or sold to third parties or OTAs.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Does Ground Code support Police C-Form &amp; GST compliance?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes! Ground Code stores encrypted guest ID proofs (Aadhaar, Passport) to help hosts fulfill statutory police verification registers, and generates GST-compliant guest bills and invoices.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 5: Day-to-Day Operations (added 27 Aug 2026) - unlike Categories 1-4
                  above (pitch/marketing-angled: pricing, "how does X work"), these are literal
                  step-by-step "how do I do this" answers for staff already using the app day to
                  day - the exact question shapes tested against the AI assistant's offline engine
                  the same night this was added, reusing its own verified reply text/destinations
                  rather than writing new, unvetted copy. Telegram alerts and OTA calendar sync
                  already have their own pitch-style entries above, so they're not repeated here. */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Day-to-Day Operations</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: How do I add a new guest booking / check someone in?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Click the '+ Add Booking' button in the top header bar or on the <FaqLink itemKey="all_bookings">Bookings</FaqLink> page. Fill in the guest's name, mobile number, room number, check-in date, and expected checkout. Upload ID document verification if required and click 'Save Booking'.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: How do I check out a guest and generate their final bill?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Click 'Checkout' on their booking card in the <FaqLink itemKey="all_bookings">Bookings</FaqLink> or Today tab. Review room charges, advance payments, and food bills, then print the GST receipt or send it directly on WhatsApp.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: How do I add a new staff member and set what they're allowed to access?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Go to Staff → <FaqLink itemKey="staff_directory_salaries">Staff Directory &amp; Salaries</FaqLink> → '+ Add Staff Member'. Enter their name, phone number (this becomes their login), and a role such as Front Desk, Kitchen, Supervisor, or Admin — the role you pick determines exactly what they can see and do in the app.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: How do I record a petty cash expense, like a vendor payment or salary advance?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Go to <FaqLink itemKey="expenses">Expenses</FaqLink> on the left sidebar and click '+ Add Expense'. Select the Category (Bills, Staff Advance, Kitchen, or Other), enter the amount and item details, choose the payment source (Property Funds vs Out-of-Pocket), and click 'Add Expense'.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: How do I add or update kitchen inventory/stock items?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Go to Kitchen → Inventory → <FaqLink itemKey="edit_kitchen_stock">Edit Kitchen Stock</FaqLink> to add raw materials with their unit (kg/liters/pcs) and quantity. Link them to a dish under <FaqLink itemKey="beta_recipe_builder">Dish Recipes (Auto-Stock)</FaqLink> so stock automatically depletes every time that dish is sold.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: How do I add a property license (like FSSAI or homestay) and get expiry reminders?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Go to Admin Control → <FaqLink itemKey="license_management">Licenses</FaqLink>, click '+ Add License', choose the type (Homestay, FSSAI, Fire Safety, GST, etc.), upload the document, and set its expiry date. You'll automatically get Telegram reminders 7, 4, and 1 day before it expires.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: How do I set up my UPI ID so guests can pay by scanning a QR code?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Go to <FaqLink itemKey="edit_property">Edit Property</FaqLink> and enter your UPI ID in the payment settings section. A scannable QR code is generated automatically from it and appears on checkout bills and booking-confirmation WhatsApp shares — no need to upload your own QR image unless you prefer to.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: How do I add a new room to my multi-key property?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Go to <FaqLink itemKey="edit_property">Edit Property</FaqLink> and scroll to the Rooms section, then click '+ Add Room'. Give it a name/number and rate, and it appears immediately as a new bookable key under your property.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 6: Multi-Property & Multi-Key Properties (added 27 Aug 2026, corrected
                  same day - originally called this "Multi-Key Rooms" and described every key as
                  "a room" throughout; a multi-key property's keys can just as easily be whole
                  villas or cottages, not only bedrooms in one building - see the sitewide
                  Multi-Room -> Multi-Key terminology fix in i18n/en.ts and the property-type
                  picker copy for the same correction). */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Multi-Property &amp; Multi-Key Properties</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can I manage more than one property from a single account?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes. Ground Code is built for owners with multiple properties — you can switch between them from the same login, and a Root Admin can see every property from one dashboard.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: What's the difference between a single property and a multi-key property?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      A single property has one bookable unit. A multi-key property has several separately bookable keys under one address — each key could be a hotel-style room, a suite, or a whole independent villa or cottage — and each keeps its own booking calendar, while staff and settings are shared across the whole property.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can one key in a multi-key property get double-booked?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      No — every key can only ever have one active booking at a time. The system blocks it before it can happen, and the date picker greys out and strikes through any day that's already booked for that key.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 7: Guest Communication & Payments (added 27 Aug 2026) */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Guest Communication &amp; Payments</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can guests pay me directly via UPI?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes. Add your UPI ID once in Edit Property and Ground Code automatically generates a scannable QR code that appears on checkout bills and WhatsApp booking confirmations — no separate QR app needed.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Do you send WhatsApp booking confirmations and bills automatically?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Booking confirmations, checkout bills, and walk-in tab bills can each be shared as a ready-formatted WhatsApp message in one click, including your UPI QR code if you've set one up.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Do I need to set up my own Telegram bot for alerts?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      No — Telegram alerts are fully managed for you. You'll never see a bot token or a pairing code; we configure your kitchen/admin/finance alert groups on your behalf and simply add you to them.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 8: Reports, Exports & Analytics (added 27 Aug 2026) */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Reports, Exports &amp; Analytics</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can I export my bookings or financial data?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes — from <FaqLink itemKey="data_export_center">Download Data &amp; Excel</FaqLink> you can export bookings, receipts, and expenses as CSV files for any date range, ready to open in Excel or share with your accountant.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Does Ground Code show me business analytics?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes — <FaqLink itemKey="dashboard_analytics">Reports &amp; Earnings</FaqLink> shows occupancy rate, average room rate, average length of stay, profit per room-night, and room vs. kitchen revenue, so you see how your property is performing over time, not just what's happening today.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can I see which menu items make me the most money, not just which sell the most?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes, Reports &amp; Earnings ranks dishes by actual revenue and factors in kitchen purchase cost, so you see real profit per dish, not just order counts.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Are the guest bills GST-compliant?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes — once your GSTIN is entered in Edit Property, checkout receipts include it and itemize charges the way a GST invoice requires.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 9: Ground Code AI Assistant (added 27 Aug 2026) */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Ground Code AI Assistant</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: What can the Ground Code AI assistant actually do?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Ask it in plain English and it can open pre-filled forms for you — add a booking, log an expense, add a staff member — answer "how do I..." questions about the app, and tell you things like how many bookings or team members you have.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Does using the AI assistant cost extra?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      No — by default it runs on a free, built-in engine with zero ongoing cost. A Root Admin can optionally turn on a smarter online AI model, but it's off by default.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: What happens if the AI doesn't understand my question?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      It says so honestly rather than guessing, and after a couple of unclear replies in a row it offers a direct link to talk to a real person on WhatsApp or Telegram.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 10: Staff Roles & Access Control (added 27 Aug 2026) */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Staff Roles &amp; Access Control</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: What staff roles are available?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Admin, Staff, Staff Kitchen, and Staff Supervisor — each role controls exactly which pages and actions that person can see and use.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can I track staff attendance?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes, Admins and Supervisors can mark daily attendance for the team from the <FaqLink itemKey="attendance_calendar">Attendance Calendar</FaqLink>.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can I stop a staff member from seeing financial data?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes — financial pages like petty cash and ledger reports are restricted to Admin and above by default, so a regular Staff or Kitchen login never sees them.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 11: Getting Started (added 27 Aug 2026) */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Getting Started</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: How do I get started with Ground Code?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Sign up for the 30-day free trial — no credit card needed — and our team helps configure your first property, rooms, and staff during onboarding.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Do I need any technical knowledge to use this?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      No. Ground Code is built for hotel and homestay staff, not developers — every setup step, including Telegram alerts, UPI QR, and licenses, is a simple form, never code or a config file.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: What if I get stuck during setup?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Ask the in-app AI assistant, check this FAQ, or reach a real person directly on WhatsApp or Telegram from the same support menu.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 12: Kitchen & Inventory Deep Dive (added 27 Aug 2026) */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Kitchen &amp; Inventory Deep Dive</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can I track ingredient-level recipes so stock depletes automatically?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes — the <FaqLink itemKey="beta_recipe_builder">Recipe Builder</FaqLink> (Kitchen → Dish Recipes) lets you set ingredients, yield factor, and servings per dish, so raw stock auto-depletes whenever that dish is sold.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: How do I record kitchen wastage or spoiled stock?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Go to Kitchen → Inventory → <FaqLink itemKey="deficit_shortfalls_log">Kitchen Wastage</FaqLink> to log stock lost to spoilage, breakage, or shortfalls — kept separate from stock that was actually used in orders.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can staff request raw materials from the kitchen store?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes — <FaqLink itemKey="stock_requests">Stock Requisitions</FaqLink> lets staff request items like vegetables or a gas cylinder, which a supervisor can then fulfil from the same page.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 13: Walk-In Guests & Table Billing (added 27 Aug 2026) */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Walk-In Guests &amp; Table Billing</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can I bill a walk-in restaurant customer who isn't a hotel guest?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes — open a Walk-In Tab from Kitchen → <FaqLink itemKey="take_food_order">Take Order</FaqLink>, assign it to a numbered table, add items throughout their visit, and bill the whole tab at once when they're ready to pay.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Do walk-in tabs need a guest booking?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      No — walk-in tabs are completely independent of room bookings, for customers using only your restaurant or kitchen, not staying at the property.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 14: Service Requests & Guest Needs (added 27 Aug 2026) */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Service Requests &amp; Guest Needs</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: How do I log a guest request, like extra towels or a repair?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Go to <FaqLink itemKey="service_requests">Service Requests</FaqLink> and click '+ New Request', or just tell the AI assistant something like "extra towels for room 102" — it opens the same form pre-filled.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can I track whether a service request was completed?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes, every request has a status — Pending, In Progress, or Completed — so nothing gets forgotten.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 15: Foreign Guests & ID Verification (added 27 Aug 2026) */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Foreign Guests &amp; ID Verification</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Do I need to do anything extra for foreign guests?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes — foreign guests require a C-Form filing. You can mark C-Form status as Pending or Filed directly from the guest details modal or guest list.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can I store guest ID documents securely?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes, guest ID uploads (Aadhaar, Passport, Driving License) are stored encrypted and only accessible to your own property's authorized staff.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 16: App Experience (added 27 Aug 2026) */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">App Experience</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can I install Ground Code like an app on my phone?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes, Ground Code works as an installable app (PWA) — your browser will prompt you to "Add to Home Screen" for quick access without opening a browser each time.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Does Ground Code support dark mode?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes, every screen supports both light and dark mode.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: What languages does Ground Code support?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      English by default, with additional languages available on request.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 17: Cash Management & Reconciliation (added 27 Aug 2026) */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Cash Management &amp; Reconciliation</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: How do I hand over cash from one staff member to another?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      From <FaqLink itemKey="finances">Finances</FaqLink>, use Cash Handover to record the amount, who received it, and any notes — it automatically posts a Telegram alert to your Finance group and updates the running balance.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can I correct a mistake in the cash balance?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes, Manual Adjustment on the same <FaqLink itemKey="finances">Finances</FaqLink> page lets you add a correction with a note explaining why, so the balance stays accurate without deleting the original entry.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Where do I log a kitchen purchase from a vendor?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Under <FaqLink itemKey="expenses">Expenses</FaqLink>, category Kitchen — vendor purchases used to have their own page, but that's now unified into the same Expenses list as every other cost, so all your spending is in one place.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 18: Booking Extras & Charges (added 27 Aug 2026) */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Booking Extras &amp; Charges</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can I add extra charges to a guest's bill, like a late checkout fee?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes — set up reusable charge templates (late checkout, laundry, extra bed, etc.) under <FaqLink itemKey="misc_charges">Extra Charges &amp; Fees</FaqLink>, then add any of them to a guest's bill in one click at checkout.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 19: Property Setup Wizard (added 27 Aug 2026) */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Property Setup Wizard</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Do I have to complete every setup step before I can start taking bookings?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      No — only the Basics step is required to publish your property. The rest of the 5-step checklist (rooms, staff, Telegram, licenses, payments) is fully optional and can be finished later from the "Finish Setting Up This Property" banner.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can I skip a setup step and come back to it later?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes, every step past Basics can be skipped or snoozed, and the banner keeps track of how many of the 5 steps you've completed.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 20: WhatsApp & Voucher Templates (added 27 Aug 2026) */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">WhatsApp &amp; Voucher Templates</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can I customize the wording of my WhatsApp booking confirmations?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes — the WhatsApp voucher template on <FaqLink itemKey="edit_property">Edit Property</FaqLink> lets you edit the exact wording guests receive, with tokens like guest name, dates, and UPI ID that get filled in automatically.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: What happens if I leave a token blank, like no UPI ID set up?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      The template quietly drops that line instead of showing an empty placeholder, so a guest never sees something like "Pay via UPI: " with nothing after it.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 21: Guest Check-In & ID Verification (added 27 Aug 2026) */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Guest Check-In &amp; ID Verification</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can I verify a guest's ID document during check-in?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes — opening a booking's details from <FaqLink itemKey="all_bookings">Bookings</FaqLink> gives you an ID verification step right there, so uploading and confirming a guest's document doesn't need a separate page or app.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 22: Menu & Pricing (added 27 Aug 2026) */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Menu &amp; Pricing</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: How do I organize my kitchen menu into categories, like Starters or Beverages?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      From <FaqLink itemKey="edit_food_menu">Menu &amp; Pricing</FaqLink>, every dish gets a category (Starters, Main Course, Beverages, Desserts, Farm Specials), so the KDS and ordering screens group them automatically.
                    </p>
                  </div>

                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can I change a menu item's price later without affecting old bills?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes, updating a price on <FaqLink itemKey="edit_food_menu">Menu &amp; Pricing</FaqLink> only applies going forward — receipts and bills already generated keep the price that was charged at the time.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 23: Past Bills & Receipts (added 27 Aug 2026) */}
              <div className="pt-2">
                <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-2">Past Bills &amp; Receipts</span>

                <div className="space-y-2.5">
                  <div data-faq-card className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl">
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs mb-1">Q: Can I look up or reprint an old guest's bill?</h4>
                    <p className="text-2xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Yes, every checkout bill is saved under <FaqLink itemKey="past_receipts_log">Past Bills &amp; Receipts</FaqLink>, searchable by guest name or date, and can be reprinted or re-shared on WhatsApp any time.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </DrawerItems>

      {/* Drawer Footer Actions */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-end shrink-0">
        <Button variant="secondary" size="xs" onClick={onClose}>
          Close
        </Button>
      </div>
    </FlowbiteDrawer>
  );
};
