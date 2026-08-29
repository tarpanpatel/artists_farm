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

        if (!$startDate || !$endDate || $ratePerNight === null || $ratePerNight < 0) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Start date, end date, and non-negative rate per night are required.']);
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

        if ($ruleId) {
            // Update single rule
            $roomId = !empty($targetRoomIds[0]) ? (int)$targetRoomIds[0] : null;
            $stmt = $pdo->prepare("
                UPDATE room_rate_rules
                SET room_id = ?, start_date = ?, end_date = ?, rate_per_night = ?, rule_name = ?
                WHERE id = ? AND property_id = ?
            ");
            $stmt->execute([$roomId, $startDate, $endDate, $ratePerNight, $ruleName, $ruleId, $propertyId]);
        } else {
            // Bulk insert for selected rooms
            $stmt = $pdo->prepare("
                INSERT INTO room_rate_rules (property_id, room_id, start_date, end_date, rate_per_night, rule_name)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            foreach ($targetRoomIds as $rId) {
                $roomId = !empty($rId) ? (int)$rId : null;
                $stmt->execute([$propertyId, $roomId, $startDate, $endDate, $ratePerNight, $ruleName]);
            }
        }

        echo json_encode(['status' => 'success', 'message' => 'Rate rule saved successfully.']);
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

        $stmt = $pdo->prepare("DELETE FROM room_rate_rules WHERE id = ? AND property_id = ?");
        $stmt->execute([$ruleId, $propertyId]);

        echo json_encode(['status' => 'success', 'message' => 'Rate rule deleted successfully.']);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

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
