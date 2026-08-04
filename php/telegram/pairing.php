<?php
/**
 * telegram/pairing.php
 * Zero-Friction Telegram Setup Wizard backend: generates short pairing codes,
 * polls the shared bot's getUpdates for a matching code, and commits the
 * discovered chat_id into the property's existing telegram group config
 * (property_modules.config, same shape TelegramConnectionSettings.tsx edits
 * manually) once paired.
 */

require_once __DIR__ . '/sender.php';
require_once __DIR__ . '/webhook_handler.php';
require_once __DIR__ . '/../modules/module_manager.php';

if (!function_exists('ensurePairingTables')) {
    function ensurePairingTables($pdo) {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS telegram_pairing_codes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(40) NOT NULL UNIQUE,
                property_id INT NOT NULL,
                group_key VARCHAR(50) NOT NULL,
                group_name VARCHAR(100) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                chat_id VARCHAR(50) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                paired_at TIMESTAMP NULL DEFAULT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
            // Keyed by SHA1(bot_token) rather than a single fixed row: each bot
            // token is an independent Telegram account with its own unrelated
            // update_id sequence (properties can bring their own bot), so a
            // shared cursor across tokens would desync and silently drop
            // updates for whichever token isn't "in sync" with the others.
            $pdo->exec("CREATE TABLE IF NOT EXISTS telegram_bot_offsets (
                bot_token_hash CHAR(40) PRIMARY KEY,
                last_update_id BIGINT NOT NULL DEFAULT 0
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
        } catch (Exception $e) {
            error_log("Telegram pairing table setup error: " . $e->getMessage());
        }
    }
}

// Resolves which bot token should service this property's pairing/test-send —
// its own custom bot if configured (advanced/"bring your own bot" path),
// otherwise the shared platform bot.
if (!function_exists('pairingBotToken')) {
    function pairingBotToken($pdo, $propertyId) {
        $config = getPropertyTelegramConfig($pdo, $propertyId);
        return !empty($config['botToken']) ? $config['botToken'] : TELEGRAM_BOT_TOKEN;
    }
}

if (!function_exists('generatePairingCode')) {
    function generatePairingCode($pdo, $propertyId, $groupKey, $groupName) {
        ensurePairingTables($pdo);
        $safeKey = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $groupKey)) ?: 'GROUP';
        $code = "FARM-{$safeKey}-" . random_int(1000, 9999);
        $stmt = $pdo->prepare("INSERT INTO telegram_pairing_codes (code, property_id, group_key, group_name, status) VALUES (?, ?, ?, ?, 'pending')");
        $stmt->execute([$code, $propertyId, $groupKey, $groupName]);
        return $code;
    }
}

// One-shot poll of the shared bot's getUpdates - the local/dev substitute for
// Telegram's production webhook, since XAMPP has no public HTTPS endpoint for
// Telegram to call. Matches any still-pending pairing codes against new
// message text, AND dispatches any button-tap (callback_query) updates
// through the same handleTelegramCallbackQuery() the production webhook uses,
// so pairing and "Mark Served"-style callbacks share one receive path
// regardless of which triggered it (a status check while the Setup Wizard is
// open, or the standalone poll_telegram_updates.php cron worker). Safe to
// call repeatedly - cheap no-op once there's nothing new.
if (!function_exists('pollAndMatchPairingCodes')) {
    function pollAndMatchPairingCodes($pdo, $token) {
        if (empty($token)) return;
        ensurePairingTables($pdo);

        $tokenHash = sha1($token);
        $offsetStmt = $pdo->prepare("SELECT last_update_id FROM telegram_bot_offsets WHERE bot_token_hash = ?");
        $offsetStmt->execute([$tokenHash]);
        $offset = (int)($offsetStmt->fetchColumn() ?: 0);

        $url = "https://api.telegram.org/bot{$token}/getUpdates?offset=" . ($offset + 1) . "&timeout=0&limit=50";
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 8);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        $response = curl_exec($ch);
        curl_close($ch);

        if (!$response) return;
        $data = json_decode($response, true);
        if (empty($data['ok']) || empty($data['result'])) return;

        $pending = $pdo->query("SELECT id, code FROM telegram_pairing_codes WHERE status = 'pending' AND created_at > (NOW() - INTERVAL 15 MINUTE)")->fetchAll(PDO::FETCH_ASSOC);

        $maxUpdateId = $offset;
        foreach ($data['result'] as $update) {
            if (isset($update['update_id']) && $update['update_id'] > $maxUpdateId) {
                $maxUpdateId = $update['update_id'];
            }

            if (!empty($update['callback_query'])) {
                handleTelegramCallbackQuery($pdo, $update['callback_query']);
                continue;
            }

            $msg = $update['message'] ?? $update['channel_post'] ?? null;
            if (!$msg || empty($msg['text']) || empty($msg['chat']['id'])) continue;
            $text = trim($msg['text']);
            foreach ($pending as $p) {
                if (strcasecmp($text, $p['code']) === 0) {
                    $upd = $pdo->prepare("UPDATE telegram_pairing_codes SET status = 'paired', chat_id = ?, paired_at = NOW() WHERE id = ? AND status = 'pending'");
                    $upd->execute([(string)$msg['chat']['id'], $p['id']]);
                }
            }
        }

        if ($maxUpdateId > $offset) {
            $up = $pdo->prepare("INSERT INTO telegram_bot_offsets (bot_token_hash, last_update_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_update_id = VALUES(last_update_id)");
            $up->execute([$tokenHash, $maxUpdateId]);
        }
    }
}

if (!function_exists('getPairingStatus')) {
    function getPairingStatus($pdo, $code) {
        $stmt = $pdo->prepare("SELECT * FROM telegram_pairing_codes WHERE code = ?");
        $stmt->execute([$code]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) return ['status' => 'not_found'];

        if ($row['status'] === 'pending' && (time() - strtotime($row['created_at'])) > 900) {
            $upd = $pdo->prepare("UPDATE telegram_pairing_codes SET status = 'expired' WHERE id = ?");
            $upd->execute([$row['id']]);
            return ['status' => 'expired'];
        }

        return [
            'status' => $row['status'],
            'chatId' => $row['chat_id'],
            'groupKey' => $row['group_key'],
            'groupName' => $row['group_name'],
        ];
    }
}

// Commits a successfully paired code's chat_id into the property's telegram
// group config (upsert by group_key) — the same groups[] array the manual
// Connection Settings editor reads/writes.
if (!function_exists('confirmPairing')) {
    function confirmPairing($pdo, $propertyId, $code) {
        $stmt = $pdo->prepare("SELECT * FROM telegram_pairing_codes WHERE code = ? AND property_id = ? AND status = 'paired'");
        $stmt->execute([$code, $propertyId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return ['success' => false, 'message' => 'No paired chat found for this code yet.'];
        }

        $config = getPropertyTelegramConfig($pdo, $propertyId);
        $groups = $config['groups'];
        $found = false;
        foreach ($groups as &$g) {
            if (($g['key'] ?? null) === $row['group_key']) {
                $g['chatId'] = $row['chat_id'];
                $g['name'] = $row['group_name'];
                $found = true;
                break;
            }
        }
        unset($g);
        if (!$found) {
            $groups[] = ['key' => $row['group_key'], 'name' => $row['group_name'], 'chatId' => $row['chat_id']];
        }
        $config['groups'] = $groups;

        $ok = updatePropertyModuleConfig($pdo, $propertyId, 'telegram', $config);
        if ($ok) {
            $upd = $pdo->prepare("UPDATE telegram_pairing_codes SET status = 'confirmed' WHERE id = ?");
            $upd->execute([$row['id']]);
        }
        return ['success' => $ok, 'chatId' => $row['chat_id'], 'groupKey' => $row['group_key']];
    }
}
