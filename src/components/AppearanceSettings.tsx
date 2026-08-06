import React, { useState } from 'react';
import { Palette } from 'lucide-react';
import { ThemeManagement } from './ThemeManagement';
import { CustomCSSOverride } from './CustomCSSOverride';
import { t } from '../i18n/en';

interface AppearanceSettingsProps {
  activeRole?: string;
}

export const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({ activeRole = '' }) => {
  const [activeTab, setActiveTab] = useState<'theme' | 'css'>('theme');

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('theme')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'theme'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          {t('appearance_settings_theme_tab')}
        </button>
        <button
          onClick={() => setActiveTab('css')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'css'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          {t('appearance_settings_css_tab')}
        </button>
      </div>

      {/* Tab Content */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        {activeTab === 'theme' ? (
          <ThemeManagement />
        ) : (
          <CustomCSSOverride activeRole={activeRole} />
        )}
      </div>
    </div>
  );
};
