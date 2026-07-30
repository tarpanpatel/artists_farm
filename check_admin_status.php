<?php
session_start();
require_once __DIR__ . '/php/config/database.php';

echo "Session User ID: " . ($_SESSION['user_id'] ?? 'NOT SET') . "\n";
echo "Session Data: " . json_encode($_SESSION) . "\n\n";

if (isset($_SESSION['user_id'])) {
    $stmt = $pdo->prepare("SELECT id, username, role, is_platform_admin FROM users WHERE id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();

    if ($user) {
        echo "User Found:\n";
        echo json_encode($user, JSON_PRETTY_PRINT);
    } else {
        echo "User NOT found in database\n";
    }
} else {
    echo "Not logged in\n";
}

echo "\n\nAll Platform Admins:\n";
$admins = $pdo->query("SELECT id, username, role, is_platform_admin FROM users WHERE is_platform_admin = 1")->fetchAll();
echo json_encode($admins, JSON_PRETTY_PRINT);
?>
