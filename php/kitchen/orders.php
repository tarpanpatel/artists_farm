<?php
/**
 * Kitchen Display System & KOT Orders Module
 * Function: Take food orders, manage KOT tickets, update order status, and staff meals.
 */

// Self-healing column check (same pattern as router.php's login_user migration) so a
// fresh install or an older DB snapshot picks these up automatically - no manual
// migration step required. ready_at/last_reminder_at back the Reminder/Nudge Engine:
// item_status already supports arbitrary VARCHAR values so 'Ready' needs no schema
// change, but WHEN it became ready and WHEN it was last nudged both need a home.
if (!function_exists('ensureOrderItemReminderColumns')) {
    function ensureOrderItemReminderColumns($pdo) {
        try {
            $cols = $pdo->query("SHOW COLUMNS FROM order_items")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('ready_at', $cols)) {
                $pdo->exec("ALTER TABLE order_items ADD COLUMN ready_at DATETIME NULL DEFAULT NULL");
            }
            if (!in_array('last_reminder_at', $cols)) {
                $pdo->exec("ALTER TABLE order_items ADD COLUMN last_reminder_at DATETIME NULL DEFAULT NULL");
            }
        } catch (Exception $e) {
            error_log("order_items reminder column migration error: " . $e->getMessage());
        }
    }
}

function handleKitchenRequests($pdo, $request_method, $action, $propertyId) {
    switch ($action) {
        case 'get_orders':
            try {
                ensureOrderItemReminderColumns($pdo);
                // Try orders + order_items first
                $sql = "SELECT o.id, o.guest_id, o.order_time, o.status, COALESCE(g.guest_name, 'Walk-in') as guest_name
                        FROM orders o
                        LEFT JOIN guests g ON o.guest_id = g.id
                        WHERE o.property_id = ?
                        ORDER BY o.order_time DESC";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([$propertyId]);
                $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

                foreach ($orders as &$order) {
                    try {
                        $itemStmt = $pdo->prepare("SELECT oi.id, oi.menu_item_id, m.name, oi.quantity, m.price as unit_price,
                                                  oi.item_status, oi.ready_at, oi.last_reminder_at
                                                  FROM order_items oi
                                                  LEFT JOIN menu_items m ON oi.menu_item_id = m.id
                                                  WHERE oi.order_id = ?");
                        $itemStmt->execute([$order['id']]);
                        $order['items'] = $itemStmt->fetchAll(PDO::FETCH_ASSOC);
                    } catch (PDOException $ie) {
                        $order['items'] = [];
                    }
                    $total = 0;
                    foreach ($order['items'] as $item) {
                        $total += ($item['unit_price'] ?? 0) * ($item['quantity'] ?? 1);
                    }
                    $order['total_amount'] = $total;
                }
                echo json_encode(['status' => 'success', 'data' => $orders]);
            } catch (PDOException $e) {
                try {
                    // Fallback to kitchen_orders table
                    $sql = "SELECT id, guest_id, room_number, items_json, total_amount, status, order_time FROM kitchen_orders WHERE property_id = ? ORDER BY order_time DESC";
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute([$propertyId]);
                    $raw = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    foreach ($raw as &$r) {
                        $r['items'] = json_decode($r['items_json'] ?? '[]', true);
                    }
                    echo json_encode(['status' => 'success', 'data' => $raw]);
                } catch (PDOException $e2) {
                    echo json_encode(['status' => 'success', 'data' => []]);
                }
            }
            break;

        case 'create_order':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $guest_id = $input['guest_id'] ?? null;
                try {
                    $stmt = $pdo->prepare("INSERT INTO orders (property_id, guest_id, order_time, status) VALUES (?, ?, NOW(), 'Pending')");
                    $stmt->execute([$propertyId, $guest_id]);
                    $order_id = $pdo->lastInsertId();

                    if (!empty($input['items']) && is_array($input['items'])) {
                        $itemStmt = $pdo->prepare("INSERT INTO order_items (order_id, menu_item_id, quantity, item_status) VALUES (?, ?, ?, 'Pending')");
                        foreach ($input['items'] as $item) {
                            $itemStmt->execute([$order_id, $item['menu_item_id'] ?? $item['id'], $item['quantity'] ?? 1]);
                        }
                    }
                    echo json_encode(['status' => 'success', 'id' => 'KOT-' . $order_id, 'message' => 'Kitchen ticket created successfully']);
                } catch (PDOException $e) {
                    $order_id = 'KOT-' . time();
                    echo json_encode(['status' => 'success', 'id' => $order_id, 'message' => 'Kitchen ticket created']);
                }
            }
            break;

        case 'update_order_status':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $id = str_replace('KOT-', '', $input['id']);
                try {
                    $stmt = $pdo->prepare("UPDATE orders SET status = ? WHERE id = ? AND property_id = ?");
                    $stmt->execute([$input['status'], $id, $propertyId]);
                } catch (PDOException $e) {
                    try {
                        $stmt = $pdo->prepare("UPDATE kitchen_orders SET status = ? WHERE id = ? AND property_id = ?");
                        $stmt->execute([$input['status'], $input['id'], $propertyId]);
                    } catch (PDOException $e2) {}
                }
                echo json_encode(['status' => 'success', 'message' => 'Order status updated to ' . $input['status']]);
            }
            break;

        case 'get_served_logs':
            try {
                $stmt = $pdo->prepare("SELECT id, order_id, item_name, quantity, served_by, guest_name, room_number, served_at FROM served_logs WHERE property_id = ? ORDER BY id DESC LIMIT 200");
                $stmt->execute([$propertyId]);
                $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(['status' => 'success', 'data' => $logs]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'success', 'data' => []]);
            }
            break;

        case 'add_served_log':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    // Ensure table exists
                    $stmt = $pdo->prepare("INSERT INTO served_logs (property_id, order_id, item_name, quantity, served_by, guest_name, room_number, served_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())");
                    $stmt->execute([
                        $propertyId,
                        $input['order_id'] ?? '',
                        $input['item_name'] ?? '',
                        $input['quantity'] ?? 1,
                        $input['served_by'] ?? '',
                        $input['guest_name'] ?? '',
                        $input['room_number'] ?? '',
                    ]);
                    echo json_encode(['status' => 'success']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        // Persists an item's Ready/Served status server-side (previously this only
        // lived in React state and reverted to Pending-looking on refresh). Setting
        // ready_at only on the FIRST transition into Ready keeps it a stable baseline
        // for the reminder engine even if the status is touched again later.
        case 'update_order_item_status':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $itemId = $input['item_id'] ?? null;
                $status = $input['status'] ?? '';
                if (!$itemId || !$status) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'item_id and status are required']);
                    break;
                }
                try {
                    ensureOrderItemReminderColumns($pdo);
                    if ($status === 'Ready') {
                        $stmt = $pdo->prepare("UPDATE order_items SET item_status = ?, ready_at = COALESCE(ready_at, NOW()) WHERE id = ?");
                    } else {
                        $stmt = $pdo->prepare("UPDATE order_items SET item_status = ? WHERE id = ?");
                    }
                    $stmt->execute([$status, $itemId]);
                    echo json_encode(['status' => 'success']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        // Called both by manual "Send Reminder" taps and by the auto-nudge poll below,
        // so either path resets the same countdown - the next nudge (auto or manual)
        // is always N minutes from whichever reminder fired most recently.
        case 'update_item_reminder_timestamp':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $itemId = $input['item_id'] ?? null;
                if (!$itemId) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'item_id is required']);
                    break;
                }
                try {
                    ensureOrderItemReminderColumns($pdo);
                    $stmt = $pdo->prepare("UPDATE order_items SET last_reminder_at = NOW() WHERE id = ?");
                    $stmt->execute([$itemId]);
                    echo json_encode(['status' => 'success']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        // Returns Pending items stuck too long and Ready items uncollected too long,
        // measured from last_reminder_at if one exists, else from the original event
        // (order_time / ready_at) - so the first auto-nudge still respects the
        // threshold from when the item actually became stale, not from page load.
        case 'check_stale_reminders':
            $thresholdMinutes = max(1, (int)($_GET['threshold_minutes'] ?? 5));
            try {
                ensureOrderItemReminderColumns($pdo);

                $pendingStmt = $pdo->prepare("
                    SELECT oi.id as item_id, o.id as order_id, m.name as dish_name, oi.quantity,
                           COALESCE(rp.name, 'N/A') as table_no, o.order_time,
                           TIMESTAMPDIFF(MINUTE, o.order_time, NOW()) as elapsed_minutes
                    FROM order_items oi
                    JOIN orders o ON oi.order_id = o.id
                    LEFT JOIN menu_items m ON oi.menu_item_id = m.id
                    LEFT JOIN guests g ON o.guest_id = g.id
                    LEFT JOIN properties rp ON g.room_id = rp.id
                    WHERE o.property_id = ?
                      AND (oi.item_status IS NULL OR oi.item_status = 'Pending')
                      AND TIMESTAMPDIFF(MINUTE, COALESCE(oi.last_reminder_at, o.order_time), NOW()) >= ?
                ");
                $pendingStmt->execute([$propertyId, $thresholdMinutes]);
                $pending = $pendingStmt->fetchAll(PDO::FETCH_ASSOC);

                // item_index mirrors telegram_webhook.php's positional resolution
                // (items ordered by id ASC within their order) so an auto-fired
                // "Tap when Served" button's serve_item_{order}_{index} callback
                // resolves to the same row the webhook would find.
                $readyStmt = $pdo->prepare("
                    SELECT oi.id as item_id, o.id as order_id, m.name as dish_name, oi.quantity,
                           COALESCE(rp.name, 'N/A') as table_no, oi.ready_at,
                           TIMESTAMPDIFF(MINUTE, oi.ready_at, NOW()) as elapsed_minutes,
                           (ROW_NUMBER() OVER (PARTITION BY oi.order_id ORDER BY oi.id ASC) - 1) as item_index
                    FROM order_items oi
                    JOIN orders o ON oi.order_id = o.id
                    LEFT JOIN menu_items m ON oi.menu_item_id = m.id
                    LEFT JOIN guests g ON o.guest_id = g.id
                    LEFT JOIN properties rp ON g.room_id = rp.id
                    WHERE o.property_id = ?
                      AND oi.item_status = 'Ready'
                      AND oi.ready_at IS NOT NULL
                      AND TIMESTAMPDIFF(MINUTE, COALESCE(oi.last_reminder_at, oi.ready_at), NOW()) >= ?
                ");
                $readyStmt->execute([$propertyId, $thresholdMinutes]);
                $ready = $readyStmt->fetchAll(PDO::FETCH_ASSOC);

                echo json_encode(['status' => 'success', 'data' => ['pending' => $pending, 'ready' => $ready]]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'success', 'data' => ['pending' => [], 'ready' => []]]);
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid kitchen action']);
            break;
    }
}
