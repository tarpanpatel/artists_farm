<?php
require_once __DIR__ . '/php/config/database.php';

try {
    $columns = $pdo->query("DESCRIBE properties")->fetchAll(PDO::FETCH_COLUMN, 0);
    echo json_encode($columns);
} catch (Exception $e) {
    echo json_encode(['error' => $e->getMessage()]);
}
?>
