<?php
/**
 * Telegram Notification & Template Manager Module
 * Function: Telegram templates, bot dispatch alerts, and messaging webhooks.
 */

require_once __DIR__ . '/sender.php';

function handleTelegramRequests($pdo, $request_method, $action) {
    switch ($action) {
        case 'send_telegram_alert':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $eventType   = $input['eventType'] ?? 'Alert';
                $category    = $input['category'] ?? 'all';
                $message     = $input['message'] ?? '';
                $replyMarkup = $input['replyMarkup'] ?? null;

                $results = [];
                if ($category === 'kitchen' || $category === 'all') {
                    $results['kitchen'] = sendTelegramMessage($message, null, null, $replyMarkup);
                }
                if ($category === 'admin' || $category === 'all') {
                    $results['admin'] = sendAdminTelegramMessage($message, null, null, $replyMarkup);
                }
                if ($category === 'finance' || $category === 'all') {
                    $results['finance'] = sendFinanceTelegramMessage($message, null, null, $replyMarkup);
                }

                echo json_encode([
                    'status' => 'success',
                    'message' => 'Telegram notification dispatched securely via backend proxy',
                    'eventType' => $eventType,
                    'category' => $category,
                    'results' => $results
                ]);
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid telegram action']);
            break;
    }
}
