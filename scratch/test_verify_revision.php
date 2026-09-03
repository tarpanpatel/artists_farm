<?php
require_once __DIR__ . '/../php/config/database.php';
require_once __DIR__ . '/../php/channex/ChannexClient.php';

$client = new ChannexClient();
$revId = 'a940bc66-6d60-4804-86aa-2825cc15a7fe';

echo "=== Verifying Inbound Revision from Created Booking ===\n";

$resRev = $client->get("booking_revisions/{$revId}");
echo "GET /booking_revisions/{$revId} HTTP: " . ($resRev['http_code'] ?? 0) . "\n";
echo "Revision status: " . ($resRev['data']['attributes']['status'] ?? 'N/A') . "\n";
echo "Revision OTA Name: " . ($resRev['data']['attributes']['ota_name'] ?? 'N/A') . "\n";

$resFeed = $client->get('booking_revisions/feed');
echo "GET /booking_revisions/feed HTTP: " . ($resFeed['http_code'] ?? 0) . "\n";
echo "Feed total unacked: " . ($resFeed['raw']['meta']['total'] ?? count($resFeed['data'] ?? [])) . "\n";

// Acknowledge the revision so we don't leave dirty unacked state on the sandbox
$resAck = $client->post("booking_revisions/{$revId}/ack", []);
echo "POST /booking_revisions/{$revId}/ack HTTP: " . ($resAck['http_code'] ?? 0) . "\n";
