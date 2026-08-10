<?php
/**
 * Delete Property Endpoint
 * Only tenant admins can delete their own properties
 */

session_start();
header('Content-Type: application/json; charset=UTF-8');
require_once __DIR__ . '/../php/config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Invalid request method']);
    exit;
}

if (!isset($_SESSION['user_id']) || !isset($_SESSION['tenant_id'])) {
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$propertyId = (int)($input['property_id'] ?? 0);
$tenantId = (int)$_SESSION['tenant_id'];

if (!$propertyId) {
    echo json_encode(['success' => false, 'message' => 'Invalid property ID']);
    exit;
}

try {
    $stmt = $pdo->prepare("SELECT id, tenant_id FROM properties WHERE id = ? AND tenant_id = ?");
    $stmt->execute([$propertyId, $tenantId]);
    $property = $stmt->fetch();

    if (!$property) {
        echo json_encode(['success' => false, 'message' => 'Property not found or access denied']);
        exit;
    }

    $pdo->beginTransaction();

    $tables = [
        'guests',
        'financial_ledger',
        'kitchen_orders',
        'food_menu',
        'kitchen_stock',
        'stock_requests',
        'stock_requisitions',
        'stock_purchases',
        'stock_wastage',
        'stock_adjustments',
        'stock_log',
        'inventory_items',
        'staff_users',
        'staff_roles',
        'cash_drawer',
        'petty_cash',
        'misc_charges',
        'telegram_settings',
        'property_modules',
    ];

    foreach ($tables as $table) {
        try {
            $stmt = $pdo->prepare("DELETE FROM `$table` WHERE property_id = ?");
            $stmt->execute([$propertyId]);
        } catch (Exception $e) {
            // Table doesn't exist, skip it
        }
    }

    $stmt = $pdo->prepare("DELETE FROM properties WHERE id = ? AND tenant_id = ?");
    $stmt->execute([$propertyId, $tenantId]);

    $pdo->commit();
    echo json_encode(['success' => true, 'message' => 'Property deleted successfully']);
} catch (Exception $e) {
    $pdo->rollBack();
    echo json_encode(['success' => false, 'message' => 'Error: ' . $e->getMessage()]);
}
?>
