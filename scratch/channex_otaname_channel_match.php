<?php
/**
 * Tests the hypothesis that POST /bookings resolves ota_name against an existing
 * channel on the property. If so, the channel's own title/type/UUID should
 * behave differently from the generic names already tried.
 */
chdir('c:/xampp/htdocs/artists_farm');
$cfg  = json_decode(file_get_contents('php/config/channex_config.json'), true);
$KEY  = $cfg['api_key']; $BASE = rtrim($cfg['base_url'], '/');
$PROP = '4286428a-5561-4508-bd28-1f9ae55d8795';
$RT   = '4ca732c0-6f4f-457c-9c48-396f3d784590';
$RP   = '2d0dfacb-0239-4ec9-9eba-f6962ff3ecd8';
$CHAN = '3bde9156-1373-438b-ae47-c863d5f219f9';

function call(string $m, string $u, string $k, ?array $b = null): array {
    $ch = curl_init($u); curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $m);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['user-api-key: ' . $k, 'Content-Type: application/json', 'Accept: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 40);
    if ($b !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($b));
    $r = curl_exec($ch); $h = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return ['code' => $h, 'json' => json_decode((string)$r, true), 'raw' => (string)$r];
}

$mk = function (array $extra) use ($PROP, $RT, $RP) {
    return ['booking' => array_merge([
        'property_id' => $PROP, 'status' => 'new',
        'arrival_date' => '2026-10-10', 'departure_date' => '2026-10-13',
        'total_price' => '360.00', 'currency' => 'USD',
        'customer' => ['name' => 'Test', 'surname' => 'Guest', 'mail' => 'test@example.com'],
        'rooms' => [[
            'room_type_id' => $RT, 'rate_plan_id' => $RP,
            'checkin_date' => '2026-10-10', 'checkout_date' => '2026-10-13',
            'occupancy' => ['adults' => 2, 'children' => 0, 'infants' => 0],
        ]],
    ], $extra)];
};

$cases = [
    "ota_name = channel title"      => ['ota_name' => 'Certification Simulator'],
    "ota_name = channel UUID"       => ['ota_name' => $CHAN],
    "ota_name + channel_id field"   => ['ota_name' => 'OpenChannel', 'channel_id' => $CHAN],
    "ota_name + channel field"      => ['ota_name' => 'OpenChannel', 'channel' => 'OpenChannel'],
];

foreach ($cases as $label => $extra) {
    $r = call('POST', "$BASE/bookings", $KEY, $mk($extra));
    $note = $r['code'] < 300
        ? 'CREATED booking=' . ($r['json']['data']['id'] ?? '?') . ' revision=' . ($r['json']['data']['attributes']['revision_id'] ?? '?')
        : substr($r['raw'], 0, 130);
    printf("%-30s HTTP %-4d %s\n", $label, $r['code'], $note);
    if ($r['code'] < 300) { echo "\n>>> WORKS: $label\n"; break; }
}
