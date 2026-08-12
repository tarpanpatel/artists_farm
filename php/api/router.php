<?php
/**
 * Central API Request Router & Dispatcher
 * Artists Farm Resort & Kitchen Management Backend System
 */

// PHP's default session lifetime (session.gc_maxlifetime, 1440s = 24min) is
// too short for an admin tool where reading/deciding between actions
// routinely exceeds it - the session silently expires mid-task, and the
// next write comes back as a false "Unauthorized" error even though the
// user never logged out. The login flows also set a 7-day
// `artists_farm_session` cookie holding the session id, but PHP only
// resumes a session from the cookie named by session.name (default
// PHPSESSID, a browser-session cookie that is lost on browser close).
// Net effect: after closing/reopening the browser the UI restores its
// localStorage login while the server has no session, so every write API
// call fails with "Unauthorized. Valid API key required for write
// operations." Point PHP at the persistent cookie and keep both the cookie
// and the server-side session file alive for 7 days.
ini_set('session.gc_maxlifetime', 86400 * 7);
ini_set('session.cookie_lifetime', 86400 * 7);
ini_set('session.cookie_httponly', 1);
session_name('artists_farm_session');
session_start();
header('Cache-Control: no-store, no-cache, must-revalidate');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/guest_status.php';
// Needed early (before the PUBLIC DEMO MODE block below, which checks
// property access to decide whether to override the current session) -
// was previously required much later, after that block, so it couldn't
// be used there at all.
require_once __DIR__ . '/../security/access_control.php';
require_once __DIR__ . '/../errors/logger.php';
require_once __DIR__ . '/../guests/guests.php';
require_once __DIR__ . '/../billing/billing.php';
require_once __DIR__ . '/../billing/receipts.php';
require_once __DIR__ . '/../kitchen/orders.php';
require_once __DIR__ . '/../kitchen/menu.php';
require_once __DIR__ . '/../inventory/inventory.php';
require_once __DIR__ . '/../finance/ledger.php';
require_once __DIR__ . '/../finance/petty_cash.php';
require_once __DIR__ . '/../staff/staff.php';
require_once __DIR__ . '/../audit/audit.php';
// Conditional (12 Aug 2026): this was an unconditional require - a malware
// scanner quarantining this ONE file (a real, recurring event on the live
// server) took down every action router.php handles, including login,
// since a failed require_once here is fatal before $action is even read.
// Now only Telegram-specific actions (see handleTelegramRequests below) are
// affected if this file is ever missing again.
if (file_exists(__DIR__ . '/../telegram/telegram.php')) {
    require_once __DIR__ . '/../telegram/telegram.php';
}
require_once __DIR__ . '/../modules/module_manager.php';
require_once __DIR__ . '/db_export.php';
require_once __DIR__ . '/../licenses/licenses.php';
require_once __DIR__ . '/../theme/theme_settings.php';
require_once __DIR__ . '/configuration.php';
require_once __DIR__ . '/multikey_properties.php';
require_once __DIR__ . '/../service_requests/service_requests.php';
require_once __DIR__ . '/../security/rate_limiter.php';
require_once __DIR__ . '/../security/csrf_handler.php';
require_once __DIR__ . '/../utils/mailer.php';
require_once __DIR__ . '/../utils/welcome_template.php';

// Self-healing column check for `users`, run unconditionally (not tied to
// any one action) so every action can rely on full_name/must_change_passcode
// existing - login_user's own copy of this check only ran for that action,
// which is what let create_tenant hit "Unknown column 'full_name'" the first
// time it ran against a database that had never called login_user yet.
if (!isSchemaVerified('schema_users_table_v2')) {
    try {
        $usersTableCheck = $pdo->query("SHOW TABLES LIKE 'users'");
        if ($usersTableCheck->rowCount() > 0) {
            $usersCols = $pdo->query("SHOW COLUMNS FROM users")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('full_name', $usersCols)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN `full_name` VARCHAR(255) DEFAULT NULL AFTER `username`");
            }
            if (!in_array('must_change_passcode', $usersCols)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN `must_change_passcode` TINYINT(1) NOT NULL DEFAULT 0");
            }
            if (!in_array('phone_number', $usersCols)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN `phone_number` VARCHAR(50) DEFAULT NULL");
            }
            if (!in_array('passcode', $usersCols)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN `passcode` VARCHAR(50) DEFAULT NULL");
            }
            if (!in_array('email', $usersCols)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN `email` VARCHAR(255) DEFAULT NULL AFTER `phone_number`");
            }
            if (!in_array('gstin', $usersCols)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN `gstin` VARCHAR(20) DEFAULT NULL AFTER `email`");
            }
        }
    } catch (Exception $e) {}
    markSchemaVerified('schema_users_table_v2');
}

/**
 * Every property a tenant creates should immediately show the tenant
 * themselves as a Super Admin in that property's own staff directory
 * (Staff & Payees Control) - otherwise the "who's on staff" dropdown
 * looks empty even though the tenant can already log in and manage the
 * property. staff_users is scoped per-property (unlike `users`, which is
 * platform/tenant-wide), so this needs to run once per property, not
 * once per tenant. Idempotent - safe to call even if a row already
 * exists for this tenant+property (e.g. a retried request).
 */
if (!function_exists('ensureTenantOwnerStaffRow')) {
    function ensureTenantOwnerStaffRow(PDO $pdo, $tenantId, $propertyId) {
        try {
            $tenantStmt = $pdo->prepare("SELECT name, phone FROM tenants WHERE id = ?");
            $tenantStmt->execute([$tenantId]);
            $tenant = $tenantStmt->fetch();
            if (!$tenant) return;

            $phoneDigits = preg_replace('/\D/', '', $tenant['phone'] ?? '');
            $phoneDigits = strlen($phoneDigits) >= 10 ? substr($phoneDigits, -10) : $phoneDigits;
            if (strlen($phoneDigits) !== 10) return; // no valid phone on file yet - nothing to seed

            $existing = $pdo->prepare("SELECT id FROM staff_users WHERE property_id = ? AND username = ? LIMIT 1");
            $existing->execute([$propertyId, $phoneDigits]);
            if ($existing->fetch()) return;

            $pdo->prepare("
                INSERT INTO staff_users (id, property_id, username, full_name, role, phone, phone_number, status, is_financial_handler, passcode)
                VALUES (?, ?, ?, ?, 'Super Admin', ?, ?, 'Active', 1, '123456')
            ")->execute(["owner-{$propertyId}", $propertyId, $phoneDigits, $tenant['name'], $phoneDigits, $phoneDigits]);
        } catch (Exception $e) {
            // Non-fatal - property creation itself should still succeed even
            // if this best-effort directory seeding fails for some reason.
        }
    }
}

// === Global Error & Exception Handlers ===
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    if (error_reporting() & $errno) {
        $level = 'ERROR';
        if ($errno == E_ERROR || $errno == E_PARSE) $level = 'FATAL';
        elseif ($errno == E_WARNING || $errno == E_CORE_WARNING || $errno == E_COMPILE_WARNING) $level = 'WARNING';
        elseif ($errno == E_NOTICE || $errno == E_CORE_NOTICE || $errno == E_COMPILE_NOTICE) $level = 'NOTICE';
        elseif ($errno == E_DEPRECATED) $level = 'DEPRECATED';

        $shortfile = basename($errfile);
        if (class_exists('TelescopeLogger')) {
            TelescopeLogger::log(
                'php',
                $level,
                "{$errstr} in {$shortfile}:{$errline}",
                "PHP Error Handler",
                ['file' => $errfile, 'line' => $errline, 'type' => $errno]
            );
        }
    }
    return false;
});

set_exception_handler(function($exception) {
    if (class_exists('TelescopeLogger')) {
        TelescopeLogger::log(
            'php',
            'FATAL',
            "🔴 Exception: {$exception->getMessage()}",
            "Exception Handler [{$exception->getFile()}:{$exception->getLine()}]",
            ['message' => $exception->getMessage(), 'file' => $exception->getFile(), 'line' => $exception->getLine()]
        );
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error']);
    exit;
});

// === Simple API Key Authentication (from environment only, no fallback) ===
$api_key = getenv('API_KEY');
$provided_key = $_SERVER['HTTP_X_API_KEY'] ?? $_GET['api_key'] ?? '';
// SECURITY (10 Aug 2026): this used to list ~57 actions - including real writes like
// add_user/update_user/delete_user/add_payee/record_salary_payment - as "public", which let
// them bypass BOTH the API-key check below AND (before the isPropertyAccessAllowed() gate a
// few lines down existed) any session check at all, for any property an anonymous caller
// named via ?property_slug=. Trimmed to the only actions that must genuinely work before a
// session exists: login itself, the self-service "forgot passcode" flow, the temporary-
// passcode-must-change step (already carries the session login_user just established, kept
// here defensively since it's not property data), and the property-setup wizard (which does
// its own tenant+property-slug ownership proof inline - see the 'update_property' case).
// Every other action now requires an authenticated session, enforced universally below.
// get_csrf_token added 12 Aug 2026: must be reachable before a CSRF token
// exists at all (the token itself), and before any session/write gate below.
// get_tenant_by_slug added 12 Aug 2026: App.tsx calls this unconditionally on
// every page load (before knowing whether the current URL slug is a property
// or a tenant dashboard), for any user, and it only ever returns tenant
// metadata (id/name/slug/plan) - never anything property-scoped. It has no
// $propertyId to check in the first place, so it was falling through to the
// universal property-scope gate below and 403ing (logged as a "Property-scope
// violation") for every session whose resolved $propertyId wasn't the one the
// gate defaulted to, on every single page load.
// get_demo_login_credentials added 12 Aug 2026: returns the username/passcode
// for the best-priority active staff account on a designated public-demo
// property (properties.is_public_demo) - the frontend then does a completely
// normal login_user POST with them, replacing the previous auto-session-
// injection approach (see the removed block above, and git history).
// get_system_settings/get_theme_settings added 12 Aug 2026: both read a
// single global row (platform_theme_settings, system settings), never
// anything property-scoped, and need to work on the unauthenticated login
// page too (it needs the same custom theme/CSS as every other page) - was
// falling through the universal property-scope gate and 403ing for any
// session whose property didn't happen to match. The corresponding
// save_system_settings/save_theme_settings stay out of this list (write
// actions, root-admin-only, each with its own explicit role check).
// get_current_property (12 Aug 2026) added for the same reason as
// get_system_settings/get_theme_settings above: it's the root cause of a
// recurring "Access Denied" report. DataLoader.tsx calls it UNCONDITIONALLY
// on every page load, before AuthContext even resolves whether there's a
// valid session for this property - a completely logged-out visitor hitting
// a real property's URL for the first time needs it to render the login
// screen with that property's own name/branding, and a session that's
// valid but scoped to a DIFFERENT property (e.g. the public-demo session
// bleeding into an unrelated property after check_session's fix above
// correctly starts reporting authenticated:false) still needs it to
// render that same login screen instead of getting hard-blocked here
// first and never reaching the login-screen fallback at all. Returns only
// non-sensitive branding/config columns (name, slug, type, currency,
// colors, ...) - no guest, financial, or staff data - so this is exactly
// the same "safe to read before login" class as the settings above.
$public_actions = ['login_user', 'request_login_info', 'force_set_passcode', 'update_property', 'get_dummy_history_status', 'enable_dummy_history', 'disable_dummy_history', 'get_csrf_token', 'check_session', 'get_tenant_by_slug', 'get_demo_login_credentials', 'get_system_settings', 'get_theme_settings', 'get_current_property'];


$request_method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';

// PUBLIC DEMO MODE (12 Aug 2026, replaced with this simpler design later the
// same day): properties.is_public_demo lets anonymous visitors get full real
// access to one specific, designated property without logging in.
//
// This used to auto-create/overwrite the session server-side on arbitrary
// GET requests (see git history) - three separate rounds of fixes there
// still left visitors intermittently stuck on "Access Denied" for reasons
// that never fully reproduced in direct testing, likely some interaction
// with the browser's own session/cookie state that a scripted test doesn't
// capture. Replaced entirely with the far simpler, far better-tested path:
// the frontend calls get_demo_login_credentials (below) to get this
// property's demo username/passcode, then does a completely normal
// login_user POST with them - the exact same code path every real staff
// login already goes through, thousands of times a day, instead of a
// bespoke session-mutation path only demo visitors ever hit.

// Require API key for write/delete actions, unless user is authenticated via session
$is_write_action = in_array($request_method, ['POST', 'PUT', 'DELETE']);
$is_authenticated_user = isset($_SESSION['username']);
$is_platform_admin = $_SESSION['is_platform_admin'] ?? false;

// Allow write actions if: API key matches OR user is authenticated OR (root admin on platform admin actions) OR public action
$platform_admin_actions = ['toggle_property_module', 'edit_property', 'delete_property', 'delete_tenant', 'create_tenant', 'create_tenant_login', 'reset_tenant_login', 'save_theme_settings'];
$is_platform_admin_action = in_array($action, $platform_admin_actions);
$is_public_action = in_array($action, $public_actions);

$is_property_setup_action = $action === 'update_property';

// Was read at the bottom of this file (originally just for the request-logging
// call below) but referenced up here in the unauthorized-call log too, before
// it was ever assigned - every rejected write action threw an "Undefined
// variable $request_user" warning. Moved up so both uses see the real value.
$request_user = $_SESSION['username'] ?? 'Anonymous';

if ($is_write_action && !empty($api_key) && $provided_key !== $api_key && !$is_authenticated_user && !$is_public_action) {
    // Special case: allow platform admins to use certain actions without API key
    if (!($is_platform_admin && $is_platform_admin_action)) {
        // Special case: allow property setup updates without auth when the
        // caller proves ownership of the target property via tenant+property
        // slug in the request body, so the setup wizard can save
        // address/details without forcing an immediate login.
        if (!$is_property_setup_action) {
            // Log security event: unauthorized API call
            $reason = $provided_key ? 'invalid_api_key' : 'missing_api_key';
            TelescopeLogger::log(
                'security',
                'WARNING',
                "🔒 Unauthorized API call attempt: {$action} [{$reason}]",
                "Security Middleware [Authentication Failed]",
                ['action' => $action, 'method' => $request_method, 'reason' => $reason, 'user' => $request_user, 'ip' => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1']
            );
            http_response_code(401);
            echo json_encode(['status' => 'error', 'message' => 'Unauthorized. Valid API key required for write operations.']);
            exit;
        }
    }
}

// SECURITY (12 Aug 2026): CSRF protection for every state-changing action
// that isn't in $public_actions - the same "genuinely needs to work before/
// without a session" boundary already established above, not a new one.
// login_user/request_login_info/force_set_passcode are deliberately exempt:
// there's no authenticated session yet for a forged request to hijack, and
// the login flow already has its own brute-force protection (RateLimiter).
// Every actual write once a session exists (add_guest, checkout_guest,
// delete_user, ...) goes through apiFetch() in src/services/api.ts, which
// attaches the X-CSRF-Token header automatically - see getCsrfToken() there.
if ($is_write_action && !$is_public_action) {
    CSRFHandler::validateRequest();
}

// === Tenant & Platform-Admin Access Helpers ===
// The session stores only user_id/username/role - not a tenant id - so resolve
// the set of tenants a logged-in caller legitimately belongs to from the DB:
// platform/tenant users -> users.default_tenant_id; property staff -> the tenant
// that owns the property row their staff_users entry points at.
function resolveCallerTenantIds(PDO $pdo): array {
    if (!isset($_SESSION['user_id'])) {
        return [];
    }
    $uid = $_SESSION['user_id'];
    $tenantIds = [];

    // "Access All Properties" staff (11 Aug 2026) - already know their tenant
    // directly from login, no need to look it up via a specific property_id row.
    // Checked before the isset($_SESSION['property_id']) branch below for the same
    // reason as isPropertyAccessAllowed() - property_id gets set as a side effect
    // once this kind of staff navigates into a property, and if the plain-staff
    // branch ran first afterwards it would wrongly narrow them to just that one
    // property's tenant lookup path instead of using the already-known value.
    if (!empty($_SESSION['staff_access_all_properties']) && !empty($_SESSION['staff_tenant_id'])) {
        return [(int)$_SESSION['staff_tenant_id']];
    }

    // SECURITY (11 Aug 2026): users.id and staff_users.id are independent auto-increment
    // sequences that can collide (confirmed in this DB - id 11 exists as unrelated rows in
    // both tables). This used to query BOTH tables unconditionally for every session, so a
    // staff session could inherit an unrelated users-table row's default_tenant_id, and a
    // tenant/platform-user session could just as easily inherit an unrelated staff account's
    // property/tenant assignment - collision risk in both directions, not just one. Same root
    // cause already fixed once for isPropertyAccessAllowed() (php/security/access_control.php);
    // applying the same discriminator here: staff_users logins always carry session property_id
    // (see the login_user case below), users-table logins never do, so that's what decides
    // which table's id-space $uid actually belongs to - never query both.
    if (isset($_SESSION['property_id'])) {
        // Staff session - resolve tenant via their assigned property only.
        $stmt2 = $pdo->prepare("
            SELECT DISTINCT p.tenant_id
            FROM staff_users su
            JOIN properties p ON p.id = su.property_id
            WHERE su.id = ?
        ");
        $stmt2->execute([$uid]);
        foreach ($stmt2->fetchAll() as $r) {
            if (!empty($r['tenant_id'])) $tenantIds[] = (int)$r['tenant_id'];
        }
    } else {
        // Tenant/platform user session.
        $stmt = $pdo->prepare("SELECT default_tenant_id FROM users WHERE id = ? LIMIT 1");
        $stmt->execute([$uid]);
        $row = $stmt->fetch();
        if ($row && !empty($row['default_tenant_id'])) {
            $tenantIds[] = (int)$row['default_tenant_id'];
        }
    }

    return array_unique(array_filter($tenantIds));
}

// True when the requested tenant is the caller's own tenant (or the caller is a
// platform admin, or the requested tenant owns the currently-resolved property).
function isTenantAccessAllowed(PDO $pdo, $requestedTenantId, int $currentPropertyId = 0): bool {
    // 1. Direct session flag check
    if (!empty($_SESSION['is_platform_admin']) || (($_SESSION['role'] ?? '') === 'root_admin')) return true;

    // 2. DB lookup by user_id (authoritative — handles cases where session flag wasn't written)
    if (isset($_SESSION['user_id'])) {
        $stmt = $pdo->prepare("SELECT is_platform_admin, role FROM users WHERE id = ? LIMIT 1");
        $stmt->execute([$_SESSION['user_id']]);
        $u = $stmt->fetch();
        if ($u && (!empty($u['is_platform_admin']) || strtolower($u['role'] ?? '') === 'root_admin')) {
            $_SESSION['is_platform_admin'] = true;
            return true;
        }
    }

    // 3. DB lookup by username from session (covers partial session restore)
    $sessionUsername = $_SESSION['username'] ?? '';
    if ($sessionUsername) {
        if (strtolower($sessionUsername) === 'platform_admin') {
            $_SESSION['is_platform_admin'] = true;
            return true;
        }
        // Verify against DB for any username present in session
        $stmt = $pdo->prepare("SELECT is_platform_admin, role FROM users WHERE username = ? LIMIT 1");
        $stmt->execute([$sessionUsername]);
        $u = $stmt->fetch();
        if ($u && (!empty($u['is_platform_admin']) || strtolower($u['role'] ?? '') === 'root_admin')) {
            $_SESSION['is_platform_admin'] = true;
            return true;
        }
    }

    // 4. Fallback: X-Admin-Username header (sent by frontend when isPlatformAdmin=true,
    //    covers Vite dev proxy setups where PHP session cookie may not round-trip correctly)
    $headerUsername = $_SERVER['HTTP_X_ADMIN_USERNAME'] ?? '';
    if ($headerUsername) {
        try {
            $stmt = $pdo->prepare("SELECT is_platform_admin, role FROM users WHERE username = ? LIMIT 1");
            $stmt->execute([$headerUsername]);
            $u = $stmt->fetch();
            if ($u && (!empty($u['is_platform_admin']) || strtolower($u['role'] ?? '') === 'root_admin')) {
                return true;
            }
        } catch (Exception $e) {}
    }

    if (!$requestedTenantId) return false;
    $requestedTenantId = (int)$requestedTenantId;
    foreach (resolveCallerTenantIds($pdo) as $tid) {
        if ((int)$tid === $requestedTenantId) return true;
    }
    if ($currentPropertyId) {
        $stmt = $pdo->prepare("SELECT tenant_id FROM properties WHERE id = ? LIMIT 1");
        $stmt->execute([$currentPropertyId]);
        $row = $stmt->fetch();
        if ($row && (int)$row['tenant_id'] === $requestedTenantId) return true;
    }
    return false;
}

// Shared by delete_property AND delete_tenant (12 Aug 2026): wipes everything
// under one property EXCEPT the properties row itself, so delete_tenant can
// call this per-property and then delete the tenant row - properties.tenant_id
// has ON DELETE CASCADE, so removing the tenant removes the property rows (and
// their own FK-linked children: ical_sync_configs, property_licenses,
// property_modules, property_audit_log, property_shared_data,
// license_expiry_notifications) automatically. Everything in $tables below has
// NO foreign key to properties at all, so none of that would be cleaned up by
// any cascade - this is the only thing that ever deletes it. Runs inside the
// caller's own transaction (no begin/commit here) so a multi-property tenant
// delete is all-or-nothing.
function deletePropertyChildData(PDO $pdo, $property_id): void {
    $tables = ['kitchen_orders', 'food_menu', 'kitchen_stock', 'stock_requests', 'stock_requisitions', 'stock_purchases', 'stock_wastage', 'stock_adjustments', 'stock_log', 'inventory_items', 'staff_users', 'staff_roles', 'misc_charges', 'telegram_settings', 'property_modules'];
    foreach ($tables as $table) {
        // Check if table exists before attempting delete
        $checkStmt = $pdo->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?");
        $checkStmt->execute([$table]);
        if ($checkStmt->fetch()) {
            // Table exists, delete from it (will fail if deletion fails)
            $pdo->prepare("DELETE FROM `$table` WHERE property_id = ?")->execute([$property_id]);
        }
    }

    // Only delete active/upcoming guests (present and future bookings) -
    // past bookings/financial ledger records stay intact for historical audits.
    $pdo->prepare("DELETE FROM guests WHERE property_id = ? AND status IN (?, ?)")->execute([$property_id, GUEST_STATUS_ACTIVE_LEGACY, GUEST_STATUS_CHECKED_IN]);
}

// SECURITY (10 Aug 2026, extracted 11 Aug 2026): getCurrentPropertyId() (property_resolver.php)
// resolves purely from the *request's* property_slug/X-Property-Slug header/URL path - it has no
// idea who's asking, so it can't check ownership itself. isPropertyAccessAllowed() closes that
// gap; now lives in security/access_control.php so standalone endpoints outside this router's
// dispatch (e.g. ical_sync.php) can require the same check instead of going unauthenticated.
// (require_once moved up near the top of the file - needed earlier by the
// PUBLIC DEMO MODE block now, so it's already loaded by the time we get here.)

// Log all API requests to Telescope
$request_origin = "{$request_method} /{$action}";
$auth_status = $is_authenticated_user ? 'Authenticated' : 'Unauthenticated';

// Track login attempts specifically
if ($action === 'login_user') {
    $login_username = $_POST['username'] ?? 'unknown';
    $login_status = isset($_POST['password']) && !empty($_POST['password']) ? 'Attempting' : 'No Password Provided';
    TelescopeLogger::log(
        'login',
        'INFO',
        "Login attempt for user: {$login_username}",
        "LoginController [{$login_status}]",
        ['username' => $login_username, 'auth_status' => $auth_status, 'ip' => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1']
    );
}

// Log all API requests
if (!in_array($action, ['get_audit_logs', 'fetch_logs'])) { // Skip verbose get requests
    TelescopeLogger::log(
        'requests',
        'INFO',
        "{$request_method} /api/router.php?action={$action}",
        $request_origin,
        ['user' => $request_user, 'method' => $request_method, 'auth' => $auth_status, 'ip' => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1']
    );
}

$propertyId = getCurrentPropertyId($pdo);
$currentProperty = getCurrentProperty($pdo, $propertyId); // Get the full property details - reuse the ID just resolved above instead of re-running slug resolution

// Actions that operate on a tenant directly (list/create properties under a tenant, check slot
// usage) rather than on "the currently resolved property" - they take tenant_id explicitly and
// already run their own, more precise isTenantAccessAllowed() check inside the case block below.
// Exempted from the property-match gate only (still requires authentication) - found 11 Aug 2026
// while testing the resolveCallerTenantIds() fix: a legitimate tenant admin with no property_slug
// in the request got 403'd by the property gate before ever reaching their own tenant's
// isTenantAccessAllowed() check, since getCurrentPropertyId() falls back to an unrelated default
// property when nothing property-specific was requested.
// save_nav_menu added 11 Aug 2026: nav_menu_items is genuinely global, shared
// across every tenant/property (see the comment on its save handler in
// menu.php) - not scoped to any single property at all. But apiFetch()
// auto-appends property_slug (root_dashboard, from the URL, when saving from
// the Root Admin nav editor) to every request, and root_dashboard isn't a
// real property - so isPropertyAccessAllowed() correctly found no such
// property and 403'd every single save since the property-scope gate above
// was added, even though get_nav_menu (a plain fetch() with no property_slug
// param, so it skips this gate) always worked fine. Confirmed via the Apache
// access log: every POST save_nav_menu request returned 403, going back to
// the gate's original commit - this was never a frontend bug.
$tenant_scope_actions = ['get_tenant_properties', 'get_tenant_slot_usage', 'create_property_for_tenant', 'save_nav_menu', 'export_database_dump'];

// SECURITY (10 Aug 2026): universal property-scope gate. Everything above only ever gated
// *write* actions (POST/PUT/DELETE) - GET reads (guest lists, financial ledger, receipts,
// tenant/property directories, ...) had no authentication check at all, for any action, ever.
// $public_actions is now the single source of truth for "must work with no session" - every
// other action requires a session, and if authenticated, that session must actually be
// authorized for the property $propertyId just resolved to (not just any logged-in session) -
// unless it's a $tenant_scope_actions entry, see above.
if (!in_array($action, $public_actions, true)) {
    if (!$is_authenticated_user) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Authentication required.']);
        exit;
    }
    if (!in_array($action, $tenant_scope_actions, true) && !isPropertyAccessAllowed($pdo, $propertyId)) {
        TelescopeLogger::log(
            'security',
            'WARNING',
            "🔒 Property-scope violation: {$request_user} attempted {$action} on property #{$propertyId} without access",
            "Security Middleware [Property Access Denied]",
            ['action' => $action, 'property_id' => $propertyId, 'user' => $request_user, 'ip' => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1']
        );
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Access denied for this property.']);
        exit;
    }
}

// PHP's default file-based session handler holds an exclusive lock on the
// session file for the entire request. With multiple tabs/windows open on
// the same login, every concurrent request serializes behind whichever one
// is currently running - a single slow request blocks every other tab's
// request, even totally unrelated ones, until it finishes. All session
// reads needed for auth/property resolution are done by this point, and the
// only action that still needs to write session data is login_user, so it's
// safe to release the lock for everything else.
if ($action !== 'login_user') {
    session_write_close();
}

// Actions that belong entirely to food service: kitchen orders, the food menu
// & recipes, and the whole stock/requisitions/kitchen-purchases inventory
// system (php/inventory/inventory.php has no non-food inventory concept).
// A property with the 'kitchen' module disabled gets none of this — enforced
// here so disabling it actually stops the data from being created/read, not
// just hides the nav link.
$kitchen_module_actions = [
    'get_orders', 'create_order', 'update_order_status', 'get_served_logs', 'add_served_log',
    'update_order_item_status', 'update_item_reminder_timestamp', 'check_stale_reminders',
    'get_menu', 'add_menu_item', 'update_menu_item', 'delete_menu_item', 'dedup_menu',
    'get_recipes', 'save_recipe', 'delete_recipe', 'deplete_stock',
    'get_staff_meal_options', 'add_staff_meal_option', 'get_staff_meal_logs', 'add_staff_meal_log',
    'get_inventory', 'update_stock',
    'get_stock_requests', 'create_stock_request', 'update_stock_request_status',
    'get_wastage_logs', 'create_wastage_log',
    'get_kitchen_purchases', 'create_kitchen_purchase', 'bulk_update_kitchen_purchases', 'delete_kitchen_purchase',
    'get_material_categories', 'update_material_category', 'delete_material_category', 'add_material_category',
    'toggle_ingredient_category', 'add_catalog_item', 'update_catalog_item', 'delete_catalog_item',
    'bulk_update_catalog_category', 'seed_catalog', 'fix_orphan_categories',
];
if (in_array($action, $kitchen_module_actions, true)) {
    requireModule($pdo, 'kitchen', $propertyId);
}

switch ($action) {
    // --- CSRF TOKEN ---
    case 'get_csrf_token':
        echo json_encode(['status' => 'success', 'token' => CSRFHandler::getToken()]);
        break;

    // Lets the frontend detect a session it didn't create itself - notably
    // the public-demo auto-login above, which only ever touches $_SESSION,
    // never anything the frontend's own localStorage-based auth state can see.
    case 'check_session':
        if (isset($_SESSION['username'])) {
            // SECURITY/CORRECTNESS (12 Aug 2026): this used to report
            // authenticated:true for ANY existing session, regardless of
            // whether it had access to the property actually in the current
            // URL. PHP session cookies are domain-wide, not property-scoped
            // - e.g. the public-demo auto-login sets a demo_admin session
            // (scoped to the demo property) that stays in the browser after
            // navigating away; visiting a completely different property
            // (tenant-a/property-x) still sends that same cookie, and this
            // blindly said "yes, authenticated" - AuthContext.tsx trusted
            // that at face value and rendered the full app shell, which then
            // failed EVERY property-scoped call with 403s, cascading into
            // the generic "Access Denied" page. Confusing because the
            // session genuinely was valid, just not for this property.
            // $propertyId is 0 on tenant-level pages with no specific
            // property in scope (root_dashboard, a tenant's own dashboard)
            // - that's a legitimate context with nothing to mismatch
            // against, so only enforce this when a property actually IS in
            // scope.
            if ($propertyId && !isPropertyAccessAllowed($pdo, $propertyId)) {
                echo json_encode([
                    'status' => 'success',
                    'authenticated' => false,
                    'session_property_mismatch' => true,
                ]);
                break;
            }
            echo json_encode([
                'status' => 'success',
                'authenticated' => true,
                'is_public_demo_session' => !empty($_SESSION['is_public_demo_session']),
                'user' => [
                    'id' => $_SESSION['user_id'] ?? null,
                    'username' => $_SESSION['username'],
                    'role' => $_SESSION['role'] ?? 'Staff',
                    'property_id' => $_SESSION['property_id'] ?? null,
                ],
            ]);
        } else {
            echo json_encode(['status' => 'success', 'authenticated' => false]);
        }
        break;

    // --- UNIFIED LOGIN ---
    case 'login_user':
        // Brute-force protection: 5 attempts / 5 minutes per client (IP + User-Agent
        // hash), independent of which username/mobile number is being tried so an
        // attacker can't dodge the limit by cycling identifiers. checkAndBlock()
        // itself responds 429 and exits if this client is already locked out, and
        // records this attempt either way; resetAttempts() below clears it on any
        // successful login so legitimate users never get penalized for a mistyped
        // passcode followed by the correct one.
        $rateLimiter = new RateLimiter($pdo);
        $rateLimitClientId = RateLimiter::getClientIdentifier();
        $rateLimiter->checkAndBlock($rateLimitClientId, 'login_user');

        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $rawIdentifier = trim($input['mobile_number'] ?? $input['username'] ?? $input['phone_number'] ?? '');
        $passcode = trim($input['passcode'] ?? $input['password'] ?? '');

        if (!$rawIdentifier || !$passcode) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Mobile number and 6-digit passcode required']);
            exit;
        }

        // Defensive Column Check & Migration on local MySQL
        if (!isSchemaVerified('schema_login_tables')) {
            try {
                $stmt = $pdo->query("SHOW TABLES LIKE 'users'");
                if ($stmt->rowCount() > 0) {
                    $cols = $pdo->query("SHOW COLUMNS FROM users")->fetchAll(PDO::FETCH_COLUMN);
                    if (!in_array('phone_number', $cols)) {
                        $pdo->exec("ALTER TABLE users ADD COLUMN `phone_number` VARCHAR(50) DEFAULT NULL");
                    }
                    if (!in_array('passcode', $cols)) {
                        $pdo->exec("ALTER TABLE users ADD COLUMN `passcode` VARCHAR(50) DEFAULT NULL");
                    }
                    if (!in_array('full_name', $cols)) {
                        $pdo->exec("ALTER TABLE users ADD COLUMN `full_name` VARCHAR(255) DEFAULT NULL AFTER `username`");
                    }
                    if (!in_array('must_change_passcode', $cols)) {
                        $pdo->exec("ALTER TABLE users ADD COLUMN `must_change_passcode` TINYINT(1) NOT NULL DEFAULT 0");
                    }
                }
                $stmt = $pdo->query("SHOW TABLES LIKE 'staff_users'");
                if ($stmt->rowCount() > 0) {
                    $cols = $pdo->query("SHOW COLUMNS FROM staff_users")->fetchAll(PDO::FETCH_COLUMN);
                    if (!in_array('phone_number', $cols)) {
                        $pdo->exec("ALTER TABLE staff_users ADD COLUMN `phone_number` VARCHAR(50) DEFAULT NULL");
                    }
                    if (!in_array('passcode', $cols)) {
                        $pdo->exec("ALTER TABLE staff_users ADD COLUMN `passcode` VARCHAR(50) DEFAULT '123456'");
                    }
                }
            } catch (Exception $e) {}
            markSchemaVerified('schema_login_tables');
        }

        $cleanDigits = preg_replace('/\D/', '', $rawIdentifier);
        $mobileNumber = strlen($cleanDigits) >= 10 ? substr($cleanDigits, -10) : $cleanDigits;

        // SECURITY (11 Aug 2026): a non-numeric identifier (e.g. a username with no digits at
        // all) makes $mobileNumber an empty string, which used to still get bound into the LIKE
        // clause below as '%' . '' = '%' - matching ANY row with a non-null phone_number instead
        // of failing to match, so a username-style login attempt could land on an arbitrary
        // unrelated account (real passcode still required, but wrong-account risk either way).
        // Only include the phone-matching clause/params at all when there's an actual digit
        // string to match against.
        $hasPhoneCandidate = $mobileNumber !== '';

        try {
            // 1. Search in users table (Platform & Tenant Admins)
            if ($hasPhoneCandidate) {
                $stmt = $pdo->prepare("
                    SELECT id, username, full_name, phone_number, password, passcode, role, is_platform_admin, default_tenant_id, must_change_passcode
                    FROM users
                    WHERE username = ? OR phone_number = ? OR username = ? OR (phone_number IS NOT NULL AND phone_number LIKE ?)
                    LIMIT 1
                ");
                $stmt->execute([$rawIdentifier, $rawIdentifier, $mobileNumber, '%' . $mobileNumber]);
            } else {
                $stmt = $pdo->prepare("
                    SELECT id, username, full_name, phone_number, password, passcode, role, is_platform_admin, default_tenant_id, must_change_passcode
                    FROM users
                    WHERE username = ?
                    LIMIT 1
                ");
                $stmt->execute([$rawIdentifier]);
            }
            $user = $stmt->fetch();

            if ($user) {
                $storedPasscode = $user['passcode'] ?? '';
                $storedPassword = $user['password'] ?? '';

                // SECURITY (10 Aug 2026): removed "|| $passcode === '123456'" - that clause was a
                // permanent universal skeleton key for every account, forever, even after the real
                // passcode was changed. It was also redundant for its only legitimate purpose (new
                // accounts default to a real stored passcode of '123456', already covered by the
                // first clause below) - so removing it is a pure security fix, not a behavior change
                // for first-login.
                $isPasscodeValid = ($storedPasscode && $storedPasscode === $passcode) ||
                                   ($storedPassword && password_verify($passcode, $storedPassword)) ||
                                   ($storedPassword && $storedPassword === $passcode);

                if ($isPasscodeValid) {
                    $is_platform_admin = (bool)($user['is_platform_admin'] ?? false);
                    $has_default_tenant = !empty($user['default_tenant_id']);

                    $role = $user['role'];
                    if ($is_platform_admin) {
                        $role = 'root_admin';
                    } elseif ($has_default_tenant) {
                        $role = 'super_admin';
                    }

                    $_SESSION['user_id'] = $user['id'];
                    $_SESSION['username'] = $user['username'];
                    $_SESSION['role'] = $role;
                    $_SESSION['is_platform_admin'] = $is_platform_admin;
                    $_SESSION['default_tenant_id'] = $user['default_tenant_id'] ?? null;

                    setcookie('artists_farm_session', session_id(), time() + 86400 * 7, '/', '', false, true);
                    $rateLimiter->resetAttempts($rateLimitClientId, 'login_user');

                    TelescopeLogger::log(
                        'login',
                        'SUCCESS',
                        "Staff User {$user['username']} logged into system",
                        "Login Controller [Success]",
                        ['username' => $user['username'], 'role' => $role, 'ip' => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1', 'status' => 'Success']
                    );
                    try {
                        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
                        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                        $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (property_id, action, timestamp, user, ip_address, user_agent, status, module) VALUES (?, ?, NOW(), ?, ?, ?, 'Success', 'login')");
                        $stmtAudit->execute([1, "Staff User {$user['username']} logged into system", $user['username'], $ip, $ua]);
                    } catch (Exception $ea) {}

                    echo json_encode([
                        'success' => true,
                        'message' => 'Login successful',
                        'user' => [
                            'id' => $user['id'],
                            'username' => $user['username'],
                            'name' => $user['full_name'] ?: $user['username'],
                            'role' => $role,
                            'is_platform_admin' => $is_platform_admin,
                            'default_tenant_id' => $user['default_tenant_id'] ?? null,
                            'must_change_passcode' => (bool)($user['must_change_passcode'] ?? false),
                        ]
                    ]);
                    exit;
                }
            }

            // 2. Search in staff_users table
            if ($hasPhoneCandidate) {
                $stmt = $pdo->prepare("
                    SELECT id, username, phone_number, full_name, role, passcode, property_id, access_all_properties
                    FROM staff_users
                    WHERE (username = ? OR phone_number = ? OR username = ? OR (phone_number IS NOT NULL AND phone_number LIKE ?)) AND status = 'Active'
                    LIMIT 1
                ");
                $stmt->execute([$rawIdentifier, $rawIdentifier, $mobileNumber, '%' . $mobileNumber]);
            } else {
                $stmt = $pdo->prepare("
                    SELECT id, username, phone_number, full_name, role, passcode, property_id, access_all_properties
                    FROM staff_users
                    WHERE username = ? AND status = 'Active'
                    LIMIT 1
                ");
                $stmt->execute([$rawIdentifier]);
            }
            $staff = $stmt->fetch();

            if ($staff) {
                // SECURITY (10 Aug 2026): same fix as the users-table check above - staff without
                // a passcode already default to '123456' on the line above, so that alone covers
                // first-login. The removed "|| $passcode === '123456'" was a standing skeleton key
                // for every staff account regardless of their actual set passcode.
                $storedPasscode = $staff['passcode'] ?? '123456';
                if ($storedPasscode === $passcode) {
                    // "Access All Properties" staff (11 Aug 2026): don't lock the session to
                    // this one row's property_id - that's exactly the bug this feature fixes
                    // (LIMIT 1 above can fetch any of a multi-property staff's rows, so picking
                    // THIS row's property_id would be arbitrary). Instead resolve their tenant
                    // once (any of their rows works - staff can never span tenants, enforced at
                    // the point access_all_properties gets turned on) and let them choose which
                    // property to enter from a picker; isPropertyAccessAllowed() then permits
                    // any property under that tenant, not just one.
                    if (!empty($staff['access_all_properties'])) {
                        $tenantStmt = $pdo->prepare("
                            SELECT p.tenant_id, t.slug as tenant_slug
                            FROM properties p
                            JOIN tenants t ON t.id = p.tenant_id
                            WHERE p.id = ?
                            LIMIT 1
                        ");
                        $tenantStmt->execute([$staff['property_id']]);
                        $tenantRow = $tenantStmt->fetch();

                        $_SESSION['user_id'] = $staff['id'];
                        $_SESSION['username'] = $staff['username'];
                        $_SESSION['role'] = $staff['role'] ?: 'Staff';
                        $_SESSION['staff_access_all_properties'] = true;
                        $_SESSION['staff_tenant_id'] = $tenantRow['tenant_id'] ?? null;
                        // Deliberately NOT setting $_SESSION['property_id'] here -
                        // isPropertyAccessAllowed() (access_control.php) sets it as a
                        // side effect once they actually navigate into a property.

                        setcookie('artists_farm_session', session_id(), time() + 86400 * 7, '/', '', false, true);
                        $rateLimiter->resetAttempts($rateLimitClientId, 'login_user');

                        echo json_encode([
                            'success' => true,
                            'message' => 'Login successful',
                            'user' => [
                                'id' => $staff['id'],
                                'username' => $staff['username'],
                                'name' => $staff['full_name'] ?: $staff['username'],
                                'role' => $staff['role'] ?: 'Staff',
                                'is_platform_admin' => false,
                                'default_tenant_id' => null,
                                'must_change_passcode' => false,
                                'access_all_properties' => true,
                                'tenant_id' => $tenantRow['tenant_id'] ?? null,
                                'tenant_slug' => $tenantRow['tenant_slug'] ?? null,
                            ]
                        ]);
                        exit;
                    }

                    $_SESSION['user_id'] = $staff['id'];
                    $_SESSION['username'] = $staff['username'];
                    $_SESSION['role'] = $staff['role'] ?: 'Staff';
                    $_SESSION['property_id'] = $staff['property_id'];

                    setcookie('artists_farm_session', session_id(), time() + 86400 * 7, '/', '', false, true);
                    $rateLimiter->resetAttempts($rateLimitClientId, 'login_user');

                    echo json_encode([
                        'success' => true,
                        'message' => 'Login successful',
                        'user' => [
                            'id' => $staff['id'],
                            'username' => $staff['username'],
                            'name' => $staff['full_name'] ?: $staff['username'],
                            'role' => $staff['role'] ?: 'Staff',
                            'is_platform_admin' => false,
                            'default_tenant_id' => null,
                            'must_change_passcode' => false,
                        ]
                    ]);
                    exit;
                }
            }

            // 3. Emergency admin fallback (last-resort root login when all real accounts are inaccessible)
            $emergencyPassword = getenv('EMERGENCY_ADMIN_PASSWORD');
            if (!empty($emergencyPassword) && $passcode === $emergencyPassword) {
                $_SESSION['user_id'] = 1;
                $_SESSION['username'] = $rawIdentifier ?: 'admin';
                $_SESSION['role'] = 'root_admin';
                $_SESSION['is_platform_admin'] = true;

                setcookie('artists_farm_session', session_id(), time() + 86400 * 7, '/', '', false, true);
                $rateLimiter->resetAttempts($rateLimitClientId, 'login_user');

                echo json_encode([
                    'success' => true,
                    'message' => 'Emergency admin login successful',
                    'user' => [
                        'id' => 1,
                        'username' => $rawIdentifier ?: 'admin',
                        'role' => 'root_admin',
                        'is_platform_admin' => true,
                        'default_tenant_id' => null,
                        'must_change_passcode' => false,
                    ]
                ]);
                exit;
            }

            http_response_code(401);
            TelescopeLogger::log(
                'login',
                'WARNING',
                "Staff User {$rawIdentifier} failed login attempt",
                "Login Controller [Failed]",
                ['identifier' => $rawIdentifier, 'ip' => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1', 'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown', 'status' => 'Failed']
            );
            try {
                $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
                $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (property_id, action, timestamp, user, ip_address, user_agent, status, module) VALUES (?, ?, NOW(), ?, ?, ?, 'Failed', 'login')");
                $stmtAudit->execute([1, "Staff User {$rawIdentifier} failed login attempt", $rawIdentifier, $ip, $ua]);
            } catch (Exception $ea) {}

            echo json_encode(['success' => false, 'message' => 'Invalid mobile number/username or 6-digit passcode']);
        } catch (Exception $e) {
            http_response_code(500);
            TelescopeLogger::log(
                'login',
                'ERROR',
                "Login error for {$rawIdentifier}: " . $e->getMessage(),
                "Login Controller [Exception]",
                ['identifier' => $rawIdentifier, 'ip' => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1']
            );
            echo json_encode(['success' => false, 'message' => 'Login error: ' . $e->getMessage()]);
        }
        exit;

    // First-login mandatory passcode change (see must_change_passcode on the
    // users/staff_users tables, set when an account is created with a
    // temporary passcode - e.g. new tenant welcome emails). Requires the
    // caller to prove they know the CURRENT passcode, same as any password
    // change - it's not gated behind session auth alone since force_set_passcode
    // is called mid-login, before a full session may exist for the property.
    case 'force_set_passcode':
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $identifier = trim($input['username'] ?? '');
        $currentPasscode = trim($input['current_passcode'] ?? '');
        $newPasscode = trim($input['new_passcode'] ?? '');

        if (!$identifier || !$currentPasscode || !$newPasscode) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Username, current passcode, and new passcode are required']);
            exit;
        }
        if (!preg_match('/^\d{6}$/', $newPasscode)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'New passcode must be exactly 6 digits']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("SELECT id, passcode FROM users WHERE username = ? LIMIT 1");
            $stmt->execute([$identifier]);
            $user = $stmt->fetch();

            if ($user && ($user['passcode'] ?? '') === $currentPasscode) {
                $pdo->prepare("UPDATE users SET passcode = ?, must_change_passcode = 0 WHERE id = ?")
                    ->execute([$newPasscode, $user['id']]);
                echo json_encode(['success' => true, 'message' => 'Passcode updated successfully']);
                exit;
            }

            $stmt = $pdo->prepare("SELECT id, passcode FROM staff_users WHERE username = ? LIMIT 1");
            $stmt->execute([$identifier]);
            $staff = $stmt->fetch();

            if ($staff && ($staff['passcode'] ?? '') === $currentPasscode) {
                $pdo->prepare("UPDATE staff_users SET passcode = ? WHERE id = ?")
                    ->execute([$newPasscode, $staff['id']]);
                echo json_encode(['success' => true, 'message' => 'Passcode updated successfully']);
                exit;
            }

            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Current passcode is incorrect']);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    // "Forgot Password?" on the login page. Passcodes are stored in plaintext
    // throughout this app (see force_set_passcode above), so this isn't a
    // reset-link flow - it just emails the tenant their current username +
    // passcode, same info root admin can already see via get_tenant_credentials.
    // Scoped to tenant logins only (users.default_tenant_id), since that's
    // the only place we have an email address on file at all.
    case 'request_login_info':
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $identifier = trim($input['username'] ?? '');
        if (!$identifier) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Enter your mobile number / username first']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("
                SELECT u.username, u.passcode, u.full_name, t.email AS tenant_email, t.name AS tenant_name
                FROM users u
                LEFT JOIN tenants t ON u.default_tenant_id = t.id
                WHERE u.username = ? AND (u.is_platform_admin = 0 OR u.is_platform_admin IS NULL)
                LIMIT 1
            ");
            $stmt->execute([$identifier]);
            $user = $stmt->fetch();

            if (!$user) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'No account found for that mobile number / username']);
                exit;
            }
            if (empty($user['tenant_email'])) {
                echo json_encode(['success' => false, 'message' => 'No email is on file for this account. Contact your platform admin to have one added.']);
                exit;
            }

            $loginUrl = trim($input['login_url'] ?? '') ?: '/';
            $displayName = $user['tenant_name'] ?: ($user['full_name'] ?: 'there');
            $body = "<p>Hi {$displayName},</p>"
                . "<p>Here are your Artists Farm login details:</p>"
                . "<p><b>Mobile Number / Username:</b> {$user['username']}<br>"
                . "<b>Passcode:</b> {$user['passcode']}</p>"
                . "<p><a href=\"{$loginUrl}\">Log in here</a></p>"
                . "<p style=\"color:#888;font-size:12px;\">Didn't request this? You can safely ignore this email.</p>";

            $emailResult = sendSmtpEmail($pdo, $user['tenant_email'], 'Your Artists Farm login details', $body);
            echo json_encode([
                'success' => $emailResult['success'],
                'message' => $emailResult['success']
                    ? 'Login info sent to your email'
                    : ('Could not send email: ' . $emailResult['error']),
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    // --- ROOT ADMIN ACCOUNT SETTINGS ---
    // Returns the root admin's own profile (username, full name, phone, email,
    // GSTIN) so the Root Admin Dashboard "Account Settings" section can display
    // and edit it. Root admin only.
    case 'get_platform_admin_profile':
        if (!($_SESSION['is_platform_admin'] ?? false)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Root admin access required']);
            exit;
        }
        $profileUserId = $_SESSION['user_id'] ?? 0;
        if (!$profileUserId) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'No authenticated user session']);
            exit;
        }
        try {
            $stmt = $pdo->prepare("SELECT id, username, full_name, phone_number, email, gstin FROM users WHERE id = ? LIMIT 1");
            $stmt->execute([$profileUserId]);
            $profile = $stmt->fetch();
            // Legacy fallback logins (e.g. "admin"/"123456") set session user_id=1
            // even when no users row has that id - resolve to the actual platform
            // admin row in that case.
            if (!$profile) {
                $stmt = $pdo->query("SELECT id, username, full_name, phone_number, email, gstin FROM users WHERE is_platform_admin = 1 ORDER BY id ASC LIMIT 1");
                $profile = $stmt->fetch();
            }
            if (!$profile) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Platform admin account not found']);
                exit;
            }
            echo json_encode(['success' => true, 'data' => $profile]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    // Root admin edits their own account: username, full name, phone, email,
    // GSTIN and (optionally) passcode. Changing the passcode requires proving
    // the current one. Root admin only.
    case 'update_platform_admin_profile':
        if (!($_SESSION['is_platform_admin'] ?? false)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Root admin access required']);
            exit;
        }
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $profileUserId = $_SESSION['user_id'] ?? 0;
        if (!$profileUserId) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'No authenticated user session']);
            exit;
        }

        $newUsername = trim($input['username'] ?? '');
        $newFullName = trim($input['full_name'] ?? '');
        $newEmail = trim($input['email'] ?? '');
        $newGstin = strtoupper(trim($input['gstin'] ?? ''));
        $currentPasscode = trim($input['current_passcode'] ?? '');
        $newPasscode = trim($input['new_passcode'] ?? '');

        if (!$newUsername) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Username is required']);
            exit;
        }
        // SECURITY/CONSISTENCY (12 Aug 2026): username and phone_number used to
        // be two independently-settable fields on this one endpoint, unlike
        // every other account type in the app (staff/tenant users log in with
        // a single "Phone Number (Login Username)" field - see
        // StaffManagement.tsx) - a root admin could end up with a username
        // that didn't match their own phone number and therefore couldn't be
        // typed into the numeric-only login field at all. phone_number is no
        // longer accepted as a separate input - it always mirrors username,
        // enforced here rather than trusting the frontend to keep them in
        // sync, and username must be a 10-digit number for the same reason.
        if (!preg_match('/^\d{10}$/', $newUsername)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Username must be your 10-digit phone number']);
            exit;
        }
        $newPhoneNumber = $newUsername;
        if ($newEmail && !filter_var($newEmail, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid email address']);
            exit;
        }
        if ($newGstin && !preg_match('/^[0-9A-Z]{15}$/', $newGstin)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'GSTIN must be 15 alphanumeric characters (e.g. 27ABCDE1234F1Z5)']);
            exit;
        }
        if ($newPasscode && !preg_match('/^\d{6}$/', $newPasscode)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'New passcode must be exactly 6 digits']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("SELECT username, passcode, password FROM users WHERE id = ? LIMIT 1");
            $stmt->execute([$profileUserId]);
            $profileUser = $stmt->fetch();
            // Same legacy-fallback-login handling as get_platform_admin_profile:
            // resolve to the actual platform admin row when the session user_id
            // points at a row that doesn't exist.
            if (!$profileUser) {
                $stmt = $pdo->query("SELECT id, username, passcode, password FROM users WHERE is_platform_admin = 1 ORDER BY id ASC LIMIT 1");
                $profileUser = $stmt->fetch();
                $profileUserId = $profileUser['id'] ?? 0;
            }
            if (!$profileUser) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Platform admin account not found']);
                exit;
            }

            // Username must stay unique across all platform/tenant users.
            $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1");
            $stmt->execute([$newUsername, $profileUserId]);
            if ($stmt->fetch()) {
                http_response_code(409);
                echo json_encode(['success' => false, 'message' => 'That username is already taken by another account']);
                exit;
            }

            $fields = 'username = ?, full_name = ?, phone_number = ?, email = ?, gstin = ?';
            $params = [$newUsername, $newFullName ?: null, $newPhoneNumber ?: null, $newEmail ?: null, $newGstin ?: null];

            if ($newPasscode) {
                $storedPasscode = $profileUser['passcode'] ?? '';
                $storedPassword = $profileUser['password'] ?? '';
                $currentValid = ($storedPasscode && $storedPasscode === $currentPasscode)
                    || ($storedPassword && password_verify($currentPasscode, $storedPassword))
                    || ($storedPassword && $storedPassword === $currentPasscode);
                if (!$currentValid) {
                    http_response_code(401);
                    echo json_encode(['success' => false, 'message' => 'Current passcode is incorrect']);
                    exit;
                }
                $fields .= ', passcode = ?, must_change_passcode = 0';
                $params[] = $newPasscode;
            }

            $params[] = $profileUserId;
            $pdo->prepare("UPDATE users SET {$fields} WHERE id = ?")->execute($params);

            // Keep the session username in sync so the header/sidebar reflect the change immediately.
            if ($newUsername !== ($profileUser['username'] ?? '')) {
                $_SESSION['username'] = $newUsername;
            }

            echo json_encode([
                'success' => true,
                'message' => $newPasscode ? 'Account details and passcode updated' : 'Account details updated',
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    // --- PLATFORM ADMIN ENDPOINTS ---
    case 'create_tenant':
        $input = json_decode(file_get_contents('php://input'), true);
        $name = $input['name'] ?? '';
        $slug = $input['slug'] ?? '';
        $email = $input['email'] ?? '';
        $phone = $input['phone'] ?? '';
        // Frontend passes window.location.origin + '/artists_farm/' so the
        // welcome message links back to wherever this instance is actually
        // hosted, rather than us guessing from server headers.
        $loginUrl = $input['login_url'] ?? '/artists_farm/';

        if (!$name || !$slug) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'name and slug are required']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("
                INSERT INTO tenants (name, slug, email, phone, subscription_plan, subscription_status, max_properties, is_active)
                VALUES (?, ?, ?, ?, 'free', 'trial', 1, 1)
            ");
            $stmt->execute([$name, $slug, $email ?: null, $phone ?: null]);
            $tenant_id = $pdo->lastInsertId();

            $response = ['success' => true, 'message' => 'Tenant created successfully', 'tenant_id' => $tenant_id];

            // Auto-create the tenant's own super_admin login, same phone +
            // 6-digit-passcode convention as everywhere else in the app -
            // without this, a newly created tenant has no way to log in at
            // all until someone manually creates a users row for them.
            $phoneDigits = preg_replace('/\D/', '', $phone);
            $phoneDigits = strlen($phoneDigits) >= 10 ? substr($phoneDigits, -10) : $phoneDigits;

            if (strlen($phoneDigits) === 10) {
                $existing = $pdo->prepare("SELECT id FROM users WHERE username = ? LIMIT 1");
                $existing->execute([$phoneDigits]);

                if (!$existing->fetch()) {
                    $tempPasscode = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);

                    $pdo->prepare("
                        INSERT INTO users (username, full_name, phone_number, passcode, role, is_platform_admin, default_tenant_id, must_change_passcode)
                        VALUES (?, ?, ?, ?, 'super_admin', 0, ?, 1)
                    ")->execute([$phoneDigits, $name, $phoneDigits, $tempPasscode, $tenant_id]);

                    $renderedMessage = renderTenantWelcomeTemplate(getTenantWelcomeTemplate($pdo), [
                        'tenant_name' => $name,
                        'login_url' => $loginUrl,
                        'username' => $phoneDigits,
                        'temp_passcode' => $tempPasscode,
                    ]);

                    $response['login_credentials'] = [
                        'username' => $phoneDigits,
                        'temp_passcode' => $tempPasscode,
                        'login_url' => $loginUrl,
                    ];
                    $response['rendered_message'] = $renderedMessage;
                    $response['whatsapp_phone'] = $phoneDigits;

                    if ($email) {
                        $emailResult = sendSmtpEmail($pdo, $email, "Welcome to Artists Farm, {$name}!", nl2br(htmlspecialchars($renderedMessage)));
                        $response['email_sent'] = $emailResult['success'];
                        $response['email_error'] = $emailResult['success'] ? null : $emailResult['error'];
                    } else {
                        $response['email_sent'] = false;
                        $response['email_error'] = 'No email address provided for this tenant.';
                    }
                } else {
                    $response['login_note'] = "A login account with username {$phoneDigits} already exists - skipped creating a duplicate.";
                }
            } else {
                $response['login_note'] = 'No valid 10-digit phone number provided - skipped creating a login account. Add one later via Root Admin.';
            }

            echo json_encode($response);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    // Root Admin "Send Test Email" button - tries connecting/sending with the
    // form's current values directly, so an admin can verify SMTP credentials
    // work before committing them to system_settings.
    case 'send_test_email':
        $isRootAdminForTest = (isset($_SESSION['role']) && $_SESSION['role'] === 'root_admin')
            || (isset($_SERVER['HTTP_X_USER_ROLE']) && $_SERVER['HTTP_X_USER_ROLE'] === 'root_admin');
        if (!$isRootAdminForTest) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Only root administrators can test email settings']);
            exit;
        }
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $to = trim($input['to'] ?? '');
        if (!$to) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Recipient email is required']);
            exit;
        }
        $overrideSettings = [
            'host' => $input['smtp_host'] ?? '',
            'port' => (int)($input['smtp_port'] ?? 587),
            'username' => $input['smtp_username'] ?? '',
            'password' => $input['smtp_password'] ?? '',
            'from_email' => $input['smtp_from_email'] ?? '',
            'from_name' => $input['smtp_from_name'] ?? 'Artists Farm',
            'encryption' => $input['smtp_encryption'] ?? 'tls',
        ];
        $result = sendSmtpEmail($pdo, $to, 'Artists Farm - SMTP Test', '<p>This is a test email from your Artists Farm Root Admin dashboard. If you received this, SMTP is configured correctly.</p>', $overrideSettings);
        echo json_encode(['success' => $result['success'], 'message' => $result['success'] ? 'Test email sent successfully' : $result['error']]);
        exit;

    case 'get_all_tenants':
        // The whole tenant directory (emails, phones, subscription plans, slot usage)
        // is root-admin-only - it is never needed by a tenant or unauthenticated caller.
        if (!($_SESSION['is_platform_admin'] ?? false)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Root admin access required']);
            exit;
        }
        try {
            $stmt = $pdo->query("
                SELECT t.*,
                (SELECT COALESCE(SUM(
                    CASE
                        WHEN p.property_type = 'MULTI_KEY' THEN
                            (SELECT COUNT(*) FROM properties r WHERE r.parent_property_id = p.id AND r.property_type = 'MULTI_KEY_ROOM' AND r.is_deleted = 0)
                        ELSE 1
                    END
                ), 0) FROM properties p WHERE p.tenant_id = t.id AND (p.property_type IS NULL OR p.property_type != 'MULTI_KEY_ROOM') AND p.is_active = 1) AS slots_used
                FROM tenants t 
                ORDER BY t.name ASC
            ");
            $tenants = $stmt->fetchAll();
            echo json_encode(['success' => true, 'data' => $tenants]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    // Root-admin-only: reveal a tenant's current login credentials (username +
    // passcode). Passcodes are stored in plaintext throughout this app (same
    // as staff_users), so this is a straightforward lookup, not a decrypt -
    // it works identically whether the tenant is still on the temp passcode
    // from create_tenant or has since changed it themselves.
    case 'get_tenant_credentials':
        if (!($_SESSION['is_platform_admin'] ?? false)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Root admin access required']);
            exit;
        }
        $tenant_id = $_GET['tenant_id'] ?? '';
        if (!$tenant_id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'tenant_id required']);
            exit;
        }
        try {
            $stmt = $pdo->prepare("
                SELECT username, passcode, must_change_passcode
                FROM users
                WHERE default_tenant_id = ? AND (is_platform_admin = 0 OR is_platform_admin IS NULL)
                ORDER BY id ASC LIMIT 1
            ");
            $stmt->execute([$tenant_id]);
            $user = $stmt->fetch();
            if (!$user) {
                echo json_encode(['success' => false, 'message' => 'No login found for this tenant yet']);
                exit;
            }
            echo json_encode(['success' => true, 'data' => $user]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    // Root-admin-only: create a login for a tenant that doesn't have one yet
    // (12 Aug 2026) - create_tenant already auto-creates one for brand-new
    // tenants with a valid 10-digit phone on file, but tenants created
    // before that logic existed, or without a valid phone at the time, were
    // left with no way to log in at all and no way to fix it short of a
    // direct DB insert. Same convention as create_tenant's own auto-login:
    // username = the tenant's phone number, random 6-digit temp passcode,
    // must_change_passcode so they're forced to set their own on first use.
    case 'create_tenant_login':
        if (!($_SESSION['is_platform_admin'] ?? false)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Root admin access required']);
            exit;
        }
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $tenant_id = $input['tenant_id'] ?? '';
        if (!$tenant_id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'tenant_id required']);
            exit;
        }
        try {
            $tStmt = $pdo->prepare("SELECT id, name, phone FROM tenants WHERE id = ? LIMIT 1");
            $tStmt->execute([$tenant_id]);
            $tenant = $tStmt->fetch();
            if (!$tenant) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Tenant not found']);
                exit;
            }

            // Don't silently create a second login if one already exists -
            // the "no login" state this button responds to should already
            // rule this out, but re-check server-side rather than trust it.
            $existingStmt = $pdo->prepare("
                SELECT id FROM users WHERE default_tenant_id = ? AND (is_platform_admin = 0 OR is_platform_admin IS NULL) LIMIT 1
            ");
            $existingStmt->execute([$tenant_id]);
            if ($existingStmt->fetch()) {
                http_response_code(409);
                echo json_encode(['success' => false, 'message' => 'This tenant already has a login']);
                exit;
            }

            $phoneDigits = preg_replace('/\D/', '', $tenant['phone'] ?? '');
            $phoneDigits = strlen($phoneDigits) >= 10 ? substr($phoneDigits, -10) : $phoneDigits;
            if (strlen($phoneDigits) !== 10) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'This tenant has no valid 10-digit phone number on file - add one first via Edit Tenant, then try again.']);
                exit;
            }

            $usernameTaken = $pdo->prepare("SELECT id FROM users WHERE username = ? LIMIT 1");
            $usernameTaken->execute([$phoneDigits]);
            if ($usernameTaken->fetch()) {
                http_response_code(409);
                echo json_encode(['success' => false, 'message' => "A login with username {$phoneDigits} already exists on a different account - change this tenant's phone number first."]);
                exit;
            }

            $tempPasscode = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $pdo->prepare("
                INSERT INTO users (username, full_name, phone_number, passcode, role, is_platform_admin, default_tenant_id, must_change_passcode)
                VALUES (?, ?, ?, ?, 'super_admin', 0, ?, 1)
            ")->execute([$phoneDigits, $tenant['name'], $phoneDigits, $tempPasscode, $tenant_id]);

            echo json_encode([
                'success' => true,
                'message' => 'Login created successfully',
                'data' => [
                    'username' => $phoneDigits,
                    'passcode' => $tempPasscode,
                    'must_change_passcode' => 1,
                ],
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    // Root-admin-side password reset for a tenant that already has a login -
    // the counterpart to create_tenant_login above (which only fires for
    // tenants with NO login yet). Covers the case the tenant's own
    // self-service "Forgot Password?" flow (request_login_info) can't: it
    // emails the CURRENT passcode to the tenant's email on file, so it's a
    // dead end when that tenant has no email configured, or the admin just
    // wants to hand them a fresh passcode directly. Same shape as
    // create_tenant_login's success response (a temp passcode,
    // must_change_passcode forced back on) so the frontend can reuse the
    // exact same "reveal/copy" credentials UI for both.
    case 'reset_tenant_login':
        if (!($_SESSION['is_platform_admin'] ?? false)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Root admin access required']);
            exit;
        }
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $tenant_id = $input['tenant_id'] ?? '';
        if (!$tenant_id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'tenant_id required']);
            exit;
        }
        try {
            $existingStmt = $pdo->prepare("
                SELECT id, username FROM users WHERE default_tenant_id = ? AND (is_platform_admin = 0 OR is_platform_admin IS NULL) LIMIT 1
            ");
            $existingStmt->execute([$tenant_id]);
            $existing = $existingStmt->fetch();
            if (!$existing) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'This tenant has no login yet - use Create Login instead']);
                exit;
            }

            $tempPasscode = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $pdo->prepare("UPDATE users SET passcode = ?, must_change_passcode = 1 WHERE id = ?")
                ->execute([$tempPasscode, $existing['id']]);

            echo json_encode([
                'success' => true,
                'message' => 'Passcode reset successfully',
                'data' => [
                    'username' => $existing['username'],
                    'passcode' => $tempPasscode,
                    'must_change_passcode' => 1,
                ],
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'get_all_properties':
        // Every property across every tenant (addresses, phones, GSTINs, contacts)
        // is root-admin-only - the tenant views only their own via get_tenant_properties.
        if (!($_SESSION['is_platform_admin'] ?? false)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Root admin access required']);
            exit;
        }
        try {
            $stmt = $pdo->query("SELECT * FROM properties ORDER BY name ASC");
            $properties = $stmt->fetchAll();
            echo json_encode(['success' => true, 'data' => $properties]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'get_tenant_properties':
        $tenant_id = $_GET['tenant_id'] ?? '';
        if (!$tenant_id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'tenant_id required']);
            exit;
        }
        // Tenants may only list their own properties (root admins may list any).
        if (!isTenantAccessAllowed($pdo, $tenant_id, $propertyId)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Access denied']);
            exit;
        }
        try {
            // Return only top-level properties (not MULTI_KEY_ROOM sub-rooms), include room count
            $stmt = $pdo->prepare("
                SELECT p.*,
                    (SELECT COUNT(*) FROM properties r WHERE r.parent_property_id = p.id AND r.property_type = 'MULTI_KEY_ROOM' AND r.is_deleted = 0) as room_count
                FROM properties p
                WHERE p.tenant_id = ? AND (p.property_type IS NULL OR p.property_type != 'MULTI_KEY_ROOM')
                ORDER BY p.name ASC
            ");
            $stmt->execute([$tenant_id]);
            $properties = $stmt->fetchAll();
            echo json_encode(['success' => true, 'data' => $properties]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'get_tenant_by_slug':
        $slug = strtolower(trim($_GET['slug'] ?? ''));
        if (!$slug) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'slug required']);
            exit;
        }
        try {
            $stmt = $pdo->prepare("
                SELECT id, name, slug, max_properties, subscription_plan, subscription_status, is_active
                FROM tenants
                WHERE (slug = ? OR REPLACE(slug, '_', '-') = ? OR REPLACE(slug, '-', '_') = ?)
                  AND is_active = 1
                LIMIT 1
            ");
            $stmt->execute([$slug, $slug, $slug]);
            $tenant = $stmt->fetch();
            if ($tenant) {
                echo json_encode(['success' => true, 'data' => $tenant]);
            } else {
                echo json_encode(['success' => false, 'message' => 'Tenant not found']);
            }
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    // See the PUBLIC DEMO MODE comment near the top of this file - the
    // frontend takes these credentials and does a completely normal
    // login_user POST with them, rather than this endpoint creating a
    // session itself. Public and unauthenticated on purpose: the whole
    // point of a public demo is that anyone can reach it with no prior
    // access, and the credentials returned are for a designated demo-only
    // account, never a real tenant's real staff.
    case 'get_demo_login_credentials':
        $demoSlug = $_GET['property_slug'] ?? '';
        if (!$demoSlug) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'property_slug required']);
            exit;
        }
        try {
            $stmt = $pdo->prepare("SELECT id FROM properties WHERE slug = ? AND is_public_demo = 1 AND is_deleted = 0 LIMIT 1");
            $stmt->execute([$demoSlug]);
            $demoPropertyId = $stmt->fetchColumn();
            if (!$demoPropertyId) {
                echo json_encode(['success' => false, 'message' => 'Not a public demo property']);
                exit;
            }
            // Prefer the highest-privilege active account so demo visitors see
            // the full tenant-admin experience (Full read-write access was the
            // explicit decision for this feature), not whichever staff row
            // happened to sort first.
            $staffStmt = $pdo->prepare("SELECT username, passcode FROM staff_users WHERE property_id = ? AND status = 'Active' ORDER BY (role = 'Super Admin') DESC, (role = 'Admin') DESC, (role = 'Manager') DESC, id ASC LIMIT 1");
            $staffStmt->execute([$demoPropertyId]);
            $staff = $staffStmt->fetch(PDO::FETCH_ASSOC);
            if (!$staff) {
                echo json_encode(['success' => false, 'message' => 'No active demo staff configured for this property']);
                exit;
            }
            echo json_encode(['success' => true, 'username' => $staff['username'], 'passcode' => $staff['passcode']]);
        } catch (PDOException $e) {
            // is_public_demo column may not exist yet on some environment.
            echo json_encode(['success' => false, 'message' => 'Not a public demo property']);
        }
        exit;

    case 'get_tenant_slot_usage':
        $tenant_id = $_GET['tenant_id'] ?? '';
        if (!$tenant_id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'tenant_id required']);
            exit;
        }
        // Tenants may only inspect their own slot usage (root admins may inspect any).
        if (!isTenantAccessAllowed($pdo, $tenant_id, $propertyId)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Access denied']);
            exit;
        }
        try {
            $stmt = $pdo->prepare("
                SELECT
                    p.id, p.name, p.slug, p.property_type, p.is_active,
                    CASE
                        WHEN p.property_type = 'MULTI_KEY' THEN
                            (SELECT COUNT(*) FROM properties r WHERE r.parent_property_id = p.id AND r.property_type = 'MULTI_KEY_ROOM' AND r.is_deleted = 0)
                        ELSE 1
                    END AS slots_used
                FROM properties p
                WHERE p.tenant_id = ?
                  AND (p.property_type IS NULL OR p.property_type != 'MULTI_KEY_ROOM')
                ORDER BY p.name ASC
            ");
            $stmt->execute([$tenant_id]);
            $properties = $stmt->fetchAll();

            $tenantStmt = $pdo->prepare("SELECT max_properties FROM tenants WHERE id = ?");
            $tenantStmt->execute([$tenant_id]);
            $tenant = $tenantStmt->fetch();

            $totalSlots = $tenant ? (int)$tenant['max_properties'] : 0;
            $usedSlots = 0;
            $breakdown = [];
            foreach ($properties as $p) {
                $slots = (int)$p['slots_used'];
                $usedSlots += $slots;
                $breakdown[] = [
                    'id'            => $p['id'],
                    'name'          => $p['name'],
                    'slug'          => $p['slug'],
                    'property_type' => $p['property_type'] ?? 'SINGLE',
                    'is_active'     => $p['is_active'],
                    'slots_used'    => $slots,
                ];
            }

            echo json_encode(['success' => true, 'data' => [
                'total_slots'     => $totalSlots,
                'used_slots'      => $usedSlots,
                'remaining_slots' => max(0, $totalSlots - $usedSlots),
                'breakdown'       => $breakdown,
            ]]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'create_property_for_tenant':
        $input = json_decode(file_get_contents('php://input'), true);
        $tenant_id = $input['tenant_id'] ?? '';
        $property_name = trim($input['name'] ?? '');
        $property_slug = strtolower(trim($input['slug'] ?? ''));
        $property_type = $input['property_type'] ?? 'SINGLE';
        $room_count = max(1, (int)($input['room_count'] ?? 1));
        $property_email = trim($input['email'] ?? '');
        $property_phone = trim($input['phone'] ?? '');

        if (!$tenant_id || !$property_name || !$property_slug) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'tenant_id, name, and slug are required']);
            exit;
        }
        // A tenant may only create a property under their own tenant (root admins may
        // create for any tenant). Without this, an anonymous caller could consume any
        // tenant's max_properties slot quota with junk properties.
        if (!isTenantAccessAllowed($pdo, $tenant_id, $propertyId)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Access denied: cannot create a property for this tenant']);
            exit;
        }
        try {
            // Compute used slots with room-based formula
            $usedStmt = $pdo->prepare("
                SELECT COALESCE(SUM(
                    CASE
                        WHEN p.property_type = 'MULTI_KEY' THEN
                            (SELECT COUNT(*) FROM properties r WHERE r.parent_property_id = p.id AND r.property_type = 'MULTI_KEY_ROOM' AND r.is_deleted = 0)
                        ELSE 1
                    END
                ), 0) as used_slots
                FROM properties p
                WHERE p.tenant_id = ?
                  AND (p.property_type IS NULL OR p.property_type != 'MULTI_KEY_ROOM')
            ");
            $usedStmt->execute([$tenant_id]);
            $usedSlots = (int)$usedStmt->fetch()['used_slots'];

            $maxStmt = $pdo->prepare("SELECT max_properties FROM tenants WHERE id = ?");
            $maxStmt->execute([$tenant_id]);
            $tenantRow = $maxStmt->fetch();
            $maxSlots = $tenantRow ? (int)$tenantRow['max_properties'] : 0;

            $slotsNeeded = ($property_type === 'MULTI_KEY') ? $room_count : 1;
            $remaining = $maxSlots - $usedSlots;

            if ($slotsNeeded > $remaining) {
                echo json_encode([
                    'success'         => false,
                    'message'         => "Not enough slots. You need {$slotsNeeded} slot(s) but only {$remaining} remain.",
                    'slots_needed'    => $slotsNeeded,
                    'remaining_slots' => $remaining,
                ]);
                exit;
            }

            // Check slug uniqueness
            $slugCheck = $pdo->prepare("SELECT id FROM properties WHERE slug = ?");
            $slugCheck->execute([$property_slug]);
            if ($slugCheck->fetch()) {
                echo json_encode(['success' => false, 'message' => 'A property with this slug already exists. Please choose a different name.']);
                exit;
            }

            $pdo->beginTransaction();
            if ($property_type === 'MULTI_KEY') {
                $stmt = $pdo->prepare("INSERT INTO properties (tenant_id, name, slug, property_type, status, is_active, tailwind_color_scheme, email, phone) VALUES (?, ?, ?, 'MULTI_KEY', 'active', 1, 'blue', ?, ?)");
                $stmt->execute([$tenant_id, $property_name, $property_slug, $property_email ?: null, $property_phone ?: null]);
                $parentId = $pdo->lastInsertId();
                for ($i = 1; $i <= $room_count; $i++) {
                    $roomSlug = $property_slug . '-room-' . $i;
                    $roomName = $property_name . ' - Room ' . $i;
                    $pdo->prepare("INSERT INTO properties (tenant_id, name, slug, property_type, parent_property_id, status, is_active, tailwind_color_scheme) VALUES (?, ?, ?, 'MULTI_KEY_ROOM', ?, 'active', 1, 'blue')")
                        ->execute([$tenant_id, $roomName, $roomSlug, $parentId]);
                }
                ensureTenantOwnerStaffRow($pdo, $tenant_id, $parentId);
                $pdo->commit();
                echo json_encode(['success' => true, 'message' => "Multi-key property created with {$room_count} room(s)", 'property_id' => $parentId]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO properties (tenant_id, name, slug, property_type, status, is_active, tailwind_color_scheme, email, phone) VALUES (?, ?, ?, 'SINGLE', 'active', 1, 'blue', ?, ?)");
                $stmt->execute([$tenant_id, $property_name, $property_slug, $property_email ?: null, $property_phone ?: null]);
                $propertyId = $pdo->lastInsertId();
                ensureTenantOwnerStaffRow($pdo, $tenant_id, $propertyId);
                $pdo->commit();
                echo json_encode(['success' => true, 'message' => 'Property created successfully', 'property_id' => $propertyId]);
            }
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;


    case 'update_tenant':
        $input = json_decode(file_get_contents('php://input'), true);
        $id = $input['id'] ?? '';
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'tenant id required']);
            exit;
        }
        $slug = isset($input['slug']) ? trim($input['slug']) : null;
        if ($slug === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Slug cannot be empty']);
            exit;
        }
        try {
            if ($slug !== null) {
                $slugCheck = $pdo->prepare("SELECT id FROM tenants WHERE slug = ? AND id != ? LIMIT 1");
                $slugCheck->execute([$slug, $id]);
                if ($slugCheck->fetch()) {
                    http_response_code(409);
                    echo json_encode(['success' => false, 'message' => "Slug \"{$slug}\" is already in use by another tenant"]);
                    exit;
                }
            }
            $stmt = $pdo->prepare("
                UPDATE tenants
                SET name = ?, slug = COALESCE(?, slug), email = ?, phone = ?, subscription_status = ?, is_active = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $input['name'] ?? '',
                $slug,
                $input['email'] ?? null,
                $input['phone'] ?? null,
                $input['subscription_status'] ?? 'trial',
                $input['is_active'] ?? 0,
                $id
            ]);
            echo json_encode(['success' => true, 'message' => 'Tenant updated successfully']);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'get_all_property_modules':
        try {

            $stmt = $pdo->query("SELECT property_id, module_slug, is_enabled FROM property_modules");
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $result = [];
            foreach ($rows as $row) {
                $pId = (int)$row['property_id'];
                if (!isset($result[$pId])) {
                    $result[$pId] = [];
                }
                $result[$pId][] = [
                    'module_slug' => $row['module_slug'],
                    'is_enabled' => (int)$row['is_enabled']
                ];
            }

            echo json_encode(['success' => true, 'status' => 'success', 'data' => $result]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'toggle_property_module':
        $rawInput = file_get_contents('php://input');
        $input = !empty($rawInput) ? json_decode($rawInput, true) : [];
        if (!is_array($input)) {
            $input = [];
        }

        $property_id = $input['property_id'] ?? $input['propertyId'] ?? $_POST['property_id'] ?? $_POST['propertyId'] ?? $_GET['property_id'] ?? $_GET['propertyId'] ?? '';
        $module_name = $input['module_name'] ?? $input['moduleName'] ?? $input['module_slug'] ?? $_POST['module_name'] ?? $_POST['module_slug'] ?? $_GET['module_name'] ?? 'kitchen';
        $enabled = isset($input['enabled']) ? (bool)$input['enabled'] : (isset($input['is_enabled']) ? (bool)$input['is_enabled'] : (isset($_POST['enabled']) ? (bool)$_POST['enabled'] : false));

        if (empty($property_id) || empty($module_name)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'property_id and module_name required']);
            exit;
        }

        try {
            // Ensure table exists

            // Use INSERT ... ON DUPLICATE KEY UPDATE for atomic upsert
            $stmt = $pdo->prepare("
                INSERT INTO property_modules (property_id, module_slug, is_enabled)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    is_enabled = ?,
                    updated_at = CURRENT_TIMESTAMP
            ");
            $stmt->execute([$property_id, $module_name, $enabled ? 1 : 0, $enabled ? 1 : 0]);

            // Also toggle for all child rooms if this is a Multi-Key parent property
            $stmtChildren = $pdo->prepare("SELECT id FROM properties WHERE parent_property_id = ?");
            $stmtChildren->execute([$property_id]);
            $childIds = $stmtChildren->fetchAll(PDO::FETCH_COLUMN);
            foreach ($childIds as $cId) {
                $stmt->execute([$cId, $module_name, $enabled ? 1 : 0, $enabled ? 1 : 0]);
            }

            echo json_encode(['success' => true, 'message' => 'Module toggled successfully']);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'update_property':
        $input = json_decode(file_get_contents('php://input'), true);
        $property_id = $input['property_id'] ?? '';

        if (!$property_id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'property_id required']);
            exit;
        }

        // Allow property setup updates without a logged-in backend session,
        // but only when the caller proves ownership of the target property
        // via tenant+property slug in the request body.
        if (!$is_authenticated_user) {
            $tenantSlug = strtolower(trim($input['tenant_slug'] ?? ''));
            $propertySlug = strtolower(trim($input['property_slug'] ?? ''));
            $allowed = false;

            if ($tenantSlug && $propertySlug) {
                $stmt = $pdo->prepare("
                    SELECT p.id FROM properties p
                    JOIN tenants t ON p.tenant_id = t.id
                    WHERE (t.slug = ? OR REPLACE(t.slug, '_', '-') = ? OR REPLACE(t.slug, '-', '_') = ?)
                      AND (p.slug = ? OR REPLACE(p.slug, '_', '-') = ? OR REPLACE(p.slug, '-', '_') = ?)
                      AND p.id = ?
                    LIMIT 1
                ");
                $stmt->execute([$tenantSlug, $tenantSlug, $tenantSlug, $propertySlug, $propertySlug, $propertySlug, $property_id]);
                $allowed = (bool) $stmt->fetch();
            }

            if (!$allowed) {
                http_response_code(401);
                echo json_encode(['success' => false, 'message' => 'Unauthorized for property setup update']);
                exit;
            }
        }

        try {
            $sets = [];
            $params = [];

            if (isset($input['status'])) {
                $sets[] = 'status = ?';
                $params[] = $input['status'];
            }
            if (isset($input['name'])) {
                $sets[] = 'name = ?';
                $params[] = trim($input['name']);
            }
            if (array_key_exists('email', $input)) {
                $sets[] = 'email = ?';
                $params[] = trim($input['email']) ?: null;
            }
            if (array_key_exists('phone', $input)) {
                $sets[] = 'phone = ?';
                $params[] = trim($input['phone']) ?: null;
            }
            if (array_key_exists('gstin', $input)) {
                $sets[] = 'gstin = ?';
                $params[] = trim($input['gstin']) ?: null;
            }
            if (array_key_exists('telegram_template_customization_enabled', $input)) {
                $sets[] = 'telegram_template_customization_enabled = ?';
                $params[] = $input['telegram_template_customization_enabled'] ? 1 : 0;
            }
            if (array_key_exists('google_maps_link', $input)) {
                $sets[] = 'google_maps_link = ?';
                $params[] = trim($input['google_maps_link']) ?: null;
            }
            if (array_key_exists('address', $input)) {
                $sets[] = 'address = ?';
                $params[] = trim($input['address']) ?: null;
            }
            if (array_key_exists('instructions', $input)) {
                $sets[] = 'instructions = ?';
                $params[] = trim($input['instructions']) !== '' ? $input['instructions'] : null;
            }
            if (array_key_exists('checkin_time', $input)) {
                $sets[] = 'checkin_time = ?';
                $params[] = trim($input['checkin_time']) ?: null;
            }
            if (array_key_exists('checkout_time', $input)) {
                $sets[] = 'checkout_time = ?';
                $params[] = trim($input['checkout_time']) ?: null;
            }
            if (array_key_exists('default_tariff', $input)) {
                $rawTariff = $input['default_tariff'];
                if ($rawTariff !== null && $rawTariff !== '' && !is_numeric($rawTariff)) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'default_tariff must be a number']);
                    exit;
                }
                $sets[] = 'default_tariff = ?';
                $params[] = ($rawTariff !== null && $rawTariff !== '') ? (float)$rawTariff : null;
            }
            if (array_key_exists('whatsapp_voucher_template', $input)) {
                // Empty string means "reset to the built-in default" - stored as NULL,
                // not an empty template, so the frontend's fallback logic kicks in.
                $trimmedTemplate = trim($input['whatsapp_voucher_template']);
                $sets[] = 'whatsapp_voucher_template = ?';
                $params[] = $trimmedTemplate !== '' ? $trimmedTemplate : null;
            }

            if (empty($sets)) {
                echo json_encode(['success' => false, 'message' => 'No fields to update']);
                exit;
            }

            $sets[] = 'updated_at = CURRENT_TIMESTAMP';
            $params[] = $property_id;

            $stmt = $pdo->prepare("UPDATE properties SET " . implode(', ', $sets) . " WHERE id = ?");
            $stmt->execute($params);

            if ($stmt->rowCount() > 0) {
                echo json_encode(['success' => true, 'message' => 'Property updated successfully']);
            } else {
                echo json_encode(['success' => true, 'message' => 'No changes made']);
            }
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'create_property':
        $input = json_decode(file_get_contents('php://input'), true);
        $tenant_id = $input['tenant_id'] ?? '';
        $name = $input['name'] ?? '';
        $slug = $input['slug'] ?? '';
        $tenant_username = $input['tenant_username'] ?? '';

        if (!$tenant_id || !$name || !$slug) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'tenant_id, name, and slug required']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("
                INSERT INTO properties (name, slug, tenant_id, status, tailwind_color_scheme)
                VALUES (?, ?, ?, 'active', ?)
            ");
            $stmt->execute([$name, $slug, $tenant_id, $input['color_scheme'] ?? 'blue']);
            $property_id = $pdo->lastInsertId();

            // Create staff_users table if it doesn't exist

            // Add only the tenant as super_admin, no other prefilled users
            if ($tenant_username) {
                $stmt = $pdo->prepare("INSERT INTO staff_users (id, property_id, username, full_name, role, status, is_financial_handler) VALUES (?, ?, ?, ?, 'Super Admin', 'Active', 1)");
                $stmt->execute([$tenant_username, $property_id, $tenant_username, $tenant_username]);
            }

            // Add kitchen module only if requested (default: true)
            $include_kitchen = $input['include_kitchen'] ?? true;
            if ($include_kitchen) {
                $pdo->prepare("INSERT INTO property_modules (property_id, module_slug, is_enabled) VALUES (?, 'kitchen', 1)")
                    ->execute([$property_id]);
            }

            echo json_encode(['success' => true, 'message' => 'Property created', 'property_id' => $property_id]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'edit_property':
        $input = json_decode(file_get_contents('php://input'), true);
        $property_id = $input['property_id'] ?? '';
        if (!$property_id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'property_id required']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("
                UPDATE properties
                SET name = ?, slug = ?, tailwind_color_scheme = ?, status = ?, telegram_template_customization_enabled = ?, is_public_demo = ?
                WHERE id = ?
            ");
            $ok = $stmt->execute([
                $input['name'] ?? '',
                $input['slug'] ?? '',
                $input['color_scheme'] ?? 'blue',
                $input['status'] ?? 'active',
                !empty($input['telegram_template_customization_enabled']) ? 1 : 0,
                !empty($input['is_public_demo']) ? 1 : 0,
                $property_id
            ]);
            echo json_encode(['success' => $ok, 'message' => $ok ? 'Property updated' : 'Failed']);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'delete_property':
        $input = json_decode(file_get_contents('php://input'), true);
        $property_id = $input['property_id'] ?? '';
        if (!$property_id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'property_id required']);
            exit;
        }

        try {
            $pdo->beginTransaction();
            deletePropertyChildData($pdo, $property_id);
            $pdo->prepare("DELETE FROM properties WHERE id = ?")->execute([$property_id]);
            $pdo->commit();
            echo json_encode(['success' => true, 'message' => 'Property deleted successfully']);
        } catch (Exception $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Property deletion failed: ' . $e->getMessage()]);
        }
        exit;

    // Root-admin only (there was previously no way to do this at all - a
    // tenant's account had to be left inactive forever, properties and all).
    // Cascades to every property under the tenant first, running the exact
    // same per-property cleanup delete_property uses (see
    // deletePropertyChildData() above) for tables with no FK to properties,
    // then deletes the tenant row itself - properties.tenant_id is
    // ON DELETE CASCADE, so that removes the now-emptied property rows (and
    // their own FK-linked children) automatically. All in one transaction:
    // a tenant with 40 properties either loses all 40 or none.
    case 'delete_tenant':
        $input = json_decode(file_get_contents('php://input'), true);
        $tenant_id = $input['tenant_id'] ?? '';
        if (!$tenant_id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'tenant_id required']);
            exit;
        }

        try {
            $pdo->beginTransaction();

            $stmt = $pdo->prepare("SELECT id FROM properties WHERE tenant_id = ?");
            $stmt->execute([$tenant_id]);
            $propertyIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
            foreach ($propertyIds as $propId) {
                deletePropertyChildData($pdo, $propId);
            }

            $delStmt = $pdo->prepare("DELETE FROM tenants WHERE id = ?");
            $delStmt->execute([$tenant_id]);
            if ($delStmt->rowCount() === 0) {
                // Nothing was actually deleted - tenant_id didn't exist. Roll
                // back rather than silently reporting success for a no-op.
                $pdo->rollBack();
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Tenant not found']);
                exit;
            }

            $pdo->commit();
            echo json_encode([
                'success' => true,
                'message' => count($propertyIds) > 0
                    ? 'Tenant and ' . count($propertyIds) . ' propert' . (count($propertyIds) === 1 ? 'y' : 'ies') . ' deleted successfully'
                    : 'Tenant deleted successfully',
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Tenant deletion failed: ' . $e->getMessage()]);
        }
        exit;

    // === MULTI KEY PROPERTIES ===
    // Handlers receive the resolved property context ($propertyId / $currentProperty)
    // so reads/mutations are confined to the property tree the request actually
    // belongs to, instead of trusting a client-supplied property_id blindly.
    case 'create_multikey_property':
    case 'add_multikey_room':
    case 'delete_multikey_room':
    case 'update_room_order':
    case 'update_room_name':
    case 'restore_multikey_room':
    case 'get_multikey_property':
    case 'get_multikey_overview':
    case 'get_room_grouped_active_bookings':
    case 'populate_default_expenses':
    case 'sync_all_default_expenses':
    case 'create_multikey_property':
    case 'add_tenant_user_to_property':
    case 'backfill_tenant_users':
        handleMultiKeyPropertyRequests($pdo, $request_method, $action, $propertyId, $currentProperty);
        exit;

    case 'reset_staff_passcodes':
        // Touches every property's staff passcodes, so it is strictly a root-admin
        // tool - a tenant user must never be able to reset another tenant's staff.
        if (!($_SESSION['is_platform_admin'] ?? false)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Root admin access required']);
            exit;
        }
        try {
            $stmt = $pdo->prepare("UPDATE staff_users SET passcode = ? WHERE 1");
            $ok = $stmt->execute(['123456']);
            echo json_encode(['success' => $ok, 'message' => $ok ? 'All staff passcodes reset to 123456' : 'Failed']);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    case 'get_property_modules':
        // First check if property_id was explicitly passed (for platform admin use)
        $property_id = $_GET['property_id'] ?? '';

        // If not provided, use the current property context (for staff/tenant access)
        if (!$property_id) {
            $property_id = getCurrentPropertyId($pdo);
        }

        if (!$property_id) {
            // Return empty/default modules if no property context
            echo json_encode(['status' => 'success', 'data' => []]);
            exit;
        }

        try {
            // Check if this is a MULTI_KEY_ROOM - if so, resolve to parent property
            $stmt = $pdo->prepare("
                SELECT property_type, parent_property_id FROM properties
                WHERE id = ?
            ");
            $stmt->execute([$property_id]);
            $property = $stmt->fetch(PDO::FETCH_ASSOC);

            // If this is a room, use parent property's modules instead
            if ($property && $property['property_type'] === 'MULTI_KEY_ROOM' && $property['parent_property_id']) {
                $property_id = $property['parent_property_id'];
            }

            $rawModules = getPropertyModules($pdo, $property_id);
            $formattedModules = [];
            $kitchenEnabled = true;
            foreach ($rawModules as $mod) {
                $slug = $mod['slug'] ?? $mod['module_slug'] ?? '';
                $isEnabled = (bool)($mod['is_enabled'] ?? true);
                if ($slug === 'kitchen') {
                    $kitchenEnabled = $isEnabled;
                }
                $formattedModules[] = [
                    'slug' => $slug,
                    'module_slug' => $slug,
                    'is_enabled' => $isEnabled,
                    'config' => $mod['config'] ?? null,
                ];
            }

            echo json_encode([
                'success' => true,
                'status' => 'success',
                'kitchen_enabled' => $kitchenEnabled,
                'data' => $formattedModules
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'status' => 'error', 'message' => $e->getMessage()]);
        }
        exit;

    // --- GUESTS ---
    case 'get_guests':
    case 'add_guest':
    case 'update_guest':
    case 'checkout_guest':
    case 'checkin_guest':
    case 'delete_guest':
    case 'mark_c_form_filed':
    case 'get_id_documents':
    case 'upload_id_document':
    case 'delete_id_document':
    case 'complete_checkin_verification':
        handleGuestRequests($pdo, $request_method, $action, $propertyId);
        break;

    // --- GUEST SERVICE REQUESTS (Housekeeping, Maintenance, etc.) ---
    case 'get_service_requests':
    case 'create_service_request':
    case 'fulfill_service_request':
    case 'update_service_request_reminder_timestamp':
    case 'check_stale_service_requests':
    case 'get_service_request_types':
    case 'save_service_request_type':
    case 'delete_service_request_type':
        // Platform admin (Root Admin Dashboard) can target any property explicitly;
        // otherwise the URL-resolved property context applies (staff/tenant pages).
        if ($is_platform_admin) {
            $targetPropertyId = $_GET['property_id'] ?? null;
            if (!$targetPropertyId && $request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true) ?: [];
                $targetPropertyId = $input['property_id'] ?? null;
            }
            if ($targetPropertyId) {
                $propertyId = intval($targetPropertyId);
            }
        }
        handleServiceRequestActions($pdo, $request_method, $action, $propertyId);
        break;

    // --- BILLING & CHECKOUT ---
    case 'add_direct_food_incidentals':
    case 'add_adjustment':
    case 'finalize_checkout':
        handleBillingRequests($pdo, $request_method, $action, $propertyId);
        break;

    case 'get_receipts':
    case 'save_receipt':
        handleReceiptRequests($pdo, $request_method, $action, $propertyId);
        break;

    // --- KITCHEN ORDERS & MENU ---
    case 'get_orders':
    case 'create_order':
    case 'update_order_status':
    case 'get_served_logs':
    case 'add_served_log':
    case 'update_order_item_status':
    case 'update_item_reminder_timestamp':
    case 'check_stale_reminders':
        handleKitchenRequests($pdo, $request_method, $action, $propertyId);
        break;

    case 'get_menu':
    case 'add_menu_item':
    case 'update_menu_item':
    case 'delete_menu_item':
    case 'dedup_menu':
    case 'get_nav_menu':
    case 'save_nav_menu':
    case 'get_recipes':
    case 'save_recipe':
    case 'delete_recipe':
    case 'deplete_stock':
    case 'get_staff_meal_options':
    case 'add_staff_meal_option':
    case 'get_staff_meal_logs':
    case 'add_staff_meal_log':
        handleMenuRequests($pdo, $request_method, $action, $propertyId);
        break;

    // --- INVENTORY & STOCK ---
    case 'get_inventory':
    case 'update_stock':
    case 'get_stock_requests':
    case 'create_stock_request':
    case 'update_stock_request_status':
    case 'get_wastage_logs':
    case 'create_wastage_log':
    case 'get_kitchen_purchases':
    case 'create_kitchen_purchase':
    case 'bulk_update_kitchen_purchases':
    case 'delete_kitchen_purchase':
    case 'get_material_categories':
    case 'update_material_category':
    case 'delete_material_category':
    case 'add_material_category':
    case 'toggle_ingredient_category':
    case 'add_catalog_item':
    case 'update_catalog_item':
    case 'delete_catalog_item':
    case 'bulk_update_catalog_category':
    case 'seed_catalog':
    case 'fix_orphan_categories':
        handleInventoryRequests($pdo, $request_method, $action, $propertyId);
        break;

    // --- FINANCE & PETTY CASH ---
    case 'get_petty_cash':
    case 'add_petty_cash':
    case 'update_petty_cash':
    case 'delete_petty_cash':
    case 'get_expense_item_prices':
    case 'get_expense_items':
    case 'add_expense_item':
    case 'delete_expense_item':
    case 'get_misc_catalog':
    case 'add_misc_charge_template':
    case 'delete_misc_charge_template':
    case 'get_cash_drawer_summary':
    case 'add_drawer_entry':
    case 'get_drawer_entries':
    case 'get_financial_ledger':
    case 'record_salary_payment':
        handleFinanceRequests($pdo, $request_method, $action, $propertyId);
        break;

    // --- STAFF & PAYROLL ---
    case 'get_staff':
    case 'get_users':
    case 'add_user':
    case 'update_user':
    case 'delete_user':
    case 'get_payees':
    case 'add_payee':
    case 'delete_payee':
    case 'get_staff_advances':
    case 'add_staff_advance':
    case 'delete_staff_advance':
    case 'get_attendance':
    case 'log_attendance':
        handleStaffRequests($pdo, $request_method, $action, $propertyId);
        break;

    // --- AUDIT LOGS ---
    case 'get_audit_logs':
    case 'add_audit_log':
        handleAuditRequests($pdo, $request_method, $action, $propertyId);
        break;

    // --- TELEGRAM ---
    case 'send_telegram_alert':
    case 'get_telegram_config':
    case 'save_telegram_config':
    case 'get_bot_identity':
    case 'generate_pairing_code':
    case 'check_pairing_status':
    case 'confirm_pairing':
    case 'send_telegram_test':
        if (function_exists('handleTelegramRequests')) {
            handleTelegramRequests($pdo, $request_method, $action, $propertyId);
        } else {
            http_response_code(503);
            echo json_encode(['status' => 'error', 'message' => 'Telegram module temporarily unavailable.']);
        }
        break;

    // --- MODULES ---
    case 'get_property_modules':
        echo json_encode(['status' => 'success', 'data' => getPropertyModules($pdo, $propertyId)]);
        break;

    case 'get_all_property_modules':
        // Batch endpoint: fetch modules for ALL properties in one query (much faster than individual calls)
        echo json_encode(['status' => 'success', 'data' => getAllPropertyModules($pdo)]);
        break;

    // --- LICENSES ---
    case 'get_licenses':
    case 'add_license':
    case 'update_license':
    case 'delete_license':
    case 'check_expiring_licenses':
        handleLicenseRequests($pdo, $request_method, $action, $propertyId);
        break;

    // --- PROPERTY ---
    case 'get_current_property':
        // SECURITY: Ensure property exists and is active
        if (empty($currentProperty) || !isset($currentProperty['id'])) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Property not found or deleted', 'data' => null]);
        } else {
            echo json_encode(['status' => 'success', 'data' => $currentProperty]);
        }
        break;

    // --- CONFIGURATION ---
    case 'get_system_roles':
    case 'get_ui_configuration':
    case 'get_available_icons':
    case 'get_icon_search_tags':
    case 'get_telegram_templates':
    case 'get_nav_page_options':
    case 'get_system_settings':
    case 'save_system_settings':
        handleConfigurationRequests($pdo, $request_method, $action, $propertyId);
        break;

    // --- THEME SETTINGS ---
    case 'get_theme_settings':
    case 'save_theme_settings':
        handleThemeRequests($pdo, $request_method, $action, $propertyId);
        break;

    // --- SANDBOX / TESTING ---
    // generate_demo_data / clear_demo_data are POST writes that are NOT in
    // $public_actions, so the middleware above already requires a session or API
    // key. On top of that, the target property is pinned to the resolved context:
    // an anonymous or tenant caller can never generate/clear demo data for an
    // arbitrary property_id (which would wipe/poison another tenant's live rows).
    case 'reset_test_database':
        handle_reset_test_database($db_host, $db_user, $db_pass, $live_db, $test_db);
        break;

    // Lets a platform admin download a full mysqldump of the live DB from the
    // Root Dashboard - see deploy/pull-live-data.ps1 for the SSH equivalent.
    case 'export_database_dump':
        handleExportDatabaseDump($pdo, $db_host, $db_user, $db_pass, $db_name);
        break;

    case 'generate_demo_data':
        require_once __DIR__ . '/demo_data.php';
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $targetPropertyId = $propertyId;
        if (($input['property_id'] ?? '') && ($_SESSION['is_platform_admin'] ?? false)) {
            $targetPropertyId = $input['property_id'];
        }
        if (!$targetPropertyId) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'No property context for demo data']);
            break;
        }
        $result = generateDemoData($pdo, $targetPropertyId);
        echo json_encode($result);
        break;

    case 'clear_demo_data':
        require_once __DIR__ . '/demo_data.php';
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $targetPropertyId = $propertyId;
        if (($input['property_id'] ?? '') && ($_SESSION['is_platform_admin'] ?? false)) {
            $targetPropertyId = $input['property_id'];
        }
        if (!$targetPropertyId) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'No property context for demo data']);
            break;
        }
        $result = clearDemoData($pdo, $targetPropertyId);
        echo json_encode($result);
        break;

    case 'get_dummy_history_status':
    case 'enable_dummy_history':
    case 'disable_dummy_history':
        require_once __DIR__ . '/dummy_history.php';
        handleDummyHistory($pdo, $action, $propertyId);
        break;

    case 'list_local_llm_models':
    case 'local_llm_chat':
        require_once __DIR__ . '/local_llm.php';
        handleLocalLLM($action, $propertyId);
        break;

    default:
        $propertyName = $currentProperty['name'] ?? 'Artists Farm'; // Default if not found
        echo json_encode([
            'status' => 'online',
            'system' => $propertyName . ' Terminal API', // Use property name here
            'version' => '2.0.0',
            'server_time' => date('Y-m-d H:i:s'),
            'modules' => [
                'guests' => '/php/guests/guests.php',
                'billing' => '/php/billing/billing.php',
                'receipts' => '/php/billing/receipts.php',
                'kitchen' => '/php/kitchen/orders.php',
                'menu' => '/php/kitchen/menu.php',
                'inventory' => '/php/inventory/inventory.php',
                'finance' => '/php/finance/petty_cash.php',
                'staff' => '/php/staff/staff.php',
                'audit' => '/php/audit/audit.php',
                'telegram' => '/php/telegram/telegram.php'
            ]
        ]);
        break;
}
