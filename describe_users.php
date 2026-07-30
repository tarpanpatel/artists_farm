<?php
require_once __DIR__ . '/php/config/database.php';

$columns = $pdo->query("DESCRIBE users")->fetchAll(PDO::FETCH_COLUMN, 0);
echo json_encode($columns);
?>
