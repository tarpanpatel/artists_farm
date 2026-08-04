<?php
/**
 * /telegram/telegram_webhook.php
 * Production receive path: Telegram calls this URL directly over HTTPS the
 * instant a button is tapped. On localhost/XAMPP there's no public HTTPS
 * endpoint for Telegram to reach, so php/cron/poll_telegram_updates.php
 * covers the same ground by polling instead - both paths parse the update
 * into a callback_query array and hand it to the same
 * handleTelegramCallbackQuery() in webhook_handler.php.
 */

ini_set('display_errors', 0);
error_reporting(E_ALL);

require_once __DIR__ . "/../config/database.php";
require_once __DIR__ . "/webhook_handler.php";

$rawContent = file_get_contents("php://input");
$update = json_decode($rawContent, true);

if ($update && isset($update['callback_query'])) {
    handleTelegramCallbackQuery($pdo, $update['callback_query']);
}

http_response_code(200);
