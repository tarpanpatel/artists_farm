<?php
/**
 * Database & Environment Configuration
 * Ground Code Resort & Kitchen Management System
 */

// Automatically load Telescope error logger globally for all database-connected endpoints
require_once __DIR__ . '/../errors/logger.php';

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
    'https://staging.artistic-sthan.com',
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
$__is_local_env = $server_name === 'localhost' || $server_name === '127.0.0.1' || str_contains($server_name, '192.168.');
// Staging (staging.artistic-sthan.com) is deployed from the exact same public_html codebase
// as production (see deploy-staging.ps1's rsync step), so without this check it fell into the
// same "anything that isn't local" branch as real production and connected to the SAME
// `groundcode` database - every test booking/checkout/delete done on staging was landing
// directly in live tenant data. Confirmed 15 Aug 2026.
$__is_staging_env = $server_name === 'staging.artistic-sthan.com';
// Shared local/live flag for anything outside DB credentials that needs the same distinction
// (e.g. cookie 'secure' flag - must be false on local plain-HTTP or the session cookie never
// gets set/sent and login silently fails). database.php is require_once'd by every endpoint
// that sets the session cookie, so this is defined exactly once, consistently.
if (!defined('APP_IS_LOCAL_ENV')) {
    define('APP_IS_LOCAL_ENV', $__is_local_env);
}
if ($__is_local_env) {
    $db_host = 'localhost';
    $live_db = 'artists_farm_resort';
    $db_user = 'root';
    $db_pass = '';
} elseif ($__is_staging_env) {
    // Isolated staging database - separate from production `groundcode`. `staging_groundcode`
    // was created on the server (15 Aug 2026) with the same `groundcode` DB user/credentials
    // granted access to it. STAGING_DB_PASSWORD falls back to the production
    // DB_PASSWORD/db_pass.php so this works immediately with the shared credentials already in
    // place - set STAGING_DB_PASSWORD explicitly later if staging is ever given its own
    // rotated password, so a leaked staging credential can't also unlock production.
    $db_host = 'localhost';
    $live_db = 'staging_groundcode';
    $db_user = 'groundcode'; // confirmed by user 15 Aug 2026: same DB user/credentials as production
    $db_pass = getenv('STAGING_DB_PASSWORD')
        ?: getenv('DB_PASSWORD')
        ?: (file_exists(__DIR__ . '/db_pass.php') ? require __DIR__ . '/db_pass.php' : null);
    if ($db_pass === null) {
        http_response_code(500);
        echo json_encode(['error' => 'Staging database credentials not configured. Set STAGING_DB_PASSWORD env var.']);
        if (class_exists('TelescopeLogger')) {
            TelescopeLogger::log('sql', 'SQL Error', 'Staging DB password missing: set STAGING_DB_PASSWORD env var', 'Database Config');
        }
        error_log('Staging DB password missing: set STAGING_DB_PASSWORD env var');
        exit();
    }
} else {
    // Online Production Credentials
    // SECURITY/CORRECTNESS (12 Aug 2026): was apartment_site - a database
    // shared with an unrelated WordPress install on the same cPanel account
    // (lamps_* tables). groundcode is a dedicated database with the full,
    // current 91-table schema imported fresh from local dev.
    $db_host = 'localhost';
    $live_db = 'groundcode';
    $db_user = 'groundcode';
    $db_pass = getenv('DB_PASSWORD') ?: (file_exists(__DIR__ . '/db_pass.php') ? require __DIR__ . '/db_pass.php' : null);
    if ($db_pass === null) {
        http_response_code(500);
        echo json_encode(['error' => 'Database credentials not configured. Set DB_PASSWORD env var or create php/config/db_pass.php.']);
        if (class_exists('TelescopeLogger')) {
            TelescopeLogger::log('sql', 'SQL Error', 'Production DB password missing: set DB_PASSWORD env var or php/config/db_pass.php', 'Database Config');
        }
        error_log('Production DB password missing: set DB_PASSWORD env var or php/config/db_pass.php');
        exit();
    }
}

// SECURITY (14 Aug 2026, auditcode.md): the 8 setcookie() call sites for the session cookie
// (authenticate.php x4, router.php x4) used the old positional signature with 'secure'
// hardcoded false and no SameSite attribute at all - meaning the session cookie would still be
// sent over plain HTTP even on the live HTTPS site, and had no cross-site request protection.
// Centralized here (rather than fixed at each call site) so all 8 stay in sync automatically.
// 'secure' must stay false on local plain-HTTP XAMPP or the cookie is silently dropped by the
// browser and login breaks - hence tying it to the same local/live check as the DB credentials.
if (!function_exists('appSetSessionCookie')) {
    function appSetSessionCookie(string $sessionId): void {
        setcookie('artists_farm_session', $sessionId, [
            'expires' => time() + 86400 * 7,
            'path' => '/',
            'domain' => '',
            'secure' => !APP_IS_LOCAL_ENV,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
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
          ('Ground Code Jaipur', 'jaipur', 'artistsfarmjaipur.com'),
          ('Ground Code Goa', 'goa', 'goa.artistsfarmjaipur.com')");

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
            if (class_exists('TelescopeLogger')) {
                TelescopeLogger::log('sql', 'SQL Error', 'Sandbox database init error: ' . $ex->getMessage(), 'Database Config');
            }
            error_log('Sandbox database init error: ' . $ex->getMessage());
            exit();
        }
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Database connection failed. Please contact system administrator.']);
        if (class_exists('TelescopeLogger')) {
            TelescopeLogger::log('sql', 'SQL Error', 'Database connection error: ' . $e->getMessage(), 'Database Config');
        }
        error_log('Database connection error: ' . $e->getMessage());
        exit();
    }
}

