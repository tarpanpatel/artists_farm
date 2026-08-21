<?php
require_once __DIR__ . '/php/config/database.php';

// Count demo attendance records
$stmt = $pdo->query('SELECT COUNT(*) as count FROM staff_attendance WHERE is_demo = 1');
$result = $stmt->fetch(PDO::FETCH_ASSOC);
echo "Demo attendance records in DB: " . $result['count'] . "\n";

// Total attendance records
$stmt2 = $pdo->query('SELECT COUNT(*) as count FROM staff_attendance');
$result2 = $stmt2->fetch(PDO::FETCH_ASSOC);
echo "Total attendance records in DB: " . $result2['count'] . "\n";

// Check if demo guests exist
$stmt3 = $pdo->query('SELECT COUNT(*) as count FROM guests WHERE is_demo = 1');
$result3 = $stmt3->fetch(PDO::FETCH_ASSOC);
echo "Demo guests in DB: " . $result3['count'] . "\n";

// Check if demo staff exists
$stmt4 = $pdo->query('SELECT COUNT(*) as count FROM staff_users WHERE is_demo = 1');
$result4 = $stmt4->fetch(PDO::FETCH_ASSOC);
echo "Demo staff in DB: " . $result4['count'] . "\n";

// Check attendance dates
$stmt5 = $pdo->query('SELECT MIN(attendance_date) as min_date, MAX(attendance_date) as max_date FROM staff_attendance WHERE is_demo = 1 LIMIT 1');
$result5 = $stmt5->fetch(PDO::FETCH_ASSOC);
echo "Demo attendance date range: " . $result5['min_date'] . " to " . $result5['max_date'] . "\n";
?>
