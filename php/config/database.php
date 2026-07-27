<?php
/**
 * Database & Environment Configuration
 * Artists Farm Resort & Kitchen Management System
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Testing-Mode');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . "/testing_sandbox.php";

$server_name = $_SERVER['SERVER_NAME'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost';

// Check if running on local environment (localhost or 127.0.0.1)
if ($server_name === 'localhost' || $server_name === '127.0.0.1' || str_contains($server_name, '192.168.')) {
    $db_host = 'localhost';
    $live_db = 'artists_farm_resort';
    $db_user = 'root';
    $db_pass = '';
} else {
    // Online Production Credentials
    $db_host = 'localhost';
    $live_db = 'artists_farm';
    $db_user = 'artist_farm';
    $db_pass = 'tPatel13@';
}

$is_testing_mode = false;
if (
    (isset($_SERVER['HTTP_X_TESTING_MODE']) && ($_SERVER['HTTP_X_TESTING_MODE'] === '1' || strtolower($_SERVER['HTTP_X_TESTING_MODE']) === 'true')) ||
    (isset($_COOKIE['artists_farm_testing_mode']) && $_COOKIE['artists_farm_testing_mode'] === '1') ||
    (isset($_GET['testing_mode']) && $_GET['testing_mode'] === '1')
) {
    $is_testing_mode = true;
}

$test_db = $live_db . '_test';
$db_name = $is_testing_mode ? $test_db : $live_db;

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
} catch (PDOException $e) {
    if ($is_testing_mode) {
        // Test database might not exist yet, attempt to auto-create and clone from live database
        try {
            $pdo_sys = new PDO("mysql:host=$db_host;dbname=$live_db;charset=utf8mb4", $db_user, $db_pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            clone_database_tables($pdo_sys, $live_db, $test_db);
            
            // Try connecting to $test_db again
            try {
                $pdo = new PDO("mysql:host=$db_host;dbname=$test_db;charset=utf8mb4", $db_user, $db_pass, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]);
            } catch (PDOException $ex2) {
                // Shared hosting fallback: use $live_db
                $pdo = $pdo_sys;
            }
        } catch (Exception $ex) {
            http_response_code(500);
            echo json_encode(['error' => 'Sandbox database initialization failed: ' . $ex->getMessage()]);
            exit();
        }
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
        exit();
    }
}
