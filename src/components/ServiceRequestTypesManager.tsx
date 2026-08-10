import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Plus, Trash2, Building2, Loader } from 'lucide-react';
import {
  ServiceRequestType,
  fetchServiceRequestTypesFromDB,
  saveServiceRequestTypeInDB,
  deleteServiceRequestTypeInDB,
} from '../services/api';
import { useConfirm } from './ConfirmDialogContext';
import { StyledSelect } from './StyledSelect';
import { Button } from './Button';
import { t } from '../i18n/en';

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
  const [newTypeCategory, setNewTypeCategory] = useState('');
  const [savingType, setSavingType] = useState(false);
  const [deletingTypeId, setDeletingTypeId] = useState<number | null>(null);

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

  const categories = Array.from(new Set(requestTypes.map((rt) => rt.category)));

  const handleSaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPropertyId) return;
    const label = newTypeLabel.trim();
    const category = newTypeCategory.trim();
    if (!label || !category) return;
    setSavingType(true);
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
      setNewTypeCategory('');
      loadTypes();
    } else {
      flash('error', 'Failed to add request type');
    }
  };

  const handleDeleteType = async (id: number) => {
    const confirmed = await confirm({
      title: 'Remove Request Type',
      message: 'Remove this custom request type?',
      confirmText: 'Remove',
      variant: 'danger',
    });
    if (!confirmed) return;
    setDeletingTypeId(id);
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
      <div className="flex items-center justify-center py-16 text-slate-500 dark:text-slate-400">
        <Loader className="w-5 h-5 animate-spin mr-2" /> {t('loading_default_message', 'Loading...')}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-blue-600" />
              {t('service_request_types_heading', 'Service Request Types')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t('service_request_types_description', 'Per-property quick-pick list shown in the Guest Service Requests page.')}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
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

        <form onSubmit={handleSaveType} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 border-b border-slate-200 dark:border-slate-700 pb-4 mb-4 items-end">
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">{t('type_label_field', 'Label')}</label>
            <input
              type="text"
              value={newTypeLabel}
              onChange={(e) => setNewTypeLabel(e.target.value)}
              placeholder={t('type_label_placeholder', 'e.g. Pet Friendly Supplies')}
              className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">{t('type_category_field', 'Category')}</label>
            <input
              type="text"
              value={newTypeCategory}
              onChange={(e) => setNewTypeCategory(e.target.value)}
              list="service-type-categories"
              placeholder={t('type_category_placeholder', 'e.g. Housekeeping')}
              className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
            />
            <datalist id="service-type-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
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
            className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-semibold border ${
              notice.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700'
                : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700'
            }`}
          >
            {notice.text}
          </div>
        )}

        {loadingTypes ? (
          <div className="flex items-center justify-center py-10 text-slate-500 dark:text-slate-400">
            <Loader className="w-5 h-5 animate-spin mr-2" /> {t('loading_default_message', 'Loading...')}
          </div>
        ) : requestTypes.length === 0 ? (
          <div className="text-center py-10 text-slate-500 dark:text-slate-400 text-sm">
            {t('no_service_request_types', 'No request types configured for this property yet.')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[55vh] overflow-y-auto pr-1">
            {categories.map((category) => (
              <div key={category}>
                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">{category}</h4>
                <div className="space-y-1.5">
                  {requestTypes.filter((rt) => rt.category === category).map((rt) => (
                    <div key={rt.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700">
                      <span className="text-sm text-slate-800 dark:text-slate-100 font-medium">{rt.label}</span>
                      {rt.isSystemDefault ? (
                        <span className="text-[10px] uppercase tracking-wide font-bold text-slate-400 dark:text-slate-500 shrink-0">{t('system_default_badge', 'Default')}</span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleDeleteType(rt.id)}
                          disabled={deletingTypeId === rt.id}
                          className="text-red-500 hover:text-red-700 dark:hover:text-red-400 p-1 h-auto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
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
