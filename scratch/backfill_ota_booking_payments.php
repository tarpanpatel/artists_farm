<?php
/**
 * One-time backfill: seed a booking_payments row for existing OTA bookings
 * that are already fully paid but predate the fix in
 * php/channex/webhook_receiver.php (7 Sep 2026) - see that file's own
 * "Seed/refresh the booking_payments ledger row" comment for the live-path
 * fix this backfills around.
 *
 * webhook_receiver.php writes guests.advance_paid/pending_amount directly and
 * never went through add_guest() (the only place that used to call
 * recordBookingPaymentRowOnly()), so any OTA booking synced BEFORE today's fix
 * shipped has a correct Advance Paid / Pending scalar pair but zero rows in
 * booking_payments - BookingDetailsModal's "Payments received" panel reads
 * only that table, so it shows "Nothing recorded yet." even though the
 * booking is, in fact, fully paid. Booking #746 (Photographer's Studio,
 * Airbnb) is the reported example.
 *
 * SCOPE: guests.booking_source = 'OTA', advance_paid > 0, pending_amount <= 0
 * (i.e. exactly the guests.php/webhook_receiver.php "OTA is merchant of
 * record" case, where advance_paid is always either 0 or the full total -
 * never a partial amount - see webhook_receiver.php's own $otaCollectsPayment
 * branch), with no existing booking_payments row for that booking_id.
 *
 * Idempotent / safe to re-run: the NOT EXISTS check means a booking already
 * seeded (by this script, or by the live fix handling a later webhook for it)
 * is simply skipped on a second pass. Runs each seed in its own transaction so
 * one bad row can't abort the rest of the batch.
 *
 * Deliberately uses recordBookingPaymentRowOnly() (no ledger posting) rather
 * than recordBookingPayment() - same reasoning as add_guest()'s own opening
 * advance and webhook_receiver.php's live fix: this money is OTA
 * merchant-of-record, it never touched the property's own cash drawer, and
 * webhook_receiver.php never posted a financial-ledger entry for it in the
 * first place, so backfilling a payments-table row must not manufacture one
 * either.
 *
 * USAGE (run from the environment whose DB you mean to touch - see the
 * environment guard below, this will refuse to run against production):
 *   php backfill_ota_booking_payments.php                     # dry run
 *   php backfill_ota_booking_payments.php --apply              # writes rows
 *   php backfill_ota_booking_payments.php --apply --property-id=5   # scope to one property
 */

require_once __DIR__ . '/../php/config/database.php';
require_once __DIR__ . '/../php/finance/booking_payments.php';

// Self-heal booking_payments before the main query below references it in a
// NOT EXISTS subquery - this script can be the very first thing to touch the
// table on an environment that hasn't taken a real request through router.php
// yet (confirmed live on local: the table simply didn't exist, and the
// uncaught PDOException from the raw query was silently swallowed by
// logger.php's exception handler with zero visible output).
ensureBookingPaymentsSchema($pdo);

$apply = in_array('--apply', $argv, true);
$propertyId = null;
foreach ($argv as $arg) {
    if (preg_match('/^--property-id=(\d+)$/', $arg, $m)) {
        $propertyId = (int)$m[1];
    }
}

$envLabel = APP_IS_LOCAL_ENV ? 'LOCAL' : (APP_IS_STAGING_ENV ? 'STAGING' : 'PRODUCTION');

// Hard guard: this writes real guest financial records. Per this project's
// CLAUDE.md production rule, nothing this session runs may touch production -
// that includes a data backfill, not just a file deploy. If this ever needs
// to run against production, that is the user's own call to make by hand.
if ($envLabel === 'PRODUCTION') {
    fwrite(STDERR, "Refusing to run: this resolved to the PRODUCTION database. This script must only be run against local or staging.\n");
    exit(1);
}

echo "Environment: $envLabel\n";
echo 'Mode: ' . ($apply ? 'APPLY (writing rows)' : 'DRY RUN (no writes)') . "\n";
if ($propertyId) {
    echo "Scoped to property_id = $propertyId\n";
}
echo str_repeat('-', 78) . "\n";

$sql = "
    SELECT g.id, g.property_id, g.guest_name, g.advance_paid, g.pending_amount,
           g.total_charge, g.ota_source, g.ota_source_label, g.booking_source,
           g.checkin_date, g.updated_at, g.status
    FROM guests g
    WHERE g.booking_source = 'OTA'
      AND g.advance_paid > 0
      AND g.pending_amount <= 0
      AND NOT EXISTS (
          SELECT 1 FROM booking_payments bp
          WHERE bp.booking_id = g.id AND bp.property_id = g.property_id
      )
";
$params = [];
if ($propertyId) {
    $sql .= ' AND g.property_id = ?';
    $params[] = $propertyId;
}
$sql .= ' ORDER BY g.property_id, g.id';

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (!$rows) {
    echo "Nothing to backfill - every fully-paid OTA booking already has a payments row.\n";
    exit(0);
}

echo 'Found ' . count($rows) . " booking(s) with no payments row:\n\n";

$seeded = 0;
$failed = 0;
foreach ($rows as $g) {
    $bookingId = (int)$g['id'];
    $propId = (int)$g['property_id'];
    $amount = round((float)$g['advance_paid'], 2);
    $label = trim((string)($g['ota_source_label'] ?? '')) ?: (trim((string)($g['ota_source'] ?? '')) ?: 'OTA channel');
    // guests has no created_at column (confirmed live - checked SHOW COLUMNS
    // rather than assumed), so there is no true "when this booking was made"
    // timestamp to backdate to. checkin_date is the closest always-populated
    // anchor and is far better than stamping every row with today's date,
    // which would bunch a year of bookings onto one day in the payment
    // history. Falls back to updated_at, then now, only if checkin_date is
    // somehow blank.
    $receivedAt = trim((string)($g['checkin_date'] ?? ''))
        ?: trim((string)($g['updated_at'] ?? ''))
        ?: date('Y-m-d H:i:s');

    printf(
        "  #%-5d [prop %d] %-25s Rs.%-10s %-16s (checkin %s, status %s)\n",
        $bookingId,
        $propId,
        mb_substr((string)($g['guest_name'] ?? ''), 0, 25),
        number_format($amount, 2),
        $label,
        $g['checkin_date'],
        $g['status']
    );

    if ($apply) {
        try {
            $pdo->beginTransaction();
            recordBookingPaymentRowOnly($pdo, $propId, $bookingId, [
                'amount' => $amount,
                'method' => $label,
                'kind' => 'ota_auto',
                'received_by_name' => trim($label . ' (merchant of record)'),
                'received_at' => $receivedAt,
                'note' => 'Backfilled ' . date('Y-m-d') . ' - collected by the OTA at booking, synced via Channex',
            ]);
            $pdo->commit();
            $seeded++;
        } catch (Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            echo '    ! FAILED: ' . $e->getMessage() . "\n";
            $failed++;
        }
    }
}

echo str_repeat('-', 78) . "\n";
if ($apply) {
    echo "Done. Seeded $seeded row(s)" . ($failed ? ", $failed failed" : '') . ".\n";
} else {
    echo 'Dry run only - re-run with --apply to actually write these ' . count($rows) . " row(s).\n";
}
