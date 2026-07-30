<?php
require_once __DIR__ . '/php/config/database.php';

echo "Creating Vrikshawan Tenant Admin User:\n\n";

try {
    // Get Vrikshawan tenant
    $tenant = $pdo->prepare("SELECT id, name FROM tenants WHERE slug = 'vrikshawan'");
    $tenant->execute();
    $tenantData = $tenant->fetch();

    if (!$tenantData) {
        echo "❌ Tenant not found";
        exit;
    }

    $tenantId = $tenantData['id'];
    $tenantName = $tenantData['name'];

    // Get the default property
    $prop = $pdo->prepare("SELECT id FROM properties WHERE tenant_id = ? LIMIT 1");
    $prop->execute([$tenantId]);
    $propData = $prop->fetch();

    if (!$propData) {
        echo "❌ No property found for tenant";
        exit;
    }

    $propertyId = $propData['id'];

    // Create super admin user
    $username = strtolower(str_replace(' ', '_', $tenantName)) . '_admin';
    $password = 'admin123';
    $hashedPassword = password_hash($password, PASSWORD_BCRYPT);

    $stmt = $pdo->prepare("INSERT INTO users (username, password, role, property_id, is_platform_admin, default_tenant_id) VALUES (?, ?, ?, ?, 0, ?)");
    $stmt->execute([$username, $hashedPassword, 'super_admin', $propertyId, $tenantId]);
    $userId = $pdo->lastInsertId();

    echo "✅ User created:\n";
    echo "   ID: $userId\n";
    echo "   Username: $username\n";
    echo "   Password: $password\n\n";

    // Add to tenant_users
    $stmt = $pdo->prepare("INSERT INTO tenant_users (user_id, tenant_id, role) VALUES (?, ?, 'owner')");
    $stmt->execute([$userId, $tenantId]);

    echo "✅ Added to tenant_users:\n";
    echo "   Tenant: $tenantName (ID: $tenantId)\n";
    echo "   Role: owner\n\n";

    echo "✅ Assigned to property: $propertyId\n\n";

    echo "🎉 Setup complete!\n\n";
    echo "You can now log in with:\n";
    echo "   Username: $username\n";
    echo "   Password: $password\n";
    echo "\nAccess the property at: http://localhost/artists_farm/vrikshawan/resort-hut/\n";

} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage();
}
?>
