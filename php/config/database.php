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
    // Domain migration (24 Aug 2026): production cut over from artistic-sthan.com to
    // ground-code.com, same hard-cutover treatment staging got - artistic-sthan.com is
    // deliberately NOT in this list any more so a stray request from the old frontend gets a
    // real CORS 403 instead of silently still being treated as a trusted origin.
    'https://ground-code.com', 'https://www.ground-code.com',
    'https://staging.ground-code.com',
    // Local domain-root vhost (27 Aug 2026) - a hosts-file entry pointing dev.ground-code.com
    // at 127.0.0.1, with an Apache vhost serving this exact checkout as that host's own
    // document root, so local testing has a real domain-root URL to use now that the app
    // no longer supports being served from a subfolder (see index.php/api.ts history).
    'http://dev.ground-code.com',
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Access-Control-Allow-Origin: ' . (in_array($origin, $allowed_origins) ? $origin : 'https://ground-code.com'));
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Testing-Mode');
header('Content-Type: application/json; charset=UTF-8');

// Null-coalesced (26 Aug 2026): a CLI process has no REQUEST_METHOD at all, so
// this emitted an "Undefined array key" warning on stdout for EVERY cron run -
// every cron script requires this file. Same CLI-has-no-HTTP-request blind spot
// as the SERVER_NAME fallback further down, and the same practical risk: warning
// text printed ahead of a script's real output is exactly what breaks a caller
// that parses that output. Line 55's own REQUEST_METHOD read already did this
// correctly; this one was simply missed.
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
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

$server_name = $_SERVER['SERVER_NAME'] ?? $_SERVER['HTTP_HOST'] ?? null;

// CLI fallback (found 25 Aug 2026 building php/cron/dispatcher.php): every
// cron script requires this file too, but a CLI process has no HTTP request
// at all - SERVER_NAME/HTTP_HOST are simply absent from $_SERVER, so without
// this branch $server_name silently defaulted to 'localhost' and every cron
// job, on every environment, tried to connect with local dev credentials
// (root/no password) the moment it actually ran - confirmed live the first
// time dispatcher.php was ever executed on staging. This is almost
// certainly why no cron job in this codebase had ever been proven to run
// successfully end to end before. Derived from the running script's own
// on-disk path instead (stable regardless of HTTP context, since staging
// and production are separate checkouts at known paths) - falls back to
// staging, never production, if the path doesn't clearly match either, per
// this file's own "never silently fall through to production" principle
// (see the staging-DB-isolation comment right below).
if ($server_name === null && php_sapi_name() === 'cli') {
    $scriptPath = str_replace('\\', '/', __FILE__);
    if (str_contains($scriptPath, '/staging.ground-code.com/')) {
        $server_name = 'staging.ground-code.com';
    } elseif (str_contains($scriptPath, '/ground-code.com/')) {
        $server_name = 'ground-code.com';
    } elseif (str_contains($scriptPath, '/xampp/htdocs/')) {
        $server_name = 'localhost';
    } else {
        $server_name = 'staging.ground-code.com';
    }
}
$server_name = $server_name ?? 'localhost';

// Check if running on local environment (localhost or 127.0.0.1). dev.ground-code.com
// (27 Aug 2026) is a hosts-file entry pointing back at 127.0.0.1 for local domain-root
// testing - it must be checked here explicitly, exact-match only, never as a
// str_contains/wildcard - the real production check right below matches on
// "ground-code.com" too, and this local-only hostname must never fall through to that
// branch and connect to the real production database using local dev credentials.
$__is_local_env = $server_name === 'localhost' || $server_name === '127.0.0.1' || str_contains($server_name, '192.168.') || $server_name === 'dev.ground-code.com';
// Staging is deployed from the exact same codebase as production (see deploy-staging.ps1's
// git-pull step), so without this check it fell into the same "anything that isn't local"
// branch as real production and connected to the SAME `groundcode` database - every test
// booking/checkout/delete done on staging was landing directly in live tenant data. Confirmed
// 15 Aug 2026.
// Domain migration (24 Aug 2026): staging cut over from staging.artistic-sthan.com to
// staging.ground-code.com - deploy-staging.ps1, CORS allow-list, etc. now all point at the new
// domain exclusively. The old staging.artistic-sthan.com hostname was recognized here too for a
// while as a migration safety net (its vhost/files were left in place so a stale bookmark/QR
// code/search-cache hit would still land on the harmless staging DB, never silently fall through
// to production). Removed 25 Aug 2026 - the old subdomain's files were deleted from the server
// entirely (explicit user request: "remove all traces and files so that our ground-code app is
// bug free and clean"), so there's nothing left at that hostname to safety-net for any more.
$__is_staging_env = in_array($server_name, ['staging.ground-code.com'], true);
// Hosts CPGuard has actually whitelisted for php/telegram/telegram.php's own local copy - see
// router.php's require logic right below the kitchen/inventory/etc. requires.
// ground-code.com/www.ground-code.com (the production domain,
// /home/apartment/ground-code.com/php/telegram/telegram.php) was confirmed whitelisted 24 Aug
// 2026, so production uses its own local copy - staging (any staging.* hostname) is NOT in this
// list and keeps redirecting remotely, since only production's path has ever been whitelisted.
// artistic-sthan.com/www.artistic-sthan.com removed 25 Aug 2026 alongside the old staging
// subdomain's files above - that whitelist ticket (BRX-3227572) was for the OLD production
// domain, retired by the same ground-code.com migration; no live hostname should ever match it
// again.
$__is_original_telegram_whitelisted_host = in_array($server_name, ['ground-code.com', 'www.ground-code.com'], true);
if (!defined('APP_IS_ORIGINAL_TELEGRAM_WHITELISTED_HOST')) {
    define('APP_IS_ORIGINAL_TELEGRAM_WHITELISTED_HOST', $__is_original_telegram_whitelisted_host);
}
// Shared local/live flag for anything outside DB credentials that needs the same distinction
// (e.g. cookie 'secure' flag - must be false on local plain-HTTP or the session cookie never
// gets set/sent and login silently fails). database.php is require_once'd by every endpoint
// that sets the session cookie, so this is defined exactly once, consistently.
if (!defined('APP_IS_LOCAL_ENV')) {
    define('APP_IS_LOCAL_ENV', $__is_local_env);
}
if (!defined('APP_IS_STAGING_ENV')) {
    define('APP_IS_STAGING_ENV', $__is_staging_env);
}
// Demo data (public-demo auto-login, the Root Admin "Reset Demo Data" tool,
// generate/clear_demo_data) is a sales/testing aid, not something a real
// production visitor or tenant should ever see - gate it to local + staging
// only. Single shared flag rather than repeating "local || staging" at every
// call site, same reasoning as APP_IS_LOCAL_ENV above.
if (!defined('APP_DEMO_DATA_ENABLED')) {
    define('APP_DEMO_DATA_ENABLED', $__is_local_env || $__is_staging_env);
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
// Lifetime bumped 7 -> 30 days (27 Aug 2026, "remember me" request for the installed PWA/
// terminal - staff/owners shouldn't have to sign in again just because they closed the app).
// Must stay equal to router.php's session_set_cookie_params() lifetime and gc_maxlifetime -
// see that file's own comment for why a shorter server-side gc_maxlifetime would silently
// undo this (cookie still valid, but the session data it points to already garbage-collected).
if (!function_exists('appSetSessionCookie')) {
    function appSetSessionCookie(string $sessionId): void {
        setcookie('artists_farm_session', $sessionId, [
            'expires' => time() + 86400 * 30,
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
        // MySQL's own session timezone is independent of PHP's
        // date_default_timezone_set('Asia/Kolkata') (set in errors/logger.php,
        // required above) - it defaults to whatever the DB server/OS is
        // configured to (commonly UTC on shared hosting), regardless of that
        // PHP setting. Every NOW()-stamped column (order_time being the one
        // that surfaced this - see KitchenManagement.tsx's elapsed-time
        // display) was silently written in a different timezone than every
        // PHP-generated timestamp elsewhere in the app (audit_logs, Telescope
        // logs, etc.), and the frontend's `new Date(naiveString)` parses a
        // timezone-less string as local (IST) time - so a UTC-stamped
        // order_time read back and compared against a real IST "now" was
        // showing hours of bogus extra elapsed time. Pin the session to IST
        // so every timestamp this app writes or reads means the same thing.
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '+05:30'",
    ]);

    // Self-healing schema checks: cache check result so DDL ALTER TABLE and SHOW queries run once
    // per server lifetime rather than firing 15 redundant queries on every API request.
    if (!isSchemaVerified('db_connection_init_' . $db_name)) {
        // REMOVED 17 Aug 2026 - this used to unconditionally INSERT IGNORE two
        // hardcoded properties ("Ground Code Jaipur"/slug=jaipur, "Ground Code
        // Goa"/slug=goa) with no tenant_id and no property_type, every time this
        // once-per-hour cache expired (see schema_cache.php's 3600s TTL). Since
        // `properties.slug` has no UNIQUE constraint, INSERT IGNORE didn't even
        // reliably no-op once the real tenant-scoped "jaipur"/"goa" properties
        // existed - it silently created ORPHANED duplicate properties (no
        // tenant, so invisible in any tenant's dashboard) that then won every
        // slug-based URL resolution against the real property, because
        // property_resolver.php matches slug alone with no tenant scoping.
        // This is exactly what property ids 290404/290394 were, found and
        // deleted 17 Aug 2026 - and this code would have silently recreated
        // them within the hour. Leftover from a pre-multi-tenant single-property
        // bootstrap; real properties are created tenant-scoped via
        // TenantDashboard.tsx/PlatformPropertyManagement.tsx now.

        // Legacy property_type values predate the SINGLE/MULTI_KEY/MULTI_KEY_ROOM
        // enum (e.g. "vacation_home" on properties created before this system
        // existed - TenantDashboard.tsx's creation UI only ever offers Single or
        // Multi-Key). Normalize so every consumer can trust an exact
        // property_type === 'SINGLE' check instead of needing its own workaround.
        try {
            $pdo->exec("UPDATE `properties` SET `property_type` = 'SINGLE' WHERE `property_type` NOT IN ('SINGLE', 'MULTI_KEY', 'MULTI_KEY_ROOM') OR `property_type` IS NULL OR `property_type` = ''");
        } catch (PDOException $e) {}

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

        // Compound indexes for the property-scoped list/filter queries every dashboard runs
        // on load (SITE_PERFORMANCE_OPTIMIZATION_PLAN.md, corrected 15 Aug 2026 against the
        // live schema - the plan's own version used tenant_id/check_in_date/kitchen_menu_items,
        // none of which exist; this app scopes everything by property_id, not tenant_id, and
        // the real columns/table are checkin_date and menu_items). property_id alone is
        // already indexed on all four tables (FK-backed), but a single-column index can't
        // serve a query that also filters on status/date in one pass - these compound indexes
        // let MySQL satisfy the WHERE+ORDER BY together instead of index-scanning by
        // property_id then filesorting the rest. try/catch (not "ADD INDEX IF NOT EXISTS":
        // narrower MySQL/MariaDB version support than the ADD COLUMN form already used above)
        // so a duplicate-key-name error on repeat runs is silently a no-op, same pattern as
        // every other self-heal block in this file.
        $compoundIndexes = [
            "ALTER TABLE `guests` ADD INDEX `idx_property_status_checkin` (`property_id`, `status`, `checkin_date`)",
            "ALTER TABLE `kitchen_orders` ADD INDEX `idx_property_status_ordertime` (`property_id`, `status`, `order_time`)",
            "ALTER TABLE `menu_items` ADD INDEX `idx_property_category_hidden` (`property_id`, `category_id`, `is_hidden`)",
            "ALTER TABLE `audit_logs` ADD INDEX `idx_property_timestamp` (`property_id`, `timestamp`)",
        ];
        foreach ($compoundIndexes as $sql) {
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
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '+05:30'",
            ]);
            clone_database_tables($pdo_sys, $live_db, $test_db);

            // Try connecting to $test_db again
            try {
                $pdo = new PDO("mysql:host=$db_host;dbname=$test_db;charset=utf8mb4", $db_user, $db_pass, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                    PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '+05:30'",
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

