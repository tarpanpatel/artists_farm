<?php
/**
 * The live webhook path, exercised with the envelope Channex actually POSTs and
 * a revision that really exists on the sandbox.
 *
 * Every earlier inbound test hand-built the receiver's INTERNAL shape and called
 * handleWebhook() directly, which is exactly how a receiver that rejects every
 * real delivery passed for days.
 */
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/channex/webhook_receiver.php';

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

$pdo->prepare("INSERT INTO channex_mappings (property_id, room_id, channex_property_id, channex_room_type_id, channex_rate_plan_id, sync_status)
               VALUES (1, NULL, ?, ?, ?, 'active')
               ON DUPLICATE KEY UPDATE channex_property_id = VALUES(channex_property_id)")->execute([$PROP, $RT, $RP]);

// Fresh booking on untouched dates so the overlap guard cannot mask the result.
$off  = rand(600, 900);
$day1 = date('Y-m-d', strtotime("2027-01-01 +$off days"));
$day4 = date('Y-m-d', strtotime("$day1 +3 days"));
$code = 'ENVLIVE-' . rand(10000, 99999);

$new = call('POST', "$BASE/bookings", $KEY, ['booking' => [
    'property_id' => $PROP, 'ota_name' => 'Offline', 'ota_reservation_code' => $code,
    'arrival_date' => $day1, 'departure_date' => $day4,
    'payment_collect' => 'property', 'currency' => 'USD',
    'customer' => ['name' => 'Envelope', 'surname' => 'Live', 'mail' => 'env@example.com'],
    'rooms' => [[
        'room_type_id' => $RT, 'rate_plan_id' => $RP,
        'days' => [
            $day1 => '150.00',
            date('Y-m-d', strtotime("$day1 +1 day")) => '150.00',
            date('Y-m-d', strtotime("$day1 +2 days")) => '150.00',
        ],
        'occupancy' => ['adults' => 2, 'children' => 0, 'infants' => 0],
    ]],
]]);
if ($new['code'] >= 300) { exit("create failed HTTP {$new['code']}: " . substr($new['raw'], 0, 300) . "\n"); }
$bid  = $new['json']['data']['id'];
$rev  = $new['json']['data']['attributes']['revision_id'];
echo "created booking $bid\n  revision $rev  ({$day1} -> {$day4}, 3 x 150.00 USD, 2 adults)\n\n";

// EXACTLY what Channex POSTs - ids only, no booking data.
$envelope = [
    'event' => 'booking',
    'payload' => ['booking_id' => $bid, 'property_id' => $PROP, 'revision_id' => $rev],
    'user_id' => null,
    'timestamp' => date('c'),
];

$rx  = new ChannexWebhookReceiver($pdo);
$res = $rx->handleWebhook($envelope);
echo "receiver: " . json_encode($res) . "\n\n";

// Prove it in the database, not from the return value.
$g = $pdo->prepare("SELECT id, guest_name, checkin_date, expected_checkout, status, no_of_guests, total_charge, pending_amount, ota_reservation_code FROM guests WHERE channex_booking_id = ?");
$g->execute([$bid]);
$guest = $g->fetch(PDO::FETCH_ASSOC);
echo "guest row:    " . ($guest ? json_encode($guest) : 'NONE') . "\n";

$r = $pdo->prepare("SELECT revision_id, action, ack_status, ack_attempts, acked_at FROM channex_booking_revisions WHERE channex_booking_id = ?");
$r->execute([$bid]);
$revRow = $r->fetch(PDO::FETCH_ASSOC);
echo "revision row: " . ($revRow ? json_encode($revRow) : 'NONE') . "\n\n";

$guestOk  = $guest && (float)$guest['total_charge'] === 450.00 && (int)$guest['no_of_guests'] === 2;
$ackedOk  = $revRow && $revRow['ack_status'] === 'ACKED' && !empty($revRow['acked_at']);

echo "envelope parsed & revision pulled: " . (($res['status'] ?? '') === 'success' ? "PASSED" : "FAILED") . "\n";
echo "guest persisted with real values:  " . ($guestOk ? "PASSED (450.00, 2 guests)" : "FAILED (" . json_encode($guest) . ")") . "\n";
echo "revision recorded and ACKED:       " . ($ackedOk ? "PASSED ({$revRow['acked_at']})" : "FAILED") . "\n";
echo "\n=== " . (($res['status'] ?? '') === 'success' && $guestOk && $ackedOk ? "PASSED" : "FAILED") . " ===\n";
