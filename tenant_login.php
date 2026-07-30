<?php
/**
 * Tenant Login Portal
 * Allows tenant admins to log in and access their dashboard
 */

session_start();
require_once __DIR__ . '/php/config/database.php';
header('Content-Type: text/html; charset=UTF-8');

// If already logged in, redirect to dashboard
if (isset($_SESSION['user_id']) && isset($_SESSION['tenant_id'])) {
    $stmt = $pdo->prepare("SELECT slug FROM tenants WHERE id = ?");
    $stmt->execute([$_SESSION['tenant_id']]);
    $tenant = $stmt->fetch();
    if ($tenant) {
        header('Location: /artists_farm/' . htmlspecialchars($tenant['slug']) . '/dashboard.php');
        exit;
    }
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim($_POST['username'] ?? '');
    $password = trim($_POST['password'] ?? '');

    if ($username && $password) {
        $stmt = $pdo->prepare("SELECT u.id, u.password FROM users u
                             JOIN tenant_users tu ON u.id = tu.user_id
                             WHERE u.username = ? AND tu.role IN ('owner', 'admin')");
        $stmt->execute([$username]);
        $user = $stmt->fetch();

        if ($user && password_verify($password, $user['password'])) {
            // Get tenant info
            $stmt = $pdo->prepare("SELECT tu.tenant_id, t.slug FROM tenant_users tu
                                 JOIN tenants t ON tu.tenant_id = t.id
                                 WHERE tu.user_id = ? LIMIT 1");
            $stmt->execute([$user['id']]);
            $tenantInfo = $stmt->fetch();

            if ($tenantInfo) {
                $_SESSION['user_id'] = $user['id'];
                $_SESSION['tenant_id'] = $tenantInfo['tenant_id'];
                header('Location: /artists_farm/' . htmlspecialchars($tenantInfo['slug']) . '/dashboard.php');
                exit;
            }
        }
        $error = 'Invalid username or password';
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tenant Login - Artists Farm SaaS</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .login-container { background: white; padding: 2.5rem; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); width: 100%; max-width: 420px; }
        .login-header { text-align: center; margin-bottom: 2rem; }
        .login-header h1 { font-size: 1.5rem; color: #333; margin-bottom: 0.5rem; }
        .login-header p { color: #666; font-size: 0.9rem; }
        .form-group { margin-bottom: 1.5rem; }
        .form-label { display: block; margin-bottom: 0.5rem; font-weight: 500; color: #333; }
        .form-input { width: 100%; padding: 0.75rem; border: 2px solid #e5e5e5; border-radius: 6px; font-size: 1rem; transition: border-color 0.2s; }
        .form-input:focus { outline: none; border-color: #667eea; }
        .btn { width: 100%; padding: 0.75rem; border: none; border-radius: 6px; font-size: 1rem; font-weight: 600; cursor: pointer; }
        .btn-primary { background: #667eea; color: white; }
        .btn-primary:hover { background: #5568d3; }
        .error-message { background: #fee2e2; color: #991b1b; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.9rem; }
        .footer-links { text-align: center; margin-top: 1.5rem; font-size: 0.9rem; }
        .footer-links a { color: #667eea; text-decoration: none; }
        .footer-links a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="login-header">
            <h1>🏗️ Tenant Dashboard</h1>
            <p>Manage your properties and analytics</p>
        </div>

        <?php if ($error): ?>
            <div class="error-message"><?php echo htmlspecialchars($error); ?></div>
        <?php endif; ?>

        <form method="POST">
            <div class="form-group">
                <label class="form-label">Username</label>
                <input type="text" name="username" class="form-input" placeholder="Enter your username" required autofocus>
            </div>

            <div class="form-group">
                <label class="form-label">Password</label>
                <input type="password" name="password" class="form-input" placeholder="Enter your password" required>
            </div>

            <button type="submit" class="btn btn-primary">Sign In</button>
        </form>

        <div class="footer-links">
            <a href="/artists_farm/login.php">← Platform Admin Login</a>
        </div>
    </div>
</body>
</html>
