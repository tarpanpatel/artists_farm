<?php
/**
 * Provision Non-Refundable and Weekend Special rate plans under 3041823d-4456-4068-a9b1-bb3f7b8a2662
 */
chdir('c:/xampp/htdocs/artists_farm');
require_once 'php/channex/ChannexClient.php';

$client = new ChannexClient();
$propId = '3041823d-4456-4068-a9b1-bb3f7b8a2662';
$roomTypeId = '28c503f9-b920-4c2e-a29f-76b5e3b2990c';

echo "=== 1. Checking Existing Rate Plans for {$propId} ===\n";
$existing = $client->get('rate_plans', ['filter[property_id]' => $propId]);
foreach ($existing['data'] ?? [] as $rp) {
    echo " - [{$rp['id']}] '{$rp['attributes']['title']}' (currency: {$rp['attributes']['currency']})\n";
}

// 2. Provision Non-Refundable
$rpNonRefPayload = [
    'rate_plan' => [
        'property_id' => $propId,
        'room_type_id' => $roomTypeId,
        'title' => 'Non-Refundable',
        'currency' => 'INR',
        'sell_mode' => 'per_room',
        'rate_mode' => 'manual',
        'options' => [
            [
                'occupancy' => 2,
                'is_primary' => true,
                'rate' => '3150.00',
            ]
        ]
    ]
];
echo "\n=== 2. Provisioning 'Non-Refundable' Rate Plan ===\n";
$res1 = $client->post('rate_plans', $rpNonRefPayload);
echo "HTTP " . ($res1['http_code'] ?? 0) . " - Result: " . json_encode($res1['data']['id'] ?? $res1['error'] ?? $res1) . "\n";
$nrfId = $res1['data']['id'] ?? null;

// 3. Provision Weekend Special
$rpWkdPayload = [
    'rate_plan' => [
        'property_id' => $propId,
        'room_type_id' => $roomTypeId,
        'title' => 'Weekend Special',
        'currency' => 'INR',
        'sell_mode' => 'per_room',
        'rate_mode' => 'manual',
        'options' => [
            [
                'occupancy' => 2,
                'is_primary' => true,
                'rate' => '4200.00',
            ]
        ]
    ]
];
echo "\n=== 3. Provisioning 'Weekend Special' Rate Plan ===\n";
$res2 = $client->post('rate_plans', $rpWkdPayload);
echo "HTTP " . ($res2['http_code'] ?? 0) . " - Result: " . json_encode($res2['data']['id'] ?? $res2['error'] ?? $res2) . "\n";
$wkdId = $res2['data']['id'] ?? null;

echo "\n=== 4. Verifying All Rate Plans for {$propId} (GET /rate_plans) ===\n";
$final = $client->get('rate_plans', ['filter[property_id]' => $propId]);
foreach ($final['data'] ?? [] as $rp) {
    echo " - [{$rp['id']}] '{$rp['attributes']['title']}' (currency: {$rp['attributes']['currency']})\n";
}
