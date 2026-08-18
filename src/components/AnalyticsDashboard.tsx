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
  Zap,
  TrendingDown,
  Activity
} from 'lucide-react';
import ReactApexChart from 'react-apexcharts';
import { BillingReceipt } from '../types';
import { GUEST_STATUS_CHECKED_OUT, GUEST_STATUS_CHECKEDOUT_LEGACY } from '../constants/guestStatus';
import {
  fetchKitchenPurchasesFromDB,
  fetchFinancialLedger,
  fetchServedLogsFromDB,
  fetchInventoryFromDB,
  fetchStockRequestsFromDB,
  fetchRecipesFromDB,
  fetchGuestExtraChargesFromDB
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
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings' | 'pace' | 'kitchen' | 'expenses' | 'profit_loss' | 'fluctuations'>(() => {
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
  const [recipes, setRecipes] = useState<any[]>([]);
  const [extraCharges, setExtraCharges] = useState<any[]>([]);
  // Fluctuations tab item picker - capped at 5 so the price-trend chart never
  // gets so busy it's unreadable. Defaults to the 5 most volatile items once
  // purchase data has loaded (see the effect near the Fluctuations
  // computations below), then stays exactly whatever the user checks/unchecks.
  const [selectedFluctuationItems, setSelectedFluctuationItems] = useState<string[]>([]);
  const [fluctuationSelectionInitialized, setFluctuationSelectionInitialized] = useState(false);
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
    fetchGuestExtraChargesFromDB().then((data) => {
      if (Array.isArray(data)) {
        setExtraCharges(data);
      }
    });
    fetchRecipesFromDB().then((data) => {
      if (Array.isArray(data)) {
        setRecipes(data);
      }
    });
  }, []);

  useEffect(() => {
    if (activeMenuItemKey === 'purchase_analytics') setActiveTab('expenses');
    else if (activeMenuItemKey === 'dashboard_analytics') setActiveTab('overview');
  }, [activeMenuItemKey]);

  useEffect(() => {
    // Also fires on 'bookings': Profit per Room Night moved there and reads
    // from this same ledgerMonth-scoped fetch (17 Aug 2026).
    if (activeTab === 'profit_loss' || activeTab === 'bookings') {
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

  const filterByDate = <T extends { date?: string; checkinDate?: string; orderTime?: string; purchaseDate?: string }>(items: T[], field: 'date' | 'checkinDate' | 'orderTime' | 'purchaseDate' = 'date'): T[] => {
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
  // Real field is purchaseDate, not date (see get_kitchen_purchases) - this
  // was silently zeroing every Kitchen Purchases stat whenever a Day/Week/
  // Month/Year filter was active (the 'all' default has no bound, so it
  // short-circuited past the bug and looked fine until someone filtered).
  const filteredKitchenPurchases = filterByDate(kitchenPurchases, 'purchaseDate');
  // extraCharges is joined to its guest's checkinDate server-side (see
  // get_guest_extra_charges in guests.php) so it can be filtered the same way
  // as every other booking-linked list here.
  const filteredExtraCharges = filterByDate(extraCharges, 'checkinDate');

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
        const key = item.menuItemId != null ? String(item.menuItemId) : name;
        if (!acc[key]) {
          acc[key] = { name, menuItemId: item.menuItemId, count: 0, revenue: 0 };
        }
        acc[key].count += (item.quantity || 1);
        acc[key].revenue += (item.unitPrice || 0) * (item.quantity || 1);
      });
    }
    return acc;
  }, {} as Record<string, { name: string; menuItemId?: number; count: number; revenue: number }>);

  const sortedMenuItems = Object.entries(menuItemSales)
    .sort((a, b) => b[1].revenue - a[1].revenue);

  // Dish Profitability - joins order sales against Beta Recipe Builder's
  // per-serving ingredient costing (dish_recipes.ingredients: quantity is
  // already per-serving, so sum(quantity * costPerUnit) = cost per portion -
  // see KitchenManagement.tsx's costPerPortion calc, same formula reused
  // here). Only dishes with an actual costed recipe can show profit/margin;
  // everything else still counts toward popularity (order count).
  const recipeCostByMenuItemId = recipes.reduce((acc: Record<number, number>, r: any) => {
    const cost = (r.ingredients || []).reduce((s: number, ing: any) => s + (Number(ing.quantity) || 0) * (Number(ing.costPerUnit) || 0), 0);
    acc[r.menuItemId] = cost;
    return acc;
  }, {} as Record<number, number>);

  const dishPerformance = Object.values(menuItemSales).map((d) => {
    const costPerUnit = d.menuItemId != null ? recipeCostByMenuItemId[d.menuItemId] : undefined;
    const hasCost = costPerUnit !== undefined;
    const totalCost = hasCost ? (costPerUnit as number) * d.count : undefined;
    const profit = hasCost ? d.revenue - (totalCost as number) : undefined;
    const marginPct = hasCost && d.revenue > 0 ? ((profit as number) / d.revenue) * 100 : undefined;
    return { ...d, costPerUnit, totalCost, profit, marginPct, hasCost };
  });

  const costedDishes = dishPerformance.filter((d) => d.hasCost);
  const mostProfitableDishes = [...costedDishes].sort((a, b) => (b.profit as number) - (a.profit as number)).slice(0, 5);
  const leastProfitableDishes = [...costedDishes].sort((a, b) => (a.profit as number) - (b.profit as number)).slice(0, 5);
  const mostOrderedDishes = [...dishPerformance].sort((a, b) => b.count - a.count).slice(0, 5);
  const leastOrderedDishes = [...dishPerformance].sort((a, b) => a.count - b.count).slice(0, 5);

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
  // the 'Staff Advance' Cost Category Group (relabeled "Staff Salaries &
  // Adv." in the Add Expense form - see PettyCashManagement.tsx's category
  // dropdown; this app has no separate 'Salaries' category, that was a stale
  // assumption that left this chart permanently at 0% regardless of how much
  // payroll was actually logged). Revenue-per-month reuses the same room +
  // kitchen definition as totalGrossRevenue above, just bucketed.
  const laborByMonth = filteredExpenses
    .filter((e: any) => (e.category || e.costCategory) === 'Staff Advance' && e.type === 'Expense')
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
    yaxis: { labels: { formatter: (val: number) => `₹${Math.round(val).toLocaleString('en-IN')}` } },
    grid: { strokeDashArray: 4 },
    dataLabels: { enabled: false },
    legend: { show: false },
  };

  const roomRevenueBarSeries = [
    { name: 'Revenue', data: roomPerformance.map((r) => r.revenue) }
  ];

  // Excludes 'Staff Advance' (payroll) - grouping by description turned each
  // staff member's own "Monthly Salary Payout - <name> (<role>)" line into
  // its own bar, which read as ranking individual staff pay rather than
  // showing recurring purchase/bill items. Payroll already has its own
  // "Labor Cost as % of Revenue" trend below; this chart is for what's being
  // bought, not who's being paid.
  const expenseItems = filteredExpenses
    .filter((e) => e.type === 'Expense' && (e.costCategory || e.category) !== 'Staff Advance')
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
    yaxis: { labels: { formatter: (val: number) => `₹${Math.round(val).toLocaleString('en-IN')}` } },
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
    yaxis: { labels: { formatter: (val: number) => `${Math.round(val)}` } },
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
    yaxis: { labels: { formatter: (val: number) => `₹${Math.round(val).toLocaleString('en-IN')}` } },
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
    yaxis: { labels: { formatter: (val: number) => `₹${Math.round(val).toLocaleString('en-IN')}` } },
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
    xaxis: { categories: sortedMenuItems.slice(0, 10).map(([, data]) => data.name) },
    yaxis: { labels: { formatter: (val: number) => `₹${Math.round(val).toLocaleString('en-IN')}` } },
    grid: { strokeDashArray: 4 },
    dataLabels: { enabled: false },
    legend: { show: false },
  };

  const foodBarSeries = [
    { name: 'Revenue', data: sortedMenuItems.slice(0, 10).map(([, data]) => data.revenue) }
  ];

  // Most/Least Profitable Dishes - bar charts instead of ranked text lists
  // (16 Aug 2026: this page is meant to be charts-only, see the 15 Aug 2026
  // "remove all remaining data tables" pass - a numbered list of name+profit
  // rows is the same information in table form, just without the borders).
  // Diverging scale (profit can go negative) so a loss-making "least
  // profitable" dish still reads correctly rather than an all-positive bar.
  const dishProfitAbsMax = Math.max(1, ...costedDishes.map((d) => Math.abs(d.profit ?? 0)));
  const mostProfitableDishesBarOptions: any = {
    chart: { type: 'bar', height: 220, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, barHeight: '55%', borderRadius: 4 } },
    colors: [successColor],
    dataLabels: { enabled: true, formatter: (val: number) => `₹${val.toLocaleString('en-IN')}` },
    xaxis: { categories: mostProfitableDishes.map((d) => d.name), min: -dishProfitAbsMax, max: dishProfitAbsMax },
    grid: { strokeDashArray: 4 },
  };
  const mostProfitableDishesBarSeries = [{ name: 'Profit', data: mostProfitableDishes.map((d) => Number((d.profit ?? 0).toFixed(0))) }];

  const leastProfitableDishesBarOptions: any = {
    chart: { type: 'bar', height: 220, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, barHeight: '55%', borderRadius: 4 } },
    colors: [dangerColor],
    dataLabels: { enabled: true, formatter: (val: number) => `₹${val.toLocaleString('en-IN')}` },
    xaxis: { categories: leastProfitableDishes.map((d) => d.name), min: -dishProfitAbsMax, max: dishProfitAbsMax },
    grid: { strokeDashArray: 4 },
  };
  const leastProfitableDishesBarSeries = [{ name: 'Profit', data: leastProfitableDishes.map((d) => Number((d.profit ?? 0).toFixed(0))) }];

  // Both charts share one x-axis max (the global highest order count) so bar
  // LENGTH is actually comparable between them - each ApexCharts bar chart
  // otherwise auto-scales to its own data's max, which made a dish ordered
  // once fill the "Least Ordered" chart exactly as full as the top seller
  // filled "Most Ordered" (found 16 Aug 2026: read as "these are ordered
  // equally often" when the real counts could be 10x apart).
  const dishOrderCountMax = Math.max(1, ...dishPerformance.map((d) => d.count));

  const mostOrderedDishesBarOptions: any = {
    chart: { type: 'bar', height: 220, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, barHeight: '55%', borderRadius: 4 } },
    colors: [successColor],
    dataLabels: { enabled: true, formatter: (val: number) => `${val}x` },
    xaxis: { categories: mostOrderedDishes.map((d) => d.name), max: dishOrderCountMax },
    grid: { strokeDashArray: 4 },
  };
  const mostOrderedDishesBarSeries = [{ name: 'Orders', data: mostOrderedDishes.map((d) => d.count) }];

  const leastOrderedDishesBarOptions: any = {
    chart: { type: 'bar', height: 220, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, barHeight: '55%', borderRadius: 4 } },
    colors: [dangerColor],
    dataLabels: { enabled: true, formatter: (val: number) => `${val}x` },
    xaxis: { categories: leastOrderedDishes.map((d) => d.name), max: dishOrderCountMax },
    grid: { strokeDashArray: 4 },
  };
  const leastOrderedDishesBarSeries = [{ name: 'Orders', data: leastOrderedDishes.map((d) => d.count) }];

  // Sales vs Purchases trended day-by-day (16 Aug 2026 - the previous 2-bar
  // "Kitchen Sales" vs "Kitchen Purchases" snapshot only ever showed two
  // period totals side by side, which can't show whether purchases are
  // tracking sales or drifting away from them over time).
  const kitchenTrendByDate = (() => {
    const salesByDate: Record<string, number> = {};
    filteredOrders.forEach((o: any) => {
      const key = (o.orderTime || '').split(' ')[0].split('T')[0];
      if (!key) return;
      salesByDate[key] = (salesByDate[key] || 0) + (Number(o.totalAmount) || 0);
    });
    const purchasesByDate: Record<string, number> = {};
    filteredKitchenPurchases.forEach((p: any) => {
      // get_kitchen_purchases aliases this purchase_date as purchaseDate, not
      // date - reading p.date here always came back undefined, which is why
      // the purchases line rendered flat at zero regardless of how much
      // purchase data existed.
      const key = (p.purchaseDate || '').split(' ')[0].split('T')[0];
      if (!key) return;
      purchasesByDate[key] = (purchasesByDate[key] || 0) + (Number(p.totalPrice) || 0);
    });
    const dates = Array.from(new Set([...Object.keys(salesByDate), ...Object.keys(purchasesByDate)])).sort();
    return {
      labels: dates.map((d) => { const [, m, day] = d.split('-'); return `${day}/${m}`; }),
      sales: dates.map((d) => salesByDate[d] || 0),
      purchases: dates.map((d) => purchasesByDate[d] || 0),
    };
  })();

  const kitchenTrendOptions: any = {
    chart: { type: 'line', height: 320, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    colors: [successColor, dangerColor],
    stroke: { curve: 'smooth', width: 2.5 },
    markers: { size: 3 },
    xaxis: { categories: kitchenTrendByDate.labels },
    yaxis: { labels: { formatter: (val: number) => `₹${Math.round(val).toLocaleString('en-IN')}` } },
    grid: { strokeDashArray: 4 },
    dataLabels: { enabled: false },
    legend: { position: 'top' },
    tooltip: { y: { formatter: (val: number) => `₹${val.toLocaleString('en-IN')}` } },
  };

  const kitchenTrendSeries = [
    { name: 'Kitchen Sales', data: kitchenTrendByDate.sales },
    { name: 'Kitchen Purchases', data: kitchenTrendByDate.purchases },
  ];

  // ─── Fluctuations Tab: per-item purchase-price volatility & cadence ───
  // Groups every kitchen purchase by item name (not date-filtered by the
  // Overview dateFilter - fluctuation is inherently a trend-over-time
  // question, so this always looks at the full purchase history available)
  // and computes, per item: how often it's actually bought and how much its
  // unit_cost swings between purchases - "am I buying ginger every week or
  // twice a week, and how much is the price actually moving."
  const purchasesByItemName: Record<string, { date: string; unitCost: number }[]> = {};
  kitchenPurchases.forEach((p: any) => {
    const name = (p.itemName || '').trim();
    if (!name) return;
    const dateKey = (p.purchaseDate || '').split(' ')[0].split('T')[0];
    const cost = Number(p.unitCost) || 0;
    if (!dateKey || cost <= 0) return;
    if (!purchasesByItemName[name]) purchasesByItemName[name] = [];
    purchasesByItemName[name].push({ date: dateKey, unitCost: cost });
  });
  Object.values(purchasesByItemName).forEach((points) => points.sort((a, b) => a.date.localeCompare(b.date)));

  const fluctuationStats = Object.entries(purchasesByItemName)
    .filter(([, points]) => points.length >= 2)
    .map(([name, points]) => {
      const prices = points.map((p) => p.unitCost);
      const mean = prices.reduce((s, v) => s + v, 0) / prices.length;
      const variance = prices.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / prices.length;
      const stdDev = Math.sqrt(variance);
      const fluctuationPct = mean > 0 ? (stdDev / mean) * 100 : 0;
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const firstDate = new Date(points[0].date);
      const lastDate = new Date(points[points.length - 1].date);
      const daySpan = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / 86400000);
      const avgFrequencyDays = daySpan / (points.length - 1);
      const priceChangePct = points[0].unitCost > 0 ? ((points[points.length - 1].unitCost - points[0].unitCost) / points[0].unitCost) * 100 : 0;
      return { name, points, mean, fluctuationPct, minPrice, maxPrice, count: points.length, avgFrequencyDays, priceChangePct };
    })
    .sort((a, b) => b.fluctuationPct - a.fluctuationPct);

  const top5FluctuatingItems = fluctuationStats.slice(0, 5).map((s) => s.name);

  useEffect(() => {
    if (!fluctuationSelectionInitialized && top5FluctuatingItems.length > 0) {
      setSelectedFluctuationItems(top5FluctuatingItems);
      setFluctuationSelectionInitialized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fluctuationSelectionInitialized, kitchenPurchases.length]);

  const toggleFluctuationItem = (name: string) => {
    setSelectedFluctuationItems((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      if (prev.length >= 5) return prev;
      return [...prev, name];
    });
  };

  const fluctuationColors = ['#2563eb', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];
  const selectedFluctuationStats = fluctuationStats.filter((s) => selectedFluctuationItems.includes(s.name));

  const fluctuationChartOptions: any = {
    chart: { type: 'line', height: 340, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    colors: fluctuationColors,
    stroke: { curve: 'smooth', width: 2.5 },
    markers: { size: 4 },
    xaxis: { type: 'datetime', title: { text: t('purchase_date_axis', 'Purchase Date') } },
    yaxis: { title: { text: t('unit_cost_axis', 'Unit Cost (₹)') }, labels: { formatter: (v: number) => `₹${v.toFixed(0)}` } },
    grid: { strokeDashArray: 4 },
    dataLabels: { enabled: false },
    legend: { position: 'top' },
    tooltip: { x: { format: 'dd/MM/yyyy' }, y: { formatter: (val: number) => `₹${val.toLocaleString('en-IN')}` } },
  };

  const fluctuationChartSeries = selectedFluctuationStats.map((s) => ({
    name: s.name,
    data: s.points.map((p) => ({ x: new Date(p.date).getTime(), y: p.unitCost })),
  }));

  const expensesBarOptions: any = {
    chart: { type: 'bar', height: 360, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    plotOptions: { bar: { borderRadius: 6, columnWidth: '60%' } },
    colors: [dangerColor],
    xaxis: { categories: sortedExpenseItems.slice(0, 15).map(([name]) => name) },
    yaxis: { labels: { formatter: (val: number) => `₹${Math.round(val).toLocaleString('en-IN')}` } },
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

  // Group P&L statement by category. Three corrections applied at grouping
  // time (found 16 Aug 2026 while reviewing the raw ledger category list -
  // 'Maintenance'/'Transport'/'Miscellaneous' etc. are legacy Cost Category
  // Group values from before that taxonomy was simplified and are left
  // as-is, they're real historical spend):
  //  1. 'Cash Drawer handover'/'Cash Drawer manual_adjustment' (posted by
  //     add_drawer_entry in petty_cash.php) record a staff member handing
  //     already-earned cash to the owner's safe - an internal custody
  //     transfer, not new revenue or a real expense. The guest payment that
  //     cash came from was already booked once (e.g. 'Guest Checkout
  //     Settlement'); counting the handover too double-counts it as an
  //     expense and understates Net Profit. Excluded entirely.
  //  2. 'Staff Advance' is an early/partial salary payout (the eventual
  //     "Pay Now" settlement nets it out via staff_advances - see
  //     CashDrawerManager.tsx's pendingPayout calc), not a distinct cost.
  //     Folded into 'Salaries' so admins see one true labor-cost figure
  //     instead of a fragmented, on-its-own-meaningless advance slice.
  //  3. 'Guest Registration Advance' (posted by add_guest in guests.php,
  //     when a booking collects a deposit) and 'Guest Checkout Settlement'
  //     (posted by save_receipt in receipts.php, for `grandTotal -
  //     advancePaid` - the remaining balance, never double-counting the
  //     advance) are the SAME accommodation stay split across two different
  //     moments in the guest lifecycle, not two different income sources.
  //     Showing them as separate donut slices answers "when was this room
  //     paid for" when the question that actually matters here is "how much
  //     did rooms earn" - folded into one 'Accommodation Revenue' figure so
  //     it reads next to 'Kitchen POS Sales' as an actual revenue stream.
  const isInternalCashMovement = (raw: string): boolean => (raw || '').startsWith('Cash Drawer');
  const normalizeLedgerCategory = (raw: string): string => {
    const cat = (raw || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (cat === 'Staff Advance') return 'Salaries';
    if (cat === 'Guest Registration Advance' || cat === 'Guest Checkout Settlement') return 'Accommodation Revenue';
    return cat;
  };

  const pLIncomeGroups = Object.entries(
    ledgerData
      .filter((l) => l.direction === 'credit' && !isInternalCashMovement(l.category))
      .reduce((acc: Record<string, number>, l) => {
        const cat = normalizeLedgerCategory(l.category || 'Other Income');
        acc[cat] = (acc[cat] || 0) + Number(l.amount || 0);
        return acc;
      }, {} as Record<string, number>)
  ).sort((a, b) => Number(b[1]) - Number(a[1]));

  const pLExpenseGroups = Object.entries(
    ledgerData
      .filter((l) => l.direction === 'debit' && !isInternalCashMovement(l.category))
      .reduce((acc: Record<string, number>, l) => {
        const cat = normalizeLedgerCategory(l.category || 'General Expense');
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

  // Profit per Room Night - lives on the Bookings tab (moved from P&L, 17 Aug
  // 2026) since it's a per-room hospitality KPI, not a P&L line item. Uses the
  // same ledgerMonth-scoped financial ledger as the P&L statement (not the
  // dateFilter-scoped filteredReceipts above), so the figure always matches
  // real ledger-posted P&L rather than a re-derived approximation.
  const ledgerMonthNights = receipts
    .filter((r) => r.checkinDate && r.checkinDate.startsWith(ledgerMonth))
    .reduce((sum, r) => sum + (r.nightsCount || 1), 0);
  const profitPerRoomNight = (() => {
    const income = ledgerData.filter((l) => l.direction === 'credit' && !isInternalCashMovement(l.category)).reduce((s, l) => s + Number(l.amount || 0), 0);
    const expensesPL = ledgerData.filter((l) => l.direction === 'debit' && !isInternalCashMovement(l.category)).reduce((s, l) => s + Number(l.amount || 0), 0);
    return ledgerMonthNights > 0 ? (income - expensesPL) / ledgerMonthNights : 0;
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

  // Group Booking Sources for pie chart. A booking converted from a synced
  // OTA calendar (Airbnb/Booking.com - see ConvertOtaBookingModal.tsx) never
  // sets bookingSource at all, only otaSource/otaSourceLabel - reading
  // bookingSource alone silently folded every OTA-origin guest into
  // 'Direct', hiding the online/OTA channel mix entirely (found 16 Aug
  // 2026). otaSourceLabel takes priority when present since it's the more
  // specific real source (e.g. "Airbnb"), falling back to the plain
  // Offline/Online choice from the manual booking form otherwise.
  const filteredBookings = filterByDate(guests, 'checkinDate');
  const bookingSourceCounts = filteredBookings.reduce((acc, g) => {
    const source = (g as any).otaSourceLabel || g.bookingSource || 'Direct';
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

  // Additional Charges Breakdown (Decoration Fees, Extra Housekeeping, Pet
  // Stay Charges, custom Misc templates) - what a guest paid for their
  // accommodation beyond base room rent. Room rent itself isn't broken down
  // further since it's just nights x rate, not a mix of charge types.
  const extraChargesTotal = filteredExtraCharges.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  const extraChargesByCategory = Object.entries(
    filteredExtraCharges.reduce((acc: Record<string, number>, c) => {
      const cat = c.category || 'Misc';
      acc[cat] = (acc[cat] || 0) + (Number(c.amount) || 0);
      return acc;
    }, {} as Record<string, number>)
  ).sort((a, b) => Number(b[1]) - Number(a[1]));

  const extraChargesSeries: number[] = extraChargesByCategory.map(([, amount]) => Number(amount));
  const extraChargesLabels: string[] = extraChargesByCategory.map(([cat]) => cat);
  const extraChargesChartOptions: any = {
    chart: { type: 'donut', height: 280, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    labels: extraChargesLabels,
    colors: ['#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#6b7280'],
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

  const { prepTimes, serveTimes, prepTimesByDish } = (() => {
    const prepTimes: number[] = [];
    const serveTimes: number[] = [];
    const prepTimesByDish: Record<string, number[]> = {};

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
            const dishName = (item.name || '').trim();
            if (dishName) {
              if (!prepTimesByDish[dishName]) prepTimesByDish[dishName] = [];
              prepTimesByDish[dishName].push(prepDiff);
            }
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

    return { prepTimes, serveTimes, prepTimesByDish };
  })();

  const avgPrepTime = prepTimes.length > 0 ? prepTimes.reduce((s, v) => s + v, 0) / prepTimes.length : 0;
  const avgServeTime = serveTimes.length > 0 ? serveTimes.reduce((s, v) => s + v, 0) / serveTimes.length : 0;

  // Fastest/Slowest Prepared Dishes - per-dish average of the same
  // order_time -> ready_at gap the aggregate "Average Chef Preparation Time"
  // above already computes, just grouped by dish instead of collapsed into
  // one property-wide number.
  const dishPrepAverages = Object.entries(prepTimesByDish)
    .map(([name, times]) => ({ name, avgMinutes: times.reduce((s, v) => s + v, 0) / times.length, samples: times.length }))
    .filter((d) => d.samples >= 1);
  const fastestPreparedDishes = [...dishPrepAverages].sort((a, b) => a.avgMinutes - b.avgMinutes).slice(0, 5);
  const slowestPreparedDishes = [...dishPrepAverages].sort((a, b) => b.avgMinutes - a.avgMinutes).slice(0, 5);
  const dishPrepTimeMax = Math.max(1, ...dishPrepAverages.map((d) => d.avgMinutes));

  const fastestPreparedBarOptions: any = {
    chart: { type: 'bar', height: 220, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, barHeight: '55%', borderRadius: 4 } },
    colors: [successColor],
    dataLabels: { enabled: true, formatter: (val: number) => `${val.toFixed(1)}m` },
    xaxis: { categories: fastestPreparedDishes.map((d) => d.name), max: dishPrepTimeMax },
    grid: { strokeDashArray: 4 },
  };
  const fastestPreparedBarSeries = [{ name: 'Avg Prep Time', data: fastestPreparedDishes.map((d) => Number(d.avgMinutes.toFixed(1))) }];

  const slowestPreparedBarOptions: any = {
    chart: { type: 'bar', height: 220, fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, barHeight: '55%', borderRadius: 4 } },
    colors: [dangerColor],
    dataLabels: { enabled: true, formatter: (val: number) => `${val.toFixed(1)}m` },
    xaxis: { categories: slowestPreparedDishes.map((d) => d.name), max: dishPrepTimeMax },
    grid: { strokeDashArray: 4 },
  };
  const slowestPreparedBarSeries = [{ name: 'Avg Prep Time', data: slowestPreparedDishes.map((d) => Number(d.avgMinutes.toFixed(1))) }];

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

  return (
    <div className="analytics-dashboard-container space-y-6 text-slate-800 dark:text-slate-200">
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

      {/* Dynamic Navigation Tabs (High-Affordance Touch-Friendly Buttons) */}
      <div className="analytics-tab-bar flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 pt-0.5">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`btn-analytics-tab-overview px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 flex items-center gap-1.5 active:scale-98 ${
            activeTab === 'overview'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 hover:border-slate-300 shadow-2xs'
          }`}
        >
          <TrendingUp className="w-4 h-4 shrink-0" />
          <span>{t('overview_tab_label', 'Overview')}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('bookings')}
          className={`btn-analytics-tab-bookings px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 flex items-center gap-1.5 active:scale-98 ${
            activeTab === 'bookings'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 hover:border-slate-300 shadow-2xs'
          }`}
        >
          <Calendar className="w-4 h-4 shrink-0" />
          <span>{t('bookings_tab_label', 'Bookings')}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pace')}
          className={`btn-analytics-tab-pace px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 flex items-center gap-1.5 active:scale-98 ${
            activeTab === 'pace'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 hover:border-slate-300 shadow-2xs'
          }`}
        >
          <CalendarClock className="w-4 h-4 shrink-0" />
          <span>{t('pace_tab_label', 'Pace')}</span>
        </button>
        {kitchenModuleEnabled && (
          <button
            type="button"
            onClick={() => setActiveTab('kitchen')}
            className={`btn-analytics-tab-kitchen px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 flex items-center gap-1.5 active:scale-98 ${
              activeTab === 'kitchen'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 hover:border-slate-300 shadow-2xs'
            }`}
          >
            <Utensils className="w-4 h-4 shrink-0" />
            <span>{t('kitchen_food_pos_tab_label', 'Kitchen & Food POS')}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('expenses')}
          className={`btn-analytics-tab-purchases px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 flex items-center gap-1.5 active:scale-98 ${
            activeTab === 'expenses'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 hover:border-slate-300 shadow-2xs'
          }`}
        >
          <ShoppingBag className="w-4 h-4 shrink-0" />
          <span>{t('expenses_tab_label', 'Expenses')}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('profit_loss')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 flex items-center gap-1.5 active:scale-98 ${
            activeTab === 'profit_loss'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 hover:border-slate-300 shadow-2xs'
          }`}
        >
          <BarChart3 className="w-4 h-4 shrink-0" />
          <span>{t('pnl_tab_label', 'P&L')}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('fluctuations')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 flex items-center gap-1.5 active:scale-98 ${
            activeTab === 'fluctuations'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 hover:border-slate-300 shadow-2xs'
          }`}
        >
          <Activity className="w-4 h-4 shrink-0" />
          <span>{t('fluctuations_tab_label', 'Fluctuations')}</span>
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
              {bookingSourcePieSeries.length > 0 ? (
                <ReactApexChart options={bookingSourcePieOptions} series={bookingSourcePieSeries} type="donut" height={280} />
              ) : (
                <p className="text-slate-400 text-center py-4">{t('no_source_data', 'No booking sources for this period.')}</p>
              )}
            </div>

            {/* Card Right: Hospitality Key Performance Indicators (ARR, ALOS, Occupancy, Profit/Room Night) */}
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
              <h3 className="analytics-dashboard__subtitle font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-600" /> {t('hospitality_kpi_metrics_heading', 'Hospitality Performance Metrics (BI)')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800 text-center">
                  <p className="text-[10px] font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wider">{t('arr_metric_label', 'Average Room Rate (ARR)')}</p>
                  <p className="text-xl font-extrabold text-blue-700 dark:text-blue-400 mt-1">₹{adr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                  <p className="text-[9px] text-slate-500 mt-1">{t('arr_metric_subtext', 'Room revenue divided by occupied room nights')}</p>
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

                <div className={`p-4 rounded-xl border text-center ${profitPerRoomNight >= 0 ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${profitPerRoomNight >= 0 ? 'text-amber-800 dark:text-amber-300' : 'text-rose-800 dark:text-rose-300'}`}>{t('profit_per_room_night_label', 'Profit per Room Night')}</p>
                  <p className={`text-xl font-extrabold mt-1 ${profitPerRoomNight >= 0 ? 'text-amber-700 dark:text-amber-400' : 'text-rose-700 dark:text-rose-400'}`}>₹{Math.abs(Math.round(profitPerRoomNight)).toLocaleString('en-IN')}</p>
                  <p className="text-[9px] text-slate-500 mt-1">{t('profit_per_room_night_subtext', 'Ledger P&L for')} {ledgerMonth} {t('profit_per_room_night_subtext_suffix', 'divided by room nights that month')}</p>
                </div>
              </div>
              <div className="text-[10px] text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                <strong>BI Metric Note:</strong> Available room capacity is calculated based on <strong>{totalRooms} active rooms</strong> over the selected date range ({periodDays || 'all-time'} days).
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="analytics-dashboard__subtitle font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-amber-600" /> {t('additional_charges_breakdown_heading', 'Additional Charges Breakdown')}
              </h3>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                ₹{extraChargesTotal.toLocaleString('en-IN')} {t('total_label', 'total')}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              {t('additional_charges_note', 'What guests paid on top of base room rent - Decoration, Extra Housekeeping, Pet Stay, and custom Misc Charges templates added at booking. Room rent itself isn\'t split further since it\'s just nights x rate.')}
            </p>
            {extraChargesSeries.length > 0 ? (
              <ReactApexChart options={extraChargesChartOptions} series={extraChargesSeries} type="donut" height={280} />
            ) : (
              <p className="text-slate-400 text-center py-8 text-xs">{t('no_additional_charges_data', 'No additional charges recorded for this period.')}</p>
            )}
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
                <ReactApexChart options={kitchenTrendOptions} series={kitchenTrendSeries} type="line" height={300} />
              </div>
            </div>

            {/* Dish Profitability & Popularity */}
            <div className="bg-slate-50/20 dark:bg-slate-900/10 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4 mt-6">
              <h3 className="analytics-dashboard__subtitle font-extrabold text-slate-900 dark:text-white text-xs flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-emerald-600" /> {t('dish_profitability_heading', 'Dish Profitability')}
              </h3>
              {costedDishes.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" /> {t('most_profitable_dishes_label', 'Most Profitable Dishes')}
                    </h4>
                    <ReactApexChart options={mostProfitableDishesBarOptions} series={mostProfitableDishesBarSeries} type="bar" height={220} />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <TrendingDown className="w-3.5 h-3.5" /> {t('least_profitable_dishes_label', 'Least Profitable Dishes')}
                    </h4>
                    <ReactApexChart options={leastProfitableDishesBarOptions} series={leastProfitableDishesBarSeries} type="bar" height={220} />
                  </div>
                </div>
              ) : (
                <p className="text-slate-400 text-center py-6 text-xs">{t('no_dish_costing_data', 'No dishes have a costed recipe yet - add ingredient costs in Kitchen → Beta Recipe Builder to see profit per dish.')}</p>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 mt-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 mt-4">{t('most_ordered_dishes_label', 'Most Ordered Dishes')}</h4>
                  <ReactApexChart options={mostOrderedDishesBarOptions} series={mostOrderedDishesBarSeries} type="bar" height={220} />
                </div>
                <div>
                  <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 mt-4">{t('least_ordered_dishes_label', 'Least Ordered Dishes')}</h4>
                  <ReactApexChart options={leastOrderedDishesBarOptions} series={leastOrderedDishesBarSeries} type="bar" height={220} />
                </div>
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

              {dishPrepAverages.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{t('fastest_prepared_dishes_label', 'Fastest Prepared Dishes')}</h4>
                    <ReactApexChart options={fastestPreparedBarOptions} series={fastestPreparedBarSeries} type="bar" height={220} />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{t('slowest_prepared_dishes_label', 'Slowest Prepared Dishes')}</h4>
                    <ReactApexChart options={slowestPreparedBarOptions} series={slowestPreparedBarSeries} type="bar" height={220} />
                  </div>
                </div>
              )}
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
              const income = ledgerData.filter((l) => l.direction === 'credit' && !isInternalCashMovement(l.category)).reduce((s, l) => s + Number(l.amount || 0), 0);
              const expensesPL = ledgerData.filter((l) => l.direction === 'debit' && !isInternalCashMovement(l.category)).reduce((s, l) => s + Number(l.amount || 0), 0);
              const netPL = income - expensesPL;
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800 flex flex-col justify-between">
                      <p className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase">{t('total_income_label', 'Total Income')}</p>
                      <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">₹{income.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800 flex flex-col justify-between">
                      <p className="text-[10px] font-semibold text-red-800 dark:text-red-300 uppercase">{t('total_expenses_label', 'Total Expenses')}</p>
                      <p className="text-xl font-extrabold text-red-700 dark:text-red-400 mt-1">₹{expensesPL.toLocaleString('en-IN')}</p>
                    </div>
                    <div className={`p-4 rounded-xl border flex flex-col justify-between ${netPL >= 0 ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' : 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'}`}>
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

          {/* Payment Methods Share - merged in from the former standalone
              "Cash Flow" tab (16 Aug 2026): its Cash Inflow/Outflow totals
              and category donuts were computed from the exact same
              ledgerData, filtered and grouped identically to Income/Expenses
              above - a literal duplicate under a different name, not a
              distinct cash-basis-vs-accrual view (this app only has one
              ledger, settled at the time of the transaction, so there's no
              accrual/cash timing gap to show separately). This payment-method
              breakdown was the only piece that tab added on top. */}
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            <h3 className="analytics-dashboard__subtitle font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2 mb-4">
              <PieChart className="w-4 h-4 text-emerald-600" /> {t('payment_methods_share_heading', 'Payment Methods Distribution')}
            </h3>
            {paymentMethodPieSeries.length > 0 ? (
              <ReactApexChart options={paymentMethodPieOptions} series={paymentMethodPieSeries} type="donut" height={320} />
            ) : (
              <p className="text-slate-400 text-center py-4">{t('no_payment_data', 'No payment records for this period.')}</p>
            )}
          </div>
        </div>
      )}

      {/* TAB 8: FLUCTUATIONS - purchase price volatility & buying cadence */}
      {activeTab === 'fluctuations' && (
        <div className="analytics-fluctuations space-y-6">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="analytics-dashboard__subtitle font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600" /> {t('price_fluctuation_trend_heading', 'Item Price Trend')}
              </h3>
              <span className="text-[10px] text-slate-400">
                {t('fluctuation_selection_count', 'Showing')} {selectedFluctuationItems.length}/5
              </span>
            </div>
            {fluctuationChartSeries.length > 0 ? (
              <ReactApexChart options={fluctuationChartOptions} series={fluctuationChartSeries} type="line" height={340} />
            ) : (
              <p className="text-slate-400 text-center py-12 text-xs">{t('no_fluctuation_data', 'No repeat purchases logged yet - an item needs at least 2 purchases to show a price trend.')}</p>
            )}
            <p className="text-[10px] text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
              {t('fluctuation_default_note', 'Defaults to the 5 most volatile items (by price swing relative to average cost). Use the checklist below to pick your own - up to 5 at a time.')}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <h3 className="analytics-dashboard__subtitle font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-purple-600" /> {t('select_items_heading', 'Select Items')}
            </h3>
            {fluctuationStats.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {fluctuationStats.map((s, i) => {
                  const isChecked = selectedFluctuationItems.includes(s.name);
                  const isDisabled = !isChecked && selectedFluctuationItems.length >= 5;
                  return (
                    <label
                      key={s.name}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs transition-colors ${
                        isChecked
                          ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
                          : 'bg-slate-50/50 dark:bg-slate-900/20 border-slate-100 dark:border-slate-800'
                      } ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={isChecked}
                        disabled={isDisabled}
                        onChange={() => toggleFluctuationItem(s.name)}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{s.name}</span>
                          {i < 5 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 shrink-0">{t('volatile_badge', 'Volatile')}</span>}
                        </div>
                        <p className="text-[9px] text-slate-400 mt-0.5">
                          ±{s.fluctuationPct.toFixed(0)}% {t('fluctuation_label', 'fluctuation')} · {t('every_label', 'every')} ~{s.avgFrequencyDays.toFixed(1)}d · {s.count}x
                        </p>
                        <p className={`text-[9px] font-semibold mt-0.5 ${s.priceChangePct >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                          {s.priceChangePct >= 0 ? '+' : ''}{s.priceChangePct.toFixed(1)}% {t('since_first_purchase_label', 'since first purchase')}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="text-slate-400 text-center py-8 text-xs">{t('no_repeat_purchases', 'No items have been purchased more than once yet.')}</p>
            )}
            {selectedFluctuationItems.length >= 5 && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">{t('max_items_note', 'Max 5 items selected - uncheck one to add another.')}</p>
            )}
          </div>

          {selectedFluctuationStats.length > 0 && (
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
              <h3 className="analytics-dashboard__subtitle font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-amber-600" /> {t('selected_items_summary_heading', 'Selected Items - Buying Pattern')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {selectedFluctuationStats.map((s, i) => (
                  <div key={s.name} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: fluctuationColors[i % fluctuationColors.length] }} />
                      <span className="font-bold text-slate-800 dark:text-slate-200 text-xs truncate">{s.name}</span>
                    </div>
                    <div className="space-y-1 text-[10px] text-slate-500 dark:text-slate-400">
                      <p>{t('bought_label', 'Bought')} <strong className="text-slate-700 dark:text-slate-300">{s.count}x</strong>, {t('avg_every_label', 'avg every')} <strong className="text-slate-700 dark:text-slate-300">{s.avgFrequencyDays.toFixed(1)} {t('days_label', 'days')}</strong></p>
                      <p>{t('price_range_label', 'Price range')}: <strong className="text-slate-700 dark:text-slate-300">₹{s.minPrice.toFixed(0)} - ₹{s.maxPrice.toFixed(0)}</strong></p>
                      <p>{t('avg_cost_label', 'Avg cost')}: <strong className="text-slate-700 dark:text-slate-300">₹{s.mean.toFixed(0)}</strong></p>
                      <p>
                        {t('change_since_first_label', 'Change since first purchase')}:{' '}
                        <strong className={s.priceChangePct >= 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
                          {s.priceChangePct >= 0 ? '+' : ''}{s.priceChangePct.toFixed(1)}%
                        </strong>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
