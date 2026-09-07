<?php
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/channex/ChannexClient.php';
require_once 'php/channex/ChannexChannelClient.php';

$client = new ChannexClient();
$channelClient = new ChannexChannelClient($client);

$propId = "3041823d-4456-4068-a9b1-bb3f7b8a2662";
$groupId = $channelClient->resolveGroupIdForProperty($propId);

// Let's create an Airbnb channel on Channex
$created = $client->post('channels', [
    'channel' => [
        'channel' => 'AirBNB',
        'group_id' => $groupId,
        'properties' => [$propId],
        'settings' => (object)[],
        'title' => 'Airbnb State Test'
    ]
]);
$chanId = $created['data']['id'] ?? null;
echo "Created Chan ID: $chanId\n";

if ($chanId) {
    // Check all sub-resources of the created channel
    $subroutes = [
        'actions',
        'auth_redirect',
        'auth_url',
        'connect',
        'sessions',
        'oauth',
        'meta',
        'link',
        'state',
        'token',
        'credentials',
    ];

    foreach ($subroutes as $sub) {
        $r1 = $client->get("channels/$chanId/$sub");
        if ($r1['http_code'] !== 404) {
            echo "FOUND: GET channels/$chanId/$sub => HTTP {$r1['http_code']}: " . json_encode($r1['data'] ?? $r1['raw']) . "\n";
        }
        $r2 = $client->post("channels/$chanId/$sub", []);
        if ($r2['http_code'] !== 404) {
            echo "FOUND: POST channels/$chanId/$sub => HTTP {$r2['http_code']}: " . json_encode($r2['data'] ?? $r2['raw']) . "\n";
        }
    }

    $client->delete("channels/$chanId");
}
