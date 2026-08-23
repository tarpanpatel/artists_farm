import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Drawer, Tabs, TabItem, type TabsRef, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from 'flowbite-react';
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
  ChevronLeft,
  ChevronRight,
  Loader2,
  User,
  Filter,
  LayoutGrid,
  List
} from './icons/FlowbiteIcons';
import { Guest, Order, OrderItem, MenuItem, Requisition, InventoryItem, WalkInTab } from '../types';
import { GUEST_STATUS_CHECKED_IN, GUEST_STATUS_ACTIVE_LEGACY } from '../constants/guestStatus';
import { recordTelescopeLog } from '../utils/telescopeLogger';
import { resolveTelegramTemplate, fetchServedLogsFromDB, addServedLogToDB, fetchMaterialCategoriesFromDB, fetchRecipesFromDB, saveRecipeToDB, deleteRecipeFromDB, depleteStockForDish, getPropertySlug, updateOrderItemStatus, updateOrderStatusDB, updateItemReminderTimestamp, checkStaleReminders, StaleReminderItem, fetchTelegramConfigDB, fetchStaffMealOptionsFromDB, addStaffMealOptionToDB, fetchStaffMealLogsFromDB, addStaffMealLogToDB, addOrderToDB, fetchWalkInTabsFromDB, openWalkInTabDB } from '../services/api';
import { StyledSelect } from './StyledSelect';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import { WalkInTabBillModal } from './WalkInTabBillModal';
import { TablePagination } from './TablePagination';
import { attachedTabsTheme, attachedTabsClearTheme } from '../utils/tabsTheme';

import { useKitchenContext } from '../contexts/KitchenContext';
import { useInventoryContext } from '../contexts/InventoryContext';
import { useAuth } from '../contexts/AuthContext';
import { useStaff } from '../contexts/StaffContext';
import { Input } from './Input';
import { Button } from './Button';
import { Tooltip } from './Tooltip';
import { t } from '../i18n/en';
import { formatDateTimeDDMMYYYY, toDatetimeLocalValue } from '../utils/dateUtils';
import { TextInput as FlowbiteTextInput } from 'flowbite-react';

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
  propertyUpiQrCodeUrl?: string;
  // How many numbered tables the walk-in "Add New" picker offers (Table 1..N)
  // - per-property (properties.walk_in_table_count, self-heals, defaults 10
  // both in the DB and here) rather than a hardcoded 1-10 range, since a
  // tenant with e.g. 20 tables would otherwise have no way to name half of
  // them (found 20 Aug 2026).
  propertyWalkInTableCount?: number;
}

// Sentinel dropdown value for the "New Customer" row in the walk-in tab
// picker (20 Aug 2026) - distinct from any real tab id (which are numbers
// serialized as strings), so it can never collide with a DB-assigned tab.
const NEW_WALKIN_CUSTOMER_VALUE = '__new_customer__';

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
  propertyUpiQrCodeUrl = '',
  propertyWalkInTableCount = 10,
}) => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { orders, addOrder, refreshOrders, updateOrderStatus, pendingOrdersCount } = useKitchenContext();
  const { inventory, requisitions } = useInventoryContext();
  const { currentUser, isAuthenticated } = useAuth();
  const getInitialTab = (): 'kds' | 'new_order' | 'menu_catalog' | 'requisitions' | 'staff_meals' | 'beta_recipe_builder' => {
    const key = activeMenuItemKey || (typeof window !== 'undefined' ? window.location.hash.replace('#', '').trim() : '');
    if (key === 'take_food_order') return 'new_order';
    if (key === 'staff_meals') return 'staff_meals';
    if (key === 'edit_food_menu') return 'menu_catalog';
    if (key === 'beta_recipe_builder') return 'beta_recipe_builder';
    if (key === 'kitchen_orders' || key === 'live_orders' || key === 'live_kitchen_orders' || key === 'live_tickets') return 'kds';
    return 'kds';
  };

  const [activeTab, setActiveTab] = useState<'kds' | 'new_order' | 'menu_catalog' | 'requisitions' | 'staff_meals' | 'beta_recipe_builder'>(getInitialTab);
  const tabsRef = useRef<TabsRef>(null);

  useEffect(() => {
    if (!activeMenuItemKey) return;
    if (activeMenuItemKey === 'take_food_order') setActiveTab('new_order');
    else if (activeMenuItemKey === 'kitchen_orders' || activeMenuItemKey === 'live_orders' || activeMenuItemKey === 'live_kitchen_orders' || activeMenuItemKey === 'live_tickets') setActiveTab('kds');
    else if (activeMenuItemKey === 'staff_meals') setActiveTab('staff_meals');
    else if (activeMenuItemKey === 'edit_food_menu') setActiveTab('menu_catalog');
    else if (activeMenuItemKey === 'beta_recipe_builder') setActiveTab('beta_recipe_builder');
  }, [activeMenuItemKey]);

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '').trim();
      if (hash === 'take_food_order') setActiveTab('new_order');
      else if (hash === 'kitchen_orders' || hash === 'live_orders' || hash === 'live_kitchen_orders' || hash === 'live_tickets') setActiveTab('kds');
      else if (hash === 'staff_meals') setActiveTab('staff_meals');
      else if (hash === 'edit_food_menu') setActiveTab('menu_catalog');
      else if (hash === 'beta_recipe_builder') setActiveTab('beta_recipe_builder');
    };

    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  useEffect(() => {
    const tabOrder: ('kds' | 'new_order')[] = ['kds', 'new_order'];
    const index = tabOrder.indexOf(activeTab as any);
    if (index >= 0) {
      tabsRef.current?.setActiveTab(index);
    }
  }, [activeTab]);

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

  // Walk-in tabs - open tabs (with their live running total) power the
  // walk-in table picker + "Bill This Table" in Take Order (the standalone
  // Walk-ins tab/board this used to also feed was removed 20 Aug 2026, once
  // that same picker + billing became reachable directly from Take Order).
  // Loaded up front (not lazily) since New Order needs the list too.
  const [walkInTabs, setWalkInTabs] = useState<WalkInTab[]>([]);
  const refreshWalkInTabs = async () => {
    const data = await fetchWalkInTabsFromDB();
    setWalkInTabs(data.map(mapWalkInTabFromApi));
  };
  useEffect(() => { refreshWalkInTabs(); }, []);

  const [billingTab, setBillingTab] = useState<WalkInTab | null>(null);

  const [servedLogs, setServedLogs] = useState<Array<{ id: string; orderId: string; itemName: string; quantity: number; servedBy: string; guestName: string; roomNumber: string; servedAt: string; readyAt: string | null }>>([]);

  // Load served logs from DB on mount
  useEffect(() => {
    fetchServedLogsFromDB().then((logs) => {
      if (Array.isArray(logs)) setServedLogs(logs);
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
      // #live_tickets (not bare #kitchen, which lands on Take Order) - these
      // reminders are about an order already sitting in the queue, so the
      // link should open straight to the tab that shows it (20 Aug 2026).
      const appUrl = `${window.location.origin}${window.location.pathname}#live_tickets`;
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
      // #live_tickets (not bare #kitchen, which lands on Take Order) - these
      // reminders are about an order already sitting in the queue, so the
      // link should open straight to the tab that shows it (20 Aug 2026).
      const appUrl = `${window.location.origin}${window.location.pathname}#live_tickets`;
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
    // #live_tickets (not bare #kitchen, which lands on Take Order) - see the
    // matching manual-reminder comment above.
    const appUrl = `${window.location.origin}${window.location.pathname}#live_tickets`;
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
    // #live_tickets (not bare #kitchen, which lands on Take Order) - see the
    // matching manual-reminder comment above.
    const appUrl = `${window.location.origin}${window.location.pathname}#live_tickets`;
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

  // Staff Meals State
  // Native <input type="datetime-local"> value format ("YYYY-MM-DDTHH:mm"),
  // NOT this app's usual DD/MM/YYYY display format - the field's own JSX
  // (below) renders as a raw datetime-local input, and feeding it a
  // DD/MM/YYYY string makes the browser reject it silently, showing a blank
  // picker instead of defaulting to "now" (found + fixed 21 Aug 2026 -
  // see toDatetimeLocalValue()'s doc comment in utils/dateUtils.ts).
  const [smDateRecord, setSmDateRecord] = useState<string>(() => toDatetimeLocalValue(new Date()));
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
  const [smDesktopPage, setSmDesktopPage] = useState(1);
  const SM_DESKTOP_PAGE_SIZE = 10;
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

    // Use the user-editable Date & Time of Record field, not always "now" -
    // it used to be collected via setSmDateRecord but never actually read
    // here, so picking a backdated/custom timestamp in the field silently
    // had no effect on the logged record (found + fixed 21 Aug 2026,
    // alongside the field defaulting to a blank picker - see
    // toDatetimeLocalValue()'s doc comment in utils/dateUtils.ts). Falls
    // back to "now" if the field is empty or was left unparseable.
    const parsedRecordDate = smDateRecord ? new Date(smDateRecord) : null;
    const now = parsedRecordDate && !isNaN(parsedRecordDate.getTime()) ? parsedRecordDate : new Date();
    // Build the display string directly in DD/MM/YYYY, matching
    // fetchStaffMealLogsFromDB()'s format exactly (api.ts) - the previous
    // "19 Aug, 09:15 AM" (no year) intermediate string, round-tripped through
    // formatDateTimeDDMMYYYY(), relied on new Date() re-parsing a yearless
    // string, which browsers resolve inconsistently (observed defaulting to
    // year 2001, and dropping the time entirely - found 21 Aug 2026 while
    // testing a backdated entry). This optimistic entry gets replaced by the
    // real DB-fetched one on next reload regardless, but until then it's
    // what the user sees immediately after clicking "Log Staff Meal", so it
    // needs to be right, not just self-correcting later.
    const formattedDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}, ${now.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'})}`;

    const foodStr = smCustomMeal ? `${smQuantity}x ${smCustomMeal}` : `${smQuantity}x ${smConsumptionType}`;

    const isLeftover = smConsumptionType === 'Leftover Buffer items';
    const newLog = {
      date: formattedDate,
      staff: smSelectedStaff.join(', '),
      food: foodStr,
      hasTag: isLeftover
    };

    setSmLogs(prev => [newLog, ...prev]);
    addStaffMealLogToDB(smSelectedStaff.join(', '), foodStr, isLeftover, smDateRecord);

    // Reset Form
    setSmSelectedStaff([]);
    setSmQuantity(1);
    setSmCustomMeal('');
    setSmEstCost('');
    setSmDateRecord(toDatetimeLocalValue(new Date()));
  };

  const handleSmToggleStaff = (staff: string) => {
    setSmSelectedStaff(prev => 
      prev.includes(staff) ? prev.filter(s => s !== staff) : [...prev, staff]
    );
  };

  // â"ۉ"ۉ"€ Beta Recipe Builder State (DB-backed) â"ۉ"ۉ"€

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
  const [recipeIngredientsDesktopPage, setRecipeIngredientsDesktopPage] = useState(1);
  const RECIPE_INGREDIENTS_PAGE_SIZE = 10;

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
  // Which in-house guest "Take Order" targets - picked via the guest badge
  // dropdown further down (see the StyledSelect in the Target Guest Info
  // Badge block). Resolved rather than stored directly so a guest who
  // checks out mid-session (or a fresh mount with nothing picked yet)
  // automatically falls back to the first still-checked-in guest instead
  // of silently targeting a stale/gone one - manuallyPickedGuestId only
  // wins while it's still actually valid (found 20 Aug 2026: previously
  // there was no picker at all, this always targeted checkedInGuests[0]
  // with no way to order for any other room).
  const [manuallyPickedGuestId, setManuallyPickedGuestId] = useState<string>('');
  const selectedGuestId = checkedInGuests.some((g) => g.id === manuallyPickedGuestId)
    ? manuallyPickedGuestId
    : (checkedInGuests[0]?.id || '');
  // Walk-in mode - food prepared for someone not staying in a room (a diner at
  // the restaurant, a local walk-in). No guest/room to attach the order to;
  // instead it joins a running tab (null = start a new one) that bills as one
  // consolidated bill once, from the Walk-in Bills tab, however many orders
  // it accumulates in the meantime.
  const [orderMode, setOrderMode] = useState<'guest' | 'walkin'>('guest');
  // Each in-house guest keeps their own in-progress cart (keyed by guest id,
  // walk-in orders share one cart under a fixed key) so staff can start
  // building Room 101's order, switch to Room 103 for a second order, and
  // come back to Room 101 later without losing what was already added
  // (found 20 Aug 2026, alongside the guest picker above - a single shared
  // cart made that impossible once there was a way to target more than one
  // guest at all).
  const cartKey = orderMode === 'guest' ? `guest_${selectedGuestId || 'none'}` : 'walkin';
  const [cartsByKey, setCartsByKey] = useState<Record<string, { menuItem: MenuItem; quantity: number }[]>>(() => {
    try {
      const stored = localStorage.getItem('kitchen_carts_by_key');
      if (stored) return JSON.parse(stored);
      // One-time migration from the old single-cart shape so an
      // in-progress order isn't lost when this ships.
      const legacy = localStorage.getItem('kitchen_cart_items');
      if (legacy) {
        const legacyItems = JSON.parse(legacy);
        if (Array.isArray(legacyItems) && legacyItems.length > 0) return { walkin: legacyItems };
      }
      return {};
    } catch { return {}; }
  });
  const cartItems = cartsByKey[cartKey] || [];
  const setCartItems = (
    updater: { menuItem: MenuItem; quantity: number }[] | ((prev: { menuItem: MenuItem; quantity: number }[]) => { menuItem: MenuItem; quantity: number }[])
  ) => {
    setCartsByKey((prev) => {
      const prevCart = prev[cartKey] || [];
      const nextCart = typeof updater === 'function' ? (updater as (p: typeof prevCart) => typeof prevCart)(prevCart) : updater;
      return { ...prev, [cartKey]: nextCart };
    });
  };
  const [posSearch, setPosSearch] = useState('');
  const [selectedPosCategory, setSelectedPosCategory] = useState<string>('all');
  const [showCategoryFilters, setShowCategoryFilters] = useState(false);
  const [posLayoutMode, setPosLayoutMode] = useState<'thumbnail' | 'list'>('list');
  const [recentlyAddedId, setRecentlyAddedId] = useState<number | null>(null);
  const [isCartDrawerExpanded, setIsCartDrawerExpanded] = useState<boolean>(false);
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);
  const [selectedWalkInTabId, setSelectedWalkInTabId] = useState<number | null>(null);
  const [newTabLabel, setNewTabLabel] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  // "Start Order" (20 Aug 2026): opening the walk-in tab used to be deferred
  // until the whole order was sent to the kitchen (see targetTabId in
  // handleOrderSubmit below), so a named customer never showed up as a
  // pill alongside the other open tabs until after their first order was
  // fully placed. Now it opens the tab the moment the name is confirmed,
  // so it appears immediately next to "Walk-in · ₹..." while the guest is
  // still building their cart.
  const [isStartingNewTab, setIsStartingNewTab] = useState(false);
  // "+ Add New" popup (20 Aug 2026, replaced an earlier inline text-field
  // version): the walk-in picker is now a closed dropdown of existing tabs,
  // so there's no free-text box left on the page itself to type a brand-new
  // name into - this small modal is that name entry, reusing the same
  // newTabLabel state and handleStartWalkInOrder create-tab logic below.
  const [isAddNewWalkInOpen, setIsAddNewWalkInOpen] = useState(false);
  const handleStartWalkInOrder = async () => {
    const trimmedLabel = newTabLabel.trim();
    if (!trimmedLabel || isStartingNewTab) return;
    // newTabLabel holds the raw picked table number ("5") from the dropdown
    // below, not display text - the "Table N" label only gets composed here,
    // right before it's actually saved.
    const tabLabel = `Table ${trimmedLabel}`;
    setIsStartingNewTab(true);
    const newTabId = await openWalkInTabDB(tabLabel);
    setIsStartingNewTab(false);
    if (newTabId == null) {
      showToast(t('tab_open_failed_toast', 'Could not start a new tab. Please try again.'), { type: 'error' });
      return;
    }
    await refreshWalkInTabs();
    setSelectedWalkInTabId(newTabId);
    setNewTabLabel('');
    setIsAddNewWalkInOpen(false);
  };

  useEffect(() => {
    const container = document.querySelector('.take-food-order-container');
    if (!container) return;
    const onScroll = () => setShowScrollTop(container.scrollTop > 600);
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [activeTab]);

  useEffect(() => { localStorage.setItem('kitchen_carts_by_key', JSON.stringify(cartsByKey)); }, [cartsByKey]);

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
  const [reqDesktopPage, setReqDesktopPage] = useState(1);
  const REQ_DESKTOP_PAGE_SIZE = 15;

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
        // Defensive fallback path (the "+ Add New" popup normally opens and
        // selects the tab before this ever runs) - keep it consistent with
        // that flow so a tab opened this way also stays selected afterward.
        setSelectedWalkInTabId(targetTabId);
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
    // Deliberately NOT resetting selectedWalkInTabId here (20 Aug 2026) - a
    // walk-in table usually gets more than one order sent to it over the
    // course of a sitting, so staff should stay on the same table after
    // "Send Order to Kitchen" instead of getting bounced back to "New
    // Customer" and having to re-pick it for the next round.
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
    // pt-3: this screen has no PageHeader (goes straight to the tab strip),
    // so without its own top spacing the tabs sat flush against the navbar
    // below the header bar with zero gap (found 21 Aug 2026).
    <div className="pt-3">
      {/* Attached Tabs (DESIGN.md's "Attached Tabs Specification", 20 Aug
          2026 - this file is one of that spec's own named examples): the
          tab strip sits directly on top of the content card below with zero
          gap, rather than each TabItem carrying its content as a flowbite
          tabpanel (whose default py-3 gap and all-4-corners rounded-lg
          would show a visible seam under the tab row instead of a flush
          "opens into" edge). Both TabItems are deliberately childless - the
          real content renders as a sibling below, switched on the same
          activeTab state - see utils/tabsTheme.ts's attachedTabsTheme for
          the active/inactive border+fill mechanism itself. */}
      {(activeTab === 'new_order' || activeTab === 'kds') && (
        <div className="kitchen-management__desk">
        <Tabs
          ref={tabsRef}
          aria-label="Kitchen Management Tabs"
          variant="default"
          theme={attachedTabsTheme}
          clearTheme={attachedTabsClearTheme}
          onActiveTabChange={(tabIndex: number) => {
            const tabs: ('kds' | 'new_order')[] = ['kds', 'new_order'];
            if (tabs[tabIndex]) {
              setActiveTab(tabs[tabIndex]);
              if (typeof window !== 'undefined') {
                if (tabs[tabIndex] === 'new_order') window.location.hash = '#take_food_order';
                else if (tabs[tabIndex] === 'kds') window.location.hash = '#kitchen_orders';
              }
            }
          }}
        >
          <TabItem
            active={activeTab === 'kds'}
            title={`${t('live_active_orders_label', 'Live Tickets')}${pendingOrdersCount > 0 ? ` (${pendingOrdersCount})` : ''}`}
          />
          <TabItem
            active={activeTab === 'new_order'}
            title={t('create_resident_order_button', 'Take Order')}
          />
        </Tabs>

        {activeTab === 'kds' && (() => {
              const activeOrders = orders.filter((o) => o.status === 'Pending' || o.status === 'Preparing');

              return (
        <div className="kds-orders-container space-y-4 bg-white dark:bg-slate-800 rounded-lg rounded-t-none -mt-px border border-t-0 border-slate-200 dark:border-slate-700 p-3.5 sm:p-4">
          <div className="kds-status-filter-bar flex flex-col sm:flex-row items-start sm:items-center justify-end text-xs gap-3">
            {/* Smart Polling / Live Sync Bar */}
            <div className="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg w-full sm:w-auto justify-between sm:justify-start">
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
                  className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 active:scale-98 text-xs font-semibold rounded-lg shadow-md transition-colors cursor-pointer flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50"
                  title={t('check_for_updates_tooltip')}
                >
                  <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
                  <span>{t('sync_button')}</span>
                </button>
              </div>
            </div>
          </div>

          {activeOrders.length === 0 ? (
            <div className="text-center py-12 px-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md">
              <div className="w-14 h-14 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3 border border-emerald-200 dark:border-emerald-800/60">
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
                className={`kds-ticket-card bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md p-3.5 flex flex-col justify-between transition-all duration-500 ${urgencyBorder} ${
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
                              <span className="text-xs font-semibold px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 shrink-0 select-none">
                                <Check className="w-3.5 h-3.5 shrink-0" />
                                <span>{t('served_badge', 'Served')}</span>
                              </span>
                            ) : isReady ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSendPickupReminder(ord, idx, item)}
                                  className="px-2.5 py-2 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700 active:scale-98 text-xs font-semibold rounded-lg transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer shrink-0"
                                  title={t('send_pickup_reminder_tooltip')}
                                >
                                  <Bell className="w-3.5 h-3.5 shrink-0" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMarkDishServed(ord, idx, item)}
                                  className="px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 active:scale-98 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 text-xs font-semibold rounded-lg transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
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
                                  className="px-2.5 py-2 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700 active:scale-98 text-xs font-semibold rounded-lg transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer shrink-0"
                                  title={t('send_reminder_tooltip')}
                                >
                                  <Bell className="w-3.5 h-3.5 shrink-0" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMarkDishReady(ord, idx, item)}
                                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-semibold rounded-lg transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
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

          {/* Current Guest Served Dishes - Table */}
          <CurrentGuestServedDishes servedLogs={servedLogs} />
        </div>
        );
      })()}

        {activeTab === 'new_order' && (() => {
        // Was `checkedInGuests[0] || checkedInGuests.find(...)` - the OR
        // meant selectedGuestId was never actually consulted (checkedInGuests[0]
        // is truthy whenever any guest is checked in), always resolving to
        // the first guest regardless of what was picked (found 20 Aug 2026).
        const selectedGuest = checkedInGuests.find((g) => g.id === selectedGuestId);
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
              className="pos-food-card bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md p-2.5 flex flex-col justify-between gap-2 transition-all"
            >
              <div className="space-y-1.5">
                <div className="relative w-full h-20 sm:h-16 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 overflow-hidden flex items-center justify-center text-gray-400 dark:text-gray-500">
                  {item.imagePath ? (
                    <img
                      src={item.imagePath}
                      alt={item.name}
                      className="w-full h-full object-cover rounded-lg"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                  ) : (
                    <UtensilsCrossed className="w-5 h-5 text-gray-300 dark:text-gray-500" />
                  )}
                </div>

                <div className="flex items-center justify-between gap-1 leading-tight">
                  <h4 className="font-semibold text-gray-900 dark:text-white text-xs sm:text-[11px] truncate flex-1 m-0 p-0">
                    {item.name}
                  </h4>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs sm:text-[11px] shrink-0">
                    ₹{item.price}
                  </span>
                </div>
              </div>

              {/* Flowbite Touch Stepper - Symmetrical Buttons */}
              <div className="pt-1 border-t border-gray-100 dark:border-gray-700/60">
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/60 rounded-lg p-0.5 w-full border border-gray-200 dark:border-gray-600">
                  <Tooltip content="Decrease quantity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (inCartQty > 0) {
                          handleUpdateCartQuantity(item.id, -1);
                        }
                      }}
                      disabled={inCartQty === 0}
                      className={`w-7 h-7 rounded-md shrink-0 flex items-center justify-center transition-all ${
                        inCartQty === 0
                          ? 'bg-transparent text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-40'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-90 cursor-pointer shadow-xs'
                      }`}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  </Tooltip>
                  <span className={`font-bold text-xs px-1 ${
                    inCartQty > 0
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {inCartQty}
                  </span>
                  <Tooltip content="Increase quantity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToCartWithFeedback(item);
                      }}
                      className={`w-7 h-7 rounded-md shrink-0 flex items-center justify-center active:scale-90 transition-all cursor-pointer shadow-xs ${
                        isRecentlyAdded
                          ? 'bg-blue-600 text-white scale-95 animate-pulse'
                          : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </Tooltip>
                </div>
              </div>
            </div>
          );
        };

        const renderFoodRow = (item: MenuItem) => {
          const isRecentlyAdded = recentlyAddedId === item.id;
          const existingCartItem = cartItems.find((i) => i.menuItem.id === item.id);
          const inCartQty = existingCartItem ? existingCartItem.quantity : 0;

          return (
            <div
              key={item.id}
              className="pos-food-row bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-2.5 flex items-center justify-between gap-3 hover:border-blue-500 transition-all shadow-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 overflow-hidden flex items-center justify-center shrink-0">
                  {item.imagePath ? (
                    <img
                      src={item.imagePath}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                  ) : (
                    <UtensilsCrossed className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-gray-900 dark:text-white text-xs truncate m-0">
                    {item.name}
                  </h4>
                  <span className="text-2xs text-gray-400 dark:text-gray-500 block truncate">
                    {item.category || 'General'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                  ₹{item.price}
                </span>

                {/* Symmetrical Flowbite Stepper */}
                <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-700/60 rounded-lg p-0.5 border border-gray-200 dark:border-gray-600">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (inCartQty > 0) handleUpdateCartQuantity(item.id, -1);
                    }}
                    disabled={inCartQty === 0}
                    className={`btn-compact-stepper w-7 h-7 rounded-md shrink-0 flex items-center justify-center transition-all ${
                      inCartQty === 0
                        ? 'bg-transparent text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-40'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-90 cursor-pointer shadow-xs'
                    }`}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className={`font-bold text-xs w-6 text-center ${
                    inCartQty > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {inCartQty}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddToCartWithFeedback(item);
                    }}
                    className={`btn-compact-stepper w-7 h-7 rounded-md shrink-0 text-white flex items-center justify-center active:scale-90 transition-all cursor-pointer shadow-xs ${
                      isRecentlyAdded
                        ? 'bg-blue-600 scale-95 animate-pulse'
                        : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                    }`}
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
          <div className="take-food-order-container space-y-4 pb-48 lg:pb-0 bg-white dark:bg-gray-800 rounded-lg rounded-t-none -mt-px border border-t-0 border-gray-200 dark:border-gray-700 p-3.5 sm:p-4">

            {/* Order Mode: Guest vs Walk-in Segmented Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 px-0.5">
              <div className="flex items-center gap-2 shrink-0">
                <div className="inline-flex items-center bg-gray-100 dark:bg-gray-700 p-1 rounded-lg shrink-0">
                  <button
                    type="button"
                    onClick={() => setOrderMode('guest')}
                    className={`px-3 py-1.5 rounded-md text-xs transition-all cursor-pointer ${
                      orderMode === 'guest'
                        ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 font-bold shadow-md'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium'
                    }`}
                  >
                    {t('order_mode_guest_button', 'In-House Guest')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderMode('walkin')}
                    className={`px-3 py-1.5 rounded-md text-xs transition-all cursor-pointer ${
                      orderMode === 'walkin'
                        ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 font-bold shadow-md'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium'
                    }`}
                  >
                    {t('order_mode_walkin_button', 'Walk-in Guest')}
                  </button>
                </div>
              </div>

              {/* Target Guest Picker - tap to pick which checked-in guest's
                  room this order bills to, instead of always targeting
                  whichever guest happened to be first (found 20 Aug 2026).
                  Each guest keeps its own in-progress cart (see cartKey
                  above), so switching here mid-order doesn't lose what was
                  already added for the previous guest. */}
              {orderMode === 'guest' && (
                <div className="flex items-center gap-2 text-xs">
                  {checkedInGuests.length > 0 ? (
                    <StyledSelect
                      value={selectedGuestId}
                      onChange={(val) => setManuallyPickedGuestId(val)}
                      searchable
                      options={checkedInGuests.map((g) => ({
                        value: g.id,
                        label: `${g.guestName}${g.roomNumber ? ` (${g.roomNumber})` : ''}`,
                        searchText: `${g.guestName} ${g.roomNumber || ''}`,
                      }))}
                      buttonClassName="!h-8 !px-3 !py-1.5 !rounded-lg !bg-blue-50 dark:!bg-blue-900/30 !text-blue-700 dark:!text-blue-300 !font-semibold !border-blue-200 dark:!border-blue-800 !text-xs"
                      className="min-w-[190px]"
                    />
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400 text-xs">
                      {t('no_active_resident_tooltip', 'No active resident selected')}
                    </span>
                  )}
                </div>
              )}

              {/* Walk-in Tab Picker - dropdown of open tabs (newest first) plus
                  a "New Customer" row, with a button beside it whose label/
                  action follows whatever's currently selected (20 Aug 2026,
                  replaced the old free-text field + pill-row layout). */}
              {orderMode === 'walkin' && (() => {
                const sortedOpenTabs = [...openTabs].sort((a, b) => b.id - a.id);
                const walkInDropdownOptions = [
                  { value: NEW_WALKIN_CUSTOMER_VALUE, label: t('new_customer_button', 'New Customer') },
                  ...(sortedOpenTabs.length > 0
                    ? sortedOpenTabs.map((tab) => ({
                        value: String(tab.id),
                        label: `${tab.label || t('walk_in_badge', 'Walk-in')} · ₹${tab.subtotal.toLocaleString('en-IN')}`,
                      }))
                    : [{ value: '__no_active_tables__', label: t('no_active_tables_option', 'No active tables'), disabled: true }]),
                ];
                const selectedTabForBilling = selectedWalkInTabId != null
                  ? walkInTabs.find((tab) => tab.id === selectedWalkInTabId)
                  : null;

                return (
                  <div className="w-full pt-2.5 mt-0.5 border-t border-gray-100 dark:border-gray-700/80">
                    <div className="flex items-center gap-2 w-full">
                      <div className="flex-1 min-w-0">
                        <StyledSelect
                          value={selectedWalkInTabId === null ? NEW_WALKIN_CUSTOMER_VALUE : String(selectedWalkInTabId)}
                          onChange={(val) => setSelectedWalkInTabId(val === NEW_WALKIN_CUSTOMER_VALUE ? null : Number(val))}
                          searchable
                          options={walkInDropdownOptions}
                          buttonClassName="!h-9 !text-xs"
                        />
                      </div>
                      {selectedWalkInTabId === null ? (
                        <button
                          type="button"
                          onClick={() => setIsAddNewWalkInOpen(true)}
                          className="px-3 py-2 rounded-lg text-xs font-semibold border border-blue-600 bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all cursor-pointer shrink-0 whitespace-nowrap"
                        >
                          + {t('add_new_button', 'Add New')}
                        </button>
                      ) : (
                        // "Bill This Table" (20 Aug 2026) - lets staff jump
                        // straight to checkout for whichever tab is picked
                        // above, without switching to the separate Walk-ins
                        // tab first. Opens the same WalkInTabBillModal drawer
                        // that tab already uses (see billingTab state).
                        <button
                          type="button"
                          onClick={() => selectedTabForBilling && setBillingTab(selectedTabForBilling)}
                          className="px-3 py-2 rounded-lg text-xs font-semibold border border-emerald-600 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition-all cursor-pointer shrink-0 whitespace-nowrap"
                        >
                          {t('bill_this_table_button', 'Bill This Table')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
              {/* Left Side (Desktop: 3 columns, Mobile: 1 column full width) */}
              <div className="lg:col-span-3 space-y-3.5">
                {/* Sticky Search & Category Pills Bar */}
                <div className="pos-category-filter-bar bg-white dark:bg-gray-800 pb-3 space-y-3 border-b border-gray-100 dark:border-gray-700">
                  {/* Quick Search Bar + Category Filter Toggle + Layout Toggle */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <FlowbiteTextInput
                        id="pos-menu-quick-search"
                        type="text"
                        icon={Search}
                        value={posSearch}
                        onChange={(e) => setPosSearch(e.target.value)}
                        placeholder={t('quick_search_menu_placeholder')}
                        className="w-full"
                      />
                      {posSearch && (
                        <button
                          type="button"
                          onClick={() => setPosSearch('')}
                          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer z-10"
                          aria-label="Clear search"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowCategoryFilters((v) => !v)}
                      className={`relative h-10 w-10 shrink-0 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                        showCategoryFilters
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                          : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                      title={t('toggle_category_filters_tooltip', 'Filter by category')}
                      aria-label="Toggle category filters"
                      aria-expanded={showCategoryFilters}
                    >
                      <Filter className="w-4 h-4" />
                      {selectedPosCategory !== 'all' && !showCategoryFilters && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white dark:border-gray-800" />
                      )}
                    </button>

                    {/* Thumbnail / List Layout Toggle */}
                    <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 p-0.5 shrink-0">
                      <Tooltip content="Thumbnail View">
                        <button
                          type="button"
                          onClick={() => setPosLayoutMode('thumbnail')}
                          className={`p-2 rounded-md transition-all cursor-pointer ${
                            posLayoutMode === 'thumbnail'
                              ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs'
                              : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                          }`}
                          aria-label="Thumbnail View"
                        >
                          <LayoutGrid className="w-4 h-4" />
                        </button>
                      </Tooltip>
                      <Tooltip content="List View">
                        <button
                          type="button"
                          onClick={() => setPosLayoutMode('list')}
                          className={`p-2 rounded-md transition-all cursor-pointer ${
                            posLayoutMode === 'list'
                              ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs'
                              : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                          }`}
                          aria-label="List View"
                        >
                          <List className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>

                  {/* Category Pills Bar */}
                  {showCategoryFilters && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                      {posCategories.map((cat) => {
                        const isSelected = selectedPosCategory === cat.id;
                        return (
                          <button
                            key={cat.id}
                            onClick={() => setSelectedPosCategory(cat.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all cursor-pointer ${
                              isSelected
                                ? 'border border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 font-bold shadow-md'
                                : 'bg-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 font-medium'
                            }`}
                          >
                            {cat.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Menu Items: Thumbnail Grid vs List Stack */}
                {filteredPosMenuItems.length === 0 ? (
                  <div className="text-center py-10 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-lg">
                    <UtensilsCrossed className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-600 dark:text-gray-400 font-semibold text-xs">{t('no_food_items_found_text')} "{posSearch}"</p>
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
                        <h4 className="kitchen-management__caption text-2xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 pb-1 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                          {category}
                          <span className="text-gray-400 dark:text-gray-500 font-semibold normal-case tracking-normal">({items.length})</span>
                        </h4>
                        {posLayoutMode === 'thumbnail' ? (
                          <div className="pos-menu-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                            {items.map((item) => renderFoodCard(item))}
                          </div>
                        ) : (
                          <div className="pos-menu-list space-y-1.5">
                            {items.map((item) => renderFoodRow(item))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Flat layout when a specific category is selected */
                  posLayoutMode === 'thumbnail' ? (
                    <div className="pos-menu-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                      {filteredPosMenuItems.map((item) => renderFoodCard(item))}
                    </div>
                  ) : (
                    <div className="pos-menu-list space-y-1.5">
                      {filteredPosMenuItems.map((item) => renderFoodRow(item))}
                    </div>
                  )
                )}
              </div>

              {/* Right Side: DESKTOP ONLY Sticky Floating ORDER CART Panel (lg:col-span-1 hidden lg:flex) */}
              <div
                id="pos-order-cart-panel"
                className="hidden lg:flex lg:col-span-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4 flex-col justify-between space-y-4 min-h-[450px] sticky top-20 max-h-[calc(100vh-100px)] overflow-y-auto"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2.5">
                    <h3 className="kitchen-management__subtitle font-semibold text-gray-900 dark:text-white text-xs tracking-wider flex items-center gap-1.5">
                      <ShoppingCart className="w-4 h-4 text-gray-700 dark:text-gray-400" />
                      <span>{t('order_cart_header')}</span>
                    </h3>
                    <span className="text-2xs font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                      {totalCartCount} Items
                    </span>
                  </div>

                  {/* Cart Items List */}
                  <div className="pos-cart-items-list space-y-1 max-h-[380px] overflow-y-auto pr-0.5 divide-y divide-gray-100 dark:divide-gray-700/60">
                    {cartItems.length > 0 ? (
                      cartItems.map((ci) => (
                        <div
                          key={ci.menuItem.id}
                          className="h-[35px] min-h-[35px] px-1.5 flex items-center justify-between gap-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-700/40 rounded-lg transition-colors"
                        >
                          <div className="flex-1 pr-1 truncate min-w-0">
                            <h4 className="kitchen-management__caption font-semibold text-gray-900 dark:text-white text-xs truncate m-0 p-0 leading-tight">
                              {ci.menuItem.name} <span className="text-gray-400 dark:text-gray-500 font-normal">({`₹${ci.menuItem.price}`})</span>
                            </h4>
                          </div>

                          <div className="flex items-center gap-1 rounded-md bg-gray-50 dark:bg-gray-700/60 p-0.5 border border-gray-200 dark:border-gray-600 shrink-0">
                            <button
                              type="button"
                              aria-label="Decrease quantity"
                              onClick={() => handleUpdateCartQuantity(ci.menuItem.id, -1)}
                              className="btn-compact-stepper w-6 h-6 rounded-md shrink-0 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center justify-center transition-colors cursor-pointer active:scale-90 border border-gray-200 dark:border-gray-600 shadow-xs"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-6 text-center font-bold text-gray-900 dark:text-white text-xs">
                              {ci.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label="Increase quantity"
                              onClick={() => handleUpdateCartQuantity(ci.menuItem.id, 1)}
                              className="btn-compact-stepper w-6 h-6 rounded-md shrink-0 bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors cursor-pointer active:scale-90 shadow-xs"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-10 text-gray-400 dark:text-gray-500">
                        <ShoppingCart className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{t('order_cart_empty_text')}</p>
                        <p className="text-2xs text-gray-400 dark:text-gray-500 mt-0.5">{t('click_add_from_menu_hint')}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cart Total & Submit Button */}
                <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide text-2xs">{t('total_label')}</span>
                    <span className="font-bold text-gray-900 dark:text-white text-base">
                      ₹{totalCartSum.toFixed(2)}
                    </span>
                  </div>

                  <Tooltip content={orderSubmitTitle}>
                    <Button variant="primary" size="lg" onClick={handleOrderSubmit} disabled={isOrderSubmitDisabled}>
                      <span>{isSubmittingOrder ? t('sending_order_button', 'Sending...') : t('send_order_to_kitchen_button')}</span>
                    </Button>
                  </Tooltip>
                </div>
              </div>
            </div>

            {/* MOBILE ONLY Light-Theme Bottom Cart Drawer (lg:hidden, Collapsible & 50vh Expandable, Floats Above MobileBottomNav) */}
            {cartItems.length > 0 && (
              <div
                // Was `bg-white ... shadow-lg border-t border-gray-200` - identical
                // white to the page container behind it (take-food-order-container
                // is also bg-white), with `shadow-lg` doing nothing useful: that's a
                // downward-cast shadow, and this drawer sits at the very bottom of
                // the viewport - there's nothing below it to shadow onto, so it
                // rendered essentially invisibly. Found 22 Aug 2026 (reported as
                // "cart drawer is very difficult to differentiate from rest of the
                // site"). Fixed with an upward-cast shadow (negative Y offset, the
                // correct direction for a bottom sheet - it falls onto the menu
                // content directly above the drawer's top edge instead), a
                // slightly-tinted surface instead of matching white, and a bolder
                // accent top border so the boundary itself reads clearly too.
                className={`fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-[55] lg:hidden bg-slate-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-t-2xl shadow-[0_-8px_30px_-6px_rgba(0,0,0,0.25)] dark:shadow-[0_-8px_30px_-6px_rgba(0,0,0,0.6)] border-t-2 border-blue-200 dark:border-blue-900/60 transition-all duration-300 flex flex-col ${
                  isCartDrawerExpanded ? 'h-[50vh]' : 'max-h-[260px]'
                }`}
              >
                {/* Right-Aligned White Pull-Tab Attached to Top Edge of Cart */}
                <button
                  onClick={() => setIsCartDrawerExpanded(!isCartDrawerExpanded)}
                  // No shadow and no bottom border - it's meant to read as
                  // one continuous surface with the drawer below it, not a
                  // separate floating chip (found 20 Aug 2026: shadow-sm
                  // still cast a visible line along the bottom edge even
                  // with border-b-0, since box-shadow isn't clipped by the
                  // missing border). bg-slate-50 (not white) to match the
                  // drawer body's surface tone after the 22 Aug 2026 fix.
                  className="absolute top-0 right-4 -translate-y-full bg-slate-50 dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold px-4 py-1.5 rounded-t-xl border-t-2 border-x border-b-0 border-blue-200 dark:border-blue-900/60 flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95 z-20"
                  aria-label="Toggle Cart Drawer"
                >
                  {isCartDrawerExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-700 dark:text-gray-300 stroke-[2.5]" />
                  ) : (
                    <ChevronUp className="w-4 h-4 text-gray-700 dark:text-gray-300 stroke-[2.5]" />
                  )}
                </button>

                {/* Items List (Displays Last 3 items in Collapsed mode, All items in 50vh Expanded mode) */}
                <div className="pos-cart-items-list p-2.5 pt-3 flex-1 overflow-y-auto space-y-1.5">
                  {!isCartDrawerExpanded && cartItems.length > 3 && (
                    <p className="text-2xs text-blue-700 dark:text-blue-400 font-semibold tracking-wide uppercase text-center pb-1">
                      {t('showing_last_3_items_prefix')} {cartItems.length} {t('showing_last_3_items_suffix')}
                    </p>
                  )}
                  {visibleDrawerItems.map((ci) => (
                    <div
                      key={ci.menuItem.id}
                      // bg-white (not gray-50) so each item card still pops
                      // against the drawer's own now-tinted bg-slate-50
                      // surface (22 Aug 2026) - it used to read as one shade
                      // of gray-on-white, now it'd be gray-on-gray instead.
                      // min-h/py/button-size shrunk ~30% (22 Aug 2026, on
                      // request) - previously min-h-[38px] py-1 with w-7 h-7
                      // (28px) stepper buttons actually rendered ~40px tall
                      // (content height won over the min-h floor); w-6 h-6
                      // (24px) buttons + py-0 gets this row down to ~28px,
                      // about 30% shorter, without dropping the stepper
                      // buttons below a reasonable tap target.
                      className="bg-white dark:bg-gray-700/60 h-[35px] min-h-[35px] px-2.5 rounded-lg border border-gray-200 dark:border-gray-600 flex items-center justify-between gap-2 text-xs text-gray-900 dark:text-gray-100"
                    >
                      <div className="flex-1 pr-1 truncate min-w-0">
                        <h4 className="kitchen-management__caption font-semibold text-gray-900 dark:text-white text-xs truncate m-0 p-0 leading-tight">
                          {ci.menuItem.name} <span className="text-gray-400 dark:text-gray-500 font-normal">({`₹${ci.menuItem.price}`})</span>
                        </h4>
                      </div>

                      <div className="flex items-center gap-1 rounded-md bg-white dark:bg-gray-800 p-0.5 border border-gray-200 dark:border-gray-600 shrink-0">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          onClick={() => handleUpdateCartQuantity(ci.menuItem.id, -1)}
                          className="btn-compact-stepper w-6 h-6 rounded-md shrink-0 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 flex items-center justify-center transition-colors cursor-pointer active:scale-90 border border-gray-200 dark:border-gray-600 shadow-xs"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-6 text-center font-bold text-gray-900 dark:text-white text-xs">
                          {ci.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          onClick={() => handleUpdateCartQuantity(ci.menuItem.id, 1)}
                          className="btn-compact-stepper w-6 h-6 rounded-md shrink-0 bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors cursor-pointer active:scale-90 shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action Footer - button is right-aligned rather than
                    spanning edge-to-edge (20 Aug 2026): Button's root is
                    `display: flex` (block-level, not inline-flex), which
                    fills the width of whatever it's placed in by default -
                    wrapping it in a flex/justify-end container is what
                    actually constrains it to its own content width instead
                    of needing a one-off width override on the button itself. */}
                <div className="p-3 pb-3.5 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shrink-0 flex justify-end">
                  <Tooltip content={orderSubmitTitle}>
                    <Button variant="primary" size="lg" onClick={handleOrderSubmit} disabled={isOrderSubmitDisabled}>
                      <span>{isSubmittingOrder ? t('sending_order_button', 'Sending...') : t('send_order_to_kitchen_button')}</span>
                    </Button>
                  </Tooltip>
                </div>
              </div>
            )}

            {/* Mobile Scroll-to-Top Button */}
            {showScrollTop && (
              <Tooltip content="Scroll to top" position="left">
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
                >
                  <ArrowUp className="w-5 h-5 stroke-[2.5]" />
                </button>
              </Tooltip>
            )}
          </div>
          );
        })()}
        </div>
      )}

      {billingTab && (
        <WalkInTabBillModal
          tab={billingTab}
          onClose={() => setBillingTab(null)}
          onBilled={() => {
            refreshWalkInTabs();
            refreshOrders();
          }}
          propertyName={propertyName}
          propertyGstin={propertyGstin}
          propertyUpiId={propertyUpiId}
          propertyUpiQrCodeUrl={propertyUpiQrCodeUrl}
        />
      )}

      {/* TAB 3: MENU CATALOG */}
      {activeTab === 'menu_catalog' && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md p-4 sm:p-6 space-y-4">
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
              <div key={item.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-700/50">
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
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md p-4 sm:p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="kitchen-management__subtitle font-semibold text-slate-800 dark:text-slate-200 text-sm">{t('kitchen_requisitions_header')}</h3>
            <button
              onClick={() => setIsReqModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> {t('request_material_stock_button')}
            </button>
          </div>

          <Input
            type="text"
            value={reqSearch}
            onChange={(e) => setReqSearch(e.target.value)}
            placeholder={t('search_requisition_placeholder')}
            className="w-full max-w-xs"
          />
          {(() => {
            const requisitionColumns = [
              {
                name: t('req_id_column'),
                cell: (row: Requisition) => <span className="font-semibold">{row.id}</span>,
              },
              {
                name: t('material_name_column'),
                cell: (row: Requisition) => <span className="font-semibold text-slate-900 dark:text-white">{row.itemName}</span>,
              },
              {
                name: t('requested_qty_column'),
                cell: (row: Requisition) => <span>{row.requestedQty} {row.unit}</span>,
              },
              {
                name: t('requested_at_column'),
                cell: (row: Requisition) => <span className="text-slate-500">{formatDateTimeDDMMYYYY(row.requestedAt)}</span>,
              },
              {
                name: t('requested_by_column'),
                cell: (row: Requisition) => <span>{row.requestedBy}</span>,
              },
              {
                name: t('status_column_header'),
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
                align: 'center' as const,
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
            ];

            if (filteredRequisitions.length === 0) {
              return (
                <div className="py-10 text-center text-slate-400 font-semibold text-xs">
                  {t('no_requisitions_found_text')}
                </div>
              );
            }
            return (
              <div className="overflow-x-auto">
                <Table hoverable>
                  <TableHead>
                    <TableRow>
                      {requisitionColumns.map((col) => (
                        <TableHeadCell key={col.name} className={col.align === 'center' ? 'text-center' : ''}>
                          {col.name}
                        </TableHeadCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredRequisitions.slice((reqDesktopPage - 1) * REQ_DESKTOP_PAGE_SIZE, reqDesktopPage * REQ_DESKTOP_PAGE_SIZE).map((row: Requisition) => (
                      <TableRow key={row.id} className="bg-white dark:bg-gray-800">
                        {requisitionColumns.map((col) => (
                          <TableCell key={col.name} className={col.align === 'center' ? 'text-center' : ''}>
                            {col.cell(row)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination
                  page={reqDesktopPage}
                  totalItems={filteredRequisitions.length}
                  pageSize={REQ_DESKTOP_PAGE_SIZE}
                  onPageChange={setReqDesktopPage}
                  itemLabel="requisitions"
                />
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB: STAFF MEALS POS */}
      {activeTab === 'staff_meals' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left Panel: Record Consumption */}
          <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md space-y-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-3">
              <Plus className="w-4 h-4 text-blue-600" /> {t('record_consumption_heading')}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t('date_time_of_record_label')}</label>
                <Input 
                  type="datetime-local" 
                  value={smDateRecord}
                  onChange={(e) => setSmDateRecord(e.target.value)}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t('consuming_staff_label')}</label>
                <div className="grid grid-cols-2 gap-2.5 p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                  {smStaffList.map(staff => (
                    <label key={staff} className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                      <input 
                        type="checkbox"
                        checked={smSelectedStaff.includes(staff)}
                        onChange={() => handleSmToggleStaff(staff)}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className="truncate">{staff}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t('consumption_type_label')}</label>
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
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t('custom_meal_combination_label')}</label>
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
                      className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-3 rounded-lg border border-gray-300 dark:border-gray-600 font-semibold text-xs flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <span>{t('new_button')}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t('est_cost_value_label')}</label>
                  <Input 
                    type="number" 
                    value={smEstCost}
                    onChange={(e) => setSmEstCost(e.target.value)}
                    className="text-right"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t('quantity_label')}</label>
                <div className="flex items-center w-32 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-700">
                  <button 
                    onClick={() => setSmQuantity(Math.max(1, smQuantity - 1))} 
                    type="button" 
                    className="w-10 h-9 flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-white font-bold transition-colors cursor-pointer border-r border-gray-200 dark:border-gray-600"
                  >
                    -
                  </button>
                  <div className="h-9 flex-1 flex items-center justify-center text-xs font-bold text-gray-900 dark:text-white">{smQuantity}</div>
                  <button 
                    onClick={() => setSmQuantity(smQuantity + 1)} 
                    type="button" 
                    className="w-10 h-9 flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-white font-bold transition-colors cursor-pointer border-l border-gray-200 dark:border-gray-600"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="pt-2">
                {smError && (
                  <p className="text-red-500 text-xs font-medium mb-2 text-center">{smError}</p>
                )}
<Button variant="primary" size="sm" onClick={handleLogStaffMeal} leftIcon={<Plus className="w-4 h-4" />}>
                  <span>{t('log_staff_meal_button')}</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Right Panel: Monthly Tracking Log */}
          <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md flex flex-col h-full">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" /> 
                <span>{t('monthly_tracking_log_heading')}</span>
              </div>
              <span className="text-gray-500 dark:text-gray-400 font-medium text-xs">{smLogsLoading ? '…' : smLogs.length} {t('entries_suffix')}</span>
            </h3>
            
            <div className="flex-1 overflow-auto custom-scrollbar space-y-4">
              {/* Mobile Card Stack View (md:hidden) */}
              <div className="md:hidden space-y-2.5">
                {smLogs.slice((smPage - 1) * 10, smPage * 10).map((row: any, idx: number) => (
                  <div key={row.id || idx} className="p-3 bg-gray-50 dark:bg-gray-900/60 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700/60 pb-2">
                      <span className="font-mono text-2xs font-medium text-gray-500 dark:text-gray-400">
                        {row.date}
                      </span>
                      <span className="font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800 text-2xs">
                        {row.type || 'Staff Meal'}
                      </span>
                    </div>
                    <div>
                      <div className="text-2xs text-gray-500 dark:text-gray-400">Staff Members:</div>
                      <div className="font-semibold text-gray-900 dark:text-white">{row.staff}</div>
                    </div>
                    <div>
                      <div className="text-2xs text-gray-500 dark:text-gray-400">Food Consumed:</div>
                      <div className="font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                        {row.food}
                        {row.hasTag && (
                          <span
                            className="w-3.5 h-3.5 inline-flex items-center justify-center bg-amber-100 rounded text-3xs text-amber-700 font-bold border border-amber-300 cursor-help"
                            title={t('leftover_buffer_badge_tooltip', 'Made from leftover / buffer stock, not freshly prepared')}
                          >
                            {t('leftover_buffer_badge_label', 'L')}
                          </span>
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
                      className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300 disabled:opacity-40 cursor-pointer"
                    >
                      Previous
                    </button>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Page {smPage} of {Math.ceil(smLogs.length / 10)}
                    </span>
                    <button
                      type="button"
                      disabled={smPage >= Math.ceil(smLogs.length / 10)}
                      onClick={() => setSmPage((p) => Math.min(Math.ceil(smLogs.length / 10), p + 1))}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300 disabled:opacity-40 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>

              {/* Desktop Table (hidden md:block) */}
              <div className="hidden md:block overflow-x-auto">
                {(() => {
                  const smColumns = [
                    {
                      name: 'DATE & TIME',
                      cell: (row: any) => (
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          {row.date.split('\n').map((l: string, idx: number) => <div key={idx}>{l}</div>)}
                        </span>
                      ),
                    },
                    {
                      name: 'STAFF MEMBERS',
                      cell: (row: any) => (
                        <span className="text-xs font-semibold text-gray-900 dark:text-white leading-relaxed">{row.staff}</span>
                      ),
                    },
                    {
                      name: 'TOTAL FOOD CONSUMED',
                      cell: (row: any) => (
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 relative inline-flex items-center gap-1.5">
                          {row.food}
                          {row.hasTag && (
                            <span
                              className="w-3.5 h-3.5 inline-flex items-center justify-center bg-amber-100 rounded text-3xs text-amber-700 font-bold border border-amber-300 cursor-help"
                              title={t('leftover_buffer_badge_tooltip', 'Made from leftover / buffer stock, not freshly prepared')}
                            >
                              {t('leftover_buffer_badge_label', 'L')}
                            </span>
                          )}
                        </span>
                      ),
                    },
                  ];

                  if (smLogsLoading) {
                    return (
                      <div className="p-8 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500 font-semibold text-xs">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading meal logs...
                      </div>
                    );
                  }
                  if (smLogs.length === 0) {
                    return <div className="py-8 text-center text-gray-400 font-medium text-xs">{t('no_meal_logs_text')}</div>;
                  }
                  return (
                    <>
                      <Table hoverable>
                        <TableBody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {smLogs.slice((smDesktopPage - 1) * SM_DESKTOP_PAGE_SIZE, smDesktopPage * SM_DESKTOP_PAGE_SIZE).map((row: any, idx: number) => (
                            <TableRow key={idx} className="bg-white dark:bg-gray-800">
                              {smColumns.map((col) => (
                                <TableCell key={col.name}>{col.cell(row)}</TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <TablePagination
                        page={smDesktopPage}
                        totalItems={smLogs.length}
                        pageSize={SM_DESKTOP_PAGE_SIZE}
                        onPageChange={setSmDesktopPage}
                        itemLabel="logs"
                      />
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
        {/* ADD NEW WALK-IN TABLE MODAL - the walk-in picker above is a closed
            dropdown, so this small popup is the only place left to pick a
            table number for a brand-new tab (20 Aug 2026: switched from a
            free-text name to a fixed Table 1..N picker - tables are numbered,
            not named, and a picker avoids typos/duplicate-but-different
            spellings of the same table ending up as separate tabs). Options
            come from propertyWalkInTableCount (self-heals, defaults 10) so
            this scales to however many tables a given property actually
            has, instead of a hardcoded range. */}
        {/* ADD NEW TABLE DRAWER */}
        <Drawer
          open={isAddNewWalkInOpen}
          onClose={() => { if (!isStartingNewTab) { setIsAddNewWalkInOpen(false); setNewTabLabel(''); } }}
          position="right"
          className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
        >
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Plus className="w-4 h-4" />
              </div>
              <h2 className="kitchen-management__subtitle font-semibold text-slate-800 dark:text-slate-200 text-sm m-0">
                {t('add_new_walk_in_heading', 'Add New Table')}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => { if (!isStartingNewTab) { setIsAddNewWalkInOpen(false); setNewTabLabel(''); } }}
              className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {(() => {
              const totalTables = Math.max(1, propertyWalkInTableCount || 10);
              const openTabsForPicker = walkInTabs.filter((tab) => tab.status === 'open');
              const tableOptions = Array.from({ length: totalTables }, (_, i) => {
                const n = i + 1;
                const label = `Table ${n}`;
                const occupiedTab = openTabsForPicker.find((tab) => tab.label === label);
                return {
                  value: String(n),
                  label: occupiedTab
                    ? `${label} (in use · ₹${occupiedTab.subtotal.toLocaleString('en-IN')})`
                    : label,
                  disabled: !!occupiedTab,
                };
              });
              return (
                <StyledSelect
                  label={t('table_number_label', 'Table Number')}
                  searchable
                  value={newTabLabel}
                  onChange={(val) => setNewTabLabel(val)}
                  options={tableOptions}
                  placeholder={t('select_table_placeholder', 'Select a table...')}
                />
              );
            })()}
          </div>
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => { setIsAddNewWalkInOpen(false); setNewTabLabel(''); }}
              disabled={isStartingNewTab}
            >
              {t('cancel_button', 'Cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleStartWalkInOrder}
              disabled={!newTabLabel.trim() || isStartingNewTab}
            >
              {isStartingNewTab ? t('starting_order_button', 'Starting…') : t('start_order_button', 'Start Order')}
            </Button>
          </div>
        </Drawer>

        {/* CUSTOM MEAL DRAWER */}
        <Drawer
          open={isCustomMealModalOpen}
          onClose={() => setIsCustomMealModalOpen(false)}
          position="right"
          className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
        >
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Plus className="w-4 h-4" />
              </div>
              <h2 className="kitchen-management__subtitle font-semibold text-slate-800 dark:text-slate-200 text-sm m-0">
                {t('create_custom_meal_heading')}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsCustomMealModalOpen(false)}
              className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
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
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsCustomMealModalOpen(false)}
            >
              {t('cancel_button', 'Cancel')}
            </Button>
            <Button variant="success" size="sm" onClick={handleSaveCustomMeal}>
              {t('save_to_database_button')}
            </Button>
          </div>
        </Drawer>

      {/* TAB: BETA RECIPE BUILDER */}
      {activeTab === 'beta_recipe_builder' && (
        <div className="space-y-6 kitchen-management">
          {/* Recipe Preset Save Drawer */}
          <Drawer
            open={showPresetModal}
            onClose={() => setShowPresetModal(false)}
            position="right"
            className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Bookmark className="w-4 h-4" />
                </div>
                <h2 className="kitchen-management__subtitle font-semibold text-slate-900 dark:text-white text-sm m-0">
                  {t('save_recipe_preset_heading')}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowPresetModal(false)}
                className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <p className="text-xs text-slate-500 m-0">{t('save_preset_description')}</p>
              <Input
                type="text"
                value={presetNameInput}
                onChange={(e) => setPresetNameInput(e.target.value)}
                placeholder={t('e_g_butter_chicken_placeholder')}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); }}
              />
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowPresetModal(false)}
              >
                {t('cancel_button', 'Cancel')}
              </Button>
              <Button variant="primary" size="sm" leftIcon={<Save className="w-3 h-3" />} onClick={handleSavePreset}>
                {t('save_preset_button')}
              </Button>
            </div>
          </Drawer>

          {/* Header */}
          <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md">
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
          <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md">
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
            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md">
              <p className="text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px]">{t('cost_per_portion_label')}</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white mt-1">₹{costPerPortion.toFixed(2)}</p>
              <span className="text-[10px] text-slate-400">{t('single_serving_cost_text')}</span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md">
              <p className="text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px]">{t('batch_cost_label')} ({servings}x)</p>
              <p className="text-lg font-semibold text-amber-700 dark:text-amber-400 mt-1">₹{totalBatchCost.toFixed(2)}</p>
              <span className="text-[10px] text-slate-400">{servings} {t('portions_total_text')}</span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md">
              <p className="text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px]">{t('selling_price_label')}</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white mt-1">₹{dishSellingPrice}</p>
              <span className="text-[10px] text-slate-400">{t('batch_total_text')} ₹{scaledSellingPrice.toLocaleString()}</span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md">
              <p className="text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px]">{t('food_cost_percent_label')}</p>
              <p className={`text-lg font-semibold mt-1 ${foodCostPercentage > 30 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>{foodCostPercentage.toFixed(1)}%</p>
              <span className={`text-[10px] ${foodCostPercentage > 30 ? 'text-red-500' : 'text-blue-500'}`}>{foodCostPercentage > 30 ? t('above_30_target_text') : t('within_target_text')}</span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md">
              <p className="text-slate-500 dark:text-slate-400 font-semibold uppercase text-[10px]">{t('profit_per_portion_label')}</p>
              <p className={`text-lg font-semibold mt-1 ${profitPerPortion >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>₹{profitPerPortion.toFixed(2)}</p>
              <span className="text-[10px] text-slate-400">{t('margin_text')} {grossProfitMargin.toFixed(1)}%</span>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md">
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
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md overflow-hidden">
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
                {(() => {
                  const ingredientColumns = [
                    {
                      name: t('ingredient_column'),
                      cell: (row: RecipeIngredient) => <span className="font-semibold text-slate-900 dark:text-white">{row.name}</span>,
                    },
                    {
                      name: t('qty_portion_column'),
                      align: 'center' as const,
                      cell: (row: RecipeIngredient) => (
                        <span className="text-slate-700 dark:text-slate-300 font-medium text-xs">{row.quantity} {row.unit}</span>
                      ),
                    },
                    {
                      name: t('scaled_qty_column'),
                      align: 'center' as const,
                      cell: (row: RecipeIngredient) => (
                        <span className="text-blue-600 dark:text-blue-400 font-semibold text-xs">{(row.quantity * servings).toFixed(3)} {row.unit}</span>
                      ),
                    },
                    {
                      name: t('cost_unit_column'),
                      align: 'right' as const,
                      cell: (row: RecipeIngredient) => <span className="text-slate-600 dark:text-slate-400 font-medium text-xs">₹{row.costPerUnit}</span>,
                    },
                    {
                      name: t('total_column'),
                      align: 'right' as const,
                      cell: (row: RecipeIngredient) => <span className="font-semibold text-emerald-700 dark:text-emerald-400 text-xs">₹{(row.quantity * servings * row.costPerUnit).toFixed(2)}</span>,
                    },
                    {
                      name: '',
                      align: 'center' as const,
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
                  ];

                  if (filteredRecipeIngredients.length === 0) {
                    return (
                      <div className="py-12 text-center">
                        <Boxes className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                        <p className="text-sm text-slate-400 font-semibold">{t('no_ingredients_yet_text')}</p>
                        <p className="text-[11px] text-slate-400 mt-1">{t('add_raw_ingredients_hint')}</p>
                      </div>
                    );
                  }
                  return (
                    <div className="overflow-x-auto">
                      <Table hoverable>
                        <TableBody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {filteredRecipeIngredients.slice((recipeIngredientsDesktopPage - 1) * RECIPE_INGREDIENTS_PAGE_SIZE, recipeIngredientsDesktopPage * RECIPE_INGREDIENTS_PAGE_SIZE).map((row) => (
                            <TableRow key={row.id} className="bg-white dark:bg-gray-800">
                              {ingredientColumns.map((col) => (
                                <TableCell key={col.name} className={col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}>
                                  {col.cell(row)}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <TablePagination
                        page={recipeIngredientsDesktopPage}
                        totalItems={filteredRecipeIngredients.length}
                        pageSize={RECIPE_INGREDIENTS_PAGE_SIZE}
                        onPageChange={setRecipeIngredientsDesktopPage}
                        itemLabel="ingredients"
                      />
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Add Ingredient Form */}
            <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md space-y-3 h-fit">
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
                    <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-[11px]">
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

                <Button type="submit" variant="primary" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />}>
                  {t('add_to_recipe_button')}
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* NEW MENU ITEM DRAWER */}
      <Drawer
        open={isNewMenuModalOpen}
        onClose={() => setIsNewMenuModalOpen(false)}
        position="right"
        className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <UtensilsCrossed className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white m-0">
              {t('add_new_food_menu_item_heading')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsNewMenuModalOpen(false)}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleCreateMenuItem} className="app-form app-form--create-menu-item flex-1 flex flex-col justify-between overflow-y-auto">
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
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
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('item_image_label', 'Item Image')}</label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors border border-slate-300 dark:border-slate-600">
                    <Upload className="w-4 h-4" />
                    <span>{t('upload_image_button')}</span>
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
                </div>

                {/* Image Preview Box */}
                {newItemImagePath && (
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-300 bg-slate-50">
                    <img
                      src={newItemImagePath}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setNewItemImagePath('')}
                      className="absolute top-1 right-1 bg-slate-900/80 text-white p-0.5 rounded-full hover:bg-slate-900 cursor-pointer"
                      title={t('remove_image_tooltip')}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsNewMenuModalOpen(false)}
            >
              {t('cancel_button', 'Cancel')}
            </Button>
            <Button type="submit" variant="success" size="sm">
              {t('save_item_button')}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* MATERIAL REQUISITION DRAWER */}
      <Drawer
        open={isReqModalOpen}
        onClose={() => setIsReqModalOpen(false)}
        position="right"
        className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Boxes className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white m-0">
              {t('request_raw_material_heading')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsReqModalOpen(false)}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleReqSubmit} className="app-form app-form--submit-requisition flex-1 flex flex-col justify-between overflow-y-auto">
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
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
          </div>
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsReqModalOpen(false)}
            >
              {t('cancel_button', 'Cancel')}
            </Button>
            <Button type="submit" variant="success" size="sm">
              {t('submit_requisition_button')}
            </Button>
          </div>
        </form>
      </Drawer>
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
  const [servedLogsDesktopPage, setServedLogsDesktopPage] = React.useState(1);
  const SERVED_LOGS_DESKTOP_PAGE_SIZE = 10;

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
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200/80 dark:border-slate-700 shadow-md p-4 space-y-3.5">
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
                className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200/80 dark:border-slate-700/80 space-y-2 text-xs"
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

        {/* Desktop Table (hidden md:block) */}
        <div className="hidden md:block overflow-x-auto">
          {(() => {
            const servedLogColumns = [
              { name: t('ticket_column'), cell: (row: ServedLogEntry) => <span className="font-semibold text-slate-900 dark:text-white text-xs">#{row.orderId}</span> },
              { name: t('dish_column'), cell: (row: ServedLogEntry) => <span className="font-semibold text-emerald-700 dark:text-emerald-400 text-xs">{row.itemName}</span> },
              { name: t('qty_column'), align: 'center' as const, cell: (row: ServedLogEntry) => <span>{row.quantity}</span> },
              { name: t('guest_column'), cell: (row: ServedLogEntry) => <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">{row.guestName || '-'}</span> },
              { name: t('room_column'), cell: (row: ServedLogEntry) => <span className="text-slate-600 dark:text-slate-400 text-xs">{row.roomNumber || '-'}</span> },
              { name: t('served_by_column'), cell: (row: ServedLogEntry) => <span className="text-slate-600 dark:text-slate-400 text-xs">{row.servedBy}</span> },
              {
                name: t('serve_time_column', 'Serve Delay'),
                cell: (row: ServedLogEntry) => {
                  const diff = parseAndDiffMinutes(row.readyAt || '', row.servedAt || '');
                  return <span className="text-xs font-semibold text-amber-600 dark:text-amber-500 whitespace-nowrap">{diff}</span>;
                }
              },
              { name: t('ready_time_column', 'Ready At'), cell: (row: ServedLogEntry) => <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.readyAt ? formatDateTimeDDMMYYYY(row.readyAt) : '-'}</span> },
              { name: t('served_time_column', 'Served At'), cell: (row: ServedLogEntry) => <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDateTimeDDMMYYYY(row.servedAt)}</span> },
            ];

            return (
              <>
                <Table hoverable>
                  <TableHead>
                    <TableRow>
                      {servedLogColumns.map((col) => (
                        <TableHeadCell key={col.name} className={col.align === 'center' ? 'text-center' : ''}>
                          {col.name}
                        </TableHeadCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredLogs.slice((servedLogsDesktopPage - 1) * SERVED_LOGS_DESKTOP_PAGE_SIZE, servedLogsDesktopPage * SERVED_LOGS_DESKTOP_PAGE_SIZE).map((row) => (
                      <TableRow key={row.id} className="bg-white dark:bg-gray-800">
                        {servedLogColumns.map((col) => (
                          <TableCell key={col.name} className={col.align === 'center' ? 'text-center' : ''}>
                            {col.cell(row)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination
                  page={servedLogsDesktopPage}
                  totalItems={filteredLogs.length}
                  pageSize={SERVED_LOGS_DESKTOP_PAGE_SIZE}
                  onPageChange={setServedLogsDesktopPage}
                  itemLabel="entries"
                />
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

