import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, DollarSign, AlertCircle, Loader2, Search, CheckCircle2 } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, Alert } from 'flowbite-react';
import { t } from '../i18n/en';
import { useConfirm } from './ConfirmDialogContext';
import { StyledSelect } from './StyledSelect';
import { Button } from './Button';
import { Input } from './Input';
import { getExpenseItemIcon } from '../utils/expenseIcons';

interface ExpenseItem {
  id: number;
  label: string;
  category: string;
  default_amount: number;
  is_system_default: boolean;
  selected_icon?: string;
}

interface CategoryGroup {
  [key: string]: ExpenseItem[];
}

export const DefaultExpensesManager: React.FC = () => {
  const { confirm } = useConfirm();
  const [expenses, setExpenses] = useState<CategoryGroup>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newItem, setNewItem] = useState({ label: '', category: '', default_amount: '', selected_icon: '' });
  const [editingItem, setEditingItem] = useState<ExpenseItem | null>(null);
  const [editForm, setEditForm] = useState({ label: '', default_amount: '', selected_icon: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    try {
      setLoading(true);
      const response = await fetch('/php/api/router.php?action=get_system_expense_catalog', {
        credentials: 'include',
      });
      const data = await response.json();
      if ((data.success || data.status === 'success') && data.data) {
        setExpenses(data.data);
      }
      setError(null);
    } catch (err) {
      setError('Failed to load expense categories');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.label || !newItem.category) {
      setError('Item name and category are required');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch('/php/api/router.php?action=add_system_expense_item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          label: newItem.label,
          category: newItem.category,
          default_amount: 0,
        }),
      });

      const data = await response.json();
      if (data.success || data.status === 'success') {
        setSuccess('Expense item added successfully!');
        setNewItem({ label: '', category: '', default_amount: '', selected_icon: '' });
        setIsAddingNew(false);
        loadExpenses();
      } else {
        setError(data.message || 'Failed to add item');
      }
    } catch (err) {
      setError('Failed to add expense item');
    } finally {
      setSaving(false);
    }
  };

  const handleEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editForm.label.trim()) return;

    try {
      setSaving(true);
      const response = await fetch('/php/api/router.php?action=add_system_expense_item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: editingItem.id,
          label: editForm.label,
          category: editingItem.category,
          default_amount: editingItem.default_amount,
        }),
      });

      const data = await response.json();
      if (data.success || data.status === 'success') {
        setSuccess('Expense item updated successfully!');
        setEditingItem(null);
        loadExpenses();
      } else {
        setError(data.message || 'Failed to update item');
      }
    } catch (err) {
      setError('Failed to update expense item');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (itemId: number, itemLabel: string) => {
    const confirmed = await confirm({
      title: t('delete_expense_category_title', 'Delete Expense Category'),
      message: `Delete "${itemLabel}"? This action cannot be undone.`,
      confirmText: t('delete_category_button', 'Delete Category'),
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      setSaving(true);
      const response = await fetch('/php/api/router.php?action=delete_system_expense_item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: itemId }),
      });

      const data = await response.json();
      if (data.success || data.status === 'success') {
        setSuccess('Expense item deleted successfully!');
        loadExpenses();
      } else {
        setError(data.message || 'Failed to delete item');
      }
    } catch (err) {
      setError('Failed to delete expense item');
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

  const allCategories = Object.keys(expenses).sort();
  const query = searchQuery.trim().toLowerCase();
  const filteredExpenses: CategoryGroup = query
    ? Object.fromEntries(
        allCategories
          .map((cat) => [cat, expenses[cat].filter((item) => item.label.toLowerCase().includes(query))])
          .filter(([, items]) => (items as ExpenseItem[]).length > 0)
      )
    : expenses;
  const categories = query ? Object.keys(filteredExpenses).sort() : allCategories;

  return (
    <div className="default-expenses-manager space-y-4 p-3 sm:p-6">
      {/* Header */}
      <div className="default-expenses-manager__header bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h2 className="default-expenses-manager__title text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600 shrink-0" />
              <span className="truncate">{t('root_default_expenses_heading_label', 'Default Expenses (MultiKey)')}</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {t('default_expenses_description', 'Manage the 20 default expense categories. Changes cascade to all MultiKey properties.')}
            </p>
          </div>
          <div className="flex gap-2">
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
            placeholder={t('search_expense_items_placeholder', 'Search expense items...')}
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
          <h3 className="default-expenses-manager__subtitle font-semibold text-slate-900 dark:text-white text-sm">{t('add_new_expense_item_title', 'Add New Expense Item')}</h3>
          <form onSubmit={handleAddItem} className="app-form app-form--add-expense-item space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('item_name_required_label', 'Item Name *')}
                </label>
                <Input
                  value={newItem.label}
                  onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
                  placeholder={t('item_name_placeholder', 'e.g., Floor Cleaner')}
                />
              </div>
              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('category_required_label', 'Category *')}
                </label>
                <StyledSelect
                  value={newItem.category}
                  onChange={(value) => setNewItem({ ...newItem, category: value })}
                  placeholder={t('select_category_placeholder', '-- Select Category --')}
                  searchable
                  // `categories` is the page-search-filtered list (correct for
                  // the item list below), so it goes empty whenever the page
                  // search box has text that matches zero items - which then
                  // emptied this dropdown too, even though picking a category
                  // for a brand-new item has nothing to do with what's typed
                  // in an unrelated search box. Always show every real category.
                  options={allCategories.map((cat) => ({ value: cat, label: cat }))}
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
            No expense categories yet. Click <strong>"Sync Defaults"</strong> to populate all 20 default categories.
          </p>
        </div>
      )}

      {/* No Search Results */}
      {allCategories.length > 0 && query && categories.length === 0 && (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 p-8 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No expense items match "{searchQuery}".
          </p>
        </div>
      )}

      {/* Categories Display */}
      {categories.length > 0 && (
      <div className="default-expenses-manager__categories space-y-4">
        {categories.map((category) => (
          <div key={category} className="default-expenses-manager__category-card bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="bg-slate-100 dark:bg-slate-700 px-4 py-2">
              <h3 className="default-expenses-manager__subtitle font-semibold text-slate-900 dark:text-white text-sm">{category}</h3>
            </div>
            <div className="p-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
                {filteredExpenses[category].map((item) => {
                  const ItemIcon = getExpenseItemIcon(item.label, category);
                  return (
                  <div key={item.id} className="bg-slate-50 dark:bg-slate-700/50 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 hover:shadow-md dark:hover:bg-slate-700 transition-all">
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-1">
                        <ItemIcon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                        <span className="font-semibold text-slate-900 dark:text-white text-xs leading-tight flex-1 line-clamp-2">{item.label}</span>
                        <span className="text-[9px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-1 py-0.5 rounded whitespace-nowrap shrink-0">
                          #{item.id}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setEditingItem(item);
                            setEditForm({ label: item.label, default_amount: item.default_amount.toString(), selected_icon: item.selected_icon || '' });
                          }}
                          className="flex-1 p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded text-[11px] font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
                          title={t('edit_button', 'Edit')}
                        >
                          <Edit2 className="w-3 h-3" />
                          {t('edit_button', 'Edit')}
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id, item.label)}
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
      <Modal show={!!editingItem} onClose={() => setEditingItem(null)} dismissible={!saving} size="md" className="z-58 default-expenses-manager__edit-modal">
        <ModalHeader>{t('edit_expense_item_title', 'Edit Expense Item')}</ModalHeader>
        <ModalBody>
          <form onSubmit={handleEditItem} className="app-form app-form--edit-expense-item space-y-4">
            <Input
              label={t('item_name_label', 'Item Name')}
              value={editForm.label}
              onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
            />
            <Button type="submit" variant="primary" block disabled={saving}>
              {saving ? t('saving_button', 'Saving...') : t('update_button', 'Update')}
            </Button>
          </form>
        </ModalBody>
      </Modal>
    </div>
  );
};
