<?php
/**
 * Next-Morning Pending ID Verification Reminder - Scheduled Task
 *
 * Run once daily, any time after checkout (e.g. 9am):
 *   Linux/production cron:      0 9 * * * /usr/bin/php /path/to/artists_farm/php/cron/checkin_verification_reminders.php
 *   Windows/XAMPP Task Scheduler: schtasks /create /sc daily /st 09:00 /tn "ArtistsFarm ID Verification Reminder" ^
 *                                   /tr "C:\xampp\php\php.exe C:\xampp\htdocs\artists_farm\php\cron\checkin_verification_reminders.php"
 *
 * Finds bookings that checked in before today, are still marked
 * id_verification_status = 'Pending', and haven't already been reminded
 * today, then sends one Telegram nudge per booking to the Admin group.
 * Staff resolve it from the app's existing "Complete Check-in" flow, which
 * flips id_verification_status to Complete and naturally stops the reminder.
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/guest_status.php';
require_once __DIR__ . '/../guests/guests.php';
require_once __DIR__ . '/../telegram/sender.php';
require_once __DIR__ . '/../telegram/templates.php';

$logFile = __DIR__ . '/checkin_verification_reminders.log';
$timestamp = date('Y-m-d H:i:s');

function logLine(string $file, string $message): void {
    file_put_contents($file, "$message\n", FILE_APPEND);
}

logLine($logFile, "$timestamp - Check-in verification reminder worker started");

try {
    ensureIdVerificationSchema($pdo);

    // Temp-storage TTL: sweep ID-document files (and their DB rows) past the
    // 24h window so completed/stale uploads never linger on disk. The upload
    // endpoint also sweeps opportunistically; this guarantees it even when no
    // new upload happens after a booking that never got completed.
    $swept = cleanupExpiredIdDocuments($pdo);
    if ($swept > 0) {
        logLine($logFile, "$timestamp - Swept {$swept} expired ID-document file(s)/row(s) older than 24h");
    }

    $stmt = $pdo->prepare("
        SELECT g.id, g.property_id, g.guest_name, g.no_of_guests, g.checkin_date,
               COALESCE(r.name, 'Unassigned') as room_name
        FROM guests g
        LEFT JOIN properties r ON g.room_id = r.id
        WHERE g.id_verification_status = 'Pending'
          AND g.status NOT IN (?, ?)
          AND g.checkin_date < CURDATE()
          AND (g.id_verification_last_reminder_at IS NULL OR DATE(g.id_verification_last_reminder_at) < CURDATE())
    ");
    // Excludes both checkout spellings - guests.php's checkout paths now always
    // write the canonical GUEST_STATUS_CHECKED_OUT ('Checked Out'), but the
    // legacy 'CheckedOut' (no space) spelling can still exist on older rows.
    // Filtering on only one would either miss old rows or (worse, going
    // forward) send a "pending ID verification" nudge for every guest who
    // checks out today, since none of them will ever get the legacy spelling
    // again.
    $stmt->execute([GUEST_STATUS_CHECKED_OUT, GUEST_STATUS_CHECKEDOUT_LEGACY]);
    $pendingGuests = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($pendingGuests)) {
        logLine($logFile, "$timestamp - No pending verifications to remind");
    }

    foreach ($pendingGuests as $guest) {
        $required = max(1, intval($guest['no_of_guests'] ?? 1));
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM guest_id_documents WHERE guest_id = ? AND property_id = ?");
        $countStmt->execute([$guest['id'], $guest['property_id']]);
        $uploadedCount = intval($countStmt->fetchColumn());

        $message = TelegramTemplates::render($pdo, 'checkin_verification_reminder', [
            'guest_name' => $guest['guest_name'],
            'room_name' => $guest['room_name'],
            'uploaded_count' => $uploadedCount,
            'required_count' => $required,
            'checkin_date' => $guest['checkin_date'],
        ]);

        // Explicit booking_id (5 Sep 2026, live report: "Open in App" only ever landed on
        // the generic Bookings tab) - this template never prints the guest's real numeric
        // id anywhere in its text (see appendAppUrlToMessage()'s own comment), so the
        // regex-based id scraping there had nothing to find. Passed explicitly instead.
        $result = sendPropertyTelegramMessage($pdo, $guest['property_id'], 'admin', $message, null, 'checkin_verification_reminder', ['booking_id' => $guest['id']]);

        $pdo->prepare("UPDATE guests SET id_verification_last_reminder_at = NOW() WHERE id = ?")->execute([$guest['id']]);

        $label = "guest #{$guest['id']} ({$guest['guest_name']}, {$guest['room_name']}, property {$guest['property_id']})";
        if (is_array($result) && !empty($result['skipped'])) {
            logLine($logFile, "$timestamp - SKIPPED: $label - " . $result['reason']);
        } else {
            logLine($logFile, "$timestamp - REMINDED: $label - {$uploadedCount}/{$required} uploaded");
        }
    }

    logLine($logFile, "$timestamp - Reminder worker completed (" . count($pendingGuests) . " booking(s) processed)");
} catch (Exception $e) {
    logLine($logFile, "$timestamp - FATAL: " . $e->getMessage());
}
