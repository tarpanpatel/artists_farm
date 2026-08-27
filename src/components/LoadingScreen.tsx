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
        {/* Logo - the actual brand mark file (app-icons/icon-source.png, gradient +
            glyph + rounded corners already baked in from gc_logo.png), shown
            as-is rather than reconstructed as a separate CSS gradient badge
            with the transparent glyph dropped inside it (26 Aug 2026: that
            double-square look was reported and replaced with this). */}
        <div className="w-14 h-14 rounded-2xl bg-white/10 dark:bg-white/5 border border-white/20 p-2.5 shadow-xl flex items-center justify-center relative loading-screen__logo-container">
          <img src="app-icons/icon-source.png" alt="" className="w-full h-full rounded-lg loading-screen__logo-img" />
        </div>

        {/* Standard Loading Spinner Ring - a plain CSS border-ring div, NOT an icon component
            (fixed 27 Aug 2026, live report: "why still 2 types of loading", raised multiple
            times). Root cause: this used to be <Loader2 animate-spin>, and Loader2 is defined as
            `wrap(getOutline('Spinner') || getOutline('Refresh'))` in FlowbiteIcons.tsx - Flowbite's
            icon set has no "Spinner" icon at all, so that always silently fell back to the
            Refresh icon (two curved arrows) instead. That's a completely different shape from
            index.html's own #initial-loader__spinner (a plain CSS border-ring, shown before React
            even mounts) - so the boot sequence visibly changed spinner SHAPE, not just handed off
            between two loading screens as intended. Rebuilt as the exact same CSS-ring technique
            index.html already uses (border + border-top-color + rounded-full + spin), colors
            matched 1:1 to that file's #dbeafe/#3b82f6 (light) and #1e293b/#60a5fa (dark) - so
            there's no shape or color change at all when the static loader hands off to this one,
            and no dependency on Flowbite ever adding a "Spinner" icon. */}
        <div
          role="presentation"
          className="w-10 h-10 rounded-full border-[3px] border-blue-100 border-t-blue-500 dark:border-slate-800 dark:border-t-blue-400 animate-spin loading-screen__spinner"
        />

        {/* Brand text label removed (26 Aug 2026, explicit request): the logo
            mark itself is distinctive enough now to not need "Ground Code"
            spelled out underneath it - this splash reads as an app launch
            purely through the icon, gradient, and spinner. The sr-only span
            above still carries `message` for assistive tech regardless. */}

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
