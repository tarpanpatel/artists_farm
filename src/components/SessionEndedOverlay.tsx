import React from 'react';
import { AlertTriangle } from './icons/FlowbiteIcons';
import { t } from '../i18n/en';

/**
 * Full-screen, non-dismissable block shown when the session ends without this
 * tab asking for it - signed out in another tab, or expired server-side.
 *
 * z-[99999] is the "always on top" tier documented in custom.css's z-index
 * scale (alongside toasts and the confirm dialog). It belongs there rather
 * than in the z-[58] page-modal tier: every request this page can still make
 * is now guaranteed to 401, so nothing already on screen - an open drawer, a
 * half-filled booking form, a toast - may stay interactive above it.
 */
export const SessionEndedOverlay: React.FC = () => (
  <div
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="session-ended-title"
    className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm px-4 py-6"
  >
    <div className="w-full max-w-sm rounded-lg bg-white dark:bg-slate-800 shadow-xl p-4 sm:p-6 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
        <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
      </div>
      <h2 id="session-ended-title" className="text-lg font-semibold text-slate-900 dark:text-white">
        {t('session_ended_title', 'You have been logged out')}
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        {t(
          'session_ended_message',
          'This account was signed out in another tab or window, or the session expired. Sign in again to continue.'
        )}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-800"
      >
        {t('session_ended_action', 'Sign in again')}
      </button>
    </div>
  </div>
);
