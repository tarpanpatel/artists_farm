import React, { useState } from 'react';
import { Footer, FooterLinkGroup, FooterLink } from 'flowbite-react';
import { LegalDrawer, LegalTabType } from './LegalDrawer';

// Rebuilt 27 Aug 2026 on flowbite-react's own <Footer>/<FooterLinkGroup>/<FooterLink>
// (previously hand-rolled <footer>/<ul>/<li> markup - user report: "check flowbite" +
// linked https://github.com/themesberg/flowbite/blob/main/content/components/footer.md).
//
// FooterLink's own className prop lands on its <li> wrapper, never the actual <button> it
// renders (confirmed in node_modules/flowbite-react/dist/components/Footer/FooterLink.js -
// `className` is destructured off before building the real element, which only ever gets
// `theme.href`) - the same "className reaches the wrong DOM node" class of bug already found
// in Input.tsx's TextInput usage. So per-link visual differences (FAQ's bold purple accent)
// go through a `theme` override instead, the same mechanism used there and in
// MobileBottomNav.tsx's Quick Action Drawer, not through className.
const footerLinkTheme = { href: 'hover:underline cursor-pointer' };
const footerFaqLinkTheme = { href: 'hover:underline cursor-pointer font-semibold text-purple-600 dark:text-purple-400' };

export const DashboardFooter: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LegalTabType>(null);

  return (
    <>
      <Footer container className="mt-8 border border-gray-200 dark:border-gray-700">
        <span className="text-sm text-gray-500 sm:text-center dark:text-gray-400">
          © 2026{' '}
          <a
            href="https://ground-code.com"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 hover:underline font-semibold text-gray-700 dark:text-gray-200"
          >
            Ground Code™
          </a>
          . All Rights Reserved.
        </span>
        <FooterLinkGroup>
          <FooterLink as="button" href={undefined} type="button" theme={footerLinkTheme} onClick={() => setActiveTab('terms')}>
            Terms of Service
          </FooterLink>
          <FooterLink as="button" href={undefined} type="button" theme={footerLinkTheme} onClick={() => setActiveTab('privacy')}>
            Privacy Policy
          </FooterLink>
          <FooterLink as="button" href={undefined} type="button" theme={footerLinkTheme} onClick={() => setActiveTab('cookies')}>
            Cookie Policy
          </FooterLink>
          <FooterLink as="button" href={undefined} type="button" theme={footerFaqLinkTheme} onClick={() => setActiveTab('faq')}>
            FAQ
          </FooterLink>
          <FooterLink as="button" href={undefined} type="button" theme={footerLinkTheme} onClick={() => setActiveTab('support')}>
            Contact Support
          </FooterLink>
        </FooterLinkGroup>
      </Footer>

      {/* Slide-Out Drawer for Terms, Privacy, Cookies & Support */}
      <LegalDrawer activeTab={activeTab} onClose={() => setActiveTab(null)} />
    </>
  );
};
