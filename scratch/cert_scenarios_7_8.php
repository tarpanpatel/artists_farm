<?php
/**
 * Certification scenarios 7 & 8, run through THIS PMS's real ingestion code
 * (ChannexWebhookReceiver), not raw API calls:
 *   7. new booking  -> ingest -> guest row created -> ACK
 *   8. modification -> ingest -> guest updated     -> ACK
 *      cancellation -> ingest -> guest cancelled   -> ACK
 *
 * The unlock was ota_name = "Offline"; every OTA-style name 500s.
 * Records booking/revision ids and ACK outcomes for the certification form.
 */
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/config/schema_cache.php';
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

$receiver = new ChannexWebhookReceiver($pdo);
$evidence = [];
$code = 'CERT-' . substr((string)time(), -5);

// Ensure local mapping exists for the certification staging sandbox property
$pdo->prepare("
    INSERT INTO channex_mappings (property_id, room_id, channex_property_id, channex_room_type_id, channex_rate_plan_id, sync_status)
    VALUES (1, NULL, ?, ?, ?, 'active')
    ON DUPLICATE KEY UPDATE channex_property_id = VALUES(channex_property_id), channex_room_type_id = VALUES(channex_room_type_id), channex_rate_plan_id = VALUES(channex_rate_plan_id)
")->execute([$PROP, $RT, $RP]);

// Clean any previous test rows for this reservation code
$pdo->prepare("DELETE FROM guests WHERE ota_reservation_code = ?")->execute([$code]);

/** Fetch the revision / booking fresh and hand it to our receiver exactly as a webhook would. */
function ingest(string $base, string $key, string $bookingId, ChannexWebhookReceiver $rx, string $label, array &$ev): void {
    $b = call('GET', "$base/bookings/$bookingId", $key);
    $attrs = $b['json']['data']['attributes'] ?? [];
    $revId = $attrs['revision_id'] ?? null;
    echo "   revision: " . ($revId ?: 'NONE') . "  status=" . ($attrs['status'] ?? '?') . "\n";
    if (!$revId) { $ev[] = "$label | NO REVISION"; return; }

    // Also fetch the full revision by ID from /booking_revisions/:id to match exact webhook shape
    $revCall = call('GET', "$base/booking_revisions/$revId", $key);
    $revAttrs = $revCall['json']['data']['attributes'] ?? $attrs;

    $res = $rx->handleWebhook(['booking_revision' => array_merge($revAttrs, [
        'id'         => $revId,
        'booking_id' => $bookingId,
        'booking'    => array_merge($revAttrs, ['id' => $bookingId]),
    ])]);
    echo "   receiver: " . json_encode($res) . "\n";
    $ev[] = "$label | booking=$bookingId revision=$revId receiver=" . ($res['status'] ?? '?');
}

// Fresh unique future dates in 2027
$dateOffset = rand(100, 300);
$day1 = date('Y-m-d', strtotime("2027-01-01 +$dateOffset days"));
$day2 = date('Y-m-d', strtotime("$day1 +1 day"));
$day3 = date('Y-m-d', strtotime("$day1 +2 days"));
$day4 = date('Y-m-d', strtotime("$day1 +3 days"));
$day5 = date('Y-m-d', strtotime("$day1 +4 days"));

// ---------- SCENARIO 7 ----------
echo "=== SCENARIO 7: new booking ($day1 to $day4) ===\n";
$new = call('POST', "$BASE/bookings", $KEY, ['booking' => [
    'property_id' => $PROP, 'ota_name' => 'Offline',
    'ota_reservation_code' => $code,
    'arrival_date' => $day1, 'departure_date' => $day4,
    'payment_collect' => 'property', 'currency' => 'USD',
    'customer' => ['name' => 'Cert', 'surname' => 'Guest', 'mail' => 'cert@example.com', 'phone' => '+1234567890'],
    'rooms' => [[
        'room_type_id' => $RT, 'rate_plan_id' => $RP,
        'days' => [$day1 => '120.00', $day2 => '120.00', $day3 => '120.00'],
        'occupancy' => ['adults' => 2, 'children' => 0, 'infants' => 0],
    ]],
]]);
echo "POST /bookings -> HTTP {$new['code']}\n";
if ($new['code'] >= 300) { echo substr($new['raw'], 0, 400) . "\n"; exit(1); }
$bid = $new['json']['data']['id'];
echo "booking: $bid  (ota_reservation_code $code)\n";
ingest($BASE, $KEY, $bid, $receiver, 'S7 new', $evidence);

// ---------- SCENARIO 8a: modification ----------
echo "\n=== SCENARIO 8a: modification (extend by one night: $day1 to $day5) ===\n";
$mod = call('PUT', "$BASE/bookings/$bid", $KEY, ['booking' => [
    'property_id' => $PROP, 'ota_name' => 'Offline',
    'ota_reservation_code' => $code,
    'arrival_date' => $day1, 'departure_date' => $day5,
    'payment_collect' => 'property', 'currency' => 'USD',
    'customer' => ['name' => 'Cert', 'surname' => 'Guest', 'mail' => 'cert@example.com', 'phone' => '+1234567890'],
    'rooms' => [[
        'room_type_id' => $RT, 'rate_plan_id' => $RP,
        'days' => [$day1 => '120.00', $day2 => '120.00', $day3 => '120.00', $day4 => '120.00'],
        'occupancy' => ['adults' => 2, 'children' => 0, 'infants' => 0],
    ]],
]]);
echo "PUT -> HTTP {$mod['code']}\n";
ingest($BASE, $KEY, $bid, $receiver, 'S8 modify', $evidence);

// ---------- SCENARIO 8b: cancellation ----------
echo "\n=== SCENARIO 8b: cancellation ===\n";
$can = call('PUT', "$BASE/bookings/$bid", $KEY, ['booking' => [
    'status' => 'cancelled',
    'property_id' => $PROP, 'ota_name' => 'Offline',
    'ota_reservation_code' => $code,
    'arrival_date' => $day1, 'departure_date' => $day5,
    'payment_collect' => 'property', 'currency' => 'USD',
    'customer' => ['name' => 'Cert', 'surname' => 'Guest', 'mail' => 'cert@example.com', 'phone' => '+1234567890'],
    'rooms' => [[
        'room_type_id' => $RT, 'rate_plan_id' => $RP,
        'days' => [$day1 => '120.00', $day2 => '120.00', $day3 => '120.00', $day4 => '120.00'],
        'occupancy' => ['adults' => 2, 'children' => 0, 'infants' => 0],
    ]],
]]);
echo "PUT cancelled -> HTTP {$can['code']}\n";
ingest($BASE, $KEY, $bid, $receiver, 'S8 cancel', $evidence);

// ---------- what actually landed locally ----------
echo "\n=== local result ===\n";
$g = $pdo->prepare("SELECT id, guest_name, checkin_date, expected_checkout, status, channex_booking_id, ota_reservation_code FROM guests WHERE channex_booking_id = ?");
$g->execute([$bid]);
$guest = $g->fetch(PDO::FETCH_ASSOC);
echo 'guest row: ' . ($guest ? json_encode($guest) : 'NONE') . "\n";

$r = $pdo->prepare("SELECT revision_id, action, ack_status, ack_attempts, acked_at FROM channex_booking_revisions WHERE channex_booking_id = ? ORDER BY id ASC");
$r->execute([$bid]);
foreach ($r->fetchAll(PDO::FETCH_ASSOC) as $row) echo '  revision: ' . json_encode($row) . "\n";

echo "\n=== EVIDENCE FOR CERTIFICATION FORM ===\n";
foreach ($evidence as $e) echo "  $e\n";
