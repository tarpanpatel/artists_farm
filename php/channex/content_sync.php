<?php
/**
 * Channex Content & Mapping Provisioner
 *
 * Idempotently provisions Channex properties, room types, and rate plans
 * from local properties/rooms and persists the UUID mappings.
 */

require_once __DIR__ . '/../config/schema_cache.php';
require_once __DIR__ . '/ChannexClient.php';

function ensureChannexMappingsSchema(PDO $pdo): void {
    if (isSchemaVerified('schema_channex_mappings')) {
        return;
    }

    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS `channex_mappings` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `property_id` INT NOT NULL,
                `room_id` INT NULL,
                `channex_property_id` VARCHAR(64) NOT NULL,
                `channex_room_type_id` VARCHAR(64) NOT NULL,
                `channex_rate_plan_id` VARCHAR(64) NOT NULL,
                `sync_status` VARCHAR(32) NOT NULL DEFAULT 'active',
                `last_synced_at` DATETIME NULL,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY `uniq_prop_room` (`property_id`, `room_id`),
                INDEX `idx_channex_prop` (`channex_property_id`),
                INDEX `idx_channex_rate_plan` (`channex_rate_plan_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");
        markSchemaVerified('schema_channex_mappings');
    } catch (PDOException $e) {}
}

class ChannexContentSyncer {
    private PDO $pdo;
    private ChannexClient $client;

    public function __construct(PDO $pdo, ?ChannexClient $client = null) {
        $this->pdo = $pdo;
        $this->client = $client ?? new ChannexClient();
        ensureChannexMappingsSchema($pdo);
    }

    /**
     * Idempotently provision/map a property and its rooms.
     */
    public function syncProperty(int $propertyId): array {
        $propStmt = $this->pdo->prepare("SELECT id, name, property_type, default_tariff FROM properties WHERE id = ?");
        $propStmt->execute([$propertyId]);
        $prop = $propStmt->fetch(PDO::FETCH_ASSOC);

        if (!$prop) {
            throw new InvalidArgumentException("Property ID {$propertyId} not found");
        }

        // Determine units: if MULTI_KEY, fetch child rooms; else single whole property
        $units = [];
        if ($prop['property_type'] === 'MULTI_KEY') {
            $roomStmt = $this->pdo->prepare("SELECT id, name, default_tariff FROM properties WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM' AND is_deleted = 0 ORDER BY room_order ASC, name ASC");
            $roomStmt->execute([$propertyId]);
            $rooms = $roomStmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rooms as $r) {
                $units[] = [
                    'room_id' => (int)$r['id'],
                    'name' => $r['name'],
                    'default_tariff' => (float)($r['default_tariff'] ?: $prop['default_tariff'] ?: 2500),
                ];
            }
        }

        if (empty($units)) {
            $units[] = [
                'room_id' => null,
                'name' => $prop['name'],
                'default_tariff' => (float)($prop['default_tariff'] ?: 3500),
            ];
        }

        // Check if property mapping exists
        $mapStmt = $this->pdo->prepare("SELECT channex_property_id FROM channex_mappings WHERE property_id = ? LIMIT 1");
        $mapStmt->execute([$propertyId]);
        $channexPropertyId = $mapStmt->fetchColumn();

        if (!$channexPropertyId) {
            // Create Property in Channex (villa type per verified sandbox facts)
            $propPayload = [
                'property' => [
                    'title' => $prop['name'],
                    'property_type' => 'villa',
                    'currency' => 'INR',
                    'timezone' => 'Asia/Kolkata',
                    'country' => 'IN',
                    'city' => 'Jaipur',
                    'zip_code' => '302001',
                ]
            ];
            $res = $this->client->post('properties', $propPayload);
            if (!$res['success'] || empty($res['data']['id'])) {
                throw new RuntimeException("Failed to create Channex property: " . json_encode($res['error'] ?? 'Unknown error'));
            }
            $channexPropertyId = $res['data']['id'];
        }

        $results = [];

        foreach ($units as $unit) {
            $roomId = $unit['room_id'];
            $mapUnitStmt = $this->pdo->prepare("SELECT * FROM channex_mappings WHERE property_id = ? AND (room_id = ? OR (room_id IS NULL AND ? IS NULL))");
            $mapUnitStmt->execute([$propertyId, $roomId, $roomId]);
            $existing = $mapUnitStmt->fetch(PDO::FETCH_ASSOC);

            if ($existing && !empty($existing['channex_room_type_id']) && !empty($existing['channex_rate_plan_id'])) {
                $results[] = $existing;
                continue;
            }

            // 1. Create Room Type
            $roomPayload = [
                'room_type' => [
                    'property_id' => $channexPropertyId,
                    'title' => $unit['name'],
                    'count_of_rooms' => 1,
                    'room_kind' => 'room',
                    'capacity' => 6,
                    'occ_adults' => 6,
                    'occ_children' => 2,
                    'occ_infants' => 2,
                    'default_occupancy' => 2,
                ]
            ];
            $roomRes = $this->client->post('room_types', $roomPayload);
            if (!$roomRes['success'] || empty($roomRes['data']['id'])) {
                throw new RuntimeException("Failed to create Channex room type for '{$unit['name']}': " . json_encode($roomRes['error'] ?? 'Unknown error'));
            }
            $channexRoomTypeId = $roomRes['data']['id'];

            // 2. Create Rate Plan (rates in minor units: INR 3500 -> 350000)
            $minorRate = (int)round($unit['default_tariff'] * 100);
            $ratePayload = [
                'rate_plan' => [
                    'property_id' => $channexPropertyId,
                    'room_type_id' => $channexRoomTypeId,
                    'title' => 'Standard Rate',
                    'currency' => 'INR',
                    'sell_mode' => 'per_room',
                    'rate_mode' => 'manual',
                    'options' => [
                        [
                            'occupancy' => 2,
                            'rate' => $minorRate,
                        ]
                    ]
                ]
            ];
            $rateRes = $this->client->post('rate_plans', $ratePayload);
            if (!$rateRes['success'] || empty($rateRes['data']['id'])) {
                throw new RuntimeException("Failed to create Channex rate plan for '{$unit['name']}': " . json_encode($rateRes['error'] ?? 'Unknown error'));
            }
            $channexRatePlanId = $rateRes['data']['id'];

            // Save mapping
            $saveStmt = $this->pdo->prepare("
                INSERT INTO channex_mappings (property_id, room_id, channex_property_id, channex_room_type_id, channex_rate_plan_id, sync_status, last_synced_at)
                VALUES (?, ?, ?, ?, ?, 'active', NOW())
                ON DUPLICATE KEY UPDATE
                    channex_property_id = VALUES(channex_property_id),
                    channex_room_type_id = VALUES(channex_room_type_id),
                    channex_rate_plan_id = VALUES(channex_rate_plan_id),
                    sync_status = 'active',
                    last_synced_at = NOW()
            ");
            $saveStmt->execute([$propertyId, $roomId, $channexPropertyId, $channexRoomTypeId, $channexRatePlanId]);

            $results[] = [
                'property_id' => $propertyId,
                'room_id' => $roomId,
                'channex_property_id' => $channexPropertyId,
                'channex_room_type_id' => $channexRoomTypeId,
                'channex_rate_plan_id' => $channexRatePlanId,
            ];
        }

        return $results;
    }
}
