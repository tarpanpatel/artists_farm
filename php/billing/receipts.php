<?php
/**
 * Receipts & Past Billing Archive Module
 * Function: Persistent checkout receipt storage and retrieval from billing_receipts table.
 */

function handleReceiptRequests($pdo, $request_method, $action) {
    // Auto-create billing_receipts table
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS `billing_receipts` (
            `id` VARCHAR(50) PRIMARY KEY,
            `guest_id` VARCHAR(50) DEFAULT '',
            `guest_name` VARCHAR(100) DEFAULT '',
            `room_number` VARCHAR(50) DEFAULT '',
            `checkin_date` VARCHAR(30) DEFAULT '',
            `checkout_date` VARCHAR(30) DEFAULT '',
            `room_rate_per_night` DECIMAL(10,2) DEFAULT 0,
            `nights_count` INT DEFAULT 0,
            `room_rent` DECIMAL(10,2) DEFAULT 0,
            `room_total` DECIMAL(10,2) DEFAULT 0,
            `food_total` DECIMAL(10,2) DEFAULT 0,
            `kitchen_total` DECIMAL(10,2) DEFAULT 0,
            `misc_total` DECIMAL(10,2) DEFAULT 0,
            `discount` DECIMAL(10,2) DEFAULT 0,
            `grand_total` DECIMAL(10,2) DEFAULT 0,
            `advance_paid` DECIMAL(10,2) DEFAULT 0,
            `payment_method` VARCHAR(50) DEFAULT 'Cash',
            `status` VARCHAR(30) DEFAULT 'Paid',
            `paid_at` VARCHAR(30) DEFAULT '',
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    } catch (PDOException $e) {}

    switch ($action) {
        case 'get_receipts':
            try {
                $stmt = $pdo->query("SELECT * FROM billing_receipts ORDER BY created_at DESC");
                $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
                if (empty($data)) {
                    // Fallback: try to reconstruct from audit_logs if billing_receipts is empty
                    $stmt = $pdo->query("SELECT * FROM audit_logs WHERE action LIKE '%Checkout%' ORDER BY timestamp DESC");
                    $auditData = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    echo json_encode(['status' => 'success', 'data' => $auditData]);
                } else {
                    echo json_encode(['status' => 'success', 'data' => $data]);
                }
            } catch (PDOException $e) {
                echo json_encode(['status' => 'success', 'data' => []]);
            }
            break;

        case 'save_receipt':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("INSERT INTO billing_receipts (id, guest_id, guest_name, room_number, checkin_date, checkout_date, room_rate_per_night, nights_count, room_rent, room_total, food_total, kitchen_total, misc_total, discount, grand_total, advance_paid, payment_method, status, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE guest_name=VALUES(guest_name), grand_total=VALUES(grand_total), status=VALUES(status)");
                    $stmt->execute([
                        $input['id'] ?? 'REC-' . time(),
                        $input['guestId'] ?? '',
                        $input['guestName'] ?? '',
                        $input['roomNumber'] ?? '',
                        $input['checkinDate'] ?? '',
                        $input['checkoutDate'] ?? '',
                        $input['roomRatePerNight'] ?? 0,
                        $input['nightsCount'] ?? 0,
                        $input['roomRent'] ?? 0,
                        $input['roomTotal'] ?? 0,
                        $input['foodTotal'] ?? 0,
                        $input['kitchenTotal'] ?? 0,
                        $input['miscTotal'] ?? 0,
                        $input['discount'] ?? 0,
                        $input['grandTotal'] ?? 0,
                        $input['advancePaid'] ?? 0,
                        $input['paymentMethod'] ?? 'Cash',
                        $input['status'] ?? 'Paid',
                        $input['paidAt'] ?? date('Y-m-d H:i:s')
                    ]);

                    // Also log to audit trail
                    try {
                        $logStmt = $pdo->prepare("INSERT INTO audit_logs (timestamp, user, action) VALUES (?, ?, ?)");
                        $logStmt->execute([
                            date('Y-m-d H:i:s'),
                            $input['guestName'] ?? 'Guest',
                            'Completed Split Checkout for Guest ' . ($input['guestId'] ?? 'Room') . ' Amount: ₹' . ($input['grandTotal'] ?? 0)
                        ]);
                    } catch (PDOException $la) {}

                    echo json_encode(['status' => 'success', 'message' => 'Receipt saved successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid receipts action']);
            break;
    }
}
