<?php
/**
 * Server-Side Complete Database Backup Generator
 * Generates a full SQL dump of ALL tables in the database - every tenant,
 * every property. Root admin only.
 */

session_start();
require_once __DIR__ . '/../config/database.php';

if (empty($_SESSION['is_platform_admin'])) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['status' => 'error', 'message' => 'Root admin access required.']);
    exit;
}

header('Content-Type: text/plain; charset=utf-8');
header('Content-Disposition: attachment; filename="Backup_Artists_Farm_Jaipur_' . date('Y-m-d') . '.sql"');

$nowStr = date('Y-m-d H:i:s');
$output = "-- ======================================================\n";
$output .= "-- AUTOMATED DATABASE SNAPSHOT BACKUP - Ground Code JAIPUR\n";
$output .= "-- Generated At: {$nowStr}\n";

// Get all tables
$tables = [];
try {
    $stmt = $pdo->query("SHOW TABLES");
    $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
} catch (PDOException $e) {
    echo "-- Error fetching tables: " . $e->getMessage() . "\n";
    exit;
}

$output .= "-- Total Tables: " . count($tables) . " | Complete Data Export\n";
$output .= "-- ======================================================\n\n";

foreach ($tables as $table) {
    // Get CREATE TABLE statement
    try {
        $stmt = $pdo->query("SHOW CREATE TABLE `{$table}`");
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $createTable = $row['Create Table'] ?? $row['Create View'] ?? '';
    } catch (PDOException $e) {
        $output .= "-- Error getting structure for table {$table}: " . $e->getMessage() . "\n\n";
        continue;
    }

    if (!$createTable) {
        $output .= "-- Could not get structure for table: {$table}\n\n";
        continue;
    }

    $output .= "DROP TABLE IF EXISTS `{$table}`;\n";
    $output .= "{$createTable};\n\n";

    // Get all rows
    try {
        $stmt = $pdo->query("SELECT * FROM `{$table}`");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (empty($rows)) {
            $output .= "-- (no data in {$table})\n\n";
            continue;
        }

        // Get column names
        $columns = array_keys($rows[0]);

        foreach ($rows as $row) {
            $values = [];
            foreach ($columns as $col) {
                $val = $row[$col];
                if ($val === null) {
                    $values[] = 'NULL';
                } elseif (is_numeric($val)) {
                    $values[] = $val;
                } else {
                    $values[] = "'" . addslashes((string)$val) . "'";
                }
            }
            $output .= "INSERT INTO `{$table}` VALUES (" . implode(', ', $values) . ");\n";
        }
        $output .= "\n";
    } catch (PDOException $e) {
        $output .= "-- Error reading data from {$table}: " . $e->getMessage() . "\n\n";
    }
}

$output .= "-- ======================================================\n";
$output .= "-- END OF BACKUP\n";
$output .= "-- ======================================================\n";

echo $output;

