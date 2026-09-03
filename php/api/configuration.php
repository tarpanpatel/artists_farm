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
require_once __DIR__ . '/../security/input_validator.php';

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

        case 'register_tenant_trial':
            registerTenantTrial($pdo);
            break;

        case 'get_saas_platform_config':
            getSaasPlatformConfig($pdo);
            break;

        case 'save_saas_platform_config':
            saveSaasPlatformConfig($pdo);
            break;

        case 'send_test_cadence_nudge':
            sendTestCadenceNudge($pdo);
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

        $setting_key = InputValidator::validateString($input['setting_key'], 1, 100);
        $setting_value = is_string($input['setting_value']) ? $input['setting_value'] : json_encode($input['setting_value']);
        $updated_by = InputValidator::validateString($_SESSION['username'] ?? 'root_admin', 1, 100);

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

/**
 * Self-service automated onboarding for prospective hotel/resort clients.
 * Creates tenant, owner user, property (with room slots & kitchen setting), and 30-day trial license.
 */
function registerTenantTrial($pdo) {
    // createMultiKeyPropertyCore()/addMultiKeyRoomCore() are needed below for
    // a MULTI_KEY signup - router.php already requires multikey_properties.php
    // unconditionally near its top, so this is normally a no-op, but guard it
    // defensively anyway (same function_exists()-guard pattern used
    // throughout this codebase) since this is a paid-signup path and must
    // never depend on include-order elsewhere staying exactly as it is today.
    if (!function_exists('createMultiKeyPropertyCore')) {
        require_once __DIR__ . '/multikey_properties.php';
    }

    try {
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $fullName = trim($input['full_name'] ?? '');
        $email = trim($input['email'] ?? '');
        $phone = preg_replace('/\D/', '', (string)($input['phone'] ?? ''));
        $passcode = trim($input['passcode'] ?? '');
        $propertyName = trim($input['property_name'] ?? '');
        $propertyType = strtoupper(trim($input['property_type'] ?? 'SINGLE'));
        $roomCount = max(1, (int)($input['room_count'] ?? 1));
        $checkinTime = trim($input['checkin_time'] ?? '14:00');
        $checkoutTime = trim($input['checkout_time'] ?? '11:00');
        $hasKitchen = (int)($input['has_kitchen'] ?? 1);
        // MANDATORY, not optional (added 3 Sep 2026, after a real incident on
        // an existing property where a NULL default_tariff silently fell back
        // to a hardcoded, guessed rate the moment a channel manager was
        // connected - see CLAUDE.md's Channel Manager protocol section).
        // Every property this flow creates must start with a real,
        // owner-chosen rate, never a value nobody actually typed.
        $defaultTariff = isset($input['default_tariff']) && is_numeric($input['default_tariff']) ? (float)$input['default_tariff'] : null;

        if (!$fullName || !$email || !$phone || !$passcode || !$propertyName) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Missing required registration fields']);
            return;
        }

        if ($defaultTariff === null || $defaultTariff <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'A default room rate is required to set up your property']);
            return;
        }

        if (strlen($phone) !== 10) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Phone number must be a valid 10-digit mobile number']);
            return;
        }

        if (strlen($passcode) !== 6) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Passcode must be a 6-digit PIN']);
            return;
        }

        // Check if phone or email is already registered
        $checkStmt = $pdo->prepare("SELECT id FROM users WHERE username = ? OR phone_number = ? LIMIT 1");
        $checkStmt->execute([$phone, $phone]);
        if ($checkStmt->fetch()) {
            http_response_code(409);
            echo json_encode(['success' => false, 'message' => 'An account with this phone number already exists. Please login instead.']);
            return;
        }

        // Generate tenant + property slug up front - tenants.slug and properties.slug are
        // both NOT NULL UNIQUE, so these have to exist before either insert, not after.
        $baseSlug = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $propertyName));
        $baseSlug = trim($baseSlug, '-');
        if (!$baseSlug) $baseSlug = 'property-' . time();
        $propertySlug = $baseSlug;
        $tenantSlug = $baseSlug;

        $slugCheck = $pdo->prepare("SELECT id FROM properties WHERE slug = ? LIMIT 1");
        $slugCheck->execute([$propertySlug]);
        if ($slugCheck->fetch()) {
            $propertySlug .= '-' . rand(100, 999);
        }
        $tenantSlugCheck = $pdo->prepare("SELECT id FROM tenants WHERE slug = ? LIMIT 1");
        $tenantSlugCheck->execute([$tenantSlug]);
        if ($tenantSlugCheck->fetch()) {
            $tenantSlug .= '-' . rand(100, 999);
        }

        $pdo->beginTransaction();

        // 1. Create Tenant. The 30-day trial itself is tracked via subscription_status/
        // subscription_expires_at - the same columns router.php's existing create_tenant
        // flow already uses for this - not a separate license/trial table.
        $expiryDate = date('Y-m-d', strtotime('+30 days'));
        $tenantStmt = $pdo->prepare("
            INSERT INTO tenants (name, slug, email, phone, subscription_plan, subscription_status, subscription_expires_at, plan_type, is_active)
            VALUES (?, ?, ?, ?, 'free', 'trial', ?, 'Trial', 1)
        ");
        $tenantStmt->execute([$fullName, $tenantSlug, $email, $phone, $expiryDate]);
        $tenantId = (int)$pdo->lastInsertId();

        // 2. Create Property - before the owner user, since users.property_id is NOT NULL
        // and must point at this property, not silently default to property #1 (a
        // different tenant's property).
        //
        // MULTI_KEY goes through createMultiKeyPropertyCore()/addMultiKeyRoomCore()
        // (php/api/multikey_properties.php) - the SAME functions the admin-facing
        // Multi-Key creation UI uses - rather than a separate inline INSERT here.
        // Found live 3 Sep 2026: this used to be its own thinner copy that only
        // ever inserted the bare room rows, silently skipping property_modules,
        // property_shared_data (STAFF/EXPENSES/KITCHEN), and default expense
        // categories that a real Multi-Key property is supposed to get - a
        // self-signup customer who picked Multi-Key ended up with a subtly
        // incomplete property compared to one created the normal way. One
        // function creates a Multi-Key property now, not two that can drift.
        if ($propertyType === 'MULTI_KEY' && $roomCount > 1) {
            $propertyId = createMultiKeyPropertyCore($pdo, $tenantId, $propertyName, $propertySlug);
            // Layer on the trial-signup-specific fields the core function
            // doesn't set (it's shared with the admin-facing flow, which
            // doesn't collect these) - checkin/checkout time and a starting
            // rate on the parent row itself for display consistency (each
            // room's OWN default_tariff below is what actually matters for
            // bookings/channel-manager pricing on a Multi-Key property).
            $pdo->prepare("UPDATE properties SET checkin_time = ?, checkout_time = ?, status = 'active', default_tariff = ? WHERE id = ?")
                ->execute([$checkinTime, $checkoutTime, $defaultTariff, $propertyId]);

            for ($i = 1; $i <= $roomCount; $i++) {
                $roomName = "Room " . sprintf("%02d", $i);
                $roomSlug = $propertySlug . '-room-' . $i;
                addMultiKeyRoomCore($pdo, $propertyId, $roomName, $roomSlug, $defaultTariff);
            }
        } else {
            $propStmt = $pdo->prepare("
                INSERT INTO properties (tenant_id, name, slug, property_type, unit_count, checkin_time, checkout_time, status, default_tariff)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
            ");
            $propStmt->execute([$tenantId, $propertyName, $propertySlug, $propertyType, $roomCount, $checkinTime, $checkoutTime, $defaultTariff]);
            $propertyId = (int)$pdo->lastInsertId();
        }

        // 3. Create Master Owner User. 'Admin' (capitalized) matches the role string every
        // other admin-permission check in the app compares against exactly
        // (MenuManager.tsx etc.) - 'admin' lowercase would silently fail those checks.
        $userStmt = $pdo->prepare("
            INSERT INTO users (property_id, username, full_name, phone_number, email, password, passcode, role, is_platform_admin, default_tenant_id)
            VALUES (?, ?, ?, ?, ?, '', ?, 'Admin', 0, ?)
        ");
        $userStmt->execute([$propertyId, $phone, $fullName, $phone, $email, $passcode, $tenantId]);
        $userId = (int)$pdo->lastInsertId();

        // Kitchen Module toggle
        if ($hasKitchen === 0 && function_exists('disableKitchenModuleForNewProperty')) {
            disableKitchenModuleForNewProperty($pdo, $propertyId);
        }

        $pdo->commit();

        // Set session state
        $_SESSION['user_id'] = $userId;
        $_SESSION['username'] = $phone;
        $_SESSION['full_name'] = $fullName;
        $_SESSION['role'] = 'Admin';
        $_SESSION['tenant_id'] = $tenantId;
        $_SESSION['property_id'] = $propertyId;

        // Send WhatsAPI notification if configured
        if (function_exists('sendWhatsAppTemplateMessage')) {
            try {
                sendWhatsAppTemplateMessage($phone, 'welcome_onboarding', [$fullName, $propertySlug, $phone, $passcode]);
            } catch (Exception $waErr) {
                if (class_exists('TelescopeLogger')) {
                    TelescopeLogger::log('whatsapp', 'WARNING', 'Onboarding welcome WhatsApp send threw: ' . $waErr->getMessage(), 'registerTenantTrial');
                }
            }
        }

        // Send welcome email - reuses the SAME root-admin-editable
        // tenant_welcome_template (Root Admin > Email Settings) that the manual
        // "Create Tenant" flow already sends via sendSmtpEmail(), rather than a
        // second hardcoded template, so there's only ever one welcome message an
        // admin needs to customize. Best-effort like the WhatsApp send above - a
        // missing/misconfigured SMTP setup must never fail an already-committed
        // trial signup.
        if ($email && function_exists('sendSmtpEmail') && function_exists('getTenantWelcomeTemplate')) {
            try {
                $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                $host = $_SERVER['HTTP_HOST'] ?? 'ground-code.com';
                $loginUrl = "{$scheme}://{$host}/{$propertySlug}";

                $renderedMessage = renderTenantWelcomeTemplate(getTenantWelcomeTemplate($pdo), [
                    'tenant_name' => $fullName,
                    'login_url' => $loginUrl,
                    'username' => $phone,
                    'temp_passcode' => $passcode,
                ]);

                $emailResult = sendSmtpEmail($pdo, $email, 'Welcome to Ground Code - Your 30-Day Free Trial is Live!', nl2br(htmlspecialchars($renderedMessage)));
                if (!$emailResult['success'] && class_exists('TelescopeLogger')) {
                    TelescopeLogger::log('email', 'WARNING', 'Onboarding welcome email send failed: ' . $emailResult['error'], 'registerTenantTrial', ['tenant_id' => $tenantId, 'email' => $email]);
                }
            } catch (Exception $mailErr) {
                if (class_exists('TelescopeLogger')) {
                    TelescopeLogger::log('email', 'WARNING', 'Onboarding welcome email threw: ' . $mailErr->getMessage(), 'registerTenantTrial');
                }
            }
        }

        // Log via Telescope
        if (class_exists('TelescopeLogger')) {
            TelescopeLogger::log(
                'system',
                'New Trial Self-Registration',
                "{$fullName} ({$phone}) created tenant {$propertyName} with 30-day trial",
                "Onboarding Wizard [Tenant: #{$tenantId}]",
                ['tenant_id' => $tenantId, 'property_id' => $propertyId, 'owner' => $fullName, 'phone' => $phone]
            );
        }

        echo json_encode([
            'success' => true,
            'message' => 'Trial registered successfully',
            'property_slug' => $propertySlug,
            'redirect_url' => '/' . $propertySlug,
        ]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to create trial account: ' . $e->getMessage()]);
    }
}

/**
 * Return default 30-Day Trial Cadence definition map
 */
function getDefaultTrialCadenceStages(): array {
    return [
        'day_1_welcome' => [
            'enabled' => true,
            'day_number' => 1,
            'stage_type' => 'day_age',
            'title' => 'Welcome to Ground Code — Day 1 Checklist',
            'email_subject' => 'Welcome to Ground Code, {tenant_name}! Day 1 Setup Checklist',
            'email_body' => "Hello {tenant_name},\n\nWelcome to Ground Code! Your 30-day full-access trial for {property_name} is now live.\n\nHere is your Day 1 Quickstart:\n1. Open your property dashboard ({login_url})\n2. Add your team members in Staff Management\n3. Connect Telegram to get live notifications for check-ins, food orders, and expenses\n\nNeed help getting started? Reply directly to this email or call {support_phone}.",
            'telegram_message' => "🏢 <b>GROUND CODE TRIAL STARTED</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n🎉 Welcome! Your 30-day full-access trial is active.\n👉 Finish your setup: Add staff, set room rates, and connect payment QR.",
        ],
        'day_3_features' => [
            'enabled' => true,
            'day_number' => 3,
            'stage_type' => 'day_age',
            'title' => 'Ground Code Tip: Cash Drawer & Petty Cash',
            'email_subject' => 'Day 3 on Ground Code: Stop Petty Cash & Cash Leakage',
            'email_body' => "Hello {tenant_name},\n\nAre you tracking your daily property expenses on Ground Code yet?\n\nKey features for your first week:\n• Petty Cash Drawer: Log cash-in and cash-out with photo proof\n• Kitchen & Food POS: Instantly add meals and drinks to guest bills\n• Service Requests: Assign room cleaning and maintenance to staff\n\nLog in to explore: {login_url}",
            'telegram_message' => "💰 <b>GROUND CODE TIP: CASH CONTROL</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n📌 Track petty cash expenses and front-desk drawer balances with receipt photos.\n👉 Tap Petty Cash & Cash Drawer in your dashboard.",
        ],
        'day_7_milestone' => [
            'enabled' => true,
            'day_number' => 7,
            'stage_type' => 'day_age',
            'title' => '1 Week on Ground Code — How is it going?',
            'email_subject' => '1 Week on Ground Code — Your Operations Summary',
            'email_body' => "Hello {tenant_name},\n\nCongratulations on completing your first week on Ground Code!\n\nCheck your Analytics Dashboard to see live metrics on occupancy, direct vs OTA revenue, and expense summaries.\n\nIf you have any questions or want a quick 10-minute walkthrough for your team, we're here to help.",
            'telegram_message' => "📊 <b>1-WEEK MILESTONE REACHED</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n✨ You've completed 1 week on Ground Code! Check your live revenue analytics.",
        ],
        'day_14_halfway' => [
            'enabled' => true,
            'day_number' => 14,
            'stage_type' => 'day_age',
            'title' => '14 Days Remaining in Your Trial',
            'email_subject' => 'Halfway through your Ground Code Trial — 14 Days Remaining',
            'email_body' => "Hello {tenant_name},\n\nYou are halfway through your 30-day trial of Ground Code for {property_name}.\n\nMake sure to connect your Airbnb and Booking.com iCal feeds in Settings → Calendar Sync to prevent double-bookings automatically.\n\nYour trial remains active until {expires_at}.",
            'telegram_message' => "⏳ <b>HALFWAY TRIAL CHECK-IN</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n📅 14 days remaining in your trial (Expires: {expires_at}).\n💡 Tip: Sync your Airbnb / OTA calendars in Settings.",
        ],
        'day_21_renewal_plan' => [
            'enabled' => true,
            'day_number' => 21,
            'stage_type' => 'day_age',
            'title' => '9 Days Left in Your Free Trial — Plan Your Subscription',
            'email_subject' => 'Ground Code Trial: 9 Days Left on {tenant_name}',
            'email_body' => "Hello {tenant_name},\n\nYour 30-day trial on Ground Code is entering its final week (ending on {expires_at}).\n\nTo ensure uninterrupted access for your staff, kitchen, and booking systems, please review your subscription options:\n• Current Plan: {plan_type}\n• Expiry Date: {expires_at}\n\nContact your account manager or reply to this email to activate regular billing.",
            'telegram_message' => "📋 <b>UPCOMING TRIAL RENEWAL</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n⏳ 9 days left on your free trial (Expires: {expires_at}).\n👉 Contact your account manager to activate subscription.",
        ],
        'day_23_7d_notice' => [
            'enabled' => true,
            'day_number' => 23,
            'stage_type' => 'days_left',
            'title' => '⚠️ 7-Day Subscription Expiry Notice',
            'email_subject' => 'URGENT: Your Ground Code Subscription Expires in 7 Days ({tenant_name})',
            'email_body' => "Hello {tenant_name},\n\nThis is a courtesy reminder that your Ground Code subscription for {tenant_name} will expire in 7 days on {expires_at}.\n\nRenew now to avoid service interruption for your front-desk and staff.\n\nPlan: {plan_type}\nExpiry: {expires_at}",
            'telegram_message' => "⚠️ <b>7-DAY EXPIRATION NOTICE</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n🚨 Your subscription expires in 7 days on {expires_at}.\n👉 Renew to maintain uninterrupted operations.",
        ],
        'day_28_2d_notice' => [
            'enabled' => true,
            'day_number' => 28,
            'stage_type' => 'days_left',
            'title' => '🚨 Final Notice: 48 Hours Until Subscription Expiry',
            'email_subject' => 'FINAL NOTICE: 48 Hours Left on Ground Code ({tenant_name})',
            'email_body' => "Hello {tenant_name},\n\nYour Ground Code subscription expires in 48 hours on {expires_at}.\n\nPlease renew immediately to prevent staff logout and booking synchronization pauses.\n\nContact support ({support_phone}) to complete renewal.",
            'telegram_message' => "🚨 <b>URGENT: 48 HOURS LEFT</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n⏳ 2 days remaining until subscription expires ({expires_at}).\n👉 Action required immediately.",
        ],
        'day_30_expired' => [
            'enabled' => true,
            'day_number' => 30,
            'stage_type' => 'days_left',
            'title' => 'Subscription Expired — Reactivate Ground Code',
            'email_subject' => 'Your Ground Code Subscription for {tenant_name} Has Expired',
            'email_body' => "Hello {tenant_name},\n\nYour Ground Code subscription for {tenant_name} expired on {expires_at}.\n\nYour property data, bookings, and guest records are safely stored. To reactivate full access for your team, please contact support to renew your subscription.\n\nThank you for using Ground Code!",
            'telegram_message' => "🔒 <b>SUBSCRIPTION EXPIRED</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n⚠️ Trial/Subscription expired on {expires_at}.\n👉 Contact support ({support_phone}) to reactivate account.",
        ],
    ];
}

/**
 * Get SaaS Platform & Onboarding Configuration
 */
function getSaasPlatformConfig(PDO $pdo) {
    $isRoot = !empty($_SESSION['is_platform_admin']) || strtolower($_SESSION['role'] ?? '') === 'root_admin' || strtolower($_SESSION['role'] ?? '') === 'root admin';
    if (!$isRoot && empty($_SESSION['username'])) {
        // Public fallback for client onboarding scripts
    }

    try {
        $stmt = $pdo->query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'saas_%' OR setting_key = 'tenant_welcome_template'");
        $rows = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

        $defaultWelcomeWhatsapp = "🎉 Welcome to Ground Code, {tenant_name} ji!\n\nYour 30-Day Free Trial for *{property_name}* is now LIVE!\n\n🔐 *Your Login Credentials:*\n• Dashboard URL: {login_url}\n• Username (Mobile): {username}\n• Passcode: {temp_passcode}\n• Trial Expiry Date: {expiry_date}\n\n📱 *IMPORTANT: Add to Phone Home Screen*\n1️⃣ Open link: {login_url}\n2️⃣ iPhone: Share → 'Add to Home Screen'\n3️⃣ Android: 3-Dots Menu → 'Install App' / 'Add to Home Screen'\n\nHappy Managing!\nGround Code Support: {support_phone}";
        $defaultWelcomeEmailSubject = "Welcome to Ground Code, {tenant_name}! Your 30-Day Free Trial is Live";
        $defaultWelcomeEmailBody = "Hello {tenant_name},\n\nWelcome to Ground Code! Your 30-day full-access trial for {property_name} has been activated.\n\nYour Login Credentials:\n• Dashboard URL: {login_url}\n• Username: {username}\n• Temporary Passcode: {temp_passcode}\n• Trial Expiration: {expiry_date}\n\nOpen your dashboard to set up your rooms, staff, and food menu:\n{login_url}\n\nNeed help? Contact support at {support_phone} or reply directly to this email.";

        $pricingConfig = !empty($rows['saas_pricing_config']) ? json_decode($rows['saas_pricing_config'], true) : [
            'base_monthly_fee' => 1499,
            'per_key_monthly_fee' => 50,
            'trial_days' => 30,
            'annual_discount_pct' => 20,
            'gst_rate_pct' => 18,
            'currency_symbol' => '₹',
        ];

        $cadenceConfig = !empty($rows['saas_trial_cadence_config']) ? json_decode($rows['saas_trial_cadence_config'], true) : getDefaultTrialCadenceStages();

        $pwaBranding = !empty($rows['saas_pwa_branding']) ? json_decode($rows['saas_pwa_branding'], true) : [
            'app_name' => 'Ground Code',
            'short_name' => 'GroundCode',
            'theme_color' => '#2563EB',
            'bg_color' => '#FAFAFA',
            'icon_192_url' => '/app-icons/icon-source.png',
            'icon_512_url' => '/app-icons/icon-source.png',
        ];

        $supportContact = !empty($rows['saas_support_contact']) ? json_decode($rows['saas_support_contact'], true) : [
            'support_phone' => '+91 95712 63474',
            'support_whatsapp' => '+91 95712 63474',
            'support_email' => 'support@ground-code.com',
            'grace_period_days' => 3,
            'default_modules' => ['kitchen_kds', 'food_pos', 'petty_cash', 'inventory', 'attendance', 'telegram_alerts', 'whatsapp_bills'],
        ];

        echo json_encode([
            'status' => 'success',
            'data' => [
                'welcome_whatsapp' => !empty($rows['saas_welcome_whatsapp']) ? $rows['saas_welcome_whatsapp'] : (!empty($rows['tenant_welcome_template']) ? $rows['tenant_welcome_template'] : $defaultWelcomeWhatsapp),
                'welcome_email_subject' => !empty($rows['saas_welcome_email_subject']) ? $rows['saas_welcome_email_subject'] : $defaultWelcomeEmailSubject,
                'welcome_email_body' => !empty($rows['saas_welcome_email_body']) ? $rows['saas_welcome_email_body'] : $defaultWelcomeEmailBody,
                'pricing' => $pricingConfig,
                'cadence' => $cadenceConfig,
                'pwa' => $pwaBranding,
                'support' => $supportContact,
            ],
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

/**
 * Save SaaS Platform & Onboarding Configuration
 */
function saveSaasPlatformConfig(PDO $pdo) {
    $isRoot = !empty($_SESSION['is_platform_admin']) || strtolower($_SESSION['role'] ?? '') === 'root_admin' || strtolower($_SESSION['role'] ?? '') === 'root admin';
    if (!$isRoot) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Root Admin access required']);
        exit;
    }

    try {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Invalid JSON payload']);
            exit;
        }

        $stmt = $pdo->prepare("
            INSERT INTO system_settings (setting_key, setting_value, updated_by)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by), updated_at = NOW()
        ");

        $adminUser = $_SESSION['username'] ?? 'Root Admin';

        if (isset($input['welcome_whatsapp'])) {
            $stmt->execute(['saas_welcome_whatsapp', trim($input['welcome_whatsapp']), $adminUser]);
        }
        if (isset($input['welcome_email_subject'])) {
            $stmt->execute(['saas_welcome_email_subject', trim($input['welcome_email_subject']), $adminUser]);
        }
        if (isset($input['welcome_email_body'])) {
            $stmt->execute(['saas_welcome_email_body', trim($input['welcome_email_body']), $adminUser]);
        }
        if (isset($input['pricing']) && is_array($input['pricing'])) {
            $stmt->execute(['saas_pricing_config', json_encode($input['pricing'], JSON_PRETTY_PRINT), $adminUser]);
        }
        if (isset($input['cadence']) && is_array($input['cadence'])) {
            $stmt->execute(['saas_trial_cadence_config', json_encode($input['cadence'], JSON_PRETTY_PRINT), $adminUser]);
        }
        if (isset($input['pwa']) && is_array($input['pwa'])) {
            $stmt->execute(['saas_pwa_branding', json_encode($input['pwa'], JSON_PRETTY_PRINT), $adminUser]);
        }
        if (isset($input['support']) && is_array($input['support'])) {
            $stmt->execute(['saas_support_contact', json_encode($input['support'], JSON_PRETTY_PRINT), $adminUser]);
        }

        if (class_exists('TelescopeLogger')) {
            TelescopeLogger::log('settings', 'INFO', 'SaaS Onboarding & Platform Configuration updated by ' . $adminUser, 'saveSaasPlatformConfig');
        }

        echo json_encode(['status' => 'success', 'message' => 'Onboarding & Platform settings saved successfully']);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

/**
 * Test Trigger for a Cadence Stage Nudge
 */
function sendTestCadenceNudge(PDO $pdo) {
    $isRoot = !empty($_SESSION['is_platform_admin']) || strtolower($_SESSION['role'] ?? '') === 'root_admin' || strtolower($_SESSION['role'] ?? '') === 'root admin';
    if (!$isRoot) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Root Admin access required']);
        exit;
    }

    try {
        $input = json_decode(file_get_contents('php://input'), true);
        $stageKey = $input['stageKey'] ?? 'day_1_welcome';
        $testEmail = trim($input['testEmail'] ?? '');
        $channel = $input['channel'] ?? 'all'; // 'email', 'telegram', 'whatsapp', 'all'
        $customPhone = trim($input['testPhone'] ?? '');

        $results = ['email' => null, 'telegram' => null, 'whatsapp_url' => null];

        $sampleVars = [
            'tenant_name' => 'Demo Resort Owner',
            'property_name' => 'Mountain View Resort',
            'username' => '9571263474',
            'temp_passcode' => 'DEMO-8842',
            'plan_type' => 'Growth',
            'expires_at' => date('d M Y', strtotime('+30 days')),
            'expiry_date' => date('d M Y', strtotime('+30 days')),
            'days_left' => 30,
            'login_url' => 'https://staging.ground-code.com/demo',
            'support_phone' => '+91 95712 63474',
        ];

        // Fetch settings from DB
        $stmt = $pdo->query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'saas_%' OR setting_key = 'tenant_welcome_template'");
        $rows = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

        $emailSubject = '';
        $emailBody = '';
        $tgMessage = '';
        $waMessage = '';

        if ($stageKey === 'welcome_whatsapp' || $stageKey === 'welcome_email') {
            $defaultWhatsapp = "🎉 Welcome to Ground Code, {tenant_name} ji!\n\nYour 30-Day Free Trial for *{property_name}* is now LIVE!\n\n🔐 *Your Login Credentials:*\n• Dashboard URL: {login_url}\n• Username (Mobile): {username}\n• Passcode: {temp_passcode}\n• Trial Expiry Date: {expiry_date}\n\n📱 *IMPORTANT: Add to Phone Home Screen*\n1️⃣ Open link: {login_url}\n2️⃣ iPhone: Share → 'Add to Home Screen'\n3️⃣ Android: 3-Dots Menu → 'Install App' / 'Add to Home Screen'\n\nHappy Managing!\nGround Code Support: {support_phone}";
            $defaultSubject = "Welcome to Ground Code, {tenant_name}! Your 30-Day Free Trial is Live";
            $defaultBody = "Hello {tenant_name},\n\nWelcome to Ground Code! Your 30-day full-access trial for {property_name} has been activated.\n\nYour Login Credentials:\n• Dashboard URL: {login_url}\n• Username: {username}\n• Temporary Passcode: {temp_passcode}\n• Trial Expiration: {expiry_date}\n\nOpen your dashboard to set up your rooms, staff, and food menu:\n{login_url}\n\nNeed help? Contact support at {support_phone} or reply directly to this email.";

            $waMessage = !empty($rows['saas_welcome_whatsapp']) ? $rows['saas_welcome_whatsapp'] : (!empty($rows['tenant_welcome_template']) ? $rows['tenant_welcome_template'] : $defaultWhatsapp);
            $emailSubject = !empty($rows['saas_welcome_email_subject']) ? $rows['saas_welcome_email_subject'] : $defaultSubject;
            $emailBody = !empty($rows['saas_welcome_email_body']) ? $rows['saas_welcome_email_body'] : $defaultBody;
            $tgMessage = "🎉 <b>[WELCOME PREVIEW]</b>\n\n" . $waMessage;
        } else {
            $customCadence = !empty($rows['saas_trial_cadence_config']) ? json_decode($rows['saas_trial_cadence_config'], true) : [];
            $defaults = getDefaultTrialCadenceStages();
            $stageInfo = $customCadence[$stageKey] ?? $defaults[$stageKey] ?? null;

            if (!$stageInfo) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'Unknown cadence stage']);
                exit;
            }

            $emailSubject = $stageInfo['email_subject'] ?? '';
            $emailBody = $stageInfo['email_body'] ?? '';
            $tgMessage = $stageInfo['telegram_message'] ?? $stageInfo['title'] ?? '';
            $waMessage = $emailBody;
        }

        // Interpolate sample variables
        foreach ($sampleVars as $k => $v) {
            $emailSubject = str_replace('{' . $k . '}', (string)$v, $emailSubject);
            $emailBody = str_replace('{' . $k . '}', (string)$v, $emailBody);
            $tgMessage = str_replace('{' . $k . '}', (string)$v, $tgMessage);
            $waMessage = str_replace('{' . $k . '}', (string)$v, $waMessage);
        }

        // 1. Email Test Dispatch
        if (($channel === 'email' || $channel === 'all') && $testEmail && filter_var($testEmail, FILTER_VALIDATE_EMAIL)) {
            if (function_exists('sendSmtpEmail')) {
                $html = "<div style='font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;'>
                    <div style='background: #2563eb; color: #ffffff; padding: 12px 18px; border-radius: 8px; font-weight: bold; margin-bottom: 16px;'>🧪 [TEST NOTIFICATION DISPATCH]</div>
                    <div style='white-space: pre-line; color: #1e293b; line-height: 1.6;'>{$emailBody}</div>
                    <hr style='border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;' />
                    <p style='font-size: 11px; color: #94a3b8;'>This is a test notification generated from Ground Code Root Admin Onboarding Manager.</p>
                </div>";
                $emailSent = sendSmtpEmail($pdo, $testEmail, "[TEST] " . $emailSubject, $html);
                $results['email'] = $emailSent ? 'sent' : 'failed';
            } else {
                $results['email'] = 'smtp_unavailable';
            }
        }

        // 2. Telegram Test Dispatch
        if ($channel === 'telegram' || $channel === 'all') {
            if (file_exists(__DIR__ . '/../telegram/sender.php')) {
                require_once __DIR__ . '/../telegram/sender.php';
            }
            // Resolve Telegram Bot Token & Admin Chat ID dynamically from DB
            $botToken = (defined('TELEGRAM_BOT_TOKEN') && TELEGRAM_BOT_TOKEN) ? TELEGRAM_BOT_TOKEN : null;
            $adminChatId = (defined('TELEGRAM_ADMIN_CHAT_ID') && TELEGRAM_ADMIN_CHAT_ID) ? TELEGRAM_ADMIN_CHAT_ID : null;

            try {
                $tgStmt = $pdo->query("SELECT config FROM property_modules WHERE module_slug = 'telegram' AND is_enabled = 1 ORDER BY id DESC LIMIT 1");
                $tgRow = $tgStmt ? $tgStmt->fetch(PDO::FETCH_ASSOC) : null;
                if ($tgRow && !empty($tgRow['config'])) {
                    $tgConfig = json_decode($tgRow['config'], true);
                    if (!empty($tgConfig['botToken'])) {
                        $botToken = $tgConfig['botToken'];
                    }
                    if (!empty($tgConfig['groups'])) {
                        foreach ($tgConfig['groups'] as $grp) {
                            if (stripos($grp['name'] ?? '', 'admin') !== false || stripos($grp['name'] ?? '', 'owner') !== false) {
                                $adminChatId = $grp['chatId'] ?? null;
                                break;
                            }
                        }
                        if (!$adminChatId && !empty($tgConfig['groups'][0]['chatId'])) {
                            $adminChatId = $tgConfig['groups'][0]['chatId'];
                        }
                    }
                }
                if (!$botToken) {
                    $botTokenStmt = $pdo->query("SELECT telegram_bot_token FROM properties WHERE telegram_bot_token IS NOT NULL AND telegram_bot_token != '' LIMIT 1");
                    $botToken = $botTokenStmt ? $botTokenStmt->fetchColumn() : null;
                }
            } catch (Exception $e) {}

            if ($botToken && $adminChatId && function_exists('sendRawTelegramMessage')) {
                $tgFormatted = "🧪 <b>[TEST CADENCE DISPATCH]</b>\n━━━━━━━━━━━━━━━━━━\n" . $tgMessage;
                $rawRes = sendRawTelegramMessage($tgFormatted, $botToken, $adminChatId);
                $results['telegram'] = (!empty($rawRes['ok']) && $rawRes['ok'] === true) ? 'sent' : 'failed';
                $results['telegram_response'] = $rawRes;
            } else {
                $missing = [];
                if (!$botToken) $missing[] = 'Bot Token';
                if (!$adminChatId) $missing[] = 'Admin Group Chat ID';
                $results['telegram'] = 'unconfigured';
                $results['telegram_error'] = !empty($missing) ? ('Missing ' . implode(' & ', $missing) . ' in Property Telegram Settings') : 'Telegram sender function unavailable';
            }
        }

        // 3. WhatsApp Direct API Dispatch & Link Generation
        $phoneParam = preg_replace('/[^0-9]/', '', $customPhone ?: '919571263474');
        if ($channel === 'whatsapp' || $channel === 'all') {
            if (file_exists(__DIR__ . '/../whatsapp/sender.php')) {
                require_once __DIR__ . '/../whatsapp/sender.php';
            }
            if (function_exists('sendWhatsAppDirectTextMessage')) {
                $waApiRes = sendWhatsAppDirectTextMessage($phoneParam, $waMessage);
                $results['whatsapp_api'] = $waApiRes;
            }
        }

        $results['whatsapp_url'] = 'https://wa.me/' . $phoneParam . '?text=' . rawurlencode($waMessage);
        $results['interpolated_text'] = [
            'subject' => $emailSubject,
            'email_body' => $emailBody,
            'telegram_message' => $tgMessage,
            'whatsapp_message' => $waMessage,
        ];

        echo json_encode([
            'status' => 'success',
            'message' => 'Test notification processed',
            'results' => $results,
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}
?>
