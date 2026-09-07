<?php
require_once __DIR__ . '/../php/config/database.php';

$stmt = $pdo->query("SELECT id, name, slug, property_type, default_tariff FROM properties WHERE parent_property_id IS NULL");
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
