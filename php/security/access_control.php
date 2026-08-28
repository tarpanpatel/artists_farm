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
    // Platform admins manage every tenant/property by design - this must be
    // checked BEFORE the !$propertyId guard below, not after. Root-admin-only
    // actions called from /root_dashboard/ (get_all_tenants, get_all_properties,
    // get_tenant_credentials, reset_staff_passcodes, the admin profile actions,
    // ...) have no real property in scope at all, so $propertyId resolves to 0 -
    // with the old ordering that hit the early "return false" before ever
    // reaching this bypass, 403ing every one of those actions for the actual
    // platform admin they're root-admin-gated for in the first place.
    if (!empty($_SESSION['is_platform_admin']) || (($_SESSION['role'] ?? '') === 'root_admin')) return true;

    if (!$propertyId) return false;

    // "Access All Properties" staff (11 Aug 2026, see router.php/authenticate.php
    // login_user): allowed into any property under their own tenant, not locked to
    // one property_id. Checked BEFORE the plain isset($_SESSION['property_id'])
    // branch below on purpose - once this kind of staff navigates into a property,
    // the sync below also sets $_SESSION['property_id'] (so other code that reads
    // it directly, e.g. calendar_session.php, sees the right value), and if the
    // isset() branch ran first afterwards it would wrongly narrow them back down
    // to that one property instead of their whole tenant.
    if (!empty($_SESSION['staff_access_all_properties']) && !empty($_SESSION['staff_tenant_id'])) {
        $stmt = $pdo->prepare("SELECT tenant_id FROM properties WHERE id = ? LIMIT 1");
        $stmt->execute([$propertyId]);
        $row = $stmt->fetch();
        $allowed = $row && (int)$row['tenant_id'] === (int)$_SESSION['staff_tenant_id'];
        if ($allowed) $_SESSION['property_id'] = $propertyId;
        return $allowed;
    }

    // Exact match is the fast/common path (ordinary single-property staff),
    // but a MISMATCH must fall through to the tenant-ownership check below
    // rather than returning false outright (bug found 28 Aug 2026, live via
    // check_session reporting session_property_mismatch for a Super Admin
    // navigating into a property under their own tenant that just isn't
    // their own literal "home" property_id - e.g. a demo super-admin account
    // whose own property_id is 1 visiting a sibling property under the same
    // tenant). login_user always sets $_SESSION['property_id'] to the user's
    // row, even for tenant/platform accounts (contradicting this file's own
    // top comment, which assumed such sessions carry no property_id at all)
    // - so this branch used to short-circuit false before the tenant check
    // ever ran, making that check effectively dead code for any logged-in
    // tenant-owning user whose home property wasn't the one being viewed.
    if (isset($_SESSION['property_id']) && (int)$_SESSION['property_id'] === $propertyId) {
        return true;
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
