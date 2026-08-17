<?php
/**
 * Staging Reset Helper Script for Artists Farm Jaipur (Property ID 1)
 */
$_SERVER['HTTP_HOST'] = 'staging.artistic-sthan.com';
require_once __DIR__ . '/../config/database.php';

if (!isset($pdo)) {
    die("Database connection missing.\n");
}

$propertyId = 1;
echo "Starting operational data reset for Property ID $propertyId on Staging...\n";

$pdo->exec("SET FOREIGN_KEY_CHECKS = 0");

$tablesToClear = [
    'audit_logs',
    'billing_receipts',
    'cash_drawer_entries',
    'farm_utility_expenses',
    'financial_ledger',
    'guest_extra_charges',
    'guest_id_documents',
    'guests',
    'kitchen_orders',
    'kitchen_purchases_log',
    'kitchen_wastage_logs',
    'order_items',
    'orders',
    'petty_cash',
    'property_audit_log',
    'property_custom_expenses',
    'property_requests',
    'served_logs',
    'service_requests',
    'staff_advances',
    'staff_attendance',
    'staff_meal_logs',
    'stock_requisitions',
    'walk_in_tabs',
];

$totalCleared = 0;
foreach ($tablesToClear as $tbl) {
    try {
        $stmt = $pdo->prepare("DELETE FROM `$tbl` WHERE `property_id` = ?");
        $stmt->execute([$propertyId]);
        $cnt = $stmt->rowCount();
        echo " - Cleared $cnt rows from `$tbl`\n";
        $totalCleared += $cnt;
    } catch (Exception $e) {
        echo " - Skipped `$tbl`: " . $e->getMessage() . "\n";
    }
}

try {
    $stmtStock = $pdo->prepare("UPDATE `req_catalog` SET `current_stock` = 0.00 WHERE `property_id` = ?");
    $stmtStock->execute([$propertyId]);
    $stockCnt = $stmtStock->rowCount();
    echo " - Reset stock quantities to 0.00 for $stockCnt items in `req_catalog`\n";
} catch (Exception $e) {}

$pdo->exec("SET FOREIGN_KEY_CHECKS = 1");

echo "✅ STAGING_JAIPUR_RESET_COMPLETE (Total rows cleared: $totalCleared)\n";
