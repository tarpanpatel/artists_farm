<?php
/**
 * Unconverted OTA Booking Checker - Scheduled Task
 *
 * Run daily (a couple times a day is also fine - see the dedupe note below):
 *   Linux/production cron:      0 9,15 * * * /usr/bin/php /path/to/artists_farm/php/cron/check_unconverted_ota_bookings.php
 *   Windows/XAMPP Task Scheduler: schtasks /create /sc daily /st 09:00 /tn "ArtistsFarm OTA Unconverted Check" ^
 *                                   /tr "C:\xampp\php\php.exe C:\xampp\htdocs\artists_farm\php\cron\check_unconverted_ota_bookings.php"
 *
 * Scans every property across every tenant (getUnconvertedDueBlocks() in
 * ical_sync.php is deliberately unscoped, unlike getBlockedDates()) for
 * OTA-synced calendar holds (Airbnb/Booking.com/etc) whose date range has
 * already begun - present (a guest may be in-house right now with zero
 * booking record: no guest profile, no ID on file, no billing) or fully
 * past (a guest already left, still never recorded) - but was never
 * converted into a real booking via "Convert to Booking" (see the
 * calendars and the Dashboard's System Alerts panel, added alongside this
 * cron 22 Aug 2026).
 *
 * Sends one Telegram admin alert per still-unconverted block, routed the
 * same per-property way every other Telegram alert already is
 * (sendPropertyTelegramMessage - see CLAUDE.md's "Telegram Group
 * Selection" note), using the block's own room/property id exactly like
 * guests.php's booking notifications do - never a parent property id, and
 * never a shared/global chat.
 *
 * Re-notifies at most once per 24h per block (ota_unconverted_notifications
 * table, self-healed by ensureNotificationSchema()) - safe to run this as
 * often as the schedule above without spamming. It keeps nagging daily
 * until the block is either converted (it then disappears from
 * getUnconvertedDueBlocks()'s NOT EXISTS join and stops matching here) or
 * removed from the OTA calendar upstream.
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../api/ical_sync.php';

$logFile = __DIR__ . '/ota_unconverted_check.log';
$timestamp = date('Y-m-d H:i:s');

function logLine(string $file, string $message): void {
    file_put_contents($file, "$message\n", FILE_APPEND);
}

logLine($logFile, "$timestamp - Unconverted OTA block checker started");

try {
    $manager = new ICalSyncManager($pdo);
    $manager->ensureNotificationSchema();

    $result = $manager->getUnconvertedDueBlocks();
    if ($result['status'] !== 'success') {
        logLine($logFile, "$timestamp - ERROR fetching blocks: " . ($result['message'] ?? 'unknown'));
        exit;
    }

    $blocks = $result['data'];
    if (empty($blocks)) {
        logLine($logFile, "$timestamp - No unconverted due blocks found");
        exit;
    }

    if (file_exists(__DIR__ . '/../telegram/telegram.php')) {
        require_once __DIR__ . '/../telegram/telegram.php';
    }

    $checkStmt = $pdo->prepare("
        SELECT last_notified_at FROM ota_unconverted_notifications
        WHERE external_event_id = ? AND property_id = ?
    ");
    $upsertStmt = $pdo->prepare("
        INSERT INTO ota_unconverted_notifications (external_event_id, property_id, last_notified_at, notify_count)
        VALUES (?, ?, NOW(), 1)
        ON DUPLICATE KEY UPDATE last_notified_at = NOW(), notify_count = notify_count + 1
    ");

    $sentCount = 0;
    foreach ($blocks as $block) {
        $propertyId = (int)$block['room_id'];
        $externalEventId = $block['external_event_id'];

        $checkStmt->execute([$externalEventId, $propertyId]);
        $lastNotified = $checkStmt->fetchColumn();
        if ($lastNotified && strtotime($lastNotified) > strtotime('-24 hours')) {
            continue; // already nagged within the last day
        }

        $isOngoing = !empty($block['is_ongoing']);
        $emoji = $isOngoing ? '⚠️' : '🚨';
        $statusLine = $isOngoing
            ? 'Ongoing now - guest may currently be on the property with no booking record.'
            : "Ended {$block['days_overdue']} day(s) ago - guest already left with no booking record.";
        $sourceLabel = $block['source_label'] ?: 'OTA';
        $propertyLabel = $block['parent_name'] ?: $block['room_name'];
        $startDate = substr($block['event_start'], 0, 10);
        $endDate = substr($block['event_end'], 0, 10);

        $message = "$emoji *Unconverted OTA Booking*\n\n";
        $message .= "*Property:* $propertyLabel\n";
        if ($block['parent_name']) {
            $message .= "*Room:* {$block['room_name']}\n";
        }
        $message .= "*Source:* $sourceLabel\n";
        $message .= "*Dates:* `$startDate` → `$endDate`\n";
        $message .= "*Status:* $statusLine\n\n";
        $message .= "Please convert this into a real booking from the Dashboard's System Alerts, or the booking calendar, so guest details and billing are recorded.";

        try {
            sendPropertyTelegramMessage($pdo, $propertyId, 'admin', $message, null, 'ota_unconverted_alert');
        } catch (Throwable $eTg) {
            error_log("OTA unconverted Telegram notification failed for event {$externalEventId}: " . $eTg->getMessage());
            continue; // don't record as notified if the send itself blew up
        }

        $upsertStmt->execute([$externalEventId, $propertyId]);
        $sentCount++;
    }

    logLine($logFile, "$timestamp - Checked " . count($blocks) . " unconverted block(s), sent $sentCount notification(s)");
} catch (Exception $e) {
    logLine($logFile, "$timestamp - FATAL: " . $e->getMessage());
}
