<?php
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';

$stmt = $pdo->query("SELECT id, name, room_id, check_in, check_out, status, ota_source, ota_reservation_code, is_dummy, property_id FROM guests WHERE property_id = 2 ORDER BY check_in ASC");
$guests = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "Total guests in Patel Colony (prop 2): " . count($guests) . "\n";
foreach ($guests as $g) {
    echo "ID: {$g['id']} | Room: {$g['room_id']} | Name: {$g['name']} | In: {$g['check_in']} | Out: {$g['check_out']} | Status: {$g['status']} | OTA: {$g['ota_source']} | Dummy: {$g['is_dummy']}\n";
}

$roomsStmt = $pdo->query("SELECT id, room_number, name FROM rooms WHERE property_id = 2");
$rooms = $roomsStmt->fetchAll(PDO::FETCH_ASSOC);
echo "\nRooms for Patel Colony:\n";
foreach ($rooms as $r) {
    echo "ID: {$r['id']} | Number: {$r['room_number']} | Name: {$r['name']}\n";
}
