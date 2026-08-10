<?php
/**
 * Exit Tenant Impersonation
 * Clears impersonation flags and returns to platform admin console
 */

session_start();
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

if (empty($_SESSION['impersonating_tenant_id'])) {
    // Not impersonating, just redirect to platform admin console
    echo json_encode(['success' => true, 'redirect' => '/artists_farm/platform_property_management.php']);
    exit;
}

// Clear impersonation flags
unset($_SESSION['impersonating_tenant_id']);
unset($_SESSION['impersonating_tenant_slug']);

echo json_encode(['success' => true, 'redirect' => '/artists_farm/platform_property_management.php']);
?>
