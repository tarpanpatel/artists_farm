<?php
require 'php/config/database.php';
$pdo = getDBConnection();
$stmt = $pdo->query('DESCRIBE properties');
$cols = $stmt->fetchAll(PDO::FETCH_ASSOC);
foreach ($cols as $c) {
    echo $c['Field'] . ' | ' . $c['Type'] . PHP_EOL;
}
