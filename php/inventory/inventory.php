<?php
/**
 * Stock & Requisitions Log Module
 * Function: Requisitions, warehouse stock fulfillment, deficit shortfalls, and kitchen purchase tracking.
 */

function handleInventoryRequests($pdo, $request_method, $action) {
    switch ($action) {
        case 'get_inventory':
            try {
                // Try req_catalog first (full catalog with categories)
                $sql = "SELECT r.id, r.item_name as name, COALESCE(c.name, 'General') as category, r.current_stock as quantity, r.unit_label as unit 
                        FROM req_catalog r 
                        LEFT JOIN material_categories c ON r.category_id = c.id 
                        ORDER BY r.item_name ASC";
                $stmt = $pdo->query($sql);
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
            } catch (PDOException $e) {
                try {
                    // Fallback to inventory_items table
                    $sql = "SELECT id, name, category, quantity, unit FROM inventory_items ORDER BY name ASC";
                    $stmt = $pdo->query($sql);
                    echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
                } catch (PDOException $e2) {
                    // Auto-create req_catalog table if both are missing
                    $pdo->exec("CREATE TABLE IF NOT EXISTS `req_catalog` (
                        `id` INT AUTO_INCREMENT PRIMARY KEY,
                        `item_name` VARCHAR(255) NOT NULL,
                        `category_id` INT DEFAULT 1,
                        `current_stock` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                        `unit_label` VARCHAR(20) NOT NULL DEFAULT 'Kg'
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                    $stmt = $pdo->query("SELECT id, item_name as name, 'General' as category, current_stock as quantity, unit_label as unit FROM req_catalog ORDER BY item_name ASC");
                    echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
                }
            }
            break;

        case 'update_stock':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("UPDATE req_catalog SET current_stock = ? WHERE id = ?");
                    $stmt->execute([$input['quantity'], $input['id']]);
                } catch (PDOException $e) {
                    $stmt = $pdo->prepare("UPDATE inventory_items SET quantity = ? WHERE id = ?");
                    $stmt->execute([$input['quantity'], $input['id']]);
                }
                echo json_encode(['status' => 'success', 'message' => 'Stock quantity updated']);
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid inventory action']);
            break;
    }
}
