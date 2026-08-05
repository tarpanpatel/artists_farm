import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { recordTelescopeLog } from './utils/telescopeLogger';

// Smart error filtering - only log REAL user errors, not development issues
const shouldLogError = (message: string, filename?: string): boolean => {
  // Skip development-only errors
  const devOnlyPatterns = [
    'is not defined',           // Component import issues
    'Cannot read property',     // Typical dev errors
    'Cannot read properties',   // Typical dev errors
    'dynamic import',           // Webpack bundling info
    'not a constructor',        // Module issues
    'Invalid hook call',        // React dev-only errors
    'warning',                  // Console warnings
    'chrome-extension',         // Browser extension errors
    'ResizeObserver loop limit', // Browser API errors
  ];

  return !devOnlyPatterns.some(pattern =>
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

  // Skip network/API errors that are already handled elsewhere
  if (reason.includes('NetworkError') || reason.includes('fetch') || reason.includes('404')) {
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
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
