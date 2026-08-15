import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Plus, Trash2, Building2, Loader2, Pencil, Check, X } from 'lucide-react';
import {
  ServiceRequestType,
  fetchServiceRequestTypesFromDB,
  saveServiceRequestTypeInDB,
  deleteServiceRequestTypeInDB,
} from '../services/api';
import { DEFAULT_SERVICE_REQUEST_TYPES } from './ServiceRequestsManagement';
import { useConfirm } from './ConfirmDialogContext';
import { StyledSelect } from './StyledSelect';
import { Button } from './Button';
import { Input } from './Input';
import { t } from '../i18n/en';

const STANDARD_CATEGORIES = [
  'Housekeeping',
  'Food & Beverage',
  'Maintenance',
  'Amenities On Request',
  'Front Desk & Services',
  'General',
];

interface PropertyOption {
  id: number;
  name: string;
  slug: string;
}

export const ServiceRequestTypesManager: React.FC = () => {
  const { confirm } = useConfirm();

  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [requestTypes, setRequestTypes] = useState<ServiceRequestType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [newTypeCategory, setNewTypeCategory] = useState(STANDARD_CATEGORIES[0]);
  const [savingType, setSavingType] = useState(false);
  const [deletingTypeId, setDeletingTypeId] = useState<number | null>(null);

  // Inline edit state
  const [editingTypeId, setEditingTypeId] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [editingCategory, setEditingCategory] = useState(STANDARD_CATEGORIES[0]);
  const [updatingTypeId, setUpdatingTypeId] = useState<number | null>(null);

  const flash = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 4000);
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/php/api/router.php?action=get_all_properties', { credentials: 'include' });
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          const props = (data.data as any[])
            .filter((p) => p.property_type !== 'MULTI_KEY_ROOM')
            .map((p) => ({ id: Number(p.id), name: p.name, slug: p.slug }));
          setProperties(props);
          if (props.length > 0 && !selectedPropertyId) {
            setSelectedPropertyId(String(props[0].id));
          }
        }
      } catch (err) {
        console.error('Failed to load properties:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadTypes = useCallback(async () => {
    if (!selectedPropertyId) {
      setRequestTypes([]);
      return;
    }
    setLoadingTypes(true);
    const data = await fetchServiceRequestTypesFromDB(Number(selectedPropertyId));
    setRequestTypes(data);
    setLoadingTypes(false);
  }, [selectedPropertyId]);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);

  const isUsingDefaults = requestTypes.length === 0;

  const effectiveTypes: ServiceRequestType[] = isUsingDefaults
    ? DEFAULT_SERVICE_REQUEST_TYPES.map((d, i) => ({
        id: -i - 1,
        propertyId: Number(selectedPropertyId) || 0,
        typeId: d.type_id,
        category: d.category,
        label: d.label,
        displayOrder: i,
        isSystemDefault: true,
      }))
    : requestTypes;

  const availableCategories = Array.from(
    new Set([...STANDARD_CATEGORIES, ...effectiveTypes.map((rt) => rt.category)])
  );

  const categories = Array.from(new Set(effectiveTypes.map((rt) => rt.category)));

  const handleStartEdit = (rt: ServiceRequestType) => {
    setEditingTypeId(rt.id);
    setEditingLabel(rt.label);
    setEditingCategory(rt.category);
  };

  const handleCancelEdit = () => {
    setEditingTypeId(null);
    setEditingLabel('');
    setEditingCategory(STANDARD_CATEGORIES[0]);
  };

  const handleInlineSave = async (rt: ServiceRequestType) => {
    if (!selectedPropertyId || !editingLabel.trim() || !editingCategory.trim()) return;
    setUpdatingTypeId(rt.id);

    if (isUsingDefaults) {
      // Auto-persist defaults first, applying user's edited label/category to the target item
      for (const item of DEFAULT_SERVICE_REQUEST_TYPES) {
        const isTarget = item.type_id === rt.typeId;
        await saveServiceRequestTypeInDB(
          {
            type_id: item.type_id,
            category: isTarget ? editingCategory.trim() : item.category,
            label: isTarget ? editingLabel.trim() : item.label,
          },
          Number(selectedPropertyId)
        );
      }
    } else {
      await saveServiceRequestTypeInDB(
        {
          type_id: rt.typeId,
          category: editingCategory.trim(),
          label: editingLabel.trim(),
        },
        Number(selectedPropertyId)
      );
    }

    setUpdatingTypeId(null);
    setEditingTypeId(null);
    flash('success', 'Request type updated');
    loadTypes();
  };

  const handleSaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPropertyId) return;
    const label = newTypeLabel.trim();
    const category = newTypeCategory.trim();
    if (!label || !category) return;
    setSavingType(true);

    if (isUsingDefaults) {
      for (const item of DEFAULT_SERVICE_REQUEST_TYPES) {
        await saveServiceRequestTypeInDB(
          { type_id: item.type_id, category: item.category, label: item.label },
          Number(selectedPropertyId)
        );
      }
    }

    const ok = await saveServiceRequestTypeInDB(
      {
        type_id: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
        category,
        label,
      },
      Number(selectedPropertyId),
    );
    setSavingType(false);
    if (ok) {
      flash('success', 'Request type added');
      setNewTypeLabel('');
      setNewTypeCategory(STANDARD_CATEGORIES[0]);
      loadTypes();
    } else {
      flash('error', 'Failed to add request type');
    }
  };

  const handleDeleteType = async (id: number, typeId?: string) => {
    const confirmed = await confirm({
      title: 'Remove Request Type',
      message: 'Remove this request type for this property?',
      confirmText: 'Remove',
      variant: 'danger',
    });
    if (!confirmed) return;
    setDeletingTypeId(id);

    if (isUsingDefaults && typeId) {
      // Auto-persist all defaults except the one being deleted
      for (const item of DEFAULT_SERVICE_REQUEST_TYPES) {
        if (item.type_id !== typeId) {
          await saveServiceRequestTypeInDB(
            { type_id: item.type_id, category: item.category, label: item.label },
            Number(selectedPropertyId)
          );
        }
      }
      setDeletingTypeId(null);
      flash('success', 'Request type removed');
      loadTypes();
      return;
    }

    const ok = await deleteServiceRequestTypeInDB(id, Number(selectedPropertyId));
    setDeletingTypeId(null);
    if (ok) {
      flash('success', 'Request type removed');
      loadTypes();
    } else {
      flash('error', 'Failed to remove request type');
    }
  };

  if (loading) {
    return (
      <div className="service-request-types-manager__loading flex items-center justify-center py-16 text-slate-500 dark:text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t('loading_default_message', 'Loading...')}
      </div>
    );
  }

  return (
    <div className="service-request-types-manager space-y-6 max-w-3xl">
      <div className="service-request-types-manager__card bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="service-request-types-manager__header flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="service-request-types-manager__heading text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-blue-600" />
              {t('service_request_types_heading', 'Service Request Types')}
            </h2>
            <p className="service-request-types-manager__subtitle text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t('service_request_types_description', 'Per-property quick-pick list shown in the Guest Service Requests page.')}
            </p>
          </div>
          <div className="service-request-types-manager__property-picker flex items-center gap-2 text-sm shrink-0">
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="w-56">
              <StyledSelect
                value={selectedPropertyId}
                onChange={setSelectedPropertyId}
                options={properties.map((p) => ({ value: String(p.id), label: p.name }))}
              />
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveType} className="app-form app-form--save-request-type service-request-types-manager__form grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 border-b border-slate-200 dark:border-slate-700 pb-4 mb-4 items-end">
          <div>
            <Input
              label={t('type_label_field', 'Label')}
              type="text"
              value={newTypeLabel}
              onChange={(e) => setNewTypeLabel(e.target.value)}
              placeholder={t('type_label_placeholder', 'e.g. Pet Friendly Supplies')}
            />
          </div>
          <div>
            <label className="service-request-types-manager__category-label block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t('type_category_field', 'Category')}
            </label>
            <StyledSelect
              value={newTypeCategory}
              onChange={setNewTypeCategory}
              options={availableCategories.map((c) => ({ value: c, label: c }))}
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={savingType || !selectedPropertyId}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            {savingType ? t('adding_button', 'Adding...') : t('add_type_button', 'Add Request Type')}
          </Button>
        </form>

        {notice && (
          <div
            className={`service-request-types-manager__notice mb-4 px-4 py-2.5 rounded-xl text-sm font-semibold border ${
              notice.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700'
                : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700'
            }`}
          >
            {notice.text}
          </div>
        )}

        {loadingTypes ? (
          <div className="service-request-types-manager__types-loading flex items-center justify-center py-10 text-slate-500 dark:text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t('loading_default_message', 'Loading...')}
          </div>
        ) : (
          <div className="service-request-types-manager__types-grid grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[55vh] overflow-y-auto pr-1">
            {categories.map((category) => (
              <div key={category}>
                <h4 className="service-request-types-manager__category-heading text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">{category}</h4>
                <div className="service-request-types-manager__type-list space-y-1.5">
                  {effectiveTypes.filter((rt) => rt.category === category).map((rt) => (
                    <div key={rt.id} className="service-request-types-manager__type-item flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700">
                      {editingTypeId === rt.id ? (
                        <div className="service-request-types-manager__type-item-edit flex items-center gap-2 w-full">
                          <input
                            type="text"
                            value={editingLabel}
                            onChange={(e) => setEditingLabel(e.target.value)}
                            className="service-request-types-manager__edit-input flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Service label"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleInlineSave(rt);
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleInlineSave(rt)}
                            disabled={updatingTypeId === rt.id}
                            className="service-request-types-manager__edit-save p-1 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                            title="Save"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="service-request-types-manager__edit-cancel p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="service-request-types-manager__type-label text-sm text-slate-800 dark:text-slate-100 font-medium">{rt.label}</span>
                          <div className="service-request-types-manager__type-actions flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => handleStartEdit(rt)}
                              title="Edit service text"
                              className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-1 h-auto"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => handleDeleteType(rt.id, rt.typeId)}
                              disabled={deletingTypeId === rt.id}
                              title="Delete service type"
                              className="text-red-500 hover:text-red-700 dark:hover:text-red-400 p-1 h-auto"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
