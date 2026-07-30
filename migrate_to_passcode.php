<?php
require_once __DIR__ . '/php/config/database.php';

try {
    // Add passcode column if it doesn't exist
    $pdo->exec("ALTER TABLE users ADD COLUMN passcode VARCHAR(50) DEFAULT '123456'");
    echo "<p style='color: green; font-weight: bold;'>✅ Added passcode column to users table</p>";

    // Set default passcodes for platform admin and tenant admins
    $pdo->exec("UPDATE users SET passcode = '123456' WHERE password IS NULL OR password = ''");
    echo "<p style='color: green; font-weight: bold;'>✅ Set default passcodes</p>";

    // Also add to staff_users if it doesn't exist
    $pdo->exec("ALTER TABLE staff_users ADD COLUMN passcode VARCHAR(50) DEFAULT '123456'");
    echo "<p style='color: green; font-weight: bold;'>✅ Added passcode column to staff_users table</p>";

    echo "<h3>Migration Complete!</h3>";
    echo "<p>Now try logging in with:</p>";
    echo "<ul>";
    echo "<li><strong>Username:</strong> vrikshawan</li>";
    echo "<li><strong>Passcode:</strong> 123456</li>";
    echo "</ul>";

} catch (Exception $e) {
    // Column might already exist
    if (strpos($e->getMessage(), 'Duplicate column') !== false ||
        strpos($e->getMessage(), 'already exists') !== false) {
        echo "<p style='color: orange;'>⚠️ Passcode column already exists</p>";
    } else {
        echo "<p style='color: red; font-weight: bold;'>❌ Error: " . htmlspecialchars($e->getMessage()) . "</p>";
    }
}
?>
