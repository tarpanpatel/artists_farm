import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRightLeft, RefreshCw, Search, AlertTriangle, CheckCircle2, IndianRupee, Users, TrendingUp, TrendingDown, Handshake, Sliders, ChevronUp, ChevronDown } from 'lucide-react';
import { CashDrawerEntry, CashDrawerSummary } from '../types';
import { PageHeader } from './PageHeader';
import { t } from '../i18n/en';
import { fetchCashDrawerSummaryFromDB, addDrawerEntryToDB, fetchDrawerEntriesFromDB, resolveTelegramTemplate } from '../services/api';
import DataTable from 'react-data-table-component';
import { useStaff } from '../contexts/StaffContext';
import { useConfirm } from './ConfirmDialogContext';
import { StyledSelect } from './StyledSelect';
import { Input } from './Input';
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
  const { staff } = useStaff();
  const { confirm } = useConfirm();
  const [summaries, setSummaries] = useState<CashDrawerSummary[]>([]);
  const [drawerEntries, setDrawerEntries] = useState<CashDrawerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeForm, setActiveForm] = useState<'handover' | 'manual_adjustment'>('handover');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [handedTo, setHandedTo] = useState('');
  const [notes, setNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [searchHistory, setSearchHistory] = useState('');

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

  const selectedStaff = summaries.find(s => s.staffId === selectedStaffId);

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

  const filteredSummaries = summaries.filter(s => {
    const text = `${s.staffName} ${s.username} ${s.role}`.toLowerCase();
    return text.includes(searchQuery.toLowerCase());
  });

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
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-200">
      <PageHeader
        title={t('cash_drawer_manager_title', 'Cash Drawer Manager')}
        subtitle={t('cash_drawer_description', "Digital lockbox tracking who holds the farm's cash. Accountability & reconciliation at a glance.")}
      />

      {/* System Totals Bar */}
      <div className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 rounded-2xl p-4 text-white shadow-lg">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-emerald-100 text-[10px] font-bold uppercase tracking-wider">{t('total_cash_collected_label', 'Total Cash Collected')}</p>
            <p className="text-2xl font-black mt-1">₹{totalCollected.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</p>
            <p className="text-emerald-200 text-[10px]">{t('from_guest_checkouts_label', 'From Guest Checkouts')}</p>
          </div>
          <div>
            <p className="text-emerald-100 text-[10px] font-bold uppercase tracking-wider">{t('total_handed_over_label', 'Total Handed Over')}</p>
            <p className="text-2xl font-black mt-1">₹{totalHandedOver.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</p>
            <p className="text-emerald-200 text-[10px]">{t('to_owner_next_shift_label', 'To Owner / Next Shift')}</p>
          </div>
          <div>
            <p className="text-emerald-100 text-[10px] font-bold uppercase tracking-wider">{t('net_cash_in_system_label', 'Net Cash In System')}</p>
            <p className="text-2xl font-black mt-1">₹{totalCashInSystem.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</p>
            <p className="text-emerald-200 text-[10px]">{t('unaccounted_should_match_label', 'Unaccounted: Should Match Cash Box')}</p>
          </div>
        </div>
      </div>

      {/* Quick Action Tabs */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-1 flex gap-1">
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
                ? 'bg-emerald-600 text-white shadow-md font-bold'
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
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 max-w-[550px] w-full">
        <h3 className="font-extrabold text-slate-900 dark:text-white text-sm mb-4 flex items-center gap-1.5">
          {activeForm === 'handover' && (
            <>
              <Handshake className="w-4 h-4" />
              <span>{t('record_cash_handover_heading', 'RECORD CASH HANDOVER')}</span>
            </>
          )}
          {activeForm === 'manual_adjustment' && (
            <>
              <Sliders className="w-4 h-4" />
              <span>{t('manual_balance_adjustment_heading', 'MANUAL BALANCE ADJUSTMENT')}</span>
            </>
          )}
        </h3>

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
                <p className="text-[10px] text-red-500 font-bold mt-1 flex items-center gap-1">
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
                  ...staff.filter(s => s.status === 'Active').map(s => ({
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
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                <span>{t('current_net_balance_label', 'Current Net Balance')}</span>
                <span className="text-slate-900 dark:text-white text-sm">₹{selectedStaff.netBalance.toLocaleString('en-IN')}</span>
              </div>
              {amount && Number(amount) > 0 && (
                <div className="flex items-center justify-between text-[10px] font-bold text-emerald-600 mt-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-700">
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
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-3 rounded-xl shadow-2xs flex items-center gap-2 cursor-pointer transition-colors"
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

      {/* Staff Balance Cards */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-slate-800 dark:text-white text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600" />
            {t('staff_cash_responsibility_heading', 'STAFF CASH RESPONSIBILITY')}
          </h3>
          <div>
            <Input
              type="text"
              placeholder={t('filter_staff_placeholder', 'Filter staff...')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-4 h-4 text-slate-400" />}
              className="w-48"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center p-6 text-slate-400 font-semibold flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> {t('loading_drawer_data_label', 'Loading drawer data...')}
          </div>
        ) : filteredSummaries.length === 0 ? (
          <div className="text-center p-6 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 font-semibold">
            {t('no_staff_data_label', 'No staff data available.')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredSummaries.map(s => (
              <div
                key={s.staffId}
                className={`rounded-xl border-2 p-4 transition-all ${
                  s.netBalance > 0
                    ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : s.netBalance < 0
                    ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-extrabold text-slate-900 dark:text-white text-sm">{s.staffName}</p>
                    <p className="text-[10px] text-slate-400 font-semibold">{s.role}</p>
                  </div>
                  {s.netBalance > 0 ? (
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                  ) : s.netBalance < 0 ? (
                    <TrendingDown className="w-5 h-5 text-red-500" />
                  ) : (
                    <IndianRupee className="w-5 h-5 text-slate-400" />
                  )}
                </div>

                {/* Net Balance - Bold */}
                <div className={`text-2xl font-black mb-3 ${
                  s.netBalance > 0 ? 'text-emerald-700 dark:text-emerald-400' : s.netBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400'
                }`}>
                  ₹{s.netBalance.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                </div>

                {/* Breakdown */}
                <div className="space-y-1 text-[10px] font-semibold">
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                    <span>{t('cash_collected_label', 'Cash Collected')}</span>
                    <span>+₹{s.cashCollected.toLocaleString('en-IN')}</span>
                  </div>
                  {s.cashExpenses > 0 && (
                    <div className="flex justify-between text-amber-700 dark:text-amber-400">
                      <span>{t('cash_expenses_label', 'Cash Expenses')}</span>
                      <span>-₹{s.cashExpenses.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {s.drawerHandovers > 0 && (
                    <div className="flex justify-between text-blue-700 dark:text-blue-400">
                      <span>{t('handed_over_label', 'Handed Over')}</span>
                      <span>-₹{s.drawerHandovers.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {s.manualAdjustments !== 0 && (
                    <div className={`flex justify-between ${s.manualAdjustments > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      <span>{t('adjustments_label', 'Adjustments')}</span>
                      <span>{s.manualAdjustments > 0 ? '+' : '-'}₹{Math.abs(s.manualAdjustments).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Drawer Entry History */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
        >
          <h3 className="font-extrabold text-slate-800 dark:text-white text-sm flex items-center gap-2">
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
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
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
                  cell: (entry: CashDrawerEntry) => <span className="font-mono font-bold text-sm">₹{Number(entry.amount).toLocaleString('en-IN')}</span>,
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
              pagination
              paginationPerPage={10}
              paginationRowsPerPageOptions={[10, 25, 50]}
              highlightOnHover
              subHeader={
                <div className="w-full flex items-center justify-between">
                  <span className="text-slate-400 font-bold text-xs">{drawerEntries.length} entries</span>
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
    </div>
  );
};
