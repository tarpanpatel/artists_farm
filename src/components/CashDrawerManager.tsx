import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRightLeft, Loader2, Search, AlertTriangle, CheckCircle2, IndianRupee, Handshake, Sliders, ChevronUp, ChevronDown, Plus, Trash2, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { CashDrawerEntry, CashDrawerSummary, StaffAdvance, StaffMember } from '../types';
import { PageHeader } from './PageHeader';
import { t } from '../i18n/en';
import { fetchCashDrawerSummaryFromDB, addDrawerEntryToDB, fetchDrawerEntriesFromDB, resolveTelegramTemplate, fetchStaffAdvancesFromDB, addStaffAdvanceToDB, deleteStaffAdvanceFromDB, saveAttendanceToDB, generateSalaryEntry } from '../services/api';
import DataTable from 'react-data-table-component';
import { useStaff } from '../contexts/StaffContext';
import { useConfirm } from './ConfirmDialogContext';
import { useToast } from './ToastContext';
import { StyledSelect } from './StyledSelect';
import { Input } from './Input';
import { Button } from './Button';
import { formatDateTimeDDMMYYYY } from '../utils/dateUtils';

interface CashDrawerManagerProps {
  onLogAudit?: (action: string, extra?: any) => void;
  onDispatchTelegram?: (eventType: string, message: string, category?: string, replyMarkup?: any, templateKey?: string) => void;
  onAddDrawerEntry?: (entry: any) => Promise<boolean>;
}

export const CashDrawerManager: React.FC<CashDrawerManagerProps> = ({
  onLogAudit,
  onDispatchTelegram,
  onAddDrawerEntry,
}) => {
  const { staff, attendance } = useStaff();
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [summaries, setSummaries] = useState<CashDrawerSummary[]>([]);
  const [drawerEntries, setDrawerEntries] = useState<CashDrawerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeForm, setActiveForm] = useState<'handover' | 'manual_adjustment'>('handover');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [handedTo, setHandedTo] = useState('');
  const [notes, setNotes] = useState('');

  const [showHistory, setShowHistory] = useState(false);
  const [searchHistory, setSearchHistory] = useState('');

  // Monthly Payout Calculator State - advances live in the DB (staff_advances
  // table), not localStorage, so they're durable and shared across every
  // device/terminal a property's admins use, and properly tied to a staff_id.
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [advances, setAdvances] = useState<StaffAdvance[]>([]);
  const [searchPayout, setSearchPayout] = useState('');
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [advanceStaff, setAdvanceStaff] = useState<StaffMember | null>(null);
  const [advanceAmount, setAdvanceAmount] = useState<number>(0);
  const [advanceReason, setAdvanceReason] = useState('');
  const [paidStaff, setPaidStaff] = useState<Set<string>>(new Set());
  const [payingStaff, setPayingStaff] = useState<string | null>(null);

  const loadAll = async () => {
    setIsLoading(true);
    const [sumData, entriesData] = await Promise.all([
      fetchCashDrawerSummaryFromDB(),
      fetchDrawerEntriesFromDB(),
    ]);
    if (sumData && sumData.length > 0) setSummaries(sumData);
    if (entriesData && entriesData.length > 0) setDrawerEntries(entriesData);
    setIsLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    fetchStaffAdvancesFromDB().then(data => {
      if (Array.isArray(data)) setAdvances(data);
    }).catch(() => {});
  }, []);

  const selectedStaff = summaries.find(s => s.staffId === selectedStaffId);

  // Month metadata for the payout calculator
  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNum = i + 1;
    const monthStr = String(selectedMonth + 1).padStart(2, '0');
    const dayStr = String(dayNum).padStart(2, '0');
    return { dayNum, dateStr: `${selectedYear}-${monthStr}-${dayStr}` };
  });

  const attendanceMap = new Map<string, string>();
  attendance.forEach((rec) => {
    attendanceMap.set(`${rec.staffId}_${rec.date}`, rec.status);
  });

  const monthAdvances = advances.filter((a) => a.month === monthKey);

  // Payout calculation data
  const payoutData = staff.filter((s) => s.status === 'Active').map((s) => {
    const dailyWage = daysInMonth > 0 ? s.monthlySalary / daysInMonth : 0;
    let presentDays = 0;
    monthDays.forEach((d) => {
      const status = attendanceMap.get(`${s.id}_${d.dateStr}`);
      if (status === 'Present') presentDays += 1;
      else if (status === 'Half Day') presentDays += 0.5;
    });
    const totalEarned = Math.round(dailyWage * presentDays * 100) / 100;
    const moneyOwed = Math.round((s.monthlySalary - totalEarned) * 100) / 100;
    // staffId matches new advances; name fallback covers rows that predate it -
    // namely the out-of-pocket kitchen-purchase reimbursement credits
    // inventory.php writes directly, which only ever recorded a staff name.
    const staffAdvances = monthAdvances
      .filter((a) => (a.staffId ? a.staffId === s.id : a.staffName === s.name))
      .reduce((sum, a) => sum + a.amount, 0);
    const ds = summaries.find(d => d.staffId === s.id || d.username === s.name || d.staffName === s.name);
    const cashCollected = ds?.cashCollected ?? 0;
    const handovers = ds?.drawerHandovers ?? 0;
    const outOfPocket = ds?.outOfPocketExpenses ?? 0;
    const netDrawer = cashCollected - handovers - outOfPocket;
    const pendingPayout = Math.round((totalEarned - staffAdvances - netDrawer) * 100) / 100;
    return { staff: s, dailyWage, presentDays, totalEarned, moneyOwed, advances: staffAdvances, cashCollected, handovers, outOfPocket, netDrawer, pendingPayout };
  });

  const filteredPayout = payoutData.filter(r => !searchPayout || r.staff.name.toLowerCase().includes(searchPayout.toLowerCase()));

  const handleGiveAdvance = async () => {
    if (!advanceStaff || advanceAmount <= 0) return;
    const advancePayload = {
      staffId: advanceStaff.id,
      staffName: advanceStaff.name,
      amount: advanceAmount,
      date: new Date().toISOString().slice(0, 10),
      month: monthKey,
      reason: advanceReason || 'Cash advance',
      addedBy: 'Admin',
    };
    const newId = await addStaffAdvanceToDB(advancePayload);
    if (!newId) {
      showToast('Unable to save the advance to the database.', { type: 'error' });
      return;
    }
    const newAdvance: StaffAdvance = { id: newId, ...advancePayload };
    setAdvances((prev) => [...prev, newAdvance]);
    setIsAdvanceModalOpen(false);

    // Record cash leaving the drawer + post to financial_ledger
    const drawerEntry = {
      staff_id: advanceStaff.id,
      staff_name: advanceStaff.name,
      type: 'handover',
      amount: advanceAmount,
      notes: `Staff advance: ${newAdvance.reason}`,
    };
    const ok = onAddDrawerEntry ? await onAddDrawerEntry(drawerEntry) : await addDrawerEntryToDB(drawerEntry);
    if (ok) loadAll();

    onLogAudit?.(`Admin gave advance of ₹${advanceAmount} to ${advanceStaff.name} (${newAdvance.reason})`);

    if (onDispatchTelegram) {
      const msg = `<b>💵 ADVANCE GIVEN</b>\n━━━━━━━━━━━━━━━━\n👤 <b>Staff:</b> ${advanceStaff.name}\n💰 <b>Amount:</b> ₹${advanceAmount.toLocaleString('en-IN')}\n📝 <b>Reason:</b> ${newAdvance.reason}\n📅 <b>Month:</b> ${monthKey}\n━━━━━━━━━━━━━━━━`;
      onDispatchTelegram('Staff Advance', msg, 'finance');
    }

    setAdvanceStaff(null);
    setAdvanceAmount(0);
    setAdvanceReason('');
  };

  const handlePayoutSubmit = async (row: typeof payoutData[number]) => {
    setPayingStaff(row.staff.id);
    const recs = attendance.filter(a => a.staffId === row.staff.id && a.date.startsWith(monthKey));
    await saveAttendanceToDB(recs);
    const ok = await generateSalaryEntry({
      staffId: row.staff.id,
      staffName: row.staff.name,
      amount: row.pendingPayout,
      month: monthKey,
      description: `Salary (Auto): ${row.staff.name} - ${monthKey}`,
    });
    setPayingStaff(null);
    if (ok) {
      setPaidStaff(prev => new Set(prev).add(row.staff.id));
      if (onDispatchTelegram) {
        const msg = `<b>💰 SALARY PAYMENT</b>\n━━━━━━━━━━━━━━━━\n👤 <b>Staff:</b> ${row.staff.name}\n📅 <b>Month:</b> ${monthKey}\n💵 <b>Amount:</b> ₹${row.pendingPayout.toLocaleString('en-IN')}\n━━━━━━━━━━━━━━━━`;
        onDispatchTelegram('Salary Payment', msg, 'finance');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffId || !amount || Number(amount) <= 0) return;
    if (activeForm === 'handover' && !handedTo) return;

    const staffMember = summaries.find(s => s.staffId === selectedStaffId);
    if (!staffMember) return;

    if (activeForm === 'handover' && Number(amount) > staffMember.netBalance) {
      const confirmed = await confirm({
        title: t('exceeds_net_balance_title', 'Exceeds Net Balance'),
        message: `Warning: Handover amount (₹${amount}) exceeds current net balance (₹${staffMember.netBalance}). This will create a negative balance. Proceed?`,
        confirmText: t('proceed_handover_button', 'Proceed Handover'),
        variant: 'warning',
      });
      if (!confirmed) {
        return;
      }
    }

    const entry = {
      staff_id: selectedStaffId,
      staff_name: staffMember.staffName,
      type: activeForm,
      amount: Number(amount),
      handed_to: activeForm === 'handover' ? handedTo : undefined,
      notes: notes || undefined,
    };

    const ok = onAddDrawerEntry ? await onAddDrawerEntry(entry) : await addDrawerEntryToDB(entry);
    if (ok) {
      const typeLabel = activeForm === 'handover' ? 'Cash Handover' : 'Manual Adjustment';
      onLogAudit?.(`Recorded ${typeLabel}: ₹${amount} for ${staffMember.staffName}${activeForm === 'handover' ? ` (handed to ${handedTo})` : ''}`);

      if (onDispatchTelegram) {
        const emoji = activeForm === 'handover' ? '🤝' : '⚙️';
        const fallbackMsg = `${emoji} <b>CASH DRAWER ${typeLabel.toUpperCase()}</b>\n• Staff: <b>${staffMember.staffName}</b>\n• Amount: <b>₹${Number(amount).toLocaleString('en-IN')}</b>${activeForm === 'handover' ? `\n• Handed To: <b>${handedTo}</b>` : ''}${notes ? `\n• Notes: ${notes}` : ''}\n• Net Balance After: <b>₹${activeForm === 'handover' ? (staffMember.netBalance - Number(amount)).toLocaleString('en-IN') : staffMember.netBalance.toLocaleString('en-IN')}</b>`;
        const templateVars: Record<string, string> = {
          staff_name: staffMember.staffName,
          action_type: typeLabel,
          amount: String(Number(amount).toLocaleString('en-IN')),
          remarks: notes || (activeForm === 'handover' ? `Handed to ${handedTo}` : ''),
        };
        const resolved = await resolveTelegramTemplate('finance_drawer_adjustment', templateVars);
        onDispatchTelegram('Cash Drawer', resolved || fallbackMsg, 'finance', undefined, 'finance_drawer_adjustment');
      }

      setAmount('');
      setHandedTo('');
      setNotes('');
      loadAll();
    }
  };



  const totalCashInSystem = summaries.reduce((sum, s) => sum + s.netBalance, 0);
  const totalCollected = summaries.reduce((sum, s) => sum + s.cashCollected, 0);
  const totalHandedOver = summaries.reduce((sum, s) => sum + s.drawerHandovers, 0);

  const filteredEntries = useMemo(() => {
    if (!searchHistory.trim()) return drawerEntries;
    const q = searchHistory.toLowerCase().trim();
    return drawerEntries.filter(entry =>
      (entry.staff_name || '').toLowerCase().includes(q) ||
      (entry.type || '').toLowerCase().includes(q) ||
      (entry.notes || '').toLowerCase().includes(q)
    );
  }, [drawerEntries, searchHistory]);

  return (
    <div className="cash-drawer space-y-6 text-xs text-slate-800 dark:text-slate-200">
      <PageHeader
        title={t('finances_portal_title', 'Finances & Payroll')}
        subtitle={t('finances_description', 'Track staff cash responsibilities, adjust drawer balances, and calculate monthly payroll payouts.')}
      />

      {/* System Totals Bar */}
      <div className="analytics-kpi-grid grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="analytics-kpi-card bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('total_cash_collected_label', 'Total Cash Collected')}</p>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 flex items-center gap-1">
            <IndianRupee className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />
            {totalCollected.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
            {t('from_guest_checkouts_label', 'From Guest Checkouts')}
          </p>
        </div>

        <div className="analytics-kpi-card bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('total_handed_over_label', 'Total Handed Over')}</p>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 flex items-center gap-1">
            <IndianRupee className="w-5 h-5 text-amber-600 dark:text-amber-500" />
            {totalHandedOver.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-slate-500 font-semibold mt-1">
            {t('to_owner_next_shift_label', 'To Owner / Next Shift')}
          </p>
        </div>

        <div className="analytics-kpi-card bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('net_cash_in_system_label', 'Net Cash In System')}</p>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 flex items-center gap-1">
            <IndianRupee className="w-5 h-5 text-blue-600 dark:text-blue-500" />
            {totalCashInSystem.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold mt-1">
            {t('unaccounted_should_match_label', 'Should Match Physical Cash Box')}
          </p>
        </div>
      </div>

      {/* Quick Action Tabs */}
      <div className="cash-drawer__tabs bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-1 flex gap-1">
        {[
          { key: 'handover' as const, label: t('handover_tab', 'Handover'), icon: Handshake, desc: t('cash_given_to_owner_desc', 'Cash Given to Owner') },
          { key: 'manual_adjustment' as const, label: t('adjustment_tab', 'Adjustment'), icon: Sliders, desc: t('admin_correction_desc', 'Admin Correction') },
        ].map(tab => {
          const TabIcon = tab.icon;
          return (
          <button
            key={tab.key}
            onClick={() => setActiveForm(tab.key)}
            className={`flex-1 py-3 px-2 rounded-xl text-center transition-all cursor-pointer ${
              activeForm === tab.key
                ? 'bg-emerald-600 text-white shadow-md font-semibold'
                : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 font-semibold'
            }`}
          >
            <div className="text-[11px] flex items-center justify-center gap-1.5">
              <TabIcon className="w-4 h-4" />
              <span>{tab.label}</span>
            </div>
            <div className={`text-[9px] mt-0.5 ${activeForm === tab.key ? 'text-emerald-100' : 'text-slate-400'}`}>{tab.desc}</div>
          </button>
        );
        })}
      </div>

      {/* Entry Form */}
      <div className="cash-drawer__form-card bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 max-w-[550px] w-full">
        <h3 className="cash-drawer-manager__subtitle font-semibold text-slate-900 dark:text-white text-sm mb-3 flex items-center gap-1.5">
          {activeForm === 'handover' && (
            <>
              <Handshake className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
              <span>{t('record_cash_handover_heading', 'RECORD CASH HANDOVER')}</span>
            </>
          )}
          {activeForm === 'manual_adjustment' && (
            <>
              <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
              <span>{t('manual_balance_adjustment_heading', 'MANUAL BALANCE ADJUSTMENT')}</span>
            </>
          )}
        </h3>

        {activeForm === 'manual_adjustment' && (
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-4 leading-relaxed bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
            <p><strong>What this does:</strong> Manual adjustments are used to directly <strong>add cash</strong> to a staff member's pocket/drawer balance (e.g. seeding initial cash or correcting entry errors).</p>
            <p>• <span className="font-semibold text-emerald-600 dark:text-emerald-400">Example (Add Cash):</span> If Vikram starts his shift with ₹2,000 opening cash, apply a <strong>₹2,000</strong> adjustment to seed the drawer.</p>
            <p>• <span className="font-semibold text-amber-600 dark:text-amber-500">To Deduct Cash instead:</span> If Vikram hands over ₹5,000 to the owner or another shift, switch to the <strong>Handover</strong> tab above to record a debit transaction.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="app-form app-form--cash-drawer space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('select_staff_member_label', 'Select Staff Member *')}</label>
              <StyledSelect
                value={selectedStaffId}
                onChange={setSelectedStaffId}
                placeholder={t('choose_staff_placeholder', '-- Choose Staff --')}
                options={summaries.map(s => ({
                  value: s.staffId,
                  label: `${s.staffName} (Balance: ₹${s.netBalance.toLocaleString('en-IN')})`,
                }))}
              />
            </div>

            <div>
              <Input
                label={t('cash_amount_label', 'Amount (₹) *')}
                type="number"
                required
                min="1"
                step="any"
                value={amount}
                onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder={t('enter_amount_placeholder', 'Enter amount')}
              />
              {selectedStaff && activeForm === 'handover' && amount && Number(amount) > selectedStaff.netBalance && (
                <p className="text-[10px] text-red-500 font-semibold mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Exceeds current balance of ₹{selectedStaff.netBalance.toLocaleString('en-IN')}
                </p>
              )}
            </div>
          </div>

          {activeForm === 'handover' && (
            <div>
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('handing_over_to_label', 'Handing Over To *')}</label>
              <StyledSelect
                value={handedTo}
                onChange={setHandedTo}
                placeholder={t('select_recipient_placeholder', '-- Select Recipient --')}
                options={[
                  { value: 'Tarpan (Owner)', label: 'Tarpan (Owner)' },
                  ...staff
                    .filter(s => s.status === 'Active' && s.id !== selectedStaffId)
                    .map(s => ({
                      value: s.name,
                      label: `${s.name} (${s.role})`,
                    })),
                ]}
              />
            </div>
          )}

          <div>
            <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('notes_optional_label', 'Notes (Optional)')}</label>
            <Input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={activeForm === 'handover' ? t('handover_notes_placeholder', 'e.g., End of day handover, shift change...') : t('adjustment_notes_placeholder', "e.g., Correcting yesterday's error...")}
            />
          </div>

          {/* Balance Preview */}
          {selectedStaff && (
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
                <span>{t('current_net_balance_label', 'Current Net Balance')}</span>
                <span className="text-slate-900 dark:text-white text-sm">₹{selectedStaff.netBalance.toLocaleString('en-IN')}</span>
              </div>
              {amount && Number(amount) > 0 && (
                <div className="flex items-center justify-between text-[10px] font-semibold text-emerald-600 mt-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-700">
                  <span>After This {activeForm === 'handover' ? 'Handover' : 'Adjustment'}</span>
                  <span className="text-sm">
                    ₹{(activeForm === 'manual_adjustment'
                      ? selectedStaff.netBalance + Number(amount)
                      : selectedStaff.netBalance - Number(amount)
                    ).toLocaleString('en-IN')}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-8 py-3 rounded-xl shadow-2xs flex items-center gap-2 cursor-pointer transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {activeForm === 'handover' && t('cash_record_handover_button', 'RECORD HANDOVER')}
                {activeForm === 'manual_adjustment' && t('cash_apply_adjustment_button', 'APPLY ADJUSTMENT')}
              </span>
            </button>
          </div>
        </form>
      </div>



      {/* Drawer Entry History */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
        >
          <h3 className="cash-drawer-manager__subtitle font-semibold text-slate-800 dark:text-white text-sm flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-emerald-600" />
            {t('drawer_entry_history_heading', 'DRAWER ENTRY HISTORY')}
            <span className="text-[10px] text-slate-400 font-semibold ml-1">({drawerEntries.length} entries)</span>
          </h3>
          <span className="text-slate-400">
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>

        {showHistory && (
          <div className="border-t border-slate-100 dark:border-slate-700 p-4">
            <DataTable
              columns={[
                {
                  name: t('date_time_column', 'Date & Time'),
                  selector: (entry: CashDrawerEntry) => entry.created_at,
                  sortable: true,
                  width: '160px',
                  cell: (entry: CashDrawerEntry) => <span className="font-mono text-slate-500">{formatDateTimeDDMMYYYY(entry.created_at)}</span>,
                },
                {
                  name: t('staff_column', 'Staff'),
                  selector: (entry: CashDrawerEntry) => entry.staff_name,
                  sortable: true,
                  width: '140px',
                  cell: (entry: CashDrawerEntry) => <span className="font-semibold">{entry.staff_name}</span>,
                },
                {
                  name: t('type_column', 'Type'),
                  selector: (entry: CashDrawerEntry) => entry.type,
                  sortable: true,
                  width: '120px',
                  cell: (entry: CashDrawerEntry) => (
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      entry.type === 'handover' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                      'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                    }`}>
                      {entry.type === 'handover' ? <Handshake className="w-3 h-3" /> : <Sliders className="w-3 h-3" />}
                      <span>{entry.type === 'handover' ? 'Handover' : 'Adjustment'}</span>
                    </span>
                  ),
                },
                {
                  name: t('amount_column', 'Amount'),
                  selector: (entry: CashDrawerEntry) => entry.amount,
                  sortable: true,
                  width: '120px',
                  right: true,
                  cell: (entry: CashDrawerEntry) => <span className="font-mono font-semibold text-sm">₹{Number(entry.amount).toLocaleString('en-IN')}</span>,
                },
                {
                  name: t('handed_to_column', 'Handed To'),
                  selector: (entry: CashDrawerEntry) => entry.handed_to || '-',
                  sortable: true,
                  width: '140px',
                  cell: (entry: CashDrawerEntry) => <span className="text-slate-500">{entry.handed_to || '-'}</span>,
                },
                {
                  name: t('notes_column', 'Notes'),
                  selector: (entry: CashDrawerEntry) => entry.notes || '-',
                  sortable: true,
                  grow: 2,
                  cell: (entry: CashDrawerEntry) => <span className="text-slate-500 text-[10px] max-w-[200px] truncate block">{entry.notes || '-'}</span>,
                },
              ]}
              data={filteredEntries}
              progressPending={isLoading}
              progressComponent={
                <div className="p-8 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500 font-semibold text-xs">
                  <Loader2 className="w-4 h-4 animate-spin" /> {t('loading_drawer_data_label', 'Loading drawer data...')}
                </div>
              }
              pagination
              paginationPerPage={10}
              paginationRowsPerPageOptions={[10, 25, 50]}
              highlightOnHover
              subHeader={
                <div className="w-full flex items-center justify-between">
                  <span className="text-slate-400 font-semibold text-xs">{isLoading ? '…' : drawerEntries.length} entries</span>
                  <div>
                    <Input
                      type="text"
                      value={searchHistory}
                      onChange={e => setSearchHistory(e.target.value)}
                      placeholder={t('search_staff_type_notes_placeholder', 'Search staff, type, notes...')}
                      leftIcon={<Search className="w-4 h-4 text-slate-400" />}
                      className="w-56"
                    />
                  </div>
                </div>
              }
              customStyles={{
                subHeader: { style: { padding: 0, minHeight: 0, backgroundColor: 'transparent' } },
                headRow: { style: { backgroundColor: '#f8fafc' } },
                headCells: { style: { fontSize: '11px', fontWeight: 600, color: '#64748b', paddingLeft: '12px' } },
                cells: { style: { fontSize: '13px', color: '#334155', padding: '12px' } },
                rows: { style: { minHeight: '52px' } },
              }}
              noDataComponent={
                <div className="text-center p-6 text-slate-400 font-semibold">{t('no_drawer_entries_label', 'No drawer entries recorded yet.')}</div>
              }
            />
          </div>
        )}
      </div>

      {/* MONTHLY PAYOUT CALCULATOR */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-amber-200 dark:border-amber-800/40 shadow-sm overflow-hidden transition-colors">
        <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/30 px-4 py-3 border-b border-amber-200 dark:border-amber-800/40">
          <h3 className="cash-drawer-manager__subtitle font-semibold text-amber-900 dark:text-amber-200 text-xs tracking-wider uppercase flex items-center gap-2">
            <IndianRupee className="w-4 h-4" />
            {t('monthly_payout_calculator_heading', 'Monthly Payout Calculator')}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
                else { setSelectedMonth(m => m - 1); }
              }}
              className="bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-800/60 text-amber-700 dark:text-amber-300 font-semibold text-xs p-1.5 rounded-lg cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50 px-2.5 py-1 rounded-full min-w-30 text-center">
              {new Date(selectedYear, selectedMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={() => {
                if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1); }
                else { setSelectedMonth(m => m + 1); }
              }}
              className="bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-800/60 text-amber-700 dark:text-amber-300 font-semibold text-xs p-1.5 rounded-lg cursor-pointer transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <DataTable
          columns={[
            {
              name: 'Staff Name',
              selector: (row: any) => row.staff.name,
              sortable: true,
              cell: (row: any) => <span className="font-semibold text-slate-900 dark:text-white text-sm">{row.staff.name}</span>,
            },
            {
              name: 'Daily Wage (₹)',
              selector: (row: any) => row.dailyWage,
              sortable: true,
              right: true,
              width: '120px',
              cell: (row: any) => <span className="font-mono text-slate-600 dark:text-slate-300">₹{row.dailyWage.toFixed(2)}</span>,
            },
            {
              name: 'Present Days',
              selector: (row: any) => row.presentDays,
              sortable: true,
              center: true,
              width: '110px',
              cell: (row: any) => <><span className="font-semibold text-slate-800 dark:text-slate-200">{row.presentDays}</span><span className="text-slate-400 dark:text-slate-500"> days</span></>,
            },
            {
              name: 'Total Earned (₹)',
              selector: (row: any) => row.totalEarned,
              sortable: true,
              right: true,
              width: '130px',
              cell: (row: any) => <span className="font-semibold text-emerald-700 dark:text-emerald-400">₹{row.totalEarned.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
            },
            {
              name: 'Collected (₹)',
              selector: (row: any) => row.cashCollected,
              sortable: true,
              right: true,
              width: '110px',
              cell: (row: any) => <span className="font-semibold text-amber-700 dark:text-amber-400">₹{row.cashCollected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
            },
            {
              name: 'Out of Pocket (₹)',
              selector: (row: any) => row.outOfPocket,
              sortable: true,
              right: true,
              width: '120px',
              cell: (row: any) => <span className="font-semibold text-purple-600 dark:text-purple-400">₹{row.outOfPocket.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
            },
            {
              name: 'Handovers (₹)',
              selector: (row: any) => row.handovers,
              sortable: true,
              right: true,
              width: '110px',
              cell: (row: any) => <span className="font-semibold text-indigo-600 dark:text-indigo-400">₹{row.handovers.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
            },
            {
              name: 'Advances (₹)',
              selector: (row: any) => row.advances,
              sortable: true,
              right: true,
              width: '120px',
              cell: (row: any) => {
                // Negative = a reimbursement credit (e.g. staff paid for a kitchen
                // purchase out of pocket), which increases payout rather than
                // reducing it - shown in green with a + sign, not hidden as ₹0.00.
                const isCredit = row.advances < 0;
                return (
                  <span className={`font-semibold ${isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {isCredit ? '+' : '-'} ₹{Math.abs(row.advances).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                );
              },
            },
            {
              name: 'Pending Payout (₹)',
              selector: (row: any) => row.pendingPayout,
              sortable: true,
              right: true,
              width: '140px',
              cell: (row: any) => <span className="font-semibold text-blue-700 dark:text-blue-400">₹{row.pendingPayout.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
            },
            {
              name: 'Actions',
              center: true,
              width: '240px',
              cell: (row: any) => {
                const isPaid = paidStaff.has(row.staff.id);
                const isPaying = payingStaff === row.staff.id;
                return (
                  <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => { setAdvanceStaff(row.staff); setAdvanceAmount(0); setAdvanceReason(''); setIsAdvanceModalOpen(true); }}
                      leftIcon={<Plus className="w-3 h-3 text-emerald-600" />}
                    >
                      Advance
                    </Button>
                    {isPaid ? (
                      <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold text-[10px] px-2 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Paid
                      </span>
                    ) : (
                      <Button
                        variant="primary"
                        size="xs"
                        disabled={isPaying || row.pendingPayout <= 0}
                        leftIcon={<IndianRupee className="w-3 h-3" />}
                        onClick={() => handlePayoutSubmit(row)}
                      >
                        {isPaying ? 'Paying...' : 'Pay Now'}
                      </Button>
                    )}
                  </div>
                );
              },
            },
          ]}
          data={filteredPayout}
          progressPending={isLoading}
          progressComponent={
            <div className="p-8 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500 font-semibold text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading staff...
            </div>
          }
          pagination
          paginationPerPage={15}
          paginationRowsPerPageOptions={[10, 15, 25, 50]}
          highlightOnHover
          subHeader={
            <div className="w-full flex items-center py-2">
              <Input type="text" value={searchPayout} onChange={e => setSearchPayout(e.target.value)} placeholder="Search by staff name..." className="w-full max-w-xs" />
            </div>
          }
          customStyles={{
            subHeader: { style: { padding: 0, minHeight: 0, backgroundColor: 'transparent', borderBottom: '1px solid #fde68a' } },
            headCells: { style: { fontSize: '11px', fontWeight: 600, color: '#b45309', backgroundColor: '#fffbeb', borderBottom: '1px solid #fde68a', paddingLeft: '12px' } },
            cells: { style: { fontSize: '13px', color: '#334155', padding: '12px' } },
            headRow: { style: { backgroundColor: '#fffbeb' } },
            rows: { style: { minHeight: '52px' } },
          }}
          noDataComponent={
            <div className="p-8 text-center text-slate-400 font-semibold text-xs">No active staff members found</div>
          }
        />

        {/* Advances History for this month */}
        {monthAdvances.length > 0 && (
          <div className="border-t border-amber-200 dark:border-amber-800/40 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">{t('advances_this_month_label', 'Advances This Month')}</p>
            <div className="space-y-1">
              {monthAdvances.map((adv) => (
                <div key={adv.id} className="flex items-center justify-between text-[11px] bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-1.5 border border-red-100 dark:border-red-900/30">
                  <span className="font-semibold text-red-800 dark:text-red-300">{adv.staffName}</span>
                  <span className="text-red-600 dark:text-red-400">- ₹{adv.amount.toLocaleString('en-IN')}</span>
                  <span className="text-slate-400 dark:text-slate-500">{adv.reason}</span>
                  <button
                    onClick={async () => {
                      const ok = await deleteStaffAdvanceFromDB(adv.id);
                      if (ok) {
                        setAdvances((prev) => prev.filter((a) => a.id !== adv.id));
                      } else {
                        showToast('Unable to delete the advance from the database.', { type: 'error' });
                      }
                    }}
                    className="text-red-400 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* GIVE ADVANCE MODAL */}
      {isAdvanceModalOpen && advanceStaff && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-sm w-full border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="cash-drawer-manager__subtitle font-semibold text-slate-900 dark:text-white text-sm">{t('give_advance_heading', 'Give Advance —')} {advanceStaff.name}</h3>
              <button onClick={() => setIsAdvanceModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <Input
                label="Amount (₹) *"
                type="number"
                min={0}
                value={advanceAmount || ''}
                onChange={(e) => setAdvanceAmount(Number(e.target.value))}
                placeholder="e.g. 2000"
                className="text-sm font-semibold"
              />
            </div>

            <div>
              <Input
                label={t('reason_label', 'Reason')}
                type="text"
                value={advanceReason}
                onChange={(e) => setAdvanceReason(e.target.value)}
                placeholder="e.g. Personal emergency"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsAdvanceModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleGiveAdvance}
                disabled={advanceAmount <= 0}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:opacity-50 text-white font-semibold text-xs shadow-sm cursor-pointer"
              >
                Confirm Advance
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
