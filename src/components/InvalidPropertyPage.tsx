import React, { useState, useEffect } from 'react';
import { Card } from 'flowbite-react';
import { AlertCircle, Home } from './icons/FlowbiteIcons';
import { Button } from './Button';
import { t } from '../i18n/en';

export const InvalidPropertyPage: React.FC<{ propertySlug?: string }> = ({ propertySlug: _propertySlug }) => {
  const [, setLoading] = useState(true);

  useEffect(() => {
    // Fetch available properties from a dedicated API endpoint
    const loadProperties = async () => {
      try {
        // For now, show a message to contact admin
        setLoading(false);
      } catch (err) {
        console.error('Failed to load properties:', err);
        setLoading(false);
      }
    };
    loadProperties();
  }, []);

  return (
    <div className="invalid-property-page min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
      <Card className="invalid-property-page__card max-w-md w-full border-gray-200 dark:border-gray-700 text-center">
        {/* Error Icon */}
        <div className="invalid-property-page__icon-wrap flex justify-center mb-4">
          <div className="invalid-property-page__icon w-16 h-16 bg-red-100 dark:bg-red-950/50 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
        </div>

        {/* Error Message */}
        <h1 className="invalid-property-page__heading text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {t('invalid_property_heading')}
        </h1>
        <p className="invalid-property-page__message text-gray-600 dark:text-gray-400 text-center text-sm mb-6">
          {t('invalid_property_message')}
        </p>

        {/* Action Button */}
        <a href="/" className="w-full no-underline">
          <Button variant="primary" size="md" className="w-full flex items-center justify-center gap-2">
            <Home className="w-4 h-4" />
            <span>{t('invalid_property_home_button')}</span>
          </Button>
        </a>

        {/* Help Text */}
        <p className="invalid-property-page__help-text text-xs text-gray-500 dark:text-gray-400 text-center mt-4">
          {t('invalid_property_help_text')}
        </p>
      </Card>
    </div>
  );
};
