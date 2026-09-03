<?php
require_once __DIR__ . '/../php/config/database.php';
require_once __DIR__ . '/../php/channex/ChannexClient.php';

$client = new ChannexClient();
$propId = '4286428a-5561-4508-bd28-1f9ae55d8795';

echo "=== Checking Installed Applications on Channex Staging ===\n";

$res = $client->get('applications/installed');
echo "GET /applications/installed HTTP: " . ($res['http_code'] ?? 0) . "\n";
echo "Data: " . json_encode($res['raw'] ?? $res) . "\n";
