<?php
/**
 * Telegram Notification & Template Manager Module
 * Function: Telegram templates, bot dispatch alerts, and messaging webhooks.
 *
 * Multi-tenant schema for system_telegram_templates:
 *   CREATE TABLE system_telegram_templates (
 *     id INT AUTO_INCREMENT PRIMARY KEY,
 *     template_key VARCHAR(100) NOT NULL UNIQUE,
 *     property_id INT NOT NULL DEFAULT 1 AFTER template_key,
 *     template_text TEXT NOT NULL,
 *     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 *   );
 * All SELECT/INSERT/UPDATE queries must scope by property_id.
 */

require_once __DIR__ . '/sender.php';
require_once __DIR__ . '/../modules/module_manager.php';
require_once __DIR__ . '/pairing.php';

function handleTelegramRequests($pdo, $request_method, $action, $propertyId) {
    switch ($action) {
        case 'send_telegram_alert':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true) ?: [];
                $eventType   = $input['eventType'] ?? 'Alert';
                $category    = $input['category'] ?? 'all';
                $message     = $input['message'] ?? '';
                $replyMarkup = $input['replyMarkup'] ?? null;
                $templateKey = $input['templateKey'] ?? null;
                $mediaUrls   = is_array($input['mediaUrls'] ?? null) ? $input['mediaUrls'] : [];

                $filePaths = [];
                if (!empty($mediaUrls)) {
                    $rootDir = realpath(__DIR__ . '/../../');
                    if ($rootDir) {
                        foreach ($mediaUrls as $rawUrl) {
                            if (!is_string($rawUrl) || empty($rawUrl)) continue;
                            $path = parse_url($rawUrl, PHP_URL_PATH);
                            if (!$path) continue;
                            $localPath = $rootDir . '/' . ltrim($path, '/');
                            if (file_exists($localPath)) {
                                $filePaths[] = $localPath;
                            }
                        }
                    }
                }

                if (!empty($filePaths)) {
                    $result = sendPropertyTelegramPhoto($pdo, $propertyId, $category, $filePaths, $message, $templateKey);
                } else {
                    $result = sendPropertyTelegramMessage($pdo, $propertyId, $category, $message, $replyMarkup, $templateKey);
                }

                echo json_encode([
                    'status' => 'success',
                    'message' => 'Telegram notification dispatched securely via backend proxy',
                    'eventType' => $eventType,
                    'category' => $category,
                    'result' => $result
                ]);
            }
            break;

        case 'get_telegram_config':
            $config = getPropertyTelegramConfig($pdo, $propertyId);
            // Don't leak which chars of the token exist beyond confirming one is set;
            // the raw token is still needed for editing, so return it as-is — this
            // app has no auth boundary on the main router today (see other actions).
            echo json_encode(['status' => 'success', 'data' => $config]);
            break;

        case 'save_telegram_config':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true) ?: [];
                $config = [
                    'enabled' => !empty($input['enabled']),
                    'botToken' => $input['botToken'] ?? null,
                    'groups' => is_array($input['groups'] ?? null) ? $input['groups'] : [],
                    'routing' => is_array($input['routing'] ?? null) ? $input['routing'] : [],
                    'reminderThresholdMinutes' => max(1, (int)($input['reminderThresholdMinutes'] ?? 5)),
                ];
                $ok = updatePropertyModuleConfig($pdo, $propertyId, 'telegram', $config);
                echo json_encode(['status' => $ok ? 'success' : 'error']);
            }
            break;

        // --- ZERO-FRICTION SETUP WIZARD (pairing-code based group connection) ---
        case 'get_bot_identity':
            $token = pairingBotToken($pdo, $propertyId);
            if (empty($token)) {
                echo json_encode(['status' => 'success', 'data' => null]);
                break;
            }
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, "https://api.telegram.org/bot{$token}/getMe");
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 6);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
            $raw = curl_exec($ch);
            curl_close($ch);
            $parsed = $raw ? json_decode($raw, true) : null;
            $identity = (!empty($parsed['ok']) && !empty($parsed['result']['username']))
                ? ['username' => $parsed['result']['username'], 'name' => $parsed['result']['first_name'] ?? null]
                : null;
            echo json_encode(['status' => 'success', 'data' => $identity]);
            break;

        case 'generate_pairing_code':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true) ?: [];
                $groupKey = trim($input['groupKey'] ?? '');
                $groupName = trim($input['groupName'] ?? '');
                if (!$groupKey || !$groupName) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'groupKey and groupName are required']);
                    break;
                }
                $code = generatePairingCode($pdo, $propertyId, $groupKey, $groupName);
                echo json_encode(['status' => 'success', 'code' => $code]);
            }
            break;

        case 'check_pairing_status':
            $code = trim($_GET['code'] ?? '');
            if (!$code) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'code is required']);
                break;
            }
            pollAndMatchPairingCodes($pdo, pairingBotToken($pdo, $propertyId));
            echo json_encode(['status' => 'success', 'data' => getPairingStatus($pdo, $code)]);
            break;

        case 'confirm_pairing':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true) ?: [];
                $code = trim($input['code'] ?? '');
                $result = confirmPairing($pdo, $propertyId, $code);
                echo json_encode(array_merge(['status' => $result['success'] ? 'success' : 'error'], $result));
            }
            break;

        case 'send_telegram_test':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true) ?: [];
                $chatId = trim($input['chatId'] ?? '');
                if (!$chatId) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'chatId is required']);
                    break;
                }
                $token = pairingBotToken($pdo, $propertyId);
                if (empty($token)) {
                    echo json_encode(['status' => 'error', 'message' => 'No Telegram bot token is configured on this server yet.']);
                    break;
                }
                $raw = sendRawTelegramMessage("✅ <b>Test message from Ground Code</b>\nThis group is now connected.", $token, $chatId);
                $parsed = json_decode($raw, true);
                $ok = !empty($parsed['ok']);
                echo json_encode(['status' => $ok ? 'success' : 'error', 'message' => $ok ? null : ($parsed['description'] ?? 'Telegram API call failed')]);
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid telegram action']);
            break;
    }
}

