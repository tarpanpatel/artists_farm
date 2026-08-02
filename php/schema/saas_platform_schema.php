<?php
/**
 * Database schema for SaaS multi-tenant platform
 * Extends existing system with proper SaaS architecture
 */

require_once 'php/config/database.php';

echo "=== Creating SaaS Platform Database Schema ===\n\n";

// 1. TENANTS table (Restaurant/Hotel Chains)
echo "1. Creating tenants table...\n";
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
    echo "✓ Created tenants table\n";
} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
}

// 2. PROPERTIES table (existing, but needs tenant_id)
echo "\n2. Updating properties table...\n";
try {
    // Check if tenant_id column exists
    $stmt = $pdo->query("SHOW COLUMNS FROM properties LIKE 'tenant_id'");
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE properties ADD COLUMN `tenant_id` INT DEFAULT NULL AFTER `id`");
        $pdo->exec("ALTER TABLE properties ADD FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE");
        echo "✓ Added tenant_id to properties table\n";
    } else {
        echo "✓ tenant_id already exists\n";
    }
} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
}

// 3. PROPERTY_MODULES table (feature assignment per property)
echo "\n3. Creating property_modules table...\n";
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS `property_modules` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `property_id` INT NOT NULL,
        `module_slug` VARCHAR(50) NOT NULL,
        `is_enabled` TINYINT(1) DEFAULT 1,
        `config` JSON DEFAULT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY `uniq_property_module` (`property_id`, `module_slug`),
        FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    echo "✓ Created property_modules table\n";
} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
}

// 4. SYSTEM_MODULES table (available modules in platform)
echo "\n4. Creating system_modules table...\n";
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS `system_modules` (
        `slug` VARCHAR(50) PRIMARY KEY,
        `name` VARCHAR(100) NOT NULL,
        `description` TEXT DEFAULT NULL,
        `category` VARCHAR(50) DEFAULT 'core',
        `icon` VARCHAR(100) DEFAULT NULL,
        `requires_auth` TINYINT(1) DEFAULT 1,
        `default_enabled` TINYINT(1) DEFAULT 1,
        `version` VARCHAR(20) DEFAULT '1.0.0',
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    echo "✓ Created system_modules table\n";
    
    // Seed default modules
    $modules = [
        ['kitchen', 'Kitchen Management', 'Food ordering, KDS, recipes, staff meals', 'kitchen', 'utensils-crossed', 1, 1],
        ['inventory', 'Inventory Management', 'Stock tracking, purchases, requisitions', 'inventory', 'boxes', 1, 1],
        ['billing', 'Billing & Checkout', 'Guest billing, receipts, payments', 'billing', 'receipt', 1, 1],
        ['finance', 'Finance & Petty Cash', 'Expense tracking, ledger, petty cash', 'finance', 'wallet', 1, 1],
        ['staff', 'Staff Management', 'Staff directory, attendance, payroll', 'staff', 'users', 1, 1],
        ['guests', 'Guest Management', 'Guest registration, check-in/out', 'front-desk', 'user', 1, 1],
        ['telegram', 'Telegram Alerts', 'Real-time notifications via Telegram', 'communication', 'message-square', 1, 1],
        ['reports', 'Reports & Analytics', 'Financial reports, occupancy analytics', 'analytics', 'bar-chart', 1, 1],
    ];
    
    $stmt = $pdo->prepare("INSERT IGNORE INTO system_modules (slug, name, description, category, icon, requires_auth, default_enabled) VALUES (?, ?, ?, ?, ?, ?, ?)");
    foreach ($modules as $module) {
        $stmt->execute($module);
    }
    echo "✓ Seeded system modules\n";
} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
}

// 5. TENANT_USERS table (users with tenant-wide permissions)
echo "\n5. Creating tenant_users table...\n";
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

// 6. Update existing users table for platform-wide authentication
echo "\n6. Checking users table structure...\n";
try {
    // Add platform admin flag
    $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'is_platform_admin'");
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE users ADD COLUMN `is_platform_admin` TINYINT(1) DEFAULT 0");
        echo "✓ Added is_platform_admin column\n";
    }
    
    // Add default tenant_id
    $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'default_tenant_id'");
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE users ADD COLUMN `default_tenant_id` INT DEFAULT NULL");
        $pdo->exec("ALTER TABLE users ADD FOREIGN KEY (`default_tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL");
        echo "✓ Added default_tenant_id column\n";
    }
    
    // Add full_name column if missing
    $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'full_name'");
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE users ADD COLUMN `full_name` VARCHAR(255) DEFAULT NULL AFTER `username`");
        echo "✓ Added full_name column to users table\n";
    }

    // NEW: Add password_hash column if missing
    $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'password_hash'");
    if (!$stmt->fetch()) {
        // If an old 'password' column exists, we'll add password_hash next to it and migrate
        $stmt_old_pass = $pdo->query("SHOW COLUMNS FROM users LIKE 'password'");
        if ($stmt_old_pass->fetch()) {
            $pdo->exec("ALTER TABLE users ADD COLUMN `password_hash` VARCHAR(255) DEFAULT NULL AFTER `password`");
            echo "✓ Added password_hash column to users table\n";
            // Migrate existing passwords to password_hash
            $users_to_migrate = $pdo->query("SELECT id, password FROM users WHERE password IS NOT NULL AND password_hash IS NULL")->fetchAll();
            foreach ($users_to_migrate as $u) {
                $hashed_pass = password_hash($u['password'], PASSWORD_DEFAULT);
                $pdo->prepare("UPDATE users SET password_hash = ? WHERE id = ?")->execute([$hashed_pass, $u['id']]);
            }
            echo "✓ Migrated existing passwords to password_hash\n";
        } else {
            $pdo->exec("ALTER TABLE users ADD COLUMN `password_hash` VARCHAR(255) NOT NULL"); // If no old password, make it NOT NULL
            echo "✓ Added password_hash column to users table (no old 'password' column found)\n";
        }
    }

    // NEW: Add role column if missing
    $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'role'");
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE users ADD COLUMN `role` VARCHAR(50) DEFAULT 'User' AFTER `full_name`");
        echo "✓ Added role column to users table\n";
    }
} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
}

// 7. Platform admin user creation
echo "\n7. Platform admin user setup...\n";
echo "⚠️ Platform admin must be created via manual installation process, NOT auto-generated\n";
echo "✓ Skipped auto-creation to prevent hardcoded credentials\n";

// 8. Migrate existing data (example: assign existing properties to default tenant)
echo "\n8. Migrating existing data...\n";
try {
    // Create default SaaS provider tenant
    $stmt = $pdo->prepare("INSERT IGNORE INTO tenants (name, slug, owner_name, owner_email, subscription_plan, subscription_status, max_properties) 
                          VALUES (?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute(['Artists Farm Platform', 'artists-farm-platform', 'System Admin', 'admin@artistsfarm.com', 'enterprise', 'active', 999]);
    $defaultTenantId = $pdo->lastInsertId();
    
    // Update existing properties to belong to default tenant
    $pdo->exec("UPDATE properties SET tenant_id = $defaultTenantId WHERE tenant_id IS NULL");
    
    echo "✓ Created default tenant 'Artists Farm Platform'\n";
    echo "✓ Assigned existing properties to default tenant\n";
} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
}

echo "\n=== SaaS Platform Schema Complete ===\n";
echo "\nNew Structure:\n";
echo "1. Platform Admin (You) → Manages Tenants\n";
echo "2. Tenants (Restaurant Chains) → Can have multiple Properties\n";
echo "3. Properties (Locations) → Can enable/disable Modules\n";
echo "4. Modules (Kitchen, Billing, etc.) → Assigned per Property\n";
echo "\nNext steps:\n";
echo "1. Create platform admin dashboard\n";
echo "2. Build tenant management interface\n";
echo "3. Implement module assignment per property\n";
echo "4. Update authentication to support multi-level access\n";