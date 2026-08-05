<?php
/**
 * whatsapp/sender.php
 * WhatsApp Business API (Meta Graph API) driver - guest-facing notifications.
 *
 * Unlike Telegram (a single push message to a staff group any time), WhatsApp
 * requires every business-initiated message - a booking confirmation the
 * moment someone books, for example - to use a pre-approved message template.
 * Free-form text only works within 24h of the guest messaging first, which
 * none of our triggers are. So this sender only ever sends templates, never
 * raw text.
 *
 * One WhatsApp Business Account/number for the whole platform (not
 * per-property like Telegram), so no property-level routing config here.
 */

require_once __DIR__ . '/../errors/logger.php';

if (!defined('WHATSAPP_PHONE_NUMBER_ID')) {
    define('WHATSAPP_PHONE_NUMBER_ID', '1232057176655692');
}
if (!defined('WHATSAPP_API_VERSION')) {
    define('WHATSAPP_API_VERSION', 'v20.0');
}
/**
 * Phased rollout gate: this WhatsApp number/account is shared platform-wide (see
 * file header), which is fine long-term but not yet something every tenant has
 * agreed to or been billed for. Until that's sorted out, guest notifications only
 * fire for the tenant whose registered contact phone matches this - i.e. the
 * platform owner's own properties. Anchored to the tenant's phone rather than a
 * tenant/property slug or domain, since those can and will change (see the
 * "Multi-Tenant Scale" memory) - the registered contact number is the one
 * durable identifier. Widen this to per-tenant opt-in (or remove entirely) once
 * WhatsApp is rolled out platform-wide.
 */
if (!defined('WHATSAPP_ENABLED_TENANT_PHONE')) {
    define('WHATSAPP_ENABLED_TENANT_PHONE', '9571263474');
}

/**
 * Permanent System User access token - env var first, falling back to the
 * untracked php/config/whatsapp_token.php file. Same lookup order as
 * DB_PASSWORD in php/config/database.php.
 */
if (!function_exists('getWhatsAppAccessToken')) {
    function getWhatsAppAccessToken() {
        $envToken = getenv('WHATSAPP_ACCESS_TOKEN');
        if ($envToken) return $envToken;
        $tokenFile = __DIR__ . '/../config/whatsapp_token.php';
        return file_exists($tokenFile) ? require $tokenFile : null;
    }
}

/**
 * Normalize a guest-entered phone number to the digits-only, country-code-
 * prefixed format the WhatsApp API expects (e.g. 919876543210). Assumes
 * India (+91) when no country code is present, since that's this app's
 * guest base. Returns null if what's left doesn't look like a real number.
 */
if (!function_exists('normalizeWhatsAppNumber')) {
    function normalizeWhatsAppNumber($rawNumber) {
        $digits = preg_replace('/\D/', '', (string)$rawNumber);
        if ($digits === '') return null;
        if (strlen($digits) === 10) return '91' . $digits;
        if (strlen($digits) === 11 && $digits[0] === '0') return '91' . substr($digits, 1);
        if (strlen($digits) === 12 && substr($digits, 0, 2) === '91') return $digits;
        return strlen($digits) >= 10 ? $digits : null;
    }
}

/**
 * Gate for the phased rollout above: does $propertyId belong (directly, or via
 * its parent for a MULTI_KEY_ROOM child that never got its own tenant_id
 * backfilled) to the tenant enabled for WhatsApp? Fails closed (false) on any
 * lookup error or missing tenant phone, so a DB hiccup never accidentally
 * sends a guest-facing message nobody approved yet.
 */
if (!function_exists('isWhatsAppEnabledForProperty')) {
    function isWhatsAppEnabledForProperty($pdo, $propertyId) {
        try {
            $stmt = $pdo->prepare(
                "SELECT t.phone FROM properties p
                 LEFT JOIN properties parent ON p.parent_property_id = parent.id
                 JOIN tenants t ON t.id = COALESCE(p.tenant_id, parent.tenant_id)
                 WHERE p.id = ?"
            );
            $stmt->execute([$propertyId]);
            $ownerPhone = $stmt->fetchColumn();
            if (!$ownerPhone) return false;
            return normalizeWhatsAppNumber($ownerPhone) === normalizeWhatsAppNumber(WHATSAPP_ENABLED_TENANT_PHONE);
        } catch (PDOException $e) {
            return false;
        }
    }
}

/**
 * Send an approved WhatsApp template message. $bodyParams is an ordered list
 * mapped positionally to the template's {{1}}, {{2}}, ... body variables.
 * Returns the decoded API response, or ['skipped' => true, 'reason' => ...]
 * if the token isn't configured or the number couldn't be normalized -
 * mirrors the shape sendPropertyTelegramMessage() uses for the same cases,
 * so callers can handle both the same way.
 */
if (!function_exists('sendWhatsAppTemplateMessage')) {
    function sendWhatsAppTemplateMessage($toRawNumber, $templateName, array $bodyParams = [], $languageCode = 'en') {
        $token = getWhatsAppAccessToken();
        if (!$token) {
            return ['skipped' => true, 'reason' => 'WhatsApp access token not configured (set WHATSAPP_ACCESS_TOKEN or php/config/whatsapp_token.php)'];
        }

        $to = normalizeWhatsAppNumber($toRawNumber);
        if (!$to) {
            return ['skipped' => true, 'reason' => "Could not normalize phone number: {$toRawNumber}"];
        }

        $components = [];
        if (!empty($bodyParams)) {
            $components[] = [
                'type' => 'body',
                'parameters' => array_map(function ($p) {
                    return ['type' => 'text', 'text' => (string)$p];
                }, $bodyParams),
            ];
        }

        $payload = [
            'messaging_product' => 'whatsapp',
            'to' => $to,
            'type' => 'template',
            'template' => [
                'name' => $templateName,
                'language' => ['code' => $languageCode],
                'components' => $components,
            ],
        ];

        $url = 'https://graph.facebook.com/' . WHATSAPP_API_VERSION . '/' . WHATSAPP_PHONE_NUMBER_ID . '/messages';

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $token,
            'Content-Type: application/json',
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        $response = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        $status = ($http_code == 200) ? 'SUCCESS' : 'WARNING';
        if (class_exists('TelescopeLogger')) {
            TelescopeLogger::log(
                'whatsapp',
                $status,
                "📱 WhatsApp API: send '{$templateName}' to {$to} - HTTP {$http_code}" . ($error ? " (Error: {$error})" : ''),
                "WhatsApp Sender [Response: {$http_code}]",
                ['to' => $to, 'template' => $templateName, 'http_code' => $http_code, 'error' => $error, 'response' => $response]
            );
        }

        $decoded = json_decode($response, true);
        return is_array($decoded) ? $decoded : ['raw' => $response];
    }
}
