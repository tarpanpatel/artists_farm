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
        // Real Channex shape, verified against the live sandbox 30 Aug 2026:
        // amount is a decimal string in MAJOR units, occupancy is an object,
        // and room_type_id lives inside rooms[]. The old fixture invented a
        // minor-unit integer and a scalar occupancy, so it happily passed while
        // real bookings landed at 1/100th value with one guest.
        'amount' => '14000.00',
        'currency' => 'INR',
        'payment_collect' => 'property',
        'arrival_hour' => '15:00',
        'notes' => 'Need early checkin',
        'occupancy' => ['adults' => 2, 'children' => 0, 'infants' => 0],
        'rooms' => [[
            'room_type_id' => $testRoomUUID,
            'rate_plan_id' => $testRateUUID,
            'amount' => '14000.00',
            'occupancy' => ['adults' => 2, 'children' => 0, 'infants' => 0],
        ]],
        'customer' => [
            'name' => 'John Doe (Channex Test)',
            'phone' => '+91 9876543210',
            'country' => 'US',
        ]
    ]
];

$res1 = $receiver->handleWebhook($payload1);
echo "1. New Booking Ingestion: " . ($res1['status'] === 'success' ? "PASSED (PROVED guest_id={$res1['guest_id']})" : "FAILED") . "\n";
if ($res1['status'] !== 'success') {
    echo "   Error Details: " . json_encode($res1) . "\n";
}

// Verify Guest in DB
$guest1 = $pdo->query("SELECT id, guest_name, total_charge, advance_paid, pending_amount, no_of_guests, adults, children, base_room_rent, per_night_charges, total_days, is_foreign_guest, notes, guest_notes, status, channex_booking_id FROM guests WHERE channex_booking_id = '{$bkgId1}'")->fetch(PDO::FETCH_ASSOC);
echo "   Verified DB Guest: Name={$guest1['guest_name']}, Amount=₹{$guest1['total_charge']}, Status={$guest1['status']}\n";

// Assertions on money, headcount, tariff breakdown, compliance, and notes
$amountOk = (float)$guest1['total_charge'] === 14000.00;
$guestsOk = (int)$guest1['no_of_guests'] === 2;
$splitOk = (float)$guest1['advance_paid'] === 0.00 && (float)$guest1['pending_amount'] === 14000.00;
$adultsChildOk = (int)$guest1['adults'] === 2 && (int)$guest1['children'] === 0;
$tariffOk = (float)$guest1['base_room_rent'] === 14000.00 && (int)$guest1['total_days'] === 4 && (float)$guest1['per_night_charges'] === 3500.00;
$foreignOk = (int)$guest1['is_foreign_guest'] === 1;
$notesOk = strpos($guest1['notes'] ?? '', 'Arrival: 15:00') !== false && strpos($guest1['notes'] ?? '', 'Need early checkin') !== false;

echo "1b. Amount parsed as major units: " . ($amountOk ? "PASSED (₹14000.00)" : "FAILED (got ₹{$guest1['total_charge']}, expected ₹14000.00)") . "\n";
echo "1c. Occupancy object -> headcount: " . ($guestsOk ? "PASSED (2 guests)" : "FAILED (got {$guest1['no_of_guests']}, expected 2)") . "\n";
echo "1d. payment_collect=property -> due on arrival: " . ($splitOk ? "PASSED (advance 0, pending 14000)" : "FAILED (advance {$guest1['advance_paid']}, pending {$guest1['pending_amount']})") . "\n";
echo "1e. Adults & Children mapped: " . ($adultsChildOk ? "PASSED (adults={$guest1['adults']}, children={$guest1['children']})" : "FAILED (adults={$guest1['adults']}, children={$guest1['children']})") . "\n";
echo "1f. Tariff breakdown (base, total_days, per_night): " . ($tariffOk ? "PASSED (base=₹{$guest1['base_room_rent']}, days={$guest1['total_days']}, per_night=₹{$guest1['per_night_charges']})" : "FAILED (base=₹{$guest1['base_room_rent']}, days={$guest1['total_days']}, per_night=₹{$guest1['per_night_charges']})") . "\n";
echo "1g. Foreign guest flag from customer.country: " . ($foreignOk ? "PASSED (is_foreign_guest=1)" : "FAILED (is_foreign_guest={$guest1['is_foreign_guest']})") . "\n";
echo "1h. Arrival hour & notes formatted: " . ($notesOk ? "PASSED ({$guest1['notes']})" : "FAILED (got: {$guest1['notes']})") . "\n";

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
        'amount' => '17500.00',
        'currency' => 'INR',
        'payment_collect' => 'property',
        'occupancy' => ['adults' => 2, 'children' => 1, 'infants' => 0],
        'rooms' => [[
            'room_type_id' => $testRoomUUID,
            'amount' => '17500.00',
            'occupancy' => ['adults' => 2, 'children' => 1, 'infants' => 0],
        ]],
        'customer' => [
            'name' => 'John Doe (Channex Test)',
            'phone' => '+91 9876543210',
            'country' => 'US',
        ]
    ]
];

$res3 = $receiver->handleWebhook($payload2);
$guestMod = $pdo->query("SELECT checkin_date, expected_checkout, total_charge, advance_paid, pending_amount, no_of_guests, adults, children, base_room_rent, per_night_charges, total_days FROM guests WHERE channex_booking_id = '{$bkgId1}'")->fetch(PDO::FETCH_ASSOC);
$newCheckoutDate = substr($guestMod['expected_checkout'] ?? '', 0, 10);
echo "3. Date Modification: " . ($res3['status'] === 'success' && $newCheckoutDate === '2026-12-07' ? "PASSED (PROVED new checkout={$newCheckoutDate}, Amount=₹{$guestMod['total_charge']})" : "FAILED (res: " . json_encode($res3) . ")") . "\n";

$modOk = (float)$guestMod['total_charge'] === 17500.00
    && (float)$guestMod['pending_amount'] === 17500.00
    && (int)$guestMod['no_of_guests'] === 3
    && (int)$guestMod['adults'] === 2
    && (int)$guestMod['children'] === 1
    && (float)$guestMod['base_room_rent'] === 17500.00
    && (int)$guestMod['total_days'] === 5
    && (float)$guestMod['per_night_charges'] === 3500.00;
echo "3b. Modification repriced & updated tariff: " . ($modOk ? "PASSED (₹17500 pending, 3 guests, 5 days @ ₹3500/night)" : "FAILED") . "\n";

// 3c. A modification must not wipe a note staff typed after the booking landed.
$pdo->prepare("UPDATE guests SET notes = ? WHERE channex_booking_id = ?")
    ->execute(['STAFF: guest wants early breakfast', $bkgId1]);
$revId2b = 'rev-1002b-' . uniqid();
$payload2b = $payload2['booking_revision'];
$payload2b['id'] = $revId2b;
$payload2b['arrival_hour'] = '18:00';
$payload2b['notes'] = 'OTA note that must not clobber the staff note';
$receiver->handleWebhook(['booking_revision' => $payload2b]);
$notesAfter = $pdo->query("SELECT notes FROM guests WHERE channex_booking_id = '{$bkgId1}'")->fetchColumn();
$notesPreserved = strpos((string)$notesAfter, 'STAFF: guest wants early breakfast') !== false;
echo "3c. Staff notes survive an OTA modification: " . ($notesPreserved ? "PASSED (staff note intact)" : "FAILED (notes now: {$notesAfter})") . "\n";

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
