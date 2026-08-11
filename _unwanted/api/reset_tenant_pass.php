<?php
require_once __DIR__ . '/../config/database.php';

$username = $_GET['username'] ?? 'vrikshawan';
$new_password = $_GET['password'] ?? 'Admin@123';

try {
    // Check if user exists
    $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if ($user) {
        // Update password
        $hashed = password_hash($new_password, PASSWORD_BCRYPT);
        $stmt = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
        $stmt->execute([$hashed, $user['id']]);
        echo json_encode(['status' => 'success', 'message' => "Password reset for $username", 'username' => $username, 'password' => $new_password]);
    } else {
        // Create new user
        $hashed = password_hash($new_password, PASSWORD_BCRYPT);
        $stmt = $pdo->prepare("INSERT INTO users (username, password, role) VALUES (?, ?, 'Admin')");
        $stmt->execute([$username, $hashed]);
        echo json_encode(['status' => 'success', 'message' => "User created for $username", 'username' => $username, 'password' => $new_password]);
    }
} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
