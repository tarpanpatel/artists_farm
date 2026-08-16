<?php
require_once __DIR__ . '/php/config/database.php';

try {
    $pdo->exec("ALTER TABLE `payee_entities` DROP COLUMN `type`");
    echo "SUCCESS: Column 'type' dropped successfully from 'payee_entities' table.\n";
} catch (PDOException $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
