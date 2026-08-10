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
    if (!$propertyId) return false;

    if (!empty($_SESSION['is_platform_admin']) || (($_SESSION['role'] ?? '') === 'root_admin')) return true;

    if (isset($_SESSION['property_id'])) {
        return (int)$_SESSION['property_id'] === $propertyId;
    }

    if (isset($_SESSION['user_id']) && isset($_SESSION['username'])) {
        $stmt = $pdo->prepare("SELECT default_tenant_id FROM users WHERE id = ? LIMIT 1");
        $stmt->execute([$_SESSION['user_id']]);
        $row = $stmt->fetch();
        if ($row && !empty($row['default_tenant_id'])) {
            $stmt2 = $pdo->prepare("SELECT tenant_id FROM properties WHERE id = ? LIMIT 1");
            $stmt2->execute([$propertyId]);
            $prow = $stmt2->fetch();
            if ($prow && (int)$prow['tenant_id'] === (int)$row['default_tenant_id']) return true;
        }
    }

    return false;
}
