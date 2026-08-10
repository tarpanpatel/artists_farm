<?php
/**
 * Auto-Login Endpoint
 * Generates a temporary token for auto-login from admin dashboard
 */

session_start();
header('Content-Type: application/json; charset=UTF-8');
require_once __DIR__ . '/../php/config/database.php';

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}

$userId = (int)$_SESSION['user_id'];
$stmt = $pdo->prepare("SELECT id, username, role, is_platform_admin FROM users WHERE id = ?");
$stmt->execute([$userId]);
$user = $stmt->fetch();

if (!$user) {
    echo json_encode(['success' => false, 'message' => 'User not found']);
    exit;
}

// Generate a temporary token (valid for 5 minutes)
$token = bin2hex(random_bytes(32));
$expiresAt = date('Y-m-d H:i:s', time() + 300); // 5 minutes

// Store token (you could use a temp table or cache, for now just return it)
// In production, you'd store this in a temp_tokens table
$tokenData = [
    'user_id' => $userId,
    'username' => $user['username'],
    'role' => $user['role'],
    'is_platform_admin' => (bool)$user['is_platform_admin'],
    'created_at' => date('Y-m-d H:i:s'),
    'expires_at' => $expiresAt,
];

echo json_encode([
    'success' => true,
    'token' => base64_encode(json_encode($tokenData)),
]);
?>
