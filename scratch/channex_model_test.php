<?php
/**
 * Creates a real whole-property unit in the Channex sandbox to settle the
 * question the written evaluation asserted: does a SINGLE (whole-property)
 * homestay map natively, or must it be faked as a 1-room hotel?
 *
 * Models "Winter Garden" - one of the user's real whole-property homestays,
 * ₹2,400/night, Jaipur. Sandbox only. Prints the exact payloads and responses
 * so the required-field shape is observable, not guessed.
 */
$cfg  = json_decode(file_get_contents(__DIR__ . '/../php/config/channex_config.json'), true);
$KEY  = $cfg['api_key'];
$BASE = rtrim($cfg['base_url'], '/');

function call(string $m, string $url, string $key, ?array $body = null): array {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $m);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['user-api-key: ' . $key, 'Content-Type: application/json', 'Accept: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $r = curl_exec($ch);
    $c = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $c, 'json' => json_decode((string)$r, true), 'raw' => (string)$r];
}

// ---------- 1. Create the property (whole-property homestay) ----------
echo "=== 1. POST /properties  (whole-property homestay) ===\n";
$propPayload = ['property' => [
    'title'         => 'Winter Garden (CLAUDE TEST)',
    'currency'      => 'INR',
    'email'         => 'test@example.com',
    'phone'         => '919571263474',
    'country'       => 'IN',
    'state'         => 'Rajasthan',
    'city'          => 'Jaipur',
    'address'       => 'Jaipur, Rajasthan, India',
    'zip_code'      => '302001',
    'timezone'      => 'Asia/Kolkata',
    'property_type' => 'villa',
]];
$p = call('POST', "$BASE/properties", $KEY, $propPayload);
echo "HTTP {$p['code']}\n";
if ($p['code'] >= 300) { echo "ERROR: " . substr($p['raw'], 0, 900) . "\n"; exit; }
$propId = $p['json']['data']['id'] ?? null;
echo "property id: $propId\n";
echo "property_type accepted as: " . ($p['json']['data']['attributes']['property_type'] ?? '?') . "\n\n";

// ---------- 2. Room type - the actual question ----------
// If a whole-property unit is native, count_of_rooms=1 should be accepted
// without complaint and without needing a synthetic "room" concept.
echo "=== 2. POST /room_types  (count_of_rooms = 1, whole unit) ===\n";
$rtPayload = ['room_type' => [
    'property_id'      => $propId,
    'title'            => 'Winter Garden',
    'count_of_rooms'   => 1,
    'occ_adults'       => 4,
    'occ_children'     => 2,
    'occ_infants'      => 0,
    'default_occupancy'=> 2,
    'room_kind'        => 'room',
]];
$rt = call('POST', "$BASE/room_types", $KEY, $rtPayload);
echo "HTTP {$rt['code']}\n";
if ($rt['code'] >= 300) { echo "ERROR: " . substr($rt['raw'], 0, 900) . "\n"; }
$rtId = $rt['json']['data']['id'] ?? null;
echo "room_type id: $rtId\n";
echo "room_kind accepted as: " . ($rt['json']['data']['attributes']['room_kind'] ?? '?') . "\n";
echo "count_of_rooms: " . ($rt['json']['data']['attributes']['count_of_rooms'] ?? '?') . "\n\n";

// Is there a native whole-property kind? Try it explicitly.
echo "=== 2b. Is room_kind='dorm'/'apartment' supported? (probing valid values) ===\n";
$probe = call('POST', "$BASE/room_types", $KEY, ['room_type' => [
    'property_id' => $propId, 'title' => 'Probe Invalid Kind', 'count_of_rooms' => 1,
    'occ_adults' => 2, 'room_kind' => 'whole_property',
]]);
echo "HTTP {$probe['code']} -> " . substr($probe['raw'], 0, 300) . "\n\n";

// ---------- 3. Rate plan ----------
echo "=== 3. POST /rate_plans ===\n";
$rpPayload = ['rate_plan' => [
    'property_id'  => $propId,
    'room_type_id' => $rtId,
    'title'        => 'Standard Rate',
    'currency'     => 'INR',
    'sell_mode'    => 'per_room',
    'rate_mode'    => 'manual',
    'options'      => [['occupancy' => 2, 'is_primary' => true, 'rate' => 240000]],
]];
$rp = call('POST', "$BASE/rate_plans", $KEY, $rpPayload);
echo "HTTP {$rp['code']}\n";
if ($rp['code'] >= 300) { echo "ERROR: " . substr($rp['raw'], 0, 900) . "\n"; }
$rpId = $rp['json']['data']['id'] ?? null;
echo "rate_plan id: $rpId\n";
echo "sell_mode: " . ($rp['json']['data']['attributes']['sell_mode'] ?? '?') . "\n\n";

echo "=== SUMMARY ===\n";
echo "property : " . ($propId ? "OK $propId" : 'FAILED') . "\n";
echo "room_type: " . ($rtId ? "OK $rtId" : 'FAILED') . "\n";
echo "rate_plan: " . ($rpId ? "OK $rpId" : 'FAILED') . "\n";
echo "\nCleanup: run with --cleanup to delete property $propId\n";

if (in_array('--cleanup', $argv, true) && $propId) {
    $d = call('DELETE', "$BASE/properties/$propId", $KEY);
    echo "DELETE property -> HTTP {$d['code']}\n";
}
