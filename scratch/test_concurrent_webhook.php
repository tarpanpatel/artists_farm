<?php
chdir('c:/xampp/htdocs/artists_farm');
require_once 'php/config/database.php';
require_once 'php/channex/content_sync.php';

global $pdo;

echo "=== Task C: Genuine Concurrent Webhook Delivery Race Test ===\n";

ensureChannexMappingsSchema($pdo);
$testPropUUID = 'test-prop-race-' . uniqid();
$testRoomUUID = 'test-room-race-' . uniqid();
$testRateUUID = 'test-rate-race-' . uniqid();

$pdo->prepare("
    INSERT INTO channex_mappings (property_id, room_id, channex_property_id, channex_room_type_id, channex_rate_plan_id, sync_status)
    VALUES (1, NULL, ?, ?, ?, 'active')
    ON DUPLICATE KEY UPDATE channex_property_id = VALUES(channex_property_id)
")->execute([$testPropUUID, $testRoomUUID, $testRateUUID]);

$revId = 'rev-race-' . uniqid();
$bkgId = 'bkg-race-' . uniqid();
$dStart = '2027-11-15';
$dEnd = '2027-11-18';

$payload = [
    'booking_revision' => [
        'id' => $revId,
        'booking_id' => $bkgId,
        'property_id' => $testPropUUID,
        'room_type_id' => $testRoomUUID,
        'rate_plan_id' => $testRateUUID,
        'status' => 'new',
        'channel_name' => 'Airbnb',
        'arrival_date' => $dStart,
        'departure_date' => $dEnd,
        'amount' => '12000.00',
        'currency' => 'INR',
        'payment_collect' => 'property',
        'occupancy' => ['adults' => 2, 'children' => 0, 'infants' => 0],
        'customer' => [
            'name' => 'Concurrent Race Test',
            'phone' => '+91 9999999999',
            'country' => 'IN'
        ]
    ]
];

$payloadFile = __DIR__ . '/concurrent_payload.json';
file_put_contents($payloadFile, json_encode($payload));

// Spawn 2 parallel OS processes simultaneously
$phpBin = 'C:\\xampp\\php\\php.exe';
$workerScript = __DIR__ . '/concurrent_worker.php';

$descriptors = [
    0 => ['pipe', 'r'],
    1 => ['pipe', 'w'],
    2 => ['pipe', 'w']
];

echo "Spawning Process A and Process B simultaneously for revision: {$revId}...\n";

$pA = proc_open("\"$phpBin\" \"$workerScript\" \"$payloadFile\"", $descriptors, $pipesA);
$pB = proc_open("\"$phpBin\" \"$workerScript\" \"$payloadFile\"", $descriptors, $pipesB);

// Read outputs
$outA = stream_get_contents($pipesA[1]);
$errA = stream_get_contents($pipesA[2]);
fclose($pipesA[0]); fclose($pipesA[1]); fclose($pipesA[2]);
$exitA = proc_close($pA);

$outB = stream_get_contents($pipesB[1]);
$errB = stream_get_contents($pipesB[2]);
fclose($pipesB[0]); fclose($pipesB[1]); fclose($pipesB[2]);
$exitB = proc_close($pB);

echo "\n--- Process A Output (Exit $exitA) ---\n$outA\n";
if ($errA) echo "Process A Error: $errA\n";

echo "\n--- Process B Output (Exit $exitB) ---\n$outB\n";
if ($errB) echo "Process B Error: $errB\n";

$jsonA = json_decode($outA, true);
$jsonB = json_decode($outB, true);

// Verify database row counts
$guestCount = (int)$pdo->query("SELECT COUNT(*) FROM guests WHERE channex_booking_id = '{$bkgId}'")->fetchColumn();
$revCount = (int)$pdo->query("SELECT COUNT(*) FROM channex_booking_revisions WHERE revision_id = '{$revId}'")->fetchColumn();

echo "\n--- Database Verification ---\n";
echo "Guest rows in DB for booking: {$guestCount} (Expected: 1)\n";
echo "Revision rows in DB: {$revCount} (Expected: 1)\n";

$bothSuccess = ($jsonA['status'] ?? '') === 'success' && ($jsonB['status'] ?? '') === 'success';
$noDuplicateGuest = $guestCount === 1;
$noDuplicateRev = $revCount === 1;

if ($bothSuccess && $noDuplicateGuest && $noDuplicateRev) {
    echo "\n=== Task C Result: PASSED (PROVED both concurrent processes returned 200 success without duplicate records or 500 error) ===\n";
} else {
    echo "\n=== Task C Result: FAILED ===\n";
}

// Cleanup
@unlink($payloadFile);
$pdo->exec("DELETE FROM guests WHERE channex_booking_id = '{$bkgId}'");
$pdo->exec("DELETE FROM channex_booking_revisions WHERE revision_id = '{$revId}'");
$pdo->exec("DELETE FROM channex_mappings WHERE channex_property_id = '{$testPropUUID}'");
$pdo->exec("DELETE FROM channex_outbox WHERE property_id = 1 AND date_from = '{$dStart}'");
