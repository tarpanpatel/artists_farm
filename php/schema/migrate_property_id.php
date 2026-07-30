<?php
/**
 * Migration: Add `property_id` column to all data tables
 * Run once after deploying multi-tenant support.
 * 
 * Usage: php php/schema/migrate_property_id.php
 */

require_once __DIR__ . '/../config/database.php';

$tables = [
    'billing_receipts',
    'financial_ledger',
    'expense_item_prices',
    'expense_items',
    'miscellaneous_catalog',
    'cash_drawer_entries',
    'inventory_items',
    'req_catalog',
    'stock_requisitions',
    'kitchen_wastage_logs',
    'kitchen_purchases_log',
    'inventory_price_history',
    'staff_advances',
    'material_categories',
    'menu_items',
    'menu_categories',
    'nav_menu_items',
    'dish_recipes',
    'served_logs',
    'staff_users',
    'payee_entities',
    'users',
    'guests',
    'orders',
    'order_items',
    'kitchen_orders',
    'farm_utility_expenses',
    'petty_cash',
    'cash_drawer_entries',
    'staff_attendance',
    'audit_logs',
    'system_telegram_templates',
];

$defaultPropertyId = 1;

echo "Migrating tables to add property_id...\n\n";

foreach ($tables as $table) {
    try {
        // Check if table exists
        $check = $pdo->query("SHOW TABLES LIKE '$table'");
        if (!$check->fetch()) {
            echo "  SKIP: $table (table does not exist)\n";
            continue;
        }

        // Check if column already exists
        $colCheck = $pdo->query("SHOW COLUMNS FROM `$table` LIKE 'property_id'");
        if ($colCheck->fetch()) {
            echo "  OK: $table (property_id already exists)\n";
            continue;
        }

        // Special handling for tables without 'id' column
        $hasIdColumn = true;
        $firstColumn = '';
        
        if ($table === 'expense_item_prices') {
            $hasIdColumn = false;
            $firstColumn = 'item_name';
        } elseif ($table === 'system_telegram_templates') {
            $hasIdColumn = false;
            $firstColumn = 'template_key';
        } else {
            // Check if table has 'id' column
            $idCheck = $pdo->query("SHOW COLUMNS FROM `$table` LIKE 'id'");
            if (!$idCheck->fetch()) {
                $hasIdColumn = false;
                // Get first column name
                $colStmt = $pdo->query("SHOW COLUMNS FROM `$table` LIMIT 1");
                $firstCol = $colStmt->fetch();
                $firstColumn = $firstCol['Field'] ?? '';
            }
        }
        
        // Add the column after appropriate column
        if ($hasIdColumn) {
            $pdo->exec("ALTER TABLE `$table` ADD COLUMN `property_id` INT NOT NULL DEFAULT $defaultPropertyId AFTER `id`");
        } elseif ($firstColumn) {
            $pdo->exec("ALTER TABLE `$table` ADD COLUMN `property_id` INT NOT NULL DEFAULT $defaultPropertyId AFTER `$firstColumn`");
        } else {
            $pdo->exec("ALTER TABLE `$table` ADD COLUMN `property_id` INT NOT NULL DEFAULT $defaultPropertyId");
        }
        
        // Add index
        $pdo->exec("ALTER TABLE `$table` ADD INDEX `idx_{$table}_property` (`property_id`)");
        
        echo "  ADDED: $table.property_id\n";
    } catch (Exception $e) {
        echo "  ERROR: $table - " . $e->getMessage() . "\n";
    }
}

echo "\nMigration complete!\n";
