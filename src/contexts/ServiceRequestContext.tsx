import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ServiceRequest, fetchServiceRequestsFromDB } from '../services/api';
import { useAuth } from './AuthContext';

interface ServiceRequestContextValue {
  requests: ServiceRequest[];
  pendingRequests: ServiceRequest[];
  pendingCount: number;
  loading: boolean;
  refreshRequests: () => Promise<void>;
  // Bumped by the mobile bottom nav / sidebar / AI-chat "Add Service Request"
  // quick actions. ServiceRequestsManagement only mounts on the service_requests
  // tab, so those entry points navigate there AND bump this - the component
  // watches it, opens its New Service Request drawer once mounted (instead of
  // just dropping the user on the tab to hunt for the "New Request" button),
  // then calls consumeAddDrawer() so simply revisiting the tab later doesn't
  // re-pop the drawer (the component fully unmounts when the tab changes, so a
  // component-local "already handled" ref wouldn't survive to prevent that).
  addDrawerNonce: number;
  requestAddDrawer: () => void;
  consumeAddDrawer: () => void;
}

const ServiceRequestContext = createContext<ServiceRequestContextValue | null>(null);

export const useServiceRequestContext = (): ServiceRequestContextValue => {
  const ctx = useContext(ServiceRequestContext);
  if (!ctx) throw new Error('useServiceRequestContext must be used within ServiceRequestProvider');
  return ctx;
};

/**
 * Shared source of truth for service requests, mirroring KitchenContext's
 * shape - the notification bell (Header.tsx) needs the same live pending
 * list ServiceRequestsManagement.tsx shows, and having both fetch/hold
 * their own separate copy would mean marking one fulfilled there doesn't
 * update the badge count here until an unrelated re-fetch happens to
 * occur. One shared list, refreshed by whichever screen mutated it.
 */
export const ServiceRequestProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, authChecked } = useAuth();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDrawerNonce, setAddDrawerNonce] = useState(0);

  const requestAddDrawer = useCallback(() => setAddDrawerNonce((n) => n + 1), []);
  const consumeAddDrawer = useCallback(() => setAddDrawerNonce(0), []);

  const refreshRequests = useCallback(async () => {
    const data = await fetchServiceRequestsFromDB();
    setRequests(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authChecked && isAuthenticated) {
      refreshRequests();
    }
  }, [isAuthenticated, authChecked, refreshRequests]);

  const pendingRequests = requests.filter((r) => r.status === 'Pending');

  return (
    <ServiceRequestContext.Provider
      value={{
        requests,
        pendingRequests,
        pendingCount: pendingRequests.length,
        loading,
        refreshRequests,
        addDrawerNonce,
        requestAddDrawer,
        consumeAddDrawer,
      }}
    >
      {children}
    </ServiceRequestContext.Provider>
  );
};
