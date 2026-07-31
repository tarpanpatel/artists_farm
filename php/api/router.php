<?php
/**
 * Central API Request Router & Dispatcher
 * Artists Farm Resort & Kitchen Management Backend System
 */

session_start();

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
require_once __DIR__ . '/../modules/module_manager.php';
require_once __DIR__ . '/../licenses/licenses.php';
require_once __DIR__ . '/configuration.php';

// Simple API Key Authentication (from environment only, no fallback)
$api_key = getenv('API_KEY');
$provided_key = $_SERVER['HTTP_X_API_KEY'] ?? $_GET['api_key'] ?? '';
$public_actions = ['get_menu', 'get_guests', 'get_orders', 'get_inventory', 'get_audit_logs', 'get_staff', 'get_users', 'get_petty_cash', 'get_financial_ledger', 'get_receipts', 'get_expense_items', 'get_misc_catalog', 'get_material_categories', 'get_cash_drawer_summary', 'get_drawer_entries', 'get_stock_requests', 'get_wastage_logs', 'get_kitchen_purchases', 'get_payees', 'get_attendance', 'get_expense_item_prices', 'get_nav_menu', 'get_property_modules', 'get_telegram_config', 'get_current_property', 'get_system_roles', 'get_ui_configuration', 'get_available_icons', 'get_icon_search_tags', 'get_telegram_templates', 'get_nav_page_options', 'get_all_tenants', 'get_all_properties', 'get_tenant_properties', 'get_licenses', 'check_expiring_licenses', 'login_user'];

$request_method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';

// Require API key for write/delete actions
$is_write_action = in_array($request_method, ['POST', 'PUT', 'DELETE']);
if ($is_write_action && $provided_key !== $api_key) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Unauthorized. Valid API key required for write operations.']);
    exit;
}

$propertyId = getCurrentPropertyId($pdo);
$currentProperty = getCurrentProperty($pdo); // Get the full property details

// Actions that belong entirely to food service: kitchen orders, the food menu
// & recipes, and the whole stock/requisitions/kitchen-purchases inventory
// system (php/inventory/inventory.php has no non-food inventory concept).
// A property with the 'kitchen' module disabled gets none of this — enforced
// here so disabling it actually stops the data from being created/read, not
// just hides the nav link.
$kitchen_module_actions = [
    'get_orders', 'create_order', 'update_order_status', 'get_served_logs', 'add_served_log',
    'get_menu', 'add_menu_item', 'update_menu_item', 'delete_menu_item', 'dedup_menu',
    'get_recipes', 'save_recipe', 'delete_recipe', 'deplete_stock',
    'get_inventory', 'update_stock',
    'get_stock_requests', 'create_stock_request', 'update_stock_request_status',
    'get_wastage_logs', 'create_wastage_log',
    'get_kitchen_purchases', 'create_kitchen_purchase', 'bulk_update_kitchen_purchases', 'delete_kitchen_purchase',
    'get_material_categories', 'update_material_category', 'delete_material_category', 'add_material_category',
    'toggle_ingredient_category', 'add_catalog_item', 'update_catalog_item', 'delete_catalog_item',
    'bulk_update_catalog_category', 'seed_catalog', 'fix_orphan_categories',
];
if (in_array($action, $kitchen_module_actions, true)) {
    requireModule($pdo, 'kitchen', $propertyId);
}

switch ($action) {
    // --- UNIFIED LOGIN ---
    case 'login_user':
        $input = json_decode(file_get_contents('php://input'), true);
        $username = $input['username'] ?? '';
        $password = $input['password'] ?? '';

        if (!$username || !$password) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Username and password required']);
            exit;
        }

        try {
            // Check users table for credentials
            $stmt = $pdo->prepare("
                SELECT id, username, password, role, is_platform_admin, default_tenant_id
                FROM users
                WHERE username = ?
            ");
            $stmt->execute([$username]);
            $user = $stmt->fetch();

            if ($user && password_verify($password, $user['password'])) {
                // Password is correct
                // Determine correct role based on user type
                $is_platform_admin = (bool)$user['is_platform_admin'];
                $has_default_tenant = !empty($user['default_tenant_id']);


                // Map role:
                // - platform admin (is_platform_admin=true) -> root_admin
                // - has default_tenant (is_platform_admin=false, default_tenant_id set) -> super_admin
                // - property/staff (no default_tenant) -> keep actual role (admin, staff, etc)
                $role = $user['role'];
                if ($is_platform_admin) {
                    $role = 'root_admin';
                } elseif ($has_default_tenant) {
                    $role = 'super_admin';
                }

                // Set session
                $_SESSION['user_id'] = $user['id'];
                $_SESSION['username'] = $user['username'];
                $_SESSION['role'] = $role;
                $_SESSION['is_platform_admin'] = $is_platform_admin;
                $_SESSION['default_tenant_id'] = $user['default_tenant_id'];

                // Set cookie
                setcookie('artists_farm_session', session_id(), time() + 86400 * 7, '/', '', false, true);

                echo json_encode([
                    'success' => true,
                    'message' => 'Login successful',
                    'user' => [
                        'id' => $user['id'],
                        'username' => $user['username'],
                        'role' => $role,
                        'is_platform_admin' => $is_platform_admin,
                        'default_tenant_id' => $user['default_tenant_id'],
                    ]
                ]);
            } else {
                http_response_code(401);
                echo json_encode(['success' => false, 'message' => 'Invalid username or password']);
            }
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Login error: ' . $e->getMessage()]);
        }
        exit;

    // --- PLATFORM ADMIN ENDPOINTS ---
    case 'create_tenant':
        $input = json_decode(file_get_contents('php://input'), true);
        $name = $input['name'] ?? '';
        $slug = $input['slug'] ?? '';
        $owner_name = $input['owner_name'] ?? '';
        $owner_email = $input['owner_email'] ?? '';

        if (!$name || !$slug) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'name and slug are required']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("
                INSERT INTO tenants (name, slug, owner_name, owner_email, subscription_plan, subscription_status, max_properties, is_active)
                VALUES (?, ?, ?, ?, 'free', 'trial', 1, 1)
            ");
            $stmt->execute([$name, $slug, $owner_name, $owner_email]);
            $tenant_id = $pdo->lastInsertId();

            echo json_encode(['success' => true, 'message' => 'Tenant created successfully', 'tenant_id' => $tenant_id]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'get_all_tenants':
        try {
            $stmt = $pdo->query("SELECT * FROM tenants ORDER BY name ASC");
            $tenants = $stmt->fetchAll();
            echo json_encode(['success' => true, 'data' => $tenants]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'get_all_properties':
        try {
            $stmt = $pdo->query("SELECT * FROM properties ORDER BY name ASC");
            $properties = $stmt->fetchAll();
            echo json_encode(['success' => true, 'data' => $properties]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'get_tenant_properties':
        $tenant_id = $_GET['tenant_id'] ?? '';
        if (!$tenant_id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'tenant_id required']);
            exit;
        }
        try {
            $stmt = $pdo->prepare("SELECT * FROM properties WHERE tenant_id = ? ORDER BY name ASC");
            $stmt->execute([$tenant_id]);
            $properties = $stmt->fetchAll();
            echo json_encode(['success' => true, 'data' => $properties]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'update_tenant':
        $input = json_decode(file_get_contents('php://input'), true);
        $id = $input['id'] ?? '';
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'tenant id required']);
            exit;
        }
        try {
            $stmt = $pdo->prepare("
                UPDATE tenants
                SET name = ?, owner_name = ?, owner_email = ?, subscription_status = ?, is_active = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $input['name'] ?? '',
                $input['owner_name'] ?? '',
                $input['owner_email'] ?? '',
                $input['subscription_status'] ?? 'trial',
                $input['is_active'] ?? 0,
                $id
            ]);
            echo json_encode(['success' => true, 'message' => 'Tenant updated successfully']);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'toggle_property_module':
        $input = json_decode(file_get_contents('php://input'), true);
        $property_id = $input['property_id'] ?? '';
        $module_name = $input['module_name'] ?? '';
        $enabled = $input['enabled'] ?? false;

        if (!$property_id || !$module_name) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'property_id and module_name required']);
            exit;
        }

        try {
            // Ensure table exists
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `property_modules` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `property_id` INT NOT NULL,
                    `module_slug` VARCHAR(100) NOT NULL,
                    `is_enabled` TINYINT(1) DEFAULT 1,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY `property_module_idx` (`property_id`, `module_slug`),
                    FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");

            // Use INSERT ... ON DUPLICATE KEY UPDATE for atomic upsert
            $stmt = $pdo->prepare("
                INSERT INTO property_modules (property_id, module_slug, is_enabled)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    is_enabled = ?,
                    updated_at = CURRENT_TIMESTAMP
            ");
            $stmt->execute([$property_id, $module_name, $enabled ? 1 : 0, $enabled ? 1 : 0]);

            echo json_encode(['success' => true, 'message' => 'Module toggled successfully']);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'update_property':
        $input = json_decode(file_get_contents('php://input'), true);
        $property_id = $input['property_id'] ?? '';
        $status = $input['status'] ?? '';

        if (!$property_id || !$status) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'property_id and status required']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("
                UPDATE properties
                SET status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ");
            $stmt->execute([$status, $property_id]);

            if ($stmt->rowCount() > 0) {
                echo json_encode(['success' => true, 'message' => 'Property updated successfully']);
            } else {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Property not found']);
            }
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'create_property':
        $input = json_decode(file_get_contents('php://input'), true);
        $tenant_id = $input['tenant_id'] ?? '';
        $name = $input['name'] ?? '';
        $slug = $input['slug'] ?? '';
        $tenant_username = $input['tenant_username'] ?? '';

        if (!$tenant_id || !$name || !$slug) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'tenant_id, name, and slug required']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("
                INSERT INTO properties (name, slug, tenant_id, status, tailwind_color_scheme)
                VALUES (?, ?, ?, 'active', ?)
            ");
            $stmt->execute([$name, $slug, $tenant_id, $input['color_scheme'] ?? 'blue']);
            $property_id = $pdo->lastInsertId();

            // Create staff_users table if it doesn't exist
            $pdo->exec("CREATE TABLE IF NOT EXISTS `staff_users` (
                `id` VARCHAR(50) PRIMARY KEY,
                `property_id` INT NOT NULL DEFAULT 1,
                `username` VARCHAR(100) NOT NULL,
                `full_name` VARCHAR(150) DEFAULT '',
                `role` VARCHAR(50) NOT NULL DEFAULT 'Staff',
                `phone` VARCHAR(30) DEFAULT '',
                `monthly_salary` DECIMAL(10,2) DEFAULT 0,
                `status` VARCHAR(20) DEFAULT 'Active',
                `is_financial_handler` TINYINT(1) NOT NULL DEFAULT 0,
                `passcode` VARCHAR(50) DEFAULT '1234',
                `qr_code_url` TEXT,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

            // Add only the tenant as super_admin, no other prefilled users
            if ($tenant_username) {
                $stmt = $pdo->prepare("INSERT INTO staff_users (id, property_id, username, full_name, role, status, is_financial_handler) VALUES (?, ?, ?, ?, 'Super Admin', 'Active', 1)");
                $stmt->execute([$tenant_username, $property_id, $tenant_username, $tenant_username]);
            }

            // Add kitchen module only if requested (default: true)
            $include_kitchen = $input['include_kitchen'] ?? true;
            if ($include_kitchen) {
                $pdo->prepare("INSERT INTO property_modules (property_id, module_slug, is_enabled) VALUES (?, 'kitchen', 1)")
                    ->execute([$property_id]);
            }

            echo json_encode(['success' => true, 'message' => 'Property created', 'property_id' => $property_id]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'edit_property':
        $input = json_decode(file_get_contents('php://input'), true);
        $property_id = $input['property_id'] ?? '';
        if (!$property_id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'property_id required']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("
                UPDATE properties
                SET name = ?, slug = ?, tailwind_color_scheme = ?, status = ?
                WHERE id = ?
            ");
            $ok = $stmt->execute([
                $input['name'] ?? '',
                $input['slug'] ?? '',
                $input['color_scheme'] ?? 'blue',
                $input['status'] ?? 'active',
                $property_id
            ]);
            echo json_encode(['success' => $ok, 'message' => $ok ? 'Property updated' : 'Failed']);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'delete_property':
        $input = json_decode(file_get_contents('php://input'), true);
        $property_id = $input['property_id'] ?? '';
        if (!$property_id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'property_id required']);
            exit;
        }

        try {
            $pdo->beginTransaction();
            // Delete all related data - FAIL if any deletion fails (no silent errors)
            $tables = ['guests', 'financial_ledger', 'kitchen_orders', 'food_menu', 'kitchen_stock', 'stock_requests', 'stock_requisitions', 'stock_purchases', 'stock_wastage', 'stock_adjustments', 'stock_log', 'inventory_items', 'staff_users', 'staff_roles', 'cash_drawer', 'petty_cash', 'misc_charges', 'telegram_settings', 'property_modules', 'audit_logs'];
            foreach ($tables as $table) {
                // Check if table exists before attempting delete
                $checkStmt = $pdo->prepare("SHOW TABLES LIKE ?");
                $checkStmt->execute([$table]);
                if ($checkStmt->fetch()) {
                    // Table exists, delete from it (will fail if deletion fails)
                    $pdo->prepare("DELETE FROM `$table` WHERE property_id = ?")->execute([$property_id]);
                }
            }
            $pdo->prepare("DELETE FROM properties WHERE id = ?")->execute([$property_id]);
            $pdo->commit();
            echo json_encode(['success' => true, 'message' => 'Property deleted successfully']);
        } catch (Exception $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Property deletion failed: ' . $e->getMessage()]);
        }
        exit;

    case 'reset_staff_passcodes':
        try {
            $stmt = $pdo->prepare("UPDATE staff_users SET passcode = ? WHERE 1");
            $ok = $stmt->execute(['123456']);
            echo json_encode(['success' => $ok, 'message' => $ok ? 'All staff passcodes reset to 123456' : 'Failed']);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'get_property_modules':
        // First check if property_id was explicitly passed (for platform admin use)
        $property_id = $_GET['property_id'] ?? '';

        // If not provided, use the current property context (for staff/tenant access)
        if (!$property_id) {
            $property_id = $propertyId;
        }

        if (!$property_id) {
            // Return empty/default modules if no property context
            echo json_encode(['status' => 'success', 'data' => []]);
            exit;
        }

        try {
            $stmt = $pdo->prepare("
                SELECT module_slug, is_enabled FROM property_modules
                WHERE property_id = ?
            ");
            $stmt->execute([$property_id]);
            $modules = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Return both the raw modules and parsed kitchen status
            $moduleData = ['kitchen_enabled' => false];
            foreach ($modules as $mod) {
                if ($mod['module_slug'] === 'kitchen') {
                    $moduleData['kitchen_enabled'] = (bool)$mod['is_enabled'];
                }
            }

            // Return in both formats for compatibility
            echo json_encode(['success' => true, 'status' => 'success', 'data' => $modules ?: $moduleData]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'status' => 'error', 'message' => $e->getMessage()]);
        }
        exit;

    // --- GUESTS ---
    case 'get_guests':
    case 'add_guest':
    case 'checkout_guest':
        handleGuestRequests($pdo, $request_method, $action, $propertyId);
        break;

    // --- BILLING & CHECKOUT ---
    case 'add_direct_food_incidentals':
    case 'add_adjustment':
    case 'finalize_checkout':
        handleBillingRequests($pdo, $request_method, $action, $propertyId);
        break;

    case 'get_receipts':
    case 'save_receipt':
        handleReceiptRequests($pdo, $request_method, $action, $propertyId);
        break;

    // --- KITCHEN ORDERS & MENU ---
    case 'get_orders':
    case 'create_order':
    case 'update_order_status':
    case 'get_served_logs':
    case 'add_served_log':
        handleKitchenRequests($pdo, $request_method, $action, $propertyId);
        break;

    case 'get_menu':
    case 'add_menu_item':
    case 'update_menu_item':
    case 'delete_menu_item':
    case 'dedup_menu':
    case 'get_nav_menu':
    case 'save_nav_menu':
    case 'get_recipes':
    case 'save_recipe':
    case 'delete_recipe':
    case 'deplete_stock':
        handleMenuRequests($pdo, $request_method, $action, $propertyId);
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
        handleInventoryRequests($pdo, $request_method, $action, $propertyId);
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
        handleFinanceRequests($pdo, $request_method, $action, $propertyId);
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
        handleStaffRequests($pdo, $request_method, $action, $propertyId);
        break;

    // --- AUDIT LOGS ---
    case 'get_audit_logs':
    case 'add_audit_log':
        handleAuditRequests($pdo, $request_method, $action, $propertyId);
        break;

    // --- TELEGRAM ---
    case 'send_telegram_alert':
    case 'get_telegram_config':
    case 'save_telegram_config':
        handleTelegramRequests($pdo, $request_method, $action, $propertyId);
        break;

    // --- MODULES ---
    case 'get_property_modules':
        echo json_encode(['status' => 'success', 'data' => getPropertyModules($pdo, $propertyId)]);
        break;

    // --- LICENSES ---
    case 'get_licenses':
    case 'add_license':
    case 'update_license':
    case 'delete_license':
    case 'check_expiring_licenses':
        handleLicenseRequests($pdo, $request_method, $action, $propertyId);
        break;

    // --- PROPERTY ---
    case 'get_current_property':
        echo json_encode(['status' => 'success', 'data' => $currentProperty]);
        break;

    // --- CONFIGURATION ---
    case 'get_system_roles':
    case 'get_ui_configuration':
    case 'get_available_icons':
    case 'get_icon_search_tags':
    case 'get_telegram_templates':
    case 'get_nav_page_options':
    case 'get_system_settings':
    case 'save_system_settings':
        handleConfigurationRequests($pdo, $request_method, $action, $propertyId);
        break;

    // --- SANDBOX / TESTING ---
    case 'reset_test_database':
        handle_reset_test_database($db_host, $db_user, $db_pass, $live_db, $test_db);
        break;

    default:
        $propertyName = $currentProperty['name'] ?? 'Artists Farm'; // Default if not found
        echo json_encode([
            'status' => 'online',
            'system' => $propertyName . ' Terminal API', // Use property name here
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
