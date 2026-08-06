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

function ensureServiceRequestsSchema($pdo) {
    try {
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
