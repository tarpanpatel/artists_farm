<?php
require_once __DIR__ . '/php/config/database.php';
$stmt = $pdo->query("DESCRIBE guests");
print_r($stmt->fetchAll(PDO::FETCH_COLUMN));
