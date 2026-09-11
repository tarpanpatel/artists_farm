import React, { useState, useEffect, useRef } from 'react';
import { Tabs, TabItem, TabsRef } from 'flowbite-react';
import { attachedTabsTheme, attachedTabsClearTheme } from '../utils/tabsTheme';
import { useSwipeTabs } from '../utils/useSwipeTabs';
import { CashDrawerManager } from './CashDrawerManager';
import { PettyCashManagement } from './PettyCashManagement';
import { ExpenseItemsManagement } from './ExpenseItemsManagement';
import { Landmark, FileText, Settings } from './icons/FlowbiteIcons';
import { t } from '../i18n/en';

interface FinancesHubProps {
  initialTab?: 'drawer' | 'expenses' | 'catalog';
  activeRole?: string;
  onLogAudit?: (action: string, extra?: any) => void;
  onDispatchTelegram?: (eventType: string, message: string, category?: string, replyMarkup?: any, templateKey?: string, mediaUrls?: string[], deepLinkParams?: Record<string, string | number>) => void;
}

export const FinancesHub: React.FC<FinancesHubProps> = ({
  initialTab = 'drawer',
  activeRole,
  onLogAudit,
  onDispatchTelegram,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'drawer' | 'expenses' | 'catalog'>(initialTab);
  const tabsRef = useRef<TabsRef>(null);

  const subTabKeys: ('drawer' | 'expenses' | 'catalog')[] = ['drawer', 'expenses', 'catalog'];

  useEffect(() => {
    if (initialTab) {
      setActiveSubTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    const idx = subTabKeys.indexOf(activeSubTab);
    if (idx >= 0) {
      tabsRef.current?.setActiveTab(idx);
    }
  }, [activeSubTab]);

  const handleTabChange = (index: number) => {
    const key = subTabKeys[index];
    if (key) {
      setActiveSubTab(key);
      if (typeof window !== 'undefined') {
        if (key === 'drawer') window.location.hash = '#finances';
        else if (key === 'expenses') window.location.hash = '#expenses';
        else if (key === 'catalog') window.location.hash = '#edit_expense_items';
      }
    }
  };

  // Swipe left/right on the sub-tab content to move to the next/previous
  // tab (11 Sep 2026, explicit request - "wherever there are tabs").
  const swipeHandlers = useSwipeTabs(tabsRef, subTabKeys.indexOf(activeSubTab), subTabKeys.length);

  return (
    <div className="finances-hub">
      {/* Attached Tabs Specification (DESIGN.md line 322). Was
          `space-y-6` on this whole wrapper (24px gap) - each sub-view
          (CashDrawerManager/PettyCashManagement/ExpenseItemsManagement)
          opens with its own bare PageHeader (no card/border of its own), so
          that much empty grey-background space between the attached tab
          strip and a floating, unbounded title read as "not part of the
          page" (11 Sep 2026, explicit report + screenshot). None of the 3
          sub-views' own internal spacing is touched - each still manages
          its own `space-y-*` inside its own returned JSX; this only
          tightens the one gap FinancesHub itself controls, between the
          tabs and whichever sub-view is active. */}
      <div className="finances-hub-tabs-desk mb-3">
        <Tabs
          ref={tabsRef}
          aria-label="Finances Tabs"
          variant="default"
          theme={attachedTabsTheme}
          clearTheme={attachedTabsClearTheme}
          onActiveTabChange={handleTabChange}
        >
          <TabItem
            active={activeSubTab === 'drawer'}
            title={
              <span className="inline-flex items-center gap-2">
                <Landmark className="w-4 h-4" />
                <span>{t('cash_drawer', 'Cash Drawer')}</span>
              </span>
            }
          />
          <TabItem
            active={activeSubTab === 'expenses'}
            title={
              <span className="inline-flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span>{t('daily_expenses', 'Daily Expenses')}</span>
              </span>
            }
          />
          <TabItem
            active={activeSubTab === 'catalog'}
            title={
              <span className="inline-flex items-center gap-2">
                <Settings className="w-4 h-4" />
                <span>{t('expense_items', 'Expense Items')}</span>
              </span>
            }
          />
        </Tabs>
      </div>

      {/* Sub-tab view */}
      <div onTouchStart={swipeHandlers.onTouchStart} onTouchEnd={swipeHandlers.onTouchEnd}>
        {activeSubTab === 'drawer' && (
          <CashDrawerManager
            onLogAudit={onLogAudit}
            onDispatchTelegram={onDispatchTelegram}
          />
        )}
        {activeSubTab === 'expenses' && (
          <PettyCashManagement
            activeRole={activeRole}
            onDispatchTelegram={onDispatchTelegram}
          />
        )}
        {activeSubTab === 'catalog' && (
          <ExpenseItemsManagement />
        )}
      </div>
    </div>
  );
};
