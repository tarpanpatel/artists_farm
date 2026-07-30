<?php
/**
 * Tenant Onboarding Workflow Functions
 */

function requestTenantOnboarding($pdo, $data) {
    try {
        $stmt = $pdo->prepare("INSERT INTO tenant_requests (tenant_name, tenant_slug, owner_name, owner_email, owner_phone, subscription_plan, max_properties, max_users, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $data['tenant_name'], $data['tenant_slug'],
            $data['owner_name'] ?? null, $data['owner_email'] ?? null, $data['owner_phone'] ?? null,
            $data['subscription_plan'] ?? 'free', $data['max_properties'] ?? 1, $data['max_users'] ?? 5,
            $data['reason'] ?? ''
        ]);
        return ['success' => true, 'message' => 'Onboarding request submitted. Our team will review it within 24 hours.'];
    } catch (Exception $e) {
        return ['success' => false, 'message' => $e->getMessage()];
    }
}

function approveTenantOnboarding($pdo, $requestId, $adminUserId, $notes = '') {
    $stmt = $pdo->prepare("SELECT * FROM tenant_requests WHERE id = ? AND status = 'pending'");
    $stmt->execute([$requestId]);
    $request = $stmt->fetch();
    if (!$request) return ['success' => false, 'message' => 'Request not found or already processed'];

    try {
        $pdo->beginTransaction();
        $tenantId = createTenantInternal($pdo, [
            'tenant_name' => $request['tenant_name'], 'tenant_slug' => $request['tenant_slug'],
            'owner_name' => $request['owner_name'], 'owner_email' => $request['owner_email'],
            'subscription_plan' => $request['subscription_plan'], 'max_properties' => $request['max_properties'],
            'max_users' => $request['max_users']
        ]);
        if (!$tenantId) { $pdo->rollback(); return ['success' => false, 'message' => 'Failed to create tenant']; }

        $propertyId = createDefaultProperty($pdo, $tenantId, $request['tenant_name']);
        assignDefaultModules($pdo, $tenantId, $propertyId);
        $userId = createTenantAdminUser($pdo, $request['tenant_name'], $tenantId, $propertyId);

        $pdo->prepare("UPDATE tenant_requests SET status = 'approved', tenant_id = ?, reviewed_by = ?, reviewed_at = NOW(), review_notes = ?, resolved_at = NOW() WHERE id = ?")
            ->execute([$tenantId, $adminUserId, $notes, $requestId]);
        $pdo->commit();
        return ['success' => true, 'message' => 'Tenant onboarding approved', 'tenant_id' => $tenantId, 'user_id' => $userId];
    } catch (Exception $e) {
        $pdo->rollback();
        return ['success' => false, 'message' => $e->getMessage()];
    }
}

function rejectTenantOnboarding($pdo, $requestId, $adminUserId, $reason) {
    $stmt = $pdo->prepare("UPDATE tenant_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), review_notes = ?, resolved_at = NOW() WHERE id = ? AND status = 'pending'");
    $stmt->execute([$adminUserId, $reason, $requestId]);
    return ['success' => true, 'message' => 'Onboarding request rejected'];
}

function createTenantInternal($pdo, $data) {
    try {
        $stmt = $pdo->prepare("INSERT INTO tenants (name, slug, owner_name, owner_email, subscription_plan, max_properties, max_users, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)");
        $stmt->execute([$data['tenant_name'], $data['tenant_slug'], $data['owner_name'], $data['owner_email'], $data['subscription_plan'], $data['max_properties'], $data['max_users']]);
        return $pdo->lastInsertId();
    } catch (Exception $e) { return false; }
}

function createDefaultProperty($pdo, $tenantId, $tenantName) {
    try {
        $defaultName = $tenantName . ' - Location 1';
        $defaultSlug = strtolower(preg_replace('/[^a-z0-9]+/', '-', $tenantName)) . '-location-1';
        $config = json_encode(['type_settings' => ['label' => 'Vacation Home', 'has_units' => false, 'has_independent_guests' => false], 'amenities' => [], 'room_count' => 0, 'unit_details' => null, 'billing_mode' => 'per_stay']);
        $stmt = $pdo->prepare("INSERT INTO properties (tenant_id, name, slug, property_type, unit_count, max_capacity, status, tailwind_color_scheme, property_configurations) VALUES (?, ?, ?, 'vacation_home', 1, 0, 'active', 'blue', ?)");
        $stmt->execute([$tenantId, $defaultName, $defaultSlug, $config]);
        return $pdo->lastInsertId();
    } catch (Exception $e) { return false; }
}

function assignDefaultModules($pdo, $tenantId, $propertyId) {
    $defaultModules = ['kitchen', 'inventory', 'staff', 'guests', 'finance'];
    $stmt = $pdo->prepare("INSERT IGNORE INTO property_modules (property_id, module_slug, is_enabled) VALUES (?, ?, 1)");
    foreach ($defaultModules as $moduleSlug) {
        try { $stmt->execute([$propertyId, $moduleSlug]); } catch (Exception $e) {}
    }
    return count($defaultModules);
}

function createTenantAdminUser($pdo, $tenantName, $tenantId, $propertyId) {
    try {
        $adminUsername = strtolower(preg_replace('/[^a-z0-9]+/', '-', $tenantName));
        $defaultPasscode = '123456';
        $stmt = $pdo->prepare("INSERT INTO users (property_id, username, passcode, role, is_platform_admin) VALUES (?, ?, ?, 'super_admin', 0)");
        $stmt->execute([$propertyId, $adminUsername, $defaultPasscode]);
        $userId = $pdo->lastInsertId();
        $pdo->prepare("INSERT INTO tenant_users (tenant_id, user_id, role, can_create_properties, can_manage_users, can_manage_billing) VALUES (?, ?, 'owner', 1, 1, 1)")->execute([$tenantId, $userId]);
        return ['user_id' => $userId, 'username' => $adminUsername, 'passcode' => $defaultPasscode];
    } catch (Exception $e) { return false; }
}

function getPendingOnboardingRequests($pdo) {
    $stmt = $pdo->query("SELECT * FROM tenant_requests WHERE status = 'pending' ORDER BY requested_at DESC");
    return $stmt->fetchAll();
}