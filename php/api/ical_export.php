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
    // Get property by slug
    $stmt = $pdo->prepare("SELECT id, name FROM properties WHERE slug = :slug AND is_active = 1 LIMIT 1");
    $stmt->execute([':slug' => $propertySlug]);
    $property = $stmt->fetch();

    if (!$property) {
        http_response_code(404);
        die('Property not found');
    }

    $propertyId = $property['id'];
    $propertyName = $property['name'];

    // Get all bookings/reservations for this property
    // Try different table names as bookings might be stored in different tables
    $bookings = [];

    $possibleTables = [
        'SELECT DATE(check_in) as start_date, DATE(check_out) as end_date, status FROM guests WHERE property_id = :property_id AND check_in IS NOT NULL',
        'SELECT DATE(start_date) as start_date, DATE(end_date) as end_date, status FROM bookings WHERE property_id = :property_id',
        'SELECT DATE(created_at) as start_date, DATE(created_at) as end_date, status FROM reservations WHERE property_id = :property_id'
    ];

    foreach ($possibleTables as $query) {
        try {
            $stmt = $pdo->prepare($query);
            $stmt->execute([':property_id' => $propertyId]);
            $bookings = $stmt->fetchAll();
            if (!empty($bookings)) break;
        } catch (Exception $e) {
            // Table doesn't exist, try next one
            continue;
        }
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
            $ical .= "DTSTART;VALUE=DATE:" . date('Ymd', $startDate) . "\r\n";
            $ical .= "DTEND;VALUE=DATE:" . date('Ymd', $endDate + 86400) . "\r\n";
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

