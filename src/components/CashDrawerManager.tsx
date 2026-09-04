import React, { useState, useEffect, useMemo } from 'react';
import { Drawer, TextInput as FlowbiteTextInput, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from 'flowbite-react';
import { X } from './icons/FlowbiteIcons';
import { ArrowRightLeft, Loader2, CheckCircle2, IndianRupee, Handshake, Sliders, ChevronUp, ChevronDown, Plus, Trash2, Check, ChevronLeft, ChevronRight, HelpCircle } from './icons/FlowbiteIcons';
import { CashDrawerEntry, CashDrawerSummary, StaffAdvance, StaffMember } from '../types';
import { PageHeader } from './PageHeader';
import { Badge } from './Badge';
import { KpiCard } from './KpiCard';
import { Popover } from './Popover';
import { t } from '../i18n/en';
import { fetchCashDrawerSummaryFromDB, addDrawerEntryToDB, fetchDrawerEntriesFromDB, resolveTelegramTemplate, fetchStaffAdvancesFromDB, addStaffAdvanceToDB, deleteStaffAdvanceFromDB, saveAttendanceToDB, generateSalaryEntry } from '../services/api';
import { TablePagination } from './TablePagination';
import { useStaff } from '../contexts/StaffContext';
import { useConfirm } from './ConfirmDialogContext';
import { useToast } from './ToastContext';
import { useAuth } from '../contexts/AuthContext';
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
  const [handoverStaffId, setHandoverStaffId] = useState('');
  const [handoverAmount, setHandoverAmount] = useState<number | ''>('');
  const [handedTo, setHandedTo] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('');

  const [adjustmentStaffId, setAdjustmentStaffId] = useState('');
  const [adjustmentAmount, setAdjustmentAmount] = useState<number | ''>('');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');

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
  const [drawerHistoryPage, setDrawerHistoryPage] = useState(1);
  const [drawerHistoryDesktopPage, setDrawerHistoryDesktopPage] = useState(1);
  const DRAWER_HISTORY_PAGE_SIZE = 10;
  const [payrollPage, setPayrollPage] = useState(1);
  const [payoutDesktopPage, setPayoutDesktopPage] = useState(1);
  const PAYOUT_DESKTOP_PAGE_SIZE = 15;

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

  const { isAuthenticated, authChecked } = useAuth();

  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    loadAll();
  }, [isAuthenticated, authChecked]);

  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    fetchStaffAdvancesFromDB().then(data => {
      if (Array.isArray(data)) setAdvances(data);
    }).catch(() => {});
  }, [isAuthenticated, authChecked]);

  const selectedHandoverStaff = summaries.find(s => s.staffId === handoverStaffId);
  const selectedAdjustmentStaff = summaries.find(s => s.staffId === adjustmentStaffId);

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
    const formattedAmount = `₹${row.pendingPayout.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    const confirmed = await confirm({
      title: t('confirm_salary_payout_title', 'Confirm Salary Payout'),
      message: t(
        'confirm_salary_payout_message',
        `Are you sure you want to process the payout of ${formattedAmount} for ${row.staff.name} for ${monthKey}? This will generate a salary entry and record the settlement.`,
        { amount: formattedAmount, staffName: row.staff.name, month: monthKey }
      ),
      confirmText: t('confirm_pay_now_button', 'Yes, Pay Now'),
      cancelText: t('cancel_button', 'Cancel'),
      variant: 'info',
    });
    if (!confirmed) return;

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
      showToast(`Payout of ${formattedAmount} for ${row.staff.name} processed successfully!`, { type: 'success' });
      if (onDispatchTelegram) {
        const msg = `<b>💰 SALARY PAYMENT</b>\n━━━━━━━━━━━━━━━━\n👤 <b>Staff:</b> ${row.staff.name}\n📅 <b>Month:</b> ${monthKey}\n💵 <b>Amount:</b> ₹${row.pendingPayout.toLocaleString('en-IN')}\n━━━━━━━━━━━━━━━━`;
        onDispatchTelegram('Salary Payment', msg, 'finance');
      }
    } else {
      showToast('Failed to process salary payment. Please try again.', { type: 'error' });
    }
  };

  const handleHandoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handoverStaffId || !handoverAmount || Number(handoverAmount) <= 0 || !handedTo) return;

    const staffMember = summaries.find(s => s.staffId === handoverStaffId);
    if (!staffMember) return;

    if (Number(handoverAmount) > staffMember.netBalance) {
      const confirmed = await confirm({
        title: t('exceeds_net_balance_title', 'Exceeds Net Balance'),
        message: `Warning: Handover amount (₹${handoverAmount}) exceeds current net balance (₹${staffMember.netBalance}). This will create a negative balance. Proceed?`,
        confirmText: t('proceed_handover_button', 'Proceed Handover'),
        variant: 'warning',
      });
      if (!confirmed) {
        return;
      }
    }

    const entry = {
      staff_id: handoverStaffId,
      staff_name: staffMember.staffName,
      type: 'handover' as const,
      amount: Number(handoverAmount),
      handed_to: handedTo,
      notes: handoverNotes || undefined,
    };

    const ok = onAddDrawerEntry ? await onAddDrawerEntry(entry) : await addDrawerEntryToDB(entry);
    if (ok) {
      onLogAudit?.(`Recorded Cash Handover: ₹${handoverAmount} for ${staffMember.staffName} (handed to ${handedTo})`);

      if (onDispatchTelegram) {
        const netAfter = staffMember.netBalance - Number(handoverAmount);
        const fallbackMsg = `🤝 <b>CASH DRAWER CASH HANDOVER</b>\n• Staff: <b>${staffMember.staffName}</b>\n• Amount: <b>₹${Number(handoverAmount).toLocaleString('en-IN')}</b>\n• Handed To: <b>${handedTo}</b>${handoverNotes ? `\n• Notes: ${handoverNotes}` : ''}\n• Net Balance After: <b>₹${netAfter.toLocaleString('en-IN')}</b>`;
        const templateVars: Record<string, string> = {
          staff_name: staffMember.staffName,
          action_type: 'Cash Handover',
          amount: String(Number(handoverAmount).toLocaleString('en-IN')),
          handed_to: handedTo,
          remarks: handoverNotes || `Handed to ${handedTo}`,
          net_balance_after: String(netAfter.toLocaleString('en-IN')),
        };
        const resolved = await resolveTelegramTemplate('finance_drawer_adjustment', templateVars);
        onDispatchTelegram('Cash Drawer', resolved || fallbackMsg, 'finance', undefined, 'finance_drawer_adjustment');
      }

      setHandoverAmount('');
      setHandedTo('');
      setHandoverNotes('');
      loadAll();
    }
  };

  const handleAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustmentStaffId || !adjustmentAmount || Number(adjustmentAmount) <= 0) return;

    const staffMember = summaries.find(s => s.staffId === adjustmentStaffId);
    if (!staffMember) return;

    const entry = {
      staff_id: adjustmentStaffId,
      staff_name: staffMember.staffName,
      type: 'manual_adjustment' as const,
      amount: Number(adjustmentAmount),
      notes: adjustmentNotes || undefined,
    };

    const ok = onAddDrawerEntry ? await onAddDrawerEntry(entry) : await addDrawerEntryToDB(entry);
    if (ok) {
      onLogAudit?.(`Recorded Manual Adjustment: ₹${adjustmentAmount} for ${staffMember.staffName}`);

      if (onDispatchTelegram) {
        const netAfter = staffMember.netBalance + Number(adjustmentAmount);
        const fallbackMsg = `⚙️ <b>CASH DRAWER MANUAL ADJUSTMENT</b>\n• Staff: <b>${staffMember.staffName}</b>\n• Amount: <b>₹${Number(adjustmentAmount).toLocaleString('en-IN')}</b>${adjustmentNotes ? `\n• Notes: ${adjustmentNotes}` : ''}\n• Net Balance After: <b>₹${netAfter.toLocaleString('en-IN')}</b>`;
        const templateVars: Record<string, string> = {
          staff_name: staffMember.staffName,
          action_type: 'Manual Adjustment',
          amount: String(Number(adjustmentAmount).toLocaleString('en-IN')),
          handed_to: 'N/A',
          remarks: adjustmentNotes || '',
          net_balance_after: String(netAfter.toLocaleString('en-IN')),
        };
        const resolved = await resolveTelegramTemplate('finance_drawer_adjustment', templateVars);
        onDispatchTelegram('Cash Drawer', resolved || fallbackMsg, 'finance', undefined, 'finance_drawer_adjustment');
      }

      setAdjustmentAmount('');
      setAdjustmentNotes('');
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
    <div data-tour="cash-drawer" className="cash-drawer space-y-6 text-slate-800 dark:text-slate-200">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t('finances_portal_title', 'Finances & Payroll')}
            <Popover
              placement="bottom"
              trigger="click"
              title="About this page"
              content={
                <div className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed max-w-xs">
                  {t('finances_description', 'Track staff cash responsibilities, adjust drawer balances, and calculate monthly payroll payouts.')}
                </div>
              }
            >
              <button
                type="button"
                className="btn-compact-stepper text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer shrink-0"
              >
                Help?
              </button>
            </Popover>
          </span>
        }
      />

      {/* System Totals Bar */}
      <div className="analytics-kpi-grid grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
        <KpiCard
          label={t('total_cash_collected_label', 'Total Cash Collected')}
          value={<><IndianRupee className="w-5 h-5 text-emerald-600 mr-0.5 shrink-0" /><span className="whitespace-nowrap">{totalCollected.toLocaleString('en-IN')}</span></>}
          subtext={t('from_guest_checkouts_label', 'From Guest Checkouts')}
          badge={{ text: 'Collected', color: 'success' }}
          layout="stacked"
        />
        <KpiCard
          label={t('handed_over_to_safe_label', 'Handed Over to Safe')}
          value={<><IndianRupee className="w-5 h-5 text-blue-600 mr-0.5 shrink-0" /><span className="whitespace-nowrap">{totalHandedOver.toLocaleString('en-IN')}</span></>}
          subtext={t('deposited_by_staff_label', 'Deposited by Staff')}
          badge={{ text: 'Safe Handovers', color: 'info' }}
          layout="stacked"
        />
        <KpiCard
          label={t('net_in_staff_hands_label', 'Net in Staff Hands')}
          value={<><IndianRupee className="w-5 h-5 mr-0.5 shrink-0" /><span className="whitespace-nowrap">{totalCashInSystem.toLocaleString('en-IN')}</span></>}
          valueClassName={totalCashInSystem > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}
          subtext={t('active_drawer_balances_label', 'Active Drawer Balances')}
          badge={{ text: 'In Hands', color: 'warning' }}
          layout="stacked"
        />
      </div>

      {/* Side-by-Side Forms Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Form A: Record Cash Handover */}
        <div className="cash-drawer__form-card bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md p-4 sm:p-6 w-full">
          <h3 className="cash-drawer-manager__subtitle font-bold text-slate-900 dark:text-white text-sm tracking-wider uppercase mb-4 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-700/50 pb-2">
            <Handshake className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
            <span>{t('record_cash_handover_heading', 'RECORD CASH HANDOVER')}</span>
          </h3>

          <form onSubmit={handleHandoverSubmit} className="app-form app-form--cash-drawer space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <StyledSelect
                  label={t('select_staff_member_label', 'Select Staff Member *')}
                  value={handoverStaffId}
                  onChange={setHandoverStaffId}
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
                  value={handoverAmount}
                  onChange={e => setHandoverAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder={t('enter_amount_placeholder', 'Enter amount')}
                  // Live (26 Aug 2026 - CLAUDE.md's "Real-Time Form Validation" note) - the
                  // exceeds-balance check already ran live before this date, just as a plain
                  // <p> below the field rather than through Input's own colored-border
                  // error state; folded into `error` here for visual consistency with every
                  // other converted field, same message. The required/>0 case is new,
                  // gated on a staff member already being picked (same "form actually
                  // started" signal as the Give Advance modal above).
                  error={
                    handoverStaffId && (!handoverAmount || Number(handoverAmount) <= 0)
                      ? 'Amount must be greater than 0'
                      : selectedHandoverStaff && handoverAmount && Number(handoverAmount) > selectedHandoverStaff.netBalance
                      ? `Exceeds current balance of ₹${selectedHandoverStaff.netBalance.toLocaleString('en-IN')}`
                      : undefined
                  }
                />
              </div>
            </div>

            <div>
              <StyledSelect
                label={t('handing_over_to_label', 'Handing Over To *')}
                value={handedTo}
                onChange={setHandedTo}
                placeholder={t('select_recipient_placeholder', '-- Select Recipient --')}
                options={[
                  { value: 'Tarpan (Owner)', label: 'Tarpan (Owner)' },
                  ...staff
                    .filter(s => s.status === 'Active' && s.id !== handoverStaffId)
                    .map(s => ({
                      value: s.name,
                      label: `${s.name} (${s.role})`,
                    })),
                ]}
              />
            </div>

            <div>
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('notes_optional_label', 'Notes (Optional)')}</label>
              <Input
                type="text"
                value={handoverNotes}
                onChange={e => setHandoverNotes(e.target.value)}
                placeholder={t('handover_notes_placeholder', 'e.g., End of day handover, shift change...')}
              />
            </div>

            {/* Balance Preview */}
            {selectedHandoverStaff && (
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
                  <span>{t('current_net_balance_label', 'Current Net Balance')}</span>
                  <span className="text-slate-900 dark:text-white text-sm">₹{selectedHandoverStaff.netBalance.toLocaleString('en-IN')}</span>
                </div>
                {handoverAmount && Number(handoverAmount) > 0 && (
                  <div className="flex items-center justify-between text-[10px] font-semibold text-emerald-600 mt-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-700">
                    <span>After This Handover</span>
                    <span className="text-sm">
                      ₹{(selectedHandoverStaff.netBalance - Number(handoverAmount)).toLocaleString('en-IN')}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-5 py-2.5 rounded-lg shadow-xs flex items-center gap-2 cursor-pointer transition-colors w-full justify-center"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{t('cash_record_handover_button', 'Record Handover')}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Form B: Manual Balance Adjustment */}
        <div className="cash-drawer__form-card bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md p-4 sm:p-6 w-full">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/50 pb-2 mb-4">
            <h3 className="cash-drawer-manager__subtitle font-bold text-slate-900 dark:text-white text-sm tracking-wider uppercase flex items-center gap-1.5 m-0">
              <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-500" />
              <span>{t('manual_balance_adjustment_heading', 'Manual Balance Adjustment')}</span>
            </h3>
            <Popover
              trigger="click"
              placement="bottom"
              title={
                <div className="flex items-center gap-1.5 font-semibold text-gray-900 dark:text-white">
                  <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>{t('manual_balance_adjustment_heading', 'Manual Balance Adjustment')}</span>
                </div>
              }
              content={
                <div className="w-72 sm:w-80 text-xs space-y-2 text-slate-600 dark:text-slate-300 p-3.5">
                  <p><strong>What this does:</strong> Manual adjustments are used to directly <strong>add cash</strong> to a staff member's pocket/drawer balance (e.g. seeding initial cash or correcting entry errors).</p>
                  <p>• <span className="font-semibold text-emerald-600 dark:text-emerald-400">Example (Add Cash):</span> If Vikram starts his shift with ₹2,000 opening cash, apply a <strong>₹2,000</strong> adjustment to seed the drawer.</p>
                  <p>• <span className="font-semibold text-amber-600 dark:text-amber-500">To Deduct Cash instead:</span> If Vikram hands over cash, use the <strong>Record Cash Handover</strong> form on the left to record the transfer.</p>
                </div>
              }
            >
              <button
                type="button"
                className="appearance-none border-0 p-0 m-0 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline cursor-pointer transition-colors"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Help?</span>
              </button>
            </Popover>
          </div>

          <form onSubmit={handleAdjustmentSubmit} className="app-form app-form--cash-drawer space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <StyledSelect
                  label={t('select_staff_member_label', 'Select Staff Member *')}
                  value={adjustmentStaffId}
                  onChange={setAdjustmentStaffId}
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
                  value={adjustmentAmount}
                  onChange={e => setAdjustmentAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder={t('enter_amount_placeholder', 'Enter amount')}
                  error={adjustmentStaffId && (!adjustmentAmount || Number(adjustmentAmount) <= 0) ? 'Amount must be greater than 0' : undefined}
                />
              </div>
            </div>

            <div>
              <Input
                label={t('notes_optional_label', 'Notes (Optional)')}
                type="text"
                value={adjustmentNotes}
                onChange={e => setAdjustmentNotes(e.target.value)}
                placeholder={t('adjustment_notes_placeholder', "e.g., Correcting yesterday's error...")}
              />
            </div>

            {/* Balance Preview */}
            {selectedAdjustmentStaff && (
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
                  <span>{t('current_net_balance_label', 'Current Net Balance')}</span>
                  <span className="text-slate-900 dark:text-white text-sm">₹{selectedAdjustmentStaff.netBalance.toLocaleString('en-IN')}</span>
                </div>
                {adjustmentAmount && Number(adjustmentAmount) > 0 && (
                  <div className="flex items-center justify-between text-[10px] font-semibold text-emerald-600 mt-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-700">
                    <span>After This Adjustment</span>
                    <span className="text-sm">
                      ₹{(selectedAdjustmentStaff.netBalance + Number(adjustmentAmount)).toLocaleString('en-IN')}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-5 py-2.5 rounded-lg shadow-xs flex items-center gap-2 cursor-pointer transition-colors w-full justify-center"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{t('cash_apply_adjustment_button', 'Apply Adjustment')}</span>
              </button>
            </div>
          </form>
        </div>
      </div>



      {/* Drawer Entry History */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md overflow-hidden">
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
          <div className="border-t border-slate-100 dark:border-slate-700">
            <div className="p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40">
              <span className="text-slate-500 dark:text-slate-400 font-semibold text-xs">{isLoading ? '…' : `${drawerEntries.length} entries`}</span>
              <div className="w-full sm:w-auto">
                <FlowbiteTextInput
                  type="text"
                  value={searchHistory}
                  onChange={e => setSearchHistory(e.target.value)}
                  placeholder={t('search_staff_type_notes_placeholder', 'Search staff, type, notes...')}
                  className="w-full sm:w-64"
                />
              </div>
            </div>

            {/* Drawer Entry Mobile Cards (md:hidden) */}
            <div className="md:hidden p-4 space-y-2.5">
              {filteredEntries.slice((drawerHistoryPage - 1) * 10, drawerHistoryPage * 10).map((entry: CashDrawerEntry, idx: number) => (
                <div key={entry.id || idx} className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200/80 dark:border-slate-700/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-800 pb-2">
                    <span className="font-mono text-[10px] font-semibold text-slate-500">
                      {formatDateTimeDDMMYYYY(entry.created_at)}
                    </span>
                    <Badge variant="info" size="sm">
                      {entry.type === 'handover' ? (
                        <Handshake className="w-3 h-3" />
                      ) : (
                        <Sliders className="w-3 h-3" />
                      )}
                      {entry.type === 'handover' ? 'Handover' : 'Adjustment'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-white text-xs">{entry.staff_name}</h4>
                      {entry.handed_to && <p className="text-[11px] text-slate-500">Handed To: {entry.handed_to}</p>}
                      {entry.notes && <p className="text-[10px] text-slate-400 italic mt-0.5">{entry.notes}</p>}
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white text-sm tabular-numbers">₹{Number(entry.amount).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              ))}

              {filteredEntries.length > 10 && (
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    disabled={drawerHistoryPage === 1}
                    onClick={() => setDrawerHistoryPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                  >
                    Previous
                  </button>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Page {drawerHistoryPage} of {Math.ceil(filteredEntries.length / 10)}
                  </span>
                  <button
                    type="button"
                    disabled={drawerHistoryPage >= Math.ceil(filteredEntries.length / 10)}
                    onClick={() => setDrawerHistoryPage((p) => Math.min(Math.ceil(filteredEntries.length / 10), p + 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>

            {/* Desktop Table (hidden md:block) */}
            <div className="hidden md:block overflow-x-auto">
              {(() => {
                const drawerColumns = [
                  {
                    name: t('date_time_column', 'Date & Time'),
                    cell: (entry: CashDrawerEntry) => <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{formatDateTimeDDMMYYYY(entry.created_at)}</span>,
                  },
                  {
                    name: t('staff_column', 'Staff'),
                    cell: (entry: CashDrawerEntry) => <span className="font-semibold">{entry.staff_name}</span>,
                  },
                  {
                    name: t('type_column', 'Type'),
                    cell: (entry: CashDrawerEntry) => (
                      <Badge variant="info" size="sm">
                        {entry.type === 'handover' ? (
                          <Handshake className="w-3 h-3" />
                        ) : (
                          <Sliders className="w-3 h-3" />
                        )}
                        {entry.type === 'handover' ? 'Handover' : 'Adjustment'}
                      </Badge>
                    ),
                  },
                  {
                    name: t('amount_column', 'Amount'),
                    align: 'right' as const,
                    cell: (entry: CashDrawerEntry) => <span className="font-semibold text-sm tabular-numbers">₹{Number(entry.amount).toLocaleString('en-IN')}</span>,
                  },
                  {
                    name: t('handed_to_column', 'Handed To'),
                    cell: (entry: CashDrawerEntry) => <span className="text-slate-500">{entry.handed_to || '-'}</span>,
                  },
                  {
                    name: t('notes_column', 'Notes'),
                    cell: (entry: CashDrawerEntry) => <span className="text-slate-500 text-[10px] max-w-[200px] truncate block">{entry.notes || '-'}</span>,
                  },
                ];

                if (isLoading) {
                  return (
                    <div className="p-8 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500 font-semibold text-xs">
                      <Loader2 className="w-4 h-4 animate-spin" /> {t('loading_drawer_data_label', 'Loading drawer data...')}
                    </div>
                  );
                }
                return (
                  <>
                    <Table hoverable>
                      <TableHead>
                        <TableRow>
                          {drawerColumns.map((col) => (
                            <TableHeadCell key={col.name} className={col.align === 'right' ? 'text-right' : ''}>
                              {col.name}
                            </TableHeadCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {filteredEntries.slice((drawerHistoryDesktopPage - 1) * DRAWER_HISTORY_PAGE_SIZE, drawerHistoryDesktopPage * DRAWER_HISTORY_PAGE_SIZE).map((entry: CashDrawerEntry, idx: number) => (
                          <TableRow key={idx} className="bg-white dark:bg-gray-800">
                            {drawerColumns.map((col) => (
                              <TableCell key={col.name} className={col.align === 'right' ? 'text-right' : ''}>
                                {col.cell(entry)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <TablePagination
                      page={drawerHistoryDesktopPage}
                      totalItems={filteredEntries.length}
                      pageSize={DRAWER_HISTORY_PAGE_SIZE}
                      onPageChange={setDrawerHistoryDesktopPage}
                      itemLabel="entries"
                    />
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* MONTHLY PAYOUT CALCULATOR */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors space-y-4">
        <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/60 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h3 className="cash-drawer-manager__subtitle font-semibold text-slate-900 dark:text-white text-xs tracking-wider uppercase flex items-center gap-2">
            <IndianRupee className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            {t('monthly_payout_calculator_heading', 'Monthly Payout Calculator')}
          </h3>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
                else { setSelectedMonth(m => m - 1); }
              }}
              className="bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-semibold text-xs p-1.5 rounded-lg cursor-pointer transition-colors shadow-xs flex items-center justify-center"
              aria-label="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold text-xs rounded-lg border border-blue-200 dark:border-blue-800 whitespace-nowrap min-w-[120px] text-center">
              {new Date(selectedYear, selectedMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() => {
                if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1); }
                else { setSelectedMonth(m => m + 1); }
              }}
              className="bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-semibold text-xs p-1.5 rounded-lg cursor-pointer transition-colors shadow-xs flex items-center justify-center"
              aria-label="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Payout Cards Stack (md:hidden) */}
        <div className="md:hidden p-4 space-y-3">
          <div className="pb-2">
            <Input type="text" value={searchPayout} onChange={e => setSearchPayout(e.target.value)} placeholder="Search by staff name..." className="w-full" />
          </div>

          {filteredPayout.slice((payrollPage - 1) * 10, payrollPage * 10).map((row: any) => {
            const isPaid = paidStaff.has(row.staff.id);
            const isPaying = payingStaff === row.staff.id;
            const isCredit = row.advances < 0;
            return (
              <div key={row.staff.id} className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200/80 dark:border-slate-700/80 space-y-2.5 text-xs">
                <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800 pb-2">
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-white text-xs">{row.staff.name}</h4>
                    <span className="text-[11px] text-slate-500">₹{row.dailyWage.toFixed(2)} / day ({row.presentDays} days)</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Pending Payout</span>
                    <span className="font-bold text-blue-700 dark:text-blue-400 text-sm">₹{row.pendingPayout.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] bg-white dark:bg-slate-800/80 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-700">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Total Earned:</span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">₹{row.totalEarned.toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Collected:</span>
                    <span className="font-semibold text-amber-700 dark:text-amber-400">₹{row.cashCollected.toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Handovers:</span>
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">₹{row.handovers.toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Advances/Credits:</span>
                    <span className={`font-semibold ${isCredit ? 'text-emerald-600' : 'text-red-600'}`}>
                      {isCredit ? '+' : '-'} ₹{Math.abs(row.advances).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => { setAdvanceStaff(row.staff); setAdvanceAmount(0); setAdvanceReason(''); setIsAdvanceModalOpen(true); }}
                    leftIcon={<Plus className="w-3 h-3 text-emerald-600" />}
                  >
                    Advance
                  </Button>
                  {isPaid ? (
                    <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold text-[10px] px-2 py-1 rounded-lg border border-emerald-300 flex items-center gap-1">
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
              </div>
            );
          })}

          {filteredPayout.length > 10 && (
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                disabled={payrollPage === 1}
                onClick={() => setPayrollPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Page {payrollPage} of {Math.ceil(filteredPayout.length / 10)}
              </span>
              <button
                type="button"
                disabled={payrollPage >= Math.ceil(filteredPayout.length / 10)}
                onClick={() => setPayrollPage((p) => Math.min(Math.ceil(filteredPayout.length / 10), p + 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Desktop Payout Table (hidden md:block) */}
        <div className="hidden md:block">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40">
            <Input type="text" value={searchPayout} onChange={e => setSearchPayout(e.target.value)} placeholder="Search by staff name..." className="w-full max-w-xs" />
          </div>
          <div className="overflow-x-auto">
          {(() => {
            const payoutColumns = [
              {
                name: 'Staff Name',
                cell: (row: any) => <span className="font-semibold text-slate-900 dark:text-white text-sm whitespace-nowrap">{row.staff.name}</span>,
              },
              {
                name: 'Daily Wage',
                align: 'right' as const,
                cell: (row: any) => <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs whitespace-nowrap">₹{row.dailyWage.toFixed(2)}</span>,
              },
              {
                name: 'Present Days',
                align: 'center' as const,
                cell: (row: any) => <span className="whitespace-nowrap"><span className="font-semibold text-slate-800 dark:text-slate-200">{row.presentDays}</span><span className="text-slate-400 dark:text-slate-500"> days</span></span>,
              },
              {
                name: 'Total Earned',
                align: 'right' as const,
                cell: (row: any) => <span className="font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">₹{row.totalEarned.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
              },
              {
                name: 'Collected',
                align: 'right' as const,
                cell: (row: any) => <span className="font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">₹{row.cashCollected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
              },
              {
                name: 'Out of Pocket',
                align: 'right' as const,
                cell: (row: any) => <span className="font-semibold text-purple-600 dark:text-purple-400 whitespace-nowrap">₹{row.outOfPocket.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
              },
              {
                name: 'Handovers',
                align: 'right' as const,
                cell: (row: any) => <span className="font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">₹{row.handovers.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
              },
              {
                name: 'Advances',
                align: 'right' as const,
                cell: (row: any) => {
                  const isCredit = row.advances < 0;
                  return (
                    <span className={`font-semibold whitespace-nowrap ${isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {isCredit ? '+' : '-'} ₹{Math.abs(row.advances).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  );
                },
              },
              {
                name: 'Pending Payout',
                align: 'right' as const,
                cell: (row: any) => <span className="font-semibold text-blue-700 dark:text-blue-400 whitespace-nowrap">₹{row.pendingPayout.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
              },
              {
                name: 'Actions',
                align: 'center' as const,
                cell: (row: any) => {
                  const isPaid = paidStaff.has(row.staff.id);
                  const isPaying = payingStaff === row.staff.id;
                  return (
                    <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                      <Button
                        variant="secondary"
                        size="sm"
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
                          size="sm"
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
            ];

            if (isLoading) {
              return (
                <div className="p-8 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500 font-semibold text-xs">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading staff...
                </div>
              );
            }
            if (filteredPayout.length === 0) {
              return (
                <div className="p-8 text-center text-slate-400 font-semibold text-xs">No active staff members found</div>
              );
            }
            return (
              <>
                <Table hoverable>
                  <TableHead>
                    <TableRow>
                      {payoutColumns.map((col) => (
                        <TableHeadCell key={col.name} className={col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}>
                          {col.name}
                        </TableHeadCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredPayout.slice((payoutDesktopPage - 1) * PAYOUT_DESKTOP_PAGE_SIZE, payoutDesktopPage * PAYOUT_DESKTOP_PAGE_SIZE).map((row: any) => (
                      <TableRow key={row.staff.id} className="bg-white dark:bg-gray-800">
                        {payoutColumns.map((col) => (
                          <TableCell key={col.name} className={col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}>
                            {col.cell(row)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination
                  page={payoutDesktopPage}
                  totalItems={filteredPayout.length}
                  pageSize={PAYOUT_DESKTOP_PAGE_SIZE}
                  onPageChange={setPayoutDesktopPage}
                  itemLabel="staff"
                />
              </>
            );
          })()}
          </div>
        </div>

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

      {/* GIVE ADVANCE DRAWER */}
      <Drawer
        open={isAdvanceModalOpen && Boolean(advanceStaff)}
        onClose={() => setIsAdvanceModalOpen(false)}
        position="right"
        className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
      >
        {advanceStaff && (
          <>
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <span className="flex items-center gap-2 font-bold text-gray-900 dark:text-white text-base">
                <Handshake className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                {t('give_advance_heading', 'Give Advance —')} {advanceStaff.name}
              </span>
              <button
                type="button"
                onClick={() => setIsAdvanceModalOpen(false)}
                className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <Input
                  label="Amount (₹) *"
                  type="number"
                  min={0}
                  value={advanceAmount || ''}
                  onChange={(e) => setAdvanceAmount(Number(e.target.value))}
                  placeholder="e.g. 2000"
                  className="text-sm font-semibold"
                  // Live (26 Aug 2026 - CLAUDE.md's "Real-Time Form Validation" note) -
                  // gated on a staff member already being picked, since that's the real
                  // "I've started this form" signal; the amount starts at 0 by default,
                  // so flagging it red before a staff selection would fire on open.
                  error={advanceStaff && advanceAmount <= 0 ? 'Amount must be greater than 0' : undefined}
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
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2 bg-gray-50 dark:bg-gray-850">
              <Button
                variant="secondary"
                onClick={() => setIsAdvanceModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleGiveAdvance}
                disabled={advanceAmount <= 0}
              >
                Confirm Advance
              </Button>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
};
