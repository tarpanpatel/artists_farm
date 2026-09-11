import React, { useRef, useState } from 'react';
import { Tabs, TabItem, TabsRef } from 'flowbite-react';
import { Palette, Code } from './icons/FlowbiteIcons';
import { ThemeManagement } from './ThemeManagement';
import { CustomCSSOverride } from './CustomCSSOverride';
import { t } from '../i18n/en';
import { centeredTabsTheme } from '../utils/tabsTheme';
import { useSwipeTabs } from '../utils/useSwipeTabs';

interface AppearanceSettingsProps {
  activeRole?: string;
}

export const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({ activeRole = '' }) => {
  // No external tab state existed here - flowbite tracked the active
  // index internally with no onActiveTabChange. Added just enough of it
  // for the swipe gesture to know where it is (11 Sep 2026).
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const tabsRef = useRef<TabsRef>(null);
  useSwipeTabs(tabsRef, activeTabIndex, 2);

  return (
    <div className="space-y-6 appearance-settings">
      <Tabs
        ref={tabsRef}
        variant="default"
        theme={centeredTabsTheme}
        onActiveTabChange={setActiveTabIndex}
      >
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
