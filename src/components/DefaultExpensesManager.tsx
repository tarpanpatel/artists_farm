import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, DollarSign, AlertCircle, Loader } from 'lucide-react';

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
  const [expenses, setExpenses] = useState<CategoryGroup>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
    if (!window.confirm('This will populate all 20 default expense categories across all MultiKey properties. Continue?')) return;

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
    if (!window.confirm(`Delete "${itemLabel}"? This action cannot be undone.`)) return;

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

  const categories = Object.keys(expenses).sort();

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-green-600" />
              System Default Expenses (MultiKey)
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              Manage the 20 default expense categories and their items. Add, edit, or delete items here—changes automatically cascade to all MultiKey properties. Note: Deleting an item removes it from property-level templates but preserves historical expense logs.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSyncDefaults}
              disabled={syncing}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
              title="Populate all 20 default categories across all MultiKey properties"
            >
              {syncing ? <Loader className="w-4 h-4 animate-spin" /> : '⚡'}
              Sync Defaults
            </button>
            <button
              onClick={() => setIsAddingNew(!isAddingNew)}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add New Item
            </button>
          </div>
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
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-4">
          <h3 className="font-semibold text-slate-900 dark:text-white">Add New Expense Item</h3>
          <form onSubmit={handleAddItem} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
                <select
                  value={newItem.category}
                  onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="">-- Select Category --</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
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
      {categories.length === 0 && (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 p-12 text-center">
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            No expense categories yet. Click <strong>"⚡ Sync Defaults"</strong> to populate all 20 default categories.
          </p>
        </div>
      )}

      {/* Categories Display */}
      {categories.length > 0 && (
      <div className="space-y-6">
        {categories.map((category) => (
          <div key={category} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="bg-slate-100 dark:bg-slate-700 px-6 py-3">
              <h3 className="font-bold text-slate-900 dark:text-white">{category}</h3>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {expenses[category].map((item) => (
                  <div key={item.id} className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:shadow-md dark:hover:bg-slate-700 transition-all">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white text-sm leading-tight flex-1">{item.label}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded whitespace-nowrap">
                          ID: {item.id}
                        </span>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => {
                            setEditingItem(item);
                            setEditForm({ label: item.label, default_amount: item.default_amount.toString() });
                          }}
                          className="flex-1 p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1"
                          title="Edit"
                        >
                          <Edit2 className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id, item.label)}
                          disabled={saving}
                          className="flex-1 p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-xs font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
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
