<?php
/**
 * License Management Module
 * Handles property licenses (homestay, FSSAI, etc.)
 * Tracks expiry dates and sends notifications
 */

function handleLicenseRequests($pdo, $request_method, $action, $propertyId) {
    require_once __DIR__ . '/../config/schema_cache.php';

    // Create tables if they don't exist
    try {
        if (!isSchemaVerified('schema_licenses')) {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `property_licenses` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `property_id` INT NOT NULL,
                    `license_type` VARCHAR(100) NOT NULL,
                    `license_name` VARCHAR(255),
                    `license_number` VARCHAR(100) NOT NULL UNIQUE,
                    `issuing_authority` VARCHAR(255),
                    `start_date` DATE NOT NULL,
                    `end_date` DATE NOT NULL,
                    `document_url` TEXT,
                    `status` ENUM('active', 'expired', 'expiring_soon', 'renewal_pending') DEFAULT 'active',
                    `notes` TEXT,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE,
                    INDEX `idx_property_expiry` (`property_id`, `end_date`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");

            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `license_expiry_notifications` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `license_id` INT NOT NULL,
                    `property_id` INT NOT NULL,
                    `days_before` INT NOT NULL,
                    `notification_sent_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    `telegram_message_id` VARCHAR(100),
                    FOREIGN KEY (`license_id`) REFERENCES `property_licenses`(`id`) ON DELETE CASCADE,
                    FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE,
                    UNIQUE KEY `unique_notification` (`license_id`, `days_before`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");
            markSchemaVerified('schema_licenses');
        }
    } catch (PDOException $e) {}

    switch ($action) {
        case 'get_licenses':
            getLicenses($pdo, $propertyId);
            break;

        case 'add_license':
            if ($request_method === 'POST') {
                addLicense($pdo, $propertyId);
            }
            break;

        case 'update_license':
            if ($request_method === 'POST') {
                updateLicense($pdo, $propertyId);
            }
            break;

        case 'delete_license':
            if ($request_method === 'POST') {
                deleteLicense($pdo, $propertyId);
            }
            break;

        case 'check_expiring_licenses':
            checkExpiringLicenses($pdo);
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid license action']);
            break;
    }
}

function getLicenses($pdo, $propertyId) {
    try {
        $stmt = $pdo->prepare("
            SELECT
                id, license_type, license_name, license_number, issuing_authority,
                start_date, end_date, status, document_url,
                DATEDIFF(end_date, CURDATE()) as days_remaining,
                notes, created_at
            FROM property_licenses
            WHERE property_id = ?
            ORDER BY end_date ASC
        ");
        $stmt->execute([$propertyId]);
        $licenses = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Calculate status for each license
        foreach ($licenses as &$license) {
            $daysRemaining = (int)$license['days_remaining'];
            if ($daysRemaining < 0) {
                $license['status'] = 'expired';
            } elseif ($daysRemaining <= 7) {
                $license['status'] = 'expiring_soon';
            } else {
                $license['status'] = 'active';
            }
        }

        echo json_encode(['status' => 'success', 'data' => $licenses]);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

function addLicense($pdo, $propertyId) {
    $input = json_decode(file_get_contents('php://input'), true);

    try {
        $stmt = $pdo->prepare("
            INSERT INTO property_licenses
            (property_id, license_type, license_name, license_number, issuing_authority, start_date, end_date, notes, document_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $propertyId,
            $input['license_type'] ?? 'other',
            $input['license_name'] ?? '',
            $input['license_number'] ?? '',
            $input['issuing_authority'] ?? '',
            $input['start_date'] ?? date('Y-m-d'),
            $input['end_date'] ?? date('Y-m-d'),
            $input['notes'] ?? '',
            $input['document_url'] ?? null
        ]);

        echo json_encode(['status' => 'success', 'message' => 'License added successfully', 'id' => $pdo->lastInsertId()]);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

function updateLicense($pdo, $propertyId) {
    $input = json_decode(file_get_contents('php://input'), true);

    try {
        $stmt = $pdo->prepare("
            UPDATE property_licenses
            SET license_type = ?, license_name = ?, license_number = ?,
                issuing_authority = ?, start_date = ?, end_date = ?, notes = ?, document_url = ?
            WHERE id = ? AND property_id = ?
        ");
        $stmt->execute([
            $input['license_type'] ?? 'other',
            $input['license_name'] ?? '',
            $input['license_number'] ?? '',
            $input['issuing_authority'] ?? '',
            $input['start_date'] ?? date('Y-m-d'),
            $input['end_date'] ?? date('Y-m-d'),
            $input['notes'] ?? '',
            $input['document_url'] ?? null,
            $input['id'],
            $propertyId
        ]);

        echo json_encode(['status' => 'success', 'message' => 'License updated successfully']);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

function deleteLicense($pdo, $propertyId) {
    $input = json_decode(file_get_contents('php://input'), true);

    try {
        $stmt = $pdo->prepare("DELETE FROM property_licenses WHERE id = ? AND property_id = ?");
        $stmt->execute([$input['id'], $propertyId]);

        echo json_encode(['status' => 'success', 'message' => 'License deleted successfully']);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

/**
 * Returns the 4 weekly Sunday reminder dates for a license expiring on
 * $endDate, keyed 1 (earliest, furthest from expiry) through 4 (the last
 * Sunday before expiry, most urgent) - "once every Sunday before the
 * expiry", 4 reminders total (changed 21 Aug 2026, replacing the old
 * fixed 7/4/1-day-before schedule). Never lands ON the expiry date itself,
 * even if that date is a Sunday - the search starts the day before it.
 */
function getLicenseReminderSundays(string $endDate): array {
    $cursor = new DateTime($endDate);
    $cursor->modify('-1 day');
    while ((int)$cursor->format('w') !== 0) { // 0 = Sunday
        $cursor->modify('-1 day');
    }
    $dates = [];
    for ($i = 4; $i >= 1; $i--) {
        $dates[$i] = $cursor->format('Y-m-d');
        $cursor->modify('-7 days');
    }
    ksort($dates);
    return $dates;
}

/**
 * Check for expiring licenses and send notifications
 * This should be called daily via cron job or scheduled task - it's safe
 * to run every day of the week: on a non-Sunday, no license's reminder
 * dates (see getLicenseReminderSundays()) will match today, so nothing
 * fires.
 */
function checkExpiringLicenses($pdo) {
    try {
        $today = date('Y-m-d');

        $stmt = $pdo->prepare("
            SELECT pl.id, pl.property_id, pl.license_type, pl.license_name,
                   pl.license_number, pl.end_date, p.name as property_name, p.slug,
                   t.email as tenant_email
            FROM property_licenses pl
            JOIN properties p ON pl.property_id = p.id
            LEFT JOIN tenants t ON p.tenant_id = t.id
            WHERE pl.end_date >= CURDATE()
            AND pl.property_id > 0
        ");
        $stmt->execute();
        $licenses = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($licenses as $license) {
            foreach (getLicenseReminderSundays($license['end_date']) as $reminderNumber => $sundayDate) {
                if ($sundayDate !== $today) continue;

                $checkStmt = $pdo->prepare("
                    SELECT 1 FROM license_expiry_notifications
                    WHERE license_id = ? AND days_before = ?
                ");
                $checkStmt->execute([$license['id'], $reminderNumber]);
                if ($checkStmt->fetchColumn()) continue;

                sendLicenseExpiryNotification($pdo, $license, $reminderNumber);
            }
        }

        echo json_encode(['status' => 'success', 'message' => 'License expiry check completed']);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

/**
 * Send one license expiry reminder via Telegram AND email.
 *
 * Telegram stays best-effort (already silently no-ops when a property has
 * no Telegram routing configured - see CLAUDE.md's "Telegram Group
 * Selection" note) and never blocks the email send. Email is the
 * reliable channel - a property's Telegram setup is optional, but the
 * tenant account email is expected to (almost) always be on file - so a
 * Telegram failure must never prevent the email from being attempted, and
 * vice versa.
 *
 * $reminderNumber is 1-4 (see getLicenseReminderSundays()) - the
 * `days_before` column in license_expiry_notifications is repurposed to
 * store this reminder ordinal rather than a literal day count, since the
 * schedule changed from fixed 7/4/1-days-before to 4 weekly Sunday
 * reminders (21 Aug 2026). The (license_id, days_before) unique key still
 * gives one row per license per reminder slot, which is all the dedupe
 * needs.
 */
function sendLicenseExpiryNotification($pdo, $license, $reminderNumber) {
    $telegramOk = false;
    $emailOk = false;

    try {
        $licenseId = $license['id'];
        $propertyId = $license['property_id'];
        $licenseType = $license['license_type'];
        $licenseName = $license['license_name'];
        $licenseNumber = $license['license_number'];
        $propertyName = $license['property_name'];
        $endDate = $license['end_date'];
        $tenantEmail = trim($license['tenant_email'] ?? '');

        $daysRemaining = (int)round((strtotime($endDate) - strtotime(date('Y-m-d'))) / 86400);
        $licenseTypeLabel = ucfirst(str_replace('_', ' ', $licenseType));
        // Reminder 4 (the last Sunday before expiry) reads as most urgent.
        $emoji = $reminderNumber >= 4 ? '🚨' : ($reminderNumber === 3 ? '⚠️' : '⏰');

        $message = "$emoji *License Expiry Reminder ($reminderNumber/4)*\n\n";
        $message .= "*Property:* $propertyName\n";
        $message .= "*License Type:* $licenseTypeLabel\n";
        $message .= "*License Name:* $licenseName\n";
        $message .= "*License Number:* `$licenseNumber`\n";
        $message .= "*Expiry Date:* `$endDate`\n";
        $message .= "*Days Remaining:* *$daysRemaining days*\n\n";
        $message .= "Please renew the license before expiry.";

        try {
            if (file_exists(__DIR__ . '/../telegram/telegram.php')) {
                require_once __DIR__ . '/../telegram/telegram.php';
            }
            sendPropertyTelegramMessage($pdo, $propertyId, 'admin', $message, null, 'license_expiry_alert');
            $telegramOk = true;
        } catch (Throwable $eTg) {
            error_log("License Telegram notification failed for license {$licenseId}: " . $eTg->getMessage());
        }

        if ($tenantEmail !== '') {
            try {
                require_once __DIR__ . '/../utils/mailer.php';
                $subject = "$emoji License Expiry Reminder ($reminderNumber/4): $licenseName";
                $body = "<p>$emoji <b>License Expiry Reminder ($reminderNumber of 4)</b></p>"
                    . "<p><b>Property:</b> " . htmlspecialchars($propertyName) . "<br>"
                    . "<b>License Type:</b> " . htmlspecialchars($licenseTypeLabel) . "<br>"
                    . "<b>License Name:</b> " . htmlspecialchars($licenseName) . "<br>"
                    . "<b>License Number:</b> " . htmlspecialchars($licenseNumber) . "<br>"
                    . "<b>Expiry Date:</b> " . htmlspecialchars($endDate) . "<br>"
                    . "<b>Days Remaining:</b> {$daysRemaining} days</p>"
                    . "<p>Please renew this license before it expires.</p>";
                $emailResult = sendSmtpEmail($pdo, $tenantEmail, $subject, $body);
                $emailOk = $emailResult['success'];
                if (!$emailOk) {
                    error_log("License email notification failed for license {$licenseId}: " . $emailResult['error']);
                }
            } catch (Throwable $eMail) {
                error_log("License email notification exception for license {$licenseId}: " . $eMail->getMessage());
            }
        }

        // Record notification sent as long as at least one channel was
        // attempted successfully (or attemptable) - keeps the dedupe from
        // silently blocking a real retry attempt while still guaranteeing
        // we never double-send once either channel has gone out.
        if ($telegramOk || $emailOk || $tenantEmail === '') {
            $stmt = $pdo->prepare("
                INSERT INTO license_expiry_notifications
                (license_id, property_id, days_before)
                VALUES (?, ?, ?)
            ");
            $stmt->execute([$licenseId, $propertyId, $reminderNumber]);
        }

    } catch (Throwable $e) {
        error_log("License notification failed: " . $e->getMessage());
    }
}
