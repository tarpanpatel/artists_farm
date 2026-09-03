<?php
/**
 * Inbound Channex Booking Webhook Receiver
 *
 * Ingests new bookings, modifications, and cancellations from Channex.
 * Enforces pessimistic row locks (SELECT ... FOR UPDATE) and idempotent
 * revision tracking. Sends ACK only AFTER the database transaction commits.
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/schema_cache.php';
require_once __DIR__ . '/ChannexAdapter.php';
require_once __DIR__ . '/outbox.php';

function ensureChannexRevisionsSchema(PDO $pdo): void {
    if (!isSchemaVerified('schema_guests_channex_id')) {
        try {
            $pdo->exec("ALTER TABLE `guests` ADD COLUMN IF NOT EXISTS `channex_booking_id` VARCHAR(64) NULL");
            $pdo->exec("ALTER TABLE `guests` ADD INDEX IF NOT EXISTS `idx_guests_channex_bkg` (`channex_booking_id`)");
            markSchemaVerified('schema_guests_channex_id');
        } catch (PDOException $e) {}
    }

    // Each block below guards on its OWN key rather than one early return for
    // the whole function - otherwise a later addition never runs on any
    // installation that already verified the first key, which is exactly how
    // the ack-state columns silently failed to appear (30 Aug 2026).
    if (!isSchemaVerified('schema_channex_booking_revisions')) {
    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS `channex_booking_revisions` (
                `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
                `revision_id` VARCHAR(64) NOT NULL UNIQUE,
                `channex_booking_id` VARCHAR(64) NOT NULL,
                `property_id` INT NOT NULL,
                `room_id` INT NULL,
                `guest_id` INT NULL,
                `ota_source` VARCHAR(64) NULL,
                `action` VARCHAR(32) NOT NULL,
                `status` VARCHAR(32) NOT NULL DEFAULT 'processed',
                `is_acknowledged` TINYINT(1) NOT NULL DEFAULT 0,
                `payload` JSON NULL,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX `idx_channex_bkg` (`channex_booking_id`),
                INDEX `idx_channex_guest` (`guest_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");
        markSchemaVerified('schema_channex_booking_revisions');
    } catch (PDOException $e) {}
    }

    // ACK state machine, replacing the is_acknowledged boolean (30 Aug 2026).
    // A boolean cannot tell "we tried to ACK and Channex rejected it" apart from
    // "we have not tried yet" - both read as 0. That matters because an
    // unacknowledged revision stays in Channex's queue and will be redelivered,
    // so a silently-failing ACK looks like a healthy system while the same
    // booking arrives over and over. PENDING/ACKED/FAILED plus the attempt
    // count and last error make a stuck revision visible and retryable.
    //
    // Separate key so installations that already built the table pick these up.
    if (!isSchemaVerified('schema_channex_revisions_ack_state')) {
        foreach ([
            "ADD COLUMN IF NOT EXISTS `ack_status` VARCHAR(20) NOT NULL DEFAULT 'PENDING'",
            "ADD COLUMN IF NOT EXISTS `ack_attempts` INT NOT NULL DEFAULT 0",
            "ADD COLUMN IF NOT EXISTS `ack_error` TEXT NULL",
            "ADD COLUMN IF NOT EXISTS `acked_at` DATETIME NULL",
        ] as $clause) {
            try { $pdo->exec("ALTER TABLE `channex_booking_revisions` $clause"); } catch (PDOException $e) {}
        }
        // Backfill from the old boolean, then leave it in place rather than
        // dropping it - an in-flight request mid-deploy may still reference it,
        // and a stale column is harmless where a missing one is fatal.
        try {
            $pdo->exec("UPDATE `channex_booking_revisions`
                        SET ack_status = CASE WHEN is_acknowledged = 1 THEN 'ACKED' ELSE 'PENDING' END
                        WHERE ack_status = 'PENDING'");
        } catch (PDOException $e) {}
        try {
            $pdo->exec("CREATE INDEX `idx_revisions_pending_ack` ON `channex_booking_revisions` (`ack_status`, `ack_attempts`)");
        } catch (PDOException $e) {}
        markSchemaVerified('schema_channex_revisions_ack_state');
    }

    // The guest-facing OTA confirmation code ("HM9X8YZ1" on Airbnb, a numeric
    // string on Booking.com). Staff need it to match a guest at the door against
    // what the OTA told them, and it is the only shared reference when querying
    // an OTA about a disputed reservation.
    if (!isSchemaVerified('schema_guests_ota_reservation_code')) {
        try {
            $pdo->exec("ALTER TABLE `guests` ADD COLUMN IF NOT EXISTS `ota_reservation_code` VARCHAR(255) NULL");
        } catch (PDOException $e) {}
        try {
            $pdo->exec("CREATE INDEX `idx_guests_ota_reservation_code` ON `guests` (`ota_reservation_code`)");
        } catch (PDOException $e) {}
        markSchemaVerified('schema_guests_ota_reservation_code');
    }
}

/**
 * Records the outcome of an ACK attempt. Channex redelivers anything it has not
 * been acknowledged for, so a failure must stay visible rather than being
 * flattened into "not acknowledged yet".
 */
function recordChannexAckOutcome(PDO $pdo, string $revisionId, bool $ok, ?string $error = null): void {
    try {
        if ($ok) {
            $pdo->prepare("UPDATE channex_booking_revisions
                           SET ack_status = 'ACKED', ack_attempts = ack_attempts + 1,
                               acked_at = NOW(), ack_error = NULL, is_acknowledged = 1
                           WHERE revision_id = ?")->execute([$revisionId]);
        } else {
            $pdo->prepare("UPDATE channex_booking_revisions
                           SET ack_status = 'FAILED', ack_attempts = ack_attempts + 1,
                               ack_error = ?
                           WHERE revision_id = ?")->execute([$error ?? 'ACK rejected', $revisionId]);
        }
    } catch (PDOException $e) {}
}

class ChannexWebhookReceiver {
    private PDO $pdo;
    private ChannexAdapter $adapter;

    public function __construct(PDO $pdo, ?ChannexAdapter $adapter = null) {
        $this->pdo = $pdo;
        $this->adapter = $adapter ?? new ChannexAdapter($this->pdo);
        ensureChannexRevisionsSchema($this->pdo);
    }

    public function handleWebhook(array $payload): array {
        // Support Channex notification envelope:
        // {"event": "booking_new", "payload": {"booking_id": "...", "property_id": "...", "booking_revision_id": "..."}, "user_id": null, "timestamp": "..."}
        // Confirmed live 3 Sep 2026: the real field is "booking_revision_id", not
        // "revision_id" - the old "revision_id"-only lookup silently missed it and
        // fell all the way back to using channexBookingId as the revision id, which
        // then made every acknowledgeRevision() call target the wrong id and fail
        // ("Re-ACK on redelivery failed") even though the booking itself processed.
        // as well as direct objects from internal test suites:
        // {"booking_revision": {...}} or raw booking revision attributes.
        $envelopePayload = $payload['payload'] ?? [];
        $revisionId = $envelopePayload['revision_id']
            ?? ($envelopePayload['booking_revision_id']
            ?? ($payload['booking_revision']['id']
            ?? ($payload['data']['id']
            ?? ($payload['revision_id']
            ?? ($payload['id'] ?? null)))));
        $channexBookingId = $envelopePayload['booking_id']
            ?? ($payload['booking_revision']['booking_id']
            ?? ($payload['booking_revision']['booking']['id']
            ?? ($payload['data']['attributes']['booking_id']
            ?? ($payload['booking_id']
            ?? ($payload['id'] ?? null)))));

        if (!$revisionId && !$channexBookingId) {
            return ['status' => 'error', 'http_code' => 400, 'message' => 'Missing revision ID or booking ID'];
        }

        // Check if we need to fetch the full revision from Channex API
        // (when payload only contains envelope IDs rather than complete booking details)
        $hasFullData = !empty($payload['booking_revision']['arrival_date'])
            || !empty($payload['booking_revision']['rooms'])
            || !empty($payload['data']['attributes']['arrival_date'])
            || !empty($payload['arrival_date'])
            || !empty($payload['rooms']);

        if (!$hasFullData && $revisionId) {
            $client = new ChannexClient();
            $revRes = $client->get("booking_revisions/{$revisionId}");
            if ($revRes['success'] && !empty($revRes['data']['attributes'])) {
                $attrs = $revRes['data']['attributes'];
                $revision = array_merge($attrs, [
                    'id' => $revisionId,
                    'booking_id' => $channexBookingId ?: ($attrs['booking_id'] ?? null),
                    'booking' => array_merge($attrs, [
                        'id' => $channexBookingId ?: ($attrs['booking_id'] ?? null),
                    ]),
                ]);
                $booking = $revision['booking'];
                $channexBookingId = $revision['booking_id'];
            } else if ($channexBookingId) {
                // Fallback: try fetching booking by ID
                $bookRes = $client->get("bookings/{$channexBookingId}");
                if ($bookRes['success'] && !empty($bookRes['data']['attributes'])) {
                    $attrs = $bookRes['data']['attributes'];
                    $revision = array_merge($attrs, [
                        'id' => $revisionId,
                        'booking_id' => $channexBookingId,
                        'booking' => array_merge($attrs, [
                            'id' => $channexBookingId,
                        ]),
                    ]);
                    $booking = $revision['booking'];
                } else {
                    return ['status' => 'error', 'http_code' => 404, 'message' => "Failed to fetch revision {$revisionId} from Channex API"];
                }
            } else {
                return ['status' => 'error', 'http_code' => 404, 'message' => "Failed to fetch revision {$revisionId} from Channex API"];
            }
        } else {
            $revision = $payload['booking_revision'] ?? ($payload['data']['attributes'] ?? ($payload['data'] ?? $payload));
            $booking = $revision['booking'] ?? $revision;
            if (!$channexBookingId) {
                $channexBookingId = !empty($revision['booking']['id'])
                    ? $revision['booking']['id']
                    : (!empty($revision['booking_id']) ? $revision['booking_id'] : ($revision['id'] ?? null));
            }
            if (!$revisionId) {
                $revisionId = $revision['id'] ?? ($payload['id'] ?? $channexBookingId);
            }
        }

        // 1. Idempotency Check: if already processed and acknowledged, return 200
        $stmt = $this->pdo->prepare("SELECT id, is_acknowledged, guest_id FROM channex_booking_revisions WHERE revision_id = ? LIMIT 1");
        $stmt->execute([$revisionId]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($existing) {
            // Re-ACK a revision we stored but never successfully acknowledged.
            // This is the redelivery path: Channex keeps resending until the ACK
            // lands, so a previously FAILED ack gets another attempt here rather
            // than the redelivery being treated as a no-op.
            if (!$existing['is_acknowledged']) {
                $ok = $this->adapter->acknowledgeRevision($revisionId);
                recordChannexAckOutcome($this->pdo, $revisionId, $ok, $ok ? null : 'Re-ACK on redelivery failed');
            }
            return ['status' => 'success', 'http_code' => 200, 'message' => 'Revision already processed (idempotent)', 'guest_id' => $existing['guest_id']];
        }

        // 2. Resolve Local Property & Room Mapping
        $channexPropertyId = $booking['property_id'] ?? ($revision['property_id'] ?? '');
        // room_type_id lives inside rooms[0], not at the top level - reading only
        // the top level yields '' and falls through to the property-only mapping
        // lookup below, which on a multi-room property returns an arbitrary room.
        $firstRoom = $booking['rooms'][0] ?? ($revision['rooms'][0] ?? []);
        $channexRoomTypeId = $firstRoom['room_type_id']
            ?? ($booking['room_type_id'] ?? ($revision['room_type_id'] ?? ''));

        $mapStmt = $this->pdo->prepare("SELECT property_id, room_id FROM channex_mappings WHERE channex_property_id = ? AND (channex_room_type_id = ? OR channex_room_type_id = '') LIMIT 1");
        $mapStmt->execute([$channexPropertyId, $channexRoomTypeId]);
        $mapping = $mapStmt->fetch(PDO::FETCH_ASSOC);

        if (!$mapping) {
            // Fallback lookup by property only
            $fallbackStmt = $this->pdo->prepare("SELECT property_id, room_id FROM channex_mappings WHERE channex_property_id = ? LIMIT 1");
            $fallbackStmt->execute([$channexPropertyId]);
            $mapping = $fallbackStmt->fetch(PDO::FETCH_ASSOC);
            if (!$mapping) {
                return ['status' => 'error', 'http_code' => 422, 'message' => "Unmapped Channex property {$channexPropertyId}"];
            }
        }

        $propertyId = (int)$mapping['property_id'];
        $roomId = $mapping['room_id'] !== null ? (int)$mapping['room_id'] : null;

        $bookingStatus = strtolower($booking['status'] ?? 'new');
        // ota_name is what Channex actually sends ("AirBNB", "BookingCom"); the
        // channel_name/ota_source/channel keys checked first are not in its
        // payload at all, so without ota_name every booking fell through to the
        // generic default and the calendar bar read "(Channex OTA)" for all of
        // them instead of the real platform.
        $otaSource = $booking['channel_name']
            ?? ($booking['ota_source']
            ?? ($booking['ota_name']
            ?? ($booking['channel'] ?? 'Channex OTA')));
        // Pull property's configured check-in and check-out times from properties table
        $propTimeStmt = $this->pdo->prepare("SELECT checkin_time, checkout_time FROM properties WHERE id = ? LIMIT 1");
        $propTimeStmt->execute([$propertyId]);
        $propTimes = $propTimeStmt->fetch(PDO::FETCH_ASSOC);
        $propCheckinTime = trim($propTimes['checkin_time'] ?? '') ?: '14:00';
        $propCheckoutTime = trim($propTimes['checkout_time'] ?? '') ?: '11:00';

        $rawArrival = trim((string)($booking['arrival_date'] ?? ($booking['checkin_date'] ?? date('Y-m-d'))));
        $rawDeparture = trim((string)($booking['departure_date'] ?? ($booking['checkout_date'] ?? date('Y-m-d', strtotime('+1 day')))));
        $checkinDateOnly = substr($rawArrival, 0, 10);
        $checkoutDateOnly = substr($rawDeparture, 0, 10);

        $checkinDate = "{$checkinDateOnly} {$propCheckinTime}:00";
        $checkoutDate = "{$checkoutDateOnly} {$propCheckoutTime}:00";
        $customer = $booking['customer'] ?? [];
        $guestName = trim(($customer['name'] ?? '') ?: (($customer['first_name'] ?? '') . ' ' . ($customer['last_name'] ?? ''))) ?: 'OTA Guest';
        $phone = $customer['phone'] ?? ($customer['telephone'] ?? 'N/A');
        $country = trim((string)($customer['country'] ?? ''));
        $isForeignGuest = (!empty($country) && !in_array(strtoupper($country), ['IN', 'IND', 'INDIA'], true)) ? 1 : 0;

        $arrivalHour = trim((string)($booking['arrival_hour'] ?? ($booking['arrival_time'] ?? '')));
        $bookingNotes = trim((string)($booking['notes'] ?? ''));
        $notesParts = [];
        if (!empty($arrivalHour)) {
            $notesParts[] = "Arrival: {$arrivalHour}";
        }
        if (!empty($bookingNotes)) {
            $notesParts[] = $bookingNotes;
        }
        $notes = !empty($notesParts) ? implode("\n", $notesParts) : null;
        $guestNotes = !empty($bookingNotes) ? $bookingNotes : null;

        // Channex sends amount as a decimal string in MAJOR units ("480.00"),
        // not minor units.
        $totalAmount = round((float)($booking['amount']
            ?? ($firstRoom['amount'] ?? ($booking['total_price'] ?? 0))), 2);

        // occupancy is an object {adults, children, infants, ages}, not a count.
        // $firstRoom is already resolved above, including the $revision fallback -
        // reassigning it here would silently drop that fallback for occupancy
        // while amount above still had it.
        $occupancy = $booking['occupancy'] ?? ($firstRoom['occupancy'] ?? null);
        if (is_array($occupancy)) {
            $adults = max(1, (int)($occupancy['adults'] ?? 1));
            $children = (int)($occupancy['children'] ?? 0);
            $noOfGuests = $adults + $children;
        } else {
            $adults = max(1, (int)($booking['adults'] ?? ($occupancy ?? 1)));
            $children = (int)($booking['children'] ?? 0);
            $noOfGuests = $adults + $children;
        }

        $totalDays = max(1, (int)round((strtotime($checkoutDate) - strtotime($checkinDate)) / 86400));
        $baseRoomRent = $totalAmount;
        $perNightCharges = $totalDays > 0 ? round($baseRoomRent / $totalDays, 2) : $baseRoomRent;

        // Who actually holds the guest's money. 'ota' is the merchant model (the
        // channel charged the card, nothing to collect on arrival); 'property'
        // means WE collect at the door.
        $otaCollectsPayment = strtolower((string)($booking['payment_collect'] ?? 'property')) === 'ota';
        $advancePaid = $otaCollectsPayment ? $totalAmount : 0.00;
        $pendingAmount = round($totalAmount - $advancePaid, 2);

        $otaReservationCode = $booking['ota_reservation_code']
            ?? ($revision['ota_reservation_code']
            ?? ($booking['system_id']
            ?? ($revision['system_id']
            ?? ($payload['ota_reservation_code']
            ?? ($payload['system_id'] ?? null)))));

        $guestId = null;

        // 3. Transaction with Row Locking
        try {
            $this->pdo->beginTransaction();

            if ($bookingStatus === 'cancelled') {
                // Cancel existing booking
                $findStmt = $this->pdo->prepare("SELECT id FROM guests WHERE channex_booking_id = ? AND property_id = ? FOR UPDATE");
                $findStmt->execute([$channexBookingId, $propertyId]);
                $guestId = $findStmt->fetchColumn();

                if ($guestId) {
                    $this->pdo->prepare("UPDATE guests SET status = 'Cancelled' WHERE id = ?")->execute([$guestId]);
                    enqueueOutboxItem($this->pdo, $propertyId, $roomId, 'availability', $checkinDate, $checkoutDate, [
                        'action' => 'ota_cancel',
                        'channex_booking_id' => $channexBookingId,
                    ]);
                }
            } else {
                // Handle New or Modified Inbound Booking
                $lockTargetId = $roomId !== null ? $roomId : $propertyId;
                $this->pdo->prepare("SELECT id FROM properties WHERE id = ? FOR UPDATE")->execute([$lockTargetId]);

                // Check for existing booking row for this Channex booking ID
                $findStmt = $this->pdo->prepare("SELECT id, checkin_date, expected_checkout FROM guests WHERE channex_booking_id = ? AND property_id = ? FOR UPDATE");
                $findStmt->execute([$channexBookingId, $propertyId]);
                $existingGuest = $findStmt->fetch(PDO::FETCH_ASSOC);

                if ($existingGuest) {
                    // Update existing booking dates
                    $guestId = (int)$existingGuest['id'];
                    $oldCheckin = $existingGuest['checkin_date'];
                    $oldCheckout = $existingGuest['expected_checkout'];

                    // Overlap check excluding self
                    if ($roomId !== null) {
                        $conflictStmt = $this->pdo->prepare("SELECT id FROM guests WHERE room_id = ? AND property_id = ? AND id != ? AND status IN ('Active', 'CheckedIn', 'Booked') AND checkin_date < ? AND expected_checkout > ? LIMIT 1 FOR UPDATE");
                        $conflictStmt->execute([$roomId, $propertyId, $guestId, $checkoutDate, $checkinDate]);
                    } else {
                        $conflictStmt = $this->pdo->prepare("SELECT id FROM guests WHERE room_id IS NULL AND property_id = ? AND id != ? AND status IN ('Active', 'CheckedIn', 'Booked') AND checkin_date < ? AND expected_checkout > ? LIMIT 1 FOR UPDATE");
                        $conflictStmt->execute([$propertyId, $guestId, $checkoutDate, $checkinDate]);
                    }

                    if ($conflictStmt->fetchColumn()) {
                        // Guarded: rollBack() with no active transaction THROWS,
                        // and that exception is then caught below and reported as
                        // a generic 500 - masking the real outcome. Seen live: a
                        // revision that had actually been ingested and ACKed came
                        // back as "Failed to process booking revision: There is no
                        // active transaction".
                        if ($this->pdo->inTransaction()) {
                            $this->pdo->rollBack();
                        }
                        return ['status' => 'error', 'http_code' => 409, 'message' => 'Room/Property is already booked for modified dates'];
                    }

                    $updStmt = $this->pdo->prepare("
                        UPDATE guests
                        SET guest_name = ?, phone_number = ?, checkin_date = ?, expected_checkout = ?, total_charge = ?, no_of_guests = ?,
                            advance_paid = ?, pending_amount = ?,
                            adults = ?, children = ?,
                            base_room_rent = ?, per_night_charges = ?, total_days = ?,
                            is_foreign_guest = ?,
                            -- Fill a blank note, never overwrite one. `notes` is
                            -- staff-editable (see add_guest/update_guest), so a
                            -- plain assignment here would wipe what staff typed
                            -- every time the guest changed dates on the OTA.
                            notes = CASE WHEN notes IS NULL OR notes = '' THEN COALESCE(?, notes) ELSE notes END,
                            guest_notes = CASE WHEN guest_notes IS NULL OR guest_notes = '' THEN COALESCE(?, guest_notes) ELSE guest_notes END,
                            ota_reservation_code = COALESCE(?, ota_reservation_code)
                        WHERE id = ?
                    ");
                    $updStmt->execute([
                        $guestName, $phone, $checkinDate, $checkoutDate, $totalAmount, $noOfGuests,
                        $advancePaid, $pendingAmount,
                        $adults, $children,
                        $baseRoomRent, $perNightCharges, $totalDays,
                        $isForeignGuest,
                        $notes, $guestNotes,
                        $otaReservationCode, $guestId
                    ]);

                    // Enqueue both ranges for outbox
                    enqueueOutboxItem($this->pdo, $propertyId, $roomId, 'availability', $oldCheckin, $oldCheckout, ['action' => 'ota_mod_old', 'guest_id' => $guestId]);
                    enqueueOutboxItem($this->pdo, $propertyId, $roomId, 'availability', $checkinDate, $checkoutDate, ['action' => 'ota_mod_new', 'guest_id' => $guestId]);
                } else {
                    // New Inbound Booking
                    // Overlap conflict check with FOR UPDATE
                    if ($roomId !== null) {
                        $conflictStmt = $this->pdo->prepare("SELECT id FROM guests WHERE room_id = ? AND property_id = ? AND status IN ('Active', 'CheckedIn', 'Booked') AND checkin_date < ? AND expected_checkout > ? LIMIT 1 FOR UPDATE");
                        $conflictStmt->execute([$roomId, $propertyId, $checkoutDate, $checkinDate]);
                    } else {
                        $conflictStmt = $this->pdo->prepare("SELECT id FROM guests WHERE room_id IS NULL AND property_id = ? AND status IN ('Active', 'CheckedIn', 'Booked') AND checkin_date < ? AND expected_checkout > ? LIMIT 1 FOR UPDATE");
                        $conflictStmt->execute([$propertyId, $checkoutDate, $checkinDate]);
                    }

                    if ($conflictStmt->fetchColumn()) {
                        // Guarded for the same reason as the modification branch above.
                        if ($this->pdo->inTransaction()) {
                            $this->pdo->rollBack();
                        }
                        return ['status' => 'error', 'http_code' => 409, 'message' => 'Room/Property is already booked for requested dates'];
                    }

                    // Insert Guest
                    $insStmt = $this->pdo->prepare("
                        INSERT INTO guests (
                            property_id, room_id, guest_name, phone_number, checkin_date, expected_checkout,
                            total_charge, advance_paid, pending_amount, no_of_guests,
                            adults, children, base_room_rent, per_night_charges, total_days,
                            is_foreign_guest, notes, guest_notes,
                            status, booking_source,
                            channex_booking_id, ota_source, ota_source_label, ota_reservation_code
                        ) VALUES (
                            ?, ?, ?, ?, ?, ?,
                            ?, ?, ?, ?,
                            ?, ?, ?, ?, ?,
                            ?, ?, ?,
                            'Booked', 'OTA',
                            ?, ?, ?, ?
                        )
                    ");
                    $insStmt->execute([
                        $propertyId,
                        $roomId,
                        $guestName,
                        $phone,
                        $checkinDate,
                        $checkoutDate,
                        $totalAmount,
                        $advancePaid,
                        $pendingAmount,
                        $noOfGuests,
                        $adults,
                        $children,
                        $baseRoomRent,
                        $perNightCharges,
                        $totalDays,
                        $isForeignGuest,
                        $notes,
                        $guestNotes,
                        $channexBookingId,
                        $otaSource,
                        $otaSource,
                        $otaReservationCode,
                    ]);
                    $guestId = (int)$this->pdo->lastInsertId();

                    // Enqueue availability outbox item
                    enqueueOutboxItem($this->pdo, $propertyId, $roomId, 'availability', $checkinDate, $checkoutDate, [
                        'action' => 'ota_new_booking',
                        'guest_id' => $guestId,
                    ]);
                }
            }

            // Record revision row
            $revStmt = $this->pdo->prepare("
                INSERT INTO channex_booking_revisions (revision_id, channex_booking_id, property_id, room_id, guest_id, ota_source, action, status, is_acknowledged, payload)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'processed', 0, ?)
            ");
            $revStmt->execute([
                $revisionId,
                $channexBookingId,
                $propertyId,
                $roomId,
                $guestId,
                $otaSource,
                $bookingStatus,
                json_encode($payload, JSON_UNESCAPED_SLASHES),
            ]);

            // Commit transaction
            $this->pdo->commit();

            // 4. ACK AFTER COMMIT. A failure here is recorded rather than
            // swallowed: the revision stays in Channex's queue and will be
            // redelivered, and without FAILED state that redelivery loop is
            // invisible - the system looks healthy while the same booking
            // arrives repeatedly.
            $ackSuccess = $this->adapter->acknowledgeRevision($revisionId);
            recordChannexAckOutcome($this->pdo, $revisionId, $ackSuccess,
                $ackSuccess ? null : 'ACK call returned failure after commit');

            return [
                'status' => 'success',
                'http_code' => 200,
                'message' => 'Booking revision ingested and acknowledged',
                'guest_id' => $guestId,
                'acknowledged' => $ackSuccess,
            ];
        } catch (Exception $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }

            // Task C: Handle race condition with concurrent webhook deliveries of the same revision
            if ($e->getCode() == 23000 || strpos($e->getMessage(), 'Duplicate entry') !== false || strpos($e->getMessage(), '1062') !== false) {
                $stmt = $this->pdo->prepare("SELECT id, is_acknowledged, guest_id FROM channex_booking_revisions WHERE revision_id = ? LIMIT 1");
                $stmt->execute([$revisionId]);
                $existing = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($existing) {
                    if (!$existing['is_acknowledged']) {
                        $ok = $this->adapter->acknowledgeRevision($revisionId);
                        recordChannexAckOutcome($this->pdo, $revisionId, $ok, $ok ? null : 'Re-ACK on concurrent race failed');
                    }
                    return [
                        'status' => 'success',
                        'http_code' => 200,
                        'message' => 'Revision already processed concurrently (idempotent)',
                        'guest_id' => $existing['guest_id']
                    ];
                }
            }

            return [
                'status' => 'error',
                'http_code' => 500,
                'message' => 'Failed to process booking revision: ' . $e->getMessage(),
            ];
        }
    }
}
