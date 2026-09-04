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

// The booking-conflict check below compares against the canonical guest-status
// constants rather than string literals - getting 'Checked Out' vs the legacy
// 'CheckedOut' wrong here silently refuses real bookings. router.php already
// loads this, but don't depend on include order for something that decides
// whether a paying guest can book.
require_once __DIR__ . '/../config/guest_status.php';

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

    $propPricingMode = $property['pricing_mode'] ?: 'flat';
    $baseTariff = (float)($property['default_tariff'] ?? 0);

    // Fetch active rooms for multi-key property (stored in properties table)
    $roomsStmt = $pdo->prepare("
        SELECT id, name, slug, room_order, default_tariff, checkin_time, checkout_time, pricing_mode
        FROM properties
        WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM' AND (is_deleted = 0 OR is_deleted IS NULL) AND is_active = 1
        ORDER BY room_order ASC, name ASC, id ASC
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
            'pricing_mode' => $propPricingMode,
        ]];
    }

    // Rolling 180-day window
    $today = date('Y-m-d');
    $futureLimit = date('Y-m-d', strtotime('+180 days'));

    $roomIds = array_map('intval', array_column($rooms, 'id'));
    $allTargetIds = array_unique(array_merge([$propertyId], $roomIds));
    $idPlaceholders = implode(',', array_fill(0, count($allTargetIds), '?'));

    // Fetch occupied/confirmed booking blocks
    $bookingsStmt = $pdo->prepare("
        SELECT id, property_id, room_id, checkin_date, expected_checkout, status
        FROM guests
        WHERE (property_id IN ($idPlaceholders) OR room_id IN ($idPlaceholders))
          AND (status IS NULL OR LOWER(TRIM(status)) NOT IN ('cancelled', 'checked out', 'checkedout', 'void', 'deleted'))
          AND expected_checkout >= ?
          AND checkin_date <= ?
    ");
    $bookingsStmt->execute(array_merge($allTargetIds, $allTargetIds, [$today, $futureLimit . ' 23:59:59']));
    $rawBookings = $bookingsStmt->fetchAll(PDO::FETCH_ASSOC);

    $occupiedBlocks = [];
    foreach ($rawBookings as $b) {
        $cIn = substr($b['checkin_date'], 0, 10);
        $cOut = substr($b['expected_checkout'], 0, 10);
        $bStatus = $b['status'] ?? 'Booked';

        if (empty($b['room_id']) || (int)$b['room_id'] === $propertyId) {
            // Unassigned or full-property booking blocks all rooms of multi-key property
            if (!empty($rooms) && count($rooms) > 1) {
                foreach ($rooms as $r) {
                    $occupiedBlocks[] = [
                        'room_id' => (int)$r['id'],
                        'checkin_date' => $cIn,
                        'expected_checkout' => $cOut,
                        'status' => $bStatus,
                    ];
                }
            } else {
                $occupiedBlocks[] = [
                    'room_id' => $propertyId,
                    'checkin_date' => $cIn,
                    'expected_checkout' => $cOut,
                    'status' => $bStatus,
                ];
            }
        } else {
            $occupiedBlocks[] = [
                'room_id' => (int)$b['room_id'],
                'checkin_date' => $cIn,
                'expected_checkout' => $cOut,
                'status' => $bStatus,
            ];
        }
    }

    // Fetch Synced iCal OTA Blocks
    try {
        $oStmt = $pdo->prepare("
            SELECT e.event_start, e.event_end, c.property_id as room_id
            FROM ical_synced_events e
            JOIN ical_sync_configs c ON e.sync_config_id = c.id
            WHERE c.property_id IN ($idPlaceholders)
            AND e.sync_status = 'synced'
            AND e.event_start <= ? AND e.event_end >= ?
        ");
        $oStmt->execute(array_merge($allTargetIds, [$futureLimit . ' 23:59:59', $today . ' 00:00:00']));
        $otaBlocks = $oStmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($otaBlocks as $ob) {
            $occupiedBlocks[] = [
                'room_id' => (int)$ob['room_id'],
                'checkin_date' => substr($ob['event_start'], 0, 10),
                'expected_checkout' => substr($ob['event_end'], 0, 10),
                'status' => 'Booked',
            ];
        }
    } catch (Exception $e) {}

    // Fetch active dynamic rate rules
    $rules = [];
    $rateRulesPerRoom = [];
    $restrictionsPerRoom = [];
    $dayCodeByIso = [1 => 'mo', 2 => 'tu', 3 => 'we', 4 => 'th', 5 => 'fr', 6 => 'sa', 7 => 'su'];

    try {
        $rulesStmt = $pdo->prepare("
            SELECT id, property_id, room_id, rule_name as name, start_date, end_date, rate_per_night,
                   days_of_week, min_stay_arrival, min_stay_through, max_stay, stop_sell,
                   closed_to_arrival, closed_to_departure
            FROM room_rate_rules
            WHERE (property_id IN ($idPlaceholders) OR room_id IN ($idPlaceholders))
              AND end_date >= ?
            ORDER BY room_id DESC, created_at DESC, id DESC
        ");
        $rulesStmt->execute(array_merge($allTargetIds, $allTargetIds, [$today]));
        $rules = $rulesStmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($rules as $rr) {
            $rId = $rr['room_id'] !== null ? (int)$rr['room_id'] : 0;
            $ruleDays = !empty($rr['days_of_week']) ? explode(',', $rr['days_of_week']) : null;
            $cur = strtotime($rr['start_date']);
            $end = strtotime($rr['end_date']);
            $isStopSell = !empty($rr['stop_sell']);

            while ($cur <= $end) {
                $dStr = date('Y-m-d', $cur);
                if ($ruleDays !== null && !in_array($dayCodeByIso[(int)date('N', $cur)], $ruleDays, true)) {
                    $cur = strtotime('+1 day', $cur);
                    continue;
                }
                if ($rr['rate_per_night'] !== null && !isset($rateRulesPerRoom[$rId][$dStr])) {
                    $rateRulesPerRoom[$rId][$dStr] = (float)$rr['rate_per_night'];
                }
                if (!isset($restrictionsPerRoom[$rId][$dStr])) {
                    $restrictionsPerRoom[$rId][$dStr] = [
                        'min_stay_arrival' => $rr['min_stay_arrival'] ? (int)$rr['min_stay_arrival'] : null,
                        'min_stay_through' => $rr['min_stay_through'] ? (int)$rr['min_stay_through'] : null,
                        'max_stay' => $rr['max_stay'] ? (int)$rr['max_stay'] : null,
                        'closed_to_arrival' => !empty($rr['closed_to_arrival']),
                        'closed_to_departure' => !empty($rr['closed_to_departure']),
                    ];
                }
                if ($isStopSell) {
                    if ($rId === 0) {
                        foreach ($allTargetIds as $sId) {
                            $occupiedBlocks[] = [
                                'room_id' => $sId,
                                'checkin_date' => $dStr,
                                'expected_checkout' => date('Y-m-d', strtotime('+1 day', $cur)),
                                'status' => 'StopSell',
                            ];
                        }
                    } else {
                        $occupiedBlocks[] = [
                            'room_id' => $rId,
                            'checkin_date' => $dStr,
                            'expected_checkout' => date('Y-m-d', strtotime('+1 day', $cur)),
                            'status' => 'StopSell',
                        ];
                    }
                }
                $cur = strtotime('+1 day', $cur);
            }
        }
    } catch (Exception $e) {
        error_log("Public booking rate rules error: " . $e->getMessage());
        if (class_exists('TelescopeLogger')) {
            TelescopeLogger::log('sql', 'Rate Rules Fetch Error', $e->getMessage(), 'Public Booking');
        }
    }

    // Precalculate accurate daily rates map for every room across rolling 180 days
    $dailyRatesPerRoom = [];
    $dailyRestrictionsPerRoom = [];

    foreach ($rooms as $room) {
        $rId = (int)$room['id'];
        $rTariff = (float)($room['default_tariff'] ?? 0);
        $rPricingMode = !empty($room['pricing_mode']) ? $room['pricing_mode'] : $propPricingMode;

        $cur = strtotime($today);
        $end = strtotime($futureLimit);
        while ($cur <= $end) {
            $dStr = date('Y-m-d', $cur);
            $rate = $rTariff > 0 ? $rTariff : ($baseTariff > 0 ? $baseTariff : 0);

            if ($rPricingMode === 'variable') {
                if (isset($rateRulesPerRoom[$rId][$dStr])) {
                    $rate = $rateRulesPerRoom[$rId][$dStr];
                } elseif (isset($rateRulesPerRoom[0][$dStr])) {
                    $rate = $rateRulesPerRoom[0][$dStr];
                } elseif (isset($rateRulesPerRoom[$propertyId][$dStr])) {
                    $rate = $rateRulesPerRoom[$propertyId][$dStr];
                }
            }
            $dailyRatesPerRoom[$rId][$dStr] = $rate;

            if ($rPricingMode === 'variable') {
                if (isset($restrictionsPerRoom[$rId][$dStr])) {
                    $dailyRestrictionsPerRoom[$rId][$dStr] = $restrictionsPerRoom[$rId][$dStr];
                } elseif (isset($restrictionsPerRoom[0][$dStr])) {
                    $dailyRestrictionsPerRoom[$rId][$dStr] = $restrictionsPerRoom[0][$dStr];
                }
            }

            $cur = strtotime('+1 day', $cur);
        }
    }

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
                'pricing_mode' => $propPricingMode,
                'default_tariff' => $baseTariff,
            ],
            'rooms' => $rooms,
            'occupied_blocks' => $occupiedBlocks,
            'daily_rates' => $dailyRatesPerRoom,
            'daily_restrictions' => $dailyRestrictionsPerRoom,
            'rate_rules' => $rules,
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
    $propStmt = $pdo->prepare("SELECT id, tenant_id, name, default_tariff, pricing_mode, upi_id, phone, address, checkin_time, checkout_time FROM properties WHERE id = ? LIMIT 1");
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
    $roomPricingMode = $prop['pricing_mode'] ?: 'flat';
    $baseDefaultTariff = (float)($prop['default_tariff'] ?? 0);
    $roomDefaultTariff = $baseDefaultTariff;

    // Resolve room details if multi-key
    if ($roomId && $roomId !== $propertyId) {
        $rStmt = $pdo->prepare("SELECT id, name, default_tariff, pricing_mode FROM properties WHERE id = ? AND parent_property_id = ? LIMIT 1");
        $rStmt->execute([$roomId, $propertyId]);
        $rRow = $rStmt->fetch(PDO::FETCH_ASSOC);
        if ($rRow) {
            $targetRoomId = (int)$rRow['id'];
            $roomName = $rRow['name'];
            if (!empty($rRow['pricing_mode'])) {
                $roomPricingMode = $rRow['pricing_mode'];
            }
            if ($rRow['default_tariff'] !== null) {
                $roomDefaultTariff = (float)$rRow['default_tariff'];
            }
        }
    }

    // Fetch dynamic rate rules for exact total calculation
    $rateRulesPerRoom = [];
    $dayCodeByIso = [1 => 'mo', 2 => 'tu', 3 => 'we', 4 => 'th', 5 => 'fr', 6 => 'sa', 7 => 'su'];
    try {
        $rrStmt = $pdo->prepare("
            SELECT room_id, start_date, end_date, rate_per_night, days_of_week
            FROM room_rate_rules
            WHERE (property_id = ? OR room_id = ? OR room_id = 0 OR room_id IS NULL)
              AND start_date <= ? AND end_date >= ?
            ORDER BY room_id DESC, created_at DESC, id DESC
        ");
        $rrStmt->execute([$propertyId, $targetRoomId, $checkoutDate, $checkinDate]);
        $fetchedRules = $rrStmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($fetchedRules as $rr) {
            $rId = $rr['room_id'] !== null ? (int)$rr['room_id'] : 0;
            $ruleDays = !empty($rr['days_of_week']) ? explode(',', $rr['days_of_week']) : null;
            $cur = strtotime($rr['start_date']);
            $end = strtotime($rr['end_date']);
            while ($cur <= $end) {
                $dStr = date('Y-m-d', $cur);
                if ($ruleDays !== null && !in_array($dayCodeByIso[(int)date('N', $cur)], $ruleDays, true)) {
                    $cur = strtotime('+1 day', $cur);
                    continue;
                }
                if ($rr['rate_per_night'] !== null && !isset($rateRulesPerRoom[$rId][$dStr])) {
                    $rateRulesPerRoom[$rId][$dStr] = (float)$rr['rate_per_night'];
                }
                $cur = strtotime('+1 day', $cur);
            }
        }
    } catch (Exception $e) {}

    // Calculate nights and exact total tariff by summing each day's dynamic rate
    $cur = strtotime($checkinDate);
    $end = strtotime($checkoutDate);
    $totalTariff = 0;
    $nightCount = 0;

    while ($cur < $end) {
        $dStr = date('Y-m-d', $cur);
        $dailyRate = $roomDefaultTariff > 0 ? $roomDefaultTariff : ($baseDefaultTariff > 0 ? $baseDefaultTariff : 0);

        if ($roomPricingMode === 'variable') {
            if (isset($rateRulesPerRoom[$targetRoomId][$dStr])) {
                $dailyRate = $rateRulesPerRoom[$targetRoomId][$dStr];
            } elseif (isset($rateRulesPerRoom[0][$dStr])) {
                $dailyRate = $rateRulesPerRoom[0][$dStr];
            } elseif (isset($rateRulesPerRoom[$propertyId][$dStr])) {
                $dailyRate = $rateRulesPerRoom[$propertyId][$dStr];
            }
        }

        $totalTariff += $dailyRate;
        $nightCount++;
        $cur = strtotime('+1 day', $cur);
    }

    $nights = max(1, $nightCount);
    $avgNightlyRate = round($totalTariff / $nights, 2);

    // Begin atomic transaction to prevent double bookings
    $pdo->beginTransaction();

    try {
        // Take the exclusive row lock FIRST, before the overlap check, so two
        // concurrent public bookings for the same unit serialize here instead of
        // racing. guests.php's add_guest does exactly this and explains why at
        // length: `FOR UPDATE` on the overlap query alone "is correct but relies
        // purely on gap locks over an index range". A public, unauthenticated
        // endpoint gets genuinely simultaneous requests far more often than two
        // staff clicking at once, so it needs the stronger of the two guarantees,
        // not the weaker. Always the same single row, so it can't deadlock.
        $pdo->prepare("SELECT id FROM properties WHERE id = ? FOR UPDATE")->execute([$targetRoomId]);

        // Concurrency Check with SELECT ... FOR UPDATE
        //
        // Status must be an ALLOWLIST of the states that actually occupy a room,
        // matching add_guest/update_guest in guests.php. This was a denylist of
        // ('Cancelled', 'CheckedOut') - and 'CheckedOut' is the LEGACY spelling
        // (see php/config/guest_status.php: the current constant is 'Checked
        // Out', with a space). Every completed stay therefore still counted as a
        // blocking booking, so the direct booking engine answered 409 "just
        // booked by another guest" for dates that were actually free, for ever,
        // while staff could book the very same room and dates without complaint.
        // Confirmed 4 Sep 2026 against real data: guest #2300, checked out
        // 30 Aug, still blocked its own past dates here.
        $conflictStmt = $pdo->prepare("
            SELECT id FROM guests
            WHERE (property_id = ? OR room_id = ?)
              AND status IN (?, ?, ?, ?)
              AND NOT (DATE(expected_checkout) <= DATE(?) OR checkin_date >= DATE(?))
            FOR UPDATE
        ");
        $conflictStmt->execute([
            $targetRoomId, $targetRoomId,
            GUEST_STATUS_ACTIVE_LEGACY, GUEST_STATUS_CONFIRMED_LEGACY,
            GUEST_STATUS_CHECKED_IN, GUEST_STATUS_BOOKED,
            $checkinDate, $checkoutDate,
        ]);

        if ($conflictStmt->fetch()) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['status' => 'error', 'message' => 'These dates were just booked by another guest. Please pick different dates.']);
            return;
        }

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
            $avgNightlyRate,
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
