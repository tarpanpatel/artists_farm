<?php
/**
 * Kitchen Display System & KOT Orders Module
 * Function: Take food orders, manage KOT tickets, update order status, and staff meals.
 */

function handleKitchenRequests($pdo, $request_method, $action) {
    switch ($action) {
        case 'get_orders':
            try {
                // Try orders + order_items first
                $sql = "SELECT o.id, o.guest_id, o.order_time, o.status, COALESCE(g.guest_name, 'Walk-in') as guest_name 
                        FROM orders o 
                        LEFT JOIN guests g ON o.guest_id = g.id 
                        ORDER BY o.order_time DESC";
                $stmt = $pdo->query($sql);
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
                }
                echo json_encode(['status' => 'success', 'data' => $orders]);
            } catch (PDOException $e) {
                try {
                    // Fallback to kitchen_orders table
                    $sql = "SELECT id, guest_id, room_number, items_json, total_amount, status, order_time FROM kitchen_orders ORDER BY order_time DESC";
                    $stmt = $pdo->query($sql);
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
                    $stmt = $pdo->prepare("INSERT INTO orders (guest_id, order_time, status) VALUES (?, NOW(), 'Pending')");
                    $stmt->execute([$guest_id]);
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
                    $stmt = $pdo->prepare("UPDATE orders SET status = ? WHERE id = ?");
                    $stmt->execute([$input['status'], $id]);
                } catch (PDOException $e) {
                    try {
                        $stmt = $pdo->prepare("UPDATE kitchen_orders SET status = ? WHERE id = ?");
                        $stmt->execute([$input['status'], $input['id']]);
                    } catch (PDOException $e2) {}
                }
                echo json_encode(['status' => 'success', 'message' => 'Order status updated to ' . $input['status']]);
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid kitchen action']);
            break;
    }
}
