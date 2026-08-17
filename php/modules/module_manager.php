<?php
/**
 * SAAS MODULE MANAGEMENT SYSTEM
 * Controls feature availability per property.
 * Schema: system_modules(slug PK, ...) + property_modules(property_id, module_slug, is_enabled)
 */

/**
 * Check if module exists and is available in the system
 */
function isModuleAvailable($pdo, $moduleSlug) {
    $stmt = $pdo->prepare("SELECT default_enabled FROM system_modules WHERE slug = ?");
    $stmt->execute([$moduleSlug]);
    return (bool)$stmt->fetchColumn();
}

// Every module except 'kitchen' is a core feature — always available on every
// property. 'kitchen' is the only module a property can opt out of (e.g. a
// property with no on-site food service). Toggling is intentionally not
// exposed for any other module.
const ALWAYS_ENABLED_MODULES_EXCEPT = ['kitchen'];

/**
 * Check if module is enabled for a specific property
 */
function isModuleEnabledForProperty($pdo, $propertyId, $moduleSlug) {
    if (!in_array($moduleSlug, ALWAYS_ENABLED_MODULES_EXCEPT, true)) {
        return true;
    }

    $stmt = $pdo->prepare("SELECT default_enabled FROM system_modules WHERE slug = ?");
    $stmt->execute([$moduleSlug]);
    $module = $stmt->fetch();
    if (!$module) return false;

    $stmt = $pdo->prepare("SELECT is_enabled FROM property_modules WHERE property_id = ? AND module_slug = ?");
    $stmt->execute([$propertyId, $moduleSlug]);
    $assignment = $stmt->fetch();

    if ($assignment) return (bool)$assignment['is_enabled'];
    // No explicit assignment yet: fall back to the module's system default
    return (bool)$module['default_enabled'];
}

/**
 * Get all available modules
 */
function getAllModules($pdo) {
    $stmt = $pdo->query("SELECT * FROM system_modules ORDER BY category, name");
    return $stmt->fetchAll();
}

/**
 * Get a property's modules with their enabled state
 * For MULTI_KEY_ROOM properties, resolves to parent property modules
 */
function getPropertyModules($pdo, $propertyId) {
    // Check if this is a MULTI_KEY_ROOM - if so, resolve to parent property
    $stmt = $pdo->prepare("
        SELECT property_type, parent_property_id FROM properties
        WHERE id = ?
    ");
    $stmt->execute([$propertyId]);
    $property = $stmt->fetch();

    // If this is a room, use parent property's modules instead
    if ($property && $property['property_type'] === 'MULTI_KEY_ROOM' && $property['parent_property_id']) {
        $propertyId = $property['parent_property_id'];
    }

    $stmt = $pdo->prepare("
        SELECT sm.*, COALESCE(pm.is_enabled, sm.default_enabled) as is_enabled, pm.config
        FROM system_modules sm
        LEFT JOIN property_modules pm ON sm.slug = pm.module_slug AND pm.property_id = ?
        ORDER BY sm.category, sm.name
    ");
    $stmt->execute([$propertyId]);
    return $stmt->fetchAll();
}

/**
 * Get modules for ALL properties at once (batch query - much faster than individual calls)
 */
function getAllPropertyModules($pdo) {
    $stmt = $pdo->query("
        SELECT
            p.id as property_id,
            p.slug as property_slug,
            sm.slug as module_slug,
            COALESCE(pm.is_enabled, sm.default_enabled) as is_enabled
        FROM properties p
        CROSS JOIN system_modules sm
        LEFT JOIN property_modules pm ON sm.slug = pm.module_slug AND pm.property_id = p.id
        ORDER BY p.id, sm.category, sm.name
    ");

    $result = [];
    foreach ($stmt->fetchAll() as $row) {
        if (!isset($result[$row['property_id']])) {
            $result[$row['property_id']] = [];
        }
        $result[$row['property_id']][] = [
            'module_slug' => $row['module_slug'],
            'is_enabled' => (bool)$row['is_enabled']
        ];
    }
    return $result;
}

/**
 * Enable/disable a module for a property
 */
function setPropertyModuleStatus($pdo, $propertyId, $moduleSlug, $enabled) {
    if (!in_array($moduleSlug, ALWAYS_ENABLED_MODULES_EXCEPT, true)) {
        // Not toggleable — see isModuleEnabledForProperty(). Refuse the write so
        // property_modules can't drift into a state that looks disabled but isn't.
        return false;
    }
    try {
        $stmt = $pdo->prepare("
            INSERT INTO property_modules (property_id, module_slug, is_enabled)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled), updated_at = NOW()
        ");
        return $stmt->execute([$propertyId, $moduleSlug, $enabled ? 1 : 0]);
    } catch (Exception $e) {
        return false;
    }
}

/**
 * Update module config (JSON) for a property
 */
function updatePropertyModuleConfig($pdo, $propertyId, $moduleSlug, $config) {
    try {
        $stmt = $pdo->prepare("
            INSERT INTO property_modules (property_id, module_slug, config)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE config = VALUES(config), updated_at = NOW()
        ");
        $encoded = json_encode($config);
        if ($encoded === false) {
            if (class_exists('TelescopeLogger')) {
                TelescopeLogger::log('php', 'Error', 'updatePropertyModuleConfig: json_encode failed - ' . json_last_error_msg(), "module_manager.php:updatePropertyModuleConfig ($moduleSlug, property $propertyId)");
            }
            return false;
        }
        return $stmt->execute([$propertyId, $moduleSlug, $encoded]);
    } catch (Exception $e) {
        if (class_exists('TelescopeLogger')) {
            TelescopeLogger::log('sql', 'SQL Error', 'updatePropertyModuleConfig failed: ' . $e->getMessage(), "module_manager.php:updatePropertyModuleConfig ($moduleSlug, property $propertyId)");
        }
        return false;
    }
}

/**
 * Check module access before loading a feature; halts the request on failure
 */
function requireModule($pdo, $moduleSlug, $propertyId) {
    if (!isModuleEnabledForProperty($pdo, $propertyId, $moduleSlug)) {
        http_response_code(403);
        echo json_encode(['error' => "Module '$moduleSlug' is not enabled for this property"]);
        exit;
    }
}

