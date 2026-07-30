<?php
require_once __DIR__ . '/php/config/database.php';

$stmt = $pdo->prepare("
    SELECT u.id, u.username, u.role, t.name as tenant_name
    FROM users u
    LEFT JOIN tenant_users tu ON u.id = tu.user_id
    LEFT JOIN tenants t ON tu.tenant_id = t.id
    WHERE t.slug = 'vrikshawan'
    LIMIT 10
");
$stmt->execute();
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "<h2>Vrikshawan Tenant Users</h2>";
if (empty($users)) {
    echo "<p>No users found for Vrikshawan tenant.</p>";
} else {
    echo "<table border='1' cellpadding='10'>";
    echo "<tr><th>ID</th><th>Username</th><th>Role</th></tr>";
    foreach ($users as $user) {
        echo "<tr>";
        echo "<td>" . htmlspecialchars($user['id']) . "</td>";
        echo "<td>" . htmlspecialchars($user['username']) . "</td>";
        echo "<td>" . htmlspecialchars($user['role']) . "</td>";
        echo "</tr>";
    }
    echo "</table>";
}
?>
