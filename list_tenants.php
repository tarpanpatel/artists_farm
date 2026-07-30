<?php
if (php_sapi_name() === 'cli') {
    error_reporting(E_ALL & ~E_WARNING);
}

require_once __DIR__ . '/php/config/database.php';

try {
    $tenants = $pdo->query("SELECT id, name, slug FROM tenants ORDER BY name")->fetchAll();

    if (empty($tenants)) {
        echo "No tenants found.\n";
        exit;
    }

    echo "All Tenants:\n";
    echo "================================\n";
    foreach ($tenants as $t) {
        echo "ID: {$t['id']}\n";
        echo "Name: {$t['name']}\n";
        echo "Slug: {$t['slug']}\n";
        echo "Dashboard URL: http://localhost/artists_farm/{$t['slug']}/dashboard.php\n";
        echo "---\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
