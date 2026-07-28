<?php
/**
 * Central API Request Router & Dispatcher
 * Artists Farm Resort & Kitchen Management Backend System
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../guests/guests.php';
require_once __DIR__ . '/../billing/billing.php';
require_once __DIR__ . '/../billing/receipts.php';
require_once __DIR__ . '/../kitchen/orders.php';
require_once __DIR__ . '/../kitchen/menu.php';
require_once __DIR__ . '/../inventory/inventory.php';
require_once __DIR__ . '/../finance/ledger.php';
require_once __DIR__ . '/../finance/petty_cash.php';
require_once __DIR__ . '/../staff/staff.php';
require_once __DIR__ . '/../audit/audit.php';
require_once __DIR__ . '/../telegram/telegram.php';

// Simple API Key Authentication
$api_key = getenv('API_KEY') ?: 'artists-farm-secure-key-2026';
$provided_key = $_SERVER['HTTP_X_API_KEY'] ?? $_GET['api_key'] ?? '';
$public_actions = ['get_menu', 'get_guests', 'get_orders', 'get_inventory', 'get_audit_logs', 'get_staff', 'get_users', 'get_petty_cash', 'get_financial_ledger', 'get_receipts', 'get_expense_items', 'get_misc_catalog', 'get_material_categories', 'get_cash_drawer_summary', 'get_drawer_entries', 'get_stock_requests', 'get_wastage_logs', 'get_kitchen_purchases', 'get_payees', 'get_attendance', 'get_expense_item_prices', 'get_nav_menu'];

$request_method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';

// Require API key for write/delete actions
$is_write_action = in_array($request_method, ['POST', 'PUT', 'DELETE']);
if ($is_write_action && $provided_key !== $api_key) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized. Valid API key required for write operations.']);
    exit;
}

switch ($action) {
    // --- GUESTS ---
    case 'get_guests':
    case 'add_guest':
    case 'checkout_guest':
        handleGuestRequests($pdo, $request_method, $action);
        break;

    // --- BILLING & CHECKOUT ---
    case 'add_direct_food_incidentals':
    case 'add_adjustment':
    case 'finalize_checkout':
        handleBillingRequests($pdo, $request_method, $action);
        break;

    case 'get_receipts':
    case 'save_receipt':
        handleReceiptRequests($pdo, $request_method, $action);
        break;

    // --- KITCHEN ORDERS & MENU ---
    case 'get_orders':
    case 'create_order':
    case 'update_order_status':
    case 'get_served_logs':
    case 'add_served_log':
        handleKitchenRequests($pdo, $request_method, $action);
        break;

    case 'get_menu':
    case 'add_menu_item':
    case 'update_menu_item':
    case 'delete_menu_item':
    case 'dedup_menu':
    case 'get_nav_menu':
    case 'save_nav_menu':
        handleMenuRequests($pdo, $request_method, $action);
        break;

    // --- INVENTORY & STOCK ---
    case 'get_inventory':
    case 'update_stock':
    case 'get_stock_requests':
    case 'create_stock_request':
    case 'update_stock_request_status':
    case 'get_wastage_logs':
    case 'create_wastage_log':
    case 'get_kitchen_purchases':
    case 'create_kitchen_purchase':
    case 'bulk_update_kitchen_purchases':
    case 'delete_kitchen_purchase':
    case 'get_material_categories':
    case 'update_material_category':
    case 'delete_material_category':
    case 'add_material_category':
    case 'toggle_ingredient_category':
    case 'add_catalog_item':
    case 'update_catalog_item':
    case 'delete_catalog_item':
    case 'bulk_update_catalog_category':
    case 'seed_catalog':
    case 'fix_orphan_categories':
        handleInventoryRequests($pdo, $request_method, $action);
        break;

    // --- FINANCE & PETTY CASH ---
    case 'get_petty_cash':
    case 'add_petty_cash':
    case 'update_petty_cash':
    case 'delete_petty_cash':
    case 'get_expense_item_prices':
    case 'get_expense_items':
    case 'add_expense_item':
    case 'delete_expense_item':
    case 'get_misc_catalog':
    case 'add_misc_charge_template':
    case 'delete_misc_charge_template':
    case 'get_cash_drawer_summary':
    case 'add_drawer_entry':
    case 'get_drawer_entries':
    case 'get_financial_ledger':
    case 'record_salary_payment':
        handleFinanceRequests($pdo, $request_method, $action);
        break;

    // --- STAFF & PAYROLL ---
    case 'get_staff':
    case 'get_users':
    case 'add_user':
    case 'update_user':
    case 'delete_user':
    case 'get_payees':
    case 'add_payee':
    case 'delete_payee':
    case 'get_attendance':
    case 'log_attendance':
        handleStaffRequests($pdo, $request_method, $action);
        break;

    // --- AUDIT LOGS ---
    case 'get_audit_logs':
    case 'add_audit_log':
        handleAuditRequests($pdo, $request_method, $action);
        break;

    // --- TELEGRAM ---
    case 'send_telegram_alert':
        handleTelegramRequests($pdo, $request_method, $action);
        break;

    // --- SANDBOX / TESTING ---
    case 'reset_test_database':
        handle_reset_test_database($db_host, $db_user, $db_pass, $live_db, $test_db);
        break;

    default:
        echo json_encode([
            'status' => 'online',
            'system' => 'Artists Farm Jaipur Terminal API',
            'version' => '2.0.0',
            'server_time' => date('Y-m-d H:i:s'),
            'modules' => [
                'guests' => '/php/guests/guests.php',
                'billing' => '/php/billing/billing.php',
                'receipts' => '/php/billing/receipts.php',
                'kitchen' => '/php/kitchen/orders.php',
                'menu' => '/php/kitchen/menu.php',
                'inventory' => '/php/inventory/inventory.php',
                'finance' => '/php/finance/petty_cash.php',
                'staff' => '/php/staff/staff.php',
                'audit' => '/php/audit/audit.php',
                'telegram' => '/php/telegram/telegram.php'
            ]
        ]);
        break;
}
