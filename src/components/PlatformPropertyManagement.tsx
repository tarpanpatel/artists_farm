import React, { useState, useEffect } from 'react';
import { Building2, LogOut, Plus, Loader, AlertCircle, BarChart3, ChevronDown, ChevronRight, Edit2, Zap, ZapOff } from 'lucide-react';

interface Tenant {
  id: number;
  name: string;
  slug: string;
  owner_name: string;
  owner_email?: string;
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
  const [expandedTenant, setExpandedTenant] = useState<number | null>(null);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [showEditTenantModal, setShowEditTenantModal] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [showPropertyModal, setShowPropertyModal] = useState<'add' | 'edit' | null>(null);
  const [showDeletePropertyModal, setShowDeletePropertyModal] = useState<number | null>(null);
  const [moduleToggleLoading, setModuleToggleLoading] = useState<string | null>(null);
  const [propertyModules, setPropertyModules] = useState<Record<number, { kitchen: boolean }>>({});
  const [selectedTenantForProperty, setSelectedTenantForProperty] = useState<number | null>(null);
  const [operationLoading, setOperationLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

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

        // Load module status for each property
        for (const prop of propsData.data || []) {
          try {
            const moduleRes = await fetch(
              `/php/api/router.php?action=get_property_modules&property_id=${prop.id}`,
              {
                credentials: 'include',
                headers: { 'X-API-Key': 'artists-farm-secure-key-2026' },
              }
            );
            const moduleData = await moduleRes.json();
            if (moduleData.success) {
              setPropertyModules((prev) => ({
                ...prev,
                [prop.id]: { kitchen: moduleData.data?.kitchen_enabled || false },
              }));
            }
          } catch (err) {
            console.error(`Failed to load modules for property ${prop.id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load tenants and properties');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('artists_farm_user_session');
    onLogout();
  };

  const handleManageTenant = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setShowEditTenantModal(true);
  };

  const handleAddProperty = async () => {
    if (!editingProperty || !selectedTenantForProperty) return;

    setOperationLoading(true);
    try {
      const response = await fetch('/php/api/router.php?action=create_property', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'artists-farm-secure-key-2026',
        },
        body: JSON.stringify({
          tenant_id: selectedTenantForProperty,
          name: editingProperty.name,
          slug: editingProperty.slug,
          color_scheme: editingProperty.tailwind_color_scheme,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setProperties((prev) => [...prev, {
          ...editingProperty,
          id: data.property_id,
          tenant_id: selectedTenantForProperty,
          status: 'active',
        }]);
        setShowPropertyModal(null);
        setEditingProperty(null);
      } else {
        setError(data.message || 'Failed to create property');
      }
    } catch (err) {
      console.error('Failed to create property:', err);
      setError('Failed to create property');
    } finally {
      setOperationLoading(false);
    }
  };

  const handleEditProperty = async () => {
    if (!editingProperty) return;

    setOperationLoading(true);
    try {
      const response = await fetch('/php/api/router.php?action=edit_property', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'artists-farm-secure-key-2026',
        },
        body: JSON.stringify({
          property_id: editingProperty.id,
          name: editingProperty.name,
          slug: editingProperty.slug,
          color_scheme: editingProperty.tailwind_color_scheme,
          status: editingProperty.status,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setProperties((prev) =>
          prev.map((p) => (p.id === editingProperty.id ? editingProperty : p))
        );
        setShowPropertyModal(null);
        setEditingProperty(null);
      } else {
        setError(data.message || 'Failed to update property');
      }
    } catch (err) {
      console.error('Failed to update property:', err);
      setError('Failed to update property');
    } finally {
      setOperationLoading(false);
    }
  };

  const handleDeleteProperty = async (propertyId: number) => {
    setOperationLoading(true);
    try {
      const response = await fetch('/php/api/router.php?action=delete_property', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'artists-farm-secure-key-2026',
        },
        body: JSON.stringify({ property_id: propertyId }),
      });

      const data = await response.json();
      if (data.success) {
        setProperties((prev) => prev.filter((p) => p.id !== propertyId));
        setShowDeletePropertyModal(null);
      } else {
        setError(data.message || 'Failed to delete property');
      }
    } catch (err) {
      console.error('Failed to delete property:', err);
      setError('Failed to delete property');
    } finally {
      setOperationLoading(false);
    }
  };

  const handleSaveTenant = async () => {
    if (!editingTenant) return;

    try {
      const response = await fetch('/php/api/router.php?action=update_tenant', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'artists-farm-secure-key-2026',
        },
        body: JSON.stringify({
          id: editingTenant.id,
          name: editingTenant.name,
          owner_name: editingTenant.owner_name,
          owner_email: editingTenant.owner_email,
          subscription_status: editingTenant.subscription_status,
          is_active: editingTenant.is_active,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setTenants((prev) =>
          prev.map((t) => (t.id === editingTenant.id ? editingTenant : t))
        );
        setShowEditTenantModal(false);
        setEditingTenant(null);
      } else {
        setError(data.message || 'Failed to update tenant');
      }
    } catch (err) {
      console.error('Failed to save tenant:', err);
      setError('Failed to save tenant');
    }
  };

  const toggleKitchenModule = async (propertyId: number, currentStatus: boolean) => {
    try {
      setModuleToggleLoading(`kitchen-${propertyId}`);
      const response = await fetch('/php/api/router.php?action=toggle_property_module', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'artists-farm-secure-key-2026',
        },
        body: JSON.stringify({
          property_id: propertyId,
          module_name: 'kitchen',
          enabled: !currentStatus,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setPropertyModules((prev) => ({
          ...prev,
          [propertyId]: { ...prev[propertyId], kitchen: !currentStatus },
        }));
      } else {
        setError(data.message || 'Failed to toggle module');
      }
    } catch (err) {
      console.error('Failed to toggle module:', err);
      setError('Failed to toggle module');
    } finally {
      setModuleToggleLoading(null);
    }
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

        {/* Tenants with Collapsible Properties */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Tenants & Properties</h2>
            <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
              <Plus className="w-4 h-4" />
              Add Tenant
            </button>
          </div>

          <div className="space-y-4">
            {tenants.map((tenant) => {
              const tenantProperties = properties.filter((p) => p.tenant_id === tenant.id);
              const isExpanded = expandedTenant === tenant.id;

              return (
                <div
                  key={tenant.id}
                  className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-lg transition-shadow"
                >
                  {/* Tenant Header - Clickable */}
                  <div
                    onClick={() =>
                      setExpandedTenant(isExpanded ? null : tenant.id)
                    }
                    className="p-6 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div>
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-1">
                            {tenant.name}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Owner: {tenant.owner_name} • Properties: {tenantProperties.length}/{tenant.max_properties}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-3 py-1 text-xs font-bold rounded-full ${
                            tenant.is_active
                              ? 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300'
                          }`}
                        >
                          {tenant.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleManageTenant(tenant);
                          }}
                          className="p-2 hover:bg-blue-100 dark:hover:bg-blue-950/30 rounded-lg text-blue-600 dark:text-blue-400 transition-colors"
                          title="Edit Tenant"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Tenant Details - Expandable */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 dark:border-slate-700 p-6 bg-slate-50 dark:bg-slate-700/30">
                      <div className="mb-6">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">
                          Subscription Details
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-gray-600 dark:text-gray-400">Plan</p>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {tenant.subscription_status}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600 dark:text-gray-400">Email</p>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {tenant.owner_email || '-'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600 dark:text-gray-400">Max Properties</p>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {tenant.max_properties}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Properties List */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                            Properties ({tenantProperties.length})
                          </h4>
                          <button
                            onClick={() => {
                              setSelectedTenantForProperty(tenant.id);
                              setEditingProperty({ id: 0, name: '', slug: '', tenant_id: tenant.id, status: 'active', tailwind_color_scheme: 'blue' });
                              setShowPropertyModal('add');
                            }}
                            className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            Add
                          </button>
                        </div>
                        {tenantProperties.length === 0 ? (
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            No properties yet
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {tenantProperties.map((prop) => {
                              const kitchenEnabled = propertyModules[prop.id]?.kitchen || false;
                              const isTogglingModule = moduleToggleLoading === `kitchen-${prop.id}`;

                              return (
                                <div
                                  key={prop.id}
                                  className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600"
                                >
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                      {prop.name}
                                    </p>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                      Slug: {prop.slug}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => toggleKitchenModule(prop.id, kitchenEnabled)}
                                      disabled={isTogglingModule}
                                      className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                                        kitchenEnabled
                                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50'
                                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800/50'
                                      } ${isTogglingModule ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      title={kitchenEnabled ? 'Disable Kitchen Module' : 'Enable Kitchen Module'}
                                    >
                                      {isTogglingModule ? (
                                        <Loader className="w-3 h-3 animate-spin" />
                                      ) : kitchenEnabled ? (
                                        <Zap className="w-3 h-3" />
                                      ) : (
                                        <ZapOff className="w-3 h-3" />
                                      )}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingProperty(prop);
                                        setShowPropertyModal('edit');
                                      }}
                                      className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-950/30 rounded text-blue-600 dark:text-blue-400 transition-colors text-xs"
                                      title="Edit Property"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => setShowDeletePropertyModal(prop.id)}
                                      className="p-1.5 hover:bg-red-100 dark:hover:bg-red-950/30 rounded text-red-600 dark:text-red-400 transition-colors text-xs"
                                      title="Delete Property"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Edit Tenant Modal */}
      {showEditTenantModal && editingTenant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Edit Tenant
            </h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tenant Name
                </label>
                <input
                  type="text"
                  value={editingTenant.name}
                  onChange={(e) =>
                    setEditingTenant({ ...editingTenant, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Owner Name
                </label>
                <input
                  type="text"
                  value={editingTenant.owner_name}
                  onChange={(e) =>
                    setEditingTenant({ ...editingTenant, owner_name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Owner Email
                </label>
                <input
                  type="email"
                  value={editingTenant.owner_email || ''}
                  onChange={(e) =>
                    setEditingTenant({ ...editingTenant, owner_email: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subscription Status
                </label>
                <select
                  value={editingTenant.subscription_status}
                  onChange={(e) =>
                    setEditingTenant({
                      ...editingTenant,
                      subscription_status: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                >
                  <option value="trial">Trial</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!editingTenant.is_active}
                    onChange={(e) =>
                      setEditingTenant({
                        ...editingTenant,
                        is_active: e.target.checked ? 1 : 0,
                      })
                    }
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Active
                  </span>
                </label>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowEditTenantModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTenant}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Property Add/Edit Modal */}
      {showPropertyModal && editingProperty && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {showPropertyModal === 'add' ? 'Add Property' : 'Edit Property'}
            </h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Property Name
                </label>
                <input
                  type="text"
                  value={editingProperty.name}
                  onChange={(e) =>
                    setEditingProperty({ ...editingProperty, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Slug
                </label>
                <input
                  type="text"
                  value={editingProperty.slug}
                  onChange={(e) =>
                    setEditingProperty({ ...editingProperty, slug: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Color Scheme
                </label>
                <select
                  value={editingProperty.tailwind_color_scheme}
                  onChange={(e) =>
                    setEditingProperty({ ...editingProperty, tailwind_color_scheme: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                >
                  <option value="blue">Blue</option>
                  <option value="green">Green</option>
                  <option value="red">Red</option>
                  <option value="purple">Purple</option>
                  <option value="amber">Amber</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowPropertyModal(null);
                  setEditingProperty(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={showPropertyModal === 'add' ? handleAddProperty : handleEditProperty}
                disabled={operationLoading}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {operationLoading ? (
                  <>
                    <Loader className="w-3 h-3 animate-spin" />
                    Saving...
                  </>
                ) : (
                  showPropertyModal === 'add' ? 'Add' : 'Update'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Property Confirmation */}
      {showDeletePropertyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Delete Property?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              This action cannot be undone. All property data will be permanently deleted.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeletePropertyModal(null)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteProperty(showDeletePropertyModal)}
                disabled={operationLoading}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {operationLoading ? (
                  <>
                    <Loader className="w-3 h-3 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
