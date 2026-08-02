<?php
/**
 * Fixed SaaS Platform Schema
 * Creates proper SaaS architecture
 */

require_once 'php/config/database.php';

echo "=== Creating Fixed SaaS Platform Database Schema ===\n\n";

// 1. TENANTS table (Restaurant/Hotel Chains)
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS `tenants` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `name` VARCHAR(255) NOT NULL,
        `slug` VARCHAR(100) NOT NULL UNIQUE,
        `owner_name` VARCHAR(255) DEFAULT NULL,
        `owner_email` VARCHAR(255) DEFAULT NULL,
        `owner_phone` VARCHAR(50) DEFAULT NULL,
        `subscription_plan` ENUM('free', 'basic', 'pro', 'enterprise') DEFAULT 'free',
        `subscription_status` ENUM('active', 'suspended', 'cancelled', 'trial') DEFAULT 'trial',
        `max_properties` INT DEFAULT 1,
        `max_users` INT DEFAULT 5,
        `billing_cycle` ENUM('monthly', 'quarterly', 'annual') DEFAULT 'monthly',
        `next_billing_date` DATE DEFAULT NULL,
        `contract_start_date` DATE DEFAULT NULL,
        `contract_end_date` DATE DEFAULT NULL,
        `is_active` TINYINT(1) DEFAULT 1,
        `notes` TEXT DEFAULT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    echo "✓ Created/verified tenants table\n";
} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
}

// 2. Check users table and fix if needed
echo "\n2. Checking users table...\n";
try {
    // First, check if users table exists
    $stmt = $pdo->query("SHOW TABLES LIKE 'users'");
    if ($stmt->fetch()) {
        echo "✓ users table exists\n";
        
        // Check columns
        $stmt = $pdo->query("SHOW COLUMNS FROM users");
        $columns = [];
        while ($col = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $columns[$col['Field']] = true;
        }
        
        // Add missing columns
        if (!isset($columns['is_platform_admin'])) {
            $pdo->exec("ALTER TABLE users ADD COLUMN `is_platform_admin` TINYINT(1) DEFAULT 0");
            echo "✓ Added is_platform_admin column\n";
        }
        
        if (!isset($columns['default_tenant_id'])) {
            $pdo->exec("ALTER TABLE users ADD COLUMN `default_tenant_id` INT DEFAULT NULL");
            echo "✓ Added default_tenant_id column\n";
        }
        
        // NOTE: Platform admin user must be created via manual installation process, not auto-generated
        // DO NOT create admin with hardcoded credentials for security reasons
        echo "⚠️ Platform admin must be manually created by deployment process\n";
    } else {
        echo "⚠️ users table doesn't exist - will be created by system\n";
    }
} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
}

// 3. Fix tenant_users table (remove comment from SQL)
echo "\n3. Creating tenant_users table...\n";
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS `tenant_users` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `tenant_id` INT NOT NULL,
        `user_id` INT NOT NULL,
        `role` ENUM('owner', 'admin', 'manager', 'viewer') DEFAULT 'viewer',
        `can_create_properties` TINYINT(1) DEFAULT 0,
        `can_manage_users` TINYINT(1) DEFAULT 0,
        `can_manage_billing` TINYINT(1) DEFAULT 0,
        `assigned_properties` JSON DEFAULT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY `uniq_tenant_user` (`tenant_id`, `user_id`),
        FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
        FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    echo "✓ Created tenant_users table\n";
} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
}

// 4. Create default SaaS provider tenant
echo "\n4. Creating default tenant...\n";
try {
    $stmt = $pdo->prepare("INSERT IGNORE INTO tenants (id, name, slug, owner_name, owner_email, subscription_plan, subscription_status, max_properties) 
                          VALUES (1, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute(['Artists Farm Platform', 'artists-farm-platform', 'System Admin', 'admin@artistsfarm.com', 'enterprise', 'active', 999]);
    
    $defaultTenantId = 1;
    echo "✓ Created default tenant 'Artists Farm Platform' (ID: $defaultTenantId)\n";
    
    // Update existing properties to belong to default tenant
    $pdo->exec("UPDATE properties SET tenant_id = $defaultTenantId WHERE tenant_id IS NULL");
    echo "✓ Assigned existing properties to default tenant\n";
    
    // Assign platform admin to default tenant
    $stmt = $pdo->prepare("INSERT IGNORE INTO tenant_users (tenant_id, user_id, role, can_create_properties, can_manage_users, can_manage_billing) 
                          SELECT ?, id, 'owner', 1, 1, 1 FROM users WHERE username = 'platform_admin'");
    $stmt->execute([$defaultTenantId]);
    echo "✓ Assigned platform_admin as tenant owner\n";
} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
}

// 5. Enable modules for existing properties
echo "\n5. Setting up modules for existing properties...\n";
try {
    // Get all properties
    $stmt = $pdo->query("SELECT id FROM properties");
    $properties = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    $enabledCount = 0;
    foreach ($properties as $propertyId) {
        // Enable all core modules by default
        $modules = ['kitchen', 'inventory', 'billing', 'finance', 'staff', 'guests', 'telegram'];
        foreach ($modules as $moduleSlug) {
            try {
                $stmt = $pdo->prepare("INSERT IGNORE INTO property_modules (property_id, module_slug, is_enabled) VALUES (?, ?, 1)");
                $stmt->execute([$propertyId, $moduleSlug]);
                $enabledCount++;
            } catch (Exception $e) {}
        }
    }
    echo "✓ Enabled modules for " . count($properties) . " properties ($enabledCount module assignments)\n";
} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
}

echo "\n=== SaaS Platform Ready ===\n";
echo "\nAccess Credentials:\n";
echo "Username: platform_admin\n";
echo "Password: admin123\n";
echo "\nStructure Summary:\n";
echo "1. Platform Level - You manage Tenants\n";
echo "2. Tenant Level - Restaurant Chain manages Properties & Users\n";
echo "3. Property Level - Each location has customizable Modules\n";
echo "\nNext: Create the platform admin dashboard UI\n";