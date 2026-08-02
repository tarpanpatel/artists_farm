<?php
/**
 * Direct backfill runner - adds tenant users to existing MultiKey properties
 */

// Set up minimal environment
define('DB_HOST', 'localhost');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'artists_farm_resort');

try {
    $pdo = new PDO(
        "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME,
        DB_USER,
        DB_PASS
    );
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Get all MultiKey properties that don't have their tenant user
    $stmt = $pdo->prepare("
        SELECT p.id, p.slug, p.tenant_id, t.slug as tenant_username, t.name as tenant_name
        FROM properties p
        JOIN tenants t ON p.tenant_id = t.id
        WHERE p.property_type = 'MULTI_KEY'
        AND p.is_active = 1
        AND NOT EXISTS (
            SELECT 1 FROM staff_users su
            WHERE su.property_id = p.id
            AND su.username = t.slug
        )
    ");
    $stmt->execute();
    $properties = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($properties)) {
        echo "✓ No MultiKey properties need tenant user backfill\n";
        exit(0);
    }

    $count = 0;
    foreach ($properties as $prop) {
        $insert = $pdo->prepare("
            INSERT INTO staff_users (property_id, username, full_name, role, status)
            VALUES (?, ?, ?, 'Admin', 'Active')
        ");

        try {
            $insert->execute([
                $prop['id'],
                $prop['tenant_username'],
                $prop['tenant_name']
            ]);
            $count++;
            echo "✓ Added tenant user '{$prop['tenant_username']}' to property '{$prop['slug']}' (ID: {$prop['id']})\n";
        } catch (Exception $e) {
            echo "✗ Failed to add user to {$prop['slug']}: {$e->getMessage()}\n";
        }
    }

    echo "\n✓✓✓ Backfill complete! Added $count tenant user(s).\n";

} catch (Exception $e) {
    echo "✗ Database error: " . $e->getMessage() . "\n";
    exit(1);
}
?>
