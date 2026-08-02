import React, { useState, useEffect } from 'react';
import { Building2, LogOut, BarChart3, Users, AlertCircle, Loader } from 'lucide-react';

interface Property {
  id: number;
  name: string;
  slug: string;
  status: string;
  tailwind_color_scheme: string;
  property_type?: string;
  parent_property_id?: number;
}

interface TenantDashboardProps {
  username: string;
  tenantId: number;
  onLogout: () => void;
}

export const TenantDashboard: React.FC<TenantDashboardProps> = ({
  username,
  tenantId,
  onLogout,
}) => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProperties = async () => {
      try {
        setLoading(true);

        // Fetch with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(
          `/php/api/router.php?action=get_tenant_properties&tenant_id=${tenantId}`,
          {
            credentials: 'include',
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);

        const data = await response.json();

        if (data.success) {
          setProperties(data.data || []);
        } else {
          setError('Failed to load properties: ' + (data.message || 'Unknown error'));
        }
      } catch (err) {
        console.error('[TenantDashboard] Failed to load properties:', err);
        setError('Unable to load properties. ' + (err?.message || 'Please contact support.'));
      } finally {
        setLoading(false);
      }
    };

    loadProperties();
  }, [tenantId]);

  const handleLogout = () => {
    localStorage.removeItem('artists_farm_user_session');
    onLogout();
    window.location.href = '/artists_farm/login/';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading tenant dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                Tenant Dashboard
              </h1>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Manage your properties
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{username}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">Tenant Manager</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg text-red-600 dark:text-red-400 transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 flex gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Properties</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {properties.length}
                </p>
              </div>
              <Building2 className="w-8 h-8 text-blue-600 dark:text-blue-400 opacity-20" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Active Properties</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {properties.filter((p) => p.status === 'active' && p.property_type !== 'MULTI_KEY_ROOM').length}
                </p>
              </div>
              <Users className="w-8 h-8 text-green-600 dark:text-green-400 opacity-20" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Combined Analytics</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">Coming Soon</p>
              </div>
              <BarChart3 className="w-8 h-8 text-purple-600 dark:text-purple-400 opacity-20" />
            </div>
          </div>
        </div>

        {/* Properties Section */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Your Properties</h2>

          {properties.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
              <p className="text-gray-600 dark:text-gray-400">No properties available yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {properties.filter((p) => p.property_type !== 'MULTI_KEY_ROOM').map((property) => (
                <a
                  key={property.id}
                  href={`/artists_farm/vrikshawan/${property.slug}/`}
                  className="group bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`inline-flex items-center justify-center w-12 h-12 bg-${property.tailwind_color_scheme}-100 dark:bg-${property.tailwind_color_scheme}-950/50 rounded-xl`}>
                      <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <span
                      className={`px-3 py-1 text-xs font-bold rounded-full ${
                        property.status === 'active'
                          ? 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300'
                      }`}
                    >
                      {property.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <h3 className="font-bold text-gray-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {property.name}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Slug: <span className="font-mono">{property.slug}</span>
                  </p>

                  <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Click to manage
                    </span>
                    <svg
                      className="w-5 h-5 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
