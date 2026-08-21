import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchMiscCatalogFromDB, fetchMaterialCategoriesFromDB } from '../services/api';
import { useModules } from './ModulesContext';
import { useAuth } from './AuthContext';

export interface MiscChargeTemplate {
  id: string | number;
  label: string;
  default_amount: number;
  category: string;
  description?: string;
}

export interface MaterialCategory {
  id: number;
  name: string;
}

interface ConfigurationDataContextValue {
  miscCharges: MiscChargeTemplate[];
  materialCategories: MaterialCategory[];
  isLoadingMisc: boolean;
  isLoadingCategories: boolean;
  refreshMiscCharges: () => Promise<void>;
  refreshMaterialCategories: () => Promise<void>;
}

const ConfigurationDataContext = createContext<ConfigurationDataContextValue | null>(null);

export const useConfigurationData = (): ConfigurationDataContextValue => {
  const ctx = useContext(ConfigurationDataContext);
  if (!ctx) throw new Error('useConfigurationData must be used within ConfigurationDataProvider');
  return ctx;
};

export const ConfigurationDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isEnabled } = useModules();
  const { isAuthenticated } = useAuth();
  const [miscCharges, setMiscCharges] = useState<MiscChargeTemplate[]>([]);
  const [materialCategories, setMaterialCategories] = useState<MaterialCategory[]>([]);
  // Default true, not false (14 Aug 2026 fix): both start an unconditional
  // fetch on mount (see the effect below), so there's always a brief window
  // before it resolves - defaulting to false let MiscChargesManagement's "No
  // miscellaneous charges found." render during that window, same class of
  // bug as Inventory/Kitchen/Finance contexts above.
  const [isLoadingMisc, setIsLoadingMisc] = useState(true);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);

  const fetchMiscCharges = async () => {
    setIsLoadingMisc(true);
    try {
      const data = await fetchMiscCatalogFromDB();
      if (Array.isArray(data)) {
        setMiscCharges(data);
      }
    } catch (error) {
      console.error('Failed to fetch misc charges:', error);
    } finally {
      setIsLoadingMisc(false);
    }
  };

  const fetchMaterialCategories = async () => {
    setIsLoadingCategories(true);
    try {
      const data = await fetchMaterialCategoriesFromDB();
      if (Array.isArray(data)) {
        setMaterialCategories(data);
      }
    } catch (error) {
      console.error('Failed to fetch material categories:', error);
    } finally {
      setIsLoadingCategories(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchMiscCharges();
    if (isEnabled('kitchen')) {
      fetchMaterialCategories();
    } else {
      // Never going to fetch for this property - don't leave isLoadingCategories
      // stuck true forever now that it defaults true.
      setIsLoadingCategories(false);
    }
  }, [isEnabled, isAuthenticated]);

  return (
    <ConfigurationDataContext.Provider
      value={{
        miscCharges,
        materialCategories,
        isLoadingMisc,
        isLoadingCategories,
        refreshMiscCharges: fetchMiscCharges,
        refreshMaterialCategories: fetchMaterialCategories,
      }}
    >
      {children}
    </ConfigurationDataContext.Provider>
  );
};
