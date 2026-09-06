<?php
/**
 * Public booking voucher - a guest-facing page for one booking, reachable
 * without a login. Added 7 Sep 2026.
 *
 * SECURITY MODEL
 * --------------
 * The credential is a per-booking `voucher_token` (20 random bytes, hex) and
 * nothing else - exactly the model booking_holds.php already uses for its
 * quote_token, so there is one public-link pattern in this codebase rather than
 * two competing ones.
 *
 * The token exists specifically so that guests.id is NEVER the public
 * identifier. Booking ids are sequential: a URL keyed on one lets anybody walk
 * .../voucher/1, /2, /3 and read every guest name, phone number and payment
 * total the tenant has ever recorded. That is the whole reason for this file's
 * indirection, and it is why the token is generated server-side and never
 * derived from anything guessable.
 *
 * WHAT IS DELIBERATELY NOT RETURNED
 * ---------------------------------
 * A voucher answers "what did I book, and what do I still owe" - so it carries
 * the guest's own name/phone, dates, unit, money and the property's policies.
 * It does NOT carry internal operational data: staff names against payments
 * (received_by is who in the business collected it - a guest has no use for it
 * and it is nobody's business outside the property), ID-verification or C-form
 * status, internal notes, or anything about any other booking. Adding a field
 * here publishes it to anyone holding the link, so the default answer to "should
 * this be on the voucher" is no.
 */

if (!function_exists('ensureGuestVoucherTokenColumn')) {

function ensureGuestVoucherTokenColumn(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        $cols = $pdo->query("SHOW COLUMNS FROM guests")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('voucher_token', $cols)) {
            $pdo->exec("ALTER TABLE guests ADD COLUMN `voucher_token` VARCHAR(64) DEFAULT NULL");
            // Unique so a token collision fails loudly at write time rather than
            // silently serving two bookings from one link.
            try { $pdo->exec("ALTER TABLE guests ADD UNIQUE KEY uq_guest_voucher_token (voucher_token)"); } catch (Exception $e) {}
        }
    } catch (Exception $e) {}
}

/**
 * This booking's voucher token, generated on first use.
 *
 * Lazy rather than backfilled: a token is only worth existing once somebody
 * actually shares a link, and generating on demand means every booking already
 * in the database gets one the first time its voucher is sent, with no
 * migration.
 */
function getOrCreateVoucherToken(PDO $pdo, int $propertyId, int $bookingId): ?string {
    ensureGuestVoucherTokenColumn($pdo);
    try {
        $stmt = $pdo->prepare("SELECT voucher_token FROM guests WHERE id = ? AND property_id = ? LIMIT 1");
        $stmt->execute([$bookingId, $propertyId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row === false) return null;               // not this property's booking
        if (!empty($row['voucher_token'])) return $row['voucher_token'];

        $token = bin2hex(random_bytes(20));
        $upd = $pdo->prepare("UPDATE guests SET voucher_token = ? WHERE id = ? AND property_id = ?");
        $upd->execute([$token, $bookingId, $propertyId]);
        return $token;
    } catch (Exception $e) {
        return null;
    }
}

/**
 * Serve one booking's public voucher. Unauthenticated by design - the token is
 * the credential.
 */
function handleGetPublicVoucher(PDO $pdo, string $token): void {
    ensureGuestVoucherTokenColumn($pdo);
    $token = trim($token);
    // Tokens are fixed-length hex. Rejecting anything else up front keeps
    // malformed input away from the query entirely.
    if ($token === '' || !preg_match('/^[a-f0-9]{40}$/', $token)) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'This voucher link is not valid.']);
        return;
    }

    $stmt = $pdo->prepare("
        SELECT g.id, g.guest_name, g.phone_number, g.checkin_date, g.expected_checkout,
               g.no_of_guests, g.adults, g.children, g.base_room_rent, g.total_charge,
               g.advance_paid, g.pending_amount, g.status, g.property_id, g.room_id,
               g.booking_source, g.ota_source_label
        FROM guests g
        WHERE g.voucher_token = ? LIMIT 1
    ");
    $stmt->execute([$token]);
    $b = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$b) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'This voucher link is not valid.']);
        return;
    }

    // The unit the guest actually booked, and the property that owns it. For a
    // MULTI_KEY room, policies/contact live on the PARENT - a room row carries
    // its own name and times but not the address, phone or house rules.
    $unitName = '';
    $policyPropertyId = (int)$b['property_id'];
    if (!empty($b['room_id'])) {
        $rStmt = $pdo->prepare("SELECT name, parent_property_id, checkin_time, checkout_time FROM properties WHERE id = ? LIMIT 1");
        $rStmt->execute([(int)$b['room_id']]);
        if ($room = $rStmt->fetch(PDO::FETCH_ASSOC)) {
            $unitName = (string)$room['name'];
            if (!empty($room['parent_property_id'])) $policyPropertyId = (int)$room['parent_property_id'];
        }
    }

    $pStmt = $pdo->prepare("SELECT name, address, phone, google_maps_link, checkin_time, checkout_time,
                                   house_rules, instructions, cancellation_policy, security_deposit,
                                   wifi_network, house_manual
                            FROM properties WHERE id = ? LIMIT 1");
    $pStmt->execute([$policyPropertyId]);
    $p = $pStmt->fetch(PDO::FETCH_ASSOC) ?: [];

    // Payments, without the internal "who collected it" - see the file header.
    $payments = [];
    if (function_exists('getBookingPayments')) {
        foreach (getBookingPayments($pdo, (int)$b['property_id'], (int)$b['id']) as $row) {
            $payments[] = [
                'amount' => (float)$row['amount'],
                'method' => $row['method'],
                'received_at' => $row['received_at'],
            ];
        }
    }

    $paid = round((float)$b['advance_paid'], 2);
    $total = round((float)($b['total_charge'] ?: $b['base_room_rent']), 2);

    echo json_encode(['status' => 'success', 'data' => [
        'booking_id'    => (int)$b['id'],
        'guest_name'    => $b['guest_name'],
        'phone_number'  => $b['phone_number'],
        'status'        => $b['status'],
        'checkin_date'  => $b['checkin_date'],
        'checkout_date' => $b['expected_checkout'],
        'checkin_time'  => $p['checkin_time'] ?? null,
        'checkout_time' => $p['checkout_time'] ?? null,
        'unit_name'     => $unitName,
        'no_of_guests'  => (int)$b['no_of_guests'],
        'adults'        => (int)$b['adults'],
        'children'      => (int)$b['children'],
        'source'        => $b['ota_source_label'] ?: $b['booking_source'],
        'total'         => $total,
        'paid'          => $paid,
        'balance'       => max(0, round($total - $paid, 2)),
        'security_deposit' => isset($p['security_deposit']) ? (float)$p['security_deposit'] : 0,
        'payments'      => $payments,
        'property'      => [
            'name'             => $p['name'] ?? '',
            'address'          => $p['address'] ?? '',
            'phone'            => $p['phone'] ?? '',
            'maps_link'        => $p['google_maps_link'] ?? '',
            'house_rules'      => $p['house_rules'] ?? '',
            'instructions'     => $p['instructions'] ?? '',
            'cancellation_policy' => $p['cancellation_policy'] ?? '',
            'wifi_network'     => $p['wifi_network'] ?? '',
            'house_manual'     => $p['house_manual'] ?? '',
        ],
    ]]);
}

} // function_exists guard
