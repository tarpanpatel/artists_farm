import React, { useState, useEffect } from 'react';
import { Building2, Plus, Loader2, AlertCircle, AlertTriangle, BarChart3, ChevronDown, ChevronRight, Edit2, Eye, CheckCircle2, Share2, Copy, XCircle, ExternalLink, KeyRound, X, DoorOpen, RotateCcw, Mail, MessageCircle } from 'lucide-react';
import { ToggleSwitch } from './ToggleSwitch';
import { StyledSelect } from './StyledSelect';
import { Button } from './Button';
import { Input } from './Input';
import { API_ROOT_BASE } from '../services/api';
import { t } from '../i18n/en';
import { useConfirm } from './ConfirmDialogContext';
import { useToast } from './ToastContext';

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
  is_public_demo?: number;
}

interface PlatformPropertyManagementProps {
  username: string;
  onLogout: () => void;
}

export const PlatformPropertyManagement: React.FC<PlatformPropertyManagementProps> = ({
  username: _username,
  onLogout,
}) => {
  const { confirm } = useConfirm();
  const { showToast } = useToast();
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
  const [showDeleteTenantModal, setShowDeleteTenantModal] = useState<number | null>(null);
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
  // Slug auto-fills from the tenant name as it's typed. Once the admin edits
  // the slug field directly, we stop overwriting it - same "auto-generated,
  // editable" pattern used for property slugs elsewhere in the app.
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [editSlugManuallyEdited, setEditSlugManuallyEdited] = useState(false);
  const [propertySlugManuallyEdited, setPropertySlugManuallyEdited] = useState(false);
  const slugify = (text: string) =>
    text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/\-\-+/g, '-');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Root-admin-visible login credentials per tenant, fetched lazily the first
  // time a tenant row is expanded. Kept separate from `tenants` state since
  // it's a sensitive on-demand lookup, not something to bulk-load upfront.
  const [tenantCredsMap, setTenantCredsMap] = useState<Record<number, { username: string; passcode: string; mustChangePasscode: boolean } | 'not_found' | null>>({});
  const [credsLoadingId, setCredsLoadingId] = useState<number | null>(null);
  // Loading state for "Create Login" - shown in place of "No login exists
  // for this tenant yet." for tenants that were created before create_tenant
  // auto-generated one, or without a valid phone number at the time.
  const [creatingLoginId, setCreatingLoginId] = useState<number | null>(null);
  const [createLoginError, setCreateLoginError] = useState<{ tenantId: number; message: string } | null>(null);
  const [sendingLoginId, setSendingLoginId] = useState<number | null>(null);
  const [resettingLoginId, setResettingLoginId] = useState<number | null>(null);
  const [resetLoginError, setResetLoginError] = useState<{ tenantId: number; message: string } | null>(null);
  const [revealedPasscodeId, setRevealedPasscodeId] = useState<number | null>(null);
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
      setError(null);
      // Fetch tenants
      const tenantsRes = await fetch('/php/api/router.php?action=get_all_tenants', {
        credentials: 'include',
      });
      const tenantsData = await tenantsRes.json();
      if (tenantsData.success) {
        setTenants(tenantsData.data || []);
      } else if (tenantsRes.status === 401 || tenantsRes.status === 403) {
        // A 401/403 here silently rendered as "0 tenants / 0 properties" before
        // an earlier check added an error banner instead - better, but still
        // left the half-populated dashboard shell (sidebar, 0/0/0 stat cards,
        // empty tenant list) visible behind the message, which itself reads
        // as broken. PHP's session GC cleans up the server-side session file
        // after enough inactivity, but the browser's login cookie and the
        // app's own client-side auth state don't know that happened, so the
        // UI kept rendering as logged-in Root Admin while every API call
        // quietly 401/403'd. Once the session is confirmed truly invalid,
        // there's nothing to show here - go straight back to the login
        // screen instead of showing a page that looks broken.
        onLogout();
        return;
      } else {
        setError(tenantsData.message || t('failed_to_load_tenants_message', 'Failed to load tenants.'));
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

  const handleManageTenant = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setShowEditTenantModal(true);
    // Fresh edit session - don't carry over "manually edited" from whichever
    // tenant was last opened.
    setEditSlugManuallyEdited(false);
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
          is_public_demo: !!editingProperty.is_public_demo,
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
    setError(null);
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

  const handleDeleteTenant = async (tenantId: number) => {
    setOperationLoading(true);
    setError(null);
    try {
      const response = await fetch('/php/api/router.php?action=delete_tenant', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenant_id: tenantId }),
      });

      const data = await response.json();
      if (data.success) {
        // Deleting a tenant cascades to every property under it - drop both
        // from local state, not just the tenant row.
        setTenants((prev) => prev.filter((t) => t.id !== tenantId));
        setProperties((prev) => prev.filter((p) => p.tenant_id !== tenantId));
        setShowDeleteTenantModal(null);
      } else {
        setError(data.message || 'Failed to delete tenant');
      }
    } catch (err) {
      console.error('Failed to delete tenant:', err);
      setError('Failed to delete tenant');
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
          slug: editingTenant.slug,
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
      const propertyUrl = `${API_ROOT_BASE}/${tenantSlug}/${property.slug}/#dashboard`;
      window.open(propertyUrl, '_blank');
    } catch (err) {
      setError('Failed to open property');
    }
  };

  const loadTenantCredentials = async (tenantId: number) => {
    if (tenantCredsMap[tenantId] !== undefined) return; // already fetched (or fetching finished with null result cached)
    setCredsLoadingId(tenantId);
    try {
      const res = await fetch(`/php/api/router.php?action=get_tenant_credentials&tenant_id=${tenantId}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success && data.data) {
        setTenantCredsMap((prev) => ({
          ...prev,
          [tenantId]: {
            username: data.data.username,
            passcode: data.data.passcode,
            mustChangePasscode: !!Number(data.data.must_change_passcode),
          },
        }));
      } else {
        setTenantCredsMap((prev) => ({ ...prev, [tenantId]: 'not_found' }));
      }
    } catch (err) {
      console.error('Failed to load tenant credentials:', err);
      setTenantCredsMap((prev) => ({ ...prev, [tenantId]: 'not_found' }));
    } finally {
      setCredsLoadingId(null);
    }
  };

  const handleCreateTenantLogin = async (tenantId: number) => {
    setCreatingLoginId(tenantId);
    setCreateLoginError(null);
    try {
      const res = await fetch('/php/api/router.php?action=create_tenant_login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setTenantCredsMap((prev) => ({
          ...prev,
          [tenantId]: {
            username: data.data.username,
            passcode: data.data.passcode,
            mustChangePasscode: !!Number(data.data.must_change_passcode),
          },
        }));
        setRevealedPasscodeId(tenantId); // show the fresh passcode immediately, not masked
      } else {
        setCreateLoginError({ tenantId, message: data.message || 'Failed to create login' });
      }
    } catch (err) {
      console.error('Failed to create tenant login:', err);
      setCreateLoginError({ tenantId, message: 'Failed to create login' });
    } finally {
      setCreatingLoginId(null);
    }
  };

  const handleResetTenantLogin = async (tenantId: number) => {
    const confirmed = await confirm({
      title: t('reset_password_confirm_title', 'Reset Password?'),
      message: t('reset_password_confirm_message', "This immediately invalidates the tenant's current passcode and replaces it with a new temporary one. They'll be asked to set their own the next time they log in."),
      confirmText: t('reset_password_confirm_button', 'Reset Password'),
      variant: 'danger',
    });
    if (!confirmed) return;

    setResettingLoginId(tenantId);
    setResetLoginError(null);
    try {
      const res = await fetch('/php/api/router.php?action=reset_tenant_login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setTenantCredsMap((prev) => ({
          ...prev,
          [tenantId]: {
            username: data.data.username,
            passcode: data.data.passcode,
            mustChangePasscode: !!Number(data.data.must_change_passcode),
          },
        }));
        setRevealedPasscodeId(tenantId);
      } else {
        setResetLoginError({ tenantId, message: data.message || 'Failed to reset password' });
      }
    } catch (err) {
      console.error('Failed to reset tenant login:', err);
      setResetLoginError({ tenantId, message: 'Failed to reset password' });
    } finally {
      setResettingLoginId(null);
    }
  };

  const handleSendLoginInfoEmail = async (tenantId: number, tenantUsername: string, tenantEmail?: string) => {
    if (!tenantEmail) {
      showToast(t('no_tenant_email_toast', 'No email on file for this tenant - add one via Edit Tenant first'), { type: 'error' });
      return;
    }
    setSendingLoginId(tenantId);
    try {
      const res = await fetch('/php/api/router.php?action=request_login_info', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: tenantUsername, login_url: window.location.origin + '/' }),
      });
      const data = await res.json();
      showToast(
        data.success ? t('login_info_sent_toast', 'Login details emailed to the tenant') : (data.message || t('login_info_send_failed_toast', 'Failed to send email')),
        { type: data.success ? 'success' : 'error' }
      );
    } catch (err) {
      console.error('Failed to send login info email:', err);
      showToast(t('login_info_send_failed_toast', 'Failed to send email'), { type: 'error' });
    } finally {
      setSendingLoginId(null);
    }
  };

  const buildTenantWhatsAppShareUrl = (tenant: Tenant, creds: { username: string; passcode: string }) => {
    const digits = (tenant.phone || '').replace(/\D/g, '');
    const phone = digits.length === 10 ? '91' + digits : digits;
    const message = `Hi ${tenant.name},\n\nHere are your Ground Code login details:\n\nUsername: ${creds.username}\nPasscode: ${creds.passcode}\n\nLog in here: ${window.location.origin}/\n\nDidn't request this? You can ignore this message.`;
    return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
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
        body: JSON.stringify({ ...newTenant, login_url: window.location.origin + '/' }),
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
        setSlugManuallyEdited(false);

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
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">Loading platform...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 platform-property-management">
      {/* Success Toast */}
      {successMessage && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-2xl animate-pulse flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {successMessage}
        </div>
      )}

      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h1 className="platform-property-management__page-title text-lg font-semibold text-slate-900 dark:text-white">
                {t('platform_title', 'Ground Code Platform')}
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {t('admin_dashboard_subtitle', 'Administration Dashboard')}
              </p>
            </div>
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
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                  {t('total_tenants_label', 'Total Tenants')}
                </p>
                <p className="text-3xl font-semibold text-slate-900 dark:text-white">
                  {tenants.length}
                </p>
              </div>
              <Building2 className="w-8 h-8 text-blue-600 dark:text-blue-400 opacity-20" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                  {t('total_properties_label', 'Total Properties')}
                </p>
                <p className="text-3xl font-semibold text-slate-900 dark:text-white">
                  {properties.length}
                </p>
              </div>
              <BarChart3 className="w-8 h-8 text-green-600 dark:text-green-400 opacity-20" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                  {t('active_tenants_label', 'Active Tenants')}
                </p>
                <p className="text-3xl font-semibold text-slate-900 dark:text-white">
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
            <h2 className="platform-property-management__title text-xl font-semibold text-slate-900 dark:text-white">{t('tenants_and_properties_heading', 'Tenants & Properties')}</h2>
            <Button
              onClick={() => setShowAddTenantModal(true)}
              className="flex items-center gap-2"
              variant="primary"
              size="md"
            >
              <Plus className="w-4 h-4" />
              {t('add_tenant_button', 'Add Tenant')}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
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
                    onClick={() => {
                      const nowExpanding = !isExpanded;
                      setExpandedTenant(nowExpanding ? tenant.id : null);
                      if (nowExpanding) loadTenantCredentials(tenant.id);
                    }}
                    className="p-6 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div>
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                          )}
                        </div>
                         <div className="flex-1">
                           <h3 className="platform-property-management__subtitle font-semibold text-lg text-slate-900 dark:text-white mb-1">
                             {tenant.name}
                           </h3>
                           <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
                             Tenant ID: {tenant.id}
                           </p>
                           <p className="text-sm text-slate-600 dark:text-slate-400">
                             Slots Used: {tenant.slots_used ?? tenantProperties.length}/{tenant.max_properties}
                           </p>
                         </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-3 py-1 text-xs font-semibold rounded-full ${
                            tenant.is_active
                              ? 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300'
                              : 'bg-slate-100 text-slate-800 dark:bg-slate-900/50 dark:text-slate-300'
                          }`}
                        >
                          {tenant.is_active ? t('active_status_badge', 'Active') : t('inactive_status_badge', 'Inactive')}
                        </span>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`/artists_farm/${tenant.slug}/#dashboard`, '_blank');
                          }}
                          className="text-emerald-600 dark:text-emerald-400"
                          title={t('visit_tenant_dashboard_tooltip', 'Visit Tenant Dashboard')}
                          variant="ghost"
                          size="xs"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleManageTenant(tenant);
                          }}
                          className="text-blue-600 dark:text-blue-400"
                          title={t('edit_tenant_tooltip', 'Edit Tenant')}
                          variant="ghost"
                          size="xs"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteTenantModal(tenant.id);
                          }}
                          className="text-red-600 dark:text-red-400 font-semibold"
                          title={t('delete_tenant_tooltip', 'Delete Tenant')}
                          variant="ghost"
                          size="xs"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Tenant Details - Expandable */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 dark:border-slate-700 p-6 bg-slate-50 dark:bg-slate-700/30">
                      <div className="mb-6">
                        <h4 className="platform-property-management__caption text-sm font-semibold text-slate-900 dark:text-white mb-3">
                          {t('subscription_details_heading', 'Subscription Details')}
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-slate-600 dark:text-slate-400">{t('plan_label', 'Plan')}</p>
                            <p className="font-medium text-slate-900 dark:text-white">
                              {tenant.subscription_status}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-600 dark:text-slate-400">{t('email_label', 'Email')}</p>
                            <p className="font-medium text-slate-900 dark:text-white">
                              {tenant.email || '-'}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-600 dark:text-slate-400">{t('phone_label', 'Phone')}</p>
                            <p className="font-medium text-slate-900 dark:text-white">
                              {tenant.phone || '-'}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-600 dark:text-slate-400">{t('max_properties_label', 'Max Properties')}</p>
                            <p className="font-medium text-slate-900 dark:text-white">
                              {tenant.max_properties}
                            </p>
                          </div>
                        </div>

                        {/* Login Credentials - always visible to root admin, even after the tenant changes their own passcode */}
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-2">
                            <KeyRound className="w-3.5 h-3.5 text-indigo-500" /> {t('login_credentials_label', 'Login Credentials')}
                          </p>
                          {credsLoadingId === tenant.id ? (
                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                              <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                            </p>
                          ) : tenantCredsMap[tenant.id] === 'not_found' || !tenantCredsMap[tenant.id] ? (
                            <div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                {t('no_login_exists_message', 'No login exists for this tenant yet.')}
                              </p>
                              <Button
                                onClick={() => handleCreateTenantLogin(tenant.id)}
                                disabled={creatingLoginId === tenant.id}
                                variant="secondary"
                                size="xs"
                                className="flex items-center gap-1.5"
                              >
                                {creatingLoginId === tenant.id ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" /> {t('creating_button', 'Creating...')}
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3 h-3" /> {t('create_login_button', 'Create Login')}
                                  </>
                                )}
                              </Button>
                              {createLoginError?.tenantId === tenant.id && (
                                <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3 shrink-0" /> {createLoginError.message}
                                </p>
                              )}
                            </div>
                          ) : (
                            (() => {
                              const creds = tenantCredsMap[tenant.id] as { username: string; passcode: string; mustChangePasscode: boolean };
                              const isRevealed = revealedPasscodeId === tenant.id;
                              return (
                                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                                  <div>
                                    <p className="text-slate-600 dark:text-slate-400 text-xs">{t('username_column', 'Username')}</p>
                                    <p className="font-mono font-semibold text-slate-900 dark:text-white">{creds.username}</p>
                                  </div>
                                  <div>
                                    <p className="text-slate-600 dark:text-slate-400 text-xs">{t('passcode_label', 'Passcode')}</p>
                                    <div className="flex items-center gap-2">
                                      <p className="font-mono font-semibold text-slate-900 dark:text-white tracking-widest">
                                        {isRevealed ? creds.passcode : '\u2022'.repeat(creds.passcode.length || 6)}
                                      </p>
                                      <Button
                                        onClick={() => setRevealedPasscodeId(isRevealed ? null : tenant.id)}
                                        className="text-indigo-600 dark:text-indigo-400 font-semibold"
                                        variant="link"
                                      >
                                        {isRevealed ? t('hide_button', 'Hide') : t('show_button', 'Show')}
                                      </Button>
                                      <Button
                                        onClick={() => navigator.clipboard?.writeText(creds.passcode)}
                                        className="text-indigo-600 dark:text-indigo-400"
                                        title={t('copy_passcode_tooltip', 'Copy passcode')}
                                        variant="ghost"
                                        size="xs"
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                  {creds.mustChangePasscode ? (
                                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                                      {t('temp_passcode_badge', 'Temp passcode - not yet changed')}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">
                                      {t('own_passcode_badge', 'Tenant has set their own passcode')}
                                    </span>
                                  )}
                                  <div>
                                    <Button
                                      onClick={() => handleResetTenantLogin(tenant.id)}
                                      disabled={resettingLoginId === tenant.id}
                                      variant="secondary"
                                      size="xs"
                                      className="flex items-center gap-1.5"
                                    >
                                      {resettingLoginId === tenant.id ? (
                                        <>
                                          <Loader2 className="w-3 h-3 animate-spin" /> {t('resetting_button', 'Resetting...')}
                                        </>
                                      ) : (
                                        <>
                                          <RotateCcw className="w-3 h-3" /> {t('reset_password_button', 'Reset Password')}
                                        </>
                                      )}
                                    </Button>
                                    {resetLoginError?.tenantId === tenant.id && (
                                      <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3 shrink-0" /> {resetLoginError.message}
                                      </p>
                                    )}
                                  </div>
                                  <Button
                                    onClick={() => handleSendLoginInfoEmail(tenant.id, creds.username, tenant.email)}
                                    disabled={sendingLoginId === tenant.id}
                                    title={!tenant.email ? t('no_tenant_email_tooltip', 'No email on file for this tenant') : undefined}
                                    variant="secondary"
                                    size="xs"
                                    className="flex items-center gap-1.5"
                                  >
                                    {sendingLoginId === tenant.id ? (
                                      <>
                                        <Loader2 className="w-3 h-3 animate-spin" /> {t('sending_button', 'Sending...')}
                                      </>
                                    ) : (
                                      <>
                                        <Mail className="w-3 h-3" /> {t('send_via_email_button', 'Send via Email')}
                                      </>
                                    )}
                                  </Button>
                                  {tenant.phone ? (
                                    <a href={buildTenantWhatsAppShareUrl(tenant, creds)} target="_blank" rel="noopener noreferrer">
                                      <Button variant="secondary" size="xs" className="flex items-center gap-1.5">
                                        <MessageCircle className="w-3 h-3 text-emerald-600 shrink-0" />
                                        {t('send_via_whatsapp_button', 'Share via WhatsApp')}
                                      </Button>
                                    </a>
                                  ) : (
                                    <span title={t('no_tenant_phone_tooltip', 'No phone on file for this tenant')}>
                                      <Button variant="secondary" size="xs" disabled className="flex items-center gap-1.5">
                                        <MessageCircle className="w-3 h-3 text-slate-400 shrink-0" />
                                        {t('send_via_whatsapp_button', 'Share via WhatsApp')}
                                      </Button>
                                    </span>
                                  )}
                                </div>
                              );
                            })()
                          )}
                        </div>
                      </div>

                      {/* Properties List */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="platform-property-management__caption text-sm font-semibold text-slate-900 dark:text-white">
                            Properties ({tenantProperties.length})
                          </h4>
                          <Button
                            onClick={() => {
                              setSelectedTenantForProperty(tenant.id);
                              setPropertySlugManuallyEdited(false);
                              setEditingProperty({ id: 0, name: '', slug: '', tenant_id: tenant.id, status: 'active', tailwind_color_scheme: 'blue', include_kitchen: true, property_type: 'SINGLE', currency: 'INR', timezone: 'Asia/Kolkata' });
                              setShowPropertyModal('add');
                            }}
                            className="flex items-center gap-1"
                            variant="primary"
                            size="sm"
                          >
                            <Plus className="w-3 h-3" />
                            {t('add_button', 'Add')}
                          </Button>
                        </div>
                        {tenantProperties.length === 0 ? (
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            {t('no_properties_yet_message', 'No properties yet')}
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {tenantProperties.map((prop) => {
                              const kitchenEnabled = propertyModules[prop.id]?.kitchen || false;
                              const isTogglingModule = moduleToggleLoading === `kitchen-${prop.id}`;
                              const isRoom = (prop as any).property_type === 'MULTI_KEY_ROOM';
                              const isMultiKey = (prop as any).property_type === 'MULTI_KEY';

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
                                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                                          {prop.name}
                                        </p>
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                          isMultiKey
                                            ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                                            : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                                        }`}>
                                          {isMultiKey ? t('multi_key_badge', 'Multi-Key') : t('single_badge', 'Single')}
                                        </span>
                                      </div>
                                      <p className="text-xs text-slate-600 dark:text-slate-400">
                                        Slug: {prop.slug}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-slate-600 dark:text-slate-400">{t('active_toggle_label', 'Active:')}</span>
                                          <ToggleSwitch
                                            enabled={prop.status === 'active'}
                                            onChange={() => togglePropertyStatus(prop.id, prop.status)}
                                            disabled={propertyToggleLoading === prop.id}
                                          />
                                        </div>
                                        {!isRoom && (
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs text-slate-600 dark:text-slate-400">{t('kitchen_toggle_label', 'Kitchen:')}</span>
                                            <ToggleSwitch
                                              enabled={kitchenEnabled}
                                              onChange={() => toggleKitchenModule(prop.id, kitchenEnabled)}
                                              disabled={isTogglingModule}
                                            />
                                          </div>
                                        )}
                                      </div>
                                      <Button
                                        onClick={() => openPropertyWithAutoLogin(prop, tenant.slug)}
                                        className="text-green-600 dark:text-green-400"
                                        title={t('open_property_tab_tooltip', 'Open Property in New Tab')}
                                        variant="ghost"
                                        size="xs"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        onClick={() => {
                                          setEditingProperty(prop);
                                          setShowPropertyModal('edit');
                                        }}
                                        className="text-blue-600 dark:text-blue-400"
                                        title={t('edit_property_tooltip', 'Edit Property')}
                                        variant="ghost"
                                        size="xs"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        onClick={() => setShowDeletePropertyModal(prop.id)}
                                        className="text-red-600 dark:text-red-400 font-semibold"
                                        title={t('delete_property_tooltip', 'Delete Property')}
                                        variant="ghost"
                                        size="xs"
                                      >
                                        <X className="w-4 h-4" />
                                      </Button>
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
                                              <span className="text-xs font-semibold text-slate-400"><DoorOpen className="w-3.5 h-3.5" /></span>
                                              <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                                                {room.name}
                                              </p>
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-500">
                                              Slug: {room.slug}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-3 shrink-0">
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs text-slate-600 dark:text-slate-400">{t('active_toggle_label', 'Active:')}</span>
                                              <ToggleSwitch
                                                enabled={room.status === 'active'}
                                                onChange={() => togglePropertyStatus(room.id, room.status)}
                                                disabled={propertyToggleLoading === room.id}
                                              />
                                            </div>
                                            <Button
                                              onClick={() => openPropertyWithAutoLogin(room, tenant.slug)}
                                              className="text-green-600 dark:text-green-400"
                                              title={t('open_room_tab_tooltip', 'Open Room in New Tab')}
                                              variant="ghost"
                                              size="xs"
                                            >
                                              <Eye className="w-3 h-3" />
                                            </Button>
                                            <Button
                                              onClick={() => {
                                                setPropertySlugManuallyEdited(false);
                                                const initialSlug = (room.slug && room.slug.trim() !== '') ? slugify(room.slug) : slugify(room.name || '');
                                                setEditingProperty({ ...room, slug: initialSlug });
                                                setShowPropertyModal('edit');
                                              }}
                                              className="text-blue-600 dark:text-blue-400"
                                              title={t('edit_room_tooltip', 'Edit Room')}
                                              variant="ghost"
                                              size="xs"
                                            >
                                              <Edit2 className="w-3 h-3" />
                                            </Button>
                                            <Button
                                              onClick={() => setShowDeletePropertyModal(room.id)}
                                              className="text-red-600 dark:text-red-400 font-semibold"
                                              title={t('delete_room_tooltip', 'Delete Room')}
                                              variant="ghost"
                                              size="xs"
                                            >
                                              <X className="w-3 h-3" />
                                            </Button>
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
            <h3 className="platform-property-management__subtitle text-lg font-semibold text-slate-900 dark:text-white mb-4">
              {t('edit_tenant_heading', 'Edit Tenant')}
            </h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('tenant_name_label', 'Tenant Name')}
                </label>
                <Input
                  type="text"
                  value={editingTenant.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setEditingTenant((prev) => prev && ({
                      ...prev,
                      name,
                      slug: editSlugManuallyEdited ? prev.slug : slugify(name),
                    }));
                  }}
                />
              </div>
              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('email_label', 'Email')}
                </label>
                <Input
                  type="email"
                  value={editingTenant.email || ''}
                  onChange={(e) =>
                    setEditingTenant({ ...editingTenant, email: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('phone_label', 'Phone')}
                </label>
                <Input
                  type="tel"
                  value={editingTenant.phone || ''}
                  onChange={(e) =>
                    setEditingTenant({ ...editingTenant, phone: e.target.value })
                  }
                />
              </div>



              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('slug_label', 'Slug')}
                </label>
                <Input
                  type="text"
                  value={editingTenant.slug}
                  onChange={(e) => {
                    setEditSlugManuallyEdited(true);
                    setEditingTenant({ ...editingTenant, slug: slugify(e.target.value) });
                  }}
                  className="font-mono"
                />
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  {t('tenant_slug_change_warning', "Changes this tenant's URL for every property under it - any bookmarked or previously-shared links will stop working.")}
                </p>
              </div>

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('subscription_status_label', 'Subscription Status')}
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
                    { value: 'trial', label: t('trial_label', 'Trial') },
                    { value: 'active', label: t('active_status_badge', 'Active') },
                    { value: 'suspended', label: t('suspended_label', 'Suspended') },
                  ]}
                />
              </div>

              <div className="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 min-h-[44px]">
                <input
                  type="checkbox"
                  id="editTenantActiveCheck"
                  checked={!!editingTenant.is_active}
                  onChange={(e) =>
                    setEditingTenant({
                      ...editingTenant,
                      is_active: e.target.checked ? 1 : 0,
                    })
                  }
                  className="w-4 h-4 rounded cursor-pointer shrink-0"
                />
                <label htmlFor="editTenantActiveCheck" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  {t('active_status_badge', 'Active')}
                </label>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setShowEditTenantModal(false)}
                className="flex-1"
                variant="secondary"
                size="md"
              >
                {t('cancel_button', 'Cancel')}
              </Button>
              <Button
                onClick={handleSaveTenant}
                className="flex-1"
                variant="primary"
                size="md"
              >
                {t('save_button', 'Save')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Property Add/Edit Modal */}
      {showPropertyModal && editingProperty && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="platform-property-management__subtitle text-lg font-semibold text-slate-900 dark:text-white mb-4">
              {showPropertyModal === 'add' ? t('add_property_heading', 'Add Property') : t('edit_property_heading', 'Edit Property')}
            </h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('property_name_label', 'Property Name')}
                  <span
                    className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 cursor-help hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    title={t('property_name_help_tooltip', 'The display name guests see for this property/room. Automatically generates the URL slug.')}
                  >
                    {t('help_label', 'Help?')}
                  </span>
                </label>
                <Input
                  type="text"
                  value={editingProperty.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const slug = (showPropertyModal === 'add' || !propertySlugManuallyEdited)
                      ? slugify(name)
                      : editingProperty.slug;
                    setEditingProperty({ ...editingProperty, name, slug });
                  }}
                />
              </div>

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('slug_label', 'Slug')}
                </label>
                <Input
                  type="text"
                  value={editingProperty.slug}
                  onChange={(e) => {
                    setPropertySlugManuallyEdited(true);
                    setEditingProperty({ ...editingProperty, slug: slugify(e.target.value) });
                  }}
                />
              </div>

              <div className="pt-2 border-t border-slate-300 dark:border-slate-600">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t('allow_telegram_customization_label', 'Allow Telegram Template Customization')}
                  </span>
                  <ToggleSwitch
                    enabled={!!editingProperty.telegram_template_customization_enabled}
                    onChange={(enabled) =>
                      setEditingProperty({ ...editingProperty, telegram_template_customization_enabled: enabled ? 1 : 0 })
                    }
                  />
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {t('telegram_customization_hint', "All templates are designed here at the root admin level. When off, this property's Super Admin can view templates and the live preview but can't edit the wording.")}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-300 dark:border-slate-600">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t('public_demo_mode_label', 'Public Demo Mode')}
                  </span>
                  <ToggleSwitch
                    enabled={!!editingProperty.is_public_demo}
                    onChange={(enabled) =>
                      setEditingProperty({ ...editingProperty, is_public_demo: enabled ? 1 : 0 })
                    }
                  />
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {t('public_demo_mode_hint', 'When on, anyone who opens this property\'s URL gets full real access automatically - no login required. Meant for a sales/demo property only - never enable this on a property with real guest data.')}
                </p>
              </div>

              {showPropertyModal === 'add' && (
                <div className="space-y-3">
                  <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                    {t('property_type_label', 'Property Type')}
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-3 border border-slate-300 dark:border-slate-600 rounded-lg cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-700/50">
                      <input
                        type="radio"
                        name="propertyType"
                        value="SINGLE"
                        checked={editingProperty.property_type === 'SINGLE'}
                        onChange={() =>
                          setEditingProperty({ ...editingProperty, property_type: 'SINGLE' })
                        }
                        className="w-4 h-4"
                      />
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">{t('single_property_option', 'Single Property')}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">{t('single_property_hint', 'One group of guests at a time')}</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 border border-slate-300 dark:border-slate-600 rounded-lg cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-700/50">
                      <input
                        type="radio"
                        name="propertyType"
                        value="MULTI_KEY"
                        checked={editingProperty.property_type === 'MULTI_KEY'}
                        onChange={() =>
                          setEditingProperty({ ...editingProperty, property_type: 'MULTI_KEY' })
                        }
                        className="w-4 h-4"
                      />
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">{t('multi_key_property_option', 'Multi Key Property')}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">{t('multi_key_property_hint', 'Multiple rooms/suites with shared staff & expenses')}</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {editingProperty.property_type === 'MULTI_KEY' && showPropertyModal === 'add' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                        {t('currency_label', 'Currency')}
                      </label>
                      <Input
                        type="text"
                        value={editingProperty.currency || 'INR'}
                        onChange={(e) =>
                          setEditingProperty({ ...editingProperty, currency: e.target.value })
                        }
                        placeholder={t('currency_placeholder', 'INR')}
                      />
                    </div>
                    <div>
                      <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                        {t('timezone_label', 'Timezone')}
                      </label>
                      <Input
                        type="text"
                        value={editingProperty.timezone || 'Asia/Kolkata'}
                        onChange={(e) =>
                          setEditingProperty({ ...editingProperty, timezone: e.target.value })
                        }
                        placeholder={t('timezone_placeholder', 'Asia/Kolkata')}
                      />
                    </div>
                  </div>
                </>
              )}

              {showPropertyModal === 'add' && (
                <div className="pt-2 border-t border-slate-300 dark:border-slate-600">
                  <label className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t('include_kitchen_module_label', 'Include Kitchen Module')}
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
              <Button
                onClick={() => {
                  setShowPropertyModal(null);
                  setEditingProperty(null);
                }}
                className="flex-1"
                variant="secondary"
                size="md"
              >
                {t('cancel_button', 'Cancel')}
              </Button>
              <Button
                onClick={showPropertyModal === 'add' ? handleAddProperty : handleEditProperty}
                disabled={operationLoading}
                className="flex-1 flex items-center justify-center gap-2"
                variant="primary"
                size="md"
              >
                {operationLoading ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Saving...
                  </>
                ) : (
                  showPropertyModal === 'add' ? t('add_button', 'Add') : t('update_button', 'Update')
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Property Confirmation */}
      {showDeletePropertyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="platform-property-management__subtitle text-lg font-semibold text-slate-900 dark:text-white mb-4">
              {t('delete_property_heading', 'Delete Property?')}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 font-semibold text-red-600 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {t('deletion_consequences_label', 'Deletion Consequences for this Property:')}
            </p>
            <ul className="text-sm text-slate-600 dark:text-slate-400 mb-4 list-disc list-inside space-y-1">
              <li>All <strong>active and upcoming bookings</strong> will be permanently deleted.</li>
              <li>Past bookings and financial ledger records <strong>will remain intact</strong> for historical audits.</li>
              <li>Menus, inventory stock, staff assignments, and modules will be removed.</li>
            </ul>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
              Type <span className="font-semibold font-mono text-slate-900 dark:text-white">DELETE</span> to confirm:
            </p>
            <Input
              type="text"
              autoFocus
              placeholder={t('type_here_placeholder', 'Type here...')}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="mb-4 font-mono"
            />

            {/* Surfaced inline (23 Aug 2026): this modal is a full-screen fixed
                overlay, so the page-level error banner further up the tree was
                rendering behind it - a failed delete looked like nothing
                happened at all except a console network error. */}
            {error && (
              <div className="mb-4 flex gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setShowDeletePropertyModal(null);
                  setDeleteConfirmText('');
                  setError(null);
                }}
                className="flex-1"
                variant="secondary"
                size="md"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  handleDeleteProperty(showDeletePropertyModal);
                  setDeleteConfirmText('');
                }}
                disabled={operationLoading || deleteConfirmText !== 'DELETE'}
                className="flex-1 flex items-center justify-center gap-2"
                variant="danger"
                size="md"
              >
                {operationLoading ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  t('delete_property_button', 'Delete Property')
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Tenant Confirmation */}
      {showDeleteTenantModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="platform-property-management__subtitle text-lg font-semibold text-slate-900 dark:text-white mb-4">
              {t('delete_tenant_heading', 'Delete Tenant?')}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 font-semibold text-red-600 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {t('deletion_consequences_label', 'Deletion Consequences for this Property:').replace('this Property', 'this Tenant')}
            </p>
            <ul className="text-sm text-slate-600 dark:text-slate-400 mb-4 list-disc list-inside space-y-1">
              <li><strong>Every property under this tenant</strong> (
                {properties.filter((p) => p.tenant_id === showDeleteTenantModal).length} total) will be permanently deleted too - not just the tenant record.
              </li>
              <li>For each of those properties: all <strong>active and upcoming bookings</strong> will be permanently deleted.</li>
              <li>Past bookings and financial ledger records <strong>will remain intact</strong> for historical audits.</li>
              <li>Menus, inventory stock, staff assignments, and modules for every property will be removed.</li>
            </ul>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
              Type <span className="font-semibold font-mono text-slate-900 dark:text-white">DELETE</span> to confirm:
            </p>
            <Input
              type="text"
              autoFocus
              placeholder={t('type_here_placeholder', 'Type here...')}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="mb-4 font-mono"
            />

            {error && (
              <div className="mb-4 flex gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setShowDeleteTenantModal(null);
                  setDeleteConfirmText('');
                  setError(null);
                }}
                className="flex-1"
                variant="secondary"
                size="md"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  handleDeleteTenant(showDeleteTenantModal);
                  setDeleteConfirmText('');
                }}
                disabled={operationLoading || deleteConfirmText !== 'DELETE'}
                className="flex-1 flex items-center justify-center gap-2"
                variant="danger"
                size="md"
              >
                {operationLoading ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  t('delete_tenant_button', 'Delete Tenant')
                )}
              </Button>
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
                  <h3 className="platform-property-management__subtitle text-lg font-semibold text-slate-900 dark:text-white">
                    {t('tenant_created_heading', 'Tenant Created')}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  {t('temp_passcode_only_shown_hint', "This is the only time the temporary passcode is shown - share it now.")}
                </p>

                {newTenantCredentials.loginNote ? (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300 mb-4">
                    {newTenantCredentials.loginNote}
                  </div>
                ) : (
                  <>
                    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-2 mb-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 dark:text-slate-400">{t('username_column', 'Username')}</span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-white">{newTenantCredentials.username}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 dark:text-slate-400">{t('temporary_passcode_label', 'Temporary Passcode')}</span>
                        <span className="font-mono font-semibold text-slate-900 dark:text-white tracking-widest">{newTenantCredentials.tempPasscode}</span>
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
                        className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <Share2 className="w-4 h-4" /> {t('share_whatsapp_button', 'Share via WhatsApp')}
                      </a>
                      <Button
                        onClick={() => navigator.clipboard?.writeText(newTenantCredentials.renderedMessage)}
                        title={t('copy_message_tooltip', 'Copy message')}
                        variant="secondary"
                        size="sm"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </>
                )}

                <Button
                  onClick={() => {
                    setShowAddTenantModal(false);
                    setNewTenantCredentials(null);
                  }}
                  className="mt-2"
                  variant="primary"
                  size="md"
                  block
                >
                  {t('done_button', 'Done')}
                </Button>
              </>
            ) : (
              <>
                <h3 className="platform-property-management__subtitle text-lg font-semibold text-slate-900 dark:text-white mb-4">
                  {t('add_new_tenant_heading', 'Add New Tenant')}
                </h3>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                      {t('tenant_name_label', 'Tenant Name')}
                    </label>
                    <Input
                      type="text"
                      value={newTenant.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        setNewTenant((prev) => ({
                          ...prev,
                          name,
                          slug: slugManuallyEdited ? prev.slug : slugify(name),
                        }));
                      }}
                      placeholder={t('tenant_name_placeholder', 'e.g., Vrikshawan')}
                    />
                  </div>

                  <div>
                    <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                      {t('url_slug_label', 'URL Slug')}
                    </label>
                    <Input
                      type="text"
                      value={newTenant.slug}
                      onChange={(e) => {
                        setSlugManuallyEdited(true);
                        setNewTenant({ ...newTenant, slug: slugify(e.target.value) });
                      }}
                      className="font-mono"
                      placeholder={t('tenant_slug_placeholder', 'e.g., vrikshawan')}
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {t('url_slug_hint', "Auto-filled from the name. Used in the property URL - not the login username (that's the phone number below).")}
                    </p>
                  </div>

                  <div>
                    <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                      {t('email_label', 'Email')}
                    </label>
                    <Input
                      type="email"
                      value={newTenant.email}
                      onChange={(e) =>
                        setNewTenant({ ...newTenant, email: e.target.value })
                      }
                      placeholder={t('email_placeholder', 'tenant@example.com')}
                    />
                  </div>

                  <div>
                    <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                      {t('tenant_phone_login_username_label', 'Phone (also becomes their login username)')}
                    </label>
                    <Input
                      type="tel"
                      value={newTenant.phone}
                      onChange={(e) =>
                        setNewTenant({ ...newTenant, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })
                      }
                      maxLength={10}
                      className="font-mono"
                      placeholder={t('phone_placeholder', '10-digit mobile number')}
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={() => {
                      setShowAddTenantModal(false);
                      setNewTenant({ name: '', slug: '', email: '', phone: '' });
                      setSlugManuallyEdited(false);
                    }}
                    className="flex-1"
                    variant="secondary"
                    size="md"
                  >
                    {t('cancel_button', 'Cancel')}
                  </Button>
                  <Button
                    onClick={handleAddTenant}
                    disabled={operationLoading}
                    className="flex-1 flex items-center justify-center gap-2"
                    variant="primary"
                    size="md"
                  >
                    {operationLoading ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      t('create_button', 'Create')
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

