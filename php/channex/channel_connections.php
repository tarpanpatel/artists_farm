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

/**
 * Park a connection at 'ready_to_activate' WITHOUT ever demoting one that is
 * already live.
 *
 * Added 12 Sep 2026 after Patel Colony's Airbnb connection showed "Ready to
 * activate" in the UI while Channex reported `is_active: true` for the same
 * channel. Three routine post-go-live actions each wrote 'ready_to_activate'
 * unconditionally - an Airbnb re-import, a room-mapping save, and a rate-plan
 * update on an existing channel - so any owner who went live and later came
 * back to add a listing or adjust mappings silently demoted their own live
 * channel's status.
 *
 * The damage is not cosmetic: sync_audit.php joins on `status = 'active'`, so
 * a demoted row drops out of the audit that is meant to catch sync problems on
 * a live channel, and the UI invites the owner into Go Live - a wide ARI push -
 * on a channel that is already syncing.
 *
 * Creating a brand-new channel is the one case that SHOULD land here, and it
 * does: there is no prior row to preserve, so this behaves exactly as the
 * plain upsert did.
 */
function parkChannexConnectionForActivation(PDO $pdo, int $propertyId, string $channelCode, array $extraFields = []): int {
    $existing = getChannexChannelConnection($pdo, $propertyId, $channelCode);
    $fields = $extraFields + ['last_error' => null];
    // Anything already live stays live. Only a connection that is not yet
    // active gets parked.
    $fields['status'] = (($existing['status'] ?? '') === 'active') ? 'active' : 'ready_to_activate';
    return upsertChannexChannelConnection($pdo, $propertyId, $channelCode, $fields);
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

/**
 * Which OTA listings are ALREADY claimed by a property, across the whole tenant.
 *
 * Added 9 Sep 2026. One listing must never be mapped into two Ground Code properties: both would
 * then believe they own that calendar and push conflicting availability and rates to the same
 * Airbnb listing, which is a double-booking generator rather than a tidiness problem. The
 * importer greys those listings out instead of letting a second property take them.
 *
 * `external_room_code` is the Airbnb listing id (see ota_provisioner.php, which writes the
 * listing id into that column). Scoped to ONE tenant deliberately - a listing id is only
 * meaningful within the Airbnb account it came from, and a cross-tenant lookup would leak the
 * existence of another tenant's properties.
 *
 * Excludes $excludePropertyId so a property re-running its own import still sees its own
 * listings as available rather than blocked by itself.
 *
 * MUST be filtered by $channelCode. `external_room_code` is namespaced PER CHANNEL - it holds an
 * Airbnb listing id on an Airbnb connection and a Booking.com room code on a Booking.com one, and
 * the two are unrelated integer spaces. Querying across every channel at once compares codes that
 * merely look alike: on this account's own data an unfiltered query returned 8 "claims" for 7
 * rooms, because Patel Colony's Booking.com room codes were being counted as Airbnb listing ids
 * alongside the real ones. A collision there would block a genuinely free listing with a
 * confusing message about a property that never had it (found and fixed 9 Sep 2026).
 *
 * @return array listing id => ['property_id' => int, 'property_name' => string, 'room_name' => ?string]
 */
function getClaimedChannexListings(PDO $pdo, int $tenantId, ?int $excludePropertyId = null, string $channelCode = 'AirBNB'): array {
    ensureChannexChannelConnectionsSchema($pdo);
    $sql = "
        SELECT m.external_room_code,
               c.property_id,
               p.name  AS property_name,
               r.name  AS room_name
        FROM channex_channel_room_mappings m
        JOIN channex_channel_connections c ON c.id = m.connection_id
        JOIN properties p ON p.id = c.property_id AND p.is_deleted = 0
        LEFT JOIN properties r ON r.id = m.local_room_id
        WHERE p.tenant_id = ? AND c.channel_code = ?
    ";
    $params = [$tenantId, $channelCode];
    if ($excludePropertyId !== null) {
        $sql .= " AND c.property_id <> ?";
        $params[] = $excludePropertyId;
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $claimed = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $code = (string) $row['external_room_code'];
        if ($code === '') continue;
        // First claim wins - if the same listing somehow appears twice, naming one owner is
        // more useful to the person reading it than an arbitrary last-write.
        if (isset($claimed[$code])) continue;
        $claimed[$code] = [
            'property_id'   => (int) $row['property_id'],
            'property_name' => (string) $row['property_name'],
            'room_name'     => $row['room_name'] !== null ? (string) $row['room_name'] : null,
        ];
    }
    return $claimed;
}

function getChannexChannelRoomMappings(PDO $pdo, int $connectionId): array {
    ensureChannexChannelConnectionsSchema($pdo);
    $stmt = $pdo->prepare("SELECT * FROM channex_channel_room_mappings WHERE connection_id = ?");
    $stmt->execute([$connectionId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}
