<?php
require __DIR__ . '/../php/channex/ChannexClient.php';

$client = new ChannexClient();

echo "=== GET /channels/codes (read-only, should always work) ===\n";
$codes = $client->get('channels/codes');
echo "success: " . ($codes['success'] ? 'yes' : 'no') . ", http_code: " . ($codes['http_code'] ?? '?') . "\n";
echo json_encode($codes['data'] ?? $codes['error'] ?? null) . "\n\n";

echo "=== GET /channels/list (read-only) ===\n";
$list = $client->get('channels/list');
echo "success: " . ($list['success'] ? 'yes' : 'no') . ", http_code: " . ($list['http_code'] ?? '?') . "\n";
$listData = $list['data'] ?? [];
if (is_array($listData)) {
    echo "count: " . count($listData) . "\n";
    $names = [];
    foreach ($listData as $item) {
        $names[] = $item['id'] ?? $item['attributes']['code'] ?? json_encode($item);
        if (count($names) >= 15) break;
    }
    echo "sample ids/codes: " . implode(', ', $names) . "\n";
} else {
    echo json_encode($list['error'] ?? $listData) . "\n";
}
echo "\n";

echo "=== GET /channels/adapter?code=airbnb2 (adapter descriptor for a real code) ===\n";
$adapter = $client->get('channels/adapter', ['code' => 'airbnb2']);
echo "success: " . ($adapter['success'] ? 'yes' : 'no') . ", http_code: " . ($adapter['http_code'] ?? '?') . "\n";
echo json_encode($adapter['data'] ?? $adapter['error'] ?? null) . "\n\n";

echo "=== GET /groups (read-only, needed for POST /channels group_id) ===\n";
$groups = $client->get('groups');
echo "success: " . ($groups['success'] ? 'yes' : 'no') . ", http_code: " . ($groups['http_code'] ?? '?') . "\n";
echo json_encode($groups['data'] ?? $groups['error'] ?? null) . "\n\n";

echo "=== POST /channels/test_connection - THE key check ===\n";
echo "(deliberately garbage settings - we only care whether this 401/403s [no Channel API access]\n";
echo " vs. returns a real validation response [access confirmed])\n";
$test = $client->post('channels/test_connection', [
    'channel' => 'bookingcom',
    'settings' => ['hotel_id' => 'verification-probe-000000'],
]);
echo "success: " . ($test['success'] ? 'yes' : 'no') . ", http_code: " . ($test['http_code'] ?? '?') . "\n";
echo json_encode($test['data'] ?? $test['error'] ?? $test['raw'] ?? null) . "\n";
