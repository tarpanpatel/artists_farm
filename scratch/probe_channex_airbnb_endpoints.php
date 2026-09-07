<?php
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/channex/ChannexClient.php';
require_once 'php/channex/ChannexChannelClient.php';

$client = new ChannexClient();
$channelClient = new ChannexChannelClient($client);

// Let's create an Airbnb channel and test various sub-endpoints on it
$propId = "3041823d-4456-4068-a9b1-bb3f7b8a2662";
$groupId = $channelClient->resolveGroupIdForProperty($propId);

$created = $client->post('channels', [
    'channel' => [
        'channel' => 'AirBNB',
        'group_id' => $groupId,
        'properties' => [$propId],
        'settings' => (object)[],
        'title' => 'Airbnb Probe'
    ]
]);
$chanId = $created['data']['id'] ?? null;
echo "Created Chan ID: $chanId\n";

if ($chanId) {
    $tests = [
        ['GET', "channels/$chanId/auth_url"],
        ['POST', "channels/$chanId/auth_url"],
        ['GET', "channels/$chanId/connect"],
        ['POST', "channels/$chanId/connect"],
        ['GET', "channels/$chanId/airbnb"],
        ['GET', "channels/$chanId/oauth_url"],
        ['POST', "channels/$chanId/oauth_url"],
        ['GET', "meta/airbnb/auth_url"],
        ['POST', "meta/airbnb/auth_url", ['channel_id' => $chanId]],
        ['GET', "channels/auth_url", ['channel' => 'AirBNB', 'channel_id' => $chanId]],
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
        echo "$method $path => HTTP {$res['http_code']}: " . json_encode($res['data'] ?? $res['raw'] ?? $res['error']) . "\n";
    }

    $client->delete("channels/$chanId");
}
