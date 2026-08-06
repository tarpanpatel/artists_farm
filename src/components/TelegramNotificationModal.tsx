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
import { invalidateTemplateCache, getPropertySlug, fetchTelegramConfigDB, saveTelegramConfigDB, fetchTemplatesFromDB, DbTelegramTemplate } from '../services/api';
import { TelegramConnectionSettings } from './TelegramConnectionSettings';
import { TelegramSetupWizard } from './TelegramSetupWizard';
import { StyledSelect } from './StyledSelect';
import { useAuth } from '../contexts/AuthContext';
import { t } from '../i18n/en';

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
  kitchenModuleEnabled?: boolean;
  templateCustomizationEnabled?: boolean;
  // Hides the "Send Test Telegram Ping" / "Telegram Setup" buttons and the
  // per-template "Send to:" group routing row - all of that is inherently
  // per-property. Used when this component is rendered at the root admin
  // level to edit the shared template wording only, with no real property
  // context to route/test against.
  hideRoutingControls?: boolean;
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

const EMOJI_REPLACEMENTS = [
  { search: /\?[^\x00-\x7F]*\s*(<b>)?PROPERTY CHECKOUT SETTLEMENT REPORT/gi, replace: '🔔 <b>PROPERTY CHECKOUT SETTLEMENT REPORT</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Guest:(<\/b>)?/gi, replace: '👤 <b>Guest:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?ACCOMMODATION LOGISTICS/gi, replace: '🏠 <b>ACCOMMODATION LOGISTICS</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?FINAL ITEMIZED KOT/gi, replace: '🍽️ <b>FINAL ITEMIZED KOT</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?FINAL PAYOUT SPLIT/gi, replace: '💳 <b>FINAL PAYOUT SPLIT</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Desk Cashier Executing/gi, replace: '👤 <i>Desk Cashier Executing</i>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?NEW FINANCIAL TRANSACTION/gi, replace: '💰 <b>NEW FINANCIAL TRANSACTION</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Cashier:(<\/b>)?/gi, replace: '👤 <b>Cashier:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?TOTAL CREDITED/gi, replace: '🟢 <b>TOTAL CREDITED</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?UPCOMING ARRIVALS TOMORROW/gi, replace: '🛎️ <b>UPCOMING ARRIVALS TOMORROW</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?DISH READY TO SERVE/gi, replace: '🍽️ <b>DISH READY TO SERVE</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Order Ticket:(<\/b>)?/gi, replace: '🏷️ <b>Order Ticket:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?NEW ORDER/gi, replace: '🔔 <b>NEW ORDER</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?DISH SERVED/gi, replace: '✅ <b>DISH SERVED</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?MATERIAL REQUEST/gi, replace: '📦 <b>MATERIAL REQUEST</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Processed By:(<\/b>)?/gi, replace: '👤 <b>Processed By:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Global Status:(<\/b>)?/gi, replace: '🟢 <b>Global Status:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?STAFF MEAL REQUEST/gi, replace: '🍱 <b>STAFF MEAL REQUEST</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?MATERIAL REQUISITION APPROVED/gi, replace: '✅ <b>MATERIAL REQUISITION APPROVED</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?FULLY ITEMIZED SETTLEMENT BILL/gi, replace: '🧾 <b>FULLY ITEMIZED SETTLEMENT BILL</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?KITCHEN ORDER/gi, replace: '🍽️ <b>KITCHEN ORDER</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?STAFF DUTY MEAL DISPATCHED/gi, replace: '🍛 <b>STAFF DUTY MEAL DISPATCHED</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?NEW MATERIAL REQUISITION SHEET/gi, replace: '📦 <b>NEW MATERIAL REQUISITION SHEET</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?LOW STOCK WARNING ALERT/gi, replace: '⚠️ <b>LOW STOCK WARNING ALERT</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?PETTY CASH/gi, replace: '💰 <b>PETTY CASH</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?ORDER COMPLETED/gi, replace: '✅ <b>ORDER COMPLETED</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?FINANCIAL TRANSACTION \(DRAWER ADJUSTMENT\)/gi, replace: '🏧 <b>FINANCIAL TRANSACTION (DRAWER ADJUSTMENT)</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Staff Handler:(<\/b>)?/gi, replace: '👤 <b>Staff Handler:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Action Type:(<\/b>)?/gi, replace: '🔄 <b>Action Type:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Remarks:(<\/b>)?/gi, replace: '📝 <b>Remarks:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?AMOUNT MOVEMENT:(<\/b>)?/gi, replace: '💰 <b>AMOUNT MOVEMENT:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Resident:(<\/b>)?/gi, replace: '👤 <b>Resident:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Receipt:(<\/b>)?/gi, replace: '🆔 <b>Receipt:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Advance Paid:(<\/b>)?/gi, replace: '💰 <b>Advance Paid:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Final Balance Due:(<\/b>)?/gi, replace: '🔴 <b>Final Balance Due:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Total Bill:(<\/b>)?/gi, replace: '💵 <b>Total Bill:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Payment Mode:(<\/b>)?/gi, replace: '💳 <b>Payment Mode:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Room:(<\/b>)?/gi, replace: '🚪 <b>Room:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?ID Document\(s\):(<\/b>)?/gi, replace: '🪪 <b>ID Document(s):</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?ID VERIFICATION STILL PENDING/gi, replace: '🪪 <b>ID VERIFICATION STILL PENDING</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Type:(<\/b>)?/gi, replace: '🧾 <b>Type:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Fulfill Time:(<\/b>)?/gi, replace: '🕒 <b>Fulfill Time:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Fulfillment Time:(<\/b>)?/gi, replace: '📅 <b>Fulfillment Time:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Date:(<\/b>)?/gi, replace: '📅 <b>Date:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Category:(<\/b>)?/gi, replace: '🏷️ <b>Category:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Paid By:(<\/b>)?/gi, replace: '👤 <b>Paid By:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Details:(<\/b>)?/gi, replace: '📝 <b>Details:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Method:(<\/b>)?/gi, replace: '💳 <b>Method:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?DEBIT AMOUNT:/gi, replace: '🔴 <b>DEBIT AMOUNT:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<i>)?Staff, please collect and tap below when/gi, replace: '🏃‍♂️ <i>Staff, please collect and tap below when' },
];

export function restoreEmojis(text: string): string {
  if (!text) return text;
  let cleaned = text;
  for (const item of EMOJI_REPLACEMENTS) {
    cleaned = cleaned.replace(item.search, item.replace);
  }
  return cleaned;
}

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
  kitchenModuleEnabled,
  templateCustomizationEnabled = false,
  hideRoutingControls = false,
}) => {
  const { activeRole } = useAuth();
  const isRootAdmin = activeRole?.toLowerCase().trim() === 'root admin';
  // All templates are designed at the root admin level; a property's Super
  // Admin can only edit them here if the root admin has explicitly turned on
  // customization for this property.
  const canEditTemplates = isRootAdmin || templateCustomizationEnabled;
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
  const [activeCategory, setActiveCategory] = useState<'All' | 'Kitchen' | 'Admin' | 'Finances'>('All');

  const getTemplateGroup = (tpl: TelegramTemplateExtended): 'Kitchen' | 'Admin' | 'Finances' => {
    const key = tpl.dbKey.toLowerCase();
    const cat = tpl.category.toLowerCase();
    
    if (
      key.includes('kitchen') || 
      key.includes('meal') || 
      key.includes('requisition') || 
      key.includes('stock') || 
      key.includes('order') || 
      key.includes('dish') || 
      key.includes('served') ||
      cat.includes('kitchen') || 
      cat.includes('ordering') ||
      cat.includes('inventory') ||
      cat.includes('requisition') ||
      cat.includes('meal')
    ) {
      return 'Kitchen';
    }
    
    if (
      key.includes('finance') || 
      key.includes('billing') || 
      key.includes('expense') || 
      key.includes('revenue') || 
      key.includes('credit') || 
      key.includes('drawer') || 
      key.includes('cash') ||
      cat.includes('billing') ||
      cat.includes('financial') ||
      cat.includes('finance')
    ) {
      return 'Finances';
    }
    
    return 'Admin';
  };

  const displayedTemplates = templatesList.filter((tpl) => {
    if (activeCategory === 'All') return true;
    return getTemplateGroup(tpl) === activeCategory;
  });

  useEffect(() => {
    if (displayedTemplates.length > 0 && !displayedTemplates.some(t => t.id === activeTemplateId)) {
      setActiveTemplateId(displayedTemplates[0].id);
    }
  }, [activeCategory, displayedTemplates, activeTemplateId]);

  // Already known by the parent (App.tsx computes this from preloadedData for
  // every other component that needs it) - no reason for this modal to run
  // its own get_property_modules fetch just to re-derive the same value,
  // especially since it's always mounted in the background regardless of
  // whether it's actually open.
  const kitchenEnabled = kitchenModuleEnabled ?? true;

  // Per-property Telegram connection settings (bot token, groups, per-template
  // routing) — shared between the Connection Settings drawer and the per-template
  // "Send to" picker in the editor below, so both read/write the same state.
  const [tgSettings, setTgSettings] = useState<PropertyTelegramConfig | null>(null);
  const [tgSaving, setTgSaving] = useState(false);
  const [tgSaved, setTgSaved] = useState(false);
  const [tgRoutingSaving, setTgRoutingSaving] = useState(false);

  // Live template content/metadata from system_telegram_templates - the catalog
  // previously only ever showed the hardcoded FALLBACK_TEMPLATES below, so any
  // template added directly to the DB (or edited by a tenant) never appeared
  // here even though it worked correctly at send time via resolveTelegramTemplate.
  const [dbTemplates, setDbTemplates] = useState<DbTelegramTemplate[]>([]);
  useEffect(() => {
    // This modal is always mounted in the background (visibility toggled via
    // isOpen), so gate on it actually being open rather than fetching the
    // whole templates catalog on every single page load.
    if (isOpen) fetchTemplatesFromDB().then(setDbTemplates);
  }, [isOpen]);

  // Filter templates based on enabled modules, merged with live DB content/
  // metadata. FALLBACK_TEMPLATES stays the source of truth for inline button
  // configs (system_telegram_templates has no buttons column) - DB entries
  // override title/category/description/template/variables for a matching key,
  // and any DB-only key (no hardcoded counterpart) is appended with no buttons.
  useEffect(() => {
    const byKey = new Map(dbTemplates.map((t) => [t.templateKey, t]));
    const merged: TelegramTemplateExtended[] = FALLBACK_TEMPLATES.map((tpl) => {
      const db = byKey.get(tpl.dbKey);
      if (!db) return tpl;
      byKey.delete(tpl.dbKey);
      return {
        ...tpl,
        eventName: db.title,
        category: db.category,
        description: db.description,
        template: restoreEmojis(db.content),
        variables: db.variables.length > 0 ? db.variables : tpl.variables,
      };
    });
    for (const [key, db] of byKey) {
      merged.push({
        id: `db-${key}`,
        dbKey: key,
        eventName: db.title,
        category: db.category,
        description: db.description,
        variables: db.variables,
        template: restoreEmojis(db.content),
      });
    }
    setTemplatesList(merged);
    if (merged.length > 0 && !merged.find((t) => t.id === activeTemplateId)) {
      setActiveTemplateId(merged[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitchenEnabled, dbTemplates]);

  useEffect(() => {
    // Nothing here is shown when hideRoutingControls is set - skip the fetch
    // (there's no real property context to resolve it against anyway) and,
    // critically, skip the auto-open-setup-wizard side effect below, which
    // would otherwise pop the wizard open with no property behind it.
    if (hideRoutingControls) return;
    fetchTelegramConfigDB().then((cfg) => {
      setTgSettings(cfg);
      // Auto-open the setup wizard while any of the 3 core groups isn't connected
      // yet, so a tenant lands straight in onboarding instead of a blank template
      // manager. Once all 3 have a chat ID, stop auto-opening - the button stays
      // available for anyone who wants to revisit it manually.
      const requiredKeys = ['kitchen', 'admin', 'finance'];
      const isComplete = requiredKeys.every((key) => cfg.groups.some((g) => g.key === key && g.chatId));
      if (!isComplete) setShowSetupWizard(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideRoutingControls]);

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

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const varName = e.dataTransfer.getData('text/plain');
    if (!varName) return;

    const cleanedVar = varName.replace(/[{}]/g, '');

    let range: Range | null = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(e.clientX, e.clientY);
    } else if ((e as any).rangeParent) {
      range = document.createRange();
      range.setStart((e as any).rangeParent, (e as any).rangeOffset);
      range.setEnd((e as any).rangeParent, (e as any).rangeOffset);
    }

    if (range && editableRef.current) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      
      const chipHtml = `<span class="var-chip" contenteditable="false" data-var="${cleanedVar}" style="display: inline-flex; align-items: center; padding: 2px 6px; margin: 0 2px; border-radius: 6px; background-color: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; font-family: monospace; font-weight: 700; font-size: 11px; user-select: none;">{${cleanedVar}}</span>&nbsp;`;
      document.execCommand('insertHTML', false, chipHtml);
      
      const html = editableRef.current.innerHTML;
      updateTemplateWithHistory(visualHtmlToTelegramHtml(html));
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
          fetchTemplatesFromDB().then(setDbTemplates);
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
              {t('telegram_template_manager_heading', '📡 Telegram Template Manager')}
              <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                {t('bot_connected_badge', 'Bot Connected')}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 m-0 pt-0.5">
              {t('telegram_manager_subtitle', 'Customize automated Telegram notification formats, variables & live previews')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!hideRoutingControls && (
            <>
              <button
                onClick={handleTest}
                className={`text-xs font-semibold text-white transition-all flex items-center gap-1.5 px-3.5 py-2 rounded-xl cursor-pointer shadow-sm active:scale-95 ${
                  testSent
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                <Send className="w-4 h-4" />
                <span>{testSent ? t('ping_sent_button', 'Ping Sent Successfully!') : t('send_test_ping_button', 'Send Test Telegram Ping')}</span>
              </button>
              <button
                onClick={() => setShowSetupWizard(true)}
                className="text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
              >
                <Rocket className="w-4 h-4" />
                <span>{t('telegram_setup_button', 'Telegram Setup')}</span>
              </button>
            </>
          )}
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

      {/* Main 2-Column Catalog Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Templates Catalog (4 Cols) */}
        <div className="lg:col-span-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 p-0 overflow-hidden">
          <div className="p-3.5 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider m-0 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" /> {t('templates_catalog_heading', 'Templates Catalog')}
            </h3>
            <span className="text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full">
              {displayedTemplates.length} items
            </span>
          </div>

          {/* Catalog Categories Switcher */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-100/50 dark:bg-slate-800/40 text-xs">
            {(['All', 'Kitchen', 'Admin', 'Finances'] as const).map((cat) => {
              const count = cat === 'All' 
                ? templatesList.length 
                : templatesList.filter(t => getTemplateGroup(t) === cat).length;
              const isActiveTab = activeCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`flex-1 py-2 font-bold text-center cursor-pointer transition-colors border-b-2 text-[11px] ${
                    isActiveTab
                      ? 'category-tab-active border-sky-600 text-sky-700 dark:text-sky-400 bg-white dark:bg-slate-800'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>

          <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700/60">
            {displayedTemplates.map((tpl) => {
              const isActive = tpl.id === activeTemplateId;
              return (
                <div
                  key={tpl.id}
                  onClick={() => setActiveTemplateId(tpl.id)}
                  className={`p-3.5 cursor-pointer transition-all ${
                    isActive
                      ? 'active-template-item bg-sky-600 text-white border-l-4 border-sky-400'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white'
                  }`}
                >
                  <div className="font-bold text-xs">{tpl.eventName}</div>
                  <div className={`text-[10px] font-medium mt-0.5 ${isActive ? 'template-category text-sky-100' : 'text-slate-500 dark:text-slate-400'}`}>
                    {tpl.category}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Template Editor & Live Preview (8 Cols) */}
        <div className="lg:col-span-8 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 p-4 sm:p-5 space-y-4">
          {!canEditTemplates && (
            <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl px-3.5 py-3">
              <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300 m-0">
                {t('no_edit_permission_hint', "Templates are designed at the root admin level. Ask your root admin to enable customization for this property if you need to edit wording here.")}
              </p>
            </div>
          )}
          {canEditTemplates && (
          <>
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
                <span>{t('save_changes_button', 'Save Changes')}</span>
              </button>
            </div>
          </div>

          {/* Per-template Telegram routing: which group receives this specific
              notification - inherently per-property, so not shown when
              editing the shared template set with no real property context. */}
          {!hideRoutingControls && (
          <div className="flex items-center gap-2 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 rounded-xl px-3 py-2">
            <Send className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0">{t('send_to_label', 'Send to:')}</label>
            {tgSettings ? (
              <StyledSelect
                className="flex-1"
                value={tgSettings.routing[currentTpl.dbKey] ?? ''}
                onChange={(value) => setTemplateRouting(currentTpl.dbKey, value)}
                disabled={tgRoutingSaving}
                options={[
                  { value: '', label: tgSettings.groups.filter(g => g.chatId).length === 0 ? t('no_groups_found_option', 'No groups found') : t('not_sent_option', 'Not sent') },
                  ...tgSettings.groups.map((g) => ({ value: g.key, label: g.name })),
                ]}
              />
            ) : (
              <span className="text-[11px] text-slate-400">Loading…</span>
            )}
            {tgRoutingSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-500 shrink-0" />}
            {tgSettings && tgSettings.groups.filter(g => g.chatId).length === 0 && (
              <button
                type="button"
                onClick={() => setShowSetupWizard(true)}
                className="text-[10px] font-bold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer bg-transparent border-0 p-0 shrink-0"
              >
                {t('configure_groups_button', 'Configure groups in Telegram Setup first')}
              </button>
            )}
          </div>
          )}

          {/* Insert Available Variables */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
              {t('insert_variables_label', 'Insert Available Variables (Drag and drop onto Visual Editor or click to insert):')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {currentTpl.variables.map((v) => (
                <button
                  key={v}
                  type="button"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', v)}
                  onClick={() => handleInsertVariable(v.replace(/[{}]/g, ''))}
                  className="variable-chip text-[11px] font-mono border px-2.5 py-1 rounded-lg transition-all cursor-grab active:cursor-grabbing active:scale-95 font-bold shadow-xs"
                  title={t('drag_variable_tooltip', 'Drag and drop or click to insert variable')}
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
                  title={t('undo_tooltip', 'Undo (Ctrl+Z)')}
                  className="p-1.5 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer border border-slate-300 dark:border-slate-600"
                >
                  <Undo className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={historyIndex >= history.length - 1}
                  title={t('redo_tooltip', 'Redo (Ctrl+Y)')}
                  className="p-1.5 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer border border-slate-300 dark:border-slate-600"
                >
                  <Redo className="w-3.5 h-3.5" />
                </button>

                <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-600 mx-1" />

                {/* Bold */}
                <button
                  type="button"
                  onClick={() => formatCommand('bold')}
                  title={t('bold_tooltip', 'Bold <b> (Ctrl+B)')}
                  className="p-1.5 rounded-md bg-white dark:bg-slate-800 text-slate-800 dark:text-white hover:bg-slate-100 font-bold text-xs flex items-center gap-1 border border-slate-300 dark:border-slate-600 cursor-pointer"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>

                {/* Italic */}
                <button
                  type="button"
                  onClick={() => formatCommand('italic')}
                  title={t('italic_tooltip', 'Italic <i> (Ctrl+I)')}
                  className="p-1.5 rounded-md bg-white dark:bg-slate-800 text-slate-800 dark:text-white hover:bg-slate-100 italic font-bold text-xs flex items-center gap-1 border border-slate-300 dark:border-slate-600 cursor-pointer"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>

                {/* Underline */}
                <button
                  type="button"
                  onClick={() => formatCommand('underline')}
                  title={t('underline_tooltip', 'Underline <u> (Ctrl+U)')}
                  className="p-1.5 rounded-md bg-white dark:bg-slate-800 text-slate-800 dark:text-white hover:bg-slate-100 text-xs flex items-center gap-1 border border-slate-300 dark:border-slate-600 cursor-pointer"
                >
                  <Underline className="w-3.5 h-3.5" />
                </button>

                {/* Strikethrough */}
                <button
                  type="button"
                  onClick={() => formatCommand('strikeThrough')}
                  title={t('strikethrough_tooltip', 'Strikethrough <s>')}
                  className="p-1.5 rounded-md bg-white dark:bg-slate-800 text-slate-800 dark:text-white hover:bg-slate-100 text-xs flex items-center gap-1 border border-slate-300 dark:border-slate-600 cursor-pointer"
                >
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>

                {/* Code */}
                <button
                  type="button"
                  onClick={() => formatCommand('insertHTML', '<code>code</code>')}
                  title={t('code_tooltip', 'Monospace Code <code>')}
                  className="p-1.5 rounded-md bg-white dark:bg-slate-800 text-slate-800 dark:text-white hover:bg-slate-100 text-xs flex items-center gap-1 border border-slate-300 dark:border-slate-600 cursor-pointer font-mono"
                >
                  <Code className="w-3.5 h-3.5" />
                </button>

                {/* Link */}
                <button
                  type="button"
                  onClick={handleInsertLink}
                  title={t('link_tooltip', 'Insert Hyperlink <a href>')}
                  className="p-1.5 rounded-md bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 hover:bg-slate-100 text-xs flex items-center gap-1 border border-slate-300 dark:border-slate-600 cursor-pointer"
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                </button>

                {/* Clear Format */}
                <button
                  type="button"
                  onClick={() => formatCommand('removeFormat')}
                  title={t('clear_formatting_tooltip', 'Clear Formatting')}
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
                  <span>{t('visual_editor_button', 'Visual Editor')}</span>
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
                  <span>{t('source_html_button', 'Source HTML')}</span>
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
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
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
                placeholder={t('raw_html_placeholder', 'Type raw Telegram HTML tags here...')}
              />
            )}
          </div>

          {/* Inline Keyboard Buttons Section */}
          <div className="p-3.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex flex-col gap-0.5">
                <span>{t('inline_keyboard_buttons_heading', '🔘 Telegram Inline Keyboard Buttons')}</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  URLs open web pages. Callbacks (e.g., <code>mark_served_40</code>) trigger backend scripts directly from Telegram.
                </span>
              </span>
              <button
                type="button"
                onClick={handleAddButtonRow}
                className="text-[11px] font-bold text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-950 hover:bg-sky-200 dark:hover:bg-sky-900 px-2.5 py-1 rounded-lg border border-sky-300 dark:border-sky-800 flex items-center gap-1 transition-all cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>{t('add_button_button', 'Add Button')}</span>
              </button>
            </div>

            {(!currentTpl.buttons || currentTpl.buttons.length === 0) ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 italic m-0">
                {t('no_buttons_message', 'No interactive inline buttons attached to this template yet. Click above to add buttons like "Mark as Served" or "Download Invoice".')}
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
                          <label className="text-[10px] text-slate-400 block mb-0.5">{t('button_text_label', 'Button Text:')}</label>
                          <input
                            type="text"
                            value={btn.text}
                            onChange={(e) => handleUpdateButton(rIdx, bIdx, 'text', e.target.value)}
                            className="w-full text-xs font-semibold p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>

                        <div className="flex-1">
                          <label className="text-[10px] text-slate-400 block mb-0.5">{t('action_callback_url_label', 'Action Callback / URL:')}</label>
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
                            placeholder={t('callback_placeholder', 'callback_data or https://...')}
                            className="w-full text-xs font-mono p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteButton(rIdx, bIdx)}
                          title={t('delete_button_tooltip', 'Delete Button')}
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
          </>
          )}

          {/* Live Dark Telegram Preview */}
          <div className="space-y-1.5 pt-1">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <span>{t('live_preview_heading', '🤖 POS Notification Bot (Live Dark Telegram Preview)')}</span>
            </div>

            <div className="bg-[#17212b] rounded-2xl p-4 border border-slate-800 text-white shadow-lg space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <div className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center text-xs font-bold">
                  AF
                </div>
                <div>
                  <span className="text-xs font-bold block leading-none">{t('bot_name_label', 'Artists Farm Bot')}</span>
                  <span className="text-[9px] text-slate-400">{t('bot_service_label', 'bot service')}</span>
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

  // No button opens this when hideRoutingControls is set, and showSetupWizard
  // never gets auto-set true in that mode either (see the effect above) - but
  // skip rendering it outright too, rather than relying on isOpen staying false.
  const setupWizard = hideRoutingControls ? null : (
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
