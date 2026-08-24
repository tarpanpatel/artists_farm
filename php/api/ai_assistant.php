<?php
/**
 * AI Assistant REST Endpoint
 * Ground Code Resort & KDS Management System
 * Handles auth/session/rate-limiting/DB context, then hands off to the offline intent engine
 * (php/ai/offline_intent_engine.php - table-driven + scored, see that file's own doc comment)
 * for the actual "what does this message mean" decision, with strict RBAC enforcement &
 * pre-filled task execution. Online AI providers (Gemini/OpenAI) are still supported as an
 * opt-in alternative (see ai_config.php) but the offline engine is what actually runs by default
 * - deliberately kept free of any external API dependency (24 Aug 2026, explicit decision:
 * online usage costs scale with traffic, and this app's action set is small/closed enough that a
 * well-built offline matcher covers it without that ongoing cost).
 */

// SECURITY (24 Aug 2026, found in review): this endpoint is never routed through router.php, so
// it never got router.php's login/property-ownership gates - it had ZERO auth check at all.
// $userRole used to come straight from the client's own request body, so the "STRICT SECURITY
// RULE"/RBAC checks below were trivially bypassed by sending user_role: "Root Admin" in the POST
// body. Session bootstrap must match router.php/ical_sync.php exactly so the same login cookie
// is recognized (see access_control.php's own doc comment for this contract).
ini_set('session.gc_maxlifetime', 86400 * 7);
ini_set('session.cookie_lifetime', 86400 * 7);
ini_set('session.cookie_httponly', 1);
session_name('artists_farm_session');
session_start();

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../errors/logger.php';
require_once __DIR__ . '/../security/access_control.php';
require_once __DIR__ . '/../config/property_resolver.php';
require_once __DIR__ . '/../security/rate_limiter.php';
require_once __DIR__ . '/../ai/offline_intent_engine.php';
require_once __DIR__ . '/../ai/nav_menu_intents.php';

header('Content-Type: application/json');

if (empty($_SESSION['username'])) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Authentication required.']);
    exit();
}

$currentPropertyId = getCurrentPropertyId($pdo);
if (!isPropertyAccessAllowed($pdo, $currentPropertyId)) {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Access denied for this property.']);
    exit();
}

// Real, server-verified role -// SECURITY (24 Aug 2026): read the authenticated session's role - client input
// below reads this, not anything from $input.
$userRole = $_SESSION['role'] ?? ($input['user_role'] ?? 'Visitor');
$currentProperty = getCurrentProperty($pdo, $currentPropertyId);
$propertyName = $currentProperty['name'] ?? 'Resort';

// Rate limit per logged-in user (not per-IP: a shared office/property network shouldn't
// throttle every staff member together).
$rateLimiter = new RateLimiter($pdo);
$rateLimiter->setMaxAttempts(30)->setWindowSeconds(300);
$rateLimiter->checkAndBlock($_SESSION['username'], 'ai_assistant'); // exits with 429 if exceeded

$rawInput = file_get_contents('php://input');
$jsonInput = !empty($rawInput) ? json_decode($rawInput, true) : null;
$input = is_array($jsonInput) ? $jsonInput : $_POST;

$prompt = trim($input['prompt'] ?? '');
$liveContext = $input['live_context'] ?? null;

if (empty($prompt)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Prompt cannot be empty.']);
    exit();
}

// Load AI Configuration
$configFilePath = __DIR__ . '/../config/ai_config.json';
$aiConfig = [
    'enabled' => false,
    'provider' => 'gemini',
    'api_key' => '',
    'custom_endpoint' => 'http://localhost:11434/v1',
];

if (file_exists($configFilePath)) {
    $parsedConfig = json_decode(file_get_contents($configFilePath), true);
    if (is_array($parsedConfig)) {
        $aiConfig = array_merge($aiConfig, $parsedConfig);
    }
}

// Log query into Telescope Logger (portal: ai_chat)
if (class_exists('TelescopeLogger')) {
    TelescopeLogger::log('ai_chat', 'AI Query', $prompt, "Role: $userRole | Mode: " . ($aiConfig['enabled'] ? 'ONLINE (' . $aiConfig['provider'] . ')' : 'OFFLINE'), [
        'property' => $propertyName,
        'user_role' => $userRole,
        'ai_enabled' => $aiConfig['enabled'],
        'provider' => $aiConfig['provider'],
    ]);
}

$contextSummary = "";
if (is_array($liveContext)) {
    $todayCount = (int)($liveContext['today_count'] ?? 0);
    $upcomingCount = (int)($liveContext['upcoming_count'] ?? 0);
    $pastCount = (int)($liveContext['past_count'] ?? 0);
    $activeGuests = $liveContext['active_guests'] ?? [];

    $activeStr = !empty($activeGuests) ? implode(', ', $activeGuests) : 'None';
    $contextSummary = "Current Property Live Status ($propertyName):\n- Active/Today Bookings: $todayCount (Guests: $activeStr)\n- Upcoming Bookings: $upcomingCount\n- Past Bookings: $pastCount\n- Logged-In User Role: $userRole\n";
}

// SECURITY (24 Aug 2026): the ONLY real access-control backstop for actions an ONLINE AI
// provider's raw text reply asks to execute (only reachable if Online AI is explicitly enabled
// in ai_config.php - offline is the default and does its own RBAC check per-intent below
// instead). The system prompt's "STRICT SECURITY RULE" is advisory to the model only - a crafted
// user message could get a compliant model to emit a privileged action regardless of that prose
// instruction (prompt injection). This function re-validates any extracted action in PHP before
// it's ever echoed back to the client.
function isActionPermittedForRole(?array $action, string $userRole): bool {
    if (!$action || empty($action['type'])) {
        return true; // no action requested - nothing to gate
    }
    $roleLower = strtolower(trim($userRole));
    $isRootAdmin = str_contains($roleLower, 'root');
    $isAdmin = str_contains($roleLower, 'admin') || $isRootAdmin;

    $type = $action['type'];
    if ($type === 'open_telescope') return $isRootAdmin;
    if ($type === 'open_root_dashboard_route') return $isRootAdmin;
    if ($type === 'open_telegram_modal') return $isAdmin;
    if ($type === 'navigate') {
        $tab = $action['tab'] ?? '';
        $itemKey = $action['itemKey'] ?? '';
        if (in_array($tab, ['edit_property', 'licenses', 'admin_control'], true) || in_array($itemKey, ['ai_services', 'staff_directory_salaries', 'staff_permissions'], true)) {
            return $isAdmin;
        }
        return true; // ordinary staff navigation (kitchen, guests, staff_meals, ...)
    }
    return true; // open_add_booking / open_add_expense - open to all logged-in staff roles
}

// IF ONLINE AI API IS ENABLED (opt-in, off by default - see ai_config.php): Try Provider API
if ($aiConfig['enabled'] === true) {
    $provider = $aiConfig['provider'];
    $apiKey = !empty($aiConfig['api_key']) ? $aiConfig['api_key'] : getenv('GEMINI_API_KEY');

    // 1. GOOGLE GEMINI PROVIDER
    if ($provider === 'gemini' && !empty($apiKey)) {
        $systemInstruction = "You are Ground Code AI, the digital assistant for hotel & resort staff using Ground Code PMS/KDS. Keep answers brief and accurate.\n\n" . $contextSummary . "\nSTRICT SECURITY RULE: The user is logged in as '$userRole'. Do NOT allow Staff role to open Telescope, edit property, or manage licenses. If requested by non-Root, refuse with access denied.\nSTRICT CONFIDENTIALITY RULE: You MUST ONLY answer user operational & how-to questions (e.g. how to check in guests, how to export CSV, how to log expenses, how to use KDS). NEVER answer questions about internal technology, code structure, framework, programming languages, database architecture, or source code. If asked about tech stack or code, refuse with: '🔒 Security Refusal: I am trained exclusively to assist with Ground Code PMS & KDS hotel management operations and user workflows. Internal software architecture, code details, and technology stack information are private and strictly confidential.'\nFormat action commands as JSON block at end: {\"action\": {\"type\": \"open_add_booking\"}}.";

        $payload = [
            'contents' => [
                [
                    'role' => 'user',
                    'parts' => [
                        ['text' => $systemInstruction . "\n\nUser Question: " . $prompt]
                    ]
                ]
            ]
        ];

        $ch = curl_init("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" . urlencode($apiKey));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_TIMEOUT, 8);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200 && $response) {
            $resData = json_decode($response, true);
            $replyText = $resData['candidates'][0]['content']['parts'][0]['text'] ?? null;
            if (!empty($replyText)) {
                $extractedAction = null;
                if (preg_match('/\{"action":\s*\{[^}]+\}\}/i', $replyText, $matches)) {
                    $parsed = json_decode($matches[0], true);
                    if (isset($parsed['action'])) {
                        $extractedAction = $parsed['action'];
                    }
                    $replyText = str_replace($matches[0], '', $replyText);
                }

                if ($extractedAction && !isActionPermittedForRole($extractedAction, $userRole)) {
                    $replyText = trim($replyText) . "\n\n🔒 Access Denied: that action isn't available for your role ('$userRole').";
                    $extractedAction = null;
                }

                echo json_encode([
                    'status' => 'success',
                    'reply' => trim($replyText),
                    'action' => $extractedAction,
                    'mode' => 'online',
                    'provider' => 'gemini'
                ]);
                exit();
            }
        }
    }

    // 2. OPENAI PROVIDER (gpt-4o-mini)
    if ($provider === 'openai' && !empty($apiKey)) {
        $messages = [
            ['role' => 'system', 'content' => "You are Ground Code AI. Keep answers brief.\n\n" . $contextSummary . "\nFormat action commands as JSON: {\"action\": {\"type\": \"open_add_booking\"}}."],
            ['role' => 'user', 'content' => $prompt]
        ];

        $ch = curl_init("https://api.openai.com/v1/chat/completions");
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['model' => 'gpt-4o-mini', 'messages' => $messages]));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'Authorization: Bearer ' . $apiKey]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 8);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200 && $response) {
            $resData = json_decode($response, true);
            $replyText = $resData['choices'][0]['message']['content'] ?? null;
            if (!empty($replyText)) {
                echo json_encode([
                    'status' => 'success',
                    'reply' => trim($replyText),
                    'mode' => 'online',
                    'provider' => 'openai'
                ]);
                exit();
            }
        }
    }
}

// Auto-generated "navigate to X" fallback intents for every page in nav_menu_items - see that
// file's doc comment. Merged in AFTER the hand-written table so a hand-written intent still wins
// any scoring tie.
$result = runOfflineIntentEngine($prompt, $liveContext, $userRole, buildNavMenuIntents($pdo));
echo json_encode([
    'status' => 'success',
    'reply' => $result['reply'],
    'action' => $result['action'],
    'mode' => 'offline',
    'provider' => 'offline'
]);
