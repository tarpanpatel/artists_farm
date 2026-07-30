<?php
/**
 * Module Access Middleware
 * Include this in all feature files
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../modules/module_manager.php';

// Get current property ID
$propertyId = isset($_SESSION['property_id']) ? $_SESSION['property_id'] : 1;

// Map URL paths to modules
$moduleMapping = [
    'kitchen' => 'core_kitchen',
    'inventory' => 'core_inventory',
    'staff' => 'core_staff',
    'guests' => 'core_guests',
    'finance' => 'finance_basic',
    'telegram' => 'telegram_bot',
    'analytics' => 'reporting_analytics',
    'pos' => 'billing_pos',
    'maintenance' => 'maintenance'
];

// Determine current module based on URL or script name
$currentPath = $_SERVER['SCRIPT_NAME'] ?? '';
$moduleKey = null;

foreach ($moduleMapping as $path => $module) {
    if (strpos($currentPath, $path) !== false) {
        $moduleKey = $module;
        break;
    }
}

// If no match, try to get from GET parameter
if (!$moduleKey && isset($_GET['module'])) {
    $moduleKey = $_GET['module'];
}

// Check module access
if ($moduleKey) {
    requireModule($moduleKey, null, $propertyId);
    
    // Log module access
    if (isset($_SESSION['user_id'])) {
        $pdo->prepare("INSERT INTO module_access_logs (user_id, module_key, property_id, accessed_at) VALUES (?, ?, ?, NOW())")->execute([
            $_SESSION['user_id'], $moduleKey, $propertyId
        ]);
    }
}

/**
 * Shortcut function to check module in templates
 */
function hasModule($moduleKey) {
    global $propertyId;
    return isModuleEnabledForProperty($propertyId, $moduleKey);
}