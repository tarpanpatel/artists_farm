import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchMiscCatalogFromDB, fetchMaterialCategoriesFromDB } from '../services/api';

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
  is_ingredient: number;
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
  const [miscCharges, setMiscCharges] = useState<MiscChargeTemplate[]>([]);
  const [materialCategories, setMaterialCategories] = useState<MaterialCategory[]>([]);
  const [isLoadingMisc, setIsLoadingMisc] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

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
    fetchMiscCharges();
    fetchMaterialCategories();
  }, []);

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
