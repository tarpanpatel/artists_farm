import React from 'react';
import { BarChart3, TrendingUp, IndianRupee, PieChart, Users, Utensils } from 'lucide-react';
import { BillingReceipt, Order, PettyCashEntry } from '../types';

interface AnalyticsDashboardProps {
  receipts: BillingReceipt[];
  orders: Order[];
  expenses: PettyCashEntry[];
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  receipts,
  orders,
  expenses,
}) => {
  const roomRevenue = receipts.reduce((sum, r) => sum + r.roomTotal, 0);
  const kitchenRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const totalOutflowExpenses = expenses
    .filter((e) => e.type === 'Expense')
    .reduce((sum, e) => sum + e.amount, 0);

  const totalGrossRevenue = roomRevenue + kitchenRevenue;
  const netOperatingMargin = totalGrossRevenue - totalOutflowExpenses;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-2xs">
        <h2 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
          Financial Analytics & Performance Matrix
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Consolidated revenue analytics, room vs kitchen income breakdown, and operating expense margins
        </p>
      </div>

      {/* Summary KPI Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-2xs">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Gross Total Revenue</p>
          <p className="text-2xl font-extrabold text-gray-900 mt-1 flex items-center">
            <IndianRupee className="w-5 h-5 text-gray-700" />
            {totalGrossRevenue.toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-emerald-600 font-semibold mt-1">Room Stay + Food POS</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-2xs">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Room Stay Income</p>
          <p className="text-xl font-extrabold text-gray-900 mt-1 flex items-center">
            <IndianRupee className="w-4 h-4 text-gray-600" />
            {roomRevenue.toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-gray-500 mt-1">Resident Villa & Cottage Rates</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-2xs">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Kitchen Income</p>
          <p className="text-xl font-extrabold text-gray-900 mt-1 flex items-center">
            <IndianRupee className="w-4 h-4 text-blue-600" />
            {kitchenRevenue.toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-blue-600 font-semibold mt-1">{orders.length} Kitchen Tickets</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-2xs">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Net Operating Margin</p>
          <p className="text-xl font-extrabold text-blue-700 mt-1 flex items-center">
            <IndianRupee className="w-4 h-4 text-blue-600" />
            {netOperatingMargin.toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-gray-500 font-semibold mt-1">Revenue - Outflows</p>
        </div>
      </div>

      {/* Revenue Distribution Bar Visualizer */}
      <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-2xs space-y-4">
        <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
          <PieChart className="w-4 h-4 text-blue-600" /> Revenue Stream Composition
        </h3>

        <div className="space-y-4 text-xs">
          <div>
            <div className="flex justify-between font-bold text-gray-800 mb-1.5">
              <span>Room Accommodations (Villa & Cottage)</span>
              <span className="font-extrabold text-gray-900">₹{roomRevenue.toLocaleString('en-IN')}</span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full"
                style={{
                  width: `${totalGrossRevenue > 0 ? (roomRevenue / totalGrossRevenue) * 100 : 50}%`,
                }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between font-bold text-gray-800 mb-1.5">
              <span>Kitchen & Beverage Orders</span>
              <span className="font-extrabold text-gray-900">₹{kitchenRevenue.toLocaleString('en-IN')}</span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 rounded-full"
                style={{
                  width: `${totalGrossRevenue > 0 ? (kitchenRevenue / totalGrossRevenue) * 100 : 50}%`,
                }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between font-bold text-gray-800 mb-1.5">
              <span>Operating Expenses (Outflows)</span>
              <span className="font-extrabold text-gray-900">₹{totalOutflowExpenses.toLocaleString('en-IN')}</span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 rounded-full"
                style={{
                  width: `${
                    totalGrossRevenue > 0
                      ? Math.min(100, (totalOutflowExpenses / totalGrossRevenue) * 100)
                      : 25
                  }%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
