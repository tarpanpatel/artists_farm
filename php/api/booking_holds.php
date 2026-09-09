<?php
/**
 * "Inquiry -> Instant Quote" WhatsApp booking links.
 *
 * A host who took a phone call or WhatsApp inquiry can generate a link with the
 * room/dates/price already filled in and send it straight to the guest - no
 * "let me check availability and call you back". Generating the link locks the
 * room for a host-chosen duration (see DEFAULT_BOOKING_HOLD_HOURS below):
 * nobody else (staff or the public direct booking engine) can book over it
 * while the guest is still deciding, but if they never come back to confirm,
 * the hold quietly expires and the room is free again - no manual cleanup, no
 * cron. Confirming inside the window turns the hold into a real `guests` row
 * via the exact same insert shape create_public_booking already uses, so
 * every downstream consumer (Channex ARI push, Telegram alert, the booking
 * calendar) treats it identically to a guest who booked directly on the
 * website.
 */

if (!defined('GROUND_CODE_API')) {
    define('GROUND_CODE_API', true);
}

require_once __DIR__ . '/../config/guest_status.php';
require_once __DIR__ . '/public_voucher.php';

const DEFAULT_BOOKING_HOLD_HOURS = 2.0;
const MAX_BOOKING_HOLD_HOURS = 72.0;
const MIN_BOOKING_HOLD_MINUTES = 5;

/** Clamp a host-supplied hold duration (hours) into a safe minute count. */
function resolveBookingHoldMinutes($rawHours): int {
    $hours = is_numeric($rawHours) ? (float)$rawHours : DEFAULT_BOOKING_HOLD_HOURS;
    if (!is_finite($hours) || $hours <= 0) {
        $hours = DEFAULT_BOOKING_HOLD_HOURS;
    }
    $hours = min($hours, MAX_BOOKING_HOLD_HOURS);
    return max(MIN_BOOKING_HOLD_MINUTES, (int)round($hours * 60));
}

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
            payment_proof_url VARCHAR(255) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            UNIQUE KEY uq_quote_token (quote_token),
            INDEX idx_room_active (room_id, status, checkin_date, checkout_date),
            INDEX idx_property (property_id)
        )
    ");
    try {
        $pdo->exec("ALTER TABLE booking_holds ADD COLUMN payment_proof_url VARCHAR(255) NULL AFTER converted_guest_id");
    } catch (Exception $e) {}
    try {
        $pdo->exec("ALTER TABLE guests ADD COLUMN payment_proof_url VARCHAR(255) NULL");
    } catch (Exception $e) {}
}

/**
 * Safely decodes and writes a base64-encoded payment screenshot to php/uploads/payment_proofs/.
 * Returns the web-accessible relative URL (e.g. /php/uploads/payment_proofs/proof_...).
 */
function savePaymentProofImage(string $base64Data, string $prefix = 'proof'): ?string {
    if (empty($base64Data)) return null;

    if (preg_match('/^data:image\/(\w+);base64,(.+)$/is', $base64Data, $matches)) {
        $binary = base64_decode($matches[2]);
    } else {
        $binary = base64_decode($base64Data);
    }

    if (!$binary || strlen($binary) < 16) {
        return null;
    }

    $ext = 'jpg';
    $imgInfo = @getimagesizefromstring($binary);
    if ($imgInfo && !empty($imgInfo['mime'])) {
        $mimeMap = [
            'image/jpeg' => 'jpg',
            'image/png'  => 'png',
            'image/webp' => 'webp',
            'image/gif'  => 'gif',
        ];
        $ext = $mimeMap[$imgInfo['mime']] ?? 'jpg';
    }

    $uploadDir = __DIR__ . '/../uploads/payment_proofs';
    if (!is_dir($uploadDir)) {
        @mkdir($uploadDir, 0755, true);
    }

    $filename = $prefix . '_' . date('Ymd_His') . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
    $filepath = $uploadDir . '/' . $filename;

    if (file_put_contents($filepath, $binary) === false) {
        return null;
    }

    return '/php/uploads/payment_proofs/' . $filename;
}

/**
 * Every ACTIVE, not-yet-expired hold that overlaps this room/date range - the
 * same half-open comparison every other overlap check in this app uses
 * (start < otherEnd AND end > otherStart), so a same-day turnover between a
 * hold and a real booking is never wrongly treated as a clash. Returns full
 * rows (not just a boolean) so handleCreateBookingHold can tell "this is MY
 * own earlier quote, being revised" (see its own comment) apart from "someone
 * else already has this room/dates held".
 */
function getActiveBookingHoldConflicts(PDO $pdo, int $roomId, string $checkinDate, string $checkoutDate, ?string $excludeToken = null): array {
    ensureBookingHoldsSchema($pdo);
    $sql = "SELECT id, quote_token, created_by FROM booking_holds
            WHERE room_id = ? AND status = 'active' AND expires_at > NOW()
              AND checkin_date < ? AND checkout_date > ?";
    $params = [$roomId, $checkoutDate, $checkinDate];
    if ($excludeToken !== null) {
        $sql .= " AND quote_token != ?";
        $params[] = $excludeToken;
    }
    $sql .= " FOR UPDATE";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Boolean form of the above - whether ANY active hold overlaps this room/date
 * range, regardless of who created it. Used by guests.php/update_guest and
 * public_booking.php so a pending quote blocks a real booking from being
 * created underneath it too (those callers don't need to know or care whose
 * quote it is - a real booking must never overlap ANY pending hold).
 */
function getActiveBookingHoldConflict(PDO $pdo, int $roomId, string $checkinDate, string $checkoutDate, ?string $excludeToken = null): bool {
    return !empty(getActiveBookingHoldConflicts($pdo, $roomId, $checkinDate, $checkoutDate, $excludeToken));
}

/** Shared daily-rate summation - same shape as public_booking.php's, kept
 *  local rather than factored out to avoid touching that file's own logic
 *  for this unrelated feature. */
function computeHoldTariff(PDO $pdo, int $propertyId, int $roomId, string $checkinDate, string $checkoutDate, float $roomDefaultTariff, float $baseDefaultTariff, string $roomPricingMode, int $numGuests = 1): array {
    $rateRulesPerRoom = [];
    $floorRulesPerRoom = [];
    $dayCodeByIso = [1 => 'mo', 2 => 'tu', 3 => 'we', 4 => 'th', 5 => 'fr', 6 => 'sa', 7 => 'su'];
    try {
        $rrStmt = $pdo->prepare("
            SELECT room_id, start_date, end_date, rate_per_night, days_of_week, rule_type
            FROM room_rate_rules
            WHERE (property_id = ? OR room_id = ? OR room_id = 0 OR room_id IS NULL)
              AND start_date <= ? AND end_date >= ?
            ORDER BY room_id DESC, created_at DESC, id DESC
        ");
        $rrStmt->execute([$propertyId, $roomId, $checkoutDate, $checkinDate]);
        foreach ($rrStmt->fetchAll(PDO::FETCH_ASSOC) as $rr) {
            $rId = $rr['room_id'] !== null ? (int)$rr['room_id'] : 0;
            $ruleDays = !empty($rr['days_of_week']) ? explode(',', $rr['days_of_week']) : null;
            $isFloor = ($rr['rule_type'] ?? 'fixed') === 'floor';
            $cur = strtotime($rr['start_date']);
            $end = strtotime($rr['end_date']);
            while ($cur <= $end) {
                $dStr = date('Y-m-d', $cur);
                if ($ruleDays !== null && !in_array($dayCodeByIso[(int)date('N', $cur)], $ruleDays, true)) {
                    $cur = strtotime('+1 day', $cur);
                    continue;
                }
                if ($rr['rate_per_night'] !== null) {
                    $rate = (float)$rr['rate_per_night'];
                    if ($isFloor) {
                        $floorRulesPerRoom[$rId][$dStr] = max($floorRulesPerRoom[$rId][$dStr] ?? 0.0, $rate);
                    } else {
                        if (!isset($rateRulesPerRoom[$rId][$dStr])) {
                            $rateRulesPerRoom[$rId][$dStr] = $rate;
                        }
                    }
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

            // Floor rule guarantees price is never below floor
            $floor = 0.0;
            if (isset($floorRulesPerRoom[$roomId][$dStr])) $floor = max($floor, $floorRulesPerRoom[$roomId][$dStr]);
            if (isset($floorRulesPerRoom[0][$dStr])) $floor = max($floor, $floorRulesPerRoom[0][$dStr]);
            if (isset($floorRulesPerRoom[$propertyId][$dStr])) $floor = max($floor, $floorRulesPerRoom[$propertyId][$dStr]);
            if ($floor > 0.0) {
                $dailyRate = max($dailyRate, $floor);
            }
        }
        $totalTariff += $dailyRate;
        $nightCount++;
        $cur = strtotime('+1 day', $cur);
    }
    $nights = max(1, $nightCount);
    // Occupancy pricing and the per-stay cleaning fee are applied in one shared
    // place (php/rates/occupancy_pricing.php) rather than here, so this quote and
    // the public booking engine's can never drift into different totals for the
    // same stay - they already had byte-identical date loops.
    require_once __DIR__ . '/../rates/occupancy_pricing.php';
    $charges = computeStayCharges($pdo, $roomId ?: $propertyId, $totalTariff, $numGuests, $nights);
    return [$charges['total'], $nights, $charges];
}

/** Staff-authenticated: generate a quote + lock the room for a host-chosen duration. */
function handleCreateBookingHold(PDO $pdo, int $propertyId, string $createdBy): void {
    ensureBookingHoldsSchema($pdo);
    $data = json_decode(file_get_contents('php://input'), true) ?: [];

    $roomId = !empty($data['room_id']) ? (int)$data['room_id'] : $propertyId;
    $checkinDate = trim((string)($data['checkin_date'] ?? ''));
    $checkoutDate = trim((string)($data['checkout_date'] ?? ''));
    $guestName = trim((string)($data['guest_name'] ?? ''));
    $phone = trim((string)($data['phone'] ?? ''));
    $numGuests = max(1, (int)($data['num_guests'] ?? 2));
    $holdMinutes = resolveBookingHoldMinutes($data['hold_hours'] ?? null);

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

    [$totalTariff, $nights, $charges] = computeHoldTariff($pdo, $propertyId, $roomId, $checkinDate, $checkoutDate, $roomDefaultTariff, $baseDefaultTariff, $roomPricingMode, $numGuests);

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

        // A staff member revising a price (or dates) mid-conversation should be
        // able to just resend - not get blocked by their OWN earlier quote for
        // this exact room/dates. Only a hold created by a DIFFERENT staff
        // member blocks the request outright; the requester's own conflicting
        // hold(s) are superseded (cancelled) instead, since the new quote
        // replaces them. Reported live 6 Sep 2026: staff sent a quote, guest
        // asked to negotiate, staff changed the price and could no longer
        // resend at all.
        $conflicts = getActiveBookingHoldConflicts($pdo, $roomId, $checkinDate, $checkoutDate);
        $otherStaffConflicts = array_filter($conflicts, function ($c) use ($createdBy) {
            return ($c['created_by'] ?? '') !== $createdBy;
        });
        if (!empty($otherStaffConflicts)) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['status' => 'error', 'message' => 'A quote is already pending for this room and these dates']);
            return;
        }
        foreach ($conflicts as $c) {
            $pdo->prepare("UPDATE booking_holds SET status = 'cancelled' WHERE id = ?")->execute([$c['id']]);
        }

        $token = bin2hex(random_bytes(20));

        // expires_at is computed by MySQL's own NOW(), not PHP's time()/date() -
        // found live while testing (5 Sep 2026): this dev environment's PHP and
        // MySQL clocks disagree by 3 hours (different configured timezones), so
        // a PHP-computed "N minutes from now" written into this column could
        // already read as expired the instant MySQL's NOW() evaluated against
        // it - the entire lock silently doing nothing. Every comparison against
        // this column (getActiveBookingHoldConflicts above, and the expiry
        // checks in handleGetBookingHold/handleConfirmBookingHold below) must
        // likewise stay inside SQL, on MySQL's own clock, never mixed with a
        // PHP-side time value. $holdMinutes itself is safe to bind as a normal
        // parameter - MySQL accepts a placeholder as an INTERVAL's quantity.
        $insStmt = $pdo->prepare("
            INSERT INTO booking_holds (
                property_id, room_id, quote_token, guest_name, phone, no_of_guests,
                checkin_date, checkout_date, nights, total_tariff, status, created_by, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NOW() + INTERVAL ? MINUTE)
        ");
        $insStmt->execute([
            $propertyId, $roomId, $token, $guestName ?: null, $phone ?: null, $numGuests,
            $checkinDate, $checkoutDate, $nights, $totalTariff, $createdBy ?: null, $holdMinutes,
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
                'charges' => $charges,
                'expires_in_seconds' => $holdMinutes * 60,
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

    if ($hold['status'] === 'converted') {
        $guest = null;
        if (!empty($hold['converted_guest_id'])) {
            $gStmt = $pdo->prepare("SELECT id, guest_name, phone_number, checkin_date, expected_checkout, total_charge, payment_status, payment_proof_url, notes FROM guests WHERE id = ? LIMIT 1");
            $gStmt->execute([$hold['converted_guest_id']]);
            $guest = $gStmt->fetch(PDO::FETCH_ASSOC);
        }
        $propStmt = $pdo->prepare("SELECT id, slug, name, currency, address, checkin_time, checkout_time FROM properties WHERE id = ? LIMIT 1");
        $propStmt->execute([$hold['property_id']]);
        $prop = $propStmt->fetch(PDO::FETCH_ASSOC);

        $roomStmt = $pdo->prepare("SELECT name FROM properties WHERE id = ? LIMIT 1");
        $roomStmt->execute([$hold['room_id']]);
        $room = $roomStmt->fetch(PDO::FETCH_ASSOC);

        $refNumber = '';
        if ($guest && !empty($guest['notes']) && preg_match('/Ref:\s*([A-Z0-9\-]+)/i', $guest['notes'], $m)) {
            $refNumber = $m[1];
        }
        if (!$refNumber) {
            $refNumber = 'GC-' . date('ymd', strtotime($hold['created_at'])) . '-' . strtoupper(substr(md5((string)$hold['id']), 0, 4));
        }

        echo json_encode([
            'status' => 'success',
            'data' => [
                'hold_status' => 'converted',
                'converted_booking' => [
                    'booking_id' => $guest ? (int)$guest['id'] : (int)$hold['converted_guest_id'],
                    'reference_number' => $refNumber,
                    'property_name' => $prop['name'] ?? '',
                    'property_slug' => $prop['slug'] ?? '',
                    'room_name' => $room['name'] ?? '',
                    'guest_name' => $guest['guest_name'] ?? $hold['guest_name'] ?? '',
                    'phone' => $guest['phone_number'] ?? $hold['phone'] ?? '',
                    'checkin_date' => $guest['checkin_date'] ?? $hold['checkin_date'],
                    'checkout_date' => !empty($guest['expected_checkout']) ? explode(' ', trim($guest['expected_checkout']))[0] : $hold['checkout_date'],
                    'nights' => (int)$hold['nights'],
                    'total_tariff' => (float)($guest['total_charge'] ?? $hold['total_tariff']),
                    'payment_status' => $guest['payment_status'] ?? 'Pending Verification',
                    'payment_proof_url' => $guest['payment_proof_url'] ?? $hold['payment_proof_url'] ?? null,
                    'checkin_time' => $prop['checkin_time'] ?: '14:00',
                    'checkout_time' => $prop['checkout_time'] ?: '11:00',
                    'address' => $prop['address'] ?? '',
                    'currency' => $prop['currency'] ?? 'INR',
                ],
            ],
        ]);
        return;
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

/** Public, unauthenticated - converts an active hold into a real guests row with payment proof. */
function handleConfirmBookingHold(PDO $pdo): void {
    ensureBookingHoldsSchema($pdo);
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $token = trim((string)($data['quote_token'] ?? ''));
    $guestName = trim((string)($data['guest_name'] ?? ''));
    $phone = trim((string)($data['phone'] ?? ''));
    $email = trim((string)($data['email'] ?? ''));
    $numGuests = max(1, (int)($data['num_guests'] ?? 2));
    $specialRequests = trim((string)($data['special_requests'] ?? ''));
    $paymentProofBase64 = trim((string)($data['payment_proof_base64'] ?? $data['payment_screenshot_base64'] ?? ''));

    if (empty($token) || empty($phone)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Phone number is required']);
        return;
    }

    if (empty($guestName)) {
        $guestName = 'Guest';
    }

    if (empty($paymentProofBase64)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Payment screenshot is required to confirm booking.']);
        return;
    }

    $proofUrl = savePaymentProofImage($paymentProofBase64, 'quote_proof');
    if (!$proofUrl) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid or unreadable payment screenshot. Please choose an image file (JPEG, PNG, WebP).']);
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

        $propStmt = $pdo->prepare("SELECT name, slug, email, phone, upi_id, address, checkin_time, checkout_time FROM properties WHERE id = ? LIMIT 1");
        $propStmt->execute([$propertyId]);
        $prop = $propStmt->fetch(PDO::FETCH_ASSOC);

        $roomStmt = $pdo->prepare("SELECT name FROM properties WHERE id = ? LIMIT 1");
        $roomStmt->execute([$roomId]);
        $room = $roomStmt->fetch(PDO::FETCH_ASSOC);

        $refNumber = 'GC-' . date('ymd') . '-' . strtoupper(substr(md5(uniqid((string)mt_rand(), true)), 0, 4));
        $notes = "Ref: {$refNumber}\nPayment Method: UPI Transfer\nPayment Status: Pending Verification\nSource: WhatsApp Instant Quote";
        if (!empty($email)) $notes .= "\nEmail: " . $email;
        if (!empty($specialRequests)) $notes .= "\nSpecial Requests: " . $specialRequests;

        $totalTariff = (float)$hold['total_tariff'];
        $nights = (int)$hold['nights'];
        $avgNightlyRate = $nights > 0 ? round($totalTariff / $nights, 2) : $totalTariff;

        $insertStmt = $pdo->prepare("
            INSERT INTO guests (
                guest_name, phone_number, checkin_date, expected_checkout,
                status, payment_status, payment_proof_url, advance_paid, total_charge, pending_amount,
                base_room_rent, notes, booking_source, no_of_guests,
                property_id, room_id
            ) VALUES (
                ?, ?, ?, ?,
                'Booked', 'Pending Verification', ?, 0, ?, ?,
                ?, ?, 'WhatsApp Quote', ?,
                ?, ?
            )
        ");
        $insertStmt->execute([
            $guestName, $phone, $checkinDate, $checkoutDate,
            $proofUrl, $totalTariff, $totalTariff,
            $avgNightlyRate, $notes, $numGuests,
            $propertyId, $roomId,
        ]);
        $bookingId = (int)$pdo->lastInsertId();

        $pdo->prepare("UPDATE booking_holds SET status = 'converted', converted_guest_id = ?, payment_proof_url = ? WHERE id = ?")
            ->execute([$bookingId, $proofUrl, $hold['id']]);

        // Voucher-template resolution + link (7 Sep 2026) - see
        // getPropertyVoucherFields()'s doc comment. This flow has no other
        // property fetch on the frontend (quote mode skips
        // fetchPublicData()), so everything the shared WhatsApp template
        // needs must travel in this response, unlike the instant-booking
        // path which can also read it off the already-loaded property state.
        $voucherFields = getPropertyVoucherFields($pdo, $propertyId);
        $voucherToken = getOrCreateVoucherToken($pdo, $propertyId, $bookingId);

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

        // Build absolute URL for payment proof
        $host = $_SERVER['HTTP_HOST'] ?? 'ground-code.com';
        $proto = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $fullProofUrl = "{$proto}://{$host}{$proofUrl}";

        // Telegram alert to admin group with deepLinkParams to booking
        try {
            if (is_file(__DIR__ . '/../telegram/sender.php')) {
                require_once __DIR__ . '/../telegram/sender.php';
                if (function_exists('sendPropertyTelegramMessage')) {
                    $tgMsg = "🎉 <b>WHATSAPP QUOTE CONFIRMED (Awaiting Verification)</b>\n\n"
                           . "🏨 <b>Property:</b> " . ($prop['name'] ?? '') . "\n"
                           . "🚪 <b>Room:</b> " . ($room['name'] ?? '') . "\n"
                           . "👤 <b>Guest:</b> {$guestName}\n"
                           . "📞 <b>Phone:</b> {$phone}\n"
                           . "📅 <b>Dates:</b> {$checkinDate} to {$checkoutDate} ({$nights} night" . ($nights > 1 ? 's' : '') . ")\n"
                           . "💰 <b>Total:</b> ₹" . number_format($totalTariff, 0) . "\n"
                           . "🔖 <b>Ref:</b> {$refNumber}\n"
                           . "⚠️ <b>Payment:</b> Screenshot Uploaded (Pending Admin Verification)\n"
                           . "📸 <b>Payment Screenshot:</b> <a href=\"{$fullProofUrl}\">View Proof</a>";
                    sendPropertyTelegramMessage($pdo, $propertyId, 'admin', $tgMsg, null, null, ['booking_id' => $bookingId]);
                }
            }
        } catch (Exception $tgErr) {
            // Non-blocking - the booking itself already committed above.
        }

        // Email notification to property / tenant admin
        try {
            if (is_file(__DIR__ . '/../utils/mailer.php')) {
                require_once __DIR__ . '/../utils/mailer.php';
                $recipientEmail = null;
                if (!empty($prop['email'])) {
                    $recipientEmail = $prop['email'];
                } else {
                    $tStmt = $pdo->prepare("SELECT t.email FROM properties p JOIN tenants t ON p.tenant_id = t.id WHERE p.id = ? LIMIT 1");
                    $tStmt->execute([$propertyId]);
                    $recipientEmail = $tStmt->fetchColumn();
                }
                if ($recipientEmail && function_exists('sendSmtpEmail')) {
                    $emailSubject = "New Direct Booking (Ref: {$refNumber}) - Payment Verification Required";
                    $emailBody = "<h2>New Direct Booking Pending Verification</h2>"
                        . "<p>A guest has confirmed their WhatsApp quote and uploaded payment proof.</p>"
                        . "<ul>"
                        . "<li><strong>Property:</strong> " . htmlspecialchars($prop['name'] ?? '') . "</li>"
                        . "<li><strong>Room:</strong> " . htmlspecialchars($room['name'] ?? '') . "</li>"
                        . "<li><strong>Guest:</strong> " . htmlspecialchars($guestName) . " (" . htmlspecialchars($phone) . ")</li>"
                        . "<li><strong>Dates:</strong> {$checkinDate} to {$checkoutDate} ({$nights} nights)</li>"
                        . "<li><strong>Total Tariff:</strong> ₹" . number_format($totalTariff, 0) . "</li>"
                        . "<li><strong>Reference:</strong> {$refNumber}</li>"
                        . "</ul>"
                        . "<p><a href=\"{$fullProofUrl}\" style=\"display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;\">View Payment Screenshot</a></p>";
                    sendSmtpEmail($pdo, $recipientEmail, $emailSubject, $emailBody);
                }
            }
        } catch (Exception $mailErr) {
            // Non-blocking
        }

        echo json_encode([
            'status' => 'success',
            'data' => array_merge([
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
                'payment_method' => 'UPI Transfer',
                'payment_status' => 'Pending Verification',
                'payment_proof_url' => $proofUrl,
                'upi_id' => $prop['upi_id'] ?? null,
                'checkin_time' => $prop['checkin_time'] ?: '14:00',
                'checkout_time' => $prop['checkout_time'] ?: '11:00',
                'address' => $prop['address'] ?? '',
                'num_guests' => $numGuests,
                'voucher_token' => $voucherToken,
            ], $voucherFields),
        ]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to confirm booking: ' . $e->getMessage()]);
    }
}

/** Staff/Admin authenticated endpoint to verify quote booking payment proof. */
function handleVerifyBookingPayment(PDO $pdo, int $propertyId, string $verifiedBy): void {
    ensureBookingHoldsSchema($pdo);
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $guestId = intval($data['guest_id'] ?? 0);
    $action = trim((string)($data['action'] ?? 'confirm'));

    if ($guestId <= 0) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid guest ID']);
        return;
    }

    $stmt = $pdo->prepare("SELECT * FROM guests WHERE id = ? AND property_id = ? LIMIT 1");
    $stmt->execute([$guestId, $propertyId]);
    $guest = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$guest) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Booking not found']);
        return;
    }

    $totalCharge = (float)$guest['total_charge'];
    $advancePaid = (float)$guest['advance_paid'];
    $notes = (string)($guest['notes'] ?? '');

    if ($action === 'confirm') {
        $verificationNote = "\n[Payment Verified by {$verifiedBy} on " . date('d M Y H:i') . "]";
        $newNotes = $notes . $verificationNote;

        if ($advancePaid <= 0) {
            $advancePaid = $totalCharge;
            $pendingAmount = 0.0;
            $advanceReceivedBy = $guest['advance_received_by'] ?: $verifiedBy;
        } else {
            $pendingAmount = max(0.0, $totalCharge - $advancePaid);
            $advanceReceivedBy = $guest['advance_received_by'] ?: $verifiedBy;
        }

        $upd = $pdo->prepare("
            UPDATE guests
            SET payment_status = 'Paid',
                advance_paid = ?,
                pending_amount = ?,
                advance_received_by = ?,
                notes = ?
            WHERE id = ? AND property_id = ?
        ");
        $upd->execute([$advancePaid, $pendingAmount, $advanceReceivedBy, $newNotes, $guestId, $propertyId]);

        $fetchStmt = $pdo->prepare("SELECT * FROM guests WHERE id = ? LIMIT 1");
        $fetchStmt->execute([$guestId]);
        $updated = $fetchStmt->fetch(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'message' => 'Payment verified and confirmed',
            'data' => $updated,
        ]);
    } else {
        $rejectionNote = "\n[Payment Proof Rejected by {$verifiedBy} on " . date('d M Y H:i') . "]";
        $newNotes = $notes . $rejectionNote;
        $upd = $pdo->prepare("
            UPDATE guests
            SET payment_status = 'Payment Rejected',
                notes = ?
            WHERE id = ? AND property_id = ?
        ");
        $upd->execute([$newNotes, $guestId, $propertyId]);

        $fetchStmt = $pdo->prepare("SELECT * FROM guests WHERE id = ? LIMIT 1");
        $fetchStmt->execute([$guestId]);
        $updated = $fetchStmt->fetch(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'message' => 'Payment marked as rejected',
            'data' => $updated,
        ]);
    }
}
