import React, { useState } from 'react';
import { ThemeManagement } from './ThemeManagement';
import { CustomCSSOverride } from './CustomCSSOverride';
import { t } from '../i18n/en';

import { Button } from './Button';

interface AppearanceSettingsProps {
  activeRole?: string;
}

export const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({ activeRole = '' }) => {
  const [activeTab, setActiveTab] = useState<'theme' | 'css'>('css');

  return (
    <div className="space-y-6 appearance-settings">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 pb-2 appearance-settings__tabs">
        <Button
          variant={activeTab === 'theme' ? 'primary' : 'ghost'}
          size="md"
          onClick={() => setActiveTab('theme')}
        >
          {t('appearance_settings_theme_tab')}
        </Button>
        <Button
          variant={activeTab === 'css' ? 'primary' : 'ghost'}
          size="md"
          onClick={() => setActiveTab('css')}
        >
          {t('appearance_settings_css_tab')}
        </Button>
      </div>

      {/* Tab Content */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 appearance-settings__content">
        {activeTab === 'theme' ? (
          <ThemeManagement />
        ) : (
          <CustomCSSOverride activeRole={activeRole} />
        )}
      </div>
    </div>
  );
};
