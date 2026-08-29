<?php
/**
 * Shared identifier + 6-digit-passcode login logic, extracted 29 Aug 2026
 * to close the "duplicate authentication logic" item in ROADMAP.md.
 *
 * Before this, php/api/router.php's `login_user` action and the standalone
 * php/api/authenticate.php endpoint each carried their own independent copy
 * of this exact logic - and had already drifted apart in real, live ways:
 * authenticate.php was missing `full_name` in the session, skipped audit_logs/
 * TelescopeLogger success logging on 3 of 4 branches (and ALL failure
 * branches), left out `can_switch_properties`/`tenant_id`/`tenant_slug` from
 * two of its responses, returned a distinct "Invalid 6-digit passcode" 401
 * that leaks whether a username exists (router.php's generic message does
 * not), exited immediately on a wrong staff passcode instead of falling
 * through to the emergency-admin check (so a real emergency password could
 * be rejected outright if the typed identifier happened to also match a
 * staff username), and caught only PDOException instead of the general
 * Exception router.php catches (a non-PDO exception would go completely
 * uncaught). This function is the single source of truth going forward -
 * both entry points now call it and just relay its result, so a future
 * security fix here can never again land in one copy and not the other.
 *
 * Deliberately NOT included here (each caller keeps its own copy, unchanged):
 * - The session cookie bootstrap (session_name/session_start/
 *   session_set_cookie_params) - required duplication, see CLAUDE.md's
 *   "Session Cookie / Remember Me" section for why (some entry points run
 *   before config/database.php's env detection is available).
 * - The self-healing `ALTER TABLE` column checks - cheap, idempotent, and
 *   each caller already runs its own copy before this function is reached.
 *
 * Caller contract: $pdo, a started session, and an already-checked-and-not-
 * blocked RateLimiter (call ->checkAndBlock() before this) are all assumed.
 * This function calls ->resetAttempts() itself on any successful login.
 *
 * @return array{status_code:int, body:array} - the caller should do
 *   `http_response_code($result['status_code']); echo json_encode($result['body']); exit;`
 */

if (!function_exists('performUnifiedLogin')) {

    function performUnifiedLogin(PDO $pdo, string $rawIdentifier, string $passcode, RateLimiter $rateLimiter, string $rateLimitClientId): array {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';

        $logAudit = function (int $propertyId, string $action, string $user, string $status) use ($pdo, $ip, $ua) {
            try {
                $stmt = $pdo->prepare("INSERT INTO audit_logs (property_id, action, timestamp, user, ip_address, user_agent, status, module) VALUES (?, ?, NOW(), ?, ?, ?, ?, 'login')");
                $stmt->execute([$propertyId, $action, $user, $ip, $ua, $status]);
            } catch (Exception $ea) {
                // SECURITY/DIAGNOSTICS (24 Aug 2026, live report: "I logged in twice
                // recently but it's not showing" in Telescope's Login Portal) - this
                // must stay non-fatal (login itself must never fail because of a
                // logging problem) but must not go silently invisible either.
                if (class_exists('TelescopeLogger')) {
                    TelescopeLogger::log('sql', 'SQL Error', $ea->getMessage(), "Login audit_logs INSERT failed for {$user}", ['username' => $user]);
                }
            }
        };

        try {
            $cleanDigits = preg_replace('/\D/', '', $rawIdentifier);
            $mobileNumber = strlen($cleanDigits) >= 10 ? substr($cleanDigits, -10) : $cleanDigits;

            // SECURITY (11 Aug 2026): a non-numeric identifier collapses $mobileNumber to an
            // empty string, and "phone_number LIKE '%' . $mobileNumber" would become LIKE '%' -
            // matching ANY row with a non-null phone number instead of failing to match. Only
            // include the phone-matching clause/params at all when there's an actual digit
            // string to match against.
            $hasPhoneCandidate = $mobileNumber !== '';

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

                // SECURITY (10 Aug 2026): no "|| $passcode === '123456'" universal skeleton key -
                // new accounts already default to a real stored passcode of '123456', covered by
                // the first clause below.
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
                    $_SESSION['full_name'] = $user['full_name'] ?: $user['username'];

                    appSetSessionCookie(session_id());
                    $rateLimiter->resetAttempts($rateLimitClientId, 'login_user');

                    // Role-aware message (fixed 25 Aug 2026) - a Root/Super Admin login must
                    // never be mislabeled "Staff User" in the audit trail.
                    $loginRoleLabel = $role === 'root_admin' ? 'Root Admin' : ($role === 'super_admin' ? 'Super Admin' : ($role ?: 'User'));
                    $loginSuccessMsg = "{$loginRoleLabel} {$user['username']} logged into system";
                    if (class_exists('TelescopeLogger')) {
                        TelescopeLogger::log('login', 'SUCCESS', $loginSuccessMsg, 'Login Controller [Success]',
                            ['username' => $user['username'], 'role' => $role, 'ip' => $ip, 'status' => 'Success']);
                    }
                    $logAudit(1, $loginSuccessMsg, $user['username'], 'Success');

                    // Property-switcher fields (28 Aug 2026) - computed here too so the icon
                    // appears immediately after a fresh login, not only after the next
                    // check_session/reload picks it up.
                    $ownerTenantSlug = null;
                    if (!empty($user['default_tenant_id'])) {
                        try {
                            $ownerTSlugStmt = $pdo->prepare("SELECT slug FROM tenants WHERE id = ? LIMIT 1");
                            $ownerTSlugStmt->execute([$user['default_tenant_id']]);
                            $ownerTenantSlug = $ownerTSlugStmt->fetchColumn() ?: null;
                        } catch (Exception $e) {}
                    }

                    return ['status_code' => 200, 'body' => [
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
                            'can_switch_properties' => !empty($user['default_tenant_id']) && $ownerTenantSlug ? true : false,
                            'tenant_id' => $user['default_tenant_id'] ?? null,
                            'tenant_slug' => $ownerTenantSlug,
                        ],
                    ]];
                }
            }

            // 2. Search in `staff_users` table (Property Staff)
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
            $staff = $stmt->fetch(PDO::FETCH_ASSOC);

            // SECURITY: a matched staff row with the WRONG passcode deliberately falls
            // through to the emergency-admin check and generic failure message below,
            // rather than exiting immediately with a distinct "Invalid 6-digit passcode"
            // response - that would both leak that this identifier IS a valid staff
            // username (account enumeration) and would incorrectly block the emergency
            // fallback for anyone whose identifier happens to coincidentally match a
            // real staff username (found during the 29 Aug 2026 de-duplication audit -
            // authenticate.php used to do exactly that; router.php never did).
            if ($staff) {
                $storedPasscode = $staff['passcode'] ?? '123456';
                if ($storedPasscode === $passcode) {
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
                        $_SESSION['full_name'] = $staff['full_name'] ?: $staff['username'];
                        // Deliberately NOT setting $_SESSION['property_id'] here -
                        // isPropertyAccessAllowed() (access_control.php) sets it as a
                        // side effect once they actually navigate into a property.

                        appSetSessionCookie(session_id());
                        $rateLimiter->resetAttempts($rateLimitClientId, 'login_user');
                        $logAudit((int)$staff['property_id'], "Staff User {$staff['username']} logged into system", $staff['username'], 'Success');

                        return ['status_code' => 200, 'body' => [
                            'success' => true,
                            'message' => 'Staff login successful',
                            'user' => [
                                'id' => $staff['id'],
                                'username' => $staff['username'],
                                'name' => $staff['full_name'] ?: $staff['username'],
                                'role' => $staff['role'] ?: 'Staff',
                                'is_platform_admin' => false,
                                'default_tenant_id' => null,
                                'must_change_passcode' => false,
                                'access_all_properties' => true,
                                'can_switch_properties' => !empty($tenantRow['tenant_id']) && !empty($tenantRow['tenant_slug']),
                                'tenant_id' => $tenantRow['tenant_id'] ?? null,
                                'tenant_slug' => $tenantRow['tenant_slug'] ?? null,
                            ],
                        ]];
                    }

                    $_SESSION['user_id'] = $staff['id'];
                    $_SESSION['username'] = $staff['username'];
                    $_SESSION['role'] = $staff['role'] ?: 'Staff';
                    $_SESSION['property_id'] = $staff['property_id'];
                    $_SESSION['full_name'] = $staff['full_name'] ?: $staff['username'];

                    appSetSessionCookie(session_id());
                    $rateLimiter->resetAttempts($rateLimitClientId, 'login_user');
                    $logAudit((int)$staff['property_id'], "Staff User {$staff['username']} logged into system", $staff['username'], 'Success');

                    return ['status_code' => 200, 'body' => [
                        'success' => true,
                        'message' => 'Staff login successful',
                        'user' => [
                            'id' => $staff['id'],
                            'username' => $staff['username'],
                            'name' => $staff['full_name'] ?: $staff['username'],
                            'role' => $staff['role'] ?: 'Staff',
                            'is_platform_admin' => false,
                            'default_tenant_id' => null,
                            'must_change_passcode' => false,
                            'property_id' => $staff['property_id'],
                        ],
                    ]];
                }
            }

            // 3. Emergency admin fallback (last-resort root login when all real accounts
            // are inaccessible) - reachable even when $staff matched above but the
            // passcode was wrong, see the security note above.
            $emergencyPassword = getenv('EMERGENCY_ADMIN_PASSWORD');
            if (!empty($emergencyPassword) && $passcode === $emergencyPassword) {
                $_SESSION['user_id'] = 1;
                $_SESSION['username'] = $rawIdentifier ?: 'admin';
                $_SESSION['role'] = 'root_admin';
                $_SESSION['is_platform_admin'] = true;
                $_SESSION['full_name'] = $rawIdentifier ?: 'admin';

                appSetSessionCookie(session_id());
                $rateLimiter->resetAttempts($rateLimitClientId, 'login_user');

                // This path is a full root-admin bypass of every real credential check, so
                // it always gets an audit row - a security-sensitive login must never be
                // the ONE kind of login with no trail at all.
                $emergencyMsg = 'Emergency Admin ' . ($rawIdentifier ?: 'admin') . ' logged into system';
                $logAudit(1, $emergencyMsg, $rawIdentifier ?: 'admin', 'Success');
                if (class_exists('TelescopeLogger')) {
                    TelescopeLogger::log('login', 'SUCCESS', $emergencyMsg, 'Login Controller [Emergency Fallback]',
                        ['username' => $rawIdentifier ?: 'admin', 'ip' => $ip, 'status' => 'Success']);
                }

                return ['status_code' => 200, 'body' => [
                    'success' => true,
                    'message' => 'Emergency admin login successful',
                    'user' => [
                        'id' => 1,
                        'username' => $rawIdentifier ?: 'admin',
                        'name' => $rawIdentifier ?: 'admin',
                        'role' => 'root_admin',
                        'is_platform_admin' => true,
                        'default_tenant_id' => null,
                        'must_change_passcode' => false,
                    ],
                ]];
            }

            // 4. Nothing matched (or a matched row's passcode was wrong) - one generic
            // message, deliberately not confirming whether the identifier itself exists.
            if (class_exists('TelescopeLogger')) {
                TelescopeLogger::log('login', 'WARNING', "Staff User {$rawIdentifier} failed login attempt", 'Login Controller [Failed]',
                    ['identifier' => $rawIdentifier, 'ip' => $ip, 'user_agent' => $ua, 'status' => 'Failed']);
            }
            $logAudit(1, "Staff User {$rawIdentifier} failed login attempt", $rawIdentifier, 'Failed');

            return ['status_code' => 401, 'body' => [
                'success' => false,
                'message' => 'Invalid mobile number/username or 6-digit passcode',
            ]];
        } catch (Exception $e) {
            if (class_exists('TelescopeLogger')) {
                TelescopeLogger::log('login', 'ERROR', "Login error for {$rawIdentifier}: " . $e->getMessage(), 'Login Controller [Exception]',
                    ['identifier' => $rawIdentifier, 'ip' => $ip]);
            }
            return ['status_code' => 500, 'body' => [
                'success' => false,
                'message' => 'Login error: ' . $e->getMessage(),
            ]];
        }
    }
}
