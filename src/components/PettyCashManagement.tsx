import React, { useState, useEffect, useMemo, useReducer } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter, Card, TextInput, Label, Checkbox } from 'flowbite-react';
import { X, Search, Pencil, FileText, ImageIcon, Landmark, Loader2, Clock, User, Scale, Building2, FolderOpen, Camera, Plus, Trash2, Settings } from 'lucide-react';
import DataTable from 'react-data-table-component';
import { flowbiteTableCustomStyles } from '../utils/tableStyles';
import { PettyCashEntry } from '../types';
import { Button } from './Button';
import { useStaff } from '../contexts/StaffContext';
import { useFinance } from '../contexts/FinanceContext';
import { useInventoryContext } from '../contexts/InventoryContext';
import { fetchExpenseItemPricesFromDB, fetchStaffUsersFromDB, addDrawerEntryToDB, recordOutOfPocketCredit, fetchPayeesFromDB, addPayeeDB, deletePayeeDB, fetchKitchenPurchasesFromDB, createKitchenPurchaseDB, deleteKitchenPurchaseDB, fetchSystemExpenseCatalogFromDB, fetchBillsCatalogFromDB, addStaffAdvanceToDB, fetchPropertyCustomExpensesFromDB, addPropertyCustomExpenseDB, deletePropertyCustomExpenseDB } from '../services/api';
import { useToast } from './ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { StyledSelect } from './StyledSelect';
import { PageHeader } from './PageHeader';
import { t } from '../i18n/en';
import { useConfirm } from './ConfirmDialogContext';
import { Input } from './Input';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

interface PettyCashManagementProps {
  activeRole?: string;
  onDispatchTelegram?: (eventType: string, message: string, channelFilter?: 'all' | 'kitchen' | 'finance' | 'admin', replyMarkup?: any, templateKey?: string, mediaUrls?: string[]) => void;
  onlyForm?: boolean;
  onClose?: () => void;
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
  invoiceBillUrls: string[];
  paymentScreenshotUrls: string[];
  // Only used when category === 'Kitchen' - the item picker replaces the
  // free-text description with a Master Catalog selection, and quantity is
  // needed alongside it (unlike every other category, a kitchen purchase
  // also needs to sync req_catalog stock - see handleSubmit).
  kitchenQuantity: number | '';
  kitchenUnit: string;
  isStaffAdvanceChecked?: boolean;
}

type ProofField = 'invoiceBillUrls' | 'paymentScreenshotUrls';

type FormAction =
  | { type: 'SET_FIELD'; field: keyof FormState; value: any }
  // Appends/removes by index rather than routing through SET_FIELD's whole-
  // array replace - handleCompressFile's FileReader/Image callbacks resolve
  // asynchronously and out of order when multiple files are picked at once,
  // so each one needs to append to whatever the array is AT DISPATCH TIME
  // (which the reducer always sees fresh), not to a stale `formState` array
  // captured in the callback's closure at the moment the file was selected.
  | { type: 'ADD_PROOF_FILE'; field: ProofField; value: string }
  | { type: 'REMOVE_PROOF_FILE'; field: ProofField; index: number }
  | { type: 'RESET_FORM' };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'ADD_PROOF_FILE':
      return { ...state, [action.field]: [...state[action.field], action.value] };
    case 'REMOVE_PROOF_FILE':
      return { ...state, [action.field]: state[action.field].filter((_, i) => i !== action.index) };
    case 'RESET_FORM':
      return {
        ...state,
        expenseDate: new Date().toISOString().split('T')[0],
        expenseTime: new Date().toTimeString().slice(0, 5),
        description: '',
        moreInfoNotes: '',
        amount: '',
        invoiceBillUrls: [],
        paymentScreenshotUrls: [],
        paymentSource: 'property',
        showDrawerSplit: false,
        drawerAmount: '',
        staffAmount: '',
        isOutofPocketChecked: false,
        kitchenQuantity: '',
        kitchenUnit: '',
        isStaffAdvanceChecked: true,
      };
    default:
      return state;
  }
}

export const PettyCashManagement: React.FC<PettyCashManagementProps> = ({
  activeRole,
  onDispatchTelegram,
  onlyForm,
  onClose,
}) => {
  const { staff } = useStaff();
  const { pettyCash, pettyCashLoading, addPettyCash, updatePettyCash, deletePettyCash } = useFinance();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
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
    invoiceBillUrls: [],
    paymentScreenshotUrls: [],
    kitchenQuantity: '',
    kitchenUnit: '',
    isStaffAdvanceChecked: true,
  }));
  const [financialHandlers, setFinancialHandlers] = useState<any[]>(staff.filter(u => u.isFinancialHandler));
  const { inventory } = useInventoryContext();

  // Vendors from database (payee_entities) - same source Kitchen Purchases
  // (InventoryManagement.tsx) already uses for its "Assign Vendor" picker,
  // so Kitchen & Supplies expenses logged here suggest the same registered
  // vendors instead of this field staying free text.
  const [dbVendors, setDbVendors] = useState<{ id: string; name: string; upiId?: string; qrCodeUrl?: string }[]>([]);
  
  const refreshPayees = () => {
    fetchPayeesFromDB().then((payees) => {
      setDbVendors(payees || []);
    });
  };

  useEffect(() => {
    refreshPayees();
  }, []);

  // Root Admin's "Default Expenses (MultiKey)" catalog (system_expenses table,
  // DefaultExpensesManager.tsx) - curated reference items grouped into ~20
  // granular categories (Appliances, Booking & Marketing, Utilities, etc.)
  // that cascade to every MultiKey property. Merged into the Details
  // Descriptions suggestions below (via SYSTEM_CATEGORY_TO_COST_GROUP) so a
  // brand-new property with zero expense history still gets a real starter
  // list instead of "No matching pre-stored items found" until it builds up
  // its own.
  const [systemExpenseCatalog, setSystemExpenseCatalog] = useState<Record<string, { label: string }[]>>({});
  useEffect(() => {
    fetchSystemExpenseCatalogFromDB().then((data) => {
      if (data && Object.keys(data).length > 0) setSystemExpenseCatalog(data);
    });
  }, []);

  // Dedicated Bills Catalog managed by Root Admin â†’ Default Bills (MK).
  // Items here surface directly as Bills autocomplete suggestions without
  // needing any category-mapping step.
  const [billsCatalog, setBillsCatalog] = useState<{ label: string }[]>([]);
  useEffect(() => {
    fetchBillsCatalogFromDB().then((data) => {
      if (Array.isArray(data) && data.length > 0) setBillsCatalog(data);
    });
  }, []);

  const [customExpenses, setCustomExpenses] = useState<{ id: number; label: string; default_amount: number; category: string; description?: string }[]>([]);
  const refreshCustomExpenses = () => {
    fetchPropertyCustomExpensesFromDB().then((data) => {
      setCustomExpenses(data || []);
    });
  };
  useEffect(() => {
    refreshCustomExpenses();
  }, []);

  // Payee Manager Modal & CRUD state
  const [isPayeeManagerOpen, setIsPayeeManagerOpen] = useState(false);
  const [editingPayee, setEditingPayee] = useState<any | null>(null);
  const [isAddingNewPayee, setIsAddingNewPayee] = useState(false);
  const [searchPayeeQuery, setSearchPayeeQuery] = useState('');
  const [newPayeeForm, setNewPayeeForm] = useState({ name: '', upiId: '', qrCodeUrl: '' });
  const [payeeLightboxUrl, setPayeeLightboxUrl] = useState<string | null>(null);
  const [isSavingPayee, setIsSavingPayee] = useState(false);
  const [costLogsPage, setCostLogsPage] = useState(1);

  const handleSavePayee = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = editingPayee ? editingPayee.name.trim() : newPayeeForm.name.trim();
    const upiId = editingPayee ? (editingPayee.upiId || '').trim() : newPayeeForm.upiId.trim();
    const qrCodeUrl = editingPayee ? editingPayee.qrCodeUrl : newPayeeForm.qrCodeUrl;

    if (!name) {
      showToast('Payee name is required', { type: 'error' });
      return;
    }

    try {
      setIsSavingPayee(true);
      const payeePayload = {
        id: editingPayee ? editingPayee.id : `pay-${Date.now().toString().slice(-4)}`,
        name,
        upiId,
        qrCodeUrl,
      };

      const success = await addPayeeDB(payeePayload);
      if (success) {
        showToast(editingPayee ? 'Payee updated successfully!' : 'Payee registered successfully!', { type: 'success' });
        setEditingPayee(null);
        setIsAddingNewPayee(false);
        setNewPayeeForm({ name: '', upiId: '', qrCodeUrl: '' });
        refreshPayees();
      } else {
        showToast('Failed to save payee to database', { type: 'error' });
      }
    } catch (err) {
      showToast('Error saving payee', { type: 'error' });
    } finally {
      setIsSavingPayee(false);
    }
  };

  const handleDeletePayee = async (id: string, name: string) => {
    const confirmed = await confirm({
      title: 'Delete Payee',
      message: `Delete "${name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      setIsSavingPayee(true);
      const success = await deletePayeeDB(id);
      if (success) {
        showToast('Payee deleted successfully.', { type: 'success' });
        if (editingPayee && editingPayee.id === id) {
          setEditingPayee(null);
        }
        refreshPayees();
      } else {
        showToast('Failed to delete payee from database', { type: 'error' });
      }
    } catch (err) {
      showToast('Error deleting payee', { type: 'error' });
    } finally {
      setIsSavingPayee(false);
    }
  };

  // Property Custom Expense Items CRUD state
  const [isCustomItemsOpen, setIsCustomItemsOpen] = useState(false);
  const [editingCustomItem, setEditingCustomItem] = useState<any | null>(null);
  const [isAddingCustomItem, setIsAddingCustomItem] = useState(false);
  const [searchCustomQuery, setSearchCustomQuery] = useState('');
  const [newCustomItemForm, setNewCustomItemForm] = useState({ label: '', category: 'Other', defaultAmount: '0.00', description: '' });
  const [isSavingCustomItem, setIsSavingCustomItem] = useState(false);

  const handleSaveCustomItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = editingCustomItem ? editingCustomItem.label.trim() : newCustomItemForm.label.trim();
    const category = editingCustomItem ? editingCustomItem.category : newCustomItemForm.category;
    const defaultAmount = parseFloat(editingCustomItem ? editingCustomItem.defaultAmount : newCustomItemForm.defaultAmount) || 0;
    const description = editingCustomItem ? editingCustomItem.description : newCustomItemForm.description;

    if (!label) {
      showToast('Item name is required', { type: 'error' });
      return;
    }

    try {
      setIsSavingCustomItem(true);
      const payload = {
        id: editingCustomItem ? editingCustomItem.id : null,
        label,
        category,
        default_amount: defaultAmount,
        description,
      };

      const success = await addPropertyCustomExpenseDB(payload);
      if (success) {
        showToast(editingCustomItem ? 'Custom item updated!' : 'Custom item registered!', { type: 'success' });
        setEditingCustomItem(null);
        setIsAddingCustomItem(false);
        setNewCustomItemForm({ label: '', category: 'Other', defaultAmount: '0.00', description: '' });
        refreshCustomExpenses();
      } else {
        showToast('Failed to save custom item', { type: 'error' });
      }
    } catch (err) {
      showToast('Error saving custom item', { type: 'error' });
    } finally {
      setIsSavingCustomItem(false);
    }
  };

  const handleDeleteCustomItem = async (id: number, label: string) => {
    const confirmed = await confirm({
      title: 'Delete Custom Item',
      message: `Delete custom item "${label}"? This will not affect existing expense logs.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      setIsSavingCustomItem(true);
      const success = await deletePropertyCustomExpenseDB(id);
      if (success) {
        showToast('Custom item deleted successfully.', { type: 'success' });
        if (editingCustomItem && editingCustomItem.id === id) {
          setEditingCustomItem(null);
        }
        refreshCustomExpenses();
      } else {
        showToast('Failed to delete custom item', { type: 'error' });
      }
    } catch (err) {
      showToast('Error deleting custom item', { type: 'error' });
    } finally {
      setIsSavingCustomItem(false);
    }
  };
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

  // Fetch prices from DB on mount
  useEffect(() => {
    fetchExpenseItemPricesFromDB().then((prices) => {
      if (prices && Object.keys(prices).length > 0) {
        setItemPrices(prices);
      }
    });
  }, []);

  // Description autocomplete, grouped by this form's own Cost Category
  // Group ('Other'/'Bills'/'Staff Advance'/'Kitchen') and derived from this
  // property's own past expenses (pettyCash, already loaded via
  // useFinance()) - not get_misc_catalog, which is a completely different,
  // guest-facing catalog (Guest Charges/Transport/Event & Services/...)
  // with no correspondence to this form's categories at all. That mismatch
  // is why selecting "Other" used to suggest things like "Extra Bed /
  // Mattress" and "Airport Pick-up" - guest misc-charge labels, not
  // operational expense descriptions. Self-building: as expenses get
  // logged under a category, their descriptions become future suggestions
  // for that same category.
  // Some properties still have expenses logged under category labels that
  // predate this form's current dropdown (e.g. 'Miscellaneous', 'Utilities',
  // 'Transport', 'Kitchen Purchase' from before it was trimmed down, and
  // 'Maintenance' itself, removed as its own option since it was one of too
  // many near-duplicate choices - see git history) - map those onto their
  // nearest current bucket so old history still surfaces as suggestions
  // instead of silently going dark under labels nothing points to anymore.
  const normalizeCostCategory = (raw: string): string => {
    const cat = (raw || '').trim();
    if (cat === 'Miscellaneous' || cat === 'Transport' || cat === 'Maintenance') return 'Other';
    if (cat === 'Utilities') return 'Bills';
    if (cat === 'Kitchen Purchase') return 'Kitchen';
    return cat || 'Other';
  };

  const normalizePaymentMode = (mode?: string): string => {
    if (!mode) return 'UPI / QR';
    const m = mode.trim();
    if (m === 'Online / UPI / QR' || m === 'Online' || m === 'UPI' || m === 'QR' || m === 'UPI / QR') return 'UPI / QR';
    if (m === 'Cash' || m === 'Farm Cash') return 'Cash';
    if (m === 'Bank Transfer' || m === 'Bank') return 'Bank Transfer';
    if (m === 'Card' || m === 'Credit Card' || m === 'Debit Card') return 'Card';
    return m;
  };

  // Root Admin's system_expenses catalog groups items far more granularly
  // (21 categories - Appliances, Booking & Marketing, Swimming Pool, etc.)
  // than this form's Cost Category Group. Route each granular group to
  // whichever bucket it's clearly about; anything without an obvious match
  // (which, post-Maintenance-removal, now includes Maintenance & Repairs
  // and Swimming Pool items too) falls into 'Other', since that's the
  // form's own catch-all for exactly this kind of spend. Nothing maps to
  // 'Staff Advance' - that category's Details Descriptions is a real-staff
  // picker, not free text, so it never reads these suggestions at all.
  const SYSTEM_CATEGORY_TO_COST_GROUP: Record<string, string> = {
    'Utilities': 'Bills',
    'Insurance': 'Bills',
    'Taxes & Licenses': 'Bills',
  };
  const mapSystemCategoryToCostGroup = (systemCategory: string): string =>
    SYSTEM_CATEGORY_TO_COST_GROUP[systemCategory] || 'Other';

  const expenseItemsByCategory = useMemo(() => {
    const map: Record<string, string[]> = {};
    pettyCash.forEach((e: any) => {
      const cat = normalizeCostCategory(e.category || e.costCategory);
      const desc = (e.description || '').trim();
      if (!desc) return;
      if (!map[cat]) map[cat] = [];
      if (!map[cat].includes(desc)) map[cat].push(desc);
    });
    Object.entries(systemExpenseCatalog).forEach(([systemCategory, items]) => {
      const cat = mapSystemCategoryToCostGroup(systemCategory);
      if (!map[cat]) map[cat] = [];
      items.forEach((item) => {
        const desc = (item.label || '').trim();
        if (desc && !map[cat].includes(desc)) map[cat].push(desc);
      });
    });
    // Merge dedicated Bills Catalog (Root Admin â†’ Default Bills) directly
    // into the Bills bucket — these are the primary source of bill-type
    // suggestions, so they go in first and take precedence over history.
    if (!map['Bills']) map['Bills'] = [];
    billsCatalog.forEach((item) => {
      const desc = (item.label || '').trim();
      if (desc && !map['Bills'].includes(desc)) map['Bills'].unshift(desc);
    });
    // Merge property-specific custom expenses
    customExpenses.forEach((item) => {
      const cat = item.category || 'Other';
      if (!map[cat]) map[cat] = [];
      const desc = (item.label || '').trim();
      if (desc && !map[cat].includes(desc)) map[cat].push(desc);
    });
    Object.keys(map).forEach((k) => map[k].sort());
    return map;
  }, [pettyCash, systemExpenseCatalog, billsCatalog, customExpenses]);

  const expenseItems = expenseItemsByCategory[formState.category] || [];

  const vendorOptions = useMemo(() => {
    const sorted = [...dbVendors].sort((a, b) => a.name.localeCompare(b.name));

    const mapped = sorted.map(v => ({
      value: v.name,
      label: v.name,
      searchText: v.name
    }));

    return [
      { value: '', label: '-- None (Logged by Self) --', searchText: 'none self clear clear' },
      ...mapped
    ];
  }, [dbVendors]);


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

  // Compress & Crop Image Engine - also accepts PDFs for the invoice bill
  // slot (a real invoice is often a scanned/exported PDF, not a photo).
  // PDFs can't be canvas-compressed, so they're read straight to base64
  // as-is; images still get the canvas downscale+recompress treatment.
  const handleCompressFile = (file: File, type: 'invoice' | 'screenshot') => {
    console.log('[PettyCash] handleCompressFile start', { type, name: file.name, size: file.size, lastModified: file.lastModified });
    const field: ProofField = type === 'invoice' ? 'invoiceBillUrls' : 'paymentScreenshotUrls';
    const reader = new FileReader();
    reader.onerror = () => {
      console.error('[PettyCash] FileReader onerror', { type, file: file.name });
    };

    if (file.type === 'application/pdf') {
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        dispatch({ type: 'ADD_PROOF_FILE', field, value: dataUrl });
        console.log('[PettyCash] pdf dispatch done', { type });
      };
      reader.readAsDataURL(file);
      return;
    }

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
          dispatch({ type: 'ADD_PROOF_FILE', field, value: compressedBase64 });
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
        const msg = `<b>ðŸ ³ KITCHEN PURCHASE RECORDED</b>\nâ” â” â” â” â” â” â” â” â” â” â” â” â” â” â” â” \nðŸ“¦ <b>Item:</b> ${qty} ${unit} ${formState.description}\nðŸ ª <b>Vendor:</b> ${vendorName}\nðŸ’° <b>Total:</b> ₹${totalPrice.toLocaleString('en-IN')}\nâ” â” â” â” â” â” â” â” â” â” â” â” â” â” â” â” `;
        onDispatchTelegram('Expense', msg, 'finance');
      }

      showToast('Kitchen purchase recorded successfully!', { type: 'success' });
      dispatch({ type: 'RESET_FORM' });
      if (onClose) onClose();
      return;
    }

    // Security Gate check for Salaries
    if ((formState.category === 'Salaries' || formState.category === 'Salary (Auto)') && !canManageExpense) {
      showToast('Access Denied: Only Admins or Super Admins are authorized to record Salary payments.', { type: 'error' });
      return;
    }

    // Redundant with the generic `!formState.description` guard above, but
    // gives a clearer message for this specific case - money attributed to
    // the wrong (or no) staff member is worse than a silent no-op.
    if (formState.category === 'Staff Advance' && !formState.description) {
      showToast('Select which staff member this advance is for.', { type: 'error' });
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
      invoiceBillUrls: formState.invoiceBillUrls.length > 0 ? formState.invoiceBillUrls : undefined,
      paymentScreenshotUrls: formState.paymentScreenshotUrls.length > 0 ? formState.paymentScreenshotUrls : undefined,
      type: 'Expense'
    };

    addPettyCash(entry);

    // Also record this as a real staff_advances row so it's netted against
    // that person's month-end payout in Team > Payroll & Payee Control
    // Center (pendingPayout there subtracts this month's staff_advances,
    // but never looks at farm_utility_expenses/petty cash) - otherwise an
    // advance logged here would leave via the ledger correctly but the
    // staff member would still show as owed their FULL salary at month-end.
    if (formState.category === 'Staff Advance' && formState.isStaffAdvanceChecked !== false) {
      const matchedStaff = staff.find(s => s.name === formState.description);
      addStaffAdvanceToDB({
        staffId: matchedStaff?.id || '',
        staffName: formState.description,
        amount: Number(formState.amount),
        date: formState.expenseDate,
        month: formState.expenseDate.slice(0, 7),
        reason: formState.moreInfoNotes || finalDescription,
        addedBy: currentUserName,
      });
    }

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
      const mode = formState.paymentMode || 'Cash';
      const d = Number(formState.drawerAmount || 0);
      const s = Number(formState.staffAmount || 0);
      const isCashOrSplit = mode === 'Cash' || d > 0 || s > 0;

      let paymentLine = `ðŸ’³ <b>Payment Mode:</b> ${mode}`;
      if (isCashOrSplit) {
        paymentLine += `\nðŸ¦ <b>Farm Cash:</b> ₹${d.toLocaleString('en-IN')}\nðŸ‘ <b>Out of Pocket:</b> ₹${s.toLocaleString('en-IN')}`;
      }

      const msg = `<b>ðŸ’¸ EXPENSE RECORDED</b>\nâ”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\nðŸ“‚ <b>Category:</b> ${formState.category}\nðŸ“ <b>Description:</b> ${finalDescription}\nðŸ‘¤ <b>Paid By:</b> ${formState.paidBy}\n${paymentLine}\nðŸ’° <b>Total:</b> ₹${Number(formState.amount).toLocaleString('en-IN')}\nâ”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”`;

      const allMedia = [
        ...(formState.invoiceBillUrls || []),
        ...(formState.paymentScreenshotUrls || []),
      ].filter((url): url is string => Boolean(url && typeof url === 'string' && url.trim()));

      onDispatchTelegram('Expense', msg, 'finance', undefined, undefined, allMedia);
    }

    // Update item price tracking map locally
    if (formState.category === 'Other' && formState.description.trim() && formState.amount) {
      setItemPrices(prev => ({ ...prev, [formState.description.trim()]: Number(formState.amount) }));
    }

    showToast('Expense recorded successfully!', { type: 'success' });
    // Reset Form
    dispatch({ type: 'RESET_FORM' });
    if (onClose) onClose();
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

  // Render Add Expense Form
  const renderAddExpenseForm = () => (
    <form onSubmit={handleSubmit} className="add-expense-form app-form app-form--add-expense space-y-4">
      <div>
        <StyledSelect
          label={t('category_label', 'Category')}
          value={formState.category}
          onChange={val => dispatch({ type: 'SET_FIELD', field: 'category', value: val })}
          options={[
            { value: 'Other', label: t('category_other_label', 'Other') },
            { value: 'Bills', label: t('category_bills_label', 'Bills & Utilities') },
            { value: 'Staff Advance', label: t('category_staff_salaries_adv_label', 'Staff Salaries & Adv.') },
            { value: 'Kitchen', label: t('category_kitchen_label', 'Kitchen & Supplies') },
          ]}
        />
      </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {formState.category === 'Kitchen' ? (
              <div>
                <StyledSelect
                  label="Item (from Master Catalog) *"
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
                  <p className="text-2xs text-slate-400 mt-1">Unit: <span className="font-semibold text-slate-500 dark:text-slate-300">{formState.kitchenUnit}</span></p>
                )}
              </div>
            ) : formState.category === 'Staff Advance' ? (
              <div className="space-y-3">
                <div>
                  <StyledSelect
                    label="Staff Member *"
                    searchable
                    value={formState.description}
                    onChange={val => dispatch({ type: 'SET_FIELD', field: 'description', value: val })}
                    placeholder="Select who the salary or advance is for..."
                    options={staff.map(s => ({ value: s.name, label: s.name }))}
                  />
                </div>
                {formState.description && (
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      id="is-staff-advance-checkbox"
                      checked={formState.isStaffAdvanceChecked !== false}
                      onChange={e => dispatch({ type: 'SET_FIELD', field: 'isStaffAdvanceChecked', value: e.target.checked })}
                    />
                    <Label htmlFor="is-staff-advance-checkbox" className="text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer select-none">
                      Mark as Advance (Deductible from final month-end salary)
                    </Label>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Input
                    label={t('details_descriptions_label', 'Details Descriptions *')}
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

                  {showSuggestions && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {expenseItems.filter(item =>
                        item.toLowerCase().includes(formState.description.toLowerCase().trim())
                      ).map(item => (
                        <div
                          key={item}
                          onMouseDown={() => {
                            handleDescriptionChange(item);
                            setShowSuggestions(false);
                          }}
                          className="p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer font-medium text-slate-800 dark:text-slate-200 flex items-center justify-between transition-colors text-xs"
                        >
                          <span>{item}</span>
                          {itemPrices[item] !== undefined && (
                            <span className="text-2xs bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono px-2 py-0.5 rounded">
                              Last ₹{itemPrices[item]}
                            </span>
                          )}
                        </div>
                      ))}
                      {expenseItems.filter(item =>
                        item.toLowerCase().includes(formState.description.toLowerCase().trim())
                      ).length === 0 && (
                        <div className="p-3 text-slate-400 italic text-center text-xs">
                          {t('no_matching_items_message', 'No matching pre-stored items found. You can still type a custom description!')}
                        </div>
                      )}
                      {formState.description.trim() !== '' && !expenseItems.some(item => item.toLowerCase() === formState.description.toLowerCase().trim()) && (
                        <div
                          onMouseDown={() => {
                            const typed = formState.description.trim();
                            setNewCustomItemForm({ label: typed, category: formState.category || 'Other', defaultAmount: '0.00', description: '' });
                            setIsAddingCustomItem(true);
                            setIsCustomItemsOpen(true);
                            setShowSuggestions(false);
                          }}
                          className="p-3 text-blue-600 dark:text-blue-400 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-between transition-colors border-t border-slate-200 dark:border-slate-700 text-xs"
                        >
                          <span>Register "{formState.description.trim()}" to Custom Items list</span>
                          <Plus className="w-4 h-4" />
                        </div>
                      )}
                      <div
                        onMouseDown={() => {
                          setIsAddingCustomItem(false);
                          setIsCustomItemsOpen(true);
                          setShowSuggestions(false);
                        }}
                        className="p-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-between transition-colors border-t border-slate-200 dark:border-slate-700 text-2xs font-semibold"
                      >
                        <span className="flex items-center gap-1.5">
                          <Settings className="w-3.5 h-3.5 text-slate-400" /> Edit existing items
                        </span>
                      </div>
                    </div>
                  )}
                </div>
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
                <p className="text-2xs text-emerald-600 font-semibold mt-1">
                  Last input price auto-filled: ₹{itemPrices[formState.description.trim()]} (Editable)
                </p>
              )}
            </div>
          </div>

          {/* Quantity & Notes Row (Kitchen / Staff Advance only) */}
          {(formState.category === 'Kitchen' || formState.category === 'Staff Advance') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
              <div className={formState.category === 'Staff Advance' ? 'col-span-2' : ''}>
                <Input
                  label={t('more_information_label', '& More Information (If Any)')}
                  type="text"
                  value={formState.moreInfoNotes}
                  onChange={e => dispatch({ type: 'SET_FIELD', field: 'moreInfoNotes', value: e.target.value })}
                  placeholder={t('optional_notes_placeholder', 'Optional contextual notes...')}
                  className="font-medium"
                />
              </div>
            </div>
          )}

          {/* Streamlined 2-Step Payment Source Selection */}
          <div className="space-y-3 bg-slate-50/60 dark:bg-slate-900/40 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <div>
              <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">1. How are you paying?</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'SET_FIELD', field: 'paymentSource', value: 'property' });
                    dispatch({ type: 'SET_FIELD', field: 'showDrawerSplit', value: false });
                    dispatch({ type: 'SET_FIELD', field: 'staffAmount', value: 0 });
                  }}
                  className={`p-2.5 rounded-lg border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    (formState.paymentSource || 'property') === 'property'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <Building2 className="w-4 h-4 shrink-0" />
                  <span>Property Funds</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'SET_FIELD', field: 'paymentSource', value: 'pocket' });
                    dispatch({ type: 'SET_FIELD', field: 'showDrawerSplit', value: false });
                    dispatch({ type: 'SET_FIELD', field: 'staffAmount', value: formState.amount });
                  }}
                  className={`p-2.5 rounded-lg border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    formState.paymentSource === 'pocket'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <User className="w-4 h-4 shrink-0" />
                  <span>My Own Pocket</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'SET_FIELD', field: 'paymentSource', value: 'split' });
                    dispatch({ type: 'SET_FIELD', field: 'showDrawerSplit', value: true });
                  }}
                  className={`p-2.5 rounded-lg border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    formState.paymentSource === 'split'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <Scale className="w-4 h-4 shrink-0" />
                  <span>Split</span>
                </button>
              </div>
            </div>

            {formState.showDrawerSplit && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 bg-amber-50/50 dark:bg-amber-950/20 p-3 rounded-lg border border-amber-200/60 dark:border-amber-900/40">
                {/* LEFT COLUMN: Property Cash in Hand (₹) */}
                <div>
                  <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('property_cash_in_hand_rupees_label', 'Property Cash in Hand (₹)')}</label>
                  <div className="p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-950 dark:text-white font-bold text-sm tabular-numbers shadow-md h-[38px] flex items-center px-3">
                    ₹{Number(formState.drawerAmount || 0).toFixed(2)}
                  </div>
                </div>

                {/* RIGHT COLUMN: Any payment out of your own pocket? */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700 dark:text-slate-200 font-semibold text-xs mb-1.5 min-h-[18px]">
                    <Checkbox
                      id="out-of-pocket-split-cb"
                      checked={formState.isOutofPocketChecked || Number(formState.staffAmount || 0) > 0}
                      onChange={e => {
                        const checked = e.target.checked;
                        dispatch({ type: 'SET_FIELD', field: 'isOutofPocketChecked', value: checked });
                        if (!checked) {
                          dispatch({ type: 'SET_FIELD', field: 'staffAmount', value: 0 });
                        }
                      }}
                    />
                    <Label htmlFor="out-of-pocket-split-cb" className="cursor-pointer font-semibold text-xs">
                      Any payment out of your own pocket?
                    </Label>
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
                    <div className="text-2xs text-slate-400 dark:text-slate-500 italic p-2 rounded-lg bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 h-[38px] flex items-center px-3">
                      Check box to enter pocket portion
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <StyledSelect
                  label="2. Payment Mode"
                  value={normalizePaymentMode(formState.paymentMode)}
                  onChange={val => dispatch({ type: 'SET_FIELD', field: 'paymentMode', value: val })}
                  options={[
                    { value: 'UPI / QR', label: t('payment_mode_online_upi_qr_label', 'Online / UPI / QR') },
                    { value: 'Cash', label: t('payment_mode_cash_label', 'Cash') },
                    { value: 'Bank Transfer', label: t('payment_mode_bank_transfer_label', 'Bank Transfer') },
                    { value: 'Card', label: t('payment_mode_card_label', 'Card') },
                  ]}
                />
              </div>

              <div>
                <StyledSelect
                  label="Vendor / Payee Name (Optional)"
                  searchable
                  value={formState.paidBy === currentUserName ? '' : formState.paidBy}
                  onChange={val => dispatch({ type: 'SET_FIELD', field: 'paidBy', value: val || currentUserName })}
                  placeholder="Select a registered payee..."
                  options={vendorOptions}
                />
                <button
                  type="button"
                  onClick={() => setIsPayeeManagerOpen(true)}
                  className="mt-1.5 text-2xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Settings className="w-3 h-3" />
                  <span>Manage Payees</span>
                </button>
              </div>
            </div>

            <div className="text-2xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 pt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>Logged by logged-in staff member: <strong>{currentUserName}</strong></span>
            </div>
          </div>

          {/* Proof uploads */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50 p-4 rounded-lg text-center space-y-2 transition-colors">
              <label className="app-label text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5 flex items-center justify-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" /> {t('capture_upload_invoice_bill_label_plain', 'Capture / Upload Invoice Bill')}</label>
              <label htmlFor="invoice-upload-input" className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-md hover:bg-slate-50">
                <FileText className="w-4 h-4 text-slate-400" />
                <span>{formState.invoiceBillUrls.length > 0 ? `+ Add Another (${formState.invoiceBillUrls.length} attached)` : t('choose_document_button', 'Choose Image or PDF')}</span>
              </label>
              <input
                id="invoice-upload-input"
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={e => {
                  const files = Array.from(e.target.files || []);
                  files.forEach(f => handleCompressFile(f, 'invoice'));
                  e.target.value = '';
                }}
                className="hidden"
              />
              {formState.invoiceBillUrls.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                  {formState.invoiceBillUrls.map((url, idx) => (
                    <div key={idx} className="relative">
                      {url.startsWith('data:application/pdf') ? (
                        <div className="h-12 w-12 flex items-center justify-center border rounded bg-white dark:bg-slate-800 shadow-md">
                          <FileText className="w-5 h-5 text-red-500" />
                        </div>
                      ) : (
                        <img src={url} alt={t('invoice_image_alt', 'Invoice')} className="h-12 w-12 object-cover border rounded shadow-md" />
                      )}
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'REMOVE_PROOF_FILE', field: 'invoiceBillUrls', index: idx })}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center shadow cursor-pointer"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50 p-4 rounded-lg text-center space-y-2 transition-colors">
              <label className="app-label text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5 flex items-center justify-center gap-1.5"><Camera className="w-3.5 h-3.5" /> {t('upload_payment_screenshot_label_plain', 'Upload Payment Screenshot')}</label>
              <label htmlFor="screenshot-upload-input" className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-md hover:bg-slate-50">
                <ImageIcon className="w-4 h-4 text-slate-400" />
                <span>{formState.paymentScreenshotUrls.length > 0 ? `+ Add Another (${formState.paymentScreenshotUrls.length} attached)` : t('select_screenshot_button', 'Select Screenshot')}</span>
              </label>
              <input
                id="screenshot-upload-input"
                type="file"
                accept="image/*"
                multiple
                onChange={e => {
                  const files = Array.from(e.target.files || []);
                  files.forEach(f => handleCompressFile(f, 'screenshot'));
                  e.target.value = '';
                }}
                className="hidden"
              />
              {formState.paymentScreenshotUrls.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                  {formState.paymentScreenshotUrls.map((url, idx) => (
                    <div key={idx} className="relative">
                      <img src={url} alt={t('screenshot_image_alt', 'Screenshot')} className="h-12 w-12 object-cover border rounded shadow-md" />
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'REMOVE_PROOF_FILE', field: 'paymentScreenshotUrls', index: idx })}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center shadow cursor-pointer"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="shadow-sm font-semibold px-6 w-full sm:w-auto"
            >
              {t('add_expense_button', 'ADD EXPENSE')}
            </Button>
          </div>
        </form>
  );

  if (onlyForm) {
    return (
      <div className="add-expenses-modal-view w-full space-y-4 text-slate-800 dark:text-slate-200">
        <datalist id="expense-items-list">
          {expenseItems.map(item => (
            <option key={item} value={item} />
          ))}
        </datalist>

        {renderAddExpenseForm()}
      </div>
    );
  }

  return (
    <div className="expenses-page-container space-y-6 text-slate-800 dark:text-slate-200">
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

      {/* Add Expenses form on the left, registered expenses on the right */}
      <div className="petty-cash-management__layout grid grid-cols-1 lg:grid-cols-[550px_1fr] gap-6 items-start">
        <Card className="add-expenses-container w-full shadow-md border-gray-200 dark:border-gray-700">
          <h3 className="petty-cash-management__subtitle font-semibold text-slate-900 dark:text-white text-sm mb-4 flex items-center gap-1.5">
            {t('add_expenses_heading', 'ADD EXPENSES')}
          </h3>
          {renderAddExpenseForm()}
        </Card>

      <div className="petty-cash-management__right-panel space-y-6 min-w-0">
      {/* Live Search & Filter Panel */}
      <Card className="expenses-filter-bar shadow-md border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="font-semibold text-xs text-slate-700 dark:text-slate-300">{t('select_ledger_month_label', 'Select Ledger Month')}</span>
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

          <div className="flex-1 max-w-md w-full">
            <TextInput
              id="expenses-search"
              type="text"
              icon={Search}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('search_expenses_placeholder', 'Search descriptions, payment modes, payees...')}
            />
          </div>
        </div>
      </Card>

      {/* Cost Logs Mobile Cards with 10-Item Pagination (md:hidden) */}
      <div className="md:hidden bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md p-3 space-y-2.5">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
          <h3 className="petty-cash-management__subtitle font-semibold text-slate-800 dark:text-white text-xs">
            {t('cost_logs_for_label', 'Cost Logs for')} {new Date(Number(selectedMonth.split('-')[0]), Number(selectedMonth.split('-')[1]) - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
          </h3>
          <span className="text-slate-400 font-semibold text-[10px]">{filteredEntries.length} entries</span>
        </div>

        <div className="space-y-2.5">
          {filteredEntries.slice((costLogsPage - 1) * 10, costLogsPage * 10).map((entry: any) => {
            const cat = entry.category || entry.costCategory || '';
            const payer = entry.paidBy || entry.vendor;
            return (
              <div key={entry.id} className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200/80 dark:border-slate-700/80 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-slate-900 dark:text-white">{entry.description}</div>
                  <span className="font-bold text-slate-900 dark:text-white text-sm tabular-numbers">₹{entry.amount.toFixed(2)}</span>
                </div>

                {payer && (
                  <div className="text-[11px] text-slate-500">
                    Vendor/Payee: <span className="font-semibold text-slate-700 dark:text-slate-300">{payer}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-slate-500 pt-1.5 border-t border-slate-200/60 dark:border-slate-800">
                  <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    {cat}
                  </span>
                  <span className="font-mono text-[11px]">{formatDateDDMMYYYY(entry.date)}</span>
                </div>

                {canManageExpense && (
                  <div className="pt-1.5 flex justify-end gap-2 border-t border-slate-200/60 dark:border-slate-800">
                    <Button variant="primary" size="sm" onClick={() => setEditingEntry({ ...entry, time: entry.time || new Date().toTimeString().slice(0, 5) })} leftIcon={<Pencil className="w-3.5 h-3.5 shrink-0" />}>
                      Edit
                    </Button>
                    <button
                      onClick={() => handleDeleteExpense(entry.id, entry.description)}
                      className="px-2.5 py-1 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {filteredEntries.length === 0 && (
            <div className="text-center p-6 text-slate-400 font-semibold text-xs">{t('no_expense_entries_found_message', 'No expense entries found.')}</div>
          )}
        </div>

        {/* Mobile 10-Item Pagination Controls */}
        {filteredEntries.length > 10 && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
            <button
              type="button"
              disabled={costLogsPage === 1}
              onClick={() => setCostLogsPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Page {costLogsPage} of {Math.ceil(filteredEntries.length / 10)}
            </span>
            <button
              type="button"
              disabled={costLogsPage >= Math.ceil(filteredEntries.length / 10)}
              onClick={() => setCostLogsPage((p) => Math.min(Math.ceil(filteredEntries.length / 10), p + 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Cost Logs Desktop DataTable (hidden md:block) */}
      <div className="petty-cash-management__table hidden md:block bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md overflow-hidden">
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
                  <span onDoubleClick={() => handleCellDoubleClick(entry.id, 'amount', entry.amount, entry.source)} className="cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-950 px-1 py-0.5 rounded transition-all font-semibold text-slate-950 dark:text-white text-sm border-b border-dashed border-slate-400 tabular-numbers" title={t('double_click_to_edit_tooltip', 'Double click to edit')}>₹{entry.amount.toFixed(2)}</span>
                );
              },
            },
            {
              name: t('source_column', 'Source & Mode'),
              selector: (entry: any) => entry.paymentMode || 'Online',
              sortable: true,
              wrap: true,
              cell: (entry: any) => {
                const isOutofPocket = entry.staffAmount && Number(entry.staffAmount) > 0 && Number(entry.staffAmount) === Number(entry.amount);
                const isSplit = entry.staffAmount && Number(entry.staffAmount) > 0 && entry.drawerAmount && Number(entry.drawerAmount) > 0;

                if (isSplit) {
                  return (
                    <span className="text-xs text-purple-700 dark:text-purple-400 whitespace-nowrap" title={`Till: ₹${entry.drawerAmount} | Out of Pocket: ₹${entry.staffAmount}`}>
                      Split (Till + Pocket)
                    </span>
                  );
                }

                if (isOutofPocket) {
                  return (
                    <span className="text-xs text-amber-700 dark:text-amber-400 whitespace-nowrap">
                      Out of Pocket
                    </span>
                  );
                }

                return (
                  <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    Property ({entry.paymentMode || 'UPI'})
                  </span>
                );
              },
            },
            ...(canManageExpense ? [{
              name: t('actions_column', 'Actions'),
              width: '150px',
              center: true as const,
              cell: (entry: any) => (
                <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                  <Button variant="primary" size="sm" onClick={() => setEditingEntry({ ...entry, time: entry.time || new Date().toTimeString().slice(0, 5) })} leftIcon={<Pencil className="w-3.5 h-3.5 shrink-0" />}>
                      {t('edit_button', 'Edit')}
                    </Button>
                  <button onClick={() => entry.source === 'kitchen' ? handleDeleteKitchenPurchase(entry.id, entry.description) : handleDeleteExpense(entry.id, entry.description)} className="bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors border border-red-200 dark:border-red-800 whitespace-nowrap shadow-md">
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
          customStyles={flowbiteTableCustomStyles}
          progressPending={pettyCashLoading || kitchenPurchasesLoading}
          progressComponent={
            <div className="p-8 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500 font-semibold text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading expenses...
            </div>
          }
          noDataComponent={
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 font-semibold text-xs">
              {t('no_expenses_this_month_message', 'No expenses recorded for this month.')}
            </div>
          }
        />
      </div>
      </div>
      </div>

      {/* Edit Entry Modal for Admin & Super Admin */}
      <Modal show={Boolean(editingEntry)} onClose={() => setEditingEntry(null)} className="z-58" dismissible>
        {editingEntry && (
          <>
            <ModalHeader as="div">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-blue-600" />
                <span>{t('edit_expense_record_heading', 'EDIT EXPENSE RECORD #')}{editingEntry.id}</span>
              </div>
            </ModalHeader>

            <form onSubmit={handleSaveModalEdit} className="app-form app-form--edit-expense">
              <ModalBody className="space-y-4">
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
                      { value: 'Staff Advance', label: t('category_staff_salaries_adv_label', 'Staff Salaries & Adv.') },
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
                    value={normalizePaymentMode(editingEntry.paymentMode)}
                    onChange={val => setEditingEntry({ ...editingEntry, paymentMode: val })}
                    options={[
                      { value: 'UPI / QR', label: t('payment_mode_online_upi_qr_label', 'Online / UPI / QR') },
                      { value: 'Cash', label: t('payment_mode_cash_label', 'Cash') },
                      { value: 'Bank Transfer', label: t('payment_mode_bank_transfer_label', 'Bank Transfer') },
                      { value: 'Card', label: t('payment_mode_card_label', 'Card') },
                    ]}
                  />
                </div>
              </ModalBody>

              <ModalFooter className="flex justify-end gap-2">
                <Button type="submit" variant="primary">
                  {t('save_changes_button', 'Save Changes')}
                </Button>
              </ModalFooter>
            </form>
          </>
        )}
      </Modal>
    </div>
  );
};
