import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Pencil, Trash2, Tag, AlertCircle, Loader2, CheckCircle2, ArrowLeft } from './icons/FlowbiteIcons';
import { Drawer, Alert } from 'flowbite-react';
import { X } from './icons/FlowbiteIcons';
import { t } from '../i18n/en';
import { useConfirm } from './ConfirmDialogContext';
import { StyledSelect } from './StyledSelect';
import { Button } from './Button';
import { Input } from './Input';

// Category has no separate table/entity of its own on miscellaneous_catalog
// (same as MiscChargesManagement.tsx's own per-property page) - typing a
// name here that doesn't already exist and saving is all it takes to create
// one. This sentinel is what the pickers below watch for to flip from
// "pick an existing category" into free-text entry.
const CREATE_CATEGORY_OPTION = '__create_new_category__';

interface MiscChargeItem {
  id: number;
  label: string;
  category: string;
  default_amount: number;
  description?: string;
}

interface CategoryGroup {
  [key: string]: MiscChargeItem[];
}

interface DefaultMiscChargesManagerProps {
  onLogout: () => void;
}

export const DefaultMiscChargesManager: React.FC<DefaultMiscChargesManagerProps> = ({ onLogout }) => {
  const { confirm } = useConfirm();
  const [charges, setCharges] = useState<CategoryGroup>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newItem, setNewItem] = useState({ label: '', category: '', default_amount: '' });
  const [isCreatingCategoryNew, setIsCreatingCategoryNew] = useState(false);
  const [itemNameTouched, setItemNameTouched] = useState(false);
  const [editingItem, setEditingItem] = useState<MiscChargeItem | null>(null);
  const [editForm, setEditForm] = useState({ label: '', category: '', default_amount: '' });
  const [isCreatingCategoryEdit, setIsCreatingCategoryEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCharges();
  }, []);

  // Auto-dismiss success/error after 4s, same as DefaultBillsManager.tsx
  useEffect(() => {
    if (!success && !error) return;
    const timer = setTimeout(() => { setSuccess(null); setError(null); }, 4000);
    return () => clearTimeout(timer);
  }, [success, error]);

  const loadCharges = async () => {
    try {
      setLoading(true);
      const response = await fetch('/php/api/router.php?action=get_system_misc_catalog', {
        credentials: 'include',
      });
      if (response.status === 401 || response.status === 403) {
        onLogout();
        return;
      }
      const data = await response.json();
      if ((data.success || data.status === 'success') && data.data) {
        setCharges(data.data);
      }
      setError(null);
    } catch (err) {
      setError('Failed to load default misc charges');
    } finally {
      setLoading(false);
    }
  };

  const allCategories = useMemo(() => Object.keys(charges).sort(), [charges]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.label.trim() || !newItem.category.trim()) {
      setItemNameTouched(true);
      setError('Item name and category are required');
      return;
    }
    try {
      setSaving(true);
      const response = await fetch('/php/api/router.php?action=add_system_misc_charge_item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          label: newItem.label.trim(),
          category: newItem.category.trim(),
          default_amount: newItem.default_amount === '' ? 0 : Number(newItem.default_amount),
        }),
      });
      const data = await response.json();
      if (data.success || data.status === 'success') {
        setSuccess('Default charge added successfully!');
        setNewItem({ label: '', category: '', default_amount: '' });
        setItemNameTouched(false);
        setIsCreatingCategoryNew(false);
        setIsAddingNew(false);
        loadCharges();
      } else {
        setError(data.message || 'Failed to add item');
      }
    } catch {
      setError('Failed to add default charge');
    } finally {
      setSaving(false);
    }
  };

  const handleEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editForm.label.trim() || !editForm.category.trim()) return;
    try {
      setSaving(true);
      const response = await fetch('/php/api/router.php?action=add_system_misc_charge_item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: editingItem.id,
          label: editForm.label.trim(),
          category: editForm.category.trim(),
          default_amount: editForm.default_amount === '' ? 0 : Number(editForm.default_amount),
        }),
      });
      const data = await response.json();
      if (data.success || data.status === 'success') {
        setSuccess('Default charge updated successfully!');
        setEditingItem(null);
        setIsCreatingCategoryEdit(false);
        loadCharges();
      } else {
        setError(data.message || 'Failed to update item');
      }
    } catch {
      setError('Failed to update default charge');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (item: MiscChargeItem) => {
    const confirmed = await confirm({
      title: t('delete_misc_charge_title', 'Delete Misc Charge Template'),
      message: `Delete "${item.label}"? This removes it as a default for every property that hasn't already customized it themselves.`,
      confirmText: t('delete_misc_charge_confirm', 'Delete Template'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      setSaving(true);
      const response = await fetch('/php/api/router.php?action=delete_system_misc_charge_item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: item.id }),
      });
      const data = await response.json();
      if (data.success || data.status === 'success') {
        setSuccess('Default charge deleted.');
        loadCharges();
      } else {
        setError(data.message || 'Failed to delete item');
      }
    } catch {
      setError('Failed to delete default charge');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const query = searchQuery.trim().toLowerCase();
  const filteredCharges: CategoryGroup = query
    ? Object.fromEntries(
        allCategories
          .map((cat) => [cat, charges[cat].filter((item) => item.label.toLowerCase().includes(query))])
          .filter(([, items]) => (items as MiscChargeItem[]).length > 0)
      )
    : charges;
  const categories = query ? Object.keys(filteredCharges).sort() : allCategories;
  const totalItems = allCategories.reduce((sum, cat) => sum + charges[cat].length, 0);

  return (
    <div className="default-misc-charges-manager space-y-4 p-3 sm:p-6">
      {/* Header */}
      <div className="default-misc-charges-manager__header bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h2 className="default-misc-charges-manager__title text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Tag className="w-5 h-5 text-blue-600 shrink-0" />
              <span className="truncate">{t('root_default_misc_charges_heading_label', 'Default Misc Charges (Guest)')}</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {t('root_default_misc_charges_subtitle', "Extra Charges & Fees every property starts with (Extra Bed, Late Check-out, etc). Editing here changes the shared default for every property that hasn't customized that item on its own Extra Charges & Fees page.")}
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => { setIsCreatingCategoryNew(false); setIsAddingNew(!isAddingNew); }}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            {t('add_new_service_button', 'Add New Service')}
          </Button>
        </div>
        <div className="mt-3">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search_misc_charges_placeholder', 'Search by service name or category...')}
          />
        </div>
      </div>

      {/* Messages */}
      {error && (
        <Alert color="failure" icon={AlertCircle} className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">
          <span className="text-sm">{error}</span>
        </Alert>
      )}
      {success && (
        <Alert color="success" icon={CheckCircle2} className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300">
          <span className="text-sm">{success}</span>
        </Alert>
      )}

      {/* Add New Form */}
      {isAddingNew && (
        <div className="max-w-[550px] w-full bg-white dark:bg-slate-800 rounded-lg border border-blue-200 dark:border-blue-800 p-4 sm:p-6 space-y-3">
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-600" />
            {t('add_extra_service_title', 'Add Extra Service')}
          </h3>
          <form onSubmit={handleAddItem} className="app-form app-form--add-misc-charge space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label={t('service_name_label', 'Service Name *')}
                value={newItem.label}
                onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
                onBlur={() => setItemNameTouched(true)}
                error={itemNameTouched && !newItem.label.trim() ? 'This field is required' : undefined}
                placeholder={t('service_name_placeholder', 'e.g. Pet Fee')}
                autoFocus
              />
              {isCreatingCategoryNew ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    label={t('category_label', 'Category *')}
                    autoFocus
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    placeholder={t('new_category_name_placeholder', 'New category name')}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => { setIsCreatingCategoryNew(false); setNewItem({ ...newItem, category: '' }); }}
                    title={t('back_to_category_list_tooltip', 'Back to category list')}
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <StyledSelect
                  label={t('category_label', 'Category')}
                  value={newItem.category}
                  onChange={(value) => {
                    if (value === CREATE_CATEGORY_OPTION) {
                      setIsCreatingCategoryNew(true);
                      setNewItem({ ...newItem, category: '' });
                    } else {
                      setNewItem({ ...newItem, category: value });
                    }
                  }}
                  placeholder={t('select_category_placeholder', '-- Select Category --')}
                  searchable
                  options={[
                    { value: CREATE_CATEGORY_OPTION, label: `+ ${t('create_new_category_option', 'Create New Category')}` },
                    ...allCategories.map((cat) => ({ value: cat, label: cat })),
                  ]}
                />
              )}
            </div>
            <div className="max-w-[264px]">
              <Input
                label={t('default_price_label', 'Default Price (₹)')}
                type="number"
                value={newItem.default_amount}
                onChange={(e) => setNewItem({ ...newItem, default_amount: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="success" size="md" disabled={saving}>
                {saving ? t('saving_button', 'Saving...') : t('add_service_button', 'Add Service')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => { setIsAddingNew(false); setIsCreatingCategoryNew(false); setNewItem({ label: '', category: '', default_amount: '' }); setItemNameTouched(false); }}
              >
                {t('cancel_button', 'Cancel')}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Empty State */}
      {allCategories.length === 0 && (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-none sm:rounded-lg border-x-0 sm:border-2 border-y-2 sm:border-y-2 border-dashed border-slate-300 dark:border-slate-600 p-8 text-center">
          <Tag className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t('no_misc_charges_found_label', 'No miscellaneous charges found.')}
          </p>
        </div>
      )}

      {/* No Search Results */}
      {allCategories.length > 0 && query && categories.length === 0 && (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-none sm:rounded-lg border-x-0 sm:border-2 border-y-2 sm:border-y-2 border-dashed border-slate-300 dark:border-slate-600 p-8 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">No items match "{searchQuery}".</p>
        </div>
      )}

      {/* Categories Display */}
      {categories.length > 0 && (
        <div className="default-misc-charges-manager__categories space-y-4">
          {categories.map((category) => (
            <div key={category} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="bg-slate-100 dark:bg-slate-700 px-4 py-2 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{category}</h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {filteredCharges[category].length} item{filteredCharges[category].length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="p-2.5">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
                  {filteredCharges[category].map((item) => (
                    <div key={item.id} className="bg-slate-50 dark:bg-slate-700/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:shadow-md dark:hover:bg-slate-700 transition-all">
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-semibold text-slate-900 dark:text-white text-xs leading-tight flex-1 line-clamp-2">{item.label}</span>
                          <span className="text-[9px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-1 py-0.5 rounded whitespace-nowrap shrink-0">#{item.id}</span>
                        </div>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-xs tabular-nums block">
                          ₹{Number(item.default_amount).toLocaleString('en-IN')}
                        </span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingItem(item);
                              setEditForm({ label: item.label, category: item.category, default_amount: String(item.default_amount) });
                              setIsCreatingCategoryEdit(false);
                            }}
                            className="flex-1 p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded text-[11px] font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
                            title={t('edit_button', 'Edit')}
                          >
                            <Pencil className="w-3 h-3" />
                            {t('edit_button', 'Edit')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item)}
                            disabled={saving}
                            className="flex-1 p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-[11px] font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1 cursor-pointer"
                            title={t('delete_button', 'Delete')}
                          >
                            <Trash2 className="w-3 h-3" />
                            {t('delete_button', 'Delete')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalItems > 0 && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">{totalItems} total item{totalItems !== 1 ? 's' : ''}</p>
      )}

      {/* Edit Drawer */}
      <Drawer
        open={!!editingItem}
        onClose={() => { if (!saving) { setEditingItem(null); setIsCreatingCategoryEdit(false); } }}
        position="right"
        className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between default-misc-charges-manager__edit-modal"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <Pencil className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white m-0">Edit Default Charge</h2>
          </div>
          <button
            type="button"
            onClick={() => { if (!saving) { setEditingItem(null); setIsCreatingCategoryEdit(false); } }}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleEditItem} className="app-form app-form--edit-misc-charge flex-1 flex flex-col justify-between overflow-y-auto">
          <div className="p-4 space-y-4">
            <Input
              label={t('service_name_label', 'Service Name *')}
              value={editForm.label}
              onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
              autoFocus
            />
            {isCreatingCategoryEdit ? (
              <div className="flex items-center gap-1.5">
                <Input
                  label={t('category_label', 'Category *')}
                  autoFocus
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  placeholder={t('new_category_name_placeholder', 'New category name')}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => { setIsCreatingCategoryEdit(false); setEditForm({ ...editForm, category: '' }); }}
                  title={t('back_to_category_list_tooltip', 'Back to category list')}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <StyledSelect
                label={t('category_label', 'Category')}
                value={editForm.category}
                onChange={(value) => {
                  if (value === CREATE_CATEGORY_OPTION) {
                    setIsCreatingCategoryEdit(true);
                    setEditForm({ ...editForm, category: '' });
                  } else {
                    setEditForm({ ...editForm, category: value });
                  }
                }}
                searchable
                options={[
                  { value: CREATE_CATEGORY_OPTION, label: `+ ${t('create_new_category_option', 'Create New Category')}` },
                  ...allCategories.map((cat) => ({ value: cat, label: cat })),
                ]}
              />
            )}
            <Input
              label={t('default_price_label', 'Default Price (₹)')}
              type="number"
              value={editForm.default_amount}
              onChange={(e) => setEditForm({ ...editForm, default_amount: e.target.value })}
            />
          </div>
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            <Button type="button" variant="secondary" size="sm" onClick={() => { setEditingItem(null); setIsCreatingCategoryEdit(false); }} disabled={saving}>
              {t('cancel_button', 'Cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={saving}
              leftIcon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            >
              {saving ? t('saving_button', 'Saving...') : t('update_button', 'Update')}
            </Button>
          </div>
        </form>
      </Drawer>
    </div>
  );
};
