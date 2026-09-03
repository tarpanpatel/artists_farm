<?php
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';

echo "=== Properties (1 vs 290409) ===\n";
$stmt = $pdo->query('SELECT id, name, property_type, tenant_id, default_tariff, currency, is_deleted, created_at FROM properties WHERE id IN (1, 290409)');
echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC), JSON_PRETTY_PRINT) . "\n\n";

echo "=== Guests Count by Property ===\n";
$g1 = $pdo->query('SELECT COUNT(*) FROM guests WHERE property_id = 1')->fetchColumn();
$g2 = $pdo->query('SELECT COUNT(*) FROM guests WHERE property_id = 290409')->fetchColumn();
echo "Property 1 guests: {$g1}\n";
echo "Property 290409 guests: {$g2}\n\n";

echo "=== Rate Rules Count by Property ===\n";
$r1 = $pdo->query('SELECT COUNT(*) FROM room_rate_rules WHERE property_id = 1')->fetchColumn();
$r2 = $pdo->query('SELECT COUNT(*) FROM room_rate_rules WHERE property_id = 290409')->fetchColumn();
echo "Property 1 rate rules: {$r1}\n";
echo "Property 290409 rate rules: {$r2}\n\n";

echo "=== Outbox Items Count by Property ===\n";
$o1 = $pdo->query('SELECT COUNT(*) FROM channex_outbox WHERE property_id = 1')->fetchColumn();
$o2 = $pdo->query('SELECT COUNT(*) FROM channex_outbox WHERE property_id = 290409')->fetchColumn();
echo "Property 1 outbox items: {$o1}\n";
echo "Property 290409 outbox items: {$o2}\n\n";

echo "=== Recent guests for Property 1 vs 290409 ===\n";
$recent1 = $pdo->query('SELECT id, guest_name, checkin_date, expected_checkout, status, created_at FROM guests WHERE property_id = 1 ORDER BY id DESC LIMIT 5')->fetchAll(PDO::FETCH_ASSOC);
echo "Recent Property 1 guests:\n" . json_encode($recent1, JSON_PRETTY_PRINT) . "\n";
$recent2 = $pdo->query('SELECT id, guest_name, checkin_date, expected_checkout, status, created_at FROM guests WHERE property_id = 290409 ORDER BY id DESC LIMIT 5')->fetchAll(PDO::FETCH_ASSOC);
echo "Recent Property 290409 guests:\n" . json_encode($recent2, JSON_PRETTY_PRINT) . "\n";

// Also check staff / properties associated
echo "\n=== Staff / Users assigned ===\n";
$staff1 = $pdo->query('SELECT id, username, role, property_id FROM staff WHERE property_id = 1')->fetchAll(PDO::FETCH_ASSOC);
echo "Staff on Property 1:\n" . json_encode($staff1, JSON_PRETTY_PRINT) . "\n";
$staff2 = $pdo->query('SELECT id, username, role, property_id FROM staff WHERE property_id = 290409')->fetchAll(PDO::FETCH_ASSOC);
echo "Staff on Property 290409:\n" . json_encode($staff2, JSON_PRETTY_PRINT) . "\n";
