<?php
/**
 * Module Access Middleware
 * Include this in all feature files
 */

require_once __DIR__ . '/php/config/database.php';
require_once __DIR__ . '/php/modules/module_manager.php';

if (session_status() === PHP_SESSION_NONE) session_start();

// Get current property ID
$propertyId = isset($_SESSION['property_id']) ? $_SESSION['property_id'] : getCurrentPropertyId($pdo);

// Map URL paths to modules (module slugs match system_modules.slug)
$moduleMapping = [
    'kitchen' => 'kitchen',
    'inventory' => 'inventory',
    'staff' => 'staff',
    'guests' => 'guests',
    'finance' => 'finance',
    'telegram' => 'telegram',
    'analytics' => 'reports',
    'pos' => 'billing',
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
    requireModule($pdo, $moduleKey, $propertyId);

    // Log module access
    if (isset($_SESSION['user_id'])) {
        try {
            $pdo->prepare("INSERT INTO module_access_logs (user_id, module_key, property_id, accessed_at) VALUES (?, ?, ?, NOW())")->execute([
                $_SESSION['user_id'], $moduleKey, $propertyId
            ]);
        } catch (PDOException $e) {
            $pdo->exec("CREATE TABLE IF NOT EXISTS `module_access_logs` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `user_id` INT NOT NULL,
                `module_key` VARCHAR(50) NOT NULL,
                `property_id` INT NOT NULL,
                `accessed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            $pdo->prepare("INSERT INTO module_access_logs (user_id, module_key, property_id, accessed_at) VALUES (?, ?, ?, NOW())")->execute([
                $_SESSION['user_id'], $moduleKey, $propertyId
            ]);
        }
    }
}

/**
 * Shortcut function to check module in templates
 */
function hasModule($moduleKey) {
    global $pdo, $propertyId;
    return isModuleEnabledForProperty($pdo, $propertyId, $moduleKey);
}