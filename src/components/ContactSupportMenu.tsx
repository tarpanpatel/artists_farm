import React, { useState } from 'react';
import { Dropdown, DropdownItem } from 'flowbite-react';
import { MessageCircle, HelpCircle } from './icons/FlowbiteIcons';
import { WhatsappIcon } from './icons/WhatsappIcon';
import { TelegramIcon } from './icons/TelegramIcon';
import { LegalDrawer, LegalTabType } from './LegalDrawer';
import { t } from '../i18n';

// Ground Code's own support contact (fixed platform-wide values, not a
// per-property/tenant setting - see Header.tsx's original 27 Aug 2026 note).
const WHATSAPP_SUPPORT_URL = 'https://wa.me/919571263474';
const TELEGRAM_SUPPORT_URL = 'https://t.me/GroundCodeCom';

export interface ContactSupportMenuProps {
  /** Icon+"Help" label (TenantDashboard's prior button) vs icon-only (Header.tsx's other icon buttons). */
  showLabel?: boolean;
  /**
   * Pass BOTH when the host page already renders its own <LegalDrawer> (e.g.
   * TenantDashboard.tsx, whose footer also opens Terms/Privacy/Cookies tabs
   * through one shared drawer instance) - "FAQ"/"More Support Options" then
   * delegate to that instead of mounting a second, redundant drawer. Omit
   * both to let this component manage its own drawer internally (Header.tsx's
   * case, which has no existing LegalDrawer plumbing).
   */
  onOpenFaq?: () => void;
  onOpenMoreSupport?: () => void;
}

/**
 * Shared "Contact Support" quick-menu (27 Aug 2026) - WhatsApp/Telegram
 * click-to-chat links (deliberately NOT wired into any ticket system yet -
 * see PRODUCT_STRATEGY.md discussion) plus FAQ / fuller support info, both
 * backed by the existing LegalDrawer content. Used by both Header.tsx (the
 * operational property app) and TenantDashboard.tsx (the owner's property
 * control panel) so support is reachable the same way from either surface.
 */
export const ContactSupportMenu: React.FC<ContactSupportMenuProps> = ({
  showLabel = false,
  onOpenFaq,
  onOpenMoreSupport,
}) => {
  const [internalTab, setInternalTab] = useState<LegalTabType>(null);
  const managesOwnDrawer = !onOpenFaq && !onOpenMoreSupport;
  const openFaq = onOpenFaq ?? (() => setInternalTab('faq'));
  const openMoreSupport = onOpenMoreSupport ?? (() => setInternalTab('support'));

  return (
    <>
      <Dropdown
        placement="bottom-end"
        dismissOnClick
        label=""
        className="z-60 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden text-xs p-1 min-w-52"
        renderTrigger={() => (
          <button
            type="button"
            title={t('contact_support_tooltip', 'Contact Support')}
            aria-label={t('contact_support_aria', 'Contact Support')}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <MessageCircle className="w-5 h-5" />
            {showLabel && (
              <span className="text-xs font-semibold hidden md:inline text-slate-700 dark:text-slate-200">
                {t('help_label', 'Help')}
              </span>
            )}
          </button>
        )}
      >
        <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {t('contact_support_label', 'Contact Support')}
        </div>
        <DropdownItem
          onClick={() => window.open(WHATSAPP_SUPPORT_URL, '_blank', 'noopener,noreferrer')}
          className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md text-slate-700 dark:text-slate-200"
        >
          <WhatsappIcon className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{t('chat_on_whatsapp_label', 'Chat on WhatsApp')}</span>
        </DropdownItem>
        <DropdownItem
          onClick={() => window.open(TELEGRAM_SUPPORT_URL, '_blank', 'noopener,noreferrer')}
          className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md text-slate-700 dark:text-slate-200"
        >
          <TelegramIcon className="w-4 h-4 text-sky-500 shrink-0" />
          <span>{t('chat_on_telegram_label', 'Chat on Telegram')}</span>
        </DropdownItem>
        <DropdownItem
          onClick={openFaq}
          className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md text-slate-700 dark:text-slate-200 border-t border-slate-100 dark:border-slate-700 mt-1 pt-2"
        >
          <HelpCircle className="w-4 h-4 text-purple-500 shrink-0" />
          <span>{t('view_faq_label', 'FAQ')}</span>
        </DropdownItem>
        <DropdownItem
          onClick={openMoreSupport}
          className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md text-slate-700 dark:text-slate-200"
        >
          <span className="w-4 h-4 shrink-0" />
          <span>{t('more_support_options_label', 'More Support Options')}</span>
        </DropdownItem>
      </Dropdown>

      {managesOwnDrawer && <LegalDrawer activeTab={internalTab} onClose={() => setInternalTab(null)} />}
    </>
  );
};
