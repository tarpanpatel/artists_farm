<?php
/**
 * Unified Authentication Endpoint - Mobile Number + 6-Digit Passcode
 * Supports Platform Admins, Tenant Owners, and Property Staff
 */

// Kept in sync with php/api/router.php's session bootstrap (27 Aug 2026,
// "remember me" fix) - this is a separate entry point that never goes
// through router.php, so it needs the identical session_set_cookie_params()
// treatment rather than the old ini_set-only pair (see router.php's comment
// for why: no ini_set equivalent for 'secure'/'samesite', so PHP's own
// automatic per-request Set-Cookie refresh silently dropped those on every
// non-login request otherwise).
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
// Unconditionally suppresses PHP's own implicit Set-Cookie (session_start()
// queues one on every request that touches $_SESSION, new session or a refresh
// of an existing one) - see router.php's full explanation next to its own copy
// of this fix (session-fixation race between concurrent logged-out requests and
// a real login, found 27 Aug 2026, where even "just reload" didn't self-correct
// once a bad cookie had already won). appSetSessionCookie() explicitly
// (re-)issues the cookie on an actual successful login, so this is safe.
header_remove('Set-Cookie');
header('Content-Type: application/json; charset=UTF-8');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/property_resolver.php';
require_once __DIR__ . '/../security/rate_limiter.php';
require_once __DIR__ . '/../security/unified_login.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'POST required']);
    exit;
}

// Automatically ensure required columns exist on users and staff_users tables
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
        if (!in_array('is_platform_admin', $cols)) {
            $pdo->exec("ALTER TABLE users ADD COLUMN `is_platform_admin` TINYINT(1) DEFAULT 0");
        }
        if (!in_array('default_tenant_id', $cols)) {
            $pdo->exec("ALTER TABLE users ADD COLUMN `default_tenant_id` INT DEFAULT NULL");
        }
        if (!in_array('full_name', $cols)) {
            $pdo->exec("ALTER TABLE users ADD COLUMN `full_name` VARCHAR(255) DEFAULT NULL AFTER `username`");
        }
        if (!in_array('must_change_passcode', $cols)) {
            $pdo->exec("ALTER TABLE users ADD COLUMN `must_change_passcode` TINYINT(1) NOT NULL DEFAULT 0");
        }
    }
} catch (Exception $e) {}

try {
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

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$rawIdentifier = trim($input['mobile_number'] ?? $input['username'] ?? $input['phone_number'] ?? '');
$passcode = trim($input['passcode'] ?? $input['password'] ?? '');

if (!$rawIdentifier || !$passcode) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Mobile number and 6-digit passcode required']);
    exit;
}

// SECURITY (11 Aug 2026): this endpoint had none of router.php's login_user protections - no
// rate limiting at all. Same 'login_user' endpoint identifier deliberately used here too (not a
// separate 'authenticate' bucket), so attempts against this endpoint and router.php's login_user
// share one rate-limit counter per client - otherwise an attacker could dodge router.php's limit
// by just hitting this endpoint instead, and vice versa.
$rateLimiter = new RateLimiter($pdo);
$rateLimitClientId = RateLimiter::getClientIdentifier();
$rateLimiter->checkAndBlock($rateLimitClientId, 'login_user');

// Credential-check/session-set/response-build logic lives in
// performUnifiedLogin() (php/security/unified_login.php), shared with
// php/api/router.php's login_user action - extracted 29 Aug 2026 after this
// file's copy was found to have drifted from router.php's in several real
// ways (missing full_name/can_switch_properties, missing success+failure
// audit logging, an early-exit on a wrong staff passcode that both leaked
// username existence and could block the emergency-admin fallback, and a
// narrow catch(PDOException) that let a non-PDO exception go uncaught) -
// see that file's own header comment for the full list. Both entry points
// now call the one shared function and just relay its result, so a future
// fix here can never again land in one copy and not the other.
$loginResult = performUnifiedLogin($pdo, $rawIdentifier, $passcode, $rateLimiter, $rateLimitClientId);
http_response_code($loginResult['status_code']);
echo json_encode($loginResult['body']);
exit;
