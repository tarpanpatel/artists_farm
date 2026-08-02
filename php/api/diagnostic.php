<?php
/**
 * Diagnostic endpoint to check database status
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../errors/logger.php';

$diagnostics = [];

try {
    // Check properties
    $result = $pdo->query('SELECT COUNT(*) as cnt FROM properties')->fetch();
    $diagnostics['properties'] = (int)$result['cnt'];
} catch (Exception $e) {
    $diagnostics['properties_error'] = $e->getMessage();
}

try {
    // Check nav_menu_items
    $result = $pdo->query('SELECT COUNT(*) as cnt FROM nav_menu_items')->fetch();
    $diagnostics['nav_menu_items'] = (int)$result['cnt'];
} catch (Exception $e) {
    $diagnostics['nav_menu_items_error'] = $e->getMessage();
}

try {
    // Check misc_catalog (expenses)
    $result = $pdo->query('SELECT COUNT(*) as cnt FROM misc_catalog')->fetch();
    $diagnostics['misc_catalog'] = (int)$result['cnt'];
} catch (Exception $e) {
    $diagnostics['misc_catalog_error'] = $e->getMessage();
}

try {
    // Check users
    $result = $pdo->query('SELECT COUNT(*) as cnt FROM users')->fetch();
    $diagnostics['users'] = (int)$result['cnt'];
} catch (Exception $e) {
    $diagnostics['users_error'] = $e->getMessage();
}

try {
    // Check tenants
    $result = $pdo->query('SELECT COUNT(*) as cnt FROM tenants')->fetch();
    $diagnostics['tenants'] = (int)$result['cnt'];
} catch (Exception $e) {
    $diagnostics['tenants_error'] = $e->getMessage();
}

try {
    // List all tables
    $tables = [];
    $result = $pdo->query('SHOW TABLES');
    while ($row = $result->fetch(PDO::FETCH_NUM)) {
        $table = $row[0];
        $count = $pdo->query("SELECT COUNT(*) as cnt FROM `$table`")->fetch();
        $tables[$table] = (int)$count['cnt'];
    }
    $diagnostics['tables'] = $tables;
} catch (Exception $e) {
    $diagnostics['tables_error'] = $e->getMessage();
}

header('Content-Type: application/json');
echo json_encode(['status' => 'success', 'data' => $diagnostics], JSON_PRETTY_PRINT);
