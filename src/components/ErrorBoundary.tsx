import React, { ReactNode, ErrorInfo } from 'react';
import { AlertCircle } from 'lucide-react';
import { t } from '../i18n/en';

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
    console.error(`[ErrorBoundary] ${this.props.section || t('error_boundary_component_section_fallback')} error:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3 error-boundary">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5 error-boundary__icon" />
          <div className="error-boundary__content">
            <h3 className="font-semibold text-red-900 dark:text-red-200 error-boundary__title">
              {this.props.section ? `${this.props.section} Error` : t('error_boundary_generic_heading')}
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1 error-boundary__message">
              {this.state.error?.message || t('error_boundary_generic_message')}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
