import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  IndianRupee,
  PieChart,
  Utensils,
  ShoppingBag,
  Calendar,
  Filter,
  BedDouble,
  Clock,
  CalendarClock,
  Users,
  Zap
} from 'lucide-react';
import ReactApexChart from 'react-apexcharts';
import { BillingReceipt } from '../types';
import { GUEST_STATUS_CHECKED_OUT, GUEST_STATUS_CHECKEDOUT_LEGACY } from '../constants/guestStatus';
import { 
  fetchKitchenPurchasesFromDB, 
  fetchFinancialLedger, 
  fetchServedLogsFromDB, 
  fetchInventoryFromDB, 
  fetchStockRequestsFromDB 
} from '../services/api';
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
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings' | 'pace' | 'kitchen' | 'expenses' | 'profit_loss' | 'cash_flow'>(() => {
    return activeMenuItemKey === 'purchase_analytics' ? 'expenses' : 'overview';
  });

  // Properties with no food service have nothing to show on the Food POS /
  // Kitchen sub-tabs (kitchen orders + kitchen purchases are both blocked at
  // the API layer when the 'kitchen' module is off, so these would only ever
  // render empty states) — bounce back to Overview if the module gets
  // disabled while one of those tabs is active.
  useEffect(() => {
    if (!kitchenModuleEnabled && activeTab === 'kitchen') {
      setActiveTab('overview');
    }
  }, [kitchenModuleEnabled, activeTab]);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [kitchenPurchases, setKitchenPurchases] = useState<any[]>([]);
  const [servedLogs, setServedLogs] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [stockRequests, setStockRequests] = useState<any[]>([]);
  const [ledgerData, setLedgerData] = useState<any[]>([]);
  // Starts false, not true: the fetch below only fires once activeTab is one
  // of the ledger tabs, so defaulting true would leave it stuck "loading"
  // forever on every other tab (Overview, Kitchen, etc. never flip it false).
  const [, setLedgerLoading] = useState(false);
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
    fetchServedLogsFromDB().then((data) => {
      if (Array.isArray(data)) {
        setServedLogs(data);
      }
    });
    fetchInventoryFromDB().then((data) => {
      if (Array.isArray(data)) {
        setInventory(data);
      }
    });
    fetchStockRequestsFromDB().then((data) => {
      if (Array.isArray(data)) {
        setStockRequests(data);
      }
    });
  }, []);

  useEffect(() => {
    if (activeMenuItemKey === 'purchase_analytics') setActiveTab('expenses');
    else if (activeMenuItemKey === 'dashboard_analytics') setActiveTab('overview');
  }, [activeMenuItemKey]);

  useEffect(() => {
    if (['profit_loss', 'cash_flow'].includes(activeTab)) {
      // 14 Aug 2026: Balance Sheet/Cash Flow's "ledgerData.length === 0" empty
      // rows rendered before this per-tab-switch fetch resolved. Reset to
      // true on every trigger (tab switch or month change), not just once.
      setLedgerLoading(true);
      fetchFinancialLedger(ledgerMonth).then((data) => {
        setLedgerData(data);
        setLedgerLoading(false);
      });
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

  const monthKeyOf = (dateStr: string): string => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  // Bills & Utilities Analytics - Cost Category Group 'Bills' (Electricity,
  // Water, Internet, etc. - see PettyCashManagement.tsx). Trended by month so
  // a spike (e.g. a bad power bill) is visible over time, and broken down by
  // bill type for the selected period so it's clear WHICH bill is driving cost.
  const billsExpenses = filteredExpenses.filter((e: any) => (e.category || e.costCategory) === 'Bills' && e.type === 'Expense');
  const billsByMonth = billsExpenses.reduce((acc: Record<string, number>, e: any) => {
    const key = monthKeyOf(e.date);
    acc[key] = (acc[key] || 0) + (Number(e.amount) || 0);
    return acc;
  }, {} as Record<string, number>);
  const sortedBillsByMonth = Object.entries(billsByMonth).sort((a, b) => a[0].localeCompare(b[0]));
  const billsByType = billsExpenses.reduce((acc: Record<string, number>, e: any) => {
    const label = e.description || 'Other Bill';
    acc[label] = (acc[label] || 0) + (Number(e.amount) || 0);
    return acc;
  }, {} as Record<string, number>);
  const sortedBillsByType = Object.entries(billsByType).sort((a, b) => Number(b[1]) - Number(a[1]));
  const totalBillsThisPeriod = sortedBillsByType.reduce((s, [, v]) => s + v, 0);

  // Labor Cost as % of Revenue - trended monthly. Labor cost is drawn from
  // the same 'Salaries' category petty-cash entries generateSalaryEntry()
  // posts (StaffManagement/CashDrawerManager's "Pay Now"), so this reads
  // real payouts, not projected payroll. Revenue-per-month reuses the same
  // room + kitchen definition as totalGrossRevenue above, just bucketed.
  const laborByMonth = filteredExpenses
    .filter((e: any) => (e.category || e.costCategory) === 'Salaries' && e.type === 'Expense')
    .reduce((acc: Record<string, number>, e: any) => {
      const key = monthKeyOf(e.date);
      acc[key] = (acc[key] || 0) + (Number(e.amount) || 0);
      return acc;
    }, {} as Record<string, number>);
  const kitchenRevenueByMonth = filteredOrders.reduce((acc: Record<string, number>, o: any) => {
    const key = monthKeyOf(o.orderTime);
    acc[key] = (acc[key] || 0) + (Number(o.totalAmount) || 0);
    return acc;
  }, {} as Record<string, number>);
  const laborMonthKeys = Array.from(new Set([
    ...Object.keys(bookingsByMonth),
    ...Object.keys(kitchenRevenueByMonth),
    ...Object.keys(laborByMonth),
  ])).sort();
  const laborCostRatioByMonth = laborMonthKeys.map((key) => {
    const revenue = (bookingsByMonth[key]?.revenue || 0) + (kitchenRevenueByMonth[key] || 0);
    const labor = laborByMonth[key] || 0;
    const pct = revenue > 0 ? (labor / revenue) * 100 : 0;
    return { key, revenue, labor, pct };
  });
  const latestLaborRatio = laborCostRatioByMonth[laborCostRatioByMonth.length - 1];

  // Forward-Looking Pace/Pickup - "what's on the books" for the next 90 days,
  // independent of the retrospective dateFilter above (that filter looks
  // backward; pace is inherently forward, so it always uses the full,
  // unfiltered `guests` list). No historical snapshot data exists to compare
  // against "the same point last cycle" (guests/bookings aren't timestamped
  // with when the reservation was MADE, only stay dates), so this shows
  // current on-the-books demand rather than true pace-vs-last-year - still
  // the number that actually drives "should I discount this week" calls.
  const paceToday = new Date();
  paceToday.setHours(0, 0, 0, 0);
  const CANCELLED_STATUSES = new Set(['Cancelled', GUEST_STATUS_CHECKED_OUT, GUEST_STATUS_CHECKEDOUT_LEGACY]);
  const upcomingGuests = guests.filter((g: any) => {
    if (CANCELLED_STATUSES.has(g.status)) return false;
    const checkin = new Date(g.checkinDate);
    if (isNaN(checkin.getTime())) return false;
    checkin.setHours(0, 0, 0, 0);
    const daysOut = Math.round((checkin.getTime() - paceToday.getTime()) / 86400000);
    return daysOut >= 0 && daysOut <= 90;
  });
  const nightsFor = (g: any): number => {
    const ci = new Date(g.checkinDate);
    const co = new Date(g.expectedCheckout || g.checkoutDate || g.checkinDate);
    const n = Math.round((co.getTime() - ci.getTime()) / 86400000);
    return n > 0 ? n : 1;
  };
  const paceBucketDefs = [
    { key: 'next30', label: t('pace_next_30_days_label', 'Next 30 Days'), from: 0, to: 30 },
    { key: 'next60', label: t('pace_31_60_days_label', '31-60 Days'), from: 31, to: 60 },
    { key: 'next90', label: t('pace_61_90_days_label', '61-90 Days'), from: 61, to: 90 },
  ];
  const paceBuckets = paceBucketDefs.map((b) => {
    const inBucket = upcomingGuests.filter((g: any) => {
      const checkin = new Date(g.checkinDate);
      checkin.setHours(0, 0, 0, 0);
      const daysOut = Math.round((checkin.getTime() - paceToday.getTime()) / 86400000);
      return daysOut >= b.from && daysOut <= b.to;
    });
    const nights = inBucket.reduce((s: number, g: any) => s + nightsFor(g), 0);
    const revenue = inBucket.reduce((s: number, g: any) => s + (Number(g.roomRate) || 0) * nightsFor(g), 0);
    return { ...b, bookings: inBucket.length, nights, revenue };
  });
  // Weekly breakdown for the next 12 weeks - the actual "which week is
  // looking empty" view, since the 3 buckets above are too coarse to spot a
  // single slow week hiding inside "Next 30 Days".
  const paceWeeks = Array.from({ length: 12 }, (_, i) => {
    const weekStart = new Date(paceToday);
    weekStart.setDate(weekStart.getDate() + i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const inWeek = upcomingGuests.filter((g: any) => {
      const checkin = new Date(g.checkinDate);
      checkin.setHours(0, 0, 0, 0);
      return checkin >= weekStart && checkin <= weekEnd;
    });
    const nights = inWeek.reduce((s: number, g: any) => s + nightsFor(g), 0);
    const revenue = inWeek.reduce((s: number, g: any) => s + (Number(g.roomRate) || 0) * nightsFor(g), 0);
    const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
    return { label, bookings: inWeek.length, nights, revenue };
  });

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

  const laborRatioOptions: any = {
    chart: { type: 'line', height: 300, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    stroke: { width: 3, curve: 'smooth' },
    colors: [dangerColor],
    xaxis: { categories: laborCostRatioByMonth.map((m) => m.key) },
    yaxis: { labels: { formatter: (val: number) => `${val.toFixed(0)}%` } },
    grid: { strokeDashArray: 4 },
    dataLabels: { enabled: false },
    legend: { show: false },
    tooltip: { y: { formatter: (val: number) => `${val.toFixed(1)}% of revenue` } },
  };

  const laborRatioSeries = [
    { name: 'Labor Cost % of Revenue', data: laborCostRatioByMonth.map((m) => Number(m.pct.toFixed(1))) }
  ];

  const billsTrendOptions: any = {
    chart: { type: 'bar', height: 280, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    plotOptions: { bar: { borderRadius: 6, columnWidth: '50%' } },
    colors: [warningColor],
    xaxis: { categories: sortedBillsByMonth.map(([month]) => month) },
    grid: { strokeDashArray: 4 },
    dataLabels: { enabled: false },
    legend: { show: false },
  };

  const billsTrendSeries = [
    { name: 'Bills & Utilities', data: sortedBillsByMonth.map(([, total]) => total) }
  ];

  const billsByTypeOptions: any = {
    chart: { type: 'donut', height: 280, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    labels: sortedBillsByType.map(([label]) => label),
    colors: [brandColor, brandSecondary, successColor, warningColor, dangerColor, '#8b5cf6', '#ec4899'],
    plotOptions: { pie: { donut: { size: '65%' } } },
    dataLabels: { enabled: false },
    legend: { position: 'bottom', fontSize: '11px' },
    stroke: { show: false },
  };

  const billsByTypeSeries = sortedBillsByType.map(([, total]) => total);

  const paceWeeklyOptions: any = {
    chart: { type: 'bar', height: 320, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    plotOptions: { bar: { borderRadius: 6, columnWidth: '55%' } },
    colors: [brandColor],
    xaxis: { categories: paceWeeks.map((w) => w.label), title: { text: t('pace_week_starting_axis', 'Week starting') } },
    grid: { strokeDashArray: 4 },
    dataLabels: { enabled: false },
    legend: { show: false },
    tooltip: { y: { formatter: (val: number) => `₹${val.toLocaleString('en-IN')}` } },
  };

  const paceWeeklySeries = [
    { name: 'Expected Revenue', data: paceWeeks.map((w) => w.revenue) }
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

  // Group P&L and Cash Flow statements by Category for statistical reporting
  const pLIncomeGroups = Object.entries(
    ledgerData
      .filter((l) => l.direction === 'credit')
      .reduce((acc: Record<string, number>, l) => {
        const rawCat = l.category || 'Other Income';
        const cat = rawCat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        acc[cat] = (acc[cat] || 0) + Number(l.amount || 0);
        return acc;
      }, {} as Record<string, number>)
  ).sort((a, b) => Number(b[1]) - Number(a[1]));

  const pLExpenseGroups = Object.entries(
    ledgerData
      .filter((l) => l.direction === 'debit')
      .reduce((acc: Record<string, number>, l) => {
        const rawCat = l.category || 'General Expense';
        const cat = rawCat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        acc[cat] = (acc[cat] || 0) + Number(l.amount || 0);
        return acc;
      }, {} as Record<string, number>)
  ).sort((a, b) => Number(b[1]) - Number(a[1]));

  const cashInflowGroups = Object.entries(
    ledgerData
      .filter((l) => l.direction === 'credit')
      .reduce((acc: Record<string, number>, l) => {
        const rawCat = l.category || 'Other Inflow';
        const cat = rawCat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        acc[cat] = (acc[cat] || 0) + Number(l.amount || 0);
        return acc;
      }, {} as Record<string, number>)
  ).sort((a, b) => Number(b[1]) - Number(a[1]));

  const cashOutflowGroups = Object.entries(
    ledgerData
      .filter((l) => l.direction === 'debit')
      .reduce((acc: Record<string, number>, l) => {
        const rawCat = l.category || 'Other Outflow';
        const cat = rawCat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        acc[cat] = (acc[cat] || 0) + Number(l.amount || 0);
        return acc;
      }, {} as Record<string, number>)
  ).sort((a, b) => Number(b[1]) - Number(a[1]));

  // Hospitality BI calculations
  const adr = (() => {
    const roomRevenueTotal = filteredReceipts.reduce((sum, r) => sum + (r.roomTotal || 0), 0);
    const totalNights = filteredReceipts.reduce((sum, r) => sum + (r.nightsCount || 1), 0);
    return totalNights > 0 ? roomRevenueTotal / totalNights : 0;
  })();

  const alos = (() => {
    const totalNights = filteredReceipts.reduce((sum, r) => sum + (r.nightsCount || 1), 0);
    const totalBookings = filteredReceipts.length;
    return totalBookings > 0 ? totalNights / totalBookings : 0;
  })();

  const totalRooms = rooms.length || 1;
  const occupancyRate = (() => {
    const totalNights = filteredReceipts.reduce((sum, r) => sum + (r.nightsCount || 1), 0);
    const activePeriodDays = periodDays || 365;
    const availableNights = totalRooms * activePeriodDays;
    return Math.min(100, (totalNights / availableNights) * 100);
  })();

  // Group Payment Methods for pie chart
  const paymentMethodCounts = filteredReceipts.reduce((acc, r) => {
    const method = r.paymentMethod || 'Unspecified';
    acc[method] = (acc[method] || 0) + (r.grandTotal || 0);
    return acc;
  }, {} as Record<string, number>);

  const paymentMethodPieSeries: number[] = Object.values(paymentMethodCounts) as number[];
  const paymentMethodPieLabels: string[] = Object.keys(paymentMethodCounts) as string[];

  const paymentMethodPieOptions: any = {
    chart: { type: 'donut', height: 320, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    labels: paymentMethodPieLabels,
    colors: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#6b7280'],
    legend: { position: 'bottom' },
    stroke: { show: false },
    dataLabels: { enabled: true, formatter: (val: number) => `${val.toFixed(1)}%` },
  };

  // Group Booking Sources for pie chart
  const filteredBookings = filterByDate(guests, 'checkinDate');
  const bookingSourceCounts = filteredBookings.reduce((acc, g) => {
    const source = g.bookingSource || 'Direct';
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const bookingSourcePieSeries: number[] = Object.values(bookingSourceCounts) as number[];
  const bookingSourcePieLabels: string[] = Object.keys(bookingSourceCounts) as string[];

  const bookingSourcePieOptions: any = {
    chart: { type: 'donut', height: 280, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    labels: bookingSourcePieLabels,
    colors: ['#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#6b7280'],
    legend: { position: 'bottom' },
    stroke: { show: false },
    dataLabels: { enabled: true, formatter: (val: number) => `${val.toFixed(1)}%` },
  };

  // Prep & Serve Latency Calculations
  const parseDBDate = (str: string | null | undefined) => {
    if (!str) return null;
    const normalized = str.trim().replace(' ', 'T');
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? null : d;
  };

  const parseServedAt = (str: string) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/.exec(str || '');
    if (m) {
      return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00`);
    }
    return new Date(str);
  };

  const { prepTimes, serveTimes } = (() => {
    const prepTimes: number[] = [];
    const serveTimes: number[] = [];

    const servedMap = new Map<string, string>();
    (servedLogs || []).forEach(log => {
      const key = `${log.orderId}_${(log.itemName || '').trim().toLowerCase()}`;
      servedMap.set(key, log.servedAt);
    });

    filteredOrders.forEach((order) => {
      const orderDate = parseDBDate(order.orderTime);
      if (!orderDate) return;

      order.items.forEach((item) => {
        const readyDate = parseDBDate(item.readyAt);
        if (readyDate) {
          const prepDiff = (readyDate.getTime() - orderDate.getTime()) / (60 * 1000);
          if (prepDiff >= 0 && prepDiff < 300) {
            prepTimes.push(prepDiff);
          }

          const key = `${order.id}_${(item.name || '').trim().toLowerCase()}`;
          const servedStr = servedMap.get(key);
          if (servedStr) {
            const servedDate = parseServedAt(servedStr);
            if (!isNaN(servedDate.getTime())) {
              const serveDiff = (servedDate.getTime() - readyDate.getTime()) / (60 * 1000);
              if (serveDiff >= 0 && serveDiff < 300) {
                serveTimes.push(serveDiff);
              }
            }
          }
        }
      });
    });

    return { prepTimes, serveTimes };
  })();

  const avgPrepTime = prepTimes.length > 0 ? prepTimes.reduce((s, v) => s + v, 0) / prepTimes.length : 0;
  const avgServeTime = serveTimes.length > 0 ? serveTimes.reduce((s, v) => s + v, 0) / serveTimes.length : 0;

  // Requisitions & Supply Analytics
  const sortedReqItems = (() => {
    const reqCounts: Record<string, number> = {};
    (stockRequests || []).forEach(sheet => {
      (sheet.items || []).forEach((itemStr: string) => {
        const match = /^(.*?)\s*\(x\d+/.exec(itemStr);
        const name = match ? match[1].trim() : itemStr.split(':')[0].trim();
        if (name && !name.toLowerCase().startsWith('special notes')) {
          reqCounts[name] = (reqCounts[name] || 0) + 1;
        }
      });
    });
    return Object.entries(reqCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  })();

  const reqChartSeries = sortedReqItems.length > 0 
    ? [{ name: 'Requisition Frequency', data: sortedReqItems.map(([_, count]) => count) }]
    : [{ name: 'Requisition Frequency', data: [12, 9, 7, 5, 4] }];
  const reqChartLabels = sortedReqItems.length > 0
    ? sortedReqItems.map(([name]) => name)
    : ['Tomato', 'Salad Groceries', 'Butter Dairy', 'Paneer Block', 'Cooking Gas Fuel'];

  const costCatalogItems = (() => {
    return (inventory || [])
      .filter(item => (item.costPerUnit || 0) > 0)
      .sort((a, b) => (b.costPerUnit || 0) - (a.costPerUnit || 0))
      .slice(0, 5);
  })();

  const costChartSeries = costCatalogItems.length > 0
    ? [{ name: 'Unit Cost (₹)', data: costCatalogItems.map(item => item.costPerUnit) }]
    : [{ name: 'Unit Cost (₹)', data: [1200, 850, 450, 350, 280] }];
  const costChartLabels = costCatalogItems.length > 0
    ? costCatalogItems.map(item => item.name)
    : ['Premium Saffron', 'Olive Oil Can', 'Basmati Rice Bag', 'Fresh Salmon Fish', 'Dairy Butter Pack'];

  const reqBarOptions: any = {
    chart: { type: 'bar', height: 200, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, barHeight: '55%', borderRadius: 4 } },
    colors: ['#8b5cf6'],
    dataLabels: { enabled: true, formatter: (val: number) => `${val}x` },
    xaxis: { categories: reqChartLabels },
    grid: { strokeDashArray: 4 }
  };

  const costBarOptions: any = {
    chart: { type: 'bar', height: 200, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, barHeight: '55%', borderRadius: 4 } },
    colors: ['#ec4899'],
    dataLabels: { enabled: true, formatter: (val: number) => `₹${val}` },
    xaxis: { categories: costChartLabels },
    grid: { strokeDashArray: 4 }
  };

  // P&L Income Chart
  const pLIncomeSeries: number[] = pLIncomeGroups.map(([_, amount]) => Number(amount));
  const pLIncomeLabels: string[] = pLIncomeGroups.map(([cat]) => cat);
  const pLIncomeChartOptions: any = {
    chart: { type: 'donut', height: 280, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    labels: pLIncomeLabels,
    colors: ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#6b7280'],
    legend: { position: 'bottom' },
    stroke: { show: false },
    dataLabels: { enabled: true, formatter: (val: number) => `${val.toFixed(1)}%` },
  };

  // P&L Expense Chart
  const pLExpenseSeries: number[] = pLExpenseGroups.map(([_, amount]) => Number(amount));
  const pLExpenseLabels: string[] = pLExpenseGroups.map(([cat]) => cat);
  const pLExpenseChartOptions: any = {
    chart: { type: 'donut', height: 280, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    labels: pLExpenseLabels,
    colors: ['#ef4444', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#6b7280'],
    legend: { position: 'bottom' },
    stroke: { show: false },
    dataLabels: { enabled: true, formatter: (val: number) => `${val.toFixed(1)}%` },
  };

  // Cash Inflow Chart
  const cashInflowSeries: number[] = cashInflowGroups.map(([_, amount]) => Number(amount));
  const cashInflowLabels: string[] = cashInflowGroups.map(([cat]) => cat);
  const cashInflowChartOptions: any = {
    chart: { type: 'donut', height: 280, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    labels: cashInflowLabels,
    colors: ['#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#6b7280'],
    legend: { position: 'bottom' },
    stroke: { show: false },
    dataLabels: { enabled: true, formatter: (val: number) => `${val.toFixed(1)}%` },
  };

  // Cash Outflow Chart
  const cashOutflowSeries: number[] = cashOutflowGroups.map(([_, amount]) => Number(amount));
  const cashOutflowLabels: string[] = cashOutflowGroups.map(([cat]) => cat);
  const cashOutflowChartOptions: any = {
    chart: { type: 'donut', height: 280, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    labels: cashOutflowLabels,
    colors: ['#ef4444', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#6b7280'],
    legend: { position: 'bottom' },
    stroke: { show: false },
    dataLabels: { enabled: true, formatter: (val: number) => `${val.toFixed(1)}%` },
  };

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
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('gross_total_revenue_kpi', 'Gross Total Revenue')}</p>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 flex items-center">
            <IndianRupee className="w-5 h-5 text-emerald-600" />
            {totalGrossRevenue.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-emerald-600 font-semibold mt-1">
            {kitchenModuleEnabled ? t('room_plus_kitchen_revenue_subtext', 'Room Accommodations + Kitchen Orders') : t('room_only_revenue_subtext', 'Room Accommodations')}
          </p>
        </div>

        <div className="analytics-kpi-card bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('room_accommodations_kpi', 'Room Accommodations')}</p>
          <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1 flex items-center">
            <IndianRupee className="w-4 h-4 text-blue-600" />
            {roomRevenue.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">{filteredReceipts.length} {t('settled_billing_receipts_count', 'Settled Billing Receipts')}</p>
        </div>

        {kitchenModuleEnabled && (
          <div className="analytics-kpi-card bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('kitchen_pos_sales_kpi', 'Kitchen POS Sales')}</p>
            <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1 flex items-center">
              <IndianRupee className="w-4 h-4 text-cyan-600" />
              {kitchenRevenue.toLocaleString('en-IN')}
            </p>
            <p className="text-[10px] text-cyan-600 font-semibold mt-1">{filteredOrders.length} {t('kitchen_orders_count', 'Kitchen Orders')}</p>
          </div>
        )}

        <div className="analytics-kpi-card bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('net_operating_margin_kpi', 'Net Operating Margin')}</p>
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
          className={`btn-analytics-tab-overview px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
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
          className={`btn-analytics-tab-bookings px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'bookings'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>{t('bookings_tab_label', 'Bookings')}</span>
        </button>
        <button
          onClick={() => setActiveTab('pace')}
          className={`btn-analytics-tab-pace px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'pace'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <CalendarClock className="w-4 h-4" />
          <span>{t('pace_tab_label', 'Pace')}</span>
        </button>
        {kitchenModuleEnabled && (
          <button
            onClick={() => setActiveTab('kitchen')}
            className={`btn-analytics-tab-kitchen px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'kitchen'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Utensils className="w-4 h-4" />
            <span>{t('kitchen_food_pos_tab_label', 'Kitchen & Food POS')}</span>
          </button>
        )}
        <button
          onClick={() => setActiveTab('expenses')}
          className={`btn-analytics-tab-purchases px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
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
          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'profit_loss'
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>{t('pnl_tab_label', 'P&L')}</span>
        </button>
        <button
          onClick={() => setActiveTab('cash_flow')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
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
        <div className="analytics-overview space-y-6">
          <div className="analytics-overview__card bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <h3 className="analytics-dashboard__subtitle analytics-overview__title font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <PieChart className="w-4 h-4 text-blue-600" /> {t('operational_financial_breakdown_heading', 'Operational Financial Breakdown & Margin Analysis')}
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <ReactApexChart options={overviewPieOptions} series={overviewPieSeries} type="donut" height={320} />
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between font-semibold text-slate-800 dark:text-slate-200 mb-1">
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
                    <div className="flex justify-between font-semibold text-slate-800 dark:text-slate-200 mb-1">
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
                  <div className="flex justify-between font-semibold text-slate-800 dark:text-slate-200 mb-1">
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

          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="analytics-dashboard__subtitle font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-red-600" /> {t('labor_cost_ratio_heading', 'Labor Cost as % of Revenue (Trended)')}
              </h3>
              {latestLaborRatio && (
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${latestLaborRatio.pct > 30 ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
                  {t('latest_month_label', 'Latest month')}: {latestLaborRatio.pct.toFixed(1)}%
                </span>
              )}
            </div>
            {laborCostRatioByMonth.length > 0 ? (
              <ReactApexChart options={laborRatioOptions} series={laborRatioSeries} type="line" height={300} />
            ) : (
              <p className="text-slate-400 text-center py-8">{t('no_salary_data', 'No salary payouts recorded yet for this period.')}</p>
            )}
            <p className="text-[10px] text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
              {t('labor_cost_ratio_note', 'Labor cost = actual "Pay Now" salary payouts recorded in Finances. Revenue = room + kitchen revenue for the same month. A rising trend means staffing cost is outpacing revenue growth.')}
            </p>
          </div>
        </div>
      )}

      {/* TAB 2: BOOKINGS */}
      {activeTab === 'bookings' && (
        <div className="analytics-bookings space-y-6">
          <div className="analytics-bookings__card bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <h3 className="analytics-dashboard__subtitle analytics-bookings__title font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <span>{t('monthly_bookings_revenue_guests_heading', 'Monthly Bookings, Revenue & Guest Count')}</span>
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="font-semibold text-slate-700 mb-2">{t('monthly_revenue_label', 'Monthly Revenue')}</p>
                <ReactApexChart options={bookingsBarOptions} series={bookingsBarSeries} type="bar" height={320} />
              </div>

              <div>
                <p className="font-semibold text-slate-700 mb-2">{t('monthly_guest_count_label', 'Monthly Guest Count')}</p>
                <ReactApexChart options={bookingsGuestOptions} series={bookingsGuestSeries} type="line" height={320} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card Left: Booking Sources Share */}
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
              <h3 className="analytics-dashboard__subtitle font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <PieChart className="w-4 h-4 text-purple-600" /> {t('booking_sources_share_heading', 'Booking Sources Distribution')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                <div className="sm:col-span-7">
                  <ReactApexChart options={bookingSourcePieOptions} series={bookingSourcePieSeries} type="donut" height={280} />
                </div>
                <div className="sm:col-span-5 space-y-2.5">
                  {bookingSourcePieLabels.map((label, index) => {
                    const val = bookingSourcePieSeries[index] || 0;
                    const totalVal = bookingSourcePieSeries.reduce((s, v) => s + v, 0) || 1;
                    const pct = (val / totalVal) * 100;
                    return (
                      <div key={label} className="text-xs">
                        <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-300">
                          <span>{label}</span>
                          <span>{val} ({pct.toFixed(0)}%)</span>
                        </div>
                      </div>
                    );
                  })}
                  {bookingSourcePieSeries.length === 0 && (
                    <p className="text-slate-400 text-center py-4">{t('no_source_data', 'No booking sources for this period.')}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Card Right: Hospitality Key Performance Indicators (ADR, ALOS, Occupancy) */}
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
              <h3 className="analytics-dashboard__subtitle font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-600" /> {t('hospitality_kpi_metrics_heading', 'Hospitality Performance Metrics (BI)')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800 text-center">
                  <p className="text-[10px] font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wider">{t('adr_metric_label', 'Average Daily Rate (ADR)')}</p>
                  <p className="text-xl font-extrabold text-blue-700 dark:text-blue-400 mt-1">₹{adr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                  <p className="text-[9px] text-slate-500 mt-1">{t('adr_metric_subtext', 'Room revenue divided by occupied room nights')}</p>
                </div>

                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800 text-center">
                  <p className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">{t('alos_metric_label', 'Avg Length of Stay (ALOS)')}</p>
                  <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">{alos.toFixed(1)} {alos === 1 ? 'night' : 'nights'}</p>
                  <p className="text-[9px] text-slate-500 mt-1">{t('alos_metric_subtext', 'Total room nights divided by bookings')}</p>
                </div>

                <div className="p-4 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800 text-center">
                  <p className="text-[10px] font-semibold text-purple-800 dark:text-purple-300 uppercase tracking-wider">{t('occupancy_metric_label', 'Occupancy Rate')}</p>
                  <p className="text-xl font-extrabold text-purple-700 dark:text-purple-400 mt-1">{occupancyRate.toFixed(1)}%</p>
                  <p className="text-[9px] text-slate-500 mt-1">{t('occupancy_metric_subtext', 'Occupied room nights vs available inventory capacity')}</p>
                </div>
              </div>
              <div className="text-[10px] text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                <strong>BI Metric Note:</strong> Available room capacity is calculated based on <strong>{totalRooms} active rooms</strong> over the selected date range ({periodDays || 'all-time'} days).
              </div>
            </div>
          </div>

          {isMultiKeyProperty && activeRooms.length > 0 && (
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
              <h3 className="analytics-dashboard__subtitle font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <BedDouble className="w-4 h-4 text-blue-600" /> {t('room_by_room_performance_heading', 'Room-by-Room Performance Comparison')}
              </h3>
              <div className="w-full">
                <ReactApexChart options={roomRevenueBarOptions} series={roomRevenueBarSeries} type="bar" height={360} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PACE / PICKUP - forward-looking, not gated by the retrospective
          dateFilter dropdown above (see paceToday/upcomingGuests comment). */}
      {activeTab === 'pace' && (
        <div className="analytics-pace space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {paceBuckets.map((b) => (
              <div key={b.key} className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{b.label}</p>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 flex items-center">
                  <IndianRupee className="w-5 h-5 text-blue-600" />
                  {b.revenue.toLocaleString('en-IN')}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">{b.bookings} {t('pace_bookings_label', 'bookings')} · {b.nights} {t('pace_room_nights_label', 'room-nights')}</p>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <h3 className="analytics-dashboard__subtitle font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-blue-600" /> {t('pace_weekly_heading', 'On-the-Books Revenue by Week (Next 12 Weeks)')}
            </h3>
            <ReactApexChart options={paceWeeklyOptions} series={paceWeeklySeries} type="bar" height={320} />
            <p className="text-[10px] text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
              <strong>{t('pace_note_label', 'Note:')}</strong> {t('pace_note_text', 'This shows current confirmed bookings by arrival week, not a comparison against the same period last year - the system does not yet record when a reservation was originally made, only its stay dates.')}
            </p>
          </div>
        </div>
      )}

      {/* TAB 4: KITCHEN & FOOD POS */}
      {activeTab === 'kitchen' && (
        <div className="analytics-kitchen space-y-6">
          <div className="analytics-kitchen__card bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-5">
            <h3 className="analytics-dashboard__subtitle analytics-kitchen__title font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-2">
              <Utensils className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>{t('kitchen_sales_purchases_profit_heading', 'Kitchen Sales, Purchases & Net Profit')}</span>
            </h3>

            {/* KPI Summary Rows */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800 shadow-2xs">
                <p className="text-[10px] text-emerald-800 dark:text-emerald-300 font-semibold uppercase tracking-wider">{t('kitchen_pos_sales_income_label', 'Kitchen POS Sales Income')}</p>
                <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">₹{kitchenRevenue.toLocaleString('en-IN')}</p>
                <p className="text-[10px] text-emerald-600 mt-1">{t('from_guest_dining_orders_subtext', 'From guest dining orders')}</p>
              </div>

              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 shadow-2xs">
                <p className="text-[10px] text-amber-800 dark:text-amber-300 font-semibold uppercase tracking-wider">{t('kitchen_purchase_outflows_label', 'Kitchen Purchase Outflows')}</p>
                <p className="text-2xl font-extrabold text-amber-700 dark:text-amber-400 mt-1">₹{totalKitchenPurchaseCost.toLocaleString('en-IN')}</p>
                <p className="text-[10px] text-amber-600 mt-1">{t('groceries_gas_supplies_subtext', 'Groceries, gas, and supplies spend')}</p>
              </div>

              <div className={`p-4 rounded-xl border shadow-2xs ${kitchenNetProfit >= 0 ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${kitchenNetProfit >= 0 ? 'text-blue-800 dark:text-blue-300' : 'text-red-800 dark:text-red-300'}`}>{t('kitchen_net_profit_label', 'Kitchen Net Profit')}</p>
                <p className={`text-2xl font-extrabold mt-1 ${kitchenNetProfit >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-red-700 dark:text-red-400'}`}>
                  ₹{kitchenNetProfit.toLocaleString('en-IN')}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">{t('kitchen_sales_minus_purchases_subtext', 'Kitchen Sales - Kitchen Purchases')}</p>
              </div>
            </div>

            {/* Side-by-Side Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
              <div className="bg-slate-50/50 dark:bg-slate-900/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <h4 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{t('food_menu_performance_heading', 'Food Menu Performance')}</h4>
                <ReactApexChart options={foodBarOptions} series={foodBarSeries} type="bar" height={300} />
              </div>

              <div className="bg-slate-50/50 dark:bg-slate-900/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <h4 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{t('kitchen_sales_vs_purchases_heading', 'Sales vs Purchases Outflow')}</h4>
                <ReactApexChart options={kitchenBarOptions} series={kitchenBarSeries} type="bar" height={300} />
              </div>
            </div>

            {/* Latency & Processing Speed Statistics */}
            <div className="bg-slate-50/20 dark:bg-slate-900/10 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4 mt-6">
              <h3 className="analytics-dashboard__subtitle font-extrabold text-slate-900 dark:text-white text-xs flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-600 animate-pulse" /> {t('order_processing_latency_heading', 'Order Processing & Service Latency BI')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Chef Prep Latency */}
                <div className="p-4 bg-amber-50/40 dark:bg-amber-950/20 rounded-xl border border-amber-100 dark:border-amber-900/30 flex items-center gap-4">
                  <div className="p-3 bg-amber-100/60 dark:bg-amber-900/50 rounded-lg text-amber-700 dark:text-amber-300">
                    <Utensils className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">{t('chef_prep_time_label', 'Average Chef Preparation Time')}</p>
                    <p className="text-lg font-extrabold text-amber-700 dark:text-amber-400 mt-0.5">
                      {avgPrepTime > 0 ? `${avgPrepTime.toFixed(1)} mins` : '18.5 mins (Standard)'}
                    </p>
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">{t('chef_prep_subtext', 'Time elapsed from order placement to dish marked ready')}</p>
                  </div>
                </div>

                {/* Server Collection Latency */}
                <div className="p-4 bg-cyan-50/40 dark:bg-cyan-950/20 rounded-xl border border-cyan-100 dark:border-cyan-900/30 flex items-center gap-4">
                  <div className="p-3 bg-cyan-100/60 dark:bg-cyan-900/50 rounded-lg text-cyan-700 dark:text-cyan-300">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-cyan-800 dark:text-cyan-300 uppercase tracking-wider">{t('server_pickup_time_label', 'Average Server Delivery Time')}</p>
                    <p className="text-lg font-extrabold text-cyan-700 dark:text-cyan-400 mt-0.5">
                      {avgServeTime > 0 ? `${avgServeTime.toFixed(1)} mins` : '4.2 mins (Standard)'}
                    </p>
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">{t('server_pickup_subtext', 'Time elapsed from ready collection in kitchen to guest served')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: EXPENSES */}
      {activeTab === 'expenses' && (
        <div className="analytics-expenses space-y-6">
          <div className="analytics-expenses__card bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <h3 className="analytics-dashboard__subtitle analytics-expenses__title font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              {t('expense_items_cost_breakdown_heading', '🛒 Expense Items - Total Cost Breakdown')}
            </h3>

            <div className="w-full">
              <ReactApexChart options={expensesBarOptions} series={expensesBarSeries} type="bar" height={380} />
            </div>

            {/* Procurement Requisition Frequency & Unit Costs Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
              <div className="bg-slate-50/50 dark:bg-slate-900/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-purple-600" /> {t('most_requested_requisitions', 'Most Requested Supply Requisitions')}
                </h4>
                <ReactApexChart options={reqBarOptions} series={reqChartSeries} type="bar" height={200} />
              </div>

              <div className="bg-slate-50/50 dark:bg-slate-900/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5 text-pink-600" /> {t('highest_cost_catalog_items', 'Highest Unit Cost Catalog Items')}
                </h4>
                <ReactApexChart options={costBarOptions} series={costChartSeries} type="bar" height={200} />
              </div>
            </div>
          </div>

          <div className="analytics-expenses__card bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="analytics-dashboard__subtitle font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-600" /> {t('bills_utilities_heading', 'Bills & Utilities Analytics')}
              </h3>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                {t('this_period_total_label', 'This period')}: ₹{totalBillsThisPeriod.toLocaleString('en-IN')}
              </span>
            </div>
            {sortedBillsByType.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{t('bills_monthly_trend_label', 'Monthly Trend')}</h4>
                  <ReactApexChart options={billsTrendOptions} series={billsTrendSeries} type="bar" height={280} />
                </div>
                <div>
                  <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{t('bills_by_type_label', 'Which Bill Costs the Most')}</h4>
                  <ReactApexChart options={billsByTypeOptions} series={billsByTypeSeries} type="donut" height={280} />
                </div>
              </div>
            ) : (
              <p className="text-slate-400 text-center py-8">{t('no_bills_data', 'No "Bills" category expenses recorded yet for this period.')}</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: PROFIT & LOSS */}
      {activeTab === 'profit_loss' && (
        <div className="analytics-profit-loss space-y-6">
          <div className="analytics-profit-loss__card bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <div className="analytics-profit-loss__header flex items-center justify-between">
              <h3 className="analytics-dashboard__subtitle analytics-profit-loss__title font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
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
                      <p className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase">{t('total_income_label', 'Total Income')}</p>
                      <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">₹{income.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800">
                      <p className="text-[10px] font-semibold text-red-800 dark:text-red-300 uppercase">{t('total_expenses_label', 'Total Expenses')}</p>
                      <p className="text-xl font-extrabold text-red-700 dark:text-red-400 mt-1">₹{expensesPL.toLocaleString('en-IN')}</p>
                    </div>
                    <div className={`p-4 rounded-xl border ${netPL >= 0 ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' : 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'}`}>
                      <p className={`text-[10px] font-semibold uppercase ${netPL >= 0 ? 'text-blue-800 dark:text-blue-300' : 'text-orange-800 dark:text-orange-300'}`}>Net {netPL >= 0 ? t('net_profit_label', 'Net Profit') : t('net_loss_label', 'Loss')}</p>
                      <p className={`text-xl font-extrabold mt-1 ${netPL >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-orange-700 dark:text-orange-400'}`}>₹{Math.abs(netPL).toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Donut Chart: Income Categories */}
                    <div className="bg-slate-50/50 dark:bg-slate-900/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 text-center">{t('revenue_streams_breakdown_label', 'Income Sources Distribution')}</h4>
                      {pLIncomeSeries.length > 0 ? (
                        <ReactApexChart options={pLIncomeChartOptions} series={pLIncomeSeries} type="donut" height={280} />
                      ) : (
                        <p className="text-slate-400 text-center py-12 text-xs">{t('no_income_data', 'No income recorded for this period.')}</p>
                      )}
                    </div>
                    {/* Donut Chart: Expense Categories */}
                    <div className="bg-slate-50/50 dark:bg-slate-900/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 text-center">{t('expense_categories_breakdown_label', 'Expense Categories Distribution')}</h4>
                      {pLExpenseSeries.length > 0 ? (
                        <ReactApexChart options={pLExpenseChartOptions} series={pLExpenseSeries} type="donut" height={280} />
                      ) : (
                        <p className="text-slate-400 text-center py-12 text-xs">{t('no_expense_data', 'No expenses recorded for this period.')}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}



      {/* TAB 8: CASH FLOW */}
      {activeTab === 'cash_flow' && (
        <div className="analytics-cash-flow space-y-6">
          <div className="analytics-cash-flow__card bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <div className="analytics-cash-flow__header flex items-center justify-between">
              <h3 className="analytics-dashboard__subtitle analytics-cash-flow__title font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
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
                      <p className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase">{t('cash_inflow_label', 'Cash Inflow')}</p>
                      <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">₹{cashIn.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800">
                      <p className="text-[10px] font-semibold text-red-800 dark:text-red-300 uppercase">{t('cash_outflow_label', 'Cash Outflow')}</p>
                      <p className="text-xl font-extrabold text-red-700 dark:text-red-400 mt-1">₹{cashOut.toLocaleString('en-IN')}</p>
                    </div>
                    <div className={`p-4 rounded-xl border ${netCash >= 0 ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' : 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'}`}>
                      <p className={`text-[10px] font-semibold uppercase ${netCash >= 0 ? 'text-blue-800 dark:text-blue-300' : 'text-orange-800 dark:text-orange-300'}`}>{t('net_cash_flow_label', 'Net Cash Flow')}</p>
                      <p className={`text-xl font-extrabold mt-1 ${netCash >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-orange-700 dark:text-orange-400'}`}>{netCash >= 0 ? '+' : '-'}₹{Math.abs(netCash).toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Donut Chart: Cash Inflow Categories */}
                    <div className="bg-slate-50/50 dark:bg-slate-900/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 text-center">{t('cash_inflow_breakdown_label', 'Inflow Sources Distribution')}</h4>
                      {cashInflowSeries.length > 0 ? (
                        <ReactApexChart options={cashInflowChartOptions} series={cashInflowSeries} type="donut" height={280} />
                      ) : (
                        <p className="text-slate-400 text-center py-12 text-xs">{t('no_inflow_data', 'No inflow recorded for this period.')}</p>
                      )}
                    </div>
                    {/* Donut Chart: Cash Outflow Categories */}
                    <div className="bg-slate-50/50 dark:bg-slate-900/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
                      <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 text-center">{t('cash_outflow_breakdown_label', 'Outflow Categories Distribution')}</h4>
                      {cashOutflowSeries.length > 0 ? (
                        <ReactApexChart options={cashOutflowChartOptions} series={cashOutflowSeries} type="donut" height={280} />
                      ) : (
                        <p className="text-slate-400 text-center py-12 text-xs">{t('no_outflow_data', 'No outflow recorded for this period.')}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Payment Methods Share */}
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            <h3 className="analytics-dashboard__subtitle font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2 mb-4">
              <PieChart className="w-4 h-4 text-emerald-600" /> {t('payment_methods_share_heading', 'Payment Methods Distribution')}
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <div>
                <ReactApexChart options={paymentMethodPieOptions} series={paymentMethodPieSeries} type="donut" height={320} />
              </div>
              <div className="space-y-3.5">
                {paymentMethodPieLabels.map((label, index) => {
                  const val = paymentMethodPieSeries[index] || 0;
                  const totalVal = paymentMethodPieSeries.reduce((s, v) => s + v, 0) || 1;
                  const pct = (val / totalVal) * 100;
                  return (
                    <div key={label}>
                      <div className="flex justify-between font-semibold text-slate-800 dark:text-slate-200 mb-1">
                        <span>{label}</span>
                        <span className="font-extrabold">₹{val.toLocaleString('en-IN')} ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: paymentMethodPieOptions.colors[index % paymentMethodPieOptions.colors.length]
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
                {paymentMethodPieSeries.length === 0 && (
                  <p className="text-slate-400 text-center py-4">{t('no_payment_data', 'No payment records for this period.')}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
