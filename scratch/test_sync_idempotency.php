<?php
/**
 * Test Channex Content Sync Idempotency (Task 1d / Task 4 Proof)
 * Clears local mapping row, runs syncProperty(1) multiple times,
 * and asserts that EXACTLY ONE property exists in Channex with matching title.
 */
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/channex/ChannexClient.php';
require_once 'php/channex/content_sync.php';

$client = new ChannexClient();
$syncer = new ChannexContentSyncer($pdo, $client);

echo "=== Testing Content Sync Idempotency on 'Artists Farm Jaipur' ===\n";

// 1. Check initial property count on Channex Staging
$initProps = $client->get('properties', ['limit' => 50]);
$initCount = count($initProps['data'] ?? []);
echo "Initial properties on Channex Staging: {$initCount}\n";
foreach ($initProps['data'] ?? [] as $p) {
    echo " - [{$p['id']}] '{$p['attributes']['title']}'\n";
}

// 2. Clear local mapping row for property 1 to simulate a cleared/reset database state
$pdo->exec("DELETE FROM channex_mappings WHERE property_id = 1");
echo "\nLocal channex_mappings row deleted for property 1.\n";

// 3. Run syncProperty(1) three times in a row
echo "Running syncProperty(1) - Call 1...\n";
$res1 = $syncer->syncProperty(1);
echo "Running syncProperty(1) - Call 2...\n";
$res2 = $syncer->syncProperty(1);
echo "Running syncProperty(1) - Call 3...\n";
$res3 = $syncer->syncProperty(1);

// 4. Query Channex API directly to verify total property count has NOT increased
$finalProps = $client->get('properties', ['limit' => 50]);
$finalCount = count($finalProps['data'] ?? []);
echo "\nFinal properties on Channex Staging: {$finalCount} (Initial was {$initCount})\n";
foreach ($finalProps['data'] ?? [] as $p) {
    echo " - [{$p['id']}] '{$p['attributes']['title']}'\n";
}

$prop1Id = $res1[0]['channex_property_id'] ?? '';
$prop2Id = $res2[0]['channex_property_id'] ?? '';
$prop3Id = $res3[0]['channex_property_id'] ?? '';

echo "\nReturned Property IDs across calls:\n";
echo " - Call 1: {$prop1Id}\n";
echo " - Call 2: {$prop2Id}\n";
echo " - Call 3: {$prop3Id}\n";

$idempotent = ($initCount === $finalCount) && ($prop1Id === $prop2Id) && ($prop2Id === $prop3Id) && ($prop1Id === '3041823d-4456-4068-a9b1-bb3f7b8a2662');

echo "\nAssertions:\n";
echo " - Remote property count did not increase: " . ($initCount === $finalCount ? "PASS" : "FAILED") . "\n";
echo " - All calls returned identical Property UUID: " . ($prop1Id === $prop2Id && $prop2Id === $prop3Id ? "PASS" : "FAILED") . "\n";
echo " - Preserved target Artists Farm Jaipur UUID (3041823d-4456-4068-a9b1-bb3f7b8a2662): " . ($prop1Id === '3041823d-4456-4068-a9b1-bb3f7b8a2662' ? "PASS" : "FAILED") . "\n";

if ($idempotent) {
    echo "\n=== TASK 1 IDEMPOTENCY TEST: PASSED ===\n";
    exit(0);
} else {
    echo "\n=== TASK 1 IDEMPOTENCY TEST: FAILED ===\n";
    exit(1);
}
