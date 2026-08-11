import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  IndianRupee, 
  PieChart, 
  Utensils, 
  ShoppingBag, 
  Calendar, 
  Layers, 
  Filter,
  BedDouble
} from 'lucide-react';
import ReactApexChart from 'react-apexcharts';
import { BillingReceipt } from '../types';
import { fetchKitchenPurchasesFromDB, fetchFinancialLedger } from '../services/api';
import { useFinance } from '../contexts/FinanceContext';
import { useKitchenContext } from '../contexts/KitchenContext';
import { StyledSelect } from './StyledSelect';
import { Input } from './Input';
import { PageHeader } from './PageHeader';
import { t } from '../i18n/en';

interface AnalyticsRoom {
  id: number;
  name: string;
  is_active?: number;
}

interface AnalyticsDashboardProps {
  receipts: BillingReceipt[];
  guests?: any[];
  activeMenuItemKey?: string;
  kitchenModuleEnabled?: boolean;
  isMultiKeyProperty?: boolean;
  rooms?: AnalyticsRoom[];
}

type DateFilter = 'all' | 'day' | 'week' | 'month' | 'year';

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  receipts = [],
  guests = [],
  activeMenuItemKey,
  kitchenModuleEnabled = true,
  isMultiKeyProperty = false,
  rooms = [],
}) => {
  const { orders } = useKitchenContext();
  const { pettyCash } = useFinance();
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings' | 'food' | 'kitchen' | 'expenses' | 'profit_loss' | 'balance_sheet' | 'cash_flow'>(() => {
    return activeMenuItemKey === 'purchase_analytics' ? 'expenses' : 'overview';
  });

  // Properties with no food service have nothing to show on the Food POS /
  // Kitchen sub-tabs (kitchen orders + kitchen purchases are both blocked at
  // the API layer when the 'kitchen' module is off, so these would only ever
  // render empty states) — bounce back to Overview if the module gets
  // disabled while one of those tabs is active.
  useEffect(() => {
    if (!kitchenModuleEnabled && (activeTab === 'food' || activeTab === 'kitchen')) {
      setActiveTab('overview');
    }
  }, [kitchenModuleEnabled, activeTab]);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [kitchenPurchases, setKitchenPurchases] = useState<any[]>([]);
  const [ledgerData, setLedgerData] = useState<any[]>([]);
  const [ledgerMonth, setLedgerMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    fetchKitchenPurchasesFromDB().then((data) => {
      if (Array.isArray(data)) {
        setKitchenPurchases(data);
      }
    });
  }, []);

  useEffect(() => {
    if (activeMenuItemKey === 'purchase_analytics') setActiveTab('expenses');
    else if (activeMenuItemKey === 'dashboard_analytics') setActiveTab('overview');
  }, [activeMenuItemKey]);

  useEffect(() => {
    if (['profit_loss', 'balance_sheet', 'cash_flow'].includes(activeTab)) {
      fetchFinancialLedger(ledgerMonth).then(setLedgerData);
    }
  }, [activeTab, ledgerMonth]);

  const now = new Date();
  const getDateBounds = () => {
    const end = new Date(now);
    let start = new Date(now);
    if (dateFilter === 'day') {
      start.setHours(0, 0, 0, 0);
    } else if (dateFilter === 'week') {
      const day = start.getDay();
      start.setDate(start.getDate() - day);
      start.setHours(0, 0, 0, 0);
    } else if (dateFilter === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    } else if (dateFilter === 'year') {
      start = new Date(now.getFullYear(), 0, 1);
    } else {
      return null;
    }
    return { start, end };
  };

  const filterByDate = <T extends { date?: string; checkinDate?: string; orderTime?: string }>(items: T[], field: 'date' | 'checkinDate' | 'orderTime' = 'date'): T[] => {
    const bounds = getDateBounds();
    if (!bounds) return items;
    return items.filter((item) => {
      const raw = item[field];
      if (!raw) return false;
      const d = new Date(raw);
      return d >= bounds.start && d <= bounds.end;
    });
  };

  const filteredReceipts = filterByDate(receipts, 'checkinDate');
  const filteredOrders = filterByDate(orders, 'orderTime');
  const filteredExpenses = filterByDate(pettyCash, 'date');
  const filteredKitchenPurchases = filterByDate(kitchenPurchases, 'date');

  const roomRevenue = filteredReceipts.reduce((sum, r) => sum + (r.roomTotal || 0), 0);
  const kitchenRevenue = filteredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const totalOutflowExpenses = filteredExpenses
    .filter((e) => e.type === 'Expense')
    .reduce((sum, e) => sum + (e.amount || 0), 0);
  // get_kitchen_purchases (php/inventory/inventory.php) returns total_price as
  // totalPrice - this was reading totalCost/amount, neither of which exist on
  // the response, so kitchen purchase cost (and Kitchen Net Profit, which
  // subtracts it) was always 0 regardless of how much was actually spent.
  // Also wrapped in Number() - decimal columns come through PDO as strings,
  // so `sum + p.totalPrice` was silently doing string concatenation once the
  // field name was fixed, not addition.
  const totalKitchenPurchaseCost = filteredKitchenPurchases.reduce((sum, p: any) => sum + (Number(p.totalPrice) || 0), 0);

  const totalGrossRevenue = roomRevenue + kitchenRevenue;
  const netOperatingMargin = totalGrossRevenue - totalOutflowExpenses;
  const kitchenNetProfit = kitchenRevenue - totalKitchenPurchaseCost;

  const menuItemSales = filteredOrders.reduce((acc, order) => {
    if (order.items && Array.isArray(order.items)) {
      order.items.forEach(item => {
        const name = item.name || 'Item';
        if (!acc[name]) {
          acc[name] = { count: 0, revenue: 0 };
        }
        acc[name].count += (item.quantity || 1);
        acc[name].revenue += (item.unitPrice || 0) * (item.quantity || 1);
      });
    }
    return acc;
  }, {} as Record<string, { count: number; revenue: number }>);

  const sortedMenuItems = Object.entries(menuItemSales)
    .sort((a, b) => b[1].revenue - a[1].revenue);

  const bookingsByMonth = filteredReceipts.reduce((acc, r) => {
    const date = new Date(r.checkinDate);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[key]) {
      acc[key] = { bookings: 0, revenue: 0, guests: 0 };
    }
    acc[key].bookings += 1;
    acc[key].revenue += r.roomTotal || 0;
    const guest = guests.find((g: any) => g.id === r.guestId);
    acc[key].guests += guest?.numberOfGuests || 1;
    return acc;
  }, {} as Record<string, { bookings: number; revenue: number; guests: number }>);

  const sortedBookingsByMonth = Object.entries(bookingsByMonth).sort((a, b) => a[0].localeCompare(b[0]));

  // Room-by-room comparison (multi-key properties only) — how each sub-key
  // room is performing against its siblings under the same parent property.
  const activeRooms = rooms.filter((r) => r.is_active !== 0);
  const periodDays = (() => {
    const bounds = getDateBounds();
    if (!bounds) return null;
    return Math.max(1, Math.ceil((bounds.end.getTime() - bounds.start.getTime()) / (1000 * 60 * 60 * 24)));
  })();

  const roomPerformance = activeRooms.map((room) => {
    const roomReceipts = filteredReceipts.filter((r) => r.roomNumber === room.name);
    const revenue = roomReceipts.reduce((sum, r) => sum + (r.grandTotal || r.roomTotal || 0), 0);
    const bookedNights = roomReceipts.reduce((sum, r) => sum + (r.nightsCount || 1), 0);
    const occupancyRate = periodDays ? Math.min(100, (bookedNights / periodDays) * 100) : null;
    return { name: room.name, revenue, bookings: roomReceipts.length, bookedNights, occupancyRate };
  }).sort((a, b) => b.revenue - a.revenue);

  const roomRevenueBarOptions: any = {
    chart: { type: 'bar', height: 320, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    plotOptions: { bar: { borderRadius: 8, columnWidth: '50%' } },
    colors: ['#2563eb'],
    xaxis: { categories: roomPerformance.map((r) => r.name) },
    grid: { strokeDashArray: 4 },
    dataLabels: { enabled: false },
    legend: { show: false },
  };

  const roomRevenueBarSeries = [
    { name: 'Revenue', data: roomPerformance.map((r) => r.revenue) }
  ];

  const expenseItems = filteredExpenses
    .filter((e) => e.type === 'Expense')
    .reduce((acc, e) => {
      const name = e.description || e.predefinedItemSelection || 'Other Expense';
      const cat = e.costCategory || e.category || 'General';
      if (!acc[name]) {
        acc[name] = { count: 0, category: cat, totalCost: 0 };
      }
      acc[name].count += 1;
      acc[name].totalCost += Number(e.amount) || 0;
      return acc;
    }, {} as Record<string, { count: number; category: string; totalCost: number }>);

  const sortedExpenseItems = Object.entries(expenseItems)
    .sort((a, b) => b[1].totalCost - a[1].totalCost);

  const brandColor = '#2563eb';
  const brandSecondary = '#0ea5e9';
  const successColor = '#10b981';
  const dangerColor = '#ef4444';
  const warningColor = '#f59e0b';

  const overviewPieOptions: any = {
    chart: { type: 'donut', height: 320, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    labels: kitchenModuleEnabled ? ['Room Revenue', 'Kitchen Revenue', 'Expenses'] : ['Room Revenue', 'Expenses'],
    colors: kitchenModuleEnabled ? [brandColor, brandSecondary, dangerColor] : [brandColor, dangerColor],
    plotOptions: { pie: { donut: { size: '70%', labels: { show: true, total: { show: true, label: 'Total' } } } } },
    dataLabels: { enabled: false },
    legend: { position: 'bottom' },
    stroke: { show: false },
  };

  const overviewPieSeries = kitchenModuleEnabled
    ? [roomRevenue || 0, kitchenRevenue || 0, totalOutflowExpenses || 0]
    : [roomRevenue || 0, totalOutflowExpenses || 0];

  const bookingsBarOptions: any = {
    chart: { type: 'bar', height: 320, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    plotOptions: { bar: { borderRadius: 8, columnWidth: '50%' } },
    colors: [brandColor, successColor],
    xaxis: { categories: sortedBookingsByMonth.map(([month]) => month) },
    grid: { strokeDashArray: 4 },
    dataLabels: { enabled: false },
    legend: { show: false },
  };

  const bookingsBarSeries = [
    { name: 'Revenue', data: sortedBookingsByMonth.map(([, data]) => data.revenue) }
  ];

  const bookingsGuestOptions: any = {
    chart: { type: 'line', height: 320, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    stroke: { width: 3, curve: 'smooth' },
    colors: [warningColor],
    xaxis: { categories: sortedBookingsByMonth.map(([month]) => month) },
    grid: { strokeDashArray: 4 },
    dataLabels: { enabled: false },
    legend: { show: false },
  };

  const bookingsGuestSeries = [
    { name: 'Guests', data: sortedBookingsByMonth.map(([, data]) => data.guests) }
  ];

  const foodBarOptions: any = {
    chart: { type: 'bar', height: 360, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    plotOptions: { bar: { borderRadius: 6, columnWidth: '60%' } },
    colors: [brandSecondary],
    xaxis: { categories: sortedMenuItems.slice(0, 10).map(([name]) => name) },
    grid: { strokeDashArray: 4 },
    dataLabels: { enabled: false },
    legend: { show: false },
  };

  const foodBarSeries = [
    { name: 'Revenue', data: sortedMenuItems.slice(0, 10).map(([, data]) => data.revenue) }
  ];

  const kitchenBarOptions: any = {
    chart: { type: 'bar', height: 320, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    plotOptions: { bar: { borderRadius: 8, columnWidth: '50%' } },
    colors: [successColor, warningColor],
    xaxis: { categories: ['Kitchen Sales', 'Kitchen Purchases'] },
    grid: { strokeDashArray: 4 },
    dataLabels: { enabled: false },
    legend: { show: false },
  };

  const kitchenBarSeries = [
    { name: 'Amount', data: [kitchenRevenue || 0, totalKitchenPurchaseCost || 0] }
  ];

  const expensesBarOptions: any = {
    chart: { type: 'bar', height: 360, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    plotOptions: { bar: { borderRadius: 6, columnWidth: '60%' } },
    colors: [dangerColor],
    xaxis: { categories: sortedExpenseItems.slice(0, 15).map(([name]) => name) },
    grid: { strokeDashArray: 4 },
    dataLabels: { enabled: false },
    legend: { show: false },
  };

  const expensesBarSeries = [
    { name: 'Total Cost', data: sortedExpenseItems.slice(0, 15).map(([, data]) => data.totalCost) }
  ];

  const dateFilterOptions: { label: string; value: DateFilter }[] = [
    { label: t('date_filter_all_time', 'All Time'), value: 'all' },
    { label: t('date_filter_today', 'Today'), value: 'day' },
    { label: t('date_filter_this_week', 'This Week'), value: 'week' },
    { label: t('date_filter_this_month', 'This Month'), value: 'month' },
    { label: t('date_filter_this_year', 'This Year'), value: 'year' },
  ];

  return (
    <div className="analytics-dashboard-container space-y-6 text-xs text-slate-800 dark:text-slate-200">
      <PageHeader
        title={t('bi_analytics_dashboard_heading', 'Business Intelligence (BI) Analytics Dashboard')}
        subtitle={t('bi_analytics_dashboard_subtitle', 'Real-time multi-dimensional financial reports, revenue streams, operational expenses, and procurement price analytics.')}
      >
        <Filter className="w-4 h-4 text-slate-500" />
        <StyledSelect
          value={dateFilter}
          onChange={(value) => setDateFilter(value as DateFilter)}
          options={dateFilterOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
        />
      </PageHeader>

      {/* Summary KPI Cards (Always Visible) */}
      <div className={`analytics-kpi-grid grid grid-cols-1 sm:grid-cols-2 ${kitchenModuleEnabled ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
        <div className="analytics-kpi-card bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('gross_total_revenue_kpi', 'Gross Total Revenue')}</p>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 flex items-center">
            <IndianRupee className="w-5 h-5 text-emerald-600" />
            {totalGrossRevenue.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-emerald-600 font-semibold mt-1">
            {kitchenModuleEnabled ? t('room_plus_kitchen_revenue_subtext', 'Room Accommodations + Kitchen Orders') : t('room_only_revenue_subtext', 'Room Accommodations')}
          </p>
        </div>

        <div className="analytics-kpi-card bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('room_accommodations_kpi', 'Room Accommodations')}</p>
          <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1 flex items-center">
            <IndianRupee className="w-4 h-4 text-blue-600" />
            {roomRevenue.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">{filteredReceipts.length} {t('settled_billing_receipts_count', 'Settled Billing Receipts')}</p>
        </div>

        {kitchenModuleEnabled && (
          <div className="analytics-kpi-card bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('kitchen_pos_sales_kpi', 'Kitchen POS Sales')}</p>
            <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1 flex items-center">
              <IndianRupee className="w-4 h-4 text-cyan-600" />
              {kitchenRevenue.toLocaleString('en-IN')}
            </p>
            <p className="text-[10px] text-cyan-600 font-semibold mt-1">{filteredOrders.length} {t('kitchen_orders_count', 'Kitchen Orders')}</p>
          </div>
        )}

        <div className="analytics-kpi-card bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('net_operating_margin_kpi', 'Net Operating Margin')}</p>
          <p className={`text-xl font-extrabold mt-1 flex items-center ${netOperatingMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            <IndianRupee className="w-4 h-4" />
            {netOperatingMargin.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-slate-500 font-semibold mt-1">{t('gross_revenue_minus_outflows_subtext', 'Gross Revenue - Utility Outflows')}</p>
        </div>
      </div>

      {/* Dynamic Navigation Tabs */}
      <div className="analytics-tab-bar flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl gap-1 flex-wrap">
        <button
          onClick={() => setActiveTab('overview')}
          className={`btn-analytics-tab-overview px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'overview'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>{t('overview_tab_label', 'Overview')}</span>
        </button>
        <button
          onClick={() => setActiveTab('bookings')}
          className={`btn-analytics-tab-bookings px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'bookings'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>{t('bookings_tab_label', 'Bookings')}</span>
        </button>
        {kitchenModuleEnabled && (
          <button
            onClick={() => setActiveTab('food')}
            className={`btn-analytics-tab-food px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'food'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Utensils className="w-4 h-4" />
            <span>{t('food_pos_tab_label', 'Food POS')}</span>
          </button>
        )}
        {kitchenModuleEnabled && (
          <button
            onClick={() => setActiveTab('kitchen')}
            className={`btn-analytics-tab-kitchen px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'kitchen'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Utensils className="w-4 h-4" />
            <span>{t('kitchen_tab_label', 'Kitchen')}</span>
          </button>
        )}
        <button
          onClick={() => setActiveTab('expenses')}
          className={`btn-analytics-tab-purchases px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'expenses'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>{t('expenses_tab_label', 'Expenses')}</span>
        </button>
        <button
          onClick={() => setActiveTab('profit_loss')}
          className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'profit_loss'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>{t('pnl_tab_label', 'P&L')}</span>
        </button>
        <button
          onClick={() => setActiveTab('balance_sheet')}
          className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'balance_sheet'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <PieChart className="w-4 h-4" />
          <span>{t('balance_sheet_tab_label', 'Balance Sheet')}</span>
        </button>
        <button
          onClick={() => setActiveTab('cash_flow')}
          className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'cash_flow'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <IndianRupee className="w-4 h-4" />
          <span>{t('cash_flow_tab_label', 'Cash Flow')}</span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <PieChart className="w-4 h-4 text-blue-600" /> {t('operational_financial_breakdown_heading', 'Operational Financial Breakdown & Margin Analysis')}
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <ReactApexChart options={overviewPieOptions} series={overviewPieSeries} type="donut" height={320} />
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200 mb-1">
                    <span>{t('room_lodging_revenue_label', 'Room Lodging Revenue')}</span>
                    <span className="font-extrabold">₹{roomRevenue.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-500"
                      style={{ width: `${totalGrossRevenue > 0 ? (roomRevenue / totalGrossRevenue) * 100 : 50}%` }}
                    />
                  </div>
                </div>

                {kitchenModuleEnabled && (
                  <div>
                    <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200 mb-1">
                      <span>{t('kitchen_dining_pos_revenue_label', 'Kitchen & Dining POS Revenue')}</span>
                      <span className="font-extrabold">₹{kitchenRevenue.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                        style={{ width: `${totalGrossRevenue > 0 ? (kitchenRevenue / totalGrossRevenue) * 100 : 50}%` }}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200 mb-1">
                    <span>{t('operational_outflow_expenses_label', 'Operational Outflow Expenses (Salaries, Bills, Other)')}</span>
                    <span className="font-extrabold text-red-600">₹{totalOutflowExpenses.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full transition-all duration-500"
                      style={{ width: `${totalGrossRevenue > 0 ? Math.min(100, (totalOutflowExpenses / totalGrossRevenue) * 100) : 30}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BOOKINGS */}
      {activeTab === 'bookings' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <span>{t('monthly_bookings_revenue_guests_heading', 'Monthly Bookings, Revenue & Guest Count')}</span>
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="font-bold text-slate-700 mb-2">{t('monthly_revenue_label', 'Monthly Revenue')}</p>
                <ReactApexChart options={bookingsBarOptions} series={bookingsBarSeries} type="bar" height={320} />
              </div>

              <div>
                <p className="font-bold text-slate-700 mb-2">{t('monthly_guest_count_label', 'Monthly Guest Count')}</p>
                <ReactApexChart options={bookingsGuestOptions} series={bookingsGuestSeries} type="line" height={320} />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="datatable w-full text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-900 font-bold border-b border-slate-200 dark:border-slate-700 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">{t('month_column', 'Month')}</th>
                    <th className="p-3 text-center">{t('bookings_column', 'Bookings')}</th>
                    <th className="p-3 text-right">{t('revenue_rupees_column', 'Revenue (₹)')}</th>
                    <th className="p-3 text-center">{t('guests_column', 'Guests')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {sortedBookingsByMonth.map(([month, data]) => (
                    <tr key={month} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="p-3 font-bold text-slate-900 dark:text-white">{month}</td>
                      <td className="p-3 text-center font-semibold text-blue-600">{data.bookings}</td>
                      <td className="p-3 text-right font-extrabold text-emerald-600">₹{data.revenue.toLocaleString('en-IN')}</td>
                      <td className="p-3 text-center font-semibold text-amber-600">{data.guests}</td>
                    </tr>
                  ))}
                  {sortedBookingsByMonth.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center p-6 text-slate-400">
                        {t('no_bookings_recorded_message', 'No bookings recorded for the selected period.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {isMultiKeyProperty && activeRooms.length > 0 && (
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <BedDouble className="w-4 h-4 text-blue-600" /> {t('room_by_room_performance_heading', 'Room-by-Room Performance Comparison')}
              </h3>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <ReactApexChart options={roomRevenueBarOptions} series={roomRevenueBarSeries} type="bar" height={320} />
                </div>

                <div className="overflow-x-auto">
                  <table className="datatable w-full text-left border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-900 font-bold border-b border-slate-200 dark:border-slate-700 uppercase text-[10px]">
                      <tr>
                        <th className="p-3">{t('room_column', 'Room')}</th>
                        <th className="p-3 text-center">{t('bookings_column', 'Bookings')}</th>
                        <th className="p-3 text-right">{t('revenue_rupees_column', 'Revenue (₹)')}</th>
                        <th className="p-3 text-right">{t('occupancy_column', 'Occupancy')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {roomPerformance.map((room) => (
                        <tr key={room.name} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <td className="p-3 font-bold text-slate-900 dark:text-white">{room.name}</td>
                          <td className="p-3 text-center font-semibold text-blue-600">{room.bookings}</td>
                          <td className="p-3 text-right font-extrabold text-emerald-600">₹{room.revenue.toLocaleString('en-IN')}</td>
                          <td className="p-3 text-right font-semibold text-amber-600">
                            {room.occupancyRate === null ? '—' : `${room.occupancyRate.toFixed(0)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {periodDays === null && (
                    <p className="text-[10px] text-slate-400 mt-2">{t('occupancy_needs_date_range_help', 'Occupancy % needs a specific date range — pick Today, Week, Month, or Year above to see it.')}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: FOOD POS */}
      {activeTab === 'food' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <span>{t('food_menu_performance_heading', 'Food Menu Performance & Most Popular Dish Analytics')}</span>
            </h3>

            <div className="grid grid-cols-1 gap-6">
              <div>
                <ReactApexChart options={foodBarOptions} series={foodBarSeries} type="bar" height={360} />
              </div>

              <div className="overflow-x-auto">
                <table className="datatable w-full text-left border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-900 font-bold border-b border-slate-200 dark:border-slate-700 uppercase text-[10px]">
                    <tr>
                      <th className="p-3">{t('rank_column', 'Rank')}</th>
                      <th className="p-3">{t('menu_item_name_column', 'Menu Item Name')}</th>
                      <th className="p-3 text-center">{t('total_quantity_sold_column', 'Total Quantity Sold')}</th>
                      <th className="p-3 text-right">{t('total_generated_revenue_column', 'Total Generated Revenue')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {sortedMenuItems.slice(0, 10).map(([itemName, data], index) => (
                      <tr key={itemName} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="p-3 font-bold text-slate-400">#{index + 1}</td>
                        <td className="p-3 font-bold text-slate-900 dark:text-white">{itemName}</td>
                        <td className="p-3 text-center font-semibold text-blue-600">{data.count} {t('orders_count_suffix', 'orders')}</td>
                        <td className="p-3 text-right font-extrabold text-emerald-600">₹{data.revenue.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                    {sortedMenuItems.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center p-6 text-slate-400">
                          {t('no_food_orders_message', 'No food orders recorded yet.')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: KITCHEN */}
      {activeTab === 'kitchen' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <span>{t('kitchen_sales_purchases_profit_heading', 'Kitchen Sales, Purchases & Net Profit')}</span>
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <ReactApexChart options={kitchenBarOptions} series={kitchenBarSeries} type="bar" height={320} />
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800">
                  <p className="text-xs text-emerald-800 dark:text-emerald-300 font-bold uppercase">{t('kitchen_pos_sales_income_label', 'Kitchen POS Sales Income')}</p>
                  <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">₹{kitchenRevenue.toLocaleString('en-IN')}</p>
                  <p className="text-[10px] text-emerald-600 mt-1">{t('from_guest_dining_orders_subtext', 'From guest dining orders')}</p>
                </div>

                <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-amber-800 dark:text-amber-300 font-bold uppercase">{t('kitchen_purchase_outflows_label', 'Kitchen Purchase Outflows')}</p>
                  <p className="text-2xl font-extrabold text-amber-700 dark:text-amber-400 mt-1">₹{totalKitchenPurchaseCost.toLocaleString('en-IN')}</p>
                  <p className="text-[10px] text-amber-600 mt-1">{t('groceries_gas_supplies_subtext', 'Groceries, gas, and supplies spend')}</p>
                </div>

                <div className={`p-4 rounded-xl border ${kitchenNetProfit >= 0 ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'}`}>
                  <p className={`text-xs font-bold uppercase ${kitchenNetProfit >= 0 ? 'text-blue-800 dark:text-blue-300' : 'text-red-800 dark:text-red-300'}`}>{t('kitchen_net_profit_label', 'Kitchen Net Profit')}</p>
                  <p className={`text-2xl font-extrabold mt-1 ${kitchenNetProfit >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-red-700 dark:text-red-400'}`}>
                    ₹{kitchenNetProfit.toLocaleString('en-IN')}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">{t('kitchen_sales_minus_purchases_subtext', 'Kitchen Sales - Kitchen Purchases')}</p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="datatable w-full text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-900 font-bold border-b border-slate-200 dark:border-slate-700 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">{t('dish_name_column', 'Dish Name')}</th>
                    <th className="p-3 text-center">{t('times_ordered_column', 'Times Ordered')}</th>
                    <th className="p-3 text-right">{t('total_revenue_rupees_column', 'Total Revenue (₹)')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {sortedMenuItems.slice(0, 10).map(([itemName, data]) => (
                    <tr key={itemName} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="p-3 font-bold text-slate-900 dark:text-white">{itemName}</td>
                      <td className="p-3 text-center font-semibold text-blue-600">{data.count}</td>
                      <td className="p-3 text-right font-extrabold text-emerald-600">₹{data.revenue.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                  {sortedMenuItems.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center p-6 text-slate-400">
                        {t('no_kitchen_orders_message', 'No kitchen orders recorded yet.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: EXPENSES */}
      {activeTab === 'expenses' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              {t('expense_items_cost_breakdown_heading', '🛒 Expense Items - Total Cost Breakdown')}
            </h3>

            <div className="grid grid-cols-1 gap-6">
              <div>
                <ReactApexChart options={expensesBarOptions} series={expensesBarSeries} type="bar" height={360} />
              </div>

              <div className="overflow-x-auto">
                <table className="datatable w-full text-left border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-900 font-bold border-b border-slate-200 dark:border-slate-700 uppercase text-[10px]">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">{t('item_description_column', 'Item Description')}</th>
                      <th className="p-3 text-center">{t('category_column', 'Category')}</th>
                      <th className="p-3 text-right">{t('total_cost_rupees_column', 'Total Cost (₹)')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {sortedExpenseItems.map(([name, data], idx) => {
                      const itemData = data as { count: number; category: string; totalCost: number };
                      return (
                        <tr key={name} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <td className="p-3 font-mono text-slate-400 text-[10px]">{idx + 1}</td>
                          <td className="p-3 font-bold text-slate-900 dark:text-white">{name}</td>
                          <td className="p-3 text-center font-semibold text-blue-600">{itemData.category}</td>
                          <td className="p-3 text-right font-extrabold text-red-600">₹{itemData.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      );
                    })}
                    {sortedExpenseItems.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center p-6 text-slate-400">
                          {t('no_expenses_recorded_message', 'No expenses recorded for the selected period.')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: PROFIT & LOSS */}
      {activeTab === 'profit_loss' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600" /> {t('profit_loss_statement_heading', 'Profit & Loss Statement')}
              </h3>
              <Input
                type="month"
                value={ledgerMonth}
                onChange={(e) => setLedgerMonth(e.target.value)}
                fullWidth={false}
              />
            </div>

            {(() => {
              const income = ledgerData.filter((l) => l.direction === 'credit').reduce((s, l) => s + Number(l.amount || 0), 0);
              const expensesPL = ledgerData.filter((l) => l.direction === 'debit').reduce((s, l) => s + Number(l.amount || 0), 0);
              const netPL = income - expensesPL;
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800">
                      <p className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase">{t('total_income_label', 'Total Income')}</p>
                      <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">₹{income.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800">
                      <p className="text-[10px] font-bold text-red-800 dark:text-red-300 uppercase">{t('total_expenses_label', 'Total Expenses')}</p>
                      <p className="text-xl font-extrabold text-red-700 dark:text-red-400 mt-1">₹{expensesPL.toLocaleString('en-IN')}</p>
                    </div>
                    <div className={`p-4 rounded-xl border ${netPL >= 0 ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' : 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'}`}>
                      <p className={`text-[10px] font-bold uppercase ${netPL >= 0 ? 'text-blue-800 dark:text-blue-300' : 'text-orange-800 dark:text-orange-300'}`}>Net {netPL >= 0 ? t('net_profit_label', 'Net Profit') : t('net_loss_label', 'Loss')}</p>
                      <p className={`text-xl font-extrabold mt-1 ${netPL >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-orange-700 dark:text-orange-400'}`}>₹{Math.abs(netPL).toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                          <th className="p-2 font-bold text-slate-600 dark:text-slate-400">{t('category_column', 'Category')}</th>
                          <th className="p-2 font-bold text-slate-600 dark:text-slate-400 text-right">{t('amount_rupees_column', 'Amount (₹)')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {ledgerData.map((l, i) => (
                          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                            <td className="p-2 text-slate-800 dark:text-slate-200">{l.description || l.category}</td>
                            <td className={`p-2 font-mono font-bold text-right ${l.direction === 'credit' ? 'text-emerald-600' : 'text-red-600'}`}>
                              {l.direction === 'credit' ? '+' : '-'}₹{Number(l.amount || 0).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        ))}
                        {ledgerData.length === 0 && (
                          <tr><td colSpan={2} className="p-6 text-center text-slate-400">{t('no_ledger_entries_message', 'No ledger entries for this month.')}</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* TAB 7: BALANCE SHEET */}
      {activeTab === 'balance_sheet' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-600" /> {t('balance_sheet_heading', 'Balance Sheet')}
              </h3>
              <Input
                type="month"
                value={ledgerMonth}
                onChange={(e) => setLedgerMonth(e.target.value)}
                fullWidth={false}
              />
            </div>

            {(() => {
              const totalAssets = ledgerData.filter((l) => l.direction === 'credit').reduce((s, l) => s + Number(l.amount || 0), 0);
              const totalLiabilities = ledgerData.filter((l) => l.direction === 'debit').reduce((s, l) => s + Number(l.amount || 0), 0);
              const equity = totalAssets - totalLiabilities;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800">
                    <p className="text-[10px] font-bold text-blue-800 dark:text-blue-300 uppercase">{t('total_assets_label', 'Total Assets')}</p>
                    <p className="text-xl font-extrabold text-blue-700 dark:text-blue-400 mt-1">₹{totalAssets.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800">
                    <p className="text-[10px] font-bold text-red-800 dark:text-red-300 uppercase">{t('total_liabilities_label', 'Total Liabilities')}</p>
                    <p className="text-xl font-extrabold text-red-700 dark:text-red-400 mt-1">₹{totalLiabilities.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800">
                    <p className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase">{t('equity_label', 'Equity')}</p>
                    <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">₹{equity.toLocaleString('en-IN')}</p>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* TAB 8: CASH FLOW */}
      {activeTab === 'cash_flow' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-600" /> {t('cash_flow_statement_heading', 'Cash Flow Statement')}
              </h3>
              <Input
                type="month"
                value={ledgerMonth}
                onChange={(e) => setLedgerMonth(e.target.value)}
                fullWidth={false}
              />
            </div>

            {(() => {
              const cashIn = ledgerData.filter((l) => l.direction === 'credit').reduce((s, l) => s + Number(l.amount || 0), 0);
              const cashOut = ledgerData.filter((l) => l.direction === 'debit').reduce((s, l) => s + Number(l.amount || 0), 0);
              const netCash = cashIn - cashOut;
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800">
                      <p className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase">{t('cash_inflow_label', 'Cash Inflow')}</p>
                      <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">₹{cashIn.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800">
                      <p className="text-[10px] font-bold text-red-800 dark:text-red-300 uppercase">{t('cash_outflow_label', 'Cash Outflow')}</p>
                      <p className="text-xl font-extrabold text-red-700 dark:text-red-400 mt-1">₹{cashOut.toLocaleString('en-IN')}</p>
                    </div>
                    <div className={`p-4 rounded-xl border ${netCash >= 0 ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' : 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'}`}>
                      <p className={`text-[10px] font-bold uppercase ${netCash >= 0 ? 'text-blue-800 dark:text-blue-300' : 'text-orange-800 dark:text-orange-300'}`}>{t('net_cash_flow_label', 'Net Cash Flow')}</p>
                      <p className={`text-xl font-extrabold mt-1 ${netCash >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-orange-700 dark:text-orange-400'}`}>{netCash >= 0 ? '+' : '-'}₹{Math.abs(netCash).toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                          <th className="p-2 font-bold text-slate-600 dark:text-slate-400">{t('entry_column', 'Entry')}</th>
                          <th className="p-2 font-bold text-slate-600 dark:text-slate-400 text-right">{t('amount_rupees_column', 'Amount (₹)')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {ledgerData.map((l, i) => (
                          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                            <td className="p-2 text-slate-800 dark:text-slate-200">{l.description || l.category}</td>
                            <td className={`p-2 font-mono font-bold text-right ${l.direction === 'credit' ? 'text-emerald-600' : 'text-red-600'}`}>
                              {l.direction === 'credit' ? '+' : '-'}₹{Number(l.amount || 0).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        ))}
                        {ledgerData.length === 0 && (
                          <tr><td colSpan={2} className="p-6 text-center text-slate-400">{t('no_ledger_entries_message', 'No ledger entries for this month.')}</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
