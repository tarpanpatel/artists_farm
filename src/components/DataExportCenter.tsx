import React, { useState } from 'react';
import { Card, Alert } from 'flowbite-react';
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
  FileCode,
  Building2,
} from './icons/FlowbiteIcons';
import { Guest, BillingReceipt, AuditLog, MenuItem } from '../types';
import { isCFormGenuinelyFiled } from '../utils/cFormStatus';
import { useStaff } from '../contexts/StaffContext';
import { useFinance } from '../contexts/FinanceContext';
import { useInventoryContext } from '../contexts/InventoryContext';
import { useKitchenContext } from '../contexts/KitchenContext';
import { useAuth } from '../contexts/AuthContext';
import { StyledSelect } from './StyledSelect';
import { DateRangePicker } from './DateRangePicker';
import { PageHeader } from './PageHeader';
import { Button } from './Button';
import { t } from '../i18n/en';
import { generateTallySalesXml, generateTallyPaymentsXml } from '../utils/tallyXmlGenerator';
import {
  generateGstr1Table4B2bCsv,
  generateGstr1Table7B2cCsv,
  generateGstr1Table12HsnCsv,
  generateGstr1ConsolidatedWorkbook,
} from '../utils/gstr1CsvGenerator';

interface DataExportCenterProps {
  guests: Guest[];
  receipts: BillingReceipt[];
  menu: MenuItem[];
  auditLogs: AuditLog[];
  kitchenModuleEnabled?: boolean;
  propertyGstin?: string;
  propertyName?: string;
}

export const DataExportCenter: React.FC<DataExportCenterProps> = ({
  guests,
  receipts,
  menu: _menu,
  auditLogs: _auditLogs,
  kitchenModuleEnabled = true,
  propertyGstin = '',
  propertyName = 'Ground Code Resort',
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

      // Handle DD/MM/YYYY or DD-MM-YYYY
      let d: Date;
      if (/^\d{2}[/-]\d{2}[/-]\d{4}/.test(String(dateVal))) {
        const parts = String(dateVal).split(/[/-]/);
        d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      } else {
        d = new Date(dateVal);
      }

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

  // Filtered dataset slices for the active timeframe
  const filteredGuests = getFilteredData(guests, 'checkinDate');
  const filteredReceipts = getFilteredData(receipts, 'paidAt');
  const filteredExpenses = getFilteredData(expenses, 'date');
  const filteredAttendance = getFilteredData(attendance, 'date');

  // ==========================================
  // 1. TALLY PRIME XML EXPORTS
  // ==========================================
  const exportTallySales = () => {
    const xml = generateTallySalesXml(filteredReceipts, filteredGuests, propertyGstin, propertyName);
    triggerDownload(`Tally_Sales_Vouchers_${getFilenameSuffix()}.xml`, xml, 'application/xml;charset=utf-8;');
  };

  const exportTallyPayments = () => {
    const xml = generateTallyPaymentsXml(filteredExpenses, propertyName);
    triggerDownload(`Tally_Payment_Vouchers_${getFilenameSuffix()}.xml`, xml, 'application/xml;charset=utf-8;');
  };

  // ==========================================
  // 2. GSTR-1 TAX COMPLIANCE CSV EXPORTS
  // ==========================================
  const exportGstr1Table4 = () => {
    const csv = generateGstr1Table4B2bCsv(filteredReceipts, filteredGuests, propertyGstin);
    triggerDownload(`GSTR1_Table4_B2B_Invoices_${getFilenameSuffix()}.csv`, csv);
  };

  const exportGstr1Table7 = () => {
    const csv = generateGstr1Table7B2cCsv(filteredReceipts, filteredGuests, propertyGstin);
    triggerDownload(`GSTR1_Table7_B2C_Small_${getFilenameSuffix()}.csv`, csv);
  };

  const exportGstr1Table12 = () => {
    const csv = generateGstr1Table12HsnCsv(filteredReceipts, filteredGuests, propertyGstin);
    triggerDownload(`GSTR1_Table12_HSN_SAC_${getFilenameSuffix()}.csv`, csv);
  };

  const exportGstr1Consolidated = () => {
    const csv = generateGstr1ConsolidatedWorkbook(filteredReceipts, filteredGuests, propertyGstin, propertyName);
    triggerDownload(`GSTR1_Consolidated_Tax_Workbook_${getFilenameSuffix()}.csv`, csv);
  };

  // ==========================================
  // 3. OPERATIONAL SPREADSHEETS (ENRICHED)
  // ==========================================

  // A. Comprehensive Bookings / Accommodations Spreadsheet
  const exportBookings = () => {
    const headers = [
      'Booking ID / Ref',
      'Guest Name',
      'Phone Number',
      'Email',
      'Room Number',
      'Booking Source',
      'Number of Guests',
      'Check-In Date',
      'Check-Out Date',
      'Stay Duration (Nights)',
      'Base Room Rent (INR)',
      'Food Bill (INR)',
      'Extra Charges (INR)',
      'Subtotal (INR)',
      'Discount (INR)',
      'GST Tax (INR)',
      'Total Bill (INR)',
      'Advance Paid (INR)',
      'Balance Due (INR)',
      'Payment Status',
      'Payment Method',
      'Guest GSTIN',
      'Billing Company Name',
      'ID Document Type',
      'ID Verification Status',
      'Vehicle Number',
      'Special Notes',
      'Is Foreign Guest',
      'C-Form Status',
      'C-Form Filing Time',
    ];

    const rows = filteredGuests.map((g) => {
      // Calculate stay duration
      let nights = 1;
      if (g.checkinDate && (g.checkoutDate || g.expectedCheckout)) {
        const inDate = new Date(g.checkinDate);
        const outDate = new Date(g.checkoutDate || g.expectedCheckout || '');
        if (!isNaN(inDate.getTime()) && !isNaN(outDate.getTime())) {
          const diffDays = Math.round((outDate.getTime() - inDate.getTime()) / (1000 * 3600 * 24));
          nights = Math.max(1, diffDays);
        }
      }

      const roomRent = Number(g.roomRate || 0);
      const foodBill = Number(g.foodBill || 0);
      const extraCharges = Array.isArray(g.extraCharges)
        ? g.extraCharges.reduce((sum, c) => sum + Number(c.amount || 0), 0)
        : 0;
      const subtotal = roomRent + foodBill + extraCharges;
      const discount = Number((g as any).discount || 0);
      const gstAmount = Number((g as any).gstAmount || (Number((g as any).cgstAmount || 0) + Number((g as any).sgstAmount || 0) + Number((g as any).igstAmount || 0)));
      const totalBill = Number(g.totalAmount || (subtotal - discount + gstAmount));
      const advancePaid = Number(g.advanceAmount || 0);
      const balanceDue = Math.max(0, totalBill - advancePaid);

      return [
        `"BK-${g.id}"`,
        `"${(g.guestName || '').replace(/"/g, '""')}"`,
        `"${g.phoneNumber || ''}"`,
        `"${(g as any).email || ''}"`,
        `"${g.roomNumber || ''}"`,
        `"${g.bookingSource || 'Direct'}"`,
        g.numberOfGuests || 1,
        `"${g.checkinDate || ''}"`,
        `"${g.checkoutDate || g.expectedCheckout || ''}"`,
        nights,
        roomRent.toFixed(2),
        foodBill.toFixed(2),
        extraCharges.toFixed(2),
        subtotal.toFixed(2),
        discount.toFixed(2),
        gstAmount.toFixed(2),
        totalBill.toFixed(2),
        advancePaid.toFixed(2),
        balanceDue.toFixed(2),
        `"${g.paymentStatus || 'Pending'}"`,
        `"${(g as any).paymentMode || (g as any).paymentMethod || 'UPI/Cash'}"`,
        `"${(g as any).guestGstin || ''}"`,
        `"${((g as any).guestBillingName || '').replace(/"/g, '""')}"`,
        `"${(g as any).idType || (g.isForeignGuest ? 'Passport' : 'Aadhaar / Gov ID')}"`,
        `"${g.idVerificationStatus || 'Pending'}"`,
        `"${(g as any).vehicleNumber || ''}"`,
        `"${(g.notes || '').replace(/"/g, '""')}"`,
        g.isForeignGuest ? 'Yes' : 'No',
        g.isForeignGuest ? (isCFormGenuinelyFiled(g) ? 'Filed' : 'Pending Filing') : 'N/A',
        `"${g.cFormFiledAt || ''}"`,
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(`Farm_Report_BOOKINGS_${getFilenameSuffix()}.csv`, csvContent);
  };

  // B. Kitchen Inventory & Valuation Workbook
  const exportKitchenExpenses = () => {
    const headers = [
      'Item ID',
      'Item Name',
      'Category',
      'Current Stock',
      'Min Threshold',
      'Unit',
      'Estimated Unit Cost (INR)',
      'Total Stock Valuation (INR)',
      'Stock Health Status',
    ];

    const rows = inventory.map((item) => {
      const unitCost = Number((item as any).unitCost || (item as any).price || 120);
      const stockVal = item.currentStock * unitCost;
      const status = item.currentStock <= 0 ? 'Out of Stock' : (item.currentStock <= item.minThreshold ? 'Low Stock' : 'In Stock');
      return [
        `"${item.id}"`,
        `"${item.name.replace(/"/g, '""')}"`,
        `"${item.category}"`,
        item.currentStock,
        item.minThreshold,
        `"${item.unit}"`,
        unitCost.toFixed(2),
        stockVal.toFixed(2),
        `"${status}"`,
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(`Farm_Report_KITCHEN_INVENTORY_${getFilenameSuffix()}.csv`, csvContent);
  };

  // C. Farm Maintenance & Upkeep Petty Cash Logs
  const exportFarmUpkeep = () => {
    const headers = [
      'Expense ID',
      'Date',
      'Time',
      'Category',
      'Subcategory / Item',
      'Description / Purpose',
      'Vendor / Payee',
      'Paid By / Cashier',
      'Payment Mode',
      'Transaction Type',
      'Amount (INR)',
      'Invoice Notes',
    ];

    const rows = filteredExpenses.map((exp) => [
      `"${exp.id}"`,
      `"${exp.date}"`,
      `"${exp.time || ''}"`,
      `"${exp.category || exp.costCategory || 'General'}"`,
      `"${exp.predefinedItemSelection || ''}"`,
      `"${(exp.description || '').replace(/"/g, '""')}"`,
      `"${(exp.vendor || '').replace(/"/g, '""')}"`,
      `"${exp.paidBy || ''}"`,
      `"${exp.paymentMode || 'Cash'}"`,
      `"${exp.type || 'Expense'}"`,
      Number(exp.amount || 0).toFixed(2),
      `"${(exp.moreInfoNotes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(`Farm_Report_PETTY_CASH_${getFilenameSuffix()}.csv`, csvContent);
  };

  // D. Payroll & Salaries Registry
  const exportSalaries = () => {
    const headers = [
      'Staff ID',
      'Staff Name',
      'Role / Designation',
      'Phone Number',
      'Monthly Salary (INR)',
      'Daily Wage (INR)',
      'Present Days',
      'Absent Days',
      'Half Days',
      'Leaves Logged',
      'Total Days Logged',
      'Employment Status',
    ];

    const rows = staff.map((s) => {
      const staffAtt = filteredAttendance.filter((a) => a.staffId === s.id);
      const present = staffAtt.filter((a) => a.status === 'Present').length;
      const absent = staffAtt.filter((a) => a.status === 'Absent').length;
      const halfDay = staffAtt.filter((a) => a.status === 'Half-Day').length;
      const leave = staffAtt.filter((a) => a.status === 'Leave').length;

      return [
        `"${s.id}"`,
        `"${s.name.replace(/"/g, '""')}"`,
        `"${s.role}"`,
        `"${s.phone || ''}"`,
        Number(s.monthlySalary || 0).toFixed(2),
        Number(s.dailyWage || 0).toFixed(2),
        present,
        absent,
        halfDay,
        leave,
        staffAtt.length,
        `"${s.status}"`,
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(`Farm_Report_PAYROLL_${getFilenameSuffix()}.csv`, csvContent);
  };

  // E. Master Financial Ledger
  const exportMasterLedger = () => {
    const headers = [
      'Date',
      'Transaction Type',
      'Financial Category',
      'Reference / Voucher No',
      'Description / Narration',
      'Party / Guest / Vendor',
      'Payment Mode',
      'Debit (Expense Out INR)',
      'Credit (Income In INR)',
      'Net Amount (INR)',
    ];

    const ledgerRows: string[][] = [];

    // 1. Advance Payments from Guests
    filteredGuests.forEach((g) => {
      if (Number(g.advanceAmount || 0) > 0) {
        ledgerRows.push([
          `"${g.checkinDate || ''}"`,
          '"Collection"',
          '"Room Rent (Advance)"',
          `"BK-${g.id}"`,
          `"Advance Collection for ${g.guestName} (${g.roomNumber})"`,
          `"${g.guestName}"`,
          `"${(g as any).paymentMode || 'UPI/Cash'}"`,
          '0.00',
          Number(g.advanceAmount).toFixed(2),
          Number(g.advanceAmount).toFixed(2),
        ]);
      }
    });

    // 2. Final Checkout Settlements
    filteredGuests.forEach((g) => {
      const isSettled = g.status === 'CheckedOut' || g.paymentStatus === 'Paid' || g.paymentStatus === 'Checked Out';
      const balance = Number(g.totalAmount || 0) - Number(g.advanceAmount || 0);
      if (isSettled && balance > 0) {
        ledgerRows.push([
          `"${g.checkoutDate || g.checkinDate || ''}"`,
          '"Collection"',
          '"Room & Food Settlement"',
          `"INV-${g.id}"`,
          `"Final Checkout Settlement for ${g.guestName} (${g.roomNumber})"`,
          `"${g.guestName}"`,
          `"${(g as any).paymentMode || 'Settled'}"`,
          '0.00',
          balance.toFixed(2),
          balance.toFixed(2),
        ]);
      }
    });

    // 3. Petty Cash Expenses
    filteredExpenses.forEach((e) => {
      if (e.type === 'Replenishment') return;
      const amt = Number(e.amount || 0);
      ledgerRows.push([
        `"${e.date}"`,
        '"Expense"',
        `"Petty Cash (${e.category || e.costCategory || 'General'})"`,
        `"PC-${e.id}"`,
        `"${(e.description || '').replace(/"/g, '""')}"`,
        `"${(e.vendor || e.paidBy || 'Cashier').replace(/"/g, '""')}"`,
        `"${e.paymentMode || 'Cash'}"`,
        amt.toFixed(2),
        '0.00',
        (-amt).toFixed(2),
      ]);
    });

    const csvContent = [headers.join(','), ...ledgerRows.map((r) => r.join(','))].join('\n');
    triggerDownload(`Farm_Report_MASTER_LEDGER_${getFilenameSuffix()}.csv`, csvContent);
  };

  // F. Full SQL Database Backup (Root Admin Only)
  const exportFullSqlBackup = () => {
    const _base = window.location.pathname.replace(/#.*$/, '').replace(/\/[^/]*$/, '');
    const timestamp = Date.now();
    const backupUrl = `${_base}/php/api/backup.php?t=${timestamp}`;

    const link = document.createElement('a');
    link.href = backupUrl;
    link.setAttribute('download', `Backup_${propertyName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.sql`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setDownloadSuccessMsg(`Downloaded database backup for ${propertyName}`);
    setTimeout(() => setDownloadSuccessMsg(null), 4000);
  };

  return (
    <div className="data-export-center space-y-6">
      <PageHeader
        title={t('data_export_center_title', 'Data Export & Tax Compliance Center')}
        subtitle={t('data_export_center_subtitle', 'Generate official Tally Prime XML vouchers, Government GSTR-1 CSV spreadsheets, and master operational auditing records.')}
      >
        {downloadSuccessMsg && (
          <Alert color="success" icon={CheckCircle2} className="py-2">
            <span>{downloadSuccessMsg}</span>
          </Alert>
        )}
      </PageHeader>

      {/* Timeframe Control Card */}
      <Card className="data-export-center__control-card border-gray-200 dark:border-gray-700 space-y-6">
        {/* Segment Tabs Selector */}
        <div className="data-export-center__tabs flex bg-slate-100 dark:bg-slate-900/60 p-1.5 rounded-lg max-w-md">
          <button
            onClick={() => setExportRangeType('month')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              exportRangeType === 'month'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            {t('single_month_tab', 'Single Month')}
          </button>
          <button
            onClick={() => setExportRangeType('year')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              exportRangeType === 'year'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            {t('whole_year_tab', 'Whole Year')}
          </button>
          <button
            onClick={() => setExportRangeType('custom')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              exportRangeType === 'custom'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            {t('custom_range_tab', 'Custom Range')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-dashed border-slate-200 dark:border-slate-700">
          {exportRangeType === 'month' && (
            <>
              <div>
                <label className="block text-[10px] font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
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
                <label className="block text-[10px] font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
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
              <label className="block text-[10px] font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
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
            <div className="md:col-span-2">
              <DateRangePicker
                label={t('custom_date_range_label', 'Custom Date Range')}
                checkinDate={customStartDate}
                checkoutDate={customEndDate}
                onCheckinChange={setCustomStartDate}
                onCheckoutChange={setCustomEndDate}
                fromPlaceholder={t('start_date_label', 'Start Date')}
                toPlaceholder={t('end_date_label', 'End Date')}
              />
            </div>
          )}
        </div>

        {/* SECTION 1: TALLY PRIME ACCOUNTING HUB */}
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-800">
              <FileCode className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t('tally_hub_title', 'Tally Prime Accounting Hub (XML Import)')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('tally_hub_description', 'Generate pre-formatted Tally.ERP 9 / Tally Prime XML files for instant voucher imports, eliminating manual bookkeeping.')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tally Sales XML */}
            <div className="flex flex-col justify-between p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-lg gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{t('tally_sales_export_title', 'Tally Sales Vouchers (XML)')}</span>
                </h3>
                <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                  {t('tally_sales_export_description', 'Exports room sales (SAC 996311) and food sales (SAC 996331) with output CGST/SGST/IGST allocations into Tally Sales vouchers.')}
                </p>
              </div>
              <Button
                variant="success"
                size="sm"
                onClick={exportTallySales}
                leftIcon={<Download className="w-4 h-4 shrink-0" />}
              >
                <span>{t('export_tally_sales_button', 'EXPORT SALES XML')}</span>
              </Button>
            </div>

            {/* Tally Payments XML */}
            <div className="flex flex-col justify-between p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-lg gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{t('tally_payments_export_title', 'Tally Expense & Payment Vouchers (XML)')}</span>
                </h3>
                <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                  {t('tally_payments_export_description', 'Exports petty cash and property cost logs grouped by accounting ledgers (Kitchen, Housekeeping, Salaries, Repairs, Utilities) into Tally Payment vouchers.')}
                </p>
              </div>
              <Button
                variant="success"
                size="sm"
                onClick={exportTallyPayments}
                leftIcon={<Download className="w-4 h-4 shrink-0" />}
              >
                <span>{t('export_tally_payments_button', 'EXPORT PAYMENTS XML')}</span>
              </Button>
            </div>
          </div>
        </div>

        {/* SECTION 2: GSTR-1 TAX COMPLIANCE CENTER */}
        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-800">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t('gstr1_center_title', 'GST Tax Compliance Center (GSTR-1 Ready)')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('gstr1_center_description', 'Export Government GST portal-ready CSV spreadsheets for monthly and quarterly GSTR-1 returns filing.')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Table 4 B2B */}
            <div className="flex flex-col justify-between p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60 rounded-lg gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-300 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>{t('gstr1_table4_title', 'GSTR-1 Table 4: B2B Invoices (CSV)')}</span>
                </h3>
                <p className="text-xs text-indigo-700/80 dark:text-indigo-400/80">
                  {t('gstr1_table4_description', 'Extracts taxable supplies made to registered business guests with recipient GSTIN, Place of Supply state codes, and rate breakdown.')}
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={exportGstr1Table4}
                leftIcon={<Download className="w-4 h-4 shrink-0" />}
              >
                <span>{t('export_gstr1_button', 'EXPORT TABLE 4 (B2B)')}</span>
              </Button>
            </div>

            {/* Table 7 B2C Small */}
            <div className="flex flex-col justify-between p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60 rounded-lg gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-300 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>{t('gstr1_table7_title', 'GSTR-1 Table 7: B2C Small Invoices (CSV)')}</span>
                </h3>
                <p className="text-xs text-indigo-700/80 dark:text-indigo-400/80">
                  {t('gstr1_table7_description', 'Aggregates taxable supplies made to unregistered retail guests grouped by Place of Supply state code and tax rate slabs.')}
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={exportGstr1Table7}
                leftIcon={<Download className="w-4 h-4 shrink-0" />}
              >
                <span>{t('export_gstr1_button', 'EXPORT TABLE 7 (B2C)')}</span>
              </Button>
            </div>

            {/* Table 12 HSN Summary */}
            <div className="flex flex-col justify-between p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60 rounded-lg gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-300 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>{t('gstr1_table12_title', 'GSTR-1 Table 12: HSN / SAC Summary (CSV)')}</span>
                </h3>
                <p className="text-xs text-indigo-700/80 dark:text-indigo-400/80">
                  {t('gstr1_table12_description', 'Compiles hospitality SAC codes 996311 (Accommodation) and 996331 (Restaurant Food) with total taxable values and tax totals.')}
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={exportGstr1Table12}
                leftIcon={<Download className="w-4 h-4 shrink-0" />}
              >
                <span>{t('export_gstr1_button', 'EXPORT TABLE 12 (HSN)')}</span>
              </Button>
            </div>

            {/* Consolidated Master GSTR-1 Workbook */}
            <div className="flex flex-col justify-between p-4 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/60 rounded-lg gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-300 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>{t('gstr1_master_title', 'GSTR-1 Consolidated Master Workbook (CSV)')}</span>
                </h3>
                <p className="text-xs text-purple-700/80 dark:text-purple-400/80">
                  {t('gstr1_master_description', 'Comprehensive tax audit workbook including Executive Tax Summary, B2B list, B2C summary, and Table 12 HSN splits.')}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={exportGstr1Consolidated}
                leftIcon={<Download className="w-4 h-4 shrink-0" />}
              >
                <span>{t('export_gstr1_button', 'EXPORT CONSOLIDATED GSTR-1')}</span>
              </Button>
            </div>
          </div>
        </div>

        {/* SECTION 3: OPERATIONAL & DEPARTMENTAL SPREADSHEETS */}
        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t('operational_reports_title', 'Operational & Departmental Spreadsheets')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('operational_reports_description', 'Itemized CSV workbooks for daily resort workflows, guest archives, storehouse inventory, and staff rosters.')}
            </p>
          </div>

          <div className="data-export-center__cards-list space-y-4">
            {/* Card 1: Bookings */}
            <div className="data-export-center__export-card flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg gap-4 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
              <div className="space-y-1">
                <h3 className="data-export-center__subtitle text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Hotel className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>{t('bookings_export_title', 'Accommodations Booking Spreadsheet')}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('bookings_export_description', 'Extracts comprehensive check-in logs, occupancy timelines, advance splits, food bills, GST, and total room collections.')}
                </p>
              </div>
              <Button
                variant="success"
                size="sm"
                onClick={exportBookings}
                leftIcon={<Download className="w-4 h-4 shrink-0" />}
              >
                <span>{t('export_sheets_button', 'EXPORT SHEETS')}</span>
              </Button>
            </div>

            {/* Card 2: Kitchen Inventory & Stock */}
            {kitchenModuleEnabled && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg gap-4 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                <div className="space-y-1">
                  <h3 className="data-export-center__subtitle text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>{t('kitchen_purchases_export_title', 'Kitchen Inventory & Stock Valuation Workbook')}</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('kitchen_purchases_export_description', 'Downloads inventory replenishment lists, raw ration tracking, volume unit weights, unit costs, and valuations.')}
                  </p>
                </div>
                <Button
                  variant="success"
                  size="sm"
                  onClick={exportKitchenExpenses}
                  leftIcon={<Download className="w-4 h-4 shrink-0" />}
                >
                  <span>{t('export_sheets_button', 'EXPORT SHEETS')}</span>
                </Button>
              </div>
            )}

            {/* Card 3: Farm Upkeep & Utilities */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg gap-4 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
              <div className="space-y-1">
                <h3 className="data-export-center__subtitle text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>{t('maintenance_utilities_export_title', 'Property Maintenance & Petty Cash Logs')}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('maintenance_utilities_export_description', 'Generates itemized expense spreadsheets for water tankers, electricity bills, hardware, and physical farm upkeep.')}
                </p>
              </div>
              <Button
                variant="success"
                size="sm"
                onClick={exportFarmUpkeep}
                leftIcon={<Download className="w-4 h-4 shrink-0" />}
              >
                <span>{t('export_sheets_button', 'EXPORT SHEETS')}</span>
              </Button>
            </div>

            {/* Card 4: Payroll & Salaries */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg gap-4 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
              <div className="space-y-1">
                <h3 className="data-export-center__subtitle text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>{t('payroll_salaries_export_title', 'Payroll, Salaries & Attendance Registry')}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('payroll_salaries_export_description', 'Compiles all recorded staff payouts, monthly base salaries, daily wages, attendance records (Present/Absent/Half-Days), and status.')}
                </p>
              </div>
              <Button
                variant="success"
                size="sm"
                onClick={exportSalaries}
                leftIcon={<Download className="w-4 h-4 shrink-0" />}
              >
                <span>{t('export_sheets_button', 'EXPORT SHEETS')}</span>
              </Button>
            </div>

            {/* Card 5: Master Ledger */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-lg gap-4 hover:border-sky-300 dark:hover:border-sky-700 transition-colors">
              <div className="space-y-1">
                <h3 className="data-export-center__subtitle text-sm font-semibold text-sky-900 dark:text-sky-300 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-700 dark:text-sky-400" />
                  <span>{t('master_ledger_export_title', 'Master Transaction Ledger')}</span>
                </h3>
                <p className="text-xs text-sky-700/80 dark:text-sky-400/80">
                  {t('master_ledger_export_description', 'The ultimate financial sheet compiling room rent advances, final settlements, food collections, supply purchases, and operational expenses.')}
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={exportMasterLedger}
                leftIcon={<Download className="w-4 h-4 shrink-0" />}
              >
                <span>{t('export_master_button', 'EXPORT MASTER')}</span>
              </Button>
            </div>

            {/* Card 6: SQL Snapshot Backup (Root Admin) */}
            {isRootAdmin && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg gap-4 mt-6 hover:border-rose-300 dark:hover:border-rose-700 transition-colors">
                <div className="space-y-1">
                  <h3 className="data-export-center__subtitle text-sm font-semibold text-rose-900 dark:text-rose-300 flex items-center gap-2">
                    <Database className="w-4 h-4 text-rose-700 dark:text-rose-400" />
                    <span>{t('snapshot_backup_export_title', 'Full System Snapshot Backup (Root Admin)')}</span>
                  </h3>
                  <p className="text-xs text-rose-700/80 dark:text-rose-400/80">
                    {t('snapshot_backup_export_description', 'Generates an instant raw SQL dump of the entire database — every tenant and property, not just this one.')}
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={exportFullSqlBackup}
                  leftIcon={<HardDriveDownload className="w-4 h-4 shrink-0" />}
                >
                  <span>{t('download_backup_button', 'DOWNLOAD BACKUP (.SQL)')}</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};
