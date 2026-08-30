<?php
require_once __DIR__ . '/../php/config/database.php';
require_once __DIR__ . '/../php/channex/ChannexClient.php';

$client = new ChannexClient();
$propId = '4286428a-5561-4508-bd28-1f9ae55d8795';
$roomTypeId = '4ca732c0-6f4f-457c-9c48-396f3d784590';
$ratePlanId = '2d0dfacb-0239-4ec9-9eba-f6962ff3ecd8';

echo "=== Testing POST /bookings after installing Booking CRS app ===\n";

$payload = [
    'booking' => [
        'property_id' => $propId,
        'ota_reservation_code' => 'TEST-' . rand(1000, 9999),
        'ota_name' => 'Offline',
        'arrival_date' => '2026-11-25',
        'departure_date' => '2026-11-27',
        'payment_collect' => 'property',
        'currency' => 'USD',
        'customer' => [
            'name' => 'John',
            'surname' => 'Doe',
            'mail' => 'john.doe@example.com',
            'phone' => '+1234567890'
        ],
        'rooms' => [
            [
                'room_type_id' => $roomTypeId,
                'rate_plan_id' => $ratePlanId,
                'days' => [
                    '2026-11-25' => '100.00',
                    '2026-11-26' => '100.00'
                ],
                'occupancy' => [
                    'adults' => 1,
                    'children' => 0,
                    'infants' => 0
                ]
            ]
        ]
    ]
];

$res = $client->post('bookings', $payload);
echo "POST /bookings HTTP: " . ($res['http_code'] ?? 0) . "\n";
echo "Response: " . json_encode($res['raw'] ?? $res) . "\n";
