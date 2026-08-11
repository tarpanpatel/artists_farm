<?php
require 'php/config/database.php';
$pdo = getDBConnection();
$stmt = $pdo->query("SELECT id, name, slug FROM properties WHERE slug LIKE '%jaipur%' OR name LIKE '%jaipur%'");
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
foreach ($rows as $r) {
    echo $r['id'] . ' | ' . $r['name'] . ' | ' . $r['slug'] . PHP_EOL;
}
