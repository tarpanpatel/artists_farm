<?php
/**
 * Migration: Multi Key Properties Support
 * Adds database schema for multi-room property management
 *
 * Usage: php php/schema/migrate_multikey_properties.php
 */

require_once __DIR__ . '/../config/database.php';

echo "=== Multi Key Properties Migration ===\n\n";

try {
    // 1. Add columns to properties table
    echo "1. Adding Multi Key columns to properties table...\n";

    $columns_to_add = [
        ['property_type', "ENUM('SINGLE', 'MULTI_KEY', 'MULTI_KEY_ROOM') DEFAULT 'SINGLE'"],
        ['parent_property_id', 'INT DEFAULT NULL'],
        ['room_order', 'INT DEFAULT 0'],
        ['is_deleted', 'TINYINT(1) DEFAULT 0']
    ];

    foreach ($columns_to_add as [$col_name, $col_def]) {
        $stmt = $pdo->query("SHOW COLUMNS FROM properties LIKE '$col_name'");
        if (!$stmt->fetch()) {
            $pdo->exec("ALTER TABLE properties ADD COLUMN `$col_name` $col_def");
            echo "   ✓ Added column: $col_name\n";
        } else {
            echo "   ✓ Column already exists: $col_name\n";
        }
    }

    // 2. Add foreign key for parent_property_id if not exists
    echo "\n2. Adding foreign key for parent_property_id...\n";
    try {
        $pdo->exec("ALTER TABLE properties ADD FOREIGN KEY (parent_property_id) REFERENCES properties(id) ON DELETE CASCADE");
        echo "   ✓ Added foreign key constraint\n";
    } catch (Exception $e) {
        if (str_contains($e->getMessage(), 'Duplicate')) {
            echo "   ✓ Foreign key already exists\n";
        } else {
            throw $e;
        }
    }

    // 3. Add indexes
    echo "\n3. Adding indexes for performance...\n";
    $indexes = [
        'idx_property_type' => 'property_type',
        'idx_parent_property' => 'parent_property_id',
        'idx_is_deleted' => 'is_deleted'
    ];

    foreach ($indexes as $idx_name => $col_name) {
        $stmt = $pdo->query("SHOW INDEX FROM properties WHERE Key_name='$idx_name'");
        if ($stmt->rowCount() === 0) {
            $pdo->exec("ALTER TABLE properties ADD INDEX `$idx_name` (`$col_name`)");
            echo "   ✓ Added index: $idx_name\n";
        } else {
            echo "   ✓ Index already exists: $idx_name\n";
        }
    }

    // 4. Create property_shared_data table
    echo "\n4. Creating property_shared_data table...\n";
    $stmt = $pdo->query("SHOW TABLES LIKE 'property_shared_data'");
    if ($stmt->rowCount() === 0) {
        $pdo->exec("
            CREATE TABLE `property_shared_data` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `property_id` INT NOT NULL,
                `data_type` ENUM('STAFF', 'EXPENSES', 'KITCHEN') NOT NULL,
                `staff_json` JSON DEFAULT NULL COMMENT 'Array of staff members',
                `kitchen_details` JSON DEFAULT NULL COMMENT 'Kitchen config',
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY `uniq_property_shared` (`property_id`, `data_type`),
                FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
        echo "   ✓ Created property_shared_data table\n";
    } else {
        echo "   ✓ property_shared_data table already exists\n";
    }

    // 5. Set all existing properties to SINGLE type if not already set
    echo "\n5. Ensuring existing properties are marked as SINGLE type...\n";
    $pdo->exec("UPDATE properties SET property_type='SINGLE' WHERE property_type IS NULL OR property_type=''");
    $affected = $pdo->query("SELECT COUNT(*) as cnt FROM properties WHERE property_type='SINGLE'")->fetch();
    echo "   ✓ " . $affected['cnt'] . " properties marked as SINGLE type\n";

    echo "\n=== Migration Complete ===\n";
    echo "\nNew structure ready:\n";
    echo "✓ Existing properties: type='SINGLE', parent_property_id=NULL\n";
    echo "✓ New MultiKey properties: type='MULTI_KEY', parent_property_id=NULL\n";
    echo "✓ Rooms: type='MULTI_KEY_ROOM', parent_property_id=<parent_id>\n";
    echo "✓ Shared data stored in property_shared_data table\n";

} catch (Exception $e) {
    echo "\n✗ Migration failed: " . $e->getMessage() . "\n";
    echo "Error code: " . $e->getCode() . "\n";
    exit(1);
}
