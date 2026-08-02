import React, { useEffect, useState } from 'react';
import { LoadingScreen } from './LoadingScreen';
import { InvalidPropertyPage } from './InvalidPropertyPage';
import {
  fetchCurrentProperty,
  fetchPropertyModulesFromDB,
  fetchNavMenuFromDB,
  fetchTelegramConfigDB,
  getPropertySlug,
  getPropertyAndRoomSlugs,
  getRoomSlugFromHash,
} from '../services/api';

export interface PreloadedData {
  currentProperty: any;
  modules: Array<{ slug: string; is_enabled: boolean }>;
  navItems: any[];
  telegramConfig: any;
  isMultiKeyProperty?: boolean;
  currentRoomSlug?: string | null;
  parentPropertyId?: number;
}

interface DataLoaderProps {
  children: (data: PreloadedData) => React.ReactNode;
}

export const DataLoader: React.FC<DataLoaderProps> = ({ children }) => {
  const [data, setData] = useState<PreloadedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentRoomSlug, setCurrentRoomSlug] = useState<string | null>(null);

  const [invalidProperty, setInvalidProperty] = useState<string | null>(null);

  useEffect(() => {
    const loadAllData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Check if property slug is present in URL
        const propertySlug = getPropertySlug();
        const { propertySlug: slugFromPath, roomSlug } = getPropertyAndRoomSlugs();

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
            const response = await fetch(`/php/api/router.php?action=get_multikey_property&property_id=${property.id}`, {
              credentials: 'include',
            });
            const data = await response.json();
            if (data.success) {
              property = data.data;
            }
          } catch (err) {
            console.error('Failed to fetch MultiKey property details:', err);
          }
        }

        // Fetch all other data in parallel with timeout fallback
        const results = await Promise.race([
          Promise.all([
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
          timeoutPromise.then(() => [[], [], null]), // Default values on timeout
        ]);

        const [modules, navItems, telegramConfig] = results as any[];

        // If property doesn't exist (was deleted), show invalid property page
        // Check if property is null, undefined, or empty object/array
        if (!property || (typeof property === 'object' && Object.keys(property).length === 0)) {
          setInvalidProperty(propertySlug);
          setIsLoading(false);
          return;
        }

        // Detect if this is a MultiKey property
        const isMultiKeyProperty = property.property_type === 'MULTI_KEY';

        // For MultiKey properties, use hash-based room selection (#room-101)
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

  // Don't listen for hash changes - they interfere with menu navigation
  // Room navigation uses state (selectedRoomSlugOverride) instead of hash

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
