import React, { useState, useEffect } from 'react';
import {
  ScrollText,
  Clock,
  UserCheck,
  BookOpen,
  ShieldAlert,
  Lock,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Edit2,
  X,
  Save,
  Home,
  Utensils,
  PlusCircle,
  CreditCard,
  Plus,
  Minus,
  Search
} from 'lucide-react';
import { AuditLog, BillingReceipt } from '../types';

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
  const [activeTab, setActiveTab] = useState<'audit' | 'receipts' | 'activity' | 'login' | 'health'>('audit');

  // Edit Receipt Modal State
  const [editingReceipt, setEditingReceipt] = useState<BillingReceipt | null>(null);

  // Activity Trail Filters
  const [activitySearch, setActivitySearch] = useState('');
  const [activityUser, setActivityUser] = useState('All');
  const [activityDate, setActivityDate] = useState('');

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
  const loginTraceLogs = logs.filter(log => log.module === 'login');

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
    alert(`✅ Receipt #${editingReceipt.id} (${editingReceipt.guestName}) modified & audit saved successfully!`);
    setEditingReceipt(null);
  };

  const isStandalonePage = activeMenuItemKey === 'past_receipts_log' || activeMenuItemKey === 'staff_activity_trail' || activeMenuItemKey === 'sys_logs_health';

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-200">
      {!isStandalonePage && (
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <ScrollText className="w-6 h-6 text-blue-600" />
              <span>Audit Trails & System Diagnostics</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Timestamped security logs, past receipt settlements, login trace audits, and system health status
            </p>
          </div>

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
              <span>Audit Trail</span>
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
              <span>Past Receipts Log</span>
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
              <span>Login Trace</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB CONTENT: PAST RECEIPTS LOG */}
      {activeTab === 'receipts' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Receipt className="w-5 h-5 text-blue-600" />
              <span>Past Billing Receipts & Settlement Log</span>
            </h3>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">Receipt ID</th>
                  <th className="p-3">Resident / Group</th>
                  <th className="p-3">Room / Cottage</th>
                  <th className="p-3">Checkout Date</th>
                  <th className="p-3 font-mono">Room Rent</th>
                  <th className="p-3 font-mono">Food Bill</th>
                  <th className="p-3 font-mono">Grand Total</th>
                  <th className="p-3">Payment Method</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-medium">
                {receipts.length > 0 ? (
                  receipts.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">{rec.id}</td>
                      <td className="p-3 font-bold">{rec.guestName}</td>
                      <td className="p-3">{rec.roomNumber}</td>
                      <td className="p-3 text-slate-500">{rec.checkoutDate}</td>
                      <td className="p-3 font-mono">₹{rec.roomRent || rec.roomTotal}</td>
                      <td className="p-3 font-mono">₹{rec.foodTotal || rec.kitchenTotal || 0}</td>
                      <td className="p-3 font-mono font-extrabold text-emerald-600 dark:text-emerald-400">₹{rec.grandTotal}</td>
                      <td className="p-3">
                        <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border border-emerald-300 font-bold px-2.5 py-0.5 rounded-full text-[10px]">
                          {rec.paymentMethod || 'Cash'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleOpenEditModal(rec)}
                          className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700 px-3 py-1 rounded-lg font-bold hover:bg-blue-100 cursor-pointer transition-colors flex items-center gap-1 ml-auto text-[11px]"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit Receipt</span>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400">
                      No billing receipts found in database.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: STAFF ACTIVITY TRAIL */}
      {activeTab === 'activity' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4 shadow-2xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700 pb-4">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-lg flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-indigo-600" />
              <span>Staff Activity & Attendance Trail</span>
            </h3>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search activity..."
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                  className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-48 transition-all"
                />
              </div>
              
              <input
                type="date"
                value={activityDate}
                onChange={(e) => setActivityDate(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 dark:text-slate-300 transition-all"
              />

              <select
                value={activityUser}
                onChange={(e) => setActivityUser(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 dark:text-slate-300 transition-all"
              >
                <option value="All">All Users</option>
                {Array.from(new Set(logs.map(l => l.user))).filter(Boolean).map(user => (
                  <option key={user} value={user}>{user}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-4">Timestamp (Date & Time)</th>
                  <th className="p-4">User</th>
                  <th className="p-4">Activity Logged (What, For Whom)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-medium text-slate-700 dark:text-slate-300">
                {logs
                  .filter(log => log.module !== 'login')
                  .filter(log => activitySearch ? log.action.toLowerCase().includes(activitySearch.toLowerCase()) : true)
                  .filter(log => activityUser !== 'All' ? log.user === activityUser : true)
                  .filter(log => activityDate ? log.timestamp.startsWith(activityDate) : true)
                  .length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-slate-500 font-medium">No activity records match your filters.</td>
                    </tr>
                  ) : logs
                  .filter(log => log.module !== 'login')
                  .filter(log => activitySearch ? log.action.toLowerCase().includes(activitySearch.toLowerCase()) : true)
                  .filter(log => activityUser !== 'All' ? log.user === activityUser : true)
                  .filter(log => activityDate ? log.timestamp.startsWith(activityDate) : true)
                  .map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="p-4 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {log.timestamp.split('T').join(' ')}
                    </td>
                    <td className="p-4 font-bold text-slate-900 dark:text-white">
                      {log.user}
                    </td>
                    <td className="p-4">
                      {log.action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: LOGIN TRACE */}
      {activeTab === 'login' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Lock className="w-5 h-5 text-blue-600" />
              <span>Security Login Trace & Authentication Audit</span>
            </h3>
            <span className="font-mono text-slate-400 font-bold text-xs">{loginTraceLogs.length} Login Events</span>
          </div>
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">User</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Browser</th>
                  <th className="p-3">OS</th>
                  <th className="p-3">Device</th>
                  <th className="p-3">IP Address</th>
                  <th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-medium">
                {loginTraceLogs.length > 0 ? (
                  loginTraceLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="p-3 font-mono text-slate-500">{log.timestamp}</td>
                      <td className="p-3 font-bold text-slate-900 dark:text-white">{log.user}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          log.status === 'Success'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border-emerald-300'
                            : 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200 border-red-300'
                        }`}>
                          {log.status || 'Unknown'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">{log.browser || '—'}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">{log.os || '—'}</td>
                      <td className="p-3">
                        <span className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-[10px] font-bold text-slate-600 dark:text-slate-300">
                          {log.device_type || '—'}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-400 text-[10px]">{log.ip_address || '—'}</td>
                      <td className="p-3 font-medium text-slate-700 dark:text-slate-300">{log.action}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      No login events recorded yet. Login attempts will appear here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-blue-600" />
              <span>Staff Activity & Operational Audit Trail</span>
            </h3>
            <span className="font-mono text-slate-400 font-bold text-xs">{logs.length} Activity Log Entries</span>
          </div>
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">Log ID</th>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">User</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Module</th>
                  <th className="p-3">Action Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700 font-medium">
                {logs.filter(log => log.module !== 'login').map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="p-3 font-mono text-slate-500">{log.id}</td>
                    <td className="p-3 text-slate-500 font-mono">{log.timestamp}</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{log.user}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        log.status === 'Failed'
                          ? 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200 border-red-300'
                          : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border-emerald-300'
                      }`}>
                        {log.status || 'Success'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500">{log.module || '—'}</td>
                    <td className="p-3 font-medium text-slate-700 dark:text-slate-300">{log.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODIFY BILL & AUDIT MODAL MATCHING SCREENSHOT */}
      {editingReceipt && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-5xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-6 max-h-[92vh] flex flex-col">
            
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-700 pb-4">
              <div>
                <h3 className="font-black text-slate-900 dark:text-white text-lg flex items-center gap-2">
                  <span>Modify Bill & Audit: {editingReceipt.guestName} ({editingReceipt.checkoutDate || 'Stay'})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Modify stay contract terms, adjust food logs, and audit checkout behavior perfectly mirroring the live billing desk.
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
            <form onSubmit={handleSaveReceiptEdit} className="space-y-6 overflow-y-auto pr-1 flex-1 text-xs">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* LEFT 2 COLUMNS: ACCOMMODATION & FOOD LOGS */}
                <div className="lg:col-span-2 space-y-6">

                  {/* 1. ACCOMMODATION INVOICE BREAKDOWN */}
                  <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-4">
                    <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-2 uppercase tracking-wide">
                      <Home className="w-4 h-4 text-emerald-600" />
                      <span>ACCOMMODATION INVOICE BREAKDOWN</span>
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                          BASE LODGING CHARGES (CONTRACT)
                        </label>
                        <input
                          type="number"
                          value={editingReceipt.roomRent ?? editingReceipt.roomTotal ?? 0}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setEditingReceipt(prev => prev ? ({ ...prev, roomRent: val, roomTotal: val }) : null);
                          }}
                          className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-extrabold text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                          ADVANCE DEPOSIT PAID (₹)
                        </label>
                        <input
                          type="number"
                          value={editingReceipt.advancePaid ?? 0}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setEditingReceipt(prev => prev ? ({ ...prev, advancePaid: val }) : null);
                          }}
                          className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-extrabold text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">ADVANCE COLLECTED BY</label>
                        <select
                          value={editingReceipt.advanceCollectedBy || 'Tarpan'}
                          onChange={(e) => setEditingReceipt(prev => prev ? ({ ...prev, advanceCollectedBy: e.target.value }) : null)}
                          className="w-full p-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                        >
                          <option value="Tarpan">Tarpan</option>
                          <option value="Kamlesh">Kamlesh</option>
                          <option value="Subrata">Subrata</option>
                          <option value="Manager">Manager</option>
                          <option value="Staff">Staff</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">PENDING TARIFF COLLECTED BY</label>
                        <select
                          value={editingReceipt.tariffCollectedBy || 'Kamlesh'}
                          onChange={(e) => setEditingReceipt(prev => prev ? ({ ...prev, tariffCollectedBy: e.target.value }) : null)}
                          className="w-full p-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                        >
                          <option value="Tarpan">Tarpan</option>
                          <option value="Kamlesh">Kamlesh</option>
                          <option value="Subrata">Subrata</option>
                          <option value="Manager">Manager</option>
                          <option value="Staff">Staff</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">INCIDENTALS CASHIER</label>
                        <select
                          value={editingReceipt.incidentalsCashier || 'Subrata'}
                          onChange={(e) => setEditingReceipt(prev => prev ? ({ ...prev, incidentalsCashier: e.target.value }) : null)}
                          className="w-full p-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                        >
                          <option value="Tarpan">Tarpan</option>
                          <option value="Kamlesh">Kamlesh</option>
                          <option value="Subrata">Subrata</option>
                          <option value="Manager">Manager</option>
                          <option value="Staff">Staff</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* 2. FOOD ORDERS & INCIDENTALS LOG */}
                  <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-4">
                    <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-2 uppercase tracking-wide">
                      <Utensils className="w-4 h-4 text-emerald-600" />
                      <span>FOOD ORDERS & INCIDENTALS LOG</span>
                    </h4>

                    {/* Insert Food Item Bar */}
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      <select
                        value={selectedDish}
                        onChange={(e) => setSelectedDish(e.target.value)}
                        className="flex-1 w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                      >
                        <option value="">-- Choose Menu Dish --</option>
                        {defaultMenuCatalog.map((item) => (
                          <option key={item.id} value={item.name}>
                            {item.name} (₹{item.price})
                          </option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min="1"
                        value={dishQty}
                        onChange={(e) => setDishQty(Number(e.target.value))}
                        className="w-16 p-2.5 text-center rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-extrabold"
                      />

                      <button
                        type="button"
                        onClick={handleAddFoodItem}
                        className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer shadow-xs transition-colors"
                      >
                        + Insert
                      </button>
                    </div>

                    {/* Food Items Table */}
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="p-2.5">Description Item</th>
                            <th className="p-2.5 text-center">Quantity</th>
                            <th className="p-2.5 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                          {foodItemList.length > 0 ? (
                            foodItemList.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200">{item.name}</td>
                                <td className="p-2.5 text-center">
                                  <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateFoodQty(idx, -1)}
                                      className="w-6 h-6 flex items-center justify-center bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-white font-extrabold hover:bg-slate-200 cursor-pointer"
                                    >
                                      -
                                    </button>
                                    <span className="w-6 text-center font-bold">{item.quantity}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateFoodQty(idx, 1)}
                                      className="w-6 h-6 flex items-center justify-center bg-cyan-500 text-white rounded font-extrabold hover:bg-cyan-600 cursor-pointer"
                                    >
                                      +
                                    </button>
                                  </div>
                                </td>
                                <td className="p-2.5 text-right font-extrabold text-slate-900 dark:text-white">
                                  ₹{(item.total || item.quantity * item.unitPrice).toFixed(2)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={3} className="p-4 text-center text-slate-400 italic">
                                No food incidentals recorded for this bill.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="text-right text-xs font-bold text-slate-600 dark:text-slate-300">
                      Incidentals Bill Subtotal: <span className="text-cyan-600 dark:text-cyan-400 font-extrabold text-sm">₹{calculatedIncidentalsTotal.toFixed(2)}</span>
                    </div>
                  </div>

                </div>

                {/* RIGHT 1 COLUMN: ADJUSTMENTS, AUDIT TRAIL, FINANCIAL POSITION */}
                <div className="space-y-6">

                  {/* 3. ADD CUSTOM ADJUSTMENTS */}
                  <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3">
                    <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-2 uppercase tracking-wide">
                      <PlusCircle className="w-4 h-4 text-emerald-600" />
                      <span>ADD CUSTOM ADJUSTMENTS</span>
                    </h4>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">STRATEGY TYPE</label>
                      <select
                        value={adjType}
                        onChange={(e) => setAdjType(e.target.value)}
                        className="w-full p-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-semibold"
                      >
                        <option value="Extra Incidentals Charge (+)">Extra Incidentals Charge (+)</option>
                        <option value="Discount / Compensation (-)">Discount / Compensation (-)</option>
                        <option value="Tax Adjustment (+)">Tax Adjustment (+)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">LABEL DESCRIPTION</label>
                      <input
                        type="text"
                        placeholder="e.g., Service Apology..."
                        value={adjLabel}
                        onChange={(e) => setAdjLabel(e.target.value)}
                        className="w-full p-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">AMOUNT (₹)</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={adjAmount}
                        onChange={(e) => setAdjAmount(e.target.value)}
                        className="w-full p-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-extrabold"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleApplyAdjustment}
                      className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs transition-colors"
                    >
                      Apply Active Adjustment
                    </button>
                  </div>

                  {/* 4. CHECKOUT MODIFICATIONS AUDIT TRAIL */}
                  <div className="bg-amber-50/60 dark:bg-amber-950/20 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/50 space-y-2">
                    <h4 className="font-extrabold text-amber-800 dark:text-amber-400 text-xs flex items-center gap-1.5 uppercase tracking-wide">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>CHECKOUT MODIFICATIONS AUDIT TRAIL</span>
                    </h4>
                    <div className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                      {auditTrailList.length === 0 ? (
                        <p className="italic text-slate-400">No last-minute modifications recorded for this sheet.</p>
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
                    <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-2 uppercase tracking-wide">
                      <CreditCard className="w-4 h-4 text-emerald-600" />
                      <span>FINAL FINANCIAL POSITION</span>
                    </h4>

                    <div className="space-y-2 text-xs font-bold border-b border-slate-200 dark:border-slate-700 pb-3">
                      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                        <span>Stay Rent Outstanding Balance:</span>
                        <span className="font-extrabold text-slate-900 dark:text-white">₹{calculatedStayRent.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                        <span>Food & Extras Subtotal:</span>
                        <span className="font-extrabold text-cyan-600">₹{calculatedIncidentalsTotal.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-sm font-extrabold">
                      <span className="text-slate-900 dark:text-white">Total Outstanding Target:</span>
                      <span className="text-emerald-600 text-base font-black">₹{calculatedGrandTotal.toFixed(2)}</span>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-500">
                      <p className="font-bold uppercase text-slate-400 mb-0.5">ORIGINAL SPLIT PAYOUT BREAKDOWN</p>
                      <p className="italic">Legacy payment route or not recorded.</p>
                    </div>
                  </div>

                </div>

              </div>

              {/* Bottom Action Footer */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingReceipt(null)}
                  className="px-5 py-2.5 font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-xl cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 font-bold text-white bg-blue-600 rounded-xl cursor-pointer hover:bg-blue-700 flex items-center gap-1.5 shadow-md transition-colors"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Modifications & Audit Log</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
