<?php
/**
 * Central API Request Router & Dispatcher
 * Ground Code Resort & Kitchen Management Backend System
 */

// Output buffering, on from the very first line (31 Aug 2026): required for
// channex/outbox.php's triggerEventDrivenChannexDrain() to actually return
// the HTTP response early before its post-response Channex push. Without an
// active buffer here, that function's fallback (ob_end_flush()+flush(), used
// whenever fastcgi_finish_request() doesn't exist - confirmed true for this
// host's LiteSpeed SAPI) has nothing to flush: the response was already sent
// unbuffered, so the client just blocks until the whole script - including
// the multi-second Channex API round trip - finishes. Measured live: 0.9s
// with this buffer active vs 8s without it, same endpoint, same payload.
// Every guest-booking and rate-rule save was silently taking 13-20+ seconds
// to respond because of this, looking like a failure to the frontend (whose
// own timeout is shorter) even though the write itself succeeded instantly -
// found 31 Aug 2026 while dry-running the Channex certification video.
ob_start();

// PHP's default session lifetime (session.gc_maxlifetime, 1440s = 24min) is
// too short for an admin tool where reading/deciding between actions
// routinely exceeds it - the session silently expires mid-task, and the
// next write comes back as a false "Unauthorized" error even though the
// user never logged out. The login flows also set a persistent
// `artists_farm_session` cookie holding the session id, but PHP only
// resumes a session from the cookie named by session.name (default
// PHPSESSID, a browser-session cookie that is lost on browser close).
// Net effect: after closing/reopening the browser the UI restores its
// localStorage login while the server has no session, so every write API
// call fails with "Unauthorized. Valid API key required for write
// operations." Point PHP at the persistent cookie and keep both the cookie
// and the server-side session file alive for 30 days.
//
// session_set_cookie_params() (added 27 Aug 2026, "remember me" request for
// the installed PWA/terminal - closing the app shouldn't force a fresh sign-
// in) rather than the old ini_set('session.cookie_lifetime', ...)/
// ('session.cookie_httponly', ...) pair: those two ini_set calls only cover
// lifetime/httponly, so PHP's OWN automatic Set-Cookie refresh - which fires
// on every request that touches $_SESSION, not just login - carried no
// 'secure'/'samesite' attributes at all (confirmed: php.ini's own defaults
// are cookie_secure=Off, cookie_samesite=unset). config/database.php's
// appSetSessionCookie() already sets those correctly, but only login
// endpoints call it - every OTHER request was silently re-issuing the same
// cookie with weaker attributes right behind it. session_set_cookie_params()
// makes PHP's native auto-refresh use the exact same attributes as login,
// on every request, so the two mechanisms can't drift apart. Computed
// inline rather than via config/database.php's APP_IS_LOCAL_ENV because this
// must run before that file is required (mirrors its own $server_name/
// local-env check below).
$__session_host = $_SERVER['SERVER_NAME'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost';
$__session_is_local = $__session_host === 'localhost' || $__session_host === '127.0.0.1' || str_contains($__session_host, '192.168.') || $__session_host === 'dev.ground-code.com';
ini_set('session.gc_maxlifetime', 86400 * 30);
session_set_cookie_params([
    'lifetime' => 86400 * 30,
    'path' => '/',
    'domain' => '',
    'secure' => !$__session_is_local,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_name('artists_farm_session');
session_start();
// Session-fixation race (found 27 Aug 2026 chasing a "wall of 401s that never
// clears, even after a reload" report): session_start() unconditionally queues a
// Set-Cookie on EVERY request that touches $_SESSION - not just a brand-new
// session, but also PHP's own automatic refresh of an already-existing one (see
// this file's own "remember me" comment above about that auto-refresh). On a
// first-ever page load, a dozen+ authenticated-only fetches fire in parallel
// alongside the actual login POST, all starting with no cookie - each mints its
// own throwaway Set-Cookie, and the browser just keeps whichever response's
// header happens to arrive LAST, with total disregard for which one was the
// real login. Worse, if a stale/invalid cookie is already sitting in the
// browser, every one of those same anonymous requests still auto-refreshes
// THAT cookie too, so the race persists even across reloads once a bad cookie
// has already won once - which is exactly why "just reload" didn't fix it.
// The only correct fix is to never let this implicit, automatic Set-Cookie out
// the door at all: appSetSessionCookie() (config/database.php) explicitly
// (re-)issues the cookie itself the moment a request actually authenticates, at
// all 8 real login call sites, so removing PHP's own implicit one here,
// unconditionally, on every request, doesn't affect a real login - it only
// silences the one PHP sends on its own that this app never wants.
header_remove('Set-Cookie');
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
require_once __DIR__ . '/../kitchen/walk_in_tabs.php';
require_once __DIR__ . '/../kitchen/menu.php';
require_once __DIR__ . '/../inventory/inventory.php';
require_once __DIR__ . '/../finance/ledger.php';
require_once __DIR__ . '/../finance/petty_cash.php';
require_once __DIR__ . '/../staff/staff.php';
require_once __DIR__ . '/../audit/audit.php';
require_once __DIR__ . '/../uploads/image_cleanup.php';
require_once __DIR__ . '/../cron/cron_jobs.php';
// Conditional (12 Aug 2026): this was an unconditional require - a malware
// scanner quarantining this ONE file (a real, recurring event on the live
// server) took down every action router.php handles, including login,
// since a failed require_once here is fatal before $action is even read.
// Now only Telegram-specific actions (see handleTelegramRequests below) are
// affected if this file is ever missing again.
//
// Any environment other than the ONE host CPGuard has actually whitelisted (support ticket
// BRX-3227572, see database.php's APP_IS_ORIGINAL_TELEGRAM_WHITELISTED_HOST) always requires
// telegram.php straight from that whitelisted path instead of its own local copy (23 Aug 2026,
// explicit decision for staging; generalized 24 Aug 2026 when production itself started moving
// to ground-code.com, whose own fresh checkout is just as unwhitelisted as staging's always
// was). Confirmed live via CPGuard's own Background Scanner Logs (cp163173.hpdns.net:2083) that
// an unwhitelisted physical copy gets re-quarantined every few minutes ({HEX}Malware.Expert.php.
// json.decode.file.getcontents.api.telegram - the outbound curl-to-api.telegram.org-with-a-bot-
// token shape genuinely does look like malware phoning home to static analysis) - self-healing
// by COPYING bytes onto the unwhitelisted host's own disk (the 17 Aug 2026 version of this fix)
// just handed the scanner a fresh target every single time, an unwinnable cycle against a
// scanner that re-scans that fast. So every non-whitelisted host now never creates/uses a local
// copy for CPGuard to catch in the first place - local dev is exempt from this whole redirect
// (CPGuard doesn't scan XAMPP, and the remote path isn't even reachable from a local machine).
// Path is root-admin-configurable (Root Dashboard > Telegram Templates > Telegram Platform
// Health, saved as system_settings key 'telegram_fallback_source_path') - falls back to the
// confirmed-whitelisted path if nothing has been saved yet.
$__telegram_php_path = __DIR__ . '/../telegram/telegram.php';
$__needs_remote_telegram_source = !(defined('APP_IS_LOCAL_ENV') && APP_IS_LOCAL_ENV)
    && !(defined('APP_IS_ORIGINAL_TELEGRAM_WHITELISTED_HOST') && APP_IS_ORIGINAL_TELEGRAM_WHITELISTED_HOST);
if ($__needs_remote_telegram_source) {
    $__prod_telegram_php_path = null;
    try {
        $__fallback_stmt = $pdo->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'telegram_fallback_source_path' LIMIT 1");
        $__fallback_stmt->execute();
        $__prod_telegram_php_path = $__fallback_stmt->fetchColumn() ?: null;
    } catch (Exception $e) {
        // system_settings read failed - fall through to the hardcoded default below
        // rather than letting this block itself take down the request.
    }
    if (!$__prod_telegram_php_path) {
        $__prod_telegram_php_path = '/home/apartment/public_html/php/telegram/telegram.php';
    }
    $__telegram_php_path = $__prod_telegram_php_path;
    unset($__fallback_stmt, $__prod_telegram_php_path);
}
unset($__needs_remote_telegram_source);
if (file_exists($__telegram_php_path)) {
    require_once $__telegram_php_path;
}
unset($__telegram_php_path);
// Guarded (23 Aug 2026): when staging just required telegram.php from its
// PRODUCTION path above, telegram.php's own internal
// require_once __DIR__.'/../modules/module_manager.php' resolves to
// PRODUCTION's copy of this file too (__DIR__ reflects where a file
// physically lives, not who required it) - a DIFFERENT absolute path than
// staging's own copy below, so require_once's per-path dedup can't tell
// they're the same functions. Without this guard that's a fatal "Cannot
// redeclare function" on every staging request. function_exists() makes
// staging's own require a safe no-op whenever production's copy already won
// the race; both files are the same git-tracked content anyway.
if (!function_exists('isModuleAvailable')) {
    require_once __DIR__ . '/../modules/module_manager.php';
}
require_once __DIR__ . '/db_export.php';
require_once __DIR__ . '/../licenses/licenses.php';
require_once __DIR__ . '/../rates/rate_rules.php';
require_once __DIR__ . '/../theme/theme_settings.php';

// Conditional (23 Aug 2026, found live on staging): this was an unconditional
// require - same failure mode as telegram.php above (a "Failed opening
// required" error here is fatal before $action is even read), except this
// one had NO guard at all, so a single missing file took down literally
// every action router.php handles - login included - for over an hour on
// staging before being caught. configuration.php is an ordinary git-tracked
// file (confirmed via git log/git ls-files - NOT a gitignored secrets file
// like db_pass.php), so this wasn't a "forgot to deploy a secret" gap; the
// far more likely cause, given CPGuard is already a confirmed, recurring
// threat on this exact server (see the telegram.php block above), is the
// same malware scanner quarantining this file too.
//
// Fixed 26 Aug 2026 (found live: get_system_settings/Telegram Notifications
// 503ing with "Configuration module unavailable" on staging). Two separate
// bugs in the original self-heal: (1) it COPIED production's bytes onto
// staging's own path - the exact "hands the scanner a fresh target every
// time, an unwinnable cycle" failure mode telegram.php's own fix above
// already proved wrong for this same malware scanner; (2) its fallback path
// still pointed at '/home/apartment/public_html/...', the PRE-migration
// production docroot - CLAUDE.md documents that path as a stale,
// no-longer-deployed checkout since the 25 Aug 2026 cutover to
// ground-code.com's own docroot, so even the copy-back attempt was reading
// from a dead location. Now requires configuration.php straight from the
// current production path when staging's own copy is missing, same pattern
// as telegram.php - safe here because configuration.php's own require of
// config/database.php is now guarded (see that file) so re-running it from a
// foreign __DIR__ is a harmless no-op rather than a redeclare collision.
$__configuration_php_path = __DIR__ . '/configuration.php';
if (!file_exists($__configuration_php_path) && defined('APP_IS_STAGING_ENV') && APP_IS_STAGING_ENV) {
    $__configuration_php_path = '/home/apartment/ground-code.com/php/api/configuration.php';
}
if (file_exists($__configuration_php_path)) {
    require_once $__configuration_php_path;
} elseif (class_exists('TelescopeLogger')) {
    TelescopeLogger::log('php', 'Fatal Error', "php/api/configuration.php is missing from disk, and its whitelisted production fallback was also unreachable - every configuration action ('get_system_settings', 'get_telegram_templates', etc.) is failing", 'router.php:configuration dispatch');
}
unset($__configuration_php_path);

require_once __DIR__ . '/multikey_properties.php';
// Guarded (23 Aug 2026) for the exact same reason as module_manager.php
// above: telegram.php's chain on staging goes telegram.php -> pairing.php ->
// webhook_handler.php -> require_once __DIR__.'/../service_requests/
// service_requests.php' - and since that whole chain now loads from
// PRODUCTION's path on staging, __DIR__ resolves to PRODUCTION's copy of
// service_requests.php too, a different absolute path than staging's own
// copy below. Found live via Telescope after the telegram.php fix first
// shipped: "Cannot redeclare ensureSystemServiceRequestCatalogSchema()".
// webhook_handler.php/pairing.php/module_manager.php's OWN declarations are
// already function_exists()-guarded against exactly this - only
// service_requests.php (like module_manager.php) wasn't, so this is guarded
// at the call site instead, same pattern as module_manager.php above.
if (!function_exists('ensureSystemServiceRequestCatalogSchema')) {
    require_once __DIR__ . '/../service_requests/service_requests.php';
}
if (!function_exists('markRoomReady')) {
    require_once __DIR__ . '/../housekeeping/housekeeping.php';
}
require_once __DIR__ . '/../security/rate_limiter.php';
require_once __DIR__ . '/../security/unified_login.php';
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

// Self-healing column check for `properties` - upi_id/checkin_time/checkout_time
// were referenced by update_property (this file) and PropertyEditForm.tsx's save
// payload without ever being added to the table, so every "Save Changes" on Edit
// Property failed with "Unknown column 'checkin_time'" the moment a form actually
// submitted (checkin_time/checkout_time are always present in that payload, not
// conditionally sent) - discovered while wiring up upi_id for the new UPI
// QR/booking-confirmation feature. Same unconditional-at-boot pattern as the
// `users` check above, so it self-heals wherever this code runs (prod's DB never
// had these columns either) without a manual migration step.
if (!isSchemaVerified('schema_properties_table_v2')) {
    try {
        $propertiesCols = $pdo->query("SHOW COLUMNS FROM properties")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('upi_id', $propertiesCols)) {
            $pdo->exec("ALTER TABLE properties ADD COLUMN `upi_id` VARCHAR(100) DEFAULT NULL AFTER `gstin`");
        }
        if (!in_array('checkin_time', $propertiesCols)) {
            $pdo->exec("ALTER TABLE properties ADD COLUMN `checkin_time` VARCHAR(10) DEFAULT '14:00' AFTER `upi_id`");
        }
        if (!in_array('checkout_time', $propertiesCols)) {
            $pdo->exec("ALTER TABLE properties ADD COLUMN `checkout_time` VARCHAR(10) DEFAULT '11:00' AFTER `checkin_time`");
        }
    } catch (Exception $e) {}
    markSchemaVerified('schema_properties_table_v2');
}

// Self-healing column check for `properties.upi_qr_code_url` - a property can
// now upload a real bank/PhonePe/GPay-issued QR code image (instead of only
// relying on the auto-generated upi://pay deep-link QR built from upi_id) to
// display at billing/checkout. New key (not reusing schema_properties_table_v2
// above, which is already marked verified on every environment that ran this
// file before this column existed - a stale flag would skip the ALTER TABLE
// forever) so this self-heals on next request the same way upi_id did.
if (!isSchemaVerified('schema_properties_table_v3')) {
    try {
        $propertiesColsV3 = $pdo->query("SHOW COLUMNS FROM properties")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('upi_qr_code_url', $propertiesColsV3)) {
            $pdo->exec("ALTER TABLE properties ADD COLUMN `upi_qr_code_url` VARCHAR(500) DEFAULT NULL AFTER `upi_id`");
        }
    } catch (Exception $e) {}
    markSchemaVerified('schema_properties_table_v3');
}

// Self-healing column check for `properties.walk_in_table_count` - how many
// numbered tables (Table 1..N) the walk-in tab picker in Kitchen's Take
// Order screen offers. Was going to be a hardcoded 1-10 range, but that
// breaks the moment any tenant actually has a different table count (found
// while building the walk-in table picker, 20 Aug 2026) - per-property and
// self-healing for the same reason upi_id/upi_qr_code_url are: no manual
// migration step needed on prod. Defaults to 10 (a reasonable guess for an
// existing property with nothing set) rather than 0, so the picker never
// renders empty for a property that hasn't visited Edit Property yet.
if (!isSchemaVerified('schema_properties_table_v4')) {
    try {
        $propertiesColsV4 = $pdo->query("SHOW COLUMNS FROM properties")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('walk_in_table_count', $propertiesColsV4)) {
            $pdo->exec("ALTER TABLE properties ADD COLUMN `walk_in_table_count` INT DEFAULT 10 AFTER `upi_qr_code_url`");
        }
    } catch (Exception $e) {}
    markSchemaVerified('schema_properties_table_v4');
}

// Self-healing column check for `properties.telegram_bot_token` (26 Aug 2026) - Root Admin's
// "White-Glove Telegram Bot Token" field in PlatformPropertyManagement.tsx read/displayed this
// column via `SELECT *` in get_all_properties, but NO action anywhere ever wrote to it -
// edit_property's UPDATE never listed it, and update_property (this file) didn't recognize the
// field either, so saving a token here silently did nothing. Fixed alongside this self-heal by
// adding it to update_property's field list below - same self-healing pattern as upi_id etc.
if (!isSchemaVerified('schema_properties_table_v5')) {
    try {
        $propertiesColsV5 = $pdo->query("SHOW COLUMNS FROM properties")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('telegram_bot_token', $propertiesColsV5)) {
            $pdo->exec("ALTER TABLE properties ADD COLUMN `telegram_bot_token` VARCHAR(120) DEFAULT NULL AFTER `walk_in_table_count`");
        }
    } catch (Exception $e) {}
    markSchemaVerified('schema_properties_table_v5');
}

// Self-healing column check for `properties.housekeeping_status` (28 Aug 2026) - backs the
// new "Mark Room Ready" Telegram action button: a room is flipped to 'Dirty' when its guest
// checks out (see performGuestCheckout() in guests.php) and back to 'Ready' either from the
// Telegram button or the matching toggle in RoomsManagement.tsx. The two telegram_* columns
// remember the "Needs Cleaning" alert's chat/message id so the tap can edit that same message
// instead of posting a duplicate - same pattern as service_requests.telegram_chat_id.
if (!isSchemaVerified('schema_properties_table_v6')) {
    try {
        $propertiesColsV6 = $pdo->query("SHOW COLUMNS FROM properties")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('housekeeping_status', $propertiesColsV6)) {
            $pdo->exec("ALTER TABLE properties ADD COLUMN `housekeeping_status` VARCHAR(20) NOT NULL DEFAULT 'Ready' AFTER `telegram_bot_token`");
        }
        if (!in_array('housekeeping_telegram_chat_id', $propertiesColsV6)) {
            $pdo->exec("ALTER TABLE properties ADD COLUMN `housekeeping_telegram_chat_id` VARCHAR(64) DEFAULT NULL AFTER `housekeeping_status`");
        }
        if (!in_array('housekeeping_telegram_message_id', $propertiesColsV6)) {
            $pdo->exec("ALTER TABLE properties ADD COLUMN `housekeeping_telegram_message_id` INT DEFAULT NULL AFTER `housekeeping_telegram_chat_id`");
        }
    } catch (Exception $e) {}
    markSchemaVerified('schema_properties_table_v6');
}

// Self-healing column check for `tenants.subscription_expires_at` and `tenants.plan_type` (26 Aug 2026)
if (!isSchemaVerified('schema_tenants_table_v2')) {
    try {
        $tenantsColsV2 = $pdo->query("SHOW COLUMNS FROM tenants")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('subscription_expires_at', $tenantsColsV2)) {
            $pdo->exec("ALTER TABLE tenants ADD COLUMN `subscription_expires_at` DATE DEFAULT NULL AFTER `subscription_status`");
        }
        if (!in_array('plan_type', $tenantsColsV2)) {
            $pdo->exec("ALTER TABLE tenants ADD COLUMN `plan_type` VARCHAR(50) DEFAULT 'Growth' AFTER `subscription_expires_at`");
        }
    } catch (Exception $e) {}
    markSchemaVerified('schema_tenants_table_v2');
}

// Self-healing column check for `tenants.is_demo` (27 Aug 2026) - lets a Root Admin mark a
// tenant as a sales/demo account rather than a real paying customer. First (only) consumer:
// TenantDashboard.tsx skips TermsAcceptanceModal entirely for a demo tenant - a prospect being
// walked through the app, or a QA/staging demo account, shouldn't be asked to accept Ground
// Code's live Terms of Service/billing agreement the way a real onboarding customer must.
if (!isSchemaVerified('schema_tenants_table_v3')) {
    try {
        $tenantsColsV3 = $pdo->query("SHOW COLUMNS FROM tenants")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('is_demo', $tenantsColsV3)) {
            $pdo->exec("ALTER TABLE tenants ADD COLUMN `is_demo` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_active`");
        }
    } catch (Exception $e) {}
    markSchemaVerified('schema_tenants_table_v3');
}

// Renewal history for manual/offline billing (27 Aug 2026, see PRODUCT_STRATEGY.md).
// update_tenant's own UPDATE overwrites plan_type/subscription_expires_at in place -
// there was no record anywhere of what the plan/expiry WAS before a Root Admin change,
// or of the UPI/NEFT reference for a given renewal, only the current values. This table
// is written to (never updated) by update_tenant below, purely additive, so it's safe to
// self-heal with CREATE TABLE IF NOT EXISTS rather than an ALTER-based column check.
if (!isSchemaVerified('schema_tenant_subscription_history')) {
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS tenant_subscription_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NOT NULL,
            old_plan_type VARCHAR(50) DEFAULT NULL,
            new_plan_type VARCHAR(50) DEFAULT NULL,
            old_expires_at DATE DEFAULT NULL,
            new_expires_at DATE DEFAULT NULL,
            note VARCHAR(255) DEFAULT NULL,
            recorded_by VARCHAR(100) DEFAULT NULL,
            recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_tenant_subscription_history_tenant (tenant_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Exception $e) {}
    markSchemaVerified('schema_tenant_subscription_history');
}

/**
 * A property's "Super Admin" staff row is not an independent staff account -
 * it IS the tenant, and there is exactly one of them, always. This keeps
 * that invariant true for one property, given the tenant's CURRENT identity:
 *   - Prefers the tenant's real login (`users` table) as the source of
 *     truth once one exists - username, passcode, and name all mirror it
 *     exactly, kept in sync every time that login changes.
 *   - Falls back to a placeholder built from `tenants.phone`/`name` (old
 *     `ensureTenantOwnerStaffRow` behavior, default passcode '123456') for
 *     the brief window before a real login has ever been created.
 *   - Deletes any OTHER staff_users row on this property that holds
 *     role='Super Admin' (stale seed data, a demo-data placeholder, or
 *     anyone who got manually assigned the role before it was locked down)
 *     - there is only ever one Super Admin per property, and it's this one.
 * Idempotent and safe to call repeatedly (retried requests, re-syncs).
 */
if (!function_exists('syncTenantSuperAdminRow')) {
    function syncTenantSuperAdminRow(PDO $pdo, $tenantId, $propertyId) {
        try {
            $identity = null;

            $uStmt = $pdo->prepare("
                SELECT username, passcode, full_name, phone_number FROM users
                WHERE default_tenant_id = ? AND (is_platform_admin = 0 OR is_platform_admin IS NULL)
                LIMIT 1
            ");
            $uStmt->execute([$tenantId]);
            $u = $uStmt->fetch();
            if ($u && !empty($u['username'])) {
                $identity = [
                    'username' => $u['username'],
                    'passcode' => $u['passcode'] ?: '123456',
                    'full_name' => $u['full_name'] ?: $u['username'],
                    'phone' => $u['phone_number'] ?: $u['username'],
                ];
            } else {
                $tenantStmt = $pdo->prepare("SELECT name, phone FROM tenants WHERE id = ?");
                $tenantStmt->execute([$tenantId]);
                $tenant = $tenantStmt->fetch();
                if (!$tenant) return;
                $phoneDigits = preg_replace('/\D/', '', $tenant['phone'] ?? '');
                $phoneDigits = strlen($phoneDigits) >= 10 ? substr($phoneDigits, -10) : $phoneDigits;
                if (strlen($phoneDigits) !== 10) return; // no valid phone/login on file yet - nothing to seed
                $identity = ['username' => $phoneDigits, 'passcode' => '123456', 'full_name' => $tenant['name'], 'phone' => $phoneDigits];
            }

            // Only one Super Admin per property, ever - remove any other claimant.
            $pdo->prepare("DELETE FROM staff_users WHERE property_id = ? AND role = 'Super Admin' AND username != ?")
                ->execute([$propertyId, $identity['username']]);

            $existing = $pdo->prepare("SELECT id FROM staff_users WHERE property_id = ? AND username = ? LIMIT 1");
            $existing->execute([$propertyId, $identity['username']]);
            $row = $existing->fetch();
            if ($row) {
                $pdo->prepare("UPDATE staff_users SET full_name = ?, phone = ?, phone_number = ?, passcode = ?, role = 'Super Admin', status = 'Active' WHERE id = ?")
                    ->execute([$identity['full_name'], $identity['phone'], $identity['phone'], $identity['passcode'], $row['id']]);
            } else {
                $pdo->prepare("
                    INSERT INTO staff_users (id, property_id, username, full_name, role, phone, phone_number, status, is_financial_handler, passcode)
                    VALUES (?, ?, ?, ?, 'Super Admin', ?, ?, 'Active', 1, ?)
                ")->execute(["owner-{$propertyId}", $propertyId, $identity['username'], $identity['full_name'], $identity['phone'], $identity['phone'], $identity['passcode']]);
            }
        } catch (Exception $e) {
            // Non-fatal - the caller's own action (property creation, login
            // create/reset) should still succeed even if this best-effort
            // directory sync fails for some reason.
        }
    }
}

/**
 * Alerts the SaaS admin that a new property has been created and needs its Telegram groups
 * pairing (added 26 Aug 2026, "Method A" White-Glove onboarding - see CLAUDE.md). This is the fix
 * for the real gap the user described: they have no way of knowing a property was created, since
 * property owners create their own properties without the admin present.
 *
 * Deliberately routes through TelescopeLogger (Web Push to the admin's phone), NOT Telegram - see
 * logger.php's own dated comment: "Telegram must not send or be involved in ANY admin-alert
 * notification any more, full stop. The Web Push channel is now the only admin-alert channel."
 * A new-property-needs-pairing notice is exactly that category of admin alert, so it follows the
 * same rule as the crash/error alerts that were already moved off Telegram - not a new exception.
 * Severity string is arbitrary but must NOT appear in logger.php's $routineNoise denylist, or it
 * would silently never push (denylist, not allowlist, by design - see that file's own comment).
 *
 * Non-fatal by design (matches syncTenantSuperAdminRow() above) - a missing/broken Telescope
 * logger must never fail the property creation itself.
 */
/**
 * Turns the 'kitchen' module OFF for a just-created property (26 Aug 2026, owner-facing Property
 * Setup Wizard's mandatory "Has Kitchen?" question). Only ever called for the "No" answer - kitchen
 * defaults ON via system_modules.default_enabled (see module_manager.php's
 * ALWAYS_ENABLED_MODULES_EXCEPT), so "Yes" needs no explicit row at all, same as every property
 * created before this wizard existed. Mirrors the exact upsert + child-room propagation the
 * existing 'toggle_property_module' action already does (router.php, same file) rather than
 * duplicating different logic - a MULTI_KEY parent's kitchen setting must apply to its rooms too.
 */
if (!function_exists('disableKitchenModuleForNewProperty')) {
    function disableKitchenModuleForNewProperty(PDO $pdo, $propertyId) {
        $stmt = $pdo->prepare("
            INSERT INTO property_modules (property_id, module_slug, is_enabled)
            VALUES (?, 'kitchen', 0)
            ON DUPLICATE KEY UPDATE is_enabled = 0, updated_at = CURRENT_TIMESTAMP
        ");
        $stmt->execute([$propertyId]);
        $childStmt = $pdo->prepare("SELECT id FROM properties WHERE parent_property_id = ?");
        $childStmt->execute([$propertyId]);
        foreach ($childStmt->fetchAll(PDO::FETCH_COLUMN) as $childId) {
            $stmt->execute([$childId]);
        }
    }
}

if (!function_exists('notifyAdminOfNewProperty')) {
    function notifyAdminOfNewProperty(PDO $pdo, $tenantId, $propertyId, $propertyName, $propertyTypeLabel, $roomCount) {
        try {
            if (!class_exists('TelescopeLogger')) return;
            $stmt = $pdo->prepare("SELECT name, owner_name, owner_phone FROM tenants WHERE id = ?");
            $stmt->execute([$tenantId]);
            $tenant = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

            $ownerLine = trim(($tenant['owner_name'] ?? '') . ' ' . (!empty($tenant['owner_phone']) ? '(' . $tenant['owner_phone'] . ')' : ''));
            $roomsSuffix = ($propertyTypeLabel === 'Multi-Key') ? ", {$roomCount} room(s)" : '';

            TelescopeLogger::log(
                'system',
                'New Property Created',
                "{$propertyName} ({$propertyTypeLabel}{$roomsSuffix}) - Telegram groups need pairing",
                'Tenant: ' . ($tenant['name'] ?? "#{$tenantId}") . (!empty($ownerLine) ? " | Owner: {$ownerLine}" : ''),
                [
                    'tenant_id' => $tenantId,
                    'property_id' => $propertyId,
                    'property_name' => $propertyName,
                    'property_type' => $propertyTypeLabel,
                    'owner_name' => $tenant['owner_name'] ?? null,
                    'owner_phone' => $tenant['owner_phone'] ?? null,
                ]
            );
        } catch (Exception $e) {
            // Non-fatal - see this function's own doc comment.
        }
    }
}

if (!function_exists('syncTenantSuperAdminAcrossProperties')) {
    function syncTenantSuperAdminAcrossProperties(PDO $pdo, $tenantId) {
        try {
            $stmt = $pdo->prepare("SELECT id FROM properties WHERE tenant_id = ? AND is_deleted = 0 AND property_type != 'MULTI_KEY_ROOM'");
            $stmt->execute([$tenantId]);
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $propId) {
                syncTenantSuperAdminRow($pdo, $tenantId, (int)$propId);
            }
        } catch (Exception $e) {
            // Non-fatal, same reasoning as syncTenantSuperAdminRow.
        }
    }
}

// === Global Error & Exception Handlers ===
// Registered AFTER logger.php's own set_error_handler/set_exception_handler (required at
// the top of this file) - PHP's set_error_handler()/set_exception_handler() each replace
// whatever was previously registered rather than chaining, so THIS handler - not
// logger.php's - is the one actually active for the rest of every router.php request.
// Kept as its own registration (not deleted/merged) because it does something
// logger.php's doesn't: it always returns a clean JSON 500 on an uncaught exception,
// so an API client gets a parseable error instead of a raw PHP fatal-error dump. But it
// was missing logger.php's E_NOTICE/E_WARNING skip (found 29 Aug 2026 while tracking
// down "Telescope sometimes shows nothing") - since this handler wins for the vast
// majority of real traffic (anything through router.php), every routine PHP
// notice/warning on every API call was logging to the 'php' portal, evicting genuinely
// rare errors out of that portal's 300-entry cap far faster than intended.
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    if ($errno === E_NOTICE || $errno === E_USER_NOTICE || $errno === E_WARNING || $errno === E_USER_WARNING) {
        return false;
    }
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
$public_actions = ['login_user', 'verify_admin_passcode', 'request_login_info', 'force_set_passcode', 'update_property', 'get_dummy_history_status', 'enable_dummy_history', 'disable_dummy_history', 'get_csrf_token', 'check_session', 'logout', 'get_tenant_by_slug', 'get_demo_login_credentials', 'get_system_settings', 'get_theme_settings', 'get_current_property', 'register_tenant_trial', 'channex_webhook', 'channex_airbnb_oauth_landing', 'get_public_booking_info', 'create_public_booking', 'fetch_ota_listing_preview'];


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

// Track login attempts specifically. This is the ONLY place a rate-limited/blocked attempt
// ever gets logged - RateLimiter::checkAndBlock() (inside the login_user case body, further
// down) exits before that case's own success/failure logging runs, so without this pre-check
// a blocked attempt would leave zero trace anywhere.
//
// BUG FIXED (25 Aug 2026, live report: "the log details don't show that I logged in root
// dashboard"): this used to read $_POST['username']/$_POST['password'], but the real
// login_user request body is JSON (see $input = json_decode(...) in the case body below) -
// $_POST is never populated for a JSON content-type, so this ALWAYS logged
// "Login attempt for user: unknown" / "[No Password Provided]" regardless of what was
// actually submitted or whether it succeeded. That bogus row (not the real login) is what
// showed up confusingly alongside the real success rows. Now reads the same JSON body the
// case handler does, so it reflects the real identifier and whether a passcode was sent.
if ($action === 'login_user') {
    $loginPreCheckInput = json_decode(file_get_contents('php://input'), true) ?: [];
    $login_username = trim($loginPreCheckInput['mobile_number'] ?? $loginPreCheckInput['username'] ?? $loginPreCheckInput['phone_number'] ?? ($_POST['username'] ?? '')) ?: 'unknown';
    $login_hasPasscode = !empty($loginPreCheckInput['passcode']) || !empty($loginPreCheckInput['password']) || !empty($_POST['password']);
    $login_status = $login_hasPasscode ? 'Attempting' : 'No Password Provided';
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
// get_subscription_summary/request_subscription_action added 3 Sep 2026: the
// Tenant Dashboard (/tenant_dashboard/, a `users`-table owner login) reaches
// these with an explicit tenant_id and no property_slug at all, same gap as
// save_nav_menu above - they re-run their own equivalent-or-stronger checks
// inline (isPropertyAccessAllowed() for the existing per-property path,
// isTenantAccessAllowed() for the tenant_id path) rather than relying on this
// gate, see the case block itself.
$tenant_scope_actions = ['get_tenant_properties', 'get_tenant_slot_usage', 'create_property_for_tenant', 'save_nav_menu', 'export_database_dump', 'get_subscription_summary', 'request_subscription_action'];

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
        // SECURITY (26 Aug 2026): logging removed entirely at the user's explicit request, after
        // a stray/stuck browser tab (an authenticated user's own tab pointed at a property outside
        // their tenant) generated a stream of these in Telescope's Security Audits portal. A 10-min
        // throttle (logThrottled(), see git history) was tried first but the user still didn't want
        // this surfaced as a log entry at all - the 403 below is unaffected and still denies access
        // exactly as before; only the Telescope entry is gone. If this is reconsidered later, the
        // removed logThrottled() call/comment in git history has the full incident + reasoning.
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Access denied for this property.']);
        exit;
    }
}

// Channel Manager ops console actions. All of them are available to an
// authenticated user with access to the property in scope - the universal
// gate above already enforced $is_authenticated_user + isPropertyAccessAllowed()
// for these (none are in $public_actions or $tenant_scope_actions). The
// property Super Admin runs the whole console: status, ARI push, outbox
// drain/retry, one-time content sync and webhook registration during
// onboarding. This block just gives a clearer 403 message than the generic
// "Access denied for this property." if something unauthenticated slips through.
$channex_ops_actions = [
    'channex_content_sync', 'channex_register_webhook', 'channex_retry_outbox',
    'channex_push_ari', 'channex_outbox_drain', 'get_channex_status',
];
if (in_array($action, $channex_ops_actions, true)) {
    $userRole = strtolower($_SESSION['role'] ?? '');
    $isAuthed = !empty($_SESSION['is_platform_admin'])
        || in_array($userRole, ['root_admin', 'super_admin', 'admin', 'staff_supervisor', 'supervisor', 'staff'], true)
        || !empty($_SESSION['user_id'])
        || !empty($_SESSION['tenant_id']);
    if (!$isAuthed) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Channel Manager operations are restricted to property administrators.']);
        exit;
    }
}

// PHP's default file-based session handler holds an exclusive lock on the
// session file for the entire request. With multiple tabs/windows open on
// the same login, every concurrent request serializes behind whichever one
// is currently running - a single slow request blocks every other tab's
// request, even totally unrelated ones, until it finishes. All session
// reads needed for auth/property resolution are done by this point, and the
// only actions that still need to write session data are login_user and
// logout, so it's safe to release the lock for everything else.
// (found 21 Aug 2026: 'logout' was missing from this exemption, so its
// session_status() === PHP_SESSION_ACTIVE check further down was always
// false by the time it ran - the clear-cookie/session_destroy() block never
// executed, "Sign Out Terminal" silently did nothing server-side, and the
// very next request on the same still-valid cookie re-authenticated the
// same user. See the 'logout' case's own comment for the full story.)
if ($action !== 'login_user' && $action !== 'logout') {
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
    'get_walk_in_tabs', 'get_walk_in_tab_history', 'open_walk_in_tab', 'bill_walk_in_tab',
    'get_menu', 'add_menu_item', 'update_menu_item', 'delete_menu_item', 'dedup_menu',
    'get_recipes', 'save_recipe', 'delete_recipe', 'deplete_stock',
    'get_staff_meal_options', 'add_staff_meal_option', 'get_staff_meal_logs', 'add_staff_meal_log',
    'get_inventory', 'update_stock',
    'get_stock_requests', 'create_stock_request', 'update_stock_request_status',
    'get_wastage_logs', 'create_wastage_log',
    'get_kitchen_purchases', 'create_kitchen_purchase', 'bulk_update_kitchen_purchases', 'delete_kitchen_purchase',
    'get_material_categories', 'update_material_category', 'delete_material_category', 'add_material_category',
    'toggle_ingredient_category', 'add_catalog_item', 'update_catalog_item', 'delete_catalog_item',
    'get_system_stock_catalog', 'get_system_stock_categories', 'add_system_stock_item', 'delete_system_stock_item', 'sync_default_stock_categories',
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
            // Property-switcher capability (28 Aug 2026, Header.tsx's Switch Property icon):
            // a session can switch between every property under one tenant either because
            // it's a staff account with access_all_properties (staff_tenant_id, set at login
            // - see login_user's staff_users branch), or because it's a tenant-owning account
            // (default_tenant_id, set at login for the users-table branch). Resolve whichever
            // applies once here so the frontend doesn't need to know the difference between
            // the two underlying mechanisms - it just gets "can this session switch, and to
            // which tenant".
            $switcherTenantId = $_SESSION['staff_tenant_id'] ?? $_SESSION['default_tenant_id'] ?? null;
            $canSwitchProperties = !empty($_SESSION['staff_access_all_properties']) || !empty($_SESSION['default_tenant_id']);
            $switcherTenantSlug = null;
            if ($canSwitchProperties && $switcherTenantId) {
                try {
                    $tSlugStmt = $pdo->prepare("SELECT slug FROM tenants WHERE id = ? LIMIT 1");
                    $tSlugStmt->execute([$switcherTenantId]);
                    $switcherTenantSlug = $tSlugStmt->fetchColumn() ?: null;
                } catch (Exception $e) {}
            }

            echo json_encode([
                'status' => 'success',
                'authenticated' => true,
                'is_public_demo_session' => !empty($_SESSION['is_public_demo_session']),
                'user' => [
                    'id' => $_SESSION['user_id'] ?? null,
                    'username' => $_SESSION['username'],
                    'name' => $_SESSION['full_name'] ?? null,
                    'role' => $_SESSION['role'] ?? 'Staff',
                    'property_id' => $_SESSION['property_id'] ?? null,
                    // performUnifiedLogin() returns this on login_user, but check_session
                    // never echoed it back - so a page reload (which rebuilds currentUser
                    // purely from check_session) lost the platform-admin flag. The
                    // Channel Manager ops console keys its visibility off this.
                    'is_platform_admin' => !empty($_SESSION['is_platform_admin']),
                    'can_switch_properties' => $canSwitchProperties && $switcherTenantId && $switcherTenantSlug ? true : false,
                    'tenant_id' => $canSwitchProperties ? $switcherTenantId : null,
                    'tenant_slug' => $canSwitchProperties ? $switcherTenantSlug : null,
                ],
            ]);
        } else {
            echo json_encode(['status' => 'success', 'authenticated' => false]);
        }
        break;

    // Actually invalidates the server-side session (found 21 Aug 2026: the
    // "Sign Out Terminal" button only ever cleared client-side React state
    // and a few localStorage keys via AuthContext.tsx's logout() - nothing
    // called the backend, so the PHP session cookie stayed valid and a
    // plain page navigation silently re-authenticated the exact same user.
    // On a shared front-desk terminal - which is what "Sign Out Terminal"
    // is for - that meant sign-out gave false confidence while the next
    // person to load the page inherited the previous session.) Clears
    // $_SESSION, expires the session cookie, and destroys the session.
    case 'logout':
        // Idempotent - a double-fired logout (or one against an already-expired
        // session) must not emit a "Trying to destroy uninitialized session"
        // warning (found 21 Aug 2026: it does without this guard, which also
        // corrupts the JSON response with PHP's inline warning HTML).
        if (session_status() === PHP_SESSION_ACTIVE) {
            $_SESSION = [];
            if (ini_get('session.use_cookies')) {
                $params = session_get_cookie_params();
                setcookie(session_name(), '', time() - 42000,
                    $params['path'], $params['domain'],
                    $params['secure'], $params['httponly']);
            }
            session_destroy();
        }
        echo json_encode(['status' => 'success', 'authenticated' => false]);
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

        // Credential-check/session-set/response-build logic lives in
        // performUnifiedLogin() (php/security/unified_login.php), shared with
        // php/api/authenticate.php - see that file's own header comment for why
        // this was extracted (29 Aug 2026, real behavioral drift found between
        // the two previously-independent copies).
        $loginResult = performUnifiedLogin($pdo, $rawIdentifier, $passcode, $rateLimiter, $rateLimitClientId);
        http_response_code($loginResult['status_code']);
        echo json_encode($loginResult['body']);
        exit;

    // Fast admin/root/tenant passcode verification
    case 'verify_admin_passcode':
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $passcode = trim($input['passcode'] ?? '');

        if (!$passcode) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Passcode is required']);
            exit;
        }

        $isValid = false;
        $matchedRole = null;
        $matchedName = null;

        try {
            // 1. Check Root Admin / Platform Admin passcodes in users table
            $stmt = $pdo->prepare("SELECT id, username, full_name, role, is_platform_admin, passcode, password FROM users WHERE is_platform_admin = 1 OR role = 'root_admin'");
            $stmt->execute();
            $rootUsers = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rootUsers as $ru) {
                $sp = $ru['passcode'] ?? '';
                $spw = $ru['password'] ?? '';
                if (($sp && $sp === $passcode) || ($spw && (password_verify($passcode, $spw) || $spw === $passcode))) {
                    $isValid = true;
                    $matchedRole = 'Root Admin';
                    $matchedName = $ru['full_name'] ?: $ru['username'];
                    break;
                }
            }

            // 2. Check Super Admin / Tenant Admin / Property Admins in users table
            if (!$isValid) {
                $stmt = $pdo->prepare("
                    SELECT u.id, u.username, u.full_name, u.role, u.passcode, u.password
                    FROM users u
                    WHERE (u.role IN ('super_admin', 'Super Admin', 'Admin') OR u.default_tenant_id IS NOT NULL)
                      AND (u.is_platform_admin = 0 OR u.is_platform_admin IS NULL)
                ");
                $stmt->execute();
                $tenantUsers = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($tenantUsers as $tu) {
                    $sp = $tu['passcode'] ?? '';
                    $spw = $tu['password'] ?? '';
                    if (($sp && $sp === $passcode) || ($spw && (password_verify($passcode, $spw) || $spw === $passcode))) {
                        $isValid = true;
                        $matchedRole = 'Super Admin';
                        $matchedName = $tu['full_name'] ?: $tu['username'];
                        break;
                    }
                }
            }

            // 3. Check staff_users table for Super Admin / Admin
            if (!$isValid) {
                $stmt = $pdo->prepare("
                    SELECT id, username, full_name, role, passcode
                    FROM staff_users
                    WHERE role IN ('Super Admin', 'Admin') AND status = 'Active'
                ");
                $stmt->execute();
                $staffAdmins = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($staffAdmins as $sa) {
                    if (($sa['passcode'] ?? '') === $passcode) {
                        $isValid = true;
                        $matchedRole = $sa['role'];
                        $matchedName = $sa['full_name'] ?: $sa['username'];
                        break;
                    }
                }
            }

            // 4. Emergency fallback check
            if (!$isValid) {
                $emergencyPassword = getenv('EMERGENCY_ADMIN_PASSWORD');
                if (!empty($emergencyPassword) && $passcode === $emergencyPassword) {
                    $isValid = true;
                    $matchedRole = 'Root Admin';
                    $matchedName = 'Emergency Admin';
                }
            }
        } catch (Exception $e) {
            error_log("verify_admin_passcode error: " . $e->getMessage());
        }

        echo json_encode([
            'success' => $isValid,
            'role' => $matchedRole,
            'name' => $matchedName,
            'message' => $isValid ? 'Passcode verified' : 'Invalid passcode'
        ]);
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
                . "<p>Here are your Ground Code login details:</p>"
                . "<p><b>Mobile Number / Username:</b> {$user['username']}<br>"
                . "<b>Passcode:</b> {$user['passcode']}</p>"
                . "<p><a href=\"{$loginUrl}\">Log in here</a></p>"
                . "<p style=\"color:#888;font-size:12px;\">Didn't request this? You can safely ignore this email.</p>";

            $emailResult = sendSmtpEmail($pdo, $user['tenant_email'], 'Your Ground Code login details', $body);
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

    // --- CRON JOBS (Root Admin) ---
    // See php/cron/cron_jobs.php - lets Root Admin view/toggle/reschedule/
    // manually trigger every registered scheduled task without SSH.
    case 'get_cron_jobs':
    case 'update_cron_job':
    case 'run_cron_job_now':
    case 'get_cron_job_log':
        handleCronJobsRequests($pdo, $request_method, $action);
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

            // Captured before the session is resynced below, so the audit
            // entry names who this account WAS logged in as when the change
            // was made, not the just-changed value.
            $auditUserBefore = $_SESSION['username'] ?? $newUsername;

            // Keep the session username in sync so the header/sidebar reflect the change immediately.
            if ($newUsername !== ($profileUser['username'] ?? '')) {
                $_SESSION['username'] = $newUsername;
            }

            echo json_encode([
                'success' => true,
                'message' => $newPasscode ? 'Account details and passcode updated' : 'Account details updated',
            ]);

            // Audit trail (24 Aug 2026) - Root Admin's own account settings,
            // including their passcode, had no audit trail at all. Never logs
            // the actual passcode value, only that it changed.
            try {
                $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
                $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                $actionMsg = 'Root Admin updated own account profile' . ($newPasscode ? ' (passcode changed)' : '');
                $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (property_id, action, timestamp, user, ip_address, user_agent, status, module) VALUES (?, ?, NOW(), ?, ?, ?, 'Success', 'platform_admin')");
                $stmtAudit->execute([1, $actionMsg, $auditUserBefore, $ip, $ua]);
            } catch (Exception $eAudit) {}
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
            $maxProps = max(1, (int)($input['max_properties'] ?? 1));
            $planType = $input['plan_type'] ?? 'Growth';
            $expiryDate = !empty($input['subscription_expires_at']) ? $input['subscription_expires_at'] : date('Y-m-d', strtotime('+30 days'));

            $stmt = $pdo->prepare("
                INSERT INTO tenants (name, slug, email, phone, subscription_plan, subscription_status, max_properties, is_active, subscription_expires_at, plan_type)
                VALUES (?, ?, ?, ?, 'free', 'trial', ?, 1, ?, ?)
            ");
            $stmt->execute([$name, $slug, $email ?: null, $phone ?: null, $maxProps, $expiryDate, $planType]);
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
                        $emailResult = sendSmtpEmail($pdo, $email, "Welcome to Ground Code, {$name}!", nl2br(htmlspecialchars($renderedMessage)));
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

            // Audit trail (24 Aug 2026, extending the platform_admin sweep) -
            // tenant provisioning, same gap as everything else fixed in this
            // pass.
            try {
                $auditUser = $_SESSION['username'] ?? 'Root Admin';
                $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
                $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                $actionMsg = "Created tenant: {$name} ({$slug})";
                $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (property_id, action, timestamp, user, ip_address, user_agent, status, module) VALUES (?, ?, NOW(), ?, ?, ?, 'Success', 'platform_admin')");
                $stmtAudit->execute([1, $actionMsg, $auditUser, $ip, $ua]);
            } catch (Exception $eAudit) {}
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
            'from_name' => $input['smtp_from_name'] ?? 'Ground Code',
            'encryption' => $input['smtp_encryption'] ?? 'tls',
        ];
        $result = sendSmtpEmail($pdo, $to, 'Ground Code - SMTP Test', '<p>This is a test email from your Ground Code Root Admin dashboard. If you received this, SMTP is configured correctly.</p>', $overrideSettings);
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
            // Perf (14 Aug 2026, auditdb.md): was a correlated subquery re-run
            // for every tenant row (and a nested correlated subquery inside
            // that, for every MULTI_KEY property) - O(N*M). Rewritten as a
            // single-pass LEFT JOIN with room counts pre-aggregated once,
            // O(N). Verified equivalent by hand across every case (zero
            // properties, MULTI_KEY with/without rooms, mixed single+
            // multi-key tenants) before applying - same slots_used total
            // either way.
            $stmt = $pdo->query("
                SELECT t.*,
                    COALESCE(SUM(
                        CASE
                            WHEN p.property_type = 'MULTI_KEY' THEN COALESCE(r.room_count, 0)
                            WHEN p.id IS NOT NULL THEN 1
                            ELSE 0
                        END
                    ), 0) AS slots_used
                FROM tenants t
                LEFT JOIN properties p ON p.tenant_id = t.id AND (p.property_type IS NULL OR p.property_type != 'MULTI_KEY_ROOM') AND p.is_active = 1
                LEFT JOIN (
                    SELECT parent_property_id, COUNT(*) AS room_count
                    FROM properties
                    WHERE property_type = 'MULTI_KEY_ROOM' AND is_deleted = 0
                    GROUP BY parent_property_id
                ) r ON r.parent_property_id = p.id
                GROUP BY t.id
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

            // This tenant's login now exists (or changed) - push it out as the
            // one true Super Admin on every one of their properties.
            syncTenantSuperAdminAcrossProperties($pdo, $tenant_id);

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

            // Keep every property's synced Super Admin row's passcode current too.
            syncTenantSuperAdminAcrossProperties($pdo, $tenant_id);

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

    // Root-admin edit of the Super Admin's editable identity fields (Name,
    // Passcode, QR code) directly from a property's Staff & Permissions page
    // (StaffManagement.tsx's "Modify Team Member" modal, locked down to just
    // this trio for the Super Admin row - added 14 Aug 2026 alongside hiding
    // Role/Cash Handling/Access All Properties out of that same modal, since
    // those are permanently fixed for Super Admin, never editable). Narrower
    // than reset_tenant_login above: this lets Root Admin set a SPECIFIC
    // name/passcode (not a random forced-reset one). Username is deliberately
    // NOT accepted here - changing the tenant's actual login phone number
    // stays on the dedicated tenant-login flows above, not this per-property
    // modal. Writes to `users` (the source of truth) then resyncs every
    // property's staff_users row from it - never touches this property's
    // staff_users row directly for name/passcode, which is exactly the
    // desync bug fixed earlier this session (see syncTenantSuperAdminRow's
    // doc comment above).
    case 'update_tenant_super_admin':
        if (!($_SESSION['is_platform_admin'] ?? false)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Root admin access required']);
            exit;
        }
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $tenant_id = $input['tenant_id'] ?? '';
        $property_id = $input['property_id'] ?? '';
        $full_name = trim($input['full_name'] ?? '');
        $passcode = trim($input['passcode'] ?? '');
        $qr_code_url = $input['qr_code_url'] ?? '';
        $upi_id = trim($input['upi_id'] ?? '');
        if (!$tenant_id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'tenant_id required']);
            exit;
        }
        if ($full_name === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Staff Name is required']);
            exit;
        }
        if ($passcode !== '' && !preg_match('/^\d{6}$/', $passcode)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Passcode must be exactly 6 digits']);
            exit;
        }
        try {
            $existingStmt = $pdo->prepare("
                SELECT id FROM users WHERE default_tenant_id = ? AND (is_platform_admin = 0 OR is_platform_admin IS NULL) LIMIT 1
            ");
            $existingStmt->execute([$tenant_id]);
            $existing = $existingStmt->fetch();
            if (!$existing) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'This tenant has no login yet - use Create Login instead']);
                exit;
            }

            if ($passcode !== '') {
                $pdo->prepare("UPDATE users SET full_name = ?, passcode = ? WHERE id = ?")
                    ->execute([$full_name, $passcode, $existing['id']]);
            } else {
                $pdo->prepare("UPDATE users SET full_name = ? WHERE id = ?")
                    ->execute([$full_name, $existing['id']]);
            }

            // Push the updated name/passcode out to every property's mirrored row.
            syncTenantSuperAdminAcrossProperties($pdo, $tenant_id);

            // QR code / UPI ID are per-property display fields, not part of the
            // tenant's login identity - the sync above deliberately never touches
            // them, so apply them directly to the property actually being edited.
            if ($qr_code_url !== '' && $property_id !== '') {
                $pdo->prepare("UPDATE staff_users SET qr_code_url = ? WHERE property_id = ? AND role = 'Super Admin'")
                    ->execute([$qr_code_url, $property_id]);
            }
            if ($property_id !== '') {
                $pdo->prepare("UPDATE staff_users SET upi_id = ? WHERE property_id = ? AND role = 'Super Admin'")
                    ->execute([$upi_id ?: null, $property_id]);
            }

            echo json_encode(['success' => true, 'message' => 'Super Admin updated successfully']);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    // Tenant Super Admin or Root Admin changes their own login passcode
    case 'change_super_admin_passcode':
    case 'change_my_passcode':
        $userId = $_SESSION['user_id'] ?? 0;
        $sessionUsername = $_SESSION['username'] ?? '';
        $tenantId = $_SESSION['default_tenant_id'] ?? $_SESSION['tenant_id'] ?? null;

        if (!$userId && !$sessionUsername && !$tenantId) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Authentication required']);
            exit;
        }

        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $currentPasscode = trim($input['current_passcode'] ?? '');
        $newPasscode = trim($input['new_passcode'] ?? '');

        if (!$currentPasscode) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Current passcode is required']);
            exit;
        }

        if (!$newPasscode || !preg_match('/^\d{6}$/', $newPasscode)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'New passcode must be exactly 6 digits']);
            exit;
        }

        try {
            $user = null;
            if ($userId) {
                $stmt = $pdo->prepare("SELECT id, username, passcode, password, default_tenant_id FROM users WHERE id = ? LIMIT 1");
                $stmt->execute([$userId]);
                $user = $stmt->fetch();
            }
            if (!$user && $sessionUsername) {
                $stmt = $pdo->prepare("SELECT id, username, passcode, password, default_tenant_id FROM users WHERE username = ? OR phone_number = ? LIMIT 1");
                $stmt->execute([$sessionUsername, $sessionUsername]);
                $user = $stmt->fetch();
            }
            if (!$user && $tenantId) {
                $stmt = $pdo->prepare("SELECT id, username, passcode, password, default_tenant_id FROM users WHERE default_tenant_id = ? AND (is_platform_admin = 0 OR is_platform_admin IS NULL) LIMIT 1");
                $stmt->execute([$tenantId]);
                $user = $stmt->fetch();
            }

            if (!$user) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'User account not found']);
                exit;
            }

            $storedPasscode = $user['passcode'] ?? '';
            $storedPassword = $user['password'] ?? '';
            $currentValid = ($storedPasscode && $storedPasscode === $currentPasscode)
                || ($storedPassword && password_verify($currentPasscode, $storedPassword))
                || ($storedPassword && $storedPassword === $currentPasscode);

            if (!$currentValid) {
                http_response_code(401);
                echo json_encode(['success' => false, 'message' => 'Current passcode is incorrect']);
                exit;
            }

            $pdo->prepare("UPDATE users SET passcode = ?, must_change_passcode = 0 WHERE id = ?")
                ->execute([$newPasscode, $user['id']]);

            $targetTenantId = $user['default_tenant_id'] ?? $tenantId;
            if (!empty($targetTenantId) && function_exists('syncTenantSuperAdminAcrossProperties')) {
                syncTenantSuperAdminAcrossProperties($pdo, $targetTenantId);
            }

            try {
                $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
                $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                $stmt = $pdo->prepare("INSERT INTO audit_logs (property_id, action, timestamp, user, ip_address, user_agent, status, module) VALUES (?, 'change_passcode', NOW(), ?, ?, ?, 'success', 'account')");
                $stmt->execute([$propertyId ?: 0, $user['username'] ?? 'super_admin', $ip, $ua]);
            } catch (Exception $ea) {}

            echo json_encode(['success' => true, 'message' => 'Passcode changed successfully']);
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
                SELECT id, name, slug, max_properties, subscription_plan, subscription_status, is_active, is_demo
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
        // Public demo auto-login is a sales/testing aid - never let an
        // anonymous production visitor get auto-logged into it. See
        // APP_DEMO_DATA_ENABLED in config/database.php.
        if (!APP_DEMO_DATA_ENABLED) {
            echo json_encode(['success' => false, 'message' => 'Not a public demo property']);
            exit;
        }
        $demoSlug = $_GET['property_slug'] ?? '';
        if (!$demoSlug) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'property_slug required']);
            exit;
        }
        try {
            $stmt = $pdo->prepare("SELECT id, tenant_id FROM properties WHERE slug = ? AND is_public_demo = 1 AND is_deleted = 0 LIMIT 1");
            $stmt->execute([$demoSlug]);
            $demoProperty = $stmt->fetch();
            if (!$demoProperty) {
                echo json_encode(['success' => false, 'message' => 'Not a public demo property']);
                exit;
            }
            $demoPropertyId = $demoProperty['id'];

            // Prefer logging the demo visitor in AS THE TENANT (13 Aug 2026):
            // that's the one true Super Admin (see syncTenantSuperAdminRow) and
            // some nav items are gated to 'Super Admin' specifically, not just
            // any high-privilege role (iCal Sync, Data Export Center, Telegram
            // Bot config, Past Receipts Log, ...) - a prospective client viewing
            // the demo needs to see everything, so nothing less than the real
            // tenant identity actually shows the full product. Falls back to
            // the best available staff row only if this demo tenant somehow
            // has no login yet.
            $tenantStmt = $pdo->prepare("
                SELECT username, passcode FROM users
                WHERE default_tenant_id = ? AND (is_platform_admin = 0 OR is_platform_admin IS NULL)
                LIMIT 1
            ");
            $tenantStmt->execute([$demoProperty['tenant_id']]);
            $tenantLogin = $tenantStmt->fetch();
            if ($tenantLogin) {
                echo json_encode(['success' => true, 'username' => $tenantLogin['username'], 'passcode' => $tenantLogin['passcode']]);
                exit;
            }

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
        // status (26 Aug 2026): the owner-facing Property Setup Wizard creates the property
        // immediately after its first (mandatory-fields) step, as 'draft' rather than 'active', so
        // "Save & Exit" mid-wizard has something real to save - the property already exists, just
        // incomplete, and every later step saves into it via the existing update_property action
        // (which already accepts 'status' - see that case below - so publishing on the wizard's
        // final step is just update_property({status: 'active'}), no new endpoint needed). Defaults
        // to 'active' so every OTHER existing caller of this action (Root Admin's own flows, any
        // direct API use) is completely unaffected.
        $property_status = in_array($input['status'] ?? '', ['draft', 'active'], true) ? $input['status'] : 'active';
        // Extended fields (26 Aug 2026) - the owner-facing Property Setup Wizard collects the same
        // detail set as the Edit Property page up front, at creation time, rather than leaving a
        // brand-new property with every one of these blank until the owner separately visits Edit
        // Property later. All genuinely optional (only name/slug/type were ever required here) -
        // see PropertyEditForm.tsx for the matching edit-time field set this mirrors.
        $property_address = trim($input['address'] ?? '');
        $property_maps_link = trim($input['google_maps_link'] ?? '');
        $property_gstin = strtoupper(trim($input['gstin'] ?? ''));
        $property_upi_id = trim($input['upi_id'] ?? '');
        $property_upi_qr_url = trim($input['upi_qr_code_url'] ?? '');
        $property_instructions = trim($input['instructions'] ?? '');
        $property_checkin_time = trim($input['checkin_time'] ?? '') ?: '14:00';
        $property_checkout_time = trim($input['checkout_time'] ?? '') ?: '11:00';
        $property_walk_in_tables = isset($input['walk_in_table_count']) && $input['walk_in_table_count'] !== ''
            ? max(1, (int)$input['walk_in_table_count']) : 10;
        // Currency (30 Aug 2026). The properties.currency column has existed all
        // along but nothing could ever set it - no form field, no API parameter -
        // so every property was stuck on the 'INR' default. That's a hard ceiling
        // for a multi-tenant product: a tenant outside India could never be
        // onboarded correctly. Defaults to INR so existing callers are unchanged.
        $property_currency = strtoupper(trim($input['currency'] ?? '')) ?: 'INR';
        if (!preg_match('/^[A-Z]{3}$/', $property_currency)) {
            $property_currency = 'INR';
        }
        // Default tariff only meaningful for a SINGLE property/room-level pricing - a MULTI_KEY
        // parent isn't itself bookable (see PropertyEditForm.tsx's identical gate), so this is
        // simply never applied on that branch below regardless of what's sent.
        $property_default_tariff = ($input['default_tariff'] ?? '') !== '' && is_numeric($input['default_tariff'])
            ? (float)$input['default_tariff'] : null;
        // Kitchen module (26 Aug 2026): collected as a mandatory Yes/No in the wizard's first step,
        // applied via toggle_property_module AFTER creation (below) rather than a properties-table
        // column - 'kitchen' is a property_modules row, same as every other module toggle (see
        // module_manager.php's ALWAYS_ENABLED_MODULES_EXCEPT). Defaults true (kitchen ON) to match
        // system_modules.default_enabled, so an old caller that never sends this (Root Admin's own
        // create_multikey_property flow, for one) keeps today's behavior unchanged.
        $property_has_kitchen = !array_key_exists('has_kitchen', $input) || !empty($input['has_kitchen']);

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
                $stmt = $pdo->prepare("INSERT INTO properties (tenant_id, name, slug, property_type, status, is_active, tailwind_color_scheme, email, phone) VALUES (?, ?, ?, 'MULTI_KEY', ?, 1, 'blue', ?, ?)");
                $stmt->execute([$tenant_id, $property_name, $property_slug, $property_status, $property_email ?: null, $property_phone ?: null]);
                $parentId = $pdo->lastInsertId();
                for ($i = 1; $i <= $room_count; $i++) {
                    $roomSlug = $property_slug . '-room-' . $i;
                    $roomName = $property_name . ' - Room ' . $i;
                    $pdo->prepare("INSERT INTO properties (tenant_id, name, slug, property_type, parent_property_id, status, is_active, tailwind_color_scheme) VALUES (?, ?, ?, 'MULTI_KEY_ROOM', ?, 'active', 1, 'blue')")
                        ->execute([$tenant_id, $roomName, $roomSlug, $parentId]);
                }
                // Extended details apply to the PARENT row only - not default_tariff (a MULTI_KEY
                // parent isn't itself bookable; each room gets its own tariff separately via
                // RoomsManagement.tsx, outside this wizard's scope).
                $pdo->prepare("
                    UPDATE properties SET address = ?, google_maps_link = ?, gstin = ?, upi_id = ?,
                        upi_qr_code_url = ?, instructions = ?, checkin_time = ?, checkout_time = ?,
                        walk_in_table_count = ?, currency = ?
                    WHERE id = ?
                ")->execute([
                    $property_address ?: null, $property_maps_link ?: null, $property_gstin ?: null,
                    $property_upi_id ?: null, $property_upi_qr_url ?: null, $property_instructions ?: null,
                    $property_checkin_time, $property_checkout_time, $property_walk_in_tables,
                    $property_currency, $parentId,
                ]);
                // Child rooms inherit the parent's currency - a room can never be
                // priced in a different currency from the property it belongs to.
                $pdo->prepare("UPDATE properties SET currency = ? WHERE parent_property_id = ?")
                    ->execute([$property_currency, $parentId]);
                syncTenantSuperAdminRow($pdo, $tenant_id, $parentId);
                if (!$property_has_kitchen) {
                    disableKitchenModuleForNewProperty($pdo, $parentId);
                }
                $pdo->commit();
                notifyAdminOfNewProperty($pdo, $tenant_id, $parentId, $property_name, 'Multi-Key', $room_count);
                echo json_encode(['success' => true, 'message' => "Multi-key property created with {$room_count} room(s)", 'property_id' => $parentId]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO properties (tenant_id, name, slug, property_type, status, is_active, tailwind_color_scheme, email, phone) VALUES (?, ?, ?, 'SINGLE', ?, 1, 'blue', ?, ?)");
                $stmt->execute([$tenant_id, $property_name, $property_slug, $property_status, $property_email ?: null, $property_phone ?: null]);
                $propertyId = $pdo->lastInsertId();
                $pdo->prepare("
                    UPDATE properties SET address = ?, google_maps_link = ?, gstin = ?, upi_id = ?,
                        upi_qr_code_url = ?, instructions = ?, checkin_time = ?, checkout_time = ?,
                        walk_in_table_count = ?, default_tariff = ?, currency = ?
                    WHERE id = ?
                ")->execute([
                    $property_address ?: null, $property_maps_link ?: null, $property_gstin ?: null,
                    $property_upi_id ?: null, $property_upi_qr_url ?: null, $property_instructions ?: null,
                    $property_checkin_time, $property_checkout_time, $property_walk_in_tables,
                    $property_default_tariff, $property_currency, $propertyId,
                ]);
                syncTenantSuperAdminRow($pdo, $tenant_id, $propertyId);
                if (!$property_has_kitchen) {
                    disableKitchenModuleForNewProperty($pdo, $propertyId);
                }
                $pdo->commit();
                notifyAdminOfNewProperty($pdo, $tenant_id, $propertyId, $property_name, 'Single', 1);
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

            // Snapshot the plan/expiry BEFORE overwriting them, so the history row
            // below can record what actually changed rather than just the new value.
            $beforeStmt = $pdo->prepare("SELECT plan_type, subscription_expires_at FROM tenants WHERE id = ? LIMIT 1");
            $beforeStmt->execute([$id]);
            $before = $beforeStmt->fetch(PDO::FETCH_ASSOC) ?: [];

            $newPlanType = $input['plan_type'] ?? 'Growth';
            $newExpiresAt = !empty($input['subscription_expires_at']) ? $input['subscription_expires_at'] : null;

            $stmt = $pdo->prepare("
                UPDATE tenants
                SET name = ?, slug = COALESCE(?, slug), email = ?, phone = ?, subscription_status = ?, is_active = ?, is_demo = ?, max_properties = COALESCE(?, max_properties), subscription_expires_at = ?, plan_type = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $input['name'] ?? '',
                $slug,
                $input['email'] ?? null,
                $input['phone'] ?? null,
                $input['subscription_status'] ?? 'trial',
                $input['is_active'] ?? 0,
                !empty($input['is_demo']) ? 1 : 0,
                isset($input['max_properties']) ? (int)$input['max_properties'] : null,
                $newExpiresAt,
                $newPlanType,
                $id
            ]);
            echo json_encode(['success' => true, 'message' => 'Tenant updated successfully']);

            // Renewal history (27 Aug 2026, see PRODUCT_STRATEGY.md) - only write a row
            // when the plan/expiry actually changed, or the caller explicitly attached a
            // renewal_note (e.g. a UPI/NEFT reference for a payment just received), so
            // routine unrelated edits (fixing a phone number, toggling is_active) don't
            // pollute the renewal trail with no-op entries.
            $renewalNote = isset($input['renewal_note']) ? trim((string)$input['renewal_note']) : '';
            $planChanged = ($before['plan_type'] ?? null) !== $newPlanType;
            $expiryChanged = ($before['subscription_expires_at'] ?? null) !== $newExpiresAt;
            if ($planChanged || $expiryChanged || $renewalNote !== '') {
                try {
                    $histStmt = $pdo->prepare("INSERT INTO tenant_subscription_history (tenant_id, old_plan_type, new_plan_type, old_expires_at, new_expires_at, note, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?)");
                    $histStmt->execute([
                        $id,
                        $before['plan_type'] ?? null,
                        $newPlanType,
                        $before['subscription_expires_at'] ?? null,
                        $newExpiresAt,
                        $renewalNote !== '' ? $renewalNote : null,
                        $_SESSION['username'] ?? 'Root Admin',
                    ]);
                } catch (Exception $eHist) {}
            }

            // Audit trail (24 Aug 2026, extending the platform_admin sweep) -
            // includes is_active, since deactivating a tenant here blocks that
            // tenant's access to the whole app - a change worth a record on its
            // own, not just folded into a generic "tenant updated".
            try {
                $auditUser = $_SESSION['username'] ?? 'Root Admin';
                $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
                $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                $activeLabel = !empty($input['is_active']) ? 'active' : 'inactive';
                $subStatusLabel = $input['subscription_status'] ?? 'trial';
                $actionMsg = "Updated tenant #{$id}: " . ($input['name'] ?? '') . " ({$slug}), status {$subStatusLabel}, {$activeLabel}";
                $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (property_id, action, timestamp, user, ip_address, user_agent, status, module) VALUES (?, ?, NOW(), ?, ?, ?, 'Success', 'platform_admin')");
                $stmtAudit->execute([1, $actionMsg, $auditUser, $ip, $ua]);
            } catch (Exception $eAudit) {}
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    // Read-only renewal trail for the Edit Owner drawer (27 Aug 2026) - see the
    // tenant_subscription_history self-heal and update_tenant's insert above.
    case 'get_tenant_subscription_history':
        $tenantId = $_GET['tenant_id'] ?? '';
        if (!$tenantId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'tenant_id required']);
            exit;
        }
        try {
            $stmt = $pdo->prepare("SELECT * FROM tenant_subscription_history WHERE tenant_id = ? ORDER BY recorded_at DESC LIMIT 50");
            $stmt->execute([$tenantId]);
            echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
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

            // Captured before the UPDATE below so a QR-code replacement can
            // delete the file the old URL pointed at once the new one is
            // safely saved - see php/uploads/image_cleanup.php. Only
            // queried when the field is actually part of this save.
            $oldUpiQrCodeUrl = null;
            if (array_key_exists('upi_qr_code_url', $input)) {
                $oldUrlStmt = $pdo->prepare("SELECT upi_qr_code_url FROM properties WHERE id = ?");
                $oldUrlStmt->execute([$property_id]);
                $oldUpiQrCodeUrl = $oldUrlStmt->fetchColumn() ?: null;
            }

            if (isset($input['status'])) {
                $sets[] = 'status = ?';
                $params[] = $input['status'];
                if ($input['status'] === 'active' || $input['status'] === 'inactive') {
                    $sets[] = 'is_active = ?';
                    $params[] = ($input['status'] === 'active') ? 1 : 0;
                }
            }
            if (array_key_exists('is_active', $input)) {
                $sets[] = 'is_active = ?';
                $params[] = $input['is_active'] ? 1 : 0;
                if (!isset($input['status'])) {
                    $sets[] = 'status = ?';
                    $params[] = $input['is_active'] ? 'active' : 'inactive';
                }
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
            // See create_property_for_tenant's own comment: the column existed
            // but nothing could set it, so every property was stuck on INR.
            // Ignored rather than rejected if malformed - a bad value here must
            // not fail an otherwise valid property save.
            if (array_key_exists('currency', $input)) {
                $cur = strtoupper(trim((string)$input['currency']));
                if (preg_match('/^[A-Z]{3}$/', $cur)) {
                    $sets[] = 'currency = ?';
                    $params[] = $cur;
                }
            }
            if (array_key_exists('upi_id', $input)) {
                $sets[] = 'upi_id = ?';
                $params[] = trim($input['upi_id']) ?: null;
            }
            if (array_key_exists('upi_qr_code_url', $input)) {
                $sets[] = 'upi_qr_code_url = ?';
                $params[] = trim($input['upi_qr_code_url']) ?: null;
            }
            if (array_key_exists('walk_in_table_count', $input)) {
                // Clamp to a sane range rather than trusting the client outright -
                // 0/negative would make the walk-in picker unusable, and there's
                // no realistic property with hundreds of physical tables.
                $rawCount = (int) $input['walk_in_table_count'];
                $sets[] = 'walk_in_table_count = ?';
                $params[] = max(1, min(200, $rawCount ?: 10));
            }
            if (array_key_exists('telegram_template_customization_enabled', $input)) {
                $sets[] = 'telegram_template_customization_enabled = ?';
                $params[] = $input['telegram_template_customization_enabled'] ? 1 : 0;
            }
            if (array_key_exists('telegram_bot_token', $input)) {
                $sets[] = 'telegram_bot_token = ?';
                $params[] = trim($input['telegram_bot_token']) ?: null;
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

            // Captured before 'updated_at'/id get appended below, so this only
            // ever lists real, human-editable fields (e.g. ['gstin'], not
            // ['gstin', 'updated_at']).
            $changedColumns = array_map(function ($s) {
                return trim(explode('=', $s)[0]);
            }, $sets);

            $sets[] = 'updated_at = CURRENT_TIMESTAMP';
            $params[] = $property_id;

            $stmt = $pdo->prepare("UPDATE properties SET " . implode(', ', $sets) . " WHERE id = ?");
            $stmt->execute($params);

            // Delete the old QR file now that the new value (or removal) is
            // safely committed. deleteReplacedImage() itself no-ops when the
            // value didn't actually change, so this is safe to call
            // unconditionally whenever the field was part of this save.
            if ($oldUpiQrCodeUrl !== null) {
                $newUpiQrCodeUrl = array_key_exists('upi_qr_code_url', $input) ? (trim($input['upi_qr_code_url']) ?: null) : null;
                deleteReplacedImage($oldUpiQrCodeUrl, $newUpiQrCodeUrl);
            }

            if ($stmt->rowCount() > 0) {
                echo json_encode(['success' => true, 'message' => 'Property updated successfully']);

                // Audit trail (24 Aug 2026, added - reported live: "I just added
                // gstin for artistfarm but its not shown in staff activity").
                // This whole update_property action had never written to
                // audit_logs at all - not a display bug, a real gap, unlike every
                // other write module (billing.php, receipts.php, inventory.php,
                // telegram/manager.php) which already logs its own action here.
                // Lists which fields actually changed by human-readable label
                // (e.g. "Updated Artists Farm Jaipur: GSTIN") rather than a
                // generic "Property updated", so it's actually useful to read
                // later. Wrapped in try/catch, same as every other module's audit
                // insert - a failed audit write must never turn an
                // already-successful save into an error response.
                try {
                    $fieldLabels = [
                        'status' => 'Status', 'name' => 'Property Name', 'email' => 'Email',
                        'phone' => 'Contact Phone', 'gstin' => 'GSTIN', 'upi_id' => 'UPI ID',
                        'upi_qr_code_url' => 'UPI QR Code', 'walk_in_table_count' => 'Walk-in Table Count',
                        'telegram_template_customization_enabled' => 'Telegram Template Customization',
                        'google_maps_link' => 'Google Maps Link', 'address' => 'Address',
                        'instructions' => 'Instructions', 'checkin_time' => 'Check-in Time',
                        'checkout_time' => 'Check-out Time', 'default_tariff' => 'Default Tariff',
                        'whatsapp_voucher_template' => 'WhatsApp Voucher Template',
                    ];
                    $changedLabels = array_map(function ($c) use ($fieldLabels) {
                        return $fieldLabels[$c] ?? $c;
                    }, $changedColumns);

                    $propNameStmt = $pdo->prepare("SELECT name FROM properties WHERE id = ?");
                    $propNameStmt->execute([$property_id]);
                    $propName = $propNameStmt->fetchColumn() ?: "Property #$property_id";

                    // $is_authenticated_user's session case has a real staff
                    // username; the public property-setup path (see above) proved
                    // ownership via tenant/property slug instead of a login, so
                    // falls back to that slug rather than showing a blank user.
                    $auditUser = $_SESSION['username'] ?? (trim($input['tenant_slug'] ?? '') ?: 'Property Setup');
                    $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
                    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                    $actionMsg = "Updated {$propName}: " . implode(', ', $changedLabels);

                    $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (property_id, action, timestamp, user, ip_address, user_agent, status, module) VALUES (?, ?, NOW(), ?, ?, ?, 'Success', 'property_settings')");
                    $stmtAudit->execute([$property_id, $actionMsg, $auditUser, $ip, $ua]);
                } catch (Exception $eAudit) {}
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

            // Audit trail (24 Aug 2026, extending the sweep started on
            // update_property/staff CRUD/save_nav_menu - Root Admin's own
            // property/tenant lifecycle actions had the exact same gap: real
            // account-provisioning/deletion events with zero record of who did
            // them or when).
            try {
                $auditUser = $_SESSION['username'] ?? 'Root Admin';
                $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
                $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                $actionMsg = "Created property: {$name} ({$slug})";
                $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (property_id, action, timestamp, user, ip_address, user_agent, status, module) VALUES (?, ?, NOW(), ?, ?, ?, 'Success', 'platform_admin')");
                $stmtAudit->execute([$property_id, $actionMsg, $auditUser, $ip, $ua]);
            } catch (Exception $eAudit) {}
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

            if ($ok) {
                // Audit trail (24 Aug 2026) - Root Admin's own property-editing
                // endpoint (distinct from the tenant-facing update_property
                // above, which already got this fix), had the same gap.
                try {
                    $auditUser = $_SESSION['username'] ?? 'Root Admin';
                    $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
                    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                    $actionMsg = "Root Admin updated property #{$property_id}: " . ($input['name'] ?? '') . ' (' . ($input['slug'] ?? '') . '), status ' . ($input['status'] ?? 'active');
                    $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (property_id, action, timestamp, user, ip_address, user_agent, status, module) VALUES (?, ?, NOW(), ?, ?, ?, 'Success', 'platform_admin')");
                    $stmtAudit->execute([$property_id, $actionMsg, $auditUser, $ip, $ua]);
                } catch (Exception $eAudit) {}
            }
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

    // Root Admin's "White-Glove Telegram Bot Token" field (PlatformPropertyManagement.tsx) used to
    // write only to `properties.telegram_bot_token`, a column nothing else in the app ever read -
    // the real source of truth pairing/sending actually uses is `property_modules.config.botToken`
    // (see pairingBotToken()/getPropertyTelegramConfig() in php/telegram/pairing.php + sender.php),
    // which this field never touched at all. Found live 26 Aug 2026: token showed as saved in Root
    // Admin, but Telegram Group Pairing kept saying "No bot assigned yet" - two disconnected
    // storage locations for what looked like one setting. Fixed by writing to the REAL location
    // here (read-merge-write, so existing groups/routing already paired are never clobbered),
    // while still mirroring into properties.telegram_bot_token too so Root Admin's own display
    // field (and anything else that ever does SELECT * FROM properties) stays consistent.
    case 'set_property_telegram_bot_token':
        if (!($_SESSION['is_platform_admin'] ?? false)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Root admin access required']);
            exit;
        }
        $input = json_decode(file_get_contents('php://input'), true);
        $property_id = $input['property_id'] ?? '';
        if (!$property_id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'property_id required']);
            exit;
        }
        try {
            $token = trim($input['telegram_bot_token'] ?? '');
            $config = getPropertyTelegramConfig($pdo, $property_id);
            $config['botToken'] = $token !== '' ? $token : null;
            $ok = updatePropertyModuleConfig($pdo, $property_id, 'telegram', $config);
            $pdo->prepare("UPDATE properties SET telegram_bot_token = ? WHERE id = ?")
                ->execute([$token !== '' ? $token : null, $property_id]);
            echo json_encode(['success' => $ok, 'message' => $ok ? 'Bot token saved' : 'Failed to save bot token']);
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

        // Fetch before deleting - purely so the audit entry below can name
        // what was destroyed instead of just an id that no longer resolves
        // to anything afterward.
        $deletedPropName = "Property #{$property_id}";
        try {
            $pStmt = $pdo->prepare("SELECT name, slug FROM properties WHERE id = ?");
            $pStmt->execute([$property_id]);
            $pRow = $pStmt->fetch(PDO::FETCH_ASSOC);
            if ($pRow) $deletedPropName = "{$pRow['name']} ({$pRow['slug']})";
        } catch (Exception $eSel) {}

        try {
            $pdo->beginTransaction();
            deletePropertyChildData($pdo, $property_id);
            $pdo->prepare("DELETE FROM properties WHERE id = ?")->execute([$property_id]);
            $pdo->commit();
            echo json_encode(['success' => true, 'message' => 'Property deleted successfully']);

            // Audit trail (24 Aug 2026) - a destructive, irreversible action
            // that previously left no record at all. Deliberately NOT scoped
            // to the now-deleted property_id (that row and its whole audit
            // history are gone with it) - logged against property 1 instead,
            // same "not really property-scoped" convention router.php's own
            // login audit insert already uses for a platform-level event.
            try {
                $auditUser = $_SESSION['username'] ?? 'Root Admin';
                $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
                $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                $actionMsg = "Deleted property: {$deletedPropName}";
                $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (property_id, action, timestamp, user, ip_address, user_agent, status, module) VALUES (?, ?, NOW(), ?, ?, ?, 'Success', 'platform_admin')");
                $stmtAudit->execute([1, $actionMsg, $auditUser, $ip, $ua]);
            } catch (Exception $eAudit) {}
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

        // Fetch before deleting - same reasoning as delete_property above.
        $deletedTenantName = "Tenant #{$tenant_id}";
        try {
            $tStmt = $pdo->prepare("SELECT name, slug FROM tenants WHERE id = ?");
            $tStmt->execute([$tenant_id]);
            $tRow = $tStmt->fetch(PDO::FETCH_ASSOC);
            if ($tRow) $deletedTenantName = "{$tRow['name']} ({$tRow['slug']})";
        } catch (Exception $eSel) {}

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

            // Audit trail (24 Aug 2026) - the most destructive single action in
            // this file (cascades to every property under the tenant) and
            // previously had zero audit trail. Not scoped to the deleted
            // tenant's properties (they're gone) - same "log against property 1
            // for a platform-level event" convention delete_property/login
            // above already use.
            try {
                $auditUser = $_SESSION['username'] ?? 'Root Admin';
                $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
                $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                $actionMsg = "Deleted tenant: {$deletedTenantName} (+" . count($propertyIds) . ' propert' . (count($propertyIds) === 1 ? 'y' : 'ies') . ')';
                $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (property_id, action, timestamp, user, ip_address, user_agent, status, module) VALUES (?, ?, NOW(), ?, ?, ?, 'Success', 'platform_admin')");
                $stmtAudit->execute([1, $actionMsg, $auditUser, $ip, $ua]);
            } catch (Exception $eAudit) {}
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
    // update_room_tariff (21 Aug 2026): was fully implemented in
    // multikey_properties.php and actively called by RoomsManagement.tsx's
    // inline tariff editor, but never added to this dispatch list - every
    // save request fell through to the router's default case (a generic
    // "API online" status response, HTTP 200 with no `success` key), so the
    // frontend's `if (data.success)` check always took the error branch and
    // showed "Failed to update tariff" - the whole per-room tariff feature
    // (see CLAUDE.md/DESIGN's multi-key tariff notes) was unusable from the
    // UI despite both ends of it being fully built. Found while verifying
    // luxe-stays' per-room tariffs (room-101..105).
    case 'update_room_tariff':
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
            $affected = $stmt->rowCount();
            echo json_encode(['success' => $ok, 'message' => $ok ? 'All staff passcodes reset to 123456' : 'Failed']);

            // Audit trail (24 Aug 2026) - this resets EVERY staff passcode on
            // the ENTIRE platform, across every tenant, to one publicly-known
            // value in a single call, and previously left no record of who
            // triggered it or when. Given this exact codebase has already been
            // burned once by a hardcoded '123456' backdoor (see the Security
            // Backlog note), a blast-radius action this large deserves an
            // audit trail more than almost anything else in this file.
            if ($ok) {
                try {
                    $auditUser = $_SESSION['username'] ?? 'Root Admin';
                    $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
                    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                    $actionMsg = "Reset ALL staff passcodes platform-wide to the default (123456) - {$affected} account(s) affected";
                    $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (property_id, action, timestamp, user, ip_address, user_agent, status, module) VALUES (?, ?, NOW(), ?, ?, ?, 'Success', 'platform_admin')");
                    $stmtAudit->execute([1, $actionMsg, $auditUser, $ip, $ua]);
                } catch (Exception $eAudit) {}
            }
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
    case 'get_guest_extra_charges':
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
    case 'get_system_service_request_catalog':
    case 'add_system_service_request_type':
    case 'delete_system_service_request_type':
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

    // --- HOUSEKEEPING (room-ready status, "Mark Room Ready" Telegram button) ---
    case 'get_housekeeping_statuses':
    case 'set_room_ready':
        handleHousekeepingActions($pdo, $request_method, $action, $propertyId);
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

    // --- WALK-IN TABS (counter/dine-in orders with no room or guest) ---
    case 'get_walk_in_tabs':
    case 'get_walk_in_tab_history':
    case 'open_walk_in_tab':
    case 'bill_walk_in_tab':
        handleWalkInTabRequests($pdo, $request_method, $action, $propertyId);
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
    case 'get_system_stock_catalog':
    case 'get_system_stock_categories':
    case 'add_system_stock_item':
    case 'delete_system_stock_item':
    case 'sync_default_stock_categories':
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
    case 'get_property_custom_expenses':
    case 'add_property_custom_expense':
    case 'delete_property_custom_expense':
    case 'get_system_expense_catalog':
    case 'add_system_expense_item':
    case 'delete_system_expense_item':
    case 'get_bills_catalog':
    case 'add_bill_item':
    case 'delete_bill_item':
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
            // php/telegram/telegram.php is missing from disk (see the file_exists()
            // guard near the top of this file - a malware scanner quarantined this
            // exact file once before, 12 Aug 2026, and it's gone missing again since
            // without anyone noticing until a user hit a broken Save button). Alert
            // loudly instead of just returning a quiet 503 - 'Fatal Error' severity
            // triggers Telescope's admin Telegram ping (2-min cooldown, so repeated
            // requests while broken won't spam).
            if (class_exists('TelescopeLogger')) {
                TelescopeLogger::log('php', 'Fatal Error', "php/telegram/telegram.php is missing from disk - every Telegram action ('$action') is failing", 'router.php:telegram dispatch');
            }
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

    // --- RATE RULES & PRICING ---
    case 'get_rate_rules':
    case 'save_rate_rule':
    case 'delete_rate_rule':
    case 'update_pricing_mode':
    case 'get_pending_rate_push_alerts':
    case 'acknowledge_rate_push_alerts':
        handleRateRuleRequests($pdo, $request_method, $action, $propertyId);
        break;

    // --- PROPERTY ---
    case 'get_current_property':
        // SECURITY: Ensure property exists and is active
        if (empty($currentProperty) || !isset($currentProperty['id'])) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Property not found or deleted', 'data' => null]);
        } else {
            // Merge in the OWNING TENANT's own subscription fields (plan_type,
            // subscription_status, subscription_expires_at) - these live on
            // `tenants`, not `properties`, and were previously only ever read by
            // Root Admin (PlatformPropertyManagement.tsx). The owner-facing app
            // had no way to know its own trial/renewal state at all, so the
            // PRODUCT_STRATEGY.md "Day 27: in-app warning toast" step had nothing
            // to read from. Added 27 Aug 2026 - read-only, tiny (1 row by PK), and
            // scoped strictly to this property's own tenant_id.
            if (!empty($currentProperty['tenant_id'])) {
                try {
                    $tstmt = $pdo->prepare("SELECT plan_type, subscription_status, subscription_expires_at, is_demo FROM tenants WHERE id = ? LIMIT 1");
                    $tstmt->execute([$currentProperty['tenant_id']]);
                    if ($trow = $tstmt->fetch(PDO::FETCH_ASSOC)) {
                        $currentProperty['tenant_plan_type'] = $trow['plan_type'];
                        $currentProperty['tenant_subscription_status'] = $trow['subscription_status'];
                        $currentProperty['tenant_subscription_expires_at'] = $trow['subscription_expires_at'];
                        // Named tenant_is_demo (not is_demo) so it can never be confused with the
                        // pre-existing, unrelated properties.is_public_demo flag (the anonymous-
                        // visitor auto-login demo property) - this one means "this property's whole
                        // OWNER account is a sales/QA demo tenant" (see tenants.is_demo /
                        // schema_tenants_table_v3), a tenant-level concept, not a property-level one.
                        $currentProperty['tenant_is_demo'] = !empty($trow['is_demo']);
                    }
                } catch (Exception $eTenantSub) {}
            }
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
    case 'check_telegram_health':
    case 'register_tenant_trial':
    case 'get_saas_platform_config':
    case 'save_saas_platform_config':
    case 'send_test_cadence_nudge':
        if (function_exists('handleConfigurationRequests')) {
            handleConfigurationRequests($pdo, $request_method, $action, $propertyId);
        } else {
            http_response_code(503);
            echo json_encode(['status' => 'error', 'message' => 'Configuration module unavailable']);
        }
        break;

    // --- TENANT SUBSCRIPTION PANEL (added 3 Sep 2026) ---
    // Tenant-facing: read this property's own tenant subscription state and
    // let its owner request a cancel/close. Ground Code bills offline only
    // (UPI/NEFT, Root Admin sets status/expiry by hand - PRODUCT_STRATEGY.md),
    // so there is nothing here that mutates subscription_status or calls
    // delete_tenant - see tenant_closure_requests.php's own header comment.
    case 'get_subscription_summary':
    case 'request_subscription_action':
    case 'get_tenant_closure_requests':
    case 'resolve_tenant_closure_request':
        require_once __DIR__ . '/../subscription/tenant_closure_requests.php';
        ensureTenantClosureRequestsSchema($pdo);

        if ($action === 'get_tenant_closure_requests' || $action === 'resolve_tenant_closure_request') {
            // Root-Admin-only side, same gate every other root-admin action in
            // this file uses (see get_all_tenants above).
            if (!($_SESSION['is_platform_admin'] ?? false)) {
                http_response_code(403);
                echo json_encode(['status' => 'error', 'message' => 'Root admin access required']);
                exit;
            }

            if ($action === 'get_tenant_closure_requests') {
                try {
                    $stmt = $pdo->query("
                        SELECT r.*, t.name AS tenant_name, t.slug AS tenant_slug
                        FROM tenant_closure_requests r
                        JOIN tenants t ON t.id = r.tenant_id
                        ORDER BY (r.status = 'pending') DESC, r.created_at DESC
                        LIMIT 200
                    ");
                    echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
                } catch (Exception $e) {
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
                break;
            }

            // resolve_tenant_closure_request
            $input = json_decode(file_get_contents('php://input'), true) ?: [];
            $reqId = (int)($input['id'] ?? 0);
            $adminAction = $input['action'] ?? '';
            $statusMap = ['acknowledge' => 'acknowledged', 'decline' => 'declined', 'complete' => 'completed'];
            if (!$reqId || !isset($statusMap[$adminAction])) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'id and a valid action (acknowledge|decline|complete) are required']);
                break;
            }
            try {
                $stmt = $pdo->prepare("UPDATE tenant_closure_requests SET status = ?, resolved_at = NOW(), resolved_by = ?, admin_note = ? WHERE id = ?");
                $stmt->execute([
                    $statusMap[$adminAction],
                    $_SESSION['username'] ?? 'Root Admin',
                    isset($input['admin_note']) ? trim((string)$input['admin_note']) : null,
                    $reqId,
                ]);
                echo json_encode(['status' => 'success', 'message' => 'Request updated']);
            } catch (Exception $e) {
                http_response_code(500);
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;
        }

        // Tenant-facing side, below. Two entry points share this action:
        //   1. The per-property nav item (Subscription, gated Super
        //      Admin/Admin via nav_menu_self_heal_v10) - reached from inside
        //      one resolved property, no tenant_id in the request. Scoped
        //      strictly to the SESSION's own property's tenant_id - never a
        //      tenant_id from the request for this path.
        //   2. The Tenant Dashboard (/tenant_dashboard/, added 3 Sep 2026) -
        //      a `users`-table owner login with no single property resolved
        //      at all, so it sends tenant_id explicitly instead.
        // Both actions are in $tenant_scope_actions (see above), which skips
        // the universal isPropertyAccessAllowed($propertyId) gate entirely -
        // that gate would otherwise 403 path 2 before ever reaching here,
        // since getCurrentPropertyId() falls back to an unrelated property
        // when no property_slug is in the request (same issue save_nav_menu
        // hit). Each path below re-establishes its own equivalent check
        // instead of inheriting that skipped gate.
        $tenantActionInput = $request_method !== 'GET' ? (json_decode(file_get_contents('php://input'), true) ?: []) : [];
        $requestedTenantId = $_GET['tenant_id'] ?? ($tenantActionInput['tenant_id'] ?? '');

        if ($requestedTenantId) {
            // Path 2 (Tenant Dashboard). Validated purely against the
            // session's own tenant association (isTenantAccessAllowed with
            // $currentPropertyId=0) - NOT against $propertyId, which would be
            // circular here: property_slug and tenant_id can both be
            // attacker-chosen in the same request, so that function's own
            // "requested tenant owns $currentPropertyId" fallback must not be
            // trusted as the check for this path.
            if (!isTenantAccessAllowed($pdo, $requestedTenantId, 0)) {
                http_response_code(403);
                echo json_encode(['status' => 'error', 'message' => 'Access denied']);
                break;
            }
            $subTenantId = (int)$requestedTenantId;
        } else {
            // Path 1 (per-property nav). This action's own gate-exemption
            // above means the usual isPropertyAccessAllowed() check never ran
            // for it - re-run it explicitly so a staff session with no access
            // to $propertyId can't reach its tenant's billing data just
            // because this action is now gate-exempt.
            if (!$propertyId || !isPropertyAccessAllowed($pdo, $propertyId) || empty($currentProperty['tenant_id'])) {
                http_response_code(403);
                echo json_encode(['status' => 'error', 'message' => 'Access denied']);
                break;
            }
            $subTenantId = (int)$currentProperty['tenant_id'];
        }

        if ($action === 'get_subscription_summary') {
            try {
                $tStmt = $pdo->prepare("SELECT id, name, subscription_status, subscription_expires_at, billing_cycle FROM tenants WHERE id = ? LIMIT 1");
                $tStmt->execute([$subTenantId]);
                $tenantRow = $tStmt->fetch(PDO::FETCH_ASSOC);
                if (!$tenantRow) {
                    http_response_code(404);
                    echo json_encode(['status' => 'error', 'message' => 'Tenant not found']);
                    break;
                }

                // Room-key count for pricing: SINGLE properties and MULTI_KEY_ROOM
                // children are each their own billable key; a MULTI_KEY parent row
                // is just a container, not a separately billable unit.
                $kStmt = $pdo->prepare("SELECT COUNT(*) FROM properties WHERE tenant_id = ? AND is_deleted = 0 AND property_type IN ('SINGLE','MULTI_KEY_ROOM')");
                $kStmt->execute([$subTenantId]);
                $keyCount = (int)$kStmt->fetchColumn();

                $openRequest = getOpenTenantClosureRequest($pdo, $subTenantId);

                echo json_encode([
                    'status' => 'success',
                    'data' => [
                        // Canonical display name regardless of the stored plan_type
                        // string (see PRODUCT_STRATEGY.md - flagged to the user as a
                        // real inconsistency between that doc and PlatformPropertyManagement's
                        // still-live 'Starter'/'Growth' picker; PRODUCT_STRATEGY.md's
                        // single-plan model was confirmed canonical for THIS panel).
                        'plan_name' => 'GroundCode Pro',
                        'subscription_status' => $tenantRow['subscription_status'],
                        'subscription_expires_at' => $tenantRow['subscription_expires_at'],
                        'billing_cycle' => $tenantRow['billing_cycle'],
                        'key_count' => $keyCount,
                        'open_request' => $openRequest,
                    ],
                ]);
            } catch (Exception $e) {
                http_response_code(500);
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;
        }

        // request_subscription_action - reuse $tenantActionInput parsed above
        // rather than re-reading php://input a second time.
        $input = $tenantActionInput;
        $requestType = $input['request_type'] ?? '';
        if (!in_array($requestType, ['cancel', 'delete'], true)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => "request_type must be 'cancel' or 'delete'"]);
            break;
        }
        if (getOpenTenantClosureRequest($pdo, $subTenantId)) {
            http_response_code(409);
            echo json_encode(['status' => 'error', 'message' => 'A request is already pending for this account. Your account manager has already been notified.']);
            break;
        }
        try {
            $reason = trim((string)($input['reason'] ?? ''));
            $requestedByName = $_SESSION['username'] ?? 'Property Owner';
            $insStmt = $pdo->prepare("INSERT INTO tenant_closure_requests (tenant_id, requested_by, requested_by_name, request_type, reason) VALUES (?, ?, ?, ?, ?)");
            $insStmt->execute([
                $subTenantId,
                $_SESSION['user_id'] ?? null,
                $requestedByName,
                $requestType,
                $reason !== '' ? $reason : null,
            ]);
            $newRequest = [
                'id' => (int)$pdo->lastInsertId(),
                'tenant_id' => $subTenantId,
                'requested_by_name' => $requestedByName,
                'request_type' => $requestType,
                'reason' => $reason,
            ];
            $tNameStmt = $pdo->prepare("SELECT name FROM tenants WHERE id = ? LIMIT 1");
            $tNameStmt->execute([$subTenantId]);
            $tenantForNotify = ['name' => $tNameStmt->fetchColumn() ?: null];

            // Notification failing must never fail the request itself - the DB
            // row is already committed above by the time this runs.
            try {
                notifyRootAdminOfClosureRequest($pdo, $newRequest, $tenantForNotify);
            } catch (Throwable $eNotify) {
                error_log('notifyRootAdminOfClosureRequest failed: ' . $eNotify->getMessage());
            }

            echo json_encode(['status' => 'success', 'message' => 'Request received']);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
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

    // Root-admin-only lookup so the "Reset Demo Data" button on
    // RootAdminDashboard (see .htaccess's /demo/ redirect target) can show
    // which property it's about to touch and pass its id to generate_demo_data
    // below, without the dashboard needing its own property picker (picking
    // the wrong property there would wipe a real tenant's live data).
    case 'get_public_demo_property':
        if (!($_SESSION['is_platform_admin'] ?? false)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Root admin access required']);
            exit;
        }
        if (!APP_DEMO_DATA_ENABLED) {
            echo json_encode(['success' => false, 'message' => 'Demo data features are disabled on production.']);
            exit;
        }
        try {
            $stmt = $pdo->query("SELECT id, name, slug FROM properties WHERE is_public_demo = 1 AND is_deleted = 0 LIMIT 1");
            $demoProperty = $stmt->fetch();
            if (!$demoProperty) {
                echo json_encode(['success' => false, 'message' => 'No property is currently marked as the public demo - set one via Edit Property first.']);
                exit;
            }
            echo json_encode(['success' => true, 'data' => $demoProperty]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        exit;

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

    // --- CHANNEX CHANNEL MANAGER INTEGRATION ---
    case 'channex_webhook':
        // This action is deliberately in $public_actions - Channex calls it
        // unauthenticated, with no session and no CSRF token. That makes the
        // shared secret the ONLY thing standing between the open internet and
        // a code path that writes real bookings into the guests table. Without
        // it, anyone who learns the URL can inject phantom reservations onto
        // real rooms. The secret is set when registering the webhook (its
        // `headers` object, see CHANNEX_IMPLEMENTATION.md) and stored beside
        // the API key in the gitignored channex_config.json.
        //
        // Fails CLOSED: if no secret is configured, the endpoint refuses
        // everything rather than silently accepting anonymous writes. An
        // unconfigured integration should be inert, not open.
        $channexCfgPath = __DIR__ . '/../config/channex_config.json';
        $channexCfg = is_file($channexCfgPath)
            ? (json_decode(file_get_contents($channexCfgPath), true) ?: [])
            : [];
        $expectedSecret = (string)($channexCfg['webhook_secret'] ?? '');
        $providedSecret = (string)($_SERVER['HTTP_X_CHANNEX_WEBHOOK_SECRET'] ?? '');

        if ($expectedSecret === '' || !hash_equals($expectedSecret, $providedSecret)) {
            http_response_code(401);
            echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
            if (class_exists('TelescopeLogger')) {
                // Worth surfacing: a rejected call is either a misconfigured
                // secret or someone probing the endpoint, and both need a human.
                TelescopeLogger::log('security', 'WARNING',
                    'Channex webhook rejected: ' . ($expectedSecret === '' ? 'no secret configured' : 'bad secret'),
                    'channex_webhook', ['ip' => $_SERVER['REMOTE_ADDR'] ?? '?']);
            }
            break;
        }

        if (is_file(__DIR__ . '/../channex/webhook_receiver.php')) {
            require_once __DIR__ . '/../channex/webhook_receiver.php';
        }
        if (!class_exists('ChannexWebhookReceiver')) {
            http_response_code(503);
            echo json_encode(['status' => 'error', 'message' => 'Channex webhook receiver not installed']);
            break;
        }
        $rawInput = file_get_contents('php://input');
        $payload = json_decode($rawInput, true) ?: [];

        // Answer Channex before doing the work. Their retry timer is measured in
        // seconds, and the HTTP 200 only means "received" - the ACK sent later,
        // after the DB commits, is the real "processed" signal. Flushing here
        // stops a slow booking insert from triggering duplicate deliveries.
        ignore_user_abort(true);
        set_time_limit(60);

        http_response_code(200);
        echo json_encode(['status' => 'success', 'received' => true]);
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        } else {
            @ob_end_flush();
            @flush();
        }

        try {
            $receiver = new ChannexWebhookReceiver($pdo);
            $receiver->handleWebhook($payload);
        } catch (Throwable $e) {
            if (class_exists('TelescopeLogger')) {
                TelescopeLogger::log('error', 'ERROR', 'Channex webhook background exception: ' . $e->getMessage(), 'channex_webhook');
            }
        }
        break;

    case 'channex_airbnb_oauth_landing':
        // Deliberately public - Channex sends the browser here with NO session
        // of ours attached (the whole point of a browser-based OAuth round trip
        // is that it can start in one context and land in another). Renders
        // plain HTML, not JSON - this IS the page the owner's browser shows,
        // not an API response a frontend fetch()es. ?property_id and ?outcome
        // are ours (baked into the redirect_uri we gave Channex in
        // channex_channel_airbnb_connection_link); ?success/?channel_id/?token
        // are Channex's own, appended per its documented contract.
        require_once __DIR__ . '/../channex/channel_connections.php';
        header('Content-Type: text/html; charset=utf-8');
        // Channex appends its own params with a literal "?", not "&" (its
        // docs quote the suffix as "?success=true&channel_id={id}&token={token}"
        // verbatim) - it does not check whether redirect_uri already has a
        // query string. Confirmed live 3 Sep 2026: our own redirect_uri
        // (…&outcome=success) plus that literal "?" produces a URL with TWO
        // "?" characters. PHP's $_GET only parses up to the FIRST "?" -
        // everything Channex appended lands inside the STRING VALUE of
        // whatever our own last param was ($_GET['outcome'] became
        // "success?success=true&channel_id=...&token=..."), so success/
        // channel_id/token were always empty and a genuinely successful
        // authorization got recorded as "not completed". Parse the raw query
        // string ourselves, splitting on "?" to separate our own params
        // (before the first "?") from Channex's appended ones (after it).
        $rawQuery = (string)($_SERVER['QUERY_STRING'] ?? '');
        $queryChunks = explode('?', $rawQuery);
        $ownParams = [];
        parse_str($queryChunks[0] ?? '', $ownParams);
        $channexParams = [];
        if (isset($queryChunks[1])) {
            parse_str($queryChunks[1], $channexParams);
        }
        $landingPropertyId = (int)($ownParams['property_id'] ?? 0);
        $landingToken = (string)($channexParams['token'] ?? $ownParams['token'] ?? '');
        $landingSuccess = ($ownParams['outcome'] ?? '') === 'success'
            && (($channexParams['success'] ?? $ownParams['success'] ?? '') !== 'false');
        $landingChannelId = (string)($channexParams['channel_id'] ?? $ownParams['channel_id'] ?? '');

        $conn = $landingPropertyId > 0 ? getChannexChannelConnection($pdo, $landingPropertyId, 'AirBNB') : null;
        $storedSettings = $conn && $conn['settings'] ? (json_decode($conn['settings'], true) ?: []) : [];
        $storedToken = (string)($storedSettings['oauth_token'] ?? '');
        $tokenOk = $conn && $storedToken !== '' && hash_equals($storedToken, $landingToken);

        // Channex only ever sends a token on a genuine SUCCESS redirect - a
        // failure redirect (outcome=failure, user declined/didn't finish on
        // Airbnb's own side) carries no token at all, by design, not because
        // anything was tampered with. Treating "no token" as a security
        // mismatch on a failure redirect produced a misleading "Something
        // went wrong / possibly a stale or reused link" message for what was
        // actually just an ordinary incomplete/declined authorization
        // (confirmed live 3 Sep 2026 - Channex's own outcome=failure hit had
        // no token param at all, exactly as expected). Only outcome=success
        // with a token that doesn't match is a real mismatch worth flagging
        // as suspicious.
        $isSuccess = ($landingSuccess && $tokenOk && $landingChannelId !== '');
        $outcomeWasFailure = ($ownParams['outcome'] ?? '') === 'failure';
        if ($isSuccess) {
            upsertChannexChannelConnection($pdo, $landingPropertyId, 'AirBNB', [
                'channex_channel_id' => $landingChannelId,
                'status' => 'mapping',
                'last_error' => null,
            ]);
            $heading = 'Airbnb Connected Successfully';
            $body = "Your Airbnb account is now linked. You can close this window and return to Ground Code to complete your room mapping.";
        } elseif ($landingSuccess && !$tokenOk && $conn) {
            upsertChannexChannelConnection($pdo, $landingPropertyId, 'AirBNB', [
                'status' => 'error',
                'last_error' => 'Authorization link token mismatch - possibly a stale or reused link.',
            ]);
            $heading = 'Something went wrong';
            $body = "We couldn't verify this authorization attempt. Close this window, return to Ground Code, and click \"Authorize with Airbnb\" again for a fresh link.";
        } else {
            if ($conn) {
                upsertChannexChannelConnection($pdo, $landingPropertyId, 'AirBNB', [
                    'status' => 'error',
                    'last_error' => 'Airbnb authorization was not completed or was declined.',
                ]);
            }
            $heading = 'Authorization not completed';
            $body = $outcomeWasFailure
                ? "Airbnb reported this authorization wasn't completed (you may have closed the tab or declined access). Close this window, return to Ground Code, and try \"Authorize with Airbnb\" again - make sure to sign in and click \"Allow\" on Airbnb's own page."
                : "Airbnb authorization wasn't completed. Close this window, return to Ground Code, and try \"Authorize with Airbnb\" again.";
        }

        echo '<!doctype html>'
            . '<html lang="en">'
            . '<head>'
            . '<meta charset="utf-8">'
            . '<title>' . htmlspecialchars($heading) . '</title>'
            . '<meta name="viewport" content="width=device-width, initial-scale=1">'
            . '<link rel="preconnect" href="https://fonts.googleapis.com">'
            . '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
            . '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">'
            . '<style>'
            . '* { box-sizing: border-box; margin: 0; padding: 0; font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }'
            . 'body { min-height: 100vh; display: flex; align-items: center; justify-content: center; background-color: #6b7280; padding: 1rem; }'
            . '@media (prefers-color-scheme: dark) { body { background-color: #111827; } }'
            . '.flowbite-modal { position: relative; width: 100%; max-width: 28rem; background: #ffffff; border-radius: 0.5rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); padding: 1.5rem; text-align: center; }'
            . '@media (prefers-color-scheme: dark) { .flowbite-modal { background: #1f2937; color: #ffffff; } }'
            . '.close-btn { position: absolute; top: 0.75rem; right: 0.75rem; color: #9ca3af; background: transparent; border: none; border-radius: 0.5rem; padding: 0.375rem; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s; }'
            . '.close-btn:hover { background: #f3f4f6; color: #111827; }'
            . '@media (prefers-color-scheme: dark) { .close-btn:hover { background: #374151; color: #ffffff; } }'
            . '.icon-container { width: 3rem; height: 3rem; border-radius: 9999px; padding: 0.5rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 0.875rem; }'
            . '.icon-success { background: #def7ec; color: #0e9f6e; }'
            . '@media (prefers-color-scheme: dark) { .icon-success { background: #03543f; color: #31c48d; } }'
            . '.icon-error { background: #fde8e8; color: #e02424; }'
            . '@media (prefers-color-scheme: dark) { .icon-error { background: #9b1c1c; color: #f98080; } }'
            . '.modal-title { font-size: 1.125rem; font-weight: 600; color: #111827; margin-bottom: 0.75rem; line-height: 1.5; }'
            . '@media (prefers-color-scheme: dark) { .modal-title { color: #ffffff; } }'
            . '.modal-body { font-size: 0.875rem; color: #6b7280; line-height: 1.5; margin-bottom: 1.5rem; }'
            . '@media (prefers-color-scheme: dark) { .modal-body { color: #9ca3af; } }'
            . '.btn-continue { display: inline-flex; align-items: center; justify-content: center; padding: 0.625rem 1.25rem; font-size: 0.875rem; font-weight: 500; text-align: center; color: #ffffff; background: #1a56db; border: none; border-radius: 0.5rem; cursor: pointer; transition: background-color 0.2s; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05); }'
            . '.btn-continue:hover { background: #1e429f; }'
            . '.btn-continue:focus { outline: none; box-shadow: 0 0 0 4px rgba(225,239,254,1); }'
            . '@media (prefers-color-scheme: dark) { .btn-continue { background: #1a56db; } .btn-continue:hover { background: #1e429f; } }'
            . '</style>'
            . '</head>'
            . '<body>'
            . '<div class="flowbite-modal">'
            . '<button type="button" class="close-btn" onclick="window.close()" aria-label="Close">'
            . '<svg style="width: 1.25rem; height: 1.25rem;" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>'
            . '</button>'
            . ($isSuccess
                ? '<div class="icon-container icon-success"><svg style="width: 2rem; height: 2rem;" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg></div>'
                : '<div class="icon-container icon-error"><svg style="width: 2rem; height: 2rem;" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg></div>'
            )
            . '<p class="modal-title">' . htmlspecialchars($heading) . '</p>'
            . '<p class="modal-body">' . htmlspecialchars($body) . '</p>'
            . '<button type="button" onclick="window.close()" class="btn-continue">Continue</button>'
            . '</div>'
            . '</body>'
            . '</html>';
        break;

    case 'channex_content_sync':
        if (is_file(__DIR__ . '/../channex/content_sync.php')) {
            require_once __DIR__ . '/../channex/content_sync.php';
        }
        if (!class_exists('ChannexContentSyncer')) {
            http_response_code(503);
            echo json_encode(['status' => 'error', 'message' => 'Channex content sync module not installed']);
            break;
        }
        $targetPropertyId = $propertyId ?: (int)($_GET['property_id'] ?? 1);
        $syncer = new ChannexContentSyncer($pdo);
        try {
            $res = $syncer->syncProperty($targetPropertyId);
            echo json_encode(['status' => 'success', 'data' => $res]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'channex_register_webhook':
        if (is_file(__DIR__ . '/../channex/ChannexAdapter.php')) {
            require_once __DIR__ . '/../channex/ChannexAdapter.php';
        }
        if (!class_exists('ChannexAdapter')) {
            http_response_code(503);
            echo json_encode(['status' => 'error', 'message' => 'Channex adapter not installed']);
            break;
        }
        $adapter = new ChannexAdapter($pdo);
        $callbackUrl = trim((string)($_POST['callback_url'] ?? ($_GET['callback_url'] ?? '')));
        $channexPropId = trim((string)($_POST['channex_property_id'] ?? ($_GET['channex_property_id'] ?? '')));
        try {
            $regRes = $adapter->registerWebhook($callbackUrl ?: null, $channexPropId ?: null);
            echo json_encode(['status' => 'success', 'data' => $regRes]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    // --- Self-serve OTA channel-connection wizard (3 Sep 2026) ---
    // ChannexChannelClient wraps the Channel API (connect/map/activate an OTA),
    // a separate surface from ChannexAdapter's ARI-push contract. See
    // php/channex/channel_connections.php for the two-table state model and
    // the plan doc's reasoning for why this isn't folded into channex_mappings.
    case 'channex_channels_available':
    case 'channex_channel_adapter':
    case 'channex_channel_connection_status':
    case 'channex_channel_test_connection':
    case 'channex_channel_start_airbnb':
    case 'channex_channel_airbnb_connection_link':
    case 'channex_channel_mapping_details':
    case 'channex_channel_save_mapping':
    case 'channex_channel_check_readiness':
    case 'channex_channel_activate':
    case 'channex_channel_deactivate':
    case 'channex_channel_delete':
    case 'channex_channel_pending_staff_action':
        if (is_file(__DIR__ . '/../channex/ChannexChannelClient.php')) {
            require_once __DIR__ . '/../channex/ChannexChannelClient.php';
        }
        if (is_file(__DIR__ . '/../channex/channel_connections.php')) {
            require_once __DIR__ . '/../channex/channel_connections.php';
        }
        if (is_file(__DIR__ . '/../channex/content_sync.php')) {
            require_once __DIR__ . '/../channex/content_sync.php';
        }
        if (!class_exists('ChannexChannelClient') || !function_exists('getChannexChannelConnection')) {
            http_response_code(503);
            echo json_encode(['status' => 'error', 'message' => 'Channel connection module not installed']);
            break;
        }

        $rawInput = file_get_contents('php://input');
        $input = json_decode($rawInput, true) ?: $_POST;
        $targetPropertyId = !empty($input['property_id']) ? (int)$input['property_id'] : ($propertyId ?: (int)($_GET['property_id'] ?? 0));

        // Every "meta"-kind channel is attached to THIS local property's own
        // Channex property UUID - resolved from channex_mappings, which is
        // keyed by property_id regardless of room_id (every unit of one local
        // property shares the same channex_property_id, see content_sync.php).
        // Self-heals the same way ChannexAdapter::pushAvailability() already
        // does: if the property was never content-synced, sync it now rather
        // than making the client fail with an opaque "no mapping" error.
        $resolveChannexPropertyId = function (int $propId) use ($pdo): ?string {
            $stmt = $pdo->prepare("SELECT channex_property_id FROM channex_mappings WHERE property_id = ? LIMIT 1");
            $stmt->execute([$propId]);
            $id = $stmt->fetchColumn();
            if ($id) return $id;
            if (class_exists('ChannexContentSyncer')) {
                try {
                    (new ChannexContentSyncer($pdo))->syncProperty($propId);
                } catch (Exception $e) {
                    return null;
                }
            }
            $stmt->execute([$propId]);
            $id = $stmt->fetchColumn();
            return $id ?: null;
        };

        // $targetPropertyId can differ from the session's own $propertyId (e.g. Root
        // Admin acting on a specific tenant's property) - $currentProperty is only
        // ever resolved for the session's property, so re-fetch by name when they
        // differ rather than mislabeling the Channex channel's display title.
        if ($targetPropertyId === $propertyId) {
            $targetPropertyName = $currentProperty['name'] ?? null;
        } else {
            $tpStmt = $pdo->prepare("SELECT name FROM properties WHERE id = ?");
            $tpStmt->execute([$targetPropertyId]);
            $targetPropertyName = $tpStmt->fetchColumn() ?: null;
        }

        $channelClient = new ChannexChannelClient();

        switch ($action) {
            case 'channex_channels_available':
                $res = $channelClient->listAdapters();
                if (!$res['success']) {
                    http_response_code($res['http_code'] ?: 502);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to load channel list from Channex', 'error' => $res['error'] ?? null]);
                    break 2;
                }
                // Annotate meta (generic dynamic-form) vs Airbnb's ota/staff-assisted path -
                // the frontend branches step 2 on this rather than hardcoding a channel list.
                $adapters = array_map(function ($a) {
                    $a['is_airbnb_oauth'] = (($a['kind'] ?? '') === 'ota');
                    return $a;
                }, $res['data'] ?? []);
                echo json_encode(['status' => 'success', 'data' => $adapters]);
                break 2;

            case 'channex_channel_adapter':
                $code = trim((string)($_GET['code'] ?? $input['code'] ?? ''));
                if ($code === '') {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'code is required']);
                    break 2;
                }
                $res = $channelClient->getAdapter($code);
                if (!$res['success']) {
                    http_response_code($res['http_code'] ?: 502);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to load channel adapter', 'error' => $res['error'] ?? null]);
                    break 2;
                }
                // Same annotation channex_channels_available adds (line ~4123) -
                // this endpoint was missing it entirely, so selectedAdapter.is_airbnb_oauth
                // was always undefined in the wizard (it fetches the adapter via THIS
                // action, not the list one) and step 2 always rendered the generic
                // settings+Test Connection form instead of the real "Request Airbnb
                // Connection" screen - meaning channex_channel_start_airbnb (the only
                // call that actually creates the Channex-side channel) was never
                // reachable for Airbnb at all. Confirmed live 3 Sep 2026: Test
                // Connection "succeeded" and jumped straight to room mapping, which
                // then 400'd since no real Channex channel had ever been created.
                $adapterData = $res['data'];
                if (isset($adapterData['attributes'])) {
                    $adapterData['attributes']['is_airbnb_oauth'] = (($adapterData['attributes']['kind'] ?? '') === 'ota');
                } else {
                    $adapterData['is_airbnb_oauth'] = (($adapterData['kind'] ?? '') === 'ota');
                }
                echo json_encode(['status' => 'success', 'data' => $adapterData]);
                break 2;

            case 'channex_channel_connection_status':
                if ($targetPropertyId <= 0) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'property_id is required']);
                    break 2;
                }
                $rows = listChannexChannelConnections($pdo, $targetPropertyId);
                foreach ($rows as &$row) {
                    if (!empty($row['settings'])) {
                        $row['settings'] = json_decode($row['settings'], true);
                    }
                    if (!empty($row['id'])) {
                        $row['room_mappings'] = getChannexChannelRoomMappings($pdo, (int)$row['id']);
                    }
                }
                unset($row);

                // Local rooms + their own Channex rate plan id, so the wizard's mapping
                // step (Step 3) has everything in one payload rather than a second
                // round trip. SINGLE property: one synthetic "room" (room_id NULL,
                // named after the property itself). MULTI_KEY: each real child room.
                $propTypeStmt = $pdo->prepare("SELECT property_type, name FROM properties WHERE id = ?");
                $propTypeStmt->execute([$targetPropertyId]);
                $propRow = $propTypeStmt->fetch(PDO::FETCH_ASSOC);
                $localRooms = [];
                if ($propRow && $propRow['property_type'] === 'MULTI_KEY') {
                    $roomsStmt = $pdo->prepare("
                        SELECT r.id AS local_room_id, r.name, m.channex_rate_plan_id
                        FROM properties r
                        LEFT JOIN channex_mappings m ON m.property_id = ? AND m.room_id = r.id
                        WHERE r.parent_property_id = ? AND r.property_type = 'MULTI_KEY_ROOM' AND r.is_deleted = 0
                        ORDER BY r.room_order ASC, r.name ASC
                    ");
                    $roomsStmt->execute([$targetPropertyId, $targetPropertyId]);
                    $localRooms = $roomsStmt->fetchAll(PDO::FETCH_ASSOC);
                } elseif ($propRow) {
                    $singleStmt = $pdo->prepare("SELECT channex_rate_plan_id FROM channex_mappings WHERE property_id = ? AND room_id IS NULL LIMIT 1");
                    $singleStmt->execute([$targetPropertyId]);
                    $localRooms = [[
                        'local_room_id' => null,
                        'name' => $propRow['name'],
                        'channex_rate_plan_id' => $singleStmt->fetchColumn() ?: null,
                    ]];
                }

                echo json_encode(['status' => 'success', 'data' => ['connections' => $rows, 'local_rooms' => $localRooms]]);
                break 2;

            case 'channex_channel_test_connection':
                $channelCode = trim((string)($input['channel_code'] ?? ''));
                $settings = is_array($input['settings'] ?? null) ? $input['settings'] : [];
                if ($targetPropertyId <= 0 || $channelCode === '') {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'property_id and channel_code are required']);
                    break 2;
                }
                upsertChannexChannelConnection($pdo, $targetPropertyId, $channelCode, [
                    'status' => 'pending_test',
                    'settings' => $settings,
                    'created_by_user_id' => $_SESSION['user_id'] ?? null,
                ]);
                $res = $channelClient->testConnection($channelCode, $settings);
                $testSuccess = $res['success'] && !empty($res['data']['success']);
                $testErrors = $res['data']['errors'] ?? ($res['error'] ?? null);
                upsertChannexChannelConnection($pdo, $targetPropertyId, $channelCode, [
                    'status' => $testSuccess ? 'mapping' : 'error',
                    'last_error' => $testSuccess ? null : json_encode($testErrors),
                ]);
                echo json_encode([
                    'status' => 'success',
                    'data' => ['test_success' => $testSuccess, 'errors' => $testErrors],
                ]);
                break 2;

            case 'channex_channel_start_airbnb':
                // Airbnb has no API-level OAuth initiation (confirmed against Channex's own
                // docs 3 Sep 2026 - connecting it is a human clicking "Connect to Airbnb" on
                // Channex's OWN dashboard). This creates the inactive channel shell
                // server-side and hands off to staff, who complete the OAuth click in
                // Channex's dashboard on the client's behalf - a client never gets direct
                // access to the shared Channex dashboard.
                if ($targetPropertyId <= 0) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'property_id is required']);
                    break 2;
                }
                $channexPropId = $resolveChannexPropertyId($targetPropertyId);
                if (!$channexPropId) {
                    http_response_code(422);
                    echo json_encode(['status' => 'error', 'message' => 'Could not sync this property with Channex - check the Channex configuration and try again.']);
                    break 2;
                }
                $groupId = $channelClient->resolveGroupIdForProperty($channexPropId);
                if (!$groupId) {
                    http_response_code(422);
                    echo json_encode(['status' => 'error', 'message' => 'No Channex group has access to this property - contact support.']);
                    break 2;
                }
                $listingNote = trim((string)($input['listing_note'] ?? ''));
                $createRes = $channelClient->createChannel('AirBNB', $groupId, [$channexPropId], [], [], $targetPropertyName);
                if (!$createRes['success'] || empty($createRes['data']['id'])) {
                    upsertChannexChannelConnection($pdo, $targetPropertyId, 'AirBNB', [
                        'status' => 'error',
                        'last_error' => json_encode($createRes['error'] ?? 'Failed to create Airbnb channel'),
                    ]);
                    http_response_code($createRes['http_code'] ?: 502);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to start the Airbnb connection request', 'error' => $createRes['error'] ?? null]);
                    break 2;
                }
                upsertChannexChannelConnection($pdo, $targetPropertyId, 'AirBNB', [
                    'channex_channel_id' => $createRes['data']['id'],
                    'channex_group_id' => $groupId,
                    'status' => 'staff_action_required',
                    'settings' => ['listing_note' => $listingNote],
                    'last_error' => null,
                    'created_by_user_id' => $_SESSION['user_id'] ?? null,
                ]);
                echo json_encode([
                    'status' => 'success',
                    'data' => ['channex_channel_id' => $createRes['data']['id'], 'connection_status' => 'staff_action_required'],
                ]);
                break 2;

            case 'channex_channel_airbnb_connection_link':
                // The REAL Airbnb connect flow (confirmed against Channex's own docs
                // 3 Sep 2026, https://docs.channex.io/channel-api-examples/airbnb.md):
                // POST /meta/airbnb/connection_link, NOT a hand-built
                // airbnb.com/oauth2/auth URL. Channex tracks the resulting link
                // server-side (valid 2 hours) and creates the channel connection
                // itself once the owner authorizes - our job is just to ask for the
                // link and later read the result off channex_airbnb_oauth_landing's
                // redirect. A hand-built URL has no state Channex recognizes, which
                // is exactly the "invalid_state" error a client-built version
                // produced live on 3 Sep 2026.
                if ($targetPropertyId <= 0) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'property_id is required']);
                    break 2;
                }
                $channexPropId = $resolveChannexPropertyId($targetPropertyId);
                if (!$channexPropId) {
                    http_response_code(422);
                    echo json_encode(['status' => 'error', 'message' => 'Could not sync this property with Channex - check the Channex configuration and try again.']);
                    break 2;
                }
                $groupId = $channelClient->resolveGroupIdForProperty($channexPropId);
                if (!$groupId) {
                    http_response_code(422);
                    echo json_encode(['status' => 'error', 'message' => 'No Channex group has access to this property - contact support.']);
                    break 2;
                }
                $linkToken = bin2hex(random_bytes(16));
                $appOrigin = rtrim((string)($_ENV['APP_BASE_URL'] ?? 'https://staging.ground-code.com'), '/');
                $landingBase = $appOrigin . '/php/api/router.php?action=channex_airbnb_oauth_landing&property_id=' . $targetPropertyId;
                $linkRes = $channelClient->getAirbnbConnectionLink(
                    $groupId,
                    [$channexPropId],
                    $landingBase . '&outcome=success',
                    $landingBase . '&outcome=failure',
                    $linkToken
                );
                if (!$linkRes['success'] || empty($linkRes['data']['attributes']['url'])) {
                    http_response_code($linkRes['http_code'] ?: 502);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to generate the Airbnb authorization link', 'error' => $linkRes['error'] ?? null]);
                    break 2;
                }
                // Stash the token + group so the landing page (a separate, unauthenticated
                // request - the browser leaves our app entirely for Airbnb, then Channex,
                // then comes back) can verify the callback and finish setting up the
                // connection row. channex_channel_id stays null until that callback
                // actually lands - deliberately, this is what makes the earlier
                // "reallyConnected" check correctly keep the wizard off room-mapping
                // until authorization has genuinely completed.
                upsertChannexChannelConnection($pdo, $targetPropertyId, 'AirBNB', [
                    'channex_group_id' => $groupId,
                    'status' => 'awaiting_prerequisite',
                    'settings' => ['oauth_token' => $linkToken, 'link_generated_at' => date('c')],
                    'last_error' => null,
                    'created_by_user_id' => $_SESSION['user_id'] ?? null,
                ]);
                echo json_encode(['status' => 'success', 'data' => ['url' => $linkRes['data']['attributes']['url']]]);
                break 2;

            case 'channex_channel_mapping_details':
                $channelCode = trim((string)($input['channel_code'] ?? $_GET['channel_code'] ?? ''));
                $conn = $targetPropertyId > 0 && $channelCode !== '' ? getChannexChannelConnection($pdo, $targetPropertyId, $channelCode) : null;
                if (!$conn) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'Test the connection before requesting mapping details']);
                    break 2;
                }
                // Airbnb has NO mapping_details endpoint at all (confirmed against
                // Channex's own docs 3 Sep 2026) - it's an OAuth/meta channel, so
                // its real settings (tokens) live on Channex's side already, not in
                // our own bookkeeping `settings` blob (oauth_token/timestamp, which
                // is all we ever store locally for it). Listings are discovered via
                // GET /channels/:id/action/listings once the real channel exists
                // (created automatically when connection_link's authorization
                // completes - see channex_channel_airbnb_connection_link).
                if ($channelCode === 'AirBNB') {
                    if (empty($conn['channex_channel_id'])) {
                        http_response_code(400);
                        echo json_encode(['status' => 'error', 'message' => 'Airbnb authorization has not completed yet']);
                        break 2;
                    }
                    $res = $channelClient->getChannelListings($conn['channex_channel_id']);
                    if (!$res['success']) {
                        http_response_code($res['http_code'] ?: 502);
                        echo json_encode(['status' => 'error', 'message' => 'Failed to load your Airbnb listings', 'error' => $res['error'] ?? null]);
                        break 2;
                    }
                    // Real shape confirmed live: {data: {listing_id_dictionary: {values: [{id, title, ...}]}}}
                    $rawListings = $res['data']['listing_id_dictionary']['values'] ?? [];
                    $listings = array_map(fn($l) => ['id' => (string)($l['id'] ?? ''), 'title' => (string)($l['title'] ?? ('Listing ' . ($l['id'] ?? '')))], $rawListings);
                    echo json_encode(['status' => 'success', 'data' => ['rooms' => $listings, 'is_airbnb_listing_mode' => true]]);
                    break 2;
                }
                if (empty($conn['settings'])) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'Test the connection before requesting mapping details']);
                    break 2;
                }
                $res = $channelClient->getMappingDetails($channelCode, json_decode($conn['settings'], true) ?: []);
                if (!$res['success']) {
                    http_response_code($res['http_code'] ?: 502);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to load mapping details from Channex', 'error' => $res['error'] ?? null]);
                    break 2;
                }
                echo json_encode(['status' => 'success', 'data' => $res['data']]);
                break 2;

            case 'channex_channel_save_mapping':
                // $rooms: [{local_room_id, external_room_code, external_rate_code}, ...] -
                // local_room_id omitted/null for a SINGLE property's one unit.
                // For Airbnb, external_room_code carries the selected listing id
                // (external_rate_code is unused - see the Airbnb branch below).
                $channelCode = trim((string)($input['channel_code'] ?? ''));
                $rooms = is_array($input['rooms'] ?? null) ? $input['rooms'] : [];
                $conn = $targetPropertyId > 0 && $channelCode !== '' ? getChannexChannelConnection($pdo, $targetPropertyId, $channelCode) : null;
                if (!$conn || empty($rooms)) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'channel_code and at least one room mapping are required']);
                    break 2;
                }

                // Airbnb: no bulk rate_plans array / createChannel|updateChannel call
                // (that's the credentials-based-channel path below) - one
                // POST /channels/:id/mappings per room instead, keyed by
                // {rate_plan_id, settings.listing_id}, confirmed against Channex's
                // own docs 3 Sep 2026. The channel already exists (created during
                // OAuth), so there's no "create vs update" branch to worry about.
                if ($channelCode === 'AirBNB') {
                    if (empty($conn['channex_channel_id'])) {
                        http_response_code(422);
                        echo json_encode(['status' => 'error', 'message' => 'Airbnb authorization has not completed yet']);
                        break 2;
                    }
                    // Index what's already saved locally (by local_room_id) so an
                    // unchanged room isn't re-POSTed to Channex on every "Save
                    // Mapping" click - re-submitting the exact same
                    // {rate_plan_id, listing_id} pair Channex already has mapped
                    // is exactly what a re-visit to an already-"ready_to_activate"
                    // connection does (the mapping step re-fetches the same
                    // listings and the owner just clicks Save again), and Channex
                    // rejects that as a duplicate mapping - which used to abort
                    // the ENTIRE batch and discard every other room's real
                    // progress too (found live 3 Sep 2026: a connection that was
                    // already fully, correctly mapped failed to "save" again).
                    $existingRows = getChannexChannelRoomMappings($pdo, (int)$conn['id']);
                    $existingByRoom = [];
                    foreach ($existingRows as $er) {
                        $existingByRoom[$er['local_room_id'] === null ? 'null' : (string)$er['local_room_id']] = $er;
                    }
                    $localRows = [];
                    $failures = [];
                    foreach ($rooms as $r) {
                        $localRoomId = !empty($r['local_room_id']) ? (int)$r['local_room_id'] : null;
                        $listingId = trim((string)($r['external_room_code'] ?? ''));
                        if ($listingId === '') continue;
                        $mapStmt = $pdo->prepare("SELECT channex_rate_plan_id FROM channex_mappings WHERE property_id = ? AND (room_id = ? OR (room_id IS NULL AND ? IS NULL)) LIMIT 1");
                        $mapStmt->execute([$targetPropertyId, $localRoomId, $localRoomId]);
                        $ratePlanId = $mapStmt->fetchColumn();
                        if (!$ratePlanId) continue; // never content-synced - skip, don't fatal the whole save

                        $existing = $existingByRoom[$localRoomId === null ? 'null' : (string)$localRoomId] ?? null;
                        $unchanged = $existing
                            && (string)($existing['channex_rate_plan_id'] ?? '') === (string)$ratePlanId
                            && (string)($existing['external_room_code'] ?? '') === $listingId;
                        if ($unchanged) {
                            $localRows[] = [
                                'local_room_id' => $localRoomId,
                                'channex_rate_plan_id' => $ratePlanId,
                                'external_room_code' => $listingId,
                                'external_rate_code' => $listingId,
                            ];
                            continue;
                        }

                        $mapRes = $channelClient->createChannelMapping($conn['channex_channel_id'], $ratePlanId, ['listing_id' => $listingId]);
                        if (!$mapRes['success']) {
                            // Don't abort the whole batch on one room's failure - keep
                            // going so every OTHER room's real, successful mapping
                            // still gets recorded below instead of silently lost.
                            $roomLabel = $localRoomId !== null ? "room #{$localRoomId}" : 'this property';
                            $errDetail = is_array($mapRes['error'] ?? null)
                                ? ($mapRes['error']['message'] ?? json_encode($mapRes['error']))
                                : (string)($mapRes['error'] ?? 'unknown error');
                            $failures[] = "{$roomLabel}: {$errDetail}";
                            // If it already exists on Channex's side (a stale local
                            // row from a prior partial save), keep the prior known
                            // mapping rather than dropping it entirely.
                            if ($existing) {
                                $localRows[] = [
                                    'local_room_id' => $localRoomId,
                                    'channex_rate_plan_id' => $existing['channex_rate_plan_id'],
                                    'external_room_code' => $existing['external_room_code'],
                                    'external_rate_code' => $existing['external_rate_code'],
                                ];
                            }
                            continue;
                        }
                        $localRows[] = [
                            'local_room_id' => $localRoomId,
                            'channex_rate_plan_id' => $ratePlanId,
                            'external_room_code' => $listingId,
                            'external_rate_code' => $listingId,
                        ];
                    }
                    if (empty($localRows) && empty($failures)) {
                        http_response_code(422);
                        echo json_encode(['status' => 'error', 'message' => 'None of the submitted rooms have a Channex rate plan yet - sync property content first']);
                        break 2;
                    }
                    // Persist whatever succeeded (or was already correct) even if
                    // some rooms failed - a partial save beats losing everything.
                    saveChannexChannelRoomMappings($pdo, (int)$conn['id'], $localRows);
                    if (!empty($failures)) {
                        upsertChannexChannelConnection($pdo, $targetPropertyId, $channelCode, ['last_error' => implode('; ', $failures)]);
                        http_response_code(502);
                        echo json_encode(['status' => 'error', 'message' => 'Failed to map: ' . implode('; ', $failures), 'data' => ['saved_count' => count($localRows)]]);
                        break 2;
                    }
                    upsertChannexChannelConnection($pdo, $targetPropertyId, $channelCode, ['status' => 'ready_to_activate', 'last_error' => null]);
                    echo json_encode(['status' => 'success', 'data' => ['channex_channel_id' => $conn['channex_channel_id']]]);
                    break 2;
                }

                if (empty($conn['settings'])) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'channel_code, a tested connection, and at least one room mapping are required']);
                    break 2;
                }
                $channexPropId = $resolveChannexPropertyId($targetPropertyId);
                if (!$channexPropId) {
                    http_response_code(422);
                    echo json_encode(['status' => 'error', 'message' => 'Property is not synced with Channex']);
                    break 2;
                }

                // Resolve each room's OWN channex_rate_plan_id (channex_mappings is
                // per-room for a MULTI_KEY property, one shared row for SINGLE) and
                // build the rate_plans array the Channel API expects - room_type_code/
                // rate_plan_code MUST be integers (verified gotcha: a string silently
                // lands the mapping under "removed rates" instead of erroring).
                $ratePlansPayload = [];
                $localRows = [];
                foreach ($rooms as $r) {
                    $localRoomId = !empty($r['local_room_id']) ? (int)$r['local_room_id'] : null;
                    $mapStmt = $pdo->prepare("SELECT channex_rate_plan_id FROM channex_mappings WHERE property_id = ? AND (room_id = ? OR (room_id IS NULL AND ? IS NULL)) LIMIT 1");
                    $mapStmt->execute([$targetPropertyId, $localRoomId, $localRoomId]);
                    $ratePlanId = $mapStmt->fetchColumn();
                    if (!$ratePlanId) continue; // this room was never content-synced - skip, don't fatal the whole save

                    $ratePlansPayload[] = [
                        'rate_plan_id' => $ratePlanId,
                        'settings' => [
                            'room_type_code' => (int)$r['external_room_code'],
                            'rate_plan_code' => (int)$r['external_rate_code'],
                            'occupancy' => 2,
                            'pricing_type' => 'OBP',
                            'primary_occ' => true,
                            'readonly' => false,
                        ],
                    ];
                    $localRows[] = [
                        'local_room_id' => $localRoomId,
                        'channex_rate_plan_id' => $ratePlanId,
                        'external_room_code' => (string)$r['external_room_code'],
                        'external_rate_code' => (string)$r['external_rate_code'],
                    ];
                }
                if (empty($ratePlansPayload)) {
                    http_response_code(422);
                    echo json_encode(['status' => 'error', 'message' => 'None of the submitted rooms have a Channex rate plan yet - sync property content first']);
                    break 2;
                }

                $settings = json_decode($conn['settings'], true) ?: [];
                if (empty($conn['channex_channel_id'])) {
                    $groupId = $conn['channex_group_id'] ?: $channelClient->resolveGroupIdForProperty($channexPropId);
                    if (!$groupId) {
                        http_response_code(422);
                        echo json_encode(['status' => 'error', 'message' => 'No Channex group has access to this property']);
                        break 2;
                    }
                    $createRes = $channelClient->createChannel($channelCode, $groupId, [$channexPropId], $settings, $ratePlansPayload, $targetPropertyName);
                    if (!$createRes['success'] || empty($createRes['data']['id'])) {
                        upsertChannexChannelConnection($pdo, $targetPropertyId, $channelCode, ['status' => 'error', 'last_error' => json_encode($createRes['error'] ?? 'Failed to create channel')]);
                        http_response_code($createRes['http_code'] ?: 502);
                        echo json_encode(['status' => 'error', 'message' => 'Failed to save the channel mapping', 'error' => $createRes['error'] ?? null]);
                        break 2;
                    }
                    $channelId = $createRes['data']['id'];
                    upsertChannexChannelConnection($pdo, $targetPropertyId, $channelCode, [
                        'channex_channel_id' => $channelId,
                        'channex_group_id' => $groupId,
                        'status' => 'ready_to_activate',
                        'last_error' => null,
                    ]);
                } else {
                    $channelId = $conn['channex_channel_id'];
                    $updateRes = $channelClient->updateChannel($channelId, ['rate_plans' => $ratePlansPayload]);
                    if (!$updateRes['success']) {
                        http_response_code($updateRes['http_code'] ?: 502);
                        echo json_encode(['status' => 'error', 'message' => 'Failed to update the channel mapping', 'error' => $updateRes['error'] ?? null]);
                        break 2;
                    }
                    upsertChannexChannelConnection($pdo, $targetPropertyId, $channelCode, ['status' => 'ready_to_activate', 'last_error' => null]);
                }

                saveChannexChannelRoomMappings($pdo, (int)getChannexChannelConnection($pdo, $targetPropertyId, $channelCode)['id'], $localRows);
                echo json_encode(['status' => 'success', 'data' => ['channex_channel_id' => $channelId]]);
                break 2;

            case 'channex_channel_check_readiness':
                $channelCode = trim((string)($input['channel_code'] ?? $_GET['channel_code'] ?? ''));
                $conn = $targetPropertyId > 0 && $channelCode !== '' ? getChannexChannelConnection($pdo, $targetPropertyId, $channelCode) : null;
                if (!$conn || empty($conn['channex_channel_id'])) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'No Channex channel to check yet - complete mapping first']);
                    break 2;
                }
                $res = $channelClient->checkReadiness($conn['channex_channel_id']);
                echo json_encode(['status' => 'success', 'data' => $res['data'] ?? $res]);
                break 2;

            case 'channex_channel_activate':
                $channelCode = trim((string)($input['channel_code'] ?? ''));
                $confirmedExistingBookings = !empty($input['confirmed_existing_bookings']);
                // Same class of guard as the bookings checkbox above, same
                // reason it must be re-checked server-side rather than
                // trusted from the client: a client-only gate on this exact
                // action was found live 3 Sep 2026 to be silently unenforced
                // (the checkbox existed in the UI but its value was never
                // sent in the request body at all) - never repeat that for a
                // new confirmation without also wiring the backend check.
                $confirmedRateFallback = !empty($input['confirmed_rate_fallback']);
                $conn = $targetPropertyId > 0 && $channelCode !== '' ? getChannexChannelConnection($pdo, $targetPropertyId, $channelCode) : null;
                if (!$conn || empty($conn['channex_channel_id'])) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'No Channex channel to activate yet - complete mapping first']);
                    break 2;
                }
                if (!$confirmedExistingBookings) {
                    http_response_code(422);
                    echo json_encode(['status' => 'error', 'message' => 'Confirm any existing bookings on this OTA are already entered in Ground Code before going live']);
                    break 2;
                }
                if (!$confirmedRateFallback) {
                    http_response_code(422);
                    echo json_encode(['status' => 'error', 'message' => 'Confirm you understand dates with no explicit rate will push at this property\'s default rate before going live']);
                    break 2;
                }

                // Safety gate 1: Channex's own authoritative readiness check - refuse to
                // activate with an unmapped room/rate (a guaranteed source of problems
                // per Channex's docs), don't rely on a hand-rolled completeness check.
                $readiness = $channelClient->checkReadiness($conn['channex_channel_id']);
                $problems = $readiness['data'] ?? [];
                if (!empty($problems)) {
                    http_response_code(422);
                    echo json_encode(['status' => 'error', 'message' => 'Not ready to activate - resolve these first', 'data' => ['problems' => $problems]]);
                    break 2;
                }

                // Safety gate 2: push fresh ARI before the OTA can see the listing -
                // activating with stale/incomplete availability is how a property gets
                // double-booked on day one. Same enqueue+immediate-drain path
                // channex_push_ari already uses.
                if (is_file(__DIR__ . '/../channex/ari_drain_worker.php')) {
                    require_once __DIR__ . '/../channex/ari_drain_worker.php';
                }
                if (function_exists('enqueueOutboxItem') && class_exists('AriDrainWorker')) {
                    $dFrom = date('Y-m-d');
                    $dTo = date('Y-m-d', strtotime('+500 days'));
                    // MULTI_KEY properties have no room_id=NULL channex_mappings row
                    // (mapped per child room) - push each room individually, or
                    // [null] for a single-unit property, same as before.
                    $pushRoomIds = function_exists('getChannexPushRoomIds')
                        ? getChannexPushRoomIds($pdo, $targetPropertyId)
                        : [null];
                    $preActivateIds = [];
                    foreach ($pushRoomIds as $pushRoomId) {
                        enqueueOutboxItem($pdo, $targetPropertyId, $pushRoomId, 'availability', $dFrom, $dTo, ['action' => 'pre_activate_channel_push']);
                        $preActivateIds[] = (int)$pdo->lastInsertId();
                        enqueueOutboxItem($pdo, $targetPropertyId, $pushRoomId, 'rates', $dFrom, $dTo, ['action' => 'pre_activate_channel_push']);
                        $preActivateIds[] = (int)$pdo->lastInsertId();
                    }
                    (new AriDrainWorker($pdo))->processBatch(max(10, count($preActivateIds)), $preActivateIds);
                }

                $res = $channelClient->activateChannel($conn['channex_channel_id']);
                if (!$res['success']) {
                    http_response_code($res['http_code'] ?: 502);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to activate the channel', 'error' => $res['error'] ?? null]);
                    break 2;
                }
                upsertChannexChannelConnection($pdo, $targetPropertyId, $channelCode, ['status' => 'active', 'last_error' => null]);
                echo json_encode(['status' => 'success', 'data' => $res['data'] ?? $res]);
                break 2;

            case 'channex_channel_deactivate':
            case 'channex_channel_delete':
                $channelCode = trim((string)($input['channel_code'] ?? ''));
                $conn = $targetPropertyId > 0 && $channelCode !== '' ? getChannexChannelConnection($pdo, $targetPropertyId, $channelCode) : null;
                if (!$conn) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'No connected channel found']);
                    break 2;
                }
                // A connection whose channex_channel_id never got set (the
                // request/test step failed, or a status got advanced without
                // the real Channex channel ever being created - confirmed live
                // 3 Sep 2026 on a stuck Airbnb connection) has nothing to
                // deactivate/delete on Channex's side at all. Deactivate is
                // meaningless here (nothing was ever activated); delete just
                // drops the local row so the property can start over cleanly -
                // this was previously impossible, since the guard above used
                // to require channex_channel_id and refused with a 400 for
                // exactly the rows that most needed removing.
                if (empty($conn['channex_channel_id'])) {
                    if ($action === 'channex_channel_deactivate') {
                        http_response_code(400);
                        echo json_encode(['status' => 'error', 'message' => 'This connection was never activated on Channex.']);
                        break 2;
                    }
                    $pdo->prepare("DELETE FROM channex_channel_room_mappings WHERE connection_id = ?")->execute([$conn['id']]);
                    $pdo->prepare("DELETE FROM channex_channel_connections WHERE id = ?")->execute([$conn['id']]);
                    echo json_encode(['status' => 'success']);
                    break 2;
                }
                if ($action === 'channex_channel_deactivate') {
                    $res = $channelClient->deactivateChannel($conn['channex_channel_id']);
                    if ($res['success']) {
                        upsertChannexChannelConnection($pdo, $targetPropertyId, $channelCode, ['status' => 'inactive']);
                    }
                } else {
                    // Channex rejects DELETE on an active channel (422) - deactivate first.
                    $channelClient->deactivateChannel($conn['channex_channel_id']);
                    $res = $channelClient->deleteChannel($conn['channex_channel_id']);
                    if ($res['success']) {
                        $pdo->prepare("DELETE FROM channex_channel_room_mappings WHERE connection_id = ?")->execute([$conn['id']]);
                        $pdo->prepare("DELETE FROM channex_channel_connections WHERE id = ?")->execute([$conn['id']]);
                    }
                }
                if (!$res['success']) {
                    http_response_code($res['http_code'] ?: 502);
                    echo json_encode(['status' => 'error', 'message' => 'Failed', 'error' => $res['error'] ?? null]);
                    break 2;
                }
                echo json_encode(['status' => 'success']);
                break 2;

            case 'channex_channel_pending_staff_action':
                // Admin-side queue (ChannelManager.tsx) - Airbnb connections waiting on
                // a human to complete the OAuth click in Channex's own dashboard.
                $rows = listChannexChannelConnectionsByStatus($pdo, 'staff_action_required');
                echo json_encode(['status' => 'success', 'data' => $rows]);
                break 2;
        }
        break;

    case 'get_channex_status':
        $targetPropertyId = $propertyId ?: (int)($_GET['property_id'] ?? 1);
        $channexCfgPath = __DIR__ . '/../config/channex_config.json';
        $hasConfigFile = is_file($channexCfgPath);
        $cfg = $hasConfigFile ? (json_decode(file_get_contents($channexCfgPath), true) ?: []) : [];
        $hasApiKey = !empty($cfg['api_key']);
        $hasWebhookSecret = !empty($cfg['webhook_secret']);
        $environment = $cfg['environment'] ?? 'staging';

        // Mappings
        if (is_file(__DIR__ . '/../channex/content_sync.php')) {
            require_once __DIR__ . '/../channex/content_sync.php';
            ensureChannexMappingsSchema($pdo);
        }
        $mappingsStmt = $pdo->prepare("
            SELECT m.id, m.property_id, m.room_id, m.channex_property_id, m.channex_room_type_id, m.channex_rate_plan_id, m.sync_status, m.last_synced_at,
                   p.name as property_name
            FROM channex_mappings m
            LEFT JOIN properties p ON m.property_id = p.id
            WHERE m.property_id = ?
            ORDER BY m.id ASC
        ");
        $mappingsStmt->execute([$targetPropertyId]);
        $mappings = $mappingsStmt->fetchAll(PDO::FETCH_ASSOC);

        // Outbox schema & rows
        if (is_file(__DIR__ . '/../channex/outbox.php')) {
            require_once __DIR__ . '/../channex/outbox.php';
            ensureChannexOutboxSchema($pdo);
        }
        $outboxStmt = $pdo->prepare("
            -- channex_outbox has no updated_at column (see ensureChannexOutboxSchema);
            -- selecting one made this whole endpoint 500, so the screen never loaded.
            SELECT id, property_id, room_id, kind, date_from, date_to, status, attempts, task_id, last_error, created_at
            FROM channex_outbox
            WHERE property_id = ?
            ORDER BY id DESC
            LIMIT 50
        ");
        $outboxStmt->execute([$targetPropertyId]);
        $outboxRows = $outboxStmt->fetchAll(PDO::FETCH_ASSOC);

        // Status counts
        $countsStmt = $pdo->prepare("
            SELECT status, COUNT(*) as count
            FROM channex_outbox
            WHERE property_id = ?
            GROUP BY status
        ");
        $countsStmt->execute([$targetPropertyId]);
        $countsRaw = $countsStmt->fetchAll(PDO::FETCH_KEY_PAIR);
        $counts = [
            'pending' => (int)($countsRaw['pending'] ?? 0),
            'sending' => (int)($countsRaw['sending'] ?? 0),
            'done'    => (int)($countsRaw['done'] ?? 0),
            'failed'  => (int)($countsRaw['failed'] ?? 0),
            'total'   => array_sum($countsRaw),
        ];

        echo json_encode([
            'status' => 'success',
            'data' => [
                'config' => [
                    'has_config_file' => $hasConfigFile,
                    'has_api_key' => $hasApiKey,
                    'has_webhook_secret' => $hasWebhookSecret,
                    'environment' => $environment,
                ],
                'mappings' => $mappings,
                'outbox' => $outboxRows,
                'counts' => $counts,
            ]
        ]);
        break;

    case 'channex_push_ari':
        if (is_file(__DIR__ . '/../channex/outbox.php')) {
            require_once __DIR__ . '/../channex/outbox.php';
        }
        if (is_file(__DIR__ . '/../channex/ari_drain_worker.php')) {
            require_once __DIR__ . '/../channex/ari_drain_worker.php';
        }
        if (!function_exists('enqueueOutboxItem') || !class_exists('AriDrainWorker')) {
            http_response_code(503);
            echo json_encode(['status' => 'error', 'message' => 'Channex ARI push module not installed']);
            break;
        }
        $rawInput = file_get_contents('php://input');
        $input = json_decode($rawInput, true) ?: $_POST;

        $targetPropertyId = !empty($input['property_id']) ? (int)$input['property_id'] : ($propertyId ?: 1);
        $dateFrom = trim((string)($input['date_from'] ?? date('Y-m-d')));
        $dateTo = trim((string)($input['date_to'] ?? date('Y-m-d', strtotime('+500 days'))));
        $explicitRoomId = !empty($input['room_id']) ? (int)$input['room_id'] : null;

        // A caller that names a specific room (or a single-unit property)
        // pushes just that one, same as before. Otherwise - a "push for the
        // whole property" call with no room_id - a MULTI_KEY property has no
        // room_id=NULL channex_mappings row to target (mapped per child
        // room), so push each real room individually instead of silently
        // no-oping for all of them (see getChannexPushRoomIds()'s comment).
        $pushRoomIds = $explicitRoomId !== null
            ? [$explicitRoomId]
            : (function_exists('getChannexPushRoomIds') ? getChannexPushRoomIds($pdo, $targetPropertyId) : [null]);

        $enqueuedIds = [];
        foreach ($pushRoomIds as $pushRoomId) {
            enqueueOutboxItem($pdo, $targetPropertyId, $pushRoomId, 'availability', $dateFrom, $dateTo, [
                'action' => 'manual_push_ari',
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
            ]);
            $enqueuedIds[] = (int)$pdo->lastInsertId();

            enqueueOutboxItem($pdo, $targetPropertyId, $pushRoomId, 'rates', $dateFrom, $dateTo, [
                'action' => 'manual_push_ari',
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
            ]);
            $enqueuedIds[] = (int)$pdo->lastInsertId();
        }

        // Drain outbox immediately, scoped strictly to the rows just enqueued
        $worker = new AriDrainWorker($pdo);
        $drainRes = $worker->processBatch(max(10, count($enqueuedIds)), $enqueuedIds);

        // Collect task IDs for the rows we just enqueued
        $idPlaceholders = implode(',', array_fill(0, count($enqueuedIds), '?'));
        $tasksStmt = $pdo->prepare("SELECT id, kind, status, task_id, last_error FROM channex_outbox WHERE id IN ($idPlaceholders)");
        $tasksStmt->execute($enqueuedIds);
        $taskRows = $tasksStmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'data' => [
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
                'enqueued_rows' => [$availOutboxId, $ratesOutboxId],
                'task_rows' => $taskRows,
                'drain_result' => $drainRes,
            ]
        ]);
        break;

    case 'channex_retry_outbox':
        if (is_file(__DIR__ . '/../channex/ari_drain_worker.php')) {
            require_once __DIR__ . '/../channex/ari_drain_worker.php';
        }
        if (!class_exists('AriDrainWorker')) {
            http_response_code(503);
            echo json_encode(['status' => 'error', 'message' => 'Channex outbox worker not installed']);
            break;
        }
        $rawInput = file_get_contents('php://input');
        $input = json_decode($rawInput, true) ?: $_POST;
        $rowId = (int)($input['id'] ?? 0);
        if ($rowId > 0) {
            $pdo->prepare("UPDATE channex_outbox SET status = 'pending', attempts = 0, last_error = NULL WHERE id = ?")->execute([$rowId]);
        }
        $worker = new AriDrainWorker($pdo);
        $drainRes = $worker->processBatch(10, $rowId > 0 ? [$rowId] : null);
        echo json_encode(['status' => 'success', 'data' => $drainRes]);
        break;

    case 'channex_outbox_drain':
        if (is_file(__DIR__ . '/../channex/ari_drain_worker.php')) {
            require_once __DIR__ . '/../channex/ari_drain_worker.php';
        }
        if (!class_exists('AriDrainWorker')) {
            http_response_code(503);
            echo json_encode(['status' => 'error', 'message' => 'Channex outbox worker not installed']);
            break;
        }
        $worker = new AriDrainWorker($pdo);
        $res = $worker->processBatch();
        echo json_encode(['status' => 'success', 'data' => $res]);
        break;

    case 'get_public_booking_info':
        require_once __DIR__ . '/public_booking.php';
        $targetPropertyId = $propertyId;
        if (!empty($_GET['property_id'])) {
            $targetPropertyId = (int)$_GET['property_id'];
        } elseif (!empty($_GET['property_slug'])) {
            $slugStmt = $pdo->prepare("SELECT id FROM properties WHERE slug = ? LIMIT 1");
            $slugStmt->execute([trim($_GET['property_slug'])]);
            $foundId = $slugStmt->fetchColumn();
            if ($foundId) $targetPropertyId = (int)$foundId;
        }
        handleGetPublicBookingInfo($pdo, $targetPropertyId);
        break;

    case 'create_public_booking':
        require_once __DIR__ . '/public_booking.php';
        handleCreatePublicBooking($pdo);
        break;

    case 'fetch_ota_listing_preview':
        require_once __DIR__ . '/property_importer.php';
        $rawInput = file_get_contents('php://input');
        $input = json_decode($rawInput, true) ?: $_GET;
        $channel = trim((string)($input['channel'] ?? 'airbnb'));
        $identifier = trim((string)($input['url'] ?? ($input['id'] ?? ($input['identifier'] ?? ''))));
        if (!$identifier) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Listing URL or Listing ID is required']);
            break;
        }
        $preview = PropertyImporter::fetchPreview($channel, $identifier);
        echo json_encode($preview);
        break;

    case 'apply_ota_listing_to_property':
        require_once __DIR__ . '/property_importer.php';
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $targetPropertyId = (int)($input['property_id'] ?? $propertyId);
        $importedData = $input['imported_data'] ?? [];
        $selectedFields = $input['selected_fields'] ?? [];
        if ($targetPropertyId <= 0 || empty($importedData)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Property ID and imported data are required']);
            break;
        }
        try {
            $result = PropertyImporter::applyToProperty($pdo, $targetPropertyId, $importedData, $selectedFields);
            echo json_encode($result);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        break;

    default:
        $propertyName = $currentProperty['name'] ?? 'Ground Code'; // Default if not found
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

