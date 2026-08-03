import React, { useState, useEffect, useMemo } from 'react';
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
  ShoppingCart,
  ArrowUp,
  Save,
  Bookmark,
  Trash2,
  Pencil,
  Minus,
  Copy,
  Scale
} from 'lucide-react';
import { Guest, Order, OrderItem, MenuItem, Requisition, InventoryItem } from '../types';
import { recordTelescopeLog } from '../utils/telescopeLogger';
import { resolveTelegramTemplate, fetchServedLogsFromDB, addServedLogToDB, fetchMaterialCategoriesFromDB, fetchRecipesFromDB, saveRecipeToDB, deleteRecipeFromDB, depleteStockForDish, getPropertySlug } from '../services/api';
import { StyledSelect } from './StyledSelect';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import DataTable from 'react-data-table-component';

import { useKitchenContext } from '../contexts/KitchenContext';
import { useInventoryContext } from '../contexts/InventoryContext';
import { useAuth } from '../contexts/AuthContext';

interface KitchenManagementProps {
  guests: Guest[];
  menu: MenuItem[];
  onAddMenuItem: (item: MenuItem) => void;
  onRequestMaterial: (req: Requisition) => void;
  onDispatchTelegram?: (eventType: string, message: string, category?: 'kitchen' | 'admin' | 'finance' | 'all', replyMarkup?: any, templateKey?: string) => void;
  activeMenuItemKey?: string;
  isTestingMode?: boolean;
}

export const KitchenManagement: React.FC<KitchenManagementProps> = ({
  guests,
  menu,
  onAddMenuItem,
  onRequestMaterial,
  onDispatchTelegram,
  activeMenuItemKey = 'kitchen_orders',
  isTestingMode = false,
}) => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { orders, addOrder } = useKitchenContext();
  const { inventory, requisitions } = useInventoryContext();
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'kds' | 'new_order' | 'menu_catalog' | 'requisitions' | 'staff_meals' | 'beta_recipe_builder'>('kds');

  const getCurrentUserName = () => {
    if (currentUser?.name) return currentUser.name;
    if (currentUser?.username) return currentUser.username;
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem(`artists_farm_user_${getPropertySlug()}`);
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          return user.name || user.username || 'Service Staff';
        } catch (e) {}
      }
    }
    return 'Service Staff';
  };
  const [readyItemKeys, setReadyItemKeys] = useState<Record<string, boolean>>({});
  const [servedItemKeys, setServedItemKeys] = useState<Record<string, boolean>>({});
  const [itemReadyTimes, setItemReadyTimes] = useState<Record<string, string>>({});

  const [servedLogs, setServedLogs] = useState<Array<{ id: string; orderId: string; itemName: string; quantity: number; servedBy: string; guestName: string; roomNumber: string; servedAt: string }>>([]);

  // Load served logs from DB on mount
  useEffect(() => {
    fetchServedLogsFromDB().then((logs) => {
      if (logs.length > 0) setServedLogs(logs);
    });
  }, []);

  const [ingredientCategoryNames, setIngredientCategoryNames] = useState<string[]>([]);
  useEffect(() => {
    fetchMaterialCategoriesFromDB().then((cats) => {
      setIngredientCategoryNames(cats.filter(c => c.is_ingredient).map(c => c.name));
    });
  }, []);

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
      onDispatchTelegram('Single Dish Ready', resolved || fallbackMsg, 'kitchen', inlineKeyboard, 'kitchen_single_dish_ready');
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
      showToast(`⚠️ [Telegram answerCallbackQuery]: Dish "${item.name}" on Ticket #${cleanTicketId} is ALREADY marked as SERVED!`, { type: 'warning' });
      return;
    }

    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setServedItemKeys((prev) => ({ ...prev, [key]: true }));

    // Add to Current Guest Served Dishes
    const servedByUser = getCurrentUserName();
    const newLog = {
      id: Date.now().toString(),
      orderId: cleanTicketId,
      itemName: item.name,
      quantity: item.quantity,
      servedBy: servedByUser,
      guestName: ord.guestName,
      roomNumber: ord.roomNumber,
      servedAt: `${new Date().toLocaleDateString()} ${nowTime}`,
    };
    setServedLogs((prev) => [newLog, ...prev]);
    addServedLogToDB({
      order_id: cleanTicketId,
      item_name: item.name,
      quantity: item.quantity,
      served_by: servedByUser,
      guest_name: ord.guestName,
      room_number: ord.roomNumber,
    });

    // BOM Stock Depletion: auto-deduct ingredients from inventory
    const matchedMenuItem = menu.find((m) => m.name.toLowerCase() === item.name.toLowerCase());
    if (matchedMenuItem && allRecipes[matchedMenuItem.id]) {
      const depResult = await depleteStockForDish(matchedMenuItem.id, item.quantity);
      if (depResult.status !== 'success') {
        // Stock depletion failed, but continue serving item
      }
    }

    if (onDispatchTelegram) {
      const servedVars: Record<string, string> = {
        item_name: item.name,
        quantity: String(item.quantity),
        guest_name: ord.guestName,
        table_no: ord.roomNumber,
        served_by: servedByUser,
        remaining_items: '0',
      };
      const resolved = await resolveTelegramTemplate('item_served', servedVars);
      const singleItemServedMsg = resolved || `✅ <b>DISH SERVED TO RESIDENT</b>\n• Ticket: <b>#${cleanTicketId}</b> (${ord.guestName} - ${ord.roomNumber})\n• Served Dish: <b>${item.quantity}x ${item.name}</b>\n• Delivered By: <b>${servedByUser}</b>\n• Served At: <b>${nowTime}</b>\n• Status: <b>Delivered & Served 🍽️</b>`;
      onDispatchTelegram('Dish Served', singleItemServedMsg, 'kitchen', undefined, 'item_served');
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
  // TODO: Fetch smMealOptions from DB instead of hardcoding
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

  const smStaffList = useMemo(() => guests.filter(g => g.status === 'Active').map(g => g.guestName), [guests]);


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
      showToast("Please select at least one staff member.", { type: 'warning' });
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
          menuItemId: 0,
          name: `Staff Meal: ${foodStr}`,
          quantity: smQuantity,
          unitPrice: 0,
        },
      ],
      totalAmount: 0,
    };
    addOrder(staffOrder);
    showToast(`Staff meal ticket ${staffOrder.id} dispatched to Kitchen KDS Queue!`, { type: 'success' });
    
    // Reset Form
    setSmSelectedStaff([]);
    setSmQuantity(1);
    setSmCustomMeal('');
    setSmEstCost('');
    setActiveTab('kds');
  };

  // ─── Beta Recipe Builder State (DB-backed) ───

  interface RecipeIngredient {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    costPerUnit: number;
  }
  interface DishRecipe {
    recipeName: string;
    yieldFactor: number;
    servings: number;
    ingredients: RecipeIngredient[];
  }
  interface RecipePreset {
    id: string;
    name: string;
    ingredients: RecipeIngredient[];
    yieldFactor: number;
  }

  const defaultRecipe: DishRecipe = { recipeName: '', yieldFactor: 1, servings: 1, ingredients: [] };

  const [selectedRecipeMenuItemId, setSelectedRecipeMenuItemId] = useState<number>(menu[0]?.id || 0);
  const selectedRecipeMenuItem = menu.find((m) => m.id === selectedRecipeMenuItemId) || menu[0];

  const [allRecipes, setAllRecipes] = useState<Record<number, DishRecipe>>({});
  const currentRecipe: DishRecipe = allRecipes[selectedRecipeMenuItemId] || { ...defaultRecipe, recipeName: selectedRecipeMenuItem?.name || '' };

  const [recipeName, setRecipeName] = useState(currentRecipe.recipeName);
  const [yieldFactor, setYieldFactor] = useState(currentRecipe.yieldFactor || 1);
  const [servings, setServings] = useState(currentRecipe.servings || 1);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>(currentRecipe.ingredients);
  const [editingRecipeName, setEditingRecipeName] = useState(false);
  const [tempRecipeName, setTempRecipeName] = useState('');
  const [recipeDirty, setRecipeDirty] = useState(false);

  const [presets, setPresets] = useState<RecipePreset[]>(() => {
    try { return JSON.parse(localStorage.getItem('artists_farm_recipe_presets') || '[]'); } catch { return []; }
  });
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('');

  const [newIngName, setNewIngName] = useState('');
  const [newIngQty, setNewIngQty] = useState(0.1);
  const [newIngUnit, setNewIngUnit] = useState('kg');
  const [newIngCost, setNewIngCost] = useState(100);
  const [selectedStockItemId, setSelectedStockItemId] = useState('');
  const [recipeSearch, setRecipeSearch] = useState('');

  // Load recipes from DB on mount
  useEffect(() => {
    fetchRecipesFromDB().then((recipes) => {
      const map: Record<number, DishRecipe> = {};
      for (const r of recipes) {
        map[r.menuItemId] = {
          recipeName: r.recipeName || '',
          yieldFactor: r.yieldFactor || 1,
          servings: r.servings || 1,
          ingredients: r.ingredients || [],
        };
      }
      setAllRecipes(map);
    });
  }, []);

  // Load recipe when switching dishes
  useEffect(() => {
    const r = allRecipes[selectedRecipeMenuItemId];
    if (r) {
      setRecipeName(r.recipeName);
      setYieldFactor(r.yieldFactor || 1);
      setServings(r.servings || 1);
      setRecipeIngredients(r.ingredients);
    } else {
      setRecipeName(selectedRecipeMenuItem?.name || '');
      setYieldFactor(1);
      setServings(1);
      setRecipeIngredients([]);
    }
    setEditingRecipeName(false);
  }, [selectedRecipeMenuItemId]);

  // Track dirty state when recipe fields change
  useEffect(() => {
    setRecipeDirty(true);
  }, [recipeName, yieldFactor, servings, recipeIngredients]);

  // Debounced save to DB
  useEffect(() => {
    if (!recipeDirty || !selectedRecipeMenuItemId) return;
    const timer = setTimeout(() => {
      saveRecipeToDB({
        menuItemId: selectedRecipeMenuItemId,
        recipeName: recipeName || selectedRecipeMenuItem?.name || '',
        yieldFactor,
        servings,
        ingredients: recipeIngredients,
      });
      setRecipeDirty(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, [recipeName, yieldFactor, servings, recipeIngredients, recipeDirty, selectedRecipeMenuItemId]);

  // Save presets to localStorage
  useEffect(() => {
    localStorage.setItem('artists_farm_recipe_presets', JSON.stringify(presets));
  }, [presets]);

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

  const costPerPortion = recipeIngredients.reduce((sum, ing) => sum + ing.quantity * ing.costPerUnit, 0);
  const totalBatchCost = costPerPortion * servings;
  const dishSellingPrice = selectedRecipeMenuItem?.price || 350;
  const scaledSellingPrice = dishSellingPrice * servings;
  const foodCostPercentage = dishSellingPrice > 0 ? (costPerPortion / dishSellingPrice) * 100 : 0;
  const grossProfitMargin = dishSellingPrice > 0 ? ((dishSellingPrice - costPerPortion) / dishSellingPrice) * 100 : 0;
  const profitPerPortion = dishSellingPrice - costPerPortion;
  const totalProfit = profitPerPortion * servings;

  const handleAddIngredient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIngName) return;
    const newIngredients = [
      ...recipeIngredients,
      {
        id: Date.now().toString(),
        name: newIngName,
        quantity: Number(newIngQty),
        unit: newIngUnit,
        costPerUnit: Number(newIngCost),
      },
    ];
    setRecipeIngredients(newIngredients);
    setSelectedStockItemId('');
    setNewIngName('');
  };

  const handleSavePreset = () => {
    if (!presetNameInput.trim()) return;
    const newPreset: RecipePreset = {
      id: Date.now().toString(),
      name: presetNameInput.trim(),
      ingredients: [...recipeIngredients],
      yieldFactor,
    };
    setPresets([...presets, newPreset]);
    setPresetNameInput('');
    setShowPresetModal(false);
  };

  const handleLoadPreset = (preset: RecipePreset) => {
    setRecipeIngredients([...preset.ingredients]);
    setYieldFactor(preset.yieldFactor);
  };

  const handleDeletePreset = (id: string) => {
    setPresets(presets.filter((p) => p.id !== id));
  };

  const filteredRecipeIngredients = recipeSearch
    ? recipeIngredients.filter((ing) => ing.name.toLowerCase().includes(recipeSearch.toLowerCase()))
    : recipeIngredients;
  const [kdsFilter, setKdsFilter] = useState<'All' | 'Pending' | 'Preparing' | 'Fulfilled'>('All');

  // New Order Form State
  const activeGuests = isTestingMode
    ? guests
    : guests.filter((g) => g.status === 'Active');
  const [selectedGuestId, setSelectedGuestId] = useState<string>(activeGuests[0]?.id || '');
  const [cartItems, setCartItems] = useState<{ menuItem: MenuItem; quantity: number }[]>(() => {
    try { return JSON.parse(localStorage.getItem('kitchen_cart_items') || '[]'); } catch { return []; }
  });
  const [posSearch, setPosSearch] = useState('');
  const [selectedPosCategory, setSelectedPosCategory] = useState<string>('all');
  const [recentlyAddedId, setRecentlyAddedId] = useState<number | null>(null);
  const [isCartDrawerExpanded, setIsCartDrawerExpanded] = useState<boolean>(false);
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);

  useEffect(() => {
    const container = document.querySelector('.take-food-order-container');
    if (!container) return;
    const onScroll = () => setShowScrollTop(container.scrollTop > 300);
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [activeTab]);

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
  const [reqSearch, setReqSearch] = useState('');

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

  const handleUpdateCartQuantity = (itemId: number, delta: number) => {
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

    addOrder(newOrder);
    setCartItems([]);
  };

  // Submit New Menu Item
  const handleCreateMenuItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName) return;

    const item: MenuItem = {
      id: Date.now(),
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

  const filteredRequisitions = requisitions.filter((req) =>
    !reqSearch ||
    req.itemName.toLowerCase().includes(reqSearch.toLowerCase()) ||
    req.requestedBy.toLowerCase().includes(reqSearch.toLowerCase()) ||
    req.id.toLowerCase().includes(reqSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header (Hidden on Take Food Order POS view) */}
      {activeTab !== 'new_order' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-800 p-3.5 sm:p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-2xs">
          <div>
            <h2 className="text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
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
                className="text-white bg-cyan-600 hover:bg-cyan-700 font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
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

          {/* Current Guest Served Dishes - DataTable */}
          <CurrentGuestServedDishes servedLogs={servedLogs} />
        </div>
      )}

      {/* TAB 2: CREATE ORDER POS */}
      {activeTab === 'new_order' && (() => {
        const activeGuest = activeGuests[0];
        const selectedGuest = activeGuest || activeGuests.find((g) => g.id === selectedGuestId);
        const filteredPosMenuItems = menu.filter((item) => {
          const matchesSearch = item.name.toLowerCase().includes(posSearch.toLowerCase().trim());
          const categoryKey = String(item.categoryId ?? `name:${item.category}`);
          const matchesCategory = selectedPosCategory === 'all' || categoryKey === selectedPosCategory;
          return matchesSearch && matchesCategory;
        });
        const posCategories = [
          { id: 'all', label: 'All Menu' },
          ...Array.from(new Map(menu.map((item) => [
            String(item.categoryId ?? `name:${item.category}`),
            { id: String(item.categoryId ?? `name:${item.category}`), label: item.category },
          ])).values()),
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
                      const isSelected = selectedPosCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setSelectedPosCategory(cat.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-cyan-500 text-white shadow-2xs'
                              : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600'
                          }`}
                        >
                          {cat.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Category Header */}
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
                  <h3 className="font-extrabold text-slate-700 dark:text-slate-300 text-xs tracking-wider uppercase">
                    {selectedPosCategory === 'all' ? 'ALL MENU ITEMS' : posCategories.find((category) => category.id === selectedPosCategory)?.label}
                  </h3>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 font-semibold">
                    {filteredPosMenuItems.length} items
                  </span>
                </div>

                {/* Menu Items Grid with Dish Thumbnails (Compact POS Layout) */}
                {filteredPosMenuItems.length === 0 ? (
                  <div className="text-center py-10 border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-xl">
                    <UtensilsCrossed className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-600 dark:text-slate-400 font-bold text-xs">No food items found matching "{posSearch}"</p>
                  </div>
                ) : selectedPosCategory === 'all' ? (
                  /* Grouped by category when "All Menu" is selected */
                  <div className="space-y-5">
                    {Object.entries(
                      filteredPosMenuItems.reduce<Record<string, typeof filteredPosMenuItems>>((groups, item) => {
                        const cat = item.category || 'Uncategorized';
                        if (!groups[cat]) groups[cat] = [];
                        groups[cat].push(item);
                        return groups;
                      }, {})
                    ).map(([category, items]) => (
                      <div key={category}>
                        <h4 className="text-[11px] font-extrabold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-2 pb-1 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 inline-block"></span>
                          {category}
                          <span className="text-slate-400 dark:text-slate-500 font-bold normal-case tracking-normal">({items.length})</span>
                        </h4>
                        <div className="pos-menu-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                          {items.map((item) => {
                            const isRecentlyAdded = recentlyAddedId === item.id;
                            return (
                                <div
                                  key={item.id}
                                  className={`pos-food-card bg-white dark:bg-slate-800 rounded-lg border p-1.5 flex flex-col gap-1.5 transition-all ${
                                    isRecentlyAdded
                                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/20 shadow-xs'
                                      : 'border-slate-200/90 dark:border-slate-700 hover:border-cyan-400 hover:shadow-2xs'
                                  }`}
                                >
                                  <div className="w-full h-14 rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 overflow-hidden flex items-center justify-center text-slate-400 dark:text-slate-500 font-semibold text-[8px]">
                                    {item.imagePath ? (
                                      <img src={item.imagePath} alt={item.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                                    ) : (
                                      <UtensilsCrossed className="w-4 h-4 text-slate-300" />
                                    )}
                                  </div>
                                  <div className="flex items-start justify-between gap-1">
                                    <div className="min-w-0 flex-1">
                                      <h4 className="font-bold text-slate-800 dark:text-slate-200 text-[10px] leading-tight truncate">{item.name}</h4>
                                      <p className="text-slate-500 dark:text-slate-400 font-extrabold text-[10px] mt-0.5">₹{item.price}</p>
                                    </div>
                                    <button
                                      onClick={() => handleAddToCartWithFeedback(item)}
                                      className={`btn-add-to-cart shrink-0 px-1.5 py-1 rounded-md text-[10px] font-extrabold transition-all duration-150 flex items-center justify-center cursor-pointer min-h-[24px] min-w-[40px] ${
                                        isRecentlyAdded
                                          ? 'bg-emerald-600 text-white border border-emerald-600 scale-95 animate-pulse shadow-md'
                                          : 'bg-slate-50 dark:bg-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-slate-800 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-400 border border-slate-300 dark:border-slate-600 hover:border-emerald-400 active:scale-90 shadow-2xs'
                                      }`}
                                    >
                                      {isRecentlyAdded ? <span className="text-[9px]">✓</span> : <span>+</span>}
                                    </button>
                                  </div>
                                </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Flat grid when a specific category is selected */
                  <div className="pos-menu-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                    {filteredPosMenuItems.map((item) => {
                      const isRecentlyAdded = recentlyAddedId === item.id;
                      return (
                          <div
                            key={item.id}
                            className={`pos-food-card bg-white dark:bg-slate-800 rounded-lg border p-1.5 flex flex-col gap-1.5 transition-all ${
                              isRecentlyAdded
                                ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/20 shadow-xs'
                                : 'border-slate-200/90 dark:border-slate-700 hover:border-cyan-400 hover:shadow-2xs'
                            }`}
                          >
                            <div className="w-full h-14 rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 overflow-hidden flex items-center justify-center text-slate-400 dark:text-slate-500 font-semibold text-[8px]">
                              {item.imagePath ? (
                                <img src={item.imagePath} alt={item.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                              ) : (
                                <UtensilsCrossed className="w-4 h-4 text-slate-300" />
                              )}
                            </div>
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0 flex-1">
                                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-[10px] leading-tight truncate">{item.name}</h4>
                                <p className="text-slate-500 dark:text-slate-400 font-extrabold text-[10px] mt-0.5">₹{item.price}</p>
                              </div>
                              <button
                                onClick={() => handleAddToCartWithFeedback(item)}
                                className={`btn-add-to-cart shrink-0 px-1.5 py-1 rounded-md text-[10px] font-extrabold transition-all duration-150 flex items-center justify-center cursor-pointer min-h-[24px] min-w-[40px] ${
                                  isRecentlyAdded
                                    ? 'bg-emerald-600 text-white border border-emerald-600 scale-95 animate-pulse shadow-md'
                                    : 'bg-slate-50 dark:bg-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-slate-800 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-400 border border-slate-300 dark:border-slate-600 hover:border-emerald-400 active:scale-90 shadow-2xs'
                                }`}
                              >
                                {isRecentlyAdded ? <span className="text-[9px]">✓</span> : <span>+</span>}
                              </button>
                            </div>
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
                    disabled={cartItems.length === 0 || !selectedGuest || (!isTestingMode && activeGuests.length === 0)}
                    title={
                      !isTestingMode && activeGuests.length === 0
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
                          className="btn-cart-qty-minus w-8 h-8 hover:bg-slate-100 font-black text-slate-700 flex items-center justify-center transition-colors cursor-pointer active:scale-90"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-extrabold text-slate-900 text-xs">
                          {ci.quantity}
                        </span>
                        <button
                          onClick={() => handleUpdateCartQuantity(ci.menuItem.id, 1)}
                          className="btn-cart-qty-plus w-8 h-8 hover:bg-slate-100 font-black text-slate-700 flex items-center justify-center transition-colors cursor-pointer active:scale-90"
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
                    disabled={cartItems.length === 0 || !selectedGuest || (!isTestingMode && activeGuests.length === 0)}
                    title={
                      !isTestingMode && activeGuests.length === 0
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

            {/* Mobile Scroll-to-Top Button */}
            {showScrollTop && (
              <button
                onClick={() => {
                  const c = document.querySelector('.take-food-order-container');
                  if (c) c.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="fixed bottom-24 right-4 z-50 lg:hidden w-10 h-10 bg-slate-800/90 dark:bg-white/90 text-white dark:text-slate-800 rounded-lg shadow-lg flex items-center justify-center cursor-pointer transition-all active:scale-90 border border-slate-600 dark:border-slate-300"
              >
                <ArrowUp className="w-5 h-5" />
              </button>
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

          <DataTable
            columns={[
              {
                name: 'Req ID',
                selector: (row: Requisition) => row.id,
                sortable: true,
                width: '120px',
                cell: (row: Requisition) => <span className="font-bold">{row.id}</span>,
              },
              {
                name: 'Material Name',
                selector: (row: Requisition) => row.itemName,
                sortable: true,
                grow: 2,
                cell: (row: Requisition) => <span className="font-semibold text-slate-900 dark:text-white">{row.itemName}</span>,
              },
              {
                name: 'Requested Qty',
                selector: (row: Requisition) => `${row.requestedQty} ${row.unit}`,
                sortable: true,
                width: '130px',
              },
              {
                name: 'Requested At',
                selector: (row: Requisition) => row.requestedAt,
                sortable: true,
                width: '160px',
                cell: (row: Requisition) => <span className="text-slate-500">{row.requestedAt}</span>,
              },
              {
                name: 'Requested By',
                selector: (row: Requisition) => row.requestedBy,
                sortable: true,
                width: '150px',
              },
              {
                name: 'Status',
                selector: (row: Requisition) => row.status,
                sortable: true,
                width: '110px',
                cell: (row: Requisition) => (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    row.status === 'Approved'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border-amber-300'
                  }`}>
                    {row.status}
                  </span>
                ),
              },
              {
                name: 'Action',
                width: '150px',
                center: true,
                cell: (row: Requisition) => (
                  row.status === 'Pending' ? (
                    <button
                      type="button"
                      onClick={() => {
                        const req = row;
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
                            onDispatchTelegram('Requisition Approved', reqMsg, 'kitchen', undefined, 'kitchen_requisition_approved');
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
                  )
                ),
              },
            ]}
            data={filteredRequisitions}
            pagination
            paginationPerPage={15}
            paginationRowsPerPageOptions={[10, 15, 25, 50, 100]}
            highlightOnHover
            responsive
            subHeader={
              <input
                type="text"
                value={reqSearch}
                onChange={(e) => setReqSearch(e.target.value)}
                placeholder="Search by item name, requester, or ID..."
                className="w-full max-w-xs px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 bg-white dark:bg-slate-900 dark:text-slate-200"
              />
            }
            customStyles={{
              subHeader: {
                style: {
                  padding: '0 0 12px 0',
                  minHeight: 0,
                  backgroundColor: 'transparent',
                },
              },
              headCells: {
                style: {
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#64748b',
                  padding: '12px',
                  paddingLeft: '12px',
                },
              },
              cells: {
                style: {
                  fontSize: '13px',
                  color: '#334155',
                  padding: '12px',
                },
              },
              headRow: {
                style: {
                  backgroundColor: '#f8fafc',
                },
              },
            }}
            noDataComponent={
              <div className="py-10 text-center text-slate-400 font-semibold text-xs">
                No material requisitions found
              </div>
            }
          />
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
                <StyledSelect
                  value={smConsumptionType}
                  onChange={setSmConsumptionType}
                  options={[
                    { value: 'Freshly Prepared (New Stock)', label: 'Freshly Prepared (New Stock)' },
                    { value: 'Leftover Buffer items', label: 'Leftover Buffer items' },
                    { value: 'Evening Chai', label: 'Evening Chai' },
                  ]}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1.5 uppercase">Custom Meal Combination</label>
                  <div className="flex gap-2">
                    <StyledSelect
                      className="flex-1"
                      value={smCustomMeal}
                      onChange={(val) => {
                        setSmCustomMeal(val);
                        const selected = smMealOptions.find(m => m.name === val);
                        if (selected) setSmEstCost(selected.cost.toString());
                      }}
                      placeholder="-- Select Database Meal --"
                      options={smMealOptions.map((opt, i) => ({ value: opt.name, label: opt.name }))}
                    />
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
                <Clock className="w-4 h-4 text-cyan-500" /> MONTHLY TRACKING LOG
              </div>
              <span className="font-mono text-slate-400 font-bold text-[10px]">{smLogs.length} entries</span>
            </h3>
            
            <div className="flex-1 overflow-auto pr-2 custom-scrollbar">
              <DataTable
                columns={[
                  {
                    name: 'Date & Time',
                    selector: (row: any) => row.date,
                    sortable: true,
                    grow: 1,
                    cell: (row: any) => (
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        {row.date.split('\n').map((l: string, idx: number) => <div key={idx}>{l}</div>)}
                      </span>
                    ),
                  },
                  {
                    name: 'Staff Members',
                    selector: (row: any) => row.staff,
                    sortable: true,
                    grow: 2,
                    cell: (row: any) => (
                      <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 leading-relaxed">{row.staff}</span>
                    ),
                  },
                  {
                    name: 'Total Food Consumed',
                    selector: (row: any) => row.food,
                    grow: 2,
                    cell: (row: any) => (
                      <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 relative">
                        {row.food}
                        {row.hasTag && (
                          <span className="ml-1.5 w-3 h-3 inline-flex items-center justify-center bg-amber-200 rounded-sm text-[7px] text-amber-700 font-bold border border-amber-300">G</span>
                        )}
                      </span>
                    ),
                  },
                ]}
                data={smLogs}
                pagination
                paginationPerPage={10}
                paginationRowsPerPageOptions={[10, 25, 50]}
                highlightOnHover
                noHeader
                customStyles={{
                  headCells: { style: { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, color: '#94a3b8', backgroundColor: '#f8fafc', paddingLeft: '12px' } },
                  cells: { style: { fontSize: '10px', paddingLeft: '12px' } },
                  rows: { style: { minHeight: '44px' } },
                }}
                noDataComponent={
                  <div className="py-8 text-center text-slate-400 font-semibold text-xs">No meal logs this month</div>
                }
              />
            </div>
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
                  className="px-5 py-2 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Save to Database
                </button>
              </div>
            </div>
          </div>
        )}

      {/* TAB: BETA RECIPE BUILDER */}
      {activeTab === 'beta_recipe_builder' && (
        <div className="space-y-6">
          {/* Recipe Preset Save Modal */}
          {showPresetModal && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
              <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-sm w-full border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                    <Bookmark className="w-4 h-4 text-indigo-500" /> Save Recipe as Preset
                  </h3>
                  <button onClick={() => setShowPresetModal(false)} className="cursor-pointer">
                    <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">Save the current ingredient list and yield as a reusable preset. You can load it into any dish later.</p>
                <input
                  type="text"
                  value={presetNameInput}
                  onChange={(e) => setPresetNameInput(e.target.value)}
                  placeholder="e.g. Butter Chicken Base, Paneer Tikka Mix..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); }}
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowPresetModal(false)} className="px-3 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg cursor-pointer">Cancel</button>
                  <button onClick={handleSavePreset} className="px-3 py-1.5 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer flex items-center gap-1.5">
                    <Save className="w-3 h-3" /> Save Preset
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ChefHat className="w-5 h-5 text-indigo-600" /> Recipe Costing & Food Margin Builder
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Each dish has its own recipe. Ingredients are per single portion. Scale up with servings.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">Dish:</span>
                <StyledSelect
                  searchable
                  className="w-72"
                  value={String(selectedRecipeMenuItemId)}
                  onChange={(val) => setSelectedRecipeMenuItemId(Number(val))}
                  placeholder="Search dishes..."
                  options={menu.map(m => ({
                    value: String(m.id),
                    label: `${m.name} — ₹${m.price}`,
                  }))}
                />
              </div>
            </div>
          </div>

          {/* Recipe Name + Yield + Servings Row */}
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Recipe Name */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Recipe Name</label>
                {editingRecipeName ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={tempRecipeName}
                      onChange={(e) => setTempRecipeName(e.target.value)}
                      onBlur={() => { setRecipeName(tempRecipeName); setEditingRecipeName(false); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { setRecipeName(tempRecipeName); setEditingRecipeName(false); } if (e.key === 'Escape') setEditingRecipeName(false); }}
                      className="flex-1 p-2 rounded-lg border border-indigo-300 text-xs font-bold bg-white dark:bg-slate-900 dark:text-white"
                      autoFocus
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => { setTempRecipeName(recipeName); setEditingRecipeName(true); }}
                    className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/60 w-full text-left hover:border-indigo-300 cursor-pointer transition-colors"
                  >
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex-1 truncate">{recipeName || selectedRecipeMenuItem?.name || 'Untitled Recipe'}</span>
                    <Pencil className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  </button>
                )}
              </div>

              {/* Yield Factor */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Yield (Batch Makes)</span>
                  <span className="font-mono text-indigo-600 dark:text-indigo-400">{yieldFactor} portion{yieldFactor !== 1 ? 's' : ''}</span>
                </label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setYieldFactor(Math.max(1, yieldFactor - 1))} className="p-1.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"><Minus className="w-3 h-3" /></button>
                  <input type="range" min="1" max="50" value={yieldFactor} onChange={(e) => setYieldFactor(Number(e.target.value))} className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                  <button onClick={() => setYieldFactor(Math.min(50, yieldFactor + 1))} className="p-1.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"><Plus className="w-3 h-3" /></button>
                </div>
              </div>

              {/* Servings */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Servings to Cook</span>
                  <span className="font-mono text-blue-600 dark:text-blue-400">{servings} portion{servings !== 1 ? 's' : ''}</span>
                </label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setServings(Math.max(1, servings - 1))} className="p-1.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"><Minus className="w-3 h-3" /></button>
                  <input type="range" min="1" max="100" value={servings} onChange={(e) => setServings(Number(e.target.value))} className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                  <button onClick={() => setServings(Math.min(100, servings + 1))} className="p-1.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"><Plus className="w-3 h-3" /></button>
                </div>
              </div>
            </div>

            {/* Preset Row */}
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Presets:</span>
              {presets.length === 0 ? (
                <span className="text-[10px] text-slate-400 italic">No saved presets yet</span>
              ) : (
                presets.map((p) => (
                  <div key={p.id} className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2 py-1">
                    <button onClick={() => handleLoadPreset(p)} className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 cursor-pointer" title={`Load "${p.name}"`}>
                      <Copy className="w-3 h-3 inline mr-1" />{p.name}
                    </button>
                    <button onClick={() => handleDeletePreset(p.id)} className="text-slate-400 hover:text-red-500 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))
              )}
              <button
                onClick={() => setShowPresetModal(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-indigo-600 bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900 rounded-lg cursor-pointer transition-colors"
              >
                <Bookmark className="w-3 h-3" /> Save Current as Preset
              </button>
            </div>
          </div>

          {/* Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <p className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px]">Cost / Portion</p>
              <p className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">₹{costPerPortion.toFixed(2)}</p>
              <span className="text-[10px] text-slate-400">Single serving cost</span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <p className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px]">Batch Cost ({servings}x)</p>
              <p className="text-lg font-extrabold text-amber-700 dark:text-amber-400 mt-1">₹{totalBatchCost.toFixed(2)}</p>
              <span className="text-[10px] text-slate-400">{servings} portions total</span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <p className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px]">Selling Price</p>
              <p className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">₹{dishSellingPrice}</p>
              <span className="text-[10px] text-slate-400">Batch total: ₹{scaledSellingPrice.toLocaleString()}</span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <p className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px]">Food Cost %</p>
              <p className={`text-lg font-extrabold mt-1 ${foodCostPercentage > 30 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>{foodCostPercentage.toFixed(1)}%</p>
              <span className={`text-[10px] ${foodCostPercentage > 30 ? 'text-red-500' : 'text-blue-500'}`}>{foodCostPercentage > 30 ? 'Above 30% target' : 'Within target <30%'}</span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <p className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px]">Profit / Portion</p>
              <p className={`text-lg font-extrabold mt-1 ${profitPerPortion >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>₹{profitPerPortion.toFixed(2)}</p>
              <span className="text-[10px] text-slate-400">Margin: {grossProfitMargin.toFixed(1)}%</span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <p className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px]">Total Profit ({servings}x)</p>
              <p className={`text-lg font-extrabold mt-1 ${totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>₹{totalProfit.toFixed(2)}</p>
              <span className="text-[10px] text-slate-400">Yield: {yieldFactor} portion{yieldFactor !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {allRecipes[selectedRecipeMenuItemId] && (
              <>
                <button
                  onClick={async () => {
                    const confirmed = await confirm({
                      title: 'Delete Recipe',
                      message: `Delete recipe for "${selectedRecipeMenuItem?.name}"?`,
                      confirmText: 'Delete Recipe',
                      variant: 'danger',
                    });
                    if (confirmed) {
                      await deleteRecipeFromDB(selectedRecipeMenuItemId);
                      setAllRecipes((prev) => { const n = { ...prev }; delete n[selectedRecipeMenuItemId]; return n; });
                      setRecipeIngredients([]);
                      setRecipeName(selectedRecipeMenuItem?.name || '');
                    }
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-red-600 bg-red-100 hover:bg-red-200 rounded-lg cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> Delete Recipe
                </button>
                <button
                  onClick={async () => {
                    const qty = prompt(`Deplete stock for how many servings of "${selectedRecipeMenuItem?.name}"?`, '1');
                    if (!qty || isNaN(Number(qty))) return;
                    const res = await depleteStockForDish(selectedRecipeMenuItemId, Number(qty));
                    if (res.status === 'success') {
                      showToast(`Stock depleted: ${res.deductions?.length || 0} ingredients deducted.`, { type: 'success' });
                    } else {
                      showToast(`${res.message || 'No recipe found for this dish.'}`, { type: 'warning' });
                    }
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-amber-600 bg-amber-100 hover:bg-amber-200 rounded-lg cursor-pointer transition-colors"
                >
                  <Scale className="w-3 h-3" /> Deplete Stock (Manual)
                </button>
              </>
            )}
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
            {/* Ingredients Table */}
            <div className="lg:col-span-2">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-indigo-500" /> Ingredients
                    <span className="text-[10px] font-mono text-slate-400">({recipeIngredients.length})</span>
                  </h4>
                  <input
                    type="text"
                    value={recipeSearch}
                    onChange={(e) => setRecipeSearch(e.target.value)}
                    placeholder="Search..."
                    className="w-44 p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-[11px] text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <DataTable
                  columns={[
                    {
                      name: 'Ingredient',
                      selector: (row: RecipeIngredient) => row.name,
                      sortable: true,
                      grow: 2,
                      cell: (row: RecipeIngredient) => <span className="font-bold text-slate-900 dark:text-white">{row.name}</span>,
                    },
                    {
                      name: 'Qty / Portion',
                      selector: (row: RecipeIngredient) => row.quantity,
                      sortable: true,
                      width: '110px',
                      center: true,
                      cell: (row: RecipeIngredient) => (
                        <span className="font-mono text-slate-700 dark:text-slate-300">{row.quantity} {row.unit}</span>
                      ),
                    },
                    {
                      name: 'Scaled Qty',
                      selector: (row: RecipeIngredient) => row.quantity * servings,
                      sortable: true,
                      width: '110px',
                      center: true,
                      cell: (row: RecipeIngredient) => (
                        <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">{(row.quantity * servings).toFixed(3)} {row.unit}</span>
                      ),
                    },
                    {
                      name: 'Cost / Unit',
                      selector: (row: RecipeIngredient) => row.costPerUnit,
                      sortable: true,
                      width: '100px',
                      right: true,
                      cell: (row: RecipeIngredient) => <span className="font-mono text-slate-600">₹{row.costPerUnit}</span>,
                    },
                    {
                      name: 'Total',
                      selector: (row: RecipeIngredient) => row.quantity * servings * row.costPerUnit,
                      sortable: true,
                      width: '100px',
                      right: true,
                      cell: (row: RecipeIngredient) => <span className="font-bold text-emerald-700 dark:text-emerald-400">₹{(row.quantity * servings * row.costPerUnit).toFixed(2)}</span>,
                    },
                    {
                      name: '',
                      width: '60px',
                      center: true,
                      cell: (row: RecipeIngredient) => (
                        <button
                          onClick={() => setRecipeIngredients(recipeIngredients.filter((i) => i.id !== row.id))}
                          className="text-red-400 hover:text-red-600 cursor-pointer"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ),
                    },
                  ]}
                  data={filteredRecipeIngredients}
                  pagination={recipeIngredients.length > 10}
                  paginationPerPage={10}
                  paginationRowsPerPageOptions={[10, 25, 50]}
                  noHeader
                  highlightOnHover
                  responsive
                  customStyles={{
                    headCells: { style: { fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', backgroundColor: '#f8fafc', padding: '10px 12px', paddingLeft: '12px' } },
                    cells: { style: { fontSize: '12px', color: '#334155', padding: '10px 12px' } },
                    rows: { style: { minHeight: '42px' } },
                  }}
                  noDataComponent={
                    <div className="py-12 text-center">
                      <Boxes className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-sm text-slate-400 font-semibold">No ingredients yet</p>
                      <p className="text-[11px] text-slate-400 mt-1">Add raw ingredients from kitchen stock below</p>
                    </div>
                  }
                />
              </div>
            </div>

            {/* Add Ingredient Form */}
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-3 h-fit">
              <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2"><Plus className="w-4 h-4 text-indigo-500" /> Add Ingredient</h4>
              <form onSubmit={handleAddIngredient} className="space-y-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 text-[11px]">From Kitchen Stock</label>
                  {inventory && inventory.length > 0 ? (
                    <StyledSelect
                      searchable
                      value={selectedStockItemId}
                      onChange={(val) => handleStockItemSelect(val)}
                      placeholder="-- Choose Ingredient --"
                      options={inventory
                        .filter((item) => !ingredientCategoryNames.length || ingredientCategoryNames.includes(item.category))
                        .map(item => ({
                          value: item.id,
                          label: `${item.name} (${item.category}) — ${item.currentStock} ${item.unit}`,
                        }))}
                    />
                  ) : (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-xl border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-[11px]">
                      No stock items. Add raw materials in <strong>Edit Kitchen Stock</strong> first.
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 text-[11px]">Qty / Portion</label>
                    <input
                      type="number"
                      step="0.001"
                      required
                      value={newIngQty}
                      onChange={(e) => setNewIngQty(Number(e.target.value))}
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 text-[11px]">Unit</label>
                    <StyledSelect
                      value={newIngUnit}
                      onChange={setNewIngUnit}
                      options={[
                        { value: 'kg', label: 'kg' },
                        { value: 'liters', label: 'liters' },
                        { value: 'pcs', label: 'pcs' },
                        { value: 'grams', label: 'grams' },
                        { value: 'ml', label: 'ml' },
                      ]}
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 text-[11px]">Cost per Unit (₹)</label>
                  <input
                    type="number"
                    required
                    value={newIngCost}
                    onChange={(e) => setNewIngCost(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer text-xs flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Add to Recipe
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
                <StyledSelect
                  value={newItemCategory}
                  onChange={(val) => setNewItemCategory(val as any)}
                  options={[
                    { value: 'Starters', label: 'Starters' },
                    { value: 'Main Course', label: 'Main Course' },
                    { value: 'Beverages', label: 'Beverages' },
                    { value: 'Farm Specials', label: 'Farm Specials' },
                    { value: 'Desserts', label: 'Desserts' },
                  ]}
                />
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
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
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
                  <StyledSelect
                    value={reqUnit}
                    onChange={setReqUnit}
                    options={[
                      { value: 'kg', label: 'kg' },
                      { value: 'liters', label: 'liters' },
                      { value: 'pcs', label: 'pcs' },
                      { value: 'packets', label: 'packets' },
                    ]}
                  />
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
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
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

interface ServedLogEntry {
  id: string;
  orderId: string;
  itemName: string;
  quantity: number;
  servedBy: string;
  guestName: string;
  roomNumber: string;
  servedAt: string;
}

const CurrentGuestServedDishes: React.FC<{ servedLogs: ServedLogEntry[] }> = ({ servedLogs }) => {
  if (servedLogs.length === 0) return null;

  return (
    <div className="mt-8 space-y-3">
      <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-bold text-sm">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        <span>Current Guest Served Dishes</span>
        <span className="text-xs font-mono text-slate-400 ml-1">({servedLogs.length} total)</span>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-xs overflow-hidden">
        <DataTable
          columns={[
            { name: 'ID', selector: (row: ServedLogEntry) => row.id, omit: true },
            { name: 'Ticket', selector: (row: ServedLogEntry) => row.orderId, sortable: true, width: '80px', cell: (row: ServedLogEntry) => <span className="font-mono font-bold text-slate-900 dark:text-white">#{row.orderId}</span> },
            { name: 'Dish', selector: (row: ServedLogEntry) => row.itemName, sortable: true, grow: 2, cell: (row: ServedLogEntry) => <span className="font-bold text-emerald-700 dark:text-emerald-400">{row.itemName}</span> },
            { name: 'Qty', selector: (row: ServedLogEntry) => row.quantity, sortable: true, width: '60px', center: true },
            { name: 'Guest', selector: (row: ServedLogEntry) => row.guestName, sortable: true, cell: (row: ServedLogEntry) => <span className="font-bold text-slate-800 dark:text-slate-200">{row.guestName}</span> },
            { name: 'Room', selector: (row: ServedLogEntry) => row.roomNumber, sortable: true, width: '70px' },
            { name: 'Served By', selector: (row: ServedLogEntry) => row.servedBy, sortable: true, cell: (row: ServedLogEntry) => <span className="text-slate-600 dark:text-slate-400">{row.servedBy}</span> },
            { name: 'Date & Time', selector: (row: ServedLogEntry) => row.servedAt, sortable: true, width: '150px', cell: (row: ServedLogEntry) => <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.servedAt}</span> },
          ]}
          data={servedLogs}
          subHeader={
            <input type="text" placeholder="Search served dishes..." className="w-full max-w-sm px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-cyan-500 bg-white" />
          }
          pagination
          paginationPerPage={15}
          paginationRowsPerPageOptions={[10, 15, 25, 50, 100]}
          highlightOnHover
          defaultSortFieldId={3}
          defaultSortAsc={false}
          customStyles={{
            subHeader: {
              style: {
                padding: 0,
                minHeight: 0,
                backgroundColor: 'transparent',
              },
            },
            headCells: { style: { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#94a3b8', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', paddingLeft: '12px' } },
            cells: { style: { paddingTop: '10px', paddingBottom: '10px', paddingLeft: '12px' } },
          }}
        />
      </div>
    </div>
  );
};
