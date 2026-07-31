import React, { useState, useEffect } from 'react';
import { Building2, MapPin, Loader } from 'lucide-react';
import { RootLogin } from './RootLogin';

interface Property {
  id: number;
  slug: string;
  name: string;
  tenant_slug?: string;
  is_active: number;
}

export const PropertySelector: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if user is authenticated at root level
  useEffect(() => {
    const isAuth = localStorage.getItem('artists_farm_root_authenticated') === 'true';
    setIsAuthenticated(isAuth);
    if (!isAuth) {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchProperties = async () => {
      try {
        setLoading(true);
        // Fetch available properties from API
        const response = await fetch('/php/api/router.php?action=get_available_properties', {
          credentials: 'include',
          headers: {
            'X-API-Key': 'artists-farm-secure-key-2026',
          },
        });
        const data = await response.json();
        if (data.status === 'success' && Array.isArray(data.data)) {
          setProperties(data.data);
        }
      } catch (err) {
        console.error('Failed to fetch properties:', err);
        setError('Unable to load properties. Please contact your administrator.');
      } finally {
        setLoading(false);
      }
    };

    fetchProperties();
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <RootLogin onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-950/50 mb-4 animate-spin">
            <Loader className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-gray-600 dark:text-gray-400">Loading properties...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Artists Farm
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Select a property to access
          </p>
        </div>

        {error ? (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl p-8 text-center">
            <p className="text-red-800 dark:text-red-300 font-medium mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        ) : properties.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
            <p className="text-gray-600 dark:text-gray-400">No properties available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {properties.map((property) => (
              <a
                key={property.id}
                href={`/artists_farm/artists-farm-platform/${property.slug}/`}
                className="group bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-950/50 rounded-xl group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition-colors">
                    <MapPin className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="px-3 py-1 bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300 text-xs font-bold rounded-full">
                    Active
                  </div>
                </div>

                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {property.name}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Property ID: <span className="font-mono">{property.slug}</span>
                </p>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Click to access
                  </span>
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </a>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>© 2026 Artists Farm Resort & Kitchen Management System</p>
        </div>
      </div>
    </div>
  );
};
