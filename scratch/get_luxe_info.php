<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);
try {
    require_once __DIR__ . '/../php/config/database.php';
    // $pdo is initialized in database.php
    $stmt = $pdo->query("SELECT id, name, slug, tenant_id FROM properties WHERE slug = 'luxe-stays'");
    $property = $stmt->fetch(PDO::FETCH_ASSOC);
    echo "Property:\n";
    print_r($property);
    $stmt = $pdo->prepare("SELECT id, name, slug FROM tenants WHERE id = ?");
    $stmt->execute([$property['tenant_id']]);
    $tenant = $stmt->fetch(PDO::FETCH_ASSOC);
    echo "\nTenant:\n";
    print_r($tenant);

if ($property) {
    $stmt2 = $pdo->prepare("SELECT id, title, tab_key, unique_key, url_slug, is_visible FROM navigation_items WHERE property_id = ? ORDER BY `order` ASC");
    $stmt2->execute([$property['id']]);
    $navItems = $stmt2->fetchAll(PDO::FETCH_ASSOC);
    echo "\nNav items count: " . count($navItems) . "\n";
    foreach ($navItems as $item) {
        echo " - {$item['title']} (unique: {$item['unique_key']}, slug: {$item['url_slug']}, tab: {$item['tab_key']})\n";
    }
}
} catch (Throwable $e) {
    echo "Error: " . $e->getMessage() . "\n" . $e->getTraceAsString();
}
