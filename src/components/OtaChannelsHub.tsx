import React, { useState, useEffect, useRef } from 'react';
import { Tabs, TabItem, TabsRef } from 'flowbite-react';
import { ChannelConnectionsPage } from './ChannelConnectionsPage';
import { ChannelManager } from './ChannelManager';
import { GoLiveStatusPage } from './GoLiveStatusPage';
import { Plug, Zap, Rocket } from './icons/FlowbiteIcons';

interface OtaChannelsHubProps {
  propertyId: number;
  initialTab?: 'connections' | 'sync_console' | 'go_live';
  onLogAudit?: (actionText: string, extra?: { status?: string; module?: string; user?: string }) => void;
}

const TAB_ORDER: Array<'connections' | 'sync_console' | 'go_live'> = ['connections', 'sync_console', 'go_live'];
const TAB_HASH: Record<'connections' | 'sync_console' | 'go_live', string> = {
  connections: '#connect_channels',
  sync_console: '#channel_manager',
  go_live: '#go_live',
};

export const OtaChannelsHub: React.FC<OtaChannelsHubProps> = ({
  propertyId,
  initialTab = 'connections',
  onLogAudit,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'connections' | 'sync_console' | 'go_live'>(initialTab);
  const tabsRef = useRef<TabsRef>(null);

  useEffect(() => {
    if (initialTab) {
      setActiveSubTab(initialTab);
      tabsRef.current?.setActiveTab(TAB_ORDER.indexOf(initialTab));
    }
  }, [initialTab]);

  const handleTabChange = (tabIndex: number) => {
    const nextTab = TAB_ORDER[tabIndex] || 'connections';
    setActiveSubTab(nextTab);
    if (typeof window !== 'undefined') {
      window.location.hash = TAB_HASH[nextTab];
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
        <TabItem
          active={activeSubTab === 'go_live'}
          title={
            <span className="inline-flex items-center gap-2">
              <Rocket className="w-4 h-4" />
              <span>Go Live Status</span>
            </span>
          }
        />
      </Tabs>

      {/* Sub-tab view */}
      {activeSubTab === 'connections' && <ChannelConnectionsPage propertyId={propertyId} onLogAudit={onLogAudit} />}
      {activeSubTab === 'sync_console' && <ChannelManager onLogAudit={onLogAudit} />}
      {activeSubTab === 'go_live' && <GoLiveStatusPage propertyId={propertyId} />}
    </div>
  );
};

