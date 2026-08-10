import React, { useState, useEffect, useReducer } from 'react';
import { X, Search, Edit2, FileText, ImageIcon, Landmark } from 'lucide-react';
import DataTable from 'react-data-table-component';
import { PettyCashEntry } from '../types';
import { useStaff } from '../contexts/StaffContext';
import { useFinance } from '../contexts/FinanceContext';
import { fetchExpenseItemPricesFromDB, fetchStaffUsersFromDB, addDrawerEntryToDB, recordOutOfPocketCredit } from '../services/api';
import { useToast } from './ToastContext';
import { StyledSelect } from './StyledSelect';
import { PageHeader } from './PageHeader';
import { DatePicker } from './DatePicker';
import { t } from '../i18n/en';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

interface PettyCashManagementProps {
  activeRole?: string;
  onDispatchTelegram?: (eventType: string, message: string, channelFilter?: 'all' | 'kitchen' | 'finance' | 'admin', replyMarkup?: any, templateKey?: string) => void;
}

interface FormState {
  expenseDate: string;
  category: string;
  description: string;
  moreInfoNotes: string;
  amount: number | '';
  paymentMode: string;
  paidBy: string;
  showDrawerSplit: boolean;
  drawerAmount: number | '';
  staffAmount: number | '';
  invoiceBillUrl: string;
  paymentScreenshotUrl: string;
}

type FormAction =
  | { type: 'SET_FIELD'; field: keyof FormState; value: any }
  | { type: 'RESET_FORM' };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'RESET_FORM':
      return {
        ...state,
        description: '',
        moreInfoNotes: '',
        amount: '',
        invoiceBillUrl: '',
        paymentScreenshotUrl: '',
        showDrawerSplit: false,
        drawerAmount: '',
        staffAmount: '',
      };
    default:
      return state;
  }
}

export const PettyCashManagement: React.FC<PettyCashManagementProps> = ({
  activeRole,
  onDispatchTelegram,
}) => {
  const { staff } = useStaff();
  const { pettyCash, addPettyCash, updatePettyCash, deletePettyCash } = useFinance();
  const { showToast } = useToast();
  const [formState, dispatch] = useReducer(formReducer, undefined, (): FormState => ({
    expenseDate: new Date().toISOString().split('T')[0],
    category: 'Other',
    description: '',
    moreInfoNotes: '',
    amount: '',
    paymentMode: 'UPI / QR',
    paidBy: 'Tarpan',
    showDrawerSplit: false,
    drawerAmount: '',
    staffAmount: '',
    invoiceBillUrl: '',
    paymentScreenshotUrl: '',
  }));
  const [financialHandlers, setFinancialHandlers] = useState<any[]>(staff.filter(u => u.isFinancialHandler));

  useEffect(() => {
    fetchStaffUsersFromDB().then((users) => {
      if (users && users.length > 0) {
        const handlers = users.filter((u: any) => u.isFinancialHandler);
        if (handlers.length > 0) {
          setFinancialHandlers(handlers);
        }
      }
    });
  }, []);

  // Sync split fields when amount/visibility changes and fields are empty
  useEffect(() => {
    const numAmt = formState.amount === '' ? 0 : Number(formState.amount);
    if (numAmt <= 0) return;
    if (formState.drawerAmount === '' && formState.staffAmount === '') {
      dispatch({ type: 'SET_FIELD', field: 'drawerAmount', value: 0 });
      dispatch({ type: 'SET_FIELD', field: 'staffAmount', value: numAmt });
    }
  }, [formState.amount, formState.showDrawerSplit]);

  // Item prices map from database
  const [itemPrices, setItemPrices] = useState<Record<string, number>>({});

  // Expense items list from database (replaces hardcoded array)
  const [expenseItems, setExpenseItems] = useState<string[]>([]);

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

  // Structured expense data from get_misc_catalog
  const [, setExpensesByCategory] = useState<CategoryGroup>({});

  // Inline Editing State / Modal Edit State for Admin & Super Admin
  const [editingEntry, setEditingEntry] = useState<PettyCashEntry | null>(null);
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'date' | 'amount' } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);

  // Search & Pagination State
  // Was hardcoded to '2026-07' - every month after July this silently filtered out
  // newly added expenses, since the Add Expense form's date defaults to today (see
  // expenseDate init below) but the ledger view stayed stuck showing July forever.
  const [selectedMonth, setSelectedMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch prices and item list from DB on mount
  useEffect(() => {
    fetchExpenseItemPricesFromDB().then((prices) => {
      if (prices && Object.keys(prices).length > 0) {
        setItemPrices(prices);
      }
    });

    // Fetch from get_misc_catalog endpoint
    fetch('/php/api/router.php?action=get_misc_catalog', {
      credentials: 'include',
    })
      .then(res => res.json())
      .then(data => {
        if ((data.success || data.status === 'success') && data.data) {
          setExpensesByCategory(data.data);
          // Flatten to get all item labels for autocomplete
          const allItems = Object.values(data.data)
            .flat()
            .map((item: any) => item.label)
            .sort();
          setExpenseItems(allItems);
          // Build price map
          const prices: Record<string, number> = {};
          Object.values(data.data).flat().forEach((item: any) => {
            prices[item.label] = item.default_amount;
          });
          setItemPrices(prev => ({ ...prev, ...prices }));
        }
      })
      .catch(err => console.error('Failed to fetch expense categories:', err));
  }, []);

  // Derive list of unique months in entries for dropdown
  const uniqueMonths = Array.from(new Set(pettyCash.map(e => e.date.substring(0, 7)))).sort().reverse();
  // Was hardcoded to '2026-07' - with zero expenses recorded yet, the dropdown's only
  // option was permanently "July 2026" regardless of the real date, which didn't match
  // selectedMonth (today's month) and rendered the picker as a blank "Select..." with
  // no way to pick the month that would actually show a freshly-added expense.
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  if (uniqueMonths.length === 0 && !uniqueMonths.includes(currentMonthKey)) {
    uniqueMonths.push(currentMonthKey);
  }

  // Float balance logic

  // Compress & Crop Image Engine
  const handleCompressFile = (file: File, type: 'invoice' | 'screenshot') => {
    console.log('[PettyCash] handleCompressFile start', { type, name: file.name, size: file.size, lastModified: file.lastModified });
    const reader = new FileReader();
    reader.onload = (event) => {
      console.log('[PettyCash] FileReader onload start', { type });
      const img = new Image();
      img.onload = () => {
        console.log('[PettyCash] image onload', { type, width: img.width, height: img.height });
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
          dispatch({ type: 'SET_FIELD', field: type === 'invoice' ? 'invoiceBillUrl' : 'paymentScreenshotUrl', value: compressedBase64 });
          console.log('[PettyCash] canvas dispatch done', { type });
        } else {
          console.warn('[PettyCash] canvas 2D context unavailable', { type });
        }
      };
      img.onerror = () => {
        console.error('[PettyCash] image onerror from FileReader result', { type, srcLength: typeof event.target?.result === 'string' ? event.target.result.length : 'n/a' });
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      console.error('[PettyCash] FileReader onerror', { type, file: file.name });
    };
    reader.readAsDataURL(file);
    console.log('[PettyCash] FileReader readAsDataURL called', { type });
  };

  // Handle Description change with Auto-fill Price lookup
  const handleDescriptionChange = (val: string) => {
    dispatch({ type: 'SET_FIELD', field: 'description', value: val });
    const trimmed = val.trim();
    if (trimmed && itemPrices[trimmed] !== undefined) {
      dispatch({ type: 'SET_FIELD', field: 'amount', value: itemPrices[trimmed] });
    } else {
      // Check case-insensitive match
      const matchedKey = Object.keys(itemPrices).find(
        k => k.toLowerCase() === trimmed.toLowerCase()
      );
      if (matchedKey && itemPrices[matchedKey] !== undefined) {
        dispatch({ type: 'SET_FIELD', field: 'amount', value: itemPrices[matchedKey] });
      }
    }
  };

  // Form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.description || !formState.amount) return;

    // Security Gate check for Salaries
    if ((formState.category === 'Salaries' || formState.category === 'Salary (Auto)') && activeRole !== 'Admin' && activeRole !== 'Super Admin') {
      showToast('🔒 Access Denied: Only Admins or Super Admins are authorized to record Salary payments.', { type: 'error' });
      return;
    }

    const finalDescription = formState.category === 'Salaries' ? `Salary payout for ${formState.description}` : formState.description;

    const entry: PettyCashEntry = {
      id: `pc-${Date.now().toString().slice(-4)}`,
      date: formState.expenseDate,
      costCategory: formState.category,
      category: formState.category,
      description: finalDescription,
      moreInfoNotes: formState.moreInfoNotes || undefined,
      vendor: formState.paidBy,
      paidBy: formState.paidBy,
      amount: Number(formState.amount),
      paymentMode: formState.paymentMode,
      invoiceBillUrl: formState.invoiceBillUrl || undefined,
      paymentScreenshotUrl: formState.paymentScreenshotUrl || undefined,
      type: 'Expense'
    };

    addPettyCash(entry);

    const handler = financialHandlers.find((h: any) => h.name === formState.paidBy);
    if (formState.drawerAmount && Number(formState.drawerAmount) > 0) {
      addDrawerEntryToDB({
        staff_id: handler?.id || '',
        staff_name: handler?.name || handler?.username || formState.paidBy,
        type: 'handover',
        amount: Number(formState.drawerAmount),
        notes: `Drawer paid for ${finalDescription} (${formState.category})`,
      });
    }
    if (formState.staffAmount && Number(formState.staffAmount) > 0) {
      recordOutOfPocketCredit({
        staff_id: handler?.id || '',
        staff_name: handler?.name || handler?.username || formState.paidBy,
        amount: Number(formState.staffAmount),
        description: `Out-of-pocket for ${finalDescription} (${formState.category})`,
      });
    }

    if (onDispatchTelegram) {
      const d = Number(formState.drawerAmount || 0);
      const s = Number(formState.staffAmount || 0);
      const msg = `<b>💸 EXPENSE RECORDED</b>\n━━━━━━━━━━━━━━━━\n📂 <b>Category:</b> ${formState.category}\n📝 <b>Description:</b> ${finalDescription}\n👤 <b>Paid By:</b> ${formState.paidBy}\n🏦 <b>Farm Cash:</b> ₹${d.toLocaleString('en-IN')}\n👝 <b>Out of Pocket:</b> ₹${s.toLocaleString('en-IN')}\n💰 <b>Total:</b> ₹${Number(formState.amount).toLocaleString('en-IN')}\n━━━━━━━━━━━━━━━━`;
      onDispatchTelegram('Expense', msg, 'finance');
    }

    // Update item price tracking map locally
    if (formState.category === 'Other' && formState.description.trim() && formState.amount) {
      setItemPrices(prev => ({ ...prev, [formState.description.trim()]: Number(formState.amount) }));
    }

    // Reset Form
    dispatch({ type: 'RESET_FORM' });
  };

  // Double click cell to edit inline
  const handleCellDoubleClick = (entryId: string, field: 'date' | 'amount', currentValue: any) => {
    if (activeRole !== 'Admin' && activeRole !== 'Super Admin') return;
    setEditingCell({ id: entryId, field });
    setEditValue(String(currentValue));
  };

  const handleCellSave = (entryId: string) => {
    if (!editingCell) return;

    const original = pettyCash.find(e => e.id === entryId);
    if (!original) return;

    const updated: PettyCashEntry = {
      ...original,
      [editingCell.field]: editingCell.field === 'amount' ? Number(editValue) : editValue
    };

    updatePettyCash(updated);

    if (updated.description && updated.amount) {
      setItemPrices(prev => ({ ...prev, [updated.description.trim()]: Number(updated.amount) }));
    }

    setEditingCell(null);
  };

  // Save Modal Edit
  const handleSaveModalEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;
    updatePettyCash(editingEntry);
    if (editingEntry.description && editingEntry.amount) {
      setItemPrices(prev => ({ ...prev, [editingEntry.description.trim()]: Number(editingEntry.amount) }));
    }
    setEditingEntry(null);
  };

  // Delete Expense
  const handleDeleteExpense = (id: string, description: string) => {
    (window as any).showConfirm(`Delete expense "${description}"? This cannot be undone.`, async () => {
      deletePettyCash(id);
    });
  };

  // Filter entries
  const filteredEntries = pettyCash.filter(e => {
    const matchesMonth = e.date.startsWith(selectedMonth);
    const text = (e.description + ' ' + (e.category || e.costCategory || '') + ' ' + (e.paidBy || '') + ' ' + e.amount).toLowerCase();
    const matchesSearch = text.includes(searchQuery.toLowerCase());
    return matchesMonth && matchesSearch;
  });

  return (    <div className="expenses-page-container space-y-6 text-xs text-slate-800 dark:text-slate-200">
      {/* Datalist for Details Descriptions Autocomplete */}
      <datalist id="expense-items-list">
        {expenseItems.map(item => (
          <option key={item} value={item} />
        ))}
      </datalist>

      <PageHeader
        title={t('petty_cash_ledger_heading', 'Operational Expenses Ledger')}
        subtitle={t('petty_cash_ledger_subtitle', 'Track outgoing utility expenditures, daily kitchen purchases, salaries, and floats.')}
      />

      {/* Add Expenses form on the left, registered expenses (filter + Cost
          Logs table) on the right on wide screens - stacks to form-then-logs
          on narrow screens since a fixed side-by-side track can't fit. */}
      <div className="grid grid-cols-1 lg:grid-cols-[550px_1fr] gap-6 items-start">
      <div className="add-expenses-container w-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5">
        <h3 className="font-bold text-slate-900 dark:text-white text-sm border-l-3 border-red-500 pl-2.5 mb-4 flex items-center gap-1.5">
          {t('add_expenses_heading', '📝 ADD EXPENSES')}
        </h3>

        <form onSubmit={handleSubmit} className="add-expense-form space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <DatePicker
                label={t('expense_date_label', 'Expense Date')}
                title={t('expense_date_label', 'Expense Date')}
                value={formState.expenseDate}
                onChange={val => dispatch({ type: 'SET_FIELD', field: 'expenseDate', value: val })}
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-bold mb-1">{t('cost_category_group_label', 'Cost Category Group')}</label>
              <StyledSelect
                value={formState.category}
                onChange={val => dispatch({ type: 'SET_FIELD', field: 'category', value: val })}
                options={[
                  { value: 'Other', label: t('category_other_label', 'Other') },
                  { value: 'Salaries', label: t('category_salaries_manual_label', 'Salaries (Manual)') },
                  { value: 'Salary (Auto)', label: t('category_salary_auto_label', 'Salary (Auto)') },
                  { value: 'Bills', label: t('category_bills_label', 'Bills') },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-bold mb-1">{t('details_descriptions_label', 'Details Descriptions *')}</label>
            {formState.category === 'Salaries' || formState.category === 'Salary (Auto)' ? (
              <div>
                <StyledSelect
                  value={formState.description}
                  onChange={handleDescriptionChange}
                  placeholder={t('select_staff_beneficiary_placeholder', '-- Select Staff Beneficiary --')}
                  options={staff.map(s => ({ value: s.name, label: `${s.name} (${s.role})` }))}
                />
                {(formState.category === 'Salaries' || formState.category === 'Salary (Auto)') && activeRole !== 'Admin' && activeRole !== 'Super Admin' && (
                  <p className="text-red-500 font-semibold text-[10px] mt-1">{t('salary_access_warning_message', '🔒 Warning: You are not logged in as Admin. Salary submission will be blocked.')}</p>
                )}
              </div>
            ) : (
              <div className="relative">
                <Input
                  type="text"
                  required
                  value={formState.description}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  onChange={e => {
                    handleDescriptionChange(e.target.value);
                    setShowSuggestions(true);
                  }}
                  placeholder={t('description_search_placeholder', 'Type to search items... (e.g., MCB, Petrol, Water Bill)')}
                />
                
                {/* Interactive Auto-suggestions Dropdown Menu */}
                {showSuggestions && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {expenseItems.filter(item => 
                      item.toLowerCase().includes(formState.description.toLowerCase().trim())
                    ).map(item => (
                      <div
                        key={item}
                        onMouseDown={() => {
                          handleDescriptionChange(item);
                          setShowSuggestions(false);
                        }}
                        className="p-2.5 hover:bg-cyan-50 dark:hover:bg-slate-800 cursor-pointer font-medium text-slate-800 dark:text-slate-200 flex items-center justify-between transition-colors"
                      >
                        <span>{item}</span>
                        {itemPrices[item] !== undefined && (
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono px-2 py-0.5 rounded">
                            Last ₹{itemPrices[item]}
                          </span>
                        )}
                      </div>
                    ))}
                    {expenseItems.filter(item => 
                      item.toLowerCase().includes(formState.description.toLowerCase().trim())
                    ).length === 0 && (
                      <div className="p-3 text-slate-400 italic text-center">
                        {t('no_matching_items_message', 'No matching pre-stored items found. You can still type a custom description!')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-bold mb-1">{t('more_information_label', '& More Information (If Any)')}</label>
            <Textarea
              value={formState.moreInfoNotes}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'moreInfoNotes', value: e.target.value })}
              placeholder={t('optional_notes_placeholder', 'Optional contextual notes...')}
              className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white h-20 font-medium"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Input
                label={t('expense_amount_rupees_required_label', 'Amount (₹) *')}
                type="number"
                step="0.01"
                required
                value={formState.amount}
                onChange={e => dispatch({ type: 'SET_FIELD', field: 'amount', value: e.target.value === '' ? '' : Number(e.target.value) })}
                placeholder={t('expense_amount_placeholder', 'e.g., 450')}
                className="font-bold"
              />
              {formState.description.trim() && itemPrices[formState.description.trim()] !== undefined && (
                <p className="text-[10px] text-emerald-600 font-semibold mt-1">
                  💡 Last input price auto-filled: ₹{itemPrices[formState.description.trim()]} (Editable)
                </p>
              )}
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-bold mb-1">{t('payment_mode_label', 'Payment Mode')}</label>
              <StyledSelect
                value={formState.paymentMode}
                onChange={val => dispatch({ type: 'SET_FIELD', field: 'paymentMode', value: val })}
                options={[
                  { value: 'UPI / QR', label: t('payment_mode_upi_qr_label', 'UPI / QR') },
                  { value: 'Cash', label: t('payment_mode_cash_label', 'Cash') },
                  { value: 'Mixed', label: t('payment_mode_mixed_label', 'Mixed') },
                ]}
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 dark:text-slate-400 font-bold">
              <input
                type="checkbox"
                checked={formState.showDrawerSplit}
                onChange={e => {
                  dispatch({ type: 'SET_FIELD', field: 'showDrawerSplit', value: e.target.checked });
                }}
              />
              <span className="flex items-center gap-1">
                <Landmark size={14} className="text-slate-500" /> {t('from_cash_drawer_label', 'From Cash Drawer')}
              </span>
            </label>

            {formState.showDrawerSplit && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Input
                    label={t('cash_drawer_rupees_label', 'Cash Drawer (₹)')}
                    type="number"
                    min="0"
                    value={formState.drawerAmount}
                    onChange={e => {
                      const val = e.target.value === '' ? '' : Number(e.target.value);
                      dispatch({ type: 'SET_FIELD', field: 'drawerAmount', value: val });
                      if (typeof val === 'number' && typeof formState.amount === 'number' && val <= formState.amount) {
                        dispatch({ type: 'SET_FIELD', field: 'staffAmount', value: formState.amount - val });
                      }
                    }}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Input
                    label={t('out_of_pocket_rupees_label', 'Out of Pocket (₹)')}
                    type="number"
                    min="0"
                    value={formState.staffAmount}
                    onChange={e => {
                      const val = e.target.value === '' ? '' : Number(e.target.value);
                      dispatch({ type: 'SET_FIELD', field: 'staffAmount', value: val });
                      if (typeof val === 'number' && typeof formState.amount === 'number' && val <= formState.amount) {
                        dispatch({ type: 'SET_FIELD', field: 'drawerAmount', value: formState.amount - val });
                      }
                    }}
                    placeholder="0"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-bold mb-1">{t('expense_paid_by_label', 'Paid By')}</label>
              <StyledSelect
                value={formState.paidBy}
                onChange={val => dispatch({ type: 'SET_FIELD', field: 'paidBy', value: val })}
                options={financialHandlers.map(h => ({ value: h.name, label: h.name }))}
              />
            </div>
          </div>

          {/* Proof uploads */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-dashed border-slate-300 dark:border-slate-700 p-4 rounded-xl text-center space-y-2">
              <label className="block font-bold text-slate-600 dark:text-slate-400">{t('capture_upload_invoice_bill_label', '📁 Capture / Upload Invoice Bill')}</label>
              <label htmlFor="invoice-upload-input" className="block bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 py-3 rounded-lg text-slate-500 font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
                <FileText className="w-4 h-4 text-slate-400" />
                <span>{formState.invoiceBillUrl ? t('invoice_loaded_compressed_label', '✓ Invoice Loaded (Compressed)') : t('choose_document_button', 'Choose Document')}</span>
              </label>
              <Input
                id="invoice-upload-input"
                type="file"
                accept="image/*"
                onChange={e => {
                  console.log('[PettyCash] invoice file input onChange', { files: e.target.files?.length, fileNames: Array.from(e.target.files || []).map(f => f.name) });
                  e.target.files?.[0] && handleCompressFile(e.target.files[0], 'invoice');
                }}
                className="hidden"
              />
              {formState.invoiceBillUrl && (
                <img src={formState.invoiceBillUrl} alt={t('invoice_image_alt', 'Invoice')} className="mx-auto h-12 object-contain border rounded mt-2 shadow-2xs" />
              )}
            </div>

            <div className="border border-dashed border-slate-300 dark:border-slate-700 p-4 rounded-xl text-center space-y-2">
              <label className="block font-bold text-slate-600 dark:text-slate-400">{t('upload_payment_screenshot_label', '📸 Upload Payment Screenshot')}</label>
              <label htmlFor="screenshot-upload-input" className="block bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 py-3 rounded-lg text-slate-500 font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
                <ImageIcon className="w-4 h-4 text-slate-400" />
                <span>{formState.paymentScreenshotUrl ? t('screenshot_loaded_compressed_label', '✓ Screenshot Loaded (Compressed)') : t('select_screenshot_button', 'Select Screenshot')}</span>
              </label>
              <Input
                id="screenshot-upload-input"
                type="file"
                accept="image/*"
                onChange={e => {
                  console.log('[PettyCash] screenshot file input onChange', { files: e.target.files?.length, fileNames: Array.from(e.target.files || []).map(f => f.name) });
                  e.target.files?.[0] && handleCompressFile(e.target.files[0], 'screenshot');
                }}
                className="hidden"
              />
              {formState.paymentScreenshotUrl && (
                <img src={formState.paymentScreenshotUrl} alt={t('screenshot_image_alt', 'Screenshot')} className="mx-auto h-12 object-contain border rounded mt-2 shadow-2xs" />
              )}
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="btn-submit-expense bg-cyan-500 hover:bg-cyan-600 text-white font-bold px-8 py-3 rounded-xl shadow-2xs flex items-center gap-2 cursor-pointer transition-colors"
            >
              <span>{t('add_expense_button', 'ADD EXPENSE')}</span>
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-6 min-w-0">
      {/* Live Search & Filter Panel */}
      <div className="expenses-filter-bar bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="font-bold text-slate-700 dark:text-slate-300">{t('select_ledger_month_label', '📅 Select Ledger Month')}</span>
          <StyledSelect
            value={selectedMonth}
            onChange={setSelectedMonth}
            options={uniqueMonths.map(m => {
              const [y, mm] = m.split('-');
              const dateObj = new Date(Number(y), Number(mm) - 1, 1);
              const label = dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });
              return { value: m, label };
            })}
          />
        </div>

        <div className="relative flex-1 max-w-md w-full">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 z-10" />
          <Input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('search_expenses_placeholder', 'Search descriptions, payment modes, payees...')}
            className="pl-9"
          />
        </div>
      </div>

      {/* Cost Logs DataTable */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs overflow-hidden">
        <DataTable
          columns={[
            {
              name: t('date_column', 'Date'),
              selector: (entry: any) => entry.date,
              sortable: true,
              width: '110px',
              cell: (entry: any) => {
                const isEditingDate = editingCell?.id === entry.id && editingCell.field === 'date';
                return isEditingDate ? (
                  <input type="date" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => handleCellSave(entry.id)} onKeyDown={e => e.key === 'Enter' && handleCellSave(entry.id)} autoFocus className="p-1 border border-blue-500 rounded text-slate-900 text-[11px]" />
                ) : (
                  <span onDoubleClick={() => handleCellDoubleClick(entry.id, 'date', entry.date)} className="cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-950 px-1 py-0.5 rounded transition-all font-mono text-[11px] text-slate-500 font-semibold" title={t('double_click_to_edit_tooltip', 'Double click to edit')}>{formatDateDDMMYYYY(entry.date)}</span>
                );
              },
            },
            {
              name: t('category_column', 'Category'),
              selector: (entry: any) => entry.category || entry.costCategory,
              sortable: true,
              width: '120px',
              cell: (entry: any) => {
                const cat = entry.category || entry.costCategory || '';
                const isAutoSalary = cat === 'Salary (Auto)' || entry.description?.startsWith('Salary (Auto):');
                return (
                  <span className={`px-2 py-0.5 rounded font-bold text-[10px] border ${
                    isAutoSalary
                      ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700'
                      : cat === 'Salaries'
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                  }`}>
                    {isAutoSalary ? 'Salary (Auto)' : cat}
                  </span>
                );
              },
            },
            {
              name: t('description_column', 'Description'),
              selector: (entry: any) => entry.description,
              sortable: true,
              grow: 2,
              cell: (entry: any) => (
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs">{entry.description}</div>
                  {entry.moreInfoNotes && <p className="text-[10px] text-slate-400 italic mt-0.5">{entry.moreInfoNotes}</p>}
                  <p className="text-[10px] text-slate-500 mt-0.5">{t('paid_by_prefix', 'Paid by:')} <strong>{entry.paidBy || entry.vendor}</strong></p>
                </div>
              ),
            },
            {
              name: t('total_column', 'Total'),
              selector: (entry: any) => entry.amount,
              sortable: true,
              width: '110px',
              right: true,
              cell: (entry: any) => {
                const isEditingAmount = editingCell?.id === entry.id && editingCell.field === 'amount';
                return isEditingAmount ? (
                  <input type="number" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => handleCellSave(entry.id)} onKeyDown={e => e.key === 'Enter' && handleCellSave(entry.id)} autoFocus className="p-1 border border-blue-500 rounded w-24 text-slate-900 text-[11px]" />
                ) : (
                  <span onDoubleClick={() => handleCellDoubleClick(entry.id, 'amount', entry.amount)} className="cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-950 px-1 py-0.5 rounded transition-all font-mono font-bold text-slate-950 dark:text-white text-sm border-b border-dashed border-slate-400" title={t('double_click_to_edit_tooltip', 'Double click to edit')}>₹{entry.amount.toFixed(2)}</span>
                );
              },
            },
            {
              name: t('mode_column', 'Mode'),
              selector: (entry: any) => entry.paymentMode || 'Online',
              sortable: true,
              width: '80px',
              center: true,
              cell: (entry: any) => (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${entry.paymentMode === 'Cash' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                  {entry.paymentMode || 'Online'}
                </span>
              ),
            },
            ...((activeRole === 'Admin' || activeRole === 'Super Admin') ? [{
              name: t('actions_column', 'Actions'),
              width: '120px',
              center: true as const,
              cell: (entry: any) => (
                <div className="flex items-center justify-center gap-1">
                  <button onClick={() => setEditingEntry(entry)} className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors">
                    <Edit2 className="w-3 h-3" /> {t('edit_button', 'Edit')}
                  </button>
                  <button onClick={() => handleDeleteExpense(entry.id, entry.description)} className="bg-red-50 hover:bg-red-100 text-red-600 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors">
                    {t('delete_button', 'Delete')}
                  </button>
                </div>
              ),
            }] : []),
          ]}
          data={filteredEntries}
          pagination
          paginationPerPage={15}
          paginationRowsPerPageOptions={[10, 15, 25, 50]}
          highlightOnHover
          subHeader={
            <div className="w-full flex items-center justify-between py-2">
              <h3 className="font-semibold text-slate-800 dark:text-white text-sm">
                {t('cost_logs_for_label', 'Cost Logs for')} {new Date(Number(selectedMonth.split('-')[0]), Number(selectedMonth.split('-')[1]) - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </h3>
              <span className="font-mono text-slate-400 font-bold text-xs">{filteredEntries.length} {t('entries_label', 'entries')}</span>
            </div>
          }
          customStyles={{
            subHeader: { style: { padding: 0, minHeight: 0, backgroundColor: 'transparent', borderBottom: '1px solid #e2e8f0' } },
            headCells: { style: { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#94a3b8', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', paddingLeft: '12px' } },
            cells: { style: { fontSize: '12px', color: '#334155', paddingLeft: '12px' } },
            rows: { style: { minHeight: '52px' } },
          }}
          noDataComponent={
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 font-semibold text-xs">
              {t('no_expenses_this_month_message', 'No expenses recorded for this month.')}
            </div>
          }
        />
      </div>
      </div>
      </div>

      {/* Edit Entry Modal for Admin & Super Admin */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-600" /> {t('edit_expense_record_heading', 'EDIT EXPENSE RECORD #')}{editingEntry.id}
              </h3>
              <button onClick={() => setEditingEntry(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModalEdit} className="space-y-4">
              <div>
                <Input
                  label={t('expense_date_label', 'Expense Date')}
                  type="date"
                  required
                  value={editingEntry.date}
                  onChange={e => setEditingEntry({ ...editingEntry, date: e.target.value })}
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">{t('category_label', 'Category')}</label>
                <StyledSelect
                  value={editingEntry.category || editingEntry.costCategory || 'Other'}
                  onChange={val => setEditingEntry({ ...editingEntry, category: val, costCategory: val })}
                  options={[
                    { value: 'Other', label: t('category_other_label', 'Other') },
                    { value: 'Salaries', label: t('category_salaries_manual_label', 'Salaries (Manual)') },
                    { value: 'Salary (Auto)', label: t('category_salary_auto_label', 'Salary (Auto)') },
                    { value: 'Bills', label: t('category_bills_label', 'Bills') },
                  ]}
                />
              </div>

              <div>
                <Input
                  label={t('details_description_label', 'Details Description')}
                  type="text"
                  required
                  list="expense-items-list"
                  value={editingEntry.description}
                  onChange={e => setEditingEntry({ ...editingEntry, description: e.target.value })}
                />
              </div>

              <div>
                <Input
                  label={t('expense_amount_rupees_label', 'Amount (₹)')}
                  type="number"
                  required
                  step="any"
                  value={editingEntry.amount}
                  onChange={e => setEditingEntry({ ...editingEntry, amount: Number(e.target.value) })}
                  className="font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">{t('payment_mode_label', 'Payment Mode')}</label>
                <StyledSelect
                  value={editingEntry.paymentMode || 'Online / UPI / QR'}
                  onChange={val => setEditingEntry({ ...editingEntry, paymentMode: val })}
                  options={[
                    { value: 'Online / UPI / QR', label: t('payment_mode_online_upi_qr_label', 'Online / UPI / QR') },
                    { value: 'Cash', label: t('payment_mode_cash_label', 'Cash') },
                  ]}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold cursor-pointer"
                >
                  {t('cancel_button', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold cursor-pointer transition-colors"
                >
                  {t('save_changes_button', 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
