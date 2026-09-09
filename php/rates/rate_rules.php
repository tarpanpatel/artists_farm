<?php
/**
 * Room Rate Rules & Pricing Mode Module
 *
 * Provides a dynamic date-range rate-rule layer (`room_rate_rules` table)
 * alongside the existing flat `default_tariff`, controlled by a per-property
 * `pricing_mode` ('flat' | 'variable') toggle.
 */

/**
 * Audit trail for pricing changes (added 6 Sep 2026).
 *
 * Every other money-moving surface in this app already writes to `audit_logs`
 * - bookings, property settings, finance, staff, kitchen - but rate rules did
 * not, which made "who set this price, and when?" unanswerable. Proving where
 * one stray Rs4,500 rule on Patel Colony came from took four separate queries
 * and inference from auto-increment row ids, and the answer was still only a
 * best guess. Pricing is the setting that most directly moves money; it needs
 * a trail at least as good as the one a room booking already gets.
 *
 * Written SERVER-side, deliberately - not from the client's logAudit() the way
 * bookings do it. A price can be changed by anything that can reach
 * save_rate_rule, including a script or a direct API call, and an audit the
 * caller can simply decline to write is not an audit. Same INSERT shape as
 * router.php's 'property_settings' entries.
 *
 * Never allowed to break the save it is recording: a failed audit write is
 * swallowed, exactly as at every other audit call site in this codebase.
 */
function logRateRuleAudit(PDO $pdo, int $propertyId, string $actionMsg): void {
    try {
        $stmt = $pdo->prepare("
            INSERT INTO audit_logs (property_id, action, timestamp, user_id, user, ip_address, user_agent, status, module)
            VALUES (?, ?, NOW(), ?, ?, ?, ?, 'Success', 'pricing_rates')
        ");
        $stmt->execute([
            $propertyId,
            $actionMsg,
            // audit_logs.user_id carries a column DEFAULT of 7, so omitting it
            // silently attributes the change to that one staff member whoever
            // actually made it. Pass an explicit NULL when there is no session
            // to read, so an unattributed row reads as unknown rather than as
            // a specific innocent person.
            isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null,
            $_SESSION['full_name'] ?? $_SESSION['username'] ?? 'Unknown',
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? '',
        ]);
    } catch (Exception $e) {
        // Deliberately silent - see docblock.
    }
}

/**
 * Room list for an audit line: "Autumn Home, The Music Room", or the literal
 * "whole property" for a rule carrying no room. That wording matters - a
 * whole-property rule on a MULTI_KEY property is the shape that silently
 * applies to nothing and syncs nowhere, so it should be visible as such in
 * the log rather than reading like an ordinary rule.
 */
function describeRateRuleRooms(PDO $pdo, array $roomIds): string {
    $ids = array_values(array_unique(array_filter(array_map(function ($r) { return (int)$r; }, $roomIds))));
    if (!$ids) return 'whole property';
    try {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("SELECT name FROM properties WHERE id IN ($in) ORDER BY name");
        $stmt->execute($ids);
        $names = $stmt->fetchAll(PDO::FETCH_COLUMN);
        return $names ? implode(', ', $names) : ('room #' . implode(', #', $ids));
    } catch (Exception $e) {
        return 'room #' . implode(', #', $ids);
    }
}

/**
 * The rate/restriction half of an audit line, so a save and a delete describe
 * the same rule in the same words.
 */
function describeRateRuleTerms(?float $rate, array $r): string {
    $parts = [];
    $isFloor = ($r['rule_type'] ?? 'fixed') === 'floor';
    if ($rate !== null) {
        $parts[] = ($isFloor ? 'floor min Rs' : 'Rs') . number_format($rate, 2) . '/night';
    } else {
        $parts[] = 'no rate';
    }
    if (!empty($r['min_stay_arrival']))    $parts[] = 'min stay ' . (int)$r['min_stay_arrival'];
    if (!empty($r['min_stay_through']))    $parts[] = 'min stay through ' . (int)$r['min_stay_through'];
    if (!empty($r['max_stay']))            $parts[] = 'max stay ' . (int)$r['max_stay'];
    if (!empty($r['stop_sell']))           $parts[] = 'STOP SELL';
    if (!empty($r['closed_to_arrival']))   $parts[] = 'closed to arrival';
    if (!empty($r['closed_to_departure'])) $parts[] = 'closed to departure';
    if (!empty($r['days_of_week']))        $parts[] = 'days ' . $r['days_of_week'];
    return implode(', ', $parts);
}

/** DD/MM/YYYY - the app's display format everywhere (see CLAUDE.md). */
function formatRateRuleAuditDate(?string $d): string {
    $d = (string)$d;
    $t = strtotime($d);
    return $t ? date('d/m/Y', $t) : $d;
}

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

    // Day-of-week scoping (4 Sep 2026, explicit request: "Monday to Friday
    // 3000, Saturday and Sunday 4000"). NULL/empty = every day of the week
    // (unchanged behaviour for every existing rule - this column is purely
    // additive). Stored as Channex's own 2-letter day codes comma-joined
    // (mo,tu,we,th,fr,sa,su) so DAY_CODES below is the single source of
    // truth shared with the push side - see AriDrainWorker::
    // computeCompressedRestrictions()'s own comment on why a day-of-week
    // scoped rule is pushed using Channex's `days` param directly instead of
    // being flattened into one push per calendar week.
    if (!isSchemaVerified('schema_room_rate_rule_days_of_week')) {
        try {
            $pdo->exec("ALTER TABLE `room_rate_rules` ADD COLUMN IF NOT EXISTS `days_of_week` VARCHAR(20) NULL");
        } catch (PDOException $e) {}
        markSchemaVerified('schema_room_rate_rule_days_of_week');
    }

    // Floor rate rules (9 Sep 2026). A rule can be 'fixed' (overrides rate to ₹X)
    // or 'floor' (guarantees rate is never below ₹X, preserving higher surges).
    if (!isSchemaVerified('schema_room_rate_rule_type')) {
        try {
            $pdo->exec("ALTER TABLE `room_rate_rules` ADD COLUMN IF NOT EXISTS `rule_type` VARCHAR(20) NOT NULL DEFAULT 'fixed'");
        } catch (PDOException $e) {}
        markSchemaVerified('schema_room_rate_rule_type');
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

        case 'get_pending_rate_push_alerts':
            getPendingRatePushAlerts($pdo, $propertyId);
            break;

        case 'acknowledge_rate_push_alerts':
            if ($requestMethod === 'POST') {
                acknowledgeRatePushAlerts($pdo, $propertyId);
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
        $ruleType = in_array($input['rule_type'] ?? '', ['fixed', 'floor'], true) ? $input['rule_type'] : 'fixed';
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

        // Day-of-week scoping (4 Sep 2026, "Monday to Friday 3000, Saturday
        // and Sunday 4000") - Channex's own 2-letter day codes, so
        // AriDrainWorker::computeCompressedRestrictions() can pass them
        // straight through to Channex's `days` param unchanged. An empty
        // selection, or all 7 days selected, both normalize to NULL ("every
        // day") rather than being stored literally - keeps every existing
        // rule (created before this field existed) and every "no day
        // restriction" rule going forward behaving identically, and avoids
        // the ambiguity of an explicit-but-meaningless "all 7" value.
        $allDayCodes = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
        $rawDays = is_array($input['days_of_week'] ?? null) ? $input['days_of_week'] : [];
        $selectedDays = array_values(array_unique(array_intersect($allDayCodes, $rawDays)));
        // Preserve Channex's own mo..su order regardless of selection order.
        usort($selectedDays, fn($a, $b) => array_search($a, $allDayCodes) <=> array_search($b, $allDayCodes));
        $daysOfWeek = (empty($selectedDays) || count($selectedDays) === 7) ? null : implode(',', $selectedDays);

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
                    stop_sell = ?, closed_to_arrival = ?, closed_to_departure = ?, days_of_week = ?, rule_type = ?
                WHERE id = ? AND property_id = ?
            ");
            $stmt->execute([$roomId, $startDate, $endDate, $ratePerNight, $ruleName,
                $minStayArrival, $minStayThrough, $maxStay,
                $stopSell, $closedToArrival, $closedToDeparture, $daysOfWeek, $ruleType,
                $ruleId, $propertyId]);
        } else {
            // Bulk insert for selected rooms
            $stmt = $pdo->prepare("
                INSERT INTO room_rate_rules (property_id, room_id, start_date, end_date, rate_per_night, rule_name,
                    min_stay_arrival, min_stay_through, max_stay, stop_sell, closed_to_arrival, closed_to_departure, days_of_week, rule_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            foreach ($targetRoomIds as $rId) {
                $roomId = !empty($rId) ? (int)$rId : null;
                $stmt->execute([$propertyId, $roomId, $startDate, $endDate, $ratePerNight, $ruleName,
                    $minStayArrival, $minStayThrough, $maxStay,
                    $stopSell, $closedToArrival, $closedToDeparture, $daysOfWeek, $ruleType]);
            }
        }

        // Turn dated pricing on the first time a date price is ever set
        // (6 Sep 2026). `pricing_mode` defaults to 'flat', and 'flat' does not
        // merely hide rate rules on the owner's own calendar - it SUSPENDS
        // them, including what gets pushed to Airbnb/Booking.com (see
        // AriDrainWorker::isDynamicPricingMode() and availability.php). Since
        // the "One price always / Price by date" tab pair was merged away there
        // is no control left that can flip it, so a brand-new property could
        // save prices on the calendar forever and have every one of them do
        // nothing, silently.
        //
        // Deliberately gated on this being the property's FIRST rule. The
        // dangerous version of this flip is the one that wakes a BACKLOG of
        // dormant rules all at once and pushes stale prices to a live channel -
        // exactly the 3 Sep 2026 incident where a dormant rule outranked
        // PriceLabs. With no other rule in existence there is nothing dormant to
        // wake, so this case is provably safe; a property that somehow holds
        // rules while still on 'flat' is left alone for a human to decide.
        if (!$ruleId) {
            $priorStmt = $pdo->prepare("SELECT COUNT(*) FROM room_rate_rules WHERE property_id = ?");
            $priorStmt->execute([$propertyId]);
            // The rows just inserted above are the only ones that should exist.
            if ((int)$priorStmt->fetchColumn() <= count($targetRoomIds)) {
                // Both scopes matter: isDynamicPricingMode() reads the ROOM's own
                // properties row for a room-scoped rule, and the parent's for a
                // property-scoped one.
                $scopeIds = [(int)$propertyId];
                foreach ($targetRoomIds as $rId) {
                    if (!empty($rId)) $scopeIds[] = (int)$rId;
                }
                $modeStmt = $pdo->prepare("UPDATE properties SET pricing_mode = 'variable' WHERE id = ? AND (pricing_mode IS NULL OR pricing_mode = 'flat')");
                foreach (array_unique($scopeIds) as $sid) {
                    $modeStmt->execute([$sid]);
                }
            }
        }

        // Audit trail (6 Sep 2026) - see logRateRuleAudit() above. Recorded after
        // the write actually succeeded, and before the outbox enqueue, so the log
        // reflects what was stored even if the channel push later fails.
        logRateRuleAudit($pdo, (int)$propertyId, sprintf(
            'Rate rule %s: %s - %s - %s to %s - %s',
            $ruleId ? 'updated' : 'created',
            $ruleName !== '' ? chr(34) . $ruleName . chr(34) : 'unnamed rule',
            describeRateRuleRooms($pdo, $ruleId ? [$targetRoomIds[0] ?? null] : $targetRoomIds),
            formatRateRuleAuditDate($startDate),
            formatRateRuleAuditDate($endDate),
            describeRateRuleTerms($ratePerNight, [
                'min_stay_arrival' => $minStayArrival,
                'min_stay_through' => $minStayThrough,
                'max_stay' => $maxStay,
                'stop_sell' => $stopSell,
                'closed_to_arrival' => $closedToArrival,
                'closed_to_departure' => $closedToDeparture,
                'days_of_week' => $daysOfWeek,
                'rule_type' => $ruleType,
            ])
        ));

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

                // Fields the CALLER deliberately asserted (6 Sep 2026). The diff
                // above exists so a price edit doesn't also push stop_sell just
                // because the row stores it - correct for a form where every
                // field rides along, wrong for a control whose entire purpose is
                // to state a value. The calendar panel's Availability radio is
                // exactly that: "Available" is stop_sell = 0, byte-identical to
                // the neutral baseline, so it diffed as unchanged and the unblock
                // never reached Airbnb - the dates read open here and stayed shut
                // there. Union rather than replace, so this can only ever add to
                // what the diff already found.
                $explicitFields = array_values(array_intersect(
                    array_keys($neutralRuleState),
                    is_array($input['explicit_fields'] ?? null) ? $input['explicit_fields'] : []
                ));
                if (!empty($explicitFields)) {
                    $changedFields = array_values(array_unique(array_merge($changedFields, $explicitFields)));
                }

                foreach ($targetRoomIds as $rId) {
                    $roomId = !empty($rId) ? (int)$rId : null;
                    $payload = ['action' => 'save_rate_rule', 'rule_id' => $ruleId, 'changed_fields' => $changedFields];
                    foreach ($changedFields as $f) {
                        $payload[$f] = $newRuleState[$f];
                    }
                    // A null $roomId here means "the whole property". That is a
                    // real mapping for a single-unit property and NOT one for a
                    // MULTI_KEY property, which maps per room - so enqueueing the
                    // null would fail with "No Channex mapping found ... room
                    // null" and be marked failed in silence. Expand it into the
                    // property's actual rooms; [null] comes back unchanged for a
                    // genuine single unit. (See the same fix in the pricing-mode
                    // handler below and channex_push_ari in router.php.)
                    $pushRoomIds = ($roomId === null && function_exists('getChannexPushRoomIds'))
                        ? getChannexPushRoomIds($pdo, (int)$propertyId)
                        : [$roomId];
                    foreach ($pushRoomIds as $pushRoomId) {
                        enqueueOutboxItem($pdo, (int)$propertyId, $pushRoomId, 'rates', $startDate, $endDate, $payload);
                    }
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
                   max_stay, stop_sell, closed_to_arrival, closed_to_departure,
                   rule_name, days_of_week, rule_type
            FROM room_rate_rules WHERE id = ? AND property_id = ?
        ");
        $lookup->execute([$ruleId, $propertyId]);
        $existingRule = $lookup->fetch(PDO::FETCH_ASSOC);

        $stmt = $pdo->prepare("DELETE FROM room_rate_rules WHERE id = ? AND property_id = ?");
        $stmt->execute([$ruleId, $propertyId]);

        // Audit trail (6 Sep 2026). Deleting a rule is the change most worth
        // recording - it is what silently RESTORES a date to its base price, so
        // "the price changed and nobody knows why" is usually a deletion.
        if ($existingRule) {
            logRateRuleAudit($pdo, (int)$propertyId, sprintf(
                'Rate rule deleted: %s - %s - %s to %s - %s',
                !empty($existingRule['rule_name']) ? chr(34) . $existingRule['rule_name'] . chr(34) : 'unnamed rule',
                describeRateRuleRooms($pdo, [$existingRule['room_id'] ?? null]),
                formatRateRuleAuditDate($existingRule['start_date'] ?? ''),
                formatRateRuleAuditDate($existingRule['end_date'] ?? ''),
                describeRateRuleTerms(
                    isset($existingRule['rate_per_night']) ? (float)$existingRule['rate_per_night'] : null,
                    $existingRule
                )
            ));
        }

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
                    // Same whole-property expansion as save_rate_rule above - a
                    // null room on a MULTI_KEY property has no mapping to push to.
                    // This one matters especially: deleting a rule is what RESTORES
                    // a date to its neutral state, so a silently-failed push leaves
                    // a stale rate or a Stop Sell block live on the channel after
                    // the rule that created it is gone.
                    $pushRoomIds = ($roomId === null && function_exists('getChannexPushRoomIds'))
                        ? getChannexPushRoomIds($pdo, (int)$propertyId)
                        : [$roomId];
                    foreach ($pushRoomIds as $pushRoomId) {
                        enqueueOutboxItem($pdo, (int)$propertyId, $pushRoomId, 'rates', $existingRule['start_date'], $existingRule['end_date'], $payload);
                    }
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

        // Read the mode being replaced BEFORE the update, so the audit line can
        // say what actually changed rather than only where it landed.
        $prevModeStmt = $pdo->prepare("SELECT pricing_mode FROM properties WHERE id = ?");
        $prevModeStmt->execute([$propertyId]);
        $previousMode = (string)($prevModeStmt->fetchColumn() ?: 'flat');

        $stmt = $pdo->prepare("UPDATE properties SET pricing_mode = ? WHERE id = ?");
        $stmt->execute([$mode, $propertyId]);

        // Audit trail (6 Sep 2026). This switch is the single highest-impact
        // pricing change available: flipping to Flat Base Rate makes EVERY rate
        // rule stop applying at once, with no rule itself being edited or
        // deleted - so without this, prices appear to change on their own with
        // nothing in the log to explain it.
        if ($previousMode !== $mode) {
            $modeLabel = function ($m) { return $m === 'variable' ? 'Dynamic Rules' : 'Flat Base Rate'; };
            logRateRuleAudit($pdo, (int)$propertyId, sprintf(
                'Pricing mode changed: %s -> %s%s',
                $modeLabel($previousMode),
                $modeLabel($mode),
                $mode === 'flat' ? ' (every rate rule stops applying)' : ''
            ));
        }

        // Make the switch take effect on Airbnb/Booking.com and the public
        // page immediately, not just the next time an unrelated rule is
        // edited - AriDrainWorker::isDynamicPricingMode() now gates every
        // rate-rule push on this exact flag (added 4 Sep 2026), but that
        // gate is only checked when something drains the outbox for a given
        // date. Flipping the switch here doesn't touch any dates by itself,
        // so without this, whatever was last pushed (a rule's rate, a Stop
        // Sell block) stays live on the channel/public page until some other
        // edit happens to touch those same dates. Re-enqueue the full span
        // of every rule saved for this exact scope (same property_id/room_id
        // shape saveRateRule()/deleteRateRule() above already enqueue with -
        // room_id NULL, property_id = this request's own resolved property,
        // which for a MULTI_KEY_ROOM context is that room's own id, not its
        // parent's), both kinds so it covers Stop Sell (kind=availability)
        // and rate/other restrictions (kind=rates) - see
        // AriDrainWorker::processBatch()'s kind switch.
        if (is_file(__DIR__ . '/../channex/outbox.php')) {
            require_once __DIR__ . '/../channex/outbox.php';
            if (function_exists('enqueueOutboxItem')) {
                $rangeStmt = $pdo->prepare("
                    SELECT MIN(start_date) AS min_date, MAX(end_date) AS max_date
                    FROM room_rate_rules
                    WHERE property_id = ? OR room_id = ?
                ");
                $rangeStmt->execute([$propertyId, $propertyId]);
                $range = $rangeStmt->fetch();
                if (!empty($range['min_date']) && !empty($range['max_date'])) {
                    $payload = ['action' => 'pricing_mode_changed', 'pricing_mode' => $mode];
                    // Never enqueue a bare room_id=null for a property that maps
                    // per-room. A MULTI_KEY property has no `room_id IS NULL` row
                    // in channex_mappings once it has real MULTI_KEY_ROOM
                    // children, so getMapping(propertyId, null) finds nothing, the
                    // push returns success:false, and AriDrainWorker just marks the
                    // row failed and moves on - silently. This is the exact bug
                    // CLAUDE.md documents for channex_push_ari; this call site was
                    // missed when getChannexPushRoomIds() was introduced to fix it.
                    //
                    // Found live 4 Sep 2026: 23 failed outbox rows on Patel Colony,
                    // all "No Channex mapping found for property 290476 room null",
                    // 23 attempts each - so every pricing-mode change on a
                    // multi-key property had silently pushed nothing at all.
                    //
                    // Returns [null] unchanged for a genuine single-unit property.
                    $modeRoomIds = function_exists('getChannexPushRoomIds')
                        ? getChannexPushRoomIds($pdo, (int)$propertyId)
                        : [null];
                    foreach ($modeRoomIds as $modeRoomId) {
                        enqueueOutboxItem($pdo, (int)$propertyId, $modeRoomId, 'availability', $range['min_date'], $range['max_date'], $payload);
                        enqueueOutboxItem($pdo, (int)$propertyId, $modeRoomId, 'rates', $range['min_date'], $range['max_date'], $payload);
                    }
                }
            }
        }

        echo json_encode(['status' => 'success', 'message' => "Pricing mode updated to {$mode}.", 'pricing_mode' => $mode]);
        if (function_exists('triggerEventDrivenChannexDrain')) {
            triggerEventDrivenChannexDrain($pdo);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

/**
 * Unacknowledged rate/restriction pushes for the current scope (added 4 Sep
 * 2026 - see recordRatePushAlert()'s doc comment in outbox.php for why this
 * exists: a UI confirm() dialog can't cover a push triggered by a script run
 * directly against the server, so this is the guaranteed, can't-be-bypassed
 * half - every completed rate push gets recorded regardless of trigger, and
 * the app prompts about it on next load via this endpoint). Scoped like
 * every other rate-rule lookup in this file (room_id = this scope, OR a
 * property-wide push with room_id NULL against this scope's own
 * property_id) - PLUS, when this scope is a MULTI_KEY parent, every one of
 * its own child rooms too, so the aggregate dashboard surfaces a push made
 * while drilled into any single room.
 */
function getPendingRatePushAlerts($pdo, $propertyId) {
    try {
        if (is_file(__DIR__ . '/../channex/outbox.php')) {
            require_once __DIR__ . '/../channex/outbox.php';
        }
        if (!function_exists('ensureRatePushAlertSchema')) {
            echo json_encode(['status' => 'success', 'data' => []]);
            return;
        }
        ensureRatePushAlertSchema($pdo);

        $childStmt = $pdo->prepare("SELECT id FROM properties WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM'");
        $childStmt->execute([$propertyId]);
        $childIds = array_map('intval', $childStmt->fetchAll(PDO::FETCH_COLUMN));
        $scopeIds = array_unique(array_merge([(int)$propertyId], $childIds));
        $placeholders = implode(',', array_fill(0, count($scopeIds), '?'));

        $stmt = $pdo->prepare("
            SELECT a.id, a.property_id, a.room_id, a.date_from, a.date_to, a.reason, a.created_at,
                   r.name AS room_name
            FROM channex_rate_push_alerts a
            LEFT JOIN properties r ON r.id = a.room_id
            WHERE a.acknowledged_at IS NULL
              AND (a.property_id IN ($placeholders) OR a.room_id IN ($placeholders))
            ORDER BY a.created_at DESC
            LIMIT 50
        ");
        $stmt->execute(array_merge($scopeIds, $scopeIds));
        echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (Exception $e) {
        echo json_encode(['status' => 'success', 'data' => []]);
    }
}

function acknowledgeRatePushAlerts($pdo, $propertyId) {
    try {
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $ids = array_values(array_filter(array_map('intval', $input['ids'] ?? [])));
        if (empty($ids)) {
            echo json_encode(['status' => 'success', 'message' => 'Nothing to acknowledge.']);
            return;
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("UPDATE channex_rate_push_alerts SET acknowledged_at = NOW() WHERE id IN ($placeholders) AND acknowledged_at IS NULL");
        $stmt->execute($ids);
        echo json_encode(['status' => 'success', 'message' => 'Acknowledged.']);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}
