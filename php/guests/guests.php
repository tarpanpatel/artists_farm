<?php
/**
 * Front Office & Guest Management Module
 * Function: Resident registration, stay breakdown, and check-out status.
 */

// Guarded (28 Aug 2026, found while adding the Telegram check-in/check-out
// buttons) - service_requests.php defines an identical helper, already
// guarded on its own side, but this copy wasn't, so loading this file AFTER
// service_requests.php in the same process (e.g. webhook_handler.php now
// requires both) fataled with "Cannot redeclare convertSnakeToCamel()".
// router.php's own load order (guests.php first) happened to avoid it, which
// is exactly why this had never surfaced before.
if (!function_exists('convertSnakeToCamel')) {
    function convertSnakeToCamel($array) {
        $result = [];
        foreach ($array as $key => $value) {
            $camelKey = preg_replace_callback('/_([a-z])/', function($m) { return strtoupper($m[1]); }, $key);
            $result[$camelKey] = $value;
        }
        return $result;
    }
}

require_once __DIR__ . '/../config/schema_cache.php';
require_once __DIR__ . '/../config/guest_status.php';
require_once __DIR__ . '/../security/input_validator.php';
// Self-guarding (every function inside wrapped in function_exists checks), so
// safe to require unconditionally regardless of how many physical paths this
// file itself gets loaded from - see webhook_handler.php's own comment on the
// staging cross-environment __DIR__ collision this class of require can hit.
require_once __DIR__ . '/../telegram/sender.php';
require_once __DIR__ . '/../telegram/templates.php';
require_once __DIR__ . '/../housekeeping/housekeeping.php';

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

// Backs the "Mark Checked-In" / "Mark Checked-Out" Telegram action buttons
// (added 28 Aug 2026): telegram_booking_* remembers the "NEW GUEST BOOKING"
// message (edited when Check-In is tapped); telegram_checkout_* remembers the
// separate departure-day reminder message sent by
// php/cron/checkout_departure_reminders.php (edited when Check-Out is
// tapped); checkout_reminder_last_sent_at dedupes that cron the same way
// id_verification_last_reminder_at dedupes the ID-verification reminder above.
function ensureGuestTelegramCheckinoutSchema($pdo) {
    if (isSchemaVerified('schema_guest_telegram_checkinout')) return;
    try {
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `telegram_booking_chat_id` VARCHAR(64) DEFAULT NULL");
    } catch (PDOException $e) {}
    try {
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `telegram_booking_message_id` INT DEFAULT NULL");
    } catch (PDOException $e) {}
    try {
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `telegram_checkout_chat_id` VARCHAR(64) DEFAULT NULL");
    } catch (PDOException $e) {}
    try {
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `telegram_checkout_message_id` INT DEFAULT NULL");
    } catch (PDOException $e) {}
    try {
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `checkout_reminder_last_sent_at` DATETIME DEFAULT NULL");
    } catch (PDOException $e) {}
    markSchemaVerified('schema_guest_telegram_checkinout');
}

// Concurrency token for booking edits (added 30 Aug 2026). update_guest
// overwrites every column from the submitted form, so two staff editing the
// same booking meant the later save silently discarded the earlier one - no
// error, no warning, and nobody finds out until a guest turns up on the wrong
// date. This column is the "version" each edit is checked against: the client
// echoes back the value it loaded, and the UPDATE only applies if the row
// hasn't moved since (see update_guest's expected_updated_at handling).
//
// Fractional seconds are deliberate: a plain 1-second-resolution TIMESTAMP
// would let two saves inside the same second carry the same token, which is
// exactly the fast double-save this is meant to catch. MariaDB's ON UPDATE
// only fires when a row's values actually change, so a no-op save correctly
// leaves the token (and therefore anyone else's in-flight edit) alone.
function ensureGuestConcurrencySchema($pdo) {
    if (isSchemaVerified('schema_guest_updated_at')) return;
    try {
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `updated_at` TIMESTAMP(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)");
    } catch (PDOException $e) {}
    markSchemaVerified('schema_guest_updated_at');
}

// Shared by the app's own checkin_guest/checkout_guest API actions and the
// Telegram "Mark Checked-In"/"Mark Checked-Out" buttons (checkinGuestViaTelegram/
// checkoutGuestViaTelegram below) - one place that actually flips guest
// status, so every entry point stays consistent. In particular, checkout
// always triggers the housekeeping "needs cleaning" flow now, not just one
// UI path.
function performGuestCheckin($pdo, $guestId, $propertyId) {
    $stmt = $pdo->prepare("SELECT id, status FROM guests WHERE id = ? AND property_id = ?");
    $stmt->execute([$guestId, $propertyId]);
    $guest = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$guest) {
        return ['success' => false, 'already' => false, 'message' => 'Guest not found'];
    }
    if ($guest['status'] === GUEST_STATUS_CHECKED_IN) {
        return ['success' => true, 'already' => true, 'message' => 'Guest is already checked in'];
    }
    $pdo->prepare("UPDATE guests SET status = ?, checkin_date = COALESCE(checkin_date, ?) WHERE id = ? AND property_id = ?")
        ->execute([GUEST_STATUS_CHECKED_IN, date('Y-m-d H:i:s'), $guestId, $propertyId]);
    return ['success' => true, 'already' => false, 'message' => 'Guest checked in successfully'];
}

function performGuestCheckout($pdo, $guestId, $propertyId) {
    $stmt = $pdo->prepare("SELECT id, status, room_id FROM guests WHERE id = ? AND property_id = ?");
    $stmt->execute([$guestId, $propertyId]);
    $guest = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$guest) {
        return ['success' => false, 'already' => false, 'message' => 'Guest not found'];
    }
    if ($guest['status'] === GUEST_STATUS_CHECKED_OUT || $guest['status'] === GUEST_STATUS_CHECKEDOUT_LEGACY) {
        return ['success' => true, 'already' => true, 'message' => 'Guest is already checked out'];
    }
    try {
        $pdo->prepare("UPDATE guests SET status = ?, checkout_date = ? WHERE id = ? AND property_id = ?")
            ->execute([GUEST_STATUS_CHECKED_OUT, date('Y-m-d'), $guestId, $propertyId]);
    } catch (PDOException $e) {
        $pdo->prepare("UPDATE guests SET status = ?, check_out = ? WHERE id = ? AND property_id = ?")
            ->execute([GUEST_STATUS_CHECKED_OUT, date('Y-m-d H:i:s'), $guestId, $propertyId]);
    }
    if (!empty($guest['room_id'])) {
        markRoomDirtyAfterCheckout($pdo, $propertyId, $guest['room_id']);
    }
    return ['success' => true, 'already' => false, 'message' => 'Guest checked out successfully'];
}

// Telegram "Mark Checked-In" tap handler (callback_data checkin_guest_{id}).
function checkinGuestViaTelegram($pdo, $guestId, $staffName) {
    ensureGuestTelegramCheckinoutSchema($pdo);
    $stmt = $pdo->prepare("SELECT id, guest_name, property_id, telegram_booking_chat_id, telegram_booking_message_id FROM guests WHERE id = ?");
    $stmt->execute([$guestId]);
    $guest = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$guest) {
        return ['status' => 'error', 'message' => 'Guest not found'];
    }

    $result = performGuestCheckin($pdo, $guestId, $guest['property_id']);
    if (!$result['success']) {
        return ['status' => 'error', 'message' => $result['message']];
    }
    if ($result['already']) {
        return ['status' => 'success', 'already' => true, 'message' => 'Already checked in'];
    }

    if (!empty($guest['telegram_booking_chat_id']) && !empty($guest['telegram_booking_message_id'])) {
        $config = getPropertyTelegramConfig($pdo, $guest['property_id']);
        $botToken = !empty($config['botToken']) ? $config['botToken'] : (defined('TELEGRAM_BOT_TOKEN') ? TELEGRAM_BOT_TOKEN : null);
        $editedText = "✅ <b>GUEST CHECKED IN</b>\n\n👤 <b>Guest:</b> " . htmlspecialchars($guest['guest_name']) . "\n🛎️ <b>Checked In By:</b> {$staffName}\n🕒 <b>At:</b> " . date('h:i A');
        editTelegramMessageText($guest['telegram_booking_chat_id'], $guest['telegram_booking_message_id'], $editedText, null, $botToken);
    }

    return ['status' => 'success', 'already' => false, 'message' => 'Guest checked in successfully'];
}

// Telegram "Mark Checked-Out" tap handler (callback_data checkout_guest_{id}).
// Bare status flip only - matches the app's own checkout_guest action exactly
// (see performGuestCheckout above). Does NOT create a bill/receipt - full
// billing still happens separately in the app, same as it already can today.
function checkoutGuestViaTelegram($pdo, $guestId, $staffName) {
    ensureGuestTelegramCheckinoutSchema($pdo);
    $stmt = $pdo->prepare("SELECT id, guest_name, property_id, telegram_checkout_chat_id, telegram_checkout_message_id FROM guests WHERE id = ?");
    $stmt->execute([$guestId]);
    $guest = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$guest) {
        return ['status' => 'error', 'message' => 'Guest not found'];
    }

    $result = performGuestCheckout($pdo, $guestId, $guest['property_id']);
    if (!$result['success']) {
        return ['status' => 'error', 'message' => $result['message']];
    }
    if ($result['already']) {
        return ['status' => 'success', 'already' => true, 'message' => 'Already checked out'];
    }

    if (!empty($guest['telegram_checkout_chat_id']) && !empty($guest['telegram_checkout_message_id'])) {
        $config = getPropertyTelegramConfig($pdo, $guest['property_id']);
        $botToken = !empty($config['botToken']) ? $config['botToken'] : (defined('TELEGRAM_BOT_TOKEN') ? TELEGRAM_BOT_TOKEN : null);
        $editedText = "✅ <b>GUEST CHECKED OUT</b>\n\n👤 <b>Guest:</b> " . htmlspecialchars($guest['guest_name']) . "\n🚪 <b>Checked Out By:</b> {$staffName}\n🕒 <b>At:</b> " . date('h:i A');
        editTelegramMessageText($guest['telegram_checkout_chat_id'], $guest['telegram_checkout_message_id'], $editedText, null, $botToken);
    }

    return ['status' => 'success', 'already' => false, 'message' => 'Guest checked out successfully'];
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
    try {
        // Was referenced by mark_c_form_filed's UPDATE below with no
        // self-heal block of its own (found 21 Aug 2026 while adding
        // c_form_document_url next to it) - exactly the
        // properties.checkin_time/checkout_time gap CLAUDE.md warns about:
        // an environment that never got a manual ALTER for this column
        // would have every C-Form save fail with a raw SQL error.
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `c_form_number` VARCHAR(100) DEFAULT NULL");
    } catch (PDOException $e) {}
    try {
        // The uploaded Form 'C' confirmation (PDF/photo) attached when a
        // C-Form filing is saved - see upload_document.php's 'c_form'
        // folder and mark_c_form_filed below. Stored so it can be
        // re-displayed/re-sent later, not just forwarded to Telegram once.
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `c_form_document_url` VARCHAR(500) DEFAULT NULL");
    } catch (PDOException $e) {}
    markSchemaVerified('schema_compliance');
}

// Tracks a booking that started life as an OTA (Airbnb/Booking.com/etc) iCal
// sync block and was converted into a real, locally-editable guests row -
// see php/api/ical_sync.php's getBlockedDates()/syncICalEvents(). ota_source*
// is frozen at conversion time (never edited afterwards - a booking's origin
// doesn't change). ical_external_event_id is the iCal UID, stable across
// resyncs: it's what makes the source block permanently disappear from
// getBlockedDates once claimed, and what syncICalEvents() matches against to
// detect an upstream cancellation (ota_cancelled_detected_at).
function ensureOtaBookingSchema($pdo) {
    if (isSchemaVerified('schema_ota_booking')) return;
    try {
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `ota_source` VARCHAR(50) DEFAULT NULL");
    } catch (PDOException $e) {}
    try {
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `ota_source_label` VARCHAR(255) DEFAULT NULL");
    } catch (PDOException $e) {}
    try {
        // Collation must match ical_synced_events.external_event_id
        // (utf8mb4_unicode_ci) explicitly - guests defaults to
        // utf8mb4_general_ci, and comparing/joining two VARCHAR columns with
        // different collations throws "Illegal mix of collations" (found 16
        // Aug 2026: this silently broke getBlockedDates() - every OTA-blocked
        // capsule failed to load, with the error swallowed by its own outer
        // try/catch, so the calendar just looked empty with no visible error).
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `ical_external_event_id` VARCHAR(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL");
    } catch (PDOException $e) {}
    try {
        // ADD COLUMN IF NOT EXISTS above is a no-op once the column already
        // exists, so an environment that already self-healed with the wrong
        // collation (before this fix) needs this MODIFY to actually correct
        // it - safe/idempotent to run every time the gate above lets through.
        $pdo->exec("ALTER TABLE guests MODIFY COLUMN `ical_external_event_id` VARCHAR(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL");
    } catch (PDOException $e) {}
    try {
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `ota_cancelled_detected_at` DATETIME DEFAULT NULL");
    } catch (PDOException $e) {}
    try {
        $pdo->exec("ALTER TABLE guests ADD INDEX `idx_ical_external_event_id` (`ical_external_event_id`)");
    } catch (PDOException $e) {}
    markSchemaVerified('schema_ota_booking');
}

// Itemized "Additional Charges" lines from the booking form (Decoration
// Fees, Extra Housekeeping, Pet Stay Charges, or a custom Misc Charges
// Management template). Before this, the per-line category/amount only ever
// survived as a human-readable notes string on the guest row - the total
// was real (folded into pending_amount) but which charge type it came from
// was thrown away before it reached the database, so analytics could never
// answer "how much did Decoration earn us this month", only "how much extra
// stuff did guests buy" as one lump misc figure.
function ensureGuestExtraChargesSchema($pdo) {
    if (isSchemaVerified('schema_guest_extra_charges')) return;
    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS `guest_extra_charges` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `property_id` INT NOT NULL DEFAULT 1,
                `guest_id` INT NOT NULL,
                `category` VARCHAR(100) NOT NULL,
                `amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
                `note` VARCHAR(255) DEFAULT NULL,
                `is_demo` TINYINT(1) NOT NULL DEFAULT 0,
                `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX `idx_property` (`property_id`),
                INDEX `idx_guest` (`guest_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
    } catch (PDOException $e) {}
    markSchemaVerified('schema_guest_extra_charges');
}

/**
 * ID-document uploads are temporary, not permanent records (24h TTL): the
 * check-in completion flow sends them to Telegram in one message and then
 * deletes them, and anything never completed (or whose completion skipped
 * because Telegram was off) gets swept here. Both the disk copy and the now
 * dangling guest_id_documents row are removed.
 */

// Root of the tenant/property-scoped upload tree (php/uploads/upload_image.php
// writes id_documents to {root}/{tenantSlug}/{propertySlug}/id_documents/, not
// a flat shared folder). Both functions below used to point at a flat legacy
// `.../images/id_documents` path that predates that per-tenant layout - found
// 29 Aug 2026 via a leftover orphaned thumbnail file that survived a real
// delete: the main image (whose path IS derived correctly, from the stored
// URL) deleted fine, but the thumbnail lookup and the whole TTL sweep below
// were silently checking a directory that no real upload has written to in a
// long time, so neither ever touched a real file. This is a real guest-PII
// retention bug, not cosmetic - ID document thumbnails, and every ID document
// this 24h TTL safety net is supposed to catch, were never actually being
// cleaned up.
function idDocumentsUploadRoot(): string {
    return __DIR__ . '/../uploads/images';
}

// Delete the full-size + thumb disk files behind a set of stored URL paths.
function deleteIdDocumentFiles(array $urls): void {
    foreach ($urls as $url) {
        $pos = strpos((string)$url, '/uploads/');
        if ($pos === false) {
            continue;
        }
        $fullPath = __DIR__ . '/../' . substr((string)$url, $pos + 1);
        @unlink($fullPath);
        // Thumb lives alongside the full-size file's own directory, not a
        // fixed shared location - see idDocumentsUploadRoot()'s comment.
        @unlink(dirname($fullPath) . '/thumbs/' . basename($fullPath));
    }
}

// Opportunistic 24h TTL sweep of the temporary ID-document store - removes
// files whose mtime is past the TTL, then drops the guest_id_documents rows
// pointing at the swept files so the reminder counter and document list never
// report a photo that is gone. Best-effort: never fails the caller.
function cleanupExpiredIdDocuments($pdo, int $hours = 24, int $propertyId = 0): int {
    $root = idDocumentsUploadRoot();
    if (!is_dir($root)) {
        return 0;
    }
    $expireBefore = time() - ($hours * 3600);
    $removed = 0;
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS)
    );
    foreach ($iterator as $file) {
        if (!$file->isFile()) {
            continue;
        }
        // The upload root is shared with menu/catalog/misc/qr_code images
        // (see upload_image.php) - only ever touch files under an
        // "id_documents" folder at any tenant/property nesting depth, never
        // sweep unrelated non-PII assets by walking into their directories too.
        if (strpos(str_replace('\\', '/', $file->getPathname()), '/id_documents/') === false) {
            continue;
        }
        if ($file->getMTime() < $expireBefore) {
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
            ensureOtaBookingSchema($pdo);
            // The edit form needs updated_at to send back as its concurrency token.
            ensureGuestConcurrencySchema($pdo);
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

        // Itemized booking-time "Additional Charges" (Decoration Fees, Extra
        // Housekeeping, Pet Stay Charges, custom Misc templates), joined back
        // to the guest's checkin_date so Analytics can filter/bucket them the
        // same way it already does for guests and receipts.
        case 'get_guest_extra_charges':
            ensureGuestExtraChargesSchema($pdo);
            try {
                $stmt = $pdo->prepare("
                    SELECT gec.id, gec.guest_id, gec.category, gec.amount, gec.note, gec.created_at, g.checkin_date, g.guest_name, g.room_id
                    FROM guest_extra_charges gec
                    JOIN guests g ON gec.guest_id = g.id
                    WHERE gec.property_id = ?
                    ORDER BY g.checkin_date DESC
                ");
                $stmt->execute([$propertyId]);
                $charges = array_map('convertSnakeToCamel', $stmt->fetchAll(PDO::FETCH_ASSOC));
                echo json_encode(['status' => 'success', 'data' => $charges]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'success', 'data' => []]);
            }
            break;

        case 'add_guest':
            if ($request_method === 'POST') {
                ensureComplianceSchema($pdo);
                ensureOtaBookingSchema($pdo);
                ensureGuestExtraChargesSchema($pdo);
                ensureGuestTelegramCheckinoutSchema($pdo);
                ensureGuestConcurrencySchema($pdo);
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

                    $icalExternalEventId = trim($input['ical_external_event_id'] ?? '') ?: null;
                    $otaSource = trim($input['ota_source'] ?? '') ?: null;
                    $otaSourceLabel = trim($input['ota_source_label'] ?? '') ?: null;

                    // Hard block: "1 room = 1 active booking" (CLAUDE.md) was never
                    // actually enforced here - update_guest has a 409 conflict check
                    // for this, but add_guest (the ONLY path that creates a brand new
                    // booking) had nothing at all, so two overlapping bookings could
                    // land in the same room with zero warning (found 20 Aug 2026,
                    // reported as double-bookings on the multi-room calendar). Checked
                    // against BOOKED too, not just Active/CheckedIn - a future
                    // reservation is exactly the kind of thing a second booking must
                    // not silently double up on.
                    //
                    // CONCURRENCY (30 Aug 2026): the check below MUST stay a locking
                    // read. It was a plain SELECT, which under this DB's REPEATABLE
                    // READ isolation is a non-locking snapshot read - proven with two
                    // real concurrent connections to let two staff booking the same
                    // room for the same dates BOTH pass this check and BOTH insert.
                    // Worse, the losing transaction kept reading its stale snapshot
                    // even after the other committed, so the danger window was the
                    // whole transaction, not a few milliseconds. Two changes fix it:
                    //   1. Take an exclusive row lock on the room (or the property
                    //      itself for a whole-property booking) FIRST, so concurrent
                    //      booking attempts for the same unit serialize here instead
                    //      of racing. Always the same single row in the same order,
                    //      so it can't deadlock against itself.
                    //   2. Run the overlap check itself as `... FOR UPDATE`, which in
                    //      InnoDB is a "current read" - it sees the latest committed
                    //      rows rather than the transaction's frozen snapshot, and
                    //      gap-locks the range so a concurrent INSERT can't slip in.
                    // Neither alone is sufficient: (1) without (2) still reads a stale
                    // snapshot; (2) without (1) is correct but relies purely on gap
                    // locks over an index range.
                    $newCheckin = $input['checkin_date'] ?? date('Y-m-d');
                    $newCheckout = $input['expected_checkout'] ?? date('Y-m-d H:i:s', strtotime('+1 day'));

                    // Whole-property (SINGLE) bookings carry no room_id at all, so the
                    // room-scoped branch below never ran for them - meaning a whole
                    // villa/homestay had NO overlap protection whatsoever, not even
                    // the racy version (found 30 Aug 2026 during the concurrency
                    // audit). Deliberately scoped to genuinely room-less properties:
                    // a MULTI_KEY property can also hold legacy room_id-NULL rows
                    // ("Other / Unassigned Rooms"), and those must NOT block each
                    // other, since they're not a single shared physical unit.
                    $isWholePropertyBooking = false;
                    if ($roomId === null) {
                        $typeStmt = $pdo->prepare("SELECT property_type FROM properties WHERE id = ? LIMIT 1");
                        $typeStmt->execute([$propertyId]);
                        $isWholePropertyBooking = ($typeStmt->fetchColumn() === 'SINGLE');
                    }

                    if ($roomId !== null || $isWholePropertyBooking) {
                        $lockTargetId = $roomId !== null ? $roomId : $propertyId;
                        $pdo->prepare("SELECT id FROM properties WHERE id = ? FOR UPDATE")->execute([$lockTargetId]);

                        if ($roomId !== null) {
                            $roomConflictStmt = $pdo->prepare("SELECT id FROM guests WHERE room_id = ? AND property_id = ? AND status IN (?, ?, ?) AND checkin_date < ? AND expected_checkout > ? LIMIT 1 FOR UPDATE");
                            $roomConflictStmt->execute([$roomId, $propertyId, GUEST_STATUS_ACTIVE_LEGACY, GUEST_STATUS_CHECKED_IN, GUEST_STATUS_BOOKED, $newCheckout, $newCheckin]);
                        } else {
                            $roomConflictStmt = $pdo->prepare("SELECT id FROM guests WHERE room_id IS NULL AND property_id = ? AND status IN (?, ?, ?) AND checkin_date < ? AND expected_checkout > ? LIMIT 1 FOR UPDATE");
                            $roomConflictStmt->execute([$propertyId, GUEST_STATUS_ACTIVE_LEGACY, GUEST_STATUS_CHECKED_IN, GUEST_STATUS_BOOKED, $newCheckout, $newCheckin]);
                        }

                        if ($roomConflictStmt->fetch()) {
                            if ($pdo->inTransaction()) {
                                $pdo->rollBack();
                            }
                            http_response_code(409);
                            echo json_encode(['status' => 'error', 'message' => $roomId !== null
                                ? 'Selected room already has an active booking for these dates'
                                : 'This property already has an active booking for these dates']);
                            break;
                        }
                    }

                    // Advisory only, not a hard block - staff may already know an OTA
                    // block is stale (guest cancelled by phone, feed hasn't resynced
                    // yet). Only checked for genuine new offline bookings, never when
                    // this call IS the OTA conversion itself (that request is deliberately
                    // claiming the very block this query would otherwise flag).
                    $overlapWarning = null;
                    if ($icalExternalEventId === null) {
                        try {
                            $overlapScopeId = $roomId ?? $propertyId;
                            $newCheckinForOverlap = $input['checkin_date'] ?? date('Y-m-d');
                            $newCheckoutForOverlap = $input['expected_checkout'] ?? date('Y-m-d H:i:s', strtotime('+1 day'));
                            $overlapStmt = $pdo->prepare("
                                SELECT e.event_start, e.event_end, c.service_name
                                FROM ical_synced_events e
                                JOIN ical_sync_configs c ON e.sync_config_id = c.id
                                WHERE c.property_id = ?
                                AND e.sync_status = 'synced'
                                AND e.event_start < ?
                                AND e.event_end > ?
                                AND NOT EXISTS (
                                    SELECT 1 FROM guests g2
                                    WHERE g2.ical_external_event_id = e.external_event_id
                                    AND (g2.room_id = c.property_id OR g2.property_id = c.property_id)
                                )
                                LIMIT 1
                            ");
                            $overlapStmt->execute([$overlapScopeId, $newCheckoutForOverlap, $newCheckinForOverlap]);
                            $overlapRow = $overlapStmt->fetch(PDO::FETCH_ASSOC);
                            if ($overlapRow) {
                                $overlapWarning = [
                                    'source_label' => $overlapRow['service_name'] ?: 'an external calendar',
                                    'event_start' => $overlapRow['event_start'],
                                    'event_end' => $overlapRow['event_end'],
                                ];
                            }
                        } catch (PDOException $e) {}
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
                    $stmt = $pdo->prepare("INSERT INTO guests (guest_name, phone_number, checkin_date, expected_checkout, status, advance_paid, advance_received_by, total_charge, pending_amount, pending_received_by, base_room_rent, notes, booking_source, no_of_guests, property_id, is_foreign_guest, room_id, ota_source, ota_source_label, ical_external_event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
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
                        $otaSource,
                        $otaSourceLabel,
                        $icalExternalEventId,
                    ]);
                    $newId = $pdo->lastInsertId();

                    // Itemized "Additional Charges" (Decoration Fees, Extra Housekeeping,
                    // Pet Stay Charges, custom Misc templates) - the total is already
                    // folded into pending_amount above, this is purely so analytics can
                    // break it down by category instead of only seeing one lump sum.
                    $extraCharges = is_array($input['extra_charges'] ?? null) ? $input['extra_charges'] : [];
                    if (!empty($extraCharges)) {
                        $chargeStmt = $pdo->prepare("
                            INSERT INTO guest_extra_charges (property_id, guest_id, category, amount, note)
                            VALUES (?, ?, ?, ?, ?)
                        ");
                        foreach ($extraCharges as $charge) {
                            $chargeAmount = floatval($charge['amount'] ?? 0);
                            if ($chargeAmount <= 0) continue;
                            $chargeStmt->execute([
                                $propertyId,
                                $newId,
                                trim($charge['category'] ?? 'Misc') ?: 'Misc',
                                $chargeAmount,
                                trim($charge['note'] ?? '') ?: null,
                            ]);
                        }
                    }

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

                    // Channel Manager Outbox (30 Aug 2026): Enqueue within transaction
                    if (is_file(__DIR__ . '/../channex/outbox.php')) {
                        require_once __DIR__ . '/../channex/outbox.php';
                    }
                    if (function_exists('enqueueOutboxItem')) {
                        enqueueOutboxItem($pdo, (int)$propertyId, $roomId, 'availability', $newCheckin, $newCheckout, [
                            'action' => 'add_guest',
                            'guest_id' => $newId,
                        ]);
                    }

                    $pdo->commit();

                    // Send Telegram notification for new guest booking
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

                    // "Mark Checked-In" only makes sense for a fresh reservation - a
                    // booking created as already Checked In (walk-in, OTA conversion)
                    // has nothing left to tap.
                    $bookingReplyMarkup = $status === GUEST_STATUS_BOOKED
                        ? ['inline_keyboard' => [[
                            ['text' => '🛎️ Mark Checked-In', 'callback_data' => "checkin_guest_{$newId}"]
                        ]]]
                        : null;
                    $bookingSendResult = sendPropertyTelegramMessage($pdo, $propertyId, 'admin', $telegramMessage, $bookingReplyMarkup);
                    $bookingDecoded = is_string($bookingSendResult) ? json_decode($bookingSendResult, true) : null;
                    if (!empty($bookingDecoded['ok']) && !empty($bookingDecoded['result'])) {
                        $pdo->prepare("UPDATE guests SET telegram_booking_chat_id = ?, telegram_booking_message_id = ? WHERE id = ?")
                            ->execute([$bookingDecoded['result']['chat']['id'], $bookingDecoded['result']['message_id'], $newId]);
                    }

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

                    $response = ['status' => 'success', 'id' => $newId, 'message' => 'Resident registered successfully'];
                    if ($overlapWarning !== null) {
                        $response['overlap_warning'] = $overlapWarning;
                    }
                    echo json_encode($response);

                    // Channel Manager Outbox (31 Aug 2026): a booking here enqueued an
                    // availability change above, but nothing ever drained it - it just
                    // sat 'pending' until someone happened to click "Drain Outbox" or a
                    // rate-rule save elsewhere drained the whole queue as a side effect.
                    // Certification Test 9 requires this to fire automatically from a
                    // real booking with no manual step. See outbox.php for why this
                    // waits a few seconds before draining instead of draining instantly.
                    if (is_file(__DIR__ . '/../channex/outbox.php')) {
                        require_once __DIR__ . '/../channex/outbox.php';
                        if (function_exists('triggerEventDrivenChannexDrain')) {
                            triggerEventDrivenChannexDrain($pdo);
                        }
                    }
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
                ensureOtaBookingSchema($pdo);
                ensureGuestConcurrencySchema($pdo);
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

                    // CONCURRENCY (30 Aug 2026): same fix as add_guest's - see the long
                    // comment there for why a plain SELECT could not enforce this. Two
                    // extra wrinkles specific to this path:
                    //   - There was no transaction at all here, so even a FOR UPDATE
                    //     lock would have been released the instant its statement
                    //     finished (autocommit), leaving the gap between check and
                    //     UPDATE just as wide. The check + UPDATE now commit as one
                    //     unit, so the lock is actually held across both.
                    //   - Moving a booking INTO an occupied room is the exact operation
                    //     this guards, and it races against add_guest too (one staff
                    //     member creating a booking while another drags an existing one
                    //     into the same room) - locking the same room row in both paths
                    //     is what makes those two serialize against each other.
                    $pdo->beginTransaction();

                    // LOST UPDATE GUARD (30 Aug 2026): re-read the row inside the
                    // transaction and compare against the version the client loaded.
                    // The earlier $previousGuest read happened outside any lock and is
                    // used for the change-diff notification, so it can't be trusted for
                    // this. Optimistic by design - staff editing DIFFERENT bookings, or
                    // the same booking one after another, are never blocked; only a
                    // genuine "you're both editing this exact booking right now" collides.
                    // Backwards compatible: a client that sends no token (older cached
                    // bundle, an integration, the OTA-conversion path) keeps the old
                    // last-write-wins behaviour rather than being hard-failed.
                    $expectedUpdatedAt = trim((string)($input['expected_updated_at'] ?? $input['expectedUpdatedAt'] ?? ''));
                    if ($expectedUpdatedAt !== '') {
                        $verStmt = $pdo->prepare("SELECT updated_at FROM guests WHERE id = ? AND property_id = ? FOR UPDATE");
                        $verStmt->execute([$guestId, $propertyId]);
                        $currentUpdatedAt = $verStmt->fetchColumn();
                        if ($currentUpdatedAt !== false && (string)$currentUpdatedAt !== $expectedUpdatedAt) {
                            if ($pdo->inTransaction()) {
                                $pdo->rollBack();
                            }
                            http_response_code(409);
                            echo json_encode([
                                'status' => 'error',
                                'code' => 'stale_booking',
                                'message' => 'Someone else changed this booking while you were editing it. Reload to see their changes, then re-apply yours.',
                                'current_updated_at' => $currentUpdatedAt,
                            ]);
                            break;
                        }
                    }

                    if ($roomId !== null) {
                        $pdo->prepare("SELECT id FROM properties WHERE id = ? FOR UPDATE")->execute([$roomId]);
                        // Was missing GUEST_STATUS_BOOKED - a future reservation is the
                        // most common thing this check needs to catch (moving a stay
                        // into a room that's already reserved later on), and it was
                        // silently excluded (found + fixed alongside add_guest's
                        // missing check, 20 Aug 2026).
                        $conflictStmt = $pdo->prepare("SELECT id FROM guests WHERE room_id = ? AND status IN (?, ?, ?) AND id != ? AND property_id = ? AND checkin_date < ? AND expected_checkout > ? LIMIT 1 FOR UPDATE");
                        $conflictStmt->execute([$roomId, GUEST_STATUS_ACTIVE_LEGACY, GUEST_STATUS_CHECKED_IN, GUEST_STATUS_BOOKED, $guestId, $propertyId, $newCheckout, $newCheckin]);
                        if ($conflictStmt->fetch()) {
                            if ($pdo->inTransaction()) {
                                $pdo->rollBack();
                            }
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

                    // Channel Manager Outbox (30 Aug 2026): Enqueue both old and new date ranges
                    if (is_file(__DIR__ . '/../channex/outbox.php')) {
                        require_once __DIR__ . '/../channex/outbox.php';
                    }
                    if (function_exists('enqueueOutboxItem')) {
                        if (!empty($previousGuest['checkin_date']) && !empty($previousGuest['expected_checkout'])) {
                            $oldRoomId = !empty($previousGuest['room_id']) ? (int)$previousGuest['room_id'] : null;
                            enqueueOutboxItem($pdo, (int)$propertyId, $oldRoomId, 'availability', $previousGuest['checkin_date'], $previousGuest['expected_checkout'], [
                                'action' => 'update_guest_old_dates',
                                'guest_id' => $guestId,
                            ]);
                        }
                        enqueueOutboxItem($pdo, (int)$propertyId, $roomId, 'availability', $newCheckin, $newCheckout, [
                            'action' => 'update_guest_new_dates',
                            'guest_id' => $guestId,
                        ]);
                    }

                    // Commit before responding/notifying: the room lock taken above must
                    // be released as soon as the write is durable, not held across the
                    // Telegram sends below (a slow/hanging API call would otherwise block
                    // every other booking attempt for this room for its whole duration).
                    if ($pdo->inTransaction()) {
                        $pdo->commit();
                    }

                    echo json_encode(['status' => 'success', 'message' => 'Booking updated successfully']);

                    // Channel Manager Outbox (31 Aug 2026): see add_guest's own comment
                    // above - nothing was draining these enqueued rows automatically.
                    if (function_exists('triggerEventDrivenChannexDrain')) {
                        triggerEventDrivenChannexDrain($pdo);
                    }

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
                            $newVal = $newValues[$field] ?? null;

                            // Date fields
                            if (in_array($field, ['checkin_date', 'expected_checkout'])) {
                                $oldNorm = $oldVal ? date('Y-m-d', strtotime($oldVal)) : '';
                                $newNorm = $newVal ? date('Y-m-d', strtotime($newVal)) : '';
                                if ($oldNorm === $newNorm) continue;
                                $oldDisplay = $oldNorm ? date('d M Y', strtotime($oldNorm)) : '(none)';
                                $newDisplay = $newNorm ? date('d M Y', strtotime($newNorm)) : '(none)';
                                $changedLines[] = "• <b>{$label}:</b> {$oldDisplay} → {$newDisplay}";
                                continue;
                            }

                            // Numeric currency fields
                            if (in_array($field, ['base_room_rent', 'advance_paid'])) {
                                $oldFloat = floatval($oldVal ?? 0);
                                $newFloat = floatval($newVal ?? 0);
                                if (abs($oldFloat - $newFloat) < 0.01) continue;
                                $oldDisplay = '₹' . number_format($oldFloat, 2);
                                $newDisplay = '₹' . number_format($newFloat, 2);
                                $changedLines[] = "• <b>{$label}:</b> {$oldDisplay} → {$newDisplay}";
                                continue;
                            }

                            // Integer count fields
                            if ($field === 'no_of_guests') {
                                $oldInt = intval($oldVal ?? 0);
                                $newInt = intval($newVal ?? 0);
                                if ($oldInt === $newInt) continue;
                                $changedLines[] = "• <b>{$label}:</b> {$oldInt} → {$newInt}";
                                continue;
                            }

                            // Boolean fields
                            if ($field === 'is_foreign_guest') {
                                $oldBool = !empty($oldVal) ? 1 : 0;
                                $newBool = !empty($newVal) ? 1 : 0;
                                if ($oldBool === $newBool) continue;
                                $oldDisplay = $oldBool ? 'Yes' : 'No';
                                $newDisplay = $newBool ? 'Yes' : 'No';
                                $changedLines[] = "• <b>{$label}:</b> {$oldDisplay} → {$newDisplay}";
                                continue;
                            }

                            // General string / text fields
                            $oldStr = trim((string)($oldVal ?? ''));
                            $newStr = trim((string)($newVal ?? ''));
                            if ($oldStr === $newStr) continue;
                            $oldDisplay = $oldStr !== '' ? $oldStr : '(none)';
                            $newDisplay = $newStr !== '' ? $newStr : '(none)';
                            $changedLines[] = "• <b>{$label}:</b> {$oldDisplay} → {$newDisplay}";
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
                    // Must roll back explicitly - an open transaction here would keep
                    // holding the room lock taken above until the connection closed,
                    // stalling every other booking attempt for that room.
                    if ($pdo->inTransaction()) {
                        $pdo->rollBack();
                    }
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
                    $lookupStmt = $pdo->prepare("SELECT room_id, checkin_date, expected_checkout FROM guests WHERE id = ? AND property_id = ?");
                    $lookupStmt->execute([$guestId, $propertyId]);
                    $guestRow = $lookupStmt->fetch(PDO::FETCH_ASSOC);

                    $stmt = $pdo->prepare("DELETE FROM guests WHERE id = ? AND property_id = ?");
                    $stmt->execute([$guestId, $propertyId]);
                    if ($stmt->rowCount() > 0) {
                        if ($guestRow && !empty($guestRow['checkin_date']) && !empty($guestRow['expected_checkout'])) {
                            if (is_file(__DIR__ . '/../channex/outbox.php')) {
                                require_once __DIR__ . '/../channex/outbox.php';
                            }
                            if (function_exists('enqueueOutboxItem')) {
                                $roomId = !empty($guestRow['room_id']) ? (int)$guestRow['room_id'] : null;
                                enqueueOutboxItem($pdo, (int)$propertyId, $roomId, 'availability', $guestRow['checkin_date'], $guestRow['expected_checkout'], [
                                    'action' => 'delete_guest',
                                    'guest_id' => $guestId,
                                ]);
                            }
                        }
                        echo json_encode(['status' => 'success', 'message' => 'Booking deleted successfully']);

                        // Channel Manager Outbox (31 Aug 2026): see add_guest's own
                        // comment above - nothing was draining these enqueued rows
                        // automatically.
                        if (function_exists('triggerEventDrivenChannexDrain')) {
                            triggerEventDrivenChannexDrain($pdo);
                        }
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
                    $result = performGuestCheckout($pdo, $guestId, $propertyId);
                    if (!$result['success']) {
                        http_response_code(404);
                        echo json_encode(['status' => 'error', 'message' => $result['message']]);
                        break;
                    }
                    echo json_encode(['status' => 'success', 'message' => 'Guest checked out successfully']);
                } catch (PDOException $e) {
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to check out guest: ' . $e->getMessage()]);
                }
            }
            break;

        case 'checkin_guest':
            if ($request_method === 'POST') {
                ensureComplianceSchema($pdo);
                $input = json_decode(file_get_contents('php://input'), true);
                $guestId = validateGuestIdOrRespond($input['id'] ?? null);
                if ($guestId === null) break;
                try {
                    $result = performGuestCheckin($pdo, $guestId, $propertyId);
                    if (!$result['success']) {
                        http_response_code(404);
                        echo json_encode(['status' => 'error', 'message' => $result['message']]);
                        break;
                    }
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
                    $filed = !array_key_exists('filed', $input) || !empty($input['filed']);
                    $cFormNumber = isset($input['c_form_number']) ? trim((string)$input['c_form_number']) : (isset($input['cFormNumber']) ? trim((string)$input['cFormNumber']) : null);
                    // Set via a separate upload_document.php POST (folder=c_form) BEFORE
                    // this save fires - see uploadDocumentDB()/markCFormFiled() in api.ts.
                    // Deliberately only forwarded to Telegram from here, not at upload
                    // time, so nothing gets sent to the group until the C-Form save
                    // actually goes through (a selected-then-abandoned upload sends
                    // nothing).
                    $documentUrl = isset($input['c_form_document_url']) ? trim((string)$input['c_form_document_url']) : null;
                    $filedAt = $filed ? date('Y-m-d H:i:s') : null;

                    $stmt = $pdo->prepare("UPDATE guests SET c_form_filed_at = ?, c_form_number = ?, c_form_document_url = ? WHERE id = ? AND property_id = ?");
                    $stmt->execute([$filedAt, $filed ? $cFormNumber : null, $filed ? $documentUrl : null, $guestId, $propertyId]);

                    // Respond to the client NOW, before the Telegram send below - found
                    // 24 Aug 2026, reported as "Save C-Form button taking unusually long".
                    // sendPropertyTelegramPhoto() below uploads the actual attached file
                    // (a scanned PDF/photo, sometimes several MB) to api.telegram.org as
                    // part of THIS same request - unlike every other Telegram notification
                    // in this app (plain-text messages, near-instant), a real file upload
                    // over Telegram's Bot API can legitimately take several seconds, and
                    // the frontend's `await markCFormFiled()` was blocked on the entire
                    // thing before this fix, even though the save itself (the UPDATE
                    // above) had already fully succeeded. The DB write is already
                    // committed by this point, so it's safe to tell the client "success"
                    // and let the notification finish in the background - this mirrors
                    // the existing project convention of never letting a Telegram/
                    // WhatsApp send gate a business operation (see the ledger-posting
                    // note in CLAUDE.md), just applied to the HTTP response itself
                    // instead of a DB transaction.
                    echo json_encode([
                        'status' => 'success',
                        'message' => $filed ? 'C-Form marked as filed' : 'C-Form marked as not filed',
                        'data' => [
                            'c_form_filed_at' => $filedAt,
                            'c_form_filed' => $filed,
                            'c_form_number' => $cFormNumber,
                            'c_form_document_url' => $filed ? $documentUrl : null
                        ]
                    ]);
                    if (function_exists('fastcgi_finish_request')) {
                        // PHP-FPM: actually closes the client connection now: the rest of
                        // this request keeps running server-side, but the browser's fetch()
                        // resolves immediately instead of waiting on it.
                        fastcgi_finish_request();
                    } else {
                        // mod_php/CLI dev server fallback (no true fastcgi_finish_request):
                        // flush what's buffered so far. Doesn't close the TCP connection
                        // the way fastcgi_finish_request() does, but browsers resolve
                        // fetch()/XHR as soon as the response body they asked for has fully
                        // arrived, so this still unblocks the frontend the same way in
                        // practice - Content-Length isn't set, so nothing here changes if a
                        // given SAPI can't flush early; it just falls back to the old
                        // (slower but correct) blocking behavior.
                        ignore_user_abort(true);
                        if (ob_get_level() > 0) { @ob_end_flush(); }
                        @flush();
                    }

                    // Send Telegram notification when C-Form is saved - now happens AFTER
                    // the client has already gotten its response (see above).
                    if ($filed) {
                        try {
                            $gStmt = $pdo->prepare("SELECT guest_name FROM guests WHERE id = ? AND property_id = ?");
                            $gStmt->execute([$guestId, $propertyId]);
                            $guestName = $gStmt->fetchColumn() ?: 'Guest';

                            require_once __DIR__ . '/../telegram/sender.php';
                            require_once __DIR__ . '/../telegram/templates.php';

                            $cNumText = !empty($cFormNumber) ? $cFormNumber : '(none)';
                            $editMsg = TelegramTemplates::render($pdo, 'booking_updated', [
                                'guest_name'   => $guestName,
                                'booking_id'   => $guestId,
                                'changes_list' => "• <b>C-Form Status:</b> Filed (No: {$cNumText})",
                            ]);

                            // If a Form 'C' confirmation was uploaded with this save,
                            // send THAT (with the same text as its caption) instead of
                            // a separate bare text message - one notification per
                            // event, not two, and the file is the actually-useful part.
                            $sentWithDocument = false;
                            if (!empty($documentUrl) && preg_match('#/php/uploads/(.+)$#', $documentUrl, $m)) {
                                $absPath = __DIR__ . '/../uploads/' . $m[1];
                                if (file_exists($absPath)) {
                                    $ext = strtolower(pathinfo($absPath, PATHINFO_EXTENSION));
                                    $fileType = ($ext === 'pdf') ? 'document' : 'photo';
                                    $result = sendPropertyTelegramPhoto($pdo, $propertyId, 'admin', [$absPath], $editMsg, 'c_form_filed', [$fileType]);
                                    $sentWithDocument = is_array($result) && empty($result['skipped']);
                                }
                            }
                            if (!$sentWithDocument) {
                                sendPropertyTelegramMessage($pdo, $propertyId, 'admin', $editMsg);
                            }
                        } catch (Exception $e) {
                            error_log("Failed to send C-Form Telegram notification: " . $e->getMessage());
                        }
                    }
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
                    $guestIndex = InputValidator::validateInteger($input['guest_index'] ?? null, 0, 100);
                } catch (Exception $e) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'guest_index must be an integer between 0 and 100']);
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
                $required = 1;
                $docsStmt = $pdo->prepare("SELECT file_path FROM guest_id_documents WHERE guest_id = ? AND property_id = ?");
                $docsStmt->execute([$guestId, $propertyId]);
                $docPaths = $docsStmt->fetchAll(PDO::FETCH_COLUMN);
                $uploadedCount = count($docPaths);
                if ($uploadedCount < $required) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => "At least {$required} ID document is required"]);
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
