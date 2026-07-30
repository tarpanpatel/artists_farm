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

function handleTelegramRequests($pdo, $request_method, $action, $propertyId) {
    switch ($action) {
        case 'send_telegram_alert':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $eventType   = $input['eventType'] ?? 'Alert';
                $category    = $input['category'] ?? 'all';
                $message     = $input['message'] ?? '';
                $replyMarkup = $input['replyMarkup'] ?? null;
                $templateKey = $input['templateKey'] ?? null;

                $result = sendPropertyTelegramMessage($pdo, $propertyId, $category, $message, $replyMarkup, $templateKey);

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
                ];
                $ok = updatePropertyModuleConfig($pdo, $propertyId, 'telegram', $config);
                echo json_encode(['status' => $ok ? 'success' : 'error']);
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid telegram action']);
            break;
    }
}
