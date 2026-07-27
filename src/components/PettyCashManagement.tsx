import React, { useState, useEffect } from 'react';
import { Wallet, PlusCircle, ArrowUpRight, ArrowDownLeft, IndianRupee, X, Check, Search, Calendar, Edit2, Upload, FileText, ImageIcon } from 'lucide-react';
import { PettyCashEntry, StaffMember } from '../types';
import { fetchExpenseItemPricesFromDB, fetchExpenseItemsFromDB, addExpenseToDB, updateExpenseInDB, fetchStaffUsersFromDB } from '../services/api';

const FALLBACK_EXPENSES = [
  'Badminton racket', 'Ball', 'Bat', 'Bedsheets', 'Blanket', 'Broom', 'Brush', 'Bucket',
  'Bulb', 'Carrom board', 'Chemical', 'Chess board', 'Cleaning Net', 'Curtains', 'Denial kit',
  'Diesel', 'Dustpan', 'Electricity Bill', 'Extension Board', 'Fan', 'Filter', 'Gargabe bag',
  'Glass cleaner', 'Hair dryer', 'Hardware', 'Internet', 'Light', 'MCB', 'Mop', 'Motor Repair',
  'Paint', 'Petrol', 'Pillow Covers', 'Pipe', 'Primer', 'Pump', 'Putty', 'PVC Fittings',
  'Roller', 'Room freshner', 'Shampoo', 'Shower', 'Soap', 'Stumps', 'Surf', 'Switch',
  'Tap', 'Thinner', 'Toilet Brush', 'Toilet cleaner', 'Toilet Paper', 'Towels', 'Tube',
  'Tube Light', 'Vacum', 'Wash basin', 'Washing Machine', 'Water Bill', 'Water Tank', 'Wiper', 'Wire'
];

interface PettyCashManagementProps {
  entries: PettyCashEntry[];
  staff: StaffMember[];
  onAddEntry: (entry: PettyCashEntry) => void;
  onUpdateEntry?: (entry: PettyCashEntry) => void;
  activeRole?: string;
}

export const PettyCashManagement: React.FC<PettyCashManagementProps> = ({
  entries,
  staff,
  onAddEntry,
  onUpdateEntry,
  activeRole = 'Super Admin',
}) => {
  // Form State - Default category is "Other"
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState<string>('Other');
  const [description, setDescription] = useState('');
  const [moreInfoNotes, setMoreInfoNotes] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMode, setPaymentMode] = useState<string>('Online / UPI / QR');
  const [financialHandlers, setFinancialHandlers] = useState<any[]>(staff.filter(u => u.isFinancialHandler));
  const [paidBy, setPaidBy] = useState('Tarpan');

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

  // Item prices map from database
  const [itemPrices, setItemPrices] = useState<Record<string, number>>({});

  // Expense items list from database (replaces hardcoded array)
  const [expenseItems, setExpenseItems] = useState<string[]>(FALLBACK_EXPENSES);

  // Proof Management States (Base64 URL)
  const [invoiceBillUrl, setInvoiceBillUrl] = useState<string>('');
  const [paymentScreenshotUrl, setPaymentScreenshotUrl] = useState<string>('');

  // Inline Editing State / Modal Edit State for Admin & Super Admin
  const [editingEntry, setEditingEntry] = useState<PettyCashEntry | null>(null);
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'date' | 'amount' } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);

  // Search & Pagination State
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-07');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(10);

  // Fetch prices and item list from DB on mount
  useEffect(() => {
    fetchExpenseItemPricesFromDB().then((prices) => {
      if (prices && Object.keys(prices).length > 0) {
        setItemPrices(prices);
      }
    });
    fetchExpenseItemsFromDB().then((items) => {
      if (items && items.length > 0) {
        setExpenseItems(items);
      }
    });
  }, []);

  // Derive list of unique months in entries for dropdown
  const uniqueMonths = Array.from(new Set(entries.map(e => e.date.substring(0, 7)))).sort().reverse();
  if (uniqueMonths.length === 0 && !uniqueMonths.includes('2026-07')) {
    uniqueMonths.push('2026-07');
  }

  // Float balance logic
  const totalReplenishments = entries
    .filter((e) => e.type === 'Replenishment')
    .reduce((sum, e) => sum + e.amount, 0);

  const totalExpenses = entries
    .filter((e) => e.type === 'Expense' || !e.type)
    .reduce((sum, e) => sum + e.amount, 0);

  const netBalance = totalReplenishments - totalExpenses;

  // Compress & Crop Image Engine
  const handleCompressFile = (file: File, type: 'invoice' | 'screenshot') => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
          if (type === 'invoice') {
            setInvoiceBillUrl(compressedBase64);
          } else {
            setPaymentScreenshotUrl(compressedBase64);
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Handle Description change with Auto-fill Price lookup
  const handleDescriptionChange = (val: string) => {
    setDescription(val);
    const trimmed = val.trim();
    if (trimmed && itemPrices[trimmed] !== undefined) {
      setAmount(itemPrices[trimmed]);
    } else {
      // Check case-insensitive match
      const matchedKey = Object.keys(itemPrices).find(
        k => k.toLowerCase() === trimmed.toLowerCase()
      );
      if (matchedKey && itemPrices[matchedKey] !== undefined) {
        setAmount(itemPrices[matchedKey]);
      }
    }
  };

  // Form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount) return;

    // Security Gate check for Salaries
    if (category === 'Salaries' && activeRole !== 'Admin' && activeRole !== 'Super Admin') {
      alert('🔒 Access Denied: Only Admins or Super Admins are authorized to record Salary payments.');
      return;
    }

    const finalDescription = category === 'Salaries' ? `Salary payout for ${description}` : description;

    const entry: PettyCashEntry = {
      id: `pc-${Date.now().toString().slice(-4)}`,
      date: expenseDate,
      costCategory: category,
      category,
      description: finalDescription,
      moreInfoNotes: moreInfoNotes || undefined,
      vendor: paidBy,
      paidBy: paidBy,
      amount: Number(amount),
      paymentMode,
      invoiceBillUrl: invoiceBillUrl || undefined,
      paymentScreenshotUrl: paymentScreenshotUrl || undefined,
      type: 'Expense'
    };

    onAddEntry(entry);
    addExpenseToDB(entry);

    // Update item price tracking map locally
    if (category === 'Other' && description.trim() && amount) {
      setItemPrices(prev => ({ ...prev, [description.trim()]: Number(amount) }));
    }

    // Cash Drawer Sync alert
    if (paymentMode === 'Cash') {
      alert(`[Cash Drawer Sync] Recorded cash outflow of ₹${amount}. Cash-in-hand reduced for cashier: ${paidBy}.`);
    }

    // Reset Form
    setDescription('');
    setMoreInfoNotes('');
    setAmount('');
    setInvoiceBillUrl('');
    setPaymentScreenshotUrl('');
  };

  // Double click cell to edit inline
  const handleCellDoubleClick = (entryId: string, field: 'date' | 'amount', currentValue: any) => {
    if (activeRole !== 'Admin' && activeRole !== 'Super Admin') return;
    setEditingCell({ id: entryId, field });
    setEditValue(String(currentValue));
  };

  const handleCellSave = (entryId: string) => {
    if (!editingCell || !onUpdateEntry) return;

    const original = entries.find(e => e.id === entryId);
    if (!original) return;

    const updated: PettyCashEntry = {
      ...original,
      [editingCell.field]: editingCell.field === 'amount' ? Number(editValue) : editValue
    };

    onUpdateEntry(updated);
    updateExpenseInDB(updated);

    if (updated.description && updated.amount) {
      setItemPrices(prev => ({ ...prev, [updated.description.trim()]: Number(updated.amount) }));
    }

    setEditingCell(null);
  };

  // Save Modal Edit
  const handleSaveModalEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry || !onUpdateEntry) return;
    onUpdateEntry(editingEntry);
    updateExpenseInDB(editingEntry);
    if (editingEntry.description && editingEntry.amount) {
      setItemPrices(prev => ({ ...prev, [editingEntry.description.trim()]: Number(editingEntry.amount) }));
    }
    setEditingEntry(null);
  };

  // Filter entries
  const filteredEntries = entries.filter(e => {
    const matchesMonth = e.date.startsWith(selectedMonth);
    const text = (e.description + ' ' + (e.category || e.costCategory || '') + ' ' + (e.paidBy || '') + ' ' + e.amount).toLowerCase();
    const matchesSearch = text.includes(searchQuery.toLowerCase());
    return matchesMonth && matchesSearch;
  });

  const paginatedEntries = filteredEntries.slice(0, visibleCount);

  return (
    <div className="expenses-page-container space-y-6 text-xs text-slate-800 dark:text-slate-200">
      {/* Datalist for Details Descriptions Autocomplete */}
      <datalist id="expense-items-list">
        {expenseItems.map(item => (
          <option key={item} value={item} />
        ))}
      </datalist>

      {/* Top Title */}
      <div>
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
          Operational Expenses Ledger
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Track outgoing utility expenditures, daily kitchen purchases, salaries, and floats.
        </p>
      </div>



      {/* Visible inline Form */}
      <div className="add-expenses-container bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5">
        <h3 className="font-bold text-slate-900 dark:text-white text-sm border-l-3 border-red-500 pl-2.5 mb-4 flex items-center gap-1.5">
          📝 ADD EXPENSES
        </h3>

        <form onSubmit={handleSubmit} className="add-expense-form space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-bold mb-1">Expense Date</label>
              <input
                type="date"
                required
                value={expenseDate}
                onChange={e => setExpenseDate(e.target.value)}
                onClick={e => { try { e.currentTarget.showPicker(); } catch {} }}
                className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-bold mb-1">Cost Category Group</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
              >
                <option value="Other">Other</option>
                <option value="Salaries">Salaries</option>
                <option value="Bills">Bills</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-bold mb-1">Details Descriptions *</label>
            {category === 'Salaries' ? (
              <div>
                <select
                  required
                  value={description}
                  onChange={e => handleDescriptionChange(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold"
                >
                  <option value="">-- Select Staff Beneficiary --</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.name}>{s.name} ({s.role})</option>
                  ))}
                </select>
                {category === 'Salaries' && activeRole !== 'Admin' && activeRole !== 'Super Admin' && (
                  <p className="text-red-500 font-semibold text-[10px] mt-1">🔒 Warning: You are not logged in as Admin. Salary submission will be blocked.</p>
                )}
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  required
                  value={description}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  onChange={e => {
                    handleDescriptionChange(e.target.value);
                    setShowSuggestions(true);
                  }}
                  placeholder="Type to search items... (e.g., MCB, Petrol, Water Bill)"
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-cyan-500 focus:outline-hidden"
                />
                
                {/* Interactive Auto-suggestions Dropdown Menu */}
                {showSuggestions && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {expenseItems.filter(item => 
                      item.toLowerCase().includes(description.toLowerCase().trim())
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
                      item.toLowerCase().includes(description.toLowerCase().trim())
                    ).length === 0 && (
                      <div className="p-3 text-slate-400 italic text-center">
                        No matching pre-stored items found. You can still type a custom description!
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-bold mb-1">& More Information (If Any)</label>
            <textarea
              value={moreInfoNotes}
              onChange={e => setMoreInfoNotes(e.target.value)}
              placeholder="Optional contextual notes..."
              className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white h-20 font-medium"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-bold mb-1">Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="e.g., 450"
                className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
              />
              {description.trim() && itemPrices[description.trim()] !== undefined && (
                <p className="text-[10px] text-emerald-600 font-semibold mt-1">
                  💡 Last input price auto-filled: ₹{itemPrices[description.trim()]} (Editable)
                </p>
              )}
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-bold mb-1">Payment Mode</label>
              <select
                value={paymentMode}
                onChange={e => setPaymentMode(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
              >
                <option value="Online / UPI / QR">Online / UPI / QR</option>
                <option value="Cash">Cash</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-bold mb-1">Paid By</label>
              <select
                value={paidBy}
                onChange={e => setPaidBy(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold"
              >
                {financialHandlers.map(h => (
                  <option key={h.id} value={h.username}>{h.username}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Proof uploads */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-dashed border-slate-300 dark:border-slate-700 p-4 rounded-xl text-center space-y-2 relative">
              <label className="block font-bold text-slate-600 dark:text-slate-400">📁 Capture / Upload Invoice Bill</label>
              <input
                type="file"
                accept="image/*"
                onChange={e => e.target.files?.[0] && handleCompressFile(e.target.files[0], 'invoice')}
                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
              />
              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 py-3 rounded-lg text-slate-500 font-semibold flex items-center justify-center gap-1.5">
                <FileText className="w-4 h-4 text-slate-400" />
                <span>{invoiceBillUrl ? '✓ Invoice Loaded (Compressed)' : 'Choose Document'}</span>
              </div>
              {invoiceBillUrl && (
                <img src={invoiceBillUrl} alt="Invoice" className="mx-auto h-12 object-contain border rounded mt-2 shadow-2xs" />
              )}
            </div>

            <div className="border border-dashed border-slate-300 dark:border-slate-700 p-4 rounded-xl text-center space-y-2 relative">
              <label className="block font-bold text-slate-600 dark:text-slate-400">📸 Upload Payment Screenshot</label>
              <input
                type="file"
                accept="image/*"
                onChange={e => e.target.files?.[0] && handleCompressFile(e.target.files[0], 'screenshot')}
                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
              />
              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 py-3 rounded-lg text-slate-500 font-semibold flex items-center justify-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-slate-400" />
                <span>{paymentScreenshotUrl ? '✓ Screenshot Loaded (Compressed)' : 'Select Screenshot'}</span>
              </div>
              {paymentScreenshotUrl && (
                <img src={paymentScreenshotUrl} alt="Screenshot" className="mx-auto h-12 object-contain border rounded mt-2 shadow-2xs" />
              )}
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="btn-submit-expense bg-cyan-500 hover:bg-cyan-600 text-white font-bold px-8 py-3 rounded-xl shadow-2xs flex items-center gap-2 cursor-pointer transition-colors"
            >
              <span>ADD EXPENSE</span>
            </button>
          </div>
        </form>
      </div>

      {/* Live Search & Filter Panel */}
      <div className="expenses-filter-bar bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="font-bold text-slate-700 dark:text-slate-300">📅 Select Ledger Month</span>
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="p-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg font-semibold"
          >
            {uniqueMonths.map(m => {
              const [y, mm] = m.split('-');
              const dateObj = new Date(Number(y), Number(mm) - 1, 1);
              const label = dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });
              return <option key={m} value={m}>{label}</option>;
            })}
          </select>
        </div>

        <div className="relative flex-1 max-w-md w-full">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search descriptions, payment modes, payees..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      </div>

      {/* Cost Logs Table */}
      <div className="cost-logs-container bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs overflow-hidden p-5 space-y-4">
        <div className="border-b border-slate-100 dark:border-slate-700 pb-3 flex items-center justify-between">
          <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">
            Cost Logs for {new Date(Number(selectedMonth.split('-')[0]), Number(selectedMonth.split('-')[1]) - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
          </h3>
          <span className="font-mono text-slate-400 font-bold">{filteredEntries.length} entries found</span>
        </div>

        <div className="overflow-x-auto text-xs">
          <table className="cost-logs-table w-full text-left text-slate-700 dark:text-slate-300 border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-900 font-bold border-b border-slate-200 dark:border-slate-700 uppercase text-[10px]">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Category</th>
                <th className="p-3">Description</th>
                <th className="p-3">Total</th>
                <th className="p-3">Mode</th>
                {(activeRole === 'Admin' || activeRole === 'Super Admin') && (
                  <th className="p-3 text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {paginatedEntries.map((entry) => {
                const isEditingDate = editingCell?.id === entry.id && editingCell.field === 'date';
                const isEditingAmount = editingCell?.id === entry.id && editingCell.field === 'amount';

                return (
                  <tr key={entry.id} className="cost-log-row hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    {/* Date Cell */}
                    <td className="p-3 text-slate-500 font-mono">
                      {isEditingDate ? (
                        <input
                          type="date"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => handleCellSave(entry.id)}
                          onKeyDown={e => e.key === 'Enter' && handleCellSave(entry.id)}
                          autoFocus
                          className="p-1 border border-blue-500 rounded text-slate-900"
                        />
                      ) : (
                        <span
                          onDoubleClick={() => handleCellDoubleClick(entry.id, 'date', entry.date)}
                          className="cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-950 px-1 py-0.5 rounded transition-all font-semibold"
                          title="Double click to edit Date"
                        >
                          {entry.date}
                        </span>
                      )}
                    </td>

                    <td className="p-3">
                      <span className="bg-slate-100 dark:bg-slate-900 px-2 py-0.5 border border-slate-200 dark:border-slate-700 rounded font-bold text-[10px]">
                        {entry.category || entry.costCategory}
                      </span>
                    </td>

                    <td className="p-3">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{entry.description}</div>
                      {entry.moreInfoNotes && (
                        <p className="text-[10px] text-slate-400 italic mt-0.5">{entry.moreInfoNotes}</p>
                      )}
                      <p className="text-[10px] text-slate-500 mt-0.5">Paid by: <strong>{entry.paidBy || entry.vendor}</strong></p>
                    </td>

                    {/* Amount Cell */}
                    <td className="p-3 font-mono font-bold text-slate-950 dark:text-white text-sm">
                      {isEditingAmount ? (
                        <input
                          type="number"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => handleCellSave(entry.id)}
                          onKeyDown={e => e.key === 'Enter' && handleCellSave(entry.id)}
                          autoFocus
                          className="p-1 border border-blue-500 rounded w-24 text-slate-900"
                        />
                      ) : (
                        <span
                          onDoubleClick={() => handleCellDoubleClick(entry.id, 'amount', entry.amount)}
                          className="cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-950 px-1 py-0.5 rounded transition-all border-b border-dashed border-slate-400"
                          title="Double click to edit Amount"
                        >
                          ₹{entry.amount.toFixed(2)}
                        </span>
                      )}
                    </td>

                    <td className="p-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        entry.paymentMode === 'Cash' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {entry.paymentMode || 'Online'}
                      </span>
                    </td>

                    {(activeRole === 'Admin' || activeRole === 'Super Admin') && (
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setEditingEntry(entry)}
                          className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 ml-auto cursor-pointer transition-colors"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Load More Pagination - Appears ONLY when entries are more than 10 */}
        {filteredEntries.length > visibleCount && (
          <div className="pt-4 mt-4 text-center border-t border-slate-100 dark:border-slate-700">
            <button
              onClick={() => setVisibleCount((prev: number) => prev + 10)}
              className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-[10px] px-6 py-2 rounded-full shadow-2xs transition-colors cursor-pointer"
            >
              Load More Entries ({filteredEntries.length - visibleCount} remaining)
            </button>
          </div>
        )}

        {filteredEntries.length === 0 && (
          <div className="text-center p-8 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 font-semibold">
            No expenses recorded for this month matching criteria.
          </div>
        )}
      </div>

      {/* Edit Entry Modal for Admin & Super Admin */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-600" /> EDIT EXPENSE RECORD #{editingEntry.id}
              </h3>
              <button onClick={() => setEditingEntry(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModalEdit} className="space-y-4">
              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">Expense Date</label>
                <input
                  type="date"
                  required
                  value={editingEntry.date}
                  onChange={e => setEditingEntry({ ...editingEntry, date: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">Category</label>
                <select
                  value={editingEntry.category || editingEntry.costCategory || 'Other'}
                  onChange={e => setEditingEntry({ ...editingEntry, category: e.target.value, costCategory: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                >
                  <option value="Other">Other</option>
                  <option value="Salaries">Salaries</option>
                  <option value="Bills">Bills</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">Details Description</label>
                <input
                  type="text"
                  required
                  list="expense-items-list"
                  value={editingEntry.description}
                  onChange={e => setEditingEntry({ ...editingEntry, description: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">Amount (₹)</label>
                <input
                  type="number"
                  required
                  step="any"
                  value={editingEntry.amount}
                  onChange={e => setEditingEntry({ ...editingEntry, amount: Number(e.target.value) })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">Payment Mode</label>
                <select
                  value={editingEntry.paymentMode || 'Online / UPI / QR'}
                  onChange={e => setEditingEntry({ ...editingEntry, paymentMode: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                >
                  <option value="Online / UPI / QR">Online / UPI / QR</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold cursor-pointer transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
