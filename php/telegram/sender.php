<?php
/**
 * telegram/sender.php
 * Core Telegram API Driver with updated UI Handlers
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/../errors/logger.php';

/**
 * Read a property's Telegram connection settings, stored as JSON in
 * property_modules.config for module_slug = 'telegram' (see
 * php/modules/module_manager.php). Falls back to sensible defaults for a
 * property that has never configured its own bot/groups.
 *
 * Shape: {
 *   enabled: bool,                                  // notification kill-switch
 *   botToken: string|null,
 *   groups: [{ key, name, chatId }],                // arbitrary named groups
 *   routing: { kitchen: groupKey, finance: groupKey, admin: groupKey }
 * }
 */
if (!function_exists('getPropertyTelegramConfig')) {
    function getPropertyTelegramConfig($pdo, $propertyId) {
        $defaults = ['enabled' => true, 'botToken' => null, 'groups' => [], 'routing' => [], 'reminderThresholdMinutes' => 5];
        try {
            $stmt = $pdo->prepare("SELECT config FROM property_modules WHERE property_id = ? AND module_slug = 'telegram'");
            $stmt->execute([$propertyId]);
            $raw = $stmt->fetchColumn();
            if (!$raw) return $defaults;
            $decoded = json_decode($raw, true);
            if (!is_array($decoded)) return $defaults;
            return array_merge($defaults, $decoded);
        } catch (Exception $e) {
            return $defaults;
        }
    }
}

/**
 * Resolve a named group's key to its chat_id from a property's configured
 * groups. Returns null if that group isn't configured (or has no chat_id).
 */
if (!function_exists('resolveGroupChatId')) {
    function resolveGroupChatId(array $config, string $groupKey) {
        foreach ($config['groups'] as $group) {
            if (($group['key'] ?? null) === $groupKey && !empty($group['chatId'])) {
                return $group['chatId'];
            }
        }
        return null;
    }
}

/**
 * Legacy global chat IDs for the three built-in categories, used only when a
 * property hasn't configured Telegram yet — keeps existing properties working
 * unchanged until they set up their own groups/routing.
 */
if (!function_exists('legacyCategoryChatId')) {
    function legacyCategoryChatId(string $category) {
        $legacyDefaults = [
            'kitchen' => defined('TELEGRAM_KITCHEN_CHAT_ID') ? TELEGRAM_KITCHEN_CHAT_ID : null,
            'admin' => defined('TELEGRAM_ADMIN_CHAT_ID') ? TELEGRAM_ADMIN_CHAT_ID : null,
            'finance' => defined('TELEGRAM_FINANCE_CHAT_ID') ? TELEGRAM_FINANCE_CHAT_ID : null,
        ];
        return $legacyDefaults[$category] ?? null;
    }
}

/**
 * Send a Telegram message for a property. Honors the property's enabled flag
 * (returns 'skipped' without sending if off). Routing is resolved per
 * template ($templateKey → config.routing[$templateKey] → a configured
 * group's chat_id) since that's what the Telegram settings UI lets a property
 * configure; $category is used only as the broadcast selector ('all') and as
 * a last-resort fallback to the legacy global chat IDs for properties/events
 * that haven't been routed to a specific group yet.
 */
if (!function_exists('sendPropertyTelegramMessage')) {
    function sendPropertyTelegramMessage($pdo, $propertyId, $category, $message, $replyMarkup = null, $templateKey = null) {
        $config = getPropertyTelegramConfig($pdo, $propertyId);
        if (!$config['enabled']) {
            return ['skipped' => true, 'reason' => 'Telegram notifications are turned off for this property'];
        }

        $token = !empty($config['botToken']) ? $config['botToken'] : TELEGRAM_BOT_TOKEN;

        if ($category === 'all') {
            $chatIds = [];
            if (!empty($config['groups'])) {
                foreach ($config['groups'] as $group) {
                    if (!empty($group['chatId'])) $chatIds[] = $group['chatId'];
                }
            } else {
                foreach (['kitchen', 'admin', 'finance'] as $key) {
                    $chatId = legacyCategoryChatId($key);
                    if ($chatId) $chatIds[] = $chatId;
                }
            }
            $results = [];
            foreach (array_unique($chatIds) as $chatId) {
                $results[$chatId] = sendRawTelegramMessage($message, $token, $chatId, $replyMarkup);
            }
            return $results;
        }

        $chatId = null;
        if ($templateKey && isset($config['routing'][$templateKey])) {
            $chatId = resolveGroupChatId($config, $config['routing'][$templateKey]);
        }
        if (!$chatId) {
            $chatId = legacyCategoryChatId($category);
        }
        if (!$chatId) {
            $label = $templateKey ?: $category;
            return ['skipped' => true, 'reason' => "No group configured for '$label'"];
        }
        return sendRawTelegramMessage($message, $token, $chatId, $replyMarkup);
    }
}

/**
 * Send one or more photos for a property, routed the same way
 * sendPropertyTelegramMessage() routes text (templateKey → configured group →
 * legacy category fallback). Sends a single sendPhoto call for one file, or a
 * sendMediaGroup (caption on the first item) for multiple. Silently skips
 * (same shape as the text sender) if Telegram isn't configured/enabled.
 */
if (!function_exists('sendPropertyTelegramPhoto')) {
    function sendPropertyTelegramPhoto($pdo, $propertyId, $category, array $filePaths, $caption, $templateKey = null) {
        $config = getPropertyTelegramConfig($pdo, $propertyId);
        if (!$config['enabled']) {
            return ['skipped' => true, 'reason' => 'Telegram notifications are turned off for this property'];
        }

        $token = !empty($config['botToken']) ? $config['botToken'] : TELEGRAM_BOT_TOKEN;

        $chatId = null;
        if ($templateKey && isset($config['routing'][$templateKey])) {
            $chatId = resolveGroupChatId($config, $config['routing'][$templateKey]);
        }
        if (!$chatId) {
            $chatId = legacyCategoryChatId($category);
        }
        if (!$chatId) {
            $label = $templateKey ?: $category;
            return ['skipped' => true, 'reason' => "No group configured for '$label'"];
        }

        $existingPaths = array_values(array_filter($filePaths, 'file_exists'));
        if (empty($existingPaths)) {
            return ['skipped' => true, 'reason' => 'No photo files found on disk'];
        }

        if (count($existingPaths) === 1) {
            return sendRawTelegramPhoto($existingPaths[0], $caption, $token, $chatId);
        }
        return sendRawTelegramMediaGroup($existingPaths, $caption, $token, $chatId);
    }
}

if (!function_exists('sendRawTelegramPhoto')) {
    function sendRawTelegramPhoto($filePath, $caption, $token, $chatId) {
        $url = "https://api.telegram.org/bot" . $token . "/sendPhoto";
        $data = [
            'chat_id' => $chatId,
            'caption' => $caption,
            'parse_mode' => 'HTML',
            'photo' => new CURLFile($filePath),
        ];

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        $response = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        TelescopeLogger::log(
            'telegram',
            ($http_code == 200) ? 'SUCCESS' : 'WARNING',
            "📨 Telegram API: sendPhoto to chat {$chatId} - HTTP {$http_code}" . ($error ? " (Error: {$error})" : ''),
            "Telegram Sender [Response: {$http_code}]",
            ['chat_id' => $chatId, 'http_code' => $http_code, 'error' => $error]
        );

        return $response;
    }
}

if (!function_exists('sendRawTelegramMediaGroup')) {
    function sendRawTelegramMediaGroup(array $filePaths, $caption, $token, $chatId) {
        $url = "https://api.telegram.org/bot" . $token . "/sendMediaGroup";
        $media = [];
        $data = ['chat_id' => $chatId];

        foreach (array_values($filePaths) as $i => $path) {
            $attachKey = "photo{$i}";
            $item = ['type' => 'photo', 'media' => "attach://{$attachKey}"];
            if ($i === 0 && $caption) {
                $item['caption'] = $caption;
                $item['parse_mode'] = 'HTML';
            }
            $media[] = $item;
            $data[$attachKey] = new CURLFile($path);
        }
        $data['media'] = json_encode($media);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        $response = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        TelescopeLogger::log(
            'telegram',
            ($http_code == 200) ? 'SUCCESS' : 'WARNING',
            "📨 Telegram API: sendMediaGroup to chat {$chatId} - HTTP {$http_code}" . ($error ? " (Error: {$error})" : ''),
            "Telegram Sender [Response: {$http_code}]",
            ['chat_id' => $chatId, 'photo_count' => count($filePaths), 'http_code' => $http_code, 'error' => $error]
        );

        return $response;
    }
}

// Legacy global-constant senders — kept for telegram_webhook.php and test.php,
// which operate on the bot's own admin group rather than a specific property.
if (!function_exists('sendTelegramMessage')) {
    function sendTelegramMessage($message, $token = null, $chatId = null, $replyMarkup = null) {
        $token = $token ?? TELEGRAM_BOT_TOKEN;
        $chatId = $chatId ?? TELEGRAM_KITCHEN_CHAT_ID;
        return sendRawTelegramMessage($message, $token, $chatId, $replyMarkup);
    }
}

if (!function_exists('sendAdminTelegramMessage')) {
    function sendAdminTelegramMessage($message, $token = null, $chatId = null, $replyMarkup = null) {
        $token = $token ?? TELEGRAM_BOT_TOKEN;
        $chatId = $chatId ?? TELEGRAM_ADMIN_CHAT_ID;
        return sendRawTelegramMessage($message, $token, $chatId, $replyMarkup);
    }
}

if (!function_exists('sendFinanceTelegramMessage')) {
    function sendFinanceTelegramMessage($message, $token = null, $chatId = null, $replyMarkup = null) {
        $token = $token ?? TELEGRAM_BOT_TOKEN;
        $chatId = $chatId ?? TELEGRAM_FINANCE_CHAT_ID;
        return sendRawTelegramMessage($message, $token, $chatId, $replyMarkup);
    }
}

if (!function_exists('sendRawTelegramMessage')) {
    function sendRawTelegramMessage($message, $token, $chatId, $replyMarkup = null) {
        $url = "https://api.telegram.org/bot" . $token . "/sendMessage";
        $data = [
            'chat_id' => $chatId,
            'text' => $message,
            'parse_mode' => 'HTML'
        ];

        if ($replyMarkup !== null) {
            $data['reply_markup'] = is_array($replyMarkup) ? json_encode($replyMarkup) : $replyMarkup;
        }

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        $start_time = microtime(true);
        $response = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        // Log Telegram API call
        $status = ($http_code == 200) ? 'SUCCESS' : 'WARNING';
        $preview = substr($message, 0, 60) . (strlen($message) > 60 ? '...' : '');
        TelescopeLogger::log(
            'telegram',
            $status,
            "📨 Telegram API: sendMessage to chat {$chatId} - HTTP {$http_code}" . ($error ? " (Error: {$error})" : ''),
            "Telegram Sender [Response: {$http_code}]",
            ['chat_id' => $chatId, 'message_preview' => $preview, 'http_code' => $http_code, 'error' => $error]
        );

        return $response;
    }
}

if (!function_exists('editTelegramMessageText')) {
    function editTelegramMessageText($chat_id, $message_id, $text, $replyMarkup = null) {
        $url = "https://api.telegram.org/bot" . TELEGRAM_BOT_TOKEN . "/editMessageText";

        $data = [
            'chat_id' => $chat_id,
            'message_id' => $message_id,
            'text' => $text,
            'parse_mode' => 'HTML'
        ];

        if ($replyMarkup !== null) {
            $data['reply_markup'] = is_array($replyMarkup) ? $replyMarkup : json_decode($replyMarkup, true);
        } else {
            $data['reply_markup'] = ['inline_keyboard' => []];
        }

        $payload = json_encode($data);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_exec($ch);
        curl_close($ch);
    }
}

if (!function_exists('answerTelegramCallbackQuery')) {
    function answerTelegramCallbackQuery($callback_query_id, $text = "", $show_alert = false) {
        $url = "https://api.telegram.org/bot" . TELEGRAM_BOT_TOKEN . "/answerCallbackQuery";

        $data = [
            'callback_query_id' => $callback_query_id,
            'text' => $text,
            'show_alert' => $show_alert
        ];

        $payload = json_encode($data);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_exec($ch);
        curl_close($ch);
    }
}
