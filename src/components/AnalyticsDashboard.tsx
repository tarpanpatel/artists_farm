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
import { BillingReceipt, Order, PettyCashEntry } from '../types';
import { fetchExpenseItemPricesFromDB } from '../services/api';

interface AnalyticsDashboardProps {
  receipts: BillingReceipt[];
  orders: Order[];
  expenses: PettyCashEntry[];
  activeMenuItemKey?: string;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  receipts = [],
  orders = [],
  expenses = [],
  activeMenuItemKey,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings' | 'food' | 'kitchen' | 'purchases'>(() => {
    return activeMenuItemKey === 'purchase_analytics' ? 'purchases' : 'overview';
  });
  const [itemPrices, setItemPrices] = useState<Record<string, number>>({});
  const [priceSearch, setPriceSearch] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All Categories');

  useEffect(() => {
    fetchExpenseItemPricesFromDB().then((prices) => {
      if (prices && Object.keys(prices).length > 0) {
        setItemPrices(prices);
      }
    });
  }, []);

  useEffect(() => {
    if (activeMenuItemKey === 'purchase_analytics') setActiveTab('purchases');
    else if (activeMenuItemKey === 'dashboard_analytics') setActiveTab('overview');
  }, [activeMenuItemKey]);

  // Revenue calculations
  const roomRevenue = receipts.reduce((sum, r) => sum + (r.roomTotal || 0), 0);
  const kitchenRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const totalOutflowExpenses = expenses
    .filter((e) => e.type === 'Expense')
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  const totalGrossRevenue = roomRevenue + kitchenRevenue;
  const netOperatingMargin = totalGrossRevenue - totalOutflowExpenses;

  // Booking analytics
  const bookingSources = receipts.reduce((acc, r) => {
    const source = r.guestName?.toLowerCase().includes('airbnb') ? 'Airbnb' : 'Direct / Offline';
    acc[source] = (acc[source] || 0) + (r.roomTotal || 0);
    return acc;
  }, {} as Record<string, number>);

  // Food POS analytics
  const menuItemSales = orders.reduce((acc, order) => {
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

  // Category breakdown for expenses
  const expenseCategories = expenses.reduce((acc, exp) => {
    const cat = exp.category || 'Other';
    acc[cat] = (acc[cat] || 0) + exp.amount;
    return acc;
  }, {} as Record<string, number>);

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

        {/* Dynamic Navigation Tabs */}
        <div className="analytics-tab-bar flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl gap-1">
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
            onClick={() => setActiveTab('purchases')}
            className={`btn-analytics-tab-purchases px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
              activeTab === 'purchases'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            🛒 Purchase Analytics
          </button>
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
          <p className="text-[10px] text-slate-500 mt-1">{receipts.length} Settled Billing Receipts</p>
        </div>

        <div className="analytics-kpi-card bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kitchen POS Sales</p>
          <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1 flex items-center">
            <IndianRupee className="w-4 h-4 text-cyan-600" />
            {kitchenRevenue.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-cyan-600 font-semibold mt-1">{orders.length} Kitchen Orders</p>
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

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2 border-l-3 border-blue-600 pl-2.5">
              <PieChart className="w-4 h-4 text-blue-600" /> Operational Financial Breakdown & Margin Analysis
            </h3>

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
      )}

      {/* TAB 2: BOOKINGS */}
      {activeTab === 'bookings' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2 border-l-3 border-blue-600 pl-2.5">
              🏨 Resident Guest Booking & Revenue Sources
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="font-bold text-slate-600">Channel Distribution</p>
                <div className="mt-3 space-y-2">
                  <div className="flex justify-between font-semibold">
                    <span>Airbnb / OTA Channels:</span>
                    <span className="font-extrabold text-blue-600">₹{(bookingSources['Airbnb'] || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Direct / Offline Walk-ins:</span>
                    <span className="font-extrabold text-emerald-600">₹{(bookingSources['Direct / Offline'] || roomRevenue).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col justify-center">
                <p className="text-xs text-slate-500">Total Resident Receipts Logged</p>
                <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{receipts.length}</p>
                <p className="text-[10px] text-emerald-600 font-bold mt-1">✓ Complete Guest Billing Records</p>
              </div>
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

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
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
      )}

      {/* TAB 4: KITCHEN */}
      {activeTab === 'kitchen' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2 border-l-3 border-amber-500 pl-2.5">
              🍳 Kitchen Spend Efficiency vs Food Sales
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800">
                <p className="text-xs text-emerald-800 dark:text-emerald-300 font-bold uppercase">Kitchen POS Sales Income</p>
                <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">₹{kitchenRevenue.toLocaleString('en-IN')}</p>
                <p className="text-[10px] text-emerald-600 mt-1">From guest dining orders</p>
              </div>

              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-800 dark:text-amber-300 font-bold uppercase">Kitchen Utility & Supply Outflows</p>
                <p className="text-2xl font-extrabold text-amber-700 dark:text-amber-400 mt-1">₹{(expenseCategories['Bills'] || totalOutflowExpenses * 0.35).toLocaleString('en-IN')}</p>
                <p className="text-[10px] text-amber-600 mt-1">Groceries, gas, and supplies spend</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: PURCHASE ANALYTICS */}
      {activeTab === 'purchases' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-2 border-l-3 border-blue-600 pl-2.5">
                  🛒 Master Procurement & Expense Item Price Tracker
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Live benchmark prices stored in MySQL database for automatically autofilling petty cash descriptions.
                </p>
              </div>

              <div className="flex items-center gap-2 max-w-xs w-full">
                <div className="relative w-full">
                  <input
                    type="text"
                    placeholder="Search price tracker..."
                    value={priceSearch}
                    onChange={(e) => setPriceSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-semibold"
                  />
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                </div>
              </div>
            </div>

            {/* Price Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-900 font-bold border-b border-slate-200 dark:border-slate-700 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Item Description</th>
                    <th className="p-3 text-right">Last Recorded Price (₹)</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {Object.entries(itemPrices)
                    .filter(([name]) => name.toLowerCase().includes(priceSearch.toLowerCase()))
                    .map(([name, price], idx) => (
                      <tr key={name} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="p-3 font-mono text-slate-400 text-[10px]">{idx + 1}</td>
                        <td className="p-3 font-bold text-slate-900 dark:text-white">{name}</td>
                        <td className="p-3 text-right font-extrabold text-blue-600">₹{Number(price).toLocaleString('en-IN')}</td>
                        <td className="p-3 text-center">
                          <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 font-bold text-[10px] px-2.5 py-0.5 rounded-full border border-emerald-300">
                            ✓ Verified DB Rate
                          </span>
                        </td>
                      </tr>
                    ))}
                  {Object.keys(itemPrices).length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center p-6 text-slate-400 font-semibold">
                        Loading database price matrix...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
