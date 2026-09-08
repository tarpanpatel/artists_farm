import React, { useState, useEffect, useRef } from 'react';
import { Tabs, TabItem, TabsRef } from 'flowbite-react';
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
  const tabsRef = useRef<TabsRef>(null);

  useEffect(() => {
    if (initialTab) {
      setActiveSubTab(initialTab);
      const tabIndex = initialTab === 'connections' ? 0 : 1;
      tabsRef.current?.setActiveTab(tabIndex);
    }
  }, [initialTab]);

  const handleTabChange = (tabIndex: number) => {
    const nextTab = tabIndex === 0 ? 'connections' : 'sync_console';
    setActiveSubTab(nextTab);
    if (typeof window !== 'undefined') {
      window.location.hash = nextTab === 'connections' ? '#connect_channels' : '#channel_manager';
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      {/* Standard Flowbite Default Tabs */}
      <Tabs
        ref={tabsRef}
        aria-label="OTA Channels Navigation"
        variant="default"
        onActiveTabChange={handleTabChange}
      >
        <TabItem
          active={activeSubTab === 'connections'}
          title={
            <span className="inline-flex items-center gap-2">
              <Plug className="w-4 h-4" />
              <span>Channel Connections</span>
            </span>
          }
        />
        <TabItem
          active={activeSubTab === 'sync_console'}
          title={
            <span className="inline-flex items-center gap-2">
              <Zap className="w-4 h-4" />
              <span>Live Rates & Sync Console</span>
            </span>
          }
        />
      </Tabs>

      {/* Sub-tab view */}
      {activeSubTab === 'connections' ? (
        <ChannelConnectionsPage propertyId={propertyId} onLogAudit={onLogAudit} />
      ) : (
        <ChannelManager onLogAudit={onLogAudit} />
      )}
    </div>
  );
};

