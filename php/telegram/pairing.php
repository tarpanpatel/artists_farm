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
// Guarded (27 Aug 2026) - same cross-environment __DIR__ collision as demo_data.php's identical
// fix (see that file's comment for the full writeup): staging loads telegram.php straight from
// production's path, whose own require_once of module_manager.php resolves to a different
// absolute path than this one - fatals with "Cannot redeclare" without this guard.
if (!function_exists('isModuleAvailable')) {
    require_once __DIR__ . '/../modules/module_manager.php';
}
require_once __DIR__ . '/../config/schema_cache.php';

if (!function_exists('ensurePairingTables')) {
    function ensurePairingTables($pdo) {
        if (isSchemaVerified('schema_telegram_pairing')) return;
        try {
            // Keyed by SHA1(bot_token) rather than a single fixed row: each bot
            // token is an independent Telegram account with its own unrelated
            // update_id sequence (properties can bring their own bot), so a
            // shared cursor across tokens would desync and silently drop
            // updates for whichever token isn't "in sync" with the others.
        } catch (Exception $e) {
            error_log("Telegram pairing table setup error: " . $e->getMessage());
        }
        markSchemaVerified('schema_telegram_pairing');
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

// Matches ONE inbound Telegram message against any still-pending pairing code
// and, on a hit, commits the discovered chat_id. Extracted from
// pollAndMatchPairingCodes() below (26 Aug 2026) so the production WEBHOOK path
// can run the identical matching logic - see telegram_webhook.php.
//
// Why this had to be shared: pairing previously only ever ran on the polling
// path, which is unreachable on any HTTPS host. sender.php's
// ensureTelegramWebhookSet() registers a webhook on EVERY send, and Telegram
// refuses getUpdates with 409 Conflict while a webhook is active - which
// pollAndMatchPairingCodes() swallows silently (`if (empty($data['ok'])) return;`).
// telegram_webhook.php meanwhile only handled callback_query and dropped
// message updates entirely, so nothing anywhere consumed the code. Net effect:
// once a property had sent a single real notification, the Setup Wizard could
// never pair another group - it just sat on "Waiting for the code to arrive..."
// until the 15-minute expiry.
//
// $pending is optional so the polling loop can fetch the candidate list once for
// a whole batch of updates rather than re-querying per message; the webhook path
// (exactly one message per request) simply omits it.
if (!function_exists('matchPairingCodeFromMessage')) {
    function matchPairingCodeFromMessage($pdo, array $msg, ?array $pending = null) {
        if (empty($msg['text']) || empty($msg['chat']['id'])) return false;
        $text = trim($msg['text']);
        if ($text === '') return false;

        // Accept "/start FARM-KITCHEN-1234" (and the "/start@SomeBot <code>"
        // form group chats produce) as well as the bare code on its own.
        // Telegram delivers slash-commands to a bot even when its privacy mode
        // is ENABLED, whereas a bare code only arrives once privacy is disabled
        // - so the command form is what lets pairing work without the BotFather
        // "/setprivacy -> Disable" step, and it's also the exact payload shape a
        // t.me/<bot>?startgroup=<code> deep link delivers.
        if (stripos($text, '/start') === 0) {
            $parts = preg_split('/\s+/', $text, 2);
            $text = isset($parts[1]) ? trim($parts[1]) : '';
            if ($text === '') return false;
        }

        if ($pending === null) {
            $pending = $pdo->query("SELECT id, code FROM telegram_pairing_codes WHERE status = 'pending' AND created_at > (NOW() - INTERVAL 15 MINUTE)")->fetchAll(PDO::FETCH_ASSOC);
        }

        foreach ($pending as $p) {
            if (strcasecmp($text, $p['code']) === 0) {
                $upd = $pdo->prepare("UPDATE telegram_pairing_codes SET status = 'paired', chat_id = ?, paired_at = NOW() WHERE id = ? AND status = 'pending'");
                $upd->execute([(string)$msg['chat']['id'], $p['id']]);
                return true;
            }
        }
        return false;
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
                handleTelegramCallbackQuery($pdo, $update['callback_query'], $token);
                continue;
            }

            $msg = $update['message'] ?? $update['channel_post'] ?? null;
            if (!$msg) continue;
            matchPairingCodeFromMessage($pdo, $msg, $pending);
        }

        if ($maxUpdateId > $offset) {
            $up = $pdo->prepare("INSERT INTO telegram_bot_offsets (bot_token_hash, last_update_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_update_id = VALUES(last_update_id)");
            $up->execute([$tokenHash, $maxUpdateId]);
        }
    }
}

if (!function_exists('getPairingStatus')) {
    function getPairingStatus($pdo, $code) {
        // Expiry is computed entirely in SQL (created_at vs NOW(), both on the
        // DB server's own clock) rather than pulling created_at into PHP and
        // comparing via time() - strtotime(): that mixed the DB server's
        // system timezone with PHP's date_default_timezone_set('Asia/Kolkata')
        // (set globally in errors/logger.php) - two different offsets being
        // diffed against each other. On this server the mismatch was ~4.5
        // hours, so every code already read as older than the 15-minute
        // window the instant it was created, before a user had any chance to
        // send it in Telegram. Found 17 Aug 2026 (codes always showing
        // "expired" immediately). pollAndMatchPairingCodes() below already
        // did this comparison correctly in SQL - this just matches that.
        $stmt = $pdo->prepare("SELECT *, (status = 'pending' AND created_at <= (NOW() - INTERVAL 15 MINUTE)) as is_expired FROM telegram_pairing_codes WHERE code = ?");
        $stmt->execute([$code]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) return ['status' => 'not_found'];

        if ($row['is_expired']) {
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
