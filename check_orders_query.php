<?php
require_once __DIR__ . '/php/config/database.php';
try {
    $sql = "SELECT o.id, o.guest_id, o.order_time, o.status, COALESCE(g.guest_name, 'Walk-in') as guest_name, g.room_number
            FROM orders o 
            LEFT JOIN guests g ON o.guest_id = g.id 
            WHERE o.property_id = 1
            ORDER BY o.order_time DESC";
    $stmt = $pdo->query($sql);
    echo "Query 1 success: " . count($stmt->fetchAll()) . " rows\n";
} catch (Exception $e) {
    echo "Query 1 error: " . $e->getMessage() . "\n";
}
