import React from 'react';
import {
  AlertTriangle,
  User,
  Phone,
  Calendar,
  Utensils,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  Clock,
  IndianRupee,
  Plus
} from 'lucide-react';
import { Guest, Order } from '../types';
import { useInventoryContext } from '../contexts/InventoryContext';
import { useKitchenContext } from '../contexts/KitchenContext';

interface OperationalDashboardProps {
  guests: Guest[];
  onNavigate: (tab: any) => void;
  onOpenCheckin: () => void;
  kitchenModuleEnabled?: boolean;
}

export const OperationalDashboard: React.FC<OperationalDashboardProps> = ({
  guests,
  onNavigate,
  onOpenCheckin,
  kitchenModuleEnabled = true,
}) => {
  const { orders } = useKitchenContext();
  const { inventory } = useInventoryContext();
  // Low stock alerts where currentStock <= minThreshold
  const stockAlerts = inventory.filter((item) => item.currentStock <= item.minThreshold);

  // Active resident profile
  const activeGuest = guests.find((g) => g.status === 'Active');

  // Recent 5 kitchen orders
  const recentOrders = orders.slice(0, 5);

  // Calculate quick stats
  const totalKitchenRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const pendingOrders = orders.filter((o) => o.status === 'Pending' || o.status === 'Preparing');

  // Booking Matrix logic for current month
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthName = today.toLocaleString('default', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      {/* Flowbite Header Banner */}
      <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            Operational Overview
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Real-time resort status, resident profiles, live kitchen queue, and stock thresholds
          </p>
        </div>
        <button
          onClick={onOpenCheckin}
          className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-semibold rounded-lg text-xs px-4 py-2.5 flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Register New Resident</span>
        </button>
      </div>

      {/* Flowbite Stat Metric Cards */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${kitchenModuleEnabled ? 'lg:grid-cols-4' : 'lg:grid-cols-1'} gap-4`}>
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Resident</p>
            <p className="text-lg font-extrabold text-gray-900 mt-1">
              {activeGuest ? activeGuest.guestName : 'None Checked In'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {activeGuest ? activeGuest.roomNumber : 'Room Available'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
            <User className="w-5 h-5" />
          </div>
        </div>

        {kitchenModuleEnabled && (
          <>
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Kitchen Revenue</p>
                <p className="text-lg font-extrabold text-gray-900 mt-1 flex items-center">
                  <IndianRupee className="w-4 h-4 text-gray-600" />
                  {totalKitchenRevenue.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{orders.length} Fulfilled Orders</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Kitchen Queue</p>
                <p className="text-lg font-extrabold text-gray-900 mt-1">
                  {pendingOrders.length} Tickets
                </p>
                <p className="text-xs text-amber-600 font-semibold mt-0.5">Active Kitchen KDS</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                <Utensils className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Requisitions</p>
                <p className="text-lg font-extrabold text-gray-900 mt-1">
                  {stockAlerts.length} Thresholds
                </p>
                <p className="text-xs text-red-600 font-semibold mt-0.5">Low Stock Warnings</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-red-100 text-red-700 flex items-center justify-center font-bold">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Flowbite Content Cards Grid */}
      <div className={`grid grid-cols-1 ${kitchenModuleEnabled ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-6`}>
        {/* Resident Card */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-2xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                Current Resident Profile
              </h3>
              <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200">
                Active Stay
              </span>
            </div>

            {activeGuest ? (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                  <span className="text-gray-500 font-medium flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-gray-400" /> Resident Name:
                  </span>
                  <span className="font-extrabold text-gray-900 text-sm">{activeGuest.guestName}</span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                  <span className="text-gray-500 font-medium flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-gray-400" /> Contact Phone:
                  </span>
                  <span className="font-semibold text-gray-800">{activeGuest.phoneNumber}</span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                  <span className="text-gray-500 font-medium flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" /> Dates:
                  </span>
                  <span className="font-semibold text-gray-800">
                    {activeGuest.checkinDate} → {activeGuest.expectedCheckout}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5">
                  <span className="text-gray-500 font-medium">Room Unit:</span>
                  <span className="font-bold bg-gray-100 text-gray-800 px-2.5 py-1 rounded border border-gray-200">
                    {activeGuest.roomNumber}
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-gray-400 text-xs font-medium">
                No active resident currently checked in.
              </div>
            )}
          </div>

          <button
            onClick={() => onNavigate('guests')}
            className="mt-5 w-full text-white bg-gray-900 hover:bg-gray-800 font-semibold text-xs py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>{activeGuest ? 'Settlements & Billing' : 'Register Guest'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Kitchen KDS Card — nothing to show for a property with no food service */}
        {kitchenModuleEnabled && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-2xs p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-blue-600" />
                  Live Kitchen Tickets
                </h3>
                <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200">
                  KDS Queue
                </span>
              </div>

              {recentOrders.length > 0 ? (
                <ul className="divide-y divide-gray-100 text-xs">
                  {recentOrders.map((ord) => (
                    <li key={ord.id} className="py-2.5 flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-gray-900 flex items-center gap-1.5">
                          <span>{ord.id}</span>
                          <span className="text-gray-400 font-normal">({ord.roomNumber})</span>
                        </div>
                        <p className="text-gray-500 text-[11px] mt-0.5 line-clamp-1">
                          {ord.items.map((i) => `${i.name} (${i.quantity})`).join(', ')}
                        </p>
                      </div>

                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                          ord.status === 'Pending'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : ord.status === 'Preparing'
                            ? 'bg-blue-100 text-blue-800 border border-blue-300'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}
                      >
                        {ord.status}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="py-8 text-center text-gray-400 text-xs font-medium">
                  No active kitchen tickets.
                </div>
              )}
            </div>

            <button
              onClick={() => onNavigate('kitchen')}
              className="mt-5 w-full text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-semibold text-xs py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>Kitchen Display System</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Booking Calendar Card */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-2xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                Resort Booking Calendar
              </h3>
              <span className="text-xs font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {monthName}
              </span>
            </div>

            {/* Calendar Grid Header */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-400 mb-1">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>

            {/* Days Matrix */}
            <div className="grid grid-cols-7 gap-1 text-[11px]">
              {Array.from({ length: firstDay }).map((_, idx) => (
                <div key={`empty-${idx}`} className="h-9 rounded bg-gray-50 border border-gray-100" />
              ))}

              {daysArray.map((d) => {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const booking = guests.find(
                  (g) => dateStr >= g.checkinDate && dateStr <= (g.checkoutDate || g.expectedCheckout)
                );

                return (
                  <div
                    key={`day-${d}`}
                    className={`h-9 rounded border p-0.5 flex flex-col justify-between text-gray-700 transition-all ${
                      d === today.getDate()
                        ? 'bg-blue-50 border-blue-300 font-bold'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    <span className="text-[10px] text-gray-500 font-medium leading-none">{d}</span>
                    {booking && (
                      <span
                        className={`text-[8px] font-bold px-1 py-0.5 rounded truncate leading-none ${
                          booking.status === 'CheckedOut'
                            ? 'bg-gray-200 text-gray-600 line-through'
                            : 'bg-blue-100 text-blue-800 border border-blue-300'
                        }`}
                        title={`${booking.guestName} (${booking.roomNumber})`}
                      >
                        {booking.roomNumber.replace('Villa ', 'V').replace('Cottage ', 'C')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500" />
              <span>Active Resident</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-gray-300" />
              <span>Checked Out</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
