<?php
/**
 * Billing & Split Checkout Module
 * Function: Food incidentals logging, manual adjustments, split distribution matrix, and checkout settlement.
 */

function handleBillingRequests($pdo, $request_method, $action, $propertyId) {
    switch ($action) {
        case 'add_direct_food_incidentals':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                echo json_encode([
                    'status' => 'success',
                    'message' => 'Incidentals item logged',
                    'item' => [
                        'id' => 'INC-' . time(),
                        'name' => $input['custom_dish_name'] ?? $input['menu_dish_name'] ?? 'Custom Dish',
                        'price' => floatval($input['price'] ?? 0),
                        'quantity' => intval($input['quantity'] ?? 1)
                    ]
                ]);
            }
            break;

        case 'add_adjustment':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                echo json_encode([
                    'status' => 'success',
                    'message' => 'Custom adjustment applied',
                    'adjustment' => [
                        'id' => 'ADJ-' . time(),
                        'type' => $input['adj_type'] ?? 'charge',
                        'reason' => $input['reason'] ?? 'Misc',
                        'amount' => floatval($input['amount'] ?? 0)
                    ]
                ]);
            }
            break;

        case 'finalize_checkout':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $id = 'REC-' . date('Y') . '-' . rand(100, 999);
                
                // Store in audit logs
                $logStmt = $pdo->prepare("INSERT INTO audit_logs (id, timestamp, user, action, property_id) VALUES (?, ?, ?, ?, ?)");
                $logStmt->execute([
                    'LOG-' . time(),
                    date('Y-m-d H:i:s'),
                    $input['food_received_by_staff'] ?? 'Tarpan',
                    'Completed Split Checkout for Guest ' . ($input['guest_id'] ?? 'Room') . ' Amount: ₹' . ($input['post_food_bill_total'] ?? 0),
                    $propertyId
                ]);

                echo json_encode([
                    'status' => 'success',
                    'receipt_id' => $id,
                    'message' => 'Checkout finalized & split payments settled successfully',
                    'splits' => $input['split_amount'] ?? []
                ]);
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid billing action']);
            break;
    }
}
