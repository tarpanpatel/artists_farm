import React, { useState, useEffect } from 'react';
import { Plus, Trash2, RefreshCw, Loader2, Lock } from 'lucide-react';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import { StyledSelect } from './StyledSelect';
import { Button } from './Button';
import { Input } from './Input';
import { getExpenseItemIcon } from '../utils/expenseIcons';
import { PageHeader } from './PageHeader';
import { t } from '../i18n/en';

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

export const ExpenseItemsManagement: React.FC = () => {
  const [expenses, setExpenses] = useState<CategoryGroup>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newItem, setNewItem] = useState({ label: '', category: '', default_amount: '' });
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const loadItems = async () => {
    try {
      setLoading(true);
      const response = await fetch('/php/api/router.php?action=get_misc_catalog', {
        credentials: 'include',
      });
      const data = await response.json();
      if ((data.success || data.status === 'success') && data.data) {
        setExpenses(data.data);
      }
    } catch (err) {
      showToast('Failed to load expense categories', { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.label || !newItem.category || !newItem.default_amount) {
      showToast('All fields are required', { type: 'error' });
      return;
    }

    try {
      setSaving(true);
      const response = await fetch('/php/api/router.php?action=add_misc_charge_template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          label: newItem.label,
          category: newItem.category,
          default_amount: parseFloat(newItem.default_amount),
        }),
      });

      const data = await response.json();
      if (data.success || data.status === 'success') {
        showToast('Expense item added successfully!', { type: 'success' });
        setNewItem({ label: '', category: '', default_amount: '' });
        setIsAddingNew(false);
        loadItems();
      } else {
        showToast(data.message || 'Failed to add item', { type: 'error' });
      }
    } catch (err) {
      showToast('Failed to add expense item', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (itemId: number, itemLabel: string) => {
    const confirmed = await confirm({
      title: t('delete_expense_item_title', 'Delete Expense Item'),
      message: `Delete "${itemLabel}"? This action cannot be undone.`,
      confirmText: t('delete_expense_item_confirm', 'Delete Item'),
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      setSaving(true);
      const response = await fetch('/php/api/router.php?action=delete_misc_charge_template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: itemId }),
      });

      const data = await response.json();
      if (data.success || data.status === 'success') {
        showToast('Expense item deleted successfully!', { type: 'success' });
        loadItems();
      } else {
        showToast(data.message || 'Failed to delete item', { type: 'error' });
      }
    } catch (err) {
      showToast('Failed to delete expense item', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const allItems = Object.values(expenses).flat();
  const categories = Object.keys(expenses).sort();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('predefined_expense_items_heading', 'Predefined Expense Items')}
        subtitle={t('expense_items_description', 'System defaults cannot be edited. Add custom items or modify the defaults through Root Admin.')}
      />

      {/* Messages */}
      {allItems.length === 0 && !loading && (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 p-12 text-center">
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            {t('no_expense_items_loaded_text')}
          </p>
        </div>
      )}

      {/* Toolbar */}
      {allItems.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="success"
                size="md"
                onClick={() => setIsAddingNew(!isAddingNew)}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                {t('add_custom_item_button', 'Add Custom Item')}
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={loadItems}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                {t('refresh_button', 'Refresh')}
              </Button>
            </div>
            <div className="w-full sm:w-64">
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t('search_items_categories_placeholder', 'Search items or categories...')}
              />
            </div>
          </div>

          {/* Add New Item Form */}
          {isAddingNew && (
            <form onSubmit={handleAddItem} className="app-form app-form--add-expense-item space-y-4 border-t border-slate-200 dark:border-slate-700 pt-4">
              <h3 className="font-semibold text-slate-900 dark:text-white">{t('add_custom_expense_item_heading', 'Add Custom Expense Item')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    options={categories.map((cat) => ({ value: cat, label: cat }))}
                  />
                </div>
                <div>
                  <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                    {t('default_amount_label', 'Default Amount (₹)')}
                  </label>
                  <Input
                    type="number"
                    value={newItem.default_amount}
                    onChange={(e) => setNewItem({ ...newItem, default_amount: e.target.value })}
                    placeholder={t('default_amount_placeholder', '0.00')}
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
                  {saving ? t('saving_ellipsis_button', 'Saving...') : t('add_item_button', 'Add Item')}
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
          )}
        </div>
      )}

      {/* Categories Display */}
      {loading ? (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : categories.length > 0 ? (
        <div className="space-y-6">
          {categories.map((category) => {
            const categoryItems = expenses[category];
            const filteredCategory = categoryItems.filter(item =>
              item.label.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
              category.toLowerCase().includes(searchQuery.toLowerCase().trim())
            );

            if (filteredCategory.length === 0 && searchQuery) return null;

            return (
              <div key={category} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="bg-slate-100 dark:bg-slate-700 px-6 py-3">
                  <h3 className="font-bold text-slate-900 dark:text-white">{category}</h3>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {(filteredCategory.length > 0 ? filteredCategory : categoryItems).map((item) => {
                      const ItemIcon = getExpenseItemIcon(item.label, category);
                      return (
                      <div key={item.id} className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:shadow-md dark:hover:bg-slate-700 transition-all">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <ItemIcon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                            <span className="font-semibold text-slate-900 dark:text-white text-sm leading-tight flex-1">{item.label}</span>
                            {item.is_system_default && (
                              <span className="text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-1 rounded whitespace-nowrap inline-flex items-center">
                                <Lock className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                          {!item.is_system_default && (
                            <button
                              onClick={() => handleDeleteItem(item.id, item.label)}
                              disabled={saving}
                              className="w-full p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-xs font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1 mt-2"
                              title={t('delete_button', 'Delete')}
                            >
                              <Trash2 className="w-3 h-3" />
                              {t('delete_button', 'Delete')}
                            </button>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
