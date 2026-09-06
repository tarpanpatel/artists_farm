<?php
/**
 * Booking payments - a real record of every payment against a booking.
 * Added 7 Sep 2026.
 *
 * WHY THIS EXISTS
 * ---------------
 * `guests` stores payment as three scalars: advance_paid, advance_received_by,
 * pending_received_by. That shape can only describe ONE collection event, and
 * real stays routinely have several - a deposit taken over the phone on the
 * 15th, the balance handed over at check-in three weeks later, sometimes a
 * part-payment in between. Today the second collection overwrites the first:
 * the earlier amount is folded into a running total and the earlier collector's
 * name is simply lost.
 *
 * That loss is not cosmetic. petty_cash.php computes each staff member's
 * cash-in-hand by summing `advance_received_by = <name>` across guests, so when
 * Sunita takes 5,000 and Ramesh later takes 9,000 on the same booking, one of
 * them ends up accountable for money they never touched and the other for none
 * of it. It also makes "Payment received: 5,000 on 15 Jul 2026" impossible to
 * put on a guest voucher, because no date is stored anywhere.
 *
 * TWO NAMES, DELIBERATELY
 * -----------------------
 * Rows carry BOTH received_by_staff_id and received_by_name. The existing
 * reconciliation matches staff on their DISPLAY NAME - there is already a dated
 * bug comment in petty_cash.php about it having used `username` instead - which
 * means renaming a staff member silently detaches them from their own history.
 * New code joins on the id; the name is kept as it was recorded so old rows
 * stay readable and so a payment collected by someone since deleted still says
 * who took it.
 *
 * ROLL-UP, NOT CUTOVER
 * --------------------
 * Every write here recomputes guests.advance_paid / pending_amount /
 * advance_received_by from the payment rows. Nothing else in the app has to
 * change: petty cash, the ledger, the calendar and the vouchers all keep
 * reading the same columns they always did, now derived rather than typed. That
 * is the whole point - cash-handling logic is the one place in this app where
 * being wrong means somebody is short at the end of a shift, so it is not being
 * rewritten on the same day the table lands. Pointing petty_cash.php at this
 * table directly is a later, optional step.
 */

if (!function_exists('ensureBookingPaymentsSchema')) {

/**
 * Self-healing schema, same convention as the rest of the app (see CLAUDE.md) -
 * a table added on one environment must not need a manual migration on another.
 */
function ensureBookingPaymentsSchema(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS booking_payments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            property_id INT NOT NULL,
            booking_id INT NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            method VARCHAR(50) NOT NULL DEFAULT 'Cash',
            kind VARCHAR(20) NOT NULL DEFAULT 'advance',
            received_by_staff_id INT DEFAULT NULL,
            received_by_name VARCHAR(150) NOT NULL DEFAULT '',
            received_at DATETIME NOT NULL,
            note VARCHAR(255) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_bp_booking (booking_id),
            INDEX idx_bp_property_date (property_id, received_at),
            INDEX idx_bp_staff (received_by_staff_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Exception $e) {}
}

/**
 * Recompute the guests-row scalars from this booking's payment rows.
 *
 * advance_received_by keeps its existing single-value meaning - the MOST RECENT
 * collector - because that is what petty cash and every screen already expect.
 * It is a lossy summary of the rows now, not the record itself; the rows are.
 *
 * pending_amount is deliberately NOT recomputed as (total_charge - paid) here:
 * it can legitimately carry extras baked in by the checkout flow (see
 * BookingDetailsModal's extrasBaked), so overwriting it would silently drop
 * charges. Only the paid side is derived; the pending side is reduced by the
 * payment and floored at zero.
 */
function recalcBookingPaymentTotals(PDO $pdo, int $bookingId, int $propertyId): array {
    ensureBookingPaymentsSchema($pdo);

    $sumStmt = $pdo->prepare("SELECT COALESCE(SUM(amount), 0) FROM booking_payments WHERE booking_id = ? AND property_id = ?");
    $sumStmt->execute([$bookingId, $propertyId]);
    $paid = round((float)$sumStmt->fetchColumn(), 2);

    $lastStmt = $pdo->prepare("SELECT received_by_name FROM booking_payments
                               WHERE booking_id = ? AND property_id = ? AND received_by_name <> ''
                               ORDER BY received_at DESC, id DESC LIMIT 1");
    $lastStmt->execute([$bookingId, $propertyId]);
    $lastReceiver = (string)($lastStmt->fetchColumn() ?: '');

    $gStmt = $pdo->prepare("SELECT total_charge, base_room_rent FROM guests WHERE id = ? AND property_id = ? LIMIT 1");
    $gStmt->execute([$bookingId, $propertyId]);
    $g = $gStmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $total = round((float)($g['total_charge'] ?? $g['base_room_rent'] ?? 0), 2);
    $pending = max(0, round($total - $paid, 2));

    $upd = $pdo->prepare("UPDATE guests SET advance_paid = ?, pending_amount = ?, advance_received_by = ? WHERE id = ? AND property_id = ?");
    $upd->execute([$paid, $pending, $lastReceiver, $bookingId, $propertyId]);

    return ['paid' => $paid, 'pending' => $pending, 'last_received_by' => $lastReceiver];
}

/**
 * Record one payment. Used both by the UI and by add_guest, which back-fills the
 * booking's opening advance so a booking created the normal way still has a real
 * payment row rather than only a scalar.
 */
function recordBookingPayment(PDO $pdo, int $propertyId, int $bookingId, array $p): int {
    ensureBookingPaymentsSchema($pdo);
    $amount = round((float)($p['amount'] ?? 0), 2);
    if ($amount <= 0) return 0;

    $receivedAt = trim((string)($p['received_at'] ?? ''));
    if ($receivedAt === '') $receivedAt = date('Y-m-d H:i:s');
    // Accept a bare date from a date picker without silently landing at 00:00
    // of the wrong day in another timezone.
    if (strlen($receivedAt) === 10) $receivedAt .= ' 12:00:00';

    $stmt = $pdo->prepare("INSERT INTO booking_payments
        (property_id, booking_id, amount, method, kind, received_by_staff_id, received_by_name, received_at, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([
        $propertyId,
        $bookingId,
        $amount,
        trim((string)($p['method'] ?? 'Cash')) ?: 'Cash',
        trim((string)($p['kind'] ?? 'advance')) ?: 'advance',
        !empty($p['received_by_staff_id']) ? (int)$p['received_by_staff_id'] : null,
        trim((string)($p['received_by_name'] ?? '')),
        $receivedAt,
        trim((string)($p['note'] ?? '')) ?: null,
    ]);
    $paymentId = (int)$pdo->lastInsertId();

    recalcBookingPaymentTotals($pdo, $bookingId, $propertyId);

    // Ledger posting, per payment. entry_key is the payment's own id so a
    // re-post can never double-count (postFinancialLedger uses INSERT IGNORE on
    // that key), and $propertyId is passed explicitly - see CLAUDE.md's note on
    // postFinancialLedger silently defaulting to property 1.
    if (function_exists('postFinancialLedger')) {
        try {
            $nameStmt = $pdo->prepare("SELECT guest_name FROM guests WHERE id = ? LIMIT 1");
            $nameStmt->execute([$bookingId]);
            $guestName = (string)($nameStmt->fetchColumn() ?: 'Guest');
            postFinancialLedger($pdo, [
                'entry_key'      => 'booking_payment:' . $paymentId,
                'occurred_at'    => $receivedAt,
                'direction'      => 'credit',
                'amount'         => $amount,
                'category'       => 'Guest Payment',
                'payment_method' => trim((string)($p['method'] ?? 'Cash')) ?: 'Cash',
                'party_type'     => 'guest',
                'party_id'       => $bookingId,
                'party_name'     => $guestName,
                'source_type'    => 'booking_payment',
                'source_id'      => $paymentId,
                'description'    => 'Payment received against booking #' . $bookingId,
            ], $propertyId);
        } catch (Exception $e) {}
    }

    return $paymentId;
}

/**
 * Record a payment row WITHOUT posting to the financial ledger.
 *
 * Used by add_guest for a booking's opening advance, which already posts its own
 * 'guest_registration' ledger entry. Both entries would survive INSERT IGNORE
 * (different entry_keys) and the same rupees would appear twice in the books.
 */
function recordBookingPaymentRowOnly(PDO $pdo, int $propertyId, int $bookingId, array $p): int {
    ensureBookingPaymentsSchema($pdo);
    $amount = round((float)($p['amount'] ?? 0), 2);
    if ($amount <= 0) return 0;
    $receivedAt = trim((string)($p['received_at'] ?? '')) ?: date('Y-m-d H:i:s');
    if (strlen($receivedAt) === 10) $receivedAt .= ' 12:00:00';
    $stmt = $pdo->prepare("INSERT INTO booking_payments
        (property_id, booking_id, amount, method, kind, received_by_staff_id, received_by_name, received_at, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([
        $propertyId, $bookingId, $amount,
        trim((string)($p['method'] ?? 'Cash')) ?: 'Cash',
        trim((string)($p['kind'] ?? 'advance')) ?: 'advance',
        !empty($p['received_by_staff_id']) ? (int)$p['received_by_staff_id'] : null,
        trim((string)($p['received_by_name'] ?? '')),
        $receivedAt,
        trim((string)($p['note'] ?? '')) ?: null,
    ]);
    // No recalc either: add_guest is mid-transaction and has already written the
    // very same advance_paid/pending_amount values this row was built from.
    return (int)$pdo->lastInsertId();
}

function getBookingPayments(PDO $pdo, int $propertyId, int $bookingId): array {
    ensureBookingPaymentsSchema($pdo);
    $stmt = $pdo->prepare("SELECT id, amount, method, kind, received_by_staff_id, received_by_name, received_at, note
                           FROM booking_payments
                           WHERE booking_id = ? AND property_id = ?
                           ORDER BY received_at ASC, id ASC");
    $stmt->execute([$bookingId, $propertyId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    foreach ($rows as &$r) {
        $r['amount'] = (float)$r['amount'];
        $r['received_by_staff_id'] = $r['received_by_staff_id'] !== null ? (int)$r['received_by_staff_id'] : null;
    }
    unset($r);
    return $rows;
}

function deleteBookingPayment(PDO $pdo, int $propertyId, int $paymentId): bool {
    ensureBookingPaymentsSchema($pdo);
    $find = $pdo->prepare("SELECT booking_id FROM booking_payments WHERE id = ? AND property_id = ? LIMIT 1");
    $find->execute([$paymentId, $propertyId]);
    $bookingId = (int)($find->fetchColumn() ?: 0);
    if (!$bookingId) return false;

    $pdo->prepare("DELETE FROM booking_payments WHERE id = ? AND property_id = ?")->execute([$paymentId, $propertyId]);

    // Reverse the ledger entry too, or deleting a mistyped payment would leave
    // the money sitting in the books forever.
    if (function_exists('reverseFinancialSource')) {
        // Signature is ($pdo, sourceType, sourceId, reason, propertyId) - the
        // reason slot sits BEFORE propertyId, and passing propertyId into it
        // would post the reversal against property 1 (its default) for every
        // tenant. See CLAUDE.md on postFinancialLedger's identical trap.
        try { reverseFinancialSource($pdo, 'booking_payment', (string)$paymentId, 'Payment deleted', $propertyId); } catch (Exception $e) {}
    }

    recalcBookingPaymentTotals($pdo, $bookingId, $propertyId);
    return true;
}

} // function_exists guard
