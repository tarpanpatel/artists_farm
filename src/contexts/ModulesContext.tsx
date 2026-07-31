import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { fetchPropertyModulesFromDB } from '../services/api';

interface ModuleStatus {
  [moduleSlug: string]: boolean;
}

interface ModulesContextType {
  modules: ModuleStatus;
  isEnabled: (moduleSlug: string) => boolean;
  loading: boolean;
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

  useEffect(() => {
    // Only fetch if no initial data was provided
    if (initialData) {
      setLoading(false);
      return;
    }

    const loadModules = async () => {
      try {
        const modulesList = await fetchPropertyModulesFromDB();
        const moduleMap: ModuleStatus = {};
        modulesList.forEach((mod: any) => {
          moduleMap[mod.slug] = mod.is_enabled;
        });
        setModules(moduleMap);
      } catch (err) {
        console.error('Failed to fetch property modules:', err);
      } finally {
        setLoading(false);
      }
    };

    loadModules();
  }, [initialData]);

  const isEnabled = useMemo(
    () => (moduleSlug: string): boolean => modules[moduleSlug] ?? false,
    [modules]
  );

  return (
    <ModulesContext.Provider value={{ modules, isEnabled, loading }}>
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
