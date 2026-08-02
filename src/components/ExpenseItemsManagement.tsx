import React, { useState, useEffect } from 'react';
import { Plus, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { useToast } from './ToastContext';

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

export const ExpenseItemsManagement: React.FC = () => {
  const [expenses, setExpenses] = useState<CategoryGroup>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newItem, setNewItem] = useState({ label: '', category: '', default_amount: '' });
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

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
  const filtered = allItems.filter(item =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );
  const categories = Object.keys(expenses).sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Predefined Expense Items
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
            System defaults (🔒) cannot be edited. Add custom items or modify the defaults through Root Admin.
          </p>
        </div>
      </div>

      {/* Messages */}
      {allItems.length === 0 && !loading && (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 p-12 text-center">
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            No expense items loaded yet. Visit Root Admin → <strong>Default Expenses (MK)</strong> → click <strong>"⚡ Sync Defaults"</strong> to populate all 20 categories.
          </p>
        </div>
      )}

      {/* Toolbar */}
      {allItems.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsAddingNew(!isAddingNew)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Custom Item
              </button>
              <button
                onClick={loadItems}
                className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search items or categories..."
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
            />
          </div>

          {/* Add New Item Form */}
          {isAddingNew && (
            <form onSubmit={handleAddItem} className="space-y-4 border-t border-slate-200 dark:border-slate-700 pt-4">
              <h3 className="font-semibold text-slate-900 dark:text-white">Add Custom Expense Item</h3>
              <div className="grid grid-cols-3 gap-4">
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
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Default Amount (₹)
                  </label>
                  <input
                    type="number"
                    value={newItem.default_amount}
                    onChange={(e) => setNewItem({ ...newItem, default_amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
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
              <div key={category} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="bg-slate-100 dark:bg-slate-700 px-6 py-3">
                  <h3 className="font-bold text-slate-900 dark:text-white">{category}</h3>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {(filteredCategory.length > 0 ? filteredCategory : categoryItems).map((item) => (
                      <div key={item.id} className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:shadow-md dark:hover:bg-slate-700 transition-all">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white text-sm leading-tight flex-1">{item.label}</span>
                            {item.is_system_default && (
                              <span className="text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded whitespace-nowrap">
                                🔒
                              </span>
                            )}
                          </div>
                          {!item.is_system_default && (
                            <button
                              onClick={() => handleDeleteItem(item.id, item.label)}
                              disabled={saving}
                              className="w-full p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-xs font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1 mt-2"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
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
