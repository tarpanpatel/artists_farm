<?php
/**
 * AI Configuration Management REST Endpoint
 * Ground Code Resort Management System
 * Manages Online/Offline AI API mode, provider selection (Gemini, OpenAI, Claude, Ollama), and API credentials.
 */

// SECURITY (24 Aug 2026, found in review): this endpoint had ZERO auth check - a plain
// unauthenticated GET returned the full plaintext provider API key (the old 'masked_key' field
// was added alongside the real 'api_key', never instead of it, so the masking was purely
// cosmetic), and a plain unauthenticated POST could rewrite the key/provider/endpoint entirely.
// This is Root-Admin-only functionality (only ever surfaced from RootAdminDashboard.tsx), so it
// gets the same session bootstrap + root-admin gate router.php uses for its own platform-admin
// actions, not just the ordinary logged-in-user check other endpoints (ai_assistant.php,
// ical_sync.php) use.
ini_set('session.gc_maxlifetime', 86400 * 7);
ini_set('session.cookie_lifetime', 86400 * 7);
ini_set('session.cookie_httponly', 1);
session_name('artists_farm_session');
session_start();

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../errors/logger.php';
require_once __DIR__ . '/../security/rate_limiter.php';

header('Content-Type: application/json');

// Same "is root admin" check used throughout router.php (e.g. isPropertyAccessAllowed() in
// access_control.php) - AI provider credentials are platform-wide (see the config file load
// below), so this intentionally is NOT the more permissive isPropertyAccessAllowed() gate;
// nothing short of Root Admin should be able to read or change them.
$isRootAdmin = !empty($_SESSION['is_platform_admin']) || (($_SESSION['role'] ?? '') === 'root_admin');
if (empty($_SESSION['username']) || !$isRootAdmin) {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Access denied. AI Services configuration is restricted to Root Admin users.']);
    exit();
}

$configFilePath = __DIR__ . '/../config/ai_config.json';

// Default config: enabled = false (OFFLINE MODE default for testing offline engine)
$defaultConfig = [
    'enabled' => false,
    'provider' => 'gemini', // 'gemini' | 'openai' | 'claude' | 'custom_ollama'
    'api_key' => '',
    'custom_endpoint' => 'http://localhost:11434/v1',
    'updated_at' => date('Y-m-d H:i:s'),
];

// Helper to load config
function loadAiConfig(string $path, array $default): array {
    if (!file_exists($path)) {
        file_put_contents($path, json_encode($default, JSON_PRETTY_PRINT));
        return $default;
    }
    $content = file_get_contents($path);
    $parsed = !empty($content) ? json_decode($content, true) : null;
    return is_array($parsed) ? array_merge($default, $parsed) : $default;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $config = loadAiConfig($configFilePath, $defaultConfig);

    // SECURITY (24 Aug 2026): only ever return a masked key - never the real one. This used to
    // copy the whole config (including the real api_key) into the response and just ADD a
    // masked_key field alongside it, so the "masking" never actually masked anything.
    $responseConfig = $config;
    if (!empty($responseConfig['api_key'])) {
        $responseConfig['masked_key'] = substr($responseConfig['api_key'], 0, 4) . '...' . substr($responseConfig['api_key'], -4);
    }
    unset($responseConfig['api_key']);
    // Tell the frontend whether a key is already on file, without ever sending it - the API Key
    // input on RootAdminDashboard.tsx should show this as a placeholder, not a real value, and
    // only overwrite the stored key when the admin actually types a new one (see the POST
    // handler below, which now leaves api_key untouched when the field arrives blank).
    $responseConfig['has_api_key'] = !empty($config['api_key']);

    echo json_encode([
        'status' => 'success',
        'data' => $responseConfig
    ]);
    exit();
}

if ($method === 'POST') {
    // Rate limit config changes specifically (not GETs, which happen on every dashboard visit) -
    // default 5 attempts / 5 minutes is intentionally tight for a sensitive credentials-changing
    // action, same defaults RateLimiter already uses for login brute-force protection.
    $rateLimiter = new RateLimiter($pdo);
    $rateLimiter->checkAndBlock($_SESSION['username'], 'ai_config_save'); // exits with 429 if exceeded

    $rawInput = file_get_contents('php://input');
    $input = !empty($rawInput) ? json_decode($rawInput, true) : $_POST;

    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid JSON payload.']);
        exit();
    }

    $currentConfig = loadAiConfig($configFilePath, $defaultConfig);
    $changedFields = [];

    if (isset($input['enabled']) && (bool)$input['enabled'] !== (bool)$currentConfig['enabled']) {
        $currentConfig['enabled'] = (bool)$input['enabled'];
        $changedFields[] = 'Online AI ' . ($currentConfig['enabled'] ? 'enabled' : 'disabled');
    }
    if (isset($input['provider']) && in_array($input['provider'], ['gemini', 'openai', 'claude', 'custom_ollama']) && $input['provider'] !== $currentConfig['provider']) {
        $currentConfig['provider'] = $input['provider'];
        $changedFields[] = "Provider set to {$input['provider']}";
    }
    // Blank api_key means "leave the stored key unchanged" (the GET handler above never sends
    // the real key back to the form, so an unmodified save must not overwrite a real key with
    // an empty string) - only a genuinely non-empty value updates it.
    if (isset($input['api_key']) && trim($input['api_key']) !== '') {
        $currentConfig['api_key'] = trim($input['api_key']);
        $changedFields[] = 'API key updated';
    }
    if (isset($input['custom_endpoint']) && trim($input['custom_endpoint']) !== $currentConfig['custom_endpoint']) {
        $currentConfig['custom_endpoint'] = trim($input['custom_endpoint']);
        $changedFields[] = 'Custom endpoint updated';
    }
    $currentConfig['updated_at'] = date('Y-m-d H:i:s');

    file_put_contents($configFilePath, json_encode($currentConfig, JSON_PRETTY_PRINT));

    if (class_exists('TelescopeLogger')) {
        TelescopeLogger::log('system', 'AI Config Updated', "AI Enabled: " . ($currentConfig['enabled'] ? 'YES' : 'NO'), "Provider: {$currentConfig['provider']}", [
            'enabled' => $currentConfig['enabled'],
            'provider' => $currentConfig['provider']
        ]);
    }

    // Audit trail (24 Aug 2026, same pattern as router.php's other admin-settings audit inserts
    // this session added) - this platform-wide setting can enable sending real guest/booking data
    // to a third-party AI provider and change which credentials that traffic uses, so it belongs
    // in audit_logs, not just Telescope. Logged against property_id 1 since this setting is
    // platform-wide, not property-scoped - same convention already used for other Root-Admin
    // platform actions (reset_staff_passcodes, delete_tenant, ...). Never logs the actual key.
    if (!empty($changedFields)) {
        try {
            $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (property_id, action, timestamp, user, ip_address, user_agent, status, module) VALUES (?, ?, NOW(), ?, ?, ?, 'Success', 'ai_services_config')");
            $stmtAudit->execute([
                1,
                'Updated AI Services Config: ' . implode(', ', $changedFields),
                $_SESSION['username'],
                $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1',
                $_SERVER['HTTP_USER_AGENT'] ?? '',
            ]);
        } catch (Exception $eAudit) {}
    }

    $responseConfig = $currentConfig;
    unset($responseConfig['api_key']);
    $responseConfig['has_api_key'] = !empty($currentConfig['api_key']);

    echo json_encode([
        'status' => 'success',
        'message' => 'AI Configuration saved successfully.',
        'data' => $responseConfig
    ]);
    exit();
}

http_response_code(405);
echo json_encode(['status' => 'error', 'message' => 'Method not allowed.']);
