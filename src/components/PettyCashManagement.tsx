import React, { useState, useEffect, useReducer } from 'react';
import { X, Search, Edit2, FileText, ImageIcon, Landmark, Loader2, Clock } from 'lucide-react';
import DataTable from 'react-data-table-component';
import { PettyCashEntry } from '../types';
import { useStaff } from '../contexts/StaffContext';
import { useFinance } from '../contexts/FinanceContext';
import { useInventoryContext } from '../contexts/InventoryContext';
import { fetchExpenseItemPricesFromDB, fetchStaffUsersFromDB, addDrawerEntryToDB, recordOutOfPocketCredit, fetchPayeesFromDB, fetchKitchenPurchasesFromDB, createKitchenPurchaseDB, deleteKitchenPurchaseDB } from '../services/api';
import { useToast } from './ToastContext';
import { useAuth } from '../contexts/AuthContext';
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
  expenseTime: string;
  category: string;
  description: string;
  moreInfoNotes: string;
  amount: number | '';
  paymentMode: string;
  paidBy: string;
  paymentSource: 'property' | 'pocket' | 'split';
  showDrawerSplit: boolean;
  drawerAmount: number | '';
  staffAmount: number | '';
  isOutofPocketChecked?: boolean;
  invoiceBillUrl: string;
  paymentScreenshotUrl: string;
  // Only used when category === 'Kitchen' - the item picker replaces the
  // free-text description with a Master Catalog selection, and quantity is
  // needed alongside it (unlike every other category, a kitchen purchase
  // also needs to sync req_catalog stock - see handleSubmit).
  kitchenQuantity: number | '';
  kitchenUnit: string;
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
        expenseTime: new Date().toTimeString().slice(0, 5),
        description: '',
        moreInfoNotes: '',
        amount: '',
        invoiceBillUrl: '',
        paymentScreenshotUrl: '',
        paymentSource: 'property',
        showDrawerSplit: false,
        drawerAmount: '',
        staffAmount: '',
        isOutofPocketChecked: false,
        kitchenQuantity: '',
        kitchenUnit: '',
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
  const { pettyCash, pettyCashLoading, addPettyCash, updatePettyCash, deletePettyCash } = useFinance();
  const { showToast } = useToast();
  const { activeRole: authRole, currentUser } = useAuth();
  const currentUserName = currentUser?.name || currentUser?.username || 'Staff';

  const effectiveRole = (activeRole || authRole || '').toLowerCase().trim();
  const canManageExpense = effectiveRole.includes('admin') || effectiveRole.includes('root');
  const [formState, dispatch] = useReducer(formReducer, undefined, (): FormState => ({
    expenseDate: new Date().toISOString().split('T')[0],
    expenseTime: new Date().toTimeString().slice(0, 5),
    category: 'Other',
    description: '',
    moreInfoNotes: '',
    amount: '',
    paymentMode: 'UPI / QR',
    paidBy: currentUserName,
    paymentSource: 'property',
    showDrawerSplit: false,
    drawerAmount: '',
    staffAmount: '',
    invoiceBillUrl: '',
    paymentScreenshotUrl: '',
    kitchenQuantity: '',
    kitchenUnit: '',
  }));
  const isAmountEntered = Boolean(formState.amount && Number(formState.amount) > 0);
  const [financialHandlers, setFinancialHandlers] = useState<any[]>(staff.filter(u => u.isFinancialHandler));
  const { inventory } = useInventoryContext();

  // Vendors from database (payee_entities) - same source Kitchen Purchases
  // (InventoryManagement.tsx) already uses for its "Assign Vendor" picker,
  // so Kitchen & Supplies expenses logged here suggest the same registered
  // vendors instead of this field staying free text.
  const [dbVendors, setDbVendors] = useState<{ id: string; name: string; type: string }[]>([]);
  useEffect(() => {
    fetchPayeesFromDB().then((payees) => {
      if (payees && payees.length > 0) setDbVendors(payees);
    });
  }, []);

  // Kitchen & Supplies entries submitted from this page are stored in
  // kitchen_purchases_log (via create_kitchen_purchase), not
  // farm_utility_expenses, so req_catalog stock keeps syncing correctly -
  // see handleSubmit below. Fetched and merged into the Cost Logs list so
  // they don't disappear from view the moment they're saved; that's the
  // whole point of centralizing expense entry onto this one page.
  const [kitchenPurchases, setKitchenPurchases] = useState<any[]>([]);
  const [kitchenPurchasesLoading, setKitchenPurchasesLoading] = useState(true);
  useEffect(() => {
    fetchKitchenPurchasesFromDB().then((data) => {
      setKitchenPurchases(data || []);
      setKitchenPurchasesLoading(false);
    });
  }, []);

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

  useEffect(() => {
    if (currentUserName && (!formState.paidBy || formState.paidBy === 'Tarpan')) {
      dispatch({ type: 'SET_FIELD', field: 'paidBy', value: currentUserName });
    }
  }, [currentUserName]);

  useEffect(() => {
    if (formState.paymentSource === 'pocket') {
      dispatch({ type: 'SET_FIELD', field: 'staffAmount', value: formState.amount });
      dispatch({ type: 'SET_FIELD', field: 'drawerAmount', value: 0 });
    }
  }, [formState.amount, formState.paymentSource]);

  // Property Cash in Hand split (redesigned 12 Aug 2026): the only thing
  // staff enters is "how much came out of your own pocket" - the property
  // cash portion is always just the remainder (total - out of pocket),
  // never a separate typed field, so the two can never accidentally stop
  // adding up to the total. Unchecked = the whole amount is out of pocket
  // (matches the original default); checking the box flips the default the
  // other way (whole amount from property cash, 0 out of pocket) since
  // that's what checking it is FOR - staff then only adjusts the pocket
  // portion if part of it really did come out of their own pocket.
  useEffect(() => {
    const numAmt = formState.amount === '' ? 0 : Number(formState.amount);
    if (numAmt <= 0) return;
    dispatch({ type: 'SET_FIELD', field: 'staffAmount', value: formState.showDrawerSplit ? 0 : numAmt });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formState.showDrawerSplit]);

  // Keep the derived property-cash amount (drawerAmount) in sync with
  // amount/staffAmount on every change, not just the initial default above -
  // and clamp both directions so neither figure can ever go negative or the
  // pocket portion exceed the total (typing more into "out of pocket" than
  // the total expense would otherwise silently push the derived drawer
  // amount below zero).
  useEffect(() => {
    const numAmt = formState.amount === '' ? 0 : Number(formState.amount);
    const rawStaff = formState.staffAmount === '' ? 0 : Number(formState.staffAmount);
    const clampedStaff = Math.min(Math.max(rawStaff, 0), numAmt);
    const derivedDrawer = Math.max(numAmt - clampedStaff, 0);
    if (clampedStaff !== formState.staffAmount) {
      dispatch({ type: 'SET_FIELD', field: 'staffAmount', value: clampedStaff });
    }
    if (derivedDrawer !== formState.drawerAmount) {
      dispatch({ type: 'SET_FIELD', field: 'drawerAmount', value: derivedDrawer });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formState.amount, formState.staffAmount]);

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

    // Kitchen & Supplies routes through create_kitchen_purchase instead of
    // add_petty_cash - unlike every other category, this one also has to
    // sync req_catalog stock and inventory_price_history (see
    // php/inventory/inventory.php), so it can't just be a plain ledger row.
    if (formState.category === 'Kitchen') {
      if (!formState.kitchenQuantity || Number(formState.kitchenQuantity) <= 0) return;

      const totalPrice = Number(formState.amount);
      const qty = Number(formState.kitchenQuantity);
      const unitCost = qty > 0 ? Number((totalPrice / qty).toFixed(2)) : totalPrice;
      const unit = formState.kitchenUnit || inventory.find((i) => i.name === formState.description)?.unit || 'Unit';
      const vendorName = formState.paidBy && formState.paidBy !== currentUserName ? formState.paidBy : 'Unassigned Vendor';
      const isFullyOutOfPocket = totalPrice > 0 && Number(formState.staffAmount || 0) >= totalPrice;

      const purchase = {
        id: `pur-${Date.now().toString().slice(-4)}`,
        purchaseDate: formState.expenseDate,
        itemName: formState.description,
        specification: 'N/A',
        quantity: qty,
        unit,
        totalPrice,
        unitCost,
        recordedBy: currentUserName,
        vendorName,
        settlementStatus: 'Paid',
        settlementMethod: isFullyOutOfPocket ? 'Paid Out of Pocket' : (formState.paymentMode || 'Farm Cash'),
        paidByStaff: isFullyOutOfPocket ? currentUserName : '',
      };

      setKitchenPurchases((prev) => [purchase, ...prev]);
      createKitchenPurchaseDB(purchase);

      const handler = financialHandlers.find((h: any) => h.name === formState.paidBy);
      if (formState.drawerAmount && Number(formState.drawerAmount) > 0) {
        addDrawerEntryToDB({
          staff_id: handler?.id || '',
          staff_name: handler?.name || handler?.username || currentUserName,
          type: 'handover',
          amount: Number(formState.drawerAmount),
          notes: `Drawer paid for ${qty} ${unit} of ${formState.description} (Kitchen & Supplies)`,
        });
      }
      if (formState.staffAmount && Number(formState.staffAmount) > 0) {
        recordOutOfPocketCredit({
          staff_id: handler?.id || '',
          staff_name: handler?.name || handler?.username || currentUserName,
          amount: Number(formState.staffAmount),
          description: `Out-of-pocket for ${qty} ${unit} of ${formState.description} (Kitchen & Supplies)`,
        });
      }

      if (onDispatchTelegram) {
        const msg = `<b>🍳 KITCHEN PURCHASE RECORDED</b>\n━━━━━━━━━━━━━━━━\n📦 <b>Item:</b> ${qty} ${unit} ${formState.description}\n🏪 <b>Vendor:</b> ${vendorName}\n💰 <b>Total:</b> ₹${totalPrice.toLocaleString('en-IN')}\n━━━━━━━━━━━━━━━━`;
        onDispatchTelegram('Expense', msg, 'finance');
      }

      dispatch({ type: 'RESET_FORM' });
      return;
    }

    // Security Gate check for Salaries
    if ((formState.category === 'Salaries' || formState.category === 'Salary (Auto)') && !canManageExpense) {
      showToast('Access Denied: Only Admins or Super Admins are authorized to record Salary payments.', { type: 'error' });
      return;
    }

    const finalDescription = formState.category === 'Salaries' ? `Salary payout for ${formState.description}` : formState.description;

    const entry: PettyCashEntry = {
      id: `pc-${Date.now().toString().slice(-4)}`,
      date: formState.expenseDate,
      time: formState.expenseTime || new Date().toTimeString().slice(0, 5),
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
  const handleCellDoubleClick = (entryId: string, field: 'date' | 'amount', currentValue: any, source?: string) => {
    // Kitchen-sourced rows live in kitchen_purchases_log, not pettyCash -
    // handleCellSave below looks up/writes pettyCash by id, so editing one
    // inline here would silently no-op rather than actually saving anything.
    if (!canManageExpense || source === 'kitchen') return;
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

  // Kitchen-sourced rows live in kitchen_purchases_log, not pettyCash, so
  // this goes through deleteKitchenPurchaseDB (which also reverses the
  // financial_ledger posting server-side) instead of deletePettyCash.
  const handleDeleteKitchenPurchase = (id: string, itemName: string) => {
    (window as any).showConfirm(`Delete kitchen purchase "${itemName}"? This cannot be undone.`, async () => {
      setKitchenPurchases((prev) => prev.filter((p) => p.id !== id));
      deleteKitchenPurchaseDB({ id, itemName, user: currentUserName });
    });
  };

  // Kitchen purchases logged from this page (via create_kitchen_purchase)
  // live in kitchen_purchases_log, not pettyCash - mapped into the same
  // shape the Cost Logs table already renders so they show up alongside
  // regular expenses instead of only being visible on the Inventory >
  // Kitchen Purchases screen. `source: 'kitchen'` marks these rows so the
  // Actions column can avoid firing update_petty_cash/delete_petty_cash
  // against an id that doesn't exist in that table.
  const mappedKitchenEntries = kitchenPurchases.map((kp: any) => {
    const isOutOfPocket = kp.settlementMethod === 'Paid Out of Pocket';
    const total = Number(kp.totalPrice) || 0;
    return {
      id: kp.id,
      date: kp.purchaseDate,
      time: '12:00',
      category: 'Kitchen',
      costCategory: 'Kitchen',
      description: `${kp.quantity} ${kp.unit} ${kp.itemName}`.trim(),
      moreInfoNotes: kp.specification && kp.specification !== 'N/A' ? kp.specification : undefined,
      vendor: kp.vendorName && kp.vendorName !== 'Unassigned Vendor' ? kp.vendorName : undefined,
      paidBy: kp.vendorName && kp.vendorName !== 'Unassigned Vendor' ? kp.vendorName : undefined,
      amount: total,
      paymentMode: isOutOfPocket ? undefined : (kp.settlementMethod || 'Cash'),
      staffAmount: isOutOfPocket ? total : 0,
      drawerAmount: isOutOfPocket ? 0 : total,
      source: 'kitchen' as const,
    };
  });

  // Filter entries
  const filteredEntries = [...pettyCash, ...mappedKitchenEntries]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .filter(e => {
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
      <div className="petty-cash-management__layout grid grid-cols-1 lg:grid-cols-[550px_1fr] gap-6 items-start">
      <div className="add-expenses-container w-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5">
        <h3 className="petty-cash-management__subtitle font-semibold text-slate-900 dark:text-white text-sm mb-4 flex items-center gap-1.5">
          {t('add_expenses_heading', 'ADD EXPENSES')}
        </h3>

        <form onSubmit={handleSubmit} className="add-expense-form app-form app-form--add-expense space-y-4">
          {/* Always 2 columns, even on mobile - date and category are short
              enough to sit side by side on any screen; the previous
              grid-cols-1 stacked them there for no real reason. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <DatePicker
                label={t('expense_date_label', 'Expense Date')}
                title={t('expense_date_label', 'Expense Date')}
                value={formState.expenseDate}
                onChange={val => dispatch({ type: 'SET_FIELD', field: 'expenseDate', value: val })}
              />
            </div>

            <div>
              <Input
                label={t('expense_time_label', 'Time')}
                type="time"
                value={formState.expenseTime}
                onChange={e => dispatch({ type: 'SET_FIELD', field: 'expenseTime', value: e.target.value })}
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('cost_category_group_label', 'Cost Category Group')}</label>
              <StyledSelect
                value={formState.category}
                onChange={val => dispatch({ type: 'SET_FIELD', field: 'category', value: val })}
                options={[
                  { value: 'Other', label: t('category_other_label', 'Other') },
                  { value: 'Bills', label: t('category_bills_label', 'Bills & Utilities') },
                  { value: 'Staff Advance', label: t('category_staff_advance_label', 'Staff Advance') },
                  { value: 'Maintenance', label: t('category_maintenance_label', 'Maintenance & Repairs') },
                  { value: 'Kitchen', label: t('category_kitchen_label', 'Kitchen & Supplies') },
                ]}
              />
            </div>
          </div>

          {formState.category === 'Kitchen' ? (
            <div>
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Item (from Master Catalog) *</label>
              <StyledSelect
                searchable
                value={formState.description}
                onChange={val => {
                  dispatch({ type: 'SET_FIELD', field: 'description', value: val });
                  const matched = inventory.find(i => i.name === val);
                  dispatch({ type: 'SET_FIELD', field: 'kitchenUnit', value: matched?.unit || '' });
                  if (!formState.kitchenQuantity) {
                    dispatch({ type: 'SET_FIELD', field: 'kitchenQuantity', value: 1 });
                  }
                }}
                placeholder="Select an item from the kitchen catalog..."
                options={inventory.map(i => ({ value: i.name, label: i.name }))}
              />
              {formState.kitchenUnit && (
                <p className="text-[10px] text-slate-400 mt-1">Unit: <span className="font-semibold text-slate-500 dark:text-slate-300">{formState.kitchenUnit}</span></p>
              )}
            </div>
          ) : (
            <div>
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('details_descriptions_label', 'Details Descriptions *')}</label>
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

                {/* Interactive Auto-suggestions Dropdown Menu (only for 'Other' category) */}
                {showSuggestions && formState.category === 'Other' && (
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
            </div>
          )}

          <div>
            <Input
              label={t('more_information_label', '& More Information (If Any)')}
              type="text"
              value={formState.moreInfoNotes}
              onChange={e => dispatch({ type: 'SET_FIELD', field: 'moreInfoNotes', value: e.target.value })}
              placeholder={t('optional_notes_placeholder', 'Optional contextual notes...')}
              className="font-medium"
            />
          </div>

          {/* Always 2 columns, even on mobile - same reasoning as the
              date/category row above. Kitchen & Supplies uses the second
              column for Quantity instead of leaving it empty. */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {formState.category === 'Kitchen' && (
              <div>
                <Input
                  label="Quantity *"
                  type="number"
                  step="any"
                  min="0.001"
                  required
                  value={formState.kitchenQuantity}
                  onChange={e => dispatch({ type: 'SET_FIELD', field: 'kitchenQuantity', value: e.target.value === '' ? '' : Number(e.target.value) })}
                  placeholder="1"
                />
              </div>
            )}
            <div>
              <Input
                label={formState.category === 'Kitchen' ? 'Total Price (₹) *' : t('expense_amount_rupees_required_label', 'Amount (₹) *')}
                type="number"
                step="0.01"
                required
                value={formState.amount}
                onChange={e => dispatch({ type: 'SET_FIELD', field: 'amount', value: e.target.value === '' ? '' : Number(e.target.value) })}
                placeholder={t('expense_amount_placeholder', 'e.g., 450')}
                className="font-semibold"
              />
              {formState.category !== 'Kitchen' && formState.description.trim() && itemPrices[formState.description.trim()] !== undefined && (
                <p className="text-[10px] text-emerald-600 font-semibold mt-1">
                  Last input price auto-filled: ₹{itemPrices[formState.description.trim()]} (Editable)
                </p>
              )}
            </div>
          </div>

          {/* Streamlined 2-Step Payment Source Selection */}
          <div className="space-y-3 bg-slate-50/60 dark:bg-slate-900/40 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <div>
              <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">1. Where did the money come from?</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'SET_FIELD', field: 'paymentSource', value: 'property' });
                    dispatch({ type: 'SET_FIELD', field: 'showDrawerSplit', value: false });
                    dispatch({ type: 'SET_FIELD', field: 'staffAmount', value: 0 });
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    (formState.paymentSource || 'property') === 'property'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>🏛️ Property Funds</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'SET_FIELD', field: 'paymentSource', value: 'pocket' });
                    dispatch({ type: 'SET_FIELD', field: 'showDrawerSplit', value: false });
                    dispatch({ type: 'SET_FIELD', field: 'staffAmount', value: formState.amount });
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    formState.paymentSource === 'pocket'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>👤 My Own Pocket</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'SET_FIELD', field: 'paymentSource', value: 'split' });
                    dispatch({ type: 'SET_FIELD', field: 'showDrawerSplit', value: true });
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    formState.paymentSource === 'split'
                      ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>⚖️ Split</span>
                </button>
              </div>
            </div>

            {formState.showDrawerSplit && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 bg-amber-50/50 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-200/60 dark:border-amber-900/40">
                {/* LEFT COLUMN: Property Cash in Hand (₹) */}
                <div>
                  <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('property_cash_in_hand_rupees_label', 'Property Cash in Hand (₹)')}</label>
                  <div className="p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-950 dark:text-white font-bold text-sm font-mono shadow-2xs h-[38px] flex items-center px-3">
                    ₹{Number(formState.drawerAmount || 0).toFixed(2)}
                  </div>
                </div>

                {/* RIGHT COLUMN: Any payment out of your own pocket? */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700 dark:text-slate-200 font-semibold text-xs mb-1.5 min-h-[18px]">
                    <input
                      type="checkbox"
                      checked={formState.isOutofPocketChecked || Number(formState.staffAmount || 0) > 0}
                      onChange={e => {
                        const checked = e.target.checked;
                        dispatch({ type: 'SET_FIELD', field: 'isOutofPocketChecked', value: checked });
                        if (!checked) {
                          dispatch({ type: 'SET_FIELD', field: 'staffAmount', value: 0 });
                        }
                      }}
                      className="w-4 h-4 text-amber-600 rounded cursor-pointer"
                    />
                    <span>Any payment out of your own pocket?</span>
                  </label>

                  {(formState.isOutofPocketChecked || Number(formState.staffAmount || 0) > 0) ? (
                    <Input
                      type="number"
                      min="0"
                      max={formState.amount === '' ? undefined : formState.amount}
                      value={formState.staffAmount}
                      onChange={e => {
                        const val = e.target.value === '' ? '' : Number(e.target.value);
                        dispatch({ type: 'SET_FIELD', field: 'staffAmount', value: val });
                      }}
                      placeholder="Enter pocket amount (₹)"
                      autoFocus
                    />
                  ) : (
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 italic p-2 rounded-xl bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 h-[38px] flex items-center px-3">
                      Check box to enter pocket portion
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">2. Payment Mode</label>
                <StyledSelect
                  value={formState.paymentMode}
                  onChange={val => dispatch({ type: 'SET_FIELD', field: 'paymentMode', value: val })}
                  options={[
                    { value: 'UPI / QR', label: t('payment_mode_upi_qr_label', 'UPI / QR') },
                    { value: 'Cash', label: t('payment_mode_cash_label', 'Cash') },
                    { value: 'Bank Transfer', label: t('payment_mode_bank_transfer_label', 'Bank Transfer') },
                    { value: 'Card', label: t('payment_mode_card_label', 'Card') },
                  ]}
                />
              </div>

              <div>
                {formState.category === 'Kitchen' ? (
                  <>
                    <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Vendor / Payee Name (Optional)</label>
                    <StyledSelect
                      searchable
                      value={formState.paidBy === currentUserName ? '' : formState.paidBy}
                      onChange={val => dispatch({ type: 'SET_FIELD', field: 'paidBy', value: val || currentUserName })}
                      placeholder="Select a registered vendor..."
                      options={dbVendors.filter(v => v.type === 'Vendor').map(v => ({ value: v.name, label: v.name }))}
                    />
                  </>
                ) : (
                  <Input
                    label="Vendor / Payee Name (Optional)"
                    type="text"
                    value={formState.paidBy === currentUserName ? '' : formState.paidBy}
                    onChange={e => dispatch({ type: 'SET_FIELD', field: 'paidBy', value: e.target.value || currentUserName })}
                    placeholder="e.g. Transport Co, Hardware Store"
                  />
                )}
              </div>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 pt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>Logged by logged-in staff member: <strong>{currentUserName}</strong></span>
            </div>
          </div>

          {/* Proof uploads */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-dashed border-slate-300 dark:border-slate-700 p-4 rounded-xl text-center space-y-2">
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('capture_upload_invoice_bill_label', '📁 Capture / Upload Invoice Bill')}</label>
              <label htmlFor="invoice-upload-input" className="block bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 py-3 rounded-lg text-slate-500 font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
                <FileText className="w-4 h-4 text-slate-400" />
                <span>{formState.invoiceBillUrl ? t('invoice_loaded_compressed_label', 'Invoice Loaded (Compressed)') : t('choose_document_button', 'Choose Document')}</span>
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
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('upload_payment_screenshot_label', '📸 Upload Payment Screenshot')}</label>
              <label htmlFor="screenshot-upload-input" className="block bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 py-3 rounded-lg text-slate-500 font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
                <ImageIcon className="w-4 h-4 text-slate-400" />
                <span>{formState.paymentScreenshotUrl ? t('screenshot_loaded_compressed_label', 'Screenshot Loaded (Compressed)') : t('select_screenshot_button', 'Select Screenshot')}</span>
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
              className="btn-submit-expense bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-xl shadow-2xs flex items-center gap-2 cursor-pointer transition-colors"
            >
              <span>{t('add_expense_button', 'ADD EXPENSE')}</span>
            </button>
          </div>
        </form>
      </div>

      <div className="petty-cash-management__right-panel space-y-6 min-w-0">
      {/* Live Search & Filter Panel */}
      <div className="expenses-filter-bar bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="font-semibold text-slate-700 dark:text-slate-300">{t('select_ledger_month_label', 'Select Ledger Month')}</span>
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
      <div className="petty-cash-management__table bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
        <DataTable
          columns={[
            {
              name: t('date_column', 'Date'),
              selector: (entry: any) => entry.date,
              sortable: true,
              width: '120px',
              cell: (entry: any) => {
                const isEditingDate = editingCell?.id === entry.id && editingCell.field === 'date';
                return isEditingDate ? (
                  <Input type="date" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => handleCellSave(entry.id)} onKeyDown={e => e.key === 'Enter' && handleCellSave(entry.id)} autoFocus />
                ) : (
                  <div>
                    <span onDoubleClick={() => handleCellDoubleClick(entry.id, 'date', entry.date, entry.source)} className="cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-950 px-1 py-0.5 rounded transition-all font-mono text-[11px] text-slate-700 dark:text-slate-200 font-bold" title={t('double_click_to_edit_tooltip', 'Double click to edit')}>{formatDateDDMMYYYY(entry.date)}</span>
                    <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5 pl-1">
                      <Clock className="w-2.5 h-2.5 inline shrink-0" /> {entry.time || '12:00'}
                    </div>
                  </div>
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
                  <span className={`px-2 py-0.5 rounded font-semibold text-[10px] border ${
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
              cell: (entry: any) => {
                const payer = entry.paidBy || entry.vendor;
                return (
                  <div className="py-1">
                    <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs">{entry.description}</div>
                    {entry.moreInfoNotes && <p className="text-[10px] text-slate-400 italic mt-0.5">{entry.moreInfoNotes}</p>}
                    {payer && payer !== currentUserName && (
                      <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                        <span className="text-slate-400">Vendor / Payee:</span> <strong className="text-slate-700 dark:text-slate-300">{payer}</strong>
                      </p>
                    )}
                  </div>
                );
              },
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
                  <Input type="number" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => handleCellSave(entry.id)} onKeyDown={e => e.key === 'Enter' && handleCellSave(entry.id)} autoFocus className="w-24" />
                ) : (
                  <span onDoubleClick={() => handleCellDoubleClick(entry.id, 'amount', entry.amount, entry.source)} className="cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-950 px-1 py-0.5 rounded transition-all font-mono font-semibold text-slate-950 dark:text-white text-sm border-b border-dashed border-slate-400" title={t('double_click_to_edit_tooltip', 'Double click to edit')}>₹{entry.amount.toFixed(2)}</span>
                );
              },
            },
            {
              name: t('source_column', 'Source & Mode'),
              selector: (entry: any) => entry.paymentMode || 'Online',
              sortable: true,
              width: '140px',
              center: true,
              cell: (entry: any) => {
                const isOutofPocket = entry.staffAmount && Number(entry.staffAmount) > 0 && Number(entry.staffAmount) === Number(entry.amount);
                const isSplit = entry.staffAmount && Number(entry.staffAmount) > 0 && entry.drawerAmount && Number(entry.drawerAmount) > 0;

                if (isSplit) {
                  return (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shadow-2xs whitespace-nowrap" title={`Till: ₹${entry.drawerAmount} | Out of Pocket: ₹${entry.staffAmount}`}>
                      ⚖️ Split (Till + Pocket)
                    </span>
                  );
                }

                if (isOutofPocket) {
                  return (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-2xs whitespace-nowrap">
                      👤 Out of Pocket
                    </span>
                  );
                }

                return (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-2xs whitespace-nowrap ${
                    entry.paymentMode === 'Cash'
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                  }`}>
                    🏛️ Property ({entry.paymentMode || 'UPI'})
                  </span>
                );
              },
            },
            ...(canManageExpense ? [{
              name: t('actions_column', 'Actions'),
              width: '150px',
              center: true as const,
              cell: (entry: any) => entry.source === 'kitchen' ? (
                <div className="flex items-center justify-center whitespace-nowrap">
                  <button onClick={() => handleDeleteKitchenPurchase(entry.id, entry.description)} className="bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors border border-red-200 dark:border-red-800 whitespace-nowrap shadow-2xs">
                    {t('delete_button', 'Delete')}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                  <button onClick={() => setEditingEntry({ ...entry, time: entry.time || new Date().toTimeString().slice(0, 5) })} className="bg-slate-100 hover:bg-blue-50 dark:bg-slate-700 dark:hover:bg-blue-900/40 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors border border-slate-200 dark:border-slate-600 whitespace-nowrap shadow-2xs">
                    <Edit2 className="w-3 h-3" /> {t('edit_button', 'Edit')}
                  </button>
                  <button onClick={() => handleDeleteExpense(entry.id, entry.description)} className="bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors border border-red-200 dark:border-red-800 whitespace-nowrap shadow-2xs">
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
              <h3 className="petty-cash-management__subtitle font-semibold text-slate-800 dark:text-white text-sm">
                {t('cost_logs_for_label', 'Cost Logs for')} {new Date(Number(selectedMonth.split('-')[0]), Number(selectedMonth.split('-')[1]) - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </h3>
              <span className="text-slate-400 font-semibold text-xs">{pettyCashLoading || kitchenPurchasesLoading ? '…' : filteredEntries.length} {t('entries_label', 'entries')}</span>
            </div>
          }
          customStyles={{
            subHeader: { style: { padding: 0, minHeight: 0, backgroundColor: 'transparent', borderBottom: '1px solid #e2e8f0' } },
            headCells: { style: { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#94a3b8', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', paddingLeft: '12px' } },
            cells: { style: { fontSize: '12px', color: '#334155', paddingLeft: '12px' } },
            rows: { style: { minHeight: '52px' } },
          }}
          progressPending={pettyCashLoading || kitchenPurchasesLoading}
          progressComponent={
            <div className="p-8 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500 font-semibold text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading expenses...
            </div>
          }
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
        <div className="petty-cash-management__edit-modal fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="petty-cash-management__subtitle font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-600" /> {t('edit_expense_record_heading', 'EDIT EXPENSE RECORD #')}{editingEntry.id}
              </h3>
              <button onClick={() => setEditingEntry(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModalEdit} className="app-form app-form--edit-expense space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={t('expense_date_label', 'Expense Date')}
                  type="date"
                  required
                  value={editingEntry.date}
                  onChange={e => setEditingEntry({ ...editingEntry, date: e.target.value })}
                />
                <Input
                  label={t('expense_time_label', 'Expense Time')}
                  type="time"
                  required
                  value={editingEntry.time || '12:00'}
                  onChange={e => setEditingEntry({ ...editingEntry, time: e.target.value })}
                />
              </div>

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('category_label', 'Category')}</label>
                <StyledSelect
                  value={editingEntry.category || editingEntry.costCategory || 'Other'}
                  onChange={val => setEditingEntry({ ...editingEntry, category: val, costCategory: val })}
                  options={[
                    { value: 'Other', label: t('category_other_label', 'Other') },
                    { value: 'Bills', label: t('category_bills_label', 'Bills & Utilities') },
                    { value: 'Staff Advance', label: t('category_staff_advance_label', 'Staff Advance') },
                    { value: 'Maintenance', label: t('category_maintenance_label', 'Maintenance & Repairs') },
                    { value: 'Kitchen', label: t('category_kitchen_label', 'Kitchen & Supplies') },
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
                  className="font-semibold"
                />
              </div>

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('payment_mode_label', 'Payment Mode')}</label>
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
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold cursor-pointer transition-colors"
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
