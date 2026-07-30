<?php
/**
 * Authentication Endpoint - Passcode-based login for staff and admin
 */

session_start();
header('Content-Type: application/json; charset=UTF-8');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/property_resolver.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'POST required']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$type = $input['type'] ?? 'staff'; // 'staff' or 'admin'
$username = $input['username'] ?? '';
$passcode = $input['passcode'] ?? '';

if (!$username || !$passcode) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Username and 6-digit passcode required']);
    exit;
}

try {
    if ($type === 'staff') {
        // Staff login - lookup by username in staff_users
        $stmt = $pdo->prepare("
            SELECT id, username, full_name, role, passcode, property_id
            FROM staff_users
            WHERE username = ? AND status = 'Active'
            LIMIT 1
        ");
        $stmt->execute([$username]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            echo json_encode(['success' => false, 'message' => 'Staff user not found']);
            exit;
        }

        // Verify passcode
        if ($user['passcode'] !== $passcode) {
            echo json_encode(['success' => false, 'message' => 'Invalid passcode']);
            exit;
        }

        // Set session
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['username'] = $user['username'];
        $_SESSION['role'] = $user['role'];
        $_SESSION['property_id'] = $user['property_id'];

        echo json_encode([
            'success' => true,
            'user' => [
                'id' => $user['id'],
                'username' => $user['username'],
                'name' => $user['full_name'] ?: $user['username'],
                'role' => $user['role'],
            ]
        ]);

    } elseif ($type === 'admin') {
        // Admin/Tenant login - lookup by username in tenant_users or users table
        $stmt = $pdo->prepare("
            SELECT u.id, u.username, u.role, tu.tenant_id, u.passcode
            FROM users u
            LEFT JOIN tenant_users tu ON u.id = tu.user_id
            WHERE u.username = ? AND (u.role = 'super_admin' OR tu.role = 'owner')
            LIMIT 1
        ");
        $stmt->execute([$username]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            echo json_encode(['success' => false, 'message' => 'Admin user not found']);
            exit;
        }

        // Verify passcode
        if ($user['passcode'] !== $passcode) {
            echo json_encode(['success' => false, 'message' => 'Invalid passcode']);
            exit;
        }

        // Set session
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['username'] = $user['username'];
        $_SESSION['role'] = $user['role'];
        $_SESSION['is_platform_admin'] = false;

        echo json_encode([
            'success' => true,
            'user' => [
                'id' => $user['id'],
                'username' => $user['username'],
                'name' => $user['username'],
                'role' => $user['role'],
            ]
        ]);

    } else {
        echo json_encode(['success' => false, 'message' => 'Invalid login type']);
    }

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error']);
}
?>
