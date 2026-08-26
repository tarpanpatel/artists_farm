import React, { useState } from 'react';
import { LegalDrawer, LegalTabType } from './LegalDrawer';

export const DashboardFooter: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LegalTabType>(null);

  return (
    <>
      <footer className="mt-8 p-4 bg-white rounded-lg shadow-2xs md:flex md:items-center md:justify-between md:p-6 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        <span className="text-2xs text-gray-500 sm:text-center dark:text-gray-400">
          © 2026 <a href="https://ground-code.com" target="_blank" rel="noopener noreferrer" className="hover:underline font-semibold text-gray-700 dark:text-gray-200">Ground Code™</a>. All Rights Reserved.
        </span>
        <ul className="flex flex-wrap items-center mt-3 text-2xs font-medium text-gray-500 dark:text-gray-400 sm:mt-0 gap-4">
          <li>
            <button
              type="button"
              onClick={() => setActiveTab('terms')}
              className="hover:underline hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
            >
              Terms of Service
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setActiveTab('privacy')}
              className="hover:underline hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
            >
              Privacy Policy
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setActiveTab('cookies')}
              className="hover:underline hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
            >
              Cookie Policy
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setActiveTab('faq')}
              className="hover:underline hover:text-purple-600 dark:hover:text-purple-400 font-semibold cursor-pointer"
            >
              FAQ
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setActiveTab('support')}
              className="hover:underline hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
            >
              Contact Support
            </button>
          </li>
        </ul>
      </footer>

      {/* Slide-Out Drawer for Terms, Privacy, Cookies & Support */}
      <LegalDrawer activeTab={activeTab} onClose={() => setActiveTab(null)} />
    </>
  );
};
