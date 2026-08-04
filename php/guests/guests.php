<?php
/**
 * Front Office & Guest Management Module
 * Function: Resident registration, stay breakdown, and check-out status.
 */

function convertSnakeToCamel($array) {
    $result = [];
    foreach ($array as $key => $value) {
        $camelKey = preg_replace_callback('/_([a-z])/', function($m) { return strtoupper($m[1]); }, $key);
        $result[$camelKey] = $value;
    }
    return $result;
}

function handleGuestRequests($pdo, $request_method, $action, $propertyId) {
    switch ($action) {
        case 'get_guests':
            try {
                $stmt = $pdo->prepare("
                    SELECT g.*, COALESCE(r.name, 'Unassigned') as roomNumber
                    FROM guests g
                    LEFT JOIN properties r ON g.room_id = r.id AND r.property_type = 'MULTI_KEY_ROOM'
                    WHERE g.property_id = ? AND (g.room_id IS NULL OR r.id IS NULL OR r.is_deleted = 0)
                    ORDER BY g.checkin_date DESC
                ");
                $stmt->execute([$propertyId]);
                $guests = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $guests = array_map(function($guest) {
                    unset($guest['room_number']);
                    return convertSnakeToCamel($guest);
                }, $guests);
                echo json_encode(['status' => 'success', 'data' => $guests]);
            } catch (PDOException $e) {
                try {
                    $stmt = $pdo->prepare("SELECT * FROM guests WHERE property_id = ? ORDER BY checkin_date DESC");
                    $stmt->execute([$propertyId]);
                    $guests = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    $guests = array_map(function($guest) {
                        unset($guest['room_number']);
                        return convertSnakeToCamel($guest);
                    }, $guests);
                    echo json_encode(['status' => 'success', 'data' => $guests]);
                } catch (PDOException $e2) {
                    echo json_encode(['status' => 'success', 'data' => []]);
                }
            }
            break;

        case 'add_guest':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("INSERT INTO guests (guest_name, phone_number, checkin_date, expected_checkout, status, advance_paid, total_charge, pending_amount, base_room_rent, notes, booking_source, no_of_guests, property_id) VALUES (?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?, ?, ?, ?)");
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
                        $propertyId,
                    ]);
                    $newId = $pdo->lastInsertId();
                    $advance = floatval($input['advance_paid'] ?? 0);
                    if ($advance > 0) {
                        postFinancialLedger($pdo, [
                            'entry_key' => 'guest_advance:' . $newId,
                            'direction' => 'credit',
                            'amount' => $advance,
                            'category' => 'Guest Registration Advance',
                            'payment_method' => $input['payment_method'] ?? 'Cash',
                            'party_type' => 'guest',
                            'party_id' => $newId,
                            'party_name' => $input['guest_name'] ?? $input['name'] ?? 'Resident Guest',
                            'source_type' => 'guest_registration',
                            'source_id' => $newId,
                            'description' => 'Advance collected at guest registration',
                        ]);
                    }

                    // Send Telegram notification for new guest booking
                    require_once __DIR__ . '/../telegram/sender.php';
                    $guestName = $input['guest_name'] ?? $input['name'] ?? 'Resident Guest';
                    $checkinDate = $input['checkin_date'] ?? date('Y-m-d');
                    $checkoutDate = $input['expected_checkout'] ?? date('Y-m-d', strtotime('+1 day'));
                    $totalCharge = floatval($input['total_charge'] ?? 0);
                    $advancePaid = floatval($input['advance_paid'] ?? 0);
                    $pendingAmount = floatval($input['pending_amount'] ?? 0);
                    $noOfGuests = intval($input['no_of_guests'] ?? 1);
                    $phone = $input['phone_number'] ?? $input['contact'] ?? 'N/A';

                    $telegramMessage = "🏨 <b>NEW GUEST BOOKING</b>\n\n";
                    $telegramMessage .= "👤 <b>Guest Name:</b> {$guestName}\n";
                    $telegramMessage .= "📱 <b>Phone:</b> {$phone}\n";
                    $telegramMessage .= "👥 <b>No. of Guests:</b> {$noOfGuests}\n\n";
                    $telegramMessage .= "📅 <b>Check-in:</b> {$checkinDate}\n";
                    $telegramMessage .= "📅 <b>Check-out:</b> {$checkoutDate}\n\n";
                    $telegramMessage .= "💰 <b>Total Charge:</b> ₹{$totalCharge}\n";
                    $telegramMessage .= "✅ <b>Advance Paid:</b> ₹{$advancePaid}\n";
                    $telegramMessage .= "⏳ <b>Pending:</b> ₹{$pendingAmount}\n\n";
                    $telegramMessage .= "🆔 <b>Booking ID:</b> {$newId}";

                    sendPropertyTelegramMessage($pdo, $propertyId, 'admin', $telegramMessage);

                    echo json_encode(['status' => 'success', 'id' => $newId, 'message' => 'Resident registered successfully']);
                } catch (PDOException $e) {
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to register guest: ' . $e->getMessage()]);
                }
            }
            break;

        case 'update_guest':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $guestId = $input['id'];
                    $roomId = isset($input['room_id']) && $input['room_id'] !== '' ? intval($input['room_id']) : null;
                    $newCheckin = $input['checkin_date'] ?? date('Y-m-d');
                    $newCheckout = $input['expected_checkout'] ?? date('Y-m-d H:i:s', strtotime('+1 day'));

                    if ($roomId !== null) {
                        $conflictStmt = $pdo->prepare("SELECT id FROM guests WHERE room_id = ? AND status = 'Active' AND id != ? AND property_id = ? AND checkin_date < ? AND expected_checkout > ? LIMIT 1");
                        $conflictStmt->execute([$roomId, $guestId, $propertyId, $newCheckout, $newCheckin]);
                        if ($conflictStmt->fetch()) {
                            http_response_code(409);
                            echo json_encode(['status' => 'error', 'message' => 'Selected room already has an active booking for these dates']);
                            break;
                        }
                    }

                    $totalCharge = floatval($input['total_charge'] ?? 0);
                    $advancePaid = floatval($input['advance_paid'] ?? 0);
                    $pendingAmount = max(0, $totalCharge - $advancePaid);

                    if ($roomId !== null) {
                        $stmt = $pdo->prepare("UPDATE guests SET guest_name = ?, phone_number = ?, checkin_date = ?, expected_checkout = ?, room_id = ?, no_of_guests = ?, base_room_rent = ?, total_charge = ?, advance_paid = ?, pending_amount = ? WHERE id = ? AND property_id = ?");
                        $stmt->execute([
                            $input['guest_name'] ?? $input['name'] ?? '',
                            $input['phone_number'] ?? $input['contact'] ?? '',
                            $input['checkin_date'] ?? date('Y-m-d'),
                            $input['expected_checkout'] ?? date('Y-m-d H:i:s', strtotime('+1 day')),
                            $roomId,
                            intval($input['no_of_guests'] ?? 1),
                            floatval($input['base_room_rent'] ?? 0),
                            $totalCharge,
                            $advancePaid,
                            $pendingAmount,
                            $guestId,
                            $propertyId,
                        ]);
                    } else {
                        $stmt = $pdo->prepare("UPDATE guests SET guest_name = ?, phone_number = ?, checkin_date = ?, expected_checkout = ?, no_of_guests = ?, base_room_rent = ?, total_charge = ?, advance_paid = ?, pending_amount = ? WHERE id = ? AND property_id = ?");
                        $stmt->execute([
                            $input['guest_name'] ?? $input['name'] ?? '',
                            $input['phone_number'] ?? $input['contact'] ?? '',
                            $input['checkin_date'] ?? date('Y-m-d'),
                            $input['expected_checkout'] ?? date('Y-m-d H:i:s', strtotime('+1 day')),
                            intval($input['no_of_guests'] ?? 1),
                            floatval($input['base_room_rent'] ?? 0),
                            $totalCharge,
                            $advancePaid,
                            $pendingAmount,
                            $guestId,
                            $propertyId,
                        ]);
                    }
                    echo json_encode(['status' => 'success', 'message' => 'Booking updated successfully']);
                } catch (PDOException $e) {
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to update guest: ' . $e->getMessage()]);
                }
            }
            break;

        case 'checkout_guest':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("UPDATE guests SET status = 'CheckedOut', checkout_date = ? WHERE id = ? AND property_id = ?");
                    $stmt->execute([date('Y-m-d'), $input['id'], $propertyId]);
                } catch (PDOException $e) {
                    $stmt = $pdo->prepare("UPDATE guests SET status = 'CheckedOut', check_out = ? WHERE id = ? AND property_id = ?");
                    $stmt->execute([date('Y-m-d H:i:s'), $input['id'], $propertyId]);
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
