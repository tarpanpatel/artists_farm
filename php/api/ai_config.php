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
// session_set_cookie_params() (restored 27 Aug 2026 alongside this file itself - see AI.md and
// CLAUDE.md's "Session Cookie / Remember Me" section) computed inline, same as
// calendar_session.php - this bootstrap runs before config/database.php is required below, so
// APP_IS_LOCAL_ENV isn't defined yet at this point.
$__session_host = $_SERVER['SERVER_NAME'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost';
$__session_is_local = $__session_host === 'localhost' || $__session_host === '127.0.0.1' || str_contains($__session_host, '192.168.');
ini_set('session.gc_maxlifetime', 86400 * 30);
session_set_cookie_params([
    'lifetime' => 86400 * 30,
    'path' => '/',
    'domain' => '',
    'secure' => !$__session_is_local,
    'httponly' => true,
    'samesite' => 'Lax',
]);
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

const AI_PROVIDERS = ['gemini', 'openai', 'opencode_zen', 'claude', 'custom_ollama'];

// Default config: enabled = false (OFFLINE MODE default for testing offline engine)
// api_keys (25 Aug 2026 - REAL BUG FIX, found live): this used to be a single flat 'api_key'
// string shared by every provider. Switching the provider dropdown never cleared or swapped it,
// so saving a new key for provider B silently overwrote provider A's key too - then switching
// back to A reused B's key (wrong format/service entirely) with zero warning. Confirmed live: the
// config ended up with provider=opencode_zen but an OpenAI-shaped key left over from an earlier
// save, which OpenCode Zen's API correctly rejected as invalid. Now one slot per provider, keyed
// by provider id, so switching providers can never silently carry over the wrong key again.
$defaultConfig = [
    'enabled' => false,
    'provider' => 'gemini', // 'gemini' | 'openai' | 'opencode_zen' | 'claude' | 'custom_ollama'
    'api_keys' => array_fill_keys(AI_PROVIDERS, ''),
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
    $config = is_array($parsed) ? array_merge($default, $parsed) : $default;

    // ONE-TIME MIGRATION (25 Aug 2026): older config files on disk have a flat 'api_key' string
    // instead of 'api_keys'. Best-effort carry it forward as that config's CURRENT provider's key
    // (the closest available guess - there's no way to recover which provider each historical save
    // actually belonged to) rather than losing it outright, then drop the old field so this only
    // ever runs once per environment.
    if (!isset($parsed['api_keys']) && !empty($config['api_key'])) {
        $config['api_keys'] = array_fill_keys(AI_PROVIDERS, '');
        $config['api_keys'][$config['provider']] = $config['api_key'];
    }
    unset($config['api_key']);
    if (!isset($config['api_keys']) || !is_array($config['api_keys'])) {
        $config['api_keys'] = array_fill_keys(AI_PROVIDERS, '');
    }
    // Guarantee every known provider has at least an empty slot, even if the file predates one.
    $config['api_keys'] = array_merge(array_fill_keys(AI_PROVIDERS, ''), $config['api_keys']);

    return $config;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $config = loadAiConfig($configFilePath, $defaultConfig);

    // SECURITY (24 Aug 2026): only ever return whether a key is on file - never the real key.
    // has_api_key_by_provider (25 Aug 2026, replaces the old single has_api_key/masked_key) - one
    // flag per provider so the frontend can show "Key on file" correctly for WHATEVER provider is
    // currently selected in the dropdown, including right after switching it client-side before
    // any save happens, without ever needing to see (or send) a real key for any provider.
    $responseConfig = $config;
    unset($responseConfig['api_keys']);
    $responseConfig['has_api_key_by_provider'] = array_map(
        fn($key) => !empty($key),
        $config['api_keys']
    );

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
    if (isset($input['provider']) && in_array($input['provider'], AI_PROVIDERS, true) && $input['provider'] !== $currentConfig['provider']) {
        $currentConfig['provider'] = $input['provider'];
        $changedFields[] = "Provider set to {$input['provider']}";
    }
    // Blank api_key means "leave this provider's stored key unchanged" (the GET handler above
    // never sends any real key back to the form, so an unmodified save must not overwrite one with
    // an empty string) - only a genuinely non-empty value updates it. Saved into api_keys[provider]
    // for THIS request's resulting provider (not necessarily the one before this request) - so
    // switching provider AND typing its key in the same save correctly targets the new provider,
    // never the old one (see api_keys migration/bug-fix comment above loadAiConfig() for the
    // single-shared-key bug this replaces).
    if (isset($input['api_key']) && trim($input['api_key']) !== '') {
        $currentConfig['api_keys'][$currentConfig['provider']] = trim($input['api_key']);
        $changedFields[] = "API key updated for {$currentConfig['provider']}";
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
    unset($responseConfig['api_keys']);
    $responseConfig['has_api_key_by_provider'] = array_map(
        fn($key) => !empty($key),
        $currentConfig['api_keys']
    );

    echo json_encode([
        'status' => 'success',
        'message' => 'AI Configuration saved successfully.',
        'data' => $responseConfig
    ]);
    exit();
}

http_response_code(405);
echo json_encode(['status' => 'error', 'message' => 'Method not allowed.']);
