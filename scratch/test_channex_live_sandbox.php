<?php
require_once __DIR__ . '/../php/config/database.php';
require_once __DIR__ . '/../php/channex/content_sync.php';
require_once __DIR__ . '/../php/channex/ChannexAdapter.php';
require_once __DIR__ . '/../php/channex/ChannexClient.php';

global $pdo;

echo "=== Live Channex Sandbox Integration Test ===\n";

$client = new ChannexClient();
$adapter = new ChannexAdapter($pdo, $client);

// 1. Content Sync Test
echo "1. Provisioning property in Channex sandbox...\n";
try {
    $syncResult = $adapter->syncContent(1);
    echo "   Content Sync Result: " . count($syncResult) . " mapped unit(s)\n";
    $channexPropId = $syncResult[0]['channex_property_id'] ?? null;
    echo "   Channex Property UUID: {$channexPropId}\n";

    if (!$channexPropId) {
        echo "   FAILED: No property UUID returned\n";
        exit(1);
    }

    // 2. Outbound Availability Push Test (Scenario 1 & 4)
    echo "2. Pushing 30-day availability to Channex sandbox...\n";
    $startDate = date('Y-m-d');
    $endDate = date('Y-m-d', strtotime('+30 days'));
    $availRanges = [
        [
            'date_from' => $startDate,
            'date_to' => $endDate,
            'availability' => 1,
        ]
    ];
    $availRes = $adapter->pushAvailability(1, null, $availRanges);
    echo "   Availability Push HTTP Status: " . ($availRes['http_code'] ?? 0) . " - " . ($availRes['success'] ? "PASSED (PROVED)" : "FAILED (" . json_encode($availRes['error'] ?? '') . ")") . "\n";

    // 3. Outbound Restrictions Push Test (Scenario 2, 5 & 6)
    echo "3. Pushing rate & restriction rules to Channex sandbox...\n";
    $restrictions = [
        [
            'date_from' => $startDate,
            'date_to' => $endDate,
            'rate' => 4500.00,
            'min_stay_arrival' => 2,
            'stop_sell' => false,
            'closed_to_arrival' => false,
            'closed_to_departure' => false,
        ]
    ];
    $restrRes = $adapter->pushRestrictions(1, null, $restrictions);
    echo "   Restrictions Push HTTP Status: " . ($restrRes['http_code'] ?? 0) . " - " . ($restrRes['success'] ? "PASSED (PROVED)" : "FAILED (" . json_encode($restrRes['error'] ?? '') . ")") . "\n";

    echo "=== Live Sandbox Test Complete ===\n";
} catch (Exception $e) {
    echo "   Exception: " . $e->getMessage() . "\n";
}
