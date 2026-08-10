<?php
/**
 * Add check-in/check-out time columns to properties table.
 * Run once: php php/schema/migrations/add_property_times.php
 */

require_once __DIR__ . '/../config/database.php';

$pdo = getDBConnection();

$columns = [
    'checkin_time' => "VARCHAR(10) DEFAULT '14:00' COMMENT 'Default check-in time (HH:MM)' AFTER `timezone`",
    'checkout_time' => "VARCHAR(10) DEFAULT '11:00' COMMENT 'Default check-out time (HH:MM)' AFTER `checkin_time`",
];

foreach ($columns as $col => $def) {
    $stmt = $pdo->query("SHOW COLUMNS FROM properties LIKE '" . $col . "'");
    if ($stmt->rowCount() === 0) {
        $pdo->exec("ALTER TABLE properties ADD COLUMN `" . $col . "` " . $def);
        echo "Added column: " . $col . "\n";
    } else {
        echo "Column already exists: " . $col . "\n";
    }
}

echo "Done.\n";
