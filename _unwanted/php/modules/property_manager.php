<?php
/**
 * Property Management System for SaaS Platform
 * Platform Admin: Full control over all properties
 * Tenant Admin: Can request changes, view own properties
 */

const PROPERTY_TYPES = [
    'vacation_home' => [
        'label' => 'Vacation Home',
        'icon' => '🏠',
        'description' => 'Whole property booked by one group. Multiple rooms, single booking entity.',
        'has_units' => false,
        'has_independent_guests' => false,
        'capacity_type' => 'total_occupancy',
        'features' => ['rooms', 'common_areas', 'kitchen', 'billing_per_stay']
    ],
    'apartment_unit' => [
        'label' => 'Apartment Unit',
        'icon' => '🏢',
        'description' => 'Single apartment/unit with multiple rooms. One group stays at a time.',
        'has_units' => false,
        'has_independent_guests' => false,
        'capacity_type' => 'total_occupancy',
        'features' => ['rooms', 'kitchen', 'billing_per_guest', 'housekeeping']
    ],
    'multi_unit_building' => [
        'label' => 'Multi-Unit Building',
        'icon' => '🏗️',
        'description' => 'Building with independent apartments/rooms. Each unit has different guests.',
        'has_units' => true,
        'has_independent_guests' => true,
        'capacity_type' => 'per_unit',
        'features' => ['units', 'independent_billing', 'per_room_guests', 'housekeeping', 'maintenance']
    ]
];

function createProperty($pdo, $data, $platformAdminId) {
    $tenantId = $data['tenant_id'] ?? null;
    $propertyType = $data['property_type'] ?? 'vacation_home';

    if ($tenantId) {
        $stmt = $pdo->prepare("SELECT id, name, max_properties FROM tenants WHERE id = ?");
        $stmt->execute([$tenantId]);
        $tenant = $stmt->fetch();
        if (!$tenant) {
            return ['success' => false, 'message' => 'Tenant not found'];
        }
        $currentProps = $pdo->prepare("SELECT COUNT(*) FROM properties WHERE tenant_id = ?");
        $currentProps->execute([$tenantId]);
        $count = $currentProps->fetchColumn();
        if ($count >= $tenant['max_properties']) {
            return ['success' => false, 'message' => "Tenant has reached maximum property limit ({$tenant['max_properties']})"];
        }
    }

    if (!isset(PROPERTY_TYPES[$propertyType])) {
        return ['success' => false, 'message' => "Invalid property type: $propertyType"];
    }

    try {
        $stmt = $pdo->prepare("INSERT INTO properties (tenant_id, name, slug, address, property_type, unit_count, max_capacity, status, tailwind_color_scheme, property_configurations) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)");
        $config = json_encode([
            'type_settings' => PROPERTY_TYPES[$propertyType],
            'amenities' => $data['amenities'] ?? [],
            'room_count' => $data['room_count'] ?? 0,
            'unit_details' => $data['unit_details'] ?? null,
            'billing_mode' => $data['billing_mode'] ?? 'per_stay',
            'city' => $data['city'] ?? '',
        ]);
        $colorScheme = $data['tailwind_color_scheme'] ?? $data['color_scheme'] ?? 'blue';
        $stmt->execute([
            $tenantId,
            $data['name'],
            $data['slug'],
            $data['address'] ?? '',
            $propertyType,
            $data['unit_count'] ?? 1,
            $data['max_capacity'] ?? 0,
            $colorScheme,
            $config
        ]);
        $propertyId = $pdo->lastInsertId();
        logPropertyAction($pdo, $propertyId, 'created', 'Property created by platform admin', $platformAdminId);

        // Create super admin user for tenant if property is for a tenant
        if ($tenantId) {
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM tenant_users WHERE tenant_id = ?");
            $stmt->execute([$tenantId]);
            $userCount = (int)$stmt->fetchColumn();

            // Only create user if no users exist for this tenant
            if ($userCount === 0) {
                $stmt = $pdo->prepare("SELECT name FROM tenants WHERE id = ?");
                $stmt->execute([$tenantId]);
                $tenantRow = $stmt->fetch();
                $tenantName = $tenantRow['name'] ?? 'Tenant';

                $adminUsername = strtolower(preg_replace('/[^a-z0-9]+/', '-', $tenantName)) . '_admin';
                $tempPassword = bin2hex(random_bytes(6));

                $stmt = $pdo->prepare("INSERT INTO users (property_id, username, password, role, is_platform_admin) VALUES (?, ?, ?, 'super_admin', 0)");
                $stmt->execute([$propertyId, $adminUsername, password_hash($tempPassword, PASSWORD_DEFAULT)]);
                $userId = $pdo->lastInsertId();

                $pdo->prepare("INSERT INTO tenant_users (tenant_id, user_id, role, can_create_properties, can_manage_users, can_manage_billing) VALUES (?, ?, 'owner', 1, 1, 1)")->execute([$tenantId, $userId]);
            }
        }

        return ['success' => true, 'message' => 'Property created successfully', 'property_id' => $propertyId];
    } catch (Exception $e) {
        return ['success' => false, 'message' => $e->getMessage()];
    }
}

function requestPropertyCreation($pdo, $tenantId, $data, $tenantUserId) {
    $stmt = $pdo->prepare("SELECT max_properties FROM tenants WHERE id = ?");
    $stmt->execute([$tenantId]);
    $tenant = $stmt->fetch();
    if (!$tenant) {
        return ['success' => false, 'message' => 'Tenant not found'];
    }

    $stmt = $pdo->prepare("SELECT COUNT(*) FROM properties WHERE tenant_id = ?");
    $stmt->execute([$tenantId]);
    $count = $stmt->fetchColumn();
    if ($count >= $tenant['max_properties']) {
        return ['success' => false, 'message' => 'You have reached your property limit. Contact platform admin to upgrade your plan.'];
    }
    try {
        $stmt = $pdo->prepare("INSERT INTO property_requests (tenant_id, request_type, requested_data, reason) VALUES (?, 'create_property', ?, ?)");
        $stmt->execute([$tenantId, json_encode($data), $data['reason'] ?? 'New property request']);
        return ['success' => true, 'message' => 'Property request submitted for admin review'];
    } catch (Exception $e) {
        return ['success' => false, 'message' => $e->getMessage()];
    }
}

function requestPropertyModification($pdo, $tenantId, $propertyId, $data, $tenantUserId) {
    $stmt = $pdo->prepare("SELECT id FROM properties WHERE id = ? AND tenant_id = ?");
    $stmt->execute([$propertyId, $tenantId]);
    if (!$stmt->fetch()) {
        return ['success' => false, 'message' => 'Property not found or not owned by this tenant'];
    }
    try {
        $stmt = $pdo->prepare("INSERT INTO property_requests (tenant_id, request_type, property_id, requested_data, reason) VALUES (?, 'modify_property', ?, ?, ?)");
        $stmt->execute([$tenantId, $propertyId, json_encode($data), $data['reason'] ?? 'Property modification request']);
        return ['success' => true, 'message' => 'Modification request submitted for admin review'];
    } catch (Exception $e) {
        return ['success' => false, 'message' => $e->getMessage()];
    }
}

function approvePropertyRequest($pdo, $requestId, $adminUserId, $notes = '') {
    $stmt = $pdo->prepare("SELECT * FROM property_requests WHERE id = ? AND status = 'pending'");
    $stmt->execute([$requestId]);
    $request = $stmt->fetch();
    if (!$request) {
        return ['success' => false, 'message' => 'Request not found or already processed'];
    }
    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare("UPDATE property_requests SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(), review_notes = ?, resolved_at = NOW() WHERE id = ?");
        $stmt->execute([$adminUserId, $notes, $requestId]);
        if ($request['request_type'] === 'create_property') {
            $data = json_decode($request['requested_data'], true);
            $result = createPropertyInternal($pdo, $data, $request['tenant_id']);
            if (!$result['success']) {
                $pdo->rollback();
                return ['success' => false, 'message' => 'Failed to create property: ' . $result['message']];
            }
            $pdo->prepare("UPDATE property_requests SET property_id = ? WHERE id = ?")->execute([$result['property_id'], $requestId]);
        }
        $pdo->commit();
        return ['success' => true, 'message' => 'Request approved successfully'];
    } catch (Exception $e) {
        $pdo->rollback();
        return ['success' => false, 'message' => $e->getMessage()];
    }
}

function rejectPropertyRequest($pdo, $requestId, $adminUserId, $reason) {
    $stmt = $pdo->prepare("UPDATE property_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), review_notes = ?, resolved_at = NOW() WHERE id = ? AND status = 'pending'");
    $stmt->execute([$adminUserId, $reason, $requestId]);
    return ['success' => true, 'message' => 'Request rejected'];
}

function createPropertyInternal($pdo, $data, $tenantId) {
    $propertyType = $data['property_type'] ?? 'vacation_home';
    if (!isset(PROPERTY_TYPES[$propertyType])) {
        return ['success' => false, 'message' => 'Invalid property type'];
    }
    try {
        $stmt = $pdo->prepare("INSERT INTO properties (tenant_id, name, slug, address, property_type, unit_count, max_capacity, status, tailwind_color_scheme, property_configurations) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)");
        $config = json_encode([
            'type_settings' => PROPERTY_TYPES[$propertyType],
            'amenities' => $data['amenities'] ?? [],
            'room_count' => $data['room_count'] ?? 0,
            'unit_details' => $data['unit_details'] ?? null,
            'billing_mode' => $data['billing_mode'] ?? 'per_stay',
            'city' => $data['city'] ?? '',
        ]);
        $colorScheme = $data['tailwind_color_scheme'] ?? $data['color_scheme'] ?? 'blue';
        $stmt->execute([$tenantId, $data['name'], $data['slug'], $data['address'] ?? '', $propertyType, $data['unit_count'] ?? 1, $data['max_capacity'] ?? 0, $colorScheme, $config]);
        $propertyId = $pdo->lastInsertId();
        return ['success' => true, 'property_id' => $propertyId];
    } catch (Exception $e) {
        return ['success' => false, 'message' => $e->getMessage()];
    }
}

function getTenantProperties($pdo, $tenantId) {
    $stmt = $pdo->prepare("SELECT * FROM properties WHERE tenant_id = ? ORDER BY name");
    $stmt->execute([$tenantId]);
    return $stmt->fetchAll();
}

function getPropertyDetails($pdo, $propertyId) {
    $stmt = $pdo->prepare("SELECT p.*, t.name as tenant_name, t.slug as tenant_slug FROM properties p LEFT JOIN tenants t ON p.tenant_id = t.id WHERE p.id = ?");
    $stmt->execute([$propertyId]);
    return $stmt->fetch();
}

function getPendingPropertyRequests($pdo) {
    $stmt = $pdo->query("SELECT pr.*, t.name as tenant_name FROM property_requests pr LEFT JOIN tenants t ON pr.tenant_id = t.id WHERE pr.status = 'pending' ORDER BY pr.requested_at DESC");
    return $stmt->fetchAll();
}

function getPropertyRequestHistory($pdo, $tenantId = null) {
    if ($tenantId) {
        $stmt = $pdo->prepare("SELECT pr.*, t.name as tenant_name, u.full_name as reviewer_name FROM property_requests pr LEFT JOIN tenants t ON pr.tenant_id = t.id LEFT JOIN users u ON pr.reviewed_by = u.id WHERE pr.tenant_id = ? ORDER BY pr.requested_at DESC");
        $stmt->execute([$tenantId]);
    } else {
        $stmt = $pdo->query("SELECT pr.*, t.name as tenant_name, u.full_name as reviewer_name FROM property_requests pr LEFT JOIN tenants t ON pr.tenant_id = t.id LEFT JOIN users u ON pr.reviewed_by = u.id ORDER BY pr.requested_at DESC");
    }
    return $stmt->fetchAll();
}

function logPropertyAction($pdo, $propertyId, $action, $description, $userId) {
    try {
        $stmt = $pdo->prepare("INSERT INTO property_audit_log (property_id, action, description, performed_by, performed_at) VALUES (?, ?, ?, ?, NOW())");
        $stmt->execute([$propertyId, $action, $description, $userId]);
    } catch (Exception $e) {
        $pdo->exec("CREATE TABLE IF NOT EXISTS `property_audit_log` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `property_id` INT NOT NULL,
            `action` VARCHAR(100) NOT NULL,
            `description` TEXT,
            `performed_by` INT DEFAULT NULL,
            `performed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $stmt = $pdo->prepare("INSERT INTO property_audit_log (property_id, action, description, performed_by, performed_at) VALUES (?, ?, ?, ?, NOW())");
        $stmt->execute([$propertyId, $action, $description, $userId]);
    }
}

function getAllProperties($pdo) {
    $stmt = $pdo->query("SELECT p.*, t.name as tenant_name, t.slug as tenant_slug FROM properties p LEFT JOIN tenants t ON p.tenant_id = t.id ORDER BY t.name, p.name");
    return $stmt->fetchAll();
}

function deactivateProperty($pdo, $propertyId, $adminUserId, $reason) {
    $stmt = $pdo->prepare("UPDATE properties SET status = 'inactive' WHERE id = ?");
    $stmt->execute([$propertyId]);
    logPropertyAction($pdo, $propertyId, 'deactivated', "Deactivated by admin: $reason", $adminUserId);
    return ['success' => true, 'message' => 'Property deactivated'];
}