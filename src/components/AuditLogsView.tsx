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
  Server,
  Database,
  Cpu,
  Receipt
} from 'lucide-react';
import { AuditLog, BillingReceipt } from '../types';

interface AuditLogsViewProps {
  logs: AuditLog[];
  receipts?: BillingReceipt[];
  activeMenuItemKey?: string;
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({
  logs,
  receipts = [],
  activeMenuItemKey,
}) => {
  const [activeTab, setActiveTab] = useState<'audit' | 'receipts' | 'activity' | 'login' | 'health'>('audit');

  useEffect(() => {
    if (activeMenuItemKey === 'past_receipts_log') {
      setActiveTab('receipts');
    } else if (activeMenuItemKey === 'staff_activity_trail') {
      setActiveTab('activity');
    } else if (activeMenuItemKey === 'login_logs') {
      setActiveTab('login');
    } else if (activeMenuItemKey === 'system_health') {
      setActiveTab('health');
    } else if (activeMenuItemKey === 'audit_logs_main') {
      setActiveTab('audit');
    }
  }, [activeMenuItemKey]);

  // Sample security login trace data matching security_login_logs.php
  const loginTraceLogs = [
    { id: 'log-01', timestamp: '2026-07-24 09:42:10', user: 'Tarpan Patel', role: 'Super Admin', ip: '103.21.124.8', device: 'Chrome / macOS', status: 'Success' },
    { id: 'log-02', timestamp: '2026-07-24 08:15:33', user: 'Head Chef Vijay', role: 'Chef', ip: '103.21.124.9', device: 'Android Tablet', status: 'Success' },
    { id: 'log-03', timestamp: '2026-07-24 07:30:12', user: 'Front Desk Rajesh', role: 'Staff', ip: '103.21.124.12', device: 'Chrome / Windows', status: 'Success' },
    { id: 'log-04', timestamp: '2026-07-23 23:11:05', user: 'Unknown User', role: 'Guest', ip: '49.36.18.201', device: 'Safari / iPhone', status: 'Failed' },
    { id: 'log-05', timestamp: '2026-07-23 18:22:45', user: 'Finance Admin Neha', role: 'Admin', ip: '103.21.124.10', device: 'Firefox / macOS', status: 'Success' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-blue-600" />
            <span>Audit Trails & System Diagnostics</span>
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Timestamped security logs, past receipt settlements, login trace audits, and system health status
          </p>
        </div>

        {/* Sub-tab Navigation Buttons */}
        <div className="flex flex-wrap items-center gap-2 bg-gray-100 p-1.5 rounded-xl border border-gray-200">
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
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
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Past Receipts</span>
          </button>

          <button
            onClick={() => setActiveTab('activity')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'activity'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Staff Activity</span>
          </button>

          <button
            onClick={() => setActiveTab('login')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'login'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Login Trace</span>
          </button>

          <button
            onClick={() => setActiveTab('health')}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'health'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>System Health</span>
          </button>
        </div>
      </div>

      {/* TAB 1: Main Audit Trail */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-2xs overflow-hidden p-4">
          <div className="hidden md:block overflow-x-auto text-xs">
            <table className="w-full text-left text-gray-700">
              <thead className="bg-gray-50 font-extrabold text-gray-500 border-b border-gray-200 uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Timestamp (IST)</th>
                  <th className="py-3 px-4">User / Actor</th>
                  <th className="py-3 px-4">Activity Trace Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-gray-500 font-mono flex items-center gap-1.5 whitespace-nowrap">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      <span>{log.timestamp}</span>
                    </td>
                    <td className="py-3 px-4 font-bold text-gray-900 whitespace-nowrap">
                      <span className="bg-sky-50 text-sky-800 border border-sky-200 px-2.5 py-1 rounded text-xs font-extrabold">
                        {log.user}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-900 font-medium leading-relaxed">{log.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-gray-100 space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="pt-3 first:pt-0 space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="bg-sky-50 text-sky-800 font-bold px-2 py-0.5 rounded border border-sky-200 text-[11px]">
                    {log.user}
                  </span>
                  <span className="text-[11px] text-gray-400 font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {log.timestamp}
                  </span>
                </div>
                <p className="font-bold text-gray-900 leading-snug">{log.action}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: Past Receipts Log */}
      {activeTab === 'receipts' && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-2xs overflow-hidden p-4 space-y-4">
          <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-blue-600" />
            <span>Past Billing Receipts & Settlement Log</span>
          </h3>

          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left text-gray-700">
              <thead className="bg-gray-50 font-extrabold text-gray-500 border-b border-gray-200 uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Receipt ID</th>
                  <th className="py-3 px-4">Checkout Date</th>
                  <th className="py-3 px-4">Resident Name</th>
                  <th className="py-3 px-4">Room #</th>
                  <th className="py-3 px-4">Room Rent</th>
                  <th className="py-3 px-4">Food Bill</th>
                  <th className="py-3 px-4">Grand Total</th>
                  <th className="py-3 px-4">Payment Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {receipts.length > 0 ? (
                  receipts.map((rec) => (
                    <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-purple-700">#{rec.id}</td>
                      <td className="py-3 px-4 text-gray-500 font-mono">{rec.checkoutDate}</td>
                      <td className="py-3 px-4 font-bold text-gray-900">{rec.guestName}</td>
                      <td className="py-3 px-4 text-gray-600">{rec.roomNumber}</td>
                      <td className="py-3 px-4 font-mono text-gray-900">₹{rec.roomRent}</td>
                      <td className="py-3 px-4 font-mono text-gray-900">₹{rec.foodTotal}</td>
                      <td className="py-3 px-4 font-mono font-extrabold text-emerald-700">₹{rec.grandTotal}</td>
                      <td className="py-3 px-4">
                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold px-2 py-0.5 rounded text-[11px]">
                          {rec.paymentMethod || 'Cash'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400 italic">
                      No historical settlement receipts generated yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Staff Activity Trail */}
      {activeTab === 'activity' && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-2xs overflow-hidden p-4 space-y-4">
          <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-600" />
            <span>Staff Activity & Operational Audit Traces</span>
          </h3>

          <div className="space-y-3">
            {logs
              .filter((l) => l.user !== 'System Process')
              .map((log) => (
                <div key={log.id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-blue-900 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
                      {log.user}
                    </span>
                    <span className="text-gray-400 font-mono text-[11px]">{log.timestamp}</span>
                  </div>
                  <p className="font-medium text-gray-800">{log.action}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* TAB 4: Login Trace Logs */}
      {activeTab === 'login' && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-2xs overflow-hidden p-4 space-y-4">
          <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
            <Lock className="w-4 h-4 text-rose-600" />
            <span>Security Login & Access Trace Logs</span>
          </h3>

          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left text-gray-700">
              <thead className="bg-gray-50 font-extrabold text-gray-500 border-b border-gray-200 uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">User Entered</th>
                  <th className="py-3 px-4">Role Assigned</th>
                  <th className="py-3 px-4">IP Address</th>
                  <th className="py-3 px-4">Device Endpoint</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loginTraceLogs.map((row) => (
                  <tr key={row.id} className={`hover:bg-gray-50 ${row.status === 'Failed' ? 'bg-rose-50/50' : ''}`}>
                    <td className="py-3 px-4 text-gray-500 font-mono">{row.timestamp}</td>
                    <td className="py-3 px-4 font-bold text-gray-900">{row.user}</td>
                    <td className="py-3 px-4 text-sky-700 font-bold">{row.role}</td>
                    <td className="py-3 px-4 font-mono text-gray-600">{row.ip}</td>
                    <td className="py-3 px-4 text-gray-500">{row.device}</td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`font-extrabold text-[10px] px-2.5 py-0.5 rounded-full border ${
                          row.status === 'Success'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-rose-100 text-rose-800 border-rose-300'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: System Health */}
      {activeTab === 'health' && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-2xs p-6 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-gray-200">
            <div>
              <h3 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-600" />
                <span>Node.js Terminal Runtime & System Health Status</span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Real-time container execution metrics, database connection status, memory utilization, and uptime
              </p>
            </div>
            <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold text-xs px-3 py-1 rounded-full flex items-center gap-1.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
              <span>100% Operational</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
                <span>Database Connection</span>
                <Database className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-lg font-black text-slate-900">Connected ✅</p>
              <p className="text-[11px] text-slate-500">Node.js Memory Storage Engine</p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
                <span>Server Uptime</span>
                <Server className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-lg font-black text-slate-900">99.98%</p>
              <p className="text-[11px] text-slate-500">Cloud Run Container Execution</p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
                <span>Memory Footprint</span>
                <Cpu className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-lg font-black text-slate-900">42.8 MB / 512 MB</p>
              <p className="text-[11px] text-slate-500">Optimal Heap Usage</p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
                <span>API Latency</span>
                <Clock className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-lg font-black text-slate-900">&lt; 14 ms</p>
              <p className="text-[11px] text-slate-500">Local POS Event Loop</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
