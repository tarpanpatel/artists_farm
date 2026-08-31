import React, { useState, useRef, useEffect } from 'react';
import { Drawer, Dropdown, DropdownItem, Tabs, TabItem } from 'flowbite-react';
import {
  Send,
  X,
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
  FileCode,
  Eye,
  Eraser,
  Loader2,
  Check,
  ChevronDown,
  Bot,
  Search,
  Pencil,
} from './icons/FlowbiteIcons';
import { TelegramConfig, TelegramDispatchLog, PropertyTelegramConfig } from '../types';
import { invalidateTemplateCache, getPropertySlug, fetchTelegramConfigDB, saveTelegramConfigDB, fetchTemplatesFromDB, updateTemplateGroupInDB, DbTelegramTemplate } from '../services/api';
import { TelegramConnectionStatus } from './TelegramConnectionStatus';
import { ToggleSwitch } from './ToggleSwitch';
import { StyledSelect } from './StyledSelect';
import { Textarea } from './Textarea';
import { PageHeader } from './PageHeader';
import { Button } from './Button';
import { attachedTabsTheme, attachedTabsClearTheme } from '../utils/tabsTheme';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import { t } from '../i18n/en';

export interface TelegramTemplateExtended {
  id: string;
  dbKey: string;
  eventName: string;
  category: string;
  description: string;
  variables: string[];
  template: string;
  // Manual "move to group" override - see getTemplateGroup() below.
  groupOverride?: string | null;
}

interface TelegramNotificationModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  telegramConfig: TelegramConfig;
  onUpdateConfig: (newConfig: TelegramConfig) => void;
  dispatchLogs: TelegramDispatchLog[];
  // Returns the real delivery outcome (which groups actually received the
  // ping, not just "the request reached our backend") so the button can
  // show an honest result instead of always claiming success.
  onSendTestNotification: () => void | Promise<{ success: boolean; attempted?: number; delivered?: number; reason?: string } | void>;
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

// Every search pattern below must consume any trailing closing tag the
// replacement re-adds (the optional (<\/b>)?/(<\/i>)? at the end) - without
// it, running this on text that's ALREADY correctly formed (a real emoji +
// balanced <b>...</b>) would only match up through the opening tag, leaving
// the original closing tag in place while the replacement adds a SECOND one.
// That's exactly how 'kitchen_single_dish_ready' ended up saved to the DB as
// "<b>DISH READY TO SERVE</b></b>" (found 19 Aug 2026 via a live HTTP 400
// "Telegram rejected the message" - Telegram's parse_mode=HTML rejects
// unbalanced tags outright) - every save-then-reedit cycle through this
// function silently compounded one more stray </b>. Only the corrupted
// "?"-prefixed case (real bug this function exists to fix) should ever match.
const EMOJI_REPLACEMENTS = [
  { search: /\?[^\x00-\x7F]*\s*(<b>)?PROPERTY CHECKOUT SETTLEMENT REPORT(<\/b>)?/gi, replace: '🔔 <b>PROPERTY CHECKOUT SETTLEMENT REPORT</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Guest:(<\/b>)?/gi, replace: '👤 <b>Guest:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?ACCOMMODATION LOGISTICS(<\/b>)?/gi, replace: '🏠 <b>ACCOMMODATION LOGISTICS</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?FINAL ITEMIZED KOT(<\/b>)?/gi, replace: '🍽️ <b>FINAL ITEMIZED KOT</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?FINAL PAYOUT SPLIT(<\/b>)?/gi, replace: '💳 <b>FINAL PAYOUT SPLIT</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Desk Cashier Executing(<\/i>)?/gi, replace: '👤 <i>Desk Cashier Executing</i>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?NEW FINANCIAL TRANSACTION(<\/b>)?/gi, replace: '💰 <b>NEW FINANCIAL TRANSACTION</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Cashier:(<\/b>)?/gi, replace: '👤 <b>Cashier:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?TOTAL CREDITED(<\/b>)?/gi, replace: '🟢 <b>TOTAL CREDITED</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?UPCOMING ARRIVALS TOMORROW(<\/b>)?/gi, replace: '🛎️ <b>UPCOMING ARRIVALS TOMORROW</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?DISH READY TO SERVE(<\/b>)?/gi, replace: '🍽️ <b>DISH READY TO SERVE</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Order Ticket:(<\/b>)?/gi, replace: '🏷️ <b>Order Ticket:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?NEW ORDER(<\/b>)?/gi, replace: '🔔 <b>NEW ORDER</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?DISH SERVED(<\/b>)?/gi, replace: '✅ <b>DISH SERVED</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?MATERIAL REQUEST(<\/b>)?/gi, replace: '📦 <b>MATERIAL REQUEST</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Processed By:(<\/b>)?/gi, replace: '👤 <b>Processed By:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Global Status:(<\/b>)?/gi, replace: '🟢 <b>Global Status:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?STAFF MEAL REQUEST(<\/b>)?/gi, replace: '🍱 <b>STAFF MEAL REQUEST</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?MATERIAL REQUISITION APPROVED(<\/b>)?/gi, replace: '✅ <b>MATERIAL REQUISITION APPROVED</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?FULLY ITEMIZED SETTLEMENT BILL(<\/b>)?/gi, replace: '📶 <b>FULLY ITEMIZED SETTLEMENT BILL</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?KITCHEN ORDER(<\/b>)?/gi, replace: '🍽️ <b>KITCHEN ORDER</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?STAFF DUTY MEAL DISPATCHED(<\/b>)?/gi, replace: '🍛 <b>STAFF DUTY MEAL DISPATCHED</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?NEW MATERIAL REQUISITION SHEET(<\/b>)?/gi, replace: '📦 <b>NEW MATERIAL REQUISITION SHEET</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?LOW STOCK WARNING ALERT(<\/b>)?/gi, replace: '⚠️ <b>LOW STOCK WARNING ALERT</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?PETTY CASH(<\/b>)?/gi, replace: '💰 <b>PETTY CASH</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?ORDER COMPLETED(<\/b>)?/gi, replace: '✅ <b>ORDER COMPLETED</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?FINANCIAL TRANSACTION \(DRAWER ADJUSTMENT\)(<\/b>)?/gi, replace: '🏧 <b>FINANCIAL TRANSACTION (DRAWER ADJUSTMENT)</b>' },
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
  { search: /\?[^\x00-\x7F]*\s*(<b>)?ID VERIFICATION STILL PENDING(<\/b>)?/gi, replace: '🪪 <b>ID VERIFICATION STILL PENDING</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Type:(<\/b>)?/gi, replace: '📶 <b>Type:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Fulfill Time:(<\/b>)?/gi, replace: '🕒 <b>Fulfill Time:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Fulfillment Time:(<\/b>)?/gi, replace: '📅 <b>Fulfillment Time:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Date:(<\/b>)?/gi, replace: '📅 <b>Date:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Category:(<\/b>)?/gi, replace: '🏷️ <b>Category:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Paid By:(<\/b>)?/gi, replace: '👤 <b>Paid By:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Details:(<\/b>)?/gi, replace: '📝 <b>Details:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Method:(<\/b>)?/gi, replace: '💳 <b>Method:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?DEBIT AMOUNT:(<\/b>)?/gi, replace: '🔴 <b>DEBIT AMOUNT:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Checked In:(<\/b>)?/gi, replace: '📅 <b>Checked In:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Uploaded:(<\/b>)?/gi, replace: '📋 <b>Uploaded:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<i>)?Open Complete Check-in for this booking to finish it\.(<\/i>)?/gi, replace: '👉 <i>Open Complete Check-in for this booking to finish it.</i>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Requested by:(<\/b>)?/gi, replace: '👤 <b>Requested by:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Requested By:(<\/b>)?/gi, replace: '👤 <b>Requested By:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Scheduled:(<\/b>)?/gi, replace: '📅 <b>Scheduled:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Fulfilled By:(<\/b>)?/gi, replace: '👤 <b>Fulfilled By:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Fulfilled by:(<\/b>)?/gi, replace: '👤 <b>Fulfilled by:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Pending for:(<\/b>)?/gi, replace: '⏱️ <b>Pending for:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?NEW SERVICE REQUEST(<\/b>)?/gi, replace: '🛎️ <b>NEW SERVICE REQUEST</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?SERVICE REQUEST FULFILLED(<\/b>)?/gi, replace: '✅ <b>SERVICE REQUEST FULFILLED</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?SERVICE REQUEST STILL PENDING(<\/b>)?/gi, replace: '⏰ <b>SERVICE REQUEST STILL PENDING</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<i>)?Staff, please collect and tap below when/gi, replace: '🏃‍♂️ <i>Staff, please collect and tap below when' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?By:(<\/b>)?/gi, replace: '👤 <b>By:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?At:(<\/b>)?/gi, replace: '📅 <b>At:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Sheet ID:(<\/b>)?/gi, replace: '🆔 <b>Sheet ID:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Items List Required:(<\/b>)?/gi, replace: '📝 <b>Items List Required:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Items Variance Manifest:(<\/b>)?/gi, replace: '📝 <b>Items Variance Manifest:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Special \/ Ad-Hoc Requests:(<\/b>)?/gi, replace: '💬 <b>Special / Ad-Hoc Requests:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Dish:(<\/b>)?/gi, replace: '🍽️ <b>Dish:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Served By:(<\/b>)?/gi, replace: '👤 <b>Served By:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<i>)?Remaining items in ticket:(<\/i>)?/gi, replace: '⏱️ <i>Remaining items in ticket:</i>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Table \/ Guest:(<\/b>)?/gi, replace: '👤 <b>Table / Guest:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Items:(<\/b>)?/gi, replace: '📝 <b>Items:</b>' },
  { search: /\?[^\x00-\x7F]*\s*(<b>)?Time:(<\/b>)?/gi, replace: '⏰ <b>Time:</b>' },
];

export function restoreEmojis(text: string): string {
  if (!text) return text;
  let cleaned = text;
  for (const item of EMOJI_REPLACEMENTS) {
    cleaned = cleaned.replace(item.search, item.replace);
  }
  // Universal Safety Net: replace any remaining orphan "?" at line starts or before tags/words
  cleaned = cleaned.replace(/(^|\n)\?\s*(<b>|<i>)?/gi, '$1🔹 $2');
  return cleaned;
}

// Fallback templates used only when DB fetch returns empty
const FALLBACK_TEMPLATES: TelegramTemplateExtended[] = [
  {
    id: 'tpl-0',
    dbKey: 'new_guest_booking',
    eventName: 'New Guest Booking',
    category: 'Guest Check-in',
    description: 'Sent to Admin group when a new guest reservation or booking is created.',
    variables: ['{guest_name}', '{phone}', '{no_of_guests}', '{checkin_date}', '{checkout_date}', '{total_charge}', '{advance_paid}', '{pending_amount}', '{booking_id}'],
    template: `🏨 <b>NEW GUEST BOOKING</b>\n\n👤 <b>Guest Name:</b> {guest_name}\n📱 <b>Phone:</b> {phone}\n👥 <b>No. of Guests:</b> {no_of_guests}\n\n📅 <b>Check-in:</b> {checkin_date}\n📅 <b>Check-out:</b> {checkout_date}\n\n💰 <b>Total Charge:</b> ₹{total_charge}\n✅ <b>Advance Paid:</b> ₹{advance_paid}\n⏳ <b>Pending:</b> ₹{pending_amount}\n\n🆔 <b>Booking ID:</b> {booking_id}`,
  },
  {
    id: 'tpl-1',
    dbKey: 'finance_drawer_adjustment',
    eventName: 'Cash Drawer Adjustment',
    category: 'Billing & Financial',
    description: 'Sent to Finance group when cash drawer additions or payouts occur.',
    variables: ['{staff_name}', '{action_type}', '{amount}', '{handed_to}', '{remarks}', '{net_balance_after}'],
    template: `🏧 <b>FINANCIAL TRANSACTION (DRAWER ADJUSTMENT)</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Staff Handler:</b> {staff_name}\n🔄 <b>Action Type:</b> {action_type}\n🤝 <b>Handed To:</b> {handed_to}\n📝 <b>Remarks:</b> {remarks}\n💰 <b>Amount Movement:</b> ₹{amount}\n━━━━━━━━━━━━━━━━━━\n📊 <b>Net Balance After: ₹{net_balance_after}</b>`,
  },
  {
    id: 'tpl-2',
    dbKey: 'finance_operational_expense',
    eventName: 'Operational Expense Alert',
    category: 'Billing & Financial',
    description: 'Sent to Finance group when an operational or farm utility expense is recorded.',
    variables: ['{expense_date}', '{category}', '{paid_by}', '{description}', '{payment_mode}', '{amount}'],
    template: `💸 <b>NEW FINANCIAL TRANSACTION (EXPENSE)</b>\n━━━━━━━━━━━━━━━━━━\n📅 <b>Date:</b> {expense_date}\n🗂️ <b>Category:</b> {category}\n👤 <b>Paid By:</b> {paid_by}\n📝 <b>Details:</b> {description}\n💳 <b>Method:</b> {payment_mode}\n━━━━━━━━━━━━━━━━━━\n🔴 <b>DEBIT AMOUNT: ₹{amount}</b>`,
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
  },
  {
    id: 'tpl-7',
    dbKey: 'kitchen_new_order',
    eventName: 'New Order Alert (Kitchen)',
    category: 'Kitchen & Ordering',
    description: 'Sent to kitchen staff when a new food order ticket is placed.',
    variables: ['{order_id}', '{guest_name}', '{room_no}', '{waiter_name}', '{order_time}', '{order_items}'],
    template: `<b>🔔 NEW ORDER #{order_id}</b>\n<b>Guest:</b> {guest_name}\n<b>Room:</b> {room_no}\n<b>Waiter:</b> {waiter_name}\n<b>Items:</b>\n{order_items}\n\n<i>Time: {order_time}</i>`,
  },
  {
    id: 'tpl-8',
    dbKey: 'item_served',
    eventName: 'Item Served Alert',
    category: 'Kitchen Notifications',
    description: 'Sent when a chef or waiter marks an individual item as served.',
    variables: ['{item_name}', '{quantity}', '{guest_name}', '{room_no}', '{served_by}', '{remaining_items}'],
    template: `<b>✅ DISH SERVED</b>\n\n<b>Dish:</b> {item_name} x{quantity}\n<b>Guest:</b> {guest_name}\n<b>Room:</b> {room_no}\n<b>Served By:</b> {served_by}\n<i>Remaining items in ticket: {remaining_items}</i>`,
  },
  {
    id: 'tpl-9',
    dbKey: 'requisition_material_request',
    eventName: 'Material / Stock Request',
    category: 'Stock & Inventory',
    description: 'Sent when kitchen staff submits a store material or stock request.',
    variables: ['{staff_name}', '{request_time}', '{items_list}', '{custom_notes}'],
    template: `📦 <b>MATERIAL REQUEST</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>By:</b> {staff_name}\n📅 <b>At:</b> {request_time}\n\n📝 <b>Items List Required:</b>\n{items_list}\n\n💬 <b>Special / Ad-Hoc Requests:</b>\n{custom_notes}\n━━━━━━━━━━━━━━━━━━`,
  },
  {
    id: 'tpl-10',
    dbKey: 'requisition_stock_fulfilled',
    eventName: 'Stock Request Fulfilled',
    category: 'Stock & Inventory',
    description: 'Sent when a store inventory stock request is fulfilled or issued.',
    variables: ['{header_title}', '{req_id}', '{staff_name}', '{fulfillment_time}', '{status_label}', '{items_manifest}', '{status_title}'],
    template: `{header_title}\n━━━━━━━━━━━━━━━━━━\n🆔 <b>Sheet ID:</b> #{req_id}\n👤 <b>Processed By:</b> {staff_name}\n📅 <b>Fulfillment Time:</b> {fulfillment_time}\n🟢 <b>Global Status:</b> {status_label}\n━━━━━━━━━━━━━━━━━━\n📝 <b>Items Fulfilled:</b>\n\n{items_manifest}`,
  },
  {
    id: 'tpl-12',
    dbKey: 'kitchen_requisition_approved',
    eventName: 'Stock Request Approved',
    category: 'Stock & Inventory',
    description: 'Sent when a kitchen stock request is approved and released from store.',
    variables: ['{req_id}', '{item_name}', '{qty}', '{unit}', '{requested_by}'],
    template: `✅ <b>STOCK REQUEST APPROVED #{req_id}</b>\n• Material: <b>{item_name}</b> ({qty} {unit})\n• Requested By: <b>{requested_by}</b>\n• Status: Released & Fulfilled from Store ✓`,
  },
  {
    id: 'tpl-13',
    dbKey: 'checkout_settlement_bill',
    eventName: 'Guest Checkout Bill',
    category: 'Billing & Financial',
    description: 'Itemized settlement bill sent to finance group upon guest checkout.',
    variables: ['{guest_name}', '{room_number}', '{receipt_id}', '{items_charges}', '{advance_paid}', '{balance_due}', '{total_bill}', '{payment_mode}'],
    // 🧾 (was 📶 - a wifi-bars glyph makes no sense for a settlement bill; this
    // looks like the same class of mojibake corruption found elsewhere in this
    // session, just baked into source instead of DB content). Resident/Room
    // split onto independent rows 23 Aug 2026, matching the DB default.
    template: `🧾 <b>FULLY ITEMIZED SETTLEMENT BILL</b>\n  Resident: <b>{guest_name}</b>\n  Room: <b>{room_number}</b>\n  Receipt: #{receipt_id}\n\n<b>ITEMIZED CHARGES:</b>\n{items_charges}\n<b>SUMMARY:</b>\n  Advance Paid: <b>₹{advance_paid}</b>\n  Final Balance Due: <b>₹{balance_due}</b>\n  Total Bill: <b>₹{total_bill}</b>\n  Payment Mode: <b>{payment_mode}</b>`,
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
    eventName: 'Single Stock Request',
    category: 'Stock & Inventory',
    description: 'Sent when a single stock request is created from the kitchen dashboard.',
    variables: ['{req_id}', '{requested_by}', '{qty}', '{unit}', '{item_name}', '{status}'],
    template: `📦 <b>NEW STOCK REQUEST #{req_id}</b>\n• Requested By: <b>{requested_by}</b>\n• Material Item: <b>{qty} {unit}</b> of <b>{item_name}</b>\n• Initial Status: <b>{status}</b>`,
  },
  {
    id: 'tpl-17',
    dbKey: 'inventory_low_stock',
    eventName: 'Low Stock Alert',
    category: 'Stock & Inventory',
    description: 'Sent when an inventory item drops below its reorder point.',
    variables: ['{item_name}', '{current_stock}', '{unit}', '{min_threshold}'],
    template: `⚠️ <b>LOW STOCK WARNING ALERT</b>\n• Inventory Item: <b>{item_name}</b>\n• Current Balance: <b>{current_stock} {unit}</b> (Reorder Point: {min_threshold} {unit})\n• Action Required: Reorder stock from vendor.`,
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
  telegramConfig: _telegramConfig,
  onUpdateConfig: _onUpdateConfig,
  dispatchLogs: _dispatchLogs,
  onSendTestNotification,
  isEmbedded = false,
  onLogAudit,
  kitchenModuleEnabled,
  templateCustomizationEnabled = false,
  hideRoutingControls = false,
}) => {
  const { activeRole, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const normalizedRole = activeRole?.toLowerCase().trim() || '';
  const isRootAdmin = normalizedRole === 'root admin';
  const isSuperAdmin = normalizedRole === 'super admin';
  const isAdmin = normalizedRole === 'admin';
  // Root Admin can always edit (templates are designed at the root admin
  // level by default). Admin and Super Admin can ONLY edit when this
  // property's "Allow Telegram Template Customization" toggle is on
  // (PlatformPropertyManagement's own copy for that toggle: "When off, this
  // property's Super Admin can view templates and the live preview but
  // can't edit the wording" - the previous `isSuperAdmin || ...` version
  // ignored the toggle entirely and let every Super Admin edit regardless,
  // contradicting that exact documented behavior). Staff-tier roles never
  // get edit access from this toggle.
  const canEditTemplates = isRootAdmin || ((isSuperAdmin || isAdmin) && templateCustomizationEnabled);
  // Routing (which group a template's notifications deliver to) follows the
  // exact same gate as editing the template's own wording (26 Aug 2026,
  // explicit product correction - was previously a separate, always-on
  // permission for Admin/Super Admin regardless of the toggle: "if telegram
  // customisation facility is not on then dont even let the user change what
  // message can go in what group"). Root Admin is unaffected either way -
  // they manage the platform-wide template set itself, independent of any
  // one property's toggle.
  const canManageRouting = canEditTemplates;
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
  // Clicking a template in the catalog opens its editor in a right-side
  // Drawer instead of a permanently-visible inline column - keeps "browse
  // templates" and "edit one template" as two distinct steps, matching this
  // app's modals-open-as-a-drawer convention (see DESIGN.md).
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'wysiwyg' | 'html'>('wysiwyg');
  const [activeCategory, setActiveCategory] = useState<'Kitchen' | 'Admin' | 'Finances'>('Kitchen');

  const getTemplateGroup = (tpl: TelegramTemplateExtended): 'Kitchen' | 'Admin' | 'Finances' => {
    // A manual "move to group" override always wins over the automatic
    // keyword classification below.
    if (tpl.groupOverride === 'Kitchen' || tpl.groupOverride === 'Admin' || tpl.groupOverride === 'Finances') {
      return tpl.groupOverride;
    }

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

  // "Move to group" dropdown handler (Templates Catalog list) - updates
  // local state immediately (so the row re-sorts into its new tab right
  // away) and persists the override to the DB; reverts by refetching if the
  // save fails, rather than leaving the UI showing a move that didn't stick.
  const handleMoveTemplateGroup = async (tpl: TelegramTemplateExtended, newGroup: 'Kitchen' | 'Admin' | 'Finances') => {
    const currentGroup = getTemplateGroup(tpl);
    if (currentGroup === newGroup) return;

    // Moving a template's group can silently change WHERE its Telegram
    // notification is actually delivered, not just which catalog tab it's
    // filed under - "Send to: Auto (...)" (see the routing dropdown below)
    // resolves by category bucket (Kitchen/Admin/Finances -> the property's
    // kitchen/admin/finance group) unless this specific template already has
    // an explicit per-template pin in tgSettings.routing. Ask before
    // applying it, and say plainly what changes either way.
    const routingKeyMap = { Kitchen: 'kitchen', Admin: 'admin', Finances: 'finance' } as const;
    const isExplicitlyPinned = !!tgSettings?.routing?.[tpl.dbKey];
    const oldGroupName = tgSettings?.groups.find((g) => g.key === routingKeyMap[currentGroup] && g.chatId)?.name;
    const newGroupName = tgSettings?.groups.find((g) => g.key === routingKeyMap[newGroup] && g.chatId)?.name;

    const deliveryNote = hideRoutingControls
      ? ''
      : isExplicitlyPinned
      ? '\n\nThis template already has a fixed delivery group pinned in "Send to", so the Telegram group it actually sends to will NOT change - only which catalog tab it is filed under.'
      : `\n\nThis template is set to "Auto" delivery, so this WILL also change where it actually sends${oldGroupName && newGroupName ? ` - from "${oldGroupName}" to "${newGroupName}"` : ''}.`;

    const ok = await confirm({
      title: t('move_template_confirm_title', 'Move this template?'),
      message: `"${tpl.eventName}" will move from ${currentGroup} to ${newGroup}. Afterward, you'll find it under the "${newGroup}" tab in the Templates Catalog.${deliveryNote}`,
      confirmText: t('move_template_confirm_button', 'Move Template'),
      variant: 'warning',
    });
    if (!ok) return;

    setTemplatesList((prev) => prev.map((t) => (t.id === tpl.id ? { ...t, groupOverride: newGroup } : t)));
    const saved = await updateTemplateGroupInDB(tpl.dbKey, newGroup);
    if (saved) {
      showToast(`Moved "${tpl.eventName}" to ${newGroup}`, { type: 'success' });
    } else {
      showToast('Could not move template - please try again.', { type: 'error' });
      fetchTemplatesFromDB().then(setDbTemplates);
    }
  };

  const [templateSearch, setTemplateSearch] = useState('');
  // A non-empty search looks across every group at once (name, category,
  // description, and the internal dbKey - e.g. searching "kitchen" also
  // surfaces templates whose dbKey mentions it even if their display
  // category doesn't) rather than being constrained to whichever tab is
  // currently active - the point of "find by keyword" is not having to
  // already know which of the 3 tabs a template lives under.
  const displayedTemplates = templatesList.filter((tpl) => {
    const q = templateSearch.trim().toLowerCase();
    if (q) {
      return (
        tpl.eventName.toLowerCase().includes(q) ||
        tpl.category.toLowerCase().includes(q) ||
        tpl.description.toLowerCase().includes(q) ||
        tpl.dbKey.toLowerCase().includes(q)
      );
    }
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
  const [tgRoutingSaving, setTgRoutingSaving] = useState(false);

  // Live template content/metadata from system_telegram_templates - the catalog
  // previously only ever showed the hardcoded FALLBACK_TEMPLATES below, so any
  // template added directly to the DB (or edited by a tenant) never appeared
  // here even though it worked correctly at send time via resolveTelegramTemplate.
  const [dbTemplates, setDbTemplates] = useState<DbTelegramTemplate[]>([]);
  useEffect(() => {
    // This modal is always mounted in the background (visibility toggled via
    // isOpen), so gate on it actually being open rather than fetching the
    // whole templates catalog on every single page load. Also gated on
    // isAuthenticated (27 Aug 2026, app-wide sweep) - this component is itself
    // mounted at App.tsx completely outside any auth gate, so isOpen alone
    // wasn't enough to stop this from firing (and 401ing) before login.
    if (isOpen && isAuthenticated) fetchTemplatesFromDB().then(setDbTemplates);
  }, [isOpen, isAuthenticated]);

  // Filter templates based on enabled modules, merged with live DB content/
  // metadata. DB entries override title/category/description/template/
  // variables for a matching key, and any DB-only key (no hardcoded
  // counterpart) is appended as-is.
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
        groupOverride: db.groupOverride,
      };
    });
    for (const [key, db] of byKey) {
      merged.push({
        id: `db-${key}`,
        dbKey: key,
        eventName: db.title,
        category: db.category,
        groupOverride: db.groupOverride,
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
    // isAuthenticated added 27 Aug 2026 (app-wide sweep): this component is
    // mounted at App.tsx completely outside any auth gate, and
    // hideRoutingControls isn't passed at that render site - meaning this
    // fired unconditionally, well before the async login could complete.
    if (hideRoutingControls || !isAuthenticated) return;
    fetchTelegramConfigDB().then((cfg) => {
      setTgSettings(cfg);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideRoutingControls, isAuthenticated]);

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

  const handleToggleEnabled = async (val: boolean) => {
    if (!tgSettings) return;
    const next = { ...tgSettings, enabled: val };
    setTgSettings(next);
    await saveTelegramConfigDB(next);
    showToast(
      val
        ? t('telegram_notifications_enabled_toast', 'Telegram notifications enabled')
        : t('telegram_notifications_disabled_toast', 'Telegram notifications disabled'),
      { type: 'success' }
    );
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

  const handleSaveActiveTemplate = () => {
    setSaveStatus('Saving...');
    fetch('/php/telegram/manager.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'save_template',
        template_key: currentTpl.dbKey,
        content: currentTpl.template,
        staff_user: getLoggedInUserName(),
      }),
    })
      .then((res) => res.json())
      .then((resData) => {
        if (resData.success || resData.status === 'ok') {
          setSaveStatus('Saved to Database!');
          showToast('Telegram template saved to database!', { type: 'success' });
          invalidateTemplateCache();
          fetchTemplatesFromDB().then(setDbTemplates);
          if (onLogAudit) {
            const currentUserName = getLoggedInUserName();
            onLogAudit(`${currentUserName} updated Telegram template "${currentTpl.eventName}" (${currentTpl.dbKey}) — template content edited and saved to database`, { module: 'telegram_template', status: 'Success', user: currentUserName });
          }
        } else {
          setSaveStatus('Saved locally!');
          showToast('Telegram template saved locally!', { type: 'success' });
        }
        setTimeout(() => setSaveStatus(null), 2500);
      })
      .catch(() => {
        setSaveStatus('Saved locally!');
        showToast('Telegram template saved locally!', { type: 'success' });
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
      .replace(/{room_no}/g, 'Villa 101')
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

  const handleTest = async () => {
    setTestSending(true);
    setTestError(null);
    try {
      const outcome = await onSendTestNotification();
      if (outcome && outcome.success === false) {
        setTestError(outcome.reason || t('telegram_test_ping_failed_generic', 'No group actually received the test message.'));
        return;
      }
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);
    } finally {
      setTestSending(false);
    }
  };

  if (!isEmbedded && !isOpen) return null;

  const contentBody = (
    <div className="space-y-5 w-full">
      {/* Flowbite Standard PageHeader */}
      <PageHeader
        title={t('telegram_template_manager_heading', 'Telegram Notifications')}
        subtitle={t('telegram_page_help', 'Configure automated Telegram notifications for staff groups (Kitchen, Admin, Finances). Manage message wording, variables, and delivery targets.')}
      >
        {!hideRoutingControls && (
          <Button
            size="sm"
            onClick={handleTest}
            disabled={testSending}
            leftIcon={testSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            className={
              testSent
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : testError
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-[#0088cc] hover:bg-[#0077b5] text-white'
            }
          >
            {testSending
              ? t('sending_button', 'Sending...')
              : testSent
              ? t('ping_sent_button', 'Ping Sent!')
              : testError
              ? t('ping_failed_button', 'Ping Failed')
              : t('send_test_ping_button', 'Send Test Telegram Ping')}
          </Button>
        )}
        {!isEmbedded && onClose && (
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </PageHeader>

      {testError && !hideRoutingControls && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
          <span className="font-semibold shrink-0">{t('test_ping_failed_label', 'Test ping failed:')}</span>
          <span>{testError}</span>
        </div>
      )}

      {/* Enable Telegram Notifications Main Page Card */}
      {!hideRoutingControls && (
        <div data-tour="telegram-alerts" className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-[#0088cc] flex items-center justify-center shrink-0 border border-sky-100 dark:border-sky-900">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <span>{t('enable_telegram_notifications_label', 'Enable Telegram Notifications')}</span>
                <span className={`px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider ${
                  tgSettings?.enabled ?? true
                    ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}>
                  {tgSettings?.enabled ?? true ? t('active_status', 'Active') : t('disabled_status', 'Disabled')}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('enable_telegram_description', 'Automatically send real-time alerts for orders, requisitions, and guest transactions to staff Telegram chat groups.')}
              </p>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-3 self-end sm:self-center">
            <ToggleSwitch
              enabled={tgSettings?.enabled ?? true}
              onChange={handleToggleEnabled}
            />
          </div>
        </div>
      )}

      {/* Read-only per-channel connection status (White-Glove, 26 Aug 2026) - replaces
          the old self-service TelegramSetupWizard entirely. The property owner never
          sees a pairing code here, only "connected" or "not set up - contact support";
          actual pairing happens exclusively from Root Admin's TelegramPairingPanel. */}
      {!hideRoutingControls && (
        <TelegramConnectionStatus config={tgSettings} kitchenModuleEnabled={kitchenEnabled} />
      )}

      {/* Category Tabs - attached to the card below, same "sits directly on
          the card" treatment as every other tab bar in the app (see
          DESIGN.md's "Attached Tabs Specification" / utils/tabsTheme.ts). */}
      <div>
        <Tabs
          aria-label="Telegram Notification Category Tabs"
          variant="default"
          theme={attachedTabsTheme}
          clearTheme={attachedTabsClearTheme}
          onActiveTabChange={(tabIndex: number) => {
            const cats = ['Kitchen', 'Admin', 'Finances'] as const;
            if (cats[tabIndex]) {
              setTemplateSearch('');
              setActiveCategory(cats[tabIndex]);
            }
          }}
        >
          {(['Kitchen', 'Admin', 'Finances'] as const).map((cat) => {
            const count = templatesList.filter((tpl) => getTemplateGroup(tpl) === cat).length;
            return (
              <TabItem
                key={cat}
                active={activeCategory === cat}
                title={
                  <span className="inline-flex items-center gap-1.5">
                    <span>{cat}</span>
                    {count > 0 && (
                      <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-2xs font-semibold rounded-full bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-300">
                        {count}
                      </span>
                    )}
                  </span>
                }
              />
            );
          })}
        </Tabs>

        <div className="bg-white dark:bg-slate-900 rounded-lg rounded-t-none border border-t-0 border-slate-200 dark:border-slate-800 shadow-xs -mt-px overflow-hidden">
          {/* Keyword Search */}
          <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder={t('search_templates_placeholder', 'Search templates...')}
                className="w-full h-9 text-xs font-medium pl-9 pr-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0088cc]"
              />
              {templateSearch && (
                <button
                  type="button"
                  onClick={() => setTemplateSearch('')}
                  title={t('clear_search_tooltip', 'Clear search')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Template List */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {displayedTemplates.map((tpl) => (
              <div
                key={tpl.id}
                className="p-3.5 sm:p-4 transition-all flex items-center justify-between gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-sky-50 dark:bg-sky-950/60 text-[#0088cc] border border-sky-100 dark:border-sky-900">
                    <Send className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                      {tpl.eventName}
                    </h4>
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {tpl.category}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* View / Edit Action Button */}
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTemplateId(tpl.id);
                      setIsEditDrawerOpen(true);
                    }}
                    leftIcon={canEditTemplates ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  >
                    {canEditTemplates ? t('edit_button', 'Edit') : t('view_button', 'View')}
                  </Button>

                {/* Move to Group Dropdown */}
                <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                  <Dropdown
                    placement="bottom-end"
                    dismissOnClick
                    label=""
                    className="z-60 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden text-xs p-1 min-w-28"
                    renderTrigger={() => (
                      <button
                        type="button"
                        title={t('move_template_group_tooltip', 'Move to a different group')}
                        className="h-7 px-2.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-sky-400 flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <span>{t(`template_group_${getTemplateGroup(tpl).toLowerCase()}`, getTemplateGroup(tpl))}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </button>
                    )}
                  >
                    {(['Kitchen', 'Admin', 'Finances'] as const).map((g) => (
                      <DropdownItem
                        key={g}
                        onClick={() => handleMoveTemplateGroup(tpl, g)}
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs rounded-md ${
                          getTemplateGroup(tpl) === g
                            ? 'bg-sky-50 dark:bg-sky-950/50 text-[#0088cc] font-semibold'
                            : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <span>{t(`template_group_${g.toLowerCase()}`, g)}</span>
                        {getTemplateGroup(tpl) === g && <Check className="w-3.5 h-3.5 text-[#0088cc]" />}
                      </DropdownItem>
                    ))}
                  </Dropdown>
                </div>
              </div>
            </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active Template Editor & Live Preview - opens as its own Drawer
            when a template is clicked above. z-60: a secondary drawer meant
            to stack above an already-open page modal/drawer, per the
            app-wide z-index scale documented in custom.css (this component
            is itself rendered inside an outer Drawer when opened from the
            Header's Telegram icon, isEmbedded=false - z-58 - so the editor
            needs to sit visibly above that, not compete with it). */}
        <Drawer
          open={isEditDrawerOpen}
          onClose={() => setIsEditDrawerOpen(false)}
          position="right"
          className="z-60 w-full sm:max-w-2xl lg:max-w-3xl p-0 bg-slate-50 dark:bg-slate-800/60 shadow-2xl flex flex-col"
        >
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Header: title/description + close are always shown (a view-only
              user still needs to know what they're looking at and how to
              close it) - only the Save button is edit-gated. Close stays
              pinned top-right on every screen width (items-start, no
              flex-col mobile stacking) to match every other drawer in this
              app - it was dropping to its own row below the title on
              narrow viewports before. */}
          <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
            <div className="min-w-0">
              <h3 className="telegram-notification-modal__subtitle text-base font-semibold text-slate-900 dark:text-white m-0 truncate">
                {currentTpl.eventName}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 m-0 pt-0.5">
                {currentTpl.description}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsEditDrawerOpen(false)}
              title={t('close_editor_tooltip', 'Close editor')}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {canEditTemplates && (
            <div className="flex items-center justify-end gap-2 -mt-2">
              {saveStatus && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold animate-fade-in flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {saveStatus}
                </span>
              )}
                <button
                  type="button"
                  onClick={handleSaveActiveTemplate}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{t('save_changes_button', 'Save Changes')}</span>
                </button>
            </div>
          )}

          {/* Per-template Telegram routing: which group receives this specific
              notification. Gated on canManageRouting, which is now the exact
              same check as canEditTemplates (26 Aug 2026 correction) - a
              property with customization switched off shouldn't let its
              Admin/Super Admin repoint a message to a different group either,
              even though that's not editing the message's wording. Also not
              shown at all when editing the shared template set with no real
              property context (hideRoutingControls). */}
          {!hideRoutingControls && canManageRouting && (
          <div className="flex items-center gap-2 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 rounded-lg px-3 py-2">
            <Send className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0">{t('send_to_label', 'Send to:')}</label>
            {tgSettings ? (
              <StyledSelect
                className="flex-1"
                value={tgSettings.routing[currentTpl.dbKey] ?? ''}
                onChange={(value) => setTemplateRouting(currentTpl.dbKey, value)}
                disabled={tgRoutingSaving}
                options={[
                  {
                    value: '',
                    // No explicit per-template override saved - the backend
                    // (sender.php) auto-routes by category bucket (Kitchen/
                    // Admin/Finances -> the property's group literally keyed
                    // 'kitchen'/'admin'/'finance'), same as the Setup Wizard's
                    // 3 core groups. Reflect that real destination here
                    // instead of claiming "Not sent" when it will actually go
                    // out - this option only means "no per-template override".
                    label: (() => {
                      const defaultKey = { Kitchen: 'kitchen', Admin: 'admin', Finances: 'finance' }[getTemplateGroup(currentTpl)];
                      const defaultGroup = tgSettings.groups.find((g) => g.key === defaultKey && g.chatId);
                      if (defaultGroup) return t('auto_default_group_option', 'Auto ({group})').replace('{group}', defaultGroup.name);
                      return tgSettings.groups.filter(g => g.chatId).length === 0 ? t('no_groups_found_option', 'No groups found') : t('not_sent_option', 'Not sent');
                    })(),
                  },
                  // Explicit per-template pin, listed separately from the "Auto"
                  // default above (even when it points at the same group) so the
                  // two read as distinct choices - "follow the category default"
                  // vs. "always use this exact group, even if the default changes".
                  ...tgSettings.groups.map((g) => ({ value: g.key, label: t('pin_to_group_option', 'Always: {group}').replace('{group}', g.name) })),
                ]}
              />
            ) : (
              <span className="text-[11px] text-slate-400">Loading…</span>
            )}
            {tgRoutingSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-500 shrink-0" />}
          </div>
          )}

          {/* Everything below (variables, WYSIWYG editor) is edit-only - a
              view-only user only sees the header, the routing control above,
              and the read-only preview further down. */}
          {canEditTemplates && (
          <>
          {/* Insert Available Variables */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
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
                  className="variable-chip text-[11px] font-mono border px-2.5 py-1 rounded-lg transition-all cursor-grab active:cursor-grabbing active:scale-95 font-semibold shadow-xs"
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
                  className="p-1.5 rounded-md bg-white dark:bg-slate-800 text-slate-800 dark:text-white hover:bg-slate-100 font-semibold text-xs flex items-center gap-1 border border-slate-300 dark:border-slate-600 cursor-pointer"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>

                {/* Italic */}
                <button
                  type="button"
                  onClick={() => formatCommand('italic')}
                  title={t('italic_tooltip', 'Italic <i> (Ctrl+I)')}
                  className="p-1.5 rounded-md bg-white dark:bg-slate-800 text-slate-800 dark:text-white hover:bg-slate-100 italic font-semibold text-xs flex items-center gap-1 border border-slate-300 dark:border-slate-600 cursor-pointer"
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
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all flex items-center gap-1 cursor-pointer ${
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
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all flex items-center gap-1 cursor-pointer ${
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
              <Textarea
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

          </>
          )}

          {/* Live Dark Telegram Preview */}
          <div className="space-y-1.5 pt-1">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>{t('live_preview_heading', 'POS Notification Bot (Live Dark Telegram Preview)')}</span>
            </div>

            <div className="bg-[#17212b] rounded-lg p-4 border border-slate-800 text-white shadow-lg space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <div className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center text-xs font-semibold">
                  AF
                </div>
                <div>
                  <span className="text-xs font-semibold block leading-none">{t('bot_name_label', 'Ground Code Bot')}</span>
                  <span className="text-[9px] text-slate-400">{t('bot_service_label', 'bot service')}</span>
                </div>
              </div>

              {/* Rendered Text Bubble */}
              <div
                className="bg-[#242f3d] rounded-lg p-3.5 text-xs font-sans leading-relaxed text-slate-100 whitespace-pre-wrap border border-slate-700/60 shadow-xs"
                dangerouslySetInnerHTML={{ __html: renderPreviewMessage(currentTpl.template) }}
              />

              <div className="text-right text-[10px] text-slate-400 font-mono pt-1 flex items-center justify-end gap-1">
                <span>05:25 PM</span>
                <Check className="w-3 h-3 text-sky-500" />
                <Check className="w-3 h-3 text-sky-500 -ml-2.5" />
              </div>
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );

  if (isEmbedded) {
    return (
      <>
        {contentBody}
      </>
    );
  }

  return (
    <Drawer
      open={isOpen ?? true}
      onClose={onClose}
      position="right"
      className="z-58 w-full sm:max-w-4xl lg:max-w-5xl p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between telegram-notification-modal__root"
    >
      <div className="flex-1 overflow-y-auto">
        {contentBody}
      </div>
    </Drawer>
  );
};

