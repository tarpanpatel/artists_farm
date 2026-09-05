<?php
/**
 * "Inquiry -> Instant Quote" WhatsApp booking links.
 *
 * A host who took a phone call or WhatsApp inquiry can generate a link with the
 * room/dates/price already filled in and send it straight to the guest - no
 * "let me check availability and call you back". Generating the link locks the
 * room for BOOKING_HOLD_MINUTES: nobody else (staff or the public direct
 * booking engine) can book over it while the guest is still deciding, but if
 * they never come back to confirm, the hold quietly expires and the room is
 * free again - no manual cleanup, no cron. Confirming inside the window turns
 * the hold into a real `guests` row via the exact same insert shape
 * create_public_booking already uses, so every downstream consumer (Channex
 * ARI push, Telegram alert, the booking calendar) treats it identically to a
 * guest who booked directly on the website.
 */

if (!defined('GROUND_CODE_API')) {
    define('GROUND_CODE_API', true);
}

require_once __DIR__ . '/../config/guest_status.php';

const BOOKING_HOLD_MINUTES = 30;

function ensureBookingHoldsSchema(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    $done = true;
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS booking_holds (
            id INT AUTO_INCREMENT PRIMARY KEY,
            property_id INT NOT NULL,
            room_id INT NOT NULL,
            quote_token VARCHAR(64) NOT NULL,
            guest_name VARCHAR(191) NULL,
            phone VARCHAR(32) NULL,
            no_of_guests INT NOT NULL DEFAULT 2,
            checkin_date DATE NOT NULL,
            checkout_date DATE NOT NULL,
            nights INT NOT NULL,
            total_tariff DECIMAL(10,2) NOT NULL DEFAULT 0,
            status ENUM('active','converted','expired','cancelled') NOT NULL DEFAULT 'active',
            created_by VARCHAR(191) NULL,
            converted_guest_id INT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            UNIQUE KEY uq_quote_token (quote_token),
            INDEX idx_room_active (room_id, status, checkin_date, checkout_date),
            INDEX idx_property (property_id)
        )
    ");
}

/**
 * Whether an ACTIVE, not-yet-expired hold overlaps this room/date range - the
 * same half-open comparison every other overlap check in this app uses
 * (start < otherEnd AND end > otherStart), so a same-day turnover between a
 * hold and a real booking is never wrongly treated as a clash. Called from
 * here (to stop two overlapping quotes) and from guests.php/public_booking.php
 * (so a pending quote blocks a real booking from being created underneath it
 * too) - see those call sites for why this needed to be shared rather than
 * duplicated.
 */
function getActiveBookingHoldConflict(PDO $pdo, int $roomId, string $checkinDate, string $checkoutDate, ?string $excludeToken = null): bool {
    ensureBookingHoldsSchema($pdo);
    $sql = "SELECT id FROM booking_holds
            WHERE room_id = ? AND status = 'active' AND expires_at > NOW()
              AND checkin_date < ? AND checkout_date > ?";
    $params = [$roomId, $checkoutDate, $checkinDate];
    if ($excludeToken !== null) {
        $sql .= " AND quote_token != ?";
        $params[] = $excludeToken;
    }
    $sql .= " LIMIT 1 FOR UPDATE";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return (bool)$stmt->fetch();
}

/** Shared daily-rate summation - same shape as public_booking.php's, kept
 *  local rather than factored out to avoid touching that file's own logic
 *  for this unrelated feature. */
function computeHoldTariff(PDO $pdo, int $propertyId, int $roomId, string $checkinDate, string $checkoutDate, float $roomDefaultTariff, float $baseDefaultTariff, string $roomPricingMode): array {
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
        $rrStmt->execute([$propertyId, $roomId, $checkoutDate, $checkinDate]);
        foreach ($rrStmt->fetchAll(PDO::FETCH_ASSOC) as $rr) {
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

    $cur = strtotime($checkinDate);
    $end = strtotime($checkoutDate);
    $totalTariff = 0;
    $nightCount = 0;
    while ($cur < $end) {
        $dStr = date('Y-m-d', $cur);
        $dailyRate = $roomDefaultTariff > 0 ? $roomDefaultTariff : ($baseDefaultTariff > 0 ? $baseDefaultTariff : 0);
        if ($roomPricingMode === 'variable') {
            if (isset($rateRulesPerRoom[$roomId][$dStr])) $dailyRate = $rateRulesPerRoom[$roomId][$dStr];
            elseif (isset($rateRulesPerRoom[0][$dStr])) $dailyRate = $rateRulesPerRoom[0][$dStr];
            elseif (isset($rateRulesPerRoom[$propertyId][$dStr])) $dailyRate = $rateRulesPerRoom[$propertyId][$dStr];
        }
        $totalTariff += $dailyRate;
        $nightCount++;
        $cur = strtotime('+1 day', $cur);
    }
    $nights = max(1, $nightCount);
    return [$totalTariff, $nights];
}

/** Staff-authenticated: generate a quote + lock the room for BOOKING_HOLD_MINUTES. */
function handleCreateBookingHold(PDO $pdo, int $propertyId, string $createdBy): void {
    ensureBookingHoldsSchema($pdo);
    $data = json_decode(file_get_contents('php://input'), true) ?: [];

    $roomId = !empty($data['room_id']) ? (int)$data['room_id'] : $propertyId;
    $checkinDate = trim((string)($data['checkin_date'] ?? ''));
    $checkoutDate = trim((string)($data['checkout_date'] ?? ''));
    $guestName = trim((string)($data['guest_name'] ?? ''));
    $phone = trim((string)($data['phone'] ?? ''));
    $numGuests = max(1, (int)($data['num_guests'] ?? 2));

    if ($propertyId <= 0) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'No active property in session']);
        return;
    }
    if (empty($checkinDate) || empty($checkoutDate) || $checkinDate >= $checkoutDate) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Valid check-in and check-out dates are required']);
        return;
    }

    $propStmt = $pdo->prepare("SELECT id, slug, name, default_tariff, pricing_mode FROM properties WHERE id = ? LIMIT 1");
    $propStmt->execute([$propertyId]);
    $prop = $propStmt->fetch(PDO::FETCH_ASSOC);
    if (!$prop) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Property not found']);
        return;
    }

    $roomName = $prop['name'];
    $roomPricingMode = $prop['pricing_mode'] ?: 'flat';
    $baseDefaultTariff = (float)($prop['default_tariff'] ?? 0);
    $roomDefaultTariff = $baseDefaultTariff;

    if ($roomId !== $propertyId) {
        $rStmt = $pdo->prepare("SELECT id, name, default_tariff, pricing_mode FROM properties WHERE id = ? AND parent_property_id = ? LIMIT 1");
        $rStmt->execute([$roomId, $propertyId]);
        $rRow = $rStmt->fetch(PDO::FETCH_ASSOC);
        if (!$rRow) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Room not found']);
            return;
        }
        $roomName = $rRow['name'];
        if (!empty($rRow['pricing_mode'])) $roomPricingMode = $rRow['pricing_mode'];
        if ($rRow['default_tariff'] !== null) $roomDefaultTariff = (float)$rRow['default_tariff'];
    }

    [$totalTariff, $nights] = computeHoldTariff($pdo, $propertyId, $roomId, $checkinDate, $checkoutDate, $roomDefaultTariff, $baseDefaultTariff, $roomPricingMode);

    $pdo->beginTransaction();
    try {
        // Same lock-then-check discipline as add_guest/create_public_booking -
        // always the same single row, so this can't deadlock against them.
        $pdo->prepare("SELECT id FROM properties WHERE id = ? FOR UPDATE")->execute([$roomId]);

        $conflictStmt = $pdo->prepare("
            SELECT id FROM guests
            WHERE (property_id = ? OR room_id = ?)
              AND status IN (?, ?, ?, ?)
              AND NOT (DATE(expected_checkout) <= DATE(?) OR checkin_date >= DATE(?))
            FOR UPDATE
        ");
        $conflictStmt->execute([$roomId, $roomId, GUEST_STATUS_ACTIVE_LEGACY, GUEST_STATUS_CONFIRMED_LEGACY, GUEST_STATUS_CHECKED_IN, GUEST_STATUS_BOOKED, $checkinDate, $checkoutDate]);
        if ($conflictStmt->fetch()) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['status' => 'error', 'message' => 'This room already has an active booking for these dates']);
            return;
        }

        if (getActiveBookingHoldConflict($pdo, $roomId, $checkinDate, $checkoutDate)) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['status' => 'error', 'message' => 'A quote is already pending for this room and these dates']);
            return;
        }

        $token = bin2hex(random_bytes(20));

        // expires_at is computed by MySQL's own NOW(), not PHP's time()/date() -
        // found live while testing (5 Sep 2026): this dev environment's PHP and
        // MySQL clocks disagree by 3 hours (different configured timezones), so
        // a PHP-computed "30 minutes from now" written into this column could
        // already read as expired the instant MySQL's NOW() evaluated against
        // it - the entire lock silently doing nothing. Every comparison against
        // this column (getActiveBookingHoldConflict above, and the expiry
        // checks in handleGetBookingHold/handleConfirmBookingHold below) must
        // likewise stay inside SQL, on MySQL's own clock, never mixed with a
        // PHP-side time value.
        $insStmt = $pdo->prepare("
            INSERT INTO booking_holds (
                property_id, room_id, quote_token, guest_name, phone, no_of_guests,
                checkin_date, checkout_date, nights, total_tariff, status, created_by, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NOW() + INTERVAL " . BOOKING_HOLD_MINUTES . " MINUTE)
        ");
        $insStmt->execute([
            $propertyId, $roomId, $token, $guestName ?: null, $phone ?: null, $numGuests,
            $checkinDate, $checkoutDate, $nights, $totalTariff, $createdBy ?: null,
        ]);

        $pdo->commit();

        echo json_encode([
            'status' => 'success',
            'data' => [
                'quote_token' => $token,
                'property_slug' => $prop['slug'],
                'room_name' => $roomName,
                'checkin_date' => $checkinDate,
                'checkout_date' => $checkoutDate,
                'nights' => $nights,
                'total_tariff' => $totalTariff,
                'expires_in_seconds' => BOOKING_HOLD_MINUTES * 60,
            ],
        ]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to create quote: ' . $e->getMessage()]);
    }
}

/** Public, unauthenticated - the token itself is the secret (20 random bytes). */
function handleGetBookingHold(PDO $pdo): void {
    ensureBookingHoldsSchema($pdo);
    $token = trim((string)($_GET['token'] ?? ''));
    if (empty($token)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Token is required']);
        return;
    }

    // seconds_remaining computed by MySQL itself (TIMESTAMPDIFF against its own
    // NOW()) - never compare expires_at against PHP's time()/date(), see the
    // long comment on the INSERT in handleCreateBookingHold for why.
    $stmt = $pdo->prepare("SELECT *, TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS seconds_remaining FROM booking_holds WHERE quote_token = ? LIMIT 1");
    $stmt->execute([$token]);
    $hold = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$hold) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'not_found']);
        return;
    }

    // Lazily flip to expired the moment anyone looks at it past the deadline -
    // no cron needed, nothing else needs to poll for this.
    if ($hold['status'] === 'active' && (int)$hold['seconds_remaining'] <= 0) {
        $pdo->prepare("UPDATE booking_holds SET status = 'expired' WHERE id = ?")->execute([$hold['id']]);
        $hold['status'] = 'expired';
    }

    if ($hold['status'] !== 'active') {
        echo json_encode(['status' => 'success', 'data' => ['hold_status' => $hold['status']]]);
        return;
    }

    $propStmt = $pdo->prepare("SELECT id, slug, name, currency, address, upi_id, upi_qr_code_url, checkin_time, checkout_time FROM properties WHERE id = ? LIMIT 1");
    $propStmt->execute([$hold['property_id']]);
    $prop = $propStmt->fetch(PDO::FETCH_ASSOC);

    $roomStmt = $pdo->prepare("SELECT name FROM properties WHERE id = ? LIMIT 1");
    $roomStmt->execute([$hold['room_id']]);
    $room = $roomStmt->fetch(PDO::FETCH_ASSOC);

    echo json_encode([
        'status' => 'success',
        'data' => [
            'hold_status' => 'active',
            'property_slug' => $prop['slug'] ?? '',
            'property_name' => $prop['name'] ?? '',
            'currency' => $prop['currency'] ?? 'INR',
            'address' => $prop['address'] ?? '',
            'upi_id' => $prop['upi_id'] ?? '',
            'upi_qr_code_url' => $prop['upi_qr_code_url'] ?? '',
            'checkin_time' => $prop['checkin_time'] ?: '14:00',
            'checkout_time' => $prop['checkout_time'] ?: '11:00',
            'room_name' => $room['name'] ?? '',
            'guest_name' => $hold['guest_name'] ?? '',
            'phone' => $hold['phone'] ?? '',
            'no_of_guests' => (int)$hold['no_of_guests'],
            'checkin_date' => $hold['checkin_date'],
            'checkout_date' => $hold['checkout_date'],
            'nights' => (int)$hold['nights'],
            'total_tariff' => (float)$hold['total_tariff'],
            'expires_in_seconds' => max(0, (int)$hold['seconds_remaining']),
        ],
    ]);
}

/** Public, unauthenticated - converts an active hold into a real guests row. */
function handleConfirmBookingHold(PDO $pdo): void {
    ensureBookingHoldsSchema($pdo);
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $token = trim((string)($data['quote_token'] ?? ''));
    $guestName = trim((string)($data['guest_name'] ?? ''));
    $phone = trim((string)($data['phone'] ?? ''));
    $email = trim((string)($data['email'] ?? ''));
    $numGuests = max(1, (int)($data['num_guests'] ?? 2));
    $specialRequests = trim((string)($data['special_requests'] ?? ''));

    if (empty($token) || empty($guestName) || empty($phone)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Guest name and phone number are required']);
        return;
    }

    $pdo->beginTransaction();
    try {
        // seconds_remaining via MySQL's own NOW(), not PHP's time() - see the
        // long comment in handleCreateBookingHold's INSERT for why these must
        // never be mixed.
        $holdStmt = $pdo->prepare("SELECT *, TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS seconds_remaining FROM booking_holds WHERE quote_token = ? LIMIT 1 FOR UPDATE");
        $holdStmt->execute([$token]);
        $hold = $holdStmt->fetch(PDO::FETCH_ASSOC);

        if (!$hold) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Quote not found']);
            return;
        }
        if ($hold['status'] !== 'active' || (int)$hold['seconds_remaining'] <= 0) {
            if ($hold['status'] === 'active') {
                $pdo->prepare("UPDATE booking_holds SET status = 'expired' WHERE id = ?")->execute([$hold['id']]);
            }
            $pdo->commit();
            http_response_code(410);
            echo json_encode(['status' => 'error', 'message' => 'This quote has expired. Please ask the property for a new link.']);
            return;
        }

        $propertyId = (int)$hold['property_id'];
        $roomId = (int)$hold['room_id'];
        $checkinDate = $hold['checkin_date'];
        $checkoutDate = $hold['checkout_date'];

        $pdo->prepare("SELECT id FROM properties WHERE id = ? FOR UPDATE")->execute([$roomId]);

        // Defense in depth: the hold is what actually stopped a new real booking
        // from being created underneath it (see getActiveBookingHoldConflict's
        // call sites in guests.php/public_booking.php), but re-check anyway
        // rather than trust the hold blindly.
        $conflictStmt = $pdo->prepare("
            SELECT id FROM guests
            WHERE (property_id = ? OR room_id = ?)
              AND status IN (?, ?, ?, ?)
              AND NOT (DATE(expected_checkout) <= DATE(?) OR checkin_date >= DATE(?))
            FOR UPDATE
        ");
        $conflictStmt->execute([$roomId, $roomId, GUEST_STATUS_ACTIVE_LEGACY, GUEST_STATUS_CONFIRMED_LEGACY, GUEST_STATUS_CHECKED_IN, GUEST_STATUS_BOOKED, $checkinDate, $checkoutDate]);
        if ($conflictStmt->fetch()) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['status' => 'error', 'message' => 'These dates were just booked by another guest.']);
            return;
        }

        $propStmt = $pdo->prepare("SELECT name, upi_id, address, checkin_time, checkout_time FROM properties WHERE id = ? LIMIT 1");
        $propStmt->execute([$propertyId]);
        $prop = $propStmt->fetch(PDO::FETCH_ASSOC);

        $roomStmt = $pdo->prepare("SELECT name FROM properties WHERE id = ? LIMIT 1");
        $roomStmt->execute([$roomId]);
        $room = $roomStmt->fetch(PDO::FETCH_ASSOC);

        $refNumber = 'GC-' . date('ymd') . '-' . strtoupper(substr(md5(uniqid((string)mt_rand(), true)), 0, 4));
        $notes = "Ref: {$refNumber}\nPayment Method: Pay on Arrival (Cash / UPI / Card)\nSource: WhatsApp Instant Quote";
        if (!empty($email)) $notes .= "\nEmail: " . $email;
        if (!empty($specialRequests)) $notes .= "\nSpecial Requests: " . $specialRequests;

        $totalTariff = (float)$hold['total_tariff'];
        $nights = (int)$hold['nights'];
        $avgNightlyRate = $nights > 0 ? round($totalTariff / $nights, 2) : $totalTariff;

        $insertStmt = $pdo->prepare("
            INSERT INTO guests (
                guest_name, phone_number, checkin_date, expected_checkout,
                status, advance_paid, total_charge, pending_amount,
                base_room_rent, notes, booking_source, no_of_guests,
                property_id, room_id
            ) VALUES (
                ?, ?, ?, ?,
                'Booked', 0, ?, ?,
                ?, ?, 'WhatsApp Quote', ?,
                ?, ?
            )
        ");
        $insertStmt->execute([
            $guestName, $phone, $checkinDate, $checkoutDate,
            $totalTariff, $totalTariff, $avgNightlyRate, $notes, $numGuests,
            $propertyId, $roomId,
        ]);
        $bookingId = (int)$pdo->lastInsertId();

        $pdo->prepare("UPDATE booking_holds SET status = 'converted', converted_guest_id = ? WHERE id = ?")
            ->execute([$bookingId, $hold['id']]);

        if (is_file(__DIR__ . '/../channex/outbox.php')) {
            require_once __DIR__ . '/../channex/outbox.php';
            if (function_exists('enqueueOutboxItem')) {
                enqueueOutboxItem($pdo, $propertyId, ($roomId !== $propertyId ? $roomId : null), 'availability', $checkinDate, $checkoutDate, [
                    'action' => 'direct_booking_block',
                    'booking_id' => $bookingId,
                    'guest_name' => $guestName,
                ]);
            }
        }

        $pdo->commit();

        if (is_file(__DIR__ . '/../channex/outbox.php')) {
            require_once __DIR__ . '/../channex/outbox.php';
            if (function_exists('triggerEventDrivenChannexDrain')) {
                triggerEventDrivenChannexDrain($pdo);
            }
        }

        // Real, working Telegram send (not the create_public_booking's
        // dispatchTelegramEvent()/php/api/telegram/dispatch.php - that file
        // does not exist, so that alert has been silently inert; unrelated
        // pre-existing gap, not touched here). deepLinkParams so "Open in App"
        // lands on this exact booking, not a generic tab.
        try {
            if (is_file(__DIR__ . '/../telegram/sender.php')) {
                require_once __DIR__ . '/../telegram/sender.php';
                if (function_exists('sendPropertyTelegramMessage')) {
                    $tgMsg = "🎉 <b>WHATSAPP QUOTE CONFIRMED</b>\n\n"
                           . "🏨 <b>Property:</b> " . ($prop['name'] ?? '') . "\n"
                           . "🚪 <b>Room:</b> " . ($room['name'] ?? '') . "\n"
                           . "👤 <b>Guest:</b> {$guestName}\n"
                           . "📞 <b>Phone:</b> {$phone}\n"
                           . "📅 <b>Dates:</b> {$checkinDate} to {$checkoutDate} ({$nights} night" . ($nights > 1 ? 's' : '') . ")\n"
                           . "💰 <b>Total:</b> ₹" . number_format($totalTariff, 0) . "\n"
                           . "🔖 <b>Ref:</b> {$refNumber}";
                    sendPropertyTelegramMessage($pdo, $propertyId, 'admin', $tgMsg, null, null, ['booking_id' => $bookingId]);
                }
            }
        } catch (Exception $tgErr) {
            // Non-blocking - the booking itself already committed above.
        }

        echo json_encode([
            'status' => 'success',
            'data' => [
                'booking_id' => $bookingId,
                'reference_number' => $refNumber,
                'property_name' => $prop['name'] ?? '',
                'room_name' => $room['name'] ?? '',
                'guest_name' => $guestName,
                'phone' => $phone,
                'checkin_date' => $checkinDate,
                'checkout_date' => $checkoutDate,
                'nights' => $nights,
                'total_tariff' => $totalTariff,
                'payment_method' => 'Pay on Arrival (Cash / UPI / Card)',
                'payment_status' => 'Pending (Pay on Arrival)',
                'upi_id' => $prop['upi_id'] ?? null,
                'checkin_time' => $prop['checkin_time'] ?: '14:00',
                'checkout_time' => $prop['checkout_time'] ?: '11:00',
                'address' => $prop['address'] ?? '',
            ],
        ]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to confirm booking: ' . $e->getMessage()]);
    }
}
