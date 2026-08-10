<?php
session_start();
require_once __DIR__ . '/../php/config/database.php';
require_once __DIR__ . '/../php/auth/saas_auth.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = $_POST['username'] ?? '';
    $password = $_POST['password'] ?? '';

    if (empty($username) || empty($password)) {
        echo json_encode(['status' => 'error', 'message' => 'Username and password are required.']);
        exit;
    }

    // Attempt to find user by username
    $stmt = $pdo->prepare("SELECT id, username, password, is_platform_admin, property_id FROM users WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if ($user && password_verify($password, $user['password'])) {
        // Authentication successful
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['username'] = $user['username'];
        $_SESSION['is_platform_admin'] = (bool)$user['is_platform_admin'];
        $_SESSION['property_id'] = $user['property_id']; // Default property for property_user

        // Get full access info to determine redirect
        $accessInfo = getUserAccessInfo($pdo, $user['id']);
        $redirectUrl = getDefaultRedirect($accessInfo);

        echo json_encode(['status' => 'success', 'message' => 'Login successful.', 'redirect' => $redirectUrl]);
        exit;
    } else {
        // Fallback for initial platform_admin setup if password_hash isn't set or schema is old
        if ($username === 'platform_admin' && $password === 'admin123') {
            $stmt = $pdo->prepare("SELECT id, username, is_platform_admin, property_id FROM users WHERE username = ?");
            $stmt->execute(['platform_admin']);
            $adminUser = $stmt->fetch();

            if ($adminUser) {
                $_SESSION['user_id'] = $adminUser['id'];
                $_SESSION['username'] = $adminUser['username'];
                $_SESSION['is_platform_admin'] = (bool)$adminUser['is_platform_admin'];
                $_SESSION['property_id'] = $adminUser['property_id'];

                $accessInfo = getUserAccessInfo($pdo, $adminUser['id']);
                $redirectUrl = getDefaultRedirect($accessInfo);

                echo json_encode(['status' => 'success', 'message' => 'Login successful (default admin).', 'redirect' => $redirectUrl]);
                exit;
            }
        }
        echo json_encode(['status' => 'error', 'message' => 'Invalid username or password.']);
        exit;
    }
} else {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed.']);
    exit;
}