import React, { useState } from 'react';
import { Wallet, PlusCircle, ArrowUpRight, ArrowDownLeft, IndianRupee, X } from 'lucide-react';
import { PettyCashEntry } from '../types';

interface PettyCashManagementProps {
  entries: PettyCashEntry[];
  onAddEntry: (entry: PettyCashEntry) => void;
}

export const PettyCashManagement: React.FC<PettyCashManagementProps> = ({
  entries,
  onAddEntry,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [category, setCategory] = useState<PettyCashEntry['category']>('Kitchen Grocery');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState(500);
  const [type, setType] = useState<'Expense' | 'Replenishment'>('Expense');

  const totalReplenishments = entries
    .filter((e) => e.type === 'Replenishment')
    .reduce((sum, e) => sum + e.amount, 0);

  const totalExpenses = entries
    .filter((e) => e.type === 'Expense')
    .reduce((sum, e) => sum + e.amount, 0);

  const netBalance = totalReplenishments - totalExpenses;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount) return;

    const entry: PettyCashEntry = {
      id: `pc-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().split('T')[0],
      category,
      description,
      vendor: vendor || 'General',
      amount: Number(amount),
      type,
    };

    onAddEntry(entry);
    setIsModalOpen(false);
    setDescription('');
    setVendor('');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-gray-200 shadow-2xs">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            Petty Cash Register & Daily Expenses Log
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Track daily farm & kitchen minor cash outlays, vendor payouts, and float replenishments
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-semibold text-xs px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Record Cash Transaction</span>
        </button>
      </div>

      {/* Balance Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500">Current Float Balance</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 flex items-center">
            <IndianRupee className="w-5 h-5 text-emerald-600" />
            {netBalance.toLocaleString('en-IN')}
          </p>
          <p className="text-[11px] text-emerald-600 font-medium mt-1">✓ Float Available</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500">Total Replenished Float</p>
          <p className="text-xl font-bold text-blue-700 mt-1 flex items-center">
            <ArrowDownLeft className="w-4 h-4 mr-1 text-blue-600" />
            ₹{totalReplenishments.toLocaleString('en-IN')}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500">Total Outlay Expenses</p>
          <p className="text-xl font-bold text-red-700 mt-1 flex items-center">
            <ArrowUpRight className="w-4 h-4 mr-1 text-red-600" />
            ₹{totalExpenses.toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      {/* Transactions Table & Mobile Cards */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden p-4">
        <h3 className="font-bold text-slate-800 text-sm mb-3">Transaction History Log</h3>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto text-xs">
          <table className="w-full text-left text-slate-700">
            <thead className="bg-slate-50 font-bold border-b border-slate-200 uppercase text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3">Vendor / Recipient</th>
                <th className="py-2.5 px-3 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 text-slate-500">{entry.date}</td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        entry.type === 'Replenishment'
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-red-100 text-red-800 border border-red-200'
                      }`}
                    >
                      {entry.type}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-semibold">{entry.category}</td>
                  <td className="py-2.5 px-3">{entry.description}</td>
                  <td className="py-2.5 px-3 text-slate-600">{entry.vendor}</td>
                  <td
                    className={`py-2.5 px-3 text-right font-bold text-sm ${
                      entry.type === 'Replenishment' ? 'text-blue-700' : 'text-red-700'
                    }`}
                  >
                    {entry.type === 'Replenishment' ? '+' : '-'}₹{entry.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-slate-100 space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="pt-3 first:pt-0 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      entry.type === 'Replenishment'
                        ? 'bg-blue-100 text-blue-800 border border-blue-200'
                        : 'bg-red-100 text-red-800 border border-red-200'
                    }`}
                  >
                    {entry.type}
                  </span>
                  <h4 className="font-bold text-slate-900 text-sm mt-1">{entry.description}</h4>
                </div>
                <span
                  className={`font-bold text-base ${
                    entry.type === 'Replenishment' ? 'text-blue-700' : 'text-red-700'
                  }`}
                >
                  {entry.type === 'Replenishment' ? '+' : '-'}₹{entry.amount}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                <span>Category: <strong className="text-slate-800">{entry.category}</strong></span>
                <span>Vendor: <strong className="text-slate-800">{entry.vendor}</strong></span>
                <span>{entry.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Record Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-slate-800 text-sm">Record Cash Transaction</h3>
              <button onClick={() => setIsModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Transaction Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setType('Expense')}
                    className={`py-2 rounded-lg font-bold border transition-all ${
                      type === 'Expense'
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Outflow Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('Replenishment')}
                    className={`py-2 rounded-lg font-bold border transition-all ${
                      type === 'Replenishment'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Float Top-up
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="Kitchen Grocery">Kitchen Grocery</option>
                  <option value="Farm Supplies">Farm Supplies</option>
                  <option value="Utilities">Utilities</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Staff Perk">Staff Perk / Tea</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Description *</label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Fresh herbs & dairy from market"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Vendor / Source</label>
                  <input
                    type="text"
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    placeholder="Jaipur Market"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold"
                  />
                </div>
              </div>

              <div className="pt-3 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
