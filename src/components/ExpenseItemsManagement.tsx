import React, { useState, useEffect, useMemo } from 'react';
import DataTable from 'react-data-table-component';
import { flowbiteTableCustomStyles } from '../utils/tableStyles';
import { Plus, Trash2, RefreshCw, Loader2, Lock, Pencil } from 'lucide-react';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import { StyledSelect } from './StyledSelect';
import { Button } from './Button';
import { Input } from './Input';
import { Badge } from './Badge';
import { getExpenseItemIcon } from '../utils/expenseIcons';
import { PageHeader } from './PageHeader';
import { t } from '../i18n/en';
import { apiFetch, fetchMiscCatalogFromDB } from '../services/api';

interface ExpenseItem {
  id: number;
  label: string;
  category: string;
  default_amount: number;
  is_system_default: boolean;
  selected_icon?: string;
}

export const ExpenseItemsManagement: React.FC = () => {
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newItem, setNewItem] = useState({ label: '', category: '', default_amount: '' });
  const [saving, setSaving] = useState(false);
  // Set when the form (below) is editing an existing row rather than
  // creating a new one - the form itself is reused for both, keyed off this.
  // Editing a system-default row (is_system_default) is allowed too: the
  // backend (add_misc_charge_template, see php/finance/petty_cash.php) is
  // already copy-on-write for that case - it creates a per-property override
  // row instead of mutating the one shared row every other tenant reads, so
  // this component doesn't need to special-case defaults itself.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [mobilePage, setMobilePage] = useState(1);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const loadItems = async () => {
    try {
      setLoading(true);
      // fetchMiscCatalogFromDB() (shared with PettyCashManagement.tsx et al.)
      // returns a FLAT array of rows - render it as a flat DataTable (Category
      // is just a column/badge here) rather than grouping into per-category
      // sections. This used to `setExpenses(data.data)` directly with
      // data.data being that flat array assigned straight into state typed as
      // a grouped { [category]: item[] } shape - Object.keys() on an array
      // returns numeric index strings ("0", "1", ...), so `expenses[category]`
      // resolved to a single item object, not an array, and `.filter()` on it
      // crashed the whole page immediately on every load (found 21 Aug 2026,
      // via "categoryItems.filter is not a function"). Also switched off a
      // bare fetch() with no property_slug/X-Property-Slug context - the
      // backend resolves $propertyId from that, so this was silently at risk
      // of loading (or, in handleAddItem/handleDeleteItem below,
      // writing/deleting) against the wrong property in a multi-tenant
      // request.
      const data = await fetchMiscCatalogFromDB();
      setItems(data as ExpenseItem[]);
    } catch (err) {
      showToast('Failed to load expense categories', { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category || 'Services'))).sort(),
    [items]
  );

  // Category has no separate table/entity of its own - it's just a free-text
  // column on miscellaneous_catalog, and `categories` above is derived from
  // whatever items already exist. So "creating" a category needs no new
  // endpoint at all: it's just letting the form accept a typed name instead
  // of restricting the picker to names that already happen to exist yet.
  // Sentinel option value the picker below watches for to flip into
  // free-text entry mode.
  const CREATE_CATEGORY_OPTION = '__create_new_category__';
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  // Shared by both "Add Custom Item" and "Edit" - the same form/endpoint
  // handles both, distinguished only by whether `editingId` is set (sent as
  // `id` in the payload). See add_misc_charge_template in petty_cash.php.
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.label || !newItem.category || !newItem.default_amount) {
      showToast('All fields are required', { type: 'error' });
      return;
    }

    const isEditing = editingId !== null;
    try {
      setSaving(true);
      const response = await apiFetch('/php/api/router.php?action=add_misc_charge_template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId ?? undefined,
          label: newItem.label,
          category: newItem.category,
          default_amount: parseFloat(newItem.default_amount),
        }),
      });

      const data = await response.json();
      if (data.success || data.status === 'success') {
        showToast(isEditing ? 'Expense item updated successfully!' : 'Expense item added successfully!', { type: 'success' });
        setNewItem({ label: '', category: '', default_amount: '' });
        setEditingId(null);
        setIsAddingNew(false);
        loadItems();
      } else {
        showToast(data.message || (isEditing ? 'Failed to update item' : 'Failed to add item'), { type: 'error' });
      }
    } catch (err) {
      showToast(isEditing ? 'Failed to update expense item' : 'Failed to add expense item', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = (item: ExpenseItem) => {
    setEditingId(item.id);
    setNewItem({
      label: item.label,
      category: item.category || '',
      default_amount: String(item.default_amount ?? ''),
    });
    setIsCreatingCategory(false);
    setIsAddingNew(true);
  };

  const handleCancelForm = () => {
    setIsAddingNew(false);
    setIsCreatingCategory(false);
    setEditingId(null);
    setNewItem({ label: '', category: '', default_amount: '' });
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
      const response = await apiFetch('/php/api/router.php?action=delete_misc_charge_template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const filteredItems = items.filter(
    (item) =>
      !searchQuery ||
      item.label.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
      (item.category || '').toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const columns = [
    {
      name: t('item_name_column', 'Item Name'),
      selector: (row: ExpenseItem) => row.label,
      sortable: true,
      grow: 2,
      minWidth: '220px',
      cell: (row: ExpenseItem) => {
        const ItemIcon = getExpenseItemIcon(row.label, row.category);
        return (
          <div className="flex items-center gap-2 min-w-0">
            <ItemIcon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
            <span className="font-semibold text-slate-900 dark:text-white text-xs truncate">{row.label}</span>
            {!!row.is_system_default && (
              <Badge variant="neutral" size="sm" title={t('system_default_badge', 'Default')}>
                <Lock className="w-3 h-3" />
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      name: t('category_column', 'Category'),
      selector: (row: ExpenseItem) => row.category,
      sortable: true,
      width: '160px',
      cell: (row: ExpenseItem) => (
        <Badge variant="info" size="sm">
          {row.category}
        </Badge>
      ),
    },
    {
      name: t('default_amount_label', 'Default Amount (₹)'),
      selector: (row: ExpenseItem) => row.default_amount,
      sortable: true,
      right: true,
      width: '150px',
      cell: (row: ExpenseItem) => (
        <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-xs tabular-nums">
          ₹{Number(row.default_amount || 0).toLocaleString('en-IN')}
        </span>
      ),
    },
    {
      name: t('actions_column', 'Actions'),
      width: '190px',
      right: true,
      cell: (row: ExpenseItem) => (
        // Editing/deleting a default is allowed - both are copy-on-write on
        // the backend (a per-property override/tombstone), never a mutation
        // of the shared row every other tenant reads. See petty_cash.php's
        // add_misc_charge_template / delete_misc_charge_template.
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleEditClick(row)}
            disabled={saving}
            leftIcon={<Pencil className="w-3.5 h-3.5 shrink-0" />}
          >
            {t('edit_button', 'Edit')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleDeleteItem(row.id, row.label)}
            disabled={saving}
            leftIcon={<Trash2 className="w-3.5 h-3.5 shrink-0" />}
          >
            {t('delete_button', 'Delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="expense-items-management space-y-6">
      <PageHeader
        title={t('predefined_expense_items_heading', 'Predefined Expense Items')}
        subtitle={t('expense_items_description', 'Add custom items, or edit/delete any item including system defaults (marked) - changes to a default only apply to this property.')}
      />

      {/* Messages */}
      {items.length === 0 && !loading && (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 p-12 text-center">
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            {t('no_expense_items_loaded_text')}
          </p>
        </div>
      )}

      {/* Add Item Form (sits above the table per DESIGN.md's Vertical Hierarchy rule) */}
      {isAddingNew && (
        <div data-testid="flowbite-card" className="flex rounded-lg border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-800 flex-col p-4">
          <form onSubmit={handleAddItem} className="app-form app-form--add-expense-item space-y-4">
            <h3 className="expense-items-management__subtitle font-semibold text-slate-900 dark:text-white">
              {editingId !== null ? t('edit_expense_item_heading', 'Edit Expense Item') : t('add_custom_expense_item_heading', 'Add Custom Expense Item')}
            </h3>
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
              <Button type="submit" variant="success" size="md" disabled={saving}>
                {saving
                  ? t('saving_ellipsis_button', 'Saving...')
                  : editingId !== null
                    ? t('save_changes_button', 'Save Changes')
                    : t('add_item_button', 'Add Item')}
              </Button>
              <Button type="button" variant="secondary" size="md" onClick={handleCancelForm}>
                {t('cancel_button', 'Cancel')}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Table Card */}
      {items.length > 0 && (
        <div className="expense-items-management__table-card bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-800">
            <div className="flex items-center gap-2">
              <Button
                variant="success"
                size="md"
                onClick={() => {
                  // Toggling this open fresh (not via handleEditClick) must
                  // never leave a stale editingId around - otherwise
                  // submitting would silently PATCH whatever row was last
                  // edited instead of creating a new item.
                  if (isAddingNew) {
                    handleCancelForm();
                  } else {
                    setEditingId(null);
                    setNewItem({ label: '', category: '', default_amount: '' });
                    setIsCreatingCategory(false);
                    setIsAddingNew(true);
                  }
                }}
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
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search_items_categories_placeholder', 'Search items or categories...')}
              />
            </div>
          </div>

          <div className="hidden md:block">
            <DataTable
              columns={columns}
              data={filteredItems}
              customStyles={flowbiteTableCustomStyles}
              highlightOnHover
              persistTableHead
              pagination
              paginationPerPage={15}
              paginationRowsPerPageOptions={[5, 10, 15, 20, 25, 50]}
              progressPending={loading}
              progressComponent={
                <div className="p-8 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500 font-semibold text-xs">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading items...
                </div>
              }
              noDataComponent={
                <div className="text-center py-8 text-slate-500 font-medium">
                  {t('no_expense_items_loaded_text')}
                </div>
              }
              responsive
            />
          </div>

          {/* Touch-First Mobile Cards View with 10-Item Pagination */}
          <div className="md:hidden p-4 space-y-3">
            {(() => {
              const paginatedItems = filteredItems.slice((mobilePage - 1) * 10, mobilePage * 10);
              return (
                <>
                  <div className="space-y-2.5">
                    {paginatedItems.map((item) => {
                      const ItemIcon = getExpenseItemIcon(item.label, item.category);
                      return (
                        <div key={item.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3.5 space-y-2 shadow-md">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <ItemIcon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                                <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate">{item.label}</h4>
                                {!!item.is_system_default && (
                                  <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded inline-block">
                                  {item.category || 'Services'}
                                </span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                                  ₹{Number(item.default_amount || 0).toLocaleString('en-IN')}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleEditClick(item)}
                                disabled={saving}
                                className="px-2 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 font-semibold text-xs rounded-lg transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>{t('edit_button', 'Edit')}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item.id, item.label)}
                                disabled={saving}
                                className="px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-slate-200 dark:border-slate-700 font-semibold text-xs rounded-lg transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>{t('delete_button', 'Delete')}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {filteredItems.length === 0 && (
                      <div className="text-center py-6 text-slate-500 font-medium text-xs">
                        {t('no_expense_items_loaded_text')}
                      </div>
                    )}
                  </div>

                  {filteredItems.length > 10 && (
                    <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        disabled={mobilePage === 1}
                        onClick={() => setMobilePage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                      >
                        Previous
                      </button>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Page {mobilePage} of {Math.ceil(filteredItems.length / 10)}
                      </span>
                      <button
                        type="button"
                        disabled={mobilePage >= Math.ceil(filteredItems.length / 10)}
                        onClick={() => setMobilePage((p) => Math.min(Math.ceil(filteredItems.length / 10), p + 1))}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
