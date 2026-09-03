<?php
chdir('c:/xampp/htdocs/artists_farm');
require_once 'php/config/database.php';
require_once 'php/channex/ChannexClient.php';
require_once 'php/channex/ChannexAdapter.php';
require_once 'php/channex/webhook_receiver.php';
require_once 'php/channex/ari_drain_worker.php';
require_once 'php/channex/outbox.php';

global $pdo;

$client = new ChannexClient();
$adapter = new ChannexAdapter($pdo, $client);
$receiver = new ChannexWebhookReceiver($pdo, $adapter);
$worker = new AriDrainWorker($pdo, $adapter);

$PROP = '4286428a-5561-4508-bd28-1f9ae55d8795';
$RT = '4ca732c0-6f4f-457c-9c48-396f3d784590';
$RP = '2d0dfacb-0239-4ec9-9eba-f6962ff3ecd8';

// Ensure mapping
$pdo->prepare("
    INSERT INTO channex_mappings (property_id, room_id, channex_property_id, channex_room_type_id, channex_rate_plan_id, sync_status)
    VALUES (1, NULL, ?, ?, ?, 'active')
    ON DUPLICATE KEY UPDATE channex_property_id = VALUES(channex_property_id), channex_room_type_id = VALUES(channex_room_type_id), channex_rate_plan_id = VALUES(channex_rate_plan_id)
")->execute([$PROP, $RT, $RP]);

// Fresh unique future dates
$dStart = '2027-10-10';
$dEnd = '2027-10-14'; // 4 nights: 10, 11, 12, 13
$code = 'TASK-B-' . rand(1000, 9999);

echo "=== Task B: Full Cancellation -> Availability Release Lifecycle ===\n";

// Step 0: Ensure initial availability is 1
echo "0. Setting baseline availability = 1 on Channex for {$dStart} to {$dEnd}...\n";
$initPush = $adapter->pushAvailability(1, null, [
    ['date_from' => $dStart, 'date_to' => '2027-10-13', 'availability' => 1]
]);
echo "   Baseline Push HTTP: " . ($initPush['http_code'] ?? 0) . "\n";
sleep(1);

// Step 1: Create booking and ingest
echo "1. Creating booking on Channex for {$dStart} to {$dEnd}...\n";
$bkgRes = $client->post('bookings', [
    'booking' => [
        'property_id' => $PROP,
        'ota_name' => 'Offline',
        'ota_reservation_code' => $code,
        'arrival_date' => $dStart,
        'departure_date' => $dEnd,
        'payment_collect' => 'property',
        'currency' => 'USD',
        'customer' => ['name' => 'TaskB', 'surname' => 'Guest', 'mail' => 'taskb@example.com', 'phone' => '+1234567890'],
        'rooms' => [[
            'room_type_id' => $RT,
            'rate_plan_id' => $RP,
            'days' => [
                '2027-10-10' => '120.00',
                '2027-10-11' => '120.00',
                '2027-10-12' => '120.00',
                '2027-10-13' => '120.00'
            ],
            'occupancy' => ['adults' => 2, 'children' => 0, 'infants' => 0],
        ]],
    ]
]);
$bid = $bkgRes['data']['id'] ?? null;
$revId1 = $bkgRes['data']['attributes']['revision_id'] ?? null;
echo "   Booking created: {$bid}, Revision 1: {$revId1}\n";

$revData1 = $client->get("booking_revisions/{$revId1}")['data']['attributes'] ?? [];
$ingest1 = $receiver->handleWebhook(['booking_revision' => array_merge($revData1, ['id' => $revId1, 'booking_id' => $bid, 'booking' => array_merge($revData1, ['id' => $bid])])]);
echo "   Ingest new booking: " . json_encode($ingest1) . "\n";

// Drain outbox to push availability 0
echo "2. Draining outbox to push booked availability (0)...\n";
$drain1 = $worker->processBatch();
echo "   Drain worker: processed {$drain1['processed']} outbox item(s)\n";
sleep(2);

// Check Channex readback
echo "2b. Reading back availability from Channex...\n";
$availRead1 = $client->get('availability', [
    'filter[property_id]' => $PROP,
    'filter[date][gte]' => $dStart,
    'filter[date][lte]' => '2027-10-13'
]);
$availValues1 = $availRead1['data'][$RT] ?? $availRead1['data'] ?? [];
echo "   Channex availability after booking:\n   " . json_encode($availValues1) . "\n";

// Step 3: Cancel the booking
echo "\n3. Cancelling booking on Channex...\n";
$canRes = $client->put("bookings/{$bid}", [
    'booking' => [
        'status' => 'cancelled',
        'property_id' => $PROP,
        'ota_name' => 'Offline',
        'ota_reservation_code' => $code,
        'arrival_date' => $dStart,
        'departure_date' => $dEnd,
        'payment_collect' => 'property',
        'currency' => 'USD',
        'customer' => ['name' => 'TaskB', 'surname' => 'Guest', 'mail' => 'taskb@example.com', 'phone' => '+1234567890'],
        'rooms' => [[
            'room_type_id' => $RT,
            'rate_plan_id' => $RP,
            'days' => [
                '2027-10-10' => '120.00',
                '2027-10-11' => '120.00',
                '2027-10-12' => '120.00',
                '2027-10-13' => '120.00'
            ],
            'occupancy' => ['adults' => 2, 'children' => 0, 'infants' => 0],
        ]],
    ]
]);
$getAfterCan = $client->get("bookings/{$bid}");
$revId2 = $getAfterCan['data']['attributes']['revision_id'] ?? null;
echo "   Cancelled on Channex, Revision 2: {$revId2}\n";

$revData2 = $client->get("booking_revisions/{$revId2}")['data']['attributes'] ?? [];
$ingest2 = $receiver->handleWebhook(['booking_revision' => array_merge($revData2, ['id' => $revId2, 'booking_id' => $bid, 'booking' => array_merge($revData2, ['id' => $bid])])]);
echo "   Ingest cancellation: " . json_encode($ingest2) . "\n";

// Step 4: Run drain worker
echo "4. Draining outbox to push restored availability (1)...\n";
$drain2 = $worker->processBatch();
echo "   Drain worker: processed {$drain2['processed']} outbox item(s)\n";

// Check outbox row in DB
$outboxRow = $pdo->query("SELECT id, kind, date_from, date_to, status, task_id FROM channex_outbox WHERE property_id = 1 AND date_from = '{$dStart}' ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
echo "   Outbox row state: " . json_encode($outboxRow) . "\n";
sleep(2);

// Step 5: Read back availability from Channex
echo "5. Reading back availability from Channex after cancellation...\n";
$availRead2 = $client->get('availability', [
    'filter[property_id]' => $PROP,
    'filter[date][gte]' => $dStart,
    'filter[date][lte]' => '2027-10-13'
]);
$availValues2 = $availRead2['data'][$RT] ?? $availRead2['data'] ?? [];
echo "   Channex availability after cancellation:\n   " . json_encode($availValues2) . "\n";

$allRestored = true;
foreach (['2027-10-10', '2027-10-11', '2027-10-12', '2027-10-13'] as $date) {
    if (($availValues2[$date] ?? 0) != 1) {
        $allRestored = false;
    }
}

echo "\n=== Task B Result: " . ($allRestored ? "PASSED (PROVED nights released back to 1)" : "FAILED") . " ===\n";
