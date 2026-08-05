import React, { useState, useEffect } from 'react';
import { Building2, LogOut, Plus, Loader, AlertCircle, BarChart3, ChevronDown, ChevronRight, Edit2, Eye, CheckCircle2, Share2, Copy, XCircle } from 'lucide-react';
import { ToggleSwitch } from './ToggleSwitch';
import { StyledSelect } from './StyledSelect';

interface Tenant {
  id: number;
  name: string;
  slug: string;
  subscription_status: string;
  max_properties: number;
  slots_used?: number;
  email?: string;
  phone?: string;
  is_active: number;
}

interface Property {
  id: number;
  name: string;
  slug: string;
  tenant_id: number;
  status: string;
  tailwind_color_scheme: string;
  include_kitchen?: boolean;
  property_type?: 'SINGLE' | 'MULTI_KEY' | 'MULTI_KEY_ROOM' | 'vacation_home';
  address?: string;
  currency?: string;
  timezone?: string;
  parent_property_id?: number;
  telegram_template_customization_enabled?: number;
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
  const [propertyToggleLoading, setPropertyToggleLoading] = useState<number | null>(null);
  const [selectedTenantForProperty, setSelectedTenantForProperty] = useState<number | null>(null);
  const [operationLoading, setOperationLoading] = useState(false);
  const [showAddTenantModal, setShowAddTenantModal] = useState(false);
  const [newTenant, setNewTenant] = useState<{ name: string; slug: string; email: string; phone: string }>({
    name: '',
    slug: '',
    email: '',
    phone: '',
  });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  // Populated after a successful "Add Tenant" - keeps the modal open to show
  // the generated login credentials + a "Share via WhatsApp" button, instead
  // of just closing and leaving the admin to dig the credentials up later.
  const [newTenantCredentials, setNewTenantCredentials] = useState<{
    username: string;
    tempPasscode: string;
    loginUrl: string;
    renderedMessage: string;
    whatsappPhone: string;
    emailSent: boolean;
    emailError: string | null;
    loginNote: string | null;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch tenants
      const tenantsRes = await fetch('/php/api/router.php?action=get_all_tenants', {
        credentials: 'include',
      });
      const tenantsData = await tenantsRes.json();
      if (tenantsData.success) {
        setTenants(tenantsData.data || []);
      }

      // Fetch all properties
      const propsRes = await fetch('/php/api/router.php?action=get_all_properties', {
        credentials: 'include',
      });
      const propsData = await propsRes.json();
      if (propsData.success) {
        setProperties(propsData.data || []);

        // Fetch ALL property modules in ONE batch call (much faster than individual calls)
        try {
          const modulesRes = await fetch('/php/api/router.php?action=get_all_property_modules', {
            credentials: 'include',
          });
          const modulesData = await modulesRes.json();
          if (modulesData.success && modulesData.data) {
            // Transform data: { propId: [{ module_slug, is_enabled }] } => { propId: { kitchen: bool } }
            const modulesMap = Object.entries(modulesData.data).reduce((acc, [propId, modules]: any) => {
              const kitchenModule = modules.find((m: any) => m.module_slug === 'kitchen');
              acc[propId] = { kitchen: kitchenModule ? Boolean(kitchenModule.is_enabled) : false };
              return acc;
            }, {} as Record<number, { kitchen: boolean }>);
            setPropertyModules(modulesMap);
          }
        } catch (err) {
          console.error('Failed to load property modules:', err);
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

    // Get tenant username (slug)
    const tenant = tenants.find(t => t.id === selectedTenantForProperty);
    if (!tenant) {
      setError('Tenant not found');
      return;
    }

    setOperationLoading(true);
    try {
      const isMultiKey = editingProperty.property_type === 'MULTI_KEY';
      const action = isMultiKey ? 'create_multikey_property' : 'create_property';

      const requestBody = isMultiKey ? {
        tenant_id: selectedTenantForProperty,
        name: editingProperty.name,
        slug: editingProperty.slug,
        address: editingProperty.address || '',
        currency: editingProperty.currency || 'INR',
        timezone: editingProperty.timezone || 'Asia/Kolkata',
      } : {
        tenant_id: selectedTenantForProperty,
        name: editingProperty.name,
        slug: editingProperty.slug,
        color_scheme: editingProperty.tailwind_color_scheme,
        tenant_username: tenant.slug,
        include_kitchen: editingProperty.include_kitchen ?? true,
      };

      const response = await fetch(`/php/api/router.php?action=${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      if (data.success) {
        setProperties((prev) => [...prev, {
          ...editingProperty,
          id: data.property_id,
          tenant_id: selectedTenantForProperty,
          status: 'active',
          property_type: editingProperty.property_type || 'SINGLE',
        }]);
        setShowPropertyModal(null);
        setEditingProperty(null);
        // Show success toast
        const typeLabel = isMultiKey ? 'Multi Key' : 'Single';
        setSuccessMessage(`${typeLabel} Property "${editingProperty.name}" created successfully!`);
        setTimeout(() => setSuccessMessage(null), 3000);
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
        },
        body: JSON.stringify({
          property_id: editingProperty.id,
          name: editingProperty.name,
          slug: editingProperty.slug,
          color_scheme: editingProperty.tailwind_color_scheme,
          status: editingProperty.status,
          telegram_template_customization_enabled: !!editingProperty.telegram_template_customization_enabled,
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
        },
        body: JSON.stringify({
          id: editingTenant.id,
          name: editingTenant.name,
          email: editingTenant.email,
          phone: editingTenant.phone,
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
      const newStatus = !currentStatus;

      const response = await fetch('/php/api/router.php?action=toggle_property_module', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          property_id: propertyId,
          module_name: 'kitchen',
          enabled: newStatus,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setPropertyModules((prev) => {
          const next = {
            ...prev,
            [propertyId]: { ...prev[propertyId], kitchen: newStatus },
          };
          properties
            .filter((p) => (p as any).parent_property_id === propertyId)
            .forEach((child) => {
              next[child.id] = { ...(next[child.id] || {}), kitchen: newStatus };
            });
          return next;
        });
      } else {
        setError(data.message || 'Failed to toggle module');
      }
    } catch (err) {
      setError('Failed to toggle module');
    } finally {
      setModuleToggleLoading(null);
    }
  };

  const openPropertyWithAutoLogin = (property: Property, tenantSlug: string) => {
    try {
      // Root admin can access any property - open in new tab with property slug
      const propertyUrl = `/artists_farm/${tenantSlug}/${property.slug}/`;
      window.open(propertyUrl, '_blank');
    } catch (err) {
      setError('Failed to open property');
    }
  };

  const togglePropertyStatus = async (propertyId: number, currentStatus: string) => {
    try {
      setPropertyToggleLoading(propertyId);
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';

      const response = await fetch('/php/api/router.php?action=update_property', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          property_id: propertyId,
          status: newStatus,
        }),
      });

      const data = await response.json();

      if (data.success || data.status === 'success') {
        setProperties((prev) =>
          prev.map((prop) =>
            prop.id === propertyId ? { ...prop, status: newStatus } : prop
          )
        );
      } else {
        setError(data.message || 'Failed to toggle property status');
      }
    } catch (err) {
      setError('Failed to toggle property status');
    } finally {
      setPropertyToggleLoading(null);
    }
  };

  const handleAddTenant = async () => {
    if (!newTenant.name || !newTenant.slug) {
      setError('Name and slug are required');
      return;
    }

    setOperationLoading(true);
    try {
      const response = await fetch('/php/api/router.php?action=create_tenant', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...newTenant, login_url: window.location.origin + '/artists_farm/' }),
      });

      const data = await response.json();
      if (data.success) {
        setTenants((prev) => [...prev, {
          id: data.tenant_id,
          ...newTenant,
          subscription_status: 'trial',
          max_properties: 1,
          is_active: 1,
        }]);
        setNewTenant({ name: '', slug: '', email: '', phone: '' });

        if (data.login_credentials) {
          // Keep the modal open on a "credentials" view instead of closing -
          // this is the only moment the temporary passcode is ever shown.
          setNewTenantCredentials({
            username: data.login_credentials.username,
            tempPasscode: data.login_credentials.temp_passcode,
            loginUrl: data.login_credentials.login_url,
            renderedMessage: data.rendered_message || '',
            whatsappPhone: data.whatsapp_phone || data.login_credentials.username,
            emailSent: !!data.email_sent,
            emailError: data.email_error || null,
            loginNote: data.login_note || null,
          });
        } else {
          setShowAddTenantModal(false);
          setSuccessMessage(`Tenant "${newTenant.name}" created successfully!${data.login_note ? ' ' + data.login_note : ''}`);
          setTimeout(() => setSuccessMessage(null), 4000);
        }
      } else {
        setError(data.message || 'Failed to create tenant');
      }
    } catch (err) {
      console.error('Failed to create tenant:', err);
      setError('Failed to create tenant');
    } finally {
      setOperationLoading(false);
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
      {/* Success Toast */}
      {successMessage && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-pulse">
          ✓ {successMessage}
        </div>
      )}

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
            <button
              onClick={() => setShowAddTenantModal(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Tenant
            </button>
          </div>

          <div className="space-y-4">
            {tenants.map((tenant) => {
              const tenantProperties = properties.filter((p) => {
                if (p.tenant_id !== tenant.id) return false;
                const type = (p as any).property_type;
                return type !== 'MULTI_KEY_ROOM';
              });
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
                            Slots Used: {tenant.slots_used ?? tenantProperties.length}/{tenant.max_properties}
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
                              {tenant.email || '-'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600 dark:text-gray-400">Phone</p>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {tenant.phone || '-'}
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
                              setEditingProperty({ id: 0, name: '', slug: '', tenant_id: tenant.id, status: 'active', tailwind_color_scheme: 'blue', include_kitchen: true, property_type: 'SINGLE', currency: 'INR', timezone: 'Asia/Kolkata' });
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
                              const isRoom = (prop as any).property_type === 'MULTI_KEY_ROOM';
                              const isMultiKey = (prop as any).property_type === 'MULTI_KEY';
                              const parentPropertyId = (prop as any).parent_property_id;

                              // Get children rooms if this is a MultiKey property
                              const childRooms = isMultiKey
                                ? tenantProperties.filter(p => (p as any).parent_property_id === prop.id)
                                : [];

                              // Skip rendering rooms here - they'll be nested under parent
                              if (isRoom) return null;

                              return (
                                <div key={prop.id} className="space-y-1">
                                  {/* Parent Property or Single Property */}
                                  <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 transition-colors">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                                          {prop.name}
                                        </p>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                                          isMultiKey
                                            ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                                            : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                                        }`}>
                                          {isMultiKey ? 'Multi-Key' : 'Single'}
                                        </span>
                                      </div>
                                      <p className="text-xs text-gray-600 dark:text-gray-400">
                                        Slug: {prop.slug}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-gray-600 dark:text-gray-400">Active:</span>
                                          <ToggleSwitch
                                            enabled={prop.status === 'active'}
                                            onChange={() => togglePropertyStatus(prop.id, prop.status)}
                                            disabled={propertyToggleLoading === prop.id}
                                          />
                                        </div>
                                        {!isRoom && (
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-600 dark:text-gray-400">Kitchen:</span>
                                            <ToggleSwitch
                                              enabled={kitchenEnabled}
                                              onChange={() => toggleKitchenModule(prop.id, kitchenEnabled)}
                                              disabled={isTogglingModule}
                                            />
                                          </div>
                                        )}
                                      </div>
                                      <button
                                        onClick={() => openPropertyWithAutoLogin(prop, tenant.slug)}
                                        className="p-1.5 hover:bg-green-100 dark:hover:bg-green-950/30 rounded text-green-600 dark:text-green-400 transition-colors text-xs"
                                        title="Open Property in New Tab"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          setEditingProperty(prop);
                                          setShowPropertyModal('edit');
                                        }}
                                        className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-950/30 rounded text-blue-600 dark:text-blue-400 transition-colors text-xs"
                                        title="Edit Property"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => setShowDeletePropertyModal(prop.id)}
                                        className="p-1.5 hover:bg-red-100 dark:hover:bg-red-950/30 rounded text-red-600 dark:text-red-400 transition-colors text-xs font-bold"
                                        title="Delete Property"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </div>

                                  {/* Nested Child Rooms (if MultiKey) */}
                                  {isMultiKey && childRooms.length > 0 && (
                                    <div className="ml-6 space-y-1 border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                                      {childRooms.map((room) => (
                                        <div
                                          key={room.id}
                                          className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                                        >
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                              <span className="text-xs font-bold text-slate-400">🚪</span>
                                              <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                                                {room.name}
                                              </p>
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-500">
                                              Slug: {room.slug}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-3 shrink-0">
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs text-gray-600 dark:text-gray-400">Active:</span>
                                              <ToggleSwitch
                                                enabled={room.status === 'active'}
                                                onChange={() => togglePropertyStatus(room.id, room.status)}
                                                disabled={propertyToggleLoading === room.id}
                                              />
                                            </div>
                                            <button
                                              onClick={() => openPropertyWithAutoLogin(room, tenant.slug)}
                                              className="p-1 hover:bg-green-100 dark:hover:bg-green-950/30 rounded text-green-600 dark:text-green-400 transition-colors text-xs"
                                              title="Open Room in New Tab"
                                            >
                                              <Eye className="w-3 h-3" />
                                            </button>
                                            <button
                                              onClick={() => {
                                                setEditingProperty(room);
                                                setShowPropertyModal('edit');
                                              }}
                                              className="p-1 hover:bg-blue-100 dark:hover:bg-blue-950/30 rounded text-blue-600 dark:text-blue-400 transition-colors text-xs"
                                              title="Edit Room"
                                            >
                                              <Edit2 className="w-3 h-3" />
                                            </button>
                                            <button
                                              onClick={() => setShowDeletePropertyModal(room.id)}
                                              className="p-1 hover:bg-red-100 dark:hover:bg-red-950/30 rounded text-red-600 dark:text-red-400 transition-colors text-xs font-bold"
                                              title="Delete Room"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
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
                  Email
                </label>
                <input
                  type="email"
                  value={editingTenant.email || ''}
                  onChange={(e) =>
                    setEditingTenant({ ...editingTenant, email: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone
                </label>
                <input
                  type="text"
                  value={editingTenant.phone || ''}
                  onChange={(e) =>
                    setEditingTenant({ ...editingTenant, phone: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                />
              </div>



              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subscription Status
                </label>
                <StyledSelect
                  value={editingTenant.subscription_status}
                  onChange={(val) =>
                    setEditingTenant({
                      ...editingTenant,
                      subscription_status: val,
                    })
                  }
                  options={[
                    { value: 'trial', label: 'Trial' },
                    { value: 'active', label: 'Active' },
                    { value: 'suspended', label: 'Suspended' },
                  ]}
                />
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
                  onChange={(e) => {
                    const name = e.target.value;
                    // Auto-populate slug when adding property
                    const slug = showPropertyModal === 'add'
                      ? name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
                      : editingProperty.slug;
                    setEditingProperty({ ...editingProperty, name, slug });
                  }}
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

              <div className="pt-2 border-t border-gray-300 dark:border-gray-600">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Allow Telegram Template Customization
                  </span>
                  <ToggleSwitch
                    enabled={!!editingProperty.telegram_template_customization_enabled}
                    onChange={(enabled) =>
                      setEditingProperty({ ...editingProperty, telegram_template_customization_enabled: enabled ? 1 : 0 })
                    }
                  />
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  All templates are designed here at the root admin level. When off, this property's Super Admin can view templates and the live preview but can't edit the wording.
                </p>
              </div>

              {showPropertyModal === 'add' && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Property Type
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-3 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-700/50">
                      <input
                        type="radio"
                        name="propertyType"
                        value="SINGLE"
                        checked={editingProperty.property_type === 'SINGLE'}
                        onChange={(e) =>
                          setEditingProperty({ ...editingProperty, property_type: 'SINGLE' })
                        }
                        className="w-4 h-4"
                      />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">Single Property</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">One group of guests at a time</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-700/50">
                      <input
                        type="radio"
                        name="propertyType"
                        value="MULTI_KEY"
                        checked={editingProperty.property_type === 'MULTI_KEY'}
                        onChange={(e) =>
                          setEditingProperty({ ...editingProperty, property_type: 'MULTI_KEY' })
                        }
                        className="w-4 h-4"
                      />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">Multi Key Property</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Multiple rooms/suites with shared staff & expenses</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {editingProperty.property_type === 'SINGLE' && showPropertyModal === 'add' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Color Scheme
                  </label>
                  <StyledSelect
                    value={editingProperty.tailwind_color_scheme}
                    onChange={(val) =>
                      setEditingProperty({ ...editingProperty, tailwind_color_scheme: val })
                    }
                    options={[
                      { value: 'blue', label: 'Blue' },
                      { value: 'green', label: 'Green' },
                      { value: 'red', label: 'Red' },
                      { value: 'purple', label: 'Purple' },
                      { value: 'amber', label: 'Amber' },
                    ]}
                  />
                </div>
              )}

              {editingProperty.property_type === 'MULTI_KEY' && showPropertyModal === 'add' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Currency
                      </label>
                      <input
                        type="text"
                        value={editingProperty.currency || 'INR'}
                        onChange={(e) =>
                          setEditingProperty({ ...editingProperty, currency: e.target.value })
                        }
                        placeholder="INR"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Timezone
                      </label>
                      <input
                        type="text"
                        value={editingProperty.timezone || 'Asia/Kolkata'}
                        onChange={(e) =>
                          setEditingProperty({ ...editingProperty, timezone: e.target.value })
                        }
                        placeholder="Asia/Kolkata"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                </>
              )}

              {showPropertyModal === 'add' && (
                <div className="pt-2 border-t border-gray-300 dark:border-gray-600">
                  <label className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Include Kitchen Module
                    </span>
                    <ToggleSwitch
                      enabled={editingProperty.include_kitchen ?? true}
                      onChange={(enabled) =>
                        setEditingProperty({ ...editingProperty, include_kitchen: enabled })
                      }
                    />
                  </label>
                </div>
              )}
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
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 font-bold text-red-600">
              ⚠️ Deletion Consequences for this Property:
            </p>
            <ul className="text-sm text-gray-600 dark:text-gray-400 mb-4 list-disc list-inside space-y-1">
              <li>All <strong>active and upcoming bookings</strong> will be permanently deleted.</li>
              <li>Past bookings and financial ledger records <strong>will remain intact</strong> for historical audits.</li>
              <li>Menus, inventory stock, staff assignments, and modules will be removed.</li>
            </ul>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              Type <span className="font-bold font-mono text-gray-900 dark:text-white">{properties.find(p => p.id === showDeletePropertyModal)?.name || ''}</span> to confirm:
            </p>
            <input
              type="text"
              autoFocus
              placeholder="Type here..."
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white mb-6 font-mono"
            />

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeletePropertyModal(null);
                  setDeleteConfirmText('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleDeleteProperty(showDeletePropertyModal);
                  setDeleteConfirmText('');
                }}
                disabled={operationLoading || deleteConfirmText !== (properties.find(p => p.id === showDeletePropertyModal)?.name || '')}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {operationLoading ? (
                  <>
                    <Loader className="w-3 h-3 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete Property'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Tenant Modal */}
      {showAddTenantModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            {newTenantCredentials ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    Tenant Created
                  </h3>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  This is the only time the temporary passcode is shown - share it now.
                </p>

                {newTenantCredentials.loginNote ? (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300 mb-4">
                    {newTenantCredentials.loginNote}
                  </div>
                ) : (
                  <>
                    <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-2 mb-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Username</span>
                        <span className="font-mono font-bold text-gray-900 dark:text-white">{newTenantCredentials.username}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Temporary Passcode</span>
                        <span className="font-mono font-bold text-gray-900 dark:text-white tracking-widest">{newTenantCredentials.tempPasscode}</span>
                      </div>
                    </div>

                    <div className={`flex items-center gap-2 text-xs font-semibold mb-4 ${newTenantCredentials.emailSent ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {newTenantCredentials.emailSent ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                      {newTenantCredentials.emailSent ? 'Welcome email sent' : `Email not sent${newTenantCredentials.emailError ? ` - ${newTenantCredentials.emailError}` : ''}`}
                    </div>

                    <div className="flex gap-2 mb-2">
                      <a
                        href={`https://api.whatsapp.com/send?phone=91${newTenantCredentials.whatsappPhone}&text=${encodeURIComponent(newTenantCredentials.renderedMessage)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <Share2 className="w-4 h-4" /> Share via WhatsApp
                      </a>
                      <button
                        onClick={() => navigator.clipboard?.writeText(newTenantCredentials.renderedMessage)}
                        title="Copy message"
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}

                <button
                  onClick={() => {
                    setShowAddTenantModal(false);
                    setNewTenantCredentials(null);
                  }}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors mt-2"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                  Add New Tenant
                </h3>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Tenant Name
                    </label>
                    <input
                      type="text"
                      value={newTenant.name}
                      onChange={(e) =>
                        setNewTenant({ ...newTenant, name: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                      placeholder="e.g., Vrikshawan"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Slug (Username)
                    </label>
                    <input
                      type="text"
                      value={newTenant.slug}
                      onChange={(e) =>
                        setNewTenant({ ...newTenant, slug: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                      placeholder="e.g., vrikshawan"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={newTenant.email}
                      onChange={(e) =>
                        setNewTenant({ ...newTenant, email: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                      placeholder="tenant@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Phone (also becomes their login username)
                    </label>
                    <input
                      type="text"
                      value={newTenant.phone}
                      onChange={(e) =>
                        setNewTenant({ ...newTenant, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })
                      }
                      maxLength={10}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white font-mono"
                      placeholder="10-digit mobile number"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowAddTenantModal(false);
                      setNewTenant({ name: '', slug: '', email: '', phone: '' });
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddTenant}
                    disabled={operationLoading}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {operationLoading ? (
                      <>
                        <Loader className="w-3 h-3 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create'
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
