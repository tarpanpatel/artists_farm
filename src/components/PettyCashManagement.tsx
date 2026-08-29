import React, { useState, useEffect, useMemo, useReducer } from 'react';
import { Drawer, Card, TextInput as FlowbiteTextInput, Label, Checkbox, Dropdown, DropdownItem, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from 'flowbite-react';
import { X, Search, Pencil, Edit2, FileText, FileSpreadsheet, ImageIcon, Landmark, Loader2, Clock, User, Scale, Building2, Camera, Plus, Trash2, Settings, Filter } from './icons/FlowbiteIcons';
import { TablePagination } from './TablePagination';
import { PettyCashEntry } from '../types';
import { Button } from './Button';
import { Badge } from './Badge';
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
import { FileInput } from './FileInput';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

interface PettyCashManagementProps {
  activeRole?: string;
  onDispatchTelegram?: (eventType: string, message: string, channelFilter?: 'all' | 'kitchen' | 'finance' | 'admin', replyMarkup?: any, templateKey?: string, mediaUrls?: string[]) => void;
  onlyForm?: boolean;
  onClose?: () => void;
  // AI Assistant deep-link (restored 27 Aug 2026) - pre-fills the Add Expense drawer's
  // amount/description from a chat command; the user still reviews and clicks the real submit
  // button themselves, same rule every other AI-prefilled form in this app follows.
  initialAmount?: number | '';
  initialDescription?: string;
  kitchenModuleEnabled?: boolean;
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
  // Gates the Vendor/Payee picker behind an explicit yes/no instead of it
  // always being live - most expenses are logged by the staff member
  // themselves (paidBy already defaults to currentUserName for that case),
  // so the picker stays visually disabled until this is checked, matching
  // "Vendor / Payee Name (Optional)" actually reading as optional rather
  // than a select that's always interactive regardless (added 20 Aug 2026).
  payToRegisteredVendor?: boolean;
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
        payToRegisteredVendor: false,
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
  initialAmount,
  initialDescription,
  kitchenModuleEnabled = true,
}) => {
  const { staff } = useStaff();
  const { pettyCash, pettyCashLoading, addPettyCash, updatePettyCash, deletePettyCash } = useFinance();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { activeRole: authRole, currentUser, isAuthenticated, authChecked } = useAuth();
  const currentUserName = currentUser?.name || currentUser?.username || 'Staff';

  const effectiveRole = (activeRole || authRole || '').toLowerCase().trim();
  const canManageExpense = effectiveRole.includes('admin') || effectiveRole.includes('root');
  const [formState, dispatch] = useReducer(formReducer, undefined, (): FormState => ({
    expenseDate: new Date().toISOString().split('T')[0],
    expenseTime: new Date().toTimeString().slice(0, 5),
    category: 'Other',
    description: initialDescription || '',
    moreInfoNotes: '',
    amount: initialAmount !== undefined && initialAmount !== null ? initialAmount : '',
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
    payToRegisteredVendor: false,
  }));

  // AI Assistant deep-link (restored 27 Aug 2026): the reducer's own initializer above only
  // ever runs once at mount, so this effect catches the case where the chat command's data
  // arrives/changes while this drawer instance is already mounted.
  useEffect(() => {
    if (initialAmount !== undefined && initialAmount !== null && initialAmount !== '') {
      dispatch({ type: 'SET_FIELD', field: 'amount', value: initialAmount });
    }
    if (initialDescription) {
      dispatch({ type: 'SET_FIELD', field: 'description', value: initialDescription });
    }
  }, [initialAmount, initialDescription]);
  // Live "required" feedback for the main expense form (26 Aug 2026, CLAUDE.md's
  // "Real-Time Form Validation" sweep) - kept as plain local state rather than
  // reducer fields since they're purely UI touched-tracking, not form data.
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [amountTouched, setAmountTouched] = useState(false);
  const [kitchenQtyTouched, setKitchenQtyTouched] = useState(false);

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

  // Gated on isAuthenticated (27 Aug 2026, part of an app-wide sweep after a
  // "wall of 401s" report) - fetches unconditionally on mount used to race
  // ahead of the async login flow with no retry once auth landed. See
  // KitchenManagement.tsx's identical fix, same day, for the full writeup.
  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    refreshPayees();
  }, [isAuthenticated, authChecked]);

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
    if (!authChecked || !isAuthenticated) return;
    fetchSystemExpenseCatalogFromDB().then((data) => {
      if (data && Object.keys(data).length > 0) setSystemExpenseCatalog(data);
    });
  }, [isAuthenticated, authChecked]);

  // Dedicated Bills Catalog managed by Root Admin â†’ Default Bills (MK).
  // Items here surface directly as Bills autocomplete suggestions without
  // needing any category-mapping step.
  const [billsCatalog, setBillsCatalog] = useState<{ label: string }[]>([]);
  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    fetchBillsCatalogFromDB().then((data) => {
      if (Array.isArray(data) && data.length > 0) setBillsCatalog(data);
    });
  }, [isAuthenticated, authChecked]);

  const [customExpenses, setCustomExpenses] = useState<{ id: number; label: string; default_amount: number; category: string; description?: string }[]>([]);
  const refreshCustomExpenses = () => {
    fetchPropertyCustomExpensesFromDB().then((data) => {
      setCustomExpenses(data || []);
    });
  };
  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    refreshCustomExpenses();
  }, [isAuthenticated, authChecked]);

  // Payee Manager Modal & CRUD state
  const [isPayeeManagerOpen, setIsPayeeManagerOpen] = useState(false);
  const [editingPayee, setEditingPayee] = useState<any | null>(null);
  const [isAddingNewPayee, setIsAddingNewPayee] = useState(false);
  const [searchPayeeQuery, setSearchPayeeQuery] = useState('');
  const [newPayeeForm, setNewPayeeForm] = useState({ name: '', upiId: '', qrCodeUrl: '' });
  const [payeeNameTouched, setPayeeNameTouched] = useState(false);
  const [payeeLightboxUrl, setPayeeLightboxUrl] = useState<string | null>(null);
  const [isSavingPayee, setIsSavingPayee] = useState(false);
  const [costLogsPage, setCostLogsPage] = useState(1);

  const handleSavePayee = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = editingPayee ? editingPayee.name.trim() : newPayeeForm.name.trim();
    const upiId = editingPayee ? (editingPayee.upiId || '').trim() : newPayeeForm.upiId.trim();
    const qrCodeUrl = editingPayee ? editingPayee.qrCodeUrl : newPayeeForm.qrCodeUrl;

    if (!name) {
      setPayeeNameTouched(true);
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
        setPayeeNameTouched(false);
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
  const [customItemNameTouched, setCustomItemNameTouched] = useState(false);
  const [isSavingCustomItem, setIsSavingCustomItem] = useState(false);

  const handleSaveCustomItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = editingCustomItem ? editingCustomItem.label.trim() : newCustomItemForm.label.trim();
    const category = editingCustomItem ? editingCustomItem.category : newCustomItemForm.category;
    const defaultAmount = parseFloat(editingCustomItem ? editingCustomItem.defaultAmount : newCustomItemForm.defaultAmount) || 0;
    const description = editingCustomItem ? editingCustomItem.description : newCustomItemForm.description;

    if (!label) {
      setCustomItemNameTouched(true);
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
        setCustomItemNameTouched(false);
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
    if (!authChecked || !isAuthenticated) return;
    fetchKitchenPurchasesFromDB().then((data) => {
      setKitchenPurchases(data || []);
      setKitchenPurchasesLoading(false);
    });
  }, [isAuthenticated, authChecked]);

  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    fetchStaffUsersFromDB().then((users) => {
      if (users && users.length > 0) {
        const handlers = users.filter((u: any) => u.isFinancialHandler);
        if (handlers.length > 0) {
          setFinancialHandlers(handlers);
        }
      }
    });
  }, [isAuthenticated, authChecked]);

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

  // Search & Timeframe Filter State (Flowbite Application UI Transactions Pattern)
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>(() => currentMonthKey);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'property' | 'pocket' | 'split'>('all');
  const [mobilePage, setMobilePage] = useState<number>(1);
  const [desktopPage, setDesktopPage] = useState<number>(1);
  const DESKTOP_PAGE_SIZE = 15;

  // Fetch prices from DB once authenticated
  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    fetchExpenseItemPricesFromDB().then((prices) => {
      if (prices && Object.keys(prices).length > 0) {
        setItemPrices(prices);
      }
    });
  }, [isAuthenticated, authChecked]);

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
    if (!formState.description || !formState.amount) {
      setDescriptionTouched(true);
      setAmountTouched(true);
      return;
    }

    // Kitchen & Supplies routes through create_kitchen_purchase instead of
    // add_petty_cash - unlike every other category, this one also has to
    // sync req_catalog stock and inventory_price_history (see
    // php/inventory/inventory.php), so it can't just be a plain ledger row.
    if (formState.category === 'Kitchen') {
      if (!formState.kitchenQuantity || Number(formState.kitchenQuantity) <= 0) {
        setKitchenQtyTouched(true);
        return;
      }

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
        const msg = `<b>🍳 KITCHEN PURCHASE RECORDED</b>\n━━━━━━━━━━━━━━━━━━\n📦 <b>Item:</b> ${qty} ${unit} ${formState.description}\n🏪 <b>Vendor:</b> ${vendorName}\n💰 <b>Total:</b> ₹${totalPrice.toLocaleString('en-IN')}\n━━━━━━━━━━━━━━━━━━`;
        onDispatchTelegram('Expense', msg, 'finance');
      }

      showToast('Kitchen purchase recorded successfully!', { type: 'success' });
      dispatch({ type: 'RESET_FORM' });
    setDescriptionTouched(false);
    setAmountTouched(false);
    setKitchenQtyTouched(false);
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

      let paymentLine = `💳 <b>Payment Mode:</b> ${mode}`;
      if (isCashOrSplit) {
        paymentLine += `\n🏦 <b>Farm Cash:</b> ₹${d.toLocaleString('en-IN')}\n👤 <b>Out of Pocket:</b> ₹${s.toLocaleString('en-IN')}`;
      }

      const msg = `<b>💸 EXPENSE RECORDED</b>\n━━━━━━━━━━━━━━━━━━\n📁 <b>Category:</b> ${formState.category}\n📝 <b>Description:</b> ${finalDescription}\n👤 <b>Paid By:</b> ${formState.paidBy}\n${paymentLine}\n💰 <b>Total:</b> ₹${Number(formState.amount).toLocaleString('en-IN')}\n━━━━━━━━━━━━━━━━━━`;

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
    setDescriptionTouched(false);
    setAmountTouched(false);
    setKitchenQtyTouched(false);
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

  // Filter entries based on timeframe filter & live search
  const filteredEntries = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const currentYearStr = new Date().getFullYear().toString();
    const currMonthKey = new Date().toISOString().slice(0, 7);

    return [...pettyCash, ...mappedKitchenEntries]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .filter((e) => {
        let matchesTimeframe = true;
        if (selectedTimeframe === 'last_7_days') {
          matchesTimeframe = e.date >= sevenDaysAgo && e.date <= today;
        } else if (selectedTimeframe === 'today') {
          matchesTimeframe = e.date === today;
        } else if (selectedTimeframe === 'yesterday') {
          matchesTimeframe = e.date === yesterday;
        } else if (selectedTimeframe === 'month_to_date') {
          matchesTimeframe = e.date.startsWith(currMonthKey) && e.date <= today;
        } else if (selectedTimeframe === 'year_to_date') {
          matchesTimeframe = e.date.startsWith(currentYearStr) && e.date <= today;
        } else if (selectedTimeframe === 'all_time') {
          matchesTimeframe = true;
        } else if (selectedTimeframe) {
          matchesTimeframe = e.date.startsWith(selectedTimeframe);
        }

        let matchesSource = true;
        const anyEntry = e as any;
        const isOutOfPocket = anyEntry.staffAmount && Number(anyEntry.staffAmount) > 0 && Number(anyEntry.staffAmount) === Number(anyEntry.amount);
        const isSplit = anyEntry.staffAmount && Number(anyEntry.staffAmount) > 0 && anyEntry.drawerAmount && Number(anyEntry.drawerAmount) > 0;
        if (sourceFilter === 'property') {
          matchesSource = !isOutOfPocket && !isSplit;
        } else if (sourceFilter === 'pocket') {
          matchesSource = Boolean(isOutOfPocket);
        } else if (sourceFilter === 'split') {
          matchesSource = Boolean(isSplit);
        }

        const text = `${e.description || ''} ${e.category || e.costCategory || ''} ${e.paidBy || ''} ${e.vendor || ''} ${e.paymentMode || ''} ${e.id || ''} ${e.amount || ''}`.toLowerCase();
        const matchesSearch = !searchQuery.trim() || text.includes(searchQuery.toLowerCase().trim());
        return matchesTimeframe && matchesSource && matchesSearch;
      });
  }, [pettyCash, mappedKitchenEntries, selectedTimeframe, searchQuery, sourceFilter]);

  const handleExportCSV = () => {
    if (filteredEntries.length === 0) {
      showToast('No expense records to export for the selected filter.', { type: 'error' });
      return;
    }
    const headers = ['ID', 'Date', 'Time', 'Category', 'Description', 'Vendor / Payee', 'Amount (INR)', 'Payment Mode', 'Source'];
    const rows = filteredEntries.map((e: any) => [
      e.id,
      e.date,
      e.time || '12:00',
      `"${(e.category || e.costCategory || '').replace(/"/g, '""')}"`,
      `"${(e.description || '').replace(/"/g, '""')}"`,
      `"${(e.vendor || e.paidBy || '').replace(/"/g, '""')}"`,
      e.amount,
      `"${(e.paymentMode || '').replace(/"/g, '""')}"`,
      `"${(e.source || 'property').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `cost_logs_${selectedTimeframe}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${filteredEntries.length} expense records to CSV`, { type: 'success' });
  };

  const handleGenerateReport = () => {
    if (filteredEntries.length === 0) {
      showToast('No expense records available to generate a report.', { type: 'error' });
      return;
    }
    const totalAmount = filteredEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const categoryTotals: Record<string, number> = {};
    filteredEntries.forEach(e => {
      const cat = e.category || e.costCategory || 'Other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (Number(e.amount) || 0);
    });

    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([cat, amt]) => `• ${cat}: ₹${amt.toFixed(2)}`)
      .join('\n');

    const reportSummary = `Cost Logs Summary Report (${selectedTimeframe}):\n\nTotal Entries: ${filteredEntries.length}\nTotal Expenditure: ₹${totalAmount.toFixed(2)}\n\nCategory Breakdown:\n${categoryBreakdown}`;

    window.alert(reportSummary);
  };

  const categoryOptions = useMemo(() => {
    const opts = [
      { value: 'Other', label: t('category_other_label', 'Other') },
      { value: 'Bills', label: t('category_bills_label', 'Bills & Utilities') },
    ];
    // Staff Meals is managed inside Kitchen module when Kitchen is ON;
    // it only appears in Petty Cash Expenses when Kitchen module is OFF.
    if (!kitchenModuleEnabled) {
      opts.push({ value: 'Staff Meals', label: 'Staff Meals & Food' });
    }
    opts.push(
      { value: 'Staff Advance', label: t('category_staff_salaries_adv_label', 'Staff Salaries & Adv.') },
      { value: 'Kitchen', label: t('category_kitchen_label', 'Kitchen & Supplies') }
    );
    return opts;
  }, [kitchenModuleEnabled]);

  // Render Add Expense Form
  const renderAddExpenseForm = () => (
    <form onSubmit={handleSubmit} className="add-expense-form app-form app-form--add-expense space-y-4">
      <div>
        <StyledSelect
          label={t('category_label', 'Category')}
          value={formState.category}
          onChange={val => dispatch({ type: 'SET_FIELD', field: 'category', value: val })}
          options={categoryOptions}
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
                    onBlur={() => { setTimeout(() => setShowSuggestions(false), 200); setDescriptionTouched(true); }}
                    onChange={e => {
                      handleDescriptionChange(e.target.value);
                      setShowSuggestions(true);
                    }}
                    error={descriptionTouched && !formState.description.trim() ? 'This field is required' : undefined}
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
                onBlur={() => setAmountTouched(true)}
                error={amountTouched && !formState.amount ? 'This field is required' : undefined}
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
                    onBlur={() => setKitchenQtyTouched(true)}
                    error={kitchenQtyTouched && (!formState.kitchenQuantity || Number(formState.kitchenQuantity) <= 0) ? 'Must be greater than 0' : undefined}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* LEFT COLUMN: Property Cash in Hand (₹) */}
                <div>
                  <Input
                    label={t('property_cash_in_hand_rupees_label', 'Property Cash in Hand (₹)')}
                    type="text"
                    readOnly
                    disabled
                    value={`₹${Number(formState.drawerAmount || 0).toFixed(2)}`}
                    className="font-semibold"
                  />
                </div>

                {/* RIGHT COLUMN: Any payment out of your own pocket? */}
                <div>
                  <div className="flex items-center gap-2 select-none mb-2">
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
                    <Label htmlFor="out-of-pocket-split-cb" className="cursor-pointer font-medium text-xs text-gray-700 dark:text-gray-300">
                      Any payment out of your own pocket?
                    </Label>
                  </div>

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
                    <Input
                      type="text"
                      disabled
                      readOnly
                      placeholder="Check box to enter pocket portion"
                    />
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
                <label className="flex items-center gap-2 cursor-pointer select-none mb-1.5">
                  <Checkbox
                    id="pay-to-registered-vendor-checkbox"
                    checked={!!formState.payToRegisteredVendor}
                    onChange={e => {
                      const checked = e.target.checked;
                      dispatch({ type: 'SET_FIELD', field: 'payToRegisteredVendor', value: checked });
                      if (!checked) {
                        dispatch({ type: 'SET_FIELD', field: 'paidBy', value: currentUserName });
                      }
                    }}
                  />
                  <Label htmlFor="pay-to-registered-vendor-checkbox" className="text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer select-none">
                    {t('pay_to_registered_vendor_checkbox_label', 'Pay to pre-registered vendor?')}
                  </Label>
                </label>
                <div className={`transition-opacity ${!formState.payToRegisteredVendor ? 'opacity-20 pointer-events-none' : ''}`}>
                  <StyledSelect
                    label={t('vendor_payee_optional_label', 'Vendor / Payee Name (Optional)')}
                    searchable
                    disabled={!formState.payToRegisteredVendor}
                    value={formState.paidBy === currentUserName ? '' : formState.paidBy}
                    onChange={val => dispatch({ type: 'SET_FIELD', field: 'paidBy', value: val || currentUserName })}
                    placeholder={formState.payToRegisteredVendor ? 'Select a registered payee...' : '-- None (Logged by Self) --'}
                    options={vendorOptions}
                  />
                  <button
                    type="button"
                    disabled={!formState.payToRegisteredVendor}
                    onClick={() => setIsPayeeManagerOpen(true)}
                    className={`mt-1.5 text-2xs font-semibold flex items-center gap-1 transition-colors ${
                      !formState.payToRegisteredVendor
                        ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed'
                        : 'text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer'
                    }`}
                  >
                    <Settings className="w-3 h-3" />
                    <span>Manage Payees</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="text-2xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 pt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>Logged by logged-in staff member: <strong>{currentUserName}</strong></span>
            </div>
          </div>

          {/* Proof uploads */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50 p-4 rounded-lg space-y-2 transition-colors">
              <FileInput
                id="invoice-upload-input"
                label={t('capture_upload_invoice_bill_label_plain', 'Capture / Upload Invoice Bill')}
                accept="image/*,application/pdf"
                multiple
                onChange={e => {
                  const files = Array.from(e.target.files || []);
                  files.forEach(f => handleCompressFile(f, 'invoice'));
                  e.target.value = '';
                }}
                helperText={formState.invoiceBillUrls.length > 0 ? `${formState.invoiceBillUrls.length} attached - choosing more files adds to this list.` : undefined}
              />
              {formState.invoiceBillUrls.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
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

            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50 p-4 rounded-lg space-y-2 transition-colors">
              <FileInput
                id="screenshot-upload-input"
                label={t('upload_payment_screenshot_label_plain', 'Upload Payment Screenshot')}
                accept="image/*"
                multiple
                onChange={e => {
                  const files = Array.from(e.target.files || []);
                  files.forEach(f => handleCompressFile(f, 'screenshot'));
                  e.target.value = '';
                }}
                helperText={formState.paymentScreenshotUrls.length > 0 ? `${formState.paymentScreenshotUrls.length} attached - choosing more files adds to this list.` : undefined}
              />
              {formState.paymentScreenshotUrls.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
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
        title={t('petty_cash_ledger_heading', 'Expenses')}
        subtitle={t('petty_cash_ledger_subtitle', 'Track outgoing cash paid for expenses, daily kitchen purchases, salaries etc.')}
      />

      {/* Add Expenses form on top (Full Width Card) */}
      <Card data-tour="petty-cash" className="add-expenses-container w-full shadow-md border-gray-200 dark:border-gray-700">
        <h3 className="petty-cash-management__subtitle font-semibold text-slate-900 dark:text-white text-sm mb-4 flex items-center gap-1.5">
          {t('add_expenses_heading', 'ADD EXPENSES')}
        </h3>
        {renderAddExpenseForm()}
      </Card>

      {/* COST / EXPENSE LOGS - Matching Flowbite Datatable like #past_receipts_log */}
      <div id="past_expenses_log" className="audit-logs__receipts bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        {/* Flowbite Datatable Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-500 dark:text-gray-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search expenses by description, payee, ID..."
                className="h-10 bg-gray-50 border border-gray-300 text-gray-900 text-xs font-medium rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-9 pr-3 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
              />
            </div>

            {/* Timeframe Filter Dropdown */}
            <div className="w-auto min-w-[200px]">
              <select
                value={selectedTimeframe}
                onChange={(e) => setSelectedTimeframe(e.target.value)}
                className="h-10 bg-gray-50 border border-gray-300 text-gray-900 text-xs font-medium rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full px-3 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white cursor-pointer"
              >
                <option value="last_7_days">Last 7 days</option>
                <option value={currentMonthKey}>{`This Month (${new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' })})`}</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="month_to_date">Month to Date</option>
                <option value="year_to_date">Year to Date</option>
                <option value="all_time">All time</option>
                {uniqueMonths.filter(m => m !== currentMonthKey).map(m => {
                  const [y, mm] = m.split('-');
                  const dateObj = new Date(Number(y), Number(mm) - 1, 1);
                  return <option key={m} value={m}>{dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' })}</option>;
                })}
              </select>
            </div>

            {/* Source / Payment Filter Dropdown */}
            <Dropdown
              label=""
              dismissOnClick
              renderTrigger={() => (
                <button
                  type="button"
                  className="h-10 inline-flex items-center justify-center gap-2 px-3 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 dark:hover:text-white dark:focus:ring-gray-700 cursor-pointer shadow-xs whitespace-nowrap"
                >
                  <Filter className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                  <span>
                    {sourceFilter === 'all'
                      ? 'All Sources'
                      : sourceFilter === 'property'
                      ? 'Property Funds'
                      : sourceFilter === 'pocket'
                      ? 'Out of Pocket'
                      : 'Split'}
                  </span>
                </button>
              )}
            >
              <DropdownItem onClick={() => setSourceFilter('all')}>All Sources</DropdownItem>
              <DropdownItem onClick={() => setSourceFilter('property')}>Property Funds</DropdownItem>
              <DropdownItem onClick={() => setSourceFilter('pocket')}>Out of Pocket</DropdownItem>
              <DropdownItem onClick={() => setSourceFilter('split')}>Split Payment</DropdownItem>
            </Dropdown>

            {/* Export CSV Button */}
            <button
              type="button"
              onClick={handleExportCSV}
              className="h-10 inline-flex items-center justify-center gap-2 px-3 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 dark:hover:text-white dark:focus:ring-gray-700 cursor-pointer shadow-xs whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
              <span>Export CSV</span>
            </button>

            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 pl-1 whitespace-nowrap">
              {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Generate Report Button */}
            <button
              type="button"
              onClick={handleGenerateReport}
              className="h-10 inline-flex items-center justify-center gap-2 px-4 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800 cursor-pointer shadow-xs whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Generate report</span>
            </button>
          </div>
        </div>

        {/* Desktop Table (hidden md:block) */}
        <div className="hidden md:block overflow-x-auto">
          {(() => {
            const costLogColumns = [
              {
                name: 'ID',
                cell: (entry: any) => (
                  <div className="py-1">
                    <span className="font-semibold text-gray-900 dark:text-white text-xs block">
                      #{entry.id}
                    </span>
                    <span className="block text-2xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {formatDateDDMMYYYY(entry.date)} {entry.time || '12:00'}
                    </span>
                  </div>
                ),
              },
              {
                name: t('category_column', 'Category'),
                cell: (entry: any) => {
                  const cat = entry.category || entry.costCategory || '';
                  const isAutoSalary = cat === 'Salary (Auto)' || entry.description?.startsWith('Salary (Auto):');
                  return (
                    <div className="py-1">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        {isAutoSalary ? 'Salary (Auto)' : cat}
                      </span>
                    </div>
                  );
                },
              },
              {
                name: t('description_column', 'Description'),
                cell: (entry: any) => {
                  const payer = entry.paidBy || entry.vendor;
                  return (
                    <div className="py-1">
                      <span className="font-semibold text-gray-900 dark:text-white block text-xs">{entry.description}</span>
                      {entry.moreInfoNotes && <span className="block text-2xs text-gray-500 dark:text-gray-400 italic mt-0.5">{entry.moreInfoNotes}</span>}
                      {payer && (
                        <span className="block text-2xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Vendor/Payee: <strong className="text-gray-700 dark:text-gray-300">{payer}</strong>
                        </span>
                      )}
                    </div>
                  );
                },
              },
              {
                name: t('total_column', 'Total Amount'),
                cell: (entry: any) => (
                  <span className="font-semibold text-gray-900 dark:text-white text-xs tabular-numbers">
                    ₹{Number(entry.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                ),
              },
              {
                name: 'Status / Method',
                cell: (entry: any) => {
                  const anyEntry = entry as any;
                  const isOutofPocket = anyEntry.staffAmount && Number(anyEntry.staffAmount) > 0 && Number(anyEntry.staffAmount) === Number(anyEntry.amount);
                  const isSplit = anyEntry.staffAmount && Number(anyEntry.staffAmount) > 0 && anyEntry.drawerAmount && Number(anyEntry.drawerAmount) > 0;
                  return (
                    <Badge variant={isSplit ? 'warning' : isOutofPocket ? 'neutral' : 'success'} size="sm">
                      {isSplit ? 'Split (Till + Pocket)' : isOutofPocket ? 'Out of Pocket' : `Property (${entry.paymentMode || 'UPI'})`}
                    </Badge>
                  );
                },
              },
              ...(canManageExpense ? [{
                name: t('actions_column', 'Actions'),
                cell: (entry: any) => (
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <Button
                      variant="primary"
                      size="sm"
                      className="whitespace-nowrap shrink-0 text-xs font-medium"
                      onClick={() => setEditingEntry({ ...entry, time: entry.time || new Date().toTimeString().slice(0, 5) })}
                      leftIcon={<Edit2 className="w-3.5 h-3.5 shrink-0" />}
                    >
                      {t('edit_button', 'Edit')}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      className="whitespace-nowrap shrink-0 text-xs font-medium"
                      onClick={() => (entry as any).source === 'kitchen' ? handleDeleteKitchenPurchase(entry.id, entry.description) : handleDeleteExpense(entry.id, entry.description)}
                      leftIcon={<Trash2 className="w-3.5 h-3.5 shrink-0" />}
                    >
                      {t('delete_button', 'Delete')}
                    </Button>
                  </div>
                ),
              }] : []),
            ];

            if (pettyCashLoading || kitchenPurchasesLoading) {
              return (
                <div className="p-8 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500 font-semibold text-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> Loading operational expenses...
                </div>
              );
            }
            if (filteredEntries.length === 0) {
              return (
                <div className="text-center p-8 text-slate-400 font-semibold text-xs">
                  No operational expenses found matching the current search & filters.
                </div>
              );
            }
            return (
              <>
                <Table hoverable>
                  <TableHead>
                    <TableRow>
                      {costLogColumns.map((col) => (
                        <TableHeadCell key={col.name}>{col.name}</TableHeadCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredEntries.slice((desktopPage - 1) * DESKTOP_PAGE_SIZE, desktopPage * DESKTOP_PAGE_SIZE).map((entry: any) => (
                      <TableRow key={entry.id} className="bg-white dark:bg-gray-800">
                        {costLogColumns.map((col) => (
                          <TableCell key={col.name}>{col.cell(entry)}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination
                  page={desktopPage}
                  totalItems={filteredEntries.length}
                  pageSize={DESKTOP_PAGE_SIZE}
                  onPageChange={setDesktopPage}
                  itemLabel="entries"
                />
              </>
            );
          })()}
        </div>

        {/* Touch-First Mobile Cards View with 10-Item Pagination */}
        <div className="md:hidden p-4 space-y-3">
          {(() => {
            const paginatedEntries = filteredEntries.slice((mobilePage - 1) * 10, mobilePage * 10);
            return (
              <>
                <div className="space-y-3">
                  {paginatedEntries.map((entry: any) => {
                    const isOutofPocket = entry.staffAmount && Number(entry.staffAmount) > 0 && Number(entry.staffAmount) === Number(entry.amount);
                    const isSplit = entry.staffAmount && Number(entry.staffAmount) > 0 && entry.drawerAmount && Number(entry.drawerAmount) > 0;
                    const payer = entry.paidBy || entry.vendor;
                    const cat = entry.category || entry.costCategory || '';

                    return (
                      <div key={entry.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3.5 space-y-2.5 shadow-md">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-xs text-slate-400 block">#{entry.id}</span>
                            <h4 className="font-semibold text-slate-900 dark:text-white text-xs mt-0.5">{entry.description}</h4>
                            {payer && <span className="text-2xs text-slate-500 dark:text-slate-400 font-medium">Vendor/Payee: {payer}</span>}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge variant={isSplit ? 'warning' : isOutofPocket ? 'neutral' : 'success'} size="sm">
                              {isSplit ? 'Split' : isOutofPocket ? 'Out of Pocket' : `Property (${entry.paymentMode || 'UPI'})`}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-slate-700">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                            {cat}
                          </span>
                          <span className="font-semibold text-xs text-slate-900 dark:text-white tabular-numbers">
                            ₹{Number(entry.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        {canManageExpense && (
                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                            <Button
                              variant="primary"
                              size="sm"
                              className="whitespace-nowrap shrink-0 text-xs font-medium"
                              onClick={() => setEditingEntry({ ...entry, time: entry.time || new Date().toTimeString().slice(0, 5) })}
                              leftIcon={<Edit2 className="w-3.5 h-3.5 shrink-0" />}
                            >
                              {t('edit_button', 'Edit')}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              className="whitespace-nowrap shrink-0 text-xs font-medium"
                              onClick={() => entry.source === 'kitchen' ? handleDeleteKitchenPurchase(entry.id, entry.description) : handleDeleteExpense(entry.id, entry.description)}
                              leftIcon={<Trash2 className="w-3.5 h-3.5 shrink-0" />}
                            >
                              {t('delete_button', 'Delete')}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {filteredEntries.length === 0 && (
                    <div className="text-center p-8 text-slate-400 font-semibold text-xs">
                      No operational expenses found.
                    </div>
                  )}
                </div>

                {/* Mobile Pagination Controls */}
                {filteredEntries.length > 10 && (
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
                    <button
                      type="button"
                      disabled={mobilePage === 1}
                      onClick={() => setMobilePage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                    >
                      Previous
                    </button>
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Page {mobilePage} of {Math.ceil(filteredEntries.length / 10)}
                    </span>
                    <button
                      type="button"
                      disabled={mobilePage >= Math.ceil(filteredEntries.length / 10)}
                      onClick={() => setMobilePage((p) => Math.min(Math.ceil(filteredEntries.length / 10), p + 1))}
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

      {/* Edit Entry Drawer for Admin & Super Admin */}
      <Drawer
        open={Boolean(editingEntry)}
        onClose={() => setEditingEntry(null)}
        position="right"
        className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
      >
        {editingEntry && (
          <>
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <span className="flex items-center gap-2 font-bold text-gray-900 dark:text-white text-base">
                <Pencil className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                {t('edit_expense_record_heading', 'EDIT EXPENSE RECORD #')}{editingEntry.id}
              </span>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModalEdit} className="app-form app-form--edit-expense flex-1 flex flex-col justify-between overflow-y-auto">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                </div>
              </div>

              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditingEntry(null)}
                >
                  {t('cancel_button', 'Cancel')}
                </Button>
                <Button type="submit" variant="primary">
                  {t('save_changes_button', 'Save Changes')}
                </Button>
              </div>
            </form>
          </>
        )}
      </Drawer>

      {/* PAYEE MANAGER DRAWER
          RESTORED 25 Aug 2026 - this whole drawer (and the Custom Items one below it) was
          silently deleted from the JSX on 20 Aug 2026 (commit 32325b3, an unrelated refactor
          that turned this component into an embeddable "onlyForm" add-expense form) while every
          bit of state and every handler it depends on (isPayeeManagerOpen, editingPayee,
          handleSavePayee, handleDeletePayee, payeeLightboxUrl, etc.) was left fully intact and
          still wired up - including the "Manage Payees" button below the vendor picker, which
          kept calling setIsPayeeManagerOpen(true) the whole time. Confirmed via
          `git log -S "show={isPayeeManagerOpen}"` and `npx tsc --noEmit` (it flagged every one
          of these as "declared but its value is never read" - the actual signal that led here).
          Net effect for 5 days: clicking "Manage Payees" (or "Register ... to Custom Items
          list"/"Edit existing items" below) did nothing at all, silently - no error, no
          feedback, just a dead button. Restored verbatim from the pre-deletion version (git show
          32325b3^), converted from that version's centered <Modal> to this app's now-mandatory
          right-side <Drawer> pattern (DESIGN.md's Flowbite Modals & Drawers spec, adopted after
          this content was deleted) - everything else (handlers, DB calls, table markup) is
          unchanged. */}
      <Drawer
        open={isPayeeManagerOpen}
        onClose={() => setIsPayeeManagerOpen(false)}
        position="right"
        className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Landmark className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white m-0">Registered Payees (Vendors & Third Parties)</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 m-0 font-normal">Manage operational suppliers, business vendors, and pass-through entities.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsPayeeManagerOpen(false)}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6 text-xs">
          {/* Add / Edit Payee Form Area */}
          {isAddingNewPayee || editingPayee ? (
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-4">
              <h4 className="font-bold text-slate-850 dark:text-slate-200 text-sm flex items-center gap-1.5">
                {editingPayee ? <Pencil className="w-4 h-4 text-blue-600" /> : <Plus className="w-4 h-4 text-blue-600" />}
                {editingPayee ? 'Edit Payee Settings' : 'Register New Account Payee'}
              </h4>
              <form onSubmit={handleSavePayee} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Payee Account Name *</label>
                    <Input
                      type="text"
                      required
                      value={editingPayee ? editingPayee.name : newPayeeForm.name}
                      onChange={e => {
                        if (editingPayee) {
                          setEditingPayee({ ...editingPayee, name: e.target.value });
                        } else {
                          setNewPayeeForm({ ...newPayeeForm, name: e.target.value });
                        }
                      }}
                      onBlur={() => setPayeeNameTouched(true)}
                      error={payeeNameTouched && !(editingPayee ? editingPayee.name : newPayeeForm.name).trim() ? 'This field is required' : undefined}
                      placeholder="e.g. Raju Grocery, Pool Supplier"
                    />
                  </div>
                  <div>
                    <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">UPI ID (Optional)</label>
                    <Input
                      type="text"
                      value={editingPayee ? (editingPayee.upiId || '') : newPayeeForm.upiId}
                      onChange={e => {
                        if (editingPayee) {
                          setEditingPayee({ ...editingPayee, upiId: e.target.value });
                        } else {
                          setNewPayeeForm({ ...newPayeeForm, upiId: e.target.value });
                        }
                      }}
                      placeholder="e.g. raju@upi"
                    />
                  </div>
                </div>

                <div>
                  <FileInput
                    label="UPI QR Code Graphic (Optional)"
                    accept="image/*"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          if (editingPayee) {
                            setEditingPayee({ ...editingPayee, qrCodeUrl: reader.result as string });
                          } else {
                            setNewPayeeForm({ ...newPayeeForm, qrCodeUrl: reader.result as string });
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  {(editingPayee?.qrCodeUrl || newPayeeForm.qrCodeUrl) && (
                    <div className="mt-2 flex items-center gap-3">
                      <img
                        src={editingPayee ? editingPayee.qrCodeUrl : newPayeeForm.qrCodeUrl}
                        alt="UPI QR Code preview"
                        className="h-16 w-16 object-contain border rounded p-1 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (editingPayee) {
                            setEditingPayee({ ...editingPayee, qrCodeUrl: '' });
                          } else {
                            setNewPayeeForm({ ...newPayeeForm, qrCodeUrl: '' });
                          }
                        }}
                        className="text-xs text-red-500 font-semibold hover:underline"
                      >
                        Remove QR
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2 justify-end border-t border-slate-200 dark:border-slate-800">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setEditingPayee(null);
                      setIsAddingNewPayee(false);
                      setNewPayeeForm({ name: '', upiId: '', qrCodeUrl: '' });
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isSavingPayee}
                  >
                    {isSavingPayee ? 'Saving...' : editingPayee ? 'Save Updates' : 'Register Payee'}
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-slate-200 dark:border-slate-850">
              <div className="flex-1 max-w-xs">
                <FlowbiteTextInput
                  icon={Search}
                  value={searchPayeeQuery}
                  onChange={e => setSearchPayeeQuery(e.target.value)}
                  placeholder="Search by name..."
                />
              </div>
              <Button
                variant="primary"
                onClick={() => { setIsAddingNewPayee(true); setPayeeNameTouched(false); }}
              >
                <Plus className="w-4 h-4 mr-1 inline-block" />
                Register Account Payee
              </Button>
            </div>
          )}

          {/* Payees Table / List Grid */}
          {!isAddingNewPayee && !editingPayee && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 text-[10px] text-slate-500 font-bold uppercase border-b border-slate-200 dark:border-slate-700">
                      <th className="px-4 py-3">Payee Name</th>
                      <th className="px-4 py-3 text-center">UPI QR Code</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {dbVendors.filter(p => !searchPayeeQuery || p.name.toLowerCase().includes(searchPayeeQuery.toLowerCase())).length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center py-8 text-slate-400 font-semibold italic">No registered payees found.</td>
                      </tr>
                    ) : (
                      dbVendors.filter(p => !searchPayeeQuery || p.name.toLowerCase().includes(searchPayeeQuery.toLowerCase())).map(p => (
                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-900 dark:text-white">{p.name}</span>
                              {p.upiId && <span className="text-[10px] text-slate-400 font-mono select-all mt-0.5">UPI: {p.upiId}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {p.qrCodeUrl ? (
                              <button
                                onClick={() => setPayeeLightboxUrl(p.qrCodeUrl!)}
                                className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-semibold flex items-center justify-center gap-1 mx-auto cursor-pointer"
                              >
                                <Camera className="w-3.5 h-3.5" /> View QR
                              </button>
                            ) : (
                              <span className="text-slate-400 italic">None</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="secondary"
                                size="xs"
                                onClick={() => setEditingPayee(p)}
                                leftIcon={<Pencil className="w-3.5 h-3.5 shrink-0" />}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="danger"
                                size="xs"
                                onClick={() => handleDeletePayee(p.id, p.name)}
                                disabled={isSavingPayee}
                                leftIcon={<Trash2 className="w-3.5 h-3.5 shrink-0" />}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Drawer>

      {/* CUSTOM ITEMS DRAWER - see the PAYEE MANAGER DRAWER comment above for the full 25 Aug
          2026 restoration writeup; same root cause, same fix, applies here identically. */}
      <Drawer
        open={isCustomItemsOpen}
        onClose={() => setIsCustomItemsOpen(false)}
        position="right"
        className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white m-0">Custom Expense Items Catalog</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 m-0 font-normal">Manage recurring items and quick-fill suggestions for your property.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsCustomItemsOpen(false)}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6 text-xs">
          {isAddingCustomItem || editingCustomItem ? (
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-4">
              <h4 className="font-bold text-slate-850 dark:text-slate-200 text-sm flex items-center gap-1.5">
                {editingCustomItem ? <Pencil className="w-4 h-4 text-blue-600" /> : <Plus className="w-4 h-4 text-blue-600" />}
                {editingCustomItem ? 'Edit Custom Item' : 'Register Custom Expense Item'}
              </h4>
              <form onSubmit={handleSaveCustomItem} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Item Name *</label>
                    <Input
                      type="text"
                      required
                      value={editingCustomItem ? editingCustomItem.label : newCustomItemForm.label}
                      onChange={e => {
                        if (editingCustomItem) {
                          setEditingCustomItem({ ...editingCustomItem, label: e.target.value });
                        } else {
                          setNewCustomItemForm({ ...newCustomItemForm, label: e.target.value });
                        }
                      }}
                      onBlur={() => setCustomItemNameTouched(true)}
                      error={customItemNameTouched && !(editingCustomItem ? editingCustomItem.label : newCustomItemForm.label).trim() ? 'This field is required' : undefined}
                      placeholder="e.g. Pool Chlorine, Diesel Can"
                    />
                  </div>
                  <div>
                    <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Category</label>
                    <StyledSelect
                      value={editingCustomItem ? editingCustomItem.category : newCustomItemForm.category}
                      onChange={val => {
                        if (editingCustomItem) {
                          setEditingCustomItem({ ...editingCustomItem, category: val });
                        } else {
                          setNewCustomItemForm({ ...newCustomItemForm, category: val });
                        }
                      }}
                      options={[
                        { value: 'Other', label: 'Other' },
                        { value: 'Bills', label: 'Bills & Utilities' },
                        { value: 'Kitchen', label: 'Kitchen & Supplies' },
                        { value: 'Staff Advance', label: 'Staff Salaries & Adv.' },
                      ]}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Default Amount (₹)</label>
                    <Input
                      type="number"
                      step="any"
                      value={editingCustomItem ? editingCustomItem.defaultAmount : newCustomItemForm.defaultAmount}
                      onChange={e => {
                        if (editingCustomItem) {
                          setEditingCustomItem({ ...editingCustomItem, defaultAmount: e.target.value });
                        } else {
                          setNewCustomItemForm({ ...newCustomItemForm, defaultAmount: e.target.value });
                        }
                      }}
                      placeholder="e.g. 150.00"
                    />
                  </div>
                  <div>
                    <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Short Notes / Description (Optional)</label>
                    <Input
                      type="text"
                      value={editingCustomItem ? (editingCustomItem.description || '') : newCustomItemForm.description}
                      onChange={e => {
                        if (editingCustomItem) {
                          setEditingCustomItem({ ...editingCustomItem, description: e.target.value });
                        } else {
                          setNewCustomItemForm({ ...newCustomItemForm, description: e.target.value });
                        }
                      }}
                      placeholder="e.g. Daily transport fare"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 justify-end border-t border-slate-200 dark:border-slate-800">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setEditingCustomItem(null);
                      setIsAddingCustomItem(false);
                      setNewCustomItemForm({ label: '', category: 'Other', defaultAmount: '0.00', description: '' });
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isSavingCustomItem}
                  >
                    {isSavingCustomItem ? 'Saving...' : editingCustomItem ? 'Save Updates' : 'Create Item'}
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-slate-200 dark:border-slate-850">
              <div className="flex-1 max-w-xs">
                <FlowbiteTextInput
                  icon={Search}
                  value={searchCustomQuery}
                  onChange={e => setSearchCustomQuery(e.target.value)}
                  placeholder="Search items by name..."
                />
              </div>
              <Button
                variant="primary"
                onClick={() => { setIsAddingCustomItem(true); setCustomItemNameTouched(false); }}
              >
                <Plus className="w-4 h-4 mr-1 inline-block" />
                Create Custom Item
              </Button>
            </div>
          )}

          {/* Custom Items Table / List Grid */}
          {!isAddingCustomItem && !editingCustomItem && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 text-[10px] text-slate-500 font-bold uppercase border-b border-slate-200 dark:border-slate-700">
                      <th className="px-4 py-3">Item Name</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3 text-right">Default Amount</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {customExpenses.filter(p => !searchCustomQuery || p.label.toLowerCase().includes(searchCustomQuery.toLowerCase())).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-8 text-slate-400 font-semibold italic">No custom items found.</td>
                      </tr>
                    ) : (
                      customExpenses.filter(p => !searchCustomQuery || p.label.toLowerCase().includes(searchCustomQuery.toLowerCase())).map(p => (
                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-900 dark:text-white">{p.label}</span>
                              {p.description && <span className="text-[10px] text-slate-400">{p.description}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded font-semibold text-[10px]">{p.category}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-medium text-slate-700 dark:text-slate-300">
                            ₹{p.default_amount}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="secondary"
                                size="xs"
                                onClick={() => setEditingCustomItem({ id: p.id, label: p.label, category: p.category, defaultAmount: p.default_amount.toString(), description: p.description || '' })}
                                leftIcon={<Pencil className="w-3.5 h-3.5 shrink-0" />}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="danger"
                                size="xs"
                                onClick={() => handleDeleteCustomItem(p.id, p.label)}
                                disabled={isSavingCustomItem}
                                leftIcon={<Trash2 className="w-3.5 h-3.5 shrink-0" />}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Drawer>

      {/* LIGHTBOX FOR UPI QR CODE */}
      {payeeLightboxUrl && (
        <div
          onClick={() => setPayeeLightboxUrl(null)}
          className="fixed inset-0 bg-slate-950/90 backdrop-blur-xs flex items-center justify-center p-4 z-100 animate-in fade-in cursor-zoom-out"
        >
          <div className="relative max-w-sm w-full bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xl">
            <button
              onClick={() => setPayeeLightboxUrl(null)}
              className="absolute top-2 right-2 p-1 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-650 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 p-2 bg-slate-50">
              <img src={payeeLightboxUrl} alt="UPI QR Code" className="w-full h-auto rounded-lg" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
