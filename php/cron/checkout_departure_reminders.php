<?php
/**
 * Departure Day Reminder - Scheduled Task
 *
 * Run once daily, any time in the morning (e.g. 9am), same schedule slot as
 * checkin_verification_reminders.php:
 *   Linux/production cron:      0 9 * * * /usr/bin/php /path/to/artists_farm/php/cron/checkout_departure_reminders.php
 *   Windows/XAMPP Task Scheduler: schtasks /create /sc daily /st 09:00 /tn "ArtistsFarm Checkout Departure Reminder" ^
 *                                   /tr "C:\xampp\php\php.exe C:\xampp\htdocs\artists_farm\php\cron\checkout_departure_reminders.php"
 *
 * Finds bookings that are still 'Checked In' whose expected_checkout date has
 * arrived (or passed) and haven't already been reminded today, then sends one
 * Telegram nudge per booking to the Admin group carrying the "Mark Checked-
 * Out" action button (checkout_guest_{id}, handled in webhook_handler.php via
 * checkoutGuestViaTelegram() in guests.php). Mirrors
 * checkin_verification_reminders.php's structure and dedupe approach exactly.
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/guest_status.php';
require_once __DIR__ . '/../guests/guests.php';
require_once __DIR__ . '/../telegram/sender.php';
require_once __DIR__ . '/../telegram/templates.php';

$logFile = __DIR__ . '/checkout_departure_reminders.log';
$timestamp = date('Y-m-d H:i:s');

function logLine(string $file, string $message): void {
    file_put_contents($file, "$message\n", FILE_APPEND);
}

logLine($logFile, "$timestamp - Checkout departure reminder worker started");

try {
    ensureGuestTelegramCheckinoutSchema($pdo);

    $stmt = $pdo->prepare("
        SELECT g.id, g.property_id, g.guest_name, g.expected_checkout,
               COALESCE(r.name, 'Unassigned') as room_name
        FROM guests g
        LEFT JOIN properties r ON g.room_id = r.id
        WHERE g.status = ?
          AND DATE(g.expected_checkout) <= CURDATE()
          AND (g.checkout_reminder_last_sent_at IS NULL OR DATE(g.checkout_reminder_last_sent_at) < CURDATE())
    ");
    $stmt->execute([GUEST_STATUS_CHECKED_IN]);
    $dueGuests = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($dueGuests)) {
        logLine($logFile, "$timestamp - No departures due for a reminder");
    }

    foreach ($dueGuests as $guest) {
        $message = TelegramTemplates::render($pdo, 'checkout_day_reminder', [
            'guest_name' => $guest['guest_name'],
            'room_name' => $guest['room_name'],
            'checkout_date' => $guest['expected_checkout'],
        ]);

        $replyMarkup = ['inline_keyboard' => [[
            ['text' => '🚪 Mark Checked-Out', 'callback_data' => "checkout_guest_{$guest['id']}"]
        ]]];

        // Explicit booking_id (5 Sep 2026, same fix as checkin_verification_reminders.php) -
        // this template's text has no real numeric id anywhere in it for the regex-based
        // fallback in appendAppUrlToMessage() to find, so its "Open in App" link was always
        // landing on the generic Bookings tab instead of this specific guest.
        $result = sendPropertyTelegramMessage($pdo, $guest['property_id'], 'admin', $message, $replyMarkup, 'checkout_day_reminder', ['booking_id' => $guest['id']]);

        $label = "guest #{$guest['id']} ({$guest['guest_name']}, {$guest['room_name']}, property {$guest['property_id']})";
        $decoded = is_string($result) ? json_decode($result, true) : null;
        if (!empty($decoded['ok']) && !empty($decoded['result'])) {
            $pdo->prepare("UPDATE guests SET telegram_checkout_chat_id = ?, telegram_checkout_message_id = ?, checkout_reminder_last_sent_at = NOW() WHERE id = ?")
                ->execute([$decoded['result']['chat']['id'], $decoded['result']['message_id'], $guest['id']]);
            logLine($logFile, "$timestamp - REMINDED: $label");
        } elseif (is_array($result) && !empty($result['skipped'])) {
            // Telegram not configured/enabled for this property - still stamp
            // the reminder timestamp so this doesn't retry every single run.
            $pdo->prepare("UPDATE guests SET checkout_reminder_last_sent_at = NOW() WHERE id = ?")->execute([$guest['id']]);
            logLine($logFile, "$timestamp - SKIPPED: $label - " . $result['reason']);
        } else {
            logLine($logFile, "$timestamp - FAILED to send: $label");
        }
    }

    logLine($logFile, "$timestamp - Reminder worker completed (" . count($dueGuests) . " booking(s) processed)");
} catch (Exception $e) {
    logLine($logFile, "$timestamp - FATAL: " . $e->getMessage());
}
