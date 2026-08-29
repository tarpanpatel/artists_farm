<?php
/**
 * iCal Export API
 * Generates iCal feed for property availability
 */

require_once __DIR__ . '/../config/database.php';

// Get property slug from query
$propertySlug = $_GET['property'] ?? '';

if (empty($propertySlug)) {
    http_response_code(400);
    die('Property slug required');
}

try {
    $roomSlug = $_GET['room'] ?? '';

    $bookings = [];
    $propertyId = 0;
    $propertyName = '';

    if (!empty($roomSlug)) {
        $stmt = $pdo->prepare("
            SELECT r.id, r.name 
            FROM properties r 
            JOIN properties p ON r.parent_property_id = p.id 
            WHERE p.slug = :pslug AND r.slug = :rslug AND r.is_active = 1 
            LIMIT 1
        ");
        $stmt->execute([':pslug' => $propertySlug, ':rslug' => $roomSlug]);
        $room = $stmt->fetch();

        if (!$room) {
            http_response_code(404);
            die('Room not found');
        }

        $propertyId = $room['id'];
        $propertyName = $room['name'];

        $stmt = $pdo->prepare("SELECT id, DATE(checkin_date) as start_date, DATE(expected_checkout) as end_date, status, guest_name FROM guests WHERE room_id = :room_id AND checkin_date IS NOT NULL AND status != 'Cancelled'");
        $stmt->execute([':room_id' => $propertyId]);
        $bookings = $stmt->fetchAll();
    } else {
        $stmt = $pdo->prepare("SELECT id, name FROM properties WHERE slug = :slug AND is_active = 1 LIMIT 1");
        $stmt->execute([':slug' => $propertySlug]);
        $property = $stmt->fetch();

        if (!$property) {
            http_response_code(404);
            die('Property not found');
        }

        $propertyId = $property['id'];
        $propertyName = $property['name'];

        $stmt = $pdo->prepare("SELECT id, DATE(checkin_date) as start_date, DATE(expected_checkout) as end_date, status, guest_name FROM guests WHERE property_id = :property_id AND checkin_date IS NOT NULL AND status != 'Cancelled'");
        $stmt->execute([':property_id' => $propertyId]);
        $bookings = $stmt->fetchAll();
    }

    // Unconverted OTA holds must be re-published too (added 30 Aug 2026).
    // This feed used to export ONLY the guests table, so a night sold on
    // Airbnb and synced in as a calendar block - but not yet clicked through
    // "Convert to Booking" - was still advertised to every OTHER channel as
    // available. That is not a race that occasionally bites: until someone
    // performs that manual conversion, Booking.com et al are told the room is
    // free 100% of the time, and can legitimately sell the same night. The
    // whole point of this feed is "these dates are taken", and an OTA hold is
    // exactly that regardless of whether staff have processed it yet.
    // Excludes holds already converted (the guests row above covers those,
    // and exporting both would emit a duplicate VEVENT for one stay) and
    // anything already in the past.
    try {
        $blockStmt = $pdo->prepare("
            SELECT e.external_event_id,
                   DATE(e.event_start) as start_date,
                   DATE(e.event_end) as end_date
            FROM ical_synced_events e
            JOIN ical_sync_configs c ON e.sync_config_id = c.id
            WHERE c.property_id = :pid
              AND e.sync_status = 'synced'
              AND e.event_end >= CURDATE()
              AND NOT EXISTS (
                  SELECT 1 FROM guests g
                  WHERE g.ical_external_event_id = e.external_event_id
                    AND (g.room_id = c.property_id OR g.property_id = c.property_id)
                    AND g.status != 'Cancelled'
              )
        ");
        $blockStmt->execute([':pid' => $propertyId]);
        foreach ($blockStmt->fetchAll() as $blk) {
            $blk['is_ota_block'] = true;
            $bookings[] = $blk;
        }
    } catch (PDOException $eBlocks) {
        // A missing/empty sync table must never break the whole feed - an OTA
        // that gets a 500 here would fall back to treating everything as free,
        // which is strictly worse than publishing just the direct bookings.
    }

    // Generate iCal format
    $ical = "BEGIN:VCALENDAR\r\n";
    $ical .= "VERSION:2.0\r\n";
    $ical .= "PRODID:-//Ground Code//iCal Sync//EN\r\n";
    $ical .= "CALSCALE:GREGORIAN\r\n";
    $ical .= "METHOD:PUBLISH\r\n";
    $ical .= "X-WR-CALNAME:$propertyName Availability\r\n";
    $ical .= "X-WR-TIMEZONE:Asia/Kolkata\r\n";
    $ical .= "BEGIN:VTIMEZONE\r\n";
    $ical .= "TZID:Asia/Kolkata\r\n";
    $ical .= "BEGIN:STANDARD\r\n";
    $ical .= "TZOFFSETFROM:+0530\r\n";
    $ical .= "TZOFFSETTO:+0530\r\n";
    $ical .= "TZNAME:IST\r\n";
    $ical .= "DTSTART:19700101T000000\r\n";
    $ical .= "END:STANDARD\r\n";
    $ical .= "END:VTIMEZONE\r\n";

    // Add events for booked dates
    if ($bookings) {
        foreach ($bookings as $booking) {
            $startDate = strtotime($booking['start_date']);
            $endDate = strtotime($booking['end_date']);
            // UID must be unique PER BOOKING, not per date range (fixed 30 Aug
            // 2026). It was md5(propertyId + start + end), so two different
            // stays that happen to share the same dates - two rooms booked for
            // the same nights on a whole-property feed, or a direct booking
            // sitting alongside an OTA hold - produced an IDENTICAL UID, and
            // iCal consumers dedupe by UID, so one of them silently vanished
            // from the feed and its nights were advertised as free.
            $uidSeed = !empty($booking['is_ota_block'])
                ? 'ota-' . ($booking['external_event_id'] ?? '')
                : 'guest-' . ($booking['id'] ?? '');
            $eventId = md5($propertyId . '|' . $uidSeed . '|' . $booking['start_date'] . '|' . $booking['end_date']);

            $ical .= "BEGIN:VEVENT\r\n";
            $ical .= "UID:$eventId@artistsfarm.local\r\n";
            // iCal all-day (VALUE=DATE) events use an EXCLUSIVE end date, so
            // DTEND should be the checkout date itself - the guest is gone by
            // then and the room is free for a new arrival. The +86400 here
            // was blocking one extra night past every actual checkout
            // (confirmed against real data: a checkout of 22/07 was exported
            // as DTEND 23/07), which would make any OTA subscribed to this
            // feed wrongly reject legitimate same-day-turnover bookings.
            $ical .= "DTSTART;VALUE=DATE:" . date('Ymd', $startDate) . "\r\n";
            $ical .= "DTEND;VALUE=DATE:" . date('Ymd', $endDate) . "\r\n";
            $ical .= "SUMMARY:Booked - " . $propertyName . "\r\n";
            $ical .= "DESCRIPTION:Property is booked for " . $propertyName . "\r\n";
            $ical .= "STATUS:CONFIRMED\r\n";
            $ical .= "TRANSP:OPAQUE\r\n";
            $ical .= "DTSTAMP:" . date('Ymd\THis\Z') . "\r\n";
            $ical .= "CREATED:" . date('Ymd\THis\Z') . "\r\n";
            $ical .= "LAST-MODIFIED:" . date('Ymd\THis\Z') . "\r\n";
            $ical .= "END:VEVENT\r\n";
        }
    }

    $ical .= "END:VCALENDAR\r\n";

    // Set headers for iCal file download/display
    header('Content-Type: text/calendar; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . strtolower(str_replace(' ', '_', $propertyName)) . '_availability.ics"');
    header('Cache-Control: max-age=3600');

    echo $ical;

} catch (Exception $e) {
    http_response_code(500);
    echo 'Error generating calendar: ' . $e->getMessage();
}

