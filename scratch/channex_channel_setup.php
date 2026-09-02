<?php
/**
 * Finishes sandbox channel setup: removes the two surplus probe channels, gives
 * the OpenChannel simulator the hotel_code it requires, maps room type + rate
 * plan, and activates it. Sandbox only - nothing real is touched.
 *
 * Note: Channex's `filter[property_id]=` query param does NOT work on /channels
 * (returns an empty array while the channels plainly exist), so this lists
 * unfiltered and matches client-side.
 */
chdir('c:/xampp/htdocs/artists_farm');
$cfg  = json_decode(file_get_contents('php/config/channex_config.json'), true);
$KEY  = $cfg['api_key'];
$BASE = rtrim($cfg['base_url'], '/');

function call(string $m, string $url, string $key, ?array $body = null): array {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $m);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['user-api-key: ' . $key, 'Content-Type: application/json', 'Accept: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 40);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $r = curl_exec($ch); $c = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return ['code' => $c, 'json' => json_decode((string)$r, true), 'raw' => (string)$r];
}

$KEEP = '3bde9156-1373-438b-ae47-c863d5f219f9';
$RT   = '4ca732c0-6f4f-457c-9c48-396f3d784590';
$RP   = '2d0dfacb-0239-4ec9-9eba-f6962ff3ecd8';

echo "=== remove surplus probe channels ===\n";
$list = call('GET', "$BASE/channels", $KEY);
foreach (($list['json']['data'] ?? []) as $c) {
    if ($c['id'] === $KEEP) continue;
    $d = call('DELETE', "$BASE/channels/{$c['id']}", $KEY);
    echo "  deleted {$c['attributes']['title']} -> HTTP {$d['code']}\n";
}

echo "\n=== configure the simulator (hotel_code + mapping) ===\n";
$r = call('PUT', "$BASE/channels/$KEEP", $KEY, ['channel' => [
    'title'    => 'Certification Simulator',
    'settings' => [
        'hotel_code' => 'CERT-TEST-001',
        'mapping'    => [[
            'room_type_id'         => $RT,
            'rate_plan_id'         => $RP,
            'channel_room_type_id' => 'ota_room_101',
            'channel_rate_plan_id' => 'ota_rate_bar',
        ]],
    ],
]]);
echo "  HTTP {$r['code']}  " . substr($r['raw'], 0, 300) . "\n";

echo "\n=== activate ===\n";
$a = call('PUT', "$BASE/channels/$KEEP", $KEY, ['channel' => ['is_active' => true]]);
echo "  HTTP {$a['code']}  " . substr($a['raw'], 0, 200) . "\n";

echo "\n=== final state ===\n";
$f = call('GET', "$BASE/channels", $KEY);
foreach (($f['json']['data'] ?? []) as $c) {
    $at = $c['attributes'] ?? [];
    echo '  ' . ($at['title'] ?? '?') . '  channel=' . ($at['channel'] ?? '?')
       . '  active=' . var_export($at['is_active'] ?? null, true) . "\n";
    echo '    settings: ' . json_encode($at['settings'] ?? []) . "\n";
}
