<?php
require_once __DIR__ . '/../php/config/database.php';

$stmt = $pdo->prepare("SELECT id, name, slug, parent_property_id, default_tariff, pricing_mode FROM properties WHERE slug LIKE '%patel%' OR name LIKE '%patel%' OR parent_property_id IN (SELECT id FROM properties WHERE slug LIKE '%patel%' OR name LIKE '%patel%')");
$stmt->execute();
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
