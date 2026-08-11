<?php
/**
 * Database Seeding Script - Phase 1
 * Populates configuration tables that were previously hardcoded in initialData.ts
 *
 * Tables created:
 * - system_roles (if not exists)
 * - ui_configuration (if not exists)
 * - telegram_templates (if not exists)
 */

require_once __DIR__ . '/../config/database.php';

echo "<h1>Phase 1: Database Seeding & Configuration Tables</h1>";

try {
    // ============================================================================
    // TABLE 1: SYSTEM_ROLES
    // ============================================================================
    echo "<h2>1. Creating system_roles table</h2>";

    $pdo->exec("CREATE TABLE IF NOT EXISTS system_roles (
        id INT PRIMARY KEY AUTO_INCREMENT,
        slug VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        display_order INT DEFAULT 0,
        is_active TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");

    $roles = [
        ['super_admin', 'Super Admin', 'Full system access', 1],
        ['admin', 'Admin', 'Property administration', 2],
        ['staff_supervisor', 'Staff Supervisor', 'Staff and operations management', 3],
        ['staff_kitchen', 'Staff Kitchen', 'Kitchen operations only', 4],
        ['staff', 'Staff', 'General staff access', 5],
    ];

    $stmt = $pdo->prepare("INSERT IGNORE INTO system_roles (slug, name, description, display_order) VALUES (?, ?, ?, ?)");
    foreach ($roles as $role) {
        $stmt->execute($role);
    }
    echo "<p>✅ System roles table created/updated</p>";

    // ============================================================================
    // TABLE 2: UI_CONFIGURATION
    // ============================================================================
    echo "<h2>2. Creating ui_configuration table</h2>";

    $pdo->exec("CREATE TABLE IF NOT EXISTS ui_configuration (
        id INT PRIMARY KEY AUTO_INCREMENT,
        config_key VARCHAR(100) UNIQUE NOT NULL,
        config_value LONGTEXT NOT NULL,
        config_type VARCHAR(50) DEFAULT 'json',
        description TEXT,
        is_active TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");

    // Icon configuration
    $icons = [
        'LayoutDashboard', 'Users', 'CreditCard', 'ShoppingCart', 'UtensilsCrossed',
        'ClipboardList', 'Truck', 'CookingPot', 'ShieldCheck', 'Calendar',
        'Receipt', 'TrendingDown', 'Package', 'ShoppingBag', 'Sliders',
        'BarChart3', 'BookOpen', 'Boxes', 'Layers', 'Link', 'DollarSign',
        'FileSpreadsheet', 'Send', 'Paintbrush', 'Wallet'
    ];

    $stmt = $pdo->prepare("INSERT IGNORE INTO ui_configuration (config_key, config_value, config_type, description) VALUES (?, ?, ?, ?)");
    $stmt->execute(['available_icons', json_encode($icons), 'json', 'Available icons for UI components']);

    // Role display configuration
    $roleConfig = ['Super Admin', 'Admin', 'Staff Supervisor', 'Staff Kitchen', 'Staff'];
    $stmt->execute(['available_roles', json_encode($roleConfig), 'json', 'Available user roles']);

    // Navigation page options
    $pageOptions = [
      ['label' => 'Dashboard', 'tabKey' => 'dashboard', 'uniqueKey' => 'dashboard'],
      ['label' => 'Guest Registration', 'tabKey' => 'guests', 'uniqueKey' => 'guest_registration'],
      ['label' => 'All Bookings', 'tabKey' => 'guests', 'uniqueKey' => 'all_bookings'],
      ['label' => 'Take Food Order', 'tabKey' => 'kitchen', 'uniqueKey' => 'take_food_order'],
      ['label' => 'Kitchen Orders', 'tabKey' => 'kitchen', 'uniqueKey' => 'kitchen_orders'],
      ['label' => 'Staff Meals', 'tabKey' => 'kitchen', 'uniqueKey' => 'staff_meals'],
      ['label' => 'Stock Requests', 'tabKey' => 'inventory', 'uniqueKey' => 'stock_requests'],
      ['label' => 'Fulfill Stock Req', 'tabKey' => 'inventory', 'uniqueKey' => 'fulfill_stock_req'],
      ['label' => 'Kitchen Wastage', 'tabKey' => 'inventory', 'uniqueKey' => 'deficit_shortfalls_log'],
      ['label' => 'Kitchen Purchases', 'tabKey' => 'inventory', 'uniqueKey' => 'kitchen_purchases'],
      ['label' => 'Stock Log', 'tabKey' => 'inventory', 'uniqueKey' => 'stock_log'],
      ['label' => 'Expenses', 'tabKey' => 'petty_cash', 'uniqueKey' => 'expenses'],
      ['label' => 'Cash Drawer', 'tabKey' => 'petty_cash', 'uniqueKey' => 'cash_drawer'],
      ['label' => 'Misc Charges', 'tabKey' => 'petty_cash', 'uniqueKey' => 'misc_charges'],
      ['label' => 'Staff & Permissions', 'tabKey' => 'staff', 'uniqueKey' => 'staff_permissions'],
      ['label' => 'Attendance Calendar', 'tabKey' => 'staff', 'uniqueKey' => 'attendance_calendar'],
      ['label' => 'Dashboard Analytics', 'tabKey' => 'analytics', 'uniqueKey' => 'dashboard_analytics'],
      ['label' => 'Purchase Analytics', 'tabKey' => 'analytics', 'uniqueKey' => 'purchase_analytics'],
      ['label' => 'Past Receipts', 'tabKey' => 'audit_logs', 'uniqueKey' => 'past_receipts_log'],
      ['label' => 'Login Logs', 'tabKey' => 'audit_logs', 'uniqueKey' => 'login_logs'],
      ['label' => 'System Health', 'tabKey' => 'audit_logs', 'uniqueKey' => 'system_health'],
      ['label' => 'Telegram Bot', 'tabKey' => 'telegram', 'uniqueKey' => 'telegram'],
      ['label' => 'Edit Food Menu', 'tabKey' => 'menu_manager', 'uniqueKey' => 'edit_food_menu'],
      ['label' => 'Edit Main Menu', 'tabKey' => 'menu_manager', 'uniqueKey' => 'edit_main_menu'],
      ['label' => 'Edit Kitchen Stock', 'tabKey' => 'inventory', 'uniqueKey' => 'edit_kitchen_stock'],
      ['label' => 'Edit Expense Items', 'tabKey' => 'petty_cash', 'uniqueKey' => 'edit_expense_items'],
      ['label' => 'Data Export', 'tabKey' => 'export', 'uniqueKey' => 'data_export_center'],
      ['label' => 'Custom CSS', 'tabKey' => 'custom_css', 'uniqueKey' => 'custom_css'],
      ['label' => 'Recipe Builder', 'tabKey' => 'kitchen', 'uniqueKey' => 'beta_recipe_builder'],
      ['label' => 'Custom URL', 'tabKey' => 'custom', 'uniqueKey' => '']
    ];
    $stmt->execute(['nav_page_options', json_encode($pageOptions), 'json', 'Available navigation page options']);

    // Icon search tags
    $iconTags = [
        ['money' => ['Receipt', 'DollarSign', 'Wallet', 'CreditCard']],
        ['save' => ['Archive', 'Save']],
        ['delete' => ['Trash2', 'X']],
        ['add' => ['Plus', 'PlusCircle']],
        ['edit' => ['Edit2', 'Pencil']],
        ['user' => ['Users', 'User']],
        ['settings' => ['Settings', 'Sliders']],
        ['chart' => ['BarChart3', 'LineChart', 'PieChart']],
        ['menu' => ['Menu', 'List']],
        ['calendar' => ['Calendar']],
    ];
    $stmt->execute(['icon_search_tags', json_encode($iconTags), 'json', 'Search tags for icons']);

    echo "<p>✅ UI configuration table created/updated</p>";

    // ============================================================================
    // TABLE 3: TELEGRAM_TEMPLATES
    // ============================================================================
    echo "<h2>3. Creating telegram_templates table</h2>";

    $pdo->exec("CREATE TABLE IF NOT EXISTS telegram_templates (
        id INT PRIMARY KEY AUTO_INCREMENT,
        template_key VARCHAR(100) UNIQUE NOT NULL,
        template_name VARCHAR(100) NOT NULL,
        message_template LONGTEXT NOT NULL,
        variables LONGTEXT,
        description TEXT,
        is_active TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");

    $templates = [
        [
            'material_requisition_single',
            'Material Requisition',
            '📦 <b>NEW MATERIAL REQUISITION SHEET #{req_id}</b>\n• Requested By: <b>{requested_by}</b>\n• Material Item: <b>{qty} {unit}</b> of <b>{item_name}</b>\n• Initial Status: <b>{status}</b>',
            json_encode(['req_id', 'requested_by', 'qty', 'unit', 'item_name', 'status']),
            'Template for material requisition notifications'
        ],
        [
            'inventory_low_stock',
            'Low Stock Alert',
            '⚠️ <b>LOW STOCK WARNING ALERT</b>\n• Inventory Item: <b>{item_name}</b>\n• Current Balance: <b>{current_stock} {unit}</b> (Min Threshold: {min_threshold} {unit})\n• Action Required: Reorder stock from vendor.',
            json_encode(['item_name', 'current_stock', 'unit', 'min_threshold']),
            'Template for low stock alerts'
        ],
        [
            'kitchen_order_received',
            'Kitchen Order Received',
            '🍽️ <b>NEW KITCHEN ORDER RECEIVED</b>\n• Order ID: <b>{order_id}</b>\n• Guest: <b>{guest_name}</b>\n• Items: {items_count}\n• Status: {status}',
            json_encode(['order_id', 'guest_name', 'items_count', 'status']),
            'Template for new kitchen orders'
        ],
        [
            'finance_petty_cash_expense',
            'Petty Cash Expense',
            '💰 <b>PETTY CASH {entry_type} RECORDED</b>\n• Amount: <b>₹{amount}</b>\n• Category: <b>{category}</b>\n• Vendor / Payee: <b>{vendor}</b>\n• Description: {description}',
            json_encode(['entry_type', 'amount', 'category', 'vendor', 'description']),
            'Template for petty cash transactions'
        ],
    ];

    $stmt = $pdo->prepare("INSERT IGNORE INTO telegram_templates (template_key, template_name, message_template, variables, description) VALUES (?, ?, ?, ?, ?)");
    foreach ($templates as $template) {
        $stmt->execute($template);
    }
    echo "<p>✅ Telegram templates table created/updated</p>";

    // ============================================================================
    // Verification
    // ============================================================================
    echo "<h2>Verification</h2>";

    $roleCount = $pdo->query("SELECT COUNT(*) FROM system_roles")->fetchColumn();
    echo "<p>✅ System roles: $roleCount records</p>";

    $configCount = $pdo->query("SELECT COUNT(*) FROM ui_configuration")->fetchColumn();
    echo "<p>✅ UI configurations: $configCount records</p>";

    $templateCount = $pdo->query("SELECT COUNT(*) FROM telegram_templates")->fetchColumn();
    echo "<p>✅ Telegram templates: $templateCount records</p>";

    echo "<h2 style='color: green;'>✅ Phase 1 Complete!</h2>";
    echo "<p><strong>Next:</strong> Phase 2 will remove initialData.ts and update components to use database</p>";

} catch (Exception $e) {
    echo "<p style='color: red;'>❌ Error: " . htmlspecialchars($e->getMessage()) . "</p>";
    echo "<pre>" . htmlspecialchars($e->getTraceAsString()) . "</pre>";
}
?>
