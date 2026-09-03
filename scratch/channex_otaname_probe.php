<?php
/**
 * ota_name is required (422 without it) but 500s with the values tried so far,
 * now that the `days` array is removed. Test whether it is value-specific -
 * Channex may only accept names matching a known channel.
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

$mk = function (string $ota) use ($PROP, $RT, $RP) {
    return ['booking' => [
        'property_id' => $PROP, 'ota_name' => $ota, 'status' => 'new',
        'arrival_date' => '2026-10-10', 'departure_date' => '2026-10-13',
        'total_price' => '360.00', 'currency' => 'USD',
        'customer' => ['name' => 'Test', 'surname' => 'Guest', 'mail' => 'test@example.com'],
        'rooms' => [[
            'room_type_id' => $RT, 'rate_plan_id' => $RP,
            'checkin_date' => '2026-10-10', 'checkout_date' => '2026-10-13',
            'occupancy' => ['adults' => 2, 'children' => 0, 'infants' => 0],
        ]],
    ]];
};

// Channel codes that the /channels endpoint accepted, plus plausible free text.
foreach (['OpenChannel', 'Open Channel', 'AirBNB', 'Expedia', 'BookingCom',
          'Booking.com', 'Direct', 'Manual', 'API'] as $ota) {
    $r = call('POST', "$BASE/bookings", $KEY, $mk($ota));
    $note = '';
    if ($r['code'] >= 300) {
        $d = $r['json']['errors']['details'] ?? $r['json']['errors'] ?? '';
        $note = is_array($d) ? json_encode($d) : (string)$d;
    } else {
        $note = 'CREATED booking=' . ($r['json']['data']['id'] ?? '?')
              . ' revision=' . ($r['json']['data']['attributes']['revision_id'] ?? '?');
    }
    printf("%-14s HTTP %-4d %s\n", $ota, $r['code'], substr($note, 0, 140));
    if ($r['code'] < 300) { echo "\n>>> WORKS with ota_name = '$ota'\n"; break; }
}
