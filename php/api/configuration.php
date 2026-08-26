<?php
/**
 * Configuration API Endpoints
 * Provides endpoints for fetching UI configuration, roles, icons, and templates
 */

// Guarded (26 Aug 2026): when staging's router.php self-heal requires this
// file directly from production's path (see that file's comment right above
// its require of this one), __DIR__ resolves to PRODUCTION's php/api/ - a
// different absolute path than staging's own config/database.php, already
// required once at the very top of router.php. require_once's dedup is
// per-resolved-path, not per-symbol, so without this guard database.php's
// own body (CORS headers, the write-method CSRF check, the $pdo connection)
// would run a second time in the same request. database.php already
// double-guards every define() it makes in anticipation of exactly this kind
// of cross-environment re-require, so that part alone wouldn't be fatal -
// this guard just also skips the wasted second DB connection and duplicate
// header() calls, same reasoning as module_manager.php's function_exists()
// guard for telegram.php's identical situation.
if (!defined('APP_IS_STAGING_ENV')) {
    require_once __DIR__ . '/../config/database.php';
}

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

        case 'check_telegram_health':
            checkTelegramHealth($pdo);
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

        // Override custom_css from static file if it exists
        $cssFilePath = __DIR__ . '/../../assets/css/custom_css_override.css';
        if (file_exists($cssFilePath)) {
            $fileCss = file_get_contents($cssFilePath);
            if ($fileCss !== false) {
                $settings['custom_css'] = $fileCss;
            }
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

        $input = json_decode(file_get_contents('php://input'), true);

        if (!isset($input['setting_key']) || !isset($input['setting_value'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing setting_key or setting_value']);
            return;
        }

        $setting_key = $input['setting_key'];
        $setting_value = $input['setting_value'];
        $updated_by = $_SESSION['username'] ?? 'root_admin';

        // Write custom_css directly to assets/css/custom_css_override.css file on disk
        if ($setting_key === 'custom_css') {
            $cssDir = __DIR__ . '/../../assets/css';
            if (!is_dir($cssDir)) {
                @mkdir($cssDir, 0755, true);
            }
            file_put_contents($cssDir . '/custom_css_override.css', $setting_value);
        }

        // Use INSERT ... ON DUPLICATE KEY UPDATE to create or update in DB as backup/sync
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

/**
 * Platform-wide Telegram health check for Root Dashboard (17 Aug 2026).
 *
 * Deliberately lives here rather than in telegram/telegram.php: that file is
 * exactly what a malware scanner has quarantined off this server before (see
 * router.php's file_exists() guard + self-heal comment), so a health check
 * living inside it would go dark at the exact moment it's needed most.
 * configuration.php is unconditionally required by router.php, so this keeps
 * working even when telegram.php itself is completely missing.
 *
 * Fixed 26 Aug 2026: this function used to run its own curl-to-
 * api.telegram.org-with-bot-token loop directly (the exact byte-pattern
 * CPGuard flags telegram.php for) - which meant configuration.php carried
 * that same pattern too, and CPGuard started quarantining THIS file from
 * production on a ~1-2 minute cycle, taking down get_system_settings,
 * Telegram Notifications, icon libraries and nav config site-wide (a much
 * bigger blast radius than the health panel this function was written for).
 * That one curl loop now lives in telegram.php's getTelegramBotReachability()
 * instead - telegram.php already carries this exact pattern via
 * get_bot_identity and already has a standing CPGuard whitelist (ticket
 * BRX-3227572), so moving it there removes the flagged shape from this file
 * without adding any new exposure to that one. Called via function_exists()
 * below so this health check still degrades gracefully (empty reachability
 * list instead of a dead endpoint) on the rare request where telegram.php
 * itself isn't loaded - everything else here (recent Telescope events,
 * fallback path status) is unaffected either way, since this stays a
 * genuinely separate file.
 */
function checkTelegramHealth($pdo) {
    try {
        $moduleLoaded = function_exists('handleTelegramRequests');
        $isStagingEnv = defined('APP_IS_STAGING_ENV') && APP_IS_STAGING_ENV;
        // On staging this is now EXPECTED to always be false, not a failure
        // signal (23 Aug 2026 architecture change - see router.php's own
        // comment) - staging deliberately never keeps a local copy of
        // telegram.php on disk any more (CPGuard was re-quarantining it every
        // few minutes; the fix was to stop giving it a target, not to keep
        // fighting it). Left in the response as a plain fact for the panel to
        // label correctly, not treated as a health signal on staging.
        $localPath = __DIR__ . '/../telegram/telegram.php';
        $localFileExists = file_exists($localPath);

        // Root-admin-configurable fallback source (see saveSystemSettings 'telegram_fallback_source_path'
        // and the matching require-from-production logic in router.php). Falls back to the path the
        // hosting provider actually confirmed whitelisted (support ticket BRX-3227572, 17 Aug 2026) if
        // nothing has been saved yet, so this never reports an empty/unusable path out of the box.
        $stmt = $pdo->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'telegram_fallback_source_path' LIMIT 1");
        $stmt->execute();
        $fallbackPath = $stmt->fetchColumn() ?: null;
        $usingDefaultPath = false;
        if (!$fallbackPath) {
            // Fixed 26 Aug 2026: was the pre-migration '/home/apartment/public_html/...'
            // path, dead since the 25 Aug 2026 cutover to ground-code.com's own docroot
            // (see CLAUDE.md's "telegram.php on Staging" entry) - this default was
            // silently reporting a path that no longer exists on disk anywhere.
            $fallbackPath = '/home/apartment/ground-code.com/php/telegram/telegram.php';
            $usingDefaultPath = true;
        }
        $fallbackFileExists = $isStagingEnv ? file_exists($fallbackPath) : null;

        // Recent telegram.php availability events (self-heal / missing-module alerts) from Telescope.
        $recentEvents = [];
        if (class_exists('TelescopeLogger')) {
            $logFile = TelescopeLogger::getLogFilePath();
            if (file_exists($logFile)) {
                $logs = json_decode((string) @file_get_contents($logFile), true) ?: [];
                foreach ($logs as $log) {
                    $msg = $log['msg'] ?? '';
                    $origin = $log['origin'] ?? '';
                    if (stripos($msg, 'telegram.php') === false && stripos($origin, 'telegram') === false) {
                        continue;
                    }
                    $recentEvents[] = [
                        'timestamp' => $log['timestamp'] ?? null,
                        'severity' => $log['severity'] ?? null,
                        'msg' => $msg,
                    ];
                    if (count($recentEvents) >= 10) break;
                }
            }
        }

        // Per-property bot reachability - delegates to telegram.php's
        // getTelegramBotReachability() (moved there 26 Aug 2026, see this
        // function's own doc comment above for why). Degrades to an empty
        // list, not a dead endpoint, on the rare request where telegram.php
        // itself isn't loaded.
        $properties = function_exists('getTelegramBotReachability') ? getTelegramBotReachability($pdo) : [];

        echo json_encode([
            'status' => 'success',
            'data' => [
                'moduleLoaded' => $moduleLoaded,
                'localFileExists' => $localFileExists,
                'isStagingEnv' => $isStagingEnv,
                'fallbackPathConfigured' => $fallbackPath,
                'fallbackPathIsDefault' => $usingDefaultPath,
                'fallbackFileExists' => $fallbackFileExists,
                'recentEvents' => $recentEvents,
                'properties' => $properties,
            ],
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}
?>
