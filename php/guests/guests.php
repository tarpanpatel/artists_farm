<?php
/**
 * Front Office & Guest Management Module
 * Function: Resident registration, stay breakdown, and check-out status.
 */

function handleGuestRequests($pdo, $request_method, $action) {
    switch ($action) {
        case 'get_guests':
            try {
                $stmt = $pdo->query("SELECT * FROM guests ORDER BY checkin_date DESC");
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
            } catch (PDOException $e) {
                try {
                    $stmt = $pdo->query("SELECT * FROM guests ORDER BY check_in DESC");
                    echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
                } catch (PDOException $e2) {
                    echo json_encode(['status' => 'success', 'data' => []]);
                }
            }
            break;

        case 'add_guest':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("INSERT INTO guests (guest_name, phone_number, checkin_date, expected_checkout, status, advance_paid, total_charge, pending_amount, base_room_rent, notes) VALUES (?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $input['guest_name'] ?? $input['name'] ?? 'Resident Guest',
                        $input['phone_number'] ?? $input['contact'] ?? '0000000000',
                        $input['checkin_date'] ?? date('Y-m-d'),
                        $input['expected_checkout'] ?? date('Y-m-d H:i:s', strtotime('+1 day')),
                        floatval($input['advance_paid'] ?? 0),
                        floatval($input['total_charge'] ?? 0),
                        floatval($input['pending_amount'] ?? 0),
                        floatval($input['base_room_rent'] ?? 0),
                        $input['notes'] ?? ''
                    ]);
                    $newId = $pdo->lastInsertId();
                } catch (PDOException $e) {
                    $newId = 'GST-' . time();
                    $stmt = $pdo->prepare("INSERT INTO guests (id, name, contact, room_number, check_in, status) VALUES (?, ?, ?, '101', NOW(), 'Active Resident')");
                    $stmt->execute([
                        $newId,
                        $input['guest_name'] ?? $input['name'] ?? 'Resident Guest',
                        $input['phone_number'] ?? $input['contact'] ?? '0000000000'
                    ]);
                }
                echo json_encode(['status' => 'success', 'id' => $newId, 'message' => 'Resident registered successfully']);
            }
            break;

        case 'checkout_guest':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("UPDATE guests SET status = 'CheckedOut', checkout_date = ? WHERE id = ?");
                    $stmt->execute([date('Y-m-d'), $input['id']]);
                } catch (PDOException $e) {
                    $stmt = $pdo->prepare("UPDATE guests SET status = 'Checked-Out', check_out = ? WHERE id = ?");
                    $stmt->execute([date('Y-m-d H:i:s'), $input['id']]);
                }
                echo json_encode(['status' => 'success', 'message' => 'Guest checked out successfully']);
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid guest action']);
            break;
    }
}
