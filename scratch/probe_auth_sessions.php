<?php
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/channex/ChannexClient.php';
require_once 'php/channex/ChannexChannelClient.php';

$client = new ChannexClient();
$channelClient = new ChannexChannelClient($client);

$propId = "3041823d-4456-4068-a9b1-bb3f7b8a2662";
$groupId = $channelClient->resolveGroupIdForProperty($propId);

echo "--- 1. Testing POST /auth_sessions ---\n";
$tests = [
    ['POST', 'auth_sessions', ['auth_session' => ['property_id' => $propId]]],
    ['POST', 'auth_sessions', ['auth_session' => ['group_id' => $groupId]]],
    ['POST', 'sessions', ['session' => ['property_id' => $propId]]],
    ['POST', 'sessions', ['session' => ['group_id' => $groupId]]],
    ['POST', 'auth/sessions', ['property_id' => $propId]],
    ['POST', 'white_label/sessions', ['property_id' => $propId]],
    ['GET', 'auth_sessions'],
    ['GET', 'user/auth_sessions'],
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
    echo "$method $path => HTTP {$res['http_code']}: " . json_encode($res['data'] ?? $res['raw'] ?? $res['error']) . "\n\n";
}
