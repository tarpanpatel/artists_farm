<?php
require_once __DIR__ . '/php/config/database.php';
$stmt = $pdo->query("SELECT * FROM orders LIMIT 5");
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
