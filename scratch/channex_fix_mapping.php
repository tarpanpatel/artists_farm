<?php
/**
 * Correct the channel using the real API shape (from the channex-pms-integration
 * skill reference, which documents it accurately where Channex's own guidance
 * did not):
 *   - mapping lives in rate_plans[].settings, NOT settings.mapping
 *   - room_type_code / rate_plan_code must be INTEGERS (strings silently land
 *     under "removed rates" and read as "Not mapped" on the OTA side)
 *   - activation is POST /channels/:id/activate, NOT PUT is_active (which
 *     returns 200 and is ignored)
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

$CH    = '3bde9156-1373-438b-ae47-c863d5f219f9';
$PROP  = '4286428a-5561-4508-bd28-1f9ae55d8795';
$GROUP = 'df43207a-cc42-497d-8813-6590744c748c';
$RP    = '2d0dfacb-0239-4ec9-9eba-f6962ff3ecd8';

// Integer codes - the simulator has no real OTA catalogue, so these stand in
// for what mapping_details would return from a live channel.
$ROOM_CODE = 101001;
$RATE_CODE = 202001;

echo "=== 1. PUT rate_plans with integer codes ===\n";
$r = call('PUT', "$BASE/channels/$CH", $KEY, ['channel' => [
    'group_id'   => $GROUP,
    'properties' => [$PROP],
    'rate_plans' => [[
        'rate_plan_id' => $RP,
        'settings'     => [
            'room_type_code' => $ROOM_CODE,
            'rate_plan_code' => $RATE_CODE,
            'occupancy'      => 2,
            'pricing_type'   => 'OBP',
            'primary_occ'    => true,
            'readonly'       => false,
            'occ_changed'    => false,
        ],
    ]],
    'settings' => ['hotel_code' => 'CERT-TEST-001'],
]]);
echo "HTTP {$r['code']}\n";
if ($r['code'] >= 300) echo substr($r['raw'], 0, 400) . "\n";

$chk = call('GET', "$BASE/channels/$CH", $KEY);
$rp = $chk['json']['data']['attributes']['rate_plans'] ?? [];
echo "rate_plans now: " . count($rp) . "\n";
if ($rp) echo json_encode($rp[0]) . "\n";

echo "\n=== 2. POST /channels/$CH/activate ===\n";
$a = call('POST', "$BASE/channels/$CH/activate", $KEY, []);
echo "HTTP {$a['code']}  " . substr($a['raw'], 0, 300) . "\n";

echo "\n=== 3. final ===\n";
$f = call('GET', "$BASE/channels/$CH", $KEY);
$at = $f['json']['data']['attributes'] ?? [];
echo 'title     : ' . ($at['title'] ?? '?') . "\n";
echo 'is_active : ' . var_export($at['is_active'] ?? null, true) . "\n";
echo 'rate_plans: ' . count($at['rate_plans'] ?? []) . "\n";
echo 'properties: ' . json_encode($at['properties'] ?? []) . "\n";

