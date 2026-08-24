<?php
/**
 * Ground Code AI Assistant Endpoint
 *
 * Called by the AIChatWidget with a single user message. Tries the free
 * offline intent engine first; only falls through to an online provider
 * (Gemini/OpenAI) - if Root Admin has enabled one - when the offline engine
 * genuinely doesn't recognize the request.
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../ai/offline_intent_engine.php';
require_once __DIR__ . '/../ai/nav_menu_intents.php';
require_once __DIR__ . '/ai_config.php';

define('AI_USAGE_LOG_PATH', __DIR__ . '/../config/ai_usage_log.json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'POST required']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true) ?: [];
$message = trim((string) ($body['message'] ?? ''));
$role = $body['role'] ?? 'Staff';
$propertyName = $body['propertyName'] ?? 'Artists Farm Jaipur';
$pending = is_array($body['pending'] ?? null) ? $body['pending'] : null;

if ($message === '') {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'message is required']);
    exit;
}

/** Internal loopback call so the AI reuses the exact same business logic (price tracking, ledger posting) as the normal UI, instead of duplicating SQL. */
function ai_call_router_action(string $action, array $payload): array {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $routerPath = str_replace('ai_assistant.php', 'router.php', $_SERVER['SCRIPT_NAME']);
    $url = "$scheme://$host$routerPath?action=" . urlencode($action);
    $apiKey = getenv('API_KEY') ?: 'artists-farm-secure-key-2026';

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => 'POST',
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-API-Key: ' . $apiKey],
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $res = curl_exec($ch);
        $failed = $res === false;
        curl_close($ch);
        if (!$failed) {
            $decoded = json_decode($res, true);
            return is_array($decoded) ? $decoded : ['status' => 'error', 'message' => 'invalid_response'];
        }
    }

    $context = stream_context_create(['http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/json\r\nX-API-Key: $apiKey\r\n",
        'content' => json_encode($payload),
        'timeout' => 10,
    ]]);
    $res = @file_get_contents($url, false, $context);
    if ($res === false) {
        return ['status' => 'error', 'message' => 'internal_call_failed'];
    }
    $decoded = json_decode($res, true);
    return is_array($decoded) ? $decoded : ['status' => 'error', 'message' => 'invalid_response'];
}

function ai_fallback_reply(PDO $pdo, string $propertyName): array {
    $today = date('Y-m-d');
    $active = 0;
    $upcoming = 0;
    $past = 0;
    try {
        $active = (int) $pdo->query("SELECT COUNT(*) FROM guests WHERE status = 'Active'")->fetchColumn();
        $upcoming = (int) $pdo->query("SELECT COUNT(*) FROM guests WHERE status = 'Booked' AND checkin_date > '$today'")->fetchColumn();
        $past = (int) $pdo->query("SELECT COUNT(*) FROM guests WHERE status = 'CheckedOut'")->fetchColumn();
    } catch (PDOException $e) {
        // Leave counts at 0 on schemas that don't have these columns yet.
    }
    return [
        'reply' => "Ground Code helps you manage room bookings, live kitchen orders (KDS), room tariffs, petty cash expenses, and guest billing. You currently have $active active booking(s) today, $upcoming upcoming, and $past past.\n\nTry things like \"Buy 2 air freshener\", \"go to expenses\", or \"add a booking\".",
        'quickReplies' => ['+ Add Booking', 'Log Expense', 'KDS Kitchen'],
    ];
}

function ai_execute_intent(PDO $pdo, array $intent, string $propertyName): array {
    switch ($intent['intent']) {
        case 'log_expense':
            $params = $intent['params'];
            if (empty($params['amount'])) {
                return [
                    'reply' => "Got it - {$params['quantity']}x {$params['item']}. What's the price (per unit, in ₹)?",
                    'pending' => ['intent' => 'log_expense', 'params' => $params],
                ];
            }
            $result = ai_call_router_action('add_petty_cash', [
                'date' => date('Y-m-d'),
                'category' => 'Misc',
                'description' => $params['item'],
                'amount' => $params['amount'],
                'payment_mode' => 'Cash',
                'vendor' => 'Ground Code AI',
            ]);
            if (($result['status'] ?? '') === 'success') {
                return [
                    'reply' => "Logged ₹{$params['amount']} for {$params['quantity']}x {$params['item']} under Expenses.",
                    'action' => ['type' => 'expense_logged', 'id' => $result['id'] ?? null],
                    'quickReplies' => ['Open Expenses'],
                ];
            }
            return ['reply' => "I couldn't log that expense right now (" . ($result['message'] ?? 'unknown error') . "). Please add it manually from the Expenses screen."];

        case 'add_booking':
            return [
                'reply' => "Opening the Add Booking form for you - fill in the guest details there.",
                'action' => ['type' => 'navigate', 'tabKey' => 'guests', 'uniqueKey' => 'guest_registration', 'openAddForm' => true],
            ];

        case 'checkout':
            return [
                'reply' => "Opening Guest Registration - pick the guest and tap Checkout there so you can review their final bill first.",
                'action' => ['type' => 'navigate', 'tabKey' => 'guests', 'uniqueKey' => 'billing_checkout'],
            ];

        case 'navigate':
            return [
                'reply' => "Opening {$intent['label']}...",
                'action' => ['type' => 'navigate', 'tabKey' => $intent['target']['tabKey'], 'uniqueKey' => $intent['target']['uniqueKey'] ?? ''],
            ];

        case 'status':
            return ai_fallback_reply($pdo, $propertyName);

        case 'greeting':
            return ['reply' => "Hi! I'm Ground Code AI for $propertyName. Ask me to log an expense, add a booking, or jump to any screen.", 'quickReplies' => ['+ Add Booking', 'Log Expense', 'KDS Kitchen']];

        case 'help':
        default:
            return ai_fallback_reply($pdo, $propertyName);
    }
}

function ai_log_usage(string $provider, string $model, int $promptTokens, int $completionTokens): void {
    $entries = [];
    if (file_exists(AI_USAGE_LOG_PATH)) {
        $decoded = json_decode(file_get_contents(AI_USAGE_LOG_PATH), true);
        if (is_array($decoded)) {
            $entries = $decoded;
        }
    }
    $entries[] = [
        'timestamp' => date('c'),
        'provider' => $provider,
        'model' => $model,
        'promptTokens' => $promptTokens,
        'completionTokens' => $completionTokens,
        'totalTokens' => $promptTokens + $completionTokens,
    ];
    // Keep the log bounded - this is a rolling usage tracker, not an audit trail.
    if (count($entries) > 1000) {
        $entries = array_slice($entries, -1000);
    }
    @file_put_contents(AI_USAGE_LOG_PATH, json_encode($entries));
}

function ai_call_gemini(array $config, string $message, array $navLabels): ?array {
    $apiKey = $config['gemini']['apiKey'];
    $model = $config['gemini']['model'];
    if ($apiKey === '') {
        return null;
    }
    $url = "https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=" . urlencode($apiKey);
    $systemPrompt = "You are Ground Code AI, an assistant embedded in a hotel/resort management app. "
        . "Available screens: " . implode(', ', $navLabels) . ". "
        . "Reply ONLY with compact JSON: {\"intent\":\"navigate|log_expense|add_booking|checkout|chat\",\"label\":\"<screen name if navigate>\",\"item\":\"<if log_expense>\",\"quantity\":<number>,\"amount\":<number or null>,\"reply\":\"<short natural-language reply for chat intent>\"}. "
        . "Never invent booking or guest data.";

    $payload = [
        'contents' => [['role' => 'user', 'parts' => [['text' => $message]]]],
        'systemInstruction' => ['parts' => [['text' => $systemPrompt]]],
        'generationConfig' => ['temperature' => 0.2, 'responseMimeType' => 'application/json'],
    ];

    if (!function_exists('curl_init')) {
        return null;
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_TIMEOUT => 15,
    ]);
    $res = curl_exec($ch);
    curl_close($ch);
    if ($res === false) {
        return null;
    }
    $decoded = json_decode($res, true);
    $text = $decoded['candidates'][0]['content']['parts'][0]['text'] ?? null;
    $usage = $decoded['usageMetadata'] ?? [];
    ai_log_usage('gemini', $model, (int) ($usage['promptTokenCount'] ?? 0), (int) ($usage['candidatesTokenCount'] ?? 0));
    if (!$text) {
        return null;
    }
    $parsed = json_decode($text, true);
    return is_array($parsed) ? $parsed : ['intent' => 'chat', 'reply' => $text];
}

function ai_call_openai(array $config, string $message, array $navLabels): ?array {
    $apiKey = $config['openai']['apiKey'];
    $model = $config['openai']['model'];
    if ($apiKey === '' || !function_exists('curl_init')) {
        return null;
    }
    $systemPrompt = "You are Ground Code AI, an assistant embedded in a hotel/resort management app. "
        . "Available screens: " . implode(', ', $navLabels) . ". "
        . "Reply ONLY with compact JSON: {\"intent\":\"navigate|log_expense|add_booking|checkout|chat\",\"label\":\"<screen name if navigate>\",\"item\":\"<if log_expense>\",\"quantity\":<number>,\"amount\":<number or null>,\"reply\":\"<short natural-language reply for chat intent>\"}. "
        . "Never invent booking or guest data.";

    $ch = curl_init('https://api.openai.com/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $apiKey],
        CURLOPT_POSTFIELDS => json_encode([
            'model' => $model,
            'messages' => [['role' => 'system', 'content' => $systemPrompt], ['role' => 'user', 'content' => $message]],
            'temperature' => 0.2,
            'response_format' => ['type' => 'json_object'],
        ]),
        CURLOPT_TIMEOUT => 15,
    ]);
    $res = curl_exec($ch);
    curl_close($ch);
    if ($res === false) {
        return null;
    }
    $decoded = json_decode($res, true);
    $text = $decoded['choices'][0]['message']['content'] ?? null;
    $usage = $decoded['usage'] ?? [];
    ai_log_usage('openai', $model, (int) ($usage['prompt_tokens'] ?? 0), (int) ($usage['completion_tokens'] ?? 0));
    if (!$text) {
        return null;
    }
    $parsed = json_decode($text, true);
    return is_array($parsed) ? $parsed : ['intent' => 'chat', 'reply' => $text];
}

/** Normalize an online-provider response into the same shape ai_execute_intent understands. */
function ai_online_result_to_intent(array $result, array $navIntents): ?array {
    $intent = $result['intent'] ?? 'chat';
    if ($intent === 'log_expense') {
        $qty = (float) ($result['quantity'] ?? 1);
        $amount = isset($result['amount']) && $result['amount'] !== null ? (float) $result['amount'] : null;
        $params = ['item' => ai_normalize_item((string) ($result['item'] ?? 'item')), 'quantity' => $qty];
        if ($amount !== null) {
            $params['amount'] = $amount;
        }
        return ['intent' => 'log_expense', 'params' => $params];
    }
    if ($intent === 'navigate') {
        $label = strtolower((string) ($result['label'] ?? ''));
        foreach ($navIntents as $nav) {
            if (strtolower($nav['label']) === $label || str_contains(strtolower($nav['label']), $label)) {
                return ['intent' => 'navigate', 'target' => $nav['target'], 'label' => $nav['label']];
            }
        }
        return null;
    }
    if (in_array($intent, ['add_booking', 'checkout'], true)) {
        return ['intent' => $intent, 'params' => []];
    }
    return null;
}

$config = ai_load_config();
$navIntents = ai_build_nav_intents($pdo);
$navLabels = array_map(fn($n) => $n['label'], $navIntents);

$offlineResult = ai_match_offline_intent($message, $navIntents, $pdo, $pending);
$engineUsed = 'offline';
$response = null;

if ($offlineResult !== null && $offlineResult['confidence'] >= 0.55) {
    $response = ai_execute_intent($pdo, $offlineResult, $propertyName);
} elseif ($config['enabled'] && $config['provider'] !== 'offline' && !empty($config[$config['provider']]['apiKey'])) {
    $engineUsed = $config['provider'];
    $onlineResult = $config['provider'] === 'gemini'
        ? ai_call_gemini($config, $message, $navLabels)
        : ai_call_openai($config, $message, $navLabels);

    $mappedIntent = $onlineResult ? ai_online_result_to_intent($onlineResult, $navIntents) : null;
    if ($mappedIntent) {
        $response = ai_execute_intent($pdo, $mappedIntent, $propertyName);
    } elseif ($onlineResult && !empty($onlineResult['reply'])) {
        $response = ['reply' => $onlineResult['reply']];
    } else {
        $engineUsed = 'offline';
        $response = ai_fallback_reply($pdo, $propertyName);
    }
} else {
    $response = ai_fallback_reply($pdo, $propertyName);
}

echo json_encode([
    'status' => 'success',
    'engine' => $engineUsed,
    'reply' => $response['reply'],
    'quickReplies' => $response['quickReplies'] ?? [],
    'action' => $response['action'] ?? null,
    'pending' => $response['pending'] ?? null,
]);
