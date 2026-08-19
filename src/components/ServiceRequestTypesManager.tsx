import React, { useState, useEffect, useCallback } from 'react';
import { Card, Alert } from 'flowbite-react';
import { Bell, Plus, Trash2, Loader2, Pencil, Check, X, Globe } from 'lucide-react';
import {
  SystemServiceRequestCatalogItem,
  fetchSystemServiceRequestCatalogFromDB,
  saveSystemServiceRequestTypeInDB,
  deleteSystemServiceRequestTypeFromDB,
} from '../services/api';
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

export const ServiceRequestTypesManager: React.FC = () => {
  const { confirm } = useConfirm();

  const [items, setItems] = useState<SystemServiceRequestCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
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

  const loadItems = useCallback(async () => {
    setLoading(true);
    const data = await fetchSystemServiceRequestCatalogFromDB();
    setItems(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const categories = Array.from(new Set(items.map((item) => item.category)));
  const availableCategories = Array.from(new Set([...STANDARD_CATEGORIES, ...categories]));

  const handleStartEdit = (item: SystemServiceRequestCatalogItem) => {
    setEditingTypeId(item.id);
    setEditingLabel(item.label);
    setEditingCategory(item.category);
  };

  const handleCancelEdit = () => {
    setEditingTypeId(null);
    setEditingLabel('');
    setEditingCategory(STANDARD_CATEGORIES[0]);
  };

  const handleInlineSave = async (item: SystemServiceRequestCatalogItem) => {
    if (!editingLabel.trim() || !editingCategory.trim()) return;
    setUpdatingTypeId(item.id);
    const ok = await saveSystemServiceRequestTypeInDB({
      id: item.id,
      category: editingCategory.trim(),
      label: editingLabel.trim(),
    });
    setUpdatingTypeId(null);
    setEditingTypeId(null);
    if (ok) {
      flash('success', 'Request type updated');
      loadItems();
    } else {
      flash('error', 'Failed to update request type');
    }
  };

  const handleSaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = newTypeLabel.trim();
    const category = newTypeCategory.trim();
    if (!label || !category) return;
    setSavingType(true);

    const ok = await saveSystemServiceRequestTypeInDB({ category, label });
    setSavingType(false);
    if (ok) {
      flash('success', 'Request type added â€” changes cascade to all properties immediately');
      setNewTypeLabel('');
      setNewTypeCategory(STANDARD_CATEGORIES[0]);
      loadItems();
    } else {
      flash('error', 'Failed to add request type');
    }
  };

  const handleDeleteType = async (id: number) => {
    const confirmed = await confirm({
      title: 'Remove Global Request Type',
      message: 'This will remove this service request type from ALL properties. Continue?',
      confirmText: 'Remove',
      variant: 'danger',
    });
    if (!confirmed) return;
    setDeletingTypeId(id);
    const ok = await deleteSystemServiceRequestTypeFromDB(id);
    setDeletingTypeId(null);
    if (ok) {
      flash('success', 'Request type removed globally');
      loadItems();
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
      <Card className="border-gray-200 dark:border-gray-700">
        <div className="service-request-types-manager__header flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="service-request-types-manager__heading text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              {t('service_request_types_heading', 'Service Request Types')}
            </h2>
            <p className="service-request-types-manager__subtitle text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('service_request_types_description', 'Global service request types. Changes cascade to all properties instantly.')}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 px-3 py-1.5 rounded-full shrink-0">
            <Globe className="w-3.5 h-3.5" />
            Global Catalog
          </div>
        </div>

        <form onSubmit={handleSaveType} className="app-form app-form--save-request-type service-request-types-manager__form grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 border-b border-gray-200 dark:border-gray-700 pb-4 mb-4 items-end">
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
            <label className="service-request-types-manager__category-label block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
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
            disabled={savingType || !newTypeLabel.trim()}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            {savingType ? t('adding_button', 'Adding...') : t('add_type_button', 'Add to Catalog')}
          </Button>
        </form>

        {notice && (
          <Alert color={notice.type === 'success' ? 'success' : 'failure'} className="mb-4">
            <span>{notice.text}</span>
          </Alert>
        )}

        {items.length === 0 ? (
          <div className="text-center py-10 text-slate-500 dark:text-slate-400 text-sm">
            No service request types in the global catalog yet. Add one above.
          </div>
        ) : (
          <div className="service-request-types-manager__types-grid grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[55vh] overflow-y-auto pr-1">
            {availableCategories.filter((c) => items.some((item) => item.category === c)).map((category) => (
              <div key={category}>
                <h4 className="service-request-types-manager__category-heading text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">{category}</h4>
                <div className="service-request-types-manager__type-list space-y-1.5">
                  {items.filter((item) => item.category === category).map((item) => (
                    <div key={item.id} className="service-request-types-manager__type-item flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700">
                      {editingTypeId === item.id ? (
                        <div className="service-request-types-manager__type-item-edit flex items-center gap-2 w-full">
                          <input
                            type="text"
                            value={editingLabel}
                            onChange={(e) => setEditingLabel(e.target.value)}
                            className="service-request-types-manager__edit-input flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="Service label"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleInlineSave(item);
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleInlineSave(item)}
                            disabled={updatingTypeId === item.id}
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
                          <span className="service-request-types-manager__type-label text-sm text-slate-800 dark:text-slate-100 font-medium">{item.label}</span>
                          <div className="service-request-types-manager__type-actions flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => handleStartEdit(item)}
                              title="Edit label"
                              className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-1 h-auto"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => handleDeleteType(item.id)}
                              disabled={deletingTypeId === item.id}
                              title="Remove from global catalog"
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
      </Card>
    </div>
  );
};
