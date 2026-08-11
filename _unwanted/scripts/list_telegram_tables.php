<?php
require 'php/config/database.php';
$pdo = getDBConnection();
$stmt = $pdo->query("SHOW TABLES");
$tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
foreach ($tables as $t) {
    if (stripos($t, 'telegram') !== false || stripos($t, 'group') !== false) {
        echo $t . PHP_EOL;
    }
}
