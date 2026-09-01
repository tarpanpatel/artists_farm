<?php
/**
 * Shared property-access authorization.
 *
 * Originally lived only inside router.php (added 11 Aug 2026 alongside the
 * cross-tenant IDOR fix - see ROADMAP.md/git history). Extracted here after
 * finding a second, standalone endpoint (php/api/ical_sync.php) that never
 * went through router.php's dispatch and so never got that protection - any
 * file that resolves a property via getCurrentPropertyId() and needs to
 * verify the caller's session actually owns that property/tenant should
 * require this file rather than re-implementing the check.
 *
 * Caller contract: $_SESSION must already be started with
 * session_name('artists_farm_session') + session_start() (matching
 * router.php's session config exactly, so the same login cookie is
 * recognized) before calling isPropertyAccessAllowed().
 */

// Root/platform admins: full access (they manage every tenant by design).
// Staff (session carries property_id from staff_users login): only their
// own assigned property. Tenant/platform users (session carries user_id,
// no property_id): any property under a tenant they belong to.
//
// Deliberately resolves the tenant/platform-user case directly via
// users.default_tenant_id rather than joining staff_users by session
// user_id: users.id and staff_users.id are independent auto-increment
// sequences that can collide (confirmed in this DB), and joining on that
// coincidence let a users-table session inherit an unrelated staff
// account's property access during testing of the original router.php fix.
function isPropertyAccessAllowed(PDO $pdo, int $propertyId): bool {
    // Platform admins manage every tenant/property by design
    if (!empty($_SESSION['is_platform_admin']) || (strtolower($_SESSION['role'] ?? '') === 'root_admin')) return true;

    // Resolve platform admin status directly from users table if user_id is set
    if (!empty($_SESSION['user_id'])) {
        $uStmt = $pdo->prepare("SELECT is_platform_admin, role, default_tenant_id FROM users WHERE id = ? LIMIT 1");
        $uStmt->execute([$_SESSION['user_id']]);
        $uRow = $uStmt->fetch();
        if ($uRow) {
            if (!empty($uRow['is_platform_admin']) || strtolower($uRow['role'] ?? '') === 'root_admin') {
                $_SESSION['is_platform_admin'] = true;
                return true;
            }
            if ($propertyId && !empty($uRow['default_tenant_id'])) {
                $pStmt = $pdo->prepare("SELECT tenant_id FROM properties WHERE id = ? LIMIT 1");
                $pStmt->execute([$propertyId]);
                $pRow = $pStmt->fetch();
                if ($pRow && (int)$pRow['tenant_id'] === (int)$uRow['default_tenant_id']) {
                    return true;
                }
            }
        }
    }

    if (!$propertyId) return false;

    // "Access All Properties" staff: allowed into any property under their own tenant
    if (!empty($_SESSION['staff_access_all_properties']) && !empty($_SESSION['staff_tenant_id'])) {
        $stmt = $pdo->prepare("SELECT tenant_id FROM properties WHERE id = ? LIMIT 1");
        $stmt->execute([$propertyId]);
        $row = $stmt->fetch();
        $allowed = $row && (int)$row['tenant_id'] === (int)$_SESSION['staff_tenant_id'];
        if ($allowed) $_SESSION['property_id'] = $propertyId;
        return $allowed;
    }

    // Exact match is the fast/common path (ordinary single-property staff)
    if (isset($_SESSION['property_id']) && (int)$_SESSION['property_id'] === $propertyId) {
        return true;
    }

    return false;
}
