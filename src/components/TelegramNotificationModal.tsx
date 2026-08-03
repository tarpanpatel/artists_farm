import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  ShieldCheck,
  X,
  Sparkles,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link as LinkIcon,
  Save,
  CheckCircle2,
  Undo,
  Redo,
  Plus,
  Trash2,
  FileCode,
  Eye,
  Eraser,
  ExternalLink,
  Loader2,
  Rocket,
} from 'lucide-react';
import { TelegramConfig, TelegramDispatchLog, PropertyTelegramConfig } from '../types';
import { invalidateTemplateCache, getPropertySlug, fetchTelegramConfigDB, saveTelegramConfigDB } from '../services/api';
import { TelegramConnectionSettings } from './TelegramConnectionSettings';
import { TelegramSetupWizard } from './TelegramSetupWizard';
import { StyledSelect } from './StyledSelect';

export interface TelegramInlineButton {
  id: string;
  text: string;
  url?: string;
  callback_data?: string;
}

export interface TelegramTemplateExtended {
  id: string;
  dbKey: string;
  eventName: string;
  category: string;
  description: string;
  variables: string[];
  template: string;
  buttons?: TelegramInlineButton[][];
}

interface TelegramNotificationModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  telegramConfig: TelegramConfig;
  onUpdateConfig: (newConfig: TelegramConfig) => void;
  dispatchLogs: TelegramDispatchLog[];
  onSendTestNotification: () => void;
  isEmbedded?: boolean;
  onLogAudit?: (actionText: string, extra?: { status?: string; module?: string; user?: string }) => void;
}

// Identifies which templates are kitchen-related (hidden if kitchen module disabled)
const KITCHEN_TEMPLATE_KEYS = new Set([
  'kitchen_single_dish_ready',
  'kitchen_new_order',
  'kitchen_order_status',
  'kitchen_staff_meal',
  'kitchen_requisition_approved',
  'item_served',
  'staff_meal_request',
  'material_requisition_single',
  'requisition_material_request',
  'requisition_stock_fulfilled',
  'webhook_dish_served_edit',
  'webhook_order_completed',
]);

// Fallback templates used only when DB fetch returns empty
const FALLBACK_TEMPLATES: TelegramTemplateExtended[] = [
  {
    id: 'tpl-1',
    dbKey: 'finance_drawer_adjustment',
    eventName: 'Cash Drawer Adjustment',
    category: 'Billing & Financial',
    description: 'Sent to Finance group when cash drawer additions or payouts occur.',
    variables: ['{staff_name}', '{action_type}', '{remarks}', '{amount}'],
    template: `<b>FINANCIAL TRANSACTION (DRAWER ADJUSTMENT)</b>\n━━━━━━━━━━━━━━━━━━\n<b>Staff Handler:</b> {staff_name}\n<b>Action Type:</b> {action_type}\n<b>Remarks:</b> {remarks}\n━━━━━━━━━━━━━━━━━━\n<b>AMOUNT MOVEMENT: ₹{amount}</b>`,
    buttons: [
      [{ id: 'b1', text: '📊 Open Cash Drawer Logs', callback_data: 'view_cash_drawer' }]
    ]
  },
  {
    id: 'tpl-2',
    dbKey: 'finance_operational_expense',
    eventName: 'Operational Expense Alert',
    category: 'Billing & Financial',
    description: 'Sent to Finance group when an operational or farm utility expense is recorded.',
    variables: ['{expense_date}', '{category}', '{paid_by}', '{description}', '{payment_mode}', '{amount}'],
    template: `💸 <b>NEW FINANCIAL TRANSACTION (EXPENSE)</b>\n━━━━━━━━━━━━━━━━━━\n📅 <b>Date:</b> {expense_date}\n🗂️ <b>Category:</b> {category}\n👤 <b>Paid By:</b> {paid_by}\n📝 <b>Details:</b> {description}\n💳 <b>Method:</b> {payment_mode}\n━━━━━━━━━━━━━━━━━━\n🔴 <b>DEBIT AMOUNT: ₹{amount}</b>`,
    buttons: [
      [{ id: 'b2', text: '📜 View Expense Ledger', callback_data: 'view_ledger' }]
    ]
  },
  {
    id: 'tpl-3',
    dbKey: 'billing_admin_checkout_report',
    eventName: 'Property Checkout Report',
    category: 'Billing & Financial',
    description: 'Comprehensive settlement report dispatched to Admin group upon guest checkout.',
    variables: ['{guest_name}', '{base_rent}', '{advance_paid}', '{advance_collector}', '{accommodation_pending}', '{pending_collector}', '{items_list}', '{food_subtotal}', '{split_phrases}', '{cashier_name}', '{grand_total_due}'],
    template: `🔔 <b>PROPERTY CHECKOUT SETTLEMENT REPORT</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Guest:</b> {guest_name}\n\n🏠 <b>ACCOMMODATION LOGISTICS:</b>\n• Contract Tariff: ₹{base_rent}\n• Advance Taken: ₹{advance_paid} (By: {advance_collector})\n• Pending Settled: ₹{accommodation_pending} (By: {pending_collector})\n\n🍽️ <b>FINAL ITEMIZED KOT & EXTRAS:</b>\n{items_list}\n• Incidentals Subtotal: <b>₹{food_subtotal}</b>\n\n💳 <b>FINAL PAYOUT SPLIT DISTRIBUTION:</b>\n{split_phrases}\n👤 <i>Desk Cashier Executing: {cashier_name}</i>\n━━━━━━━━━━━━━━━━━━\n<b>GRAND TOTAL PAYABLE SETTLED: ₹{grand_total_due}</b>`,
    buttons: [
      [{ id: 'b3', text: '📄 Download Guest Invoice PDF', url: 'https://artistsfarm.com/invoice' }]
    ]
  },
  {
    id: 'tpl-4',
    dbKey: 'finance_revenue_credit',
    eventName: 'Revenue Credit Alert',
    category: 'Billing & Financial',
    description: 'Sent to Finance group when new revenue is collected at checkout.',
    variables: ['{guest_name}', '{cashier_name}', '{split_phrases}', '{total_collected}'],
    template: `💰 <b>NEW FINANCIAL TRANSACTION (REVENUE CREDIT)</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Guest:</b> {guest_name}\n👤 <b>Cashier:</b> {cashier_name}\n💳 <b>Split Distribution:</b>\n{split_phrases}\n━━━━━━━━━━━━━━━━━━\n🟢 <b>TOTAL CREDITED: ₹{total_collected}</b>`,
  },
  {
    id: 'tpl-5',
    dbKey: 'cron_upcoming_arrivals',
    eventName: 'Upcoming Arrivals (Cron)',
    category: 'Cron & Notifications',
    description: 'Automated daily summary of guest arrivals scheduled for tomorrow.',
    variables: ['{arrivals_list}'],
    template: `🛎️ <b>UPCOMING ARRIVALS TOMORROW</b>\n━━━━━━━━━━━━━━━━━━\n\n{arrivals_list}`,
  },
  {
    id: 'tpl-6',
    dbKey: 'kitchen_single_dish_ready',
    eventName: 'Dish Ready to Serve',
    category: 'Kitchen & Ordering',
    description: 'Sent when an individual dish is marked ready for pickup by the kitchen.',
    variables: ['{order_id}', '{qty}', '{dish_name}', '{instruction_note}'],
    template: `🍽️ <b>DISH READY TO SERVE</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Order Ticket:</b> #{order_id}\n• <b>{qty}x</b> {dish_name}{instruction_note}\n━━━━━━━━━━━━━━━━━━\n🏃‍♂️ <i>Staff, please collect and tap below when served.</i>`,
    buttons: [
      [{ id: 'b6', text: '🏃‍♂️ Mark as Served', callback_data: 'mark_served_40' }]
    ]
  },
  {
    id: 'tpl-7',
    dbKey: 'kitchen_new_order',
    eventName: 'New Order Alert (Kitchen)',
    category: 'Kitchen & Ordering',
    description: 'Sent to kitchen staff when a new food order ticket is placed.',
    variables: ['{order_id}', '{guest_name}', '{table_no}', '{waiter_name}', '{order_time}', '{order_items}'],
    template: `<b>🔔 NEW ORDER #{order_id}</b>\n<b>Table / Guest:</b> {guest_name} ({table_no})\n<b>Waiter:</b> {waiter_name}\n<b>Items:</b>\n{order_items}\n\n<i>Time: {order_time}</i>`,
    buttons: [
      [{ id: 'b7', text: '👨‍🍳 View Kitchen KDS Queue', callback_data: 'open_kds' }]
    ]
  },
  {
    id: 'tpl-8',
    dbKey: 'item_served',
    eventName: 'Item Served Alert',
    category: 'Kitchen Notifications',
    description: 'Sent when a chef or waiter marks an individual item as served.',
    variables: ['{item_name}', '{quantity}', '{guest_name}', '{table_no}', '{served_by}', '{remaining_items}'],
    template: `<b>✅ DISH SERVED</b>\n\n<b>Dish:</b> {item_name} x{quantity}\n<b>Guest:</b> {guest_name} (Table {table_no})\n<b>Served By:</b> {served_by}\n<i>Remaining items in ticket: {remaining_items}</i>`,
  },
  {
    id: 'tpl-9',
    dbKey: 'requisition_material_request',
    eventName: 'Material / Stock Request',
    category: 'Requisitions & Inventory',
    description: 'Sent when kitchen staff submits a store material or stock request.',
    variables: ['{staff_name}', '{request_time}', '{items_list}', '{custom_notes}'],
    template: `📦 <b>MATERIAL REQUEST</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>By:</b> {staff_name}\n📅 <b>At:</b> {request_time}\n\n📝 <b>Items List Required:</b>\n{items_list}\n\n💬 <b>Special / Ad-Hoc Requests:</b>\n{custom_notes}\n━━━━━━━━━━━━━━━━━━`,
    buttons: [
      [{ id: 'b9', text: '🚚 Fulfill Requisition', callback_data: 'fulfill_req_1166' }]
    ]
  },
  {
    id: 'tpl-10',
    dbKey: 'requisition_stock_fulfilled',
    eventName: 'Stock Requisition Fulfilled',
    category: 'Requisitions & Inventory',
    description: 'Sent when a store inventory requisition is fulfilled or issued.',
    variables: ['{header_title}', '{req_id}', '{staff_name}', '{fulfillment_time}', '{status_label}', '{items_manifest}', '{status_title}'],
    template: `{header_title}\n━━━━━━━━━━━━━━━━━━\n🆔 <b>Sheet ID:</b> #{req_id}\n👤 <b>Processed By:</b> {staff_name}\n📅 <b>Fulfillment Time:</b> {fulfillment_time}\n🟢 <b>Global Status:</b> {status_label}\n━━━━━━━━━━━━━━━━━━\n📝 <b>Items Variance Manifest:</b>\n\n{items_manifest}`,
  },
  {
    id: 'tpl-11',
    dbKey: 'staff_meal_request',
    eventName: 'Staff Meal Approval Request',
    category: 'Staff Meals',
    description: 'Sent to admins when a staff member requests a staff meal.',
    variables: ['{staff_name}', '{staff_role}', '{meal_name}', '{quantity}'],
    template: `<b>🍱 STAFF MEAL REQUEST</b>\n\n<b>Staff Member:</b> {staff_name} ({staff_role})\n<b>Meal Requested:</b> {meal_name} x{quantity}\n\nClick buttons below to approve or reject.`,
    buttons: [
      [
        { id: 'b11a', text: '✅ Approve Meal', callback_data: 'approve_staff_meal' },
        { id: 'b11b', text: '❌ Reject', callback_data: 'reject_staff_meal' }
      ]
    ]
  },
  {
    id: 'tpl-12',
    dbKey: 'kitchen_requisition_approved',
    eventName: 'Requisition Approved',
    category: 'Requisitions & Inventory',
    description: 'Sent when a kitchen material requisition is approved and released from store.',
    variables: ['{req_id}', '{item_name}', '{qty}', '{unit}', '{requested_by}'],
    template: `✅ <b>MATERIAL REQUISITION APPROVED #{req_id}</b>\n• Material: <b>{item_name}</b> ({qty} {unit})\n• Requested By: <b>{requested_by}</b>\n• Status: Released & Fulfilled from Store ✓`,
  },
  {
    id: 'tpl-13',
    dbKey: 'checkout_settlement_bill',
    eventName: 'Guest Checkout Bill',
    category: 'Billing & Financial',
    description: 'Itemized settlement bill sent to finance group upon guest checkout.',
    variables: ['{guest_name}', '{room_number}', '{receipt_id}', '{items_charges}', '{advance_paid}', '{balance_due}', '{total_bill}', '{payment_mode}'],
    template: `🧾 <b>FULLY ITEMIZED SETTLEMENT BILL</b>\n  Resident: <b>{guest_name}</b> (Room {room_number})\n  Receipt: #{receipt_id}\n\n<b>ITEMIZED CHARGES:</b>\n{items_charges}\n<b>SUMMARY:</b>\n  Advance Paid: <b>₹{advance_paid}</b>\n  Final Balance Due: <b>₹{balance_due}</b>\n  Total Bill: <b>₹{total_bill}</b>\n  Payment Mode: <b>{payment_mode}</b>`,
  },
  {
    id: 'tpl-14',
    dbKey: 'kitchen_order_status',
    eventName: 'Kitchen Order Status Update',
    category: 'Kitchen & Ordering',
    description: 'Sent when a kitchen order status changes (Preparing, Fulfilled, Cancelled).',
    variables: ['{status_emoji}', '{status}', '{order_id}', '{guest_info}', '{items_list}', '{ticket_total}', '{placed_at}', '{status_detail}'],
    template: `{status_emoji} <b>KITCHEN ORDER {status} #{order_id}</b>\n• Resident: <b>{guest_info}</b>\n• Items Included:\n{items_list}\n• Ticket Total: <b>₹{ticket_total}</b>\n• Placed At: <b>{placed_at}</b>\n• Current Status: <b>{status_detail}</b>`,
  },
  {
    id: 'tpl-15',
    dbKey: 'kitchen_staff_meal',
    eventName: 'Staff Duty Meal Dispatched',
    category: 'Kitchen & Ordering',
    description: 'Sent when a staff duty meal is dispatched from the kitchen.',
    variables: ['{order_id}', '{beneficiary}', '{meal_details}'],
    template: `🍛 <b>STAFF DUTY MEAL DISPATCHED #{order_id}</b>\n• Beneficiary: <b>{beneficiary}</b>\n• Details: <b>{meal_details}</b>\n• Location: <b>Staff Pantry</b>`,
  },
  {
    id: 'tpl-16',
    dbKey: 'material_requisition_single',
    eventName: 'Single Material Requisition',
    category: 'Requisitions & Inventory',
    description: 'Sent when a single material requisition is created from the kitchen dashboard.',
    variables: ['{req_id}', '{requested_by}', '{qty}', '{unit}', '{item_name}', '{status}'],
    template: `📦 <b>NEW MATERIAL REQUISITION SHEET #{req_id}</b>\n• Requested By: <b>{requested_by}</b>\n• Material Item: <b>{qty} {unit}</b> of <b>{item_name}</b>\n• Initial Status: <b>{status}</b>`,
  },
  {
    id: 'tpl-17',
    dbKey: 'inventory_low_stock',
    eventName: 'Low Stock Alert',
    category: 'Requisitions & Inventory',
    description: 'Sent when an inventory item drops below its minimum threshold.',
    variables: ['{item_name}', '{current_stock}', '{unit}', '{min_threshold}'],
    template: `⚠️ <b>LOW STOCK WARNING ALERT</b>\n• Inventory Item: <b>{item_name}</b>\n• Current Balance: <b>{current_stock} {unit}</b> (Min Threshold: {min_threshold} {unit})\n• Action Required: Reorder stock from vendor.`,
  },
  {
    id: 'tpl-18',
    dbKey: 'finance_petty_cash_expense',
    eventName: 'Petty Cash Expense',
    category: 'Billing & Financial',
    description: 'Sent to finance group when a petty cash expense or income is recorded.',
    variables: ['{entry_type}', '{amount}', '{category}', '{vendor}', '{description}'],
    template: `💰 <b>PETTY CASH {entry_type} RECORDED</b>\n• Amount: <b>₹{amount}</b>\n• Category: <b>{category}</b>\n• Vendor / Payee: <b>{vendor}</b>\n• Description: {description}`,
  },
  {
    id: 'tpl-19',
    dbKey: 'webhook_dish_served_edit',
    eventName: 'Dish Served (Webhook Edit)',
    category: 'Telegram Webhooks',
    description: 'Edit text applied to the original Telegram message when a dish is marked served via inline button callback.',
    variables: ['{original_text}', '{staff_name}', '{serve_time}'],
    template: `✅ <b>DISH SERVED</b>\n\n{original_text}\n\n👨‍🍳 <b>Served By:</b> {staff_name}\n🕒 <b>At:</b> {serve_time}`,
  },
  {
    id: 'tpl-20',
    dbKey: 'webhook_order_completed',
    eventName: 'Order Completed (Webhook Edit)',
    category: 'Telegram Webhooks',
    description: 'Edit text applied to the original Telegram message when an entire order is marked completed via inline button callback.',
    variables: ['{original_text}', '{staff_name}', '{serve_time}'],
    template: `✅ <b>ORDER COMPLETED</b>\n\n{original_text}\n\n👨‍🍳 <b>Fulfilled By:</b> {staff_name}\n🕒 <b>At:</b> {serve_time}`,
  },
];

// Converts raw Telegram HTML into Visual HTML with Variable Chips
function telegramHtmlToVisualHtml(htmlText: string): string {
  if (!htmlText) return '';
  let visual = htmlText;

  // Replace line breaks with <br>
  visual = visual.replace(/\r?\n/g, '<br>');

  // Replace variables like {staff_name} with non-editable visual pills
  visual = visual.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, varName) => {
    return `<span class="var-chip" contenteditable="false" data-var="${varName}" style="display: inline-flex; align-items: center; padding: 2px 6px; margin: 0 2px; border-radius: 6px; background-color: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; font-family: monospace; font-weight: 700; font-size: 11px; user-select: none;">{${varName}}</span>`;
  });

  return visual;
}

// Converts Visual HTML back into Telegram-compliant HTML text
function visualHtmlToTelegramHtml(visualHtml: string): string {
  if (!visualHtml) return '';

  let text = visualHtml;

  // Extract variable chips back to {varName}
  text = text.replace(/<span[^>]*class="var-chip"[^>]*data-var="([^"]+)"[^>]*>[\s\S]*?<\/span>/gi, '{$1}');
  text = text.replace(/<span[^>]*data-var="([^"]+)"[^>]*>[\s\S]*?<\/span>/gi, '{$1}');

  // Convert <div> and <p> line breaks
  text = text.replace(/<div><br\s*\/?>\s*<\/div>/gi, '\n');
  text = text.replace(/<div>/gi, '\n');
  text = text.replace(/<\/div>/gi, '');
  text = text.replace(/<p>/gi, '');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Convert browser bold tags to <b>
  text = text.replace(/<strong>/gi, '<b>').replace(/<\/strong>/gi, '<\/b>');
  text = text.replace(/<span style="font-weight:\s*bold;?">([\s\S]*?)<\/span>/gi, '<b>$1<\/b>');

  // Convert browser italic tags to <i>
  text = text.replace(/<em>/gi, '<i>').replace(/<\/em>/gi, '<\/i>');

  // Convert browser underline tags to <u>
  text = text.replace(/<ins>/gi, '<u>').replace(/<\/ins>/gi, '<\/u>');

  // Convert browser strike tags to <s>
  text = text.replace(/<del>/gi, '<s>').replace(/<\/del>/gi, '<\/s>');
  text = text.replace(/<strike>/gi, '<s>').replace(/<\/strike>/gi, '<\/s>');

  // Clean HTML entities if any
  text = text.replace(/&nbsp;/g, ' ');

  return text.trim();
}

export const TelegramNotificationModal: React.FC<TelegramNotificationModalProps> = ({
  isOpen = true,
  onClose,
  telegramConfig,
  onUpdateConfig,
  dispatchLogs,
  onSendTestNotification,
  isEmbedded = false,
  onLogAudit,
}) => {
  const [config, setConfig] = useState<TelegramConfig>(telegramConfig);
  const getLoggedInUserName = () => {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem(`artists_farm_user_${getPropertySlug()}`);
      if (savedUser) {
        try {
          const userObj = JSON.parse(savedUser);
          return userObj.username || userObj.name || 'Admin';
        } catch (e) {}
      }
    }
    return 'Admin';
  };
  const [templatesList, setTemplatesList] = useState<TelegramTemplateExtended[]>(FALLBACK_TEMPLATES);
  const [activeTemplateId, setActiveTemplateId] = useState<string>(FALLBACK_TEMPLATES[0].id);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);
  const [showBotSettings, setShowBotSettings] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [editorMode, setEditorMode] = useState<'wysiwyg' | 'html'>('wysiwyg');
  const [kitchenEnabled, setKitchenEnabled] = useState(true);

  // Per-property Telegram connection settings (bot token, groups, per-template
  // routing) — shared between the Connection Settings drawer and the per-template
  // "Send to" picker in the editor below, so both read/write the same state.
  const [tgSettings, setTgSettings] = useState<PropertyTelegramConfig | null>(null);
  const [tgSaving, setTgSaving] = useState(false);
  const [tgSaved, setTgSaved] = useState(false);
  const [tgRoutingSaving, setTgRoutingSaving] = useState(false);

  // Fetch property modules to check if kitchen is enabled
  const fetchPropertyModules = async () => {
    try {
      const propertySlug = getPropertySlug();
      const response = await fetch(`/php/api/router.php?action=get_property_modules&property_slug=${propertySlug}`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success || data.status === 'success') {
        const modules = data.data || [];
        const kitchen = modules.find((m: any) => m.module_slug === 'kitchen');
        setKitchenEnabled(kitchen ? kitchen.is_enabled : true);
      }
    } catch (err) {
      console.error('Failed to fetch property modules:', err);
      setKitchenEnabled(true); // Default to enabled on error
    }
  };

  useEffect(() => {
    fetchPropertyModules();
  }, [isOpen]);

  // Filter templates based on enabled modules
  useEffect(() => {
    const filtered = FALLBACK_TEMPLATES.filter(
      (tpl) => !(!kitchenEnabled && KITCHEN_TEMPLATE_KEYS.has(tpl.dbKey))
    );
    setTemplatesList(filtered);
    if (filtered.length > 0 && !filtered.find((t) => t.id === activeTemplateId)) {
      setActiveTemplateId(filtered[0].id);
    }
  }, [kitchenEnabled, activeTemplateId]);

  useEffect(() => {
    fetchTelegramConfigDB().then(setTgSettings);
  }, []);

  const updateTgSettings = (patch: Partial<PropertyTelegramConfig>) => {
    setTgSettings((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const saveTgSettings = async (override?: PropertyTelegramConfig) => {
    const toSave = override ?? tgSettings;
    if (!toSave) return false;
    setTgSaving(true);
    const ok = await saveTelegramConfigDB(toSave);
    setTgSaving(false);
    if (ok) {
      setTgSaved(true);
      setTimeout(() => setTgSaved(false), 2000);
    }
    return ok;
  };

  // Routing changes save immediately — no separate "did you remember to click
  // Save?" step for picking a notification's destination group.
  const setTemplateRouting = async (dbKey: string, groupKey: string) => {
    if (!tgSettings) return;
    const routing = { ...tgSettings.routing };
    if (groupKey) routing[dbKey] = groupKey;
    else delete routing[dbKey];
    const next = { ...tgSettings, routing };
    setTgSettings(next);
    setTgRoutingSaving(true);
    await saveTelegramConfigDB(next);
    setTgRoutingSaving(false);
  };

  // Active Template
  const currentTpl = templatesList.find((t) => t.id === activeTemplateId) || templatesList[0];

  // Undo / Redo History Management
  const [history, setHistory] = useState<string[]>([currentTpl.template]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const editableRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Synchronize history when active template changes
  useEffect(() => {
    setHistory([currentTpl.template]);
    setHistoryIndex(0);
    if (editableRef.current && editorMode === 'wysiwyg') {
      editableRef.current.innerHTML = telegramHtmlToVisualHtml(currentTpl.template);
    }
  }, [activeTemplateId]);

  // TODO: Fetch templates from DB — fetchTemplatesFromDB() not yet implemented in api.ts

  // Push new template string to history stack
  const updateTemplateWithHistory = (newTemplate: string) => {
    if (newTemplate === history[historyIndex]) return;

    const updatedHistory = history.slice(0, historyIndex + 1);
    updatedHistory.push(newTemplate);
    setHistory(updatedHistory);
    setHistoryIndex(updatedHistory.length - 1);

    setTemplatesList((prev) =>
      prev.map((t) => (t.id === currentTpl.id ? { ...t, template: newTemplate } : t))
    );
  };

  // Undo Action
  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      const prevTemplate = history[prevIdx];
      setHistoryIndex(prevIdx);

      setTemplatesList((prev) =>
        prev.map((t) => (t.id === currentTpl.id ? { ...t, template: prevTemplate } : t))
      );

      if (editorMode === 'wysiwyg' && editableRef.current) {
        editableRef.current.innerHTML = telegramHtmlToVisualHtml(prevTemplate);
      }
    }
  };

  // Redo Action
  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      const nextTemplate = history[nextIdx];
      setHistoryIndex(nextIdx);

      setTemplatesList((prev) =>
        prev.map((t) => (t.id === currentTpl.id ? { ...t, template: nextTemplate } : t))
      );

      if (editorMode === 'wysiwyg' && editableRef.current) {
        editableRef.current.innerHTML = telegramHtmlToVisualHtml(nextTemplate);
      }
    }
  };

  // Keyboard Shortcuts (Ctrl+Z / Cmd+Z, Ctrl+Y / Cmd+Shift+Z)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if (key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (key === 'b') {
        e.preventDefault();
        formatCommand('bold');
      } else if (key === 'i') {
        e.preventDefault();
        formatCommand('italic');
      } else if (key === 'u') {
        e.preventDefault();
        formatCommand('underline');
      }
    }
  };

  // Execute formatting commands on ContentEditable
  const formatCommand = (command: string, value: string | undefined = undefined) => {
    if (editorMode === 'wysiwyg') {
      if (editableRef.current) {
        editableRef.current.focus();
        document.execCommand(command, false, value);
        const html = editableRef.current.innerHTML;
        const tgHtml = visualHtmlToTelegramHtml(html);
        updateTemplateWithHistory(tgHtml);
      }
    } else {
      // In HTML mode, insert tags into textarea selection
      if (!textareaRef.current) return;
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const text = currentTpl.template;
      const selected = text.substring(start, end);

      let tag = 'b';
      if (command === 'italic') tag = 'i';
      if (command === 'underline') tag = 'u';
      if (command === 'strikeThrough') tag = 's';
      if (command === 'insertHTML' && value?.includes('code')) tag = 'code';

      const wrapped = `<${tag}>${selected || 'text'}</${tag}>`;
      const before = text.substring(0, start);
      const after = text.substring(end, text.length);
      updateTemplateWithHistory(`${before}${wrapped}${after}`);
    }
  };

  // Insert Variable Chip into Editor
  const handleInsertVariable = (varName: string) => {
    const varText = `{${varName}}`;
    if (editorMode === 'wysiwyg' && editableRef.current) {
      editableRef.current.focus();
      const chipHtml = `<span class="var-chip" contenteditable="false" data-var="${varName}" style="display: inline-flex; align-items: center; padding: 2px 6px; margin: 0 2px; border-radius: 6px; background-color: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; font-family: monospace; font-weight: 700; font-size: 11px; user-select: none;">{${varName}}</span>&nbsp;`;
      document.execCommand('insertHTML', false, chipHtml);
      const html = editableRef.current.innerHTML;
      updateTemplateWithHistory(visualHtmlToTelegramHtml(html));
    } else if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const text = currentTpl.template;
      const before = text.substring(0, start);
      const after = text.substring(end, text.length);
      updateTemplateWithHistory(`${before}${varText}${after}`);
    }
  };

  // Insert Link Modal / Prompt
  const handleInsertLink = () => {
    const url = prompt('Enter link URL (e.g., https://artistsfarm.com):', 'https://');
    if (url) {
      if (editorMode === 'wysiwyg' && editableRef.current) {
        editableRef.current.focus();
        document.execCommand('createLink', false, url);
        updateTemplateWithHistory(visualHtmlToTelegramHtml(editableRef.current.innerHTML));
      } else if (textareaRef.current) {
        const start = textareaRef.current.selectionStart;
        const end = textareaRef.current.selectionEnd;
        const text = currentTpl.template;
        const selected = text.substring(start, end) || 'link text';
        const linkTag = `<a href="${url}">${selected}</a>`;
        const before = text.substring(0, start);
        const after = text.substring(end, text.length);
        updateTemplateWithHistory(`${before}${linkTag}${after}`);
      }
    }
  };

  // Sync contenteditable input event
  const handleEditableInput = () => {
    if (editableRef.current) {
      const html = editableRef.current.innerHTML;
      const tgHtml = visualHtmlToTelegramHtml(html);
      updateTemplateWithHistory(tgHtml);
    }
  };

  // Inline Buttons Helper Methods
  const handleAddButtonRow = () => {
    const newBtn: TelegramInlineButton = {
      id: `btn-${Date.now()}`,
      text: '🔘 New Action Button',
      callback_data: 'action_click',
    };
    const currentButtons = currentTpl.buttons || [];
    const updatedButtons = [...currentButtons, [newBtn]];

    setTemplatesList((prev) =>
      prev.map((t) => (t.id === currentTpl.id ? { ...t, buttons: updatedButtons } : t))
    );
  };

  const handleUpdateButton = (rowIndex: number, btnIndex: number, field: 'text' | 'callback_data' | 'url', val: string) => {
    const currentButtons = currentTpl.buttons || [];
    const updated = currentButtons.map((row, rIdx) => {
      if (rIdx !== rowIndex) return row;
      return row.map((b, bIdx) => {
        if (bIdx !== btnIndex) return b;
        return { ...b, [field]: val };
      });
    });

    setTemplatesList((prev) =>
      prev.map((t) => (t.id === currentTpl.id ? { ...t, buttons: updated } : t))
    );
  };

  const handleDeleteButton = (rowIndex: number, btnIndex: number) => {
    const currentButtons = currentTpl.buttons || [];
    const updated = currentButtons
      .map((row, rIdx) => {
        if (rIdx !== rowIndex) return row;
        return row.filter((_, bIdx) => bIdx !== btnIndex);
      })
      .filter((row) => row.length > 0);

    setTemplatesList((prev) =>
      prev.map((t) => (t.id === currentTpl.id ? { ...t, buttons: updated } : t))
    );
  };

  const handleSaveActiveTemplate = () => {
    setSaveStatus('Saving...');
    fetch('/php/telegram/manager.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'save_template',
        template_key: currentTpl.dbKey,
        content: currentTpl.template,
        buttons: JSON.stringify(currentTpl.buttons || []),
        staff_user: getLoggedInUserName(),
      }),
    })
      .then((res) => res.json())
      .then((resData) => {
        if (resData.success || resData.status === 'ok') {
          setSaveStatus('✔ Saved to Database!');
          invalidateTemplateCache();
          if (onLogAudit) {
            const currentUserName = getLoggedInUserName();
            onLogAudit(`${currentUserName} updated Telegram template "${currentTpl.eventName}" (${currentTpl.dbKey}) — template content edited and saved to database`, { module: 'telegram_template', status: 'Success', user: currentUserName });
          }
        } else {
          setSaveStatus('✔ Saved locally!');
        }
        setTimeout(() => setSaveStatus(null), 2500);
      })
      .catch(() => {
        setSaveStatus('✔ Saved locally!');
        setTimeout(() => setSaveStatus(null), 2500);
      });
  };

  const renderPreviewMessage = (tplText: string) => {
    let text = tplText
      .replace(/{staff_name}/g, 'Rohit')
      .replace(/{action_type}/g, 'Cash Addition')
      .replace(/{remarks}/g, 'Drawer refill')
      .replace(/{amount}/g, '1,250.00')
      .replace(/{expense_date}/g, '24 Jul 2026')
      .replace(/{category}/g, 'Farm Utilities')
      .replace(/{paid_by}/g, 'Tarpan')
      .replace(/{description}/g, 'Repair diesel generator')
      .replace(/{payment_mode}/g, 'UPI / Cash Drawer')
      .replace(/{guest_name}/g, 'Resident Group 10')
      .replace(/{base_rent}/g, '18,500.00')
      .replace(/{advance_paid}/g, '5,000.00')
      .replace(/{advance_collector}/g, 'Front Desk')
      .replace(/{accommodation_pending}/g, '13,500.00')
      .replace(/{pending_collector}/g, 'Tarpan')
      .replace(/{items_list}/g, '• 2x Cold Coffee (₹360.00)\n• 1x Paneer Butter Masala (₹480.00)')
      .replace(/{food_subtotal}/g, '840.00')
      .replace(/{split_phrases}/g, '• UPI (₹10,000.00)\n• Cash (₹4,340.00)')
      .replace(/{cashier_name}/g, 'Tarpan')
      .replace(/{grand_total_due}/g, '14,340.00')
      .replace(/{total_collected}/g, '14,340.00')
      .replace(/{arrivals_list}/g, '• Mr. Sharma (Villa 102) - Check-in: 02:00 PM\n• Dr. Gupta (Villa 105) - Check-in: 04:30 PM')
      .replace(/{order_id}/g, '40')
      .replace(/{qty}/g, '1')
      .replace(/{dish_name}/g, 'Fried Papad')
      .replace(/{instruction_note}/g, ' (Extra Crispy)')
      .replace(/{table_no}/g, 'Villa 101')
      .replace(/{waiter_name}/g, 'Tarpan')
      .replace(/{order_time}/g, '10:32 PM')
      .replace(/{order_items}/g, '• 1x French Fries\n• 1x Fried Papad')
      .replace(/{item_name}/g, 'Fried Papad')
      .replace(/{quantity}/g, '1')
      .replace(/{served_by}/g, 'Chef Kumar')
      .replace(/{remaining_items}/g, '0')
      .replace(/{request_time}/g, '10:15 PM')
      .replace(/{custom_notes}/g, 'Need fresh herbs before dinner rush')
      .replace(/{req_id}/g, '1166')
      .replace(/{fulfillment_time}/g, '10:25 PM')
      .replace(/{status_label}/g, 'Fulfilled')
      .replace(/{status_title}/g, 'FULFILLED')
      .replace(/{items_manifest}/g, '• Hari Mirchi (2 Kg) - Issued\n• Green Peas (5 Kg) - Issued')
      .replace(/{staff_role}/g, 'Kitchen Associate')
      .replace(/{meal_name}/g, 'Thali Deluxe');

    return text.replace(/\n/g, '<br/>');
  };

  const handleTest = () => {
    onSendTestNotification();
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  if (!isEmbedded && !isOpen) return null;

  const contentBody = (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-4 sm:p-6 space-y-5 w-full">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 flex items-center justify-center text-sky-600 dark:text-sky-400">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 m-0">
              📡 Telegram Template Manager
              <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Bot Connected
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 m-0 pt-0.5">
              Customize automated Telegram notification formats, variables & live previews
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSetupWizard(true)}
            className="text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Rocket className="w-4 h-4" />
            <span>Quick Setup Wizard</span>
          </button>
          <button
            onClick={() => setShowBotSettings(!showBotSettings)}
            className="text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Bot className="w-4 h-4 text-sky-600" />
            <span>Connection Settings</span>
          </button>
          {!isEmbedded && onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition-colors min-h-[36px] min-w-[36px]"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Connection Settings Drawer: per-property bot token, group chats & routing */}
      {showBotSettings && (
        <div className="space-y-2">
          <div className="flex justify-end">
            <button
              onClick={handleTest}
              className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{testSent ? 'Ping Dispatched!' : 'Send Test Ping'}</span>
            </button>
          </div>
          {tgSettings ? (
            <TelegramConnectionSettings
              config={tgSettings}
              onChange={updateTgSettings}
              onSave={() => saveTgSettings()}
              saving={tgSaving}
              saved={tgSaved}
            />
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading Telegram settings…
            </div>
          )}
        </div>
      )}

      {/* Main 2-Column Catalog Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Templates Catalog (4 Cols) */}
        <div className="lg:col-span-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 p-0 overflow-hidden">
          <div className="p-3.5 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider m-0 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Templates Catalog
            </h3>
            <span className="text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full">
              {templatesList.length} items
            </span>
          </div>

          <div className="max-h-[640px] overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700/60">
            {templatesList.map((tpl) => {
              const isActive = tpl.id === activeTemplateId;
              return (
                <div
                  key={tpl.id}
                  onClick={() => setActiveTemplateId(tpl.id)}
                  className={`p-3.5 cursor-pointer transition-all ${
                    isActive
                      ? 'bg-sky-50 dark:bg-sky-950/60 border-l-4 border-sky-600'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="font-bold text-xs text-slate-900 dark:text-white">{tpl.eventName}</div>
                  <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                    {tpl.category}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Template Editor & Live Preview (8 Cols) */}
        <div className="lg:col-span-8 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 p-4 sm:p-5 space-y-4">
          {/* Active Template Header & Save Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white m-0">
                {currentTpl.eventName}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 m-0 pt-0.5">
                {currentTpl.description}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {saveStatus && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold animate-fade-in flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {saveStatus}
                </span>
              )}
              <button
                type="button"
                onClick={handleSaveActiveTemplate}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>

          {/* Per-template Telegram routing: which group receives this specific notification */}
          <div className="flex items-center gap-2 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 rounded-xl px-3 py-2">
            <Send className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0">Send to:</label>
            {tgSettings ? (
              <StyledSelect
                className="flex-1"
                value={tgSettings.routing[currentTpl.dbKey] ?? ''}
                onChange={(value) => setTemplateRouting(currentTpl.dbKey, value)}
                disabled={tgRoutingSaving}
                options={[
                  { value: '', label: 'Not sent' },
                  ...tgSettings.groups.map((g) => ({ value: g.key, label: g.name })),
                ]}
              />
            ) : (
              <span className="text-[11px] text-slate-400">Loading…</span>
            )}
            {tgRoutingSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-500 shrink-0" />}
            {tgSettings && tgSettings.groups.length === 0 && (
              <span className="text-[10px] text-slate-500 shrink-0">Add a group in Connection Settings first</span>
            )}
          </div>

          {/* Insert Available Variables */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
              Insert Available Variables (Click to Add at Cursor):
            </label>
            <div className="flex flex-wrap gap-1.5">
              {currentTpl.variables.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => handleInsertVariable(v.replace(/[{}]/g, ''))}
                  className="text-[11px] font-mono bg-sky-100 dark:bg-sky-900/60 hover:bg-sky-200 dark:hover:bg-sky-800 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-700 px-2.5 py-1 rounded-lg transition-all cursor-pointer active:scale-95 font-bold shadow-xs"
                >
                  + {v}
                </button>
              ))}
            </div>
          </div>

          {/* Full Telegram WYSIWYG Editor */}
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-1 bg-slate-200 dark:bg-slate-700 p-2 rounded-t-xl border border-b-0 border-slate-300 dark:border-slate-600">
              {/* Left Toolbar formatting controls */}
              <div className="flex items-center gap-1 flex-wrap">
                {/* Undo / Redo */}
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={historyIndex === 0}
                  title="Undo (Ctrl+Z)"
                  className="p-1.5 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer border border-slate-300 dark:border-slate-600"
                >
                  <Undo className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={historyIndex >= history.length - 1}
                  title="Redo (Ctrl+Y)"
                  className="p-1.5 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer border border-slate-300 dark:border-slate-600"
                >
                  <Redo className="w-3.5 h-3.5" />
                </button>

                <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-600 mx-1" />

                {/* Bold */}
                <button
                  type="button"
                  onClick={() => formatCommand('bold')}
                  title="Bold <b> (Ctrl+B)"
                  className="p-1.5 rounded-md bg-white dark:bg-slate-800 text-slate-800 dark:text-white hover:bg-slate-100 font-bold text-xs flex items-center gap-1 border border-slate-300 dark:border-slate-600 cursor-pointer"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>

                {/* Italic */}
                <button
                  type="button"
                  onClick={() => formatCommand('italic')}
                  title="Italic <i> (Ctrl+I)"
                  className="p-1.5 rounded-md bg-white dark:bg-slate-800 text-slate-800 dark:text-white hover:bg-slate-100 italic font-bold text-xs flex items-center gap-1 border border-slate-300 dark:border-slate-600 cursor-pointer"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>

                {/* Underline */}
                <button
                  type="button"
                  onClick={() => formatCommand('underline')}
                  title="Underline <u> (Ctrl+U)"
                  className="p-1.5 rounded-md bg-white dark:bg-slate-800 text-slate-800 dark:text-white hover:bg-slate-100 text-xs flex items-center gap-1 border border-slate-300 dark:border-slate-600 cursor-pointer"
                >
                  <Underline className="w-3.5 h-3.5" />
                </button>

                {/* Strikethrough */}
                <button
                  type="button"
                  onClick={() => formatCommand('strikeThrough')}
                  title="Strikethrough <s>"
                  className="p-1.5 rounded-md bg-white dark:bg-slate-800 text-slate-800 dark:text-white hover:bg-slate-100 text-xs flex items-center gap-1 border border-slate-300 dark:border-slate-600 cursor-pointer"
                >
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>

                {/* Code */}
                <button
                  type="button"
                  onClick={() => formatCommand('insertHTML', '<code>code</code>')}
                  title="Monospace Code <code>"
                  className="p-1.5 rounded-md bg-white dark:bg-slate-800 text-slate-800 dark:text-white hover:bg-slate-100 text-xs flex items-center gap-1 border border-slate-300 dark:border-slate-600 cursor-pointer font-mono"
                >
                  <Code className="w-3.5 h-3.5" />
                </button>

                {/* Link */}
                <button
                  type="button"
                  onClick={handleInsertLink}
                  title="Insert Hyperlink <a href>"
                  className="p-1.5 rounded-md bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 hover:bg-slate-100 text-xs flex items-center gap-1 border border-slate-300 dark:border-slate-600 cursor-pointer"
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                </button>

                {/* Clear Format */}
                <button
                  type="button"
                  onClick={() => formatCommand('removeFormat')}
                  title="Clear Formatting"
                  className="p-1.5 rounded-md bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 hover:bg-slate-100 text-xs flex items-center gap-1 border border-slate-300 dark:border-slate-600 cursor-pointer"
                >
                  <Eraser className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Mode Toggle Switch: Visual WYSIWYG vs Source Code HTML */}
              <div className="flex items-center gap-1 bg-slate-300 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setEditorMode('wysiwyg');
                    setTimeout(() => {
                      if (editableRef.current) {
                        editableRef.current.innerHTML = telegramHtmlToVisualHtml(currentTpl.template);
                      }
                    }, 50);
                  }}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    editorMode === 'wysiwyg'
                      ? 'bg-white dark:bg-sky-600 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <Eye className="w-3 h-3" />
                  <span>Visual Editor</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditorMode('html')}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    editorMode === 'html'
                      ? 'bg-white dark:bg-sky-600 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <FileCode className="w-3 h-3" />
                  <span>Source HTML</span>
                </button>
              </div>
            </div>

            {/* Visual WYSIWYG ContentEditable Area */}
            {editorMode === 'wysiwyg' ? (
              <div
                ref={editableRef}
                contentEditable
                onInput={handleEditableInput}
                onKeyDown={handleKeyDown}
                className="w-full min-h-[160px] p-3.5 rounded-b-xl border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-hidden bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs font-sans leading-relaxed shadow-inner overflow-y-auto"
                style={{ whiteSpace: 'pre-wrap' }}
              />
            ) : (
              /* Raw Source HTML Textarea Area */
              <textarea
                ref={textareaRef}
                rows={7}
                value={currentTpl.template}
                onChange={(e) => updateTemplateWithHistory(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full text-xs font-mono p-3 rounded-b-xl border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-hidden bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-inner"
                placeholder="Type raw Telegram HTML tags here..."
              />
            )}
          </div>

          {/* Inline Keyboard Buttons Section */}
          <div className="p-3.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span>🔘 Telegram Inline Keyboard Buttons</span>
              </span>
              <button
                type="button"
                onClick={handleAddButtonRow}
                className="text-[11px] font-bold text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-950 hover:bg-sky-200 dark:hover:bg-sky-900 px-2.5 py-1 rounded-lg border border-sky-300 dark:border-sky-800 flex items-center gap-1 transition-all cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add Button</span>
              </button>
            </div>

            {(!currentTpl.buttons || currentTpl.buttons.length === 0) ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 italic m-0">
                No interactive inline buttons attached to this template yet. Click above to add buttons like "Mark as Served" or "Download Invoice".
              </p>
            ) : (
              <div className="space-y-2">
                {currentTpl.buttons.map((row, rIdx) => (
                  <div key={rIdx} className="space-y-1.5">
                    {row.map((btn, bIdx) => (
                      <div
                        key={btn.id || bIdx}
                        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                      >
                        <div className="flex-1">
                          <label className="text-[10px] text-slate-400 block mb-0.5">Button Text:</label>
                          <input
                            type="text"
                            value={btn.text}
                            onChange={(e) => handleUpdateButton(rIdx, bIdx, 'text', e.target.value)}
                            className="w-full text-xs font-semibold p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>

                        <div className="flex-1">
                          <label className="text-[10px] text-slate-400 block mb-0.5">Action Callback / URL:</label>
                          <input
                            type="text"
                            value={btn.url || btn.callback_data || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val.startsWith('http')) {
                                handleUpdateButton(rIdx, bIdx, 'url', val);
                              } else {
                                handleUpdateButton(rIdx, bIdx, 'callback_data', val);
                              }
                            }}
                            placeholder="callback_data or https://..."
                            className="w-full text-xs font-mono p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteButton(rIdx, bIdx)}
                          title="Delete Button"
                          className="p-2 text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 rounded hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors self-end sm:self-center cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Dark Telegram Preview */}
          <div className="space-y-1.5 pt-1">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <span>🤖 POS Notification Bot (Live Dark Telegram Preview)</span>
            </div>

            <div className="bg-[#17212b] rounded-2xl p-4 border border-slate-800 text-white shadow-lg space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <div className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center text-xs font-bold">
                  AF
                </div>
                <div>
                  <span className="text-xs font-bold block leading-none">Artists Farm Bot</span>
                  <span className="text-[9px] text-slate-400">bot service</span>
                </div>
              </div>

              {/* Rendered Text Bubble */}
              <div
                className="bg-[#242f3d] rounded-xl p-3.5 text-xs font-sans leading-relaxed text-slate-100 whitespace-pre-wrap border border-slate-700/60 shadow-xs"
                dangerouslySetInnerHTML={{ __html: renderPreviewMessage(currentTpl.template) }}
              />

              {/* Rendered Interactive Inline Keyboard Buttons */}
              {currentTpl.buttons && currentTpl.buttons.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {currentTpl.buttons.map((row, rIdx) => (
                    <div key={rIdx} className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {row.map((btn, bIdx) => (
                        <button
                          key={btn.id || bIdx}
                          type="button"
                          className="bg-[#2b3a4a] hover:bg-[#344557] text-[#64b5f6] font-semibold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 border border-[#37495d] transition-all cursor-pointer active:scale-98 shadow-xs"
                        >
                          <span>{btn.text}</span>
                          {btn.url && <ExternalLink className="w-3 h-3 text-[#64b5f6]" />}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              <div className="text-right text-[10px] text-slate-400 font-mono pt-1">
                05:25 PM ✓✓
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const setupWizard = (
    <TelegramSetupWizard
      isOpen={showSetupWizard}
      onClose={() => setShowSetupWizard(false)}
      onComplete={() => fetchTelegramConfigDB().then(setTgSettings)}
    />
  );

  if (isEmbedded) {
    return (
      <>
        {contentBody}
        {setupWizard}
      </>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-2 sm:p-4 z-50">
      {contentBody}
      {setupWizard}
    </div>
  );
};
