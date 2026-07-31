import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../services/api';

export interface MiscChargeTemplate {
  id: number;
  name: string;
  price: number;
  category: string;
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
      const res = await apiFetch('/artists_farm/php/api/router.php?action=get_misc_catalog');
      if (res.status === 'success' && Array.isArray(res.data)) {
        setMiscCharges(res.data);
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
      const res = await apiFetch('/artists_farm/php/api/router.php?action=get_material_categories');
      if (res.status === 'success' && Array.isArray(res.data)) {
        setMaterialCategories(res.data);
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
