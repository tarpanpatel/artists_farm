import React, { useState, useEffect } from 'react';
import { CashDrawerManager } from './CashDrawerManager';
import { PettyCashManagement } from './PettyCashManagement';
import { ExpenseItemsManagement } from './ExpenseItemsManagement';
import { Landmark, FileText, Settings } from './icons/FlowbiteIcons';

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

  useEffect(() => {
    if (initialTab) {
      setActiveSubTab(initialTab);
    }
  }, [initialTab]);

  return (
    <div className="space-y-4">
      {/* Top Segmented Control */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-3">
        <div className="inline-flex p-1 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setActiveSubTab('drawer')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeSubTab === 'drawer'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Landmark className="w-3.5 h-3.5" />
            <span>Cash Drawer</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('expenses')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeSubTab === 'expenses'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Daily Expenses</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('catalog')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeSubTab === 'catalog'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Expense Items</span>
          </button>
        </div>
      </div>

      {/* Sub-tab view */}
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
  );
};
