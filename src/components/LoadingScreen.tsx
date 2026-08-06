import React, { useState, useEffect } from 'react';
import { Building2, AlertCircle } from 'lucide-react';
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
    <div className="fixed inset-0 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center z-50">
      <div className="flex flex-col items-center gap-8">
        {/* Animated Logo */}
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Building2 className="w-8 h-8 text-white" />
          </div>
        </div>

        {/* Loading Spinner */}
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-slate-700" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 border-r-indigo-500 animate-spin" />
        </div>

        {/* Message */}
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {t('artists_farm_brand')}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {message}
          </p>
        </div>

        {/* Loading Dots */}
        <div className="flex gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0s' }} />
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0.2s' }} />
          <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '0.4s' }} />
        </div>

        {/* Timeout Notice & Cancel Button */}
        {showTimeout && (
          <div className="mt-6 pt-6 border-t border-slate-300 dark:border-slate-600">
            <div className="flex gap-2 items-start mb-4 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {t('loading_timeout_message')}
              </p>
            </div>
            <a
              href="/artists_farm/"
              className="block w-full text-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-lg transition-colors"
            >
              {t('go_home_button')}
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
