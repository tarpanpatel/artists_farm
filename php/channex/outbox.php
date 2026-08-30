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
    // CREATE/ALTER TABLE implicitly commits any open transaction in MySQL.
    // enqueueOutboxItem() runs inside the caller's own booking transaction
    // (add/update/delete guest in guests.php) - if the schema cache goes
    // cold (hourly TTL, schema_cache.php) mid-transaction, running DDL here
    // silently ends that transaction early, so the caller's own later
    // commit() throws "There is no active transaction" and the API reports
    // the booking as failed even though the guest row + outbox row were
    // already durably committed. Confirmed live 31 Aug 2026 on staging: a
    // real booking (guest id 696) succeeded and enqueued its outbox row
    // (id 36), but the response was `{"status":"error","message":"Failed to
    // register guest: There is no active transaction"}` - exactly this bug.
    // Defer the self-heal to the next call made outside a transaction; the
    // table/column already exist in every real deployment, this only ever
    // matters on a genuinely fresh install (which never calls this from
    // inside a transaction in the first place - a cold DB has no guests to
    // book yet).
    if ($pdo->inTransaction()) {
        return;
    }

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
                `task_id` VARCHAR(64) NULL,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX `idx_outbox_claim` (`status`, `next_attempt_at`),
                INDEX `idx_outbox_scope` (`property_id`, `room_id`, `kind`, `date_from`, `date_to`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");
        markSchemaVerified('schema_channex_outbox');
    } catch (PDOException $e) {
        // Table or index may already exist
    }

    // task_id is the async task Channex returns from an ARI push. It is the only
    // way to find out whether the update actually applied (GET /tasks/{id}), and
    // the certification reviewers look these ids up in their own logs for
    // scenarios 1-6 - a push whose task id was thrown away cannot be evidenced.
    // Separate self-heal key so an installation that already created the table
    // above still picks the column up.
    if (!isSchemaVerified('schema_channex_outbox_task_id')) {
        try {
            $pdo->exec("ALTER TABLE `channex_outbox` ADD COLUMN IF NOT EXISTS `task_id` VARCHAR(64) NULL");
        } catch (PDOException $e) {}
        markSchemaVerified('schema_channex_outbox_task_id');
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
