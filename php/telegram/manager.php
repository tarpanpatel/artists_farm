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

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// 1. Ensure MySQL system_telegram_templates table exists if $pdo is available
if (isset($pdo)) {
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS system_telegram_templates (
            template_key VARCHAR(50) PRIMARY KEY,
            title VARCHAR(100) NOT NULL,
            category VARCHAR(50) NOT NULL,
            description TEXT,
            content TEXT NOT NULL,
            available_variables TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
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
        'available_variables' => '{staff_name},{action_type},{remarks},{amount}',
        'content' => "🏧 <b>FINANCIAL TRANSACTION (DRAWER ADJUSTMENT)</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Staff Handler:</b> {staff_name}\n🔄 <b>Action Type:</b> {action_type}\n📝 <b>Remarks:</b> {remarks}\n━━━━━━━━━━━━━━━━━━\n💰 <b>AMOUNT MOVEMENT: ₹{amount}</b>"
    ],
    'finance_operational_expense' => [
        'template_key' => 'finance_operational_expense',
        'title' => 'Operational Expense Alert',
        'category' => 'Billing & Financial',
        'description' => 'Sent to Finance group when an operational or farm utility expense is recorded.',
        'available_variables' => '{expense_date},{category},{paid_by},{description},{payment_mode},{amount}',
        'content' => "💸 <b>NEW FINANCIAL TRANSACTION (EXPENSE)</b>\n━━━━━━━━━━━━━━━━━━\n📅 <b>Date:</b> {expense_date}\n🗂️ <b>Category:</b> {category}\n👤 <b>Paid By:</b> {paid_by}\n📝 <b>Details:</b> {description}\n💳 <b>Method:</b> {payment_mode}\n━━━━━━━━━━━━━━━━━━\n🔴 <b>DEBIT AMOUNT: ₹{amount}</b>"
    ],
    'billing_admin_checkout_report' => [
        'template_key' => 'billing_admin_checkout_report',
        'title' => 'Property Checkout Report',
        'category' => 'Billing & Financial',
        'description' => 'Comprehensive settlement report dispatched to Admin group upon guest checkout.',
        'available_variables' => '{guest_name},{base_rent},{advance_paid},{advance_collector},{accommodation_pending},{pending_collector},{items_list},{food_subtotal},{split_phrases},{cashier_name},{grand_total_due}',
        'content' => "🔔 <b>PROPERTY CHECKOUT SETTLEMENT REPORT</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Guest:</b> {guest_name}\n\n🏠 <b>ACCOMMODATION LOGISTICS:</b>\n• Contract Tariff: ₹{base_rent}\n• Advance Taken: ₹{advance_paid} (By: {advance_collector})\n• Pending Settled: ₹{accommodation_pending} (By: {pending_collector})\n\n🍽️ <b>FINAL ITEMIZED KOT & EXTRAS:</b>\n{items_list}\n• Incidentals Subtotal: <b>₹{food_subtotal}</b>\n\n💳 <b>FINAL PAYOUT SPLIT DISTRIBUTION:</b>\n{split_phrases}\n👤 <i>Desk Cashier Executing: {cashier_name}</i>\n━━━━━━━━━━━━━━━━━━\n<b>GRAND TOTAL PAYABLE SETTLED: ₹{grand_total_due}</b>"
    ],
    'kitchen_new_order' => [
        'template_key' => 'kitchen_new_order',
        'title' => 'New Order Alert (Kitchen)',
        'category' => 'Kitchen & Ordering',
        'description' => 'Sent to kitchen staff when a new food order ticket is placed.',
        'available_variables' => '{order_id},{guest_name},{order_time},{order_items}',
        'content' => "<b>🔔 NEW ORDER #{order_id}</b>\n<b>Table / Guest:</b> {guest_name}\n<b>Items:</b>\n{order_items}\n\n<i>Time: {order_time}</i>"
    ],
    'item_served' => [
        'template_key' => 'item_served',
        'title' => 'Item Served Alert',
        'category' => 'Kitchen Notifications',
        'description' => 'Sent when a chef or waiter marks an individual item as served.',
        'available_variables' => '{item_name},{quantity},{guest_name},{table_no},{served_by},{remaining_items}',
        'content' => "<b>✅ DISH SERVED</b>\n\n<b>Dish:</b> {item_name} x{quantity}\n<b>Guest:</b> {guest_name} (Table {table_no})\n<b>Served By:</b> {served_by}\n<i>Remaining items in ticket: {remaining_items}</i>"
    ]
];

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

            foreach ($rows as $r) {
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

    if (!$key || !$content) {
        echo json_encode(['success' => false, 'message' => 'Template key and content cannot be empty.']);
        exit();
    }

    $saved = false;

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

    echo json_encode([
        'success' => true,
        'message' => '✔ Template saved successfully!',
        'updated_key' => $key
    ]);
    exit();
}

echo json_encode(['success' => false, 'message' => 'Unknown action.']);
