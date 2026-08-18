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
        if (empty($config['groups']) || !is_array($config['groups'])) {
            return null;
        }

        // 1. Exact match on group key
        foreach ($config['groups'] as $group) {
            if (!empty($group['chatId']) && ($group['key'] ?? null) === $groupKey) {
                return $group['chatId'];
            }
        }

        // 2. Case-insensitive / partial match on key or name for built-in categories ('kitchen', 'admin', 'finance')
        $search = strtolower($groupKey);
        foreach ($config['groups'] as $group) {
            if (empty($group['chatId'])) continue;
            $gKey = strtolower($group['key'] ?? '');
            $gName = strtolower($group['name'] ?? '');
            if (strpos($gKey, $search) !== false || strpos($gName, $search) !== false) {
                return $group['chatId'];
            }
        }

        // 3. Single connected group fallback
        if (count($config['groups']) === 1 && !empty($config['groups'][0]['chatId'])) {
            return $config['groups'][0]['chatId'];
        }

        return null;
    }
}

/**
 * Legacy global chat IDs for the three built-in categories, used only when a
 * property hasn't configured Telegram yet — keeps existing properties working
 * unchanged until they set up their own groups/routing.
 */
/**
 * Given a callback_query/chat update, figure out which property it belongs to
 * by matching the chat_id against each property's configured Telegram groups
 * (disambiguated by the bot token when the platform/shared bot serves several
 * properties). Returns ['propertyId', 'config'] or null.
 */
if (!function_exists('findPropertyForTelegramChat')) {
    function findPropertyForTelegramChat($pdo, $chatId, $token = null) {
        try {
            $stmt = $pdo->query("SELECT property_id, config FROM property_modules WHERE module_slug = 'telegram'");
            $candidates = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $cfg = json_decode($row['config'], true);
                if (!is_array($cfg)) continue;
                $effectiveToken = !empty($cfg['botToken']) ? $cfg['botToken'] : (defined('TELEGRAM_BOT_TOKEN') ? TELEGRAM_BOT_TOKEN : null);
                if ($token !== null && $effectiveToken !== $token) continue;
                $chatIdMatch = false;
                foreach (($cfg['groups'] ?? []) as $g) {
                    if (!empty($g['chatId']) && (string)$g['chatId'] === (string)$chatId) {
                        $chatIdMatch = true;
                        break;
                    }
                }
                if ($chatIdMatch) {
                    return ['propertyId' => (int)$row['property_id'], 'config' => $cfg];
                }
                $candidates[] = ['propertyId' => (int)$row['property_id'], 'config' => $cfg];
            }
            if (!empty($candidates)) {
                return $candidates[0];
            }
        } catch (Exception $e) {}
        return null;
    }
}

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
if (!function_exists('appendAppUrlToMessage')) {
    function appendAppUrlToMessage($pdo, $propertyId, $category, $message) {
        if (strpos($message, 'http://') !== false || strpos($message, 'https://') !== false) {
            return $message;
        }

        $appUrl = null;
        try {
            if ($pdo && $propertyId) {
                $stmt = $pdo->prepare("SELECT p.slug as prop_slug, t.slug as tenant_slug FROM properties p JOIN tenants t ON p.tenant_id = t.id WHERE p.id = ?");
                $stmt->execute([$propertyId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($row) {
                    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                    $host = $_SERVER['HTTP_HOST'] ?? 'localhost:3000';
                    $hash = 'dashboard';
                    if ($category === 'kitchen' || strpos($message, 'KITCHEN') !== false) {
                        $hash = 'kitchen';
                    } else if ($category === 'finance' || strpos($message, 'FINANCIAL') !== false || strpos($message, 'EXPENSE') !== false) {
                        $hash = 'finance';
                    } else if (strpos($message, 'MATERIAL') !== false || strpos($message, 'REQUISITION') !== false) {
                        $hash = 'stock_requests';
                    } else if (strpos($message, 'SERVICE') !== false) {
                        $hash = 'service_requests';
                    } else if (strpos($message, 'GUEST') !== false || strpos($message, 'BOOKING') !== false || strpos($message, 'CHECK-IN') !== false) {
                        $hash = 'guests';
                    }
                    $appUrl = "{$scheme}://{$host}/{$row['tenant_slug']}/{$row['prop_slug']}/#{$hash}";
                }
            }
        } catch (Exception $e) {}

        if ($appUrl) {
            $message .= "\n\n🔗 <b>Open in App:</b> <a href=\"{$appUrl}\">{$appUrl}</a>";
        }
        return $message;
    }
}

if (!function_exists('sendPropertyTelegramMessage')) {
    function sendPropertyTelegramMessage($pdo, $propertyId, $category, $message, $replyMarkup = null, $templateKey = null) {
        $config = getPropertyTelegramConfig($pdo, $propertyId);
        if (!$config['enabled']) {
            return ['skipped' => true, 'reason' => 'Telegram notifications are turned off for this property'];
        }

        $token = !empty($config['botToken']) ? $config['botToken'] : TELEGRAM_BOT_TOKEN;
        $message = appendAppUrlToMessage($pdo, $propertyId, $category, $message);

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
        if (!$chatId && isset($config['routing'][$category])) {
            // Category-level fallback: covers sends that pass a category but no
            // templateKey (e.g. guest booking, checkout settlement, salary) so a
            // property can route "everything admin/kitchen/finance" with a single
            // routing entry instead of needing one per template.
            $chatId = resolveGroupChatId($config, $config['routing'][$category]);
        }
        if (!$chatId) {
            // Default-by-category: every call site passes $category as one of
            // 'kitchen'/'admin'/'finance', matching the Setup Wizard's 3 core
            // group keys. A template with no explicit per-template/per-category
            // routing override falls back to whichever of those 3 groups the
            // property has connected - so connecting the 3 core groups is
            // enough for every template in that bucket to work immediately,
            // for every property, without clicking "Send to" 26 times each.
            $chatId = resolveGroupChatId($config, $category);
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
 * Send one or more photos (optionally mixed with documents, e.g. PDF
 * invoices - see $fileTypes) for a property, routed the same way
 * sendPropertyTelegramMessage() routes text (templateKey → configured group →
 * legacy category fallback). Silently skips (same shape as the text sender)
 * if Telegram isn't configured/enabled.
 *
 * $fileTypes is an optional array parallel to $filePaths, values 'photo' or
 * 'document' - index i describes $filePaths[i]. Omitted/short arrays default
 * missing entries to 'photo', so existing callers (guests.php's check-in ID
 * photos) are unaffected.
 *
 * Telegram's sendMediaGroup cannot mix photos with documents in one album
 * ("Documents and audio files can only be grouped in an album with messages
 * of the same type" - Bot API docs), so photos and documents are split and
 * sent as up to two separate messages; the caption is attached to whichever
 * group goes out first so it isn't duplicated across both.
 */
if (!function_exists('sendPropertyTelegramPhoto')) {
    function sendPropertyTelegramPhoto($pdo, $propertyId, $category, array $filePaths, $caption, $templateKey = null, array $fileTypes = []) {
        $config = getPropertyTelegramConfig($pdo, $propertyId);
        if (!$config['enabled']) {
            return ['skipped' => true, 'reason' => 'Telegram notifications are turned off for this property'];
        }

        $token = !empty($config['botToken']) ? $config['botToken'] : TELEGRAM_BOT_TOKEN;
        $caption = appendAppUrlToMessage($pdo, $propertyId, $category, $caption);

        $chatId = null;
        if ($templateKey && isset($config['routing'][$templateKey])) {
            $chatId = resolveGroupChatId($config, $config['routing'][$templateKey]);
        }
        if (!$chatId && isset($config['routing'][$category])) {
            $chatId = resolveGroupChatId($config, $config['routing'][$category]);
        }
        if (!$chatId) {
            // Default-by-category - see sendPropertyTelegramMessage() above for
            // why this makes each of the 3 core groups the default for every
            // template in its bucket, for every property, with no per-template
            // setup required.
            $chatId = resolveGroupChatId($config, $category);
        }
        if (!$chatId) {
            $chatId = legacyCategoryChatId($category);
        }
        if (!$chatId) {
            $label = $templateKey ?: $category;
            return ['skipped' => true, 'reason' => "No group configured for '$label'"];
        }

        $photoPaths = [];
        $docPaths = [];
        foreach (array_values($filePaths) as $i => $path) {
            if (!file_exists($path)) continue;
            if (($fileTypes[$i] ?? 'photo') === 'document') {
                $docPaths[] = $path;
            } else {
                $photoPaths[] = $path;
            }
        }
        if (empty($photoPaths) && empty($docPaths)) {
            return ['skipped' => true, 'reason' => 'No media files found on disk'];
        }

        $results = [];
        $captionUsed = false;
        if (!empty($photoPaths)) {
            $cap = $captionUsed ? '' : $caption;
            $captionUsed = true;
            $results['photos'] = count($photoPaths) === 1
                ? sendRawTelegramPhoto($photoPaths[0], $cap, $token, $chatId)
                : sendRawTelegramMediaGroup($photoPaths, $cap, $token, $chatId);
        }
        if (!empty($docPaths)) {
            $cap = $captionUsed ? '' : $caption;
            $results['documents'] = count($docPaths) === 1
                ? sendRawTelegramDocument($docPaths[0], $cap, $token, $chatId)
                : sendRawTelegramMediaGroup($docPaths, $cap, $token, $chatId, array_fill(0, count($docPaths), 'document'));
        }
        return $results;
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
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
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

if (!function_exists('sendRawTelegramDocument')) {
    function sendRawTelegramDocument($filePath, $caption, $token, $chatId) {
        $url = "https://api.telegram.org/bot" . $token . "/sendDocument";
        $data = [
            'chat_id' => $chatId,
            'caption' => $caption,
            'parse_mode' => 'HTML',
            'document' => new CURLFile($filePath),
        ];

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        $response = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        TelescopeLogger::log(
            'telegram',
            ($http_code == 200) ? 'SUCCESS' : 'WARNING',
            "📨 Telegram API: sendDocument to chat {$chatId} - HTTP {$http_code}" . ($error ? " (Error: {$error})" : ''),
            "Telegram Sender [Response: {$http_code}]",
            ['chat_id' => $chatId, 'http_code' => $http_code, 'error' => $error]
        );

        return $response;
    }
}

if (!function_exists('sendRawTelegramMediaGroup')) {
    function sendRawTelegramMediaGroup(array $filePaths, $caption, $token, $chatId, array $types = []) {
        $url = "https://api.telegram.org/bot" . $token . "/sendMediaGroup";
        $media = [];
        $data = ['chat_id' => $chatId];

        foreach (array_values($filePaths) as $i => $path) {
            $attachKey = "photo{$i}";
            $item = ['type' => ($types[$i] ?? 'photo'), 'media' => "attach://{$attachKey}"];
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
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);
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
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_TIMEOUT, 8);
        $start_time = microtime(true);
        $response = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        // Automatic fallback retry if Telegram rejects HTML parse_mode
        if ($http_code != 200) {
            $parsed = json_decode($response, true);
            $desc = strtolower($parsed['description'] ?? '');
            if (strpos($desc, 'parse') !== false || strpos($desc, 'entity') !== false || strpos($desc, 'tag') !== false) {
                $plainData = $data;
                unset($plainData['parse_mode']);
                $plainData['text'] = strip_tags(str_replace(['<br>', '<br/>', '<br />', '</p>', '</div>'], "\n", $message));
                $chFallback = curl_init();
                curl_setopt($chFallback, CURLOPT_URL, $url);
                curl_setopt($chFallback, CURLOPT_POST, true);
                curl_setopt($chFallback, CURLOPT_POSTFIELDS, $plainData);
                curl_setopt($chFallback, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($chFallback, CURLOPT_SSL_VERIFYPEER, true);
                curl_setopt($chFallback, CURLOPT_CONNECTTIMEOUT, 5);
                curl_setopt($chFallback, CURLOPT_TIMEOUT, 8);
                $fallbackResponse = curl_exec($chFallback);
                $fallbackHttpCode = curl_getinfo($chFallback, CURLINFO_HTTP_CODE);
                curl_close($chFallback);
                if ($fallbackHttpCode == 200) {
                    $response = $fallbackResponse;
                    $http_code = 200;
                }
            }
        }

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
    function editTelegramMessageText($chat_id, $message_id, $text, $replyMarkup = null, $token = null) {
        $token = $token ?: (defined('TELEGRAM_BOT_TOKEN') ? TELEGRAM_BOT_TOKEN : null);
        if (empty($token)) return;
        $url = "https://api.telegram.org/bot" . $token . "/editMessageText";

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
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_TIMEOUT, 8);
        curl_exec($ch);
        curl_close($ch);
    }
}

if (!function_exists('answerTelegramCallbackQuery')) {
    function answerTelegramCallbackQuery($callback_query_id, $text = "", $show_alert = false, $token = null) {
        $token = $token ?: (defined('TELEGRAM_BOT_TOKEN') ? TELEGRAM_BOT_TOKEN : null);
        if (empty($token)) return;
        $url = "https://api.telegram.org/bot" . $token . "/answerCallbackQuery";

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
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_TIMEOUT, 8);
        curl_exec($ch);
        curl_close($ch);
    }
}
