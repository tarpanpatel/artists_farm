import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Receipt, AlertCircle, Loader2, Search, CheckCircle2, FileText } from 'lucide-react';
import { t } from '../i18n/en';
import { useConfirm } from './ConfirmDialogContext';
import { Button } from './Button';
import { Input } from './Input';

interface BillItem {
  id: number;
  label: string;
  default_amount: number;
  description: string;
}

export const DefaultBillsManager: React.FC = () => {
  const { confirm } = useConfirm();
  const [bills, setBills] = useState<BillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newItem, setNewItem] = useState({ label: '', description: '' });
  const [editingItem, setEditingItem] = useState<BillItem | null>(null);
  const [editForm, setEditForm] = useState({ label: '', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadBills();
  }, []);

  // Auto-dismiss success/error after 4 s
  useEffect(() => {
    if (!success && !error) return;
    const t = setTimeout(() => { setSuccess(null); setError(null); }, 4000);
    return () => clearTimeout(t);
  }, [success, error]);

  const loadBills = async () => {
    try {
      setLoading(true);
      const response = await fetch('/php/api/router.php?action=get_bills_catalog', {
        credentials: 'include',
      });
      const data = await response.json();
      if ((data.success || data.status === 'success') && Array.isArray(data.data)) {
        setBills(data.data);
      }
      setError(null);
    } catch (err) {
      setError('Failed to load bills catalog');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.label.trim()) {
      setError('Bill name is required');
      return;
    }
    try {
      setSaving(true);
      const response = await fetch('/php/api/router.php?action=add_bill_item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ label: newItem.label.trim(), description: newItem.description.trim() }),
      });
      const data = await response.json();
      if (data.success || data.status === 'success') {
        setSuccess('Bill item added successfully!');
        setNewItem({ label: '', description: '' });
        setIsAddingNew(false);
        loadBills();
      } else {
        setError(data.message || 'Failed to add item');
      }
    } catch {
      setError('Failed to add bill item');
    } finally {
      setSaving(false);
    }
  };

  const handleEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editForm.label.trim()) return;
    try {
      setSaving(true);
      const response = await fetch('/php/api/router.php?action=add_bill_item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: editingItem.id,
          label: editForm.label.trim(),
          description: editForm.description.trim(),
        }),
      });
      const data = await response.json();
      if (data.success || data.status === 'success') {
        setSuccess('Bill item updated successfully!');
        setEditingItem(null);
        loadBills();
      } else {
        setError(data.message || 'Failed to update item');
      }
    } catch {
      setError('Failed to update bill item');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (item: BillItem) => {
    const confirmed = await confirm({
      title: 'Delete Bill Item',
      message: `Delete "${item.label}"? This will remove it from the Bills autocomplete suggestions.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      setSaving(true);
      const response = await fetch('/php/api/router.php?action=delete_bill_item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: item.id }),
      });
      const data = await response.json();
      if (data.success || data.status === 'success') {
        setSuccess('Bill item deleted.');
        loadBills();
      } else {
        setError(data.message || 'Failed to delete item');
      }
    } catch {
      setError('Failed to delete bill item');
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
  const filteredBills = query
    ? bills.filter((b) => b.label.toLowerCase().includes(query) || b.description?.toLowerCase().includes(query))
    : bills;

  return (
    <div className="default-bills-manager space-y-4 p-3 sm:p-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Receipt className="w-5 h-5 text-blue-600 shrink-0" />
              <span className="truncate">Default Bills (MultiKey)</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Manage the default bill types. These appear as autocomplete suggestions on the Expenses form when <strong>Bills</strong> is selected as the category.
            </p>
          </div>
          <button
            onClick={() => setIsAddingNew(!isAddingNew)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add New Bill
          </button>
        </div>
        <div className="relative mt-3">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search bill types..."
            className="pl-9"
          />
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex gap-2 items-center">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          <p className="text-green-700 dark:text-green-300 text-sm">{success}</p>
        </div>
      )}

      {/* Add New Form */}
      {isAddingNew && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-blue-200 dark:border-blue-800 p-5 space-y-3 max-w-lg">
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-600" />
            Add New Bill Type
          </h3>
          <form onSubmit={handleAddItem} className="space-y-3">
            <div>
              <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                Bill Name <span className="text-red-500">*</span>
              </label>
              <Input
                value={newItem.label}
                onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
                placeholder="e.g., Electricity Bill"
                autoFocus
              />
            </div>
            <div>
              <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                Description / Notes (Optional)
              </label>
              <Input
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                placeholder="e.g., Monthly electricity charges from PGVCL"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" size="md" disabled={saving}>
                {saving ? 'Saving...' : 'Add Bill'}
              </Button>
              <Button type="button" variant="secondary" size="md" onClick={() => { setIsAddingNew(false); setNewItem({ label: '', description: '' }); }}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Empty State */}
      {bills.length === 0 && !loading && (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 p-8 text-center">
          <Receipt className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <p className="text-sm text-slate-600 dark:text-slate-400">No bill types yet. Click <strong>"Add New Bill"</strong> to create your first one.</p>
        </div>
      )}

      {/* No Search Results */}
      {bills.length > 0 && query && filteredBills.length === 0 && (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 p-8 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">No bill types match "{searchQuery}".</p>
        </div>
      )}

      {/* Bills Grid */}
      {filteredBills.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-slate-100 dark:bg-slate-700 px-4 py-2 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Bills Catalog</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">{filteredBills.length} item{filteredBills.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="p-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
              {filteredBills.map((item) => (
                <div key={item.id} className="bg-slate-50 dark:bg-slate-700/50 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 hover:shadow-md dark:hover:bg-slate-700 transition-all">
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-1">
                      <FileText className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
                      <span className="font-semibold text-slate-900 dark:text-white text-xs leading-tight flex-1 line-clamp-2">{item.label}</span>
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-1 py-0.5 rounded whitespace-nowrap shrink-0">#{item.id}</span>
                    </div>
                    {item.description && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight line-clamp-1 pl-4">{item.description}</p>
                    )}
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditingItem(item);
                          setEditForm({ label: item.label, description: item.description || '' });
                        }}
                        className="flex-1 p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded text-[11px] font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        title="Edit"
                      >
                        <Edit2 className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item)}
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
      )}

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-blue-600" />
              Edit Bill Item
            </h3>
            <form onSubmit={handleEditItem} className="space-y-4">
              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Bill Name</label>
                <Input
                  value={editForm.label}
                  onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                  autoFocus
                />
              </div>
              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Description / Notes (Optional)</label>
                <Input
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="e.g., Monthly electricity charges"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {saving ? 'Saving...' : 'Update'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg cursor-pointer transition-colors"
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
