import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, AlertCircle, Loader2, Search, CheckCircle2, RefreshCw } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, Alert } from 'flowbite-react';
import { t } from '../i18n/en';
import { useConfirm } from './ConfirmDialogContext';
import { StyledSelect } from './StyledSelect';
import { Button } from './Button';
import { Input } from './Input';
import { Package } from 'lucide-react';

interface StockItem {
  id: number;
  name: string;
  category: string;
  category_id: number;
  unit: string;
  image_path?: string;
}

interface CategoryGroup {
  [key: string]: StockItem[];
}

export const SystemStockManager: React.FC = () => {
  const { confirm } = useConfirm();
  const [stocks, setStocks] = useState<CategoryGroup>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [dbCategories, setDbCategories] = useState<{ id: number; name: string }[]>([]);
  const [newItem, setNewItem] = useState({ name: '', categoryId: 1, unit: 'Kg' });
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [editForm, setEditForm] = useState({ name: '', categoryId: 1, unit: 'Kg' });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadCategories = async () => {
    try {
      // Deliberately NOT fetchMaterialCategoriesFromDB() - that resolves against the
      // current request's property context (propertyId=0 on Root Dashboard), which
      // returns a disconnected set of category IDs that share names but not IDs with
      // what system_stock_catalog items actually reference. This always resolves
      // against property_id=1, matching the items' real category_id values.
      const response = await fetch('/php/api/router.php?action=get_system_stock_categories', {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.status === 'success' && Array.isArray(data.data)) {
        setDbCategories(data.data);
      }
    } catch (err) {
      // Non-fatal - the category dropdown just falls back to empty until retried.
    }
  };

  useEffect(() => {
    loadCategories();
    loadStocks();
  }, []);

  const loadStocks = async () => {
    try {
      setLoading(true);
      const response = await fetch('/php/api/router.php?action=get_system_stock_catalog', {
        credentials: 'include',
      });
      const data = await response.json();
      if ((data.success || data.status === 'success') && data.data) {
        setStocks(data.data);
      }
      setError(null);
    } catch (err) {
      setError('Failed to load stock categories');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name) {
      setError('Item name is required');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch('/php/api/router.php?action=add_system_stock_item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newItem.name,
          categoryId: newItem.categoryId,
          unit: newItem.unit,
        }),
      });

      const data = await response.json();
      if (data.success || data.status === 'success') {
        setSuccess('Stock item added successfully!');
        setNewItem({ name: '', categoryId: 1, unit: 'Kg' });
        setIsAddingNew(false);
        loadStocks();
      } else {
        setError(data.message || 'Failed to add item');
      }
    } catch (err) {
      setError('Failed to add stock item');
    } finally {
      setSaving(false);
    }
  };

  const handleEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editForm.name.trim()) return;

    try {
      setSaving(true);
      const response = await fetch('/php/api/router.php?action=add_system_stock_item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: editingItem.id,
          name: editForm.name,
          categoryId: editForm.categoryId,
          unit: editForm.unit,
        }),
      });

      const data = await response.json();
      if (data.success || data.status === 'success') {
        setSuccess('Stock item updated successfully!');
        setEditingItem(null);
        loadStocks();
      } else {
        setError(data.message || 'Failed to update item');
      }
    } catch (err) {
      setError('Failed to update stock item');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncDefaults = async () => {
    try {
      setSyncing(true);
      const response = await fetch('/php/api/router.php?action=sync_default_stock_categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (data.status === 'success') {
        setSuccess(data.message || 'Default categories synced');
        loadStocks();
      } else {
        setError(data.message || 'Failed to sync default categories');
      }
    } catch (err) {
      setError('Failed to sync default categories');
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteItem = async (itemId: number, itemName: string) => {
    const confirmed = await confirm({
      title: t('delete_stock_category_title', 'Delete Stock Category'),
      message: `Delete "${itemName}"? This action cannot be undone.`,
      confirmText: t('delete_category_button', 'Delete Category'),
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      setSaving(true);
      const response = await fetch('/php/api/router.php?action=delete_system_stock_item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: itemId }),
      });

      const data = await response.json();
      if (data.success || data.status === 'success') {
        setSuccess('Stock item deleted successfully!');
        loadStocks();
      } else {
        setError(data.message || 'Failed to delete item');
      }
    } catch (err) {
      setError('Failed to delete stock item');
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

  const allCategories = Object.keys(stocks).sort();
  const query = searchQuery.trim().toLowerCase();
  const filteredStocks: CategoryGroup = query
    ? Object.fromEntries(
        allCategories
          .map((cat) => [cat, stocks[cat].filter((item) => item.name.toLowerCase().includes(query))])
          .filter(([, items]) => (items as StockItem[]).length > 0)
      )
    : stocks;
  const categories = query ? Object.keys(filteredStocks).sort() : allCategories;

  return (
    <div className="default-stocks-manager space-y-4 p-3 sm:p-6">
      {/* Header */}
      <div className="default-stocks-manager__header bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h2 className="default-stocks-manager__title text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-green-600 shrink-0" />
              <span className="truncate">{t('root_default_stocks_heading_name', 'System Stock Catalog')}</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {t('default_stocks_description', 'Shared item/category template every property draws from - changes here reach every tenant\'s property, not just MultiKey ones.')}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSyncDefaults}
              disabled={syncing}
              className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {syncing ? t('syncing_button', 'Syncing...') : t('sync_defaults_button', 'Sync Defaults')}
            </button>
            <button
              onClick={() => setIsAddingNew(!isAddingNew)}
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('add_new_item_button', 'Add New Item')}
            </button>
          </div>
        </div>
        <div className="relative mt-3">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search_stock_items_placeholder', 'Search stock items...')}
            leftIcon={<Search className="w-4 h-4 text-slate-400" />}
          />
        </div>
      </div>

      {/* Messages */}
      {error && (
        <Alert color="failure" icon={AlertCircle} className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">
          {error}
        </Alert>
      )}

      {success && (
        <Alert color="success" icon={CheckCircle2} className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300">
          {success}
        </Alert>
      )}

      {/* Add New Item Form */}
      {isAddingNew && (
        <div className="max-w-[550px] w-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
          <h3 className="default-stocks-manager__subtitle font-semibold text-slate-900 dark:text-white text-sm">{t('add_new_stock_item_title', 'Add New Stock Item')}</h3>
          <form onSubmit={handleAddItem} className="app-form app-form--add-stock-item space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('item_name_required_name', 'Item Name *')}
                </label>
                <Input
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder={t('item_name_placeholder', 'e.g., Floor Cleaner')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('category_required_name', 'Category *')}
                </label>
                <StyledSelect
                  value={newItem.categoryId.toString()}
                  onChange={(value) => setNewItem({ ...newItem, categoryId: parseInt(value) })}
                  placeholder={t('select_category_placeholder', '-- Select Category --')}
                  searchable
                  options={dbCategories.map((cat) => ({ value: cat.id.toString(), label: cat.name }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  Unit *
                </label>
                <StyledSelect
                  value={newItem.unit}
                  onChange={(value) => setNewItem({ ...newItem, unit: value })}
                  options={[
                    { value: 'Kg', label: 'Kg' },
                    { value: 'Gm', label: 'Gm' },
                    { value: 'Liter', label: 'Liter' },
                    { value: 'Packets', label: 'Packets' },
                    { value: 'Pcs', label: 'Pcs' },
                    { value: 'Box', label: 'Box' },
                    { value: 'Doz', label: 'Doz' },
                  ]}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="success"
                size="md"
                disabled={saving}
              >
                {saving ? t('saving_button', 'Saving...') : t('add_item_button', 'Add Item')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setIsAddingNew(false)}
              >
                {t('cancel_button', 'Cancel')}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Empty State */}
      {allCategories.length === 0 && (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 p-8 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No stock categories yet. Click <strong>"Sync Defaults"</strong> above to populate a starter set of categories and items.
          </p>
        </div>
      )}

      {/* No Search Results */}
      {allCategories.length > 0 && query && categories.length === 0 && (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 p-8 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No stock items match "{searchQuery}".
          </p>
        </div>
      )}

      {/* Categories Display */}
      {categories.length > 0 && (
      <div className="default-stocks-manager__categories space-y-4">
        {categories.map((category) => (
          <div key={category} className="default-stocks-manager__category-card bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="bg-slate-100 dark:bg-slate-700 px-4 py-2">
              <h3 className="default-stocks-manager__subtitle font-semibold text-slate-900 dark:text-white text-sm">{category}</h3>
            </div>
            <div className="p-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
                {filteredStocks[category].map((item) => {
                  const ItemIcon = Package;
                  return (
                  <div key={item.id} className="bg-slate-50 dark:bg-slate-700/50 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 hover:shadow-md dark:hover:bg-slate-700 transition-all">
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-1">
                        <ItemIcon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                        <span className="font-semibold text-slate-900 dark:text-white text-xs leading-tight flex-1 line-clamp-2">{item.name}</span>
                        <span className="text-[9px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-1 py-0.5 rounded whitespace-nowrap shrink-0">
                          {item.unit}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setEditingItem(item);
                            setEditForm({ name: item.name, categoryId: item.category_id || 1, unit: item.unit || 'Kg' });
                          }}
                          className="flex-1 p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded text-[11px] font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
                          title={t('edit_button', 'Edit')}
                        >
                          <Edit2 className="w-3 h-3" />
                          {t('edit_button', 'Edit')}
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id, item.name)}
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
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Edit Modal */}
      <Modal show={!!editingItem} onClose={() => setEditingItem(null)} dismissible={!saving} size="md" className="z-58 default-stocks-manager__edit-modal">
        <ModalHeader>{t('edit_stock_item_title', 'Edit Stock Item')}</ModalHeader>
        <ModalBody>
          <form onSubmit={handleEditItem} className="app-form app-form--edit-stock-item space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <Input
                label={t('item_name_name', 'Item Name')}
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  Category
                </label>
                <StyledSelect
                  value={editForm.categoryId.toString()}
                  onChange={(value) => setEditForm({ ...editForm, categoryId: parseInt(value) })}
                  searchable
                  options={dbCategories.map((cat) => ({ value: cat.id.toString(), label: cat.name }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  Unit
                </label>
                <StyledSelect
                  value={editForm.unit}
                  onChange={(value) => setEditForm({ ...editForm, unit: value })}
                  options={[
                    { value: 'Kg', label: 'Kg' },
                    { value: 'Gm', label: 'Gm' },
                    { value: 'Liter', label: 'Liter' },
                    { value: 'Packets', label: 'Packets' },
                    { value: 'Pcs', label: 'Pcs' },
                    { value: 'Box', label: 'Box' },
                    { value: 'Doz', label: 'Doz' },
                  ]}
                />
              </div>
            </div>
            <Button type="submit" variant="primary" block disabled={saving}>
              {saving ? t('saving_button', 'Saving...') : t('update_button', 'Update')}
            </Button>
          </form>
        </ModalBody>
      </Modal>
    </div>
  );
};
