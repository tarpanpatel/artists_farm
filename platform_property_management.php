<?php
/**
 * Platform Admin Console - Property & Tenant Management
 * Matches main app's design and styling
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
    http_response_code(403);
    echo json_encode(['error' => 'Access denied. Platform admin privileges required.']);
    exit;
}

$adminUserId = $user['id'];

// Get platform statistics
$stats = [
    'tenants' => $pdo->query("SELECT COUNT(*) FROM tenants")->fetchColumn(),
    'properties' => $pdo->query("SELECT COUNT(*) FROM properties")->fetchColumn(),
    'active_tenants' => $pdo->query("SELECT COUNT(*) FROM tenants WHERE is_active = 1")->fetchColumn(),
    'total_users' => $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn(),
];

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
                'max_properties' => (int)($input['max_properties'] ?? 5),
                'max_users' => (int)($input['max_users'] ?? 10),
            ]);
            if (!$tenantId) {
                echo json_encode(['success' => false, 'message' => 'Failed to create tenant']);
                break;
            }
            $propertyId = createDefaultProperty($pdo, $tenantId, $input['name'] ?? '');
            if ($propertyId) {
                assignDefaultModules($pdo, $tenantId, $propertyId);
                $adminUser = createTenantAdminUser($pdo, $input['name'] ?? '', $tenantId, $propertyId);
            }
            echo json_encode(['success' => true, 'message' => 'Tenant created successfully', 'admin_username' => $adminUser['username'] ?? null, 'admin_temp_password' => $adminUser['temp_password'] ?? null]);
            break;

        case 'edit_tenant':
            $tenantId = (int)($input['tenant_id'] ?? 0);
            $stmt = $pdo->prepare("UPDATE tenants SET name = ?, owner_name = ?, owner_email = ?, subscription_plan = ?, max_properties = ?, max_users = ? WHERE id = ?");
            $ok = $stmt->execute([trim($input['name'] ?? ''), trim($input['owner_name'] ?? ''), trim($input['owner_email'] ?? ''), $input['subscription_plan'] ?? 'free', (int)($input['max_properties'] ?? 5), (int)($input['max_users'] ?? 10), $tenantId]);
            echo json_encode(['success' => $ok, 'message' => $ok ? 'Tenant updated' : 'Update failed']);
            break;

        case 'deactivate_tenant':
            $tenantId = (int)($input['tenant_id'] ?? 0);
            $stmt = $pdo->prepare("UPDATE tenants SET is_active = 0 WHERE id = ?");
            $stmt->execute([$tenantId]);
            $stmt = $pdo->prepare("UPDATE properties SET status = 'inactive' WHERE tenant_id = ?");
            $ok = $stmt->execute([$tenantId]);
            echo json_encode(['success' => $ok, 'message' => $ok ? 'Tenant deactivated' : 'Failed']);
            break;

        case 'activate_tenant':
            $tenantId = (int)($input['tenant_id'] ?? 0);
            $stmt = $pdo->prepare("UPDATE tenants SET is_active = 1 WHERE id = ?");
            $ok = $stmt->execute([$tenantId]);
            echo json_encode(['success' => $ok, 'message' => $ok ? 'Tenant activated' : 'Failed']);
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
                        try { $pdo->prepare("DELETE FROM `$table` WHERE property_id = ?")->execute([$propId]); } catch (Exception $e) {}
                    }
                }
                $pdo->prepare("DELETE FROM properties WHERE tenant_id = ?")->execute([$tenantId]);
                $pdo->prepare("DELETE FROM tenant_users WHERE tenant_id = ?")->execute([$tenantId]);
                $pdo->prepare("DELETE FROM tenants WHERE id = ?")->execute([$tenantId]);
                $pdo->commit();
                echo json_encode(['success' => true, 'message' => 'Tenant deleted']);
            } catch (Exception $e) {
                $pdo->rollBack();
                echo json_encode(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
            }
            break;

        case 'create_property':
            $result = createProperty($pdo, ['tenant_id' => !empty($input['tenant_id']) ? (int)$input['tenant_id'] : null, 'name' => trim($input['name'] ?? ''), 'slug' => trim($input['slug'] ?? ''), 'address' => trim($input['address'] ?? ''), 'max_capacity' => (int)($input['max_capacity'] ?? 0), 'tailwind_color_scheme' => trim($input['color_scheme'] ?? 'blue')], $adminUserId);
            if (!empty($result['success']) && !empty($result['property_id'])) {
                assignDefaultModules($pdo, $input['tenant_id'] ?? null, $result['property_id']);
            }
            echo json_encode($result);
            break;

        case 'edit_property':
            $propertyId = (int)($input['property_id'] ?? 0);
            $stmt = $pdo->prepare("UPDATE properties SET name = ?, slug = ?, address = ?, max_capacity = ?, tailwind_color_scheme = ? WHERE id = ?");
            $ok = $stmt->execute([trim($input['name'] ?? ''), trim($input['slug'] ?? ''), trim($input['address'] ?? ''), (int)($input['max_capacity'] ?? 0), trim($input['color_scheme'] ?? 'blue'), $propertyId]);
            echo json_encode(['success' => $ok, 'message' => $ok ? 'Property updated' : 'Failed']);
            break;

        case 'activate_property':
            $propertyId = (int)($input['property_id'] ?? 0);
            $stmt = $pdo->prepare("UPDATE properties SET status = 'active' WHERE id = ?");
            $ok = $stmt->execute([$propertyId]);
            echo json_encode(['success' => $ok, 'message' => $ok ? 'Property activated' : 'Failed']);
            break;

        case 'deactivate_property':
            $propertyId = (int)($input['property_id'] ?? 0);
            $stmt = $pdo->prepare("UPDATE properties SET status = 'inactive' WHERE id = ?");
            $ok = $stmt->execute([$propertyId]);
            echo json_encode(['success' => $ok, 'message' => $ok ? 'Property deactivated' : 'Failed']);
            break;

        case 'toggle_kitchen_module':
            $propertyId = (int)($input['property_id'] ?? 0);
            $enabled = !empty($input['enabled']);
            $stmt = $pdo->prepare("UPDATE property_modules SET is_enabled = ? WHERE property_id = ? AND module_slug = 'kitchen'");
            $ok = $stmt->execute([$enabled ? 1 : 0, $propertyId]);
            echo json_encode(['success' => $ok, 'message' => $ok ? 'Kitchen module updated' : 'Failed']);
            break;

        case 'delete_property_platform':
            try {
                $propertyId = (int)($input['property_id'] ?? 0);
                if (!$propertyId) { echo json_encode(['success' => false, 'message' => 'Invalid ID']); break; }
                $pdo->beginTransaction();
                $tables = ['guests', 'financial_ledger', 'kitchen_orders', 'food_menu', 'kitchen_stock', 'stock_requests', 'stock_requisitions', 'stock_purchases', 'stock_wastage', 'stock_adjustments', 'stock_log', 'inventory_items', 'staff_users', 'staff_roles', 'cash_drawer', 'petty_cash', 'misc_charges', 'telegram_settings', 'property_modules'];
                foreach ($tables as $table) { try { $pdo->prepare("DELETE FROM `$table` WHERE property_id = ?")->execute([$propertyId]); } catch (Exception $e) {} }
                $pdo->prepare("DELETE FROM properties WHERE id = ?")->execute([$propertyId]);
                $pdo->commit();
                echo json_encode(['success' => true, 'message' => 'Property deleted']);
            } catch (Exception $e) {
                $pdo->rollBack();
                echo json_encode(['success' => false, 'message' => $e->getMessage()]);
            }
            break;

        default:
            echo json_encode(['success' => false, 'message' => 'Unknown action']);
    }
    exit;
}

$tenants = $pdo->query("SELECT * FROM tenants ORDER BY name")->fetchAll();
$allModules = getAllModules($pdo);
?>
<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Platform Admin - Artists Farm</title>
    <link rel="stylesheet" href="/artists_farm/src/index.css">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8f9fa; color: #333; }

        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1.25rem 2rem; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header h1 { font-size: 1.5rem; font-weight: 700; }
        .header-nav { display: flex; gap: 1.5rem; align-items: center; }
        .nav-link { color: white; text-decoration: none; font-size: 0.95rem; padding: 0.5rem 1rem; border-radius: 6px; transition: background 0.2s; }
        .nav-link:hover { background: rgba(255,255,255,0.15); }
        .logout-btn { background: rgba(255,255,255,0.2); border: none; color: white; padding: 0.5rem 1.25rem; border-radius: 6px; cursor: pointer; font-weight: 500; }
        .logout-btn:hover { background: rgba(255,255,255,0.3); }

        .container { max-width: 1400px; margin: 2rem auto; padding: 0 1rem; }
        .content-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem; }
        .content-header h2 { font-size: 1.75rem; font-weight: 700; color: #333; }
        .btn { padding: 0.75rem 1.5rem; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.95rem; transition: all 0.2s; display: inline-flex; align-items: center; gap: 0.5rem; }
        .btn-primary { background: #667eea; color: white; }
        .btn-primary:hover { background: #5568d3; box-shadow: 0 4px 12px rgba(102,126,234,0.4); }
        .btn-secondary { background: white; color: #667eea; border: 2px solid #667eea; }
        .btn-secondary:hover { background: #f8f9ff; }
        .btn-danger { background: #ef4444; color: white; }
        .btn-danger:hover { background: #dc2626; }
        .btn-success { background: #10b981; color: white; }
        .btn-success:hover { background: #059669; }
        .btn-sm { padding: 0.4rem 0.8rem; font-size: 0.8rem; }

        .tenant-list { display: grid; gap: 1.5rem; }
        .tenant-card { background: white; border-radius: 12px; padding: 1.75rem; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #e5e7eb; transition: all 0.2s; }
        .tenant-card:hover { box-shadow: 0 8px 16px rgba(0,0,0,0.1); }
        .tenant-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
        .tenant-info h3 { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; }
        .tenant-meta { font-size: 0.9rem; color: #666; display: flex; gap: 1.5rem; flex-wrap: wrap; }
        .badge { display: inline-block; padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; }
        .badge-active { background: #d1fae5; color: #065f46; }
        .badge-inactive { background: #fee2e2; color: #991b1b; }
        .badge-plan { background: #dbeafe; color: #1e40af; }
        .tenant-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }

        .properties-section { margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid #e5e7eb; }
        .properties-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .properties-header h4 { font-size: 1rem; font-weight: 700; color: #333; }
        .properties-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
        .property-card { background: #f8f9fa; border-radius: 8px; padding: 1rem; border: 1px solid #e5e7eb; }
        .property-name { font-weight: 700; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem; }
        .property-meta { font-size: 0.85rem; color: #666; margin-bottom: 1rem; }
        .property-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }

        .modal { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center; }
        .modal.active { display: flex; }
        .modal-content { background: white; border-radius: 12px; width: 480px; max-width: 90%; max-height: 90vh; overflow-y: auto; padding: 2rem; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
        .modal-header { font-size: 1.5rem; font-weight: 700; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; }
        .modal-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #999; }
        .form-group { margin-bottom: 1.25rem; }
        .form-label { display: block; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.95rem; }
        .form-input, .form-select { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 6px; font-size: 0.95rem; }
        .form-input:focus, .form-select:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102,126,234,0.1); }
        .modal-footer { display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem; }

        .empty-state { text-align: center; padding: 2rem; color: #999; }
        .empty-state-icon { font-size: 3rem; margin-bottom: 1rem; }

        .color-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.75rem; margin-bottom: 1rem; }
        .color-option { width: 100%; aspect-ratio: 1; border-radius: 8px; border: 2px solid #ddd; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; font-size: 0.8rem; color: #666; }
        .color-option:hover { border-color: #667eea; }
        .color-option.selected { border-color: #667eea; box-shadow: 0 0 0 3px rgba(102,126,234,0.2); font-weight: bold; }

        .toggle-switch { position: relative; display: inline-block; width: 50px; height: 24px; }
        .toggle-switch input { opacity: 0; width: 0; height: 0; }
        .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: 0.4s; border-radius: 24px; }
        .toggle-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: 0.4s; border-radius: 50%; }
        .toggle-switch input:checked + .toggle-slider { background-color: #10b981; }
        .toggle-switch input:checked + .toggle-slider:before { transform: translateX(26px); }

        .toggle-group { display: flex; align-items: center; gap: 1rem; }

        @media (max-width: 768px) {
            .header { flex-direction: column; gap: 1rem; }
            .header-nav { flex-direction: column; width: 100%; }
            .tenant-header { flex-direction: column; }
        }
    </style>
</head>
<body>
    <!-- HEADER -->
    <div class="header">
        <h1>🏢 Platform Admin Console</h1>
        <div class="header-nav">
            <span><?php echo htmlspecialchars($user['username']); ?></span>
            <a href="/artists_farm/logout.php" class="logout-btn">Logout</a>
        </div>
    </div>

    <!-- MAIN CONTENT -->
    <div class="container">
        <div class="content-header">
            <h2>Platform Overview</h2>
            <div style="font-size: 0.9rem; color: #666;">Last updated: <?php echo date('M d, Y H:i:s'); ?></div>
        </div>

        <!-- STATS DASHBOARD -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2.5rem;">
            <div style="background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="font-size: 2rem; font-weight: 700; color: #0284c7; margin-bottom: 0.5rem;"><?php echo $stats['tenants']; ?></div>
                <div style="color: #666; font-size: 0.9rem;">Total Tenants</div>
            </div>
            <div style="background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="font-size: 2rem; font-weight: 700; color: #16a34a; margin-bottom: 0.5rem;"><?php echo $stats['active_tenants']; ?></div>
                <div style="color: #666; font-size: 0.9rem;">Active Tenants</div>
            </div>
            <div style="background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="font-size: 2rem; font-weight: 700; color: #9333ea; margin-bottom: 0.5rem;"><?php echo $stats['properties']; ?></div>
                <div style="color: #666; font-size: 0.9rem;">Total Properties</div>
            </div>
            <div style="background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="font-size: 2rem; font-weight: 700; color: #f59e0b; margin-bottom: 0.5rem;"><?php echo $stats['total_users']; ?></div>
                <div style="color: #666; font-size: 0.9rem;">Total Users</div>
            </div>
        </div>

        <div class="content-header" style="margin-top: 2rem;">
            <h2>Manage Tenants & Properties</h2>
            <button class="btn btn-primary" onclick="openCreateTenantModal()">+ New Tenant</button>
        </div>

        <div class="tenant-list">
            <?php if (empty($tenants)): ?>
                <div class="tenant-card empty-state">
                    <div class="empty-state-icon">🏗️</div>
                    <p>No tenants yet. Create your first tenant to get started.</p>
                </div>
            <?php else: ?>
                <?php foreach ($tenants as $t):
                    $properties = $pdo->prepare("SELECT * FROM properties WHERE tenant_id = ? ORDER BY name");
                    $properties->execute([$t['id']]);
                    $props = $properties->fetchAll();
                ?>
                <div class="tenant-card">
                    <div class="tenant-header">
                        <div class="tenant-info">
                            <h3><?php echo htmlspecialchars($t['name']); ?></h3>
                            <div class="tenant-meta">
                                <div>Owner: <?php echo htmlspecialchars($t['owner_name'] ?? 'N/A'); ?></div>
                                <span class="badge badge-plan"><?php echo ucfirst($t['subscription_plan']); ?></span>
                                <span class="badge <?php echo $t['is_active'] ? 'badge-active' : 'badge-inactive'; ?>">
                                    <?php echo $t['is_active'] ? '✓ Active' : '✗ Inactive'; ?>
                                </span>
                            </div>
                        </div>
                        <div class="tenant-actions">
                            <button class="btn btn-primary btn-sm" onclick="impersonateTenant(<?php echo (int)$t['id']; ?>, '<?php echo htmlspecialchars($t['slug']); ?>')">📊 Dashboard</button>
                            <button class="btn btn-secondary btn-sm" onclick="editTenant(<?php echo (int)$t['id']; ?>, event)" data-name="<?php echo htmlspecialchars($t['name']); ?>" data-owner-name="<?php echo htmlspecialchars($t['owner_name'] ?? ''); ?>" data-owner-email="<?php echo htmlspecialchars($t['owner_email'] ?? ''); ?>" data-plan="<?php echo htmlspecialchars($t['subscription_plan']); ?>">Edit</button>
                            <?php if ($t['is_active']): ?>
                                <button class="btn btn-danger btn-sm" onclick="deactivateTenant(<?php echo (int)$t['id']; ?>)">Deactivate</button>
                            <?php else: ?>
                                <button class="btn btn-success btn-sm" onclick="activateTenant(<?php echo (int)$t['id']; ?>)">Activate</button>
                            <?php endif; ?>
                            <button class="btn btn-danger btn-sm" onclick="openDeleteTenantModal(<?php echo (int)$t['id']; ?>, '<?php echo htmlspecialchars($t['name']); ?>')">Delete</button>
                        </div>
                    </div>

                    <!-- PROPERTIES SECTION -->
                    <div class="properties-section">
                        <div class="properties-header">
                            <h4>Properties (<?php echo count($props); ?>)</h4>
                            <button class="btn btn-primary btn-sm" onclick="openCreatePropertyModal(<?php echo (int)$t['id']; ?>)">+ Add Property</button>
                        </div>

                        <?php if (empty($props)): ?>
                            <div class="empty-state" style="padding: 1rem; color: #999;">No properties yet</div>
                        <?php else: ?>
                            <div class="properties-grid">
                                <?php foreach ($props as $p): ?>
                                <div class="property-card">
                                    <div class="property-name">
                                        <?php echo htmlspecialchars($p['name']); ?>
                                        <span class="badge <?php echo $p['status'] === 'active' ? 'badge-active' : 'badge-inactive'; ?>" style="font-size: 0.7rem;">
                                            <?php echo ucfirst($p['status']); ?>
                                        </span>
                                    </div>
                                    <div class="property-meta">
                                        <?php echo htmlspecialchars($p['slug']); ?> • Capacity: <?php echo (int)$p['max_capacity']; ?>
                                    </div>
                                    <div class="property-actions">
                                        <button class="btn btn-secondary btn-sm" onclick="visitProperty('<?php echo htmlspecialchars($t['slug']); ?>', '<?php echo htmlspecialchars($p['slug']); ?>')">Open</button>
                                        <button class="btn btn-secondary btn-sm" onclick="impersonateTenant(<?php echo (int)$t['id']; ?>, '<?php echo htmlspecialchars($t['slug']); ?>')">Log In</button>
                                        <button class="btn btn-secondary btn-sm" onclick="editProperty(<?php echo (int)$p['id']; ?>, event)" data-name="<?php echo htmlspecialchars($p['name']); ?>" data-slug="<?php echo htmlspecialchars($p['slug']); ?>" data-address="<?php echo htmlspecialchars($p['address'] ?? ''); ?>" data-capacity="<?php echo (int)$p['max_capacity']; ?>" data-color="<?php echo htmlspecialchars($p['tailwind_color_scheme'] ?? 'blue'); ?>">Edit</button>
                                        <?php if ($p['status'] === 'active'): ?>
                                            <button class="btn btn-danger btn-sm" onclick="deactivateProperty(<?php echo (int)$p['id']; ?>)">Deactivate</button>
                                        <?php else: ?>
                                            <button class="btn btn-success btn-sm" onclick="activateProperty(<?php echo (int)$p['id']; ?>)">Activate</button>
                                        <?php endif; ?>
                                        <button class="btn btn-danger btn-sm" onclick="openDeletePropertyModal(<?php echo (int)$p['id']; ?>, '<?php echo htmlspecialchars($p['name']); ?>')">Delete</button>
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

    <!-- MODALS -->
    <div class="modal" id="createTenantModal">
        <div class="modal-content">
            <div class="modal-header">
                <span>Create New Tenant</span>
                <button class="modal-close" onclick="closeModal('createTenantModal')">&times;</button>
            </div>
            <div class="form-group">
                <label class="form-label">Tenant Name *</label>
                <input type="text" id="tenantName" class="form-input" placeholder="e.g., Sunset Resorts">
            </div>
            <div class="form-group">
                <label class="form-label">URL Slug *</label>
                <input type="text" id="tenantSlug" class="form-input" placeholder="e.g., sunset-resorts">
            </div>
            <div class="form-group">
                <label class="form-label">Owner Name</label>
                <input type="text" id="tenantOwnerName" class="form-input">
            </div>
            <div class="form-group">
                <label class="form-label">Owner Email</label>
                <input type="text" id="tenantOwnerEmail" class="form-input">
            </div>
            <div class="form-group">
                <label class="form-label">Subscription Plan</label>
                <select id="tenantPlan" class="form-select">
                    <option value="free">Free</option>
                    <option value="basic">Basic</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                </select>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal('createTenantModal')">Cancel</button>
                <button class="btn btn-primary" onclick="createTenant()">Create Tenant</button>
            </div>
        </div>
    </div>

    <div class="modal" id="createPropertyModal">
        <div class="modal-content">
            <div class="modal-header">
                <span id="propertyModalTitle">Add New Property</span>
                <button class="modal-close" onclick="closeModal('createPropertyModal')">&times;</button>
            </div>
            <input type="hidden" id="propertyTenantId">
            <input type="hidden" id="propertyId">
            <div class="form-group">
                <label class="form-label">Property Name *</label>
                <input type="text" id="propertyName" class="form-input">
            </div>
            <div class="form-group">
                <label class="form-label">Property Slug *</label>
                <input type="text" id="propertySlug" class="form-input" placeholder="auto-generated from name">
            </div>
            <div class="form-group">
                <label class="form-label">Address</label>
                <input type="text" id="propertyAddress" class="form-input">
            </div>
            <div class="form-group">
                <label class="form-label">Max Capacity</label>
                <input type="number" id="propertyCapacity" class="form-input" value="0" min="0">
            </div>
            <div class="form-group">
                <label class="form-label">Color Scheme</label>
                <div class="color-grid" id="colorGrid"></div>
            </div>
            <div class="form-group">
                <div class="toggle-group">
                    <label class="form-label" style="margin-bottom: 0;">Kitchen Module</label>
                    <label class="toggle-switch">
                        <input type="checkbox" id="kitchenModuleToggle" checked>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal('createPropertyModal')">Cancel</button>
                <button class="btn btn-primary" onclick="saveProperty()">Save Property</button>
            </div>
        </div>
    </div>

    <div class="modal" id="deletePropertyModal">
        <div class="modal-content">
            <div class="modal-header">
                <span>Delete Property</span>
                <button class="modal-close" onclick="closeModal('deletePropertyModal')">&times;</button>
            </div>
            <div style="background: #fee2e2; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; color: #991b1b;">
                ⚠️ This action cannot be undone. All property data will be permanently deleted.
            </div>
            <p style="margin-bottom: 1rem;">Property: <strong id="deletePropertyName"></strong></p>
            <div class="form-group">
                <label class="form-label">Type "DELETE" to confirm:</label>
                <input type="text" id="deletePropertyConfirm" class="form-input" placeholder="Type DELETE">
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal('deletePropertyModal')">Cancel</button>
                <button class="btn btn-danger" onclick="confirmDeleteProperty()">Delete Property</button>
            </div>
        </div>
    </div>

    <div class="modal" id="deleteTenantModal">
        <div class="modal-content">
            <div class="modal-header">
                <span>Delete Tenant</span>
                <button class="modal-close" onclick="closeModal('deleteTenantModal')">&times;</button>
            </div>
            <div style="background: #fee2e2; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; color: #991b1b;">
                ⚠️ This action cannot be undone. Tenant and ALL properties/data will be deleted.
            </div>
            <p style="margin-bottom: 1rem;">Tenant: <strong id="deleteTenantName"></strong></p>
            <div class="form-group">
                <label class="form-label">Type "DELETE" to confirm:</label>
                <input type="text" id="deleteTenantConfirm" class="form-input" placeholder="Type DELETE">
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal('deleteTenantModal')">Cancel</button>
                <button class="btn btn-danger" onclick="confirmDeleteTenant()">Delete Tenant</button>
            </div>
        </div>
    </div>

    <script>
        let deletePropertyId = null;
        let deleteTenantId = null;

        function post(action, payload) {
            return fetch('/artists_farm/platform_property_management.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({ action }, payload))
            }).then(r => r.json());
        }

        function openModal(id) { document.getElementById(id).classList.add('active'); }
        function closeModal(id) { document.getElementById(id).classList.remove('active'); }
        function openCreateTenantModal() { openModal('createTenantModal'); }
        function openCreatePropertyModal(tenantId) {
            document.getElementById('propertyModalTitle').textContent = 'Add New Property';
            document.getElementById('propertyId').value = '';
            document.getElementById('propertyTenantId').value = tenantId;
            document.getElementById('propertyName').value = '';
            document.getElementById('propertySlug').value = '';
            document.getElementById('propertyAddress').value = '';
            document.getElementById('propertyCapacity').value = '0';
            renderColorGrid('blue');
            document.getElementById('kitchenModuleToggle').checked = true;
            openModal('createPropertyModal');
        }
        function openDeletePropertyModal(id, name) { deletePropertyId = id; document.getElementById('deletePropertyName').textContent = name; document.getElementById('deletePropertyConfirm').value = ''; openModal('deletePropertyModal'); }
        function openDeleteTenantModal(id, name) { deleteTenantId = id; document.getElementById('deleteTenantName').textContent = name; document.getElementById('deleteTenantConfirm').value = ''; openModal('deleteTenantModal'); }

        function createTenant() {
            const name = document.getElementById('tenantName').value.trim();
            const slug = document.getElementById('tenantSlug').value.trim();
            if (!name || !slug) { alert('Name and slug are required'); return; }
            post('create_tenant', { name, slug, owner_name: document.getElementById('tenantOwnerName').value.trim(), owner_email: document.getElementById('tenantOwnerEmail').value.trim(), subscription_plan: document.getElementById('tenantPlan').value }).then(data => {
                if (data.success && data.admin_username) { alert(data.message + '\n\nSuper Admin:\nUsername: ' + data.admin_username + '\nPassword: ' + data.admin_temp_password); location.reload(); }
                else { alert(data.message); if (data.success) location.reload(); }
            });
        }

        function editTenant(tenantId, event) {
            const btn = event.target;
            document.getElementById('tenantName').value = btn.dataset.name;
            document.getElementById('tenantSlug').value = btn.dataset.name.toLowerCase().replace(/\s+/g, '-');
            document.getElementById('tenantOwnerName').value = btn.dataset.ownerName;
            document.getElementById('tenantOwnerEmail').value = btn.dataset.ownerEmail;
            document.getElementById('tenantPlan').value = btn.dataset.plan;
            openModal('createTenantModal');
        }

        const colorOptions = ['blue', 'emerald', 'red', 'indigo', 'purple', 'pink', 'amber', 'cyan', 'slate', 'gray'];
        const colorMap = {'blue': '#3b82f6', 'emerald': '#10b981', 'red': '#ef4444', 'indigo': '#6366f1', 'purple': '#a855f7', 'pink': '#ec4899', 'amber': '#f59e0b', 'cyan': '#06b6d4', 'slate': '#64748b', 'gray': '#6b7280'};

        function renderColorGrid(selected = 'blue') {
            const grid = document.getElementById('colorGrid');
            grid.innerHTML = colorOptions.map(color => `<div class="color-option ${color === selected ? 'selected' : ''}" style="background-color: ${colorMap[color]}" onclick="selectColor('${color}')" data-color="${color}" title="${color}"></div>`).join('');
        }

        function selectColor(color) {
            document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
            document.querySelector(`.color-option[data-color="${color}"]`).classList.add('selected');
        }

        function createProperty() {
            const name = document.getElementById('propertyName').value.trim();
            const tenantId = document.getElementById('propertyTenantId').value;
            if (!name) { alert('Property name is required'); return; }
            let slug = document.getElementById('propertySlug').value.trim();
            if (!slug) slug = name.toLowerCase().replace(/\s+/g, '-');
            const selectedColor = document.querySelector('.color-option.selected')?.dataset.color || 'blue';
            post('create_property', { tenant_id: tenantId, name, slug, address: document.getElementById('propertyAddress').value.trim(), max_capacity: parseInt(document.getElementById('propertyCapacity').value) || 0, color_scheme: selectedColor }).then(data => {
                alert(data.message);
                if (data.success) location.reload();
            });
        }

        function editProperty(propertyId, event) {
            const btn = event.target;
            document.getElementById('propertyModalTitle').textContent = 'Edit Property';
            document.getElementById('propertyId').value = propertyId;
            document.getElementById('propertyTenantId').value = '';
            document.getElementById('propertyName').value = btn.dataset.name;
            document.getElementById('propertySlug').value = btn.dataset.slug;
            document.getElementById('propertyAddress').value = btn.dataset.address;
            document.getElementById('propertyCapacity').value = btn.dataset.capacity;
            renderColorGrid(btn.dataset.color || 'blue');
            fetch(`/artists_farm/php/api/router.php?action=get_property_modules&property_id=${propertyId}`).then(r => r.json()).then(data => {
                if (data.data) {
                    const kitchenModule = data.data.find(m => m.slug === 'kitchen');
                    document.getElementById('kitchenModuleToggle').checked = kitchenModule ? kitchenModule.is_enabled : false;
                }
            }).catch(() => { document.getElementById('kitchenModuleToggle').checked = true; });
            openModal('createPropertyModal');
        }

        function saveProperty() {
            const propertyId = document.getElementById('propertyId').value;
            const name = document.getElementById('propertyName').value.trim();
            let slug = document.getElementById('propertySlug').value.trim();
            if (!name) { alert('Property name is required'); return; }
            if (!slug) slug = name.toLowerCase().replace(/\s+/g, '-');
            const selectedColor = document.querySelector('.color-option.selected')?.dataset.color || 'blue';
            if (propertyId) {
                post('edit_property', { property_id: propertyId, name, slug, address: document.getElementById('propertyAddress').value.trim(), max_capacity: parseInt(document.getElementById('propertyCapacity').value) || 0, color_scheme: selectedColor }).then(data => {
                    alert(data.message);
                    if (data.success) {
                        const kitchenEnabled = document.getElementById('kitchenModuleToggle').checked;
                        post('toggle_kitchen_module', { property_id: propertyId, enabled: kitchenEnabled }).then(() => location.reload());
                    }
                });
            } else {
                createProperty();
            }
        }

        function deactivateTenant(tenantId) { if (confirm('Deactivate this tenant?')) { post('deactivate_tenant', { tenant_id: tenantId }).then(data => { alert(data.message); if (data.success) location.reload(); }); } }
        function activateTenant(tenantId) { post('activate_tenant', { tenant_id: tenantId }).then(data => { alert(data.message); if (data.success) location.reload(); }); }
        function deactivateProperty(propertyId) { if (confirm('Deactivate this property?')) { post('deactivate_property', { property_id: propertyId }).then(data => { alert(data.message); if (data.success) location.reload(); }); } }
        function activateProperty(propertyId) { post('activate_property', { property_id: propertyId }).then(data => { alert(data.message); if (data.success) location.reload(); }); }

        function confirmDeleteProperty() { if (document.getElementById('deletePropertyConfirm').value !== 'DELETE') { alert('Type "DELETE" to confirm'); return; } if (confirm('Delete this property?')) { post('delete_property_platform', { property_id: deletePropertyId }).then(data => { alert(data.message); if (data.success) location.reload(); }); } }
        function confirmDeleteTenant() { if (document.getElementById('deleteTenantConfirm').value !== 'DELETE') { alert('Type "DELETE" to confirm'); return; } if (confirm('Delete this tenant?')) { post('delete_tenant', { tenant_id: deleteTenantId }).then(data => { alert(data.message); if (data.success) location.reload(); }); } }

        function visitProperty(tenantSlug, propertySlug) {
          window.open('http://localhost/artists_farm/' + tenantSlug + '/' + propertySlug + '/', '_blank');
        }
        function impersonateTenant(tenantId, tenantSlug) {
          window.location.href = '/artists_farm/' + tenantSlug + '/';
        }

        document.querySelectorAll('.modal').forEach(modal => { modal.addEventListener('click', e => { if (e.target === modal) closeModal(modal.id); }); });
    </script>
</body>
</html>
