<?php
require_once __DIR__ . '/php/config/database.php';

echo "<h2>Module Debug Report</h2>";

try {
    // 1. Find the resort-hut property
    $stmt = $pdo->prepare("SELECT id, name, slug, tenant_id FROM properties WHERE slug = 'resort-hut'");
    $stmt->execute();
    $property = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$property) {
        echo "<p style='color: red;'>❌ Property 'resort-hut' not found</p>";
        exit;
    }

    echo "<h3>Property Found:</h3>";
    echo "<p>ID: {$property['id']}</p>";
    echo "<p>Name: {$property['name']}</p>";
    echo "<p>Slug: {$property['slug']}</p>";
    echo "<p>Tenant ID: {$property['tenant_id']}</p>";

    $propertyId = $property['id'];

    // 2. Check property_modules table
    echo "<h3>Property Modules Assignments:</h3>";
    $stmt = $pdo->prepare("SELECT id, property_id, module_slug, is_enabled FROM property_modules WHERE property_id = ?");
    $stmt->execute([$propertyId]);
    $modules = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($modules)) {
        echo "<p style='color: orange;'>⚠️ No modules assigned to this property!</p>";
    } else {
        echo "<table border='1' cellpadding='8'>";
        echo "<tr><th>ID</th><th>Module</th><th>Enabled</th></tr>";
        foreach ($modules as $mod) {
            $status = $mod['is_enabled'] ? '✅ Yes' : '❌ No';
            echo "<tr><td>{$mod['id']}</td><td>{$mod['module_slug']}</td><td>{$status}</td></tr>";
        }
        echo "</table>";
    }

    // 3. Check vrikshawan_admin user
    echo "<h3>Tenant Admin User:</h3>";
    $stmt = $pdo->prepare("SELECT id, username, role, passcode FROM users WHERE username = 'vrikshawan_admin'");
    $stmt->execute();
    $admin = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($admin) {
        echo "<p>ID: {$admin['id']}</p>";
        echo "<p>Username: {$admin['username']}</p>";
        echo "<p>Role: {$admin['role']}</p>";
        echo "<p>Passcode: " . (empty($admin['passcode']) ? '❌ Not set' : '✅ Set') . "</p>";
    } else {
        echo "<p style='color: red;'>❌ User vrikshawan_admin not found</p>";
    }

    // 4. Check if kitchen module exists in modules table
    echo "<h3>Available Modules in System:</h3>";
    $stmt = $pdo->query("SELECT id, slug, name FROM modules");
    $allModules = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($allModules)) {
        echo "<p style='color: red;'>❌ No modules defined in the modules table!</p>";
    } else {
        echo "<ul>";
        foreach ($allModules as $mod) {
            echo "<li>{$mod['slug']} - {$mod['name']}</li>";
        }
        echo "</ul>";
    }

    // 5. Test the logic that router.php would use
    echo "<h3>Testing Module Check Logic:</h3>";
    echo "<p>Checking if kitchen module is enabled for property {$propertyId}...</p>";

    $stmt = $pdo->prepare("SELECT is_enabled FROM property_modules WHERE property_id = ? AND module_slug = 'kitchen' LIMIT 1");
    $stmt->execute([$propertyId]);
    $result = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($result) {
        if ($result['is_enabled']) {
            echo "<p style='color: green;'>✅ Kitchen module IS enabled</p>";
        } else {
            echo "<p style='color: orange;'>⚠️ Kitchen module exists but is DISABLED</p>";
        }
    } else {
        echo "<p style='color: red;'>❌ Kitchen module not found in property_modules!</p>";
        echo "<p>This is why API calls return 403 Forbidden.</p>";
    }

} catch (Exception $e) {
    echo "<p style='color: red;'>Error: " . htmlspecialchars($e->getMessage()) . "</p>";
}
?>
