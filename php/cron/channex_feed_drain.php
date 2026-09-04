<?php
/**
 * Channex Booking Feed Drain - Scheduled Task
 *
 * Run frequently - every 5 minutes is reasonable. Cron expression, written out
 * rather than inline because the slash-star form would close this comment:
 *   minute "every 5", all hours/days/months/weekdays, then
 *   /usr/bin/php /path/to/artists_farm/php/cron/channex_feed_drain.php
 *
 * WHY THIS EXISTS (added 4 Sep 2026)
 *
 * The Channex integration was webhook-only, and a webhook alone does not catch
 * everything. Channex keeps every revision it has not been acknowledged for in
 * `booking_revisions/feed`, and revisions arrive there with NO webhook fired:
 *
 *   - an imported back-catalogue (`load_future_reservations`). Confirmed live
 *     this date: pulling six Airbnb listings put a real confirmed reservation
 *     (Max, 6-11 Sep, The Artist's Studio) into the feed and delivered no
 *     webhook at all.
 *   - any webhook Channex could not deliver - a deploy, a timeout, the site
 *     briefly down. It retries, but the feed is the durable copy.
 *
 * The failure mode is silent and expensive: a confirmed booking sits at Channex
 * while Ground Code shows the room as free, so the direct booking engine and
 * staff both happily sell a night that is already taken. This drain is what
 * makes the inbound path self-healing instead of depending on one HTTP call
 * having landed.
 *
 * Safe to run often: drainFeed() replays each entry through the normal webhook
 * handler, which is idempotent - an already-processed revision returns success
 * and is simply re-acknowledged, creating nothing.
 */

require_once __DIR__ . '/../config/database.php';

$logFile = __DIR__ . '/channex_feed_drain.log';
$timestamp = date('Y-m-d H:i:s');

$receiverPath = __DIR__ . '/../channex/webhook_receiver.php';
if (!is_file($receiverPath)) {
    file_put_contents($logFile, "$timestamp - SKIP: Channex module not installed\n", FILE_APPEND);
    exit(0);
}

require_once $receiverPath;

try {
    $receiver = new ChannexWebhookReceiver($pdo);
    $result = $receiver->drainFeed(50);

    // Only log when something actually happened. This runs every few minutes;
    // an "in_feed: 0, processed: 0" line every time would bury the one entry
    // that matters under thousands of no-ops.
    if (($result['in_feed'] ?? 0) > 0 || ($result['failed'] ?? 0) > 0) {
        $line = "$timestamp - in_feed={$result['in_feed']} processed={$result['processed']} failed={$result['failed']}\n";
        foreach (($result['details'] ?? []) as $d) {
            $line .= "    {$d['revision_id']} {$d['guest']} {$d['arrival']} -> {$d['status']} {$d['message']}\n";
        }
        file_put_contents($logFile, $line, FILE_APPEND);
    }

    if (($result['failed'] ?? 0) > 0 && class_exists('TelescopeLogger')) {
        TelescopeLogger::log('channel_manager', 'Channex Feed Drain Failures',
            "{$result['failed']} feed entries could not be processed",
            'channex_feed_drain.php', $result['details'] ?? []);
    }
} catch (Throwable $e) {
    file_put_contents($logFile, "$timestamp - ERROR: " . $e->getMessage() . "\n", FILE_APPEND);
    if (class_exists('TelescopeLogger')) {
        TelescopeLogger::log('channel_manager', 'Channex Feed Drain Error', $e->getMessage(), 'channex_feed_drain.php');
    }
}
