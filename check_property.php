<?php
require_once __DIR__ . '/php/config/database.php';

echo "Checking vrikshawan tenant and properties:\n\n";

$tenant = $pdo->prepare("SELECT id, name, slug FROM tenants WHERE slug = 'vrikshawan'");
$tenant->execute();
$tenantData = $tenant->fetch();

if (!$tenantData) {
    echo "❌ Tenant 'vrikshawan' not found\n";
    exit;
}

echo "✅ Tenant found:\n";
echo json_encode($tenantData, JSON_PRETTY_PRINT) . "\n\n";

$props = $pdo->prepare("SELECT id, name, slug, tenant_id FROM properties WHERE tenant_id = ? ORDER BY name");
$props->execute([$tenantData['id']]);
$properties = $props->fetchAll();

echo "Properties for vrikshawan:\n";
echo json_encode($properties, JSON_PRETTY_PRINT) . "\n";

echo "\n\nLooking for 'resort-hut' property:\n";
$resort = $pdo->prepare("SELECT id, name, slug, tenant_id FROM properties WHERE slug = 'resort-hut' AND tenant_id = ?");
$resort->execute([$tenantData['id']]);
$resortProp = $resort->fetch();

if ($resortProp) {
    echo "✅ Found: ";
    echo json_encode($resortProp);
} else {
    echo "❌ 'resort-hut' property not found for vrikshawan tenant";
}
?>
