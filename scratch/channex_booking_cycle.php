<?php
/**
 * Certification scenarios 7 & 8, end to end against the live Channex sandbox:
 *   7. receive a new booking, read it from the revisions feed, ACK it
 *   8. modify it (dates + price) -> ACK, then cancel -> ACK
 *
 * Records every booking_id / revision_id / ACK response, which is what the
 * certification submission form asks for.
 */
chdir('c:/xampp/htdocs/artists_farm');
$cfg  = json_decode(file_get_contents('php/config/channex_config.json'), true);
$KEY  = $cfg['api_key'];
$BASE = rtrim($cfg['base_url'], '/');

$PROP = '4286428a-5561-4508-bd28-1f9ae55d8795';
$RT   = '4ca732c0-6f4f-457c-9c48-396f3d784590';
$RP   = '2d0dfacb-0239-4ec9-9eba-f6962ff3ecd8';

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

$log = [];
function record(array &$log, string $step, string $detail) { $log[] = [$step, $detail]; }

// Property currency drives the booking currency - a mismatch is rejected.
$p = call('GET', "$BASE/properties/$PROP", $KEY);
$CUR = $p['json']['data']['attributes']['currency'] ?? 'USD';
echo "property currency: $CUR\n\n";

// ---------- SCENARIO 7: new booking ----------
echo "=== SCENARIO 7: create booking ===\n";
$new = call('POST', "$BASE/bookings", $KEY, ['booking' => [
    'property_id'    => $PROP,
    'ota_name'       => 'Direct Test',
    'status'         => 'new',
    'arrival_date'   => '2026-10-10',
    'departure_date' => '2026-10-13',
    'total_price'    => '360.00',
    'currency'       => $CUR,
    'customer'       => ['name' => 'Alex', 'surname' => 'Morgan',
                         'mail' => 'alex.morgan@example.com', 'phone' => '+15551234567', 'country' => 'US'],
    'rooms'          => [[
        'room_type_id' => $RT, 'rate_plan_id' => $RP,
        'checkin_date' => '2026-10-10', 'checkout_date' => '2026-10-13',
        'occupancy'    => ['adults' => 2, 'children' => 0, 'infants' => 0],
        'days'         => [
            ['date' => '2026-10-10', 'amount' => '120.00'],
            ['date' => '2026-10-11', 'amount' => '120.00'],
            ['date' => '2026-10-12', 'amount' => '120.00'],
        ],
    ]],
]]);
echo "HTTP {$new['code']}\n";
if ($new['code'] >= 300) { echo substr($new['raw'], 0, 600) . "\n"; exit(1); }

$bookingId = $new['json']['data']['id'] ?? null;
$revNew    = $new['json']['data']['attributes']['revision_id'] ?? null;
echo "booking_id : $bookingId\nrevision_id: $revNew\n";
record($log, 'S7 new booking', "booking=$bookingId revision=$revNew");

// ---------- read the feed (this is what the PMS ingests) ----------
echo "\n=== read revisions feed ===\n";
$feed = call('GET', "$BASE/booking_revisions/feed?filter[property_id]=$PROP", $KEY);
echo "HTTP {$feed['code']}  revisions: " . count($feed['json']['data'] ?? []) . "\n";
foreach (($feed['json']['data'] ?? []) as $rev) {
    $a = $rev['attributes'] ?? [];
    echo "  revision {$rev['id']}  status=" . ($a['status'] ?? '?') . "  ota=" . ($a['ota_name'] ?? '?') . "\n";
}

// ---------- ACK ----------
function ackAll(string $base, string $key, string $prop, array &$log, string $label): void {
    $feed = call('GET', "$base/booking_revisions/feed?filter[property_id]=$prop", $key);
    foreach (($feed['json']['data'] ?? []) as $rev) {
        $a = call('POST', "$base/booking_revisions/{$rev['id']}/ack", $key, []);
        echo "  ACK {$rev['id']} -> HTTP {$a['code']} " . substr($a['raw'], 0, 90) . "\n";
        record($log, $label, "revision={$rev['id']} ack=HTTP{$a['code']}");
    }
}
echo "\n=== ACK new-booking revision(s) ===\n";
ackAll($BASE, $KEY, $PROP, $log, 'S7 ack');

// ---------- SCENARIO 8a: modification ----------
echo "\n=== SCENARIO 8a: modify (extend to 14th, price up) ===\n";
$mod = call('PUT', "$BASE/bookings/$bookingId", $KEY, ['booking' => [
    'departure_date' => '2026-10-14',
    'total_price'    => '480.00',
    'rooms'          => [[
        'room_type_id' => $RT, 'rate_plan_id' => $RP,
        'checkin_date' => '2026-10-10', 'checkout_date' => '2026-10-14',
        'occupancy'    => ['adults' => 2, 'children' => 0, 'infants' => 0],
        'days'         => [
            ['date' => '2026-10-10', 'amount' => '120.00'],
            ['date' => '2026-10-11', 'amount' => '120.00'],
            ['date' => '2026-10-12', 'amount' => '120.00'],
            ['date' => '2026-10-13', 'amount' => '120.00'],
        ],
    ]],
]]);
echo "HTTP {$mod['code']}  " . substr($mod['raw'], 0, 200) . "\n";
record($log, 'S8 modify', "HTTP{$mod['code']} revision=" . ($mod['json']['data']['attributes']['revision_id'] ?? '?'));
echo "\n=== ACK modification ===\n";
ackAll($BASE, $KEY, $PROP, $log, 'S8 modify ack');

// ---------- SCENARIO 8b: cancellation ----------
echo "\n=== SCENARIO 8b: cancel ===\n";
$can = call('PUT', "$BASE/bookings/$bookingId", $KEY, ['booking' => ['status' => 'cancelled']]);
echo "HTTP {$can['code']}  " . substr($can['raw'], 0, 200) . "\n";
record($log, 'S8 cancel', "HTTP{$can['code']} revision=" . ($can['json']['data']['attributes']['revision_id'] ?? '?'));
echo "\n=== ACK cancellation ===\n";
ackAll($BASE, $KEY, $PROP, $log, 'S8 cancel ack');

// ---------- summary for the certification form ----------
echo "\n\n=============== FOR THE CERTIFICATION FORM ===============\n";
foreach ($log as [$step, $detail]) printf("%-16s %s\n", $step, $detail);
