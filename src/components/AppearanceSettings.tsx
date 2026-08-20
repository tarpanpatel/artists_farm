import React from 'react';
import { Tabs, TabItem } from 'flowbite-react';
import { Palette, Code } from 'lucide-react';
import { ThemeManagement } from './ThemeManagement';
import { CustomCSSOverride } from './CustomCSSOverride';
import { t } from '../i18n/en';

interface AppearanceSettingsProps {
  activeRole?: string;
}

export const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({ activeRole = '' }) => {
  return (
    <div className="space-y-6 appearance-settings">
      <Tabs variant="underline">
        <TabItem active title={t('appearance_settings_theme_tab', 'Theme Colors')} icon={Palette}>
          <div className="pt-4">
            <ThemeManagement />
          </div>
        </TabItem>
        <TabItem title={t('appearance_settings_css_tab', 'Custom CSS')} icon={Code}>
          <div className="pt-4">
            <CustomCSSOverride activeRole={activeRole} />
          </div>
        </TabItem>
      </Tabs>
    </div>
  );
};
