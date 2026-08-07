<?php
/**
 * Generalized Guest Service Requests (Housekeeping, Maintenance, etc.)
 * Ad-hoc requests not tied to a kitchen order - logged by any staff member,
 * nudged to the Admin Telegram group with an inline "Mark Fulfilled" button,
 * resolvable either by tapping that button (production webhook or local
 * poller - see php/telegram/webhook_handler.php) or from the app itself.
 */

require_once __DIR__ . '/../telegram/sender.php';
require_once __DIR__ . '/../telegram/templates.php';

if (!function_exists('convertSnakeToCamel')) {
    function convertSnakeToCamel($array) {
        $result = [];
        foreach ($array as $key => $value) {
            $camelKey = preg_replace_callback('/_([a-z])/', function ($m) { return strtoupper($m[1]); }, $key);
            $result[$camelKey] = $value;
        }
        return $result;
    }
}

/**
 * Built-in service request types, grouped by category. Seeded once per property
 * into the service_request_types table (see seedServiceRequestTypes) so the
 * dropdown is DB-driven and editable per property instead of hardcoded.
 */
$SERVICE_REQUEST_TYPES = [
    ['id' => 'fresh_towels', 'category' => 'Housekeeping', 'label' => 'Fresh Towels'],
    ['id' => 'extra_bedding', 'category' => 'Housekeeping', 'label' => 'Extra Bedding / Pillows'],
    ['id' => 'toiletries_refill', 'category' => 'Housekeeping', 'label' => 'Toiletries Refill'],
    ['id' => 'room_cleaning', 'category' => 'Housekeeping', 'label' => 'Room Cleaning'],
    ['id' => 'trash_pickup', 'category' => 'Housekeeping', 'label' => 'Trash Pickup'],
    ['id' => 'drinking_water', 'category' => 'Food & Beverage', 'label' => 'Drinking Water / Ice'],
    ['id' => 'tea_coffee_replenish', 'category' => 'Food & Beverage', 'label' => 'Tea / Coffee Sachets'],
    ['id' => 'crockery_cutlery', 'category' => 'Food & Beverage', 'label' => 'Crockery / Cutlery'],
    ['id' => 'room_service_order', 'category' => 'Food & Beverage', 'label' => 'In-Room Dining Request'],
    ['id' => 'ac_heating_issue', 'category' => 'Maintenance', 'label' => 'AC / Heating Issue'],
    ['id' => 'hot_water_geyser', 'category' => 'Maintenance', 'label' => 'Hot Water / Geyser Issue'],
    ['id' => 'wifi_connectivity', 'category' => 'Maintenance', 'label' => 'Wi-Fi / Internet Issue'],
    ['id' => 'tv_cable_issue', 'category' => 'Maintenance', 'label' => 'TV / Cable Issue'],
    ['id' => 'plumbing_leakage', 'category' => 'Maintenance', 'label' => 'Plumbing / Leakage'],
    ['id' => 'electrical_power', 'category' => 'Maintenance', 'label' => 'Electrical / Power Outlet Issue'],
    ['id' => 'iron_ironing_board', 'category' => 'Amenities On Request', 'label' => 'Iron & Ironing Board'],
    ['id' => 'hair_dryer', 'category' => 'Amenities On Request', 'label' => 'Hair Dryer'],
    ['id' => 'mosquito_repellent', 'category' => 'Amenities On Request', 'label' => 'Mosquito Repellent / Vaporizer'],
    ['id' => 'luggage_assistance', 'category' => 'Front Desk & Services', 'label' => 'Luggage Assistance'],
    ['id' => 'cab_travel_booking', 'category' => 'Front Desk & Services', 'label' => 'Taxi / Travel Booking'],
    ['id' => 'late_checkout_request', 'category' => 'Front Desk & Services', 'label' => 'Late Check-out Request'],
    ['id' => 'early_checkin_request', 'category' => 'Front Desk & Services', 'label' => 'Early Check-in Request'],
    ['id' => 'first_aid_assistance', 'category' => 'Front Desk & Services', 'label' => 'First Aid Kit'],
    ['id' => 'other_special_request', 'category' => 'General', 'label' => 'Other / Custom Request'],
];

function ensureServiceRequestsSchema($pdo) {
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS `service_request_types` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `property_id` INT NOT NULL,
            `type_id` VARCHAR(100) NOT NULL,
            `category` VARCHAR(100) NOT NULL,
            `label` VARCHAR(255) NOT NULL,
            `is_system_default` BOOLEAN DEFAULT FALSE,
            `display_order` INT NOT NULL DEFAULT 0,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY `unique_type_per_property` (property_id, type_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    } catch (PDOException $e) {}

    // Nav items are DB-driven and shared across every property (see get_nav_menu
    // in php/kitchen/menu.php) - insert this feature's entry once, the same way
    // Telegram templates get backfilled, rather than requiring an admin to add
    // it by hand through the Edit Navigation screen.
    try {
        $pdo->exec("INSERT IGNORE INTO nav_menu_items
            (id, property_id, title, tab_key, unique_key, category, icon_name, display_order)
            VALUES ('nav-svcreq', 1, 'Service Requests', 'service_requests', 'service_requests', 'Residents & Billing', 'Bell', 4)");
    } catch (PDOException $e) {}
}

/**
 * Populate built-in service request types for a property the first time it asks
 * (mirrors populateDefaultExpenses). Idempotent via INSERT IGNORE; only runs when
 * the property has no system-default rows yet, so admin deletions persist.
 */
function seedServiceRequestTypes($pdo, $propertyId) {
    global $SERVICE_REQUEST_TYPES;
    try {
        $stmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM service_request_types WHERE property_id = ? AND is_system_default = TRUE");
        $stmt->execute([$propertyId]);
        if (intval($stmt->fetch(PDO::FETCH_ASSOC)['cnt']) > 0) return;

        $insert = $pdo->prepare("INSERT IGNORE INTO service_request_types (property_id, type_id, category, label, is_system_default, display_order) VALUES (?, ?, ?, ?, TRUE, ?)");
        $order = 0;
        foreach ($SERVICE_REQUEST_TYPES as $type) {
            $insert->execute([$propertyId, $type['id'], $type['category'], $type['label'], $order++]);
        }
    } catch (PDOException $e) {}
}

function serviceRequestEditedText($pdo, $req, $staffName) {
    return TelegramTemplates::render($pdo, 'service_request_fulfilled_edit', [
        'request_type' => $req['request_type'],
        'room_name' => $req['room_name'] ?? 'N/A',
        'staff_name' => $staffName,
        'fulfill_time' => date('h:i A'),
    ]);
}

// Shared by the manual "Mark Fulfilled" button in the app (fulfill_service_request
// action) and the Telegram inline-button callback (fulfill_request_<id>), so
// both paths update the same row and edit the same Telegram message the same way.
function fulfillServiceRequest($pdo, $id, $staffName) {
    ensureServiceRequestsSchema($pdo);
    $stmt = $pdo->prepare("
        SELECT sr.*, COALESCE(r.name, 'N/A') as room_name
        FROM service_requests sr
        LEFT JOIN properties r ON sr.room_id = r.id
        WHERE sr.id = ?
    ");
    $stmt->execute([$id]);
    $req = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$req) {
        return ['status' => 'error', 'message' => 'Service request not found'];
    }
    if ($req['status'] === 'Fulfilled') {
        return ['status' => 'success', 'already' => true, 'message' => 'Already fulfilled'];
    }

    $pdo->prepare("UPDATE service_requests SET status = 'Fulfilled', fulfilled_at = NOW(), fulfilled_by = ? WHERE id = ?")
        ->execute([$staffName, $id]);

    if (!empty($req['telegram_chat_id']) && !empty($req['telegram_message_id'])) {
        editTelegramMessageText($req['telegram_chat_id'], $req['telegram_message_id'], serviceRequestEditedText($pdo, $req, $staffName), null);
    }

    return ['status' => 'success', 'already' => false, 'message' => 'Service request marked fulfilled'];
}

function handleServiceRequestActions($pdo, $request_method, $action, $propertyId) {
    ensureServiceRequestsSchema($pdo);

    switch ($action) {
        case 'get_service_request_types':
            seedServiceRequestTypes($pdo, $propertyId);
            $stmt = $pdo->prepare("SELECT * FROM service_request_types WHERE property_id = ? ORDER BY category ASC, is_system_default DESC, display_order ASC, label ASC");
            $stmt->execute([$propertyId]);
            echo json_encode(['status' => 'success', 'data' => array_map('convertSnakeToCamel', $stmt->fetchAll(PDO::FETCH_ASSOC))]);
            break;

        case 'save_service_request_type':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true) ?: [];
                $typeId = trim($input['type_id'] ?? '');
                $category = trim($input['category'] ?? '');
                $label = trim($input['label'] ?? '');
                if (!$typeId || !$category || !$label) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'type_id, category and label are required']);
                    break;
                }
                $stmt = $pdo->prepare("
                    INSERT INTO service_request_types (property_id, type_id, category, label, is_system_default, display_order)
                    VALUES (?, ?, ?, ?, FALSE, 999)
                    ON DUPLICATE KEY UPDATE category = VALUES(category), label = VALUES(label)
                ");
                $stmt->execute([$propertyId, $typeId, $category, $label]);
                echo json_encode(['status' => 'success', 'message' => 'Service request type saved']);
            }
            break;

        case 'delete_service_request_type':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true) ?: [];
                $id = intval($input['id'] ?? 0);
                if (!$id) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'id is required']);
                    break;
                }
                $stmt = $pdo->prepare("SELECT is_system_default FROM service_request_types WHERE id = ? AND property_id = ?");
                $stmt->execute([$id, $propertyId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row) {
                    http_response_code(404);
                    echo json_encode(['status' => 'error', 'message' => 'Service request type not found']);
                    break;
                }
                if ($row['is_system_default']) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'System default types cannot be deleted']);
                    break;
                }
                $pdo->prepare("DELETE FROM service_request_types WHERE id = ? AND property_id = ?")->execute([$id, $propertyId]);
                echo json_encode(['status' => 'success', 'message' => 'Service request type deleted']);
            }
            break;

        case 'get_service_requests':
            $statusFilter = $_GET['status'] ?? null;
            $sql = "
                SELECT sr.*, COALESCE(r.name, 'N/A') as room_name
                FROM service_requests sr
                LEFT JOIN properties r ON sr.room_id = r.id
                WHERE sr.property_id = ?
            ";
            $params = [$propertyId];
            if ($statusFilter) {
                $sql .= " AND sr.status = ?";
                $params[] = $statusFilter;
            }
            $sql .= " ORDER BY sr.created_at DESC";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            echo json_encode(['status' => 'success', 'data' => array_map('convertSnakeToCamel', $stmt->fetchAll(PDO::FETCH_ASSOC))]);
            break;

        case 'create_service_request':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true) ?: [];
                $requestType = trim($input['request_type'] ?? '');
                $requestedBy = trim($input['requested_by'] ?? '');
                if (!$requestType || !$requestedBy) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'request_type and requested_by are required']);
                    break;
                }
                $roomId = !empty($input['room_id']) ? intval($input['room_id']) : null;
                $description = trim($input['description'] ?? '');

                $stmt = $pdo->prepare("
                    INSERT INTO service_requests (property_id, room_id, request_type, description, requested_by)
                    VALUES (?, ?, ?, ?, ?)
                ");
                $stmt->execute([$propertyId, $roomId, $requestType, $description, $requestedBy]);
                $requestId = $pdo->lastInsertId();

                $roomName = 'N/A';
                if ($roomId) {
                    $roomStmt = $pdo->prepare("SELECT name FROM properties WHERE id = ?");
                    $roomStmt->execute([$roomId]);
                    $roomName = $roomStmt->fetchColumn() ?: 'N/A';
                }

                echo json_encode(['status' => 'success', 'message' => 'Service request logged', 'id' => $requestId]);

                // Nudge Admin with an inline "Mark Fulfilled" button - resolvable by
                // tap (production webhook or local poller) or from the app itself.
                try {
                    $msg = TelegramTemplates::render($pdo, 'service_request_created', [
                        'request_type' => $requestType,
                        'room_name' => $roomName,
                        'description' => $description ?: '(none)',
                        'requested_by' => $requestedBy,
                    ]);

                    $replyMarkup = ['inline_keyboard' => [[
                        ['text' => '✅ Mark Fulfilled', 'callback_data' => "fulfill_request_{$requestId}"]
                    ]]];

                    $sendResult = sendPropertyTelegramMessage($pdo, $propertyId, 'admin', $msg, $replyMarkup, 'service_request_created');
                    $decoded = is_string($sendResult) ? json_decode($sendResult, true) : null;
                    if (!empty($decoded['ok']) && !empty($decoded['result'])) {
                        $pdo->prepare("UPDATE service_requests SET telegram_chat_id = ?, telegram_message_id = ? WHERE id = ?")
                            ->execute([
                                $decoded['result']['chat']['id'],
                                $decoded['result']['message_id'],
                                $requestId,
                            ]);
                    }
                } catch (Exception $e) {
                    error_log("Failed to send service request Telegram notification: " . $e->getMessage());
                }
            }
            break;

        case 'fulfill_service_request':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true) ?: [];
                $id = $input['id'] ?? null;
                $staffName = trim($input['fulfilled_by'] ?? 'Staff');
                if (!$id) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'id is required']);
                    break;
                }
                echo json_encode(fulfillServiceRequest($pdo, intval($id), $staffName));
            }
            break;

        case 'update_service_request_reminder_timestamp':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true) ?: [];
                $id = $input['id'] ?? null;
                if (!$id) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'id is required']);
                    break;
                }
                $pdo->prepare("UPDATE service_requests SET last_reminder_at = NOW() WHERE id = ?")->execute([intval($id)]);
                echo json_encode(['status' => 'success']);
            }
            break;

        // Returns Pending requests stuck too long, measured from last_reminder_at
        // if one exists, else from created_at - mirrors check_stale_reminders in
        // php/kitchen/orders.php so the frontend's polling loop is symmetrical.
        case 'check_stale_service_requests':
            $thresholdMinutes = max(1, (int)($_GET['threshold_minutes'] ?? 15));
            $stmt = $pdo->prepare("
                SELECT sr.id, sr.request_type, sr.description, sr.requested_by, sr.created_at,
                       COALESCE(r.name, 'N/A') as room_name,
                       TIMESTAMPDIFF(MINUTE, COALESCE(sr.last_reminder_at, sr.created_at), NOW()) as elapsed_minutes
                FROM service_requests sr
                LEFT JOIN properties r ON sr.room_id = r.id
                WHERE sr.property_id = ?
                  AND sr.status = 'Pending'
                  AND TIMESTAMPDIFF(MINUTE, COALESCE(sr.last_reminder_at, sr.created_at), NOW()) >= ?
            ");
            $stmt->execute([$propertyId, $thresholdMinutes]);
            echo json_encode(['status' => 'success', 'data' => array_map('convertSnakeToCamel', $stmt->fetchAll(PDO::FETCH_ASSOC))]);
            break;

        default:
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Invalid service request action']);
            break;
    }
}
