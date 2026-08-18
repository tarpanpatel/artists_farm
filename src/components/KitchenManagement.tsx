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
  ArrowLeft,
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
  ChevronLeft,
  ChevronRight,
  Loader2,
  Receipt,
  User,
  BookOpen,
  Package,
  Filter
} from 'lucide-react';
import { Guest, Order, OrderItem, MenuItem, Requisition, InventoryItem, WalkInTab } from '../types';
import { GUEST_STATUS_CHECKED_IN, GUEST_STATUS_ACTIVE_LEGACY } from '../constants/guestStatus';
import { recordTelescopeLog } from '../utils/telescopeLogger';
import { resolveTelegramTemplate, fetchServedLogsFromDB, addServedLogToDB, fetchMaterialCategoriesFromDB, fetchRecipesFromDB, saveRecipeToDB, deleteRecipeFromDB, depleteStockForDish, getPropertySlug, updateOrderItemStatus, updateOrderStatusDB, updateItemReminderTimestamp, checkStaleReminders, StaleReminderItem, fetchTelegramConfigDB, fetchStaffMealOptionsFromDB, addStaffMealOptionToDB, fetchStaffMealLogsFromDB, addStaffMealLogToDB, addOrderToDB, fetchWalkInTabsFromDB, fetchWalkInTabHistoryFromDB, openWalkInTabDB } from '../services/api';
import { StyledSelect } from './StyledSelect';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import { WalkInTabBillModal } from './WalkInTabBillModal';
import DataTable from 'react-data-table-component';

import { useKitchenContext } from '../contexts/KitchenContext';
import { useInventoryContext } from '../contexts/InventoryContext';
import { useAuth } from '../contexts/AuthContext';
import { useStaff } from '../contexts/StaffContext';
import { PageHeader, PageHeaderButton } from './PageHeader';
import { Input } from './Input';
import { Button } from './Button';
import { t } from '../i18n/en';
import { formatDateTimeDDMMYYYY } from '../utils/dateUtils';

const mapWalkInTabFromApi = (raw: any): WalkInTab => ({
  id: Number(raw.id),
  label: raw.label || null,
  status: raw.status === 'billed' ? 'billed' : 'open',
  openedAt: raw.opened_at || '',
  items: Array.isArray(raw.items)
    ? raw.items.map((it: any) => ({
        name: it.name || 'Item',
        price: Number(it.price) || 0,
        quantity: Number(it.quantity) || 0,
        lineTotal: Number(it.lineTotal) || 0,
      }))
    : [],
  subtotal: Number(raw.subtotal) || 0,
  billedAt: raw.billed_at || null,
  paymentMethod: raw.payment_method || null,
  discount: Number(raw.discount) || 0,
  gstEnabled: !!Number(raw.gst_enabled),
  gstRate: Number(raw.gst_rate) || 0,
  gstAmount: Number(raw.gst_amount) || 0,
  grandTotal: raw.grand_total != null ? Number(raw.grand_total) : null,
});

interface KitchenManagementProps {
  guests: Guest[];
  menu: MenuItem[];
  onAddMenuItem: (item: MenuItem) => void;
  onRequestMaterial: (req: Requisition) => void;
  onDispatchTelegram?: (eventType: string, message: string, category?: 'kitchen' | 'admin' | 'finance' | 'all', replyMarkup?: any, templateKey?: string) => void;
  activeMenuItemKey?: string;
  propertyName?: string;
  propertyGstin?: string;
  propertyUpiId?: string;
}

export const KitchenManagement: React.FC<KitchenManagementProps> = ({
  guests,
  menu,
  onAddMenuItem,
  onRequestMaterial,
  onDispatchTelegram,
  activeMenuItemKey = 'kitchen_orders',
  propertyName = '',
  propertyGstin = '',
  propertyUpiId = '',
}) => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { orders, addOrder, refreshOrders, updateOrderStatus, pendingOrdersCount } = useKitchenContext();
  const { inventory, requisitions } = useInventoryContext();
  const { currentUser, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<'kds' | 'new_order' | 'walk_in_bills' | 'menu_catalog' | 'requisitions' | 'staff_meals' | 'beta_recipe_builder'>('kds');

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
  const [cancelledItemKeys, setCancelledItemKeys] = useState<Record<string, boolean>>({});
  // Short display string ("03:48 AM") shown inline next to a ready/served
  // item on its ticket card. Separate from itemReadyTimestamps below (the
  // full canonical timestamp served_logs actually needs) since this one is
  // purely decorative and never leaves this component.
  const [itemReadyTimes, setItemReadyTimes] = useState<Record<string, string>>({});
  // Full local timestamp ("YYYY-MM-DD HH:MM:SS") captured at the moment an
  // item is marked Ready, reused as readyAt when it's later marked Served.
  // Added 17 Aug 2026 alongside the buildLocalTimestamp fix below - without
  // this, readyAt was reconstructed at SERVE time by pairing today's date
  // with the ready-time-of-day string, and "today's date" was read via
  // toISOString() (UTC), which lands on the wrong calendar day for the ~5.5
  // hours a day IST is ahead of UTC - readyAt would claim the item went
  // ready "yesterday", producing a bogus ~1440-minute Serve Delay no matter
  // how fast it actually was.
  const [itemReadyTimestamps, setItemReadyTimestamps] = useState<Record<string, string>>({});
  // An order's own status never used to update once every item on it was
  // marked Served - it just sat at 'Pending' until a full reload happened to
  // reconcile it (found 17 Aug 2026). 'completed' shows an immediate
  // confirmation pill; 'processing' (a beat later) is the animated cue right
  // before the card actually leaves the active grid (once the real status
  // flips to Fulfilled below it, so the card also stays legible for a moment
  // rather than vanishing the instant the last item is tapped).
  const [completingOrderIds, setCompletingOrderIds] = useState<Record<string, 'completed' | 'processing'>>({});

  // Walk-in tabs - open tabs (with their live running total) power both the
  // "add to an existing tab" picker in New Order and the Walk-in Bills board.
  // Loaded up front (not lazily per-tab) since New Order needs the list too.
  const [walkInTabs, setWalkInTabs] = useState<WalkInTab[]>([]);
  const [walkInTabsLoading, setWalkInTabsLoading] = useState(true);
  const refreshWalkInTabs = async () => {
    const data = await fetchWalkInTabsFromDB();
    setWalkInTabs(data.map(mapWalkInTabFromApi));
    setWalkInTabsLoading(false);
  };
  useEffect(() => { refreshWalkInTabs(); }, []);

  const [walkInTabHistory, setWalkInTabHistory] = useState<WalkInTab[]>([]);
  useEffect(() => {
    if (activeTab !== 'walk_in_bills') return;
    fetchWalkInTabHistoryFromDB().then((data) => setWalkInTabHistory(data.map(mapWalkInTabFromApi)));
  }, [activeTab]);

  const [billingTab, setBillingTab] = useState<WalkInTab | null>(null);

  const [servedLogs, setServedLogs] = useState<Array<{ id: string; orderId: string; itemName: string; quantity: number; servedBy: string; guestName: string; roomNumber: string; servedAt: string; readyAt: string | null }>>([]);

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
    // Full canonical timestamp (YYYY-MM-DD HH:MM:SS) restored from DB so that
    // readyAt is never null when Mark Served is tapped after a page refresh or
    // a 15-second auto-sync clears the in-memory itemReadyTimestamps map.
    // Without this, any item marked Ready in one render cycle would lose its
    // readyAt the moment orders refreshed, producing a null readyAt in the
    // served log and blank "Ready At" / "Serve Delay" columns (found 17 Aug 2026).
    const nextReadyTimestamps: Record<string, string> = {};
    const nextCancelled: Record<string, boolean> = {};
    orders.forEach((ord: Order) => {
      ord.items.forEach((item: OrderItem, idx: number) => {
        const key = `${ord.id}_${idx}`;
        if (item.itemStatus === 'Ready') {
          nextReady[key] = true;
          if (item.readyAt) {
            nextReadyTimes[key] = new Date(item.readyAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            nextReadyTimestamps[key] = item.readyAt;
          }
        } else if (item.itemStatus === 'Served') {
          nextServed[key] = true;
        } else if (item.itemStatus === 'Cancelled') {
          nextCancelled[key] = true;
        }
      });
    });
    setReadyItemKeys((prev) => ({ ...nextReady, ...prev }));
    setServedItemKeys((prev) => ({ ...nextServed, ...prev }));
    setItemReadyTimes((prev) => ({ ...nextReadyTimes, ...prev }));
    setItemReadyTimestamps((prev) => ({ ...nextReadyTimestamps, ...prev }));
    setCancelledItemKeys((prev) => ({ ...nextCancelled, ...prev }));
  }, [orders]);

  const [ingredientCategoryNames, setIngredientCategoryNames] = useState<string[]>([]);
  useEffect(() => {
    fetchMaterialCategoriesFromDB().then((cats) => {
      setIngredientCategoryNames(cats.filter(c => c.is_ingredient).map(c => c.name));
    });
  }, []);

  // Smart Polling / Auto-Refresh state (15s interval matching kitchen.php).
  // Always on, deliberately not user-toggleable - a KDS's whole job is
  // showing new orders as they arrive, and a staff member pausing it during
  // a rush (then forgetting to turn it back on) means orders silently stop
  // appearing until someone happens to hit manual Sync. The manual Sync
  // button below covers "I want fresh data right now" without needing a way
  // to disable the automatic one.
  const [lastSyncTime, setLastSyncTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const [syncCountdown, setSyncCountdown] = useState(15);
  const [isSyncing, setIsSyncing] = useState(false);
  // Ticks every second so KDS elapsed timers stay live without a separate interval.
  // Piggybacking on the already-running sync countdown beat keeps timer count at 1.
  const [tickNow, setTickNow] = useState(() => Date.now());

  // Real DB Sync Function: fetches fresh active orders, served logs, and walk-in tabs
  const executeSync = React.useCallback(async (isManual: boolean = false) => {
    setIsSyncing(true);
    try {
      await Promise.all([
        refreshOrders(),
        fetchServedLogsFromDB().then((logs) => {
          if (logs && logs.length > 0) setServedLogs(logs);
        }),
        refreshWalkInTabs(),
      ]);
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setSyncCountdown(15);
      if (isManual) {
        showToast(t('kds_sync_success_toast', 'KDS synced successfully!'), { type: 'success' });
      }
    } catch (err) {
      console.error('Failed to sync KDS data:', err);
      showToast(t('kds_sync_error_toast', 'Could not sync KDS orders. Check network connection.'), { type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  }, [refreshOrders, showToast]);

  // Smart Polling countdown & 15-second background sync logic
  React.useEffect(() => {
    const timer = setInterval(() => {
      setTickNow(Date.now()); // drives live elapsed timers on KDS ticket cards
      setSyncCountdown((prev) => {
        if (prev <= 1) {
          executeSync(false);
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [executeSync]);

  const triggerManualSync = () => {
    executeSync(true);
  };

  const handleMarkDishReady = async (ord: Order, itemIndex: number, item: OrderItem) => {
    const key = `${ord.id}_${itemIndex}`;
    const now = new Date();
    const nowTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setReadyItemKeys((prev) => ({ ...prev, [key]: true }));
    setItemReadyTimestamps((prev) => ({ ...prev, [key]: buildLocalTimestamp(now) }));
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

    showToast(`Dish marked ready: ${item.quantity}x ${item.name}`, { type: 'success' });

    recordTelescopeLog({
      portal: 'requests',
      severity: 'INFO',
      msg: `PATCH /api/kitchen/orders/${ord.id}/items/${itemIndex} - Dish Ready (${item.name})`,
      origin: '/src/components/KitchenManagement.tsx -> handleMarkDishReady',
      details: { orderId: ord.id, itemIndex, item },
    });
  };

  // Removes a single dish from a ticket without cancelling the whole order -
  // e.g. a guest changes their mind about one item but still wants the rest.
  // Reuses the same 'Cancelled' item_status update_order_item_status already
  // persists (server treats it as an arbitrary string, no schema change
  // needed) and the same local-key pattern as ready/served tracking above,
  // so a refresh/auto-sync keeps the dish hidden via the hydration effect.
  const handleDeleteItem = async (ord: Order, itemIndex: number, item: OrderItem) => {
    const cleanTicketId = ord.id.replace('#', '');
    const confirmed = await confirm({
      title: t('delete_dish_title', 'Remove Dish'),
      message: t('delete_dish_confirm_message', `Remove ${item.quantity}x ${item.name} from Order #${cleanTicketId}? This cannot be undone.`),
      confirmText: t('delete_dish_confirm_button', 'Remove Dish'),
      variant: 'danger',
    });
    if (!confirmed) return;

    const key = `${ord.id}_${itemIndex}`;
    setCancelledItemKeys((prev) => ({ ...prev, [key]: true }));

    if (item.id) {
      await updateOrderItemStatus(item.id, 'Cancelled');
    }
    showToast(t('dish_removed_toast', `${item.name} removed from Order #${cleanTicketId}.`), { type: 'success' });

    // Mirrors the server-side auto-complete check in update_order_item_status -
    // if every OTHER item on this ticket is already served or removed, the
    // order should still resolve instead of sitting active forever because
    // one dish's key never flips to "served". Two different outcomes though:
    // if at least one dish was actually served, this is a normal completion
    // (Fulfilled). If every item on the ticket was individually removed and
    // nothing was ever served, "Fulfilled" would be a lie - that ticket
    // never delivered anything, so it should read as Cancelled instead.
    const isEveryOtherItemDone = ord.items.every((_, idx) =>
      idx === itemIndex || servedItemKeys[`${ord.id}_${idx}`] || cancelledItemKeys[`${ord.id}_${idx}`]
    );
    const wasAnythingServed = ord.items.some((_, idx) => servedItemKeys[`${ord.id}_${idx}`]);
    if (isEveryOtherItemDone) {
      if (wasAnythingServed) {
        triggerOrderCompletion(ord);
      } else {
        updateOrderStatus(ord.id, 'Cancelled');
        await updateOrderStatusDB(ord.orderId != null ? String(ord.orderId) : ord.id, 'Cancelled');
      }
    }

    recordTelescopeLog({
      portal: 'requests',
      severity: 'INFO',
      msg: `PATCH /api/kitchen/orders/${ord.id}/items/${itemIndex} - Dish Removed (${item.name})`,
      origin: '/src/components/KitchenManagement.tsx -> handleDeleteItem',
      details: { orderId: ord.id, itemIndex, item },
    });
  };

  // Fires once the LAST item on an order gets marked Served - shows an
  // immediate "Completed" confirmation, then a beat later a spinning
  // "Processing..." cue, then actually flips the order to Fulfilled (both
  // locally and in the DB), which is what makes it leave the active grid
  // below (activeOrders filters on status, not on individual item state).
  const triggerOrderCompletion = (ord: Order) => {
    setCompletingOrderIds((prev) => ({ ...prev, [ord.id]: 'completed' }));
    setTimeout(() => {
      setCompletingOrderIds((prev) => ({ ...prev, [ord.id]: 'processing' }));
      setTimeout(() => {
        updateOrderStatus(ord.id, 'Fulfilled');
        updateOrderStatusDB(ord.orderId != null ? String(ord.orderId) : ord.id, 'Fulfilled');
        setCompletingOrderIds((prev) => {
          const next = { ...prev };
          delete next[ord.id];
          return next;
        });
      }, 700);
    }, 900);
  };

  // Manual order cancellation - the 'Cancelled' status has always been a
  // valid Order.status value and updateOrderStatusDB already accepts it
  // (used internally by triggerOrderCompletion for 'Fulfilled'), but no
  // button ever called it, so a mistaken/duplicate order had no way to be
  // removed from the live KDS queue short of a DB edit.
  const handleCancelOrder = async (ord: Order) => {
    const cleanTicketId = ord.id.replace('#', '');
    const confirmed = await confirm({
      title: t('cancel_order_title', 'Cancel Order'),
      message: t('cancel_order_confirm_message', `Cancel Order #${cleanTicketId}? This removes it from the kitchen queue and cannot be undone.`),
      confirmText: t('cancel_order_confirm_button', 'Cancel Order'),
      variant: 'danger',
    });
    if (!confirmed) return;

    updateOrderStatus(ord.id, 'Cancelled');
    await updateOrderStatusDB(ord.orderId != null ? String(ord.orderId) : ord.id, 'Cancelled');
    showToast(t('order_cancelled_toast', `Order #${cleanTicketId} cancelled.`), { type: 'success' });

    recordTelescopeLog({
      portal: 'requests',
      severity: 'INFO',
      msg: `PATCH /api/kitchen/orders/${ord.id} - Order Cancelled`,
      origin: '/src/components/KitchenManagement.tsx -> handleCancelOrder',
      details: { orderId: ord.id },
    });
  };

  const handleMarkDishServed = async (ord: Order, itemIndex: number, item: OrderItem) => {
    const key = `${ord.id}_${itemIndex}`;
    const cleanTicketId = ord.id.replace('#', '');

    if (servedItemKeys[key]) {
      showToast(`[Telegram answerCallbackQuery]: Dish "${item.name}" on Ticket #${cleanTicketId} is ALREADY marked as SERVED!`, { type: 'warning' });
      return;
    }

    const now = new Date();
    const nowTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setServedItemKeys((prev) => ({ ...prev, [key]: true }));

    if (item.id) {
      updateOrderItemStatus(item.id, 'Served');
    }

    const isLastItemOnOrder = ord.items.every((_, idx) =>
      idx === itemIndex || servedItemKeys[`${ord.id}_${idx}`] || cancelledItemKeys[`${ord.id}_${idx}`]
    );
    if (isLastItemOnOrder) {
      triggerOrderCompletion(ord);
    }

    // Add to Current Guest Served Dishes. Both timestamps are the canonical
    // "YYYY-MM-DD HH:MM:SS" local format (buildLocalTimestamp) - NOT
    // toISOString() (UTC - see itemReadyTimestamps' comment above for why
    // that silently produced a bogus ~1440min Serve Delay) and NOT
    // formatDateDDMMYYYY (a 2-digit-year DISPLAY format never meant to be
    // parsed back). The table cells reformat these for display separately.
    const servedByUser = getCurrentUserName();
    const fallbackGuest = ord.guestName || 'Walk-in';
    const readyDateStr = itemReadyTimestamps[key] || null;

    const newLog = {
      id: Date.now().toString(),
      orderId: cleanTicketId,
      itemName: item.name,
      quantity: item.quantity,
      servedBy: servedByUser,
      guestName: fallbackGuest,
      roomNumber: ord.roomNumber,
      servedAt: buildLocalTimestamp(now),
      readyAt: readyDateStr,
    };
    setServedLogs((prev) => [newLog, ...prev]);
    addServedLogToDB({
      order_id: cleanTicketId,
      item_name: item.name,
      quantity: item.quantity,
      served_by: servedByUser,
      guest_name: fallbackGuest,
      room_number: ord.roomNumber,
      ready_at: readyDateStr || undefined,
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
    // ord.orderTime briefly reads the literal string 'Just now' right after
    // placing an order (until refreshOrders' refetch replaces it with a real
    // timestamp) - new Date('Just now') is an Invalid Date, and an
    // unreminded NaN was going straight into a real Telegram message to the
    // kitchen ("Pending for: NaN min") if a reminder got sent in that
    // narrow window (found 17 Aug 2026).
    const orderTimeMs = new Date(ord.orderTime).getTime();
    const elapsedMin = isNaN(orderTimeMs) ? 0 : Math.max(0, Math.round((Date.now() - orderTimeMs) / 60000));

    if (onDispatchTelegram) {
      const reminderVars: Record<string, string> = {
        order_id: cleanTicketId,
        qty: String(item.quantity),
        dish_name: item.name,
        room_no: ord.roomNumber,
        elapsed_minutes: String(elapsedMin),
      };
      const resolved = await resolveTelegramTemplate('kitchen_order_reminder', reminderVars);
      const appUrl = `${window.location.origin}${window.location.pathname}#kitchen`;
      const fallbackMsg = `⏰ <b>KITCHEN REMINDER</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Order Ticket:</b> #${cleanTicketId}\n• <b>${item.quantity}x</b> ${item.name} (${ord.roomNumber})\n⏱️ <b>Pending for:</b> ${elapsedMin} min\n━━━━━━━━━━━━━━━━━━\n👨‍🍳 <i>Please check on this order.</i>\n\n🔗 <b>Open Kitchen Board:</b> <a href="${appUrl}">${appUrl}</a>`;
      const finalMsg = resolved ? `${resolved}\n\n🔗 <b>Open Kitchen Board:</b> <a href="${appUrl}">${appUrl}</a>` : fallbackMsg;
      onDispatchTelegram('Kitchen Order Reminder', finalMsg, 'kitchen', undefined, 'kitchen_order_reminder');
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
      const appUrl = `${window.location.origin}${window.location.pathname}#kitchen`;
      const inlineKeyboard = {
        inline_keyboard: [
          [{ text: '🍽️ Tap when Served', callback_data: `serve_item_${cleanTicketId}_${itemIndex}` }]
        ]
      };
      const fallbackMsg = `⏰ <b>STILL WAITING FOR PICKUP</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Order Ticket:</b> #${cleanTicketId}\n• <b>${item.quantity}x</b> ${item.name} (${ord.roomNumber})\n⏱️ <b>Ready since:</b> ${readySince || 'a while ago'}\n━━━━━━━━━━━━━━━━━━\n🏃 <i>Please collect and tap below when served.</i>\n\n🔗 <b>Open Kitchen Board:</b> <a href="${appUrl}">${appUrl}</a>`;
      const finalMsg = resolved ? `${resolved}\n\n🔗 <b>Open Kitchen Board:</b> <a href="${appUrl}">${appUrl}</a>` : fallbackMsg;
      onDispatchTelegram('Pickup Reminder', finalMsg, 'admin', inlineKeyboard, 'kitchen_pickup_reminder');
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
    if (!isAuthenticated) return;
    fetchTelegramConfigDB().then((cfg) => {
      if (cfg.reminderThresholdMinutes) setReminderThresholdMinutes(cfg.reminderThresholdMinutes);
    });
  }, [isAuthenticated]);

  const autoFireKitchenReminder = async (stale: StaleReminderItem) => {
    const reminderVars: Record<string, string> = {
      order_id: String(stale.order_id),
      qty: String(stale.quantity),
      dish_name: stale.dish_name,
      room_no: stale.room_no,
      elapsed_minutes: String(stale.elapsed_minutes),
    };
    const resolved = await resolveTelegramTemplate('kitchen_order_reminder', reminderVars);
    const appUrl = `${window.location.origin}${window.location.pathname}#kitchen`;
    const fallbackMsg = `⏰ <b>KITCHEN REMINDER</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Order Ticket:</b> #${stale.order_id}\n• <b>${stale.quantity}x</b> ${stale.dish_name} (${stale.room_no})\n⏱️ <b>Pending for:</b> ${stale.elapsed_minutes} min\n━━━━━━━━━━━━━━━━━━\n👨‍🍳 <i>Auto-reminder — please check on this order.</i>\n\n🔗 <b>Open Kitchen Board:</b> <a href="${appUrl}">${appUrl}</a>`;
    const finalMsg = resolved ? `${resolved}\n\n🔗 <b>Open Kitchen Board:</b> <a href="${appUrl}">${appUrl}</a>` : fallbackMsg;
    onDispatchTelegram?.('Kitchen Order Reminder (Auto)', finalMsg, 'kitchen', undefined, 'kitchen_order_reminder');
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
    const appUrl = `${window.location.origin}${window.location.pathname}#kitchen`;
    const inlineKeyboard = {
      inline_keyboard: [
        [{ text: '🍽️ Tap when Served', callback_data: `serve_item_${stale.order_id}_${stale.item_index ?? 0}` }]
      ]
    };
    const fallbackMsg = `⏰ <b>STILL WAITING FOR PICKUP</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Order Ticket:</b> #${stale.order_id}\n• <b>${stale.quantity}x</b> ${stale.dish_name} (${stale.room_no})\n⏱️ <b>Ready since:</b> ${stale.elapsed_minutes} min ago\n━━━━━━━━━━━━━━━━━━\n🏃 <i>Auto-reminder — please collect and tap below when served.</i>\n\n🔗 <b>Open Kitchen Board:</b> <a href="${appUrl}">${appUrl}</a>`;
    const finalMsg = resolved ? `${resolved}\n\n🔗 <b>Open Kitchen Board:</b> <a href="${appUrl}">${appUrl}</a>` : fallbackMsg;
    onDispatchTelegram?.('Pickup Reminder (Auto)', finalMsg, 'admin', inlineKeyboard, 'kitchen_pickup_reminder');
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
  const [smPage, setSmPage] = useState(1);
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
  const [showCategoryFilters, setShowCategoryFilters] = useState(false);
  const [recentlyAddedId, setRecentlyAddedId] = useState<number | null>(null);
  const [isCartDrawerExpanded, setIsCartDrawerExpanded] = useState<boolean>(false);
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);
  // Walk-in mode - food prepared for someone not staying in a room (a diner at
  // the restaurant, a local walk-in). No guest/room to attach the order to;
  // instead it joins a running tab (null = start a new one) that bills as one
  // consolidated bill once, from the Walk-in Bills tab, however many orders
  // it accumulates in the meantime.
  const [orderMode, setOrderMode] = useState<'guest' | 'walkin'>('guest');
  const [selectedWalkInTabId, setSelectedWalkInTabId] = useState<number | null>(null);
  const [newTabLabel, setNewTabLabel] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

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

  // Submit Order - persists to the DB via create_order (found 17 Aug 2026: this
  // used to only call the local addOrder() below, never the backend at all, so
  // every order placed here vanished on refresh - it never actually reached the
  // orders table). Handles both a guest order and a walk-in - walk-in orders
  // join a running tab (opening a new one first if none was picked) rather
  // than settling individually; see the Walk-in Bills tab for billing.
  const handleOrderSubmit = async () => {
    if (cartItems.length === 0 || isSubmittingOrder) return;
    const guest = orderMode === 'guest' ? guests.find((g) => g.id === selectedGuestId) : null;
    if (orderMode === 'guest' && !guest) return;
    if (orderMode === 'walkin' && selectedWalkInTabId === null && newTabLabel.trim() === '') return;

    const orderItems: OrderItem[] = cartItems.map((ci) => ({
      menuItemId: ci.menuItem.id,
      name: ci.menuItem.name,
      quantity: ci.quantity,
      unitPrice: ci.menuItem.price,
    }));
    const totalAmount = orderItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    setIsSubmittingOrder(true);

    let targetTabId: number | null = null;
    let targetTabLabel: string | null = null;
    if (orderMode === 'walkin') {
      if (selectedWalkInTabId != null) {
        targetTabId = selectedWalkInTabId;
        targetTabLabel = walkInTabs.find((tab) => tab.id === selectedWalkInTabId)?.label ?? null;
      } else {
        const trimmedLabel = newTabLabel.trim();
        targetTabId = await openWalkInTabDB(trimmedLabel);
        targetTabLabel = trimmedLabel || null;
        if (targetTabId == null) {
          setIsSubmittingOrder(false);
          showToast(t('tab_open_failed_toast', 'Could not start a new tab. Please try again.'), { type: 'error' });
          return;
        }
      }
    }

    const orderId = await addOrderToDB({
      guestId: guest?.id ?? null,
      walkInTabId: targetTabId,
      items: cartItems.map((ci) => ({ menuItemId: ci.menuItem.id, quantity: ci.quantity })),
    });
    setIsSubmittingOrder(false);

    if (orderId == null) {
      showToast(t('order_send_failed_toast', 'Could not send order to the kitchen. Please try again.'), { type: 'error' });
      return;
    }

    const newOrder: Order = {
      id: String(orderId),
      orderId,
      guestId: guest?.id ?? '',
      guestName: guest ? guest.guestName : (targetTabLabel || 'Walk-in'),
      roomNumber: guest?.roomNumber ?? '',
      orderTime: 'Just now',
      status: 'Pending',
      items: orderItems,
      totalAmount,
      walkInTabId: targetTabId,
    };

    addOrder(newOrder);
    setCartItems([]);
    setNewTabLabel('');
    setSelectedWalkInTabId(null);
    refreshOrders();
    refreshWalkInTabs();
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
  const filteredRequisitions = requisitions.filter((req) =>
    !reqSearch ||
    req.itemName.toLowerCase().includes(reqSearch.toLowerCase()) ||
    req.requestedBy.toLowerCase().includes(reqSearch.toLowerCase()) ||
    req.id.toLowerCase().includes(reqSearch.toLowerCase())
  );

  return (
    <div>
      {/* Unified Sub-Tab Navigation Bar - uniform enclosed pill per DESIGN.md
          §8/§10/§20 (19 Aug 2026 rewrite, replacing the earlier "merged
          panel" folder-tab style): every tab, active or inactive, is the
          exact same fully-rounded box - same padding, same border on all 4
          sides, same rounded-xl on all 4 corners, same position. Only fill/
          text/shadow color changes on selection, so nothing shifts size or
          shape when a tab is clicked (§20's no-jitter rule generalized
          beyond just font-weight - see §21). Centered, not left-anchored. */}
      {(activeTab === 'new_order' || activeTab === 'kds' || activeTab === 'walk_in_bills') && (
        <div className="flex items-center justify-center gap-1.5 px-2 py-1 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('new_order')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs whitespace-nowrap transition-colors cursor-pointer font-semibold border ${
              activeTab === 'new_order'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <UtensilsCrossed className="w-4 h-4 shrink-0" />
            <span>{t('create_resident_order_button', 'Take Order')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('kds')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs whitespace-nowrap transition-colors cursor-pointer font-semibold border ${
              activeTab === 'kds'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span>{t('live_active_orders_label', 'Live Tickets')}</span>
            {pendingOrdersCount > 0 && (
              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold ${
                activeTab === 'kds'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200/80 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
              }`}>
                {pendingOrdersCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('walk_in_bills')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs whitespace-nowrap transition-colors cursor-pointer font-semibold border ${
              activeTab === 'walk_in_bills'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <Receipt className="w-4 h-4 shrink-0" />
            <span>{t('walk_in_bills_button', 'Walk-in Bills & Tabs')}</span>
            {walkInTabs.filter((tab) => tab.status === 'open').length > 0 && (
              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold ${
                activeTab === 'walk_in_bills'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200/80 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
              }`}>
                {walkInTabs.filter((tab) => tab.status === 'open').length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* TAB 1: KDS TICKET QUEUE */}
      {activeTab === 'kds' && (() => {
        const activeOrders = orders.filter((o) => o.status === 'Pending' || o.status === 'Preparing');

        return (
        <div className="kds-orders-container space-y-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5 sm:p-4">
          <div className="kds-status-filter-bar flex flex-col sm:flex-row items-start sm:items-center justify-end text-xs gap-3">
            {/* Smart Polling / Live Sync Bar */}
            <div className="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl w-full sm:w-auto justify-between sm:justify-start">
              <div className="flex items-center gap-2">
                {/* Always-on live indicator, not a toggle - see the state
                    declaration above for why this can't be paused. */}
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title={t('auto_sync_active_tooltip')} />
                <span className="font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                  {t('auto_sync_label', 'Auto-sync')}
                  <span className="font-mono text-slate-400 dark:text-slate-500 font-normal ml-1">
                    ({syncCountdown}s)
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 hidden md:inline">{t('synced_text')} {lastSyncTime}</span>
                <button
                  onClick={triggerManualSync}
                  disabled={isSyncing}
                  className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 active:scale-98 text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50"
                  title={t('check_for_updates_tooltip')}
                >
                  <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
                  <span>{t('sync_button')}</span>
                </button>
              </div>
            </div>
          </div>

          {activeOrders.length === 0 ? (
            <div className="text-center py-12 px-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3 border border-emerald-200 dark:border-emerald-800/60">
                <UtensilsCrossed className="w-7 h-7" />
              </div>
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base tracking-wide">
                {t('no_kitchen_orders_title', 'Currently, there are no kitchen orders')}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 max-w-sm mx-auto">
                {t('no_kitchen_orders_desc', 'New orders placed from POS or room service will automatically appear in this live ticket queue.')}
              </p>
            </div>
          ) : (
            <div className="kds-tickets-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeOrders.map((ord) => {
              const completionPhase = completingOrderIds[ord.id];
              // Elapsed time since the order was placed — drives both the
              // live timer display and the traffic-light border color.
              // 'Just now' is the transient string set optimistically right
              // after placing an order; treat it as 0 min (same isNaN guard
              // used in handleSendKitchenReminder).
              const orderTimeMs = new Date(ord.orderTime).getTime();
              const elapsedTotalSec = isNaN(orderTimeMs) ? 0 : Math.max(0, Math.floor((tickNow - orderTimeMs) / 1000));
              const elapsedMin = Math.floor(elapsedTotalSec / 60);
              const elapsedSec = elapsedTotalSec % 60;
              const elapsedLabel = elapsedMin > 0
                ? `${elapsedMin}m ${String(elapsedSec).padStart(2, '0')}s`
                : `${elapsedSec}s`;
              // Toast KDS "traffic light" border: neutral → amber → red as time ages
              const urgencyBorder = elapsedMin >= 10
                ? 'border-l-4 border-l-red-500 dark:border-l-red-500'
                : elapsedMin >= 5
                ? 'border-l-4 border-l-amber-400 dark:border-l-amber-400'
                : 'border-l-4 border-l-slate-200 dark:border-l-slate-600';
              return (
              <div
                key={ord.id}
                className={`kds-ticket-card bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs p-3.5 flex flex-col justify-between transition-all duration-500 ${urgencyBorder} ${
                  completionPhase === 'processing' ? 'opacity-40 scale-[0.97]' : ''
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2 mb-2.5">
                    <div>
                      <h3 className="kitchen-management__subtitle font-semibold text-slate-900 dark:text-white text-sm">
                        Order #{ord.id.replace('#', '')}
                      </h3>
                      {/* Live elapsed timer — the #1 piece of info kitchen staff
                          need at a glance (Toast/Square KDS standard). Updates
                          every second via tickNow state. */}
                      <p className={`text-[11px] font-mono font-semibold flex items-center gap-1 mt-0.5 ${
                        elapsedMin >= 10
                          ? 'text-red-600 dark:text-red-400'
                          : elapsedMin >= 5
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}>
                        <Clock className="w-3 h-3 shrink-0" />
                        {isNaN(orderTimeMs) ? t('order_received_text', 'Just received') : elapsedLabel}
                      </p>
                    </div>
                    {completionPhase === 'processing' ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> {t('processing_label', 'Processing...')}
                      </span>
                    ) : completionPhase === 'completed' ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                        {t('completed_label', 'Completed')}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          ord.status === 'Fulfilled'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : ord.status === 'Preparing'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                        }`}>
                          {ord.status === 'Pending'
                            ? t('status_in_queue', 'In Queue')
                            : ord.status === 'Preparing'
                            ? t('status_preparing', 'Preparing')
                            : ord.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCancelOrder(ord)}
                          className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer shrink-0"
                          title={t('cancel_order_tooltip', 'Cancel this order')}
                          aria-label="Cancel order"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Walk-in badge - no guest_id means food prepared for someone
                      not staying in a room. It doesn't settle per order anymore
                      (see Walk-in Bills tab): the whole tab bills at once, since
                      a table ordering twice needs one consolidated bill, not two. */}
                  {!ord.guestId ? (
                    <div className="mb-2.5 -mt-1">
                      {/* Amber = walk-in/non-resident (Toast/Cloudbeds standard;
                          slate blended in and was visually identical to the
                          room-service blue pill on dark mode). */}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        {t('walk_in_badge', 'Walk-in')}{ord.guestName && ord.guestName !== 'Walk-in' ? ` · ${ord.guestName}` : ''}
                      </span>
                    </div>
                  ) : (
                    // Room service - shows who/where this ticket delivers to
                    // (found 17 Aug 2026: the card never showed this at all
                    // for a guest order, only for a walk-in, so staff had no
                    // way to see the destination room on the ticket itself
                    // until after it was already served).
                    <div className="mb-2.5 -mt-1">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        {ord.roomNumber || t('room_service_badge', 'Room Service')}{ord.guestName ? ` · ${ord.guestName}` : ''}
                      </span>
                    </div>
                  )}

                  {/* Items List */}
                  <div className="kds-ticket-items-list space-y-2 text-xs">
                    {ord.items
                      .map((item, idx) => ({ item, idx }))
                      // Served dishes sink to the bottom of the ticket - once
                      // delivered they no longer need kitchen/floor attention,
                      // so leaving them wherever they happened to be added
                      // just buries the items still in play. Sort is display
                      // order only; idx stays each item's original position
                      // so itemKey/handlers below still target the right
                      // item_status row. Array.prototype.sort is stable
                      // (ES2019+), so relative order within each group (both
                      // served, or both not) is preserved.
                      .sort((a, b) => {
                        const aServed = servedItemKeys[`${ord.id}_${a.idx}`] ? 1 : 0;
                        const bServed = servedItemKeys[`${ord.id}_${b.idx}`] ? 1 : 0;
                        return aServed - bServed;
                      })
                      .map(({ item, idx }) => {
                      const itemKey = `${ord.id}_${idx}`;
                      if (cancelledItemKeys[itemKey] || item.itemStatus === 'Cancelled') return null;
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
                              <span className="font-semibold text-slate-700 dark:text-slate-200 text-xs">
                                {item.quantity}x {item.name}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isServed ? (
                              <span className="text-xs font-semibold px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 shrink-0 select-none">
                                <Check className="w-3.5 h-3.5 shrink-0" />
                                <span>{t('served_badge', 'Served')}</span>
                              </span>
                            ) : isReady ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSendPickupReminder(ord, idx, item)}
                                  className="px-2.5 py-2 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700 active:scale-98 text-xs font-semibold rounded-xl transition-all shadow-2xs flex items-center justify-center gap-1 cursor-pointer shrink-0"
                                  title={t('send_pickup_reminder_tooltip')}
                                >
                                  <Bell className="w-3.5 h-3.5 shrink-0" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMarkDishServed(ord, idx, item)}
                                  className="px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 active:scale-98 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 text-xs font-semibold rounded-xl transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                                  title={t('click_when_served_tooltip', 'Confirm dish has been delivered to guest')}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  <span>{t('served_action_button', 'Mark Served')}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(ord, idx, item)}
                                  className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer shrink-0"
                                  title={t('delete_dish_tooltip', 'Remove this dish')}
                                  aria-label="Remove dish"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSendKitchenReminder(ord, idx, item)}
                                  className="px-2.5 py-2 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700 active:scale-98 text-xs font-semibold rounded-xl transition-all shadow-2xs flex items-center justify-center gap-1 cursor-pointer shrink-0"
                                  title={t('send_reminder_tooltip')}
                                >
                                  <Bell className="w-3.5 h-3.5 shrink-0" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMarkDishReady(ord, idx, item)}
                                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-semibold rounded-xl transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  <span>{t('ready_button', 'Mark Ready')}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(ord, idx, item)}
                                  className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer shrink-0"
                                  title={t('delete_dish_tooltip', 'Remove this dish')}
                                  aria-label="Remove dish"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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
              );
            })}
          </div>
          )}

          {/* No separate order-level "Fulfilled/Served Orders" table anymore
              (removed 17 Aug 2026) - it duplicated Current Guest Served
              Dishes below for anything but a multi-item order, and now that
              order status actually auto-completes (see triggerOrderCompletion
              above), the overlap was showing up on every single-item ticket.
              Order completion still works exactly the same (it's what drops
              a ticket out of the active grid above) - it just isn't rendered
              as its own table too. */}

          {/* Current Guest Served Dishes - DataTable */}
          <CurrentGuestServedDishes servedLogs={servedLogs} />
        </div>
        );
      })()}

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
              className="pos-food-card bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700 hover:border-blue-400 hover:shadow-sm p-2.5 flex flex-col justify-between gap-2 transition-all"
            >
              <div className="space-y-1.5">
                <div className="relative w-full h-20 sm:h-16 rounded-xl bg-slate-100 dark:bg-slate-700 border border-slate-200/80 dark:border-slate-600 overflow-hidden flex items-center justify-center text-slate-400 dark:text-slate-500">
                  {item.imagePath ? (
                    <img
                      src={item.imagePath}
                      alt={item.name}
                      className="w-full h-full object-cover rounded-xl"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                  ) : (
                    <UtensilsCrossed className="w-5 h-5 text-slate-300 dark:text-slate-500" />
                  )}
                </div>

                <div className="flex items-center justify-between gap-1 leading-tight">
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-xs sm:text-[11px] truncate flex-1 m-0 p-0">
                    {item.name}
                  </h4>
                  <span className="text-emerald-700 dark:text-emerald-400 font-extrabold text-xs sm:text-[11px] shrink-0">
                    ₹{item.price}
                  </span>
                </div>
              </div>

              {/* Mobile-First Touch Stepper (Always showing minus, quantity, plus) */}
              <div className="pt-1 border-t border-slate-100 dark:border-slate-700/60">
                <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-700/60 rounded-xl p-0.5 w-full">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (inCartQty > 0) {
                        handleUpdateCartQuantity(item.id, -1);
                      }
                    }}
                    disabled={inCartQty === 0}
                    className={`aspect-square w-8 h-8 rounded-sm shrink-0 font-extrabold text-xs flex items-center justify-center transition-all shadow-2xs ${
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
                    className={`aspect-square w-8 h-8 rounded-sm shrink-0 font-extrabold text-xs flex items-center justify-center active:scale-90 transition-all cursor-pointer shadow-2xs ${
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

        // Walk-in mode never needs a checked-in guest - that's the whole point of it.
        const isWalkInNameMissing = orderMode === 'walkin' && selectedWalkInTabId === null && newTabLabel.trim() === '';
        const isOrderSubmitDisabled = cartItems.length === 0 || isSubmittingOrder || (orderMode === 'guest' && (!selectedGuest || checkedInGuests.length === 0)) || isWalkInNameMissing;
        const orderSubmitTitle = orderMode === 'guest' && checkedInGuests.length === 0
          ? t('no_active_resident_tooltip')
          : cartItems.length === 0
          ? t('order_cart_empty_tooltip')
          : isWalkInNameMissing
          ? t('walk_in_name_required_tooltip', 'Enter a table or customer name to start a new tab')
          : t('send_order_to_kitchen_button');

        const openTabs = walkInTabs.filter((tab) => tab.status === 'open');

        return (
          <div className="take-food-order-container space-y-4 pb-48 lg:pb-0 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5 sm:p-4">

            {/* Order Mode: Guest (room service, billed to the stay) vs Walk-in
                (counter/dine-in, no room - joins a running tab, billed all at
                once from the Walk-in Bills tab). Deliberately NOT styled as its
                own bordered/shadowed card or in the tab bar's blue - that made
                it look like a second row of page-level tabs stacked under the
                real one above (found confusing 18 Aug 2026). A plain inline
                row with a neutral (not blue) active state reads as "a setting
                for this order", not "another nav bar". */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 px-0.5">
              <div className="flex items-center gap-2 shrink-0">
                {/* Segmented Switcher */}
                <div className="inline-flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl shrink-0 border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setOrderMode('guest')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      orderMode === 'guest'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {t('order_mode_guest_button', 'In-House Guest')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderMode('walkin')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      orderMode === 'walkin'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {t('order_mode_walkin_button', 'Walk-in / Counter')}
                  </button>
                </div>
              </div>

              {/* Target Guest Info Badge */}
              {orderMode === 'guest' && (
                <div className="flex items-center gap-2 text-xs">
                  {selectedGuest ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-800/60">
                      <User className="w-3.5 h-3.5" />
                      {selectedGuest.guestName}
                      {selectedGuest.roomNumber ? ` (${selectedGuest.roomNumber})` : ''}
                    </span>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400 text-xs">
                      {t('no_active_resident_tooltip', 'No active resident selected')}
                    </span>
                  )}
                </div>
              )}

              {/* Walk-in Tab Controls */}
              {orderMode === 'walkin' && (
                <div className="w-full pt-2.5 mt-0.5 border-t border-slate-100 dark:border-slate-700/80 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedWalkInTabId(null)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      selectedWalkInTabId === null
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400'
                    }`}
                  >
                    + {t('new_tab_button', 'New Tab')}
                  </button>
                  {selectedWalkInTabId === null && (
                    <div className="w-full sm:w-auto sm:flex-1 sm:max-w-xs mt-1 sm:mt-0">
                      <Input
                        type="text"
                        value={newTabLabel}
                        onChange={(e) => setNewTabLabel(e.target.value)}
                        placeholder={t('walk_in_name_placeholder', 'Table / customer name')}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                  {openTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSelectedWalkInTabId(tab.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        selectedWalkInTabId === tab.id
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400'
                      }`}
                    >
                      {tab.label || t('walk_in_badge', 'Walk-in')} · ₹{tab.subtotal.toLocaleString('en-IN')}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
              {/* Left Side (Desktop: 3 columns, Mobile: 1 column full width) */}
              <div className="lg:col-span-3 space-y-3.5">
                {/* Sticky Search & Category Pills Bar */}
                <div className="pos-category-filter-bar bg-white dark:bg-slate-800 pb-3 space-y-3 border-b border-slate-100 dark:border-slate-700">
                  {/* Quick Search Bar + Category Filter Toggle */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
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
                    <button
                      type="button"
                      onClick={() => setShowCategoryFilters((v) => !v)}
                      className={`relative h-10 w-10 shrink-0 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                        showCategoryFilters
                          ? 'bg-blue-600 border-blue-600 text-white shadow-2xs'
                          : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'
                      }`}
                      title={t('toggle_category_filters_tooltip', 'Filter by category')}
                      aria-label="Toggle category filters"
                      aria-expanded={showCategoryFilters}
                    >
                      <Filter className="w-4 h-4" />
                      {selectedPosCategory !== 'all' && !showCategoryFilters && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-cyan-500 border-2 border-white dark:border-slate-800" />
                      )}
                    </button>
                  </div>

                  {/* Category Pills Bar - hidden by default, revealed via the Filter button above */}
                  {showCategoryFilters && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                      {posCategories.map((cat) => {
                        const isSelected = selectedPosCategory === cat.id;
                        return (
                          <button
                            key={cat.id}
                            onClick={() => setSelectedPosCategory(cat.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all cursor-pointer ${
                              isSelected
                                ? 'border border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 font-bold shadow-xs'
                                : 'bg-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 font-medium'
                            }`}
                          >
                            {cat.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
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
                  <div className="pos-cart-items-list space-y-1 max-h-[380px] overflow-y-auto pr-0.5 divide-y divide-slate-100 dark:divide-slate-700/60">
                    {cartItems.length > 0 ? (
                      cartItems.map((ci) => (
                        <div
                          key={ci.menuItem.id}
                          className="py-1 px-1.5 first:pt-0 flex items-center justify-between gap-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg transition-colors"
                        >
                          <div className="flex-1 pr-1 truncate min-w-0">
                            <h4 className="kitchen-management__caption font-semibold text-slate-900 dark:text-white text-xs truncate m-0 p-0 leading-tight">
                              {ci.menuItem.name} <span className="text-slate-400 dark:text-slate-500 font-normal">({`₹${ci.menuItem.price}`})</span>
                            </h4>
                          </div>

                          <div className="flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-900 p-0.5 border border-slate-200 dark:border-slate-700 shrink-0">
                            <button
                              onClick={() => handleUpdateCartQuantity(ci.menuItem.id, -1)}
                              className="btn-cart-qty-minus aspect-square w-6 h-6 rounded-xs shrink-0 bg-white dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-extrabold text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors cursor-pointer active:scale-90 border border-slate-200 dark:border-slate-700"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-5 text-center font-extrabold text-slate-900 dark:text-white text-xs">
                              {ci.quantity}
                            </span>
                            <button
                              onClick={() => handleUpdateCartQuantity(ci.menuItem.id, 1)}
                              className="btn-cart-qty-plus aspect-square w-6 h-6 rounded-xs shrink-0 bg-emerald-600 hover:bg-emerald-700 font-extrabold text-white flex items-center justify-center transition-colors cursor-pointer active:scale-90"
                            >
                              <Plus className="w-3 h-3" />
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
                    disabled={isOrderSubmitDisabled}
                    title={orderSubmitTitle}
                    className="btn-send-order-kitchen w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 disabled:text-slate-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs py-3.5 rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wider active:scale-[0.98] min-h-[42px]"
                  >
                    <span>{isSubmittingOrder ? t('sending_order_button', 'Sending...') : t('send_order_to_kitchen_button')}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* MOBILE ONLY Light-Theme Bottom Cart Drawer (lg:hidden, Collapsible & 50vh Expandable, Floats Above MobileBottomNav) */}
            {cartItems.length > 0 && (
              <div
                className={`fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-[55] lg:hidden bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-t-2xl shadow-[0_-8px_24px_-6px_rgba(0,0,0,0.15)] border-t border-slate-200 dark:border-slate-700 transition-all duration-300 flex flex-col ${
                  isCartDrawerExpanded ? 'h-[50vh]' : 'max-h-[260px]'
                }`}
              >
                {/* Right-Aligned White Pull-Tab Attached to Top Edge of Cart */}
                <button
                  onClick={() => setIsCartDrawerExpanded(!isCartDrawerExpanded)}
                  className="absolute top-0 right-4 -translate-y-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold px-4 py-1.5 rounded-t-xl border-t border-x border-b-0 border-slate-200 dark:border-slate-700 shadow-[0_-4px_6px_-2px_rgba(0,0,0,0.06)] flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95 z-20"
                  aria-label="Toggle Cart Drawer"
                >
                  {isCartDrawerExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-700 dark:text-slate-300 stroke-[2.5]" />
                  ) : (
                    <ChevronUp className="w-4 h-4 text-slate-700 dark:text-slate-300 stroke-[2.5]" />
                  )}
                </button>

                {/* Items List (Displays Last 3 items in Collapsed mode, All items in 50vh Expanded mode) */}
                <div className="pos-cart-items-list p-2.5 pt-3 flex-1 overflow-y-auto space-y-1.5">
                  {!isCartDrawerExpanded && cartItems.length > 3 && (
                    <p className="text-[10px] text-cyan-700 font-semibold tracking-wide uppercase text-center pb-1">
                      {t('showing_last_3_items_prefix')} {cartItems.length} {t('showing_last_3_items_suffix')}
                    </p>
                  )}
                  {visibleDrawerItems.map((ci) => (
                    <div
                      key={ci.menuItem.id}
                      className="bg-slate-50 dark:bg-slate-900/60 h-[35px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs text-slate-900 dark:text-slate-100"
                    >
                      <div className="flex-1 pr-1 truncate min-w-0">
                        <h4 className="kitchen-management__caption font-semibold text-slate-900 dark:text-white text-xs truncate m-0 p-0 leading-tight">
                          {ci.menuItem.name} <span className="text-slate-500 dark:text-slate-400 font-normal">({`₹${ci.menuItem.price}`})</span>
                        </h4>
                      </div>

                      <div className="flex items-center gap-1 rounded-md bg-white dark:bg-slate-800 p-0 border border-slate-200 dark:border-slate-700 shrink-0">
                        <button
                          onClick={() => handleUpdateCartQuantity(ci.menuItem.id, -1)}
                          className="btn-cart-qty-minus btn-compact-stepper w-9 h-6 rounded-xs shrink-0 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 font-extrabold text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors cursor-pointer active:scale-90 border border-slate-200 dark:border-slate-600"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center font-extrabold text-slate-900 dark:text-white text-xs">
                          {ci.quantity}
                        </span>
                        <button
                          onClick={() => handleUpdateCartQuantity(ci.menuItem.id, 1)}
                          className="btn-cart-qty-plus btn-compact-stepper w-9 h-6 rounded-xs shrink-0 bg-emerald-600 hover:bg-emerald-700 font-extrabold text-white flex items-center justify-center transition-colors cursor-pointer active:scale-90"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action Footer */}
                <div className="p-3 pb-3.5 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 shrink-0">
                  <button
                    onClick={handleOrderSubmit}
                    disabled={isOrderSubmitDisabled}
                    title={orderSubmitTitle}
                    className="btn-send-order-kitchen w-full bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs py-2.5 rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wider active:scale-[0.98] min-h-[42px]"
                  >
                    <span>{isSubmittingOrder ? t('sending_order_button', 'Sending...') : 'Send Order to Kitchen'}</span>
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

      {/* TAB: WALK-IN BILLS - open tabs (running total across every order
          placed against them) plus recently billed history. Billing a tab
          opens WalkInTabBillModal, the same itemized/GST/WhatsApp-share
          pattern a guest's checkout receipt already gets. */}
      {activeTab === 'walk_in_bills' && (
        <div className="space-y-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5 sm:p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" /> {t('open_walk_in_tabs_heading', 'Open Tabs')}
              </h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                {walkInTabs.filter((tab) => tab.status === 'open').length}
              </span>
            </div>

            {walkInTabsLoading ? (
              <p className="text-center py-8 text-slate-400 text-sm">{t('loading_text', 'Loading...')}</p>
            ) : walkInTabs.filter((tab) => tab.status === 'open').length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-xl">
                <Receipt className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm">{t('no_open_tabs_text', 'No open walk-in tabs')}</p>
                <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">{t('no_open_tabs_hint', 'Start one from Take Food Order in Walk-in / Counter mode.')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {walkInTabs.filter((tab) => tab.status === 'open').map((tab) => (
                  <div key={tab.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-slate-900 dark:text-white text-sm">{tab.label || t('walk_in_badge', 'Walk-in')}</h4>
                        <span className="text-[10px] text-slate-400">{formatDateTimeDDMMYYYY(tab.openedAt)}</span>
                      </div>
                      <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400 max-h-28 overflow-y-auto">
                        {tab.items.map((it, idx) => (
                          <div key={idx} className="flex justify-between">
                            <span>{it.quantity}x {it.name}</span>
                            <span>₹{it.lineTotal.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
                      <span className="font-bold text-slate-900 dark:text-white text-sm">₹{tab.subtotal.toLocaleString('en-IN')}</span>
                      <button
                        type="button"
                        onClick={() => setBillingTab(tab)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-1.5 rounded-lg cursor-pointer"
                      >
                        {t('bill_this_tab_heading', 'Bill This Tab')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {walkInTabHistory.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-700">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{t('recently_billed_heading', 'Recently Billed')}</h3>
              </div>
              <DataTable
                columns={[
                  { name: t('walk_in_badge', 'Walk-in'), selector: (row: WalkInTab) => row.label || '', sortable: true, cell: (row: WalkInTab) => <span className="font-semibold text-slate-800 dark:text-slate-200">{row.label || t('walk_in_badge', 'Walk-in')}</span> },
                  { name: t('served_time_column', 'Served At'), selector: (row: WalkInTab) => row.billedAt || '', sortable: true, cell: (row: WalkInTab) => <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{row.billedAt ? formatDateTimeDDMMYYYY(row.billedAt) : '-'}</span> },
                  { name: t('payment_method_label', 'Payment Method'), selector: (row: WalkInTab) => row.paymentMethod || '', sortable: true },
                  { name: t('grand_total_label', 'Grand Total'), selector: (row: WalkInTab) => row.grandTotal || 0, sortable: true, cell: (row: WalkInTab) => <span className="font-semibold text-emerald-700 dark:text-emerald-400">₹{(row.grandTotal ?? 0).toLocaleString('en-IN')}</span> },
                ]}
                data={walkInTabHistory}
                pagination
                paginationPerPage={5}
                paginationRowsPerPageOptions={[5, 10, 20]}
                highlightOnHover
                customStyles={{
                  headCells: { style: { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#94a3b8', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', paddingLeft: '12px' } },
                  cells: { style: { paddingLeft: '12px', fontSize: '12px' } },
                  rows: { style: { minHeight: '48px' } },
                }}
              />
            </div>
          )}
        </div>
      )}

      {billingTab && (
        <WalkInTabBillModal
          tab={billingTab}
          onClose={() => setBillingTab(null)}
          onBilled={() => {
            refreshWalkInTabs();
            refreshOrders();
            fetchWalkInTabHistoryFromDB().then((data) => setWalkInTabHistory(data.map(mapWalkInTabFromApi)));
          }}
          propertyName={propertyName}
          propertyGstin={propertyGstin}
          propertyUpiId={propertyUpiId}
        />
      )}

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
            
            <div className="flex-1 overflow-auto pr-2 custom-scrollbar space-y-4">
              {/* Mobile Card Stack View (md:hidden) */}
              <div className="md:hidden space-y-2.5">
                {smLogs.slice((smPage - 1) * 10, smPage * 10).map((row: any, idx: number) => (
                  <div key={row.id || idx} className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-800 pb-2">
                      <span className="font-mono text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        {row.date}
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 px-2 py-0.5 rounded-md border border-cyan-200 dark:border-cyan-800 text-[10px]">
                        {row.type || 'Staff Meal'}
                      </span>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Staff Members:</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{row.staff}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Food Consumed:</div>
                      <div className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                        {row.food}
                        {row.hasTag && (
                          <span className="w-3.5 h-3.5 inline-flex items-center justify-center bg-amber-200 rounded-sm text-[8px] text-amber-700 font-semibold border border-amber-300">G</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Mobile 10-Item Pagination Controls */}
                {smLogs.length > 10 && (
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      disabled={smPage === 1}
                      onClick={() => setSmPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                    >
                      Previous
                    </button>
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Page {smPage} of {Math.ceil(smLogs.length / 10)}
                    </span>
                    <button
                      type="button"
                      disabled={smPage >= Math.ceil(smLogs.length / 10)}
                      onClick={() => setSmPage((p) => Math.min(Math.ceil(smLogs.length / 10), p + 1))}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>

              {/* Desktop DataTable (hidden md:block) */}
              <div className="hidden md:block">
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
  readyAt: string | null;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

// Canonical, unambiguous LOCAL timestamp ("YYYY-MM-DD HH:MM:SS") used to
// stamp readyAt/servedAt (handleMarkDishReady/handleMarkDishServed).
// Deliberately not toISOString() - that's UTC, and IST is 5.5h ahead of it,
// so for the first ~5.5 hours of any local day toISOString() still reports
// the PREVIOUS calendar day. Pairing that wrong date with a local
// time-of-day string (found 17 Aug 2026) made readyAt look ~24h before
// servedAt no matter how fast an item actually was, showing as a bogus
// "1440 min" Serve Delay on nearly every fresh row.
const buildLocalTimestamp = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

// Parses every shape readyAt/servedAt has ever been stored in:
//  - canonical "YYYY-MM-DD HH:MM[:SS]" from buildLocalTimestamp above, which
//    also happens to be exactly what MySQL's served_at (set via NOW()) comes
//    back as from get_served_logs, so this one branch covers both.
//  - legacy "YYYY-MM-DD hh:mm AM/PM" (old readyAt) and "DD/MM/YY(YY) hh:mm
//    AM/PM" (old servedAt, via formatDateDDMMYYYY's 2-digit-year output -
//    the \d{4}-only year previously here is why a freshly-served dish
//    sorted as if served in the year 0, at the very bottom instead of top).
// Shared by the Serve Delay column and by sorting servedLogs.
const parseFlexibleTimestamp = (s: string): Date | null => {
  if (!s) return null;
  const to24Hour = (h: number, ampm?: string): number => {
    if (!ampm) return h;
    if (/PM/i.test(ampm) && h !== 12) return h + 12;
    if (/AM/i.test(ampm) && h === 12) return 0;
    return h;
  };
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (isoMatch) {
    const [, y, mo, d, h, mi, se, ap] = isoMatch;
    return new Date(Number(y), Number(mo) - 1, Number(d), to24Hour(Number(h), ap), Number(mi), Number(se || 0));
  }
  const ddmmMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (ddmmMatch) {
    const [, d, mo, yRaw, h, mi, ap] = ddmmMatch;
    const y = yRaw.length === 2 ? Number('20' + yRaw) : Number(yRaw);
    return new Date(y, Number(mo) - 1, Number(d), to24Hour(Number(h), ap), Number(mi));
  }
  return null;
};

const parseAndDiffMinutes = (readyAt: string, servedAt: string): string => {
  const readyDate = parseFlexibleTimestamp(readyAt);
  const servedDate = parseFlexibleTimestamp(servedAt);
  if (!readyDate || !servedDate) return '—';
  const diffMin = Math.round((servedDate.getTime() - readyDate.getTime()) / 60000);
  return diffMin >= 0 ? `${diffMin} min` : '—';
};

const CurrentGuestServedDishes: React.FC<{ servedLogs: ServedLogEntry[] }> = ({ servedLogs }) => {
  // Search filter state — must live inside the component so the Input
  // is controlled and actually narrows the table rows.
  const [filterText, setFilterText] = React.useState('');

  // Always most-recently-served first, full stop - not a "default" a column
  // click can override (found 17 Aug 2026: defaultSortFieldId={3} was a
  // 1-based column index that actually pointed at "Dish", not "Served At",
  // so the table wasn't even sorting by recency like it looked like it was
  // trying to). Sorted here rather than left to DataTable's own sort so the
  // order holds regardless of anything else the table does.
  const sortedLogs = React.useMemo(() => {
    return [...servedLogs].sort((a, b) => {
      const aTime = parseFlexibleTimestamp(a.servedAt)?.getTime() ?? 0;
      const bTime = parseFlexibleTimestamp(b.servedAt)?.getTime() ?? 0;
      return bTime - aTime;
    });
  }, [servedLogs]);

  // Apply search filter across ticket id, dish name, guest name, room, and
  // served-by columns. Filters after sort so recency order is always preserved.
  const filteredLogs = React.useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return sortedLogs;
    return sortedLogs.filter((row) =>
      (row.orderId || '').toLowerCase().includes(q) ||
      (row.itemName || '').toLowerCase().includes(q) ||
      (row.guestName || '').toLowerCase().includes(q) ||
      (row.roomNumber || '').toLowerCase().includes(q) ||
      (row.servedBy || '').toLowerCase().includes(q)
    );
  }, [sortedLogs, filterText]);

  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 10;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [filterText]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedMobileLogs = React.useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, currentPage]);

  // Early-return AFTER all hooks so React rules-of-hooks is satisfied.
  if (servedLogs.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-xs p-4 space-y-3.5">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-500 shrink-0" />
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm tracking-wide">
              {t('current_guest_served_dishes_heading')}
            </h3>
            <span className="text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 shrink-0">
              {servedLogs.length} {t('total_suffix')}
            </span>
          </div>
        </div>

        <Input
          type="text"
          placeholder={t('search_served_dishes_placeholder')}
          className="w-full"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />

        {/* Mobile Card Stack View (md:hidden) */}
        <div className="md:hidden space-y-2.5">
          {paginatedMobileLogs.map((row, idx) => {
            const diff = parseAndDiffMinutes(row.readyAt || '', row.servedAt || '');
            return (
              <div
                key={row.id || idx}
                className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-2 text-xs"
              >
                {/* Header: Ticket + Dish + Qty + Delay */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-slate-900 dark:text-white text-xs">#{row.orderId}</span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-400 text-xs">
                        {row.quantity}x {row.itemName}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{row.guestName || 'Walk-in Resident'}</span>
                      {row.roomNumber && <span className="text-slate-500 dark:text-slate-400">({row.roomNumber})</span>}
                    </div>
                  </div>
                  {diff ? (
                    <span className="font-mono text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 shrink-0 inline-flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-600" />
                      <span>{diff}</span>
                    </span>
                  ) : null}
                </div>

                {/* Footer: Timestamps & Served By */}
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-x-2 font-mono text-[10px]">
                    {row.readyAt ? (
                      <span>Ready: <strong className="text-slate-700 dark:text-slate-300">{formatDateTimeDDMMYYYY(row.readyAt)}</strong></span>
                    ) : null}
                    <span>Served: <strong className="text-slate-700 dark:text-slate-300">{formatDateTimeDDMMYYYY(row.servedAt)}</strong></span>
                  </div>
                  <div>
                    By <span className="font-semibold text-slate-800 dark:text-slate-200">{row.servedBy}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700 text-xs">
              <Button
                variant="secondary"
                size="xs"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
                className="cursor-pointer"
              >
                Previous
              </Button>
              <span className="font-semibold text-slate-600 dark:text-slate-400 text-[11px]">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="xs"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
                className="cursor-pointer"
              >
                Next
              </Button>
            </div>
          )}
        </div>

        {/* Desktop DataTable (hidden md:block) */}
        <div className="hidden md:block overflow-hidden">
          <DataTable
            columns={[
              { name: 'ID', selector: (row: ServedLogEntry) => row.id, omit: true },
              { name: t('ticket_column'), selector: (row: ServedLogEntry) => row.orderId, width: '80px', cell: (row: ServedLogEntry) => <span className="font-mono font-semibold text-slate-900 dark:text-white">#{row.orderId}</span> },
              { name: t('dish_column'), selector: (row: ServedLogEntry) => row.itemName, grow: 2, cell: (row: ServedLogEntry) => <span className="font-semibold text-emerald-700 dark:text-emerald-400">{row.itemName}</span> },
              { name: t('qty_column'), selector: (row: ServedLogEntry) => row.quantity, width: '60px', center: true },
              { name: t('guest_column'), selector: (row: ServedLogEntry) => row.guestName, cell: (row: ServedLogEntry) => <span className="font-semibold text-slate-800 dark:text-slate-200">{row.guestName || '-'}</span> },
              { name: t('room_column'), selector: (row: ServedLogEntry) => row.roomNumber, width: '70px', cell: (row: ServedLogEntry) => <span className="text-slate-600 dark:text-slate-400">{row.roomNumber || '-'}</span> },
              { name: t('served_by_column'), selector: (row: ServedLogEntry) => row.servedBy, cell: (row: ServedLogEntry) => <span className="text-slate-600 dark:text-slate-400">{row.servedBy}</span> },
              {
                name: t('serve_time_column', 'Serve Delay'),
                selector: (row: ServedLogEntry) => row.readyAt,
                width: '100px',
                cell: (row: ServedLogEntry) => {
                  const diff = parseAndDiffMinutes(row.readyAt || '', row.servedAt || '');
                  return <span className="font-mono text-[11px] font-semibold text-amber-600 dark:text-amber-500 whitespace-nowrap">{diff}</span>;
                }
              },
              { name: t('ready_time_column', 'Ready At'), selector: (row: ServedLogEntry) => row.readyAt || '', width: '140px', cell: (row: ServedLogEntry) => <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.readyAt ? formatDateTimeDDMMYYYY(row.readyAt) : '-'}</span> },
              { name: t('served_time_column', 'Served At'), selector: (row: ServedLogEntry) => row.servedAt, width: '140px', cell: (row: ServedLogEntry) => <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDateTimeDDMMYYYY(row.servedAt)}</span> },
            ]}
            data={filteredLogs}
            pagination
            paginationPerPage={10}
            paginationRowsPerPageOptions={[10, 15, 25, 50, 100]}
            highlightOnHover
            customStyles={{
              headCells: { style: { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#94a3b8', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', paddingLeft: '12px' } },
              cells: { style: { paddingTop: '10px', paddingBottom: '10px', paddingLeft: '12px' } },
            }}
          />
        </div>
      </div>
    </div>
  );
};

