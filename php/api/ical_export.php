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

        $stmt = $pdo->prepare("SELECT DATE(checkin_date) as start_date, DATE(expected_checkout) as end_date, status, guest_name FROM guests WHERE room_id = :room_id AND checkin_date IS NOT NULL AND status != 'Cancelled'");
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

        $stmt = $pdo->prepare("SELECT DATE(checkin_date) as start_date, DATE(expected_checkout) as end_date, status, guest_name FROM guests WHERE property_id = :property_id AND checkin_date IS NOT NULL AND status != 'Cancelled'");
        $stmt->execute([':property_id' => $propertyId]);
        $bookings = $stmt->fetchAll();
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
            $eventId = md5($propertyId . $booking['start_date'] . $booking['end_date']);

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

