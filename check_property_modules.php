<?php
require_once __DIR__ . '/php/config/database.php';

echo "<h2>Checking Property Modules</h2>";

try {
    // Get resort-hut property
    $stmt = $pdo->prepare("SELECT id, name, slug FROM properties WHERE slug = 'resort-hut' LIMIT 1");
    $stmt->execute();
    $property = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$property) {
        echo "<p style='color: red;'>❌ Property resort-hut not found</p>";
        exit;
    }

    echo "<p><strong>Property:</strong> {$property['name']} (ID: {$property['id']}, Slug: {$property['slug']})</p>";

    // Check property_modules
    echo "<h3>Property Modules:</h3>";
    $stmt = $pdo->prepare("
        SELECT pm.id, pm.property_id, pm.module_slug, pm.is_enabled
        FROM property_modules pm
        WHERE pm.property_id = ?
        ORDER BY pm.module_slug
    ");
    $stmt->execute([$property['id']]);
    $modules = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($modules)) {
        echo "<p style='color: red;'>❌ NO MODULES FOUND for this property!</p>";
        echo "<p>This is why you're getting 403 Forbidden. The property_modules table is empty.</p>";
    } else {
        echo "<table border='1' cellpadding='8'>";
        echo "<tr><th>Module Slug</th><th>Enabled</th></tr>";
        foreach ($modules as $mod) {
            $status = $mod['is_enabled'] ? '✅ YES' : '❌ NO';
            echo "<tr><td>{$mod['module_slug']}</td><td>{$status}</td></tr>";
        }
        echo "</table>";
    }

    // Check system_modules
    echo "<h3>System Modules:</h3>";
    $stmt = $pdo->query("SELECT slug, default_enabled FROM system_modules ORDER BY slug");
    $sysModules = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "<p>Count: " . count($sysModules) . "</p>";
    if (empty($sysModules)) {
        echo "<p style='color: red;'>❌ system_modules table is EMPTY!</p>";
    }

} catch (Exception $e) {
    echo "<p style='color: red;'>Error: " . htmlspecialchars($e->getMessage()) . "</p>";
}
?>
