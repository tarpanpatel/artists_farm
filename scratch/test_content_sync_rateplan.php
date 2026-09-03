<?php
/**
 * Content sync failed live on staging with:
 *   {"code":"validation_error","details":{"options":["invalid option, rate and
 *    is_primary is required fields"]}}
 *
 * Proves the corrected rate-plan payload is accepted AND that the rate lands in
 * major units. The old code sent default_tariff * 100, so a 2400 room would have
 * been listed at 240000 a night - accepted by the API, wrong on the OTA.
 */
chdir('c:/xampp/htdocs/artists_farm');
$cfg = json_decode(file_get_contents('php/config/channex_config.json'), true);
$KEY = $cfg['api_key']; $BASE = rtrim($cfg['base_url'], '/');
$PROP = '4286428a-5561-4508-bd28-1f9ae55d8795';
$RT   = '4ca732c0-6f4f-457c-9c48-396f3d784590';

function call(string $m, string $u, string $k, ?array $b = null): array {
    $ch = curl_init($u); curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $m);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['user-api-key: ' . $k, 'Content-Type: application/json', 'Accept: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 40);
    if ($b !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($b));
    $r = curl_exec($ch); $h = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return ['code' => $h, 'json' => json_decode((string)$r, true), 'raw' => (string)$r];
}

$tariff = 2400.00;

echo "=== OLD payload (no is_primary, rate x100) ===\n";
$old = call('POST', "$BASE/rate_plans", $KEY, ['rate_plan' => [
    'property_id' => $PROP, 'room_type_id' => $RT,
    'title' => 'Regression Old ' . rand(1000, 9999),
    'currency' => 'INR', 'sell_mode' => 'per_room', 'rate_mode' => 'manual',
    'options' => [['occupancy' => 2, 'rate' => (int)round($tariff * 100)]],
]]);
echo "HTTP {$old['code']}  " . substr($old['raw'], 0, 160) . "\n\n";

echo "=== NEW payload (is_primary, major-unit rate) ===\n";
$new = call('POST', "$BASE/rate_plans", $KEY, ['rate_plan' => [
    'property_id' => $PROP, 'room_type_id' => $RT,
    'title' => 'Regression New ' . rand(1000, 9999),
    'currency' => 'INR', 'sell_mode' => 'per_room', 'rate_mode' => 'manual',
    'options' => [[
        'occupancy' => 2,
        'is_primary' => true,
        'rate' => number_format($tariff, 2, '.', ''),
    ]],
]]);
echo "HTTP {$new['code']}\n";
$newId = $new['json']['data']['id'] ?? null;
if (!$newId) { echo "FAILED: " . substr($new['raw'], 0, 400) . "\n"; exit(1); }
echo "created rate_plan $newId\n";

// Read it back - an accepted payload is not proof the rate is right.
$got = call('GET', "$BASE/rate_plans/$newId", $KEY);
$opt = $got['json']['data']['attributes']['options'][0] ?? [];
$rate = $opt['rate'] ?? null;
echo "stored rate  = " . json_encode($rate) . "\n";
echo "is_primary   = " . json_encode($opt['is_primary'] ?? null) . "\n";

$rateOk = abs((float)$rate - $tariff) < 0.01;
echo "\nold payload rejected:        " . ($old['code'] >= 400 ? "PASSED (HTTP {$old['code']})" : "UNEXPECTED (HTTP {$old['code']})") . "\n";
echo "new payload accepted:        " . ($new['code'] < 300 ? "PASSED" : "FAILED") . "\n";
echo "rate stored in major units:  " . ($rateOk ? "PASSED ({$rate} == {$tariff})" : "FAILED ({$rate}, expected {$tariff})") . "\n";

call('DELETE', "$BASE/rate_plans/$newId", $KEY);
echo "\n=== " . ($new['code'] < 300 && $rateOk ? "PASSED" : "FAILED") . " ===\n";
