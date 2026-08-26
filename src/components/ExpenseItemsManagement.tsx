import React, { useState, useEffect } from 'react';
import { Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from 'flowbite-react';
import { TablePagination } from './TablePagination';
import { Plus, Trash2, RefreshCw, Loader2, Lock, Pencil, ArrowLeft } from './icons/FlowbiteIcons';
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
  const [itemNameTouched, setItemNameTouched] = useState(false);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [mobilePage, setMobilePage] = useState(1);
  const [desktopPage, setDesktopPage] = useState(1);
  const DESKTOP_PAGE_SIZE = 15;
  const [categories, setCategories] = useState<string[]>([]);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const CREATE_CATEGORY_OPTION = '__create_new_category__';

  const loadItems = async () => {
    try {
      setLoading(true);
      const data = await fetchMiscCatalogFromDB();
      if (Array.isArray(data)) {
        setItems(data as any as ExpenseItem[]);
        const uniqueCats = Array.from(
          new Set(
            data
              .map((item: any) => (item.category || '').trim())
              .filter((c: string) => c.length > 0)
          )
        ).sort() as string[];
        setCategories(uniqueCats);
      }
    } catch (err) {
      showToast('Failed to load expense items', { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.label.trim()) {
      setItemNameTouched(true);
      showToast('Please enter an item name', { type: 'error' });
      return;
    }

    const finalCategory = isCreatingCategory ? newCategoryName.trim() : newItem.category.trim();
    if (!finalCategory) {
      setCategoryTouched(true);
      showToast('Please select or enter a category', { type: 'error' });
      return;
    }

    try {
      setSaving(true);
      const payload = {
        id: editingId !== null ? editingId : undefined,
        label: newItem.label.trim(),
        category: finalCategory,
        default_amount: parseFloat(newItem.default_amount) || 0,
      };

      const response = await apiFetch('/php/api/router.php?action=add_misc_charge_template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (data.success || data.status === 'success') {
        showToast(
          editingId !== null ? 'Expense item updated successfully!' : 'Expense item added successfully!',
          { type: 'success' }
        );
        handleCancelForm();
        loadItems();
      } else {
        showToast(data.message || 'Failed to save item', { type: 'error' });
      }
    } catch (err) {
      showToast('Failed to save expense item', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = (item: ExpenseItem) => {
    setEditingId(item.id);
    setNewItem({
      label: item.label,
      category: item.category || '',
      default_amount: item.default_amount !== undefined ? String(item.default_amount) : '',
    });
    setIsCreatingCategory(false);
    setNewCategoryName('');
    setIsAddingNew(true);
  };

  const handleCancelForm = () => {
    setIsAddingNew(false);
    setEditingId(null);
    setNewItem({ label: '', category: '', default_amount: '' });
    setIsCreatingCategory(false);
    setNewCategoryName('');
    setItemNameTouched(false);
    setCategoryTouched(false);
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
      cell: (row: ExpenseItem) => (
        <Badge variant="info" size="sm">
          {row.category}
        </Badge>
      ),
    },
    {
      name: t('default_amount_label', 'Amount (₹)'),
      align: 'right' as const,
      cell: (row: ExpenseItem) => (
        <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-xs tabular-nums whitespace-nowrap">
          ₹{Number(row.default_amount || 0).toLocaleString('en-IN')}
        </span>
      ),
    },
    {
      name: t('actions_column', 'Actions'),
      align: 'right' as const,
      cell: (row: ExpenseItem) => (
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleEditClick(row)}
            disabled={saving}
            className="whitespace-nowrap shrink-0"
            leftIcon={<Pencil className="w-3.5 h-3.5 shrink-0" />}
          >
            {t('edit_button', 'Edit')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleDeleteItem(row.id, row.label)}
            disabled={saving}
            className="whitespace-nowrap shrink-0"
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
                  onBlur={() => setItemNameTouched(true)}
                  error={itemNameTouched && !newItem.label.trim() ? 'This field is required' : undefined}
                  placeholder={t('item_name_placeholder', 'e.g., Floor Cleaner')}
                />
              </div>
              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('category_required_label', 'Category *')}
                </label>
                {isCreatingCategory ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      autoFocus
                      value={newItem.category}
                      onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                      onBlur={() => setCategoryTouched(true)}
                      error={categoryTouched && !newItem.category.trim() ? 'This field is required' : undefined}
                      placeholder={t('new_category_name_placeholder', 'New category name')}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => { setIsCreatingCategory(false); setNewItem({ ...newItem, category: '' }); }}
                      title={t('back_to_category_list_tooltip', 'Back to category list')}
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <StyledSelect
                    value={newItem.category}
                    onChange={(value) => {
                      if (value === CREATE_CATEGORY_OPTION) {
                        setIsCreatingCategory(true);
                        setNewItem({ ...newItem, category: '' });
                      } else {
                        setNewItem({ ...newItem, category: value });
                      }
                    }}
                    placeholder={t('select_category_placeholder', '-- Select Category --')}
                    searchable
                    options={[
                      { value: CREATE_CATEGORY_OPTION, label: `+ ${t('create_new_category_option', 'Create New Category')}` },
                      ...categories.map((cat) => ({ value: cat, label: cat })),
                    ]}
                  />
                )}
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
                    setItemNameTouched(false);
                    setCategoryTouched(false);
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

          <div className="hidden md:block overflow-x-auto">
            {loading ? (
              <div className="p-8 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500 font-semibold text-xs">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading items...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-8 text-slate-500 font-medium">
                {t('no_expense_items_loaded_text')}
              </div>
            ) : (
              <>
                <Table hoverable>
                  <TableHead>
                    <TableRow>
                      {columns.map((col) => (
                        <TableHeadCell key={col.name} className={col.align === 'right' ? 'text-right' : ''}>
                          {col.name}
                        </TableHeadCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredItems.slice((desktopPage - 1) * DESKTOP_PAGE_SIZE, desktopPage * DESKTOP_PAGE_SIZE).map((row) => (
                      <TableRow key={row.id} className="bg-white dark:bg-gray-800">
                        {columns.map((col) => (
                          <TableCell key={col.name} className={col.align === 'right' ? 'text-right' : ''}>
                            {col.cell(row)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination
                  page={desktopPage}
                  totalItems={filteredItems.length}
                  pageSize={DESKTOP_PAGE_SIZE}
                  onPageChange={setDesktopPage}
                  itemLabel="items"
                />
              </>
            )}
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
