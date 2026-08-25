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
require_once __DIR__ . "/pairing.php";

$rawContent = file_get_contents("php://input");
$update = json_decode($rawContent, true);

if ($update && isset($update['callback_query'])) {
    handleTelegramCallbackQuery($pdo, $update['callback_query']);
} elseif ($update) {
    // Setup Wizard group pairing (added 26 Aug 2026). This is the ONLY path
    // that can see the pairing code on any real deployment: registering a
    // webhook - which sender.php does automatically on every send - makes
    // Telegram reject getUpdates with 409, so pairing.php's polling path is
    // dead the moment a property sends its first notification. Handling only
    // callback_query here meant the code message was received and discarded,
    // and the wizard hung on "Waiting for the code to arrive..." forever. See
    // matchPairingCodeFromMessage()'s own comment for the full write-up.
    //
    // Wrapped so a pairing failure can never turn into a non-200 for Telegram:
    // it retries failed webhook deliveries, which would re-drive whatever else
    // was in this update (button taps included) on every retry.
    try {
        $msg = $update['message'] ?? $update['channel_post'] ?? null;
        if ($msg) {
            matchPairingCodeFromMessage($pdo, $msg);
        }
    } catch (Exception $e) {
        error_log("Telegram webhook pairing match failed: " . $e->getMessage());
    }
}

http_response_code(200);
