<?php
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/channex/ChannexClient.php';

$client = new ChannexClient();

echo "=== Current channex_mappings rows ===\n";
$rows = $pdo->query('SELECT * FROM channex_mappings')->fetchAll(PDO::FETCH_ASSOC);
echo json_encode($rows, JSON_PRETTY_PRINT) . "\n\n";

echo "=== Current Channex Properties (GET /properties) ===\n";
$res = $client->get('properties', ['limit' => 100]);
$props = $res['data'] ?? [];
echo "Total Channex Properties: " . count($props) . "\n";
foreach ($props as $p) {
    echo " - ID: {$p['id']}, Title: '{$p['attributes']['title']}', Currency: {$p['attributes']['currency']}\n";
}
