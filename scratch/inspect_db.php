<?php
require_once __DIR__ . '/../php/config/database.php';

// 1. Check property and rooms
$stmt = $pdo->prepare("SELECT id, name, slug, parent_property_id, property_type, default_tariff, pricing_mode FROM properties WHERE slug = 'patel-colony' OR parent_property_id = (SELECT id FROM properties WHERE slug = 'patel-colony')");
$stmt->execute();
$props = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo "PROPERTIES / ROOMS:\n";
print_r($props);

// 2. Check guests table columns
$colStmt = $pdo->query("DESCRIBE guests");
echo "\nGUESTS COLUMNS:\n";
foreach ($colStmt->fetchAll(PDO::FETCH_ASSOC) as $c) {
    echo $c['Field'] . " (" . $c['Type'] . ")\n";
}

// 3. Check actual bookings in guests table
$gStmt = $pdo->prepare("SELECT id, guest_name, property_id, room_id, checkin_date, expected_checkout, status, total_charge, base_room_rent FROM guests WHERE checkin_date >= '2026-09-01' LIMIT 20");
$gStmt->execute();
echo "\nRECENT GUESTS:\n";
print_r($gStmt->fetchAll(PDO::FETCH_ASSOC));

// 4. Check rate rules / room rates
$rStmt = $pdo->query("SELECT * FROM room_rate_rules LIMIT 20");
echo "\nROOM RATE RULES:\n";
print_r($rStmt->fetchAll(PDO::FETCH_ASSOC));
