import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, DollarSign, AlertCircle, Loader, Search } from 'lucide-react';
import { useConfirm } from './ConfirmDialogContext';
import { StyledSelect } from './StyledSelect';

interface ExpenseItem {
  id: number;
  label: string;
  category: string;
  default_amount: number;
  is_system_default: boolean;
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
  const [newItem, setNewItem] = useState({ label: '', category: '', default_amount: '' });
  const [editingItem, setEditingItem] = useState<ExpenseItem | null>(null);
  const [editForm, setEditForm] = useState({ label: '', default_amount: '' });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadExpenses();
  }, []);

  const handleSyncDefaults = async () => {
    const confirmed = await confirm({
      title: 'Sync Default Expenses',
      message: 'This will populate all 20 default expense categories across all MultiKey properties. Continue?',
      confirmText: 'Sync Defaults',
      variant: 'info',
    });
    if (!confirmed) return;

    try {
      setSyncing(true);
      const response = await fetch('/php/api/router.php?action=sync_all_default_expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      const data = await response.json();
      if (data.success) {
        setSuccess('✓ All default expense categories synchronized successfully!');
        setTimeout(() => setSuccess(null), 4000);
        loadExpenses();
      } else {
        setError(data.message || 'Failed to sync defaults');
      }
    } catch (err) {
      setError('Failed to sync default expenses');
    } finally {
      setSyncing(false);
    }
  };

  const loadExpenses = async () => {
    try {
      setLoading(true);
      const response = await fetch('/php/api/router.php?action=get_misc_catalog', {
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
      const response = await fetch('/php/api/router.php?action=add_misc_charge_template', {
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
        setNewItem({ label: '', category: '', default_amount: '' });
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
      const response = await fetch('/php/api/router.php?action=add_misc_charge_template', {
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
      title: 'Delete Expense Category',
      message: `Delete "${itemLabel}"? This action cannot be undone.`,
      confirmText: 'Delete Category',
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
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
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
    <div className="space-y-4 p-3 sm:p-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600 shrink-0" />
              <span className="truncate">Default Expenses (MultiKey)</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Manage the 20 default expense categories. Changes cascade to all MultiKey properties.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSyncDefaults}
              disabled={syncing}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              title="Populate all 20 default categories across all MultiKey properties"
            >
              {syncing ? <Loader className="w-3.5 h-3.5 animate-spin" /> : '⚡'}
              Sync Defaults
            </button>
            <button
              onClick={() => setIsAddingNew(!isAddingNew)}
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add New Item
            </button>
          </div>
        </div>
        <div className="relative mt-3">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search expense items..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <p className="text-green-700 dark:text-green-300">✓ {success}</p>
        </div>
      )}

      {/* Add New Item Form */}
      {isAddingNew && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Add New Expense Item</h3>
          <form onSubmit={handleAddItem} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Item Name *
                </label>
                <input
                  type="text"
                  value={newItem.label}
                  onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
                  placeholder="e.g., Floor Cleaner"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Category *
                </label>
                <StyledSelect
                  value={newItem.category}
                  onChange={(value) => setNewItem({ ...newItem, category: value })}
                  placeholder="-- Select Category --"
                  searchable
                  options={categories.map((cat) => ({ value: cat, label: cat }))}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Add Item'}
              </button>
              <button
                type="button"
                onClick={() => setIsAddingNew(false)}
                className="bg-slate-400 hover:bg-slate-500 text-white px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Empty State */}
      {allCategories.length === 0 && (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 p-8 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No expense categories yet. Click <strong>"⚡ Sync Defaults"</strong> to populate all 20 default categories.
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
      <div className="space-y-4">
        {categories.map((category) => (
          <div key={category} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="bg-slate-100 dark:bg-slate-700 px-4 py-2">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">{category}</h3>
            </div>
            <div className="p-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
                {filteredExpenses[category].map((item) => (
                  <div key={item.id} className="bg-slate-50 dark:bg-slate-700/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:shadow-md dark:hover:bg-slate-700 transition-all">
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-semibold text-slate-900 dark:text-white text-xs leading-tight flex-1 line-clamp-2">{item.label}</span>
                        <span className="text-[9px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-1 py-0.5 rounded whitespace-nowrap shrink-0">
                          #{item.id}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setEditingItem(item);
                            setEditForm({ label: item.label, default_amount: item.default_amount.toString() });
                          }}
                          className="flex-1 p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded text-[11px] font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
                          title="Edit"
                        >
                          <Edit2 className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id, item.label)}
                          disabled={saving}
                          className="flex-1 p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-[11px] font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1 cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
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

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Edit Expense Item</h3>
            <form onSubmit={handleEditItem} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Item Name
                </label>
                <input
                  type="text"
                  value={editForm.label}
                  onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Update'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="flex-1 bg-slate-400 hover:bg-slate-500 text-white px-4 py-2 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
