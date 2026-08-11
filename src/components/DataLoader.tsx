import React, { useEffect, useState } from 'react';
import { LoadingScreen } from './LoadingScreen';
import { InvalidPropertyPage } from './InvalidPropertyPage';
import {
  fetchCurrentProperty,
  apiFetch,
  fetchPropertyModulesFromDB,
  fetchNavMenuFromDB,
  fetchTelegramConfigDB,
  fetchGuestsFromDB,
  fetchReceiptsFromDB,
  fetchMenuFromDB,
  getPropertySlug,
  getRoomSlugFromHash,
} from '../services/api';
import { t } from '../i18n/en';

export interface PreloadedData {
  currentProperty: any;
  modules: Array<{ slug: string; is_enabled: boolean }>;
  navItems: any[];
  telegramConfig: any;
  isMultiKeyProperty?: boolean;
  currentRoomSlug?: string | null;
  parentPropertyId?: number;
  initialGuests?: any[];
  initialReceipts?: any[];
  initialMenu?: any[];
}

interface DataLoaderProps {
  children: (data: PreloadedData) => React.ReactNode;
}

export const DataLoader: React.FC<DataLoaderProps> = ({ children }) => {
  const [data, setData] = useState<PreloadedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setCurrentRoomSlug] = useState<string | null>(null);

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

        // First, fetch the basic property data
        let property = await fetchCurrentProperty().catch(err => {
          console.error('Failed to fetch current property:', err);
          return null;
        });

        // If it's a MultiKey property, fetch full data with rooms
        if (property && property.property_type === 'MULTI_KEY') {
          try {
            const response = await apiFetch(`/php/api/router.php?action=get_multikey_property&property_id=${property.id}`);
            const data = await response.json();
            if (data.success) {
              property = data.data;
            }
          } catch (err) {
            console.error('Failed to fetch MultiKey property details:', err);
          }
        }

        // Fetch property modules first to check feature toggles (kitchen, etc.)
        const modules = await fetchPropertyModulesFromDB().catch(err => {
          console.error('Failed to fetch modules:', err);
          return [];
        });

        const isKitchenEnabled = modules.length === 0 || modules.some((m: any) =>
          (m.module_slug === 'kitchen' || m.slug === 'kitchen') &&
          (m.is_enabled === 1 || m.is_enabled === true || m.is_enabled === '1')
        );

        // Fetch all other data in parallel with timeout fallback
        const results = await Promise.race([
          Promise.all([
            fetchNavMenuFromDB().catch(err => {
              console.error('Failed to fetch nav items:', err);
              return [];
            }),
            fetchTelegramConfigDB().catch(err => {
              console.error('Failed to fetch telegram config:', err);
              return null;
            }),
            fetchGuestsFromDB().catch(err => {
              console.error('Failed to fetch preloaded guests:', err);
              return [];
            }),
            fetchReceiptsFromDB().catch(err => {
              console.error('Failed to fetch preloaded receipts:', err);
              return [];
            }),
            isKitchenEnabled
              ? fetchMenuFromDB().catch(err => {
                  console.error('Failed to fetch preloaded menu:', err);
                  return [];
                })
              : Promise.resolve([]),
          ]),
          timeoutPromise.then(() => [[], null, [], [], []]), // Default values on timeout
        ]);

        const [navItems, telegramConfig, initialGuests, initialReceipts, initialMenu] = results as any[];

        if (!property || (typeof property === 'object' && Object.keys(property).length === 0)) {
          setInvalidProperty(propertySlug);
          setIsLoading(false);
          return;
        }

        const isMultiKeyProperty = property.property_type === 'MULTI_KEY';
        const validRoomSlugs = isMultiKeyProperty ? (property.rooms || []).map((r: any) => r.slug) : [];
        const selectedRoomSlug = isMultiKeyProperty ? getRoomSlugFromHash(validRoomSlugs) : null;

        setCurrentRoomSlug(selectedRoomSlug);

        setData({
          currentProperty: property,
          modules: Array.isArray(modules) ? modules : [],
          navItems: Array.isArray(navItems) ? navItems : [],
          telegramConfig: telegramConfig,
          isMultiKeyProperty,
          currentRoomSlug: selectedRoomSlug,
          parentPropertyId: undefined,
          initialGuests: Array.isArray(initialGuests) ? initialGuests : [],
          initialReceipts: Array.isArray(initialReceipts) ? initialReceipts : [],
          initialMenu: Array.isArray(initialMenu) ? initialMenu : [],
        });
      } catch (err) {
        console.error('Critical error loading app data:', err);
        setData({
          currentProperty: null,
          modules: [],
          navItems: [],
          telegramConfig: null,
          initialGuests: [],
          initialReceipts: [],
          initialMenu: [],
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
    return <LoadingScreen message={t('loading_screen_default_message')} />;
  }

  if (error && !data) {
    return (
      <div className="fixed inset-0 bg-red-50 dark:bg-red-950 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 max-w-md shadow-lg border border-red-200 dark:border-red-800">
          <h2 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">
            {t('error_loading_application_heading')}
          </h2>
          <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            {t('refresh_page_button')}
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <LoadingScreen message={t('initializing_message')} />;
  }

  return <>{children(data)}</>;
};
