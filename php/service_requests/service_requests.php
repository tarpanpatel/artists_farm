<?php
/**
 * Generalized Guest Service Requests (Housekeeping, Maintenance, etc.)
 * Ad-hoc requests not tied to a kitchen order - logged by any staff member,
 * nudged to the Admin Telegram group with an inline "Mark Fulfilled" button,
 * resolvable either by tapping that button (production webhook or local
 * poller - see php/telegram/webhook_handler.php) or from the app itself.
 */

// Conditional (12 Aug 2026): same reasoning as telegram.php's require in
// router.php - this file is itself unconditionally required by router.php,
// so a missing sender.php/templates.php here would fatal-crash every action,
// not just service requests. The one call site below is wrapped in
// catch (Throwable) so a missing file degrades to "notification not sent"
// instead of crashing that specific request too.
foreach (['../telegram/sender.php', '../telegram/templates.php'] as $telegramDep) {
    if (file_exists(__DIR__ . '/' . $telegramDep)) {
        require_once __DIR__ . '/' . $telegramDep;
    }
}

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
 * Ensures the system_service_request_catalog global table exists.
 * This is the authoritative source for system-wide service request types,
 * managed by the Root Admin Dashboard. Self-healing via CREATE TABLE IF NOT EXISTS.
 */
function ensureSystemServiceRequestCatalogSchema($pdo) {
    if (isSchemaVerified('schema_system_svc_request_catalog')) return;
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS system_service_request_catalog (
            id INT AUTO_INCREMENT PRIMARY KEY,
            type_id VARCHAR(255) NOT NULL,
            category VARCHAR(255) NOT NULL,
            label VARCHAR(255) NOT NULL,
            display_order INT DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
        markSchemaVerified('schema_system_svc_request_catalog');
    } catch (PDOException $e) {}
}

require_once __DIR__ . '/../config/schema_cache.php';

function ensureServiceRequestsSchema($pdo) {
    if (isSchemaVerified('schema_service_requests')) return;
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

    // Add scheduled_at column to service_requests if it doesn't exist
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM `service_requests` LIKE 'scheduled_at'");
        if ($stmt->rowCount() === 0) {
            $pdo->exec("ALTER TABLE `service_requests` ADD COLUMN `scheduled_at` DATETIME NULL DEFAULT NULL AFTER `description`");
        }
    } catch (PDOException $e) {}

    // Add charge_amount column to service_requests if it doesn't exist
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM `service_requests` LIKE 'charge_amount'");
        if ($stmt->rowCount() === 0) {
            $pdo->exec("ALTER TABLE `service_requests` ADD COLUMN `charge_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `description`");
        }
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

    markSchemaVerified('schema_service_requests');
}

// seedServiceRequestTypes removed: types now come from system_service_request_catalog (global)
// and property-specific service_request_types (custom). No seeding needed.

function getServiceRequestTypeLabel($pdo, $propertyId, $typeId) {
    if (empty($typeId)) return 'General Service';
    try {
        if ($pdo && $propertyId) {
            $stmt = $pdo->prepare("SELECT label FROM service_request_types WHERE (type_id = ? OR LOWER(type_id) = LOWER(?)) AND property_id = ? LIMIT 1");
            $stmt->execute([$typeId, $typeId, $propertyId]);
            $label = $stmt->fetchColumn();
            if ($label) return $label;
        }
        if ($pdo) {
            $stmt = $pdo->prepare("SELECT label FROM system_service_request_catalog WHERE type_id = ? OR LOWER(type_id) = LOWER(?) LIMIT 1");
            $stmt->execute([$typeId, $typeId]);
            $label = $stmt->fetchColumn();
            if ($label) return $label;
        }
    } catch (Exception $e) {}

    // Fallback: convert snake_case to Title Case (e.g. amenities_extra_bed -> Amenities Extra Bed)
    return ucwords(str_replace(['_', '-'], ' ', $typeId));
}

function serviceRequestEditedText($pdo, $req, $staffName) {
    $typeLabel = getServiceRequestTypeLabel($pdo, $req['property_id'] ?? 1, $req['request_type']);
    return TelegramTemplates::render($pdo, 'service_request_fulfilled_edit', [
        'request_type' => $typeLabel,
        'room_name' => $req['room_name'] ?? 'N/A',
        'staff_name' => $staffName,
        'fulfill_time' => date('d/m/Y, h:i:s a'),
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

    $propId = intval($req['property_id'] ?? 1);
    $config = getPropertyTelegramConfig($pdo, $propId);
    $botToken = !empty($config['botToken']) ? $config['botToken'] : (defined('TELEGRAM_BOT_TOKEN') ? TELEGRAM_BOT_TOKEN : null);

    $fulfilledText = serviceRequestEditedText($pdo, $req, $staffName);

    // 1. Edit original Telegram message to update status and remove button if linked
    if (!empty($req['telegram_chat_id']) && !empty($req['telegram_message_id'])) {
        editTelegramMessageText($req['telegram_chat_id'], $req['telegram_message_id'], $fulfilledText, null, $botToken);
    }

    // 2. Dispatch a "SERVICE REQUEST FULFILLED" notification to Admin Telegram group so team is notified
    sendPropertyTelegramMessage($pdo, $propId, 'admin', $fulfilledText, null, 'service_request_fulfilled_edit');

    return ['status' => 'success', 'already' => false, 'message' => 'Service request marked fulfilled'];
}

function handleServiceRequestActions($pdo, $request_method, $action, $propertyId) {
    ensureServiceRequestsSchema($pdo);

    switch ($action) {
        case 'get_system_service_request_catalog':
            // Root Admin: manage the global system-wide catalog
            ensureSystemServiceRequestCatalogSchema($pdo);
            $stmt = $pdo->query("SELECT * FROM system_service_request_catalog ORDER BY category ASC, display_order ASC, label ASC");
            echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            break;

        case 'add_system_service_request_type':
            // Root Admin: create or update an item in the global catalog
            if ($request_method === 'POST') {
                ensureSystemServiceRequestCatalogSchema($pdo);
                $input = json_decode(file_get_contents('php://input'), true) ?: [];
                $typeId = trim($input['type_id'] ?? '');
                $category = trim($input['category'] ?? '');
                $label = trim($input['label'] ?? '');
                $id = intval($input['id'] ?? 0);
                if (!$category || !$label) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'category and label are required']);
                    break;
                }
                if ($id > 0) {
                    $pdo->prepare("UPDATE system_service_request_catalog SET category = ?, label = ? WHERE id = ?")
                        ->execute([$category, $label, $id]);
                } else {
                    if (!$typeId) {
                        $typeId = strtolower(preg_replace('/[^a-z0-9]+/i', '_', $label));
                    }
                    $maxOrder = $pdo->query("SELECT COALESCE(MAX(display_order), -1) FROM system_service_request_catalog")->fetchColumn();
                    $pdo->prepare("INSERT INTO system_service_request_catalog (type_id, category, label, display_order) VALUES (?, ?, ?, ?)")
                        ->execute([$typeId, $category, $label, $maxOrder + 1]);
                }
                echo json_encode(['status' => 'success', 'message' => 'System service request type saved']);
            }
            break;

        case 'delete_system_service_request_type':
            // Root Admin: delete an item from the global catalog
            if ($request_method === 'POST') {
                ensureSystemServiceRequestCatalogSchema($pdo);
                $input = json_decode(file_get_contents('php://input'), true) ?: [];
                $id = intval($input['id'] ?? 0);
                if (!$id) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'id is required']);
                    break;
                }
                $pdo->prepare("DELETE FROM system_service_request_catalog WHERE id = ?")->execute([$id]);
                echo json_encode(['status' => 'success', 'message' => 'System service request type deleted']);
            }
            break;

        case 'get_service_request_types':
            // Returns a merged view of:
            //   1. Global system catalog items (source='system')
            //   2. Property-specific custom items not already in global catalog (source='custom')
            ensureSystemServiceRequestCatalogSchema($pdo);
            if ($propertyId) {
                $stmt = $pdo->prepare("
                    SELECT
                        s.id,
                        ? AS property_id,
                        s.type_id,
                        s.category,
                        s.label,
                        TRUE AS is_system_default,
                        s.display_order,
                        'system' AS source
                    FROM system_service_request_catalog s
                    UNION ALL
                    SELECT
                        p.id,
                        p.property_id,
                        p.type_id,
                        p.category,
                        p.label,
                        FALSE AS is_system_default,
                        p.display_order,
                        'custom' AS source
                    FROM service_request_types p
                    WHERE p.property_id = ?
                      AND p.is_system_default = FALSE
                    ORDER BY category ASC, source DESC, display_order ASC, label ASC
                ");
                $stmt->execute([$propertyId, $propertyId]);
            } else {
                // No property context: return global catalog only
                $stmt = $pdo->query("SELECT *, 'system' AS source FROM system_service_request_catalog ORDER BY category ASC, display_order ASC, label ASC");
            }
            echo json_encode(['status' => 'success', 'data' => array_map('convertSnakeToCamel', $stmt->fetchAll(PDO::FETCH_ASSOC))]);
            break;

        case 'save_service_request_type':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true) ?: [];
                $typeId = trim($input['type_id'] ?? '');
                $category = trim($input['category'] ?? '');
                $label = trim($input['label'] ?? '');
                $id = intval($input['id'] ?? 0);
                if (!$category || !$label) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'category and label are required']);
                    break;
                }
                $targetPropertyId = $propertyId ?: 1;
                if ($id > 0) {
                    $stmt = $pdo->prepare("
                        UPDATE service_request_types 
                        SET category = ?, label = ? 
                        WHERE id = ? AND property_id = ?
                    ");
                    $stmt->execute([$category, $label, $id, $targetPropertyId]);
                } else {
                    if (!$typeId) {
                        $typeId = strtolower(preg_replace('/[^a-z0-9]+/i', '_', trim($label)));
                    }
                    $stmt = $pdo->prepare("
                        INSERT INTO service_request_types (property_id, type_id, category, label, is_system_default, display_order)
                        VALUES (?, ?, ?, ?, FALSE, 999)
                        ON DUPLICATE KEY UPDATE category = VALUES(category), label = VALUES(label)
                    ");
                    $stmt->execute([$targetPropertyId, $typeId, $category, $label]);
                }
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
                $stmt = $pdo->prepare("SELECT id FROM service_request_types WHERE id = ? AND property_id = ?");
                $stmt->execute([$id, $propertyId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row) {
                    http_response_code(404);
                    echo json_encode(['status' => 'error', 'message' => 'Service request type not found']);
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
                $chargeAmount = !empty($input['charge_amount']) ? max(0, floatval($input['charge_amount'])) : 0.00;
                $scheduledAt = !empty($input['scheduled_at']) ? date('Y-m-d H:i:s', strtotime($input['scheduled_at'])) : null;

                $stmt = $pdo->prepare("
                    INSERT INTO service_requests (property_id, room_id, request_type, description, charge_amount, requested_by, scheduled_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ");
                $stmt->execute([$propertyId, $roomId, $requestType, $description, $chargeAmount, $requestedBy, $scheduledAt]);
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
                    $typeLabel = getServiceRequestTypeLabel($pdo, $propertyId, $requestType);
                    $msg = TelegramTemplates::render($pdo, 'service_request_created', [
                        'request_type' => $typeLabel,
                        'room_name' => $roomName,
                        'description' => $description ?: '(none)',
                        'requested_by' => $requestedBy,
                        'scheduled_at' => $scheduledAt ? date('d M Y, h:i A', strtotime($scheduledAt)) : 'Immediate',
                    ]);
                    if ($chargeAmount > 0) {
                        $msg .= "\n💰 <b>Charge Amount:</b> ₹" . number_format($chargeAmount, 2);
                    }

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
                } catch (Throwable $e) {
                    // Throwable, not just Exception - a missing sender.php/templates.php
                    // (see the conditional require above) throws Error (undefined
                    // class/function), which catch (Exception) does not catch.
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
                SELECT sr.id, sr.request_type, sr.description, sr.requested_by, sr.created_at, sr.scheduled_at,
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
