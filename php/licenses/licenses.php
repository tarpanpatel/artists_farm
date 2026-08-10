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
                start_date, end_date, status,
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
            (property_id, license_type, license_name, license_number, issuing_authority, start_date, end_date, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $propertyId,
            $input['license_type'] ?? 'other',
            $input['license_name'] ?? '',
            $input['license_number'] ?? '',
            $input['issuing_authority'] ?? '',
            $input['start_date'] ?? date('Y-m-d'),
            $input['end_date'] ?? date('Y-m-d'),
            $input['notes'] ?? ''
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
                issuing_authority = ?, start_date = ?, end_date = ?, notes = ?
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
 * Check for expiring licenses and send notifications
 * This should be called daily via cron job or scheduled task
 */
function checkExpiringLicenses($pdo) {
    try {
        $today = date('Y-m-d');
        $expiryDates = [
            7 => date('Y-m-d', strtotime('+7 days')),
            4 => date('Y-m-d', strtotime('+4 days')),
            1 => date('Y-m-d', strtotime('+1 day'))
        ];

        foreach ($expiryDates as $daysBeforeExpiry => $checkDate) {
            // Find licenses expiring on this date
            $stmt = $pdo->prepare("
                SELECT pl.id, pl.property_id, pl.license_type, pl.license_name,
                       pl.license_number, pl.end_date, p.name as property_name, p.slug
                FROM property_licenses pl
                JOIN properties p ON pl.property_id = p.id
                WHERE DATE(pl.end_date) = ?
                AND pl.property_id > 0
                AND NOT EXISTS (
                    SELECT 1 FROM license_expiry_notifications
                    WHERE license_id = pl.id AND days_before = ?
                )
            ");
            $stmt->execute([$checkDate, $daysBeforeExpiry]);
            $expiringLicenses = $stmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($expiringLicenses as $license) {
                sendLicenseExpiryNotification($pdo, $license, $daysBeforeExpiry);
            }
        }

        echo json_encode(['status' => 'success', 'message' => 'License expiry check completed']);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

/**
 * Send license expiry notification via Telegram
 */
function sendLicenseExpiryNotification($pdo, $license, $daysBeforeExpiry) {
    try {
        require_once __DIR__ . '/../telegram/telegram.php';

        $licenseId = $license['id'];
        $propertyId = $license['property_id'];
        $licenseType = $license['license_type'];
        $licenseName = $license['license_name'];
        $licenseNumber = $license['license_number'];
        $propertyName = $license['property_name'];
        $propertySlug = $license['slug'];
        $endDate = $license['end_date'];

        // Build notification message
        $emoji = ($daysBeforeExpiry == 7) ? '⏰' : (($daysBeforeExpiry == 4) ? '⚠️' : '🚨');
        $message = "$emoji *License Expiry Alert*\n\n";
        $message .= "*Property:* $propertyName\n";
        $message .= "*License Type:* " . ucfirst(str_replace('_', ' ', $licenseType)) . "\n";
        $message .= "*License Name:* $licenseName\n";
        $message .= "*License Number:* `$licenseNumber`\n";
        $message .= "*Expiry Date:* `$endDate`\n";
        $message .= "*Days Remaining:* *$daysBeforeExpiry days*\n\n";
        $message .= "Please renew the license before expiry.";

        // Send to super admin via Telegram
        sendPropertyTelegramMessage(
            $pdo,
            $propertyId,
            'admin',
            $message,
            null,
            'license_expiry_alert'
        );

        // Record notification sent
        $stmt = $pdo->prepare("
            INSERT INTO license_expiry_notifications
            (license_id, property_id, days_before)
            VALUES (?, ?, ?)
        ");
        $stmt->execute([$licenseId, $propertyId, $daysBeforeExpiry]);

    } catch (Exception $e) {
        error_log("License notification failed: " . $e->getMessage());
    }
}
