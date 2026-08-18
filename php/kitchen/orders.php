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
require_once __DIR__ . '/../config/schema_cache.php';

if (!function_exists('ensureOrderItemReminderColumns')) {
    function ensureOrderItemReminderColumns($pdo) {
        if (isSchemaVerified('schema_order_item_reminders')) return;
        try {
            $cols = $pdo->query("SHOW COLUMNS FROM order_items")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('ready_at', $cols)) {
                $pdo->exec("ALTER TABLE order_items ADD COLUMN ready_at DATETIME NULL DEFAULT NULL");
            }
            if (!in_array('last_reminder_at', $cols)) {
                $pdo->exec("ALTER TABLE order_items ADD COLUMN last_reminder_at DATETIME NULL DEFAULT NULL");
            }
            markSchemaVerified('schema_order_item_reminders');
        } catch (Exception $e) {
            error_log("order_items reminder column migration error: " . $e->getMessage());
        }
    }
}

// Backs walk-in/counter orders (no guest_id - food prepared for someone not
// staying in a room). SUPERSEDED 17 Aug 2026 by walk_in_tabs.php: a walk-in
// settling per-order (via walk_in_name/settled_at/payment_method here) turned
// out to feel wrong in practice for anything beyond a single dish, since a
// table ordering twice needed two separate settlements instead of one bill.
// walk_in_tabs.php's `orders.walk_in_tab_id` is what new walk-in orders use
// now - these three columns stay in place (still self-healed) purely so old
// rows written before the switch keep reading back correctly.
if (!function_exists('ensureWalkInOrderColumns')) {
    function ensureWalkInOrderColumns($pdo) {
        if (isSchemaVerified('schema_walk_in_orders')) return;
        try {
            $cols = $pdo->query("SHOW COLUMNS FROM orders")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('walk_in_name', $cols)) {
                $pdo->exec("ALTER TABLE orders ADD COLUMN walk_in_name VARCHAR(150) NULL DEFAULT NULL");
            }
            if (!in_array('settled_at', $cols)) {
                $pdo->exec("ALTER TABLE orders ADD COLUMN settled_at DATETIME NULL DEFAULT NULL");
            }
            if (!in_array('payment_method', $cols)) {
                $pdo->exec("ALTER TABLE orders ADD COLUMN payment_method VARCHAR(30) NULL DEFAULT NULL");
            }
            markSchemaVerified('schema_walk_in_orders');
        } catch (Exception $e) {
            error_log("orders walk-in column migration error: " . $e->getMessage());
        }
    }
}

function handleKitchenRequests($pdo, $request_method, $action, $propertyId) {
    switch ($action) {
        case 'get_orders':
            try {
                ensureOrderItemReminderColumns($pdo);
                ensureWalkInOrderColumns($pdo);
                ensureWalkInTabSchema($pdo);
                // Try orders + order_items first. room_number was never
                // selected here at all (found 17 Aug 2026) - every order's
                // roomNumber came back blank the moment anything refetched
                // from the DB (get_orders never carried it, only the
                // client's own just-placed optimistic copy briefly did),
                // which is why a room guest's own served dishes showed no
                // room even though the guest genuinely has one.
                $sql = "SELECT o.id, o.guest_id, o.order_time, o.status, o.walk_in_tab_id,
                               COALESCE(g.guest_name, wt.label, o.walk_in_name, 'Walk-in') as guest_name,
                               p.name as room_number
                        FROM orders o
                        LEFT JOIN guests g ON o.guest_id = g.id
                        LEFT JOIN properties p ON g.room_id = p.id
                        LEFT JOIN walk_in_tabs wt ON o.walk_in_tab_id = wt.id
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
                ensureWalkInOrderColumns($pdo);
                ensureWalkInTabSchema($pdo);
                $input = json_decode(file_get_contents('php://input'), true);
                $guest_id = $input['guest_id'] ?? null;
                // A tab only means anything when there's no guest_id - a
                // guest-attached order is always room service, never a walk-in,
                // regardless of what the client sent.
                $walkInTabId = empty($guest_id) ? (int)($input['walk_in_tab_id'] ?? 0) ?: null : null;
                try {
                    $stmt = $pdo->prepare("INSERT INTO orders (property_id, guest_id, walk_in_tab_id, order_time, status) VALUES (?, ?, ?, NOW(), 'Pending')");
                    $stmt->execute([$propertyId, $guest_id, $walkInTabId]);
                    $order_id = $pdo->lastInsertId();

                    $itemsPayload = [];
                    if (!empty($input['items']) && is_array($input['items'])) {
                        // property_id was missing here (found 17 Aug 2026 while wiring
                        // this endpoint up for real - it had never actually been called
                        // from the frontend before, so the column's `DEFAULT 1` silently
                        // absorbed every row without anything noticing). Not currently
                        // read anywhere (order_items is always joined through orders,
                        // never filtered by its own property_id directly), but it's the
                        // same misattribution shape CLAUDE.md already flags for
                        // postFinancialLedger - fixing it now rather than leaving a second
                        // dormant copy of that bug.
                        $itemStmt = $pdo->prepare("INSERT INTO order_items (property_id, order_id, menu_item_id, quantity, item_status) VALUES (?, ?, ?, ?, 'Pending')");
                        foreach ($input['items'] as $item) {
                            $menuItemId = $item['menu_item_id'] ?? $item['id'] ?? null;
                            $qty = (int)($item['quantity'] ?? 1);
                            $itemStmt->execute([$propertyId, $order_id, $menuItemId, $qty]);
                            $nameStmt = $pdo->prepare("SELECT name FROM menu_items WHERE id = ?");
                            $nameStmt->execute([$menuItemId]);
                            $itemsPayload[] = ['name' => $nameStmt->fetchColumn() ?: 'Dish', 'qty' => $qty];
                        }
                    }
                    echo json_encode(['status' => 'success', 'id' => 'KOT-' . $order_id, 'order_id' => (int)$order_id, 'message' => 'Kitchen ticket created successfully']);

                    // Notify the kitchen group about the new ticket (best-effort;
                    // never let a Telegram hiccup fail the order itself).
                    try {
                        if (!function_exists('sendPropertyTelegramMessage')) {
                            require_once __DIR__ . '/../telegram/sender.php';
                        }
                        if (!class_exists('TelegramTemplates')) {
                            require_once __DIR__ . '/../telegram/templates.php';
                        }
                        $guestName = 'Walk-in';
                        if (!empty($guest_id)) {
                            $gStmt = $pdo->prepare("SELECT guest_name FROM guests WHERE id = ?");
                            $gStmt->execute([$guest_id]);
                            $guestName = $gStmt->fetchColumn() ?: 'Walk-in';
                        } elseif (!empty($walkInTabId)) {
                            $tStmt = $pdo->prepare("SELECT label FROM walk_in_tabs WHERE id = ?");
                            $tStmt->execute([$walkInTabId]);
                            $guestName = $tStmt->fetchColumn() ?: 'Walk-in';
                        }
                        $msg = TelegramTemplates::newKitchenTicket($order_id, $guestName, $itemsPayload);
                        sendPropertyTelegramMessage($pdo, $propertyId, 'kitchen', $msg, null, 'kitchen_new_order');
                    } catch (Exception $e) {
                        error_log("kitchen_new_order telegram dispatch failed: " . $e->getMessage());
                    }
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

                    // Whole-order status changes (e.g. the "Cancel Order" button)
                    // only ever touched orders.status - check_stale_reminders keys
                    // off order_items.item_status instead, which this left
                    // untouched. A cancelled order vanished from the Live Tickets
                    // queue but any item still sitting at item_status='Pending'
                    // kept matching that query forever, so the 60s reminder poll
                    // in KitchenManagement.tsx just kept re-sending "still
                    // pending" Telegram nudges for a ticket that no longer
                    // existed anywhere in the UI. Mirror the item->order cascade
                    // update_order_item_status already does, in this direction too.
                    if ($input['status'] === 'Cancelled') {
                        $pdo->prepare("UPDATE order_items SET item_status = 'Cancelled' WHERE order_id = ? AND (item_status IS NULL OR item_status NOT IN ('Served', 'Cancelled'))")
                            ->execute([$id]);
                    }
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
                $stmt = $pdo->prepare("SELECT id, order_id, item_name, quantity, served_by, guest_name, room_number, served_at, ready_at FROM served_logs WHERE property_id = ? ORDER BY id DESC LIMIT 200");
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
                    $guestName = $input['guest_name'] ?? '';
                    $roomNumber = $input['room_number'] ?? '';
                    
                    if ($roomNumber && ($guestName === '' || $guestName === 'Walk-in')) {
                        $rStmt = $pdo->prepare("SELECT id FROM properties WHERE name = ? AND parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM'");
                        $rStmt->execute([$roomNumber, $propertyId]);
                        $roomId = $rStmt->fetchColumn();
                        if ($roomId) {
                            $gStmt = $pdo->prepare("SELECT guest_name FROM guests WHERE room_id = ? AND checkin_date <= CURDATE() AND expected_checkout >= NOW() ORDER BY id DESC LIMIT 1");
                            $gStmt->execute([$roomId]);
                            $foundGuest = $gStmt->fetchColumn();
                            if ($foundGuest) {
                                $guestName = $foundGuest;
                            }
                        }
                    }

                    if ($guestName === '') $guestName = 'Walk-in';

                    $stmt = $pdo->prepare("INSERT INTO served_logs (property_id, order_id, item_name, quantity, served_by, guest_name, room_number, served_at, ready_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)");
                    $stmt->execute([
                        $propertyId,
                        $input['order_id'] ?? '',
                        $input['item_name'] ?? '',
                        $input['quantity'] ?? 1,
                        $input['served_by'] ?? '',
                        $guestName,
                        $roomNumber,
                        empty($input['ready_at']) ? null : date('Y-m-d H:i:s', strtotime($input['ready_at']))
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

                    // When every item on an order has been resolved (Served or
                    // individually Cancelled via the KDS "remove dish" control), the
                    // order itself needs to move out of the active queue. Two outcomes:
                    // - at least one dish was actually served -> Completed (mirrors the
                    //   Telegram webhook behaviour in webhook_handler.php)
                    // - every single item on the order was removed and nothing was ever
                    //   served -> Cancelled instead, since "Completed" would misreport a
                    //   ticket that never delivered anything.
                    if ($status === 'Served' || $status === 'Cancelled') {
                        $orderIdStmt = $pdo->prepare("SELECT order_id FROM order_items WHERE id = ?");
                        $orderIdStmt->execute([$itemId]);
                        $orderId = $orderIdStmt->fetchColumn();
                        if ($orderId) {
                            $pendingStmt = $pdo->prepare("SELECT COUNT(*) FROM order_items WHERE order_id = ? AND (item_status IS NULL OR LOWER(item_status) NOT IN ('served', 'cancelled'))");
                            $pendingStmt->execute([$orderId]);
                            if ((int)$pendingStmt->fetchColumn() === 0) {
                                $servedCountStmt = $pdo->prepare("SELECT COUNT(*) FROM order_items WHERE order_id = ? AND LOWER(item_status) = 'served'");
                                $servedCountStmt->execute([$orderId]);
                                $finalStatus = (int)$servedCountStmt->fetchColumn() > 0 ? 'Completed' : 'Cancelled';
                                try {
                                    $pdo->prepare("UPDATE orders SET status = ?, served_at = COALESCE(served_at, NOW()) WHERE id = ? AND property_id = ?")->execute([$finalStatus, $orderId, $propertyId]);
                                } catch (PDOException $eOrder) {
                                    try {
                                        $pdo->prepare("UPDATE kitchen_orders SET status = ? WHERE id = ? AND property_id = ?")->execute([$finalStatus, $orderId, $propertyId]);
                                    } catch (PDOException $eKot) {}
                                }
                            }
                        }
                    }

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
                           COALESCE(rp.name, 'N/A') as room_no, o.order_time,
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
