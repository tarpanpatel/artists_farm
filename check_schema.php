<?php
try {
    $pdo = new PDO('mysql:host=localhost;dbname=artists_farm_resort;charset=utf8mb4', 'root', '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);

    $tables = $pdo->query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'artists_farm_resort' ORDER BY TABLE_NAME")->fetchAll();

    echo "=== Existing Tables ===\n";
    foreach($tables as $row) {
        echo $row['TABLE_NAME'] . "\n";
    }

    echo "\n=== Users Table Structure ===\n";
    $columns = $pdo->query("DESCRIBE users")->fetchAll();
    foreach($columns as $col) {
        echo $col['Field'] . " (" . $col['Type'] . ")\n";
    }

    echo "\n=== Checking for tenants/properties association ===\n";
    $check = $pdo->query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'artists_farm_resort' AND TABLE_NAME IN ('tenants', 'user_properties', 'property_managers')")->fetchAll();
    if(count($check) > 0) {
        foreach($check as $t) {
            echo "Found: " . $t['TABLE_NAME'] . "\n";
        }
    } else {
        echo "No tenant/user-property mapping tables found\n";
    }

} catch(Exception $e) {
    echo "Error: " . $e->getMessage();
}
