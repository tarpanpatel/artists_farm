<?php
/**
 * Database & Environment Configuration
 * Artists Farm Resort & Kitchen Management System
 */

// Restrict CORS to specific known origins. Local dev ports match src/services/api.ts's own
// _isDev port list (3000/5173/5174/8080) - the CORS list only had 5173 before, a latent gap
// (any of the other three ports would've been silently rejected by CORS if ever hit
// cross-origin rather than through Vite's same-origin proxy).
// SECURITY (12 Aug 2026): was 'artistsfarmjaipur.com' - a stale/unused domain
// from an earlier project name, not the real production domain. Since the
// Origin/Referer check below runs server-side on every write regardless of
// same-origin/cross-origin, this wasn't a cosmetic mismatch - it would have
// 403'd every single write (including login) the moment multi-tenant went
// live on the real domain, since the browser's Origin header never matches
// anything in this list.
$allowed_origins = [
    'http://localhost', 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:8080',
    'http://127.0.0.1', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:8080',
    'https://artistic-sthan.com', 'https://www.artistic-sthan.com',
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Access-Control-Allow-Origin: ' . (in_array($origin, $allowed_origins) ? $origin : 'https://artistic-sthan.com'));
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Testing-Mode');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// SECURITY (11 Aug 2026): lightweight CSRF protection via Origin/Referer allow-list, reusing
// the exact same $allowed_origins the CORS header above already uses rather than maintaining a
// second, independently-drifting list. database.php is require_once'd by nearly every PHP
// endpoint that can write (router.php, ical_sync.php, demo_data.php, ...), so this one check
// covers the write-capable surface without touching each file individually.
//
// Browsers reliably send Origin on state-changing (POST/PUT/DELETE/PATCH) requests, same-origin
// or cross-origin - a real cross-site CSRF attack (malicious auto-submitted form, fetch from an
// attacker's page) carries the ATTACKER's origin, not one of ours, so this catches it. A request
// with NO Origin/Referer at all is deliberately let through rather than rejected: that's the
// normal shape of non-browser API clients (curl, server-to-server tooling) rather than a real
// CSRF attack, and rejecting them outright would break legitimate tooling to close a residual
// gap SameSite=Lax session cookies already mostly cover.
$is_write_method = in_array($_SERVER['REQUEST_METHOD'] ?? '', ['POST', 'PUT', 'DELETE', 'PATCH']);
if ($is_write_method) {
    $requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (!$requestOrigin && !empty($_SERVER['HTTP_REFERER'])) {
        $refererParts = parse_url($_SERVER['HTTP_REFERER']);
        if (!empty($refererParts['scheme']) && !empty($refererParts['host'])) {
            $requestOrigin = $refererParts['scheme'] . '://' . $refererParts['host']
                . (isset($refererParts['port']) ? ':' . $refererParts['port'] : '');
        }
    }
    if ($requestOrigin && !in_array($requestOrigin, $allowed_origins)) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Request origin not allowed.']);
        exit();
    }
}

require_once __DIR__ . "/testing_sandbox.php";
require_once __DIR__ . "/property_resolver.php";
require_once __DIR__ . "/schema_cache.php";
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

    // Self-healing schema checks: cache check result so DDL ALTER TABLE and SHOW queries run once
    // per server lifetime rather than firing 15 redundant queries on every API request.
    if (!isSchemaVerified('db_connection_init_' . $db_name)) {
        $pdo->exec("INSERT IGNORE INTO `properties` (`name`, `slug`, `domain`) VALUES
          ('Artists Farm Jaipur', 'jaipur', 'artistsfarmjaipur.com'),
          ('Artists Farm Goa', 'goa', 'goa.artistsfarmjaipur.com')");

        $propertyWhatsAppCols = [
            "ALTER TABLE `properties` ADD COLUMN IF NOT EXISTS `google_maps_link` VARCHAR(500) DEFAULT NULL",
            "ALTER TABLE `properties` ADD COLUMN IF NOT EXISTS `whatsapp_voucher_template` TEXT DEFAULT NULL",
            "ALTER TABLE `properties` ADD COLUMN IF NOT EXISTS `instructions` TEXT DEFAULT NULL",
            // Default per-night rate for this room/property - lets the Add Booking
            // form auto-populate a starting price instead of every booking starting
            // blank (see RoomsManagement.tsx / GuestManagement.tsx). Applies to both
            // MULTI_KEY_ROOM rows and SINGLE properties - a single property's "room"
            // is the property itself.
            "ALTER TABLE `properties` ADD COLUMN IF NOT EXISTS `default_tariff` DECIMAL(10,2) DEFAULT NULL",
        ];
        foreach ($propertyWhatsAppCols as $sql) {
            try { $pdo->exec($sql); } catch (PDOException $e) {}
        }

        $staffUsersCols = [
            // Independent day-rate for staff paid daily rather than a monthly
            // salary - not derived from monthly_salary (the roster page already
            // computes monthly_salary / days-in-month as a read-only reference;
            // this is a genuinely separate, directly-editable figure).
            "ALTER TABLE `staff_users` ADD COLUMN IF NOT EXISTS `daily_wage` DECIMAL(10,2) DEFAULT 0.00",
        ];
        foreach ($staffUsersCols as $sql) {
            try { $pdo->exec($sql); } catch (PDOException $e) {}
        }

        if (function_exists('initializeDatabaseTables')) {
            initializeDatabaseTables($pdo);
        }

        markSchemaVerified('db_connection_init_' . $db_name);
    }

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
