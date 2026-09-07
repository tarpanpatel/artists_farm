<?php
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/channex/ChannexClient.php';
require_once 'php/channex/ChannexChannelClient.php';

$client = new ChannexClient();
$channelClient = new ChannexChannelClient($client);

echo "--- 1. Testing GET /channels/adapter?code=AirBNB ---\n";
$adapter = $client->get('channels/adapter', ['code' => 'AirBNB']);
echo json_encode($adapter, JSON_PRETTY_PRINT) . "\n\n";

echo "--- 2. Testing creating an Airbnb channel for property 1 ---\n";
$propId = "3041823d-4456-4068-a9b1-bb3f7b8a2662";
$groupId = $channelClient->resolveGroupIdForProperty($propId);
echo "GroupId: $groupId\n";

$createPayload = [
    'channel' => [
        'channel' => 'AirBNB',
        'group_id' => $groupId,
        'properties' => [$propId],
        'settings' => (object)[],
        'title' => 'Airbnb Test Connection'
    ]
];
$created = $client->post('channels', $createPayload);
echo "Create Channel Response:\n";
echo json_encode($created, JSON_PRETTY_PRINT) . "\n\n";

if (!empty($created['data']['id'])) {
    $chanId = $created['data']['id'];
    echo "--- 3. Testing GET /channels/$chanId ---\n";
    $getChan = $client->get("channels/$chanId");
    echo json_encode($getChan, JSON_PRETTY_PRINT) . "\n\n";
    
    // Clean up test channel
    echo "--- 4. Deleting test channel $chanId ---\n";
    $del = $client->delete("channels/$chanId");
    echo json_encode($del, JSON_PRETTY_PRINT) . "\n";
}
