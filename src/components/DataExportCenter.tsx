import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Database,
  Hotel,
  Utensils,
  Wrench,
  UserCheck,
  FileText,
  HardDriveDownload,
  CheckCircle2,
  Receipt,
  ShoppingCart,
  ScrollText,
  Menu
} from 'lucide-react';
import { Guest, BillingReceipt, Order, StaffMember, AttendanceRecord, AuditLog, MenuItem } from '../types';
import { useStaff } from '../contexts/StaffContext';
import { useFinance } from '../contexts/FinanceContext';
import { useInventoryContext } from '../contexts/InventoryContext';
import { useKitchenContext } from '../contexts/KitchenContext';
import { StyledSelect } from './StyledSelect';

interface DataExportCenterProps {
  guests: Guest[];
  receipts: BillingReceipt[];
  menu: MenuItem[];
  auditLogs: AuditLog[];
  kitchenModuleEnabled?: boolean;
}

export const DataExportCenter: React.FC<DataExportCenterProps> = ({
  guests,
  receipts,
  menu,
  auditLogs,
  kitchenModuleEnabled = true,
}) => {
  const { orders } = useKitchenContext();
  const { staff, attendance } = useStaff();
  const { pettyCash: expenses } = useFinance();
  const { inventory } = useInventoryContext();
  const currentMonthNum = new Date().getMonth() + 1;
  const currentYearNum = new Date().getFullYear();

  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonthNum);
  const [selectedYear, setSelectedYear] = useState<number>(currentYearNum);
  const [downloadSuccessMsg, setDownloadSuccessMsg] = useState<string | null>(null);

  const monthsList = [
    { num: 1, name: 'January' },
    { num: 2, name: 'February' },
    { num: 3, name: 'March' },
    { num: 4, name: 'April' },
    { num: 5, name: 'May' },
    { num: 6, name: 'June' },
    { num: 7, name: 'July' },
    { num: 8, name: 'August' },
    { num: 9, name: 'September' },
    { num: 10, name: 'October' },
    { num: 11, name: 'November' },
    { num: 12, name: 'December' },
  ];

  const yearsList = [2026, 2025, 2024];

  const triggerDownload = (filename: string, content: string, mimeType: string = 'text/csv;charset=utf-8;') => {
    const blob = new Blob(['\uFEFF' + content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloadSuccessMsg(`Downloaded file: ${filename}`);
    setTimeout(() => setDownloadSuccessMsg(null), 4000);
  };

  const monthName = monthsList.find((m) => m.num === Number(selectedMonth))?.name || 'Month';

  // 1. Export Bookings / Accommodations
  const exportBookings = () => {
    const headers = [
      'Guest Name',
      'Room Number',
      'Booking Source',
      'Phone Number',
      'Guests',
      'Check-In Date',
      'Check-Out Date',
      'Base Room Rent (INR)',
      'Advance Paid (INR)',
      'Total Food Bill (INR)',
      'Total Bill (INR)',
      'Payment Status',
    ];

    const rows = guests.map((g) => [
      `"${g.guestName}"`,
      `"${g.roomNumber}"`,
      `"${g.bookingSource}"`,
      `"${g.phoneNumber}"`,
      g.numberOfGuests,
      `"${g.checkinDate || ''}"`,
      `"${g.checkoutDate || ''}"`,
      g.roomRate,
      g.advanceAmount,
      g.foodBill,
      g.totalAmount,
      `"${g.paymentStatus}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(`Farm_Report_BOOKINGS_${monthName}_${selectedYear}.csv`, csvContent);
  };

  // 2. Export Kitchen Purchases / Inventory
  const exportKitchenExpenses = () => {
    const headers = [
      'Item Name',
      'Category',
      'Current Stock',
      'Min Threshold',
      'Unit',
      'Estimated Value per Unit (INR)',
      'Total Stock Value (INR)',
    ];

    const rows = inventory.map((item) => [
      `"${item.name}"`,
      `"${item.category}"`,
      item.currentStock,
      item.minThreshold,
      `"${item.unit}"`,
      120, // default estimation factor
      item.currentStock * 120,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(`Farm_Report_KITCHEN_PURCHASES_${monthName}_${selectedYear}.csv`, csvContent);
  };

  // 3. Export Farm Maintenance & Upkeep Expenses
  const exportFarmUpkeep = () => {
    const headers = [
      'Record ID',
      'Date',
      'Category',
      'Description',
      'Vendor / Payee',
      'Transaction Type',
      'Amount (INR)',
    ];

    const rows = expenses.map((exp) => [
      `"${exp.id}"`,
      `"${exp.date}"`,
      `"${exp.category}"`,
      `"${exp.description}"`,
      `"${exp.vendor}"`,
      `"${exp.type}"`,
      exp.amount,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(`Farm_Report_FARM_UPKEEP_${monthName}_${selectedYear}.csv`, csvContent);
  };

  // 4. Export Payroll & Salaries
  const exportSalaries = () => {
    const headers = [
      'Staff ID',
      'Staff Name',
      'Role / Designation',
      'Base Monthly Salary (INR)',
      'Attendance Count',
      'Payment Status',
    ];

    const rows = staff.map((s) => [
      `"${s.id}"`,
      `"${s.name}"`,
      `"${s.role}"`,
      s.monthlySalary,
      attendance.filter((a) => a.staffId === s.id && a.status === 'Present').length,
      `"${s.status}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(`Farm_Report_SALARIES_${monthName}_${selectedYear}.csv`, csvContent);
  };

  // 5. Export Master Transaction Ledger
  const exportMasterLedger = () => {
    const headers = [
      'Date',
      'Financial Category',
      'Description',
      'Vendor / Reference',
      'Payment Mode',
      'Amount In / Out (INR)',
    ];

    const ledgerRows: string[][] = [];

    // Add Guest Income
    guests.forEach((g) => {
      if (g.advanceAmount > 0) {
        ledgerRows.push([
          `"${g.checkinDate || ''}"`,
          '"Room Rent (Advance)"',
          `"Booking Advance: ${g.guestName} (${g.roomNumber}) via ${g.bookingSource}"`,
          '"Front Desk"',
          '"UPI/Cash"',
          `${g.advanceAmount}`,
        ]);
      }
      if (g.paymentStatus === 'Checked Out' && g.totalAmount > 0) {
        ledgerRows.push([
          `"${g.checkoutDate || ''}"`,
          '"Room & Food Settlement"',
          `"Final Checkout Settlement: ${g.guestName} (${g.roomNumber})"`,
          '"Front Desk"',
          '"Settled"',
          `${g.totalAmount - g.advanceAmount}`,
        ]);
      }
    });

    // Add Expenses
    expenses.forEach((e) => {
      ledgerRows.push([
        `"${e.date}"`,
        `"Petty Cash (${e.category})"`,
        `"${e.description}"`,
        `"${e.vendor}"`,
        `"${e.type}"`,
        `-${e.amount}`,
      ]);
    });

    const csvContent = [headers.join(','), ...ledgerRows.map((r) => r.join(','))].join('\n');
    triggerDownload(`Farm_Report_MASTER_LEDGER_${monthName}_${selectedYear}.csv`, csvContent);
  };

  // 6. Export Billing Receipts
  const exportReceipts = () => {
    const headers = [
      'Receipt ID',
      'Guest Name',
      'Room Number',
      'Check-In Date',
      'Check-Out Date',
      'Room Rent (INR)',
      'Food Total (INR)',
      'Misc Total (INR)',
      'Discount (INR)',
      'Grand Total (INR)',
      'Advance Paid (INR)',
      'Payment Method',
      'Payment Status',
      'Paid At',
    ];

    const rows = receipts.map((r) => [
      `"${r.id}"`,
      `"${r.guestName}"`,
      `"${r.roomNumber}"`,
      `"${r.checkinDate || ''}"`,
      `"${r.checkoutDate || ''}"`,
      r.roomRent || r.roomTotal || 0,
      r.foodTotal || r.kitchenTotal || 0,
      r.miscTotal || 0,
      r.discount || 0,
      r.grandTotal,
      r.advancePaid || 0,
      `"${r.paymentMethod || 'Cash'}"`,
      `"${r.status}"`,
      `"${r.paidAt || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(`Farm_Report_RECEIPTS_${monthName}_${selectedYear}.csv`, csvContent);
  };

  // 7. Export Kitchen Orders
  const exportOrders = () => {
    const headers = [
      'Order ID',
      'Guest Name',
      'Room Number',
      'Order Time',
      'Status',
      'Items',
      'Item Count',
      'Total Amount (INR)',
    ];

    const rows = orders.map((o) => [
      `"${o.id}"`,
      `"${o.guestName}"`,
      `"${o.roomNumber}"`,
      `"${o.orderTime}"`,
      `"${o.status}"`,
      `"${o.items.map((i) => `${i.name} x${i.quantity}`).join('; ')}"`,
      o.items.reduce((sum, i) => sum + i.quantity, 0),
      o.totalAmount,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(`Farm_Report_ORDERS_${monthName}_${selectedYear}.csv`, csvContent);
  };

  // 8. Export Menu Catalog
  const exportMenu = () => {
    const headers = [
      'Item ID',
      'Item Name',
      'Category',
      'Price (INR)',
      'Available',
    ];

    const rows = menu.map((m) => [
      `"${m.id}"`,
      `"${m.name}"`,
      `"${m.category}"`,
      m.price,
      m.available ? 'Yes' : 'No',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(`Farm_Report_MENU_CATALOG_${monthName}_${selectedYear}.csv`, csvContent);
  };

  // 9. Export Audit Logs
  const exportAuditLogs = () => {
    const headers = [
      'Log ID',
      'Timestamp',
      'User',
      'Action',
      'Status',
      'Module',
      'Browser',
      'OS',
      'Device Type',
      'IP Address',
    ];

    const rows = auditLogs.map((l) => [
      `"${l.id}"`,
      `"${l.timestamp}"`,
      `"${l.user}"`,
      `"${l.action}"`,
      `"${l.status || 'Success'}"`,
      `"${l.module || ''}"`,
      `"${l.browser || ''}"`,
      `"${l.os || ''}"`,
      `"${l.device_type || ''}"`,
      `"${l.ip_address || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(`Farm_Report_AUDIT_LOGS_${monthName}_${selectedYear}.csv`, csvContent);
  };

  // 10. Export Full SQL Database Snapshot Backup (Server-Side)
  const exportFullSqlBackup = () => {
    const _base = window.location.pathname.replace(/#.*$/, '').replace(/\/[^/]*$/, '');
    const timestamp = Date.now();
    const backupUrl = `${_base}/php/api/backup.php?t=${timestamp}`;

    const link = document.createElement('a');
    link.href = backupUrl;
    link.setAttribute('download', `Backup_Artists_Farm_Jaipur_${new Date().toISOString().slice(0, 10)}.sql`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloadSuccessMsg(`Downloaded file: Backup_Artists_Farm_Jaipur_${new Date().toISOString().slice(0, 10)}.sql`);
    setTimeout(() => setDownloadSuccessMsg(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            <span>Data Export & Backup Center</span>
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Download master auditing spreadsheets or generate snapshot recovery files for your records workbook.
          </p>
        </div>

        {downloadSuccessMsg && (
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-300 px-3 py-2 rounded-lg text-xs font-bold animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{downloadSuccessMsg}</span>
          </div>
        )}
      </div>

      {/* Control Card & Dropdowns */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-2xs space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-dashed border-gray-200">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span>Target Statement Month</span>
            </label>
            <StyledSelect
              value={String(selectedMonth)}
              onChange={(val) => setSelectedMonth(Number(val))}
              options={monthsList.map((m) => ({
                value: String(m.num),
                label: m.name,
              }))}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span>Target Statement Year</span>
            </label>
            <StyledSelect
              value={String(selectedYear)}
              onChange={(val) => setSelectedYear(Number(val))}
              options={yearsList.map((y) => ({
                value: String(y),
                label: String(y),
              }))}
            />
          </div>
        </div>

        {/* Action Export Cards List */}
        <div className="space-y-4">
          {/* Card 1: Bookings */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl gap-4 hover:border-slate-300 transition-colors">
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                <Hotel className="w-4 h-4 text-blue-600" />
                <span>Accommodations Booking Spreadsheet</span>
              </h3>
              <p className="text-xs text-gray-500">
                Extracts comprehensive check-in logs, occupancy timelines, advance splits, food bills, and total room collections.
              </p>
            </div>
            <button
              type="button"
              onClick={exportBookings}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>EXPORT SHEETS</span>
            </button>
          </div>

          {/* Card 2: Kitchen Purchases */}
          {kitchenModuleEnabled && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl gap-4 hover:border-slate-300 transition-colors">
              <div className="space-y-1">
                <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-amber-600" />
                  <span>Kitchen Purchases Workbook</span>
                </h3>
                <p className="text-xs text-gray-500">
                  Downloads inventory replenishment lists, raw ration tracking, volume unit weights, and market vendor bills.
                </p>
              </div>
              <button
                type="button"
                onClick={exportKitchenExpenses}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>EXPORT SHEETS</span>
              </button>
            </div>
          )}

          {/* Card 3: Farm Upkeep & Utilities */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl gap-4 hover:border-slate-300 transition-colors">
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-purple-600" />
                <span>Property Maintenance & Utilities Logs</span>
              </h3>
              <p className="text-xs text-gray-500">
                Generates itemized expense spreadsheets for water tankers, electricity bills, hardware, and physical farm upkeep.
              </p>
            </div>
            <button
              type="button"
              onClick={exportFarmUpkeep}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>EXPORT SHEETS</span>
            </button>
          </div>

          {/* Card 4: Payroll & Salaries */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl gap-4 hover:border-slate-300 transition-colors">
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-600" />
                <span>Payroll & Salaries Registry</span>
              </h3>
              <p className="text-xs text-gray-500">
                Compiles all recorded payouts, staff management stipends, logged cash advances, and deductions.
              </p>
            </div>
            <button
              type="button"
              onClick={exportSalaries}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>EXPORT SHEETS</span>
            </button>
          </div>

          {/* Card 5: Master Ledger */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-sky-50 border border-sky-200 rounded-xl gap-4 hover:border-sky-300 transition-colors">
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-sky-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-700" />
                <span>Master Transaction Ledger</span>
              </h3>
              <p className="text-xs text-sky-700">
                The ultimate financial sheet compiling room rent advances, final settlements, food collections, supply purchases, and operational expenses.
              </p>
            </div>
            <button
              type="button"
              onClick={exportMasterLedger}
              className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>EXPORT MASTER</span>
            </button>
          </div>

          {/* Card 6: SQL Snapshot Backup */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-rose-50 border border-rose-200 rounded-xl gap-4 mt-6 hover:border-rose-300 transition-colors">
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-rose-900 flex items-center gap-2">
                <Database className="w-4 h-4 text-rose-700" />
                <span>Full System Snapshot Backup</span>
              </h3>
              <p className="text-xs text-rose-700">
                Generates an instant raw SQL dump of your entire database structure and entries for full data protection.
              </p>
            </div>
            <button
              type="button"
              onClick={exportFullSqlBackup}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
            >
              <HardDriveDownload className="w-4 h-4" />
              <span>DOWNLOAD BACKUP (.SQL)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
