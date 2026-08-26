import React, { useState, useEffect } from 'react';
import { AlertCircle, Home } from './icons/FlowbiteIcons';
import { t } from '../i18n/en';

interface LoadingScreenProps {
  message?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = t('loading_screen_default_message')
}) => {
  const [showTimeout, setShowTimeout] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowTimeout(true);
    }, 15000); // Show cancel button after 15 seconds

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center z-50 loading-screen">
      {/* Screen-reader only - sighted users get a clean branded splash with
          no visible "Loading..."/"Redirecting..." text, but assistive tech
          still announces what's actually happening. */}
      <span className="sr-only" role="status">{message}</span>
      <div className="flex flex-col items-center gap-8 loading-screen__container">
        {/* Logo - the actual brand mark file (icons/icon-source.png, gradient +
            glyph + rounded corners already baked in from gc_logo.png), shown
            as-is rather than reconstructed as a separate CSS gradient badge
            with the transparent glyph dropped inside it (26 Aug 2026: that
            double-square look was reported and replaced with this). */}
        <div className="relative w-16 h-16 loading-screen__logo">
          <img src="/icons/icon-source.png" alt="" className="w-full h-full rounded-lg loading-screen__logo-img" />
        </div>

        {/* Loading Spinner */}
        <div className="relative w-12 h-12 loading-screen__spinner">
          <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-slate-700 loading-screen__spinner-track" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 border-r-indigo-500 animate-spin loading-screen__spinner-indicator" />
        </div>

        {/* Brand text label removed (26 Aug 2026, explicit request): the logo
            mark itself is distinctive enough now to not need "Ground Code"
            spelled out underneath it - this splash reads as an app launch
            purely through the icon, gradient, and spinner. The sr-only span
            above still carries `message` for assistive tech regardless. */}

        {/* Loading Dots */}
        <div className="flex gap-2 loading-screen__dots">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce loading-screen__dot" style={{ animationDelay: '0s' }} />
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce loading-screen__dot" style={{ animationDelay: '0.2s' }} />
          <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce loading-screen__dot" style={{ animationDelay: '0.4s' }} />
        </div>

        {/* Timeout Notice & Cancel Button */}
        {showTimeout && (
          <div className="mt-6 pt-6 border-t border-slate-300 dark:border-slate-600 loading-screen__timeout">
            <div className="flex gap-2 items-start mb-4 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg loading-screen__timeout-notice">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5 loading-screen__timeout-icon" />
              <p className="text-xs text-amber-800 dark:text-amber-300 loading-screen__timeout-text">
                {t('loading_timeout_message')}
              </p>
            </div>
            <a
              href="/"
              className="block w-full text-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 loading-screen__home-link"
            >
              <Home className="w-4 h-4 loading-screen__home-icon" />
              {t('go_home_button')}
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
