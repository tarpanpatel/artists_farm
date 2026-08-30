<?php
require_once __DIR__ . '/../php/config/database.php';
require_once __DIR__ . '/../php/channex/ChannexClient.php';

$client = new ChannexClient();

echo "=== Checking Applications on Channex Staging ===\n";

$resApps = $client->get('applications');
echo "GET /applications HTTP: " . ($resApps['http_code'] ?? 0) . "\n";
echo "Applications list:\n";
if (!empty($resApps['data'])) {
    foreach ($resApps['data'] as $app) {
        $attrs = $app['attributes'] ?? $app;
        echo " - [{$app['id']}] code: " . ($attrs['code'] ?? $attrs['title'] ?? 'N/A') . " | title: " . ($attrs['title'] ?? 'N/A') . "\n";
    }
} else {
    echo "Raw response: " . json_encode($resApps['raw'] ?? $resApps) . "\n";
}

$propId = '4286428a-5561-4508-bd28-1f9ae55d8795';
$resInstalled = $client->get("applications/installations", ['filter[property_id]' => $propId]);
echo "\nGET /applications/installations for property {$propId} HTTP: " . ($resInstalled['http_code'] ?? 0) . "\n";
echo "Installed apps: " . json_encode($resInstalled['raw'] ?? $resInstalled) . "\n";
