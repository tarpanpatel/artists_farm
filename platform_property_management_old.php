<?php
/**
 * Platform Admin: Tenants, Properties & Module Assignments
 * Only accessible to users with is_platform_admin = 1
 */

session_start();
require_once __DIR__ . '/php/config/database.php';
require_once __DIR__ . '/php/config/property_resolver.php';
header('Content-Type: text/html; charset=UTF-8');
require_once __DIR__ . '/php/modules/property_manager.php';
require_once __DIR__ . '/php/modules/onboarding_workflow.php';
require_once __DIR__ . '/php/modules/module_manager.php';

if (!isset($_SESSION['user_id'])) {
    header('Location: login.php');
    exit;
}

$stmt = $pdo->prepare("SELECT id, username, role, is_platform_admin FROM users WHERE id = ?");
$stmt->execute([$_SESSION['user_id']]);
$user = $stmt->fetch();

if (!$user || !$user['is_platform_admin']) {
    echo "Access denied. Platform admin privileges required.";
    exit;
}

$adminUserId = $user['id'];
$tailwindColors = ['blue', 'emerald', 'red', 'indigo', 'purple', 'pink', 'amber', 'cyan', 'slate', 'gray'];

// --- POST actions (JSON in, JSON out) ---
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json');
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $action = $input['action'] ?? '';

    switch ($action) {
        case 'create_tenant':
            $tenantId = createTenantInternal($pdo, [
                'tenant_name' => trim($input['name'] ?? ''),
                'tenant_slug' => trim($input['slug'] ?? ''),
                'owner_name' => trim($input['owner_name'] ?? ''),
                'owner_email' => trim($input['owner_email'] ?? ''),
                'subscription_plan' => $input['subscription_plan'] ?? 'free',
                'max_properties' => (int)($input['max_properties'] ?? 1),
                'max_users' => (int)($input['max_users'] ?? 5),
            ]);
            if (!$tenantId) {
                echo json_encode(['success' => false, 'message' => 'Failed to create tenant']);
                break;
            }
            $propertyId = createDefaultProperty($pdo, $tenantId, $input['name'] ?? '');
            if ($propertyId) {
                assignDefaultModules($pdo, $tenantId, $propertyId);
                createTenantAdminUser($pdo, $input['name'] ?? '', $tenantId, $propertyId);
            }
            echo json_encode(['success' => true, 'message' => 'Tenant created successfully']);
            break;

        case 'edit_tenant':
            $tenantId = (int)($input['tenant_id'] ?? 0);
            $stmt = $pdo->prepare("UPDATE tenants SET name = ?, owner_name = ?, owner_email = ?, subscription_plan = ?, max_properties = ?, max_users = ? WHERE id = ?");
            $ok = $stmt->execute([
                trim($input['name'] ?? ''),
                trim($input['owner_name'] ?? ''),
                trim($input['owner_email'] ?? ''),
                $input['subscription_plan'] ?? 'free',
                (int)($input['max_properties'] ?? 1),
                (int)($input['max_users'] ?? 5),
                $tenantId
            ]);
            echo json_encode(['success' => $ok, 'message' => $ok ? 'Tenant updated' : 'Update failed']);
            break;

        case 'deactivate_tenant':
            $tenantId = (int)($input['tenant_id'] ?? 0);
            // Deactivate tenant
            $stmt = $pdo->prepare("UPDATE tenants SET is_active = 0 WHERE id = ?");
            $stmt->execute([$tenantId]);
            // Deactivate all child properties
            $stmt = $pdo->prepare("UPDATE properties SET status = 'inactive' WHERE tenant_id = ?");
            $ok = $stmt->execute([$tenantId]);
            echo json_encode(['success' => $ok, 'message' => $ok ? 'Tenant and all properties deactivated' : 'Deactivation failed']);
            break;

        case 'activate_tenant':
            $tenantId = (int)($input['tenant_id'] ?? 0);
            $stmt = $pdo->prepare("UPDATE tenants SET is_active = 1 WHERE id = ?");
            $ok = $stmt->execute([$tenantId]);
            echo json_encode(['success' => $ok, 'message' => $ok ? 'Tenant activated' : 'Activation failed']);
            break;

        case 'delete_tenant':
            try {
                $tenantId = (int)($input['tenant_id'] ?? 0);
                if (!$tenantId) {
                    echo json_encode(['success' => false, 'message' => 'Invalid tenant ID']);
                    break;
                }
                $pdo->beginTransaction();
                $properties = $pdo->query("SELECT id FROM properties WHERE tenant_id = $tenantId")->fetchAll();
                foreach ($properties as $prop) {
                    $propId = (int)$prop['id'];
                    $tables = ['guests', 'financial_ledger', 'kitchen_orders', 'food_menu', 'kitchen_stock', 'stock_requests', 'stock_requisitions', 'stock_purchases', 'stock_wastage', 'stock_adjustments', 'stock_log', 'inventory_items', 'staff_users', 'staff_roles', 'cash_drawer', 'petty_cash', 'misc_charges', 'telegram_settings', 'property_modules'];
                    foreach ($tables as $table) {
                        try {
                            $pdo->prepare("DELETE FROM `$table` WHERE property_id = ?")->execute([$propId]);
                        } catch (Exception $e) {
                            // Table doesn't exist, skip it
                        }
                    }
                }
                $pdo->prepare("DELETE FROM properties WHERE tenant_id = ?")->execute([$tenantId]);
                $pdo->prepare("DELETE FROM tenant_users WHERE tenant_id = ?")->execute([$tenantId]);
                $pdo->prepare("DELETE FROM tenants WHERE id = ?")->execute([$tenantId]);
                $pdo->commit();
                echo json_encode(['success' => true, 'message' => 'Tenant deleted permanently']);
            } catch (Exception $e) {
                $pdo->rollBack();
                echo json_encode(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
            }
            break;

        case 'create_property':
            $result = createProperty($pdo, [
                'tenant_id' => !empty($input['tenant_id']) ? (int)$input['tenant_id'] : null,
                'name' => trim($input['name'] ?? ''),
                'slug' => trim($input['slug'] ?? ''),
                'property_type' => $input['property_type'] ?? 'vacation_home',
                'address' => trim($input['address'] ?? ''),
                'city' => trim($input['city'] ?? ''),
                'max_capacity' => (int)($input['max_capacity'] ?? 0),
                'tailwind_color_scheme' => trim($input['color_scheme'] ?? 'blue'),
            ], $adminUserId);
            if (!empty($result['success']) && !empty($result['property_id'])) {
                assignDefaultModules($pdo, $input['tenant_id'] ?? null, $result['property_id']);
            }
            echo json_encode($result);
            break;

        case 'edit_property':
            $propertyId = (int)($input['property_id'] ?? 0);
            $stmt = $pdo->prepare("UPDATE properties SET name = ?, address = ?, max_capacity = ?, tailwind_color_scheme = ? WHERE id = ?");
            $ok = $stmt->execute([
                trim($input['name'] ?? ''),
                trim($input['address'] ?? ''),
                (int)($input['max_capacity'] ?? 0),
                trim($input['color_scheme'] ?? 'blue'),
                $propertyId
            ]);
            echo json_encode(['success' => $ok, 'message' => $ok ? 'Property updated' : 'Update failed']);
            break;

        case 'activate_property':
            $propertyId = (int)($input['property_id'] ?? 0);
            $stmt = $pdo->prepare("UPDATE properties SET status = 'active' WHERE id = ?");
            $ok = $stmt->execute([$propertyId]);
            echo json_encode(['success' => $ok, 'message' => $ok ? 'Property activated' : 'Activation failed']);
            break;

        case 'deactivate_property':
            $propertyId = (int)($input['property_id'] ?? 0);
            $stmt = $pdo->prepare("UPDATE properties SET status = 'inactive' WHERE id = ?");
            $ok = $stmt->execute([$propertyId]);
            echo json_encode(['success' => $ok, 'message' => $ok ? 'Property deactivated' : 'Deactivation failed']);
            break;

        case 'toggle_kitchen_module':
            $ok = setPropertyModuleStatus($pdo, (int)$input['property_id'], 'kitchen', !empty($input['enabled']));
            echo json_encode(['success' => $ok, 'message' => $ok ? 'Kitchen module updated' : 'Update failed']);
            break;

        case 'delete_property_platform':
            try {
                $propertyId = (int)($input['property_id'] ?? 0);
                if (!$propertyId) {
                    echo json_encode(['success' => false, 'message' => 'Invalid property ID']);
                    break;
                }
                $pdo->beginTransaction();
                $tables = ['guests', 'financial_ledger', 'kitchen_orders', 'food_menu', 'kitchen_stock', 'stock_requests', 'stock_requisitions', 'stock_purchases', 'stock_wastage', 'stock_adjustments', 'stock_log', 'inventory_items', 'staff_users', 'staff_roles', 'cash_drawer', 'petty_cash', 'misc_charges', 'telegram_settings', 'property_modules'];
                foreach ($tables as $table) {
                    try {
                        $pdo->prepare("DELETE FROM `$table` WHERE property_id = ?")->execute([$propertyId]);
                    } catch (Exception $e) {
                        // Table doesn't exist, skip it
                    }
                }
                $pdo->prepare("DELETE FROM properties WHERE id = ?")->execute([$propertyId]);
                $pdo->commit();
                echo json_encode(['success' => true, 'message' => 'Property deleted permanently']);
            } catch (Exception $e) {
                $pdo->rollBack();
                echo json_encode(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
            }
            break;

        default:
            echo json_encode(['success' => false, 'message' => 'Unknown action']);
            break;
    }
    exit;
}

// --- Data for initial render ---
$tenants = $pdo->query("SELECT * FROM tenants ORDER BY name")->fetchAll();
$allModules = getAllModules($pdo);
?>
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Property & Tenant Management - Artists Farm SaaS</title>
    <link rel="stylesheet" href="/artists_farm/src/index.css">
</head>
<body class="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col font-sans text-gray-900 dark:text-gray-100 antialiased transition-colors">
    <header class="pos-main-header fixed top-0 left-0 right-0 z-50 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 shadow-2xs h-16 transition-colors">
        <div class="px-3 py-2.5 lg:px-5 flex items-center justify-between h-full">
            <!-- Left Section: Brand Logo -->
            <div class="flex items-center gap-2">
                <div class="pos-logo-container flex items-center gap-2.5">
                    <div class="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs font-bold">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-building-2 w-5 h-5"><path d="M6 22V7H4v15"/><path d="M18 22V12H16v10"/><path d="M12 22V3H10v19"/><path d="M20 22V17H22v5"/><path d="M2 22h20"/><path d="M10 2h4v6h-4z"/><path d="M16 12h4v5h-4z"/><path d="M4 7h4v5h-4z"/></svg>
                    </div>
                    <div class="block">
                        <span class="text-sm font-bold text-gray-700 dark:text-white tracking-tight flex items-center gap-2">
                            Artists Farm SaaS
                            <span class="hidden sm:inline-block bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                                Platform Admin
                            </span>
                        </span>
                    </div>
                </div>
            </div>

            <!-- Right Section: User Info + Logout -->
            <div class="flex items-center gap-2">
                <div class="pos-user-profile-badge flex items-center gap-2.5 pl-2 border-l border-gray-200 dark:border-slate-700">
                    <img
                        src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
                        alt="User Avatar"
                        class="w-8 h-8 rounded-full object-cover ring-2 ring-blue-500/30"
                    />
                    <div class="hidden sm:block text-left leading-tight">
                        <span class="block text-xs font-bold text-gray-900 dark:text-white">
                            <?php echo htmlspecialchars($user['username']); ?>
                        </span>
                        <span class="block text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                            Platform Administrator
                        </span>
                    </div>
                    <a href="logout.php" title="Logout" aria-label="Logout" class="btn-onlogout-pos ml-1 p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-log-out w-4 h-4"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
                    </a>
                </div>
            </div>
        </div>
    </header>

    <div class="pos-main-content flex-1 flex pt-16">
        <aside class="pos-sidebar w-64 fixed top-0 left-0 z-40 h-screen pt-16 transition-transform -translate-x-full bg-white border-r border-gray-200 sm:translate-x-0 dark:bg-slate-800 dark:border-slate-700" aria-label="Sidebar">
            <div class="h-full px-3 pb-4 overflow-y-auto bg-white dark:bg-slate-800">
                <ul class="space-y-2 font-medium">
                    <li>
                        <a href="#tenants" class="flex items-center p-2 text-gray-900 rounded-lg dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700 group active-tab" data-tab="tenants">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-users-2 w-5 h-5 text-gray-500 transition duration-75 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white"><path d="M14 19a6 6 0 0 0-12 0"/><circle cx="8" cy="9" r="4"/><path d="M22 19a6 6 0 0 0-12 0"/><circle cx="16" cy="9" r="4"/></svg>
                            <span class="ms-3">Tenants</span>
                        </a>
                    </li>
                    <li>
                        <a href="saas_admin.php#dashboard" class="flex items-center p-2 text-gray-900 rounded-lg dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700 group" data-tab="dashboard">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-dashboard w-5 h-5 text-gray-500 transition duration-75 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                            <span class="ms-3">Platform Dashboard</span>
                        </a>
                    </li>
                </ul>
            </div>
        </aside>

        <div class="p-4 sm:ml-64 flex-1 pt-16">
            <div class="p-4 border-2 border-gray-200 border-dashed rounded-lg dark:border-gray-700">
                <!-- TENANTS TAB -->
                <div id="tenants" class="tab-content active">
                    <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
                        <h2 class="text-2xl font-extrabold text-gray-900 dark:text-white">All Tenants</h2>
                        <button class="btn-primary inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-blue-800 transition-colors" onclick="showModal('create-tenant')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus w-5 h-5 mr-2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                            New Tenant
                        </button>
                    </div>

                    <?php if (empty($tenants)): ?>
                    <div class="flex flex-col items-center justify-center p-8 text-gray-500 dark:text-gray-400 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-building-2 w-12 h-12 mb-4 text-gray-300 dark:text-gray-600"><path d="M6 22V7H4v15"/><path d="M18 22V12H16v10"/><path d="M12 22V3H10v19"/><path d="M20 22V17H22v5"/><path d="M2 22h20"/><path d="M10 2h4v6h-4z"/><path d="M16 12h4v5h-4z"/><path d="M4 7h4v5h-4z"/></svg>
                        <p class="text-lg font-semibold">No tenants found.</p>
                        <p class="text-sm">Click "New Tenant" to add your first tenant.</p>
                    </div>
                    <?php else: ?>
                        <?php foreach ($tenants as $t):
                            $properties = $pdo->prepare("SELECT * FROM properties WHERE tenant_id = ? ORDER BY name");
                            $properties->execute([$t['id']]);
                            $props = $properties->fetchAll();
                        ?>
                        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-5 mb-4">
                            <div class="flex flex-col md:flex-row md:items-center md:justify-between cursor-pointer pb-4 border-b border-gray-200 dark:border-slate-700" onclick="toggleProperties(this)">
                                <div class="flex-1 mb-3 md:mb-0">
                                    <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-1"><?php echo htmlspecialchars($t['name']); ?></h3>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">
                                        Plan: <strong class="text-gray-700 dark:text-gray-200"><?php echo ucfirst($t['subscription_plan']); ?></strong> |
                                        Properties: <strong class="text-gray-700 dark:text-gray-200"><?php echo count($props); ?></strong> |
                                        Status: <span class="inline-block px-2 py-0.5 text-xs font-medium rounded-full <?php echo $t['is_active'] ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300'; ?>">
                                            <?php echo $t['is_active'] ? 'Active' : 'Inactive'; ?>
                                        </span>
                                    </p>
                                </div>
                                <div class="flex flex-wrap gap-2">
                                    <button class="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-slate-700 dark:text-gray-400 dark:border-slate-600 dark:hover:text-white dark:hover:bg-slate-600 transition-colors" onclick="editTenant(<?php echo (int)$t['id']; ?>, event)"
                                        data-name="<?php echo htmlspecialchars($t['name']); ?>"
                                        data-owner-name="<?php echo htmlspecialchars($t['owner_name'] ?? ''); ?>"
                                        data-owner-email="<?php echo htmlspecialchars($t['owner_email'] ?? ''); ?>"
                                        data-plan="<?php echo htmlspecialchars($t['subscription_plan']); ?>">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-edit-2 w-4 h-4 mr-2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                                        Edit
                                    </button>
                                    <?php if ($t['is_active']): ?>
                                        <button class="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:ring-4 focus:ring-red-300 dark:bg-red-500 dark:hover:bg-red-600 dark:focus:ring-red-800 transition-colors" onclick="deactivateTenant(<?php echo (int)$t['id']; ?>, event)">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-power-off w-4 h-4 mr-2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" x2="12" y1="2" y2="12"/></svg>
                                            Deactivate
                                        </button>
                                    <?php else: ?>
                                        <button class="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 focus:ring-4 focus:ring-emerald-300 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:focus:ring-emerald-800 transition-colors" onclick="activateTenant(<?php echo (int)$t['id']; ?>, event)">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle-2 w-4 h-4 mr-2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                                            Activate
                                        </button>
                                    <?php endif; ?>
                                    <button class="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:ring-4 focus:ring-red-300 dark:bg-red-500 dark:hover:bg-red-600 dark:focus:ring-red-800 transition-colors" onclick="openDeleteTenantModal(<?php echo (int)$t['id']; ?>, '<?php echo htmlspecialchars($t['name']); ?>')">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 w-4 h-4 mr-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                                        Delete
                                    </button>
                                </div>
                            </div>

                            <!-- Properties Dropdown -->
                            <div class="properties-section mt-4 hidden">
                                <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
                                    <h3 class="text-lg font-bold text-gray-900 dark:text-white">Properties (<?php echo count($props); ?>)</h3>
                                    <button class="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-blue-800 transition-colors" onclick="showModal('create-property', <?php echo (int)$t['id']; ?>)">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus w-4 h-4 mr-2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                                        Add Property
                                    </button>
                                </div>

                                <?php if (empty($props)): ?>
                                <div class="flex flex-col items-center justify-center p-6 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-home w-10 h-10 mb-3 text-gray-300 dark:text-gray-500"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                                    <p class="text-md font-semibold">No properties yet.</p>
                                    <p class="text-sm">Click "Add Property" to create one.</p>
                                </div>
                                <?php else: ?>
                                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <?php foreach ($props as $p):
                                        $mods = getPropertyModules($pdo, $p['id']);
                                        $kitchenEnabled = array_search('kitchen', array_column($mods, 'slug')) !== false &&
                                                          $mods[array_search('kitchen', array_column($mods, 'slug'))]['is_enabled'];
                                    ?>
                                    <div class="bg-gray-50 dark:bg-slate-700 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-slate-600">
                                        <div class="flex items-center justify-between mb-2">
                                            <h4 class="text-lg font-bold text-gray-900 dark:text-white"><?php echo htmlspecialchars($p['name']); ?></h4>
                                            <span class="inline-block w-6 h-6 rounded-full" style="<?php
                                                $colorMap = ['blue' => '#3b82f6', 'emerald' => '#10b981', 'red' => '#ef4444', 'indigo' => '#6366f1', 'purple' => '#a855f7', 'pink' => '#ec4899', 'amber' => '#f59e0b', 'cyan' => '#06b6d4', 'slate' => '#64748b', 'gray' => '#6b7280'];
                                                $scheme = $p['tailwind_color_scheme'] ?? 'blue';
                                                echo 'background-color: ' . ($colorMap[$scheme] ?? $colorMap['blue']) . ';';
                                            ?>" title="Color Scheme: <?php echo htmlspecialchars($p['tailwind_color_scheme'] ?? 'blue'); ?>"></span>
                                        </div>
                                        <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                                            Slug: <strong class="text-gray-700 dark:text-gray-200"><?php echo htmlspecialchars($p['slug']); ?></strong> |
                                            Capacity: <strong class="text-gray-700 dark:text-gray-200"><?php echo (int)$p['max_capacity']; ?></strong>
                                        </p>
                                        <span class="inline-block px-2.5 py-0.5 text-xs font-medium rounded-full <?php echo $p['status'] === 'active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300'; ?>">
                                            <?php echo ucfirst($p['status']); ?>
                                        </span>
                                        <div class="flex flex-wrap gap-2 mt-4">
                                            <button class="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-blue-800 transition-colors" onclick="impersonateTenant(<?php echo (int)$t['id']; ?>, '<?php echo htmlspecialchars($t['slug']); ?>')">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-log-in w-4 h-4 mr-2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/></svg>
                                                Log In
                                            </button>
                                            <button class="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-slate-700 dark:text-gray-400 dark:border-slate-600 dark:hover:text-white dark:hover:bg-slate-600 transition-colors" onclick="visitProperty('<?php echo htmlspecialchars($p['slug']); ?>')">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-external-link w-4 h-4 mr-2"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                                                Visit
                                            </button>
                                            <button class="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-slate-700 dark:text-gray-400 dark:border-slate-600 dark:hover:text-white dark:hover:bg-slate-600 transition-colors" onclick="editProperty(<?php echo (int)$p['id']; ?>, event)"
                                                data-name="<?php echo htmlspecialchars($p['name']); ?>"
                                                data-address="<?php echo htmlspecialchars($p['address'] ?? ''); ?>"
                                                data-capacity="<?php echo (int)$p['max_capacity']; ?>"
                                                data-color="<?php echo htmlspecialchars($p['tailwind_color_scheme'] ?? 'blue'); ?>">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-edit-2 w-4 h-4 mr-2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                                                Edit
                                            </button>
                                            <button class="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-slate-700 dark:text-gray-400 dark:border-slate-600 dark:hover:text-white dark:hover:bg-slate-600 transition-colors" onclick="showModuleModal(<?php echo (int)$p['id']; ?>, '<?php echo htmlspecialchars($p['name']); ?>')">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-puzzle w-4 h-4 mr-2"><path d="M19.4 15c.4 0 .8.2 1.1.5l1.6 1.6c.3.3.5.7.5 1.1s-.2.8-.5 1.1l-1.6 1.6c-.3.3-.7.5-1.1.5s-.8-.2-1.1-.5l-1.6-1.6c-.3-.3-.5-.7-.5-1.1s.2-.8.5-1.1l1.6-1.6c.3-.3.7-.5 1.1-.5Z"/><path d="M11.4 15c.4 0 .8.2 1.1.5l1.6 1.6c.3.3.5.7.5 1.1s-.2.8-.5 1.1l-1.6 1.6c-.3.3-.7.5-1.1.5s-.8-.2-1.1-.5l-1.6-1.6c-.3-.3-.5-.7-.5-1.1s.2-.8.5-1.1l1.6-1.6c.3-.3.7-.5 1.1-.5Z"/><path d="M19.4 7c.4 0 .8.2 1.1.5l1.6 1.6c.3.3.5.7.5 1.1s-.2.8-.5 1.1l-1.6 1.6c-.3.3-.7.5-1.1.5s-.8-.2-1.1-.5l-1.6-1.6c-.3-.3-.5-.7-.5-1.1s.2-.8.5-1.1l1.6-1.6c.3-.3.7-.5 1.1-.5Z"/><path d="M11.4 7c.4 0 .8.2 1.1.5l1.6 1.6c.3.3.5.7.5 1.1s-.2.8-.5 1.1l-1.6 1.6c-.3.3-.7.5-1.1.5s-.8-.2-1.1-.5l-1.6-1.6c-.3-.3-.5-.7-.5-1.1s.2-.8.5-1.1l1.6-1.6c.3-.3.7-.5 1.1-.5Z"/><path d="M3.4 7c.4 0 .8.2 1.1.5l1.6 1.6c.3.3.5.7.5 1.1s-.2.8-.5 1.1l-1.6 1.6c-.3.3-.7.5-1.1.5s-.8-.2-1.1-.5l-1.6-1.6c-.3-.3-.5-.7-.5-1.1s.2-.8.5-1.1l1.6-1.6c.3-.3.7-.5 1.1-.5Z"/></svg>
                                                Modules
                                            </button>
                                            <?php if ($p['status'] === 'active'): ?>
                                                <button class="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:ring-4 focus:ring-red-300 dark:bg-red-500 dark:hover:bg-red-600 dark:focus:ring-red-800 transition-colors" onclick="deactivateProperty(<?php echo (int)$p['id']; ?>)">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-power-off w-4 h-4 mr-2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" x2="12" y1="2" y2="12"/></svg>
                                                    Deactivate
                                                </button>
                                            <?php else: ?>
                                                <button class="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 focus:ring-4 focus:ring-emerald-300 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:focus:ring-emerald-800 transition-colors" onclick="activateProperty(<?php echo (int)$p['id']; ?>)">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle-2 w-4 h-4 mr-2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                                                    Activate
                                                </button>
                                            <?php endif; ?>
                                            <button class="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:ring-4 focus:ring-red-300 dark:bg-red-500 dark:hover:bg-red-600 dark:focus:ring-red-800 transition-colors" onclick="openDeletePropertyPlatformModal(<?php echo (int)$p['id']; ?>, '<?php echo htmlspecialchars($p['name']); ?>')">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 w-4 h-4 mr-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                    <?php endforeach; ?>
                                    </div>
                                <?php endif; ?>
                            </div>
                        </div>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </div>
            </div>
        </div>

    <!-- Create Tenant Modal (Flowbite-style) -->
    <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 hidden" id="create-tenant-modal">
        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div class="p-5 flex items-start justify-between border-b border-gray-200 dark:border-slate-700">
                <h3 class="font-extrabold text-slate-900 dark:text-white text-lg">New Tenant</h3>
                <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" onclick="closeModal()">&times;</button>
            </div>
            <div class="p-5">
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tenant Name *</label>
                    <input type="text" id="ct-name" class="block w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white" placeholder="e.g., Sunset Resorts">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL Slug *</label>
                    <input type="text" id="ct-slug" class="block w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white" placeholder="e.g., sunset-resorts">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Owner Name</label>
                    <input type="text" id="ct-owner-name" class="block w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Owner Email</label>
                    <input type="text" id="ct-owner-email" class="block w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subscription Plan</label>
                    <select id="ct-plan" class="block w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white">
                        <option value="free">Free</option>
                        <option value="basic">Basic</option>
                        <option value="pro">Pro</option>
                        <option value="enterprise">Enterprise</option>
                    </select>
                </div>
            </div>
            <div class="p-5 flex justify-end gap-3 border-t border-gray-200 dark:border-slate-700">
                <button class="inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-slate-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" onclick="closeModal()">Cancel</button>
                <button class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" onclick="createTenant()">Create Tenant</button>
            </div>
        </div>
    </div>

    <!-- Edit Tenant Modal (Flowbite-style) -->
    <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 hidden" id="edit-tenant-modal">
        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div class="p-5 flex items-start justify-between border-b border-gray-200 dark:border-slate-700">
                <h3 class="font-extrabold text-slate-900 dark:text-white text-lg">Edit Tenant</h3>
                <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" onclick="closeModal()">&times;</button>
            </div>
            <div class="p-5">
                <input type="hidden" id="et-tenant-id">
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tenant Name</label>
                    <input type="text" id="et-name" class="block w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Owner Name</label>
                    <input type="text" id="et-owner-name" class="block w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Owner Email</label>
                    <input type="text" id="et-owner-email" class="block w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subscription Plan</label>
                    <select id="et-plan" class="block w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white">
                        <option value="free">Free</option>
                        <option value="basic">Basic</option>
                        <option value="pro">Pro</option>
                        <option value="enterprise">Enterprise</option>
                    </select>
                </div>
            </div>
            <div class="p-5 flex justify-end gap-3 border-t border-gray-200 dark:border-slate-700">
                <button class="inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-slate-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" onclick="closeModal()">Cancel</button>
                <button class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" onclick="updateTenant()">Save Changes</button>
            </div>
        </div>
    </div>

    <!-- Delete Tenant Modal (Flowbite-style) -->
    <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 hidden" id="delete-tenant-modal">
        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div class="p-5 flex items-start justify-between border-b border-gray-200 dark:border-slate-700">
                <h3 class="font-extrabold text-slate-900 dark:text-white text-lg">Delete Tenant</h3>
                <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" onclick="closeModal()">&times;</button>
            </div>
            <div class="p-5">
                <div class="bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-300 px-4 py-2 rounded-lg text-sm mb-4">
                    <strong class="font-bold">⚠️ Warning:</strong> Deleting this tenant will permanently delete all associated properties, users, and data.
                </div>
                <p class="mb-4 text-gray-700 dark:text-gray-300">Tenant: <strong id="deleteTenantName" class="font-semibold"></strong></p>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type "DELETE" to confirm:</label>
                    <input type="text" id="deleteTenantConfirmInput" class="block w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white" placeholder="Type DELETE here">
                </div>
            </div>
            <div class="p-5 flex justify-end gap-3 border-t border-gray-200 dark:border-slate-700">
                <button class="inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-slate-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" onclick="closeModal()">Cancel</button>
                <button class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500" onclick="confirmDeleteTenant()">Delete Tenant</button>
            </div>
        </div>
    </div>

    <!-- Delete Property Modal (Platform Admin) (Flowbite-style) -->
    <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 hidden" id="delete-property-platform-modal">
        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div class="p-5 flex items-start justify-between border-b border-gray-200 dark:border-slate-700">
                <h3 class="font-extrabold text-slate-900 dark:text-white text-lg">Delete Property</h3>
                <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" onclick="closeModal()">&times;</button>
            </div>
            <div class="p-5">
                <div class="bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-300 px-4 py-2 rounded-lg text-sm mb-4">
                    <strong class="font-bold">⚠️ Warning:</strong> Deleting this property will permanently delete all associated data (guests, ledger, orders, inventory, staff, etc.).
                </div>
                <p class="mb-4 text-gray-700 dark:text-gray-300">Property: <strong id="deletePropertyPlatformName" class="font-semibold"></strong></p>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type "DELETE" to confirm:</label>
                    <input type="text" id="deletePropertyPlatformConfirmInput" class="block w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white" placeholder="Type DELETE here">
                </div>
            </div>
            <div class="p-5 flex justify-end gap-3 border-t border-gray-200 dark:border-slate-700">
                <button class="inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-slate-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" onclick="closeModal()">Cancel</button>
                <button class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500" onclick="confirmDeletePropertyPlatform()">Delete Property</button>
            </div>
        </div>
    </div>

    <!-- Create/Edit Property Modal (Flowbite-style) -->
    <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 hidden" id="property-modal">
        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div class="p-5 flex items-start justify-between border-b border-gray-200 dark:border-slate-700">
                <h3 id="property-modal-title" class="font-extrabold text-slate-900 dark:text-white text-lg">New Property</h3>
                <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" onclick="closeModal()">&times;</button>
            </div>
            <div class="p-5">
                <input type="hidden" id="p-property-id">
                <input type="hidden" id="p-tenant-id">
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Property Name *</label>
                    <input type="text" id="p-name" class="block w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                    <input type="text" id="p-address" class="block w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Capacity (guests)</label>
                    <input type="number" id="p-capacity" class="block w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white" value="0" min="0">
                </div>
                <div class="mb-4" id="color-scheme-group">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color Scheme</label>
                    <div class="grid grid-cols-5 gap-2" id="p-color-options"></div>
                </div>
            </div>
            <div class="p-5 flex justify-end gap-3 border-t border-gray-200 dark:border-slate-700">
                <button class="inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-slate-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" onclick="closeModal()">Cancel</button>
                <button class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" onclick="saveProperty()">Save Property</button>
            </div>
        </div>
    </div>

    <!-- Module Toggle Modal (Flowbite-style) -->
    <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 hidden" id="modules-modal">
        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div class="p-5 flex items-start justify-between border-b border-gray-200 dark:border-slate-700">
                <h3 id="modules-modal-title" class="font-extrabold text-slate-900 dark:text-white text-lg">Module Settings</h3>
                <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" onclick="closeModal()">&times;</button>
            </div>
            <div class="p-5">
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Only the Kitchen module can be toggled. Other modules are core features and always enabled.</p>
                <div class="bg-gray-50 dark:bg-slate-700 rounded-lg p-4 space-y-3" id="modules-list"></div>
            </div>
            <div class="p-5 flex justify-end border-t border-gray-200 dark:border-slate-700">
                <button class="inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-slate-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" onclick="closeModal()">Close</button>
            </div>
        </div>
    </div>

    <script>
        const tailwindColors = <?php echo json_encode($tailwindColors); ?>;
        const allModules = <?php echo json_encode($allModules); ?>;

        function post(action, payload) {
            return fetch(window.location.href, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({ action: action }, payload)),
            }).then(function (r) { return r.json(); });
        }

        function showModal(modalId, tenantId) {
            if (modalId === 'create-property' && tenantId) {
                document.getElementById('property-modal-title').textContent = 'New Property';
                document.getElementById('p-property-id').value = '';
                document.getElementById('p-tenant-id').value = tenantId;
                document.getElementById('p-name').value = '';
                document.getElementById('p-address').value = '';
                document.getElementById('p-capacity').value = '0';
                document.getElementById('color-scheme-group').style.display = 'block';
                renderColorOptions('blue');
            }
            if (modalId === 'create-tenant') {
                document.getElementById('ct-name').value = '';
                document.getElementById('ct-slug').value = '';
                document.getElementById('ct-owner-name').value = '';
                document.getElementById('ct-owner-email').value = '';
            }
            document.getElementById(modalId + '-modal').classList.add('active');
        }

        function closeModal() {
            document.querySelectorAll('.modal').forEach(function (modal) { modal.classList.remove('active'); });
        }

        document.querySelectorAll('.modal').forEach(function (modal) {
            modal.addEventListener('click', function (e) { if (e.target === this) closeModal(); });
        });

        function renderColorOptions(selected) {
            var colorMap = {'blue': '#3b82f6', 'emerald': '#10b981', 'red': '#ef4444', 'indigo': '#6366f1', 'purple': '#a855f7', 'pink': '#ec4899', 'amber': '#f59e0b', 'cyan': '#06b6d4', 'slate': '#64748b', 'gray': '#6b7280'};
            let html = '';
            tailwindColors.forEach(function (color) { // Use the global tailwindColors array
                html += `<div class="color-option flex flex-col items-center justify-center p-2 border-2 rounded-lg cursor-pointer transition-all duration-200 ${color === selected ? 'border-blue-500 ring-2 ring-blue-200 selected' : 'border-gray-300 dark:border-slate-600 hover:border-blue-400'}" data-color="${color}" onclick="selectColor('${color}')">
                            <div class="w-6 h-6 rounded-full" style="background-color: ${colorMap[color] || '#3b82f6'};"></div>
                            <span class="text-xs mt-1 text-gray-700 dark:text-gray-300">${color}</span>
                         </div>`;
            });
            document.getElementById('p-color-options').innerHTML = html;
        }
        function selectColor(color) {
            document.querySelectorAll('.color-option').forEach(function (el) { el.classList.remove('selected'); });
            var selectedEl = document.querySelector('.color-option[data-color="' + color + '"]');
            if (selectedEl) {
                selectedEl.classList.add('selected');
            }
        }

        function toggleProperties(header) {
            var section = header.nextElementSibling;
            if (section && section.classList.contains('properties-section')) { // Check for 'properties-section' class
                section.classList.toggle('open');
            }
        }

        function createTenant() {
            var name = document.getElementById('ct-name').value.trim();
            var slug = document.getElementById('ct-slug').value.trim();
            if (!name || !slug) { alert('Name and slug are required'); return; }
            post('create_tenant', {
                name: name,
                slug: slug,
                owner_name: document.getElementById('ct-owner-name').value.trim(),
                owner_email: document.getElementById('ct-owner-email').value.trim(),
                subscription_plan: document.getElementById('ct-plan').value,
                max_properties: 10,
            }).then(function (data) {
                if (data.success) {
                    var message = data.message;
                    if (data.admin_username && data.admin_temp_password) {
                        message += '\n\n🔑 SUPER ADMIN CREDENTIALS (Share with tenant):\n' +
                                   'Username: ' + data.admin_username + '\n' +
                                   'Temporary Password: ' + data.admin_temp_password + '\n\n' +
                                   'The tenant must change this password on first login at: /artists_farm/tenant_login.php';
                    }
                    alert(message);
                    location.reload();
                } else {
                    alert('❌ ' + data.message);
                }
            });
        }

        function editTenant(tenantId, event) {
            event.stopPropagation();
            var btn = event.target;
            document.getElementById('et-tenant-id').value = tenantId;
            document.getElementById('et-name').value = btn.dataset.name || '';
            document.getElementById('et-owner-name').value = btn.dataset.ownerName || '';
            document.getElementById('et-owner-email').value = btn.dataset.ownerEmail || '';
            document.getElementById('et-plan').value = btn.dataset.plan || 'free';
            showModal('edit-tenant');
        }

        function updateTenant() {
            var tenantId = document.getElementById('et-tenant-id').value;
            var name = document.getElementById('et-name').value.trim();
            if (!name) { alert('Tenant name is required'); return; }
            post('edit_tenant', {
                tenant_id: tenantId,
                name: name,
                owner_name: document.getElementById('et-owner-name').value.trim(),
                owner_email: document.getElementById('et-owner-email').value.trim(),
                subscription_plan: document.getElementById('et-plan').value,
                max_properties: 10,
                max_users: 5,
            }).then(function (data) {
                alert(data.message);
                if (data.success) location.reload();
            });
        }

        function deactivateTenant(tenantId, event) {
            event.stopPropagation();
            if (!confirm('Deactivate this tenant and ALL its properties?')) return;
            post('deactivate_tenant', { tenant_id: tenantId }).then(function (data) {
                alert(data.message);
                if (data.success) location.reload();
            });
        }

        function activateTenant(tenantId, event) {
            event.stopPropagation();
            post('activate_tenant', { tenant_id: tenantId }).then(function (data) {
                alert(data.message);
                if (data.success) location.reload();
            });
        }

        let deleteTenantId = null;
        function openDeleteTenantModal(tenantId, tenantName) {
            deleteTenantId = tenantId;
            document.getElementById('deleteTenantName').textContent = tenantName;
            document.getElementById('deleteTenantConfirmInput').value = '';
            showModal('delete-tenant');
        }

        function confirmDeleteTenant() {
            const confirmText = document.getElementById('deleteTenantConfirmInput').value.trim();
            if (confirmText !== 'DELETE') {
                alert('Please type "DELETE" exactly to confirm');
                return;
            }
            if (!deleteTenantId) {
                alert('No tenant selected');
                return;
            }
            if (confirm('Are you absolutely sure? This will permanently delete the tenant and ALL its properties and data.')) {
                post('delete_tenant', { tenant_id: deleteTenantId }).then(function (data) {
                    alert(data.message);
                    if (data.success) location.reload();
                });
            }
        }

        let deletePropertyPlatformId = null;
        function openDeletePropertyPlatformModal(propertyId, propertyName) {
            deletePropertyPlatformId = propertyId;
            document.getElementById('deletePropertyPlatformName').textContent = propertyName;
            document.getElementById('deletePropertyPlatformConfirmInput').value = '';
            showModal('delete-property-platform');
        }

        function confirmDeletePropertyPlatform() {
            const confirmText = document.getElementById('deletePropertyPlatformConfirmInput').value.trim();
            if (confirmText !== 'DELETE') {
                alert('Please type "DELETE" exactly to confirm');
                return;
            }
            if (!deletePropertyPlatformId) {
                alert('No property selected');
                return;
            }
            if (confirm('Are you absolutely sure? This will permanently delete the property and ALL its data.')) {
                post('delete_property_platform', { property_id: deletePropertyPlatformId }).then(function (data) {
                    alert(data.message);
                    if (data.success) location.reload();
                });
            }
        }

        function saveProperty() {
            var propertyId = document.getElementById('p-property-id').value;
            var tenantId = document.getElementById('p-tenant-id').value;
            var name = document.getElementById('p-name').value.trim();
            if (!name) { alert('Property name is required'); return; }
            var selectedEl = document.querySelector('.color-option.selected');
            var selectedColor = selectedEl ? selectedEl.getAttribute('data-color') : 'blue';

            if (propertyId) {
                post('edit_property', {
                    property_id: propertyId,
                    name: name,
                    address: document.getElementById('p-address').value,
                    max_capacity: parseInt(document.getElementById('p-capacity').value) || 0,
                    color_scheme: selectedColor,
                }).then(function (data) {
                    alert(data.message);
                    if (data.success) location.reload();
                });
            } else {
                post('create_property', {
                    tenant_id: tenantId,
                    name: name,
                    slug: name.toLowerCase().replace(/\s+/g, '-'),
                    address: document.getElementById('p-address').value,
                    max_capacity: parseInt(document.getElementById('p-capacity').value) || 0,
                    color_scheme: selectedColor,
                    property_type: 'vacation_home',
                }).then(function (data) {
                    alert(data.message);
                    if (data.success) location.reload();
                });
            }
        }

        function editProperty(propertyId, event) {
            event.stopPropagation();
            var btn = event.target;
            document.getElementById('property-modal-title').textContent = 'Edit Property';
            document.getElementById('p-property-id').value = propertyId;
            document.getElementById('p-tenant-id').value = '';
            document.getElementById('p-name').value = btn.dataset.name || '';
            document.getElementById('p-address').value = btn.dataset.address || '';
            document.getElementById('p-capacity').value = btn.dataset.capacity || '0';
            document.getElementById('color-scheme-group').style.display = 'none';
            showModal('property'); // Use showModal to handle display logic
        }

        function deactivateProperty(propertyId) {
            if (!confirm('Deactivate this property?')) return;
            post('deactivate_property', { property_id: propertyId }).then(function (data) {
                alert(data.message);
                if (data.success) location.reload();
            });
        }

        function activateProperty(propertyId) {
            post('activate_property', { property_id: propertyId }).then(function (data) {
                alert(data.message);
                if (data.success) location.reload();
            });
        }

        function visitProperty(slug) {
            window.open('http://localhost/artists_farm/' + slug + '/', '_blank');
        }

        function impersonateTenant(tenantId, tenantSlug) {
            fetch('/artists_farm/api/impersonate_tenant.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenant_id: tenantId })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    window.location.href = '/artists_farm/' + tenantSlug + '/dashboard.php';
                } else {
                    alert('Error: ' + data.message);
                }
            })
            .catch(err => alert('Error: ' + err));
        }

        function showModuleModal(propertyId, propertyName) {
            document.getElementById('modules-modal-title').textContent = 'Modules: ' + propertyName;
            var html = '';
            // Fetch current module status for this property
            fetch(`/artists_farm/php/api/router.php?action=get_property_modules&property_id=${propertyId}`)
                .then(r => r.json())
                .then(data => {
                    if (data.status === 'success' && Array.isArray(data.data)) {
                        const propertyModules = data.data;
                        allModules.forEach(function (mod) {
                            const isKitchen = mod.slug === 'kitchen';
                            const currentStatus = propertyModules.find(pm => pm.slug === mod.slug)?.is_enabled === 1;
                            html += `
                                <div class="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm mb-2">
                                    <div class="flex items-center">
                                        <span class="text-sm font-medium text-gray-900 dark:text-white">${mod.name}</span>
                                        ${!isKitchen ? '<span class="ml-2 px-2 py-0.5 bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 text-xs rounded-full">Always On</span>' : ''}
                                    </div>
                                    ${isKitchen ? `
                                        <label class="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" value="" class="sr-only peer" data-property="${propertyId}" data-module="${mod.slug}" onchange="toggleModule(this)" ${currentStatus ? 'checked' : ''}>
                                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                        </label>
                                    ` : `<span class="text-emerald-500 dark:text-emerald-400 text-sm font-bold">Enabled</span>`}
                                </div>
                            `;
                        });
                        document.getElementById('modules-list').innerHTML = html;
                        showModal('modules'); // Use showModal to handle display logic
                    } else {
                        alert('Failed to fetch module statuses.');
                    }
                })
                .catch(err => {
                    console.error('Error fetching module statuses:', err);
                    alert('Error fetching module statuses.');
                });
        }

        function toggleModule(checkbox) {
            var propertyId = checkbox.dataset.property;
            var module = checkbox.dataset.module;
            post('toggle_kitchen_module', { property_id: propertyId, enabled: checkbox.checked }).then(function (data) {
                if (!data.success) { alert(data.message); location.reload(); }
            });
        }
    </script>
</body>
</html>
