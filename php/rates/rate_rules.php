<?php
/**
 * Room Rate Rules & Pricing Mode Module
 *
 * Provides a dynamic date-range rate-rule layer (`room_rate_rules` table)
 * alongside the existing flat `default_tariff`, controlled by a per-property
 * `pricing_mode` ('flat' | 'variable') toggle.
 */

function handleRateRuleRequests($pdo, $requestMethod, $action, $propertyId) {
    require_once __DIR__ . '/../config/schema_cache.php';

    // Self-healing schema for room_rate_rules and properties pricing_mode
    if (!isSchemaVerified('schema_room_rate_rules')) {
        try {
            $pdo->exec("ALTER TABLE properties ADD COLUMN IF NOT EXISTS `pricing_mode` VARCHAR(20) DEFAULT 'flat'");
            $pdo->exec("ALTER TABLE properties ADD COLUMN IF NOT EXISTS `default_tariff` DECIMAL(10,2) DEFAULT NULL");
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `room_rate_rules` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `property_id` INT NOT NULL,
                    `room_id` INT NULL,
                    `start_date` DATE NOT NULL,
                    `end_date` DATE NOT NULL,
                    `rate_per_night` DECIMAL(10,2) NOT NULL,
                    `rule_name` VARCHAR(100) NULL,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX `idx_rate_rule_prop_room_dates` (`property_id`, `room_id`, `start_date`, `end_date`),
                    FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");
            markSchemaVerified('schema_room_rate_rules');
        } catch (PDOException $e) {
            // Ignore if foreign key constraint or table exists
        }
    }

    // Stay restrictions (30 Aug 2026). A rate rule could previously only say
    // "this range costs X" - there was no way to express "minimum 2 nights over
    // Diwali" or "closed to arrival on changeover day", which are ordinary
    // requirements for a homestay and are what every OTA and channel manager
    // models as restrictions alongside the rate.
    //
    // Separate self-heal key from the CREATE TABLE above so existing
    // installations pick these up without the table being recreated.
    //
    // min_stay_arrival vs min_stay_through is a real distinction the OTAs draw:
    // "arrival" applies only when a stay STARTS on that date; "through" applies
    // to any stay spanning it. Both are stored because channel managers ask
    // which one you support, and answering "only one" limits distribution.
    if (!isSchemaVerified('schema_room_rate_rule_restrictions')) {
        foreach ([
            "ADD COLUMN IF NOT EXISTS `min_stay_arrival` INT NULL",
            "ADD COLUMN IF NOT EXISTS `min_stay_through` INT NULL",
            "ADD COLUMN IF NOT EXISTS `max_stay` INT NULL",
            "ADD COLUMN IF NOT EXISTS `stop_sell` TINYINT(1) NOT NULL DEFAULT 0",
            "ADD COLUMN IF NOT EXISTS `closed_to_arrival` TINYINT(1) NOT NULL DEFAULT 0",
            "ADD COLUMN IF NOT EXISTS `closed_to_departure` TINYINT(1) NOT NULL DEFAULT 0",
        ] as $clause) {
            try {
                $pdo->exec("ALTER TABLE `room_rate_rules` $clause");
            } catch (PDOException $e) {}
        }
        // rate_per_night becomes optional: a rule may now carry ONLY
        // restrictions (e.g. a 3-night minimum over a festival at the normal
        // price). Existing rows are unaffected.
        try {
            $pdo->exec("ALTER TABLE `room_rate_rules` MODIFY `rate_per_night` DECIMAL(10,2) NULL");
        } catch (PDOException $e) {}
        markSchemaVerified('schema_room_rate_rule_restrictions');
    }

    switch ($action) {
        case 'get_rate_rules':
            getRateRules($pdo, $propertyId);
            break;

        case 'save_rate_rule':
            if ($requestMethod === 'POST') {
                saveRateRule($pdo, $propertyId);
            }
            break;

        case 'delete_rate_rule':
            if ($requestMethod === 'POST') {
                deleteRateRule($pdo, $propertyId);
            }
            break;

        case 'update_pricing_mode':
            if ($requestMethod === 'POST') {
                updatePricingMode($pdo, $propertyId);
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Invalid rate rules action']);
            break;
    }
}

function getRateRules($pdo, $propertyId) {
    try {
        $scopeIds = [(int)$propertyId];
        $roomStmt = $pdo->prepare("SELECT id FROM properties WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM'");
        $roomStmt->execute([$propertyId]);
        foreach ($roomStmt->fetchAll(PDO::FETCH_COLUMN) as $roomId) {
            $scopeIds[] = (int)$roomId;
        }
        $placeholders = implode(',', array_fill(0, count($scopeIds), '?'));

        $stmt = $pdo->prepare("
            SELECT r.*, p.name as room_name
            FROM room_rate_rules r
            LEFT JOIN properties p ON r.room_id = p.id
            WHERE r.property_id IN ($placeholders) OR r.room_id IN ($placeholders)
            ORDER BY r.start_date ASC, r.created_at DESC
        ");
        $stmt->execute(array_merge($scopeIds, $scopeIds));
        $rules = $stmt->fetchAll();

        // Also fetch current property's pricing_mode
        $propStmt = $pdo->prepare("SELECT pricing_mode, default_tariff FROM properties WHERE id = ?");
        $propStmt->execute([$propertyId]);
        $propData = $propStmt->fetch();

        echo json_encode([
            'status' => 'success',
            'data' => $rules,
            'pricing_mode' => $propData['pricing_mode'] ?? 'flat',
            'default_tariff' => $propData['default_tariff'] !== null ? (float)$propData['default_tariff'] : null,
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

function saveRateRule($pdo, $propertyId) {
    try {
        $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

        $startDate = $input['start_date'] ?? '';
        $endDate = $input['end_date'] ?? '';
        $ratePerNight = isset($input['rate_per_night']) ? (float)$input['rate_per_night'] : null;
        $ruleName = trim($input['rule_name'] ?? '');
        $targetRoomIds = $input['room_ids'] ?? (isset($input['room_id']) ? [$input['room_id']] : [null]);
        $ruleId = !empty($input['id']) ? (int)$input['id'] : null;

        // Restrictions (30 Aug 2026). Nullable ints so "not set" is distinct
        // from "set to zero" - a min_stay of 0 is meaningless, but omitting it
        // must leave the OTA's own default alone rather than pushing a 0.
        $intOrNull = function ($v) {
            if ($v === null || $v === '' || $v === false) return null;
            $n = (int)$v;
            return $n > 0 ? $n : null;
        };
        $minStayArrival   = $intOrNull($input['min_stay_arrival'] ?? null);
        $minStayThrough   = $intOrNull($input['min_stay_through'] ?? null);
        $maxStay          = $intOrNull($input['max_stay'] ?? null);
        $stopSell         = !empty($input['stop_sell']) ? 1 : 0;
        $closedToArrival  = !empty($input['closed_to_arrival']) ? 1 : 0;
        $closedToDeparture= !empty($input['closed_to_departure']) ? 1 : 0;

        $hasRestriction = $minStayArrival !== null || $minStayThrough !== null || $maxStay !== null
            || $stopSell || $closedToArrival || $closedToDeparture;

        // A rule must now carry a rate OR at least one restriction - previously
        // rate was unconditionally required, which made "3-night minimum at the
        // usual price" impossible to express.
        if (!$startDate || !$endDate) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Start date and end date are required.']);
            return;
        }
        if ($ratePerNight === null && !$hasRestriction) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Set a rate per night, or at least one restriction (minimum stay, stop sell, or arrival/departure closure).']);
            return;
        }
        if ($ratePerNight !== null && $ratePerNight < 0) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Rate per night cannot be negative.']);
            return;
        }
        if ($maxStay !== null && $minStayArrival !== null && $maxStay < $minStayArrival) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Maximum stay cannot be shorter than the minimum stay.']);
            return;
        }

        if ($startDate > $endDate) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Start date cannot be after end date.']);
            return;
        }

        if (!is_array($targetRoomIds) || empty($targetRoomIds)) {
            $targetRoomIds = [null];
        }

        // Channel Manager Outbox: capture the pre-save state so the enqueued
        // push can be scoped to only the fields this save actually changes
        // (see computeChannexFieldDiff() in channex/outbox.php - a save that
        // only touches the rate must not also push stop_sell/closed_to_arrival/
        // closed_to_departure just because the row happens to store them too).
        // For a new rule there is no prior row, so "old" is the neutral
        // baseline (no rate, no restrictions) - everything the user actually
        // set is therefore "changed".
        $neutralRuleState = [
            'rate_per_night' => null, 'min_stay_arrival' => null, 'min_stay_through' => null,
            'max_stay' => null, 'stop_sell' => 0, 'closed_to_arrival' => 0, 'closed_to_departure' => 0,
        ];
        $oldRuleState = $neutralRuleState;

        if ($ruleId) {
            $oldStmt = $pdo->prepare("
                SELECT rate_per_night, min_stay_arrival, min_stay_through, max_stay,
                       stop_sell, closed_to_arrival, closed_to_departure
                FROM room_rate_rules WHERE id = ? AND property_id = ?
            ");
            $oldStmt->execute([$ruleId, $propertyId]);
            $oldRuleState = $oldStmt->fetch(PDO::FETCH_ASSOC) ?: $neutralRuleState;

            // Update single rule
            $roomId = !empty($targetRoomIds[0]) ? (int)$targetRoomIds[0] : null;
            $stmt = $pdo->prepare("
                UPDATE room_rate_rules
                SET room_id = ?, start_date = ?, end_date = ?, rate_per_night = ?, rule_name = ?,
                    min_stay_arrival = ?, min_stay_through = ?, max_stay = ?,
                    stop_sell = ?, closed_to_arrival = ?, closed_to_departure = ?
                WHERE id = ? AND property_id = ?
            ");
            $stmt->execute([$roomId, $startDate, $endDate, $ratePerNight, $ruleName,
                $minStayArrival, $minStayThrough, $maxStay,
                $stopSell, $closedToArrival, $closedToDeparture,
                $ruleId, $propertyId]);
        } else {
            // Bulk insert for selected rooms
            $stmt = $pdo->prepare("
                INSERT INTO room_rate_rules (property_id, room_id, start_date, end_date, rate_per_night, rule_name,
                    min_stay_arrival, min_stay_through, max_stay, stop_sell, closed_to_arrival, closed_to_departure)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            foreach ($targetRoomIds as $rId) {
                $roomId = !empty($rId) ? (int)$rId : null;
                $stmt->execute([$propertyId, $roomId, $startDate, $endDate, $ratePerNight, $ruleName,
                    $minStayArrival, $minStayThrough, $maxStay,
                    $stopSell, $closedToArrival, $closedToDeparture]);
            }
        }

        // Channel Manager Outbox (30 Aug 2026): Enqueue rate & restriction changes
        if (is_file(__DIR__ . '/../channex/outbox.php')) {
            require_once __DIR__ . '/../channex/outbox.php';
            if (function_exists('enqueueOutboxItem')) {
                $newRuleState = [
                    'rate_per_night' => $ratePerNight,
                    'min_stay_arrival' => $minStayArrival,
                    'min_stay_through' => $minStayThrough,
                    'max_stay' => $maxStay,
                    'stop_sell' => $stopSell,
                    'closed_to_arrival' => $closedToArrival,
                    'closed_to_departure' => $closedToDeparture,
                ];
                $changedFields = function_exists('computeChannexFieldDiff')
                    ? computeChannexFieldDiff($oldRuleState, $newRuleState)
                    : array_keys($newRuleState);

                foreach ($targetRoomIds as $rId) {
                    $roomId = !empty($rId) ? (int)$rId : null;
                    $payload = ['action' => 'save_rate_rule', 'rule_id' => $ruleId, 'changed_fields' => $changedFields];
                    foreach ($changedFields as $f) {
                        $payload[$f] = $newRuleState[$f];
                    }
                    enqueueOutboxItem($pdo, (int)$propertyId, $roomId, 'rates', $startDate, $endDate, $payload);
                }
            }
        }

        echo json_encode(['status' => 'success', 'message' => 'Rate rule saved successfully.']);
        if (function_exists('triggerEventDrivenChannexDrain')) {
            triggerEventDrivenChannexDrain($pdo);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

function deleteRateRule($pdo, $propertyId) {
    try {
        $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
        $ruleId = (int)($input['id'] ?? 0);

        if ($ruleId <= 0) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Valid rule ID is required.']);
            return;
        }

        $lookup = $pdo->prepare("
            SELECT room_id, start_date, end_date, rate_per_night, min_stay_arrival, min_stay_through,
                   max_stay, stop_sell, closed_to_arrival, closed_to_departure
            FROM room_rate_rules WHERE id = ? AND property_id = ?
        ");
        $lookup->execute([$ruleId, $propertyId]);
        $existingRule = $lookup->fetch(PDO::FETCH_ASSOC);

        $stmt = $pdo->prepare("DELETE FROM room_rate_rules WHERE id = ? AND property_id = ?");
        $stmt->execute([$ruleId, $propertyId]);

        if ($existingRule && !empty($existingRule['start_date']) && !empty($existingRule['end_date'])) {
            if (is_file(__DIR__ . '/../channex/outbox.php')) {
                require_once __DIR__ . '/../channex/outbox.php';
                if (function_exists('enqueueOutboxItem')) {
                    $roomId = !empty($existingRule['room_id']) ? (int)$existingRule['room_id'] : null;
                    // Deleting a rule reverts only the fields it actually set
                    // back to the neutral baseline - diff the deleted row
                    // against that baseline so this push, like a save, is
                    // scoped to what actually changes for Channex.
                    $neutralRuleState = [
                        'rate_per_night' => null, 'min_stay_arrival' => null, 'min_stay_through' => null,
                        'max_stay' => null, 'stop_sell' => 0, 'closed_to_arrival' => 0, 'closed_to_departure' => 0,
                    ];
                    $changedFields = function_exists('computeChannexFieldDiff')
                        ? computeChannexFieldDiff($existingRule, $neutralRuleState)
                        : array_keys($neutralRuleState);
                    $payload = ['action' => 'delete_rate_rule', 'rule_id' => $ruleId, 'changed_fields' => $changedFields];
                    foreach ($changedFields as $f) {
                        $payload[$f] = $neutralRuleState[$f];
                    }
                    enqueueOutboxItem($pdo, (int)$propertyId, $roomId, 'rates', $existingRule['start_date'], $existingRule['end_date'], $payload);
                }
            }
        }

        echo json_encode(['status' => 'success', 'message' => 'Rate rule deleted successfully.']);
        if (function_exists('triggerEventDrivenChannexDrain')) {
            triggerEventDrivenChannexDrain($pdo);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

// triggerEventDrivenChannexDrain() moved to channex/outbox.php (31 Aug 2026)
// so guests.php can share it too - see that file for the batching-window
// rationale. require_once above (line 235/282) already loads outbox.php,
// which is where enqueueOutboxItem() itself lives.

function updatePricingMode($pdo, $propertyId) {
    try {
        $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
        $mode = $input['pricing_mode'] ?? 'flat';

        if (!in_array($mode, ['flat', 'variable'], true)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Invalid pricing mode. Must be flat or variable.']);
            return;
        }

        $stmt = $pdo->prepare("UPDATE properties SET pricing_mode = ? WHERE id = ?");
        $stmt->execute([$mode, $propertyId]);

        echo json_encode(['status' => 'success', 'message' => "Pricing mode updated to {$mode}.", 'pricing_mode' => $mode]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}
