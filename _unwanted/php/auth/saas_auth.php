<?php
/**
 * SAAS Authentication & Authorization System
 * Three-tier access: Platform Admin → Tenant Admin → Property User
 */

function getUserAccessInfo($pdo, $userId) {
    $stmt = $pdo->prepare("SELECT id, username, role, is_platform_admin, property_id FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    if (!$user) return null;

    $accessInfo = [
        'user_id' => $userId,
        'is_platform_admin' => (bool)$user['is_platform_admin'],
        'property_id' => $user['property_id'],
        'tenant_id' => null,
        'is_tenant_admin' => false,
        'accessible_properties' => [],
        'role' => 'property_user',
        'tenant_role' => null, // granular tenant_users.role (owner/admin/manager/viewer), when applicable
    ];

    if ($accessInfo['is_platform_admin']) {
        $accessInfo['role'] = 'platform_admin';
        $stmt = $pdo->query("SELECT id FROM properties");
        $accessInfo['accessible_properties'] = $stmt->fetchAll(PDO::FETCH_COLUMN);
        return $accessInfo;
    }

    $stmt = $pdo->prepare("SELECT tenant_id, role FROM tenant_users WHERE user_id = ?");
    $stmt->execute([$userId]);
    $tenantUser = $stmt->fetch();

    if ($tenantUser) {
        $accessInfo['is_tenant_admin'] = true;
        $accessInfo['tenant_id'] = $tenantUser['tenant_id'];
        $accessInfo['role'] = 'tenant_admin';
        $accessInfo['tenant_role'] = $tenantUser['role'];
        $stmt = $pdo->prepare("SELECT id FROM properties WHERE tenant_id = ?");
        $stmt->execute([$tenantUser['tenant_id']]);
        $accessInfo['accessible_properties'] = $stmt->fetchAll(PDO::FETCH_COLUMN);
    } else {
        $accessInfo['accessible_properties'] = [$user['property_id']];
    }

    return $accessInfo;
}

function canAccessProperty($accessInfo, $propertyId) {
    if ($accessInfo['is_platform_admin']) return true;
    return in_array($propertyId, $accessInfo['accessible_properties']);
}

function getDataScope($accessInfo, $currentPropertyId = null) {
    if ($accessInfo['is_platform_admin']) {
        return ['scope' => 'all', 'property_ids' => []];
    } elseif ($accessInfo['is_tenant_admin']) {
        if ($currentPropertyId && in_array($currentPropertyId, $accessInfo['accessible_properties'])) {
            return ['scope' => 'property', 'property_ids' => [$currentPropertyId]];
        } else {
            return ['scope' => 'tenant', 'property_ids' => $accessInfo['accessible_properties']];
        }
    } else {
        return ['scope' => 'property', 'property_ids' => [$accessInfo['property_id']]];
    }
}

function buildPropertyFilter($scopeInfo, $tableAlias = '') {
    $prefix = $tableAlias ? $tableAlias . '.' : '';
    switch ($scopeInfo['scope']) {
        case 'all': return '';
        case 'tenant':
            if (empty($scopeInfo['property_ids'])) return '0=1';
            return "{$prefix}property_id IN (" . implode(',', array_map('intval', $scopeInfo['property_ids'])) . ")";
        case 'property':
            if (empty($scopeInfo['property_ids'])) return '0=1';
            return "{$prefix}property_id = " . (int)$scopeInfo['property_ids'][0];
        default: return '0=1';
    }
}

function getTenantDashboardStats($pdo, $tenantId) {
    $stats = ['total_properties' => 0, 'total_revenue' => 0, 'total_transactions' => 0, 'total_guests' => 0, 'total_billing' => 0, 'total_staff' => 0, 'recent_activity' => []];

    $stmt = $pdo->prepare("SELECT COUNT(*) FROM properties WHERE tenant_id = ?");
    $stmt->execute([$tenantId]);
    $stats['total_properties'] = (int)$stmt->fetchColumn();

    $stmt = $pdo->prepare("
        SELECT SUM(amount) as total_revenue, COUNT(*) as total_transactions
        FROM financial_ledger
        WHERE direction = 'credit' AND property_id IN (SELECT id FROM properties WHERE tenant_id = ?)
    ");
    $stmt->execute([$tenantId]);
    $financial = $stmt->fetch();
    $stats['total_revenue'] = $financial['total_revenue'] ?? 0;
    $stats['total_transactions'] = $financial['total_transactions'] ?? 0;

    $stmt = $pdo->prepare("
        SELECT COUNT(*) as total_guests, SUM(total_charge) as total_billing
        FROM guests
        WHERE property_id IN (SELECT id FROM properties WHERE tenant_id = ?) AND status = 'CheckedOut'
    ");
    $stmt->execute([$tenantId]);
    $guests = $stmt->fetch();
    $stats['total_guests'] = $guests['total_guests'] ?? 0;
    $stats['total_billing'] = $guests['total_billing'] ?? 0;

    $stmt = $pdo->prepare("
        SELECT COUNT(*) as total_staff
        FROM staff_users
        WHERE property_id IN (SELECT id FROM properties WHERE tenant_id = ?) AND status = 'Active'
    ");
    $stmt->execute([$tenantId]);
    $stats['total_staff'] = $stmt->fetchColumn() ?: 0;

    $stmt = $pdo->prepare("
        SELECT p.id as property_id, p.name as property_name, COUNT(g.id) as recent_checkins
        FROM properties p
        LEFT JOIN guests g ON p.id = g.property_id AND g.checkin_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        WHERE p.tenant_id = ?
        GROUP BY p.id, p.name
    ");
    $stmt->execute([$tenantId]);
    $stats['recent_activity'] = $stmt->fetchAll();

    return $stats;
}

function getPropertySwitchMenu($pdo, $accessInfo) {
    if (!$accessInfo['is_tenant_admin'] || empty($accessInfo['accessible_properties'])) return [];
    $ids = implode(',', array_map('intval', $accessInfo['accessible_properties']));
    $stmt = $pdo->query("SELECT id, name, slug FROM properties WHERE id IN ($ids) ORDER BY name");
    return $stmt->fetchAll();
}

function getDefaultRedirect($accessInfo) {
    if ($accessInfo['is_platform_admin']) return 'platform_property_management.php';
    if ($accessInfo['is_tenant_admin']) return 'tenant_dashboard.php';
    return 'index.php?property_id=' . $accessInfo['property_id'];
}

require_once __DIR__ . '/../config/database.php';

/**
 * Authentication check for legacy PHP pages
 * Redirects to React app login if not authenticated
 */
function requireAuth($pdo, $requiredRole = 'property_user') {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }

    if (!isset($_SESSION['user_id'])) {
        header('Location: /artists_farm/', true, 302);
        exit;
    }

    $accessInfo = getUserAccessInfo($pdo, $_SESSION['user_id']);
    if (!$accessInfo) {
        session_destroy();
        header('Location: /artists_farm/', true, 302);
        exit;
    }

    $roleHierarchy = ['property_user' => 1, 'tenant_admin' => 2, 'platform_admin' => 3];
    $userRoleLevel = $roleHierarchy[$accessInfo['role']] ?? 0;
    $requiredLevel = $roleHierarchy[$requiredRole] ?? 0;

    if ($userRoleLevel < $requiredLevel) {
        header('Location: /artists_farm/?error=unauthorized', true, 302);
        exit;
    }

    return $accessInfo;
}