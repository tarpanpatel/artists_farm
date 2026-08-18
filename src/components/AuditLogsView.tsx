import React, { useState, useEffect, useMemo } from 'react';
import DataTable from 'react-data-table-component';
import {
  ScrollText,
  ShieldAlert,
  Lock,
  AlertTriangle,
  Receipt,
  Edit2,
  X,
  Save,
  Home,
  Utensils,
  PlusCircle,
  CreditCard,
  Search
} from 'lucide-react';
import { AuditLog, BillingReceipt } from '../types';
import { useToast } from './ToastContext';
import { StyledSelect } from './StyledSelect';
import { Input } from './Input';
import { PageHeader } from './PageHeader';
import { t } from '../i18n/en';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from '../utils/dateUtils';

interface AuditLogsViewProps {
  logs: AuditLog[];
  receipts?: BillingReceipt[];
  activeMenuItemKey?: string;
  onUpdateReceipt?: (updatedReceipt: BillingReceipt) => void;
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({
  logs,
  receipts = [],
  activeMenuItemKey,
  onUpdateReceipt,
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'audit' | 'receipts' | 'activity' | 'login' | 'health'>('audit');

  // Edit Receipt Modal State
  const [editingReceipt, setEditingReceipt] = useState<BillingReceipt | null>(null);
  const [receiptsSearch, setReceiptsSearch] = useState('');

  const filteredReceipts = useMemo(() => {
    if (!receiptsSearch.trim()) return receipts;
    const q = receiptsSearch.toLowerCase().trim();
    return receipts.filter(rec =>
      rec.id.toLowerCase().includes(q) ||
      rec.guestName.toLowerCase().includes(q) ||
      rec.roomNumber.toLowerCase().includes(q) ||
      (rec.paymentMethod || '').toLowerCase().includes(q)
    );
  }, [receipts, receiptsSearch]);

  // Activity Trail Filters
  const [activitySearch, setActivitySearch] = useState('');
  const [activityUser, setActivityUser] = useState('All');
  const [activityDate, setActivityDate] = useState('');
  const [activitySubSearch, setActivitySubSearch] = useState('');

  // Login trace search
  const [loginSearch, setLoginSearch] = useState('');

  // Audit trail search
  const [auditSearch, setAuditSearch] = useState('');

  // Food items & Adjustments state for edit receipt modal
  const [foodItemList, setFoodItemList] = useState<{ name: string; quantity: number; unitPrice: number; total: number }[]>([]);
  const [selectedDish, setSelectedDish] = useState('');
  const [dishQty, setDishQty] = useState(1);
  const [adjType, setAdjType] = useState('Extra Incidentals Charge (+)');
  const [adjLabel, setAdjLabel] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjustmentsList, setAdjustmentsList] = useState<{ type: string; label: string; amount: number }[]>([]);
  const [auditTrailList, setAuditTrailList] = useState<string[]>([]);

  const defaultMenuCatalog = [
    { id: '12', name: 'Chicken Tikka', price: 359 },
    { id: '35', name: 'Chicken Curry (4pcs)', price: 389 },
    { id: '32', name: 'Shahi Paneer', price: 285 },
    { id: '33', name: 'Kadhai Paneer', price: 285 },
    { id: '3', name: 'Pyaz Pakoda (10pcs)', price: 149 },
    { id: '10', name: 'French Fries Regular', price: 149 },
    { id: '26', name: 'OTC Pizza', price: 198 },
    { id: '18', name: 'Chow mein', price: 149 },
    { id: '16', name: 'Fried Papad', price: 40 },
    { id: '74', name: 'Laal Maans', price: 800 },
  ];

  useEffect(() => {
    if (activeMenuItemKey === 'past_receipts_log') {
      setActiveTab('receipts');
    } else if (activeMenuItemKey === 'staff_activity_trail') {
      setActiveTab('activity');
    } else if (activeMenuItemKey === 'login_logs' || activeMenuItemKey === 'sys_logs_health') {
      setActiveTab('login');
    } else if (activeMenuItemKey === 'system_health') {
      setActiveTab('health');
    } else {
      setActiveTab('audit');
    }
  }, [activeMenuItemKey]);

  const handleOpenEditModal = (rec: BillingReceipt) => {
    setEditingReceipt({ ...rec });
    const initialFood = rec.foodItems && rec.foodItems.length > 0 ? rec.foodItems : [
      { name: 'Chicken Tikka', quantity: 1, unitPrice: 359, total: 359 },
      { name: 'Chicken Curry (4pcs)', quantity: 1, unitPrice: 389, total: 389 }
    ];
    setFoodItemList(initialFood);
    setAdjustmentsList(rec.adjustments || []);
    setAuditTrailList(rec.auditTrail || []);
    setSelectedDish('');
    setDishQty(1);
    setAdjType('Extra Incidentals Charge (+)');
    setAdjLabel('');
    setAdjAmount('');
  };

  const handleAddFoodItem = () => {
    if (!selectedDish) return;
    const foundDish = defaultMenuCatalog.find(d => d.name === selectedDish);
    const unitPrice = foundDish ? foundDish.price : 200;
    const newItem = {
      name: selectedDish,
      quantity: dishQty,
      unitPrice: unitPrice,
      total: unitPrice * dishQty
    };
    setFoodItemList(prev => [...prev, newItem]);
    setAuditTrailList(prev => [...prev, `Added food item: ${selectedDish} (x${dishQty})`]);
    setSelectedDish('');
    setDishQty(1);
  };

  const handleUpdateFoodQty = (index: number, delta: number) => {
    const updated = [...foodItemList];
    const item = updated[index];
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      updated.splice(index, 1);
      setAuditTrailList(prev => [...prev, `Removed food item: ${item.name}`]);
    } else {
      updated[index] = {
        ...item,
        quantity: newQty,
        total: newQty * item.unitPrice
      };
      setAuditTrailList(prev => [...prev, `Updated quantity for ${item.name} to ${newQty}`]);
    }
    setFoodItemList(updated);
  };

  const handleApplyAdjustment = () => {
    if (!adjAmount) return;
    const amt = Number(adjAmount);
    if (isNaN(amt) || amt <= 0) return;
    const newAdj = {
      type: adjType,
      label: adjLabel || 'Custom Adjustment',
      amount: amt
    };
    setAdjustmentsList(prev => [...prev, newAdj]);
    setAuditTrailList(prev => [...prev, `Applied adjustment ${adjType}: ${adjLabel || 'Adjustment'} (₹${amt})`]);
    setAdjLabel('');
    setAdjAmount('');
  };

  // Calculations
  const calculatedStayRent = editingReceipt ? (editingReceipt.roomRent ?? editingReceipt.roomTotal ?? 0) : 0;
  const calculatedIncidentalsTotal = foodItemList.reduce((sum, item) => sum + (item.total || (item.quantity * item.unitPrice)), 0);
  const calculatedAdjustmentsTotal = adjustmentsList.reduce((sum, a) => a.type.includes('(-)') ? sum - a.amount : sum + a.amount, 0);
  const calculatedGrandTotal = calculatedStayRent + calculatedIncidentalsTotal + calculatedAdjustmentsTotal;

  // Login trace logs — derived from DB audit logs filtered by module === 'login'
  const loginTraceLogs = useMemo(() => logs.filter(log => log.module === 'login'), [logs]);

  // Filtered activity logs
  const filteredActivityLogs = useMemo(() => {
    return logs
      .filter(log => log.module !== 'login')
      .filter(log => activitySearch ? log.action.toLowerCase().includes(activitySearch.toLowerCase()) : true)
      .filter(log => activityUser !== 'All' ? log.user === activityUser : true)
      .filter(log => activityDate ? log.timestamp.startsWith(activityDate) : true)
      .filter(log => activitySubSearch ? (
        log.action.toLowerCase().includes(activitySubSearch.toLowerCase()) ||
        log.user.toLowerCase().includes(activitySubSearch.toLowerCase())
      ) : true);
  }, [logs, activitySearch, activityUser, activityDate, activitySubSearch]);

  // Filtered login logs
  const filteredLoginLogs = useMemo(() => {
    return loginTraceLogs.filter(log =>
      loginSearch ? (
        (log.user || '').toLowerCase().includes(loginSearch.toLowerCase()) ||
        (log.action || '').toLowerCase().includes(loginSearch.toLowerCase())
      ) : true
    );
  }, [loginTraceLogs, loginSearch]);

  // Filtered audit logs
  const filteredAuditLogs = useMemo(() => {
    return logs
      .filter(log => log.module !== 'login')
      .filter(log => auditSearch ? (
        (log.action || '').toLowerCase().includes(auditSearch.toLowerCase()) ||
        (log.module || '').toLowerCase().includes(auditSearch.toLowerCase())
      ) : true);
  }, [logs, auditSearch]);

  const handleSaveReceiptEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReceipt) return;

    const updated: BillingReceipt = {
      ...editingReceipt,
      roomRent: calculatedStayRent,
      roomTotal: calculatedStayRent,
      foodTotal: calculatedIncidentalsTotal,
      kitchenTotal: calculatedIncidentalsTotal,
      grandTotal: calculatedGrandTotal,
      foodItems: foodItemList,
      adjustments: adjustmentsList,
      auditTrail: auditTrailList
    };

    if (onUpdateReceipt) {
      onUpdateReceipt(updated);
    }
    showToast(`Receipt #${editingReceipt.id} (${editingReceipt.guestName}) modified & audit saved successfully!`, { type: 'success' });
    setEditingReceipt(null);
  };

  const isStandalonePage = activeMenuItemKey === 'past_receipts_log' || activeMenuItemKey === 'staff_activity_trail' || activeMenuItemKey === 'sys_logs_health';

  const customStyles = {
    subHeader: { style: { padding: 0, minHeight: 0, backgroundColor: 'transparent' } },
    headRow: { style: { backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' } },
    headCells: { style: { fontSize: '11px', fontWeight: 600, color: '#64748b', paddingLeft: '12px' } },
    cells: { style: { fontSize: '13px', color: '#334155', padding: '12px' } },
    rows: { style: { minHeight: '52px' } },
  };

  return (
    <div className="audit-logs space-y-6 text-slate-800 dark:text-slate-200">
      {!isStandalonePage && (
        <PageHeader
          title={t('audit_trails_system_diagnostics_heading', 'Audit Trails & System Diagnostics')}
          subtitle={t('audit_trails_system_diagnostics_subtitle', 'Timestamped security logs, past receipt settlements, login trace audits, and system health status')}
        >
          <div className="flex flex-wrap items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'audit'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <ScrollText className="w-3.5 h-3.5" />
              <span>{t('audit_trail_tab_label', 'Audit Trail')}</span>
            </button>
            <button
              onClick={() => setActiveTab('receipts')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'receipts'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>{t('past_receipts_log_tab_label', 'Past Receipts Log')}</span>
            </button>
            <button
              onClick={() => setActiveTab('login')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'login'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{t('login_trace_tab_label', 'Login Trace')}</span>
            </button>
          </div>
        </PageHeader>
      )}

      {/* TAB CONTENT: PAST RECEIPTS LOG */}
      {activeTab === 'receipts' && (
        <div className="audit-logs__receipts bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <DataTable
            columns={[
              {
                name: t('receipt_id_column', 'Receipt ID'),
                selector: (rec: BillingReceipt) => rec.id,
                width: '100px',
                cell: (rec: BillingReceipt) => (
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">{rec.id}</span>
                ),
              },
              {
                name: t('resident_group_column', 'Resident / Group'),
                selector: (rec: BillingReceipt) => rec.guestName,
                sortable: true,
                grow: 1,
                cell: (rec: BillingReceipt) => (
                  <span className="font-semibold">{rec.guestName}</span>
                ),
              },
              {
                name: t('room_cottage_column', 'Room / Cottage'),
                selector: (rec: BillingReceipt) => rec.roomNumber,
                sortable: true,
                width: '120px',
              },
              {
                name: t('checkout_date_column', 'Checkout Date'),
                selector: (rec: BillingReceipt) => rec.checkoutDate || '',
                sortable: true,
                width: '130px',
                cell: (rec: BillingReceipt) => (
                  <span className="text-slate-500">{formatDateDDMMYYYY(rec.checkoutDate) || '—'}</span>
                ),
              },
              {
                name: t('room_rent_column', 'Room Rent'),
                selector: (rec: BillingReceipt) => rec.roomRent || rec.roomTotal || 0,
                sortable: true,
                width: '110px',
                cell: (rec: BillingReceipt) => (
                  <span className="font-mono">₹{rec.roomRent || rec.roomTotal || 0}</span>
                ),
              },
              {
                name: t('food_bill_column', 'Food Bill'),
                selector: (rec: BillingReceipt) => rec.foodTotal || rec.kitchenTotal || 0,
                sortable: true,
                width: '100px',
                cell: (rec: BillingReceipt) => (
                  <span className="font-mono">₹{rec.foodTotal || rec.kitchenTotal || 0}</span>
                ),
              },
              {
                name: t('gst_column', 'GST'),
                selector: (rec: BillingReceipt) => rec.gstRate || 0,
                sortable: true,
                width: '90px',
                cell: (rec: BillingReceipt) => (
                  rec.gstEnabled
                    ? <span className="font-mono text-blue-600">₹{rec.gstAmount} @{rec.gstRate}%</span>
                    : <span className="text-slate-400 text-[11px]">—</span>
                ),
              },
              {
                name: t('grand_total_column', 'Grand Total'),
                selector: (rec: BillingReceipt) => rec.grandTotal || 0,
                sortable: true,
                width: '120px',
                cell: (rec: BillingReceipt) => (
                  <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400">₹{rec.grandTotal}</span>
                ),
              },
              {
                name: t('payment_column', 'Payment'),
                selector: (rec: BillingReceipt) => rec.paymentMethod || 'Cash',
                width: '120px',
                cell: (rec: BillingReceipt) => (
                  <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 font-semibold px-2.5 py-0.5 rounded-full text-[10px]">
                    {rec.paymentMethod || 'Cash'}
                  </span>
                ),
              },
              {
                name: t('actions_column', 'Actions'),
                width: '120px',
                cell: (rec: BillingReceipt) => (
                  <button
                    onClick={() => handleOpenEditModal(rec)}
                    className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700 px-3 py-1 rounded-lg font-semibold hover:bg-blue-100 cursor-pointer transition-colors flex items-center gap-1 text-[11px]"
                  >
                    <Edit2 className="w-3 h-3" />
                    {t('edit_button', 'Edit')}
                  </button>
                ),
              },
            ]}
            data={filteredReceipts}
            pagination
            paginationPerPage={15}
            paginationRowsPerPageOptions={[15, 30, 50, 100]}
            subHeader={
              <div className="flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-blue-600" />
                  <span className="font-extrabold text-slate-900 dark:text-white text-sm">{t('past_billing_receipts_heading', 'Past Billing Receipts & Settlement Log')}</span>
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-500">{receipts.length} receipts</span>
                </div>
                <div className="relative">
                  <Input
                    type="text"
                    value={receiptsSearch}
                    onChange={(e) => setReceiptsSearch(e.target.value)}
                    placeholder={t('search_receipts_placeholder', 'Search receipts...')}
                    leftIcon={<Search className="w-4 h-4 text-slate-400" />}
                  />
                </div>
              </div>
            }
            customStyles={{
              subHeader: { style: { padding: 0, minHeight: 0, backgroundColor: 'transparent' } },
              headRow: { style: { backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' } },
              headCells: { style: { fontSize: '11px', fontWeight: 600, color: '#64748b', paddingLeft: '12px' } },
              cells: { style: { fontSize: '13px', color: '#334155', padding: '12px' } },
              rows: { style: { minHeight: '52px' } },
            }}
            noDataComponent={
              <div className="text-center p-8 text-slate-400 font-semibold text-xs">
                {t('no_billing_receipts_message', 'No billing receipts found in database.')}
              </div>
            }
          />
        </div>
      )}

      {/* TAB CONTENT: STAFF ACTIVITY TRAIL */}
      {activeTab === 'activity' && (
        <div className="audit-logs__activity bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700 pb-4">
            <h3 className="audit-logs-view__subtitle font-extrabold text-slate-900 dark:text-white text-lg flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-indigo-600" />
              <span>{t('staff_activity_attendance_heading', 'Staff Activity & Attendance Trail')}</span>
            </h3>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Input
                  type="text"
                  placeholder={t('search_activity_placeholder', 'Search activity...')}
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                  leftIcon={<Search className="w-4 h-4 text-slate-400" />}
                  className="w-48"
                  fullWidth={false}
                />
              </div>

              <Input
                type="date"
                value={activityDate}
                onChange={(e) => setActivityDate(e.target.value)}
                className="w-48"
                fullWidth={false}
              />

              <StyledSelect
                value={activityUser}
                onChange={setActivityUser}
                className="w-48"
                options={[
                  { value: 'All', label: t('all_users_option_label', 'All Users') },
                  ...Array.from(new Set(logs.map(l => l.user))).filter(Boolean).map(user => ({ value: user, label: user })),
                ]}
              />
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <DataTable
              columns={[
                {
                  name: t('timestamp_datetime_column', 'Timestamp (Date & Time)'),
                  selector: (log: AuditLog) => log.timestamp,
                  sortable: true,
                  grow: 1,
                  cell: (log: AuditLog) => (
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatDateTimeDDMMYYYY(log.timestamp)}
                    </span>
                  ),
                },
                {
                  name: t('user_column', 'User'),
                  selector: (log: AuditLog) => log.user,
                  sortable: true,
                  width: '160px',
                  cell: (log: AuditLog) => (
                    <span className="font-semibold text-slate-900 dark:text-white">{log.user}</span>
                  ),
                },
                {
                  name: t('activity_logged_column', 'Activity Logged (What, For Whom)'),
                  selector: (log: AuditLog) => log.action,
                  sortable: true,
                  grow: 2,
                  cell: (log: AuditLog) => (
                    <span>{log.action}</span>
                  ),
                },
              ]}
              data={filteredActivityLogs}
              pagination
              paginationPerPage={15}
              paginationRowsPerPageOptions={[15, 30, 50, 100]}
              subHeader={
                <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700">
                <Input
                  type="text"
                  value={activitySubSearch}
                  onChange={(e) => setActivitySubSearch(e.target.value)}
                  placeholder={t('search_by_action_or_user_placeholder', 'Search by action or user...')}
                  leftIcon={<Search className="w-4 h-4 text-slate-400" />}
                />
                </div>
              }
              customStyles={customStyles}
              noDataComponent={
                <div className="text-center p-8 text-slate-500 font-medium">{t('no_activity_records_message', 'No activity records match your filters.')}</div>
              }
            />
          </div>
        </div>
      )}

      {/* TAB CONTENT: LOGIN TRACE */}
      {activeTab === 'login' && (
        <div className="audit-logs__login bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="audit-logs-view__subtitle font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Lock className="w-5 h-5 text-blue-600" />
              <span>{t('security_login_trace_heading', 'Security Login Trace & Authentication Audit')}</span>
            </h3>
            <span className="text-slate-400 font-semibold text-xs">{loginTraceLogs.length} {t('login_events_count_label', 'Login Events')}</span>
          </div>
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <DataTable
              columns={[
                {
                  name: t('timestamp_column', 'Timestamp'),
                  selector: (log: AuditLog) => log.timestamp,
                  sortable: true,
                  width: '170px',
                  cell: (log: AuditLog) => (
                    <span className="font-mono text-slate-500">{formatDateTimeDDMMYYYY(log.timestamp)}</span>
                  ),
                },
                {
                  name: t('user_column', 'User'),
                  selector: (log: AuditLog) => log.user,
                  sortable: true,
                  width: '140px',
                  cell: (log: AuditLog) => (
                    <span className="font-semibold text-slate-900 dark:text-white">{log.user}</span>
                  ),
                },
                {
                  name: t('status_column', 'Status'),
                  selector: (log: AuditLog) => log.status || 'Unknown',
                  sortable: true,
                  width: '110px',
                  cell: (log: AuditLog) => (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      log.status === 'Success'
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border-emerald-300'
                        : 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200 border-red-300'
                    }`}>
                      {log.status || 'Unknown'}
                    </span>
                  ),
                },
                {
                  name: t('browser_column', 'Browser'),
                  selector: (log: AuditLog) => log.browser || '—',
                  sortable: true,
                  width: '120px',
                  cell: (log: AuditLog) => (
                    <span className="text-slate-600 dark:text-slate-400">{log.browser || '—'}</span>
                  ),
                },
                {
                  name: t('os_column', 'OS'),
                  selector: (log: AuditLog) => log.os || '—',
                  sortable: true,
                  width: '100px',
                  cell: (log: AuditLog) => (
                    <span className="text-slate-600 dark:text-slate-400">{log.os || '—'}</span>
                  ),
                },
                {
                  name: t('device_column', 'Device'),
                  selector: (log: AuditLog) => log.device_type || '—',
                  width: '110px',
                  cell: (log: AuditLog) => (
                    <span className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                      {log.device_type || '—'}
                    </span>
                  ),
                },
                {
                  name: t('ip_address_column', 'IP Address'),
                  selector: (log: AuditLog) => log.ip_address || '—',
                  width: '130px',
                  cell: (log: AuditLog) => (
                    <span className="font-mono text-slate-400 text-[10px]">{log.ip_address || '—'}</span>
                  ),
                },
                {
                  name: t('action_column', 'Action'),
                  selector: (log: AuditLog) => log.action,
                  sortable: true,
                  grow: 1,
                  cell: (log: AuditLog) => (
                    <span className="font-medium text-slate-700 dark:text-slate-300">{log.action}</span>
                  ),
                },
              ]}
              data={filteredLoginLogs}
              pagination
              paginationPerPage={15}
              paginationRowsPerPageOptions={[15, 30, 50, 100]}
              subHeader={
                <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700">
                <Input
                  type="text"
                  value={loginSearch}
                  onChange={(e) => setLoginSearch(e.target.value)}
                  placeholder={t('search_by_user_or_action_placeholder', 'Search by user or action...')}
                  leftIcon={<Search className="w-4 h-4 text-slate-400" />}
                />
                </div>
              }
              customStyles={customStyles}
              noDataComponent={
                <div className="text-center p-8 text-slate-400">{t('no_login_events_message', 'No login events recorded yet. Login attempts will appear here.')}</div>
              }
            />
          </div>
        </div>
      )}

      {/* TAB CONTENT: AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div className="audit-logs__audit bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="audit-logs-view__subtitle font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-blue-600" />
              <span>{t('staff_activity_operational_audit_heading', 'Staff Activity & Operational Audit Trail')}</span>
            </h3>
            <span className="text-slate-400 font-semibold text-xs">{logs.length} {t('activity_log_entries_count_label', 'Activity Log Entries')}</span>
          </div>
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <DataTable
              columns={[
                {
                  name: t('log_id_column', 'Log ID'),
                  selector: (log: AuditLog) => log.id,
                  width: '100px',
                  cell: (log: AuditLog) => (
                    <span className="font-mono text-slate-500">{log.id}</span>
                  ),
                },
                {
                  name: t('timestamp_column', 'Timestamp'),
                  selector: (log: AuditLog) => log.timestamp,
                  sortable: true,
                  width: '170px',
                  cell: (log: AuditLog) => (
                    <span className="text-slate-500 font-mono">{formatDateTimeDDMMYYYY(log.timestamp)}</span>
                  ),
                },
                {
                  name: t('user_column', 'User'),
                  selector: (log: AuditLog) => log.user,
                  sortable: true,
                  width: '140px',
                  cell: (log: AuditLog) => (
                    <span className="font-semibold text-slate-900 dark:text-white">{log.user}</span>
                  ),
                },
                {
                  name: t('status_column', 'Status'),
                  selector: (log: AuditLog) => log.status || 'Success',
                  sortable: true,
                  width: '110px',
                  cell: (log: AuditLog) => (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      log.status === 'Failed'
                        ? 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200 border-red-300'
                        : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border-emerald-300'
                    }`}>
                      {log.status || 'Success'}
                    </span>
                  ),
                },
                {
                  name: t('module_column', 'Module'),
                  selector: (log: AuditLog) => log.module || '—',
                  sortable: true,
                  width: '120px',
                  cell: (log: AuditLog) => (
                    <span className="text-slate-500">{log.module || '—'}</span>
                  ),
                },
                {
                  name: t('action_description_column', 'Action Description'),
                  selector: (log: AuditLog) => log.action,
                  sortable: true,
                  grow: 1,
                  cell: (log: AuditLog) => (
                    <span className="font-medium text-slate-700 dark:text-slate-300">{log.action}</span>
                  ),
                },
              ]}
              data={filteredAuditLogs}
              pagination
              paginationPerPage={15}
              paginationRowsPerPageOptions={[15, 30, 50, 100]}
              subHeader={
                <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700">
                <Input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder={t('search_by_action_or_module_placeholder', 'Search by action or module...')}
                  leftIcon={<Search className="w-4 h-4 text-slate-400" />}
                />
                </div>
              }
              customStyles={customStyles}
              noDataComponent={
                <div className="text-center p-8 text-slate-400">{t('no_audit_records_message', 'No audit trail records found.')}</div>
              }
            />
          </div>
        </div>
      )}

      {/* MODIFY BILL & AUDIT MODAL MATCHING SCREENSHOT */}
      {editingReceipt && (
        <div className="audit-logs__modal fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="audit-logs__modal-content bg-white dark:bg-slate-800 rounded-3xl max-w-5xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-6 max-h-[92vh] flex flex-col">

            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-700 pb-4">
              <div>
                <h3 className="audit-logs-view__subtitle font-black text-slate-900 dark:text-white text-lg flex items-center gap-2">
                  <span>{t('modify_bill_audit_heading', 'Modify Bill & Audit')}: {editingReceipt.guestName} ({formatDateDDMMYYYY(editingReceipt.checkoutDate) || 'Stay'})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('modify_bill_audit_subtitle', 'Modify stay contract terms, adjust food logs, and audit checkout behavior perfectly mirroring the live billing desk.')}
                </p>
              </div>
              <button
                onClick={() => setEditingReceipt(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Scrollable Form Content */}
            <form onSubmit={handleSaveReceiptEdit} className="app-form app-form--edit-receipt space-y-6 overflow-y-auto pr-1 flex-1 text-xs">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* LEFT 2 COLUMNS: ACCOMMODATION & FOOD LOGS */}
                <div className="lg:col-span-2 space-y-6">

                  {/* 1. ACCOMMODATION INVOICE BREAKDOWN */}
                  <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-4">
                    <h4 className="audit-logs-view__caption font-extrabold text-slate-800 dark:text-slate-200 text-[10px] flex items-center gap-2 uppercase tracking-wide">
                      <Home className="w-4 h-4 text-emerald-600" />
                      <span>{t('accommodation_invoice_breakdown_heading', 'ACCOMMODATION INVOICE BREAKDOWN')}</span>
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Input
                          label={t('base_lodging_charges_contract_label', 'BASE LODGING CHARGES (CONTRACT)')}
                          type="number"
                          value={editingReceipt.roomRent ?? editingReceipt.roomTotal ?? 0}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setEditingReceipt(prev => prev ? ({ ...prev, roomRent: val, roomTotal: val }) : null);
                          }}
                          labelClassName="text-[11px]"
                        />
                      </div>

                      <div>
                        <Input
                          label={t('advance_deposit_paid_label', 'ADVANCE DEPOSIT PAID (₹)')}
                          type="number"
                          value={editingReceipt.advancePaid ?? 0}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setEditingReceipt(prev => prev ? ({ ...prev, advancePaid: val }) : null);
                          }}
                          labelClassName="text-[11px]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase">{t('advance_collected_by_label', 'ADVANCE COLLECTED BY')}</label>
                        <StyledSelect
                          value={editingReceipt.advanceCollectedBy || 'Tarpan'}
                          onChange={(val) => setEditingReceipt(prev => prev ? ({ ...prev, advanceCollectedBy: val }) : null)}
                          options={[
                            { value: 'Tarpan', label: 'Tarpan' },
                            { value: 'Kamlesh', label: 'Kamlesh' },
                            { value: 'Subrata', label: 'Subrata' },
                            { value: 'Manager', label: 'Manager' },
                            { value: 'Staff', label: 'Staff' },
                          ]}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase">{t('pending_tariff_collected_by_label', 'PENDING TARIFF COLLECTED BY')}</label>
                        <StyledSelect
                          value={editingReceipt.tariffCollectedBy || 'Kamlesh'}
                          onChange={(val) => setEditingReceipt(prev => prev ? ({ ...prev, tariffCollectedBy: val }) : null)}
                          options={[
                            { value: 'Tarpan', label: 'Tarpan' },
                            { value: 'Kamlesh', label: 'Kamlesh' },
                            { value: 'Subrata', label: 'Subrata' },
                            { value: 'Manager', label: 'Manager' },
                            { value: 'Staff', label: 'Staff' },
                          ]}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase">{t('incidentals_cashier_label', 'INCIDENTALS CASHIER')}</label>
                        <StyledSelect
                          value={editingReceipt.incidentalsCashier || 'Subrata'}
                          onChange={(val) => setEditingReceipt(prev => prev ? ({ ...prev, incidentalsCashier: val }) : null)}
                          options={[
                            { value: 'Tarpan', label: 'Tarpan' },
                            { value: 'Kamlesh', label: 'Kamlesh' },
                            { value: 'Subrata', label: 'Subrata' },
                            { value: 'Manager', label: 'Manager' },
                            { value: 'Staff', label: 'Staff' },
                          ]}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. FOOD ORDERS & INCIDENTALS LOG */}
                  <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-4">
                    <h4 className="audit-logs-view__caption font-extrabold text-slate-800 dark:text-slate-200 text-[10px] flex items-center gap-2 uppercase tracking-wide">
                      <Utensils className="w-4 h-4 text-emerald-600" />
                      <span>{t('food_orders_incidentals_log_heading', 'FOOD ORDERS & INCIDENTALS LOG')}</span>
                    </h4>

                    {/* Insert Food Item Bar */}
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      <StyledSelect
                        className="flex-1 w-full"
                        value={selectedDish}
                        onChange={setSelectedDish}
                        placeholder={t('audit_choose_menu_dish_placeholder', '-- Choose Menu Dish --')}
                        options={defaultMenuCatalog.map((item) => ({
                          value: item.name,
                          label: `${item.name} (₹${item.price})`,
                        }))}
                      />

                      <Input
                        type="number"
                        min="1"
                        value={dishQty}
                        onChange={(e) => setDishQty(Number(e.target.value))}
                        className="w-16 text-center"
                        fullWidth={false}
                      />

                      <button
                        type="button"
                        onClick={handleAddFoodItem}
                        className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl text-xs flex items-center gap-1 cursor-pointer shadow-xs transition-colors"
                      >
                        + {t('audit_insert_button', 'Insert')}
                      </button>
                    </div>

                    {/* Food Items Table */}
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900">
                      <table className="w-full text-left text-xs audit-logs-view__table">
                        <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700 audit-logs-view__table-header">
                          <tr className="audit-logs-view__table-header-row">
                            <th className="p-2.5 audit-logs-view__table-header-cell">{t('description_item_column', 'Description Item')}</th>
                            <th className="p-2.5 text-center audit-logs-view__table-header-cell">{t('quantity_label', 'Quantity')}</th>
                            <th className="p-2.5 text-right audit-logs-view__table-header-cell">{t('total_column', 'Total')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium audit-logs-view__table-body">
                          {foodItemList.length > 0 ? (
                            foodItemList.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                <td className="audit-logs-view__cell p-2.5 font-semibold text-slate-800 dark:text-slate-200">{item.name}</td>
                                <td className="audit-logs-view__cell p-2.5 text-center">
                                  <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateFoodQty(idx, -1)}
                                      className="w-6 h-6 flex items-center justify-center bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-white font-extrabold hover:bg-slate-200 cursor-pointer"
                                    >
                                      -
                                    </button>
                                    <span className="w-6 text-center font-semibold">{item.quantity}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateFoodQty(idx, 1)}
                                      className="w-6 h-6 flex items-center justify-center bg-cyan-500 text-white rounded font-extrabold hover:bg-cyan-600 cursor-pointer"
                                    >
                                      +
                                    </button>
                                  </div>
                                </td>
                                <td className="audit-logs-view__cell p-2.5 text-right font-extrabold text-slate-900 dark:text-white">
                                  ₹{(item.total || item.quantity * item.unitPrice).toFixed(2)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={3} className="audit-logs-view__cell p-4 text-center text-slate-400 italic">
                                {t('no_food_incidentals_message', 'No food incidentals recorded for this bill.')}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="text-right text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {t('incidentals_bill_subtotal_label', 'Incidentals Bill Subtotal:')} <span className="summary-line summary-line--food-subtotal text-cyan-600 dark:text-cyan-400 font-extrabold text-sm">₹{calculatedIncidentalsTotal.toFixed(2)}</span>
                    </div>
                  </div>

                </div>

                {/* RIGHT 1 COLUMN: ADJUSTMENTS, AUDIT TRAIL, FINANCIAL POSITION */}
                <div className="space-y-6">

                  {/* 3. ADD CUSTOM ADJUSTMENTS */}
                  <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3">
                    <h4 className="audit-logs-view__caption font-extrabold text-slate-800 dark:text-slate-200 text-[10px] flex items-center gap-2 uppercase tracking-wide">
                      <PlusCircle className="w-4 h-4 text-emerald-600" />
                      <span>{t('audit_add_custom_adjustments_heading', 'ADD CUSTOM ADJUSTMENTS')}</span>
                    </h4>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase">{t('audit_strategy_type_label', 'STRATEGY TYPE')}</label>
                      <StyledSelect
                        value={adjType}
                        onChange={setAdjType}
                        options={[
                          { value: 'Extra Incidentals Charge (+)', label: 'Extra Incidentals Charge (+)' },
                          { value: 'Discount / Compensation (-)', label: 'Discount / Compensation (-)' },
                          { value: 'Tax Adjustment (+)', label: 'Tax Adjustment (+)' },
                        ]}
                      />
                    </div>

                    <div>
                      <Input
                        label={t('label_description_label', 'LABEL DESCRIPTION')}
                        type="text"
                        placeholder={t('service_apology_placeholder', 'e.g., Service Apology...')}
                        value={adjLabel}
                        onChange={(e) => setAdjLabel(e.target.value)}
                        labelClassName="text-[10px]"
                      />
                    </div>

                    <div>
                      <Input
                        label={t('amount_rupees_label', 'AMOUNT (₹)')}
                        type="number"
                        placeholder="0.00"
                        value={adjAmount}
                        onChange={(e) => setAdjAmount(e.target.value)}
                        labelClassName="text-[10px]"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleApplyAdjustment}
                      className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl text-xs cursor-pointer shadow-xs transition-colors"
                    >
                      {t('apply_active_adjustment_button', 'Apply Active Adjustment')}
                    </button>
                  </div>

                  {/* 4. CHECKOUT MODIFICATIONS AUDIT TRAIL */}
                  <div className="bg-amber-50/60 dark:bg-amber-950/20 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/50 space-y-2">
                    <h4 className="audit-logs-view__caption font-extrabold text-amber-800 dark:text-amber-400 text-[10px] flex items-center gap-1.5 uppercase tracking-wide">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>{t('checkout_modifications_audit_heading', 'CHECKOUT MODIFICATIONS AUDIT TRAIL')}</span>
                    </h4>
                    <div className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                      {auditTrailList.length === 0 ? (
                        <p className="italic text-slate-400">{t('no_last_minute_modifications_message', 'No last-minute modifications recorded for this sheet.')}</p>
                      ) : (
                        <ul className="space-y-1 list-disc list-inside">
                          {auditTrailList.map((log, i) => (
                            <li key={i}>{log}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* 5. FINAL FINANCIAL POSITION */}
                  <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3">
                    <h4 className="audit-logs-view__caption font-extrabold text-slate-800 dark:text-slate-200 text-[10px] flex items-center gap-2 uppercase tracking-wide">
                      <CreditCard className="w-4 h-4 text-emerald-600" />
                      <span>{t('final_financial_position_heading', 'FINAL FINANCIAL POSITION')}</span>
                    </h4>

                    <div className="space-y-2 text-xs font-semibold border-b border-slate-200 dark:border-slate-700 pb-3">
                      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                        <span>{t('stay_rent_outstanding_balance_label', 'Stay Rent Outstanding Balance:')}</span>
                        <span className="summary-line summary-line--room-rate font-extrabold text-slate-900 dark:text-white">₹{calculatedStayRent.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                        <span>{t('food_extras_subtotal_label', 'Food & Extras Subtotal:')}</span>
                        <span className="summary-line summary-line--food-subtotal font-extrabold text-cyan-600">₹{calculatedIncidentalsTotal.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-sm font-extrabold">
                      <span className="text-slate-900 dark:text-white">{t('total_outstanding_target_label', 'Total Outstanding Target:')}</span>
                      <span className="summary-line summary-line--grand-target-due text-emerald-600 text-base font-black">₹{calculatedGrandTotal.toFixed(2)}</span>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-500">
                      <p className="font-semibold uppercase text-slate-400 mb-0.5">{t('original_split_payout_breakdown_heading', 'ORIGINAL SPLIT PAYOUT BREAKDOWN')}</p>
                      <p className="italic">{t('legacy_payment_route_message', 'Legacy payment route or not recorded.')}</p>
                    </div>
                  </div>

                </div>

              </div>

              {/* Bottom Action Footer */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingReceipt(null)}
                  className="px-5 py-2.5 font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-xl cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  {t('cancel_button', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 font-semibold text-white bg-blue-600 rounded-xl cursor-pointer hover:bg-blue-700 flex items-center gap-1.5 shadow-md transition-colors"
                >
                  <Save className="w-4 h-4" />
                  <span>{t('save_modifications_audit_log_button', 'Save Modifications & Audit Log')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};