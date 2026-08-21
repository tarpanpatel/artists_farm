<?php
/**
 * License Expiry Checker - Scheduled Task
 *
 * Run daily via cron job:
 * 0 8 * * * /usr/bin/php /path/to/artists_farm/php/cron/check_licenses.php
 *
 * Sends a reminder on each of the 4 Sundays before a license's expiry date
 * (see getLicenseReminderSundays() in php/licenses/licenses.php) - via
 * Telegram (best-effort, may not be configured for every property) AND
 * email (the reliable channel, sent to the tenant's account email).
 * Must still run daily even though reminders only land on Sundays - the
 * check itself is a no-op on any other day.
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../licenses/licenses.php';

// Log start time
$logFile = __DIR__ . '/license_checker.log';
$timestamp = date('Y-m-d H:i:s');
file_put_contents($logFile, "$timestamp - License checker started\n", FILE_APPEND);

try {
    // Run the license expiry check
    checkExpiringLicenses($pdo);
    file_put_contents($logFile, "$timestamp - License checker completed successfully\n", FILE_APPEND);
} catch (Exception $e) {
    file_put_contents($logFile, "$timestamp - ERROR: " . $e->getMessage() . "\n", FILE_APPEND);
}
