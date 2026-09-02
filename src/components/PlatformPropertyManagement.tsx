import React, { useState, useEffect } from 'react';
import { Building2, Plus, Loader2, AlertCircle, AlertTriangle, BarChart3, Pencil, CheckCircle2, Share2, Copy, XCircle, ExternalLink, X, TelegramIcon, Trash2, KeyRound, Mail, RotateCcw, Eye, EyeOff } from './icons/FlowbiteIcons';
import { Drawer, Alert, Modal } from 'flowbite-react';
import { ToggleSwitch } from './ToggleSwitch';
import { StyledSelect } from './StyledSelect';
import { Button } from './Button';
import { Input } from './Input';
import { LoadingScreen } from './LoadingScreen';
import { TelegramPairingPanel } from './TelegramPairingPanel';
import { API_ROOT_BASE } from '../services/api';
import { t } from '../i18n/en';
import { useConfirm } from './ConfirmDialogContext';
import { useToast } from './ToastContext';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

interface Tenant {
  id: number;
  name: string;
  slug: string;
  subscription_status: string;
  plan_type?: string;
  subscription_expires_at?: string;
  max_properties: number;
  slots_used?: number;
  email?: string;
  phone?: string;
  is_active: number;
  is_demo?: number;
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
  telegram_bot_token?: string;
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
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [showEditTenantModal, setShowEditTenantModal] = useState(false);
  // Renewal trail for manual/offline billing (27 Aug 2026, see PRODUCT_STRATEGY.md) -
  // update_tenant overwrites plan_type/subscription_expires_at in place, so without this
  // there was no record of what a renewal actually was (UPI/NEFT ref, prior plan/date).
  const [renewalNote, setRenewalNote] = useState('');
  const [renewalHistory, setRenewalHistory] = useState<any[]>([]);
  const [renewalHistoryLoading, setRenewalHistoryLoading] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [showPropertyModal, setShowPropertyModal] = useState<'add' | 'edit' | null>(null);
  // Bot token starts greyed-out/read-only whenever one is already saved - "Edit" un-locks it.
  // Reset to false every time a (possibly different) property is opened for editing.
  const [isEditingBotToken, setIsEditingBotToken] = useState(false);
  const [isSavingBotToken, setIsSavingBotToken] = useState(false);
  // Bumped only on a successful token save (not on every keystroke) - used as part of
  // TelegramPairingPanel's `key` below to force it to remount and re-fetch bot identity in real
  // time the moment a token is actually persisted, instead of the old "reopen this panel" gap.
  const [botTokenSaveCount, setBotTokenSaveCount] = useState(0);
  const [showDeletePropertyModal, setShowDeletePropertyModal] = useState<number | null>(null);
  const [showDeleteTenantModal, setShowDeleteTenantModal] = useState<number | null>(null);
  const [moduleToggleLoading, setModuleToggleLoading] = useState<string | null>(null);
  const [propertyModules, setPropertyModules] = useState<Record<number, { kitchen: boolean }>>({});
  const [propertyToggleLoading, setPropertyToggleLoading] = useState<number | null>(null);
  // Setter unused now that the "Add Property" trigger button is gone (26 Aug 2026, see
  // handleAddProperty's own now-unreachable-but-harmless callers below) - never removed the
  // getter or handleAddProperty itself since they're still referenced by the shared modal's
  // dead 'add'-mode branches, kept rather than partially unwound to limit risk in this file.
  const [selectedTenantForProperty] = useState<number | null>(null);
  const [viewPropertiesTenant, setViewPropertiesTenant] = useState<Tenant | null>(null);
  const [selectedTelegramProperty, setSelectedTelegramProperty] = useState<Property | null>(null);
  const [operationLoading, setOperationLoading] = useState(false);
  const [showAddTenantModal, setShowAddTenantModal] = useState(false);
  const [newTenantNameTouched, setNewTenantNameTouched] = useState(false);
  const [newTenantSlugTouched, setNewTenantSlugTouched] = useState(false);
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
  // time a tenant row is expanded or edited. Kept separate from `tenants` state since
  // it's a sensitive on-demand lookup, not something to bulk-load upfront.
  const [tenantCredsMap, setTenantCredsMap] = useState<Record<number, { username: string; passcode: string; mustChangePasscode: boolean } | 'not_found' | null>>({});
  const [credsLoadingId, setCredsLoadingId] = useState<number | null>(null);
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
    setRenewalNote('');
    loadRenewalHistory(tenant.id);
    loadTenantCredentials(tenant.id);
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
        const typeLabel = isMultiKey ? 'Multi-Key' : 'Single';
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

  /**
   * Scoped, immediate save of just the bot token (26 Aug 2026, explicit request: "Add"/"Edit"
   * buttons that save in real time without closing the drawer). Calls the dedicated
   * `set_property_telegram_bot_token` action rather than `update_property`/`edit_property` -
   * those only ever wrote to `properties.telegram_bot_token`, a column NOTHING actually reads for
   * pairing/sending (real source of truth is `property_modules.config.botToken` - see
   * pairingBotToken() in php/telegram/pairing.php). That mismatch is exactly why the token showed
   * as "saved" here while Telegram Group Pairing kept saying "No bot assigned yet" - two
   * disconnected storage locations for what looked like one setting. This action does a
   * read-merge-write into the real config (never clobbers already-paired groups/routing) and
   * mirrors into properties.telegram_bot_token too, so this field's own display stays correct.
   */
  const saveBotTokenForProperty = async (targetProp: Property) => {
    if (!targetProp) return;
    setIsSavingBotToken(true);
    try {
      const response = await fetch('/php/api/router.php?action=set_property_telegram_bot_token', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: targetProp.id,
          telegram_bot_token: targetProp.telegram_bot_token || '',
        }),
      });
      const data = await response.json();
      if (data.success) {
        setProperties((prev) =>
          prev.map((p) => (p.id === targetProp.id ? { ...p, telegram_bot_token: targetProp.telegram_bot_token } : p))
        );
        setIsEditingBotToken(false);
        setBotTokenSaveCount((n) => n + 1);
      } else {
        setError(data.message || 'Failed to save bot token');
      }
    } catch (err) {
      console.error('Failed to save bot token:', err);
      setError('Failed to save bot token');
    } finally {
      setIsSavingBotToken(false);
    }
  };

  const toggleTelegramTemplateCustomization = async (targetProp: Property, enabled: boolean) => {
    try {
      const response = await fetch('/php/api/router.php?action=edit_property', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: targetProp.id,
          name: targetProp.name,
          slug: targetProp.slug,
          color_scheme: targetProp.tailwind_color_scheme,
          status: targetProp.status,
          telegram_template_customization_enabled: enabled,
          telegram_bot_token: targetProp.telegram_bot_token || '',
          is_public_demo: !!targetProp.is_public_demo,
        }),
      });
      const data = await response.json();
      if (data.success) {
        const updatedVal = enabled ? 1 : 0;
        const updated = { ...targetProp, telegram_template_customization_enabled: updatedVal };
        setSelectedTelegramProperty(updated);
        setProperties((prev) =>
          prev.map((p) => (p.id === targetProp.id ? updated : p))
        );
      } else {
        setError(data.message || 'Failed to toggle template customization');
      }
    } catch (err) {
      console.error('Failed to toggle template customization:', err);
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
          telegram_bot_token: editingProperty.telegram_bot_token || '',
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
    const prop = properties.find((p) => p.id === propertyId);
    const confirmed = await confirm({
      title: t('delete_property_confirm_title', 'Delete Property?'),
      message: prop ? `Are you sure you want to delete "${prop.name}"? This action cannot be undone.` : 'Are you sure you want to delete this property?',
      confirmText: t('delete_property_confirm_button', 'Delete Property'),
      variant: 'danger',
    });
    if (!confirmed) return;

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
        showToast(t('property_deleted_success', 'Property deleted successfully'), { type: 'success' });
      } else {
        const errorMsg = data.message || 'Failed to delete property';
        showToast(errorMsg, { type: 'error' });
        setError(errorMsg);
      }
    } catch (err) {
      console.error('Failed to delete property:', err);
      showToast('Failed to delete property', { type: 'error' });
      setError('Failed to delete property');
    } finally {
      setOperationLoading(false);
    }
  };

  const handleDeleteTenant = async (tenantId: number) => {
    const tenant = tenants.find((t) => t.id === tenantId);
    const confirmed = await confirm({
      title: t('delete_tenant_confirm_title', 'Delete Owner?'),
      message: tenant ? `Are you sure you want to delete "${tenant.name}" and all associated properties? This action cannot be undone.` : 'Are you sure you want to delete this owner?',
      confirmText: t('delete_tenant_confirm_button', 'Delete Owner'),
      variant: 'danger',
    });
    if (!confirmed) return;

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
        setTenants((prev) => prev.filter((t) => t.id !== tenantId));
        setProperties((prev) => prev.filter((p) => p.tenant_id !== tenantId));
        setShowDeleteTenantModal(null);
        showToast(t('tenant_deleted_success', 'Owner deleted successfully'), { type: 'success' });
      } else {
        const errorMsg = data.message || 'Failed to delete owner';
        showToast(errorMsg, { type: 'error' });
        setError(errorMsg);
      }
    } catch (err) {
      console.error('Failed to delete tenant:', err);
      showToast('Failed to delete owner', { type: 'error' });
      setError('Failed to delete owner');
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
          plan_type: editingTenant.plan_type || 'Growth',
          subscription_expires_at: editingTenant.subscription_expires_at || null,
          max_properties: editingTenant.max_properties,
          is_active: editingTenant.is_active,
          is_demo: editingTenant.is_demo,
          renewal_note: renewalNote.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setTenants((prev) =>
          prev.map((t) => (t.id === editingTenant.id ? editingTenant : t))
        );
        setShowEditTenantModal(false);
        setEditingTenant(null);
        setRenewalNote('');
        showToast('Owner details updated successfully!', { type: 'success' });
      } else {
        const msg = data.message || 'Failed to update tenant';
        setError(msg);
        showToast(msg, { type: 'error' });
      }
    } catch (err) {
      console.error('Failed to save tenant:', err);
      const msg = 'Failed to save tenant';
      setError(msg);
      showToast(msg, { type: 'error' });
    }
  };

  // Fetches the renewal trail whenever the Edit Owner drawer opens for a given tenant -
  // read-only, so a plain fetch on open is enough (no need to keep it live/polling).
  const loadRenewalHistory = async (tenantId: number) => {
    setRenewalHistoryLoading(true);
    try {
      const response = await fetch(`/php/api/router.php?action=get_tenant_subscription_history&tenant_id=${tenantId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      setRenewalHistory(data.success ? data.data : []);
    } catch (err) {
      console.error('Failed to load renewal history:', err);
      setRenewalHistory([]);
    } finally {
      setRenewalHistoryLoading(false);
    }
  };

  const [tenantToggleLoading, setTenantToggleLoading] = useState<number | null>(null);

  const toggleTenantStatus = async (tenantId: number, currentActiveState: boolean) => {
    const tenantToUpdate = tenants.find((t) => t.id === tenantId);
    if (!tenantToUpdate) return;
    const newActiveState = !currentActiveState;

    try {
      setTenantToggleLoading(tenantId);
      const response = await fetch('/php/api/router.php?action=update_tenant', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: tenantToUpdate.id,
          name: tenantToUpdate.name,
          slug: tenantToUpdate.slug,
          email: tenantToUpdate.email,
          phone: tenantToUpdate.phone,
          subscription_status: tenantToUpdate.subscription_status,
          is_active: newActiveState ? 1 : 0,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setTenants((prev) =>
          prev.map((t) => (t.id === tenantId ? { ...t, is_active: newActiveState ? 1 : 0 } : t))
        );
      } else {
        setError(data.message || 'Failed to toggle tenant status');
      }
    } catch (err) {
      console.error('Failed to toggle tenant status:', err);
      setError('Failed to toggle tenant status');
    } finally {
      setTenantToggleLoading(null);
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
      console.error('Failed to open property:', err);
      setError('Failed to open property');
    }
  };

  const loadTenantCredentials = async (tenantId: number) => {
    if (tenantCredsMap[tenantId] !== undefined) return;
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
        setRevealedPasscodeId(tenantId);
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
    setNewTenantNameTouched(true);
    setNewTenantSlugTouched(true);

    if (!newTenant.name.trim() || !newTenant.slug.trim()) {
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
        setNewTenantNameTouched(false);
        setNewTenantSlugTouched(false);

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
    // Uses the shared branded splash (25 Aug 2026) instead of a one-off
    // spinner+text block - this screen and TenantDashboard.tsx had each
    // rolled their own ad hoc "loading" UI instead of reusing LoadingScreen,
    // the one component that's actually supposed to be the app's loading
    // experience (previously only DataLoader.tsx used it) - reported as
    // "different kinds of loading screens throughout the site".
    return <LoadingScreen message="Loading platform..." />;
  }

  return (
    <div className="platform-property-management">
      {/* Success Toast */}
      {successMessage && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] bg-emerald-600 text-white px-6 py-3 rounded-lg shadow-2xl animate-pulse flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {successMessage}
        </div>
      )}

      {/* Main Content */}
      <div className="space-y-6">
        {error && (
          <div className="mb-6 flex gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
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

          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
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

          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
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
            <h2 className="platform-property-management__title text-xl font-semibold text-slate-900 dark:text-white">{t('tenants_and_properties_heading', 'Properties')}</h2>
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

          {/* Desktop View: Flowbite Standard DataTable */}
          <div className="hidden md:block bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-600 dark:text-slate-300">
                <thead className="text-2xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th scope="col" className="px-4 py-3 whitespace-nowrap">Owner Name</th>
                    <th scope="col" className="px-4 py-3 whitespace-nowrap">Properties & Slots</th>
                    <th scope="col" className="px-4 py-3 whitespace-nowrap">Status</th>
                    <th scope="col" className="px-4 py-3 whitespace-nowrap text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {tenants.map((tenant) => {
                    const tenantProperties = properties.filter((p) => {
                      if (p.tenant_id !== tenant.id) return false;
                      const type = (p as any).property_type;
                      return type !== 'MULTI_KEY_ROOM';
                    });
                    return (
                      <tr key={tenant.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                              <Building2 className="w-4.5 h-4.5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-900 dark:text-white text-xs">{tenant.name}</span>
                                <span className={`text-2xs font-semibold px-2 py-0.5 rounded ${
                                  tenant.plan_type === 'Starter'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                }`}>
                                  {tenant.plan_type || 'Growth'} Plan
                                </span>
                              </div>
                              <div className="text-2xs text-slate-400 dark:text-slate-500 font-mono">
                                /{tenant.slug} · ID: {tenant.id}
                                {tenant.subscription_expires_at && ` · Renews: ${formatDateDDMMYYYY(tenant.subscription_expires_at)}`}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-xs text-slate-700 dark:text-slate-200 font-medium">
                            {tenantProperties.length} {tenantProperties.length === 1 ? 'Property' : 'Properties'}
                          </div>
                          <div className="text-2xs text-slate-400 dark:text-slate-500">
                            Slots Used: {tenant.slots_used ?? tenantProperties.length}/{tenant.max_properties}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <ToggleSwitch
                            enabled={!!tenant.is_active}
                            onChange={() => toggleTenantStatus(tenant.id, !!tenant.is_active)}
                            disabled={tenantToggleLoading === tenant.id}
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => setViewPropertiesTenant(tenant)}
                              leftIcon={<Building2 className="w-3.5 h-3.5 shrink-0" />}
                            >
                              View Properties
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => window.open(`/artists_farm/${tenant.slug}/#dashboard`, '_blank')}
                              leftIcon={<ExternalLink className="w-3.5 h-3.5 shrink-0" />}
                            >
                              {t('visit_tenant_dashboard_tooltip', 'Open Business')}
                            </Button>
                            <Button
                              variant="edit"
                              size="sm"
                              onClick={() => handleManageTenant(tenant)}
                              leftIcon={<Pencil className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => handleDeleteTenant(tenant.id)}
                              title={t('delete_tenant_tooltip', 'Delete Tenant')}
                              className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile View: Small Screen Responsive Cards */}
          <div className="block md:hidden space-y-3">
            {tenants.map((tenant) => {
              const tenantProperties = properties.filter((p) => {
                if (p.tenant_id !== tenant.id) return false;
                const type = (p as any).property_type;
                return type !== 'MULTI_KEY_ROOM';
              });

              return (
                <div key={tenant.id} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-xs space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{tenant.name}</h3>
                        <p className="text-2xs text-slate-400 dark:text-slate-500 font-mono">/{tenant.slug} · ID: {tenant.id}</p>
                      </div>
                    </div>
                    <ToggleSwitch
                      enabled={!!tenant.is_active}
                      onChange={() => toggleTenantStatus(tenant.id, !!tenant.is_active)}
                      disabled={tenantToggleLoading === tenant.id}
                    />
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span>{tenantProperties.length} Properties</span>
                    <span>Slots: {tenant.slots_used ?? tenantProperties.length}/{tenant.max_properties}</span>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setViewPropertiesTenant(tenant)}
                      leftIcon={<Building2 className="w-3.5 h-3.5 shrink-0" />}
                      className="w-full justify-center"
                    >
                      View Properties
                    </Button>

                    <div className="flex items-center justify-between gap-1.5 pt-1">
                      <div className="flex items-center gap-1.5 grow flex-wrap">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => window.open(`/artists_farm/${tenant.slug}/#dashboard`, '_blank')}
                          leftIcon={<ExternalLink className="w-3.5 h-3.5 shrink-0" />}
                          className="grow sm:grow-0 justify-center"
                        >
                          {t('visit_tenant_dashboard_tooltip', 'Open Business')}
                        </Button>
                        <Button
                          variant="edit"
                          size="sm"
                          onClick={() => handleManageTenant(tenant)}
                          leftIcon={<Pencil className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
                        >
                          Edit
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setShowDeleteTenantModal(tenant.id)}
                        title={t('delete_tenant_tooltip', 'Delete Tenant')}
                        className="text-red-600 dark:text-red-400 hover:text-red-700 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Edit Tenant Drawer */}
      <Drawer
        open={showEditTenantModal && !!editingTenant}
        onClose={() => setShowEditTenantModal(false)}
        position="right"
        className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <Pencil className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white m-0">
              {t('edit_tenant_heading', 'Edit Tenant')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowEditTenantModal(false)}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {editingTenant && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                  {t('slug_label', 'Web Address')}
                </label>
                <Input
                  type="text"
                  value={editingTenant.slug}
                  disabled
                  readOnly
                  className="font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed opacity-80"
                />
                <p className="text-2xs text-slate-500 dark:text-slate-400 mt-1">
                  {t('slug_non_changeable_help', 'Web address cannot be changed once created.')}
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

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <label className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Demo / Sales Tenant
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Skips the Terms of Service acceptance gate - use for prospect walkthroughs
                      or QA/staging accounts, never a real onboarding customer.
                    </span>
                  </span>
                  <ToggleSwitch
                    enabled={!!editingTenant.is_demo}
                    onChange={(enabled) =>
                      setEditingTenant({ ...editingTenant, is_demo: enabled ? 1 : 0 })
                    }
                  />
                </label>
              </div>

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  SaaS Plan Tier
                </label>
                <StyledSelect
                  value={editingTenant.plan_type || 'Growth'}
                  onChange={(val) =>
                    setEditingTenant({
                      ...editingTenant,
                      plan_type: val,
                    })
                  }
                  options={[
                    { value: 'Starter', label: 'Starter Plan (₹1,499/mo - 1 Key)' },
                    { value: 'Growth', label: 'Growth Plan (₹4,999/mo - Up to 10 Keys)' },
                  ]}
                />
              </div>

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  Subscription Expiry / Renewal Date
                </label>
                <Input
                  type="date"
                  value={editingTenant.subscription_expires_at || ''}
                  onChange={(e) =>
                    setEditingTenant({
                      ...editingTenant,
                      subscription_expires_at: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  Renewal Note (optional)
                </label>
                <Input
                  type="text"
                  value={renewalNote}
                  onChange={(e) => setRenewalNote(e.target.value)}
                  placeholder="e.g. UPI Ref #302938291, ₹4,999 received via HDFC"
                  helperText="Recorded in the renewal history below alongside whatever plan/date change you save."
                />
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Renewal History
                  </span>
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {renewalHistoryLoading ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 px-3 py-3">Loading...</p>
                  ) : renewalHistory.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 px-3 py-3">
                      No renewal changes recorded yet - the first plan/date change or note you save here starts the trail.
                    </p>
                  ) : (
                    renewalHistory.map((h) => (
                      <div key={h.id} className="px-3 py-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-700 dark:text-slate-200">
                            {h.old_plan_type && h.old_plan_type !== h.new_plan_type
                              ? `${h.old_plan_type} → ${h.new_plan_type}`
                              : h.new_plan_type}
                          </span>
                          <span className="text-slate-400 dark:text-slate-500 shrink-0">
                            {formatDateDDMMYYYY(h.recorded_at)}
                          </span>
                        </div>
                        {h.new_expires_at && (
                          <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                            Renews: {formatDateDDMMYYYY(h.new_expires_at)}
                            {h.old_expires_at && h.old_expires_at !== h.new_expires_at
                              ? ` (was ${formatDateDDMMYYYY(h.old_expires_at)})`
                              : ''}
                          </p>
                        )}
                        {h.note && <p className="text-slate-500 dark:text-slate-400 mt-0.5 italic">"{h.note}"</p>}
                        {h.recorded_by && <p className="text-slate-400 dark:text-slate-500 mt-0.5">by {h.recorded_by}</p>}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Tenant Login Credentials Section */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <span className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-indigo-500" />
                    Tenant Login Credentials
                  </span>
                  {credsLoadingId === editingTenant.id && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                  )}
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 space-y-3">
                  {credsLoadingId === editingTenant.id ? (
                    <div className="py-4 text-center text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                      Loading credentials...
                    </div>
                  ) : tenantCredsMap[editingTenant.id] === 'not_found' || !tenantCredsMap[editingTenant.id] ? (
                    <div className="space-y-2.5">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        No login exists for this tenant yet.
                      </p>
                      {createLoginError && createLoginError.tenantId === editingTenant.id && (
                        <p className="text-xs text-red-600 dark:text-red-400">{createLoginError.message}</p>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        onClick={() => handleCreateTenantLogin(editingTenant.id)}
                        disabled={creatingLoginId === editingTenant.id}
                        leftIcon={creatingLoginId === editingTenant.id ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <KeyRound className="w-3.5 h-3.5 shrink-0" />}
                      >
                        {creatingLoginId === editingTenant.id ? 'Creating...' : 'Create Tenant Login'}
                      </Button>
                    </div>
                  ) : (
                    (() => {
                      const creds = tenantCredsMap[editingTenant.id] as { username: string; passcode: string; mustChangePasscode: boolean };
                      const isRevealed = revealedPasscodeId === editingTenant.id;
                      return (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                              <p className="text-2xs font-medium text-slate-500 dark:text-slate-400">Username (Phone)</p>
                              <div className="flex items-center justify-between mt-1">
                                <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">{creds.username}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard?.writeText(creds.username);
                                    showToast(t('copied_to_clipboard', 'Copied to clipboard'), { type: 'success' });
                                  }}
                                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                                  title="Copy username"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                              <p className="text-2xs font-medium text-slate-500 dark:text-slate-400">Passcode</p>
                              <div className="flex items-center justify-between mt-1">
                                <span className="font-mono text-xs font-bold text-slate-900 dark:text-white tracking-wider">
                                  {isRevealed ? creds.passcode : '••••••'}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setRevealedPasscodeId(isRevealed ? null : editingTenant.id)}
                                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                                    title={isRevealed ? 'Hide passcode' : 'Show passcode'}
                                  >
                                    {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-slate-500" />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard?.writeText(creds.passcode);
                                      showToast(t('copied_to_clipboard', 'Copied to clipboard'), { type: 'success' });
                                    }}
                                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                                    title="Copy passcode"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div>
                            {creds.mustChangePasscode ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-2xs font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                Temp passcode - not yet changed by tenant
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-2xs font-semibold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Tenant has set their own passcode
                              </span>
                            )}
                          </div>

                          {resetLoginError && resetLoginError.tenantId === editingTenant.id && (
                            <p className="text-xs text-red-600 dark:text-red-400">{resetLoginError.message}</p>
                          )}

                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <Button
                              type="button"
                              variant="secondary"
                              size="xs"
                              onClick={() => handleResetTenantLogin(editingTenant.id)}
                              disabled={resettingLoginId === editingTenant.id}
                              leftIcon={resettingLoginId === editingTenant.id ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <RotateCcw className="w-3.5 h-3.5 shrink-0" />}
                            >
                              {resettingLoginId === editingTenant.id ? 'Resetting...' : 'Reset Passcode'}
                            </Button>

                            <Button
                              type="button"
                              variant="secondary"
                              size="xs"
                              onClick={() => handleSendLoginInfoEmail(editingTenant.id, creds.username, editingTenant.email)}
                              disabled={sendingLoginId === editingTenant.id}
                              leftIcon={sendingLoginId === editingTenant.id ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Mail className="w-3.5 h-3.5 shrink-0" />}
                            >
                              {sendingLoginId === editingTenant.id ? 'Sending...' : 'Email Login'}
                            </Button>

                            <Button
                              type="button"
                              variant="secondary"
                              size="xs"
                              onClick={() => window.open(buildTenantWhatsAppShareUrl(editingTenant, creds), '_blank')}
                              leftIcon={<Share2 className="w-3.5 h-3.5 shrink-0" />}
                            >
                              WhatsApp
                            </Button>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowEditTenantModal(false)}
              >
                {t('cancel_button', 'Cancel')}
              </Button>
              <Button onClick={handleSaveTenant} variant="primary" size="sm">
                {t('save_button', 'Save')}
              </Button>
            </div>
          </>
        )}
      </Drawer>

      {/* Property Add/Edit Drawer */}
      <Drawer
        open={!!showPropertyModal && !!editingProperty}
        onClose={() => { if (!operationLoading) { setShowPropertyModal(null); setEditingProperty(null); } }}
        position="right"
        className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <Building2 className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white m-0">
              {showPropertyModal === 'add' ? t('add_property_heading', 'Add Property') : t('edit_property_heading', 'Edit Property')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => { if (!operationLoading) { setShowPropertyModal(null); setEditingProperty(null); } }}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {editingProperty && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('property_name_label', 'Property Name')}
                  <span
                    className="text-2xs font-semibold text-slate-400 dark:text-slate-500 cursor-help hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
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
                    const slug = showPropertyModal === 'add'
                      ? (!propertySlugManuallyEdited ? slugify(name) : editingProperty.slug)
                      : editingProperty.slug;
                    setEditingProperty({ ...editingProperty, name, slug });
                  }}
                />
              </div>

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('slug_label', 'Web Address')}
                </label>
                <Input
                  type="text"
                  value={editingProperty.slug}
                  disabled={showPropertyModal === 'edit'}
                  readOnly={showPropertyModal === 'edit'}
                  onChange={(e) => {
                    if (showPropertyModal === 'edit') return;
                    setPropertySlugManuallyEdited(true);
                    setEditingProperty({ ...editingProperty, slug: slugify(e.target.value) });
                  }}
                  className={`font-mono ${showPropertyModal === 'edit' ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed opacity-80' : ''}`}
                />
                {showPropertyModal === 'edit' && (
                  <p className="text-2xs text-slate-500 dark:text-slate-400 mt-1">
                    {t('slug_non_changeable_help', 'Web address cannot be changed once created.')}
                  </p>
                )}
              </div>

              {/* Public Demo Mode toggle only ever shows on the ONE property that already has it
                  on (removed from every other property's edit form, 26 Aug 2026 explicit request)
                  - there's exactly one public-demo property sitewide, already set, so exposing an
                  on-switch for it on every property risked someone flipping it on by mistake.
                  Still shown (and turn-off-able) here for the one property that already has it. */}
              {!!editingProperty.is_public_demo && (
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
              )}

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
                        <p className="font-medium text-slate-900 dark:text-white">{t('multi_key_property_option', 'Multi-Key Property')}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">{t('multi_key_property_hint', 'Multiple rooms, suites, or independent units (villas, cottages) with shared staff & expenses')}</p>
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
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => { setShowPropertyModal(null); setEditingProperty(null); }}
                disabled={operationLoading}
              >
                {t('cancel_button', 'Cancel')}
              </Button>
              <Button
                onClick={showPropertyModal === 'add' ? handleAddProperty : handleEditProperty}
                disabled={operationLoading}
                variant="primary"
                size="sm"
                leftIcon={operationLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : undefined}
              >
                {operationLoading ? 'Saving...' : (showPropertyModal === 'add' ? t('add_button', 'Add') : t('update_button', 'Update'))}
              </Button>
            </div>
          </>
        )}
      </Drawer>

      {/* Delete Property Confirmation Drawer */}
      <Drawer
        open={!!showDeletePropertyModal}
        onClose={() => { if (!operationLoading) { setShowDeletePropertyModal(null); setDeleteConfirmText(''); setError(null); } }}
        position="right"
        className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 flex items-center justify-center text-red-600 dark:text-red-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white m-0">
              {t('delete_property_heading', 'Delete Property?')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => { if (!operationLoading) { setShowDeletePropertyModal(null); setDeleteConfirmText(''); setError(null); } }}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-sm mb-2 font-semibold text-red-600 dark:text-red-400 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {t('deletion_consequences_label', 'Deletion Consequences for this Property:')}
          </p>
          <ul className="text-sm text-slate-600 dark:text-slate-400 list-disc list-inside space-y-1">
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
            className="font-mono"
          />

          {error && (
            <Alert color="failure" icon={AlertCircle} className="mt-4 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300">
              <p className="text-sm">{error}</p>
            </Alert>
          )}
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => { setShowDeletePropertyModal(null); setDeleteConfirmText(''); setError(null); }}
            disabled={operationLoading}
          >
            {t('cancel_button', 'Cancel')}
          </Button>
          <Button
            onClick={() => {
              handleDeleteProperty(showDeletePropertyModal);
              setDeleteConfirmText('');
            }}
            disabled={operationLoading || deleteConfirmText !== 'DELETE'}
            variant="danger"
            size="sm"
            leftIcon={operationLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : undefined}
          >
            {operationLoading ? 'Deleting...' : t('delete_property_button', 'Delete Property')}
          </Button>
        </div>
      </Drawer>

      {/* Delete Tenant Confirmation Drawer */}
      <Drawer
        open={!!showDeleteTenantModal}
        onClose={() => { if (!operationLoading) { setShowDeleteTenantModal(null); setDeleteConfirmText(''); setError(null); } }}
        position="right"
        className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 flex items-center justify-center text-red-600 dark:text-red-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white m-0">
              {t('delete_tenant_heading', 'Delete Tenant?')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => { if (!operationLoading) { setShowDeleteTenantModal(null); setDeleteConfirmText(''); setError(null); } }}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-sm mb-2 font-semibold text-red-600 dark:text-red-400 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {t('deletion_consequences_label', 'Deletion Consequences for this Property:').replace('this Property', 'this Tenant')}
          </p>
          <ul className="text-sm text-slate-600 dark:text-slate-400 list-disc list-inside space-y-1">
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
            className="font-mono"
          />

          {error && (
            <Alert color="failure" icon={AlertCircle} className="mt-4 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300">
              <p className="text-sm">{error}</p>
            </Alert>
          )}
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => { setShowDeleteTenantModal(null); setDeleteConfirmText(''); setError(null); }}
            disabled={operationLoading}
          >
            {t('cancel_button', 'Cancel')}
          </Button>
          <Button
            onClick={() => {
              handleDeleteTenant(showDeleteTenantModal);
              setDeleteConfirmText('');
            }}
            disabled={operationLoading || deleteConfirmText !== 'DELETE'}
            variant="danger"
            size="sm"
            leftIcon={operationLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : undefined}
          >
            {operationLoading ? 'Deleting...' : t('delete_tenant_button', 'Delete Tenant')}
          </Button>
        </div>
      </Drawer>

      {/* Add Tenant Drawer */}
      <Drawer
        open={showAddTenantModal}
        onClose={() => { if (!operationLoading) setShowAddTenantModal(false); }}
        position="right"
        className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 flex items-center justify-center text-sky-600 dark:text-sky-400">
              {newTenantCredentials ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Plus className="w-4 h-4" />}
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white m-0">
              {newTenantCredentials ? t('tenant_created_heading', 'Tenant Created') : t('add_new_tenant_heading', 'Add New Tenant')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => { if (!operationLoading) setShowAddTenantModal(false); }}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {newTenantCredentials ? (
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
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
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <Input
                  label={t('tenant_name_label', 'Tenant Name *')}
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
                  onBlur={() => setNewTenantNameTouched(true)}
                  placeholder={t('tenant_name_placeholder', 'e.g., Vrikshawan')}
                  required
                  error={newTenantNameTouched && !newTenant.name.trim() ? 'Tenant name is required' : undefined}
                />
              </div>

              <div>
                <Input
                  label={t('url_slug_label', 'URL Slug *')}
                  type="text"
                  value={newTenant.slug}
                  onChange={(e) => {
                    setSlugManuallyEdited(true);
                    setNewTenant({ ...newTenant, slug: slugify(e.target.value) });
                  }}
                  onBlur={() => setNewTenantSlugTouched(true)}
                  className="font-mono"
                  placeholder={t('tenant_slug_placeholder', 'e.g., vrikshawan')}
                  required
                  error={newTenantSlugTouched && !newTenant.slug.trim() ? 'URL slug is required' : undefined}
                  helperText={t('url_slug_hint', "Auto-filled from the name. Used in the property URL - not the login username (that's the phone number below).")}
                />
              </div>

              <div>
                <Input
                  label={t('email_label', 'Email')}
                  type="email"
                  value={newTenant.email}
                  onChange={(e) =>
                    setNewTenant({ ...newTenant, email: e.target.value })
                  }
                  placeholder={t('email_placeholder', 'tenant@example.com')}
                />
              </div>

              <div>
                <Input
                  label={t('tenant_phone_login_username_label', 'Phone (also becomes their login username)')}
                  type="tel"
                  value={newTenant.phone}
                  onChange={(e) =>
                    setNewTenant({ ...newTenant, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })
                  }
                  className="font-mono"
                  placeholder={t('phone_placeholder', '10-digit mobile number')}
                />
              </div>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850">
          {newTenantCredentials ? (
            <Button
              onClick={() => {
                setShowAddTenantModal(false);
                setNewTenantCredentials(null);
                setNewTenantNameTouched(false);
                setNewTenantSlugTouched(false);
              }}
              variant="primary"
              size="sm"
              block
            >
              {t('done_button', 'Done')}
            </Button>
          ) : (
            <>
              <Button
                onClick={() => {
                  setShowAddTenantModal(false);
                  setNewTenant({ name: '', slug: '', email: '', phone: '' });
                  setSlugManuallyEdited(false);
                  setNewTenantNameTouched(false);
                  setNewTenantSlugTouched(false);
                }}
                variant="secondary"
                size="sm"
              >
                {t('cancel_button', 'Cancel')}
              </Button>
              <Button
                onClick={handleAddTenant}
                disabled={operationLoading}
                variant="primary"
                size="sm"
                leftIcon={operationLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : undefined}
              >
                {operationLoading ? 'Creating...' : t('create_button', 'Create')}
              </Button>
            </>
          )}
        </div>
      </Drawer>

      {/* View Properties Right Drawer */}
      <Drawer
        position="right"
        open={!!viewPropertiesTenant}
        onClose={() => setViewPropertiesTenant(null)}
        className="w-full max-w-xl md:max-w-2xl z-[60] z-60 p-0 bg-white dark:bg-slate-900 shadow-2xl flex flex-col justify-between"
      >
        {viewPropertiesTenant && (() => {
          const tenantProperties = properties.filter((p) => {
            if (p.tenant_id !== viewPropertiesTenant.id) return false;
            const type = (p as any).property_type;
            return type !== 'MULTI_KEY_ROOM';
          });
          const slotsUsed = viewPropertiesTenant.slots_used ?? tenantProperties.length;

          return (
            <div className="flex flex-col h-full">
              <div className="px-4 py-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-850 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                    <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base truncate">
                      {viewPropertiesTenant.name} Properties
                    </h3>
                    <p className="text-2xs sm:text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                      /{viewPropertiesTenant.slug} · {tenantProperties.length} {tenantProperties.length === 1 ? 'Property' : 'Properties'} · Slots: {slotsUsed}/{viewPropertiesTenant.max_properties}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewPropertiesTenant(null)}
                  className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
                {tenantProperties.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-xs">
                    No properties found for this tenant.
                  </div>
                ) : (
                  tenantProperties.map((prop) => {
                    const isRoom = (prop as any).property_type === 'MULTI_KEY_ROOM';
                    const isMultiKey = (prop as any).property_type === 'MULTI_KEY';
                    const modState = propertyModules[prop.id];
                    const kitchenEnabled = modState ? modState.kitchen : (prop as any).kitchen_module_enabled !== false;
                    const childRooms = isMultiKey
                      ? properties.filter((r) => (r as any).property_type === 'MULTI_KEY_ROOM' && (r as any).parent_property_id === prop.id)
                      : [];

                    return (
                      <div
                        key={prop.id}
                        className="bg-white dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-700 space-y-3 shadow-2xs"
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-slate-900 dark:text-white text-sm">{prop.name}</h4>
                              <span className={`text-2xs font-semibold px-2 py-0.5 rounded ${
                                isMultiKey
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
                                  : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                              }`}>
                                {isMultiKey ? t('multi_key_badge', 'Multi-Key') : t('single_badge', 'Single')}
                              </span>
                              {isMultiKey && (
                                <span className="text-2xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                  {childRooms.length} {childRooms.length === 1 ? 'Room' : 'Rooms'}
                                </span>
                              )}
                            </div>
                            <p className="text-2xs text-slate-400 dark:text-slate-500 font-mono">/{prop.slug} · ID: {prop.id}</p>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-2xs text-slate-500 dark:text-slate-400">{t('active_toggle_label', 'Active:')}</span>
                              <ToggleSwitch
                                enabled={prop.status === 'active'}
                                onChange={() => togglePropertyStatus(prop.id, prop.status)}
                                disabled={propertyToggleLoading === prop.id}
                              />
                            </div>
                            {!isRoom && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-2xs text-slate-500 dark:text-slate-400">{t('kitchen_toggle_label', 'Kitchen:')}</span>
                                <ToggleSwitch
                                  enabled={kitchenEnabled}
                                  onChange={() => toggleKitchenModule(prop.id, kitchenEnabled)}
                                  disabled={moduleToggleLoading === `${prop.id}-kitchen`}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions row with explicit Telegram button */}
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSelectedTelegramProperty(prop)}
                            leftIcon={<TelegramIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                            className="border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 font-medium"
                          >
                            Telegram
                          </Button>

                          <div className="flex items-center gap-1.5">
                            <Button
                              onClick={() => openPropertyWithAutoLogin(prop, viewPropertiesTenant.slug)}
                              variant="secondary"
                              size="sm"
                              title={t('open_property_tab_tooltip', 'Open Property in New Tab')}
                              leftIcon={<ExternalLink className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                            >
                              Open Property
                            </Button>
                            <Button
                              onClick={() => {
                                setEditingProperty(prop);
                                setIsEditingBotToken(false);
                                setShowPropertyModal('edit');
                              }}
                              variant="edit"
                              size="sm"
                              title={t('edit_property_tooltip', 'Edit Property')}
                              leftIcon={<Pencil className="w-3.5 h-3.5 shrink-0" />}
                            >
                              Edit
                            </Button>
                            <Button
                              onClick={() => handleDeleteProperty(prop.id)}
                              variant="ghost"
                              size="xs"
                              title={t('delete_property_tooltip', 'Delete Property')}
                              className="text-red-600 dark:text-red-400 hover:text-red-700"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                            </Button>
                          </div>
                        </div>


                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end bg-gray-50 dark:bg-gray-850">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setViewPropertiesTenant(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          );
        })()}
      </Drawer>

      {/* Property Telegram Modal (Opens centered on top of drawer per Flowbite Modal nested dialog rule) */}
      {selectedTelegramProperty && (
        <Modal
          show={!!selectedTelegramProperty}
          onClose={() => setSelectedTelegramProperty(null)}
          size="2xl"
          popup
          dismissible
          className="z-9999"
        >
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                  <TelegramIcon className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    Telegram Setup — {selectedTelegramProperty.name}
                  </h3>
                  <p className="text-2xs text-gray-500 dark:text-gray-400 font-mono">
                    /{selectedTelegramProperty.slug}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTelegramProperty(null)}
                className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-4">
              {/* Telegram Bot Token Input (Root Admin sets this centrally; see CLAUDE.md's
                  Telegram Onboarding section - "white-glove" is internal terminology only,
                  never shown in the UI since no client understands it, per 27 Aug 2026 request) */}
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-4 border border-slate-200 dark:border-slate-700 space-y-2">
                <label className="block text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
                  Telegram Bot Token
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={selectedTelegramProperty.telegram_bot_token || ''}
                    onChange={(e) => setSelectedTelegramProperty({ ...selectedTelegramProperty, telegram_bot_token: e.target.value })}
                    placeholder="Enter Bot Token (e.g. 7182930491:AAH...)"
                    className="w-full font-mono text-xs"
                    disabled={!!selectedTelegramProperty.telegram_bot_token && !isEditingBotToken}
                  />
                  {!selectedTelegramProperty.telegram_bot_token || isEditingBotToken ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => saveBotTokenForProperty(selectedTelegramProperty)}
                      disabled={isSavingBotToken || !selectedTelegramProperty.telegram_bot_token?.trim()}
                      className="shrink-0"
                    >
                      {isSavingBotToken ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsEditingBotToken(true)}
                      className="shrink-0"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
                <p className="text-2xs text-slate-500 dark:text-slate-400">
                  Custom Bot Token for this property. Leave empty to use the system default bot.
                </p>
              </div>

              {/* Telegram Custom Template Toggle */}
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                <label className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider">
                      Custom Telegram Template Messages
                    </span>
                    <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Enable property-specific customized notification templates for KOT orders, checkout vouchers & alerts.
                    </p>
                  </div>
                  <ToggleSwitch
                    enabled={!!selectedTelegramProperty.telegram_template_customization_enabled}
                    onChange={(enabled) => toggleTelegramTemplateCustomization(selectedTelegramProperty, enabled)}
                  />
                </label>
              </div>

              {/* Group Pairing & Channel Panel */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <TelegramPairingPanel
                  key={`${selectedTelegramProperty.slug}-${botTokenSaveCount}`}
                  propertySlug={selectedTelegramProperty.slug}
                  propertyName={selectedTelegramProperty.name}
                  kitchenModuleEnabled={
                    propertyModules[selectedTelegramProperty.id]
                      ? propertyModules[selectedTelegramProperty.id].kitchen
                      : (selectedTelegramProperty as any).kitchen_module_enabled !== false
                  }
                />
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-gray-200 dark:border-gray-700">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedTelegramProperty(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

