<?php
/**
 * Create 3 additional test rooms and demo bookings
 * Access: /php/api/create_test_rooms.php?action=create
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/guest_status.php';

$action = $_GET['action'] ?? 'info';

if ($action === 'create') {
    try {
        $pdo->beginTransaction();

        // Get Goa Homes property ID
        $stmt = $pdo->prepare("SELECT id FROM properties WHERE slug = ? AND parent_property_id IS NULL LIMIT 1");
        $stmt->execute(['goa-homes']);
        $property = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$property) {
            throw new Exception('Goa Homes property not found');
        }

        $propertyId = $property['id'];

        // Create 3 more rooms (103, 104, 105)
        for ($i = 103; $i <= 105; $i++) {
            $roomSlug = 'room-' . $i;
            $stmt = $pdo->prepare("
                INSERT INTO properties (parent_property_id, property_type, name, slug, status)
                VALUES (?, 'MULTI_KEY_ROOM', ?, ?, 'Available')
                ON DUPLICATE KEY UPDATE status='Available'
            ");
            $stmt->execute([$propertyId, "Room $i", $roomSlug]);
        }

        // Add test bookings to new rooms with back-to-back bookings
        $testBookings = [
            // Room 103: Back-to-back
            [
                'name' => 'Alice Brown',
                'phone' => '9988776659',
                'checkin' => date('Y-m-d', strtotime('+6 days')),
                'checkout' => date('Y-m-d', strtotime('+9 days')),
                'room' => 'Room 103',
                'rate' => 3500,
                'total' => 10500,
                'advance' => 3500
            ],
            [
                'name' => 'Bob Green',
                'phone' => '9988776660',
                'checkin' => date('Y-m-d', strtotime('+9 days')),
                'checkout' => date('Y-m-d', strtotime('+12 days')),
                'room' => 'Room 103',
                'rate' => 3500,
                'total' => 10500,
                'advance' => 4000
            ],
            // Room 104: Back-to-back
            [
                'name' => 'Carol White',
                'phone' => '9988776661',
                'checkin' => date('Y-m-d', strtotime('+3 days')),
                'checkout' => date('Y-m-d', strtotime('+6 days')),
                'room' => 'Room 104',
                'rate' => 4200,
                'total' => 12600,
                'advance' => 5000
            ],
            [
                'name' => 'David Lee',
                'phone' => '9988776663',
                'checkin' => date('Y-m-d', strtotime('+6 days')),
                'checkout' => date('Y-m-d', strtotime('+9 days')),
                'room' => 'Room 104',
                'rate' => 4200,
                'total' => 12600,
                'advance' => 5000
            ],
            // Room 105: Back-to-back
            [
                'name' => 'Fiona Taylor',
                'phone' => '9988776664',
                'checkin' => date('Y-m-d', strtotime('+7 days')),
                'checkout' => date('Y-m-d', strtotime('+10 days')),
                'room' => 'Room 105',
                'rate' => 3800,
                'total' => 11400,
                'advance' => 4000
            ],
            [
                'name' => 'George Harris',
                'phone' => '9988776665',
                'checkin' => date('Y-m-d', strtotime('+10 days')),
                'checkout' => date('Y-m-d', strtotime('+13 days')),
                'room' => 'Room 105',
                'rate' => 3800,
                'total' => 11400,
                'advance' => 4000
            ],
        ];

        foreach ($testBookings as $booking) {
            // Get room ID
            $stmt = $pdo->prepare("SELECT id FROM properties WHERE parent_property_id = ? AND name = ? LIMIT 1");
            $stmt->execute([$propertyId, $booking['room']]);
            $room = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($room) {
                $stmt = $pdo->prepare("
                    INSERT INTO guests (property_id, guest_name, phone_number, checkin_date, expected_checkout, status, no_of_guests, room_id, per_night_charges, total_charge, advance_paid)
                    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE status=?
                ");
                $stmt->execute([
                    $propertyId,
                    $booking['name'],
                    $booking['phone'],
                    $booking['checkin'],
                    $booking['checkout'],
                    GUEST_STATUS_CHECKED_IN,
                    $room['id'],
                    $booking['rate'],
                    $booking['total'],
                    $booking['advance'],
                    GUEST_STATUS_CHECKED_IN
                ]);
            }
        }

        $pdo->commit();
        echo json_encode(['status' => 'success', 'message' => 'Created 3 new rooms with test bookings']);

    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
} else {
    echo json_encode(['status' => 'info', 'message' => 'To create rooms, call: /php/api/create_test_rooms.php?action=create']);
}
?>
