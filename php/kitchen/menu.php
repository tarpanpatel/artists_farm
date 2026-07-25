<?php
/**
 * Food Menu Catalog & RBAC Menu Manager Module
 * Function: Menu dish inventory, prices, categories, and custom dishes builder.
 */

function handleMenuRequests($pdo, $request_method, $action) {
    switch ($action) {
        case 'get_menu':
            $sql = "SELECT m.id, m.name, COALESCE(c.name, 'General') as category, m.price, CASE WHEN m.is_hidden = 0 THEN 1 ELSE 0 END as is_available 
                    FROM menu_items m 
                    LEFT JOIN menu_categories c ON m.category_id = c.id 
                    ORDER BY c.sort_order, m.name ASC";
            $stmt = $pdo->query($sql);
            echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
            break;

        case 'add_menu_item':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $stmt = $pdo->prepare("INSERT INTO menu_items (name, category_id, price, is_hidden) VALUES (?, ?, ?, 0)");
                $stmt->execute([
                    $input['name'],
                    $input['category_id'] ?? 1,
                    $input['price']
                ]);
                echo json_encode(['status' => 'success', 'message' => 'Menu item created successfully']);
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid menu action']);
            break;
    }
}
