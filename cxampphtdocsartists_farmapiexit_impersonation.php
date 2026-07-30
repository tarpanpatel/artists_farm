<?php
/**
 * Exit Tenant Impersonation
 * Restores platform admin session after impersonation
 */

session_start();
header('Content-Type: application/json; charset=UTF-8');
require_once __DIR__ . '/../php/config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

if (!isset($_SESSION['is_platform_admin_impersonating'])) {
    // Not impersonating, just redirect to platform admin console
    echo json_encode(['success' => true, 'redirect' => '/artists_farm/platform_property_management.php']);
    exit;
}

$platformAdminId = (int)$_SESSION['is_platform_admin_impersonating'];

// Verify platform admin still exists
$stmt = $pdo->prepare("SELECT id, username, is_platform_admin FROM users WHERE id = ?");
$stmt->execute([$platformAdminId]);
$admin = $stmt->fetch();

if (!$admin || !$admin['is_platform_admin']) {
    // Platform admin no longer exists or lost admin privileges
    session_destroy();
    echo json_encode(['success' => false, 'message' => 'Platform admin account no longer available', 'redirect' => '/artists_farm/login.php']);
    exit;
}

// Restore platform admin session
$_SESSION['user_id'] = $platformAdminId;
$_SESSION['username'] = $admin['username'];
$_SESSION['is_platform_admin'] = true;
unset($_SESSION['tenant_id']);
unset($_SESSION['is_platform_admin_impersonating']);

echo json_encode(['success' => true, 'redirect' => '/artists_farm/platform_property_management.php']);
?>
