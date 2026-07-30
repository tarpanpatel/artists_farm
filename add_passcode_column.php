<?php
require_once __DIR__ . '/php/config/database.php';

try {
    // Check if passcode column exists in users table
    $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'passcode'");
    $passcodeExists = $stmt->fetch() !== false;

    if (!$passcodeExists) {
        // Add passcode column
        $pdo->exec("ALTER TABLE users ADD COLUMN passcode VARCHAR(50) NULL");
        echo "<p>✅ Added passcode column to users table</p>";
    } else {
        echo "<p>✅ Passcode column already exists in users table</p>";
    }

    // Set default passcodes for all users
    $pdo->exec("UPDATE users SET passcode = '123456' WHERE passcode IS NULL");
    echo "<p>✅ Set passcodes to 123456 for all users</p>";

    // Check staff_users table
    $stmt = $pdo->query("SHOW COLUMNS FROM staff_users LIKE 'passcode'");
    $staffPasscodeExists = $stmt->fetch() !== false;

    if (!$staffPasscodeExists) {
        $pdo->exec("ALTER TABLE staff_users ADD COLUMN passcode VARCHAR(50) DEFAULT '123456'");
        echo "<p>✅ Added passcode column to staff_users table</p>";
    } else {
        echo "<p>✅ Passcode column already exists in staff_users table</p>";
    }

    // Show vrikshawan user
    echo "<h3>Vrikshawan Admin User:</h3>";
    $stmt = $pdo->prepare("SELECT id, username, passcode, role FROM users WHERE username = 'vrikshawan'");
    $stmt->execute();
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user) {
        echo "<pre>";
        print_r($user);
        echo "</pre>";
        echo "<p><strong>Ready to login with:</strong></p>";
        echo "<ul>";
        echo "<li>Username: " . htmlspecialchars($user['username']) . "</li>";
        echo "<li>Passcode: " . htmlspecialchars($user['passcode']) . "</li>";
        echo "</ul>";
    } else {
        echo "<p>❌ User 'vrikshawan' not found. Create a new tenant first.</p>";
    }

} catch (Exception $e) {
    echo "<p style='color: red;'>Error: " . htmlspecialchars($e->getMessage()) . "</p>";
}
?>
