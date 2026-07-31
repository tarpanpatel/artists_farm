import React, { useState, useEffect } from 'react';
import { Building2, LogOut, Plus, Loader, AlertCircle, BarChart3 } from 'lucide-react';

interface Tenant {
  id: number;
  name: string;
  slug: string;
  owner_name: string;
  subscription_status: string;
  max_properties: number;
  is_active: number;
}

interface Property {
  id: number;
  name: string;
  slug: string;
  tenant_id: number;
  status: string;
  tailwind_color_scheme: string;
}

interface PlatformPropertyManagementProps {
  username: string;
  onLogout: () => void;
}

export const PlatformPropertyManagement: React.FC<PlatformPropertyManagementProps> = ({
  username,
  onLogout,
}) => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        // Fetch tenants
        const tenantsRes = await fetch('/php/api/router.php?action=get_all_tenants', {
          credentials: 'include',
          headers: { 'X-API-Key': 'artists-farm-secure-key-2026' },
        });
        const tenantsData = await tenantsRes.json();
        if (tenantsData.success) {
          setTenants(tenantsData.data || []);
        }

        // Fetch all properties
        const propsRes = await fetch('/php/api/router.php?action=get_all_properties', {
          credentials: 'include',
          headers: { 'X-API-Key': 'artists-farm-secure-key-2026' },
        });
        const propsData = await propsRes.json();
        if (propsData.success) {
          setProperties(propsData.data || []);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
        setError('Failed to load tenants and properties');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('artists_farm_user_session');
    onLogout();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading platform...</p>
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
                Artists Farm Platform
              </h1>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Administration Dashboard
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{username}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">Platform Admin</p>
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
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Tenants</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {tenants.length}
                </p>
              </div>
              <Building2 className="w-8 h-8 text-blue-600 dark:text-blue-400 opacity-20" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Properties</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {properties.length}
                </p>
              </div>
              <BarChart3 className="w-8 h-8 text-green-600 dark:text-green-400 opacity-20" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Active Tenants</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {tenants.filter((t) => t.is_active).length}
                </p>
              </div>
              <Building2 className="w-8 h-8 text-purple-600 dark:text-purple-400 opacity-20" />
            </div>
          </div>
        </div>

        {/* Tenants Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Tenants</h2>
            <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
              <Plus className="w-4 h-4" />
              Add Tenant
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tenants.map((tenant) => (
              <div
                key={tenant.id}
                className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 dark:text-white mb-1">
                      {tenant.name}
                    </h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {tenant.owner_name}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-bold rounded ${
                      tenant.is_active
                        ? 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300'
                    }`}
                  >
                    {tenant.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="space-y-2 text-sm mb-4">
                  <p className="text-gray-700 dark:text-gray-300">
                    Plan: <span className="font-medium">{tenant.subscription_status}</span>
                  </p>
                  <p className="text-gray-700 dark:text-gray-300">
                    Properties:{' '}
                    <span className="font-medium">
                      {properties.filter((p) => p.tenant_id === tenant.id).length} /{' '}
                      {tenant.max_properties}
                    </span>
                  </p>
                </div>

                <button className="w-full text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 py-2">
                  Manage Tenant
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Properties Section */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Properties</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {properties.map((property) => {
              const tenant = tenants.find((t) => t.id === property.tenant_id);
              return (
                <div
                  key={property.id}
                  className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900 dark:text-white mb-1">
                        {property.name}
                      </h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {tenant?.name || 'Unknown Tenant'}
                      </p>
                    </div>
                    <span
                      className={`w-3 h-3 rounded-full ${
                        property.status === 'active' ? 'bg-green-500' : 'bg-gray-500'
                      }`}
                    />
                  </div>

                  <div className="space-y-2 text-sm mb-4">
                    <p className="text-gray-700 dark:text-gray-300">
                      Slug: <span className="font-mono text-xs">{property.slug}</span>
                    </p>
                    <p className="text-gray-700 dark:text-gray-300">
                      Status: <span className="font-medium capitalize">{property.status}</span>
                    </p>
                  </div>

                  <button className="w-full text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 py-2">
                    Access Property
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
};
