<?php
/**
 * Telegram Update Poller - Local/Dev Substitute for the Production Webhook
 *
 * Run every 1 minute on localhost/XAMPP only:
 *   Windows Task Scheduler: schtasks /create /sc minute /mo 1 /tn "ArtistsFarm Telegram Poll" ^
 *                             /tr "C:\xampp\php\php.exe C:\xampp\htdocs\artists_farm\php\cron\poll_telegram_updates.php"
 *
 * Telegram calls telegram_webhook.php directly over HTTPS in production the
 * instant a button is tapped - there's no equivalent public HTTPS endpoint on
 * a local XAMPP box for Telegram to reach, so this polls getUpdates instead
 * on a short interval and feeds anything it finds through the exact same
 * pollAndMatchPairingCodes() (pairing codes + callback_query button taps)
 * that a live "check_pairing_status" request already triggers on demand.
 * This script just makes that happen continuously, without needing the
 * Setup Wizard open. A no-op away from localhost, since production should
 * rely on the registered webhook instead.
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../telegram/pairing.php';

$logFile = __DIR__ . '/telegram_poll.log';
$timestamp = date('Y-m-d H:i:s');

function logLine(string $file, string $message): void {
    file_put_contents($file, "$message\n", FILE_APPEND);
}

if ($live_db !== 'artists_farm_resort') {
    // Production - Telegram's registered webhook already covers this instantly.
    exit;
}

try {
    // Properties can bring their own bot (pairingBotToken() falls back to the
    // shared platform token when they haven't) - collect whichever distinct
    // tokens are actually in play and poll each exactly once, since polling
    // the same token twice in one run would just refetch nothing new.
    $propertyIds = $pdo->query("SELECT id FROM properties WHERE is_active = 1")->fetchAll(PDO::FETCH_COLUMN);
    $tokens = [TELEGRAM_BOT_TOKEN];
    foreach ($propertyIds as $propertyId) {
        $tokens[] = pairingBotToken($pdo, $propertyId);
    }
    $tokens = array_unique(array_filter($tokens));

    foreach ($tokens as $token) {
        pollAndMatchPairingCodes($pdo, $token);
    }

    logLine($logFile, "$timestamp - Poll completed (" . count($tokens) . " bot token(s))");
} catch (Exception $e) {
    logLine($logFile, "$timestamp - FATAL: " . $e->getMessage());
}
