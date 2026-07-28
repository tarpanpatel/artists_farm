import React, { useState, useEffect } from 'react';
import DataTable, { TableProps } from 'react-data-table-component';
import { Plus, Pencil, Trash2, RefreshCw, Check, X } from 'lucide-react';
import { fetchExpenseItemsFromDB, addExpenseItemToDB, deleteExpenseItemFromDB } from '../services/api';

interface ItemRow {
  id: number;
  name: string;
}

const customStyles: TableProps<ItemRow>['customStyles'] = {
  subHeader: {
    style: { padding: 0, minHeight: 0, backgroundColor: 'transparent' },
  },
  headRow: {
    style: { backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' },
  },
  headCells: {
    style: { fontSize: '11px', fontWeight: 600, color: '#64748b', paddingLeft: '12px' },
  },
  cells: {
    style: { fontSize: '13px', color: '#334155', padding: '12px' },
  },
  rows: {
    style: { minHeight: '52px' },
  },
};

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

  const rows: ItemRow[] = filtered.map((name, idx) => ({
    id: items.indexOf(name) + 1,
    name,
  }));

  const columns = [
    {
      name: '#',
      selector: (row: ItemRow) => row.id,
      width: '50px',
    },
    {
      name: 'Item Name',
      selector: (row: ItemRow) => row.name,
      sortable: true,
      grow: 1,
      cell: (row: ItemRow) => {
        const globalIdx = items.indexOf(row.name);
        const isEditing = editingIndex === globalIdx;

        if (isEditing) {
          return (
            <div className="flex items-center gap-2 w-full">
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveEdit(row.name);
                  if (e.key === 'Escape') setEditingIndex(null);
                }}
                onBlur={() => handleSaveEdit(row.name)}
                autoFocus
                className="flex-1 p-1 border border-blue-500 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold text-xs"
              />
              <button
                onClick={() => handleSaveEdit(row.name)}
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
          );
        }

        return (
          <span
            onClick={() => handleStartEdit(globalIdx, row.name)}
            className="font-bold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer select-none"
            title="Click to edit"
          >
            {row.name}
          </span>
        );
      },
    },
    {
      name: 'Actions',
      width: '80px',
      cell: (row: ItemRow) => {
        const globalIdx = items.indexOf(row.name);
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleStartEdit(globalIdx, row.name)}
              className="text-slate-400 hover:text-blue-600 p-0.5 cursor-pointer"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDeleteItem(row.name)}
              className="text-red-400 hover:text-red-600 p-0.5 cursor-pointer"
              title="Remove"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      },
    },
  ];

  const subHeader = (
    <div className="flex flex-col gap-3 p-4 bg-slate-50 border-b border-slate-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
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
                className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
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
            className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded font-mono text-slate-500">
            {items.length} Items
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search items..."
            className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
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

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={rows}
          progressPending={loading}
          pagination
          paginationPerPage={10}
          paginationRowsPerPageOptions={[10, 25, 50, 100]}
          subHeader={subHeader}
          customStyles={customStyles}
          noDataComponent={
            <div className="text-center p-8 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 font-semibold">
              {items.length === 0 ? 'Registry is empty. Click "Add New Item" to get started.' : 'No items match your search.'}
            </div>
          }
        />
      </div>

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
