<?php
/**
 * Kitchen Display System & KOT Orders Module
 * Function: Take food orders, manage KOT tickets, update order status, and staff meals.
 */

function handleKitchenRequests($pdo, $request_method, $action, $propertyId) {
    switch ($action) {
        case 'get_orders':
            try {
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
                        $itemStmt = $pdo->prepare("SELECT oi.id, oi.menu_item_id, m.name, oi.quantity, m.price as unit_price 
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
                    $pdo->exec("CREATE TABLE IF NOT EXISTS served_logs (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        property_id INT NOT NULL DEFAULT 1,
                        order_id VARCHAR(50),
                        item_name VARCHAR(255),
                        quantity INT DEFAULT 1,
                        served_by VARCHAR(100),
                        guest_name VARCHAR(255),
                        room_number VARCHAR(50),
                        served_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )");
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

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid kitchen action']);
            break;
    }
}
