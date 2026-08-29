<?php
/**
 * Daily Arrivals & Departures Digest - Scheduled Task
 *
 * Run once daily, evening (default 10pm - see cron_jobs.php's daily_at_time):
 *   Linux/production cron: dispatcher.php handles this automatically once
 *   registered in cron_jobs.php - no separate crontab entry needed.
 *   Windows/XAMPP Task Scheduler (manual, local-only):
 *     schtasks /create /sc daily /st 22:00 /tn "ArtistsFarm Daily Ops Digest" ^
 *       /tr "C:\xampp\php\php.exe C:\xampp\htdocs\artists_farm\php\cron\daily_operations_digest.php"
 *
 * One combined message per property (not two separate ones) listing every
 * guest arriving tomorrow (status still Booked, checkin_date = tomorrow) and
 * every guest departing tomorrow (status Checked In, expected_checkout =
 * tomorrow) - sent to both the Admin and Kitchen groups (kitchen needs the
 * same numbers for tomorrow's meal prep). Skipped entirely for a property
 * with neither, so a quiet day doesn't generate a noise message.
 *
 * This is the sender that php/telegram/templates.php's long-dormant
 * 'cron_upcoming_arrivals' template never got (found 28 Aug 2026 - the
 * template existed, titled and described in the Root Admin catalog, but no
 * cron ever rendered/sent it). Rather than resurrect that arrivals-only
 * template, this uses a new combined 'daily_operations_digest' template so
 * the single nightly message covers both directions in one send.
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/guest_status.php';
require_once __DIR__ . '/../telegram/sender.php';
require_once __DIR__ . '/../telegram/templates.php';

$logFile = __DIR__ . '/daily_operations_digest.log';
$timestamp = date('Y-m-d H:i:s');

function logLine(string $file, string $message): void {
    file_put_contents($file, "$message\n", FILE_APPEND);
}

logLine($logFile, "$timestamp - Daily operations digest worker started");

function formatGuestLine(array $g): string {
    return "• " . htmlspecialchars($g['guest_name']) . " (" . htmlspecialchars($g['room_name']) . ")";
}

try {
    $tomorrow = date('Y-m-d', strtotime('+1 day'));

    $properties = $pdo->query("
        SELECT id, name FROM properties
        WHERE is_active = 1 AND is_deleted = 0 AND property_type != 'MULTI_KEY_ROOM'
    ")->fetchAll(PDO::FETCH_ASSOC);

    $sentCount = 0;
    $skippedCount = 0;

    foreach ($properties as $property) {
        $propertyId = (int)$property['id'];

        $arrStmt = $pdo->prepare("
            SELECT g.id, g.guest_name, COALESCE(r.name, 'N/A') as room_name
            FROM guests g
            LEFT JOIN properties r ON g.room_id = r.id
            WHERE g.property_id = ? AND DATE(g.checkin_date) = ? AND g.status = ?
            ORDER BY g.guest_name ASC
        ");
        $arrStmt->execute([$propertyId, $tomorrow, GUEST_STATUS_BOOKED]);
        $arrivals = $arrStmt->fetchAll(PDO::FETCH_ASSOC);

        $depStmt = $pdo->prepare("
            SELECT g.id, g.guest_name, COALESCE(r.name, 'N/A') as room_name
            FROM guests g
            LEFT JOIN properties r ON g.room_id = r.id
            WHERE g.property_id = ? AND DATE(g.expected_checkout) = ? AND g.status = ?
            ORDER BY g.guest_name ASC
        ");
        $depStmt->execute([$propertyId, $tomorrow, GUEST_STATUS_CHECKED_IN]);
        $departures = $depStmt->fetchAll(PDO::FETCH_ASSOC);

        if (empty($arrivals) && empty($departures)) {
            $skippedCount++;
            continue;
        }

        $message = TelegramTemplates::render($pdo, 'daily_operations_digest', [
            'arrivals_count' => count($arrivals),
            'arrivals_list' => !empty($arrivals) ? implode("\n", array_map('formatGuestLine', $arrivals)) : '—',
            'departures_count' => count($departures),
            'departures_list' => !empty($departures) ? implode("\n", array_map('formatGuestLine', $departures)) : '—',
        ]);

        foreach (['admin', 'kitchen'] as $category) {
            $result = sendPropertyTelegramMessage($pdo, $propertyId, $category, $message, null, 'daily_operations_digest');
            $label = "property {$propertyId} ({$property['name']}) -> {$category}";
            if (is_array($result) && !empty($result['skipped'])) {
                logLine($logFile, "$timestamp - SKIPPED: $label - " . $result['reason']);
            } else {
                logLine($logFile, "$timestamp - SENT: $label (" . count($arrivals) . " arrivals, " . count($departures) . " departures)");
            }
        }
        $sentCount++;
    }

    logLine($logFile, "$timestamp - Digest worker completed ({$sentCount} property/ies sent, {$skippedCount} skipped - nothing tomorrow)");
} catch (Exception $e) {
    logLine($logFile, "$timestamp - FATAL: " . $e->getMessage());
}
