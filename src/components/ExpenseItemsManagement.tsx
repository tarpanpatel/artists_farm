import React, { useState, useEffect } from 'react';
import { PlusCircle, Layers, X, Edit2, Check, Trash2, RefreshCw } from 'lucide-react';
import { fetchExpenseItemsFromDB, addExpenseItemToDB, deleteExpenseItemFromDB } from '../services/api';

export const ExpenseItemsManagement: React.FC = () => {
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadItems = async () => {
    setLoading(true);
    const fetched = await fetchExpenseItemsFromDB();
    setItems(fetched);
    setLoading(false);
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newItemName.trim();
    if (!trimmed) return;
    if (items.some(item => item.toLowerCase() === trimmed.toLowerCase())) {
      alert('This item already exists in the registry.');
      return;
    }
    setAdding(true);
    const ok = await addExpenseItemToDB(trimmed);
    if (ok) {
      setItems(prev => [...prev, trimmed].sort((a, b) => a.localeCompare(b)));
      setNewItemName('');
    } else {
      alert('Failed to add item. It may already exist.');
    }
    setAdding(false);
  };

  const handleDeleteItem = (name: string) => {
    (window as any).showConfirm(`Remove "${name}" from expense items?`, async () => {
      const ok = await deleteExpenseItemFromDB(name);
      if (ok) {
        setItems(prev => prev.filter(i => i !== name));
      }
    });
  };

  const handleStartEdit = (index: number, name: string) => {
    setEditingIndex(index);
    setEditValue(name);
  };

  const handleSaveEdit = async (oldName: string) => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingIndex(null);
      return;
    }
    if (items.some(i => i.toLowerCase() === trimmed.toLowerCase())) {
      alert('An item with this name already exists.');
      return;
    }
    const deleted = await deleteExpenseItemFromDB(oldName);
    const added = await addExpenseItemToDB(trimmed);
    if (deleted && added) {
      setItems(prev => prev.map(i => (i === oldName ? trimmed : i)).sort((a, b) => a.localeCompare(b)));
    }
    setEditingIndex(null);
  };

  const filtered = items.filter(item =>
    item.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-200">
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
          Predefined Expense Items
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Manage the item names that appear in the expense description autocomplete on the Expenses page.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs h-fit space-y-4">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm border-l-3 border-emerald-500 pl-2.5 flex items-center gap-1.5">
            <PlusCircle className="w-4 h-4 text-emerald-600" />
            ADD NEW ITEM
          </h3>

          <form onSubmit={handleAddItem} className="space-y-3">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-bold mb-1">Item Name</label>
              <input
                type="text"
                required
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                placeholder="e.g., Garbage bag, Cab Rent"
                className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold"
              />
            </div>

            <button
              type="submit"
              disabled={adding}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-2.5 rounded-xl shadow-2xs transition-colors cursor-pointer"
            >
              {adding ? 'Adding...' : 'Add to Registry'}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={loadItems}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 py-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> Refresh from Database
            </button>
          </div>
        </div>

        {/* Right Column: Items list */}
        <div className="expense-catalog-container lg:col-span-2 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm border-l-3 border-blue-500 pl-2.5 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-600" />
              ITEM REGISTRY
            </h3>
            <span className="text-[10px] bg-slate-100 dark:bg-slate-950 px-2 py-0.5 rounded font-mono text-slate-500 dark:text-slate-400">
              {items.length} Items
            </span>
          </div>

          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search items..."
              className="w-full p-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
            />
          </div>

          {loading ? (
            <div className="text-center p-8 text-slate-400">Loading items...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[500px] overflow-y-auto pr-1">
              {filtered.map((item) => {
                const globalIdx = items.indexOf(item);
                const isEditing = editingIndex === globalIdx;

                return (
                  <div
                    key={item}
                    className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 hover:shadow-2xs transition-all"
                  >
                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => handleSaveEdit(item)}
                          onKeyDown={e => e.key === 'Enter' && handleSaveEdit(item)}
                          autoFocus
                          className="flex-1 p-1 border border-blue-500 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold text-xs"
                        />
                        <button
                          onClick={() => handleSaveEdit(item)}
                          className="text-emerald-600 hover:text-emerald-700 p-0.5 cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingIndex(null)}
                          className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <span
                        onClick={() => handleStartEdit(globalIdx, item)}
                        className="font-bold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer select-none text-xs flex-1 truncate"
                        title="Click to edit"
                      >
                        {item}
                      </span>
                    )}

                    {!isEditing && (
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          onClick={() => handleStartEdit(globalIdx, item)}
                          className="btn-edit-expense-item text-slate-400 hover:text-blue-600 p-0.5 cursor-pointer"
                          title="Edit"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item)}
                          className="btn-delete-expense-item text-red-400 hover:text-red-600 font-bold px-1.5 py-0.5 transition-colors cursor-pointer text-xs select-none"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="col-span-2 text-center p-8 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 font-semibold">
                  {items.length === 0 ? 'Registry is empty. Add items using the form.' : 'No items match your search.'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
