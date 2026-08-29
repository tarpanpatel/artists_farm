<?php
/**
 * Transactional Outbox for Channel Manager Integration
 *
 * Provides atomic change capture for availability and rate events.
 * Enqueueing occurs inside the same database transaction as the business change
 * (booking creation/update/cancellation, rate rule modifications).
 */

require_once __DIR__ . '/../config/schema_cache.php';

function ensureChannexOutboxSchema(PDO $pdo): void {
    if (isSchemaVerified('schema_channex_outbox')) {
        return;
    }

    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS `channex_outbox` (
                `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
                `property_id` INT NOT NULL,
                `room_id` INT NULL,
                `kind` ENUM('availability', 'rates') NOT NULL,
                `date_from` DATE NOT NULL,
                `date_to` DATE NOT NULL,
                `payload` JSON NULL,
                `status` ENUM('pending', 'sending', 'done', 'failed') NOT NULL DEFAULT 'pending',
                `attempts` INT NOT NULL DEFAULT 0,
                `next_attempt_at` DATETIME NULL,
                `last_error` TEXT NULL,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX `idx_outbox_claim` (`status`, `next_attempt_at`),
                INDEX `idx_outbox_scope` (`property_id`, `room_id`, `kind`, `date_from`, `date_to`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");
        markSchemaVerified('schema_channex_outbox');
    } catch (PDOException $e) {
        // Table or index may already exist
    }
}

function enqueueOutboxItem(
    PDO $pdo,
    int $propertyId,
    ?int $roomId,
    string $kind,
    string $dateFrom,
    string $dateTo,
    ?array $payload = null
): bool {
    ensureChannexOutboxSchema($pdo);

    if ($propertyId <= 0 || !in_array($kind, ['availability', 'rates'], true)) {
        return false;
    }

    // Sanitize and ensure date_from <= date_to
    $dFrom = substr($dateFrom, 0, 10);
    $dTo = substr($dateTo, 0, 10);
    if ($dFrom > $dTo) {
        $tmp = $dFrom;
        $dFrom = $dTo;
        $dTo = $tmp;
    }

    try {
        $stmt = $pdo->prepare("
            INSERT INTO channex_outbox (property_id, room_id, kind, date_from, date_to, payload, status)
            VALUES (?, ?, ?, ?, ?, ?, 'pending')
        ");
        $jsonPayload = $payload !== null ? json_encode($payload, JSON_UNESCAPED_SLASHES) : null;
        $stmt->execute([$propertyId, $roomId, $kind, $dFrom, $dTo, $jsonPayload]);
        return true;
    } catch (Exception $e) {
        if (class_exists('TelescopeLogger')) {
            TelescopeLogger::log('channel_manager', 'Outbox Enqueue Error', $e->getMessage(), 'Failed to insert outbox row', [
                'property_id' => $propertyId,
                'room_id' => $roomId,
                'kind' => $kind,
                'date_from' => $dFrom,
                'date_to' => $dTo,
            ]);
        }
        return false;
    }
}
