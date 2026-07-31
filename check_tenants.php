<?php
try {
    $pdo = new PDO('mysql:host=localhost;dbname=artists_farm_resort;charset=utf8mb4', 'root', '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);

    echo "=== Tenants Table ===\n";
    $cols = $pdo->query("DESCRIBE tenants")->fetchAll();
    foreach($cols as $col) {
        echo $col['Field'] . " (" . $col['Type'] . ")\n";
    }

    echo "\n=== Tenant Users Table ===\n";
    $cols = $pdo->query("DESCRIBE tenant_users")->fetchAll();
    foreach($cols as $col) {
        echo $col['Field'] . " (" . $col['Type'] . ")\n";
    }

    echo "\n=== Staff Users Table ===\n";
    $cols = $pdo->query("DESCRIBE staff_users")->fetchAll();
    foreach($cols as $col) {
        echo $col['Field'] . " (" . $col['Type'] . ")\n";
    }

    echo "\n=== Sample Data ===\n";
    echo "Tenants:\n";
    $tenants = $pdo->query("SELECT * FROM tenants LIMIT 3")->fetchAll();
    foreach($tenants as $t) {
        echo json_encode($t) . "\n";
    }

    echo "\nProperties:\n";
    $props = $pdo->query("SELECT * FROM properties LIMIT 3")->fetchAll();
    foreach($props as $p) {
        echo json_encode($p) . "\n";
    }

} catch(Exception $e) {
    echo "Error: " . $e->getMessage();
}
