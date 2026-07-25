<?php
/**
 * telegram/sender.php
 * Core Telegram API Driver with updated UI Handlers
 */

require_once __DIR__ . '/config.php';

if (!function_exists('sendTelegramMessage')) {
    function sendTelegramMessage($message, $token = null, $chatId = null, $replyMarkup = null) {
        $token = $token ?? TELEGRAM_BOT_TOKEN;
        $chatId = $chatId ?? TELEGRAM_KITCHEN_CHAT_ID;
        return sendRawTelegramMessage($message, $token, $chatId, $replyMarkup);
    }
}

if (!function_exists('sendAdminTelegramMessage')) {
    function sendAdminTelegramMessage($message, $token = null, $chatId = null, $replyMarkup = null) {
        $token = $token ?? TELEGRAM_BOT_TOKEN;
        $chatId = $chatId ?? TELEGRAM_ADMIN_CHAT_ID;
        return sendRawTelegramMessage($message, $token, $chatId, $replyMarkup);
    }
}

if (!function_exists('sendFinanceTelegramMessage')) {
    function sendFinanceTelegramMessage($message, $token = null, $chatId = null, $replyMarkup = null) {
        $token = $token ?? TELEGRAM_BOT_TOKEN;
        $chatId = $chatId ?? TELEGRAM_FINANCE_CHAT_ID;
        return sendRawTelegramMessage($message, $token, $chatId, $replyMarkup);
    }
}

if (!function_exists('sendRawTelegramMessage')) {
    function sendRawTelegramMessage($message, $token, $chatId, $replyMarkup = null) {
        $url = "https://api.telegram.org/bot" . $token . "/sendMessage";
        $data = [
            'chat_id' => $chatId,
            'text' => $message,
            'parse_mode' => 'HTML'
        ];
        
        if ($replyMarkup !== null) {
            $data['reply_markup'] = is_array($replyMarkup) ? json_encode($replyMarkup) : $replyMarkup;
        }

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        $response = curl_exec($ch);
        curl_close($ch);
        return $response;
    }
}

if (!function_exists('editTelegramMessageText')) {
    function editTelegramMessageText($chat_id, $message_id, $text, $replyMarkup = null) {
        $url = "https://api.telegram.org/bot" . TELEGRAM_BOT_TOKEN . "/editMessageText";
        
        $data = [
            'chat_id' => $chat_id,
            'message_id' => $message_id,
            'text' => $text,
            'parse_mode' => 'HTML'
        ];
        
        if ($replyMarkup !== null) {
            $data['reply_markup'] = is_array($replyMarkup) ? $replyMarkup : json_decode($replyMarkup, true);
        } else {
            $data['reply_markup'] = ['inline_keyboard' => []];
        }

        $payload = json_encode($data);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_exec($ch);
        curl_close($ch);
    }
}

if (!function_exists('answerTelegramCallbackQuery')) {
    function answerTelegramCallbackQuery($callback_query_id, $text = "", $show_alert = false) {
        $url = "https://api.telegram.org/bot" . TELEGRAM_BOT_TOKEN . "/answerCallbackQuery";
        
        $data = [
            'callback_query_id' => $callback_query_id,
            'text' => $text,
            'show_alert' => $show_alert
        ];

        $payload = json_encode($data);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_exec($ch);
        curl_close($ch);
    }
}
