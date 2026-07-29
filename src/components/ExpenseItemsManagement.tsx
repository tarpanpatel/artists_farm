import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, Check, X, Loader2, AlertTriangle } from 'lucide-react';
import { fetchExpenseItemsFromDB, addExpenseItemToDB, deleteExpenseItemFromDB } from '../services/api';

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export const ExpenseItemsManagement: React.FC = () => {
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const similarItems = useMemo(() => {
    const trimmed = newItemName.trim().toLowerCase();
    if (!trimmed || trimmed.length < 2) return [];
    return items
      .map(item => ({ item, dist: levenshtein(trimmed, item.toLowerCase()) }))
      .filter(({ dist }) => dist <= 2 && dist > 0)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3)
      .map(({ item }) => item);
  }, [newItemName, items]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const loadItems = async () => {
    setLoading(true);
    const fetched = await fetchExpenseItemsFromDB();
    setItems(fetched);
    setLoading(false);
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleAddItem = async () => {
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
      setShowAddForm(false);
      showToast(`"${trimmed}" added to registry`);
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

      {/* Toolbar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {!showAddForm ? (
              <button
                onClick={() => setShowAddForm(true)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add New Item
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    type="text"
                    value={newItemName}
                    onChange={e => setNewItemName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddItem();
                      if (e.key === 'Escape') { setShowAddForm(false); setNewItemName(''); }
                    }}
                    placeholder="Item name..."
                    autoFocus
                    className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {similarItems.length > 0 && (
                    <p className="absolute top-full mt-1 text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 whitespace-nowrap">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      Similar: {similarItems.join(', ')}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleAddItem}
                  disabled={adding || !newItemName.trim()}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  {adding ? 'Adding...' : 'Add'}
                </button>
                <button
                  onClick={() => { setShowAddForm(false); setNewItemName(''); }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <button
              onClick={loadItems}
              className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 hover:border-slate-300 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-[10px] bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded font-mono text-slate-500">
              {items.length} Items
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search items..."
              className="flex-1 sm:flex-none px-3 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center p-8 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 font-semibold">
          {items.length === 0 ? 'Registry is empty. Click "Add New Item" to get started.' : 'No items match your search.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((name, idx) => {
            const globalIdx = items.indexOf(name);
            const isEditing = editingIndex === globalIdx;

            if (isEditing) {
              return (
                <div key={name} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-2 col-span-2 md:col-span-3 lg:col-span-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveEdit(name);
                        if (e.key === 'Escape') setEditingIndex(null);
                      }}
                      onBlur={() => handleSaveEdit(name)}
                      autoFocus
                      className="flex-1 p-1.5 border border-blue-500 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold text-xs"
                    />
                    <button onClick={() => handleSaveEdit(name)} className="text-emerald-600 hover:text-emerald-700 p-1 cursor-pointer">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingIndex(null)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={name} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between gap-2">
                <span
                  onClick={() => handleStartEdit(globalIdx, name)}
                  className="font-bold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer select-none truncate"
                  title="Click to edit"
                >
                  {name}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleStartEdit(globalIdx, name)}
                    className="text-slate-400 hover:text-blue-600 p-1 cursor-pointer"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteItem(name)}
                    className="text-red-400 hover:text-red-600 p-1 cursor-pointer"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-bold flex items-center gap-2 animate-toast-in">
            <Check className="w-4 h-4" />
            {toast}
          </div>
        </div>
      )}
    </div>
  );
};
