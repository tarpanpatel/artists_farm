import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ServiceRequest, fetchServiceRequestsFromDB } from '../services/api';
import { useAuth } from './AuthContext';

interface ServiceRequestContextValue {
  requests: ServiceRequest[];
  pendingRequests: ServiceRequest[];
  pendingCount: number;
  loading: boolean;
  refreshRequests: () => Promise<void>;
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
  const { isAuthenticated } = useAuth();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshRequests = useCallback(async () => {
    const data = await fetchServiceRequestsFromDB();
    setRequests(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      refreshRequests();
    }
  }, [isAuthenticated, refreshRequests]);

  const pendingRequests = requests.filter((r) => r.status === 'Pending');

  return (
    <ServiceRequestContext.Provider
      value={{
        requests,
        pendingRequests,
        pendingCount: pendingRequests.length,
        loading,
        refreshRequests,
      }}
    >
      {children}
    </ServiceRequestContext.Provider>
  );
};
