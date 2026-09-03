<?php
/**
 * Scenarios 7 & 8 using the EXACT payload from Channex's own staging guide -
 * notably without ota_name and without the per-day `days` array, which is what
 * every earlier attempt included and which coincided with the opaque 500s.
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
function feed(string $base, string $key, string $prop): array {
    $r = call('GET', "$base/booking_revisions/feed?filter[property_id]=$prop", $key);
    return $r['json']['data'] ?? [];
}
function ackAll(string $base, string $key, string $prop, string $label, array &$out): void {
    foreach (feed($base, $key, $prop) as $rev) {
        $a = call('POST', "$base/booking_revisions/{$rev['id']}/ack", $key, []);
        $st = $rev['attributes']['status'] ?? '?';
        echo "   ACK {$rev['id']} (status=$st) -> HTTP {$a['code']}\n";
        $out[] = "$label | revision={$rev['id']} status=$st ack=HTTP{$a['code']}";
    }
}

$evidence = [];

echo "=== SCENARIO 7: create booking (official payload) ===\n";
$new = call('POST', "$BASE/bookings", $KEY, ['booking' => [
    'property_id'    => $PROP,
    'ota_name'       => 'Open Channel',
    'status'         => 'new',
    'arrival_date'   => '2026-10-10',
    'departure_date' => '2026-10-13',
    'total_price'    => '360.00',
    'currency'       => 'USD',
    'customer'       => ['name' => 'Test', 'surname' => 'Guest', 'mail' => 'test@example.com'],
    'rooms'          => [[
        'room_type_id' => $RT,
        'rate_plan_id' => $RP,
        'checkin_date' => '2026-10-10',
        'checkout_date'=> '2026-10-13',
        'occupancy'    => ['adults' => 2, 'children' => 0, 'infants' => 0],
    ]],
]]);
echo "HTTP {$new['code']}\n";
if ($new['code'] >= 300) { echo substr($new['raw'], 0, 500) . "\n"; exit(1); }

$bid = $new['json']['data']['id'] ?? null;
$rev = $new['json']['data']['attributes']['revision_id'] ?? null;
echo "booking_id=$bid  revision_id=$rev\n";
$evidence[] = "S7 create | booking=$bid revision=$rev HTTP{$new['code']}";

echo "\n=== ingest + ACK (scenario 7) ===\n";
ackAll($BASE, $KEY, $PROP, 'S7 ingest', $evidence);

echo "\n=== SCENARIO 8a: modify (extend one night) ===\n";
$mod = call('PUT', "$BASE/bookings/$bid", $KEY, ['booking' => [
    'departure_date' => '2026-10-14',
    'total_price'    => '480.00',
    'rooms'          => [[
        'room_type_id' => $RT, 'rate_plan_id' => $RP,
        'checkin_date' => '2026-10-10', 'checkout_date' => '2026-10-14',
        'occupancy'    => ['adults' => 2, 'children' => 0, 'infants' => 0],
    ]],
]]);
echo "HTTP {$mod['code']}  " . substr($mod['raw'], 0, 160) . "\n";
$evidence[] = "S8 modify | HTTP{$mod['code']}";
ackAll($BASE, $KEY, $PROP, 'S8 modify ingest', $evidence);

echo "\n=== SCENARIO 8b: cancel ===\n";
$can = call('PUT', "$BASE/bookings/$bid", $KEY, ['booking' => ['status' => 'cancelled']]);
echo "HTTP {$can['code']}  " . substr($can['raw'], 0, 160) . "\n";
$evidence[] = "S8 cancel | HTTP{$can['code']}";
ackAll($BASE, $KEY, $PROP, 'S8 cancel ingest', $evidence);

echo "\n\n============ EVIDENCE FOR CERTIFICATION FORM ============\n";
foreach ($evidence as $e) echo "  $e\n";

