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
        'title' => 'Airbnb Auth URL Test'
    ]
]);
$chanId = $created['data']['id'] ?? null;
echo "Created Chan ID: $chanId\n";

if ($chanId) {
    $tests = [
        ['GET', "channels/auth_url", ['id' => $chanId]],
        ['GET', "channels/auth_url", ['channel_id' => $chanId]],
        ['GET', "channels/auth_url", ['channel' => 'AirBNB', 'property_id' => $propId]],
        ['POST', "channels/auth_url", ['id' => $chanId]],
        ['POST', "channels/auth_url", ['channel_id' => $chanId]],
        ['POST', "channels/auth_url", ['channel' => ['id' => $chanId]]],
        ['GET', "channels/auth_url", ['channel' => ['id' => $chanId]]],
    ];

    foreach ($tests as $t) {
        $method = $t[0];
        $path = $t[1];
        $params = $t[2] ?? [];
        if ($method === 'GET') {
            $res = $client->get($path, $params);
        } else {
            $res = $client->post($path, $params);
        }
        echo "$method $path with " . json_encode($params) . "\n => HTTP {$res['http_code']}: " . json_encode($res['data'] ?? $res['raw'] ?? $res['error']) . "\n\n";
    }

    $client->delete("channels/$chanId");
}
