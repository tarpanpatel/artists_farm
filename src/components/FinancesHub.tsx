import React, { useState, useEffect, useRef } from 'react';
import { Tabs, TabItem, TabsRef } from 'flowbite-react';
import { attachedTabsTheme, attachedTabsClearTheme } from '../utils/tabsTheme';
import { useSwipeTabs } from '../utils/useSwipeTabs';
import { CashDrawerManager } from './CashDrawerManager';
import { PettyCashManagement } from './PettyCashManagement';
import { Landmark, FileText } from './icons/FlowbiteIcons';
import { t } from '../i18n/en';

interface FinancesHubProps {
  initialTab?: 'drawer' | 'expenses';
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
  const [activeSubTab, setActiveSubTab] = useState<'drawer' | 'expenses'>(initialTab);
  // Keep a sub-view mounted once it has been opened, and hide it when you
  // move off, instead of unmounting it (11 Sep 2026). These panels
  // hold real inline money-entry work - Cash Drawer's handover form, and
  // Daily Expenses' full-width Add Expenses card with its OCR-scanned
  // receipt - none of it autosaved. Rendered with `&&`, leaving the tab
  // threw every bit of that away, and it did so BEFORE swipe existed:
  // tapping the tab lost it just the same. Fixed at the source rather
  // than by avoiding the gesture. Mount-on-first-visit, so nothing is
  // paid for a tab never opened, and neither runs timers or
  // polling (checked), so a hidden one costs nothing while it sits there.
  const [visitedTabs, setVisitedTabs] = useState<Set<'drawer' | 'expenses'>>(
    () => new Set([initialTab])
  );
  useEffect(() => {
    setVisitedTabs((prev) => (prev.has(activeSubTab) ? prev : new Set(prev).add(activeSubTab)));
  }, [activeSubTab]);
  const tabsRef = useRef<TabsRef>(null);

  const subTabKeys: ('drawer' | 'expenses')[] = ['drawer', 'expenses'];

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

  // Swipe anywhere on the page to move between these tabs (11 Sep 2026).
  useSwipeTabs(tabsRef, subTabKeys.indexOf(activeSubTab), subTabKeys.length);

  const handleTabChange = (index: number) => {
    const key = subTabKeys[index];
    if (key) {
      setActiveSubTab(key);
      if (typeof window !== 'undefined') {
        if (key === 'drawer') window.location.hash = '#finances';
        else if (key === 'expenses') window.location.hash = '#expenses';
      }
    }
  };

  return (
    <div className="finances-hub">
      {/* Attached Tabs Specification (DESIGN.md line 322). Was
          `space-y-6` on this whole wrapper (24px gap) - each sub-view
          (CashDrawerManager/PettyCashManagement)
          opens with its own bare PageHeader (no card/border of its own), so
          that much empty grey-background space between the attached tab
          strip and a floating, unbounded title read as "not part of the
          page" (11 Sep 2026, explicit report + screenshot). None of the
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
        </Tabs>
      </div>

      {/* Sub-tab view - hidden, not unmounted, once visited (see
          visitedTabs above for why). */}
      {visitedTabs.has('drawer') && (
        <div hidden={activeSubTab !== 'drawer'}>
          <CashDrawerManager
            onLogAudit={onLogAudit}
            onDispatchTelegram={onDispatchTelegram}
          />
        </div>
      )}
      {visitedTabs.has('expenses') && (
        <div hidden={activeSubTab !== 'expenses'}>
          <PettyCashManagement
            activeRole={activeRole}
            onDispatchTelegram={onDispatchTelegram}
          />
        </div>
      )}
    </div>
  );
};
