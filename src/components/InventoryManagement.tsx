import React, { useState } from 'react';
import { Boxes, AlertTriangle, Plus, CheckCircle2, ArrowUpDown, X, Upload, Image as ImageIcon } from 'lucide-react';
import { InventoryItem } from '../types';

interface InventoryManagementProps {
  inventory: InventoryItem[];
  onUpdateStock: (itemId: string, newStock: number) => void;
  onAddInventoryItem: (item: InventoryItem) => void;
  onUpdateItemImage?: (itemId: string, imagePath: string) => void;
  activeMenuItemKey?: string;
}

export const InventoryManagement: React.FC<InventoryManagementProps> = ({
  inventory,
  onUpdateStock,
  onAddInventoryItem,
  onUpdateItemImage,
  activeMenuItemKey,
}) => {
  const [activeTab, setActiveTab] = React.useState<'stock_log' | 'deficit' | 'requisitions' | 'purchases'>('stock_log');

  React.useEffect(() => {
    if (activeMenuItemKey === 'deficit_shortfalls_log') {
      setActiveTab('deficit');
    } else if (activeMenuItemKey === 'stock_requests' || activeMenuItemKey === 'fulfill_stock_req') {
      setActiveTab('requisitions');
    } else if (activeMenuItemKey === 'kitchen_purchases') {
      setActiveTab('purchases');
    } else {
      setActiveTab('stock_log');
    }
  }, [activeMenuItemKey]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Groceries');
  const [currentStock, setCurrentStock] = useState(10);
  const [minThreshold, setMinThreshold] = useState(5);
  const [unit, setUnit] = useState('kg');
  const [imagePath, setImagePath] = useState('');

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    const item: InventoryItem = {
      id: `inv-${Date.now().toString().slice(-4)}`,
      name,
      category,
      currentStock,
      minThreshold,
      unit,
      imagePath,
    };

    onAddInventoryItem(item);
    setIsAddModalOpen(false);
    setName('');
    setImagePath('');
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-gray-200 shadow-2xs">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            Inventory Catalog & Stock Alert Boundaries
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Monitor stock metrics, receive boundary threshold alerts, and adjust store inventory levels
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-semibold text-xs px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Catalog Item</span>
        </button>
      </div>

      {/* Inventory Table & Mobile Cards */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto text-xs">
          <table className="w-full text-left text-slate-700">
            <thead className="bg-slate-50 font-bold border-b border-slate-200 uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">Image</th>
                <th className="py-3 px-4">Item Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Current Stock Level</th>
                <th className="py-3 px-4">Min Alert Threshold</th>
                <th className="py-3 px-4">Stock Status</th>
                <th className="py-3 px-4 text-right">Quick Stock Adjustment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inventory.map((item) => {
                const isLow = item.currentStock <= item.minThreshold;
                return (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="relative group w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
                        {item.imagePath ? (
                          <img src={item.imagePath} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-slate-400" />
                        )}
                        <label
                          className="absolute inset-0 bg-slate-900/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          title="Upload / Change Image"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file && onUpdateItemImage) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  onUpdateItemImage(item.id, reader.result as string);
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900 text-sm">{item.name}</td>
                    <td className="py-3 px-4">
                      <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded font-medium">
                        {item.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {item.currentStock} {item.unit}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {item.minThreshold} {item.unit}
                    </td>
                    <td className="py-3 px-4">
                      {isLow ? (
                        <span className="bg-red-100 text-red-800 border border-red-300 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 w-max">
                          <AlertTriangle className="w-3 h-3 text-red-600" />
                          <span>LOW STOCK ALERT</span>
                        </span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 w-max">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Adequate</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onUpdateStock(item.id, Math.max(0, item.currentStock - 1))}
                          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 text-xs border border-slate-200"
                        >
                          -1
                        </button>
                        <button
                          onClick={() => onUpdateStock(item.id, item.currentStock + 1)}
                          className="w-8 h-8 rounded-lg bg-emerald-50 hover:bg-emerald-100 font-bold text-emerald-700 text-xs border border-emerald-200"
                        >
                          +1
                        </button>
                        <button
                          onClick={() => onUpdateStock(item.id, item.currentStock + 5)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
                        >
                          +5
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-slate-100 p-3 space-y-3">
          {inventory.map((item) => {
            const isLow = item.currentStock <= item.minThreshold;
            return (
              <div key={item.id} className="pt-3 first:pt-0 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                      {item.category}
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm">{item.name}</h4>
                  </div>
                  {isLow ? (
                    <span className="bg-red-100 text-red-800 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-red-600" /> Low Stock
                    </span>
                  ) : (
                    <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Adequate
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Current Stock</span>
                    <span className="font-bold text-slate-900 text-sm">{item.currentStock} {item.unit}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Min Threshold</span>
                    <span className="font-semibold text-slate-600">{item.minThreshold} {item.unit}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-xs font-semibold text-slate-600">Quick Adjust:</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onUpdateStock(item.id, Math.max(0, item.currentStock - 1))}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 font-bold text-slate-800 text-xs border border-slate-200 min-h-[40px] min-w-[40px]"
                    >
                      -1
                    </button>
                    <button
                      onClick={() => onUpdateStock(item.id, item.currentStock + 1)}
                      className="px-3.5 py-2 rounded-xl bg-emerald-100 hover:bg-emerald-200 active:scale-95 font-bold text-emerald-800 text-xs border border-emerald-300 min-h-[40px] min-w-[40px]"
                    >
                      +1
                    </button>
                    <button
                      onClick={() => onUpdateStock(item.id, item.currentStock + 5)}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 font-bold text-white text-xs shadow-xs min-h-[40px]"
                    >
                      +5 Stock
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Item Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-slate-800 text-sm">Add New Inventory Item</h3>
              <button onClick={() => setIsAddModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleCreateItem} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Milk or Basmati Rice"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="Groceries">Groceries</option>
                  <option value="Dairy">Dairy</option>
                  <option value="Oils">Oils & Spices</option>
                  <option value="Kitchen Fuel">Kitchen Fuel</option>
                  <option value="Maintenance">Maintenance & Cleaning</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Stock Level</label>
                  <input
                    type="number"
                    value={currentStock}
                    onChange={(e) => setCurrentStock(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Min Threshold</label>
                  <input
                    type="number"
                    value={minThreshold}
                    onChange={(e) => setMinThreshold(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Unit</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  >
                    <option value="kg">kg</option>
                    <option value="liters">liters</option>
                    <option value="pcs">pcs</option>
                    <option value="packets">packets</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Item Image Upload / URL</label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-2 rounded-xl cursor-pointer flex items-center gap-1.5 shadow-2xs text-xs shrink-0 transition-all">
                      <Upload className="w-4 h-4" />
                      <span>Upload Image</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setImagePath(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>

                    <input
                      type="text"
                      value={imagePath}
                      onChange={(e) => setImagePath(e.target.value)}
                      placeholder="Or enter image URL / path..."
                      className="flex-1 p-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden font-mono text-[11px]"
                    />
                  </div>

                  {/* Image Preview Box */}
                  {imagePath && (
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-300 bg-slate-50">
                      <img
                        src={imagePath}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setImagePath('')}
                        className="absolute top-1 right-1 bg-slate-900/80 text-white p-0.5 rounded-full hover:bg-slate-900"
                        title="Remove Image"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
