<?php
/**
 * Public Booking Engine REST API Endpoint
 *
 * Provides public, no-login rate & availability fetching and direct guest reservation creation.
 * Multi-key rooms are stored in properties with property_type = 'MULTI_KEY_ROOM' and parent_property_id.
 */

if (!defined('GROUND_CODE_API')) {
    define('GROUND_CODE_API', true);
}

function handleGetPublicBookingInfo(PDO $pdo, int $propertyId): void {
    if ($propertyId <= 0) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Property not found']);
        return;
    }

    $propStmt = $pdo->prepare("
        SELECT id, tenant_id, name, slug, property_type, address, currency, timezone,
               phone, google_maps_link, upi_id, upi_qr_code_url, instructions,
               checkin_time, checkout_time, default_tariff, pricing_mode
        FROM properties
        WHERE id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
        LIMIT 1
    ");
    $propStmt->execute([$propertyId]);
    $property = $propStmt->fetch(PDO::FETCH_ASSOC);

    if (!$property) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Property not found']);
        return;
    }

    // Fetch active rooms for multi-key property (stored in properties table)
    $roomsStmt = $pdo->prepare("
        SELECT id, name, slug, room_order, default_tariff, checkin_time, checkout_time
        FROM properties
        WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM' AND (is_deleted = 0 OR is_deleted IS NULL)
        ORDER BY room_order ASC, id ASC
    ");
    $roomsStmt->execute([$propertyId]);
    $rooms = $roomsStmt->fetchAll(PDO::FETCH_ASSOC);

    // If single-key property, synthesize a room from the property itself
    if (empty($rooms)) {
        $rooms = [[
            'id' => (int)$property['id'],
            'name' => $property['name'],
            'slug' => $property['slug'],
            'room_order' => 1,
            'default_tariff' => $property['default_tariff'] ? (float)$property['default_tariff'] : null,
            'checkin_time' => $property['checkin_time'] ?: '14:00',
            'checkout_time' => $property['checkout_time'] ?: '11:00',
        ]];
    }

    // Fetch occupied/confirmed booking blocks across rolling 180 days
    $today = date('Y-m-d');
    $futureLimit = date('Y-m-d', strtotime('+180 days'));

    $roomIds = array_map('intval', array_column($rooms, 'id'));
    $allTargetIds = array_unique(array_merge([$propertyId], $roomIds));
    $idPlaceholders = implode(',', array_fill(0, count($allTargetIds), '?'));

    $bookingsStmt = $pdo->prepare("
        SELECT id, property_id, room_id, checkin_date, expected_checkout, status
        FROM guests
        WHERE (property_id IN ($idPlaceholders) OR room_id IN ($idPlaceholders))
          AND status NOT IN ('Cancelled', 'CheckedOut')
          AND expected_checkout >= ?
          AND checkin_date <= ?
    ");
    $bookingsStmt->execute(array_merge($allTargetIds, $allTargetIds, [$today, $futureLimit]));
    $rawBookings = $bookingsStmt->fetchAll(PDO::FETCH_ASSOC);

    $occupiedBlocks = array_map(function ($b) {
        $effRoomId = !empty($b['room_id']) ? (int)$b['room_id'] : (int)$b['property_id'];
        return [
            'room_id' => $effRoomId,
            'checkin_date' => substr($b['checkin_date'], 0, 10),
            'expected_checkout' => substr($b['expected_checkout'], 0, 10),
            'status' => $b['status'] ?? 'Booked',
        ];
    }, $rawBookings);

    // Fetch active dynamic rate rules if property uses variable pricing
    $rules = [];
    try {
        $rulesStmt = $pdo->prepare("
            SELECT id, property_id, room_id, name, start_date, end_date, rate_per_night,
                   days_of_week, min_stay_arrival, stop_sell, closed_to_arrival, closed_to_departure
            FROM room_rate_rules
            WHERE (property_id IN ($idPlaceholders) OR room_id IN ($idPlaceholders)) AND end_date >= ?
        ");
        $rulesStmt->execute(array_merge($allTargetIds, $allTargetIds, [$today]));
        $rules = $rulesStmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        // Soft fail if table absent
    }

    // Fetch all public properties for property switcher
    $allPropsStmt = $pdo->prepare("
        SELECT id, name, slug, property_type
        FROM properties
        WHERE parent_property_id IS NULL AND (is_deleted = 0 OR is_deleted IS NULL) AND is_active = 1
        ORDER BY name ASC
    ");
    $allPropsStmt->execute();
    $allProperties = $allPropsStmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'status' => 'success',
        'data' => [
            'property' => [
                'id' => (int)$property['id'],
                'name' => $property['name'],
                'slug' => $property['slug'],
                'address' => $property['address'] ?? '',
                'currency' => $property['currency'] ?: 'INR',
                'phone' => $property['phone'] ?? '',
                'google_maps_link' => $property['google_maps_link'] ?? '',
                'upi_id' => $property['upi_id'] ?? '',
                'upi_qr_code_url' => $property['upi_qr_code_url'] ?? '',
                'instructions' => $property['instructions'] ?? '',
                'checkin_time' => $property['checkin_time'] ?: '14:00',
                'checkout_time' => $property['checkout_time'] ?: '11:00',
                'pricing_mode' => $property['pricing_mode'] ?: 'flat',
            ],
            'rooms' => $rooms,
            'occupied_blocks' => $occupiedBlocks,
            'rate_rules' => $rules,
            'all_properties' => $allProperties,
        ]
    ]);
}

function handleCreatePublicBooking(PDO $pdo): void {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;

    $propertyId = !empty($data['property_id']) ? (int)$data['property_id'] : 0;
    $roomId = !empty($data['room_id']) ? (int)$data['room_id'] : null;
    $guestName = trim((string)($data['guest_name'] ?? ''));
    $phone = trim((string)($data['phone'] ?? ''));
    $email = trim((string)($data['email'] ?? ''));
    $checkinDate = trim((string)($data['checkin_date'] ?? ''));
    $checkoutDate = trim((string)($data['checkout_date'] ?? ''));
    $numGuests = max(1, (int)($data['num_guests'] ?? 1));
    $specialRequests = trim((string)($data['special_requests'] ?? ''));
    $paymentMethod = trim((string)($data['payment_method'] ?? 'Pay on Arrival (Cash / UPI)'));

    if ($propertyId <= 0) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Property ID is required']);
        return;
    }

    if (empty($guestName) || empty($phone)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Guest name and phone number are required']);
        return;
    }

    if (empty($checkinDate) || empty($checkoutDate) || $checkinDate >= $checkoutDate) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Valid check-in and check-out dates are required']);
        return;
    }

    // Verify property
    $propStmt = $pdo->prepare("SELECT id, tenant_id, name, default_tariff, upi_id, phone, address, checkin_time, checkout_time FROM properties WHERE id = ? LIMIT 1");
    $propStmt->execute([$propertyId]);
    $prop = $propStmt->fetch(PDO::FETCH_ASSOC);

    if (!$prop) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Property not found']);
        return;
    }

    $targetPropertyId = $propertyId;
    $targetRoomId = $roomId ?: $propertyId;
    $roomName = $prop['name'];
    $nightlyRate = $prop['default_tariff'] ? (float)$prop['default_tariff'] : 0;

    // Resolve room details if multi-key
    if ($roomId && $roomId !== $propertyId) {
        $rStmt = $pdo->prepare("SELECT id, name, default_tariff FROM properties WHERE id = ? AND parent_property_id = ? LIMIT 1");
        $rStmt->execute([$roomId, $propertyId]);
        $rRow = $rStmt->fetch(PDO::FETCH_ASSOC);
        if ($rRow) {
            $targetRoomId = (int)$rRow['id'];
            $roomName = $rRow['name'];
            if ($rRow['default_tariff'] !== null) {
                $nightlyRate = (float)$rRow['default_tariff'];
            }
        }
    }

    // Begin atomic transaction to prevent double bookings
    $pdo->beginTransaction();

    try {
        // Concurrency Check with SELECT ... FOR UPDATE
        $conflictStmt = $pdo->prepare("
            SELECT id FROM guests
            WHERE (property_id = ? OR room_id = ?)
              AND status NOT IN ('Cancelled', 'CheckedOut')
              AND NOT (expected_checkout <= ? OR checkin_date >= ?)
            FOR UPDATE
        ");
        $conflictStmt->execute([$targetRoomId, $targetRoomId, $checkinDate, $checkoutDate]);

        if ($conflictStmt->fetch()) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['status' => 'error', 'message' => 'These dates were just booked by another guest. Please pick different dates.']);
            return;
        }

        // Calculate nights and total tariff
        $dStart = new DateTime($checkinDate);
        $dEnd = new DateTime($checkoutDate);
        $nights = max(1, $dStart->diff($dEnd)->days);
        $totalTariff = $nights * $nightlyRate;

        $refNumber = 'GC-' . date('ymd') . '-' . strtoupper(substr(md5(uniqid((string)mt_rand(), true)), 0, 4));

        $notes = "Ref: {$refNumber}\nPayment Method: {$paymentMethod}";
        if (!empty($email)) {
            $notes .= "\nEmail: " . $email;
        }
        if (!empty($specialRequests)) {
            $notes .= "\nSpecial Requests: " . $specialRequests;
        }

        $insertStmt = $pdo->prepare("
            INSERT INTO guests (
                guest_name, phone_number, checkin_date, expected_checkout,
                status, advance_paid, total_charge, pending_amount,
                base_room_rent, notes, booking_source, no_of_guests,
                property_id, room_id
            ) VALUES (
                ?, ?, ?, ?,
                'Booked', 0, ?, ?,
                ?, ?, 'Direct Website', ?,
                ?, ?
            )
        ");

        $insertStmt->execute([
            $guestName,
            $phone,
            $checkinDate,
            $checkoutDate,
            $totalTariff,
            $totalTariff,
            $nightlyRate,
            $notes,
            $numGuests,
            $targetPropertyId,
            $targetRoomId
        ]);

        $bookingId = (int)$pdo->lastInsertId();

        // Enqueue outbound ARI push to block dates on Airbnb & Booking.com via Channex
        if (is_file(__DIR__ . '/../channex/outbox.php')) {
            require_once __DIR__ . '/../channex/outbox.php';
            if (function_exists('enqueueOutboxItem')) {
                enqueueOutboxItem($pdo, $propertyId, ($targetRoomId !== $propertyId ? $targetRoomId : null), 'availability', $checkinDate, $checkoutDate, [
                    'action' => 'direct_booking_block',
                    'booking_id' => $bookingId,
                    'guest_name' => $guestName,
                ]);
            }
        }

        $pdo->commit();

        // Trigger asynchronous/event-driven drain so OTA calendars update immediately
        if (is_file(__DIR__ . '/../channex/outbox.php')) {
            require_once __DIR__ . '/../channex/outbox.php';
            if (function_exists('triggerEventDrivenChannexDrain')) {
                triggerEventDrivenChannexDrain($pdo);
            }
        }

        // Send Telegram alert to property staff
        try {
            if (is_file(__DIR__ . '/telegram/dispatch.php')) {
                require_once __DIR__ . '/telegram/dispatch.php';
                if (function_exists('dispatchTelegramEvent')) {
                    $tgMsg = "🎉 *NEW DIRECT BOOKING RECEIVED*\n\n"
                           . "🏨 *Property:* {$prop['name']}\n"
                           . "🚪 *Room:* {$roomName}\n"
                           . "👤 *Guest:* {$guestName}\n"
                           . "📞 *Phone:* {$phone}\n"
                           . "📅 *Dates:* {$checkinDate} to {$checkoutDate} ({$nights} night" . ($nights > 1 ? 's' : '') . ")\n"
                           . "💰 *Total Tariff:* ₹" . number_format($totalTariff, 0) . " (Pay on Arrival)\n"
                           . "🔖 *Ref:* `{$refNumber}`";
                    dispatchTelegramEvent($pdo, $propertyId, 'booking_created', $tgMsg);
                }
            }
        } catch (Exception $tgErr) {
            // Non-blocking Telegram error
        }

        echo json_encode([
            'status' => 'success',
            'data' => [
                'booking_id' => $bookingId,
                'reference_number' => $refNumber,
                'property_name' => $prop['name'],
                'room_name' => $roomName,
                'guest_name' => $guestName,
                'phone' => $phone,
                'checkin_date' => $checkinDate,
                'checkout_date' => $checkoutDate,
                'nights' => $nights,
                'total_tariff' => $totalTariff,
                'payment_method' => $paymentMethod,
                'payment_status' => 'Pending (Pay on Arrival)',
                'upi_id' => $prop['upi_id'] ?? null,
                'checkin_time' => $prop['checkin_time'] ?: '14:00',
                'checkout_time' => $prop['checkout_time'] ?: '11:00',
                'address' => $prop['address'] ?? '',
            ]
        ]);

    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to complete reservation: ' . $e->getMessage()]);
    }
}
