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
require_once __DIR__ . '/../finance/petty_cash.php';
require_once __DIR__ . '/../staff/staff.php';
require_once __DIR__ . '/../audit/audit.php';
require_once __DIR__ . '/../telegram/telegram.php';

$request_method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';

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
        handleReceiptRequests($pdo, $request_method, $action);
        break;

    // --- KITCHEN ORDERS & MENU ---
    case 'get_orders':
    case 'create_order':
    case 'update_order_status':
        handleKitchenRequests($pdo, $request_method, $action);
        break;

    case 'get_menu':
    case 'add_menu_item':
        handleMenuRequests($pdo, $request_method, $action);
        break;

    // --- INVENTORY & STOCK ---
    case 'get_inventory':
    case 'update_stock':
        handleInventoryRequests($pdo, $request_method, $action);
        break;

    // --- FINANCE & PETTY CASH ---
    case 'get_petty_cash':
    case 'add_petty_cash':
        handleFinanceRequests($pdo, $request_method, $action);
        break;

    // --- STAFF & PAYROLL ---
    case 'get_staff':
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
