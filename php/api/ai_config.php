<?php
/**
 * AI Config
 *
 * Root-Admin-only toggle for which engine the "Ground Code AI" widget uses:
 * offline (free, rule-based, always on) or an online provider (Gemini /
 * OpenAI) for anything the offline engine can't confidently answer.
 *
 * The config file lives outside git (see .gitignore's `*.json` rule) because
 * it holds the provider API key once Root Admin sets one.
 */

define('AI_CONFIG_PATH', __DIR__ . '/../config/ai_config.json');

function ai_default_config(): array {
    return [
        'provider' => 'offline',
        'enabled' => true,
        'gemini' => ['apiKey' => '', 'model' => 'gemini-2.0-flash'],
        'openai' => ['apiKey' => '', 'model' => 'gpt-4o-mini'],
    ];
}

function ai_load_config(): array {
    if (!file_exists(AI_CONFIG_PATH)) {
        return ai_default_config();
    }
    $raw = file_get_contents(AI_CONFIG_PATH);
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return ai_default_config();
    }
    return array_replace_recursive(ai_default_config(), $decoded);
}

function ai_save_config(array $config): bool {
    $dir = dirname(AI_CONFIG_PATH);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    return file_put_contents(AI_CONFIG_PATH, json_encode($config, JSON_PRETTY_PRINT)) !== false;
}

// Only run the HTTP endpoint body when this file is hit directly
// (ai_assistant.php also includes this file just for the functions above).
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    require_once __DIR__ . '/../config/database.php';

    $method = $_SERVER['REQUEST_METHOD'];
    $api_key = getenv('API_KEY') ?: 'artists-farm-secure-key-2026';
    $provided_key = $_SERVER['HTTP_X_API_KEY'] ?? $_GET['api_key'] ?? '';

    if ($method === 'GET') {
        $config = ai_load_config();
        echo json_encode([
            'status' => 'success',
            'data' => [
                'provider' => $config['provider'],
                'enabled' => $config['enabled'],
                'gemini' => ['model' => $config['gemini']['model'], 'hasApiKey' => $config['gemini']['apiKey'] !== ''],
                'openai' => ['model' => $config['openai']['model'], 'hasApiKey' => $config['openai']['apiKey'] !== ''],
            ],
        ]);
        exit;
    }

    if ($method === 'POST') {
        if ($provided_key !== $api_key) {
            http_response_code(401);
            echo json_encode(['status' => 'error', 'message' => 'Unauthorized. Valid API key required.']);
            exit;
        }

        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $config = ai_load_config();

        if (isset($input['provider']) && in_array($input['provider'], ['offline', 'gemini', 'openai'], true)) {
            $config['provider'] = $input['provider'];
        }
        if (isset($input['enabled'])) {
            $config['enabled'] = (bool) $input['enabled'];
        }
        foreach (['gemini', 'openai'] as $provider) {
            if (!isset($input[$provider]) || !is_array($input[$provider])) {
                continue;
            }
            if (!empty($input[$provider]['apiKey'])) {
                $config[$provider]['apiKey'] = $input[$provider]['apiKey'];
            }
            if (!empty($input[$provider]['model'])) {
                $config[$provider]['model'] = $input[$provider]['model'];
            }
        }

        ai_save_config($config);
        echo json_encode(['status' => 'success', 'message' => 'AI settings saved']);
        exit;
    }

    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
}
