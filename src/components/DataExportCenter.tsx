import React, { useState } from 'react';
import {
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
} from 'lucide-react';
import { Guest, BillingReceipt, AuditLog, MenuItem } from '../types';
import { useStaff } from '../contexts/StaffContext';
import { useFinance } from '../contexts/FinanceContext';
import { useInventoryContext } from '../contexts/InventoryContext';
import { useKitchenContext } from '../contexts/KitchenContext';
import { useAuth } from '../contexts/AuthContext';
import { StyledSelect } from './StyledSelect';
import { Input } from './Input';
import { PageHeader } from './PageHeader';
import { t } from '../i18n/en';

interface DataExportCenterProps {
  guests: Guest[];
  receipts: BillingReceipt[];
  menu: MenuItem[];
  auditLogs: AuditLog[];
  kitchenModuleEnabled?: boolean;
}

export const DataExportCenter: React.FC<DataExportCenterProps> = ({
  guests,
  receipts: _receipts,
  menu: _menu,
  auditLogs: _auditLogs,
  kitchenModuleEnabled = true,
}) => {
  const { orders: _orders } = useKitchenContext();
  const { staff, attendance } = useStaff();
  const { pettyCash: expenses } = useFinance();
  const { inventory } = useInventoryContext();
  const { activeRole } = useAuth();
  const isRootAdmin = activeRole?.toLowerCase().trim() === 'root admin';
  const currentMonthNum = new Date().getMonth() + 1;
  const currentYearNum = new Date().getFullYear();

  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonthNum);
  const [selectedYear, setSelectedYear] = useState<number>(currentYearNum);
  const [exportRangeType, setExportRangeType] = useState<'month' | 'year' | 'custom'>('month');
  const [customStartDate, setCustomStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [customEndDate, setCustomEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
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

  const yearsList = [currentYearNum, currentYearNum - 1, currentYearNum - 2];

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

  const getFilteredData = <T extends Record<string, any>>(items: T[], dateField: string): T[] => {
    return items.filter((item) => {
      const dateVal = item[dateField];
      if (!dateVal) return false;
      
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return false;

      if (exportRangeType === 'month') {
        return d.getFullYear() === Number(selectedYear) && (d.getMonth() + 1) === Number(selectedMonth);
      } else if (exportRangeType === 'year') {
        return d.getFullYear() === Number(selectedYear);
      } else { // custom range
        const start = new Date(customStartDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
        return d >= start && d <= end;
      }
    });
  };

  const getFilenameSuffix = () => {
    if (exportRangeType === 'month') {
      const name = monthsList.find((m) => m.num === Number(selectedMonth))?.name || 'Month';
      return `${name}_${selectedYear}`;
    } else if (exportRangeType === 'year') {
      return `${selectedYear}`;
    } else {
      return `${customStartDate}_to_${customEndDate}`;
    }
  };

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
      'Status',
      'Base Room Rent (INR)',
      'Advance Paid (INR)',
      'Total Food Bill (INR)',
      'Total Bill (INR)',
      'Payment Status',
      'C-Form Status',
      'Filing Time',
    ];

    const filteredGuests = getFilteredData(guests, 'checkinDate');

    const rows = filteredGuests.map((g) => [
      `"${g.guestName}"`,
      `"${g.roomNumber}"`,
      `"${g.bookingSource || 'Direct'}"`,
      `"${g.phoneNumber}"`,
      g.numberOfGuests || 1,
      `"${g.checkinDate || ''}"`,
      `"${g.checkoutDate || g.expectedCheckout || ''}"`,
      `"${g.status || ''}"`,
      g.roomRate || 0,
      g.advanceAmount || 0,
      g.foodBill || 0,
      g.totalAmount || 0,
      `"${g.paymentStatus || 'Pending'}"`,
      g.isForeignGuest ? (g.cFormFiledAt ? 'Filed' : 'Pending Filing') : 'N/A',
      `"${g.cFormFiledAt || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(`Farm_Report_BOOKINGS_${getFilenameSuffix()}.csv`, csvContent);
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
    triggerDownload(`Farm_Report_KITCHEN_PURCHASES_${getFilenameSuffix()}.csv`, csvContent);
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

    const filteredExpenses = getFilteredData(expenses, 'date');

    const rows = filteredExpenses.map((exp) => [
      `"${exp.id}"`,
      `"${exp.date}"`,
      `"${exp.category}"`,
      `"${exp.description}"`,
      `"${exp.vendor}"`,
      `"${exp.type}"`,
      exp.amount,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(`Farm_Report_FARM_UPKEEP_${getFilenameSuffix()}.csv`, csvContent);
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

    const filteredAttendance = getFilteredData(attendance, 'date');

    const rows = staff.map((s) => [
      `"${s.id}"`,
      `"${s.name}"`,
      `"${s.role}"`,
      s.monthlySalary,
      filteredAttendance.filter((a) => a.staffId === s.id && a.status === 'Present').length,
      `"${s.status}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(`Farm_Report_SALARIES_${getFilenameSuffix()}.csv`, csvContent);
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

    const filteredGuestsForAdvance = getFilteredData(guests, 'checkinDate');
    const filteredGuestsForCheckout = getFilteredData(guests, 'checkoutDate');
    const filteredExpenses = getFilteredData(expenses, 'date');

    // Add Guest Income
    filteredGuestsForAdvance.forEach((g) => {
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
    });

    filteredGuestsForCheckout.forEach((g) => {
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
    filteredExpenses.forEach((e) => {
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
    triggerDownload(`Farm_Report_MASTER_LEDGER_${getFilenameSuffix()}.csv`, csvContent);
  };

  // 6. Export Full SQL Database Snapshot Backup (Server-Side)
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
    <div className="data-export-center space-y-6">
      <PageHeader
        title={t('data_export_center_title', 'Data Export & Backup Center')}
        subtitle={t('data_export_center_subtitle', 'Download master auditing spreadsheets or generate snapshot recovery files for your records workbook.')}
      >
        {downloadSuccessMsg && (
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-300 px-3 py-2 rounded-lg text-xs font-bold animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{downloadSuccessMsg}</span>
          </div>
        )}
      </PageHeader>

      {/* Control Card & Dropdowns */}
      <div className="data-export-center__control-card bg-white p-6 rounded-lg border border-slate-200 shadow-2xs space-y-6">
        {/* Segment Tabs Selector */}
        <div className="data-export-center__tabs flex bg-slate-100 dark:bg-slate-900/60 p-1.5 rounded-xl max-w-md">
          <button
            onClick={() => setExportRangeType('month')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              exportRangeType === 'month'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            {t('single_month_tab', 'Single Month')}
          </button>
          <button
            onClick={() => setExportRangeType('year')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              exportRangeType === 'year'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            {t('whole_year_tab', 'Whole Year')}
          </button>
          <button
            onClick={() => setExportRangeType('custom')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              exportRangeType === 'custom'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            {t('custom_range_tab', 'Custom Range')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-dashed border-slate-200">
          {exportRangeType === 'month' && (
            <>
              <div>
                <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <span>{t('target_month_label', 'Target Month')}</span>
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
                <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <span>{t('target_year_label', 'Target Year')}</span>
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
            </>
          )}

          {exportRangeType === 'year' && (
            <div className="col-span-2 max-w-sm">
              <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-500" />
                <span>{t('target_year_label', 'Target Year')}</span>
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
          )}

          {exportRangeType === 'custom' && (
            <>
              <div>
                  <Input
                    label={t('start_date_label', 'Start Date')}
                    leftIcon={<Calendar className="w-4 h-4 text-slate-500" />}
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                  />
              </div>

              <div>
                  <Input
                    label={t('end_date_label', 'End Date')}
                    leftIcon={<Calendar className="w-4 h-4 text-slate-500" />}
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                  />
              </div>
            </>
          )}
        </div>

        {/* Action Export Cards List */}
        <div className="data-export-center__cards-list space-y-4">
          {/* Card 1: Bookings */}
          <div className="data-export-center__export-card flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl gap-4 hover:border-slate-300 transition-colors">
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Hotel className="w-4 h-4 text-blue-600" />
                <span>{t('bookings_export_title', 'Accommodations Booking Spreadsheet')}</span>
              </h3>
              <p className="text-xs text-slate-500">
                {t('bookings_export_description', 'Extracts comprehensive check-in logs, occupancy timelines, advance splits, food bills, and total room collections.')}
              </p>
            </div>
            <button
              type="button"
              onClick={exportBookings}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>{t('export_sheets_button', 'EXPORT SHEETS')}</span>
            </button>
          </div>


          {/* Card 2: Kitchen Purchases */}
          {kitchenModuleEnabled && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl gap-4 hover:border-slate-300 transition-colors">
              <div className="space-y-1">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-amber-600" />
                  <span>{t('kitchen_purchases_export_title', 'Kitchen Purchases Workbook')}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  {t('kitchen_purchases_export_description', 'Downloads inventory replenishment lists, raw ration tracking, volume unit weights, and market vendor bills.')}
                </p>
              </div>
              <button
                type="button"
                onClick={exportKitchenExpenses}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>{t('export_sheets_button', 'EXPORT SHEETS')}</span>
              </button>
            </div>
          )}

          {/* Card 3: Farm Upkeep & Utilities */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl gap-4 hover:border-slate-300 transition-colors">
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-purple-600" />
                <span>{t('maintenance_utilities_export_title', 'Property Maintenance & Utilities Logs')}</span>
              </h3>
              <p className="text-xs text-slate-500">
                {t('maintenance_utilities_export_description', 'Generates itemized expense spreadsheets for water tankers, electricity bills, hardware, and physical farm upkeep.')}
              </p>
            </div>
            <button
              type="button"
              onClick={exportFarmUpkeep}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>{t('export_sheets_button', 'EXPORT SHEETS')}</span>
            </button>
          </div>

          {/* Card 4: Payroll & Salaries */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl gap-4 hover:border-slate-300 transition-colors">
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-600" />
                <span>{t('payroll_salaries_export_title', 'Payroll & Salaries Registry')}</span>
              </h3>
              <p className="text-xs text-slate-500">
                {t('payroll_salaries_export_description', 'Compiles all recorded payouts, staff management stipends, logged cash advances, and deductions.')}
              </p>
            </div>
            <button
              type="button"
              onClick={exportSalaries}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>{t('export_sheets_button', 'EXPORT SHEETS')}</span>
            </button>
          </div>

          {/* Card 5: Master Ledger */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-sky-50 border border-sky-200 rounded-xl gap-4 hover:border-sky-300 transition-colors">
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-sky-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-700" />
                <span>{t('master_ledger_export_title', 'Master Transaction Ledger')}</span>
              </h3>
              <p className="text-xs text-sky-700">
                {t('master_ledger_export_description', 'The ultimate financial sheet compiling room rent advances, final settlements, food collections, supply purchases, and operational expenses.')}
              </p>
            </div>
            <button
              type="button"
              onClick={exportMasterLedger}
              className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>{t('export_master_button', 'EXPORT MASTER')}</span>
            </button>
          </div>

          {/* Card 6: SQL Snapshot Backup (Root Admin) */}
          {isRootAdmin && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-rose-50 border border-rose-200 rounded-xl gap-4 mt-6 hover:border-rose-300 transition-colors">
              <div className="space-y-1">
                <h3 className="text-sm font-extrabold text-rose-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-rose-700" />
                  <span>{t('snapshot_backup_export_title', 'Full System Snapshot Backup (Root Admin)')}</span>
                </h3>
                <p className="text-xs text-rose-700">
                  {t('snapshot_backup_export_description', 'Generates an instant raw SQL dump of the entire database — every tenant and property, not just this one.')}
                </p>
              </div>
              <button
                type="button"
                onClick={exportFullSqlBackup}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
              >
                <HardDriveDownload className="w-4 h-4" />
                <span>{t('download_backup_button', 'DOWNLOAD BACKUP (.SQL)')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
