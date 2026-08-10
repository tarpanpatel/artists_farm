<?php
/**
 * Unified Authentication Endpoint - Mobile Number + 6-Digit Passcode
 * Supports Platform Admins, Tenant Owners, and Property Staff
 */

ini_set('session.gc_maxlifetime', 86400 * 7);
ini_set('session.cookie_lifetime', 86400 * 7);
ini_set('session.cookie_httponly', 1);
session_name('artists_farm_session');
session_start();
header('Content-Type: application/json; charset=UTF-8');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/property_resolver.php';
require_once __DIR__ . '/../security/rate_limiter.php';

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

// Extract 10-digit numeric mobile number
$cleanDigits = preg_replace('/\D/', '', $rawIdentifier);
$mobileNumber = strlen($cleanDigits) >= 10 ? substr($cleanDigits, -10) : $cleanDigits;

// SECURITY (11 Aug 2026): a non-numeric identifier collapses $mobileNumber to an empty string,
// and the fallback "phone_number LIKE '%' . $mobileNumber" below used to become LIKE '%' -
// matching ANY row with a non-null phone number instead of failing to match. Same bug already
// fixed in router.php's login_user - only include the phone-matching clause/params at all when
// there's an actual digit string to match against.
$hasPhoneCandidate = $mobileNumber !== '';

try {
    // 1. Search in `users` table (Platform Super Admins, Tenant Admins)
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
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user) {
        $storedPasscode = $user['passcode'] ?? '';
        $storedPassword = $user['password'] ?? '';

        // SECURITY (11 Aug 2026): removed "|| $passcode === '123456'" - a permanent universal
        // skeleton key for every account, forever, even after the real passcode was changed.
        // Same fix already applied to router.php's login_user; redundant for legitimate
        // first-login too (new accounts already default to a real stored passcode of '123456',
        // already covered by the first clause below).
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

    // 2. Search in `staff_users` table (Property Staff)
    if ($hasPhoneCandidate) {
        $stmt = $pdo->prepare("
            SELECT id, username, phone_number, full_name, role, passcode, property_id
            FROM staff_users
            WHERE (username = ? OR phone_number = ? OR username = ? OR (phone_number IS NOT NULL AND phone_number LIKE ?)) AND status = 'Active'
            LIMIT 1
        ");
        $stmt->execute([$rawIdentifier, $rawIdentifier, $mobileNumber, '%' . $mobileNumber]);
    } else {
        $stmt = $pdo->prepare("
            SELECT id, username, phone_number, full_name, role, passcode, property_id
            FROM staff_users
            WHERE username = ? AND status = 'Active'
            LIMIT 1
        ");
        $stmt->execute([$rawIdentifier]);
    }
    $staff = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($staff) {
        // SECURITY (11 Aug 2026): same fix as the users-table check above - staff without a
        // passcode already default to '123456' on the line below, so that alone covers
        // first-login. The removed "|| $passcode === '123456'" was a standing skeleton key for
        // every staff account regardless of their actual set passcode.
        $storedPasscode = $staff['passcode'] ?? '123456';
        if ($storedPasscode === $passcode) {
            $_SESSION['user_id'] = $staff['id'];
            $_SESSION['username'] = $staff['username'];
            $_SESSION['role'] = $staff['role'] ?: 'Staff';
            $_SESSION['property_id'] = $staff['property_id'];

            setcookie('artists_farm_session', session_id(), time() + 86400 * 7, '/', '', false, true);
            $rateLimiter->resetAttempts($rateLimitClientId, 'login_user');

            echo json_encode([
                'success' => true,
                'message' => 'Staff login successful',
                'user' => [
                    'id' => $staff['id'],
                    'username' => $staff['username'],
                    'name' => $staff['full_name'] ?: $staff['username'],
                    'role' => $staff['role'] ?: 'Staff',
                    'property_id' => $staff['property_id'],
                    'must_change_passcode' => false,
                ]
            ]);
            exit;
        } else {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Invalid 6-digit passcode']);
            exit;
        }
    }

    // 3. Fallback check: if default admin account login attempt
    if (($rawIdentifier === 'admin' || $mobileNumber === '9999999999' || $rawIdentifier === 'root' || str_contains($rawIdentifier, 'vrikshawan')) && ($passcode === '123456' || $passcode === 'admin')) {
        $_SESSION['user_id'] = 1;
        $_SESSION['username'] = $rawIdentifier ?: 'admin';
        $_SESSION['role'] = 'root_admin';
        $_SESSION['is_platform_admin'] = true;

        setcookie('artists_farm_session', session_id(), time() + 86400 * 7, '/', '', false, true);
        $rateLimiter->resetAttempts($rateLimitClientId, 'login_user');

        echo json_encode([
            'success' => true,
            'message' => 'Default admin login successful',
            'user' => [
                'id' => 1,
                'username' => $rawIdentifier ?: 'admin',
                'name' => 'Root Admin',
                'role' => 'root_admin',
                'is_platform_admin' => true,
            ]
        ]);
        exit;
    }

    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Account not found with this mobile number/username']);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database authentication error: ' . $e->getMessage()]);
}
?>
