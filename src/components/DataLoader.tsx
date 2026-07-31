import React, { useEffect, useState } from 'react';
import { LoadingScreen } from './LoadingScreen';
import { InvalidPropertyPage } from './InvalidPropertyPage';
import {
  fetchCurrentProperty,
  fetchPropertyModulesFromDB,
  fetchNavMenuFromDB,
  fetchTelegramConfigDB,
  getPropertySlug,
} from '../services/api';

export interface PreloadedData {
  currentProperty: any;
  modules: Array<{ slug: string; is_enabled: boolean }>;
  navItems: any[];
  telegramConfig: any;
}

interface DataLoaderProps {
  children: (data: PreloadedData) => React.ReactNode;
}

export const DataLoader: React.FC<DataLoaderProps> = ({ children }) => {
  const [data, setData] = useState<PreloadedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [invalidProperty, setInvalidProperty] = useState<string | null>(null);

  useEffect(() => {
    const loadAllData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Check if property slug is present in URL
        const propertySlug = getPropertySlug();
        if (!propertySlug || propertySlug === 'default') {
          setInvalidProperty(propertySlug);
          setIsLoading(false);
          return;
        }

        // Create a timeout promise that resolves after 3 seconds
        const timeoutPromise = new Promise((resolve) => {
          setTimeout(() => resolve(null), 3000);
        });

        // Fetch all data in parallel with timeout fallback
        const results = await Promise.race([
          Promise.all([
            fetchCurrentProperty().catch(err => {
              console.error('Failed to fetch current property:', err);
              return null;
            }),
            fetchPropertyModulesFromDB().catch(err => {
              console.error('Failed to fetch modules:', err);
              return [];
            }),
            fetchNavMenuFromDB().catch(err => {
              console.error('Failed to fetch nav items:', err);
              return [];
            }),
            fetchTelegramConfigDB().catch(err => {
              console.error('Failed to fetch telegram config:', err);
              return null;
            }),
          ]),
          timeoutPromise.then(() => [null, [], [], null]), // Default values on timeout
        ]);

        const [property, modules, navItems, telegramConfig] = results as any[];

        setData({
          currentProperty: property,
          modules: Array.isArray(modules) ? modules : [],
          navItems: Array.isArray(navItems) ? navItems : [],
          telegramConfig: telegramConfig,
        });
      } catch (err) {
        console.error('Critical error loading app data:', err);
        // Still render app with empty data instead of showing error
        setData({
          currentProperty: null,
          modules: [],
          navItems: [],
          telegramConfig: null,
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadAllData();
  }, []);

  if (invalidProperty !== null) {
    return <InvalidPropertyPage propertySlug={invalidProperty} />;
  }

  if (isLoading) {
    return <LoadingScreen message="Loading application..." />;
  }

  if (error && !data) {
    return (
      <div className="fixed inset-0 bg-red-50 dark:bg-red-950 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 max-w-md shadow-lg border border-red-200 dark:border-red-800">
          <h2 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">
            Error Loading Application
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <LoadingScreen message="Initializing..." />;
  }

  return <>{children(data)}</>;
};
