<?php
/** Narrow down which part of the booking payload causes the opaque HTTP 500. */
chdir('c:/xampp/htdocs/artists_farm');
$cfg  = json_decode(file_get_contents('php/config/channex_config.json'), true);
$KEY  = $cfg['api_key']; $BASE = rtrim($cfg['base_url'], '/');
$PROP = '4286428a-5561-4508-bd28-1f9ae55d8795';
$RT   = '4ca732c0-6f4f-457c-9c48-396f3d784590';
$RP   = '2d0dfacb-0239-4ec9-9eba-f6962ff3ecd8';

function c(string $m, string $u, string $k, ?array $b = null): array {
    $ch = curl_init($u); curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $m);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['user-api-key: ' . $k, 'Content-Type: application/json', 'Accept: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 40);
    if ($b !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($b));
    $r = curl_exec($ch); $h = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return [$h, substr((string)$r, 0, 220)];
}

$room = [
    'room_type_id' => $RT, 'rate_plan_id' => $RP,
    'checkin_date' => '2026-10-10', 'checkout_date' => '2026-10-13',
    'occupancy' => ['adults' => 2, 'children' => 0, 'infants' => 0],
    'days' => [
        ['date' => '2026-10-10', 'amount' => '120.00'],
        ['date' => '2026-10-11', 'amount' => '120.00'],
        ['date' => '2026-10-12', 'amount' => '120.00'],
    ],
];
$base = [
    'property_id' => $PROP, 'ota_name' => 'Direct Test', 'status' => 'new',
    'arrival_date' => '2026-10-10', 'departure_date' => '2026-10-13',
    'total_price' => '360.00', 'currency' => 'USD',
    'customer' => ['name' => 'Alex', 'surname' => 'Morgan', 'mail' => 'alex.morgan@example.com',
                   'phone' => '+15551234567', 'country' => 'US'],
    'rooms' => [$room],
];

$variants = [
    'as documented'          => $base,
    'ota_name Open Channel'  => array_merge($base, ['ota_name' => 'Open Channel']),
    'ota_name BookingCom'    => array_merge($base, ['ota_name' => 'BookingCom']),
    'with ota_reservation_code' => array_merge($base, ['ota_reservation_code' => 'CERT-' . time()]),
    'no customer block'      => array_diff_key($base, ['customer' => 1]),
    'no days array'          => array_merge($base, ['rooms' => [array_diff_key($room, ['days' => 1])]]),
    'no rooms at all'        => array_diff_key($base, ['rooms' => 1]),
];

foreach ($variants as $label => $payload) {
    [$h, $body] = c('POST', "$BASE/bookings", $KEY, ['booking' => $payload]);
    printf("%-26s HTTP %-4d %s\n", $label, $h, $h >= 300 ? $body : 'CREATED');
    if ($h < 300) { echo "\n>>> WORKED: $label\n"; break; }
}
