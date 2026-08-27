<?php
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['SERVER_NAME'] = 'localhost';
require_once __DIR__ . '/../php/config/database.php';
$pdo = getDbConnection();

echo "=== CHECKING TELEGRAM CONFIG ===\n";
$stmt = $pdo->query("SELECT id, property_id, module_slug, is_enabled, config FROM property_modules WHERE module_slug = 'telegram'");
$modules = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo "property_modules (telegram) count: " . count($modules) . "\n";
foreach ($modules as $m) {
    echo "Property ID {$m['property_id']} (enabled={$m['is_enabled']}): {$m['config']}\n";
}

$stmt2 = $pdo->query("SELECT id, name, telegram_bot_token FROM properties WHERE telegram_bot_token IS NOT NULL AND telegram_bot_token != ''");
$props = $stmt2->fetchAll(PDO::FETCH_ASSOC);
echo "\nproperties with telegram_bot_token count: " . count($props) . "\n";
foreach ($props as $p) {
    echo "Property ID {$p['id']} ({$p['name']}): {$p['telegram_bot_token']}\n";
}

echo "\n=== CHECKING WHATSAPP CONFIG ===\n";
require_once __DIR__ . '/../php/whatsapp/sender.php';
$token = getWhatsAppAccessToken();
echo "WhatsApp Token configured: " . ($token ? "YES (length " . strlen($token) . ")" : "NO") . "\n";
echo "WhatsApp Phone Number ID: " . WHATSAPP_PHONE_NUMBER_ID . "\n";

// Let's test a sample direct message to 919571263474
echo "\nTesting direct WhatsApp API send to 919571263474...\n";
$res = sendWhatsAppDirectTextMessage('919571263474', 'Ground Code SaaS Onboarding Test');
print_r($res);
