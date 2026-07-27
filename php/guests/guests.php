<?php
/**
 * Front Office & Guest Management Module
 * Function: Resident registration, stay breakdown, and check-out status.
 */

function handleGuestRequests($pdo, $request_method, $action) {
    switch ($action) {
        case 'get_guests':
            $count = 0;
            try { $count = $pdo->query("SELECT COUNT(*) FROM guests")->fetchColumn(); } catch (PDOException $e) {}
            if ($count == 0) {
                $seedGuests = [
                    ['10','Villa 101 Resident Group','8888888','2026-07-20','2026-07-21','2026-07-21','Villa 101','Active','Jain Food & Misc Arrangement (+₹200)'],
                    ['8','Jain Group','8888888','2026-07-17','2026-07-18','2026-07-18','Villa 102','Booked','Jain Food requested - Advance ₹5000'],
                    ['7','Current Active Guest','9777777777','2026-07-16','2026-07-17','2026-07-16','Royal Cottage 1','CheckedOut','Decoration Fees ₹1900, Discount Rebate ₹200'],
                    ['9','Private Guest','333333333','2026-07-16','2026-07-17','2026-07-19','Villa 103','CheckedOut','Decoration Fees ₹500, Discount Rebate ₹6'],
                    ['6','Joshi Group (15 Jul)','9666666666','2026-07-15','2026-07-16','2026-07-16','Villa 103','CheckedOut','Settled - Advance ₹5000 by Tarpan'],
                    ['5','Singh Group (14 Jul)','9555555555','2026-07-14','2026-07-15','2026-07-15','Villa 104','CheckedOut','Settled - Advance ₹5000 by Tarpan'],
                    ['4','Guest Rana','9444444444','2026-07-13','2026-07-14','2026-07-14','Villa 105','CheckedOut','Room Service +Petrol ₹500'],
                    ['3','Guest Kinkar','9333333333','2026-07-12','2026-07-13','2026-07-13','Villa 106','CheckedOut','Room Service +Petrol ₹500'],
                    ['2','Guest Ramesh','9222222222','2026-07-11','2026-07-12','2026-07-12','Villa 107','CheckedOut','Settled'],
                    ['1','Guest Pranay','9111111111','2026-07-10','2026-07-11','2026-07-11','Villa 108','CheckedOut','Settled'],
                ];
                // Try modern schema first
                try {
                    $stmt = $pdo->prepare("INSERT INTO guests (id, guest_name, phone_number, checkin_date, expected_checkout, checkout_date, room_number, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    foreach ($seedGuests as $g) {
                        $stmt->execute($g);
                    }
                } catch (PDOException $e) {
                    // Fallback to old schema
                    try {
                        $stmt = $pdo->prepare("INSERT INTO guests (id, name, contact, check_in, expected_checkout, check_out, room_number, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                        foreach ($seedGuests as $g) {
                            $stmt->execute([$g[0], $g[1], $g[2], $g[3], $g[4], $g[5], $g[6], $g[7], $g[8]]);
                        }
                    } catch (PDOException $e2) {}
                }
            }
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
                    $stmt = $pdo->prepare("INSERT INTO guests (guest_name, phone_number, checkin_date, expected_checkout, status, advance_paid, total_charge, pending_amount, base_room_rent, notes, booking_source, no_of_guests) VALUES (?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $input['guest_name'] ?? $input['name'] ?? 'Resident Guest',
                        $input['phone_number'] ?? $input['contact'] ?? '0000000000',
                        $input['checkin_date'] ?? date('Y-m-d'),
                        $input['expected_checkout'] ?? date('Y-m-d H:i:s', strtotime('+1 day')),
                        floatval($input['advance_paid'] ?? 0),
                        floatval($input['total_charge'] ?? 0),
                        floatval($input['pending_amount'] ?? 0),
                        floatval($input['base_room_rent'] ?? 0),
                        $input['notes'] ?? '',
                        $input['booking_source'] ?? '',
                        intval($input['no_of_guests'] ?? 1),
                    ]);
                    $newId = $pdo->lastInsertId();
                    echo json_encode(['status' => 'success', 'id' => $newId, 'message' => 'Resident registered successfully']);
                } catch (PDOException $e) {
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to register guest: ' . $e->getMessage()]);
                }
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
