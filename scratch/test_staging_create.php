<?php
$ch = curl_init('https://staging.ground-code.com/php/api/router.php?action=create_public_booking');
$payload = json_encode([
    'property_id' => 290476,
    'room_id' => 290478,
    'guest_name' => 'Tarpan Patel',
    'phone' => '9571263474',
    'email' => 'tarpan@example.com',
    'checkin_date' => '2026-10-20',
    'checkout_date' => '2026-10-22',
    'num_guests' => 2,
    'payment_method' => 'Pay on Arrival (Cash / UPI / Card)'
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$res = curl_exec($ch);
echo $res;
