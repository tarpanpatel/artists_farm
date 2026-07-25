<?php
/**
 * /telegram/test.php
 * Standalone Telegram Connectivity & Multi-Channel Diagnostic Tool
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/sender.php';

header('Content-Type: text/plain; charset=utf-8');

echo "=== TELEGRAM CONNECTIVITY & MULTI-CHANNEL DIAGNOSTIC ===\n\n";

$isLocal = (isset($_SERVER['HTTP_HOST']) && in_array($_SERVER['HTTP_HOST'], ['localhost', '127.0.0.1', '::1']));

echo "1. System Environment:\n";
echo "   - Host Mode: " . ($isLocal ? "LOCAL (Development)" : "LIVE SERVER (Production)") . "\n";
echo "   - Server Time (IST): " . date('Y-m-d H:i:s') . "\n\n";

echo "2. Checking Configuration & Channel IDs:\n";
echo "   - Bot Token: " . (defined('TELEGRAM_BOT_TOKEN') && TELEGRAM_BOT_TOKEN !== 'YOUR_BOT_TOKEN_HERE' ? 'Configured [OK]' : 'MISSING / DEFAULT [FAIL]') . "\n";
echo "   - Kitchen Chat ID: " . (defined('TELEGRAM_KITCHEN_CHAT_ID') ? TELEGRAM_KITCHEN_CHAT_ID . ' [OK]' : 'MISSING [FAIL]') . "\n";
echo "   - Admin Chat ID: "   . (defined('TELEGRAM_ADMIN_CHAT_ID') ? TELEGRAM_ADMIN_CHAT_ID . ' [OK]' : 'MISSING [FAIL]') . "\n";
echo "   - Finance Chat ID: " . (defined('TELEGRAM_FINANCE_CHAT_ID') ? TELEGRAM_FINANCE_CHAT_ID . ' [OK]' : 'MISSING [FAIL]') . "\n\n";

if (isset($_GET['send_test'])) {
    $target = strtolower(trim($_GET['send_test']));
    echo "3. Executing Test Dispatches:\n";

    $testTime = date('d M Y, h:i:s A');

    if ($target === 'all' || $target === '1' || $target === 'kitchen') {
        echo "   [Kitchen Channel] Dispatching test card...\n";
        $kMsg = "🍳 <b>KITCHEN CHANNEL TEST</b>\nTime: {$testTime}\nStatus: Operational ✅";
        $kRes = sendTelegramMessage($kMsg);
        $kJson = json_decode($kRes, true);
        echo "   -> Result: " . (isset($kJson['ok']) && $kJson['ok'] ? "SUCCESS [OK]" : "FAILED") . "\n";
        if (!empty($kRes)) echo "   -> Raw Response: {$kRes}\n";
        echo "   ----------------------------------------\n";
    }

    if ($target === 'all' || $target === '1' || $target === 'admin') {
        echo "   [Admin Channel] Dispatching test card...\n";
        $aMsg = "🛡️ <b>ADMIN CHANNEL TEST</b>\nTime: {$testTime}\nStatus: Operational ✅";
        $aRes = sendAdminTelegramMessage($aMsg);
        $aJson = json_decode($aRes, true);
        echo "   -> Result: " . (isset($aJson['ok']) && $aJson['ok'] ? "SUCCESS [OK]" : "FAILED") . "\n";
        if (!empty($aRes)) echo "   -> Raw Response: {$aRes}\n";
        echo "   ----------------------------------------\n";
    }

    if ($target === 'all' || $target === '1' || $target === 'finance') {
        echo "   [Finance Channel] Dispatching test card...\n";
        $fMsg = "💰 <b>FINANCE CHANNEL TEST</b>\nTime: {$testTime}\nStatus: Operational ✅";
        $fRes = sendFinanceTelegramMessage($fMsg);
        $fJson = json_decode($fRes, true);
        echo "   -> Result: " . (isset($fJson['ok']) && $fJson['ok'] ? "SUCCESS [OK]" : "FAILED") . "\n";
        if (!empty($fRes)) echo "   -> Raw Response: {$fRes}\n";
        echo "   ----------------------------------------\n";
    }

} else {
    echo "To execute live dispatch tests, visit one of the following URLs in your browser:\n\n";
    echo " - Test All Channels:     telegram/test.php?send_test=all\n";
    echo " - Test Kitchen Group:    telegram/test.php?send_test=kitchen\n";
    echo " - Test Admin Group:      telegram/test.php?send_test=admin\n";
    echo " - Test Finance Group:    telegram/test.php?send_test=finance\n";
}

echo "\n=== DIAGNOSTIC COMPLETE ===";
