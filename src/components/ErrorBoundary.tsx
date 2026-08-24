import React, { ReactNode, ErrorInfo } from 'react';
import { AlertCircle, RefreshCw } from './icons/FlowbiteIcons';
import { Button } from './Button';
import { t } from '../i18n/en';
import { recordTelescopeLog } from '../utils/telescopeLogger';

interface Props {
  children: ReactNode;
  section?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const section = this.props.section || t('error_boundary_component_section_fallback');
    console.error(`[ErrorBoundary] ${section} error:`, error, errorInfo);

    // Report to Telescope - previously this only went to the browser console,
    // so a caught screen crash was invisible unless someone had DevTools open
    // on that exact device at that exact moment. This is the primary signal
    // for "a whole screen broke for a tenant", so it must reach the server log.
    recordTelescopeLog({
      portal: 'js',
      severity: 'ERROR',
      msg: `[ErrorBoundary] ${section}: ${error.message}`,
      origin: section,
      details: { stack: error.stack, componentStack: errorInfo.componentStack },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3 error-boundary">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5 error-boundary__icon" />
          <div className="error-boundary__content flex-1 min-w-0">
            <h3 className="font-semibold text-red-900 dark:text-red-200 error-boundary__title">
              {this.props.section ? `${this.props.section} Error` : t('error_boundary_generic_heading')}
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1 error-boundary__message">
              {this.state.error?.message || t('error_boundary_generic_message')}
            </p>
            {/* 24 Aug 2026: this card used to be a permanent dead end - no way
                to recover short of the user knowing to manually refresh/
                force-quit. lazyWithRetry.ts already gives a lazy-loaded
                screen ONE automatic silent reload on a stale-chunk failure,
                but that budget is capped at one per chunk per tab session
                specifically so a genuinely persistent failure (offline, a
                flaky connection that fails twice in a row, a real broken
                deploy) falls through to a real error instead of reload-
                looping forever - this button is what's left for that case:
                an obvious, one-tap way to try again, instead of the user
                being stuck looking at static red text with nothing to do
                about it (reported live: "Inventory Management Error -
                Importing a module script failed", crashed straight through
                the retry with no way forward from the screen itself). */}
            <Button
              variant="danger"
              size="xs"
              className="mt-2.5"
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={() => window.location.reload()}
            >
              {t('error_boundary_reload_button', 'Reload Page')}
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
