<?php
/**
 * iCal Sync Worker - Scheduled Task
 *
 * Run every 15 minutes:
 *   Linux/production cron:      /15 * * * * /usr/bin/php /path/to/artists_farm/php/cron/sync_all_icals.php
 *   Windows/XAMPP Task Scheduler: schtasks /create /sc minute /mo 15 /tn "ArtistsFarm iCal Sync" ^
 *                                   /tr "C:\xampp\php\php.exe C:\xampp\htdocs\artists_farm\php\cron\sync_all_icals.php"
 *
 * Pulls every enabled calendar sync (Airbnb/Booking.com/Google/etc, across all
 * tenants and properties) and refreshes its blocked-date events, the same work
 * the "Sync Now" button in ICalSyncManager triggers for a single sync.
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../api/ical_sync.php';

$logFile = __DIR__ . '/ical_sync.log';
$timestamp = date('Y-m-d H:i:s');

function logLine(string $file, string $message): void {
    file_put_contents($file, "$message\n", FILE_APPEND);
}

logLine($logFile, "$timestamp - iCal sync worker started");

try {
    $manager = new ICalSyncManager($pdo);

    $stmt = $pdo->query("SELECT id, property_id, service_name FROM ical_sync_configs WHERE sync_enabled = 1");
    $syncs = $stmt->fetchAll();

    if (empty($syncs)) {
        logLine($logFile, "$timestamp - No enabled syncs found");
    }

    foreach ($syncs as $sync) {
        $result = $manager->syncICalEvents($sync['id']);
        $label = "sync #{$sync['id']} ({$sync['service_name']}, property {$sync['property_id']})";

        if ($result['status'] === 'success') {
            logLine($logFile, "$timestamp - OK: $label - " . ($result['message'] ?? ''));
        } else {
            logLine($logFile, "$timestamp - ERROR: $label - " . ($result['message'] ?? 'Unknown error'));
        }
    }

    logLine($logFile, "$timestamp - iCal sync worker completed (" . count($syncs) . " sync(s) processed)");
} catch (Exception $e) {
    logLine($logFile, "$timestamp - FATAL: " . $e->getMessage());
}
