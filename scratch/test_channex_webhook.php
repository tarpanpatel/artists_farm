<?php
require_once __DIR__ . '/../php/config/database.php';
require_once __DIR__ . '/../php/channex/webhook_receiver.php';
require_once __DIR__ . '/../php/channex/content_sync.php';

global $pdo;

echo "=== Testing Channex Inbound Webhook Receiver ===\n";

// Ensure property 1 has a mapping in channex_mappings
ensureChannexMappingsSchema($pdo);
$pdo->exec("DELETE FROM guests WHERE guest_name LIKE '%(Channex Test)%'");
$pdo->exec("DELETE FROM channex_booking_revisions WHERE ota_source = 'Airbnb'");

$testPropUUID = 'test-prop-uuid-' . uniqid();
$testRoomUUID = 'test-room-uuid-' . uniqid();
$testRateUUID = 'test-rate-uuid-' . uniqid();

$pdo->prepare("
    INSERT INTO channex_mappings (property_id, room_id, channex_property_id, channex_room_type_id, channex_rate_plan_id, sync_status)
    VALUES (1, NULL, ?, ?, ?, 'active')
    ON DUPLICATE KEY UPDATE channex_property_id = VALUES(channex_property_id)
")->execute([$testPropUUID, $testRoomUUID, $testRateUUID]);

$receiver = new ChannexWebhookReceiver($pdo);

// 1. Inbound New Booking Test
$revId1 = 'rev-1001-' . uniqid();
$bkgId1 = 'bkg-2001-' . uniqid();
$payload1 = [
    'booking_revision' => [
        'id' => $revId1,
        'booking_id' => $bkgId1,
        'property_id' => $testPropUUID,
        'room_type_id' => $testRoomUUID,
        'rate_plan_id' => $testRateUUID,
        'status' => 'new',
        'channel_name' => 'Airbnb',
        'arrival_date' => '2026-12-01',
        'departure_date' => '2026-12-05',
        'amount' => 1400000, // ₹14,000
        'occupancy' => 2,
        'customer' => [
            'name' => 'John Doe (Channex Test)',
            'phone' => '+91 9876543210',
        ]
    ]
];

$res1 = $receiver->handleWebhook($payload1);
echo "1. New Booking Ingestion: " . ($res1['status'] === 'success' ? "PASSED (PROVED guest_id={$res1['guest_id']})" : "FAILED") . "\n";
if ($res1['status'] !== 'success') {
    echo "   Error Details: " . json_encode($res1) . "\n";
}

// Verify Guest in DB
$guest1 = $pdo->query("SELECT id, guest_name, total_charge, status, channex_booking_id FROM guests WHERE channex_booking_id = '{$bkgId1}'")->fetch(PDO::FETCH_ASSOC);
echo "   Verified DB Guest: Name={$guest1['guest_name']}, Amount=₹{$guest1['total_charge']}, Status={$guest1['status']}\n";

// 2. Idempotency Test (Redeliver identical revision)
$res2 = $receiver->handleWebhook($payload1);
$countGuests = $pdo->query("SELECT COUNT(*) FROM guests WHERE channex_booking_id = '{$bkgId1}'")->fetchColumn();
echo "2. Idempotency on Redelivery: " . ($res2['status'] === 'success' && (int)$countGuests === 1 ? "PASSED (PROVED 1 row only)" : "FAILED") . "\n";

// 3. Modification Test (Revision with new dates: 2026-12-02 to 2026-12-07)
$revId2 = 'rev-1002-' . uniqid();
$payload2 = [
    'booking_revision' => [
        'id' => $revId2,
        'booking_id' => $bkgId1,
        'property_id' => $testPropUUID,
        'room_type_id' => $testRoomUUID,
        'status' => 'modified',
        'channel_name' => 'Airbnb',
        'arrival_date' => '2026-12-02',
        'departure_date' => '2026-12-07',
        'amount' => 1750000, // ₹17,500
        'occupancy' => 2,
        'customer' => [
            'name' => 'John Doe (Channex Test)',
            'phone' => '+91 9876543210',
        ]
    ]
];

$res3 = $receiver->handleWebhook($payload2);
$guestMod = $pdo->query("SELECT checkin_date, expected_checkout, total_charge FROM guests WHERE channex_booking_id = '{$bkgId1}'")->fetch(PDO::FETCH_ASSOC);
$newCheckoutDate = substr($guestMod['expected_checkout'] ?? '', 0, 10);
echo "3. Date Modification: " . ($res3['status'] === 'success' && $newCheckoutDate === '2026-12-07' ? "PASSED (PROVED new checkout={$newCheckoutDate}, Amount=₹{$guestMod['total_charge']})" : "FAILED (res: " . json_encode($res3) . ")") . "\n";

// 4. Cancellation Test
$revId3 = 'rev-1003-' . uniqid();
$payload3 = [
    'booking_revision' => [
        'id' => $revId3,
        'booking_id' => $bkgId1,
        'property_id' => $testPropUUID,
        'room_type_id' => $testRoomUUID,
        'status' => 'cancelled',
    ]
];

$res4 = $receiver->handleWebhook($payload3);
$guestCan = $pdo->query("SELECT status FROM guests WHERE channex_booking_id = '{$bkgId1}'")->fetchColumn();
echo "4. Cancellation: " . ($res4['status'] === 'success' && $guestCan === 'Cancelled' ? "PASSED (PROVED status={$guestCan})" : "FAILED") . "\n";

// Clean up test records
$pdo->exec("DELETE FROM guests WHERE channex_booking_id = '{$bkgId1}'");
$pdo->exec("DELETE FROM channex_booking_revisions WHERE channex_booking_id = '{$bkgId1}'");
$pdo->exec("DELETE FROM channex_mappings WHERE channex_property_id = '{$testPropUUID}'");
$pdo->exec("DELETE FROM channex_outbox WHERE property_id = 1 AND date_from IN ('2026-12-01', '2026-12-02')");

echo "=== Inbound Webhook Tests Complete ===\n";
