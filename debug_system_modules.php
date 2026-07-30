<?php
require_once __DIR__ . '/php/config/database.php';

echo "<h2>System Modules Debug</h2>";

try {
    // Check what's in system_modules
    echo "<h3>System Modules Table:</h3>";
    $stmt = $pdo->query("SELECT slug, name, default_enabled, category FROM system_modules ORDER BY slug");
    $modules = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($modules)) {
        echo "<p style='color: red;'>❌ system_modules table is EMPTY!</p>";
        echo "<p>This is the problem! The system_modules table needs to be populated.</p>";
    } else {
        echo "<table border='1' cellpadding='8'>";
        echo "<tr><th>Slug</th><th>Name</th><th>Default Enabled</th><th>Category</th></tr>";
        foreach ($modules as $mod) {
            $status = $mod['default_enabled'] ? '✅ Yes' : '❌ No';
            echo "<tr><td>{$mod['slug']}</td><td>{$mod['name']}</td><td>{$status}</td><td>{$mod['category']}</td></tr>";
        }
        echo "</table>";
    }

    // Check property_modules for resort-hut
    echo "<h3>Property Modules for resort-hut:</h3>";
    $stmt = $pdo->prepare("
        SELECT pm.id, pm.property_id, pm.module_slug, pm.is_enabled
        FROM property_modules pm
        JOIN properties p ON pm.property_id = p.id
        WHERE p.slug = 'resort-hut'
    ");
    $stmt->execute();
    $propModules = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($propModules)) {
        echo "<p style='color: orange;'>⚠️ No property_modules assigned to resort-hut</p>";
    } else {
        echo "<table border='1' cellpadding='8'>";
        echo "<tr><th>ID</th><th>Property ID</th><th>Module</th><th>Enabled</th></tr>";
        foreach ($propModules as $pm) {
            $status = $pm['is_enabled'] ? '✅ Yes' : '❌ No';
            echo "<tr><td>{$pm['id']}</td><td>{$pm['property_id']}</td><td>{$pm['module_slug']}</td><td>{$status}</td></tr>";
        }
        echo "</table>";
    }

} catch (Exception $e) {
    echo "<p style='color: red;'>Error: " . htmlspecialchars($e->getMessage()) . "</p>";
}
?>
