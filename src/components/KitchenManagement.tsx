import React, { useState } from 'react';
import {
  UtensilsCrossed,
  Plus,
  Clock,
  CheckCircle2,
  ChefHat,
  ShoppingBag,
  X,
  Boxes,
  AlertCircle,
  Upload,
  Image as ImageIcon,
  RefreshCw
} from 'lucide-react';
import { Guest, Order, OrderItem, MenuItem, Requisition } from '../types';
import { recordTelescopeLog } from '../utils/telescopeLogger';

interface KitchenManagementProps {
  guests: Guest[];
  orders: Order[];
  menu: MenuItem[];
  requisitions: Requisition[];
  onAddOrder: (order: Order) => void;
  onUpdateOrderStatus: (orderId: string, status: Order['status']) => void;
  onAddMenuItem: (item: MenuItem) => void;
  onRequestMaterial: (req: Requisition) => void;
  onDispatchTelegram?: (eventType: string, message: string, category?: 'kitchen' | 'admin' | 'finance' | 'all', replyMarkup?: any) => void;
  activeMenuItemKey?: string;
}

export const KitchenManagement: React.FC<KitchenManagementProps> = ({
  guests,
  orders,
  menu,
  requisitions,
  onAddOrder,
  onUpdateOrderStatus,
  onAddMenuItem,
  onRequestMaterial,
  onDispatchTelegram,
  activeMenuItemKey,
}) => {
  const [activeTab, setActiveTab] = useState<'kds' | 'new_order' | 'menu_catalog' | 'requisitions' | 'staff_meals' | 'beta_recipe_builder'>('kds');
  const [readyItemKeys, setReadyItemKeys] = useState<Record<string, boolean>>({
    '32_0': true,
    '29_0': true,
    '29_1': true,
    '29_2': true,
  });
  const [servedItemKeys, setServedItemKeys] = useState<Record<string, boolean>>({});
  const [itemReadyTimes, setItemReadyTimes] = useState<Record<string, string>>({
    '32_0': '01:16 AM',
    '29_0': '01:09 AM',
    '29_1': '01:11 AM',
    '29_2': '01:15 AM',
  });

  const [servedLogs, setServedLogs] = useState<Array<{ id: string; ticketId: string; itemSummary: string; servedBy: string; servedAt: string }>>([
    { id: '1', ticketId: '102', itemSummary: '1x French Fries Regular', servedBy: 'Cosmic', servedAt: '12:33 AM' },
    { id: '2', ticketId: '87', itemSummary: '1x French Fries Peri-Peri', servedBy: 'Cosmic', servedAt: '12:18 AM' },
    { id: '3', ticketId: '97', itemSummary: '1x Aloo Pakoda (6-8pcs)', servedBy: 'Cosmic', servedAt: '12:16 AM' },
  ]);

  // Smart Polling / Auto-Refresh state (15s interval matching kitchen.php)
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const [syncCountdown, setSyncCountdown] = useState(15);
  const [isSyncing, setIsSyncing] = useState(false);

  // Smart Polling countdown & 15-second background sync logic
  React.useEffect(() => {
    if (!autoSyncEnabled) return;

    const timer = setInterval(() => {
      setSyncCountdown((prev) => {
        if (prev <= 1) {
          // Trigger lightweight AJAX update check
          setIsSyncing(true);
          setTimeout(() => {
            setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
            setIsSyncing(false);
          }, 600);
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoSyncEnabled]);

  const triggerManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setSyncCountdown(15);
      setIsSyncing(false);
    }, 500);
  };

  const handleMarkDishReady = (ord: Order, itemIndex: number, item: OrderItem) => {
    const key = `${ord.id}_${itemIndex}`;
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setReadyItemKeys((prev) => ({ ...prev, [key]: true }));
    setItemReadyTimes((prev) => ({ ...prev, [key]: nowTime }));

    if (onDispatchTelegram) {
      const cleanTicketId = ord.id.replace('#', '');
      const singleItemReadyMsg = `🍳 <b>DISH READY TO SERVE</b>\n• Ticket: <b>#${cleanTicketId}</b> (${ord.guestName} - ${ord.roomNumber})\n• Ready Dish: <b>${item.quantity}x ${item.name}</b>\n• Price: <b>₹${item.quantity * item.unitPrice}</b>\n• Time: <b>${nowTime}</b>\n• Status: <b>Ready for Room / Table Delivery 🍽️</b>`;
      
      const inlineKeyboard = {
        inline_keyboard: [
          [{ text: '🍽️ Tap when Served', callback_data: `serve_item_${cleanTicketId}_${itemIndex}` }]
        ]
      };

      onDispatchTelegram('Single Dish Ready', singleItemReadyMsg, 'kitchen', inlineKeyboard);
    }

    recordTelescopeLog({
      portal: 'requests',
      severity: 'INFO',
      msg: `PATCH /api/kitchen/orders/${ord.id}/items/${itemIndex} - Dish Ready (${item.name})`,
      origin: '/src/components/KitchenManagement.tsx -> handleMarkDishReady',
      details: { orderId: ord.id, itemIndex, item },
    });
  };

  const handleMarkDishServed = (ord: Order, itemIndex: number, item: OrderItem) => {
    const key = `${ord.id}_${itemIndex}`;
    const cleanTicketId = ord.id.replace('#', '');

    if (servedItemKeys[key]) {
      alert(`⚠️ [Telegram answerCallbackQuery]: Dish "${item.name}" on Ticket #${cleanTicketId} is ALREADY marked as SERVED!`);
      return;
    }

    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setServedItemKeys((prev) => ({ ...prev, [key]: true }));

    // Add to Today's Served Logs
    const newLog = {
      id: Date.now().toString(),
      ticketId: cleanTicketId,
      itemSummary: `${item.quantity}x ${item.name}`,
      servedBy: 'Cosmic',
      servedAt: nowTime,
    };
    setServedLogs((prev) => [newLog, ...prev]);

    if (onDispatchTelegram) {
      const singleItemServedMsg = `✅ <b>DISH SERVED TO RESIDENT</b>\n• Ticket: <b>#${cleanTicketId}</b> (${ord.guestName} - ${ord.roomNumber})\n• Served Dish: <b>${item.quantity}x ${item.name}</b>\n• Delivered By: <b>Cosmic (Service Staff)</b>\n• Served At: <b>${nowTime}</b>\n• Status: <b>Delivered & Served 🍽️</b>`;
      onDispatchTelegram('Dish Served', singleItemServedMsg, 'kitchen');
    }

    recordTelescopeLog({
      portal: 'requests',
      severity: 'INFO',
      msg: `PATCH /api/kitchen/orders/${ord.id}/items/${itemIndex} - Dish Served (${item.name})`,
      origin: '/src/components/KitchenManagement.tsx -> handleMarkDishServed',
      details: { orderId: ord.id, itemIndex, item },
    });
  };

  React.useEffect(() => {
    if (activeMenuItemKey === 'take_food_order') {
      setActiveTab('new_order');
    } else if (activeMenuItemKey === 'kitchen_orders') {
      setActiveTab('kds');
    } else if (activeMenuItemKey === 'staff_meals') {
      setActiveTab('staff_meals');
    } else if (activeMenuItemKey === 'beta_recipe_builder') {
      setActiveTab('beta_recipe_builder');
    }
  }, [activeMenuItemKey]);

  // Staff Meals State
  const [staffName, setStaffName] = useState('Chef Ramesh (Head Chef)');
  const [staffMealType, setStaffMealType] = useState<'Breakfast' | 'Lunch' | 'Dinner' | 'Evening Tea'>('Lunch');
  const [staffMealItems, setStaffMealItems] = useState('Staff Thali (Dal, Rice, Roti, Sabzi)');
  const [staffNotes, setStaffNotes] = useState('Standard Duty Meal');

  const handleDispatchStaffMeal = (e: React.FormEvent) => {
    e.preventDefault();
    const staffOrder: Order = {
      id: `STF-${Math.floor(100 + Math.random() * 900)}`,
      guestId: 'staff-duty',
      guestName: `[STAFF MEAL] ${staffName}`,
      roomNumber: 'Staff Pantry',
      orderTime: 'Just now',
      status: 'Pending',
      items: [
        {
          menuItemId: 'stf-meal',
          name: `${staffMealType}: ${staffMealItems}`,
          quantity: 1,
          unitPrice: 0,
        },
      ],
      totalAmount: 0,
    };
    onAddOrder(staffOrder);
    alert(`Staff meal ticket ${staffOrder.id} dispatched to Kitchen KDS Queue!`);
    setActiveTab('kds');
  };

  // Beta Recipe Builder State
  const [selectedRecipeMenuItemId, setSelectedRecipeMenuItemId] = useState<string>(menu[0]?.id || 'm-1');
  const selectedRecipeMenuItem = menu.find((m) => m.id === selectedRecipeMenuItemId) || menu[0];

  const [recipeIngredients, setRecipeIngredients] = useState<
    { id: string; name: string; quantity: number; unit: string; costPerUnit: number }[]
  >([
    { id: '1', name: 'Fresh Cottage Cheese (Paneer)', quantity: 0.2, unit: 'kg', costPerUnit: 380 },
    { id: '2', name: 'Butter (Amul)', quantity: 0.05, unit: 'kg', costPerUnit: 520 },
    { id: '3', name: 'Fresh Cream', quantity: 0.04, unit: 'liters', costPerUnit: 220 },
    { id: '4', name: 'Tomato Gravy Puree', quantity: 0.15, unit: 'kg', costPerUnit: 60 },
  ]);

  const [newIngName, setNewIngName] = useState('');
  const [newIngQty, setNewIngQty] = useState(0.1);
  const [newIngUnit, setNewIngUnit] = useState('kg');
  const [newIngCost, setNewIngCost] = useState(100);

  const totalRecipeCost = recipeIngredients.reduce((sum, ing) => sum + ing.quantity * ing.costPerUnit, 0);
  const dishSellingPrice = selectedRecipeMenuItem?.price || 350;
  const foodCostPercentage = dishSellingPrice > 0 ? (totalRecipeCost / dishSellingPrice) * 100 : 0;
  const grossProfitMargin = dishSellingPrice > 0 ? ((dishSellingPrice - totalRecipeCost) / dishSellingPrice) * 100 : 0;

  const handleAddIngredient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIngName) return;
    setRecipeIngredients([
      ...recipeIngredients,
      {
        id: Date.now().toString(),
        name: newIngName,
        quantity: Number(newIngQty),
        unit: newIngUnit,
        costPerUnit: Number(newIngCost),
      },
    ]);
    setNewIngName('');
  };
  const [kdsFilter, setKdsFilter] = useState<'All' | 'Pending' | 'Preparing' | 'Fulfilled'>('All');

  // New Order Form State
  const activeGuests = guests.filter((g) => g.status === 'Active');
  const [selectedGuestId, setSelectedGuestId] = useState<string>(activeGuests[0]?.id || '');
  const [cartItems, setCartItems] = useState<{ menuItem: MenuItem; quantity: number }[]>([]);

  // Menu Modal State
  const [isNewMenuModalOpen, setIsNewMenuModalOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<MenuItem['category']>('Main Course');
  const [newItemPrice, setNewItemPrice] = useState(350);
  const [newItemImagePath, setNewItemImagePath] = useState('');

  // Requisition Form State
  const [isReqModalOpen, setIsReqModalOpen] = useState(false);
  const [reqItemName, setReqItemName] = useState('');
  const [reqQty, setReqQty] = useState(10);
  const [reqUnit, setReqUnit] = useState('kg');

  // Add Item to Order Cart
  const handleAddToCart = (item: MenuItem) => {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.menuItem.id === item.id);
      if (existing) {
        return prev.map((i) => (i.menuItem.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { menuItem: item, quantity: 1 }];
    });
  };

  const handleUpdateCartQuantity = (itemId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((i) => (i.menuItem.id === itemId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  };

  // Submit Order
  const handleOrderSubmit = () => {
    if (!selectedGuestId || cartItems.length === 0) return;
    const guest = guests.find((g) => g.id === selectedGuestId);
    if (!guest) return;

    const orderItems: OrderItem[] = cartItems.map((ci) => ({
      menuItemId: ci.menuItem.id,
      name: ci.menuItem.name,
      quantity: ci.quantity,
      unitPrice: ci.menuItem.price,
    }));

    const totalAmount = orderItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    const newOrder: Order = {
      id: `ORD-${Math.floor(100 + Math.random() * 900)}`,
      guestId: guest.id,
      guestName: guest.guestName,
      roomNumber: guest.roomNumber,
      orderTime: 'Just now',
      status: 'Pending',
      items: orderItems,
      totalAmount,
    };

    onAddOrder(newOrder);
    setCartItems([]);
    setActiveTab('kds');
  };

  // Submit New Menu Item
  const handleCreateMenuItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName) return;

    const item: MenuItem = {
      id: `m-${Date.now().toString().slice(-4)}`,
      name: newItemName,
      category: newItemCategory,
      price: Number(newItemPrice),
      available: true,
      imagePath: newItemImagePath,
    };

    onAddMenuItem(item);
    setIsNewMenuModalOpen(false);
    setNewItemName('');
    setNewItemImagePath('');
  };

  // Submit Requisition
  const handleReqSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqItemName) return;

    const req: Requisition = {
      id: `REQ-${Math.floor(100 + Math.random() * 900)}`,
      itemName: reqItemName,
      requestedQty: reqQty,
      unit: reqUnit,
      requestedAt: `${new Date().toISOString().split('T')[0]} ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
      status: 'Pending',
      requestedBy: 'Kitchen Staff',
    };

    onRequestMaterial(req);
    setIsReqModalOpen(false);
    setReqItemName('');
  };

  const filteredOrders = orders.filter((o) => kdsFilter === 'All' || o.status === kdsFilter);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-gray-200 shadow-2xs">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            Kitchen Ticketing & Requisition POS
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Manage live kitchen display system (KDS), create room orders, manage menu items & raw material requisitions
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('new_order')}
            className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-semibold text-xs px-4 py-2.5 rounded-lg flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Resident Order</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-1">
        <button
          onClick={() => setActiveTab('kds')}
          className={`pb-2.5 px-4 font-semibold text-xs transition-colors border-b-2 cursor-pointer ${
            activeTab === 'kds'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <UtensilsCrossed className="w-4 h-4 inline mr-1.5" />
          KDS Ticket Queue ({orders.filter((o) => o.status !== 'Fulfilled').length} Active)
        </button>

        <button
          onClick={() => setActiveTab('new_order')}
          className={`pb-2.5 px-4 font-semibold text-xs transition-colors border-b-2 cursor-pointer ${
            activeTab === 'new_order'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <ShoppingBag className="w-4 h-4 inline mr-1.5" />
          Create Order POS
        </button>

        <button
          onClick={() => setActiveTab('staff_meals')}
          className={`pb-2.5 px-4 font-semibold text-xs transition-colors border-b-2 cursor-pointer ${
            activeTab === 'staff_meals'
              ? 'border-amber-600 text-amber-700 font-bold'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <UtensilsCrossed className="w-4 h-4 inline mr-1.5 text-amber-600" />
          Staff Meals POS
        </button>

        <button
          onClick={() => setActiveTab('beta_recipe_builder')}
          className={`pb-2.5 px-4 font-semibold text-xs transition-colors border-b-2 cursor-pointer ${
            activeTab === 'beta_recipe_builder'
              ? 'border-indigo-600 text-indigo-700 font-bold'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <ChefHat className="w-4 h-4 inline mr-1.5 text-indigo-600" />
          Beta Recipe Builder 🧪
        </button>

        <button
          onClick={() => setActiveTab('menu_catalog')}
          className={`pb-2.5 px-4 font-semibold text-xs transition-colors border-b-2 cursor-pointer ${
            activeTab === 'menu_catalog'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <ChefHat className="w-4 h-4 inline mr-1.5" />
          Food Menu Catalog ({menu.length})
        </button>

        <button
          onClick={() => setActiveTab('requisitions')}
          className={`pb-2.5 px-4 font-semibold text-xs transition-colors border-b-2 cursor-pointer ${
            activeTab === 'requisitions'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Boxes className="w-4 h-4 inline mr-1.5" />
          Raw Material Requisitions ({requisitions.length})
        </button>
      </div>

      {/* TAB 1: KDS TICKET QUEUE */}
      {activeTab === 'kds' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white p-3.5 rounded-2xl border border-slate-200/80 text-xs gap-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700">Filter Orders:</span>
              <div className="flex items-center gap-1.5">
                {(['All', 'Pending', 'Preparing', 'Fulfilled'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setKdsFilter(status)}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                      kdsFilter === status
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* Smart Polling / Live Sync Bar */}
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl w-full sm:w-auto justify-between sm:justify-start">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
                  className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    autoSyncEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                  title={autoSyncEnabled ? 'Auto-Sync Active (Click to Pause)' : 'Auto-Sync Paused (Click to Resume)'}
                >
                  <span
                    className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      autoSyncEnabled ? 'translate-x-3' : 'translate-x-0'
                    }`}
                  />
                </button>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-blue-500 animate-ping' : autoSyncEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                  <span className="font-bold text-slate-700 text-[11px]">
                    {autoSyncEnabled ? 'Live KDS Sync' : 'Sync Paused'}
                  </span>
                  {autoSyncEnabled && (
                    <span className="text-[10px] font-mono text-slate-400">
                      ({syncCountdown}s)
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 hidden md:inline">Synced {lastSyncTime}</span>
                <button
                  onClick={triggerManualSync}
                  disabled={isSyncing}
                  className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold px-2 py-0.5 rounded text-[11px] flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-2xs"
                  title="Check for kitchen updates immediately"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
                  <span>Sync</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map((ord) => (
              <div
                key={ord.id}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col justify-between min-h-[160px]"
              >
                <div>
                  {/* Card Header matching original PHP site */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-base">
                        Order #{ord.id.replace('#', '')}
                      </h3>
                      <p className="text-slate-400 text-[11px] font-medium mt-0.5">
                        (Received: {ord.orderTime || '01:15 AM'})
                      </p>
                    </div>
                    <span className="w-7 h-2 bg-sky-100/70 rounded-full inline-block mt-1"></span>
                  </div>

                  <div className="border-t border-dashed border-slate-200 my-3"></div>

                  {/* Items List */}
                  <div className="space-y-2.5 text-xs mb-3">
                    {ord.items.map((item, idx) => {
                      const itemKey = `${ord.id}_${idx}`;
                      const isReady = readyItemKeys[itemKey];
                      const isServed = servedItemKeys[itemKey];
                      const readyTime = itemReadyTimes[itemKey];

                      return (
                        <div key={idx} className="flex justify-between items-center gap-2">
                          <div className="flex items-center flex-wrap gap-1.5">
                            {isReady || isServed ? (
                              <>
                                <span className="font-bold text-emerald-600 line-through text-xs">
                                  {item.quantity}x {item.name}
                                </span>
                                {readyTime && (
                                  <span className="text-emerald-600 font-medium text-[11px] ml-1">
                                    (Ready at {readyTime})
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="font-bold text-red-600 text-xs">
                                {item.quantity}x {item.name}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isServed ? (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                                ✓ Served
                              </span>
                            ) : isReady ? (
                              <button
                                type="button"
                                onClick={() => handleMarkDishServed(ord, idx, item)}
                                className="border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs px-2.5 py-0.5 rounded transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                                title="Click when served to resident"
                              >
                                <span>✓ Served</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleMarkDishReady(ord, idx, item)}
                                className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs px-2.5 py-0.5 rounded transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                              >
                                <span>✓ Ready</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium mb-2">
                    <span>Resident: <strong>{ord.guestName}</strong> ({ord.roomNumber})</span>
                    <span className="font-bold text-slate-900 font-mono">₹{ord.totalAmount}</span>
                  </div>

                  {ord.status === 'Pending' && (
                    <button
                      onClick={() => onUpdateOrderStatus(ord.id, 'Preparing')}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      Start Preparing →
                    </button>
                  )}
                  {ord.status === 'Preparing' && (
                    <button
                      onClick={() => onUpdateOrderStatus(ord.id, 'Fulfilled')}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Mark Ticket Fulfilled</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Today's Served Logs section matching original site bottom section */}
          <div className="mt-8 space-y-3">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
              <span className="text-emerald-600">✅</span>
              <span>Today's Served Logs</span>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs divide-y divide-slate-100 overflow-hidden">
              {servedLogs.map((log) => (
                <div key={log.id} className="p-3.5 flex items-center justify-between text-xs hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className="font-extrabold text-slate-900 w-24">Ticket #{log.ticketId}</span>
                    <span className="font-bold text-emerald-700 text-xs">{log.itemSummary}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    Served by <span className="font-bold text-slate-700">{log.servedBy}</span> for at <span className="font-bold text-slate-800">{log.servedAt}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CREATE ORDER POS */}
      {activeTab === 'new_order' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Menu Catalog Items Selection */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-4">
            <h3 className="font-bold text-slate-800 text-sm">Select Food Items from Menu</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {menu.map((item) => (
                <div
                  key={item.id}
                  className="border border-slate-200 rounded-xl p-3 flex items-center justify-between bg-slate-50/50 hover:bg-emerald-50/40 hover:border-emerald-300 transition-all"
                >
                  <div>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                      {item.category}
                    </span>
                    <h4 className="font-bold text-slate-900 text-xs mt-1">{item.name}</h4>
                    <p className="font-semibold text-slate-700 text-xs mt-0.5">₹{item.price}</p>
                  </div>

                  <button
                    onClick={() => handleAddToCart(item)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-xs transition-colors"
                  >
                    + Add
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Cart & Guest Selector */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <h3 className="font-bold text-slate-800 text-sm border-b border-slate-100 pb-2">
                Order Summary Cart
              </h3>

              <div>
                <label className="block text-slate-700 font-semibold text-xs mb-1">
                  Select Active Resident *
                </label>
                {activeGuests.length > 0 ? (
                  <select
                    value={selectedGuestId}
                    onChange={(e) => setSelectedGuestId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {activeGuests.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.guestName} ({g.roomNumber})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-red-600 text-xs italic bg-red-50 p-2 rounded border border-red-200">
                    No active residents checked in! Please check in a resident first.
                  </div>
                )}
              </div>

              <div className="divide-y divide-slate-100 text-xs">
                {cartItems.length > 0 ? (
                  cartItems.map((ci) => (
                    <div key={ci.menuItem.id} className="py-2 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-slate-800">{ci.menuItem.name}</span>
                        <p className="text-slate-500 text-[11px]">
                          ₹{ci.menuItem.price} x {ci.quantity}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleUpdateCartQuantity(ci.menuItem.id, -1)}
                          className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center"
                        >
                          -
                        </button>
                        <span className="font-bold px-1 text-xs">{ci.quantity}</span>
                        <button
                          onClick={() => handleUpdateCartQuantity(ci.menuItem.id, 1)}
                          className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-6 text-center text-slate-400 text-xs italic">
                    Cart is empty. Click + Add on menu items.
                  </p>
                )}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center text-sm font-bold text-slate-900 border-t border-slate-100 pt-3 mb-3">
                <span>Total Amount:</span>
                <span className="text-emerald-700">
                  ₹
                  {cartItems.reduce(
                    (sum, i) => sum + i.menuItem.price * i.quantity,
                    0
                  )}
                </span>
              </div>

              <button
                disabled={cartItems.length === 0 || !selectedGuestId}
                onClick={handleOrderSubmit}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs py-2.5 rounded-lg transition-colors shadow-xs"
              >
                Dispatch Ticket to Kitchen KDS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MENU CATALOG */}
      {activeTab === 'menu_catalog' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800 text-sm">Resort Food & Beverage Catalog</h3>
            <button
              onClick={() => setIsNewMenuModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Add Menu Item
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {menu.map((item) => (
              <div key={item.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  {item.category}
                </span>
                <h4 className="font-bold text-slate-900 text-sm mt-1">{item.name}</h4>
                <p className="font-bold text-emerald-700 text-sm mt-0.5">₹{item.price}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: RAW MATERIAL REQUISITIONS */}
      {activeTab === 'requisitions' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800 text-sm">Kitchen Raw Material Requisitions Log</h3>
            <button
              onClick={() => setIsReqModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Request Material Stock
            </button>
          </div>

          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left text-slate-700">
              <thead className="bg-slate-50 font-bold border-b border-slate-200 uppercase text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Req ID</th>
                  <th className="py-2.5 px-3">Material Name</th>
                  <th className="py-2.5 px-3">Requested Qty</th>
                  <th className="py-2.5 px-3">Requested At</th>
                  <th className="py-2.5 px-3">Requested By</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requisitions.map((req) => (
                  <tr key={req.id}>
                    <td className="py-2.5 px-3 font-bold">{req.id}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{req.itemName}</td>
                    <td className="py-2.5 px-3">
                      {req.requestedQty} {req.unit}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{req.requestedAt}</td>
                    <td className="py-2.5 px-3">{req.requestedBy}</td>
                    <td className="py-2.5 px-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        req.status === 'Approved'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {req.status === 'Pending' ? (
                        <button
                          type="button"
                          onClick={() => {
                            req.status = 'Approved';
                            if (onDispatchTelegram) {
                              const reqMsg = `✅ <b>MATERIAL REQUISITION APPROVED #${req.id}</b>\n• Material: <b>${req.itemName}</b> (${req.requestedQty} ${req.unit})\n• Requested By: <b>${req.requestedBy}</b>\n• Status: Released & Fulfilled from Store ✓`;
                              onDispatchTelegram('Requisition Approved', reqMsg, 'kitchen');
                            }
                            recordTelescopeLog({
                              portal: 'requests',
                              severity: 'INFO',
                              msg: `PATCH /api/kitchen/requisitions/${req.id} - Approved`,
                              origin: '/src/components/KitchenManagement.tsx -> ApproveRequisition',
                              details: req,
                            });
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-2.5 py-1 rounded transition cursor-pointer"
                        >
                          Approve & Release
                        </button>
                      ) : (
                        <span className="text-emerald-600 font-bold text-[11px]">✓ Fulfilled</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: STAFF MEALS POS */}
      {activeTab === 'staff_meals' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>🍛</span> Staff Duty Meals Order Dispatch
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Record staff meal allocations and dispatch zero-cost kitchen orders directly to the KDS Ticket Queue.
              </p>
            </div>
            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full border border-amber-200">
              Staff Pantry POS
            </span>
          </div>

          <form onSubmit={handleDispatchStaffMeal} className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
            <div className="space-y-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Staff Member Name / Designation *</label>
                <input
                  type="text"
                  required
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="e.g. Chef Ramesh / Sunil (Housekeeping)"
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-semibold bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Shift Meal Type</label>
                <select
                  value={staffMealType}
                  onChange={(e) => setStaffMealType(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-bold bg-white"
                >
                  <option value="Breakfast">Breakfast (Morning Duty Shift)</option>
                  <option value="Lunch">Lunch (Midday Duty Shift)</option>
                  <option value="Evening Tea">Evening Tea & Snack</option>
                  <option value="Dinner">Dinner (Night Shift Duty)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Meal Items & Portions</label>
                <textarea
                  rows={3}
                  required
                  value={staffMealItems}
                  onChange={(e) => setStaffMealItems(e.target.value)}
                  placeholder="e.g. Staff Thali (Dal, Rice, Roti, Sabzi) x 1"
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-medium"
                />
              </div>
            </div>

            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 border-b pb-2 flex items-center justify-between">
                  <span>Ticket Preview</span>
                  <span className="text-emerald-600 font-mono font-bold">₹0.00 (Duty Meal)</span>
                </h4>

                <div className="space-y-1.5 text-slate-600">
                  <p>• <b>Beneficiary:</b> {staffName}</p>
                  <p>• <b>Shift Meal:</b> {staffMealType}</p>
                  <p>• <b>Order Item:</b> {staffMealItems}</p>
                  <p>• <b>Destination:</b> Staff Pantry / Kitchen Counter</p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Additional Kitchen Instructions</label>
                  <input
                    type="text"
                    value={staffNotes}
                    onChange={(e) => setStaffNotes(e.target.value)}
                    placeholder="e.g. Mild spice / Less oil"
                    className="w-full p-2 rounded-xl border border-slate-200 bg-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer text-xs flex items-center justify-center gap-2"
              >
                <UtensilsCrossed className="w-4 h-4" />
                <span>Dispatch Staff Meal Ticket to Kitchen KDS</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB: BETA RECIPE BUILDER */}
      {activeTab === 'beta_recipe_builder' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>🧪</span> Beta Recipe Costing & Food Margin Builder
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Calculate precise raw material ingredient costs, portion yield, and food profit margins for menu items.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700">Target Dish:</span>
              <select
                value={selectedRecipeMenuItemId}
                onChange={(e) => setSelectedRecipeMenuItemId(e.target.value)}
                className="p-2 rounded-xl border border-indigo-300 font-bold text-xs bg-indigo-50 text-indigo-900"
              >
                {menu.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} (Selling: ₹{m.price})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Metrics Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-slate-500 font-bold uppercase text-[10px]">Dish Selling Price</p>
              <p className="text-xl font-extrabold text-slate-900 mt-1">₹{dishSellingPrice}</p>
              <span className="text-[10px] text-slate-400">Current Guest Billing Price</span>
            </div>

            <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
              <p className="text-amber-800 font-bold uppercase text-[10px]">Total Raw Ingredient Cost</p>
              <p className="text-xl font-extrabold text-amber-900 mt-1">₹{totalRecipeCost.toFixed(2)}</p>
              <span className="text-[10px] text-amber-700">Cost Per Portion (CPP)</span>
            </div>

            <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
              <p className="text-blue-800 font-bold uppercase text-[10px]">Food Cost Ratio</p>
              <p className="text-xl font-extrabold text-blue-900 mt-1">{foodCostPercentage.toFixed(1)}%</p>
              <span className="text-[10px] text-blue-700">Target Benchmark: &lt;30%</span>
            </div>

            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
              <p className="text-emerald-800 font-bold uppercase text-[10px]">Gross Profit Margin</p>
              <p className="text-xl font-extrabold text-emerald-900 mt-1">{grossProfitMargin.toFixed(1)}%</p>
              <span className="text-[10px] text-emerald-700">Profit: ₹{(dishSellingPrice - totalRecipeCost).toFixed(2)}</span>
            </div>
          </div>

          {/* Recipe Ingredients Breakdown Table */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 text-sm border-l-3 border-indigo-600 pl-2.5">
                  Raw Ingredients Breakdown for {selectedRecipeMenuItem?.name}
                </h4>
                <span className="text-slate-400 font-mono text-[11px]">{recipeIngredients.length} Ingredients</span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 font-bold uppercase text-[10px] text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="p-3">Ingredient</th>
                      <th className="p-3 text-center">Quantity per Portion</th>
                      <th className="p-3 text-right">Cost / Unit</th>
                      <th className="p-3 text-right">Total Ingredient Cost</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recipeIngredients.map((ing) => (
                      <tr key={ing.id} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-900">{ing.name}</td>
                        <td className="p-3 text-center font-mono">
                          {ing.quantity} {ing.unit}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-600">₹{ing.costPerUnit}/{ing.unit}</td>
                        <td className="p-3 text-right font-bold text-emerald-700">
                          ₹{(ing.quantity * ing.costPerUnit).toFixed(2)}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => setRecipeIngredients(recipeIngredients.filter((i) => i.id !== ing.id))}
                            className="text-red-500 hover:text-red-700 font-bold cursor-pointer"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Add Ingredient Form */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
              <h4 className="font-bold text-slate-900 text-sm">➕ Add Raw Ingredient to Recipe</h4>
              <form onSubmit={handleAddIngredient} className="space-y-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ingredient Name</label>
                  <input
                    type="text"
                    required
                    value={newIngName}
                    onChange={(e) => setNewIngName(e.target.value)}
                    placeholder="e.g. Cashew Paste / Whole Spices"
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Quantity</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={newIngQty}
                      onChange={(e) => setNewIngQty(Number(e.target.value))}
                      className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Unit</label>
                    <select
                      value={newIngUnit}
                      onChange={(e) => setNewIngUnit(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-bold"
                    >
                      <option value="kg">kg</option>
                      <option value="liters">liters</option>
                      <option value="pcs">pcs</option>
                      <option value="grams">grams</option>
                      <option value="ml">ml</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Unit Raw Cost (₹)</label>
                  <input
                    type="number"
                    required
                    value={newIngCost}
                    onChange={(e) => setNewIngCost(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer text-xs"
                >
                  Save Ingredient to Recipe
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* NEW MENU ITEM MODAL */}
      {isNewMenuModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-slate-800 text-sm">Add New Food Menu Item</h3>
              <button onClick={() => setIsNewMenuModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleCreateMenuItem} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="e.g. Tandoori Butter Roti"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Category</label>
                <select
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="Starters">Starters</option>
                  <option value="Main Course">Main Course</option>
                  <option value="Beverages">Beverages</option>
                  <option value="Farm Specials">Farm Specials</option>
                  <option value="Desserts">Desserts</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Price (₹) *</label>
                <input
                  type="number"
                  required
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
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
                              setNewItemImagePath(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>

                    <input
                      type="text"
                      value={newItemImagePath}
                      onChange={(e) => setNewItemImagePath(e.target.value)}
                      placeholder="Or enter image URL / asset path..."
                      className="flex-1 p-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden font-mono text-[11px]"
                    />
                  </div>

                  {/* Image Preview Box */}
                  {newItemImagePath && (
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-300 bg-slate-50">
                      <img
                        src={newItemImagePath}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setNewItemImagePath('')}
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
                  onClick={() => setIsNewMenuModalOpen(false)}
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

      {/* MATERIAL REQUISITION MODAL */}
      {isReqModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-slate-800 text-sm">Request Raw Material Stock</h3>
              <button onClick={() => setIsReqModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleReqSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Material Name *</label>
                <input
                  type="text"
                  required
                  value={reqItemName}
                  onChange={(e) => setReqItemName(e.target.value)}
                  placeholder="e.g. Milk or Wheat Flour"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Quantity</label>
                  <input
                    type="number"
                    value={reqQty}
                    onChange={(e) => setReqQty(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Unit</label>
                  <select
                    value={reqUnit}
                    onChange={(e) => setReqUnit(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  >
                    <option value="kg">kg</option>
                    <option value="liters">liters</option>
                    <option value="pcs">pcs</option>
                    <option value="packets">packets</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReqModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg"
                >
                  Submit Requisition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
