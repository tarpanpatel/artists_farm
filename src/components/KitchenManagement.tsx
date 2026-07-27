import React, { useState, useEffect } from 'react';
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
  RefreshCw,
  Search,
  ShoppingCart
} from 'lucide-react';
import { Guest, Order, OrderItem, MenuItem, Requisition, InventoryItem } from '../types';
import { recordTelescopeLog } from '../utils/telescopeLogger';
import { resolveTelegramTemplate } from '../services/api';

interface KitchenManagementProps {
  guests: Guest[];
  orders: Order[];
  menu: MenuItem[];
  inventory?: InventoryItem[];
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
  inventory = [],
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

  const handleMarkDishReady = async (ord: Order, itemIndex: number, item: OrderItem) => {
    const key = `${ord.id}_${itemIndex}`;
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setReadyItemKeys((prev) => ({ ...prev, [key]: true }));
    setItemReadyTimes((prev) => ({ ...prev, [key]: nowTime }));

    if (onDispatchTelegram) {
      const cleanTicketId = ord.id.replace('#', '');
      const dishReadyVars: Record<string, string> = {
        order_id: cleanTicketId,
        qty: String(item.quantity),
        dish_name: item.name,
        instruction_note: '',
      };
      const resolved = await resolveTelegramTemplate('kitchen_single_dish_ready', dishReadyVars);
      
      const inlineKeyboard = {
        inline_keyboard: [
          [{ text: '🍽️ Tap when Served', callback_data: `serve_item_${cleanTicketId}_${itemIndex}` }]
        ]
      };

      const fallbackMsg = `🍽️ <b>DISH READY TO SERVE</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Order Ticket:</b> #${cleanTicketId}\n• <b>${item.quantity}x</b> ${item.name}\n━━━━━━━━━━━━━━━━━━\n🏃‍♂️ <i>Staff, please collect and tap below when served.</i>`;
      onDispatchTelegram('Single Dish Ready', resolved || fallbackMsg, 'kitchen', inlineKeyboard);
    }

    recordTelescopeLog({
      portal: 'requests',
      severity: 'INFO',
      msg: `PATCH /api/kitchen/orders/${ord.id}/items/${itemIndex} - Dish Ready (${item.name})`,
      origin: '/src/components/KitchenManagement.tsx -> handleMarkDishReady',
      details: { orderId: ord.id, itemIndex, item },
    });
  };

  const handleMarkDishServed = async (ord: Order, itemIndex: number, item: OrderItem) => {
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
      const servedVars: Record<string, string> = {
        item_name: item.name,
        quantity: String(item.quantity),
        guest_name: ord.guestName,
        table_no: ord.roomNumber,
        served_by: 'Cosmic (Service Staff)',
        remaining_items: '0',
      };
      const resolved = await resolveTelegramTemplate('item_served', servedVars);
      const singleItemServedMsg = resolved || `✅ <b>DISH SERVED TO RESIDENT</b>\n• Ticket: <b>#${cleanTicketId}</b> (${ord.guestName} - ${ord.roomNumber})\n• Served Dish: <b>${item.quantity}x ${item.name}</b>\n• Delivered By: <b>Cosmic (Service Staff)</b>\n• Served At: <b>${nowTime}</b>\n• Status: <b>Delivered & Served 🍽️</b>`;
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
  const [smDateRecord, setSmDateRecord] = useState('2026-07-25T12:07');
  const [smSelectedStaff, setSmSelectedStaff] = useState<string[]>([]);
  const [smConsumptionType, setSmConsumptionType] = useState('Freshly Prepared (New Stock)');
  const [smCustomMeal, setSmCustomMeal] = useState('');
  const [smEstCost, setSmEstCost] = useState('');
  const [smQuantity, setSmQuantity] = useState(1);
  const [isCustomMealModalOpen, setIsCustomMealModalOpen] = useState(false);
  const [newMealName, setNewMealName] = useState('');
  const [newMealCost, setNewMealCost] = useState('');
  const [smMealOptions, setSmMealOptions] = useState([
    { name: 'Rice, daal and sabzi', cost: 50 },
    { name: 'Chapati & Chicken Curry', cost: 80 }
  ]);
  const [smLogs, setSmLogs] = useState([
    { date: '25 Jul, 11:30 AM', staff: 'Abhijeet, Kinkar Sarkar, Pranay, Ramesh', food: '4x Rice, daal and sabzi', hasTag: false },
    { date: '25 Jul, 10:20 AM', staff: 'Kamlesh', food: '1x Rice, daal and sabzi', hasTag: false },
    { date: '14 Jul, 04:00 PM', staff: 'Abhijeet, Kamlesh, Kinkar Sarkar, Ramesh, Saha Das, Samar Sil', food: '6x Rice, daal and sabzi', hasTag: false },
    { date: '14 Jul, 02:00 PM', staff: 'Ashish Mandal, Subrata, Abhijeet, Bikas, Kamlesh, Subrata, Kinkar', food: '7x Chapati & Chicken Curry', hasTag: false },
    { date: '14 Jul, 01:30 PM', staff: 'Subrata, Rohit, Vikas, Kamlesh', food: '4x Leftover Buffer items', hasTag: true },
    { date: '14 Jul, 01:00 PM', staff: 'Kamlesh, Rohit, Bikas, Subrata, Abhijeet, Kinkar, Vikas, Subrata, Kinkar, Subrata, Abhijeet, Kinkar', food: '12x Evening Chai', hasTag: false },
  ]);
  const [smVisibleCount, setSmVisibleCount] = useState(10);

  const smStaffList = [
    'ABHIJEET', 'ASHISH MANDAL', 'KAMLESH', 'KINKAR SARKAR', 'PRANAY',
    'RAMESH', 'SAHA DAS', 'SAMAR SIL', 'SUBRATA', 'BIKAS'
  ];


  const handleSaveCustomMeal = () => {
    if (!newMealName) return;
    const cost = parseFloat(newMealCost) || 0;
    setSmMealOptions(prev => [...prev, { name: newMealName, cost }]);
    setSmCustomMeal(newMealName);
    setSmEstCost(cost.toString());
    setIsCustomMealModalOpen(false);
    setNewMealName('');
    setNewMealCost('');
  };
  const [smError, setSmError] = useState('');

  const handleLogStaffMeal = () => {
    if (smSelectedStaff.length === 0) {
      setSmError("Please select at least one staff member.");
      return;
    }
    
    setSmError('');
    
    const now = new Date();
    const formattedDate = `${now.getDate()} ${now.toLocaleString('en-US', {month: 'short'})}, ${now.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'})}`;
    
    const foodStr = smCustomMeal ? `${smQuantity}x ${smCustomMeal}` : `${smQuantity}x ${smConsumptionType}`;
    
    const newLog = {
      date: formattedDate,
      staff: smSelectedStaff.join(', '),
      food: foodStr,
      hasTag: smConsumptionType === 'Leftover Buffer items'
    };
    
    setSmLogs(prev => [newLog, ...prev]);
    
    // Reset Form
    setSmSelectedStaff([]);
    setSmQuantity(1);
    setSmCustomMeal('');
    setSmEstCost('');
  };

  const handleSmToggleStaff = (staff: string) => {
    setSmSelectedStaff(prev => 
      prev.includes(staff) ? prev.filter(s => s !== staff) : [...prev, staff]
    );
  };

  const handleDispatchStaffMeal = (e: React.FormEvent) => {
    e.preventDefault();
    if (smSelectedStaff.length === 0) {
      alert("Please select at least one staff member.");
      return;
    }
    const staffName = smSelectedStaff.join(', ');
    const foodStr = smCustomMeal ? smCustomMeal : smConsumptionType;

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
          name: `Staff Meal: ${foodStr}`,
          quantity: smQuantity,
          unitPrice: 0,
        },
      ],
      totalAmount: 0,
    };
    onAddOrder(staffOrder);
    alert(`Staff meal ticket ${staffOrder.id} dispatched to Kitchen KDS Queue!`);
    
    // Reset Form
    setSmSelectedStaff([]);
    setSmQuantity(1);
    setSmCustomMeal('');
    setSmEstCost('');
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
  const [selectedStockItemId, setSelectedStockItemId] = useState('');

  const handleStockItemSelect = (itemId: string) => {
    setSelectedStockItemId(itemId);
    const item = inventory.find((i: InventoryItem) => i.id === itemId);
    if (item) {
      setNewIngName(item.name);
      setNewIngUnit(item.unit || 'kg');
      const estimatedCost = (item as any).price || (item as any).unitCost || 100;
      setNewIngCost(estimatedCost);
    } else {
      setNewIngName('');
    }
  };

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
    setSelectedStockItemId('');
    setNewIngName('');
  };
  const [kdsFilter, setKdsFilter] = useState<'All' | 'Pending' | 'Preparing' | 'Fulfilled'>('All');

  // New Order Form State
  const activeGuests = guests.filter((g) => g.status === 'Active');
  const [selectedGuestId, setSelectedGuestId] = useState<string>(activeGuests[0]?.id || '');
  const [cartItems, setCartItems] = useState<{ menuItem: MenuItem; quantity: number }[]>(() => {
    try { return JSON.parse(localStorage.getItem('kitchen_cart_items') || '[]'); } catch { return []; }
  });
  const [posSearch, setPosSearch] = useState('');
  const [selectedPosCategory, setSelectedPosCategory] = useState<string>('All Menu');
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  const [isCartDrawerExpanded, setIsCartDrawerExpanded] = useState<boolean>(false);

  useEffect(() => { localStorage.setItem('kitchen_cart_items', JSON.stringify(cartItems)); }, [cartItems]);

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
      {/* Top Header (Hidden on Take Food Order POS view) */}
      {activeTab !== 'new_order' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-800 p-3.5 sm:p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-2xs">
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
              Kitchen Ticketing & Requisition POS
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
              Manage live kitchen display system (KDS), create room orders, manage menu items & raw material requisitions
            </p>
          </div>

          <div className="flex items-center gap-2">
            {activeTab !== 'staff_meals' && (
              <button
                onClick={() => setActiveTab('new_order')}
                className="text-white bg-blue-700 hover:bg-blue-800 font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create Resident Order</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB 1: KDS TICKET QUEUE */}
      {activeTab === 'kds' && (
        <div className="kds-orders-container space-y-4">
          <div className="kds-status-filter-bar flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-700 text-xs gap-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700 dark:text-slate-300">Filter Orders:</span>
              <div className="flex items-center gap-1.5">
                {(['All', 'Pending', 'Preparing', 'Fulfilled'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setKdsFilter(status)}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                      kdsFilter === status
                        ? 'bg-slate-900 dark:bg-slate-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* Smart Polling / Live Sync Bar */}
            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl w-full sm:w-auto justify-between sm:justify-start">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
                  className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    autoSyncEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
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
                  <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-blue-500 animate-ping' : autoSyncEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400 dark:bg-slate-500'}`}></span>
                  <span className="font-bold text-slate-700 dark:text-slate-300 text-[11px]">
                    {autoSyncEnabled ? 'Live KDS Sync' : 'Sync Paused'}
                  </span>
                  {autoSyncEnabled && (
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                      ({syncCountdown}s)
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 hidden md:inline">Synced {lastSyncTime}</span>
                <button
                  onClick={triggerManualSync}
                  disabled={isSyncing}
                  className="bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 font-semibold px-2 py-0.5 rounded text-[11px] flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-2xs"
                  title="Check for kitchen updates immediately"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
                  <span>Sync</span>
                </button>
              </div>
            </div>
          </div>

          <div className="kds-tickets-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredOrders.map((ord) => (
              <div
                key={ord.id}
                className="kds-ticket-card bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs p-3.5 flex flex-col justify-between"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2 mb-2.5">
                    <div>
                      <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                        Order #{ord.id.replace('#', '')}
                      </h3>
                      <p className="text-slate-400 dark:text-slate-500 text-[10px] font-medium">
                        (Received: {ord.orderTime || '01:15 AM'})
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      ord.status === 'Fulfilled' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {ord.status}
                    </span>
                  </div>

                  {/* Items List */}
                  <div className="kds-ticket-items-list space-y-2 text-xs">
                    {ord.items.map((item, idx) => {
                      const itemKey = `${ord.id}_${idx}`;
                      const isReady = readyItemKeys[itemKey];
                      const isServed = servedItemKeys[itemKey];
                      const readyTime = itemReadyTimes[itemKey];

                      return (
                        <div key={idx} className="flex justify-between items-center gap-2 py-1 border-b border-slate-50 last:border-0">
                          <div className="flex items-center flex-wrap gap-1.5">
                            {isReady || isServed ? (
                              <>
                                <span className="font-bold text-emerald-600 line-through text-xs">
                                  {item.quantity}x {item.name}
                                </span>
                                {readyTime && (
                                  <span className="text-emerald-600 font-medium text-[10px] ml-1">
                                    ({readyTime})
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="font-extrabold text-rose-600 text-xs">
                                {item.quantity}x {item.name}
                              </span>
                            )}
                          </div>

                          {/* Mobile-Friendly Touch Ready Buttons */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isServed ? (
                              <span className="text-[11px] font-extrabold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300">
                                ✓ Served
                              </span>
                            ) : isReady ? (
                              <button
                                type="button"
                                onClick={() => handleMarkDishServed(ord, idx, item)}
                                className="btn-kds-item-served border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-extrabold text-xs px-3.5 py-1.5 rounded-lg transition-all shadow-2xs flex items-center gap-1 cursor-pointer min-h-[36px] active:scale-95"
                                title="Click when served to resident"
                              >
                                <span>✓ Served</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleMarkDishReady(ord, idx, item)}
                                className="btn-kds-complete border border-emerald-500 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-3.5 py-1.5 rounded-lg transition-all shadow-xs flex items-center gap-1 cursor-pointer min-h-[36px] active:scale-95"
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
              </div>
            ))}
          </div>

          {/* Today's Served Logs section matching original site bottom section */}
          <div className="mt-8 space-y-3">
            <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-bold text-sm">
              <span className="text-emerald-600">✅</span>
              <span>Today's Served Logs</span>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-xs divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden">
              {servedLogs.map((log) => (
                <div key={log.id} className="p-3.5 flex items-center justify-between text-xs hover:bg-slate-50/60 dark:hover:bg-slate-700/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className="font-extrabold text-slate-900 dark:text-white w-24">Ticket #{log.ticketId}</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 text-xs">{log.itemSummary}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Served by <span className="font-bold text-slate-700 dark:text-slate-300">{log.servedBy}</span> for at <span className="font-bold text-slate-800 dark:text-slate-200">{log.servedAt}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CREATE ORDER POS */}
      {activeTab === 'new_order' && (() => {
        const activeGuest = activeGuests[0];
        const selectedGuest = activeGuest || activeGuests.find((g) => g.id === selectedGuestId);
        const filteredPosMenuItems = menu.filter((item) => {
          const matchesSearch = item.name.toLowerCase().includes(posSearch.toLowerCase().trim());
          const matchesCategory = selectedPosCategory === 'All Menu' || item.category === selectedPosCategory;
          return matchesSearch && matchesCategory;
        });
        const posCategories = [
          'All Menu',
          'Starters',
          'Chinese',
          'Pizza & Sandwich',
          'Main Course',
          'Rice & Roti',
          'Breakfast',
          'Raita & Salad',
          'Beverages',
        ];
        const totalCartSum = cartItems.reduce((sum, i) => sum + i.menuItem.price * i.quantity, 0);
        const totalCartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);

        const handleAddToCartWithFeedback = (item: MenuItem) => {
          handleAddToCart(item);
          setRecentlyAddedId(item.id);
          setTimeout(() => {
            setRecentlyAddedId(null);
          }, 750);
        };

        // Items to display in collapsed bottom drawer on mobile (Last 3 added items, newest on top)
        const visibleDrawerItems = isCartDrawerExpanded ? [...cartItems].reverse() : [...cartItems].slice(-3).reverse();

        return (
          <div className="take-food-order-container space-y-4 pb-48 lg:pb-0">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
              {/* Left Side (Desktop: 3 columns, Mobile: 1 column full width) */}
              <div className="lg:col-span-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs p-3.5 sm:p-4 space-y-3.5">
                {/* Sticky Search & Category Pills Bar */}
                <div className="pos-category-filter-bar bg-white dark:bg-slate-800 pt-2 pb-3 space-y-3 -mx-1 px-1 sm:-mx-4 sm:px-4 border-b border-slate-100 dark:border-slate-700 shadow-2xs rounded-t-xl">
                  {/* Quick Search Bar */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={posSearch}
                      onChange={(e) => setPosSearch(e.target.value)}
                      placeholder="Quick search menu items on the fly.."
                      className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 shadow-2xs"
                    />
                    {posSearch && (
                      <button
                        onClick={() => setPosSearch('')}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Category Pills Bar */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
                    {posCategories.map((cat) => {
                      const isSelected = selectedPosCategory === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => setSelectedPosCategory(cat)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-cyan-500 text-white shadow-2xs'
                              : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Category Header */}
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
                  <h3 className="font-extrabold text-slate-700 dark:text-slate-300 text-xs tracking-wider uppercase">
                    {selectedPosCategory === 'All Menu' ? 'ALL MENU ITEMS' : selectedPosCategory}
                  </h3>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 font-semibold">
                    {filteredPosMenuItems.length} items
                  </span>
                </div>

                {/* Menu Items Grid with Dish Thumbnails (Mobile: 1 column, Sm: 2 cols, Lg: 3 cols) */}
                {filteredPosMenuItems.length === 0 ? (
                  <div className="text-center py-10 border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-xl">
                    <UtensilsCrossed className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-600 dark:text-slate-400 font-bold text-xs">No food items found matching "{posSearch}"</p>
                  </div>
                ) : (
                  <div className="pos-menu-grid flex flex-col gap-2.5">
                    {filteredPosMenuItems.map((item) => {
                      const isRecentlyAdded = recentlyAddedId === item.id;
                      return (
                        <div
                          key={item.id}
                          className={`pos-food-card bg-white dark:bg-slate-800 rounded-xl border p-2 flex items-center justify-between gap-2.5 transition-all ${
                            isRecentlyAdded
                              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/20 shadow-xs'
                              : 'border-slate-200/90 dark:border-slate-700 hover:border-cyan-400 hover:shadow-2xs'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {/* Dish Image Thumbnail */}
                            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 overflow-hidden shrink-0 flex items-center justify-center text-slate-400 dark:text-slate-500 font-semibold text-[10px]">
                              {item.imagePath ? (
                                <img
                                  src={item.imagePath}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <span>Dish</span>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs truncate">
                                {item.name}
                              </h4>
                              <p className="text-slate-500 dark:text-slate-400 font-extrabold text-[11px] mt-0.5">₹{item.price.toFixed(2)}</p>
                            </div>
                          </div>

                          <button
                            onClick={() => handleAddToCartWithFeedback(item)}
                            className={`btn-add-to-cart shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-150 flex items-center gap-1 cursor-pointer min-h-[36px] ${
                              isRecentlyAdded
                                ? 'bg-emerald-600 text-white border border-emerald-600 scale-95 animate-pulse shadow-md'
                                : 'bg-slate-50 dark:bg-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-slate-800 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-400 border border-slate-300 dark:border-slate-600 hover:border-emerald-400 active:scale-90 shadow-2xs'
                            }`}
                          >
                            {isRecentlyAdded ? (
                              <span>✓ Added!</span>
                            ) : (
                              <span>+ Add</span>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Side: DESKTOP ONLY Sticky Floating ORDER CART Panel (lg:col-span-1 hidden lg:flex) */}
              <div
                id="pos-order-cart-panel"
                className="hidden lg:flex lg:col-span-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/90 dark:border-slate-700 shadow-2xs p-4 flex-col justify-between space-y-4 min-h-[450px] sticky top-20 max-h-[calc(100vh-100px)] overflow-y-auto"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2.5">
                    <h3 className="font-extrabold text-slate-900 dark:text-white text-xs tracking-wider flex items-center gap-1.5">
                      <ShoppingCart className="w-4 h-4 text-slate-700 dark:text-slate-400" />
                      <span>ORDER CART</span>
                    </h3>
                    <span className="text-[10px] font-extrabold bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-200 dark:border-cyan-800">
                      {totalCartCount} Items
                    </span>
                  </div>

                  {/* Cart Items List */}
                  <div className="pos-cart-items-list space-y-2 max-h-[380px] overflow-y-auto pr-0.5 divide-y divide-slate-100 dark:divide-slate-700">
                    {cartItems.length > 0 ? (
                      cartItems.map((ci) => (
                        <div
                          key={ci.menuItem.id}
                          className="pt-2 first:pt-0 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex-1 pr-1">
                            <h4 className="font-bold text-slate-900 dark:text-white text-xs leading-snug">
                              {ci.menuItem.name} <span className="text-slate-400 dark:text-slate-500 font-normal">({`₹${ci.menuItem.price}`})</span>
                            </h4>
                          </div>

                          <div className="flex items-center border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 overflow-hidden shrink-0">
                            <button
                              onClick={() => handleUpdateCartQuantity(ci.menuItem.id, -1)}
                              className="btn-cart-qty-minus w-7 h-7 hover:bg-slate-100 dark:hover:bg-slate-700 font-black text-slate-600 dark:text-slate-400 flex items-center justify-center transition-colors cursor-pointer active:scale-90"
                            >
                              -
                            </button>
                            <span className="w-6 text-center font-extrabold text-slate-900 dark:text-white text-xs">
                              {ci.quantity}
                            </span>
                            <button
                              onClick={() => handleUpdateCartQuantity(ci.menuItem.id, 1)}
                              className="btn-cart-qty-plus w-7 h-7 hover:bg-slate-100 dark:hover:bg-slate-700 font-black text-slate-600 dark:text-slate-400 flex items-center justify-center transition-colors cursor-pointer active:scale-90"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-10 text-slate-400 dark:text-slate-500">
                        <ShoppingCart className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Your order cart is empty</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Click + Add on items from the menu</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cart Total & Submit Button */}
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wide text-xs">TOTAL:</span>
                    <span className="font-black text-emerald-600 text-base">
                      ₹{totalCartSum.toFixed(2)}
                    </span>
                  </div>

                  <button
                    onClick={handleOrderSubmit}
                    disabled={cartItems.length === 0 || !selectedGuest || activeGuests.length === 0}
                    title={
                      activeGuests.length === 0
                        ? 'No active resident checked in. Click ACTIVATE LEDGER in sidebar.'
                        : cartItems.length === 0
                        ? 'Order cart is empty'
                        : 'Send Order to Kitchen'
                    }
                    className="btn-send-order-kitchen w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 disabled:text-slate-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-xs py-3.5 rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wider active:scale-[0.98] min-h-[42px]"
                  >
                    <span>Send Order to Kitchen</span>
                  </button>
                </div>
              </div>
            </div>

            {/* MOBILE ONLY Light-Theme Bottom Cart Drawer (lg:hidden, Collapsible & 50vh Expandable) */}
            {cartItems.length > 0 && (
              <div
                className={`fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-t-2xl shadow-2xl border-t border-slate-200 dark:border-slate-700 transition-all duration-300 flex flex-col ${
                  isCartDrawerExpanded ? 'h-[50vh]' : 'max-h-[260px]'
                }`}
              >
                {/* Header Bar */}
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-t-2xl border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 font-extrabold text-xs px-2.5 py-1 rounded-xl shadow-2xs flex items-center gap-1">
                      <ShoppingCart className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-500" />
                      <span>{totalCartCount} Items</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">TOTAL: </span>
                      <span className="text-emerald-600 font-black text-sm">₹{totalCartSum.toFixed(2)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsCartDrawerExpanded(!isCartDrawerExpanded)}
                    className="bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-cyan-700 dark:text-cyan-400 font-extrabold text-xs px-3 py-1.5 rounded-xl border border-cyan-300 dark:border-cyan-700 shadow-2xs flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                  >
                    {isCartDrawerExpanded ? (
                      <span>▼ Collapse</span>
                    ) : (
                      <span>▲ Expand Cart (50%)</span>
                    )}
                  </button>
                </div>

                {/* Items List (Displays Last 3 items in Collapsed mode, All items in 50vh Expanded mode) */}
                <div className="pos-cart-items-list p-3 flex-1 overflow-y-auto space-y-2">
                  {!isCartDrawerExpanded && cartItems.length > 3 && (
                    <p className="text-[10px] text-cyan-700 font-extrabold tracking-wide uppercase text-center pb-1">
                      Showing Last 3 Added Items (Click Expand for all {cartItems.length} items)
                    </p>
                  )}
                  {visibleDrawerItems.map((ci) => (
                    <div
                      key={ci.menuItem.id}
                      className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center justify-between gap-2 text-xs text-slate-900"
                    >
                      <div className="flex-1 pr-1 truncate">
                        <h4 className="font-bold text-slate-900 text-xs truncate">
                          {ci.menuItem.name} <span className="text-slate-500 font-normal">({`₹${ci.menuItem.price}`})</span>
                        </h4>
                      </div>

                      <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shrink-0">
                        <button
                          onClick={() => handleUpdateCartQuantity(ci.menuItem.id, -1)}
                          className="btn-cart-qty-minus w-7 h-7 hover:bg-slate-100 font-black text-slate-700 flex items-center justify-center transition-colors cursor-pointer active:scale-90"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-extrabold text-slate-900 text-xs">
                          {ci.quantity}
                        </span>
                        <button
                          onClick={() => handleUpdateCartQuantity(ci.menuItem.id, 1)}
                          className="btn-cart-qty-plus w-7 h-7 hover:bg-slate-100 font-black text-slate-700 flex items-center justify-center transition-colors cursor-pointer active:scale-90"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action Footer */}
                <div className="p-3 bg-white border-t border-slate-200 shrink-0">
                  <button
                    onClick={handleOrderSubmit}
                    disabled={cartItems.length === 0 || !selectedGuest || activeGuests.length === 0}
                    title={
                      activeGuests.length === 0
                        ? 'No active resident checked in. Click ACTIVATE LEDGER in sidebar.'
                        : cartItems.length === 0
                        ? 'Order cart is empty'
                        : 'Send Order to Kitchen'
                    }
                    className="btn-send-order-kitchen w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-xs py-2.5 rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wider active:scale-[0.98] min-h-[40px]"
                  >
                    <span>Send Order to Kitchen</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* TAB 3: MENU CATALOG */}
      {activeTab === 'menu_catalog' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs p-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Resort Food & Beverage Catalog</h3>
            <button
              onClick={() => setIsNewMenuModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Add Menu Item
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {menu.map((item) => (
              <div key={item.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-700/50">
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded">
                  {item.category}
                </span>
                <h4 className="font-bold text-slate-900 dark:text-white text-sm mt-1">{item.name}</h4>
                <p className="font-bold text-emerald-700 dark:text-emerald-400 text-sm mt-0.5">₹{item.price}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: RAW MATERIAL REQUISITIONS */}
      {activeTab === 'requisitions' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs p-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Kitchen Raw Material Requisitions Log</h3>
            <button
              onClick={() => setIsReqModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Request Material Stock
            </button>
          </div>

          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-700 font-bold border-b border-slate-200 dark:border-slate-600 uppercase text-[11px]">
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
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {requisitions.map((req) => (
                  <tr key={req.id}>
                    <td className="py-2.5 px-3 font-bold">{req.id}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">{req.itemName}</td>
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
                              (async () => {
                                const reqApprVars: Record<string, string> = {
                                  req_id: req.id,
                                  item_name: req.itemName,
                                  qty: String(req.requestedQty),
                                  unit: req.unit,
                                  requested_by: req.requestedBy,
                                };
                                const resolved = await resolveTelegramTemplate('kitchen_requisition_approved', reqApprVars);
                                const reqMsg = resolved || `✅ <b>MATERIAL REQUISITION APPROVED #${req.id}</b>\n• Material: <b>${req.itemName}</b> (${req.requestedQty} ${req.unit})\n• Requested By: <b>${req.requestedBy}</b>\n• Status: Released & Fulfilled from Store ✓`;
                                onDispatchTelegram('Requisition Approved', reqMsg, 'kitchen');
                              })();
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left Panel: Record Consumption */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-6">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
              <span>➕</span> RECORD CONSUMPTION
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1.5 uppercase">Date & Time of Record</label>
                <input 
                  type="datetime-local" 
                  value={smDateRecord}
                  onChange={(e) => setSmDateRecord(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs focus:outline-hidden focus:border-cyan-500 shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1.5 uppercase">Consuming Staff Members</label>
                <div className="grid grid-cols-2 gap-3 p-4 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900/50">
                  {smStaffList.map(staff => (
                    <label key={staff} className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={smSelectedStaff.includes(staff)}
                        onChange={() => handleSmToggleStaff(staff)}
                        className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{staff}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1.5 uppercase">Consumption Type</label>
                <select 
                  value={smConsumptionType}
                  onChange={(e) => setSmConsumptionType(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs focus:outline-hidden focus:border-cyan-500 shadow-2xs cursor-pointer"
                >
                  <option value="Freshly Prepared (New Stock)">Freshly Prepared (New Stock)</option>
                  <option value="Leftover Buffer items">Leftover Buffer items</option>
                  <option value="Evening Chai">Evening Chai</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1.5 uppercase">Custom Meal Combination</label>
                  <div className="flex gap-2">
                    <select 
                      value={smCustomMeal}
                      onChange={(e) => {
                        setSmCustomMeal(e.target.value);
                        const selected = smMealOptions.find(m => m.name === e.target.value);
                        if (selected) setSmEstCost(selected.cost.toString());
                      }}
                      className="flex-1 p-2.5 rounded-xl border border-cyan-300 dark:border-cyan-700 font-semibold bg-white dark:bg-slate-900 text-cyan-700 dark:text-cyan-400 text-xs focus:outline-hidden shadow-2xs cursor-pointer"
                    >
                      <option value="">-- Select Database Meal --</option>
                      {smMealOptions.map((opt, i) => (
                        <option key={i} value={opt.name}>{opt.name}</option>
                      ))}
                    </select>
                    <button 
                      onClick={() => setIsCustomMealModalOpen(true)}
                      className="bg-slate-700 hover:bg-slate-800 text-white px-3 rounded-xl shadow-2xs font-bold text-xs flex items-center justify-center cursor-pointer transition-all"
                    >
                      + New
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1.5 uppercase text-right">Est. Cost Value (₹)</label>
                  <input 
                    type="number" 
                    value={smEstCost}
                    onChange={(e) => setSmEstCost(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs focus:outline-hidden shadow-2xs text-right"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1.5 uppercase">Quantity</label>
                <div className="flex items-center gap-1 w-32">
                  <button onClick={() => setSmQuantity(Math.max(1, smQuantity - 1))} type="button" className="w-10 h-10 flex items-center justify-center bg-cyan-500 text-white rounded-l-xl font-bold hover:bg-cyan-600 transition-colors cursor-pointer shadow-2xs">-</button>
                  <div className="h-10 flex-1 flex items-center justify-center bg-white dark:bg-slate-900 border-y border-slate-300 dark:border-slate-600 text-sm font-bold text-slate-700 dark:text-slate-200 shadow-2xs">{smQuantity}</div>
                  <button onClick={() => setSmQuantity(smQuantity + 1)} type="button" className="w-10 h-10 flex items-center justify-center bg-cyan-500 text-white rounded-r-xl font-bold hover:bg-cyan-600 transition-colors cursor-pointer shadow-2xs">+</button>
                </div>
              </div>

              <div className="pt-4">
                {smError && (
                  <p className="text-red-500 text-[10px] font-bold mb-2 text-center animate-pulse">{smError}</p>
                )}
                <button type="button" onClick={handleLogStaffMeal} className="w-full mx-auto block py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-2xs transition-all cursor-pointer text-xs">
                  Log Staff Meal
                </button>
              </div>
            </div>
          </div>

          {/* Right Panel: Monthly Tracking Log */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col h-full">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span>📋</span> MONTHLY TRACKING LOG (JUL 2026)
              </div>
              <div className="flex items-center gap-2 border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1 bg-slate-50 dark:bg-slate-900 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700">
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">July, 2026</span>
                <span className="text-[10px]">📅</span>
              </div>
            </h3>
            
            <div className="flex-1 overflow-auto pr-2 custom-scrollbar">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white dark:bg-slate-800 z-10">
                  <tr className="border-b border-slate-100 dark:border-slate-700">
                    <th className="pb-3 text-[10px] font-bold text-slate-400 w-1/4">Date & Time</th>
                    <th className="pb-3 text-[10px] font-bold text-slate-400 w-1/2">Staff Members</th>
                    <th className="pb-3 text-[10px] font-bold text-slate-400 w-1/4">Total Food Consumed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {smLogs.slice(0, smVisibleCount).map((log, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="py-4 pr-3 text-[10px] font-semibold text-slate-500 dark:text-slate-400 align-top">
                        {log.date.replace(', ', '\n').split('\n').map((l, idx) => <div key={idx}>{l}</div>)}
                      </td>
                      <td className="py-4 pr-3 text-[10px] font-bold text-slate-700 align-top leading-relaxed">
                        {log.staff}
                      </td>
                      <td className="py-4 pr-3 text-[10px] font-semibold text-slate-600 align-top relative">
                        {log.food}
                        {log.hasTag && (
                          <div className="absolute right-0 top-4 w-3 h-3 bg-amber-200 rounded-sm flex items-center justify-center text-[7px] text-amber-700 font-bold border border-amber-300">
                            G
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {smLogs.length > smVisibleCount && (
              <div className="pt-4 mt-4 text-center border-t border-slate-100">
                <button 
                  onClick={() => setSmVisibleCount((prev: number) => prev + 10)}
                  className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-[10px] px-6 py-2 rounded-full shadow-2xs transition-colors cursor-pointer"
                >
                  Load More Entries ({smLogs.length - smVisibleCount} remaining)
                </button>
              </div>
            )}
          </div>
        </div>
      )}
        {/* CUSTOM MEAL MODAL */}
        {isCustomMealModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs tracking-wide flex items-center gap-2">
                  <span className="text-sm">➕</span> CREATE CUSTOM MEAL TEMPLATE
                </h3>
              </div>
              
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-2">Combo/Meal Name</label>
                  <input 
                    type="text"
                    placeholder="e.g., 2 Roti, Dal & Rice"
                    value={newMealName}
                    onChange={(e) => setNewMealName(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 focus:outline-hidden focus:border-emerald-500 shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-2">Default Estimated Price (₹)</label>
                  <input 
                    type="number"
                    placeholder="50.00"
                    value={newMealCost}
                    onChange={(e) => setNewMealCost(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 focus:outline-hidden focus:border-emerald-500 shadow-xs"
                  />
                </div>
              </div>
              
              <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
                <button 
                  onClick={() => setIsCustomMealModalOpen(false)}
                  className="px-5 py-2 text-[11px] font-bold text-slate-600 dark:text-slate-400 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveCustomMeal}
                  className="px-5 py-2 text-[11px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Save to Database
                </button>
              </div>
            </div>
          </div>
        )}

      {/* TAB: BETA RECIPE BUILDER */}
      {activeTab === 'beta_recipe_builder' && (
        <div className="beta-recipe-builder-container bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-6">
          <div className="border-b border-slate-100 dark:border-slate-700 pb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>🧪</span> Beta Recipe Costing & Food Margin Builder
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Calculate precise raw material ingredient costs, portion yield, and food profit margins for menu items.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Target Dish:</span>
              <select
                value={selectedRecipeMenuItemId}
                onChange={(e) => setSelectedRecipeMenuItemId(e.target.value)}
                className="recipe-dish-selector p-2 rounded-xl border border-indigo-300 font-bold text-xs bg-indigo-50 text-indigo-900"
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
            <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-xl border border-slate-200 dark:border-slate-600">
              <p className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px]">Dish Selling Price</p>
              <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">₹{dishSellingPrice}</p>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Current Guest Billing Price</span>
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
                <h4 className="font-bold text-slate-900 dark:text-white text-sm border-l-3 border-indigo-600 pl-2.5">
                  Raw Ingredients Breakdown for {selectedRecipeMenuItem?.name}
                </h4>
                <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px]">{recipeIngredients.length} Ingredients</span>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-600 rounded-xl">
                <table className="recipe-ingredients-table w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-700 font-bold uppercase text-[10px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-600">
                    <tr>
                      <th className="p-3">Ingredient</th>
                      <th className="p-3 text-center">Quantity per Portion</th>
                      <th className="p-3 text-right">Cost / Unit</th>
                      <th className="p-3 text-right">Total Ingredient Cost</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-600">
                    {recipeIngredients.map((ing) => (
                      <tr key={ing.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="p-3 font-bold text-slate-900 dark:text-white">{ing.name}</td>
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
                            className="btn-remove-ingredient text-red-500 hover:text-red-700 font-bold cursor-pointer"
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
            <div className="add-ingredient-form-card bg-slate-50 dark:bg-slate-700/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-600 space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">➕ Add Raw Ingredient to Recipe</h4>
              <form onSubmit={handleAddIngredient} className="space-y-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Select Ingredient from Kitchen Stock</label>
                  {inventory && inventory.length > 0 ? (
                    <select
                      required
                      value={selectedStockItemId}
                      onChange={(e) => handleStockItemSelect(e.target.value)}
                      className="select-kitchen-stock-dropdown w-full p-2.5 rounded-xl border border-indigo-300 bg-white font-medium text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 shadow-xs"
                    >
                      <option value="">-- Choose Stock Ingredient --</option>
                      {inventory.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.category}) — Stock: {item.currentStock} {item.unit}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-xs">
                      ⚠️ No items found in Kitchen Stock. Please add raw materials in <strong>Edit Kitchen Stock</strong> first.
                    </div>
                  )}
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
                  className="btn-save-ingredient w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer text-xs"
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
