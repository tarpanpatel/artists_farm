<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

try {
    require __DIR__ . '/../php/config/database.php';
    require __DIR__ . '/../php/rates/rate_rules.php';

    echo "Connected successfully to DB!" . PHP_EOL;

    // Self-heal via handler
    ob_start();
    handleRateRuleRequests($pdo, 'GET', 'get_rate_rules', 1);
    ob_end_clean();

    $stmt = $pdo->query("SELECT id, name, slug, property_type, pricing_mode, default_tariff FROM properties WHERE is_active = 1 LIMIT 5");
    $props = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "Properties found: " . count($props) . PHP_EOL;
    foreach ($props as $p) {
        echo " - ID: {$p['id']}, Name: {$p['name']}, Slug: {$p['slug']}, Type: {$p['property_type']}, Mode: {$p['pricing_mode']}, Tariff: {$p['default_tariff']}" . PHP_EOL;
    }
} catch (Throwable $e) {
    echo "DB Exception: " . $e->getMessage() . " at " . $e->getFile() . ":" . $e->getLine() . PHP_EOL;
}
