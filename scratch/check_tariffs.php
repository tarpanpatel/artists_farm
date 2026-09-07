<?php
require_once __DIR__ . '/../php/config/database.php';

$stmt = $pdo->prepare("SELECT id, name, slug, default_tariff, pricing_mode FROM properties WHERE parent_property_id = 290230 OR id = 290230");
$stmt->execute();
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
