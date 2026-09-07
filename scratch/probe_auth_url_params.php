<?php
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/channex/ChannexClient.php';
require_once 'php/channex/ChannexChannelClient.php';

$client = new ChannexClient();
$channelClient = new ChannexChannelClient($client);

$propId = "3041823d-4456-4068-a9b1-bb3f7b8a2662";
$groupId = $channelClient->resolveGroupIdForProperty($propId);

$created = $client->post('channels', [
    'channel' => [
        'channel' => 'AirBNB',
        'group_id' => $groupId,
        'properties' => [$propId],
        'settings' => (object)[],
        'title' => 'Airbnb Param Test'
    ]
]);
$chanId = $created['data']['id'] ?? null;
echo "Created Chan ID: $chanId\n";

if ($chanId) {
    // Test various query parameters for GET channels/auth_url
    $paramCombos = [
        ['channel_code' => 'AirBNB'],
        ['code' => 'AirBNB'],
        ['channel' => 'AirBNB'],
        ['name' => 'AirBNB'],
        ['provider' => 'AirBNB'],
        ['type' => 'AirBNB'],
        ['channel_id' => $chanId, 'channel' => 'AirBNB'],
    ];

    foreach ($paramCombos as $p) {
        $res = $client->get('channels/auth_url', $p);
        echo "GET channels/auth_url with " . json_encode($p) . "\n => HTTP {$res['http_code']}: " . json_encode($res['data'] ?? $res['raw'] ?? $res['error']) . "\n\n";
    }

    $client->delete("channels/$chanId");
}
