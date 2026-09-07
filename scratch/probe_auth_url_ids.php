<?php
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/channex/ChannexClient.php';
require_once 'php/channex/ChannexChannelClient.php';

$client = new ChannexClient();
$channelClient = new ChannexChannelClient($client);

$propId = "3041823d-4456-4068-a9b1-bb3f7b8a2662";
$groupId = $channelClient->resolveGroupIdForProperty($propId);

$testIds = [
    'propId' => $propId,
    'groupId' => $groupId,
];

foreach ($testIds as $label => $idVal) {
    $res = $client->get('channels/auth_url', ['id' => $idVal]);
    echo "GET channels/auth_url?id=($label:$idVal) => HTTP {$res['http_code']}: " . json_encode($res['data'] ?? $res['raw'] ?? $res['error']) . "\n";

    $res2 = $client->get('channels/auth_url', ['id' => $idVal, 'channel' => 'AirBNB']);
    echo "GET channels/auth_url?id=($label:$idVal)&channel=AirBNB => HTTP {$res2['http_code']}: " . json_encode($res2['data'] ?? $res2['raw'] ?? $res2['error']) . "\n";
}

// Let's also check GET /auth_url or /meta/auth_url
$res3 = $client->get('auth_url', ['channel' => 'AirBNB', 'property_id' => $propId]);
echo "GET auth_url => HTTP {$res3['http_code']}: " . json_encode($res3['data'] ?? $res3['raw'] ?? $res3['error']) . "\n";
