<?php
/**
 * Test live ARI push against newly provisioned Artists Farm Jaipur property
 * Asserts that the task is created under 3041823d-4456-4068-a9b1-bb3f7b8a2662
 */
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/channex/ChannexAdapter.php';
require_once 'php/channex/ChannexClient.php';

$client = new ChannexClient();
$adapter = new ChannexAdapter($pdo, $client);

echo "=== 1. Testing Availability Push to Property 1 ===\n";
$availDates = [
    [
        'property_id' => '3041823d-4456-4068-a9b1-bb3f7b8a2662',
        'room_type_id' => '28c503f9-b920-4c2e-a29f-76b5e3b2990c',
        'date_from' => '2026-11-01',
        'date_to' => '2026-11-05',
        'availability' => 1
    ]
];
$availRes = $adapter->pushAvailability(1, null, $availDates);
echo "Availability Push Response:\n" . json_encode($availRes, JSON_PRETTY_PRINT) . "\n";
$availTaskId = $availRes['task_id'] ?? ($availRes['data'][0]['id'] ?? null);

echo "\n=== 2. Fetching Availability Task Record from Channex Sandbox ===\n";
if ($availTaskId) {
    $availTask = $client->get("tasks/{$availTaskId}");
    echo "Availability Task Data:\n" . json_encode($availTask, JSON_PRETTY_PRINT) . "\n";
    $propInTask = $availTask['data']['attributes']['payload']['values'][0]['property_id'] ?? 'NONE';
    echo "Property ID recorded in Channex Task: {$propInTask}\n";
    $availMatches = ($propInTask === '3041823d-4456-4068-a9b1-bb3f7b8a2662');
    echo "Matches new Artists Farm Jaipur property: " . ($availMatches ? "YES (PASS)" : "NO (FAIL)") . "\n";
} else {
    echo "FAIL: No availability task ID\n";
}

echo "\n=== 3. Testing Restrictions Push to Property 1 ===\n";
$restrDates = [
    [
        'property_id' => '3041823d-4456-4068-a9b1-bb3f7b8a2662',
        'rate_plan_id' => 'b253a8d1-3319-4a68-bc4b-3ce8a8c4107a',
        'date_from' => '2026-11-01',
        'date_to' => '2026-11-05',
        'rate' => 3500.00,
        'min_stay_arrival' => 2
    ]
];
$restrRes = $adapter->pushRestrictions(1, null, $restrDates);
echo "Restrictions Push Response:\n" . json_encode($restrRes, JSON_PRETTY_PRINT) . "\n";
$restrTaskId = $restrRes['task_id'] ?? ($restrRes['data'][0]['id'] ?? null);

echo "\n=== 4. Fetching Restrictions Task Record from Channex Sandbox ===\n";
if ($restrTaskId) {
    $restrTask = $client->get("tasks/{$restrTaskId}");
    echo "Restrictions Task Data:\n" . json_encode($restrTask, JSON_PRETTY_PRINT) . "\n";
    $restrPropInTask = $restrTask['data']['attributes']['payload']['values'][0]['property_id'] ?? 'NONE';
    echo "Property ID recorded in Channex Task: {$restrPropInTask}\n";
    $restrMatches = ($restrPropInTask === '3041823d-4456-4068-a9b1-bb3f7b8a2662');
    echo "Matches new Artists Farm Jaipur property: " . ($restrMatches ? "YES (PASS)" : "NO (FAIL)") . "\n";
} else {
    echo "FAIL: No restrictions task ID\n";
}
