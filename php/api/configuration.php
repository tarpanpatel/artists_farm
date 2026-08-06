<?php
/**
 * Configuration API Endpoints
 * Provides endpoints for fetching UI configuration, roles, icons, and templates
 */

require_once __DIR__ . '/../config/database.php';

function handleConfigurationRequests($pdo, $request_method, $action, $propertyId) {
    switch ($action) {
        case 'get_system_roles':
            getSystemRoles($pdo);
            break;

        case 'get_ui_configuration':
            getUIConfiguration($pdo);
            break;

        case 'get_available_icons':
            getAvailableIcons($pdo);
            break;

        case 'get_icon_search_tags':
            getIconSearchTags($pdo);
            break;

        case 'get_telegram_templates':
            getTelegramTemplates($pdo);
            break;

        case 'get_nav_page_options':
            getNavPageOptions($pdo);
            break;

        case 'get_system_settings':
            getSystemSettings($pdo);
            break;

        case 'save_system_settings':
            saveSystemSettings($pdo);
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Unknown configuration action']);
    }
}

/**
 * Get all available system roles
 */
function getSystemRoles($pdo) {
    try {
        $stmt = $pdo->query("
            SELECT id, slug, name, description, display_order
            FROM system_roles
            WHERE is_active = 1
            ORDER BY display_order ASC
        ");
        $roles = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'data' => $roles]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

/**
 * Get UI configuration by key
 */
function getUIConfiguration($pdo) {
    try {
        $config_key = $_GET['key'] ?? null;

        if ($config_key) {
            $stmt = $pdo->prepare("
                SELECT config_key, config_value, config_type
                FROM ui_configuration
                WHERE config_key = ? AND is_active = 1
                LIMIT 1
            ");
            $stmt->execute([$config_key]);
            $config = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($config) {
                $config['config_value'] = $config['config_type'] === 'json'
                    ? json_decode($config['config_value'], true)
                    : $config['config_value'];
                echo json_encode(['status' => 'success', 'data' => $config]);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'Configuration not found']);
            }
        } else {
            // Get all configurations
            $stmt = $pdo->query("
                SELECT config_key, config_value, config_type
                FROM ui_configuration
                WHERE is_active = 1
                ORDER BY config_key ASC
            ");
            $configs = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Parse JSON values
            foreach ($configs as &$config) {
                if ($config['config_type'] === 'json') {
                    $config['config_value'] = json_decode($config['config_value'], true);
                }
            }

            echo json_encode(['status' => 'success', 'data' => $configs]);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

/**
 * Get available icons for UI
 */
function getAvailableIcons($pdo) {
    try {
        $stmt = $pdo->prepare("
            SELECT config_value
            FROM ui_configuration
            WHERE config_key = 'available_icons' AND is_active = 1
            LIMIT 1
        ");
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($result) {
            $icons = json_decode($result['config_value'], true);
            echo json_encode(['status' => 'success', 'data' => $icons]);
        } else {
            echo json_encode(['status' => 'success', 'data' => []]);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

/**
 * Get icon search tags for filtering
 */
function getIconSearchTags($pdo) {
    try {
        $stmt = $pdo->prepare("
            SELECT config_value
            FROM ui_configuration
            WHERE config_key = 'icon_search_tags' AND is_active = 1
            LIMIT 1
        ");
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($result) {
            $tags = json_decode($result['config_value'], true);
            echo json_encode(['status' => 'success', 'data' => $tags]);
        } else {
            echo json_encode(['status' => 'success', 'data' => []]);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

/**
 * Get Telegram templates
 */
function getTelegramTemplates($pdo) {
    try {
        $stmt = $pdo->query("
            SELECT id, template_key, template_name, message_template, variables, description
            FROM telegram_templates
            WHERE is_active = 1
            ORDER BY template_name ASC
        ");
        $templates = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Parse variables JSON
        foreach ($templates as &$template) {
            if ($template['variables']) {
                $template['variables'] = json_decode($template['variables'], true);
            }
        }

        echo json_encode(['status' => 'success', 'data' => $templates]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

/**
 * Get navigation page options (for NavMenuEditor)
 */
function getNavPageOptions($pdo) {
    try {
        $stmt = $pdo->query("
            SELECT config_value
            FROM ui_configuration
            WHERE config_key = 'nav_page_options' AND is_active = 1
            LIMIT 1
        ");
        $result = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($result) {
            $pages = json_decode($result['config_value'], true);
            echo json_encode(['status' => 'success', 'data' => $pages]);
        } else {
            echo json_encode(['status' => 'success', 'data' => []]);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

/**
 * Get system settings (custom CSS, icon settings, etc.)
 */
function getSystemSettings($pdo) {
    try {
        // Ensure table exists

        $stmt = $pdo->query("
            SELECT setting_key, setting_value
            FROM system_settings
            ORDER BY setting_key ASC
        ");
        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $settings = [];

        foreach ($results as $row) {
            $settings[$row['setting_key']] = $row['setting_value'];
        }

        echo json_encode(['status' => 'success', 'data' => $settings]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

/**
 * Save system settings (requires root_admin role)
 */
function saveSystemSettings($pdo) {
    try {
        // Check if user is root_admin (only they can modify system settings)
        $isRootAdmin = false;

        // Check session first (if available)
        if (isset($_SESSION['role']) && $_SESSION['role'] === 'root_admin') {
            $isRootAdmin = true;
        }
        // Alternative: check if user is platform admin via header
        elseif (isset($_SERVER['HTTP_X_USER_ROLE']) && $_SERVER['HTTP_X_USER_ROLE'] === 'root_admin') {
            $isRootAdmin = true;
        }

        if (!$isRootAdmin) {
            http_response_code(403);
            echo json_encode(['error' => 'Only root administrators can modify system settings']);
            return;
        }

        // Ensure table exists

        $input = json_decode(file_get_contents('php://input'), true);

        if (!isset($input['setting_key']) || !isset($input['setting_value'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing setting_key or setting_value']);
            return;
        }

        $setting_key = $input['setting_key'];
        $setting_value = $input['setting_value'];
        $updated_by = $_SESSION['username'] ?? 'root_admin';

        // Use INSERT ... ON DUPLICATE KEY UPDATE to create or update
        $stmt = $pdo->prepare("
            INSERT INTO system_settings (setting_key, setting_value, updated_by)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE
                setting_value = ?,
                updated_by = ?,
                updated_at = CURRENT_TIMESTAMP
        ");

        $stmt->execute([$setting_key, $setting_value, $updated_by, $setting_value, $updated_by]);

        echo json_encode(['status' => 'success', 'message' => 'Setting saved successfully']);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
}
?>
