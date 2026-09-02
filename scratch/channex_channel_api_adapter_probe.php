<?php
require __DIR__ . '/../php/channex/ChannexClient.php';

$client = new ChannexClient();

foreach (['BookingCom', 'AirBNB', 'Expedia'] as $code) {
    echo "=== GET /channels/adapter?code=$code ===\n";
    $adapter = $client->get('channels/adapter', ['code' => $code]);
    echo "success: " . ($adapter['success'] ? 'yes' : 'no') . ", http_code: " . ($adapter['http_code'] ?? '?') . "\n";
    echo json_encode($adapter['data'] ?? $adapter['error'] ?? null) . "\n\n";
}

echo "=== GET /channels (existing connections, if any) ===\n";
$conns = $client->get('channels');
echo "success: " . ($conns['success'] ? 'yes' : 'no') . ", http_code: " . ($conns['http_code'] ?? '?') . "\n";
echo json_encode($conns['data'] ?? $conns['error'] ?? null) . "\n";
