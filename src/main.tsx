import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from 'flowbite-react';
import { App } from './App';
// Self-hosted Inter (25 Aug 2026, replaces the fonts.googleapis.com <link> in
// index.html) - same font, same weights (variable 100-900 covers the
// 300/400/500/600/700/800 the app actually uses), but same-origin: no DNS/TLS
// round trip to a third-party host on a cold PWA launch, and it's cacheable
// by sw.js for real offline use. Only the non-italic weight axis is pulled in
// (wght.css, not the heavier standard.css/opsz.css variants) since this app
// never sets font-style: italic. Subsetted by unicode-range same as Google's
// own delivery, so a Latin-only page still only downloads the ~48KB latin
// file, not every script's glyphs.
import '@fontsource-variable/inter/wght.css';
import './index.css';
import './custom.css';
import './mobile_screen_fix.css';
import { recordTelescopeLog } from './utils/telescopeLogger';
import { UpdateAvailableBanner } from './components/UpdateAvailableBanner';
import { ScrollToTopButton } from './components/ScrollToTopButton';
import { setServiceWorkerRegistration } from './utils/serviceWorkerUpdate';

// Error filtering - skip genuine noise only. This list previously also
// matched "Cannot read property/properties" (the single most common real JS
// crash), "is not defined", "not a constructor", "Invalid hook call", and
// "dynamic import" (assumed to be webpack bundling chatter, but this app is
// on Vite, where that phrase is part of "Failed to fetch dynamically
// imported module" - the real error a stale tab throws after a deploy) -
// meaning most real production bugs were silently discarded before ever
// reaching Telescope. Only truly environmental/non-actionable noise belongs
// here.
const shouldLogError = (message: string, _filename?: string): boolean => {
  const noisePatterns = [
    'chrome-extension',          // Browser extension errors, not our code
    'ResizeObserver loop limit', // Harmless browser API quirk
  ];

  return !noisePatterns.some(pattern =>
    message.toLowerCase().includes(pattern.toLowerCase())
  );
};

// Global error handlers to log JS errors to Telescope
window.addEventListener('error', (event) => {
  if (!shouldLogError(event.message, event.filename)) {
    return; // Skip development errors
  }

  // Only log errors that affect actual user experience
  recordTelescopeLog({
    portal: 'js',
    severity: 'ERROR',
    msg: `Uncaught Error: ${event.message}`,
    origin: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : 'Global Context',
    details: { stack: event.error?.stack, message: event.message }
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = String(event.reason);

  // Skip only genuine connectivity blips (e.g. a spotty 3G/4G connection
  // dropping mid-request) - previously this matched any reason text
  // *containing* "fetch" or "404" anywhere, which also silently dropped
  // unrelated bugs like "Cannot read properties of undefined (reading
  // 'fetchData')" purely by coincidental substring match.
  if (/^(TypeError: )?(Failed to fetch|NetworkError when attempting to fetch resource)/i.test(reason.trim())) {
    return;
  }

  recordTelescopeLog({
    portal: 'js',
    severity: 'ERROR',
    msg: `Unhandled Promise Rejection: ${reason}`,
    origin: 'Global Context',
    details: { reason: reason }
  });
});

// Site-wide listener: clicking anywhere inside a date/datetime input opens the calendar picker
window.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target && target.tagName === 'INPUT') {
    const input = target as HTMLInputElement;
    if (['date', 'datetime-local', 'month', 'time'].includes(input.type)) {
      try {
        if (typeof input.showPicker === 'function') {
          input.showPicker();
        }
      } catch (err) {
        // Picker already open or not supported
      }
    }
  }
}, true);

// Register Service Worker for PWA support. sw.js lives at the site root
// (not inside any tenant/property path), so it must be registered with an
// absolute path - a path built from the current URL (e.g.
// /artists_farm/vrikshawan/goa-homes/sw.js) doesn't correspond to a real
// file and 404s through the SPA fallback instead.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then((registration) => {
        // Shared with a manual "check for updates" trigger (Header.tsx) so
        // it can run this exact same check on demand instead of waiting for
        // the timer/focus listener below.
        setServiceWorkerRegistration(registration);

        // sw.js's own install/activate handlers already call skipWaiting()
        // + clients.claim(), so a new worker takes over immediately once
        // the browser has actually fetched and installed it - the missing
        // piece is that browsers only check for a new sw.js on their own
        // roughly once every 24h. An installed PWA can sit open/backgrounded
        // for far longer than that, so check proactively: right away isn't
        // useful (nothing's changed yet), but periodically and whenever the
        // tab regains focus catches "was backgrounded, came back" - the
        // common case for a POS app staff leave open all shift.
        const checkForUpdate = () => registration.update().catch(() => {});
        setInterval(checkForUpdate, 5 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate();
        });

        // controllerchange fires both on this page's first-ever SW install
        // AND when a later update swaps in a new worker - only the second
        // case means "the code running right now is stale, please reload".
        // Distinguish them by checking whether a controller already existed
        // before this fired; the very first activation has none yet.
        let hadController = !!navigator.serviceWorker.controller;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (hadController) {
            window.dispatchEvent(new CustomEvent('sw-update-available'));
          }
          hadController = true;
        });
      }).catch((err) => {
        console.error('Service worker registration failed:', err);
      });
    });
  } else {
    // Unregister any active service worker during local development to avoid DevTools request loops
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    });
  }
}

// Global flowbite-react theme overrides (27 Aug 2026, full-app padding sweep - user report:
// card padding looks inconsistent screen to screen). <Card>'s own className prop only reaches
// its OUTER wrapper div (border/bg/shadow) - the actual padding lives on a SEPARATE inner div
// built from `theme.root.children` directly, with no className merge at all (confirmed in
// node_modules/flowbite-react/dist/components/Card/{Card,theme}.js) - the same "className
// lands on the wrong DOM node" class of bug already found in Input.tsx's TextInput usage and
// DashboardFooter.tsx's FooterLink. That means every one of the ~15 files using <Card> across
// this app was stuck with its hardcoded flat `p-6`, with no per-instance way to fix it. A
// single ThemeProvider override here fixes all of them at once instead of hand-patching each
// call site (or each future one) with its own `theme` prop.
const flowbiteTheme = {
  card: {
    root: {
      children: 'flex h-full flex-col justify-center gap-4 p-4 sm:p-6',
    },
  },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={flowbiteTheme}>
      <App />
      <UpdateAvailableBanner />
      <ScrollToTopButton />
    </ThemeProvider>
  </React.StrictMode>
);
