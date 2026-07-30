<?php
require_once __DIR__ . '/php/config/database.php';

// Check users table schema
try {
    $stmt = $pdo->query("DESCRIBE users");
    $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo "<h2>Users Table Schema</h2>";
    echo "<table border='1' cellpadding='10'>";
    echo "<tr><th>Field</th><th>Type</th><th>Null</th><th>Key</th><th>Default</th><th>Extra</th></tr>";

    foreach ($columns as $col) {
        echo "<tr>";
        echo "<td>" . htmlspecialchars($col['Field']) . "</td>";
        echo "<td>" . htmlspecialchars($col['Type']) . "</td>";
        echo "<td>" . htmlspecialchars($col['Null']) . "</td>";
        echo "<td>" . htmlspecialchars($col['Key']) . "</td>";
        echo "<td>" . htmlspecialchars($col['Default']) . "</td>";
        echo "<td>" . htmlspecialchars($col['Extra']) . "</td>";
        echo "</tr>";
    }
    echo "</table>";

    // Check if vrikshawan user exists
    echo "<h2>Vrikshawan Admin User</h2>";
    $stmt = $pdo->prepare("SELECT id, username, passcode, role FROM users WHERE username = ?");
    $stmt->execute(['vrikshawan']);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user) {
        echo "<pre>";
        print_r($user);
        echo "</pre>";
    } else {
        echo "<p>User 'vrikshawan' not found</p>";
    }

} catch (Exception $e) {
    echo "Error: " . htmlspecialchars($e->getMessage());
}
?>
