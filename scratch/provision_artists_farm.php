<?php
/**
 * Re-provision Artists Farm Jaipur (Property 1) in Channex Staging
 */
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/channex/ChannexClient.php';
require_once 'php/channex/content_sync.php';

$client = new ChannexClient();
$syncer = new ChannexContentSyncer($pdo, $client);

echo "=== Current channex_mappings BEFORE sync ===\n";
$before = $pdo->query("SELECT * FROM channex_mappings WHERE property_id = 1")->fetchAll(PDO::FETCH_ASSOC);
echo json_encode($before, JSON_PRETTY_PRINT) . "\n\n";

echo "=== Syncing Property 1 ('Artists Farm Jaipur') ===\n";
$syncRes = $syncer->syncProperty(1);
echo "Sync Result:\n" . json_encode($syncRes, JSON_PRETTY_PRINT) . "\n\n";

echo "=== channex_mappings AFTER sync ===\n";
$after = $pdo->query("SELECT * FROM channex_mappings WHERE property_id = 1")->fetchAll(PDO::FETCH_ASSOC);
echo json_encode($after, JSON_PRETTY_PRINT) . "\n\n";

$newPropId = $after[0]['channex_property_id'] ?? null;
$newRoomId = $after[0]['channex_room_type_id'] ?? null;
$newRateId = $after[0]['channex_rate_plan_id'] ?? null;

echo "=== Querying Channex API GET /properties/{$newPropId} ===\n";
$propData = $client->get("properties/{$newPropId}");
echo "Remote Property Details:\n" . json_encode($propData, JSON_PRETTY_PRINT) . "\n\n";

echo "=== Querying Channex API GET /room_types/{$newRoomId} ===\n";
$roomData = $client->get("room_types/{$newRoomId}");
echo "Remote Room Type Details:\n" . json_encode($roomData, JSON_PRETTY_PRINT) . "\n\n";

echo "=== Querying Channex API GET /rate_plans/{$newRateId} ===\n";
$rateData = $client->get("rate_plans/{$newRateId}");
echo "Remote Rate Plan Details:\n" . json_encode($rateData, JSON_PRETTY_PRINT) . "\n\n";

echo "=== All Properties on Channex Staging (GET /properties) ===\n";
$allProps = $client->get('properties', ['limit' => 50]);
foreach ($allProps['data'] ?? [] as $p) {
    echo " - [{$p['id']}] '{$p['attributes']['title']}' (currency: {$p['attributes']['currency']})\n";
}
