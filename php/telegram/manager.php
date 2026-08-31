<?php
/**
 * Telegram Template Manager Endpoint & Dashboard Handler
 * Supports both MySQL PDO database (system_telegram_templates) and JSON fallback
 */

// Include DB config if present
if (file_exists(__DIR__ . '/../config/database.php')) {
    require_once __DIR__ . '/../config/database.php';
} elseif (file_exists(__DIR__ . '/../config/db.php')) {
    require_once __DIR__ . '/../config/db.php';
}
require_once __DIR__ . '/../config/schema_cache.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// 1. Self-heal: system_telegram_templates.group_override lets a template be
// manually reassigned to a different Templates Catalog tab (Kitchen/Admin/
// Finances) from the "move to group" dropdown, overriding the automatic
// dbKey/category keyword classification in getTemplateGroup() on the
// frontend. NULL = no override, use the automatic classification.
if (isset($pdo) && !isSchemaVerified('schema_telegram_templates_group_override')) {
    try {
        $col = $pdo->query("SHOW COLUMNS FROM system_telegram_templates LIKE 'group_override'")->fetch();
        if (!$col) {
            $pdo->exec("ALTER TABLE system_telegram_templates ADD COLUMN group_override VARCHAR(20) NULL DEFAULT NULL");
        }
        markSchemaVerified('schema_telegram_templates_group_override');
    } catch (Exception $e) {
        error_log("Telegram template table error: " . $e->getMessage());
    }
}

$templatesFile = __DIR__ . '/templates.json';

// Default templates seed
$defaultTemplates = [
    'finance_drawer_adjustment' => [
        'template_key' => 'finance_drawer_adjustment',
        'title' => 'Cash Drawer Adjustment',
        'category' => 'Billing & Financial',
        'description' => 'Sent to Finance group when cash drawer additions or payouts occur.',
        'available_variables' => '{staff_name},{action_type},{amount},{handed_to},{remarks},{net_balance_after}',
        'content' => "🏧 <b>FINANCIAL TRANSACTION (DRAWER ADJUSTMENT)</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Staff Handler:</b> {staff_name}\n🔄 <b>Action Type:</b> {action_type}\n🤝 <b>Handed To:</b> {handed_to}\n📝 <b>Remarks:</b> {remarks}\n💰 <b>Amount Movement:</b> ₹{amount}\n━━━━━━━━━━━━━━━━━━\n📊 <b>Net Balance After: ₹{net_balance_after}</b>"
    ],
    'finance_operational_expense' => [
        'template_key' => 'finance_operational_expense',
        'title' => 'Operational Expense Alert',
        'category' => 'Billing & Financial',
        'description' => 'Sent to Finance group when an operational or farm utility expense is recorded.',
        'available_variables' => '{expense_date},{category},{paid_by},{description},{payment_mode},{amount}',
        'content' => "💸 <b>NEW FINANCIAL TRANSACTION (EXPENSE)</b>\n━━━━━━━━━━━━━━━━━━\n📅 <b>Date:</b> {expense_date}\n🗂️ <b>Category:</b> {category}\n👤 <b>Paid By:</b> {paid_by}\n📝 <b>Details:</b> {description}\n💳 <b>Method:</b> {payment_mode}\n━━━━━━━━━━━━━━━━━━\n🔴 <b>DEBIT AMOUNT: ₹{amount}</b>"
    ],
    'kitchen_new_order' => [
        'template_key' => 'kitchen_new_order',
        'title' => 'New Order Alert (Kitchen)',
        'category' => 'Kitchen & Ordering',
        'description' => 'Sent to kitchen staff when a new food order ticket is placed.',
        'available_variables' => '{order_id},{guest_name},{order_time},{order_items}',
        'content' => "<b>🔔 NEW ORDER #{order_id}</b>\n<b>Table / Guest:</b> {guest_name}\n<b>Items:</b>\n{order_items}\n\n<i>Time: {order_time}</i>"
    ],
    'kitchen_single_dish_ready' => [
        'template_key' => 'kitchen_single_dish_ready',
        'title' => 'Dish Ready to Serve',
        'category' => 'Kitchen & Ordering',
        'description' => 'Sent when an individual dish is marked ready for pickup by the kitchen.',
        'available_variables' => '{order_id},{qty},{dish_name},{instruction_note}',
        'content' => "🍽️ <b>DISH READY TO SERVE</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Order Ticket:</b> #{order_id}\n• <b>{qty}x</b> {dish_name}{instruction_note}\n━━━━━━━━━━━━━━━━━━\n🏃‍♂️ <i>Staff, please collect and tap below when served.</i>"
    ],
    'item_served' => [
        'template_key' => 'item_served',
        'title' => 'Item Served Alert',
        'category' => 'Kitchen Notifications',
        'description' => 'Sent when a chef or waiter marks an individual item as served.',
        // 23 Aug 2026: was {table_no}, but every real caller (KitchenManagement.tsx's
        // servedVars) only ever supplies room_no - {table_no} could never resolve,
        // so it was silently dropped (or shown literally before the placeholder-
        // stripping safety net existed). Also split Guest/Room onto independent
        // rows per explicit request, instead of "(Table ...)" inlined after the name.
        'available_variables' => '{item_name},{quantity},{guest_name},{room_no},{served_by},{remaining_items}',
        'content' => "<b>✅ DISH SERVED</b>\n\n<b>Dish:</b> {item_name} x{quantity}\n<b>Guest:</b> {guest_name}\n<b>Room:</b> {room_no}\n<b>Served By:</b> {served_by}\n<i>Remaining items in ticket: {remaining_items}</i>"
    ],
    'requisition_stock_fulfilled' => [
        'template_key' => 'requisition_stock_fulfilled',
        'title' => 'Stock Requisition Fulfilled',
        'category' => 'Requisitions & Inventory',
        'description' => 'Sent when a store inventory requisition is fulfilled or issued.',
        'available_variables' => '{req_id},{staff_name},{fulfillment_time},{status_label},{items_manifest},{status_title}',
        'content' => "📦 <b>STOCK {status_title}</b>\n━━━━━━━━━━━━━━━━━━\n🆔 <b>Sheet ID:</b> #{req_id}\n👤 <b>Processed By:</b> {staff_name}\n📅 <b>Fulfillment Time:</b> {fulfillment_time}\n🟢 <b>Global Status:</b> {status_label}\n━━━━━━━━━━━━━━━━━━\n📝 <b>Items Variance Manifest:</b>\n\n{items_manifest}"
    ],
    'requisition_material_request' => [
        'template_key' => 'requisition_material_request',
        'title' => 'Material / Stock Request',
        'category' => 'Requisitions & Inventory',
        'description' => 'Sent when kitchen staff submits a store material or stock request.',
        'available_variables' => '{staff_name},{request_time},{items_list},{custom_notes}',
        'content' => "📦 <b>MATERIAL REQUEST</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>By:</b> {staff_name}\n📅 <b>At:</b> {request_time}\n\n📝 <b>Items List Required:</b>\n{items_list}\n\n💬 <b>Special / Ad-Hoc Requests:</b>\n{custom_notes}\n━━━━━━━━━━━━━━━━━━"
    ],
    'kitchen_requisition_approved' => [
        'template_key' => 'kitchen_requisition_approved',
        'title' => 'Requisition Approved',
        'category' => 'Requisitions & Inventory',
        'description' => 'Sent when a kitchen material requisition is approved and released from store.',
        'available_variables' => '{req_id},{item_name},{qty},{unit},{requested_by}',
        'content' => "✅ <b>MATERIAL REQUISITION APPROVED #{req_id}</b>\n• Material: <b>{item_name}</b> ({qty} {unit})\n• Requested By: <b>{requested_by}</b>\n• Status: Released & Fulfilled from Store ✓"
    ],
    'checkout_settlement_bill' => [
        'template_key' => 'checkout_settlement_bill',
        'title' => 'Guest Checkout Bill',
        'category' => 'Billing & Financial',
        'description' => 'Itemized settlement bill sent to finance group upon guest checkout.',
        // Resident/Room split onto independent rows 23 Aug 2026 (explicit
        // request), was "Resident: {guest_name} (Room {room_number})" inline.
        'available_variables' => '{guest_name},{room_number},{receipt_id},{items_charges},{advance_paid},{balance_due},{total_bill},{payment_mode}',
        'content' => "🧾 <b>FULLY ITEMIZED SETTLEMENT BILL</b>\n  Resident: <b>{guest_name}</b>\n  Room: <b>{room_number}</b>\n  Receipt: #{receipt_id}\n\n<b>ITEMIZED CHARGES:</b>\n{items_charges}\n<b>SUMMARY:</b>\n  Advance Paid: <b>₹{advance_paid}</b>\n  Final Balance Due: <b>₹{balance_due}</b>\n  Total Bill: <b>₹{total_bill}</b>\n  Payment Mode: <b>{payment_mode}</b>"
    ],
    'kitchen_order_status' => [
        'template_key' => 'kitchen_order_status',
        'title' => 'Kitchen Order Status Update',
        'category' => 'Kitchen & Ordering',
        'description' => 'Sent when a kitchen order status changes (Preparing, Fulfilled, Cancelled).',
        'available_variables' => '{status_emoji},{status},{order_id},{guest_info},{items_list},{ticket_total},{placed_at},{status_detail}',
        'content' => "{status_emoji} <b>KITCHEN ORDER {status} #{order_id}</b>\n• Resident: <b>{guest_info}</b>\n• Items Included:\n{items_list}\n• Ticket Total: <b>₹{ticket_total}</b>\n• Placed At: <b>{placed_at}</b>\n• Current Status: <b>{status_detail}</b>"
    ],
    'kitchen_staff_meal' => [
        'template_key' => 'kitchen_staff_meal',
        'title' => 'Staff Duty Meal Dispatched',
        'category' => 'Kitchen & Ordering',
        'description' => 'Sent when a staff duty meal is dispatched from the kitchen.',
        'available_variables' => '{order_id},{beneficiary},{meal_details}',
        'content' => "🍛 <b>STAFF DUTY MEAL DISPATCHED #{order_id}</b>\n• Beneficiary: <b>{beneficiary}</b>\n• Details: <b>{meal_details}</b>\n• Location: <b>Staff Pantry</b>"
    ],
    'material_requisition_single' => [
        'template_key' => 'material_requisition_single',
        'title' => 'Single Material Requisition',
        'category' => 'Requisitions & Inventory',
        'description' => 'Sent when a single material requisition is created from the kitchen dashboard.',
        'available_variables' => '{req_id},{requested_by},{qty},{unit},{item_name},{status}',
        'content' => "📦 <b>NEW MATERIAL REQUISITION SHEET #{req_id}</b>\n• Requested By: <b>{requested_by}</b>\n• Material Item: <b>{qty} {unit}</b> of <b>{item_name}</b>\n• Initial Status: <b>{status}</b>"
    ],
    'inventory_low_stock' => [
        'template_key' => 'inventory_low_stock',
        'title' => 'Low Stock Alert',
        'category' => 'Requisitions & Inventory',
        'description' => 'Sent when an inventory item drops below its minimum threshold.',
        'available_variables' => '{item_name},{current_stock},{unit},{min_threshold}',
        'content' => "⚠️ <b>LOW STOCK WARNING ALERT</b>\n• Inventory Item: <b>{item_name}</b>\n• Current Balance: <b>{current_stock} {unit}</b> (Min Threshold: {min_threshold} {unit})\n• Action Required: Reorder stock from vendor."
    ],
    'finance_petty_cash_expense' => [
        'template_key' => 'finance_petty_cash_expense',
        'title' => 'Petty Cash Expense',
        'category' => 'Billing & Financial',
        'description' => 'Sent to finance group when a petty cash expense or income is recorded.',
        'available_variables' => '{entry_type},{amount},{category},{vendor},{description}',
        'content' => "💰 <b>PETTY CASH {entry_type} RECORDED</b>\n• Amount: <b>₹{amount}</b>\n• Category: <b>{category}</b>\n• Vendor / Payee: <b>{vendor}</b>\n• Description: {description}"
    ],
    'webhook_dish_served_edit' => [
        'template_key' => 'webhook_dish_served_edit',
        'title' => 'Dish Served (Webhook Edit)',
        'category' => 'Telegram Webhooks',
        'description' => 'Edit text applied to the original Telegram message when a dish is marked served via inline button callback.',
        'available_variables' => '{original_text},{staff_name},{serve_time}',
        'content' => "✅ <b>DISH SERVED</b>\n\n{original_text}\n\n👨‍🍳 <b>Served By:</b> {staff_name}\n🕒 <b>At:</b> {serve_time}"
    ],
    'webhook_order_completed' => [
        'template_key' => 'webhook_order_completed',
        'title' => 'Order Completed (Webhook Edit)',
        'category' => 'Telegram Webhooks',
        'description' => 'Edit text applied to the original Telegram message when an entire order is marked completed via inline button callback.',
        'available_variables' => '{original_text},{staff_name},{serve_time}',
        'content' => "✅ <b>ORDER COMPLETED</b>\n\n{original_text}\n\n👨‍🍳 <b>Fulfilled By:</b> {staff_name}\n🕒 <b>At:</b> {serve_time}"
    ],
    'kitchen_order_reminder' => [
        'template_key' => 'kitchen_order_reminder',
        'title' => 'Kitchen Order Reminder',
        'category' => 'Kitchen & Ordering',
        'description' => 'Manual nudge sent to the kitchen when an order item has been pending too long.',
        // Room split onto its own row 23 Aug 2026 (was "{dish_name} ({room_no})"
        // inline). Closing emoji also swapped from the 3-codepoint ZWJ sequence
        // 👨‍🍳 to plain 🔍 - that ZWJ sequence has no restoreEmojis() coverage
        // below (unlike every other 👨‍🍳/🏃‍♂️ usage, which was long ago swapped to
        // a single-codepoint icon after being found broken) and was reported
        // showing as a bare "?" on staging; a single-codepoint emoji can't
        // partially mangle the way a multi-codepoint sequence can.
        'available_variables' => '{order_id},{qty},{dish_name},{room_no},{elapsed_minutes}',
        'content' => "⏰ <b>KITCHEN REMINDER</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Order Ticket:</b> #{order_id}\n• <b>{qty}x</b> {dish_name}\n🚪 <b>Room:</b> {room_no}\n⏱️ <b>Pending for:</b> {elapsed_minutes} min\n━━━━━━━━━━━━━━━━━━\n🔍 <i>Please check on this order.</i>"
    ],
    'kitchen_pickup_reminder' => [
        'template_key' => 'kitchen_pickup_reminder',
        'title' => 'Ready-for-Pickup Reminder',
        'category' => 'Kitchen & Ordering',
        'description' => 'Manual nudge sent to Admin when a ready dish has not been collected/served yet.',
        // Room split onto its own row 23 Aug 2026, same as kitchen_order_reminder above.
        'available_variables' => '{order_id},{qty},{dish_name},{room_no},{ready_since}',
        'content' => "⏰ <b>STILL WAITING FOR PICKUP</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Order Ticket:</b> #{order_id}\n• <b>{qty}x</b> {dish_name}\n🚪 <b>Room:</b> {room_no}\n⏱️ <b>Ready since:</b> {ready_since}\n━━━━━━━━━━━━━━━━━━\n🏃 <i>Please collect and tap below when served.</i>"
    ],
    'checkin_verification_complete' => [
        'template_key' => 'checkin_verification_complete',
        'title' => 'Check-in ID Verification Complete',
        'category' => 'Guest Check-in',
        'description' => 'Sent to Admin with the uploaded ID photo(s) attached the moment a booking\'s check-in verification is completed.',
        'available_variables' => '{guest_name},{room_name},{doc_count}',
        'content' => "✅ <b>CHECK-IN VERIFICATION COMPLETE</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Guest:</b> {guest_name}\n🚪 <b>Room:</b> {room_name}\n🪪 <b>ID Document(s):</b> {doc_count}"
    ],
    'checkin_verification_reminder' => [
        'template_key' => 'checkin_verification_reminder',
        'title' => 'Next-Morning Pending ID Verification',
        'category' => 'Guest Check-in',
        'description' => 'Daily nudge sent to Admin for bookings still missing required ID documents the morning after check-in.',
        'available_variables' => '{guest_name},{room_name},{uploaded_count},{required_count},{checkin_date}',
        'content' => "🪪 <b>ID VERIFICATION STILL PENDING</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Guest:</b> {guest_name}\n🚪 <b>Room:</b> {room_name}\n📅 <b>Checked In:</b> {checkin_date}\n📋 <b>Uploaded:</b> {uploaded_count}/{required_count}\n━━━━━━━━━━━━━━━━━━\n👉 <i>Open Complete Check-in for this booking to finish it.</i>"
    ],
    'service_request_created' => [
        'template_key' => 'service_request_created',
        'title' => 'New Service Request',
        'category' => 'Guest Services',
        'description' => 'Sent to Admin with a "Mark Fulfilled" button whenever staff log a new housekeeping/maintenance-style guest request.',
        'available_variables' => '{request_type},{room_name},{description},{requested_by}',
        'content' => "🛎️ <b>NEW SERVICE REQUEST</b>\n\n🧾 <b>Type:</b> {request_type}\n🚪 <b>Room:</b> {room_name}\n📝 <b>Details:</b> {description}\n👤 <b>Requested By:</b> {requested_by}"
    ],
    'service_request_fulfilled_edit' => [
        'template_key' => 'service_request_fulfilled_edit',
        'title' => 'Service Request Fulfilled (Message Edit)',
        'category' => 'Guest Services',
        'description' => 'Replaces the original service request message once it\'s marked fulfilled, whether by button tap or from the app.',
        'available_variables' => '{request_type},{room_name},{staff_name},{fulfill_time}',
        'content' => "✅ <b>SERVICE REQUEST FULFILLED</b>\n\n🧾 <b>Type:</b> {request_type}\n🚪 <b>Room:</b> {room_name}\n👤 <b>Fulfilled By:</b> {staff_name}\n🕒 <b>At:</b> {fulfill_time}"
    ],
    'new_guest_booking' => [
        'template_key' => 'new_guest_booking',
        'title' => 'New Guest Booking',
        'category' => 'Guest Check-in',
        'description' => 'Sent to Admin group when a new guest reservation or booking is created.',
        'available_variables' => '{guest_name},{phone},{no_of_guests},{checkin_date},{checkout_date},{total_charge},{advance_paid},{pending_amount},{booking_id}',
        'content' => "🏨 <b>NEW GUEST BOOKING</b>\n\n👤 <b>Guest Name:</b> {guest_name}\n📱 <b>Phone:</b> {phone}\n👥 <b>No. of Guests:</b> {no_of_guests}\n\n📅 <b>Check-in:</b> {checkin_date}\n📅 <b>Check-out:</b> {checkout_date}\n\n💰 <b>Total Charge:</b> ₹{total_charge}\n✅ <b>Advance Paid:</b> ₹{advance_paid}\n⏳ <b>Pending:</b> ₹{pending_amount}\n\n🆔 <b>Booking ID:</b> {booking_id}"
    ],
    'booking_updated' => [
        'template_key' => 'booking_updated',
        'title' => 'Booking Updated',
        'category' => 'Guest Check-in',
        'description' => 'Sent to the Admin group whenever a booking is edited. Shows only the fields that actually changed (old → new).',
        'available_variables' => '{guest_name},{booking_id},{changes_list}',
        'content' => "✏️ <b>BOOKING UPDATED</b>\n\n👤 <b>Guest:</b> {guest_name}\n🆔 <b>Booking ID:</b> {booking_id}\n\n{changes_list}"
    ],
    'checkout_day_reminder' => [
        'template_key' => 'checkout_day_reminder',
        'title' => 'Departure Day Reminder',
        'category' => 'Guest Check-in',
        'description' => 'Sent to Admin with a "Mark Checked-Out" button on a guest\'s expected checkout date, and daily after if they\'re still checked in.',
        'available_variables' => '{guest_name},{room_name},{checkout_date}',
        'content' => "🚪 <b>DEPARTURE DAY</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Guest:</b> {guest_name}\n🚪 <b>Room:</b> {room_name}\n📅 <b>Expected Checkout:</b> {checkout_date}\n━━━━━━━━━━━━━━━━━━\n👉 <i>Tap below once the guest has left.</i>"
    ],
    'room_needs_cleaning' => [
        'template_key' => 'room_needs_cleaning',
        'title' => 'Room Needs Cleaning',
        'category' => 'Kitchen & Ordering',
        'description' => 'Sent to Admin with a "Mark Room Ready" button the moment a guest checks out of a room.',
        'available_variables' => '{room_name}',
        'content' => "🧹 <b>ROOM NEEDS CLEANING</b>\n━━━━━━━━━━━━━━━━━━\n🚪 <b>Room:</b> {room_name}\n━━━━━━━━━━━━━━━━━━\n👉 <i>Tap below once it's cleaned and ready for the next guest.</i>"
    ],
    'daily_operations_digest' => [
        'template_key' => 'daily_operations_digest',
        'title' => "Tomorrow's Arrivals & Departures",
        'category' => 'Cron & Notifications',
        'description' => 'Nightly summary (default 10pm) of every guest arriving or departing tomorrow, sent to Admin and Kitchen. Skipped entirely on a day with neither.',
        'available_variables' => '{arrivals_count},{arrivals_list},{departures_count},{departures_list}',
        'content' => "📋 <b>TOMORROW'S ARRIVALS &amp; DEPARTURES</b>\n━━━━━━━━━━━━━━━━━━\n🛎️ <b>Arriving ({arrivals_count}):</b>\n{arrivals_list}\n\n🚪 <b>Departing ({departures_count}):</b>\n{departures_list}"
    ]
];

// Ensure any template added after the table was first seeded (the seed above
// only ever runs against a fully empty table) still gets inserted.
if (isset($pdo)) {
    try {
        $existingKeysStmt = $pdo->query("SELECT template_key FROM system_telegram_templates");
        $existingKeys = $existingKeysStmt->fetchAll(PDO::FETCH_COLUMN);
        $missing = array_diff(array_keys($defaultTemplates), $existingKeys);
        if (!empty($missing)) {
            $ins = $pdo->prepare("INSERT INTO system_telegram_templates (template_key, title, category, description, available_variables, content) VALUES (?, ?, ?, ?, ?, ?)");
            foreach ($missing as $key) {
                $dt = $defaultTemplates[$key];
                $ins->execute([$dt['template_key'], $dt['title'], $dt['category'], $dt['description'], $dt['available_variables'], $dt['content']]);
            }
        }
    } catch (Exception $e) {
        error_log("Failed to backfill missing telegram templates: " . $e->getMessage());
    }
}

$action = $_POST['action'] ?? $_GET['action'] ?? 'get_templates';

if ($action === 'get_templates') {
    $templates = [];

    if (isset($pdo)) {
        try {
            $stmt = $pdo->query("SELECT * FROM system_telegram_templates ORDER BY category ASC, title ASC");
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Seed DB if table is empty
            if (empty($rows)) {
                $ins = $pdo->prepare("INSERT INTO system_telegram_templates (template_key, title, category, description, available_variables, content) VALUES (?, ?, ?, ?, ?, ?)");
                foreach ($defaultTemplates as $dt) {
                    $ins->execute([$dt['template_key'], $dt['title'], $dt['category'], $dt['description'], $dt['available_variables'], $dt['content']]);
                }
                $rows = $pdo->query("SELECT * FROM system_telegram_templates ORDER BY category ASC, title ASC")->fetchAll(PDO::FETCH_ASSOC);
            }

            require_once __DIR__ . '/templates.php';
            foreach ($rows as $r) {
                if (class_exists('TelegramTemplates') && method_exists('TelegramTemplates', 'restoreEmojis')) {
                    $cleanContent = TelegramTemplates::restoreEmojis($r['content']);
                    if ($cleanContent !== $r['content']) {
                        try {
                            $upd = $pdo->prepare("UPDATE system_telegram_templates SET content = ? WHERE id = ?");
                            $upd->execute([$cleanContent, $r['id']]);
                            $r['content'] = $cleanContent;
                        } catch (Exception $ex) {}
                    }
                }
                $templates[$r['template_key']] = $r;
            }
        } catch (Exception $e) {
            error_log("Failed to fetch templates from DB: " . $e->getMessage());
        }
    }

    if (empty($templates)) {
        if (!file_exists($templatesFile)) {
            file_put_contents($templatesFile, json_encode($defaultTemplates, JSON_PRETTY_PRINT));
        }
        $templates = json_decode(file_get_contents($templatesFile), true) ?: $defaultTemplates;
    }

    echo json_encode([
        'success' => true,
        'templates' => $templates
    ]);
    exit();
}

if ($action === 'save_template') {
    $key = trim($_POST['template_key'] ?? '');
    $content = trim($_POST['content'] ?? '');
    $staffUser = trim($_POST['staff_user'] ?? 'Admin');

    if (!$key || !$content) {
        echo json_encode(['success' => false, 'message' => 'Template key and content cannot be empty.']);
        exit();
    }

    $saved = false;
    $oldContent = null;
    $templateTitle = $key;

    // Fetch old content BEFORE updating for audit trail
    if (isset($pdo)) {
        try {
            $fetchOld = $pdo->prepare("SELECT content, title FROM system_telegram_templates WHERE template_key = ? LIMIT 1");
            $fetchOld->execute([$key]);
            $oldRow = $fetchOld->fetch(PDO::FETCH_ASSOC);
            if ($oldRow) {
                $oldContent = $oldRow['content'];
                $templateTitle = $oldRow['title'] ?: $key;
            }
        } catch (Exception $e) {}
    }

    if (isset($pdo)) {
        try {
            $stmt = $pdo->prepare("UPDATE system_telegram_templates SET content = ? WHERE template_key = ?");
            $stmt->execute([$content, $key]);
            if ($stmt->rowCount() > 0) {
                $saved = true;
            }
        } catch (Exception $e) {
            error_log("DB update error: " . $e->getMessage());
        }
    }

    // Also update JSON fallback file
    if (file_exists($templatesFile)) {
        $jsonTemplates = json_decode(file_get_contents($templatesFile), true) ?: [];
        if (isset($jsonTemplates[$key])) {
            $jsonTemplates[$key]['content'] = $content;
            file_put_contents($templatesFile, json_encode($jsonTemplates, JSON_PRETTY_PRINT));
            $saved = true;
        }
    }

    // Write detailed audit log entry with before/after state
    if (isset($pdo) && $saved) {
        try {
            $oldPreview = $oldContent ? substr($oldContent, 0, 500) : '(no previous content)';
            $newPreview = substr($content, 0, 500);
            $diffNote = ($oldContent && $oldContent !== $content) ? 'Content changed' : (($oldContent === $content) ? 'No content change detected' : 'New template content set');
            $auditAction = "TELEGRAM TEMPLATE EDITED: \"{$templateTitle}\" (key: {$key})\n";
            $auditAction .= "• Operator: {$staffUser}\n";
            $auditAction .= "• Change: {$diffNote}\n";
            $auditAction .= "• OLD CONTENT:\n{$oldPreview}\n";
            $auditAction .= "• NEW CONTENT:\n{$newPreview}";

            $insAudit = $pdo->prepare("INSERT INTO audit_logs (timestamp, user, action, status, module) VALUES (?, ?, ?, ?, ?)");
            $insAudit->execute([
                date('Y-m-d H:i:s'),
                $staffUser,
                $auditAction,
                'Success',
                'telegram_template'
            ]);
        } catch (Exception $e) {
            error_log("Audit log write failed: " . $e->getMessage());
        }
    }

    echo json_encode([
        'success' => true,
        'message' => '✔ Template saved successfully!',
        'updated_key' => $key
    ]);
    exit();
}

if ($action === 'update_template_group') {
    $key = trim($_POST['template_key'] ?? '');
    $group = trim($_POST['group'] ?? '');
    $validGroups = ['Kitchen', 'Admin', 'Finances'];

    if (!$key || !in_array($group, $validGroups, true)) {
        echo json_encode(['success' => false, 'message' => 'Invalid template key or group.']);
        exit();
    }

    $saved = false;
    if (isset($pdo)) {
        try {
            $stmt = $pdo->prepare("UPDATE system_telegram_templates SET group_override = ? WHERE template_key = ?");
            $stmt->execute([$group, $key]);
            $saved = $stmt->rowCount() > 0;
        } catch (Exception $e) {
            error_log("DB update error (group_override): " . $e->getMessage());
        }
    }

    if (file_exists($templatesFile)) {
        $jsonTemplates = json_decode(file_get_contents($templatesFile), true) ?: [];
        if (isset($jsonTemplates[$key])) {
            $jsonTemplates[$key]['group_override'] = $group;
            file_put_contents($templatesFile, json_encode($jsonTemplates, JSON_PRETTY_PRINT));
            $saved = true;
        }
    }

    echo json_encode([
        'success' => $saved,
        'message' => $saved ? '✔ Template moved.' : 'Failed to move template.',
    ]);
    exit();
}

echo json_encode(['success' => false, 'message' => 'Unknown action.']);
