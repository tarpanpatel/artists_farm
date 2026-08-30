<?php
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/channex/ChannexClient.php';

$cfg = json_decode(file_get_contents('php/config/channex_config.json'), true);
$client = new ChannexClient();
$PROP = '4286428a-5561-4508-bd28-1f9ae55d8795';
$RT = '4ca732c0-6f4f-457c-9c48-396f3d784590';
$RP = '2d0dfacb-0239-4ec9-9eba-f6962ff3ecd8';

$code = 'TEST-CAN-' . rand(1000, 9999);

echo "1. Creating test booking for cancellation probe...\n";
$createPayload = [
    'booking' => [
        'property_id' => $PROP,
        'ota_name' => 'Offline',
        'ota_reservation_code' => $code,
        'arrival_date' => '2027-04-10',
        'departure_date' => '2027-04-13',
        'payment_collect' => 'property',
        'currency' => 'USD',
        'customer' => ['name' => 'Cancel', 'surname' => 'Probe', 'mail' => 'cancel@example.com', 'phone' => '+1234567890'],
        'rooms' => [[
            'room_type_id' => $RT,
            'rate_plan_id' => $RP,
            'days' => ['2027-04-10' => '120.00', '2027-04-11' => '120.00', '2027-04-12' => '120.00'],
            'occupancy' => ['adults' => 2, 'children' => 0, 'infants' => 0],
        ]],
    ]
];

$resCreate = $client->post('bookings', $createPayload);
echo "   Create HTTP: " . ($resCreate['http_code'] ?? 0) . "\n";
$bookingId = $resCreate['data']['id'] ?? null;
$revId1 = $resCreate['data']['attributes']['revision_id'] ?? null;
echo "   Booking ID: {$bookingId}, Rev 1: {$revId1}\n";

if (!$bookingId) {
    echo "Failed to create booking: " . json_encode($resCreate) . "\n";
    exit(1);
}

// Ack Rev 1 so feed stays clean
$client->post("booking_revisions/{$revId1}/ack", []);

echo "\n2. Testing cancellation via PUT /bookings/{$bookingId} with full shape + status: cancelled...\n";
$cancelPayload = [
    'booking' => [
        'status' => 'cancelled',
        'property_id' => $PROP,
        'ota_name' => 'Offline',
        'ota_reservation_code' => $code,
        'arrival_date' => '2027-04-10',
        'departure_date' => '2027-04-13',
        'payment_collect' => 'property',
        'currency' => 'USD',
        'customer' => ['name' => 'Cancel', 'surname' => 'Probe', 'mail' => 'cancel@example.com', 'phone' => '+1234567890'],
        'rooms' => [[
            'room_type_id' => $RT,
            'rate_plan_id' => $RP,
            'days' => ['2027-04-10' => '120.00', '2027-04-11' => '120.00', '2027-04-12' => '120.00'],
            'occupancy' => ['adults' => 2, 'children' => 0, 'infants' => 0],
        ]],
    ]
];

$resCancel = $client->put("bookings/{$bookingId}", $cancelPayload);
echo "   Cancel HTTP: " . ($resCancel['http_code'] ?? 0) . "\n";
echo "   Cancel response: " . json_encode($resCancel['raw'] ?? $resCancel) . "\n";

$resGet = $client->get("bookings/{$bookingId}");
$getAttrs = $resGet['data']['attributes'] ?? [];
$revId2 = $getAttrs['revision_id'] ?? null;
$status = $getAttrs['status'] ?? null;
echo "   After cancel GET: Status={$status}, Rev 2={$revId2}\n";

if ($revId2) {
    $client->post("booking_revisions/{$revId2}/ack", []);
}

if ($revId2 && $revId2 !== $revId1 && $status === 'cancelled') {
    echo "=== SUCCESS: New distinct revision ID generated on cancellation! ===\n";
} else {
    echo "=== FAILED to produce distinct cancellation revision ===\n";
}
