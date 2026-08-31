import React, { useState, useEffect } from 'react';
import { AlertCircle, Home } from './icons/FlowbiteIcons';
import { t } from '../i18n/en';

interface LoadingScreenProps {
  message?: string;
}

const LOGO_DATA_URI = "data:image/png;base64,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";

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
        {/* Logo - inlined base64 matching index.html's #initial-loader exactly (zero network delay/flash) */}
        <img
          src={LOGO_DATA_URI}
          alt=""
          width={64}
          height={64}
          className="w-16 h-16 rounded-2xl loading-screen-logo-pulse loading-screen__logo-img"
        />

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
          className="w-10 h-10 rounded-full border-[3px] border-blue-100 border-t-blue-500 dark:border-slate-800 dark:border-t-blue-400 loading-screen-spinner-spin loading-screen__spinner"
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
