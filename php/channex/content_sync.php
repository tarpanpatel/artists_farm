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
    // No early return on the table marker any more: the sell_mode heal below has
    // to run on environments where the table was created long before that column
    // existed, which is every environment that has ever synced content.
    if (!isSchemaVerified('schema_channex_mappings')) {
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

    // Records what sell_mode the Channex rate plan actually declares (6 Sep 2026).
    //
    // AriDrainWorker must not send a per-occupancy `rates` array to a plan that is
    // still per_room - Channex rejects it, so every rate push for that property
    // fails until the plan is switched. Deriving "should this be per-person?" from
    // the property's own extra_guest_charge (which is what the first version did)
    // gets that backwards: it turns the array on the moment an owner types a
    // charge, while the remote plan is still per_room.
    //
    // The remote plan is the only authority on how it must be addressed, so the
    // answer is stored here when content sync creates or updates it, and read back
    // by the worker rather than guessed.
    if (!isSchemaVerified('schema_channex_mappings_sell_mode')) {
        try {
            $cols = $pdo->query("SHOW COLUMNS FROM channex_mappings")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('sell_mode', $cols)) {
                $pdo->exec("ALTER TABLE channex_mappings ADD COLUMN `sell_mode` VARCHAR(16) NOT NULL DEFAULT 'per_room'");
            }
        } catch (Exception $e) {}
        markSchemaVerified('schema_channex_mappings_sell_mode');
    }
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
        $propStmt = $this->pdo->prepare("SELECT id, name, property_type, default_tariff, currency FROM properties WHERE id = ?");
        $propStmt->execute([$propertyId]);
        $prop = $propStmt->fetch(PDO::FETCH_ASSOC);

        if (!$prop) {
            throw new InvalidArgumentException("Property ID {$propertyId} not found");
        }

        // The property's own currency, not a hardcoded INR - a rate plan created
        // in the wrong currency prices every listing wrong on the OTA.
        $currency = strtoupper(trim((string)($prop['currency'] ?? ''))) ?: 'INR';

        // Determine units: if MULTI_KEY, fetch child rooms; else single whole property
        $units = [];
        if ($prop['property_type'] === 'MULTI_KEY') {
            $roomStmt = $this->pdo->prepare("SELECT id, name, default_tariff, max_capacity FROM properties WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM' AND is_deleted = 0 ORDER BY room_order ASC, name ASC");
            $roomStmt->execute([$propertyId]);
            $rooms = $roomStmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rooms as $r) {
                $units[] = [
                    'room_id' => (int)$r['id'],
                    'name' => $r['name'],
                    // Deliberately NO placeholder fallback (e.g. the 2500 this used
                    // to silently substitute) - see the single-unit branch below for
                    // why a fabricated number here is never safe.
                    'default_tariff' => (float)($r['default_tariff'] ?: $prop['default_tariff'] ?: 0),
                    // Falls back to the parent property's capacity, then to 2 - a
                    // conservative default, unlike the 6 this used to hardcode.
                    // Under-stating capacity loses a booking; over-stating it
                    // produces one the room cannot physically hold.
                    'max_capacity' => (int)($r['max_capacity'] ?: $prop['max_capacity'] ?: 0),
                ];
            }
        }

        if (empty($units)) {
            $units[] = [
                'room_id' => null,
                'name' => $prop['name'],
                // No placeholder fallback here either (this used to be `?: 3500`) -
                // found 11 Sep 2026, live: a property imported from Airbnb before
                // its base price was set got a Channex rate plan created with that
                // 3500 placeholder, which was then bound directly to the live
                // Airbnb listing via createChannelMapping() in ota_provisioner.php
                // - contradicting this integration's own "import must never push"
                // rule, since that mapping call visibly changed the price shown on
                // Airbnb despite the channel connection sitting at
                // 'ready_to_activate' the entire time. "Never push" had only ever
                // been enforced at the ARI-drain/activate boundary; this specific
                // one-time content-creation-and-mapping step fell outside that
                // gate entirely. See the guard right below, which is the actual
                // fix - it stops a rate plan with a fabricated price from ever
                // being created (and therefore ever being mappable to a real OTA
                // listing) in the first place, rather than trying to pick a
                // "safer" placeholder number - there is no number that's safe to
                // show a real guest as this property's real price.
                'default_tariff' => (float)($prop['default_tariff'] ?: 0),
                'max_capacity' => (int)($prop['max_capacity'] ?: 0),
            ];
        }

        // Check if property mapping exists
        $mapStmt = $this->pdo->prepare("SELECT channex_property_id FROM channex_mappings WHERE property_id = ? LIMIT 1");
        $mapStmt->execute([$propertyId]);
        $channexPropertyId = $mapStmt->fetchColumn();

        if (!$channexPropertyId) {
            // Check if matching property already exists on Channex (idempotency check)
            $remoteProps = $this->client->get('properties', ['limit' => 100]);
            if (!empty($remoteProps['data'])) {
                foreach ($remoteProps['data'] as $rp) {
                    $rpTitle = $rp['attributes']['title'] ?? '';
                    if (strcasecmp($rpTitle, $prop['name']) === 0) {
                        $channexPropertyId = $rp['id'];
                        break;
                    }
                }
            }

            if (!$channexPropertyId) {
                // Create Property in Channex (villa type per verified sandbox facts)
                $propPayload = [
                    'property' => [
                        'title' => $prop['name'],
                        'property_type' => 'villa',
                        'currency' => $currency,
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

            // 1. Resolve or Create Room Type
            $channexRoomTypeId = null;
            $remoteRooms = $this->client->get('room_types', ['filter[property_id]' => $channexPropertyId]);
            if (!empty($remoteRooms['data'])) {
                foreach ($remoteRooms['data'] as $rr) {
                    if (strcasecmp($rr['attributes']['title'] ?? '', $unit['name']) === 0) {
                        $channexRoomTypeId = $rr['id'];
                        break;
                    }
                }
            }

            if (!$channexRoomTypeId) {
                $unitCapacity = max(1, (int)($unit['max_capacity'] ?? 0) ?: 2);
                $roomPayload = [
                    'room_type' => [
                        'property_id' => $channexPropertyId,
                        'title' => $unit['name'],
                        'count_of_rooms' => 1,
                        'room_kind' => 'room',
                        // Real capacity, not a hardcoded 6 (fixed 5 Sep 2026).
                        // This block used to send capacity/occ_adults = 6 for
                        // EVERY room type, so a two-person studio was advertised
                        // to every OTA as sleeping six - a booking the property
                        // cannot honour. Falls back to 2 when nobody has set a
                        // capacity yet, because understating loses a booking
                        // while overstating creates one that cannot be housed.
                        //
                        // default_occupancy must be <= occ_adults per the Channex
                        // API, so it is clamped rather than assumed.
                        'capacity' => $unitCapacity,
                        'occ_adults' => $unitCapacity,
                        'occ_children' => 2,
                        'occ_infants' => 2,
                        'default_occupancy' => min(2, $unitCapacity),
                    ]
                ];
                $roomRes = $this->client->post('room_types', $roomPayload);
                if (!$roomRes['success'] || empty($roomRes['data']['id'])) {
                    throw new RuntimeException("Failed to create Channex room type for '{$unit['name']}': " . json_encode($roomRes['error'] ?? 'Unknown error'));
                }
                $channexRoomTypeId = $roomRes['data']['id'];
            }

            // Refuse to create (or update) a rate plan with no real price behind
            // it (found 11 Sep 2026 - see the removed `?: 3500`/`?: 2500`
            // fallbacks above for the incident this closes). The room type
            // itself is harmless to create with no price attached, but a rate
            // plan is not: ota_provisioner.php's createChannelMapping() call
            // binds whatever rate plan content_sync just created directly to a
            // live OTA listing, and that binding is what actually changes the
            // price a guest sees - the channel's own 'ready_to_activate' /
            // 'active' status never gated this at all. Saving a 'pending_price'
            // mapping (rate plan id left blank) instead of a fabricated number
            // means ota_provisioner.php's `if ($ratePlanId)` guard around
            // createChannelMapping() naturally skips mapping this unit until a
            // real price exists - no downstream change needed for that part.
            if ($unit['default_tariff'] <= 0) {
                $checkStmt = $this->pdo->prepare("
                    SELECT id FROM channex_mappings
                    WHERE property_id = ? AND (room_id = ? OR (room_id IS NULL AND ? IS NULL))
                    LIMIT 1
                ");
                $checkStmt->execute([$propertyId, $roomId, $roomId]);
                $existingMappingId = $checkStmt->fetchColumn();

                if ($existingMappingId) {
                    $this->pdo->prepare("
                        UPDATE channex_mappings
                        SET channex_property_id = ?, channex_room_type_id = ?, sync_status = 'pending_price'
                        WHERE id = ?
                    ")->execute([$channexPropertyId, $channexRoomTypeId, $existingMappingId]);
                } else {
                    $this->pdo->prepare("
                        INSERT INTO channex_mappings (property_id, room_id, channex_property_id, channex_room_type_id, channex_rate_plan_id, sell_mode, sync_status, last_synced_at)
                        VALUES (?, ?, ?, ?, '', 'per_room', 'pending_price', NOW())
                    ")->execute([$propertyId, $roomId, $channexPropertyId, $channexRoomTypeId]);
                }

                $results[] = [
                    'property_id' => $propertyId,
                    'room_id' => $roomId,
                    'channex_property_id' => $channexPropertyId,
                    'channex_room_type_id' => $channexRoomTypeId,
                    'channex_rate_plan_id' => null,
                    'pending_price' => true,
                ];
                continue;
            }

            // 2. Create Rate Plan.
            //
            // Rates are MAJOR units ("2400.00"), not minor. This used to send
            // default_tariff * 100, which would have listed every room at 100x
            // its real nightly rate. Confirmed two ways: reading a working rate
            // plan back from Channex returns "2400.00", and the ARI drain worker
            // - the path that already pushes rates successfully - sends a plain
            // float. Same major/minor confusion the inbound booking receiver had.
            //
            // is_primary is required on every option and was missing, which is
            // what Channex was actually rejecting: "invalid option, rate and
            // is_primary is required fields".
            $nightlyRate = round((float)$unit['default_tariff'], 2);

            // Occupancy pricing (6 Sep 2026). A property that charges per extra
            // guest needs a sell_mode:"per_person" plan with one option per
            // bookable occupancy - Channex rejects the per-occupancy `rates` array
            // the ARI worker sends if the plan is per_room, and a per_room plan
            // would sell every occupancy at the two-person price anyway.
            //
            // Opt-in per property: no extra-guest charge (or no room above the
            // included count) keeps the per_room plan this has always created.
            require_once __DIR__ . '/../rates/occupancy_pricing.php';
            $ppCfg = getOccupancyPricingConfig($this->pdo, $roomId ?: $propertyId);
            $ppIncluded = max(1, (int)$ppCfg['included_occupancy']);
            $ppCapacity = (int)$ppCfg['max_capacity'];
            $usePerPerson = ((float)$ppCfg['extra_guest_charge'] > 0 && $ppCapacity > $ppIncluded);

            if ($usePerPerson) {
                $options = [];
                for ($occ = 1; $occ <= $ppCapacity; $occ++) {
                    $extra = max(0, $occ - $ppIncluded);
                    $options[] = [
                        'occupancy' => $occ,
                        // The primary option is the occupancy the headline rate is
                        // quoted for - the included count, not always 1 or 2.
                        'is_primary' => ($occ === $ppIncluded),
                        'rate' => number_format($nightlyRate + ($extra * (float)$ppCfg['extra_guest_charge']), 2, '.', ''),
                    ];
                }
            } else {
                $options = [[
                    'occupancy' => 2,
                    'is_primary' => true,
                    'rate' => number_format($nightlyRate, 2, '.', ''),
                ]];
            }

            $ratePayload = [
                'rate_plan' => [
                    'property_id' => $channexPropertyId,
                    'room_type_id' => $channexRoomTypeId,
                    'title' => 'Standard Rate',
                    'currency' => $currency,
                    'sell_mode' => $usePerPerson ? 'per_person' : 'per_room',
                    'rate_mode' => 'manual',
                    'options' => $options,
                ]
            ];
            $channexRatePlanId = null;
            $existingSellMode = null;
            $remoteRates = $this->client->get('rate_plans', ['filter[property_id]' => $channexPropertyId]);
            if (!empty($remoteRates['data'])) {
                foreach ($remoteRates['data'] as $rp) {
                    $rpRoomTypeId = $rp['relationships']['room_type']['data']['id'] ?? ($rp['attributes']['room_type_id'] ?? '');
                    if ($rpRoomTypeId === $channexRoomTypeId) {
                        $channexRatePlanId = $rp['id'];
                        $existingSellMode = $rp['attributes']['sell_mode'] ?? null;
                        break;
                    }
                }
            }

            if (!$channexRatePlanId) {
                $rateRes = $this->client->post('rate_plans', $ratePayload);
                if (!$rateRes['success'] || empty($rateRes['data']['id'])) {
                    throw new RuntimeException("Failed to create Channex rate plan for '{$unit['name']}': " . json_encode($rateRes['error'] ?? 'Unknown error'));
                }
                $channexRatePlanId = $rateRes['data']['id'];
            } elseif ($existingSellMode !== null && $existingSellMode !== $ratePayload['rate_plan']['sell_mode']) {
                // An already-existing plan is matched by room type and reused, and
                // until now was never updated - the same gap that left every room
                // type stuck on a hardcoded capacity of 6 for months. Without this
                // PUT, turning on occupancy pricing would change nothing on a
                // property that already had a plan, and the ARI worker's per-
                // occupancy `rates` array would then be rejected by a plan still
                // declaring per_room.
                $updateRes = $this->client->put('rate_plans/' . $channexRatePlanId, $ratePayload);
                if (empty($updateRes['success'])) {
                    throw new RuntimeException("Failed to switch rate plan for '{$unit['name']}' to {$ratePayload['rate_plan']['sell_mode']}: " . json_encode($updateRes['error'] ?? 'Unknown error'));
                }
            }

            // Save mapping with NULL-safe deduplication
            $checkStmt = $this->pdo->prepare("
                SELECT id FROM channex_mappings 
                WHERE property_id = ? AND (room_id = ? OR (room_id IS NULL AND ? IS NULL))
                LIMIT 1
            ");
            $checkStmt->execute([$propertyId, $roomId, $roomId]);
            $existingMappingId = $checkStmt->fetchColumn();

            try {
                if ($existingMappingId) {
                    $updateStmt = $this->pdo->prepare("
                        UPDATE channex_mappings 
                        SET channex_property_id = ?, channex_room_type_id = ?, channex_rate_plan_id = ?, sell_mode = ?, sync_status = 'active', last_synced_at = NOW()
                        WHERE id = ?
                    ");
                    $updateStmt->execute([$channexPropertyId, $channexRoomTypeId, $channexRatePlanId, $ratePayload['rate_plan']['sell_mode'], $existingMappingId]);
                } else {
                    $saveStmt = $this->pdo->prepare("
                        INSERT INTO channex_mappings (property_id, room_id, channex_property_id, channex_room_type_id, channex_rate_plan_id, sell_mode, sync_status, last_synced_at)
                        VALUES (?, ?, ?, ?, ?, ?, 'active', NOW())
                    ");
                    $saveStmt->execute([$propertyId, $roomId, $channexPropertyId, $channexRoomTypeId, $channexRatePlanId, $ratePayload['rate_plan']['sell_mode']]);
                }
            } catch (PDOException $e) {
                $checkStmt->execute([$propertyId, $roomId, $roomId]);
                $existingMappingId = $checkStmt->fetchColumn();
            }

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
