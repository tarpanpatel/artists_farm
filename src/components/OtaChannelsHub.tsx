import React, { useState, useEffect } from 'react';
import { ChannelConnectionsPage } from './ChannelConnectionsPage';
import { ChannelManager } from './ChannelManager';
import { Plug, Zap } from './icons/FlowbiteIcons';

interface OtaChannelsHubProps {
  propertyId: number;
  initialTab?: 'connections' | 'sync_console';
  onLogAudit?: (actionText: string, extra?: { status?: string; module?: string; user?: string }) => void;
}

export const OtaChannelsHub: React.FC<OtaChannelsHubProps> = ({
  propertyId,
  initialTab = 'connections',
  onLogAudit,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'connections' | 'sync_console'>(initialTab);

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
            onClick={() => setActiveSubTab('connections')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeSubTab === 'connections'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Plug className="w-3.5 h-3.5" />
            <span>Channel Connections</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('sync_console')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeSubTab === 'sync_console'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Live Rates & Sync Console</span>
          </button>
        </div>
      </div>

      {/* Sub-tab view */}
      {activeSubTab === 'connections' ? (
        <ChannelConnectionsPage propertyId={propertyId} onLogAudit={onLogAudit} />
      ) : (
        <ChannelManager onLogAudit={onLogAudit} />
      )}
    </div>
  );
};
