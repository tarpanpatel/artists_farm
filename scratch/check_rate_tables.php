<?php
require_once __DIR__ . '/../php/config/database.php';

$tables = $pdo->query("SHOW TABLES LIKE '%rate%'")->fetchAll(PDO::FETCH_COLUMN);
echo "RATE TABLES:\n";
print_r($tables);

$channexTables = $pdo->query("SHOW TABLES LIKE '%channex%'")->fetchAll(PDO::FETCH_COLUMN);
echo "\nCHANNEX TABLES:\n";
print_r($channexTables);

$invTables = $pdo->query("SHOW TABLES LIKE '%inv%'")->fetchAll(PDO::FETCH_COLUMN);
echo "\nINV TABLES:\n";
print_r($invTables);
