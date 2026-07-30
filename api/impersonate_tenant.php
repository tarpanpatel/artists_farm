<?php
/**
 * Tenant Impersonation Endpoint
 * Allows platform admin to view tenant dashboard while keeping admin session
 */

session_start();
header('Content-Type: application/json; charset=UTF-8');
require_once __DIR__ . '/../php/config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Invalid request method']);
    exit;
}

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$platformAdminId = (int)$_SESSION['user_id'];
$stmt = $pdo->prepare("SELECT is_platform_admin FROM users WHERE id = ?");
$stmt->execute([$platformAdminId]);
$admin = $stmt->fetch();

if (!$admin || !$admin['is_platform_admin']) {
    echo json_encode(['success' => false, 'message' => 'Only platform admins can impersonate tenants']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$tenantId = (int)($input['tenant_id'] ?? 0);

if (!$tenantId) {
    echo json_encode(['success' => false, 'message' => 'Invalid tenant ID']);
    exit;
}

$stmt = $pdo->prepare("SELECT id, slug FROM tenants WHERE id = ?");
$stmt->execute([$tenantId]);
$tenant = $stmt->fetch();

if (!$tenant) {
    echo json_encode(['success' => false, 'message' => 'Tenant not found']);
    exit;
}

// Keep platform admin session, but add impersonation context
$_SESSION['impersonating_tenant_id'] = $tenantId;
$_SESSION['impersonating_tenant_slug'] = $tenant['slug'];

echo json_encode(['success' => true, 'message' => 'Impersonation started', 'tenant_slug' => $tenant['slug']]);
?>
