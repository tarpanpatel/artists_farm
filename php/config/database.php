<?php
/**
 * Database & Environment Configuration
 * Artists Farm Resort & Kitchen Management System
 */

// Restrict CORS to specific known origins
$allowed_origins = ['http://localhost:5173', 'http://localhost', 'https://artistsfarmjaipur.com', 'https://www.artistsfarmjaipur.com'];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Access-Control-Allow-Origin: ' . (in_array($origin, $allowed_origins) ? $origin : 'https://artistsfarmjaipur.com'));
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Testing-Mode');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . "/testing_sandbox.php";
require_once __DIR__ . "/property_resolver.php";
require_once __DIR__ . "/../database/migrations.php";

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
    $live_db = 'apartment_site';
    $db_user = 'apartment_site';
    $db_pass = getenv('DB_PASSWORD') ?: (file_exists(__DIR__ . '/db_pass.php') ? require __DIR__ . '/db_pass.php' : null);
    if ($db_pass === null) {
        http_response_code(500);
        echo json_encode(['error' => 'Database credentials not configured. Set DB_PASSWORD env var or create php/config/db_pass.php.']);
        error_log('Production DB password missing: set DB_PASSWORD env var or php/config/db_pass.php');
        exit();
    }
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
    // properties table is provisioned once via direct migration, not
    // re-verified on every request (see ROADMAP.md history).
    $pdo->exec("INSERT IGNORE INTO `properties` (`name`, `slug`, `domain`) VALUES
      ('Artists Farm Jaipur', 'jaipur', 'artistsfarmjaipur.com'),
      ('Artists Farm Goa', 'goa', 'goa.artistsfarmjaipur.com')");

    // WhatsApp booking-confirmation voucher: per-property Maps link (captured
    // at property creation, editable later in the tenant's own dashboard) and
    // an optional custom message template - reuses the existing `phone`
    // column for contact number(s), same one create_property_for_tenant
    // already populates. NULL template = fall back to the generic default
    // built into the voucher-sharing code, matching the same "tenant may
    // customize, sensible default if they don't" shape as Telegram templates.
    $propertyWhatsAppCols = [
        "ALTER TABLE `properties` ADD COLUMN IF NOT EXISTS `google_maps_link` VARCHAR(500) DEFAULT NULL",
        "ALTER TABLE `properties` ADD COLUMN IF NOT EXISTS `whatsapp_voucher_template` TEXT DEFAULT NULL",
    ];
    foreach ($propertyWhatsAppCols as $sql) {
        try { $pdo->exec($sql); } catch (PDOException $e) {}
    }
    // Check-in instructions: free-text notes shown on the property dashboard,
    // edited alongside the address in the same Property Details modal.
    $propertyDetailCols = [
        "ALTER TABLE `properties` ADD COLUMN IF NOT EXISTS `instructions` TEXT DEFAULT NULL",
    ];
    foreach ($propertyDetailCols as $sql) {
        try { $pdo->exec($sql); } catch (PDOException $e) {}
    }
    // initializeDatabaseTables($pdo) runs once, below, after this try/catch -
    // it used to also run here, meaning it fired twice per request on the
    // normal (non-fallback) connection path for no reason.

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
            echo json_encode(['error' => 'Sandbox initialization failed.']);
            error_log('Sandbox database init error: ' . $ex->getMessage());
            exit();
        }
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Database connection failed. Please contact system administrator.']);
        error_log('Database connection error: ' . $e->getMessage());
        exit();
    }
}

if (isset($pdo) && function_exists('initializeDatabaseTables')) {
    initializeDatabaseTables($pdo);
}
