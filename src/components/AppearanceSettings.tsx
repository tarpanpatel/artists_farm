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
  // This Tabs instance had no external state at all before (Flowbite tracked
  // the active index internally, with no onActiveTabChange) - added just
  // enough to know which tab is active for the swipe gesture below (11 Sep
  // 2026, explicit request - "wherever there are tabs").
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const tabsRef = useRef<TabsRef>(null);
  const swipeHandlers = useSwipeTabs(tabsRef, activeTabIndex, 2);

  return (
    <div className="space-y-6 appearance-settings">
      <div onTouchStart={swipeHandlers.onTouchStart} onTouchEnd={swipeHandlers.onTouchEnd}>
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
    </div>
  );
};
