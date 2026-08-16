<?php
require_once __DIR__ . '/php/config/database.php';

try {
    $pdo->exec("ALTER TABLE `payee_entities` ADD COLUMN `upi_id` VARCHAR(100) DEFAULT NULL AFTER `name`");
    echo "SUCCESS: Column 'upi_id' added successfully to 'payee_entities' table.\n";
} catch (PDOException $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
