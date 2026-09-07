<?php
require_once __DIR__ . '/../php/config/database.php';
require_once __DIR__ . '/../php/channex/ChannexClient.php';

$stmt = $pdo->prepare("SELECT * FROM channex_mappings");
$stmt->execute();
$mappings = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo "CHANNEX MAPPINGS IN DB:\n";
print_r($mappings);
