<?php
require_once __DIR__ . '/../php/config/database.php';
global $pdo;

foreach ($pdo->query("SHOW COLUMNS FROM guests") as $col) {
    echo sprintf("%-25s | %-15s | %-8s | %s\n", $col['Field'], $col['Type'], $col['Null'], $col['Default'] ?? 'NULL');
}
