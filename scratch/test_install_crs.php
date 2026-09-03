<?php
require_once __DIR__ . '/../php/config/database.php';
require_once __DIR__ . '/../php/channex/ChannexClient.php';

$client = new ChannexClient();
$propId = '4286428a-5561-4508-bd28-1f9ae55d8795';

echo "=== Attempting to Install Booking CRS Application ===\n";

$payload = [
    'application_installation' => [
        'property_id' => $propId,
        'application_code' => 'booking_crs'
    ]
];

$res = $client->post('applications/install', $payload);
echo "POST /applications/install HTTP: " . ($res['http_code'] ?? 0) . "\n";
echo "Response: " . json_encode($res['raw'] ?? $res) . "\n";
