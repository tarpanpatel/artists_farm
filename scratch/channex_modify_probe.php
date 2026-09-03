<?php
/**
 * Scenario 8 is unproven: the modification PUT 500s and the cancel PUT 422s, so
 * no second revision is ever generated. Find the shapes Channex accepts.
 * Creates its own throwaway booking so it does not collide with prior tests.
 */
chdir('c:/xampp/htdocs/artists_farm');
$cfg  = json_decode(file_get_contents('php/config/channex_config.json'), true);
$KEY  = $cfg['api_key']; $BASE = rtrim($cfg['base_url'], '/');
$PROP = '4286428a-5561-4508-bd28-1f9ae55d8795';
$RT   = '4ca732c0-6f4f-457c-9c48-396f3d784590';
$RP   = '2d0dfacb-0239-4ec9-9eba-f6962ff3ecd8';

function call(string $m, string $u, string $k, ?array $b = null): array {
    $ch = curl_init($u); curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $m);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['user-api-key: ' . $k, 'Content-Type: application/json', 'Accept: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 40);
    if ($b !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($b));
    $r = curl_exec($ch); $h = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return ['code' => $h, 'json' => json_decode((string)$r, true), 'raw' => (string)$r];
}
function revOf(string $base, string $key, string $id): string {
    $b = call('GET', "$base/bookings/$id", $key);
    return (string)($b['json']['data']['attributes']['revision_id'] ?? '?');
}

// Fresh booking on untouched dates.
$new = call('POST', "$BASE/bookings", $KEY, ['booking' => [
    'property_id' => $PROP, 'ota_name' => 'Offline',
    'ota_reservation_code' => 'MODPROBE-' . rand(1000, 9999),
    'arrival_date' => '2027-03-10', 'departure_date' => '2027-03-13',
    'payment_collect' => 'property', 'currency' => 'USD',
    'customer' => ['name' => 'Mod', 'surname' => 'Probe', 'mail' => 'mod@example.com'],
    'rooms' => [[
        'room_type_id' => $RT, 'rate_plan_id' => $RP,
        'days' => ['2027-03-10' => '120.00', '2027-03-11' => '120.00', '2027-03-12' => '120.00'],
        'occupancy' => ['adults' => 2, 'children' => 0, 'infants' => 0],
    ]],
]]);
if ($new['code'] >= 300) { exit("create failed HTTP {$new['code']}: " . substr($new['raw'], 0, 300) . "\n"); }
$bid = $new['json']['data']['id'];
$rev0 = $new['json']['data']['attributes']['revision_id'] ?? '?';
echo "booking $bid\ninitial revision $rev0\n\n";

// The create shape works; modification probably needs the SAME full shape
// rather than the partial one the docs imply.
$variants = [
    'full create shape, new dates' => ['booking' => [
        'property_id' => $PROP, 'ota_name' => 'Offline',
        'arrival_date' => '2027-03-10', 'departure_date' => '2027-03-14',
        'payment_collect' => 'property', 'currency' => 'USD',
        'customer' => ['name' => 'Mod', 'surname' => 'Probe', 'mail' => 'mod@example.com'],
        'rooms' => [[
            'room_type_id' => $RT, 'rate_plan_id' => $RP,
            'days' => ['2027-03-10' => '120.00', '2027-03-11' => '120.00', '2027-03-12' => '120.00', '2027-03-13' => '120.00'],
            'occupancy' => ['adults' => 2, 'children' => 0, 'infants' => 0],
        ]],
    ]],
    'status modified + full shape' => ['booking' => [
        'property_id' => $PROP, 'ota_name' => 'Offline', 'status' => 'modified',
        'arrival_date' => '2027-03-10', 'departure_date' => '2027-03-14',
        'payment_collect' => 'property', 'currency' => 'USD',
        'customer' => ['name' => 'Mod', 'surname' => 'Probe', 'mail' => 'mod@example.com'],
        'rooms' => [[
            'room_type_id' => $RT, 'rate_plan_id' => $RP,
            'days' => ['2027-03-10' => '120.00', '2027-03-11' => '120.00', '2027-03-12' => '120.00', '2027-03-13' => '120.00'],
            'occupancy' => ['adults' => 2, 'children' => 0, 'infants' => 0],
        ]],
    ]],
    'occupancy change only'       => ['booking' => [
        'property_id' => $PROP, 'ota_name' => 'Offline',
        'arrival_date' => '2027-03-10', 'departure_date' => '2027-03-13',
        'payment_collect' => 'property', 'currency' => 'USD',
        'customer' => ['name' => 'Mod', 'surname' => 'Probe', 'mail' => 'mod@example.com'],
        'rooms' => [[
            'room_type_id' => $RT, 'rate_plan_id' => $RP,
            'days' => ['2027-03-10' => '120.00', '2027-03-11' => '120.00', '2027-03-12' => '120.00'],
            'occupancy' => ['adults' => 3, 'children' => 0, 'infants' => 0],
        ]],
    ]],
];

echo "=== MODIFICATION (PUT /bookings/{id}) ===\n";
foreach ($variants as $label => $body) {
    $r = call('PUT', "$BASE/bookings/$bid", $KEY, $body);
    $rev = $r['code'] < 300 ? revOf($BASE, $KEY, $bid) : '-';
    printf("%-30s HTTP %-4d %s\n", $label, $r['code'],
        $r['code'] < 300 ? ("revision now $rev" . ($rev !== $rev0 ? '  <-- NEW REVISION' : '  (unchanged)'))
                         : substr($r['raw'], 0, 110));
    if ($r['code'] < 300 && $rev !== $rev0) { echo "\n>>> MODIFICATION WORKS: $label\n"; break; }
}

echo "\n=== CANCELLATION ===\n";
foreach ([
    'status only'            => ['booking' => ['status' => 'cancelled']],
    'status + property/ota'  => ['booking' => ['property_id' => $PROP, 'ota_name' => 'Offline', 'status' => 'cancelled']],
    'DELETE /bookings/{id}'  => null,
] as $label => $body) {
    $r = $body === null
        ? call('DELETE', "$BASE/bookings/$bid", $KEY)
        : call('PUT', "$BASE/bookings/$bid", $KEY, $body);
    $rev = $r['code'] < 300 ? revOf($BASE, $KEY, $bid) : '-';
    printf("%-30s HTTP %-4d %s\n", $label, $r['code'],
        $r['code'] < 300 ? "revision now $rev" : substr($r['raw'], 0, 110));
    if ($r['code'] < 300) { echo "\n>>> CANCEL WORKS: $label\n"; break; }
}
