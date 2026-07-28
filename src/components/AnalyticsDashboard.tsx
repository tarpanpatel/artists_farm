import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  IndianRupee, 
  PieChart, 
  Users, 
  Utensils, 
  ShoppingBag, 
  Calendar, 
  DollarSign, 
  Layers, 
  Tag,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import ReactApexChart from 'react-apexcharts';
import { BillingReceipt, Order, PettyCashEntry } from '../types';
import { fetchExpenseItemPricesFromDB, fetchKitchenPurchasesFromDB } from '../services/api';

interface AnalyticsDashboardProps {
  receipts: BillingReceipt[];
  orders: Order[];
  expenses: PettyCashEntry[];
  guests?: any[];
  activeMenuItemKey?: string;
}

type DateFilter = 'all' | 'day' | 'week' | 'month' | 'year';

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  receipts = [],
  orders = [],
  expenses = [],
  guests = [],
  activeMenuItemKey,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings' | 'food' | 'kitchen' | 'expenses'>(() => {
    return activeMenuItemKey === 'purchase_analytics' ? 'expenses' : 'overview';
  });
  const [itemPrices, setItemPrices] = useState<Record<string, number>>({});
  const [priceSearch, setPriceSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [kitchenPurchases, setKitchenPurchases] = useState<any[]>([]);

  useEffect(() => {
    fetchExpenseItemPricesFromDB().then((prices) => {
      if (prices && Object.keys(prices).length > 0) {
        setItemPrices(prices);
      }
    });
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
  const filteredExpenses = filterByDate(expenses, 'date');
  const filteredKitchenPurchases = filterByDate(kitchenPurchases, 'date');

  const roomRevenue = filteredReceipts.reduce((sum, r) => sum + (r.roomTotal || 0), 0);
  const kitchenRevenue = filteredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const totalOutflowExpenses = filteredExpenses
    .filter((e) => e.type === 'Expense')
    .reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalKitchenPurchaseCost = filteredKitchenPurchases.reduce((sum, p: any) => sum + (p.totalCost || p.amount || 0), 0);

  const totalGrossRevenue = roomRevenue + kitchenRevenue;
  const netOperatingMargin = totalGrossRevenue - totalOutflowExpenses;
  const kitchenNetProfit = kitchenRevenue - totalKitchenPurchaseCost;

  const bookingSources = filteredReceipts.reduce((acc, r) => {
    const source = r.guestName?.toLowerCase().includes('airbnb') ? 'Airbnb' : 'Direct / Offline';
    acc[source] = (acc[source] || 0) + (r.roomTotal || 0);
    return acc;
  }, {} as Record<string, number>);

  const menuItemSales = filteredOrders.reduce((acc, order) => {
    if (order.items && Array.isArray(order.items)) {
      order.items.forEach(item => {
        const name = item.name || 'Item';
        if (!acc[name]) {
          acc[name] = { count: 0, revenue: 0 };
        }
        acc[name].count += (item.quantity || 1);
        acc[name].revenue += (item.price || 0) * (item.quantity || 1);
      });
    }
    return acc;
  }, {} as Record<string, { count: number; revenue: number }>);

  const sortedMenuItems = Object.entries(menuItemSales)
    .sort((a, b) => b[1].revenue - a[1].revenue);

  const expenseCategories = filteredExpenses.reduce((acc, exp) => {
    const cat = exp.category || 'Other';
    acc[cat] = (acc[cat] || 0) + exp.amount;
    return acc;
  }, {} as Record<string, number>);

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

  const purchaseItems = filteredKitchenPurchases.reduce((acc, p: any) => {
    const name = p.itemName || 'Unknown';
    if (!acc[name]) {
      acc[name] = { count: 0, totalCost: 0 };
    }
    acc[name].count += p.quantity || 1;
    acc[name].totalCost += p.totalCost || p.amount || 0;
    return acc;
  }, {} as Record<string, { count: number; totalCost: number }>);

  const sortedPurchaseItems = Object.entries(purchaseItems)
    .sort((a, b) => (b[1] as { count: number; totalCost: number }).totalCost - (a[1] as { count: number; totalCost: number }).totalCost);

  const brandColor = '#2563eb';
  const brandSecondary = '#0ea5e9';
  const successColor = '#10b981';
  const dangerColor = '#ef4444';
  const warningColor = '#f59e0b';

  const overviewPieOptions: any = {
    chart: { type: 'donut', height: 320, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    labels: ['Room Revenue', 'Kitchen Revenue', 'Expenses'],
    colors: [brandColor, brandSecondary, dangerColor],
    plotOptions: { pie: { donut: { size: '70%', labels: { show: true, total: { show: true, label: 'Total' } } } } },
    dataLabels: { enabled: false },
    legend: { position: 'bottom' },
    stroke: { show: false },
  };

  const overviewPieSeries = [
    roomRevenue || 0,
    kitchenRevenue || 0,
    totalOutflowExpenses || 0,
  ];

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
    xaxis: { categories: sortedPurchaseItems.slice(0, 15).map(([name]) => name) },
    grid: { strokeDashArray: 4 },
    dataLabels: { enabled: false },
    legend: { show: false },
  };

  const expensesBarSeries = [
    { name: 'Total Cost', data: sortedPurchaseItems.slice(0, 15).map(([, data]) => (data as { count: number; totalCost: number }).totalCost) }
  ];

  const dateFilterOptions: { label: string; value: DateFilter }[] = [
    { label: 'All Time', value: 'all' },
    { label: 'Today', value: 'day' },
    { label: 'This Week', value: 'week' },
    { label: 'This Month', value: 'month' },
    { label: 'This Year', value: 'year' },
  ];

  return (
    <div className="analytics-dashboard-container space-y-6 text-xs text-slate-800 dark:text-slate-200">
      {/* Top Title Banner */}
      <div className="analytics-header-banner bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            📊 Business Intelligence (BI) Analytics Dashboard
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Real-time multi-dimensional financial reports, revenue streams, operational expenses, and procurement price analytics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            className="text-xs font-semibold bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5"
          >
            {dateFilterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary KPI Cards (Always Visible) */}
      <div className="analytics-kpi-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="analytics-kpi-card bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Gross Total Revenue</p>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 flex items-center">
            <IndianRupee className="w-5 h-5 text-emerald-600" />
            {totalGrossRevenue.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-emerald-600 font-semibold mt-1">Room Accommodations + Kitchen Orders</p>
        </div>

        <div className="analytics-kpi-card bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Room Accommodations</p>
          <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1 flex items-center">
            <IndianRupee className="w-4 h-4 text-blue-600" />
            {roomRevenue.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">{filteredReceipts.length} Settled Billing Receipts</p>
        </div>

        <div className="analytics-kpi-card bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kitchen POS Sales</p>
          <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1 flex items-center">
            <IndianRupee className="w-4 h-4 text-cyan-600" />
            {kitchenRevenue.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-cyan-600 font-semibold mt-1">{filteredOrders.length} Kitchen Orders</p>
        </div>

        <div className="analytics-kpi-card bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Net Operating Margin</p>
          <p className={`text-xl font-extrabold mt-1 flex items-center ${netOperatingMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            <IndianRupee className="w-4 h-4" />
            {netOperatingMargin.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-slate-500 font-semibold mt-1">Gross Revenue - Utility Outflows</p>
        </div>
      </div>

      {/* Dynamic Navigation Tabs */}
      <div className="analytics-tab-bar flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl gap-1 flex-wrap">
        <button
          onClick={() => setActiveTab('overview')}
          className={`btn-analytics-tab-overview px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          📈 Overview
        </button>
        <button
          onClick={() => setActiveTab('bookings')}
          className={`btn-analytics-tab-bookings px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
            activeTab === 'bookings'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          🏨 Bookings
        </button>
        <button
          onClick={() => setActiveTab('food')}
          className={`btn-analytics-tab-food px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
            activeTab === 'food'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          🍽️ Food POS
        </button>
        <button
          onClick={() => setActiveTab('kitchen')}
          className={`btn-analytics-tab-kitchen px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
            activeTab === 'kitchen'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          🍳 Kitchen
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`btn-analytics-tab-purchases px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
            activeTab === 'expenses'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          🛒 Expenses
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2 border-l-3 border-blue-600 pl-2.5">
              <PieChart className="w-4 h-4 text-blue-600" /> Operational Financial Breakdown & Margin Analysis
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <ReactApexChart options={overviewPieOptions} series={overviewPieSeries} type="donut" height={320} />
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200 mb-1">
                    <span>Room Lodging Revenue</span>
                    <span className="font-extrabold">₹{roomRevenue.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-500"
                      style={{ width: `${totalGrossRevenue > 0 ? (roomRevenue / totalGrossRevenue) * 100 : 50}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200 mb-1">
                    <span>Kitchen & Dining POS Revenue</span>
                    <span className="font-extrabold">₹{kitchenRevenue.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                      style={{ width: `${totalGrossRevenue > 0 ? (kitchenRevenue / totalGrossRevenue) * 100 : 50}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200 mb-1">
                    <span>Operational Outflow Expenses (Salaries, Bills, Other)</span>
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
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2 border-l-3 border-blue-600 pl-2.5">
              🏨 Monthly Bookings, Revenue & Guest Count
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="font-bold text-slate-700 mb-2">Monthly Revenue</p>
                <ReactApexChart options={bookingsBarOptions} series={bookingsBarSeries} type="bar" height={320} />
              </div>

              <div>
                <p className="font-bold text-slate-700 mb-2">Monthly Guest Count</p>
                <ReactApexChart options={bookingsGuestOptions} series={bookingsGuestSeries} type="line" height={320} />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="datatable w-full text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-900 font-bold border-b border-slate-200 dark:border-slate-700 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Month</th>
                    <th className="p-3 text-center">Bookings</th>
                    <th className="p-3 text-right">Revenue (₹)</th>
                    <th className="p-3 text-center">Guests</th>
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
                        No bookings recorded for the selected period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: FOOD POS */}
      {activeTab === 'food' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2 border-l-3 border-cyan-500 pl-2.5">
              🍽️ Food Menu Performance & Most Popular Dish Analytics
            </h3>

            <div className="grid grid-cols-1 gap-6">
              <div>
                <ReactApexChart options={foodBarOptions} series={foodBarSeries} type="bar" height={360} />
              </div>

              <div className="overflow-x-auto">
                <table className="datatable w-full text-left border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-900 font-bold border-b border-slate-200 dark:border-slate-700 uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Rank</th>
                      <th className="p-3">Menu Item Name</th>
                      <th className="p-3 text-center">Total Quantity Sold</th>
                      <th className="p-3 text-right">Total Generated Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {sortedMenuItems.slice(0, 10).map(([itemName, data], index) => (
                      <tr key={itemName} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="p-3 font-bold text-slate-400">#{index + 1}</td>
                        <td className="p-3 font-bold text-slate-900 dark:text-white">{itemName}</td>
                        <td className="p-3 text-center font-semibold text-blue-600">{data.count} orders</td>
                        <td className="p-3 text-right font-extrabold text-emerald-600">₹{data.revenue.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                    {sortedMenuItems.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center p-6 text-slate-400">
                          No food orders recorded yet.
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
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2 border-l-3 border-amber-500 pl-2.5">
              🍳 Kitchen Sales, Purchases & Net Profit
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <ReactApexChart options={kitchenBarOptions} series={kitchenBarSeries} type="bar" height={320} />
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800">
                  <p className="text-xs text-emerald-800 dark:text-emerald-300 font-bold uppercase">Kitchen POS Sales Income</p>
                  <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">₹{kitchenRevenue.toLocaleString('en-IN')}</p>
                  <p className="text-[10px] text-emerald-600 mt-1">From guest dining orders</p>
                </div>

                <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-amber-800 dark:text-amber-300 font-bold uppercase">Kitchen Purchase Outflows</p>
                  <p className="text-2xl font-extrabold text-amber-700 dark:text-amber-400 mt-1">₹{totalKitchenPurchaseCost.toLocaleString('en-IN')}</p>
                  <p className="text-[10px] text-amber-600 mt-1">Groceries, gas, and supplies spend</p>
                </div>

                <div className={`p-4 rounded-xl border ${kitchenNetProfit >= 0 ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'}`}>
                  <p className={`text-xs font-bold uppercase ${kitchenNetProfit >= 0 ? 'text-blue-800 dark:text-blue-300' : 'text-red-800 dark:text-red-300'}`}>Kitchen Net Profit</p>
                  <p className={`text-2xl font-extrabold mt-1 ${kitchenNetProfit >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-red-700 dark:text-red-400'}`}>
                    ₹{kitchenNetProfit.toLocaleString('en-IN')}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">Kitchen Sales - Kitchen Purchases</p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="datatable w-full text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-900 font-bold border-b border-slate-200 dark:border-slate-700 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Dish Name</th>
                    <th className="p-3 text-center">Times Ordered</th>
                    <th className="p-3 text-right">Total Revenue (₹)</th>
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
                        No kitchen orders recorded yet.
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
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2 border-l-3 border-red-500 pl-2.5">
              🛒 Expense Items - Total Cost Breakdown
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
                      <th className="p-3">Item Description</th>
                      <th className="p-3 text-center">Qty</th>
                      <th className="p-3 text-right">Total Cost (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {sortedPurchaseItems.map(([name, data], idx) => {
                      const itemData = data as { count: number; totalCost: number };
                      return (
                        <tr key={name} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <td className="p-3 font-mono text-slate-400 text-[10px]">{idx + 1}</td>
                          <td className="p-3 font-bold text-slate-900 dark:text-white">{name}</td>
                          <td className="p-3 text-center font-semibold text-blue-600">{itemData.count}</td>
                          <td className="p-3 text-right font-extrabold text-red-600">₹{itemData.totalCost.toLocaleString('en-IN')}</td>
                        </tr>
                      );
                    })}
                    {sortedPurchaseItems.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center p-6 text-slate-400">
                          No expenses recorded for the selected period.
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
    </div>
  );
};
