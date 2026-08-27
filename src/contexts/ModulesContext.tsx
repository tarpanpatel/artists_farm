import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { fetchPropertyModulesFromDB, getPropertySlug } from '../services/api';
import { useAuth } from './AuthContext';

interface ModuleStatus {
  [moduleSlug: string]: boolean;
}

interface ModulesContextType {
  modules: ModuleStatus;
  isEnabled: (moduleSlug: string) => boolean;
  loading: boolean;
  refetchModules: () => Promise<void>;
}

const ModulesContext = createContext<ModulesContextType | null>(null);

interface ModulesProviderProps {
  children: React.ReactNode;
  initialData?: Array<{ slug: string; is_enabled: boolean }>;
}

export const ModulesProvider: React.FC<ModulesProviderProps> = ({ children, initialData }) => {
  const [modules, setModules] = useState<ModuleStatus>(() => {
    if (initialData && Array.isArray(initialData)) {
      const moduleMap: ModuleStatus = {};
      initialData.forEach((mod: any) => {
        moduleMap[mod.slug] = mod.is_enabled;
      });
      return moduleMap;
    }
    return {};
  });
  const [loading, setLoading] = useState(!initialData);
  const [currentSlug, setCurrentSlug] = useState(() => getPropertySlug());
  const { isAuthenticated, authChecked } = useAuth();

  // Update modules state whenever initialData changes from parent
  useEffect(() => {
    if (initialData && Array.isArray(initialData)) {
      const moduleMap: ModuleStatus = {};
      initialData.forEach((mod: any) => {
        moduleMap[mod.slug] = mod.is_enabled;
      });
      setModules(moduleMap);
      setLoading(false);
    }
  }, [initialData]);

  // isAuthenticated guard (27 Aug 2026, app-wide sweep): ModulesProvider wraps
  // the whole app unconditionally, well before AuthContext's own async login
  // sequence resolves - unlike its sibling providers (StaffContext,
  // FinanceContext, etc.), which all already gate on isAuthenticated. Guarding
  // inside the shared refetchModules() itself (rather than each of its 3 call
  // sites below) covers all of them at once, and since isAuthenticated is a
  // dependency here, the "Initial load check" effect re-runs and correctly
  // retries the moment auth resolves.
  const refetchModules = useCallback(async () => {
    if (!authChecked || !isAuthenticated) return;
    try {
      setLoading(true);
      const modulesList = await fetchPropertyModulesFromDB();
      if (modulesList && Array.isArray(modulesList) && modulesList.length > 0) {
        const moduleMap: ModuleStatus = {};
        modulesList.forEach((mod: any) => {
          moduleMap[mod.slug] = mod.is_enabled;
        });
        setModules(moduleMap);
      }
    } catch (err) {
      console.error('Failed to fetch property modules:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, authChecked]);

  // Listen to route/hash/location changes & property slug changes
  useEffect(() => {
    const handleRouteChange = () => {
      const newSlug = getPropertySlug();
      if (newSlug !== currentSlug) {
        setCurrentSlug(newSlug);
        refetchModules();
      }
    };

    // When this tab regains focus/visibility (e.g. the user toggled a module
    // for this property in Root Admin in another tab and switched back), the
    // property slug doesn't change - so the slug-guard above never fires and
    // this tab would keep showing stale module state until a manual refresh.
    // Refetching on visibilitychange makes module toggles reflect immediately
    // without reloading.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refetchModules();
      }
    };

    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('hashchange', handleRouteChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial load check if initialData was not provided
    if (!initialData || Object.keys(modules).length === 0) {
      refetchModules();
    }

    return () => {
      window.removeEventListener('popstate', handleRouteChange);
      window.removeEventListener('hashchange', handleRouteChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentSlug, initialData, refetchModules]);

  const isEnabled = useCallback(
    (moduleSlug: string): boolean => {
      if (modules[moduleSlug] !== undefined) {
        return modules[moduleSlug];
      }
      return true;
    },
    [modules]
  );

  return (
    <ModulesContext.Provider value={{ modules, isEnabled, loading, refetchModules }}>
      {children}
    </ModulesContext.Provider>
  );
};

export const useModules = (): ModulesContextType => {
  const context = useContext(ModulesContext);
  if (!context) {
    throw new Error('useModules must be used within ModulesProvider');
  }
  return context;
};
