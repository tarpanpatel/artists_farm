<?php
/**
 * License Expiry Checker - Scheduled Task
 *
 * Run daily via cron job:
 * 0 8 * * * /usr/bin/php /path/to/artists_farm/php/cron/check_licenses.php
 *
 * This checks for licenses expiring in 7 days, 4 days, and 1 day
 * and sends Telegram notifications to super admins
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
