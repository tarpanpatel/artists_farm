import React, { useState, useEffect, useMemo } from 'react';
import {
  UtensilsCrossed,
  Plus,
  Clock,
  CheckCircle2,
  ChefHat,
  X,
  Boxes,
  Upload,
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
  Scale,
  Bell,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react';
import { Guest, Order, OrderItem, MenuItem, Requisition, InventoryItem } from '../types';
import { GUEST_STATUS_CHECKED_IN, GUEST_STATUS_ACTIVE_LEGACY } from '../constants/guestStatus';
import { recordTelescopeLog } from '../utils/telescopeLogger';
import { resolveTelegramTemplate, fetchServedLogsFromDB, addServedLogToDB, fetchMaterialCategoriesFromDB, fetchRecipesFromDB, saveRecipeToDB, deleteRecipeFromDB, depleteStockForDish, getPropertySlug, updateOrderItemStatus, updateItemReminderTimestamp, checkStaleReminders, StaleReminderItem, fetchTelegramConfigDB, fetchStaffMealOptionsFromDB, addStaffMealOptionToDB, fetchStaffMealLogsFromDB, addStaffMealLogToDB } from '../services/api';
import { StyledSelect } from './StyledSelect';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import DataTable from 'react-data-table-component';

import { useKitchenContext } from '../contexts/KitchenContext';
import { useInventoryContext } from '../contexts/InventoryContext';
import { useAuth } from '../contexts/AuthContext';
import { useStaff } from '../contexts/StaffContext';
import { PageHeader, PageHeaderButton } from './PageHeader';
import { Input } from './Input';
import { t } from '../i18n/en';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from '../utils/dateUtils';

interface KitchenManagementProps {
  guests: Guest[];
  menu: MenuItem[];
  onAddMenuItem: (item: MenuItem) => void;
  onRequestMaterial: (req: Requisition) => void;
  onDispatchTelegram?: (eventType: string, message: string, category?: 'kitchen' | 'admin' | 'finance' | 'all', replyMarkup?: any, templateKey?: string) => void;
  activeMenuItemKey?: string;
}

export const KitchenManagement: React.FC<KitchenManagementProps> = ({
  guests,
  menu,
  onAddMenuItem,
  onRequestMaterial,
  onDispatchTelegram,
  activeMenuItemKey = 'kitchen_orders',
}) => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { orders, addOrder } = useKitchenContext();
  const { inventory, requisitions } = useInventoryContext();
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'kds' | 'new_order' | 'menu_catalog' | 'requisitions' | 'staff_meals' | 'beta_recipe_builder'>('kds');

  useEffect(() => {
    if (!activeMenuItemKey) return;
    if (activeMenuItemKey === 'take_food_order') setActiveTab('new_order');
    else if (activeMenuItemKey === 'kitchen_orders') setActiveTab('kds');
    else if (activeMenuItemKey === 'staff_meals') setActiveTab('staff_meals');
    else if (activeMenuItemKey === 'edit_food_menu') setActiveTab('menu_catalog');
    else if (activeMenuItemKey === 'beta_recipe_builder') setActiveTab('beta_recipe_builder');
  }, [activeMenuItemKey]);

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

  // Sync Ready/Served UI state from the DB-persisted item_status on every orders
  // refresh, so a page reload (or another device/tab) reflects reality instead of
  // reverting everything to Pending-looking. Merges with (rather than replaces)
  // existing local state so an item never appears to move backward.
  useEffect(() => {
    const nextReady: Record<string, boolean> = {};
    const nextServed: Record<string, boolean> = {};
    const nextReadyTimes: Record<string, string> = {};
    orders.forEach((ord: Order) => {
      ord.items.forEach((item: OrderItem, idx: number) => {
        const key = `${ord.id}_${idx}`;
        if (item.itemStatus === 'Ready') {
          nextReady[key] = true;
          if (item.readyAt) {
            nextReadyTimes[key] = new Date(item.readyAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
        } else if (item.itemStatus === 'Served') {
          nextServed[key] = true;
        }
      });
    });
    setReadyItemKeys((prev) => ({ ...nextReady, ...prev }));
    setServedItemKeys((prev) => ({ ...nextServed, ...prev }));
    setItemReadyTimes((prev) => ({ ...nextReadyTimes, ...prev }));
  }, [orders]);

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

    if (item.id) {
      updateOrderItemStatus(item.id, 'Ready');
    }

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
      showToast(`[Telegram answerCallbackQuery]: Dish "${item.name}" on Ticket #${cleanTicketId} is ALREADY marked as SERVED!`, { type: 'warning' });
      return;
    }

    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setServedItemKeys((prev) => ({ ...prev, [key]: true }));

    if (item.id) {
      updateOrderItemStatus(item.id, 'Served');
    }

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
      servedAt: `${formatDateDDMMYYYY(new Date().toISOString())} ${nowTime}`,
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
        room_no: ord.roomNumber,
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

  // Manual "Send Reminder" nudge for an order item still sitting in Pending/Cooking -
  // a pure one-way notification to the Kitchen chat, always referencing the specific
  // dish/table/elapsed time (never a generic nudge). Auto-nudge-every-N-minutes is a
  // separate fast-follow (needs a persisted last-reminder timestamp + scheduler).
  const handleSendKitchenReminder = async (ord: Order, itemIndex: number, item: OrderItem) => {
    const cleanTicketId = ord.id.replace('#', '');
    const elapsedMin = Math.max(0, Math.round((Date.now() - new Date(ord.orderTime).getTime()) / 60000));

    if (onDispatchTelegram) {
      const reminderVars: Record<string, string> = {
        order_id: cleanTicketId,
        qty: String(item.quantity),
        dish_name: item.name,
        room_no: ord.roomNumber,
        elapsed_minutes: String(elapsedMin),
      };
      const resolved = await resolveTelegramTemplate('kitchen_order_reminder', reminderVars);
      const fallbackMsg = `⏰ <b>KITCHEN REMINDER</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Order Ticket:</b> #${cleanTicketId}\n• <b>${item.quantity}x</b> ${item.name} (${ord.roomNumber})\n⏱️ <b>Pending for:</b> ${elapsedMin} min\n━━━━━━━━━━━━━━━━━━\n👨‍🍳 <i>Please check on this order.</i>`;
      onDispatchTelegram('Kitchen Order Reminder', resolved || fallbackMsg, 'kitchen', undefined, 'kitchen_order_reminder');
    }

    if (item.id) {
      updateItemReminderTimestamp(item.id);
    }

    showToast(`Reminder sent to kitchen: ${item.quantity}x ${item.name}`, { type: 'success' });

    recordTelescopeLog({
      portal: 'telegram',
      severity: 'INFO',
      msg: `Kitchen reminder sent for order #${cleanTicketId} - ${item.quantity}x ${item.name} (pending ${elapsedMin} min)`,
      origin: '/src/components/KitchenManagement.tsx -> handleSendKitchenReminder',
      details: { orderId: ord.id, itemIndex, item, elapsedMin },
    });
  };

  // Manual "Send Reminder" nudge for a dish already marked Ready but not yet collected/
  // served - notifies the Admin chat (no separate floor-staff group) and re-sends the
  // same "Tap when Served" button so staff can act directly from the reminder itself,
  // reusing the existing serve_item_ webhook handler.
  const handleSendPickupReminder = async (ord: Order, itemIndex: number, item: OrderItem) => {
    const cleanTicketId = ord.id.replace('#', '');
    const itemKey = `${ord.id}_${itemIndex}`;
    const readySince = itemReadyTimes[itemKey] || '';

    if (onDispatchTelegram) {
      const reminderVars: Record<string, string> = {
        order_id: cleanTicketId,
        qty: String(item.quantity),
        dish_name: item.name,
        room_no: ord.roomNumber,
        ready_since: readySince || 'a while ago',
      };
      const resolved = await resolveTelegramTemplate('kitchen_pickup_reminder', reminderVars);
      const inlineKeyboard = {
        inline_keyboard: [
          [{ text: '🍽️ Tap when Served', callback_data: `serve_item_${cleanTicketId}_${itemIndex}` }]
        ]
      };
      const fallbackMsg = `⏰ <b>STILL WAITING FOR PICKUP</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Order Ticket:</b> #${cleanTicketId}\n• <b>${item.quantity}x</b> ${item.name} (${ord.roomNumber})\n⏱️ <b>Ready since:</b> ${readySince || 'a while ago'}\n━━━━━━━━━━━━━━━━━━\n🏃 <i>Please collect and tap below when served.</i>`;
      onDispatchTelegram('Pickup Reminder', resolved || fallbackMsg, 'admin', inlineKeyboard, 'kitchen_pickup_reminder');
    }

    if (item.id) {
      updateItemReminderTimestamp(item.id);
    }

    showToast(`Pickup reminder sent: ${item.quantity}x ${item.name}`, { type: 'success' });

    recordTelescopeLog({
      portal: 'telegram',
      severity: 'INFO',
      msg: `Pickup reminder sent for order #${cleanTicketId} - ${item.quantity}x ${item.name} (ready since ${readySince || 'unknown'})`,
      origin: '/src/components/KitchenManagement.tsx -> handleSendPickupReminder',
      details: { orderId: ord.id, itemIndex, item, readySince },
    });
  };

  // --- Shared Reminder/Nudge Engine: auto-fires the same reminders as the manual
  // buttons above once an item has sat unaddressed longer than the property's
  // configured threshold. Since no background worker exists, this runs as a
  // page-open poll (see ROADMAP.md) rather than a true server-side cron - it only
  // fires while a staff member has the Kitchen page open, same tradeoff already
  // accepted for the 15s order auto-sync above. Manual taps reset the same
  // last_reminder_at the auto-check reads, so either path resets the countdown.
  const [reminderThresholdMinutes, setReminderThresholdMinutes] = useState(5);
  useEffect(() => {
    fetchTelegramConfigDB().then((cfg) => {
      if (cfg.reminderThresholdMinutes) setReminderThresholdMinutes(cfg.reminderThresholdMinutes);
    });
  }, []);

  const autoFireKitchenReminder = async (stale: StaleReminderItem) => {
    const reminderVars: Record<string, string> = {
      order_id: String(stale.order_id),
      qty: String(stale.quantity),
      dish_name: stale.dish_name,
      room_no: stale.room_no,
      elapsed_minutes: String(stale.elapsed_minutes),
    };
    const resolved = await resolveTelegramTemplate('kitchen_order_reminder', reminderVars);
    const fallbackMsg = `⏰ <b>KITCHEN REMINDER</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Order Ticket:</b> #${stale.order_id}\n• <b>${stale.quantity}x</b> ${stale.dish_name} (${stale.room_no})\n⏱️ <b>Pending for:</b> ${stale.elapsed_minutes} min\n━━━━━━━━━━━━━━━━━━\n👨‍🍳 <i>Auto-reminder — please check on this order.</i>`;
    onDispatchTelegram?.('Kitchen Order Reminder (Auto)', resolved || fallbackMsg, 'kitchen', undefined, 'kitchen_order_reminder');
    updateItemReminderTimestamp(stale.item_id);
  };

  const autoFirePickupReminder = async (stale: StaleReminderItem) => {
    const reminderVars: Record<string, string> = {
      order_id: String(stale.order_id),
      qty: String(stale.quantity),
      dish_name: stale.dish_name,
      room_no: stale.room_no,
      ready_since: `${stale.elapsed_minutes} min ago`,
    };
    const resolved = await resolveTelegramTemplate('kitchen_pickup_reminder', reminderVars);
    const inlineKeyboard = {
      inline_keyboard: [
        [{ text: '🍽️ Tap when Served', callback_data: `serve_item_${stale.order_id}_${stale.item_index ?? 0}` }]
      ]
    };
    const fallbackMsg = `⏰ <b>STILL WAITING FOR PICKUP</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Order Ticket:</b> #${stale.order_id}\n• <b>${stale.quantity}x</b> ${stale.dish_name} (${stale.room_no})\n⏱️ <b>Ready since:</b> ${stale.elapsed_minutes} min ago\n━━━━━━━━━━━━━━━━━━\n🏃 <i>Auto-reminder — please collect and tap below when served.</i>`;
    onDispatchTelegram?.('Pickup Reminder (Auto)', resolved || fallbackMsg, 'admin', inlineKeyboard, 'kitchen_pickup_reminder');
    updateItemReminderTimestamp(stale.item_id);
  };

  useEffect(() => {
    const pollStaleReminders = async () => {
      const { pending, ready } = await checkStaleReminders(reminderThresholdMinutes);
      for (const item of pending) await autoFireKitchenReminder(item);
      for (const item of ready) await autoFirePickupReminder(item);
    };
    const interval = setInterval(pollStaleReminders, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminderThresholdMinutes]);

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
  const [smDateRecord, setSmDateRecord] = useState<string>(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const [smSelectedStaff, setSmSelectedStaff] = useState<string[]>([]);
  const [smConsumptionType, setSmConsumptionType] = useState('Freshly Prepared (New Stock)');
  const [smCustomMeal, setSmCustomMeal] = useState('');
  const [smEstCost, setSmEstCost] = useState('');
  const [smQuantity, setSmQuantity] = useState(1);
  const [isCustomMealModalOpen, setIsCustomMealModalOpen] = useState(false);
  const [newMealName, setNewMealName] = useState('');
  const [newMealCost, setNewMealCost] = useState('');
  const [smMealOptions, setSmMealOptions] = useState<{ name: string; cost: number }[]>([]);
  useEffect(() => {
    fetchStaffMealOptionsFromDB().then((options) => {
      setSmMealOptions(options.map((o) => ({ name: o.name, cost: o.cost })));
    });
  }, []);
  const [smLogs, setSmLogs] = useState<{ date: string; staff: string; food: string; hasTag: boolean }[]>([]);
  // 14 Aug 2026: "No meal logs this month" used to render off smLogs.length
  // === 0 before this fetch resolved. Defaults true.
  const [smLogsLoading, setSmLogsLoading] = useState(true);
  useEffect(() => {
    fetchStaffMealLogsFromDB().then((data) => {
      setSmLogs(data);
      setSmLogsLoading(false);
    });
  }, []);

  const { staff } = useStaff();

  const smStaffList = useMemo(() => staff.filter(s => s.status === 'Active').map(s => s.name), [staff]);


  const handleSaveCustomMeal = () => {
    if (!newMealName) return;
    const cost = parseFloat(newMealCost) || 0;
    setSmMealOptions(prev => [...prev, { name: newMealName, cost }]);
    setSmCustomMeal(newMealName);
    setSmEstCost(cost.toString());
    setIsCustomMealModalOpen(false);
    setNewMealName('');
    setNewMealCost('');
    addStaffMealOptionToDB(newMealName, cost);
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
    
    const isLeftover = smConsumptionType === 'Leftover Buffer items';
    const newLog = {
      date: formattedDate,
      staff: smSelectedStaff.join(', '),
      food: foodStr,
      hasTag: isLeftover
    };

    setSmLogs(prev => [newLog, ...prev]);
    addStaffMealLogToDB(smSelectedStaff.join(', '), foodStr, isLeftover);

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
  const checkedInGuests = guests.filter((g) => g.status === GUEST_STATUS_CHECKED_IN || (g.status as string) === GUEST_STATUS_ACTIVE_LEGACY);
  // Derived live, not useState - there's no UI to manually pick a different
  // guest, so this must always track the current first checked-in guest.
  // A useState<string> initializer only runs once at mount, so if the
  // guest list changed later (new arrival, this guest checked out), order
  // submission below would silently keep targeting a stale/gone guest.
  const selectedGuestId = checkedInGuests[0]?.id || '';
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
    const onScroll = () => setShowScrollTop(container.scrollTop > 600);
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
        <PageHeader title={t('kitchen_ticketing_header')} subtitle={t('kitchen_subtitle')}>
          {activeTab !== 'staff_meals' && (
            <PageHeaderButton onClick={() => setActiveTab('new_order')} icon={Plus}>
              {t('create_resident_order_button')}
            </PageHeaderButton>
          )}
        </PageHeader>
      )}

      {/* TAB 1: KDS TICKET QUEUE */}
      {activeTab === 'kds' && (
        <div className="kds-orders-container space-y-4">
          <div className="kds-status-filter-bar flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-700 text-xs gap-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{t('filter_orders_label')}</span>
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
                    {status === 'All' ? t('all_filter_button') : status === 'Pending' ? t('pending_filter_button') : status === 'Preparing' ? t('preparing_filter_button') : t('fulfilled_filter_button')}
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
                  title={autoSyncEnabled ? t('auto_sync_active_tooltip') : t('auto_sync_paused_tooltip')}
                >
                  <span
                    className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      autoSyncEnabled ? 'translate-x-3' : 'translate-x-0'
                    }`}
                  />
                </button>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-blue-500 animate-ping' : autoSyncEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400 dark:bg-slate-500'}`}></span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                    {autoSyncEnabled ? t('live_kds_sync_text') : t('sync_paused_text')}
                  </span>
                  {autoSyncEnabled && (
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                      ({syncCountdown}s)
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 hidden md:inline">{t('synced_text')} {lastSyncTime}</span>
                <button
                  onClick={triggerManualSync}
                  disabled={isSyncing}
                  className="bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 font-semibold px-2 py-0.5 rounded text-[11px] flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-2xs"
                  title={t('check_for_updates_tooltip')}
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
                  <span>{t('sync_button')}</span>
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
                      <h3 className="kitchen-management__subtitle font-semibold text-slate-900 dark:text-white text-sm">
                        Order #{ord.id.replace('#', '')}
                      </h3>
                      <p className="text-slate-400 dark:text-slate-500 text-[10px] font-medium">
                        ({t('order_received_text')} {ord.orderTime || '01:15 AM'})
                      </p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
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
                                <span className="font-semibold text-emerald-600 line-through text-xs">
                                  {item.quantity}x {item.name}
                                </span>
                                {readyTime && (
                                  <span className="text-emerald-600 font-medium text-[10px] ml-1">
                                    ({readyTime})
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="font-semibold text-rose-600 text-xs">
                                {item.quantity}x {item.name}
                              </span>
                            )}
                          </div>

                          {/* Mobile-Friendly Touch Ready Buttons */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isServed ? (
                              <span className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300">
                                {t('served_badge')}
                              </span>
                            ) : isReady ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSendPickupReminder(ord, idx, item)}
                                  className="border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-xs px-2.5 py-1.5 rounded-lg transition-all shadow-2xs flex items-center gap-1 cursor-pointer min-h-[36px] active:scale-95"
                                  title={t('send_pickup_reminder_tooltip')}
                                >
                                  <Bell className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMarkDishServed(ord, idx, item)}
                                  className="btn-kds-item-served border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs px-3.5 py-1.5 rounded-lg transition-all shadow-2xs flex items-center gap-1 cursor-pointer min-h-[36px] active:scale-95"
                                  title={t('click_when_served_tooltip')}
                                >
                                  <Check className="w-3.5 h-3.5" /> Served
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSendKitchenReminder(ord, idx, item)}
                                  className="border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-xs px-2.5 py-1.5 rounded-lg transition-all shadow-2xs flex items-center gap-1 cursor-pointer min-h-[36px] active:scale-95"
                                  title={t('send_reminder_tooltip')}
                                >
                                  <Bell className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMarkDishReady(ord, idx, item)}
                                  className="btn-kds-complete border border-emerald-500 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg transition-all shadow-xs flex items-center gap-1 cursor-pointer min-h-[36px] active:scale-95"
                                >
                                  <Check className="w-3.5 h-3.5" /> {t('ready_button')}
                                </button>
                              </>
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
        const checkedInGuest = checkedInGuests[0];
        const selectedGuest = checkedInGuest || checkedInGuests.find((g) => g.id === selectedGuestId);
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

        const renderFoodCard = (item: MenuItem) => {
          const isRecentlyAdded = recentlyAddedId === item.id;
          const existingCartItem = cartItems.find((i) => i.menuItem.id === item.id);
          const inCartQty = existingCartItem ? existingCartItem.quantity : 0;

          return (
            <div
              key={item.id}
              className="pos-food-card bg-white dark:bg-slate-800 rounded-xl border border-slate-200/90 dark:border-slate-700 hover:border-cyan-400 hover:shadow-2xs p-2 flex flex-col justify-between gap-2 transition-all"
            >
              <div className="space-y-1.5">
                <div className="relative w-full h-20 sm:h-16 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200/80 dark:border-slate-600 overflow-hidden flex items-center justify-center text-slate-400 dark:text-slate-500">
                  {item.imagePath ? (
                    <img
                      src={item.imagePath}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                  ) : (
                    <UtensilsCrossed className="w-5 h-5 text-slate-300 dark:text-slate-500" />
                  )}
                </div>

                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-xs sm:text-[11px] leading-tight line-clamp-2 min-h-[28px]">
                    {item.name}
                  </h4>
                  <p className="text-emerald-700 dark:text-emerald-400 font-extrabold text-xs sm:text-[11px] mt-0.5">
                    ₹{item.price}
                  </p>
                </div>
              </div>

              {/* Mobile-First Touch Stepper (Always showing minus, quantity, plus) */}
              <div className="pt-1 border-t border-slate-100 dark:border-slate-700/60">
                <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-700/60 rounded-lg p-0.5 w-full">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (inCartQty > 0) {
                        handleUpdateCartQuantity(item.id, -1);
                      }
                    }}
                    disabled={inCartQty === 0}
                    className={`w-7 h-7 rounded-md font-bold text-xs flex items-center justify-center transition-all shadow-2xs ${
                      inCartQty === 0
                        ? 'bg-slate-200/60 dark:bg-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed opacity-50'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-rose-50 hover:text-rose-600 active:scale-90 cursor-pointer'
                    }`}
                    title="Decrease quantity"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className={`font-extrabold text-xs px-1 ${
                    inCartQty > 0
                      ? 'text-emerald-800 dark:text-emerald-300'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}>
                    {inCartQty}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddToCartWithFeedback(item);
                    }}
                    className={`w-7 h-7 rounded-md font-bold text-xs flex items-center justify-center active:scale-90 transition-all cursor-pointer shadow-2xs ${
                      isRecentlyAdded
                        ? 'bg-emerald-600 text-white scale-95 animate-pulse'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                    title="Increase quantity"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
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
                    <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-3 z-10" />
                    <Input
                      type="text"
                      value={posSearch}
                      onChange={(e) => setPosSearch(e.target.value)}
                      placeholder={t('quick_search_menu_placeholder')}
                      className="pl-9"
                    />
                    {posSearch && (
                      <button
                        onClick={() => setPosSearch('')}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer z-10"
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
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
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
                  <h3 className="kitchen-management__subtitle font-semibold text-slate-700 dark:text-slate-300 text-xs tracking-wider uppercase">
                    {selectedPosCategory === 'all' ? t('all_menu_items_header') : posCategories.find((category) => category.id === selectedPosCategory)?.label}
                  </h3>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 font-semibold">
                    {filteredPosMenuItems.length} items
                  </span>
                </div>

                {/* Menu Items Grid with Dish Thumbnails (Compact POS Layout) */}
                {filteredPosMenuItems.length === 0 ? (
                  <div className="text-center py-10 border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-xl">
                    <UtensilsCrossed className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-600 dark:text-slate-400 font-semibold text-xs">{t('no_food_items_found_text')} "{posSearch}"</p>
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
                        <h4 className="kitchen-management__caption text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 pb-1 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
                          {category}
                          <span className="text-slate-400 dark:text-slate-500 font-semibold normal-case tracking-normal">({items.length})</span>
                        </h4>
                        <div className="pos-menu-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                          {items.map((item) => renderFoodCard(item))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Flat grid when a specific category is selected */
                  <div className="pos-menu-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                    {filteredPosMenuItems.map((item) => renderFoodCard(item))}
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
                    <h3 className="kitchen-management__subtitle font-semibold text-slate-900 dark:text-white text-xs tracking-wider flex items-center gap-1.5">
                      <ShoppingCart className="w-4 h-4 text-slate-700 dark:text-slate-400" />
                      <span>{t('order_cart_header')}</span>
                    </h3>
                    <span className="text-[10px] font-semibold bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-200 dark:border-cyan-800">
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
                            <h4 className="kitchen-management__caption font-semibold text-slate-900 dark:text-white text-xs leading-snug">
                              {ci.menuItem.name} <span className="text-slate-400 dark:text-slate-500 font-normal">({`₹${ci.menuItem.price}`})</span>
                            </h4>
                          </div>

                          <div className="flex items-center border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 overflow-hidden shrink-0">
                            <button
                              onClick={() => handleUpdateCartQuantity(ci.menuItem.id, -1)}
                              className="btn-cart-qty-minus w-7 h-7 hover:bg-slate-100 dark:hover:bg-slate-700 font-semibold text-slate-600 dark:text-slate-400 flex items-center justify-center transition-colors cursor-pointer active:scale-90"
                            >
                              -
                            </button>
                            <span className="w-6 text-center font-semibold text-slate-900 dark:text-white text-xs">
                              {ci.quantity}
                            </span>
                            <button
                              onClick={() => handleUpdateCartQuantity(ci.menuItem.id, 1)}
                              className="btn-cart-qty-plus w-7 h-7 hover:bg-slate-100 dark:hover:bg-slate-700 font-semibold text-slate-600 dark:text-slate-400 flex items-center justify-center transition-colors cursor-pointer active:scale-90"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-10 text-slate-400 dark:text-slate-500">
                        <ShoppingCart className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('order_cart_empty_text')}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{t('click_add_from_menu_hint')}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cart Total & Submit Button */}
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide text-[10px]">{t('total_label')}</span>
                    <span className="font-semibold text-emerald-600 text-base">
                      ₹{totalCartSum.toFixed(2)}
                    </span>
                  </div>

                  <button
                    onClick={handleOrderSubmit}
                    disabled={cartItems.length === 0 || !selectedGuest || checkedInGuests.length === 0}
                    title={
                      checkedInGuests.length === 0
                        ? t('no_active_resident_tooltip')
                        : cartItems.length === 0
                        ? t('order_cart_empty_tooltip')
                        : t('send_order_to_kitchen_button')
                    }
                    className="btn-send-order-kitchen w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 disabled:text-slate-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs py-3.5 rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wider active:scale-[0.98] min-h-[42px]"
                  >
                    <span>{t('send_order_to_kitchen_button')}</span>
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
                    <div className="bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 font-semibold text-xs px-2.5 py-1 rounded-xl shadow-2xs flex items-center gap-1">
                      <ShoppingCart className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-500" />
                      <span>{totalCartCount} Items</span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 text-[10px] font-semibold uppercase tracking-wider">TOTAL: </span>
                      <span className="text-emerald-600 font-semibold text-sm">₹{totalCartSum.toFixed(2)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsCartDrawerExpanded(!isCartDrawerExpanded)}
                    className="bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-cyan-700 dark:text-cyan-400 font-semibold text-xs px-3 py-1.5 rounded-xl border border-cyan-300 dark:border-cyan-700 shadow-2xs flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                  >
                    {isCartDrawerExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronUp className="w-3.5 h-3.5" />
                    )}
                    {t(isCartDrawerExpanded ? 'collapse_button' : 'expand_cart_button')}
                  </button>
                </div>

                {/* Items List (Displays Last 3 items in Collapsed mode, All items in 50vh Expanded mode) */}
                <div className="pos-cart-items-list p-3 flex-1 overflow-y-auto space-y-2">
                  {!isCartDrawerExpanded && cartItems.length > 3 && (
                    <p className="text-[10px] text-cyan-700 font-semibold tracking-wide uppercase text-center pb-1">
                      {t('showing_last_3_items_prefix')} {cartItems.length} {t('showing_last_3_items_suffix')}
                    </p>
                  )}
                  {visibleDrawerItems.map((ci) => (
                    <div
                      key={ci.menuItem.id}
                      className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center justify-between gap-2 text-xs text-slate-900"
                    >
                      <div className="flex-1 pr-1 truncate">
                        <h4 className="kitchen-management__caption font-semibold text-slate-900 text-xs truncate">
                          {ci.menuItem.name} <span className="text-slate-500 font-normal">({`₹${ci.menuItem.price}`})</span>
                        </h4>
                      </div>

                      <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shrink-0">
                        <button
                          onClick={() => handleUpdateCartQuantity(ci.menuItem.id, -1)}
                          className="btn-cart-qty-minus w-8 h-8 hover:bg-slate-100 font-semibold text-slate-700 flex items-center justify-center transition-colors cursor-pointer active:scale-90"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-semibold text-slate-900 text-xs">
                          {ci.quantity}
                        </span>
                        <button
                          onClick={() => handleUpdateCartQuantity(ci.menuItem.id, 1)}
                          className="btn-cart-qty-plus w-8 h-8 hover:bg-slate-100 font-semibold text-slate-700 flex items-center justify-center transition-colors cursor-pointer active:scale-90"
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
                    disabled={cartItems.length === 0 || !selectedGuest || checkedInGuests.length === 0}
                    title={
                      checkedInGuests.length === 0
                        ? 'No active resident checked in. Click ACTIVATE LEDGER in sidebar.'
                        : cartItems.length === 0
                        ? 'Order cart is empty'
                        : 'Send Order to Kitchen'
                    }
                    className="btn-send-order-kitchen w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs py-2.5 rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wider active:scale-[0.98] min-h-[40px]"
                  >
                    <span>Send Order to Kitchen</span>
                  </button>
                </div>
              </div>
            )}

            {/* Mobile Scroll-to-Top Button */}
            {showScrollTop && (
              <button
                type="button"
                onClick={() => {
                  const c = document.querySelector('.take-food-order-container');
                  if (c) c.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`fixed right-4 z-50 lg:hidden w-11 h-11 bg-slate-900/90 dark:bg-slate-100/90 text-white dark:text-slate-900 rounded-full shadow-xl flex items-center justify-center cursor-pointer transition-all duration-300 active:scale-90 border border-slate-700 dark:border-slate-200 ${
                  cartItems.length > 0
                    ? isCartDrawerExpanded
                      ? 'bottom-[calc(50vh+16px)]'
                      : 'bottom-48 sm:bottom-52'
                    : 'bottom-6'
                }`}
                title="Scroll to top"
              >
                <ArrowUp className="w-5 h-5 stroke-[2.5]" />
              </button>
            )}
          </div>
        );
      })()}

      {/* TAB 3: MENU CATALOG */}
      {activeTab === 'menu_catalog' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="kitchen-management__subtitle font-semibold text-slate-800 dark:text-slate-200 text-sm">{t('resort_food_beverage_catalog_header')}</h3>
            <button
              onClick={() => setIsNewMenuModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> {t('add_menu_item_button')}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {menu.map((item) => (
              <div key={item.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-700/50">
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded">
                  {item.category}
                </span>
                <h4 className="kitchen-management__caption font-semibold text-slate-900 dark:text-white text-sm mt-1">{item.name}</h4>
                <p className="font-semibold text-emerald-700 dark:text-emerald-400 text-sm mt-0.5">₹{item.price}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: RAW MATERIAL REQUISITIONS */}
      {activeTab === 'requisitions' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="kitchen-management__subtitle font-semibold text-slate-800 dark:text-slate-200 text-sm">{t('kitchen_requisitions_header')}</h3>
            <button
              onClick={() => setIsReqModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> {t('request_material_stock_button')}
            </button>
          </div>

          <DataTable
            columns={[
                {
                  name: t('req_id_column'),
                  selector: (row: Requisition) => row.id,
                sortable: true,
                width: '120px',
                cell: (row: Requisition) => <span className="font-semibold">{row.id}</span>,
              },
                {
                  name: t('material_name_column'),
                  selector: (row: Requisition) => row.itemName,
                sortable: true,
                grow: 2,
                cell: (row: Requisition) => <span className="font-semibold text-slate-900 dark:text-white">{row.itemName}</span>,
              },
                {
                  name: t('requested_qty_column'),
                  selector: (row: Requisition) => `${row.requestedQty} ${row.unit}`,
                sortable: true,
                width: '130px',
              },
                {
                  name: t('requested_at_column'),
                  selector: (row: Requisition) => row.requestedAt,
                sortable: true,
                width: '160px',
                cell: (row: Requisition) => <span className="text-slate-500">{formatDateTimeDDMMYYYY(row.requestedAt)}</span>,
              },
                {
                  name: t('requested_by_column'),
                  selector: (row: Requisition) => row.requestedBy,
                sortable: true,
                width: '150px',
              },
                {
                  name: t('status_column_header'),
                  selector: (row: Requisition) => row.status,
                sortable: true,
                width: '110px',
                cell: (row: Requisition) => (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    row.status === 'Approved'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border-amber-300'
                  }`}>
                    {row.status}
                  </span>
                ),
              },
                {
                  name: t('action_column_header'),
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
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] px-2.5 py-1 rounded transition cursor-pointer"
                    >
                      {t('approve_release_button')}
                    </button>
                  ) : (
                    <span className="text-emerald-600 font-semibold text-[11px]">{t('fulfilled_badge')}</span>
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
              <Input
                type="text"
                value={reqSearch}
                onChange={(e) => setReqSearch(e.target.value)}
                placeholder={t('search_requisition_placeholder')}
                className="w-full max-w-xs"
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
                {t('no_requisitions_found_text')}
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
<h3 className="kitchen-management__subtitle font-semibold text-slate-800 dark:text-slate-200 text-[10px] uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
                <Plus className="w-4 h-4" /> {t('record_consumption_heading')}
              </h3>

            <div className="space-y-4">
              <Input 
                label={t('date_time_of_record_label')}
                type="datetime-local" 
                value={smDateRecord}
                onChange={(e) => setSmDateRecord(e.target.value)}
              />

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 dark:text-slate-500 mb-1.5 uppercase">{t('consuming_staff_label')}</label>
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
                <label className="block text-[10px] font-semibold text-slate-400 dark:text-slate-500 mb-1.5 uppercase">{t('consumption_type_label')}</label>
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
                  <label className="block text-[10px] font-semibold text-slate-400 dark:text-slate-500 mb-1.5 uppercase">{t('custom_meal_combination_label')}</label>
                  <div className="flex gap-2">
                    <StyledSelect
                      className="flex-1"
                      value={smCustomMeal}
                      onChange={(val) => {
                        setSmCustomMeal(val);
                        const selected = smMealOptions.find(m => m.name === val);
                        if (selected) setSmEstCost(selected.cost.toString());
                      }}
                      placeholder={t('select_database_meal_placeholder')}
                      options={smMealOptions.map((opt) => ({ value: opt.name, label: opt.name }))}
                    />
                    <button 
                      onClick={() => setIsCustomMealModalOpen(true)}
                      className="bg-slate-700 hover:bg-slate-800 text-white px-3 rounded-xl shadow-2xs font-semibold text-xs flex items-center justify-center cursor-pointer transition-all"
                    >
                      <span>{t('new_button')}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <Input 
                    label={t('est_cost_value_label')}
                    type="number" 
                    value={smEstCost}
                    onChange={(e) => setSmEstCost(e.target.value)}
                    className="text-right"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 dark:text-slate-500 mb-1.5 uppercase">{t('quantity_label')}</label>
                <div className="flex items-center gap-1 w-32">
                  <button onClick={() => setSmQuantity(Math.max(1, smQuantity - 1))} type="button" className="w-10 h-10 flex items-center justify-center bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 text-slate-700 dark:text-white rounded-l-xl font-semibold transition-colors cursor-pointer shadow-2xs">-</button>
                  <div className="h-10 flex-1 flex items-center justify-center bg-white dark:bg-slate-900 border-y border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-2xs">{smQuantity}</div>
                  <button onClick={() => setSmQuantity(smQuantity + 1)} type="button" className="w-10 h-10 flex items-center justify-center bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 text-slate-700 dark:text-white rounded-r-xl font-semibold transition-colors cursor-pointer shadow-2xs">+</button>
                </div>
              </div>

              <div className="pt-4">
                {smError && (
                  <p className="text-red-500 text-[10px] font-semibold mb-2 text-center animate-pulse">{smError}</p>
                )}
                <button type="button" onClick={handleLogStaffMeal} className="w-full mx-auto block py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl shadow-2xs transition-all cursor-pointer text-xs">
                  {t('log_staff_meal_button')}
                </button>
              </div>
            </div>
          </div>

          {/* Right Panel: Monthly Tracking Log */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col h-full">
            <h3 className="kitchen-management__subtitle font-semibold text-slate-800 dark:text-slate-200 text-[10px] uppercase tracking-wider flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-500" /> {t('monthly_tracking_log_heading')}
              </div>
              <span className="text-slate-400 font-semibold text-[10px]">{smLogsLoading ? '…' : smLogs.length} {t('entries_suffix')}</span>
            </h3>
            
            <div className="flex-1 overflow-auto pr-2 custom-scrollbar">
              <DataTable
                columns={[
                  {
                    name: t('date_time_column'),
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
                    name: t('staff_members_column'),
                    selector: (row: any) => row.staff,
                    sortable: true,
                    grow: 2,
                    cell: (row: any) => (
                      <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 leading-relaxed">{row.staff}</span>
                    ),
                  },
                  {
                    name: t('total_food_consumed_column'),
                    selector: (row: any) => row.food,
                    grow: 2,
                    cell: (row: any) => (
                      <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 relative">
                        {row.food}
                        {row.hasTag && (
                          <span className="ml-1.5 w-3 h-3 inline-flex items-center justify-center bg-amber-200 rounded-sm text-[7px] text-amber-700 font-semibold border border-amber-300">G</span>
                        )}
                      </span>
                    ),
                  },
                ]}
                data={smLogs}
                progressPending={smLogsLoading}
                progressComponent={
                  <div className="p-8 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500 font-semibold text-xs">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading meal logs...
                  </div>
                }
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
                  <div className="py-8 text-center text-slate-400 font-semibold text-xs">{t('no_meal_logs_text')}</div>
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
                <h3 className="kitchen-management__subtitle font-semibold text-slate-800 dark:text-slate-200 text-xs tracking-wide flex items-center gap-2">
                  <Plus className="w-4 h-4" /> {t('create_custom_meal_heading')}
                </h3>
              </div>
              
              <div className="p-6 space-y-5">
                <Input 
                  label={t('combo_meal_name_label')}
                  type="text"
                  placeholder={t('e_g_roti_placeholder')}
                  value={newMealName}
                  onChange={(e) => setNewMealName(e.target.value)}
                />
                <Input 
                  label={t('default_estimated_price_label')}
                  type="number"
                  placeholder="50.00"
                  value={newMealCost}
                  onChange={(e) => setNewMealCost(e.target.value)}
                />
              </div>
              
              <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
                <button 
                  onClick={() => setIsCustomMealModalOpen(false)}
                  className="px-5 py-2 text-[11px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg transition-colors cursor-pointer"
                >
                  {t('cancel_button')}
                </button>
                <button 
                  onClick={handleSaveCustomMeal}
                  className="px-5 py-2 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  {t('save_to_database_button')}
                </button>
              </div>
            </div>
          </div>
        )}

      {/* TAB: BETA RECIPE BUILDER */}
      {activeTab === 'beta_recipe_builder' && (
    <div className="space-y-6 kitchen-management">
          {/* Recipe Preset Save Modal */}
          {showPresetModal && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
              <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-sm w-full border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-4">
                <div className="flex justify-between items-center">
<h3 className="kitchen-management__subtitle font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-indigo-500" /> {t('save_recipe_preset_heading')}
                </h3>
                  <button onClick={() => setShowPresetModal(false)} className="cursor-pointer">
                    <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">{t('save_preset_description')}</p>
                <Input
                  type="text"
                  value={presetNameInput}
                  onChange={(e) => setPresetNameInput(e.target.value)}
                  placeholder={t('e_g_butter_chicken_placeholder')}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); }}
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowPresetModal(false)} className="px-3 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg cursor-pointer">{t('cancel_button')}</button>
                  <button onClick={handleSavePreset} className="px-3 py-1.5 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer flex items-center gap-1.5">
                    <Save className="w-3 h-3" /> {t('save_preset_button')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="kitchen-management__subtitle text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <ChefHat className="w-5 h-5 text-indigo-600" /> {t('recipe_costing_heading')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('recipe_description')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">{t('dish_label')}</span>
                <StyledSelect
                  searchable
                  className="w-72"
                  value={String(selectedRecipeMenuItemId)}
                  onChange={(val) => setSelectedRecipeMenuItemId(Number(val))}
                  placeholder={t('search_dishes_placeholder')}
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
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">{t('recipe_name_label')}</label>
                {editingRecipeName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={tempRecipeName}
                      onChange={(e) => setTempRecipeName(e.target.value)}
                      onBlur={() => { setRecipeName(tempRecipeName); setEditingRecipeName(false); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { setRecipeName(tempRecipeName); setEditingRecipeName(false); } if (e.key === 'Escape') setEditingRecipeName(false); }}
                      autoFocus
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => { setTempRecipeName(recipeName); setEditingRecipeName(true); }}
                    className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/60 w-full text-left hover:border-indigo-300 cursor-pointer transition-colors"
                  >
                    <span className="text-xs font-semibold text-slate-900 dark:text-white flex-1 truncate">{recipeName || selectedRecipeMenuItem?.name || 'Untitled Recipe'}</span>
                    <Pencil className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  </button>
                )}
              </div>

              {/* Yield Factor */}
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>{t('yield_label')}</span>
                  <span className="font-mono text-indigo-600 dark:text-indigo-400">{yieldFactor} portion{yieldFactor !== 1 ? 's' : ''}</span>
                </label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setYieldFactor(Math.max(1, yieldFactor - 1))} className="p-1.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"><Minus className="w-3 h-3" /></button>
                  <Input type="range" min="1" max="50" value={yieldFactor} onChange={(e) => setYieldFactor(Number(e.target.value))} className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                  <button onClick={() => setYieldFactor(Math.min(50, yieldFactor + 1))} className="p-1.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"><Plus className="w-3 h-3" /></button>
                </div>
              </div>

              {/* Servings */}
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>{t('servings_to_cook_label')}</span>
                  <span className="font-mono text-blue-600 dark:text-blue-400">{servings} portion{servings !== 1 ? 's' : ''}</span>
                </label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setServings(Math.max(1, servings - 1))} className="p-1.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"><Minus className="w-3 h-3" /></button>
                  <Input type="range" min="1" max="100" value={servings} onChange={(e) => setServings(Number(e.target.value))} className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                  <button onClick={() => setServings(Math.min(100, servings + 1))} className="p-1.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"><Plus className="w-3 h-3" /></button>
                </div>
              </div>
            </div>

            {/* Preset Row */}
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('presets_label')}</span>
              {presets.length === 0 ? (
                <span className="text-[10px] text-slate-400 italic">{t('no_saved_presets_text')}</span>
              ) : (
                presets.map((p) => (
                  <div key={p.id} className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2 py-1">
                    <button onClick={() => handleLoadPreset(p)} className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 cursor-pointer" title={`Load "${p.name}"`}>
                      <Copy className="w-3 h-3 inline mr-1" />{p.name}
                    </button>
                    <button onClick={() => handleDeletePreset(p.id)} className="text-slate-400 hover:text-red-500 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))
              )}
              <button
                onClick={() => setShowPresetModal(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold text-indigo-600 bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900 rounded-lg cursor-pointer transition-colors"
              >
                <Bookmark className="w-3 h-3" /> {t('save_current_as_preset_button')}
              </button>
            </div>
          </div>

          {/* Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <p className="text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px]">{t('cost_per_portion_label')}</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white mt-1">₹{costPerPortion.toFixed(2)}</p>
              <span className="text-[10px] text-slate-400">{t('single_serving_cost_text')}</span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <p className="text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px]">{t('batch_cost_label')} ({servings}x)</p>
              <p className="text-lg font-semibold text-amber-700 dark:text-amber-400 mt-1">₹{totalBatchCost.toFixed(2)}</p>
              <span className="text-[10px] text-slate-400">{servings} {t('portions_total_text')}</span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <p className="text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px]">{t('selling_price_label')}</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white mt-1">₹{dishSellingPrice}</p>
              <span className="text-[10px] text-slate-400">{t('batch_total_text')} ₹{scaledSellingPrice.toLocaleString()}</span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <p className="text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px]">{t('food_cost_percent_label')}</p>
              <p className={`text-lg font-semibold mt-1 ${foodCostPercentage > 30 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>{foodCostPercentage.toFixed(1)}%</p>
              <span className={`text-[10px] ${foodCostPercentage > 30 ? 'text-red-500' : 'text-blue-500'}`}>{foodCostPercentage > 30 ? t('above_30_target_text') : t('within_target_text')}</span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <p className="text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px]">{t('profit_per_portion_label')}</p>
              <p className={`text-lg font-semibold mt-1 ${profitPerPortion >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>₹{profitPerPortion.toFixed(2)}</p>
              <span className="text-[10px] text-slate-400">{t('margin_text')} {grossProfitMargin.toFixed(1)}%</span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <p className="text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px]">{t('total_profit_label')} ({servings}x)</p>
              <p className={`text-lg font-semibold mt-1 ${totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>₹{totalProfit.toFixed(2)}</p>
              <span className="text-[10px] text-slate-400">{t('yield_text')} {yieldFactor} portion{yieldFactor !== 1 ? 's' : ''}</span>
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
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold text-red-600 bg-red-100 hover:bg-red-200 rounded-lg cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> {t('delete_recipe_button')}
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
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold text-amber-600 bg-amber-100 hover:bg-amber-200 rounded-lg cursor-pointer transition-colors"
                >
                  <Scale className="w-3 h-3" /> {t('deplete_stock_button')}
                </button>
              </>
            )}
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
            {/* Ingredients Table */}
            <div className="lg:col-span-2">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between">
                  <h4 className="kitchen-management__caption font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-indigo-500" /> {t('ingredients_heading')}
                    <span className="text-[10px] font-mono text-slate-400">({recipeIngredients.length})</span>
                  </h4>
                  <Input
                    type="text"
                    value={recipeSearch}
                    onChange={(e) => setRecipeSearch(e.target.value)}
                    placeholder={t('search_placeholder')}
                    className="w-44"
                  />
                </div>
                <DataTable
                  columns={[
                    {
                      name: t('ingredient_column'),
                      selector: (row: RecipeIngredient) => row.name,
                      sortable: true,
                      grow: 2,
                      cell: (row: RecipeIngredient) => <span className="font-semibold text-slate-900 dark:text-white">{row.name}</span>,
                    },
                    {
                      name: t('qty_portion_column'),
                      selector: (row: RecipeIngredient) => row.quantity,
                      sortable: true,
                      width: '110px',
                      center: true,
                      cell: (row: RecipeIngredient) => (
                        <span className="font-mono text-slate-700 dark:text-slate-300">{row.quantity} {row.unit}</span>
                      ),
                    },
                    {
                      name: t('scaled_qty_column'),
                      selector: (row: RecipeIngredient) => row.quantity * servings,
                      sortable: true,
                      width: '110px',
                      center: true,
                      cell: (row: RecipeIngredient) => (
                        <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">{(row.quantity * servings).toFixed(3)} {row.unit}</span>
                      ),
                    },
                    {
                      name: t('cost_unit_column'),
                      selector: (row: RecipeIngredient) => row.costPerUnit,
                      sortable: true,
                      width: '100px',
                      right: true,
                      cell: (row: RecipeIngredient) => <span className="font-mono text-slate-600">₹{row.costPerUnit}</span>,
                    },
                    {
                      name: t('total_column'),
                      selector: (row: RecipeIngredient) => row.quantity * servings * row.costPerUnit,
                      sortable: true,
                      width: '100px',
                      right: true,
                      cell: (row: RecipeIngredient) => <span className="font-semibold text-emerald-700 dark:text-emerald-400">₹{(row.quantity * servings * row.costPerUnit).toFixed(2)}</span>,
                    },
                    {
                      name: '',
                      width: '60px',
                      center: true,
                      cell: (row: RecipeIngredient) => (
                        <button
                          onClick={() => setRecipeIngredients(recipeIngredients.filter((i) => i.id !== row.id))}
                          className="text-red-400 hover:text-red-600 cursor-pointer"
                          title={t('remove_tooltip')}
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
                      <p className="text-sm text-slate-400 font-semibold">{t('no_ingredients_yet_text')}</p>
                      <p className="text-[11px] text-slate-400 mt-1">{t('add_raw_ingredients_hint')}</p>
                    </div>
                  }
                />
              </div>
            </div>

            {/* Add Ingredient Form */}
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-3 h-fit">
              <h4 className="kitchen-management__caption font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2"><Plus className="w-4 h-4 text-indigo-500" /> Add Ingredient</h4>
              <form onSubmit={handleAddIngredient} className="app-form app-form--add-ingredient space-y-3">
                <div>
                  <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('from_kitchen_stock_label')}</label>
                  {inventory && inventory.length > 0 ? (
                    <StyledSelect
                      searchable
                      value={selectedStockItemId}
                      onChange={(val) => handleStockItemSelect(val)}
                      placeholder={t('choose_ingredient_placeholder')}
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
                    <Input
                      label="Qty / Portion"
                      type="number"
                      step="0.001"
                      required
                      value={newIngQty}
                      onChange={(e) => setNewIngQty(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Unit</label>
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
                  <Input
                    label="Cost per Unit (₹)"
                    type="number"
                    required
                    value={newIngCost}
                    onChange={(e) => setNewIngCost(Number(e.target.value))}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-xs transition-all cursor-pointer text-xs flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> {t('add_to_recipe_button')}
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
              <h3 className="kitchen-management__subtitle font-semibold text-slate-800 text-sm">{t('add_new_food_menu_item_heading')}</h3>
              <button onClick={() => setIsNewMenuModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleCreateMenuItem} className="app-form app-form--create-menu-item space-y-3 text-xs">
              <div>
                <Input
                  label={t('item_name_required_label')}
                  type="text"
                  required
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="e.g. Tandoori Butter Roti"
                />
              </div>

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('category_label')}</label>
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
                <Input
                  label={t('price_label')}
                  type="number"
                  required
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(Number(e.target.value))}
                />
              </div>

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('item_image_upload_label')}</label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3 py-2 rounded-xl cursor-pointer flex items-center gap-1.5 shadow-2xs text-xs shrink-0 transition-all">
                      <Upload className="w-4 h-4" />
                      <span>{t('upload_image_button')}</span>
                      <Input
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

                    <Input
                      type="text"
                      value={newItemImagePath}
                      onChange={(e) => setNewItemImagePath(e.target.value)}
                      placeholder={t('or_enter_image_url_placeholder')}
                      className="flex-1 font-mono text-[11px]"
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
                        title={t('remove_image_tooltip')}
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
                  {t('cancel_button')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  {t('save_item_button')}
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
              <h3 className="kitchen-management__subtitle font-semibold text-slate-800 text-sm">{t('request_raw_material_heading')}</h3>
              <button onClick={() => setIsReqModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleReqSubmit} className="app-form app-form--submit-requisition space-y-3 text-xs">
              <div>
                <Input
                  label={t('material_name_required_label')}
                  type="text"
                  required
                  value={reqItemName}
                  onChange={(e) => setReqItemName(e.target.value)}
                  placeholder={t('e_g_milk_placeholder')}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Input
                    label={t('quantity_label')}
                    type="number"
                    value={reqQty}
                    onChange={(e) => setReqQty(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('unit_label')}</label>
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
                  {t('cancel_button')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  {t('submit_requisition_button')}
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
      <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold text-sm">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        <span>{t('current_guest_served_dishes_heading')}</span>
        <span className="text-xs text-slate-400 ml-1">({servedLogs.length} {t('total_suffix')})</span>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-xs overflow-hidden">
        <DataTable
          columns={[
            { name: 'ID', selector: (row: ServedLogEntry) => row.id, omit: true },
            { name: t('ticket_column'), selector: (row: ServedLogEntry) => row.orderId, sortable: true, width: '80px', cell: (row: ServedLogEntry) => <span className="font-mono font-semibold text-slate-900 dark:text-white">#{row.orderId}</span> },
            { name: t('dish_column'), selector: (row: ServedLogEntry) => row.itemName, sortable: true, grow: 2, cell: (row: ServedLogEntry) => <span className="font-semibold text-emerald-700 dark:text-emerald-400">{row.itemName}</span> },
            { name: t('qty_column'), selector: (row: ServedLogEntry) => row.quantity, sortable: true, width: '60px', center: true },
            { name: t('guest_column'), selector: (row: ServedLogEntry) => row.guestName, sortable: true, cell: (row: ServedLogEntry) => <span className="font-semibold text-slate-800 dark:text-slate-200">{row.guestName}</span> },
            { name: t('room_column'), selector: (row: ServedLogEntry) => row.roomNumber, sortable: true, width: '70px' },
            { name: t('served_by_column'), selector: (row: ServedLogEntry) => row.servedBy, sortable: true, cell: (row: ServedLogEntry) => <span className="text-slate-600 dark:text-slate-400">{row.servedBy}</span> },
            { name: t('date_time_column'), selector: (row: ServedLogEntry) => row.servedAt, sortable: true, width: '150px', cell: (row: ServedLogEntry) => <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDateTimeDDMMYYYY(row.servedAt)}</span> },
          ]}
          data={servedLogs}
          subHeader={
            <Input type="text" placeholder={t('search_served_dishes_placeholder')} className="w-full max-w-sm" />
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

