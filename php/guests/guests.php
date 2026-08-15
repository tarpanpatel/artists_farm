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

require_once __DIR__ . '/../config/schema_cache.php';
require_once __DIR__ . '/../config/guest_status.php';
require_once __DIR__ . '/../security/input_validator.php';

/**
 * First-pass input validation for guest PII write actions. Validates only the
 * fields actually present in the payload and returns validated (trimmed/
 * normalised) versions of them so callers can merge the result over $input.
 * Throws Exception with a user-facing message on the first invalid field.
 */
function validateGuestPiiInput(array $input): array {
    $validated = [];

    $name = $input['guest_name'] ?? $input['name'] ?? null;
    if ($name !== null) {
        $validated['guest_name'] = InputValidator::validateString($name, 1, 120);
    }

    $phone = $input['phone_number'] ?? $input['contact'] ?? null;
    if ($phone !== null && trim((string)$phone) !== '') {
        $phoneDigits = preg_replace('/\D/', '', (string)$phone);
        if (strlen($phoneDigits) < 7 || strlen($phoneDigits) > 15) {
            throw new Exception('Phone number must be 7 to 15 digits');
        }
        $validated['phone_number'] = $phoneDigits;
    }

    // Dates may arrive as "Y-m-d" or "Y-m-d H:i:s" - validate the date part only.
    foreach (['checkin_date' => 'Check-in date', 'expected_checkout' => 'Check-out date'] as $field => $label) {
        $value = $input[$field] ?? null;
        if ($value !== null && trim((string)$value) !== '') {
            $datePart = explode(' ', trim((string)$value))[0];
            InputValidator::validateDate($datePart, 'Y-m-d');
            $validated[$field] = trim((string)$value);
        }
    }

    if (array_key_exists('no_of_guests', $input) && $input['no_of_guests'] !== null && $input['no_of_guests'] !== '') {
        $validated['no_of_guests'] = InputValidator::validateInteger($input['no_of_guests'], 1, 100);
    }
    foreach (['base_room_rent', 'advance_paid', 'total_charge', 'pending_amount'] as $moneyField) {
        if (array_key_exists($moneyField, $input) && $input[$moneyField] !== null && $input[$moneyField] !== '') {
            $validated[$moneyField] = InputValidator::validateFloat($input[$moneyField], 0);
        }
    }

    foreach (['notes' => 2000, 'booking_source' => 255, 'advance_received_by' => 255, 'pending_received_by' => 255] as $textField => $maxLen) {
        if (isset($input[$textField]) && trim((string)$input[$textField]) !== '') {
            $validated[$textField] = InputValidator::validateString($input[$textField], 1, $maxLen);
        }
    }

    if (array_key_exists('is_foreign_guest', $input) && $input['is_foreign_guest'] !== null) {
        $validated['is_foreign_guest'] = InputValidator::validateBoolean($input['is_foreign_guest']) ? 1 : 0;
    }

    return $validated;
}

/**
 * Validates a guest/id-document identifier as a positive integer, emitting a
 * 400 JSON error response and returning null when the value is missing or
 * invalid so callers can short-circuit with `break`.
 */
function validateGuestIdOrRespond($value, string $fieldName = 'id') {
    if ($value === null || $value === '') {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => $fieldName . ' is required']);
        return null;
    }
    try {
        return InputValidator::validateInteger($value, 1);
    } catch (Exception $e) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => $fieldName . ' must be a positive integer']);
        return null;
    }
}

// Demo guest status is set once by generateDemoData() (php/api/demo_data.php)
// relative to whatever "today" was at generation time, then never revisited -
// a demo stay whose checkout date has since passed silently stays "Checked In"
// forever until the next full "Reset Demo Data" regenerates everything from
// scratch. Found 14 Aug 2026 via the multi-key Dashboard calendar coloring
// checked-in-looking bookings that had actually already ended.
// Self-heals instead: called at the top of get_guests (the one read path
// every guest-consuming page ultimately sources from - App.tsx fetches guests
// once via fetchGuestsFromDB() and every screen reads from that same state),
// this flips any is_demo=1 stay still marked Checked In past its own checkout
// straight to Checked Out, right in the DB - so it's fixed for every reader,
// not just this one endpoint, and stays correct indefinitely with zero resets
// needed. Scoped to the property being loaded (cheap, avoids touching every
// demo property on every request) and only ever touches is_demo=1 rows - a
// real tenant's real checkout is a real business event a human performs, not
// something this should ever silently flip.
//
// Checkout cutoff is noon on the checkout date, not midnight (found 14 Aug
// 2026): expected_checkout is stored as that date's 00:00:00, so a plain
// `<= NOW()` comparison flipped a guest to Checked Out the instant the clock
// ticked past midnight on their own checkout day - showing them as already
// gone at 1am while they're presumably still asleep in the room. Real
// hospitality checkout convention is "by noon", so add 12 hours before
// comparing: a guest checking out today stays Checked In until noon today,
// then flips - matching how a prospective client would actually expect a
// running property to look, not just "date has changed".
function reconcileDemoGuestStatuses($pdo, $propertyId) {
    try {
        $pdo->prepare("
            UPDATE guests
            SET status = ?
            WHERE property_id = ? AND is_demo = 1 AND status = ? AND (expected_checkout + INTERVAL 12 HOUR) <= NOW()
        ")->execute([GUEST_STATUS_CHECKED_OUT, $propertyId, GUEST_STATUS_CHECKED_IN]);
    } catch (PDOException $e) {}
}

function ensureIdVerificationSchema($pdo) {
    if (isSchemaVerified('schema_id_verification')) return;
    try {
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `id_verification_status` VARCHAR(20) DEFAULT 'Pending'");
    } catch (PDOException $e) {}
    try {
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `id_verification_last_reminder_at` DATETIME DEFAULT NULL");
    } catch (PDOException $e) {}
    markSchemaVerified('schema_id_verification');
}

// Foreign-guest flag + C-Form (FRRO) filing tracking. C-Form must be filed
// within 24h of check-in for foreign nationals - is_foreign_guest is set by
// staff at registration, c_form_filed_at is stamped once staff confirms they
// submitted it on the government portal (this app doesn't file it for them).
function ensureComplianceSchema($pdo) {
    if (isSchemaVerified('schema_compliance')) return;
    try {
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `is_foreign_guest` TINYINT(1) DEFAULT 0");
    } catch (PDOException $e) {}
    try {
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `c_form_filed_at` DATETIME DEFAULT NULL");
    } catch (PDOException $e) {}
    markSchemaVerified('schema_compliance');
}

/**
 * ID-document uploads are temporary, not permanent records (24h TTL): the
 * check-in completion flow sends them to Telegram in one message and then
 * deletes them, and anything never completed (or whose completion skipped
 * because Telegram was off) gets swept here. Both the disk copy and the now
 * dangling guest_id_documents row are removed.
 */

function idDocumentsUploadDir(): string {
    return __DIR__ . '/../uploads/images/id_documents';
}

// Delete the full-size + thumb disk files behind a set of stored URL paths.
function deleteIdDocumentFiles(array $urls): void {
    $dir = idDocumentsUploadDir();
    foreach ($urls as $url) {
        $pos = strpos((string)$url, '/uploads/');
        if ($pos === false) {
            continue;
        }
        $fullPath = __DIR__ . '/../' . substr((string)$url, $pos + 1);
        @unlink($fullPath);
        @unlink($dir . '/thumbs/' . basename($fullPath));
    }
}

// Opportunistic 24h TTL sweep of the temporary ID-document store - removes
// files whose mtime is past the TTL, then drops the guest_id_documents rows
// pointing at the swept files so the reminder counter and document list never
// report a photo that is gone. Best-effort: never fails the caller.
function cleanupExpiredIdDocuments($pdo, int $hours = 24, int $propertyId = 0): int {
    $dir = idDocumentsUploadDir();
    if (!is_dir($dir)) {
        return 0;
    }
    $expireBefore = time() - ($hours * 3600);
    $removed = 0;
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS)
    );
    foreach ($iterator as $file) {
        if ($file->isFile() && $file->getMTime() < $expireBefore) {
            @unlink($file->getPathname());
            $removed++;
        }
    }
    try {
        // $propertyId > 0 scopes the sweep to one property (per-request calls);
        // 0 sweeps every property (the daily cron, which is intentionally global).
        if ($propertyId) {
            $stmt = $pdo->prepare("SELECT id, file_path FROM guest_id_documents WHERE property_id = ? AND uploaded_at < DATE_SUB(NOW(), INTERVAL ? HOUR)");
            $stmt->execute([$propertyId, $hours]);
        } else {
            $stmt = $pdo->prepare("SELECT id, file_path FROM guest_id_documents WHERE uploaded_at < DATE_SUB(NOW(), INTERVAL ? HOUR)");
            $stmt->execute([$hours]);
        }
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $pos = strpos((string)$row['file_path'], '/uploads/');
            if ($pos === false) {
                continue;
            }
            $fullPath = __DIR__ . '/../' . substr((string)$row['file_path'], $pos + 1);
            if (!file_exists($fullPath)) {
                if ($propertyId) {
                    $pdo->prepare("DELETE FROM guest_id_documents WHERE id = ? AND property_id = ?")->execute([$row['id'], $propertyId]);
                } else {
                    $pdo->prepare("DELETE FROM guest_id_documents WHERE id = ?")->execute([$row['id']]);
                }
                $removed++;
            }
        }
    } catch (PDOException $e) {
        // best-effort - cleanup must never fail the surrounding request
    }
    return $removed;
}

function handleGuestRequests($pdo, $request_method, $action, $propertyId) {
    switch ($action) {
        case 'get_guests':
            reconcileDemoGuestStatuses($pdo, $propertyId);
            try {
                // A Single property has no separate "room" to assign - it IS the one
                // bookable unit, so a guest there should show the property's own name,
                // never "Unassigned" (which should only ever mean a Multi-Key guest
                // genuinely hasn't had a room picked yet).
                $stmt = $pdo->prepare("
                    SELECT g.*, COALESCE(r.name, IF(p.property_type = 'SINGLE', p.name, 'Unassigned')) as roomNumber
                    FROM guests g
                    LEFT JOIN properties r ON g.room_id = r.id AND r.property_type = 'MULTI_KEY_ROOM'
                    JOIN properties p ON g.property_id = p.id
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
                ensureComplianceSchema($pdo);
                $input = json_decode(file_get_contents('php://input'), true);
                if (!is_array($input)) $input = [];
                try {
                    $input = array_merge($input, validateGuestPiiInput($input));
                } catch (Exception $e) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                    break;
                }
                try {
                    // Wrap the guest INSERT + advance ledger post as one unit - previously
                    // these were two independent writes, so a failure between them (e.g. a
                    // dropped connection) could leave a real guest/booking row on the books
                    // with its advance payment silently missing from the ledger. Telegram/
                    // WhatsApp sends stay outside the transaction below - those are
                    // best-effort notifications, not data that needs atomicity, and a
                    // failed send must never roll back an already-successful booking.
                    $pdo->beginTransaction();
                    // add_guest never actually wrote room_id - every booking landed
                    // in guests with room_id NULL regardless of which room the admin
                    // picked in the form, which is why bookings piled up under
                    // "Other / Unassigned Rooms" on All Bookings even when a real
                    // room had been selected at check-in. The form only ever sends
                    // the room's NAME (room_number/roomNumber), so resolve it against
                    // this property's actual MULTI_KEY_ROOM children here.
                    $roomId = null;
                    $roomName = trim($input['room_number'] ?? $input['roomNumber'] ?? '');
                    if ($roomName !== '') {
                        $roomLookup = $pdo->prepare("SELECT id FROM properties WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM' AND name = ? AND is_deleted = 0 LIMIT 1");
                        $roomLookup->execute([$propertyId, $roomName]);
                        $foundRoomId = $roomLookup->fetchColumn();
                        if ($foundRoomId) {
                            $roomId = intval($foundRoomId);
                        }
                    }

                    // advance_received_by/pending_received_by columns have existed on
                    // this table all along - the Add Booking form collects both as
                    // *required* fields, but nothing ever actually wrote them here.
                    // New bookings always start as 'Booked' (reservation) - they only
                    // become 'Checked In' via the explicit Check-In action/verification.
                    $incomingStatus = strtolower(trim($input['status'] ?? ''));
                    if (in_array($incomingStatus, ['checked in', 'checkedin', 'checked-in', 'active'], true)) {
                        $status = GUEST_STATUS_CHECKED_IN;
                    } else {
                        $status = GUEST_STATUS_BOOKED;
                    }
                    $stmt = $pdo->prepare("INSERT INTO guests (guest_name, phone_number, checkin_date, expected_checkout, status, advance_paid, advance_received_by, total_charge, pending_amount, pending_received_by, base_room_rent, notes, booking_source, no_of_guests, property_id, is_foreign_guest, room_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $input['guest_name'] ?? $input['name'] ?? 'Resident Guest',
                        $input['phone_number'] ?? $input['contact'] ?? '0000000000',
                        $input['checkin_date'] ?? date('Y-m-d'),
                        $input['expected_checkout'] ?? date('Y-m-d H:i:s', strtotime('+1 day')),
                        $status,
                        floatval($input['advance_paid'] ?? 0),
                        $input['advance_received_by'] ?? '',
                        floatval($input['total_charge'] ?? 0),
                        floatval($input['pending_amount'] ?? 0),
                        $input['pending_received_by'] ?? '',
                        floatval($input['base_room_rent'] ?? 0),
                        $input['notes'] ?? '',
                        $input['booking_source'] ?? '',
                        intval($input['no_of_guests'] ?? 1),
                        $propertyId,
                        !empty($input['is_foreign_guest']) ? 1 : 0,
                        $roomId,
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
                        ], $propertyId);
                    }
                    $pdo->commit();

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

                    // WhatsApp booking confirmation direct to the guest (staff-facing
                    // Telegram notification above is separate from this). Phased
                    // rollout - only fires for the tenant currently enabled, see
                    // isWhatsAppEnabledForProperty()'s docblock in sender.php.
                    require_once __DIR__ . '/../whatsapp/sender.php';
                    if (isWhatsAppEnabledForProperty($pdo, $propertyId)) {
                        $checkinDateFormatted = date('d M Y', strtotime($checkinDate));
                        $roomLabel = $input['room_number'] ?? $input['roomNumber'] ?? 'your assigned room';
                        sendWhatsAppTemplateMessage($phone, 'new_booking_cofirmation', [$guestName, $checkinDateFormatted, $roomLabel]);
                    }

                    echo json_encode(['status' => 'success', 'id' => $newId, 'message' => 'Resident registered successfully']);
                } catch (PDOException $e) {
                    if ($pdo->inTransaction()) {
                        $pdo->rollBack();
                    }
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to register guest: ' . $e->getMessage()]);
                }
            }
            break;

        case 'update_guest':
            if ($request_method === 'POST') {
                ensureComplianceSchema($pdo);
                $input = json_decode(file_get_contents('php://input'), true);
                if (!is_array($input)) $input = [];
                try {
                    $input = array_merge($input, validateGuestPiiInput($input));
                } catch (Exception $e) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                    break;
                }
                try {
                    $guestId = validateGuestIdOrRespond($input['id'] ?? null);
                    if ($guestId === null) break;
                    $roomId = isset($input['room_id']) && $input['room_id'] !== '' ? intval($input['room_id']) : null;
                    $newCheckin = $input['checkin_date'] ?? date('Y-m-d');
                    $newCheckout = $input['expected_checkout'] ?? date('Y-m-d H:i:s', strtotime('+1 day'));

                    $prevStmt = $pdo->prepare("SELECT * FROM guests WHERE id = ? AND property_id = ?");
                    $prevStmt->execute([$guestId, $propertyId]);
                    $previousGuest = $prevStmt->fetch(PDO::FETCH_ASSOC) ?: [];
                    $previousNoOfGuests = intval($previousGuest['no_of_guests'] ?? 0);

                    if ($roomId !== null) {
                        $conflictStmt = $pdo->prepare("SELECT id FROM guests WHERE room_id = ? AND status IN (?, ?) AND id != ? AND property_id = ? AND checkin_date < ? AND expected_checkout > ? LIMIT 1");
                        $conflictStmt->execute([$roomId, GUEST_STATUS_ACTIVE_LEGACY, GUEST_STATUS_CHECKED_IN, $guestId, $propertyId, $newCheckout, $newCheckin]);
                        if ($conflictStmt->fetch()) {
                            http_response_code(409);
                            echo json_encode(['status' => 'error', 'message' => 'Selected room already has an active booking for these dates']);
                            break;
                        }
                    }

                    $totalCharge = floatval($input['total_charge'] ?? 0);
                    $advancePaid = floatval($input['advance_paid'] ?? 0);
                    $pendingAmount = max(0, $totalCharge - $advancePaid);
                    // advance_received_by/pending_received_by/booking_source/notes were
                    // missing here entirely - editing a booking could never touch them,
                    // only creating one could (and even that was broken for the two
                    // received-by fields until just now).
                    $advanceReceivedBy = $input['advance_received_by'] ?? '';
                    $pendingReceivedBy = $input['pending_received_by'] ?? '';
                    $bookingSource = $input['booking_source'] ?? '';
                    $notes = $input['notes'] ?? '';

                    if ($roomId !== null) {
                        $stmt = $pdo->prepare("UPDATE guests SET guest_name = ?, phone_number = ?, checkin_date = ?, expected_checkout = ?, room_id = ?, no_of_guests = ?, base_room_rent = ?, total_charge = ?, advance_paid = ?, advance_received_by = ?, pending_amount = ?, pending_received_by = ?, booking_source = ?, notes = ?, is_foreign_guest = ? WHERE id = ? AND property_id = ?");
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
                            $advanceReceivedBy,
                            $pendingAmount,
                            $pendingReceivedBy,
                            $bookingSource,
                            $notes,
                            !empty($input['is_foreign_guest']) ? 1 : 0,
                            $guestId,
                            $propertyId,
                        ]);
                    } else {
                        $stmt = $pdo->prepare("UPDATE guests SET guest_name = ?, phone_number = ?, checkin_date = ?, expected_checkout = ?, no_of_guests = ?, base_room_rent = ?, total_charge = ?, advance_paid = ?, advance_received_by = ?, pending_amount = ?, pending_received_by = ?, booking_source = ?, notes = ?, is_foreign_guest = ? WHERE id = ? AND property_id = ?");
                        $stmt->execute([
                            $input['guest_name'] ?? $input['name'] ?? '',
                            $input['phone_number'] ?? $input['contact'] ?? '',
                            $input['checkin_date'] ?? date('Y-m-d'),
                            $input['expected_checkout'] ?? date('Y-m-d H:i:s', strtotime('+1 day')),
                            intval($input['no_of_guests'] ?? 1),
                            floatval($input['base_room_rent'] ?? 0),
                            $totalCharge,
                            $advancePaid,
                            $advanceReceivedBy,
                            $pendingAmount,
                            $pendingReceivedBy,
                            $bookingSource,
                            $notes,
                            !empty($input['is_foreign_guest']) ? 1 : 0,
                            $guestId,
                            $propertyId,
                        ]);
                    }
                    echo json_encode(['status' => 'success', 'message' => 'Booking updated successfully']);

                    // Ping Admin with exactly what changed, not just "booking updated" -
                    // a diff against the pre-update row, one line per field that actually
                    // moved. Best-effort: notification failure must never fail the save
                    // that already succeeded and was already reported to the client above.
                    try {
                        $fieldLabels = [
                            'guest_name'           => 'Guest Name',
                            'phone_number'         => 'Phone',
                            'checkin_date'         => 'Check-in',
                            'expected_checkout'    => 'Check-out',
                            'no_of_guests'         => 'No. of Guests',
                            'base_room_rent'       => 'Room Rent',
                            'advance_paid'         => 'Advance Paid',
                            'advance_received_by'  => 'Advance Received By',
                            'pending_received_by'  => 'Pending Received By',
                            'booking_source'       => 'Booking Source',
                            'notes'                => 'Guest Notes',
                            'is_foreign_guest'     => 'Foreign Guest',
                        ];
                        // New values built from the incoming payload.
                        // Date fields are normalised to Y-m-d so they match the DB
                        // regardless of whether the stored value includes a time component.
                        $newValues = [
                            'guest_name'           => $input['guest_name'] ?? $input['name'] ?? '',
                            'phone_number'         => $input['phone_number'] ?? $input['contact'] ?? '',
                            'checkin_date'         => date('Y-m-d', strtotime($input['checkin_date'] ?? 'today')),
                            'expected_checkout'    => date('Y-m-d', strtotime($input['expected_checkout'] ?? 'tomorrow')),
                            'no_of_guests'         => intval($input['no_of_guests'] ?? 1),
                            'base_room_rent'       => floatval($input['base_room_rent'] ?? 0),
                            'advance_paid'         => $advancePaid,
                            'advance_received_by'  => $advanceReceivedBy,
                            'pending_received_by'  => $pendingReceivedBy,
                            'booking_source'       => $bookingSource,
                            'notes'                => $notes,
                            'is_foreign_guest'     => !empty($input['is_foreign_guest']) ? 1 : 0,
                        ];
                        $changedLines = [];
                        foreach ($fieldLabels as $field => $label) {
                            $oldVal = $previousGuest[$field] ?? null;
                            $newVal = $newValues[$field];
                            // Normalise date fields from DB (may carry a time component) to
                            // Y-m-d before comparing so identical calendar dates are never
                            // reported as changed just because the time part differs.
                            if (in_array($field, ['checkin_date', 'expected_checkout'])) {
                                $oldNorm = $oldVal ? date('Y-m-d', strtotime($oldVal)) : '';
                                $newNorm = (string)$newVal;
                                if ($oldNorm === $newNorm) continue;
                                $oldDisplay = $oldNorm ? date('d M Y', strtotime($oldNorm)) : '(none)';
                                $newDisplay = $newNorm ? date('d M Y', strtotime($newNorm)) : '(none)';
                                $changedLines[] = "• <b>{$label}:</b> {$oldDisplay} → {$newDisplay}";
                                continue;
                            }
                            // Loose comparison for other fields
                            if ((string)$oldVal === (string)$newVal) continue;
                            if ($field === 'is_foreign_guest') {
                                $oldVal = $oldVal ? 'Yes' : 'No';
                                $newVal = $newVal ? 'Yes' : 'No';
                            } elseif (in_array($field, ['base_room_rent', 'advance_paid'])) {
                                $oldVal = '₹' . number_format((float)$oldVal, 2);
                                $newVal = '₹' . number_format((float)$newVal, 2);
                            } elseif ($oldVal === null || $oldVal === '') {
                                $oldVal = '(none)';
                            }
                            $changedLines[] = "• <b>{$label}:</b> {$oldVal} → {$newVal}";
                        }
                        if (!empty($changedLines) && !empty($previousGuest)) {
                            require_once __DIR__ . '/../telegram/sender.php';
                            require_once __DIR__ . '/../telegram/templates.php';
                            $editMsg = TelegramTemplates::render($pdo, 'booking_updated', [
                                'guest_name'   => $previousGuest['guest_name'] ?? '',
                                'booking_id'   => $guestId,
                                'changes_list' => implode("\n", $changedLines),
                            ]);
                            sendPropertyTelegramMessage($pdo, $propertyId, 'admin', $editMsg);
                        }
                    } catch (Exception $e) {}

                    $newNoOfGuests = intval($input['no_of_guests'] ?? 1);
                    if ($newNoOfGuests > $previousNoOfGuests) {
                        try {
                            $roomStmt = $pdo->prepare("
                                SELECT g.guest_name, COALESCE(r.name, 'Unassigned') as room_name
                                FROM guests g
                                LEFT JOIN properties r ON g.room_id = r.id
                                WHERE g.id = ? AND g.property_id = ?
                            ");
                            $roomStmt->execute([$guestId, $propertyId]);
                            $guestInfo = $roomStmt->fetch(PDO::FETCH_ASSOC);
                            if ($guestInfo) {
                                $countStmt = $pdo->prepare("SELECT COUNT(*) FROM guest_id_documents WHERE guest_id = ? AND property_id = ?");
                                $countStmt->execute([$guestId, $propertyId]);
                                $uploadedCount = intval($countStmt->fetchColumn());
                                require_once __DIR__ . '/../telegram/sender.php';
                                $msg = "👥 <b>Guest Count Updated</b>\n\n";
                                $msg .= "👤 <b>Booking:</b> {$guestInfo['guest_name']}\n";
                                $msg .= "🚪 <b>Room:</b> {$guestInfo['room_name']}\n";
                                $msg .= "🔢 <b>Guests:</b> {$previousNoOfGuests} → {$newNoOfGuests}\n";
                                $msg .= "📋 <b>ID Documents:</b> {$uploadedCount}/{$newNoOfGuests} uploaded";
                                sendPropertyTelegramMessage($pdo, $propertyId, 'admin', $msg);
                            }
                        } catch (Exception $e) {
                            error_log("Failed to send guest-count-updated Telegram notification: " . $e->getMessage());
                        }
                    }
                } catch (PDOException $e) {
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to update guest: ' . $e->getMessage()]);
                }
            }
            break;

        case 'delete_guest':
            if ($request_method === 'POST' || $request_method === 'DELETE') {
                $input = json_decode(file_get_contents('php://input'), true);
                $guestId = validateGuestIdOrRespond($input['id'] ?? null);
                if ($guestId === null) break;
                try {
                    $stmt = $pdo->prepare("DELETE FROM guests WHERE id = ? AND property_id = ?");
                    $stmt->execute([$guestId, $propertyId]);
                    if ($stmt->rowCount() > 0) {
                        echo json_encode(['status' => 'success', 'message' => 'Booking deleted successfully']);
                    } else {
                        http_response_code(404);
                        echo json_encode(['status' => 'error', 'message' => 'Booking not found']);
                    }
                } catch (PDOException $e) {
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to delete booking: ' . $e->getMessage()]);
                }
            }
            break;

        case 'checkout_guest':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $guestId = validateGuestIdOrRespond($input['id'] ?? null);
                if ($guestId === null) break;
                try {
                    $stmt = $pdo->prepare("UPDATE guests SET status = ?, checkout_date = ? WHERE id = ? AND property_id = ?");
                    $stmt->execute([GUEST_STATUS_CHECKED_OUT, date('Y-m-d'), $guestId, $propertyId]);
                } catch (PDOException $e) {
                    $stmt = $pdo->prepare("UPDATE guests SET status = ?, check_out = ? WHERE id = ? AND property_id = ?");
                    $stmt->execute([GUEST_STATUS_CHECKED_OUT, date('Y-m-d H:i:s'), $guestId, $propertyId]);
                }
                echo json_encode(['status' => 'success', 'message' => 'Guest checked out successfully']);
            }
            break;

        case 'checkin_guest':
            if ($request_method === 'POST') {
                ensureComplianceSchema($pdo);
                $input = json_decode(file_get_contents('php://input'), true);
                $guestId = validateGuestIdOrRespond($input['id'] ?? null);
                if ($guestId === null) break;
                try {
                    $stmt = $pdo->prepare("UPDATE guests SET status = ?, checkin_date = COALESCE(checkin_date, ?) WHERE id = ? AND property_id = ?");
                    $stmt->execute([GUEST_STATUS_CHECKED_IN, date('Y-m-d H:i:s'), $guestId, $propertyId]);
                    echo json_encode(['status' => 'success', 'message' => 'Guest checked in successfully']);
                } catch (PDOException $e) {
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to check in guest: ' . $e->getMessage()]);
                }
            }
            break;

        case 'mark_c_form_filed':
            if ($request_method === 'POST') {
                ensureComplianceSchema($pdo);
                $input = json_decode(file_get_contents('php://input'), true);
                $guestId = validateGuestIdOrRespond($input['id'] ?? null);
                if ($guestId === null) break;
                try {
                    // Un-filing (staff caught a mistake) just clears the timestamp again.
                    $filed = !array_key_exists('filed', $input) || !empty($input['filed']);
                    $stmt = $pdo->prepare("UPDATE guests SET c_form_filed_at = ? WHERE id = ? AND property_id = ?");
                    $stmt->execute([$filed ? date('Y-m-d H:i:s') : null, $guestId, $propertyId]);
                    echo json_encode(['status' => 'success', 'message' => $filed ? 'Marked as filed' : 'Marked as not filed']);
                } catch (PDOException $e) {
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to update C-Form status: ' . $e->getMessage()]);
                }
            }
            break;

        case 'get_id_documents':
            ensureIdVerificationSchema($pdo);
            $guestId = validateGuestIdOrRespond($_GET['guest_id'] ?? null, 'guest_id');
            if ($guestId === null) break;
            $stmt = $pdo->prepare("SELECT id, guest_index, file_path, uploaded_at FROM guest_id_documents WHERE guest_id = ? AND property_id = ? ORDER BY guest_index ASC");
            $stmt->execute([$guestId, $propertyId]);
            $docs = array_map('convertSnakeToCamel', $stmt->fetchAll(PDO::FETCH_ASSOC));
            echo json_encode(['status' => 'success', 'data' => $docs]);
            break;

        case 'upload_id_document':
            ensureIdVerificationSchema($pdo);
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $guestId = validateGuestIdOrRespond($input['guest_id'] ?? null, 'guest_id');
                if ($guestId === null) break;
                try {
                    $guestIndex = InputValidator::validateInteger($input['guest_index'] ?? null, 1, 100);
                } catch (Exception $e) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'guest_index must be a positive integer']);
                    break;
                }
                $filePath = $input['file_path'] ?? null;
                if (!$filePath) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'guest_id, guest_index, and file_path are required']);
                    break;
                }
                try {
                    $stmt = $pdo->prepare("
                        INSERT INTO guest_id_documents (guest_id, property_id, guest_index, file_path, uploaded_by)
                        VALUES (?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE file_path = VALUES(file_path), uploaded_at = CURRENT_TIMESTAMP, uploaded_by = VALUES(uploaded_by)
                    ");
                    $stmt->execute([$guestId, $propertyId, $guestIndex, $filePath, $_SESSION['username'] ?? '']);

                    // Return the saved row directly so the frontend can merge
                    // it into local state instead of a third round-trip
                    // re-fetching the entire document list just to pick up
                    // one new/changed row.
                    $docStmt = $pdo->prepare("SELECT id, guest_index, file_path, uploaded_at FROM guest_id_documents WHERE guest_id = ? AND property_id = ? AND guest_index = ?");
                    $docStmt->execute([$guestId, $propertyId, $guestIndex]);
                    $savedDoc = convertSnakeToCamel($docStmt->fetch(PDO::FETCH_ASSOC));

                    echo json_encode(['status' => 'success', 'message' => 'ID document saved', 'data' => $savedDoc]);

                    // Temp-storage TTL: each upload opportunistically sweeps
                    // files/rows past the 24h window (the daily cron does the
                    // same, so no upload after a booking's completion means
                    // the files still get cleaned).
                    cleanupExpiredIdDocuments($pdo, 24, $propertyId);

                    // Live progress ping - lets the tenant follow along in Telegram as
                    // photos come in, rather than only hearing about it at completion.
                    try {
                        $guestStmt = $pdo->prepare("
                            SELECT g.guest_name, g.no_of_guests, COALESCE(r.name, 'Unassigned') as room_name
                            FROM guests g
                            LEFT JOIN properties r ON g.room_id = r.id
                            WHERE g.id = ? AND g.property_id = ?
                        ");
                        $guestStmt->execute([$guestId, $propertyId]);
                        $guestInfo = $guestStmt->fetch(PDO::FETCH_ASSOC);
                        if ($guestInfo) {
                            $required = max(1, intval($guestInfo['no_of_guests'] ?? 1));
                            $countStmt = $pdo->prepare("SELECT COUNT(*) FROM guest_id_documents WHERE guest_id = ? AND property_id = ?");
                            $countStmt->execute([$guestId, $propertyId]);
                            $uploadedCount = intval($countStmt->fetchColumn());
                            require_once __DIR__ . '/../telegram/sender.php';
                            $msg = "📸 <b>ID Document Uploaded</b>\n\n";
                            $msg .= "👤 <b>Guest:</b> {$guestInfo['guest_name']}\n";
                            $msg .= "🚪 <b>Room:</b> {$guestInfo['room_name']}\n";
                            $msg .= "✅ <b>Progress:</b> {$uploadedCount}/{$required} required ID(s) uploaded";
                            // templateKey only steers routing - the content is the
                            // raw message above, routed to the same admin group the
                            // check-in completion photos go to.
                            //
                            // Send the actual photo (caption = the same progress text
                            // above) instead of a text-only ping, so the tenant can see
                            // the ID as it comes in rather than just a counter. $filePath
                            // is the stored URL ("/uploads/images/id_documents/xyz.jpg");
                            // reconstruct the real disk path the same way
                            // deleteIdDocumentFiles()/cleanupExpiredIdDocuments() do.
                            $photoSent = false;
                            $uploadsPos = strpos((string)$filePath, '/uploads/');
                            if ($uploadsPos !== false) {
                                $diskPath = __DIR__ . '/../' . substr((string)$filePath, $uploadsPos + 1);
                                $photoResult = sendPropertyTelegramPhoto($pdo, $propertyId, 'admin', [$diskPath], $msg, 'checkin_verification_complete');
                                // sendPropertyTelegramPhoto returns an array only when it
                                // skipped (Telegram off / no group / file missing) -
                                // anything else is the raw sendPhoto API response, i.e. it
                                // actually went out.
                                $photoSent = !is_array($photoResult);
                            }
                            // Fall back to the text-only ping if the photo couldn't be
                            // sent, so the progress notification is never silently dropped.
                            if (!$photoSent) {
                                sendPropertyTelegramMessage($pdo, $propertyId, 'admin', $msg, null, 'checkin_verification_complete');
                            }
                        }
                    } catch (Exception $e) {
                        error_log("Failed to send ID upload Telegram notification: " . $e->getMessage());
                    }
                } catch (PDOException $e) {
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to save ID document: ' . $e->getMessage()]);
                }
            }
            break;

        case 'delete_id_document':
            ensureIdVerificationSchema($pdo);
            if ($request_method === 'POST' || $request_method === 'DELETE') {
                $input = json_decode(file_get_contents('php://input'), true);
                $docId = validateGuestIdOrRespond($input['id'] ?? null, 'id');
                if ($docId === null) break;
                $pathStmt = $pdo->prepare("SELECT file_path FROM guest_id_documents WHERE id = ? AND property_id = ?");
                $pathStmt->execute([$docId, $propertyId]);
                $removedPath = $pathStmt->fetchColumn();
                $stmt = $pdo->prepare("DELETE FROM guest_id_documents WHERE id = ? AND property_id = ?");
                $stmt->execute([$docId, $propertyId]);
                if ($removedPath) {
                    deleteIdDocumentFiles([$removedPath]);
                }
                echo json_encode(['status' => 'success', 'message' => 'ID document removed']);
            }
            break;

        case 'complete_checkin_verification':
            ensureIdVerificationSchema($pdo);
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $guestId = validateGuestIdOrRespond($input['guest_id'] ?? null, 'guest_id');
                if ($guestId === null) break;
                $stmt = $pdo->prepare("
                    SELECT g.guest_name, g.phone_number, g.adults, g.children, g.no_of_guests,
                           g.checkin_date, g.expected_checkout, g.is_foreign_guest, g.c_form_filed_at,
                           COALESCE(r.name, 'Unassigned') as room_name
                    FROM guests g
                    LEFT JOIN properties r ON g.room_id = r.id
                    WHERE g.id = ? AND g.property_id = ?
                ");
                $stmt->execute([$guestId, $propertyId]);
                $guest = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$guest) {
                    http_response_code(404);
                    echo json_encode(['status' => 'error', 'message' => 'Guest not found']);
                    break;
                }
                $required = max(1, intval($guest['no_of_guests'] ?? 1));
                $docsStmt = $pdo->prepare("SELECT file_path FROM guest_id_documents WHERE guest_id = ? AND property_id = ?");
                $docsStmt->execute([$guestId, $propertyId]);
                $docPaths = $docsStmt->fetchAll(PDO::FETCH_COLUMN);
                $uploadedCount = count($docPaths);
                if ($uploadedCount < $required) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => "Only {$uploadedCount} of {$required} required ID document(s) uploaded"]);
                    break;
                }
                $pdo->prepare("UPDATE guests SET id_verification_status = 'Complete' WHERE id = ? AND property_id = ?")->execute([$guestId, $propertyId]);
                echo json_encode(['status' => 'success', 'message' => 'Check-in verification complete']);

                // Final compliance record - attaches the actual ID photos, distinct
                // from the text-only progress pings sent during upload. The caption
                // carries the full check details so management gets the complete
                // booking picture in that one message. Photos are temporary (24h
                // TTL): once Telegram has them, the on-disk copies are deleted.
                try {
                    require_once __DIR__ . '/../telegram/sender.php';
                    require_once __DIR__ . '/../telegram/templates.php';
                    $fsPaths = array_filter(array_map(function ($url) {
                        $pos = strpos($url, '/uploads/');
                        return $pos === false ? null : (__DIR__ . '/../' . substr($url, $pos + 1));
                    }, $docPaths));
                    $caption = TelegramTemplates::render($pdo, 'checkin_verification_complete', [
                        'guest_name' => $guest['guest_name'],
                        'room_name' => $guest['room_name'],
                        'doc_count' => $uploadedCount,
                    ]);
                    $guestCount = max(1, intval($guest['no_of_guests'] ?? 1));
                    $caption .= "\n📞 <b>Phone:</b> " . (!empty($guest['phone_number']) ? $guest['phone_number'] : '—');
                    $caption .= "\n👥 <b>Guests:</b> {$guestCount}";
                    if (($guest['adults'] ?? null) !== null || ($guest['children'] ?? null) !== null) {
                        $caption .= " (" . trim(
                            (($guest['adults'] ?? null) !== null ? "👨 {$guest['adults']} adults" : '') .
                            (($guest['adults'] ?? null) !== null && ($guest['children'] ?? null) !== null ? ', ' : '') .
                            (($guest['children'] ?? null) !== null ? "🧒 {$guest['children']} children" : '')
                        ) . ")";
                    }
                    $caption .= "\n📅 <b>Check-in:</b> " . ($guest['checkin_date'] ?? '—');
                    $caption .= "\n🛎️ <b>Expected Checkout:</b> " . ($guest['expected_checkout'] ?? '—');
                    if (intval($guest['is_foreign_guest'] ?? 0) === 1) {
                        $caption .= "\n🛂 <b>C-Form (FRRO):</b> " . (!empty($guest['c_form_filed_at']) ? '✅ Filed' : '⏳ Pending');
                    }
                    $sendResult = sendPropertyTelegramPhoto($pdo, $propertyId, 'admin', $fsPaths, $caption, 'checkin_verification_complete');
                    if (!is_array($sendResult) || empty($sendResult['skipped'])) {
                        deleteIdDocumentFiles($docPaths);
                    }
                } catch (Exception $e) {
                    error_log("Failed to send check-in completion Telegram photo notification: " . $e->getMessage());
                }
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid guest action']);
            break;
    }
}
