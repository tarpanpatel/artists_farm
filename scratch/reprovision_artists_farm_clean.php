<?php
/**
 * Clean Re-provisioning of Artists Farm Jaipur (Property 1)
 * Task 2 Implementation
 */
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/channex/ChannexClient.php';

$client = new ChannexClient();

echo "=== STEP 1: Create Channex Property 'Artists Farm Jaipur' ===\n";
$propPayload = [
    'property' => [
        'title' => 'Artists Farm Jaipur',
        'property_type' => 'villa',
        'currency' => 'INR',
        'timezone' => 'Asia/Kolkata',
        'country' => 'IN',
        'city' => 'Jaipur',
        'zip_code' => '302001',
    ]
];
$propRes = $client->post('properties', $propPayload);
echo "POST /properties Response: HTTP " . ($propRes['http_code'] ?? 0) . "\n";
if (!$propRes['success'] || empty($propRes['data']['id'])) {
    echo "FAILED to create property: " . json_encode($propRes) . "\n";
    exit(1);
}
$newPropId = $propRes['data']['id'];
echo "Created Channex Property ID: {$newPropId}\n\n";

echo "=== STEP 2: Create Channex Room Type ===\n";
$roomPayload = [
    'room_type' => [
        'property_id' => $newPropId,
        'title' => 'Artists Farm Jaipur',
        'count_of_rooms' => 1,
        'room_kind' => 'room',
        'capacity' => 6,
        'occ_adults' => 6,
        'occ_children' => 2,
        'occ_infants' => 2,
        'default_occupancy' => 2,
    ]
];
$roomRes = $client->post('room_types', $roomPayload);
echo "POST /room_types Response: HTTP " . ($roomRes['http_code'] ?? 0) . "\n";
if (!$roomRes['success'] || empty($roomRes['data']['id'])) {
    echo "FAILED to create room type: " . json_encode($roomRes) . "\n";
    exit(1);
}
$newRoomId = $roomRes['data']['id'];
echo "Created Channex Room Type ID: {$newRoomId}\n\n";

echo "=== STEP 3: Create Channex Rate Plan ===\n";
$ratePayload = [
    'rate_plan' => [
        'property_id' => $newPropId,
        'room_type_id' => $newRoomId,
        'title' => 'Standard Rate',
        'currency' => 'INR',
        'sell_mode' => 'per_room',
        'rate_mode' => 'manual',
        'options' => [
            [
                'occupancy' => 2,
                'is_primary' => true,
                'rate' => '3500.00',
            ]
        ]
    ]
];
$rateRes = $client->post('rate_plans', $ratePayload);
echo "POST /rate_plans Response: HTTP " . ($rateRes['http_code'] ?? 0) . "\n";
if (!$rateRes['success'] || empty($rateRes['data']['id'])) {
    echo "FAILED to create rate plan: " . json_encode($rateRes) . "\n";
    exit(1);
}
$newRateId = $rateRes['data']['id'];
echo "Created Channex Rate Plan ID: {$newRateId}\n\n";

echo "=== STEP 4: Update channex_mappings for Property 1 ===\n";
$upd = $pdo->prepare("
    UPDATE channex_mappings
    SET channex_property_id = ?,
        channex_room_type_id = ?,
        channex_rate_plan_id = ?,
        sync_status = 'active',
        last_synced_at = NOW()
    WHERE property_id = 1
");
$upd->execute([$newPropId, $newRoomId, $newRateId]);
echo "Updated channex_mappings row for property_id = 1.\n\n";

echo "=== Verification: channex_mappings Table Rows ===\n";
$mappings = $pdo->query("SELECT * FROM channex_mappings")->fetchAll(PDO::FETCH_ASSOC);
echo json_encode($mappings, JSON_PRETTY_PRINT) . "\n\n";

echo "=== Verification: GET /properties against Channex Staging ===\n";
$allProps = $client->get('properties', ['limit' => 50]);
echo "Total Properties in Sandbox: " . count($allProps['data'] ?? []) . "\n";
foreach ($allProps['data'] ?? [] as $p) {
    echo " - [{$p['id']}] Title: '{$p['attributes']['title']}' | Currency: {$p['attributes']['currency']} | City: {$p['attributes']['city']}\n";
}
