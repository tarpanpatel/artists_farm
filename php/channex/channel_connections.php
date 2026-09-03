<?php
/**
 * Channex Channel Connections
 *
 * Self-serve OTA channel-connection state, separate from channex_mappings
 * (which is CONTENT sync - one row per property/room's Channex property/
 * room-type/rate-plan UUIDs, channel-agnostic). A channel connection is a
 * different concept: its own Channex channel UUID, its own active/inactive
 * state, and its own per-OTA room/rate code mapping - a Booking.com room
 * code and an Expedia room code for the same physical room are unrelated
 * integers, so they can't live on the content-sync row.
 */

require_once __DIR__ . '/../config/schema_cache.php';

function ensureChannexChannelConnectionsSchema(PDO $pdo): void {
    if ($pdo->inTransaction()) {
        // Same reasoning as ensureChannexOutboxSchema() - DDL implicitly
        // commits any open transaction, so defer to a call outside one.
        return;
    }

    if (!isSchemaVerified('schema_channex_channel_connections')) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `channex_channel_connections` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `property_id` INT NOT NULL,
                    `channel_code` VARCHAR(64) NOT NULL,
                    `channex_channel_id` VARCHAR(64) NULL,
                    `channex_group_id` VARCHAR(64) NULL,
                    `status` ENUM('draft','awaiting_prerequisite','pending_test','mapping',
                                  'ready_to_activate','active','staff_action_required',
                                  'inactive','error') NOT NULL DEFAULT 'draft',
                    `settings` JSON NULL,
                    `last_error` TEXT NULL,
                    `created_by_user_id` INT NULL,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY `uniq_prop_channel` (`property_id`, `channel_code`),
                    INDEX `idx_channel_status` (`status`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");
            markSchemaVerified('schema_channex_channel_connections');
        } catch (PDOException $e) {}
    }

    if (!isSchemaVerified('schema_channex_channel_room_mappings')) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `channex_channel_room_mappings` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `connection_id` INT NOT NULL,
                    `local_room_id` INT NULL,
                    `channex_rate_plan_id` VARCHAR(64) NOT NULL,
                    `external_room_code` VARCHAR(64) NOT NULL,
                    `external_rate_code` VARCHAR(64) NOT NULL,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY `uniq_connection_room` (`connection_id`, `local_room_id`),
                    INDEX `idx_room_mapping_connection` (`connection_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");
            markSchemaVerified('schema_channex_channel_room_mappings');
        } catch (PDOException $e) {}
    }
}

/** NULL-safe (local_room_id can be NULL for a SINGLE property) lookup of one connection. */
function getChannexChannelConnection(PDO $pdo, int $propertyId, string $channelCode): ?array {
    ensureChannexChannelConnectionsSchema($pdo);
    $stmt = $pdo->prepare("SELECT * FROM channex_channel_connections WHERE property_id = ? AND channel_code = ? LIMIT 1");
    $stmt->execute([$propertyId, $channelCode]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function listChannexChannelConnections(PDO $pdo, int $propertyId): array {
    ensureChannexChannelConnectionsSchema($pdo);
    $stmt = $pdo->prepare("SELECT * FROM channex_channel_connections WHERE property_id = ? ORDER BY created_at DESC");
    $stmt->execute([$propertyId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/** Cross-property, for the admin "pending staff action" queue in ChannelManager.tsx. */
function listChannexChannelConnectionsByStatus(PDO $pdo, string $status): array {
    ensureChannexChannelConnectionsSchema($pdo);
    $stmt = $pdo->prepare("
        SELECT c.*, p.name AS property_name, p.slug AS property_slug
        FROM channex_channel_connections c
        JOIN properties p ON p.id = c.property_id
        WHERE c.status = ?
        ORDER BY c.updated_at DESC
    ");
    $stmt->execute([$status]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function upsertChannexChannelConnection(PDO $pdo, int $propertyId, string $channelCode, array $fields): int {
    ensureChannexChannelConnectionsSchema($pdo);
    $existing = getChannexChannelConnection($pdo, $propertyId, $channelCode);

    $allowed = ['channex_channel_id', 'channex_group_id', 'status', 'settings', 'last_error', 'created_by_user_id'];
    $data = array_intersect_key($fields, array_flip($allowed));
    if (array_key_exists('settings', $data) && $data['settings'] !== null && !is_string($data['settings'])) {
        $data['settings'] = json_encode($data['settings'], JSON_UNESCAPED_SLASHES);
    }

    if ($existing) {
        if (empty($data)) return (int)$existing['id'];
        $setSql = implode(', ', array_map(fn($k) => "`$k` = ?", array_keys($data)));
        $stmt = $pdo->prepare("UPDATE channex_channel_connections SET $setSql WHERE id = ?");
        $stmt->execute([...array_values($data), $existing['id']]);
        return (int)$existing['id'];
    }

    $data['property_id'] = $propertyId;
    $data['channel_code'] = $channelCode;
    $cols = array_keys($data);
    $placeholders = implode(', ', array_fill(0, count($cols), '?'));
    $colSql = implode(', ', array_map(fn($k) => "`$k`", $cols));
    $stmt = $pdo->prepare("INSERT INTO channex_channel_connections ($colSql) VALUES ($placeholders)");
    $stmt->execute(array_values($data));
    return (int)$pdo->lastInsertId();
}

function saveChannexChannelRoomMappings(PDO $pdo, int $connectionId, array $rows): void {
    ensureChannexChannelConnectionsSchema($pdo);
    // Replace wholesale - a re-submitted mapping step is the common case
    // (fixing one wrong room) and there's no meaningful "partial" state to
    // preserve here, unlike the outbox's append-only event log.
    $pdo->prepare("DELETE FROM channex_channel_room_mappings WHERE connection_id = ?")->execute([$connectionId]);

    $stmt = $pdo->prepare("
        INSERT INTO channex_channel_room_mappings
            (connection_id, local_room_id, channex_rate_plan_id, external_room_code, external_rate_code)
        VALUES (?, ?, ?, ?, ?)
    ");
    foreach ($rows as $r) {
        $stmt->execute([
            $connectionId,
            $r['local_room_id'] ?? null,
            (string)$r['channex_rate_plan_id'],
            (string)$r['external_room_code'],
            (string)$r['external_rate_code'],
        ]);
    }
}

function getChannexChannelRoomMappings(PDO $pdo, int $connectionId): array {
    ensureChannexChannelConnectionsSchema($pdo);
    $stmt = $pdo->prepare("SELECT * FROM channex_channel_room_mappings WHERE connection_id = ?");
    $stmt->execute([$connectionId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}
