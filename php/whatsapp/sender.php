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
 * file header) - one Meta number, one bill, and every message reads as coming from
 * "Artists Farm" regardless of which tenant's guest receives it. So it may only
 * send on behalf of tenants explicitly switched on, via `tenants.whatsapp_enabled`
 * (self-heals in router.php, defaults to 0).
 *
 * REPLACED a WHATSAPP_ENABLED_TENANT_PHONE constant compared against tenants.phone
 * (12 Sep 2026). That gate had already drifted silently: the constant matched NO
 * tenant on staging, so booking confirmations were sending to nobody - failing
 * closed, which is the safe direction, but with no error or log to notice it by. A
 * phone number is mutable identity; the owner edits it in their own settings and
 * the gate dies. The tenant slug has the same problem (one was being renamed the
 * same day this was written). An explicit column is the only key that survives both,
 * and it is what per-tenant credentials will hang off later.
 */

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
 * Gate for the phased rollout above, by tenant id. Fails closed (false) on any
 * lookup error or missing row, so a DB hiccup never sends a message on behalf of
 * a tenant who has not been switched on.
 */
if (!function_exists('isWhatsAppEnabledForTenant')) {
    function isWhatsAppEnabledForTenant($pdo, $tenantId) {
        if (!$tenantId) return false;
        try {
            $stmt = $pdo->prepare("SELECT whatsapp_enabled FROM tenants WHERE id = ?");
            $stmt->execute([$tenantId]);
            return (int)$stmt->fetchColumn() === 1;
        } catch (PDOException $e) {
            return false;
        }
    }
}

/**
 * Same gate, resolved from a property: does $propertyId belong (directly, or via
 * its parent for a MULTI_KEY_ROOM child that never got its own tenant_id
 * backfilled) to a tenant enabled for WhatsApp?
 */
if (!function_exists('isWhatsAppEnabledForProperty')) {
    function isWhatsAppEnabledForProperty($pdo, $propertyId) {
        try {
            $stmt = $pdo->prepare(
                "SELECT t.whatsapp_enabled FROM properties p
                 LEFT JOIN properties parent ON p.parent_property_id = parent.id
                 JOIN tenants t ON t.id = COALESCE(p.tenant_id, parent.tenant_id)
                 WHERE p.id = ?"
            );
            $stmt->execute([$propertyId]);
            $enabled = $stmt->fetchColumn();
            return $enabled !== false && (int)$enabled === 1;
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

/**
 * Send a direct text message via WhatsApp Business Cloud API.
 */
if (!function_exists('sendWhatsAppDirectTextMessage')) {
    function sendWhatsAppDirectTextMessage($toRawNumber, $messageText) {
        $token = getWhatsAppAccessToken();
        if (!$token) {
            return ['status' => 'error', 'message' => 'WhatsApp access token not configured'];
        }

        $to = normalizeWhatsAppNumber($toRawNumber);
        if (!$to) {
            return ['status' => 'error', 'message' => "Could not normalize phone number: {$toRawNumber}"];
        }

        $payload = [
            'messaging_product' => 'whatsapp',
            'recipient_type' => 'individual',
            'to' => $to,
            'type' => 'text',
            'text' => [
                'preview_url' => true,
                'body' => (string)$messageText,
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
                "📱 WhatsApp API Direct Message to {$to} - HTTP {$http_code}" . ($error ? " (Error: {$error})" : ''),
                "WhatsApp Direct Sender [Response: {$http_code}]",
                ['to' => $to, 'http_code' => $http_code, 'error' => $error, 'response' => $response]
            );
        }

        $decoded = json_decode($response, true);
        if ($http_code == 200 && !empty($decoded['messages'])) {
            return ['status' => 'success', 'http_code' => $http_code, 'data' => $decoded];
        } else {
            $apiError = $decoded['error']['message'] ?? ($decoded['error']['error_user_msg'] ?? "HTTP {$http_code}");
            return ['status' => 'error', 'http_code' => $http_code, 'message' => $apiError, 'raw' => $decoded ?: $response];
        }
    }
}

/**
 * Send "Make Booking" WhatsApp message when a property owner creates a booking.
 * Contains cancellation policy, location, pricing, dates — NOT guest-specific
 * details like WiFi passwords.
 */
if (!function_exists('sendMakeBookingWhatsApp')) {
    function sendMakeBookingWhatsApp($pdo, $guestPhoneNumber, $propertyId, $roomId, $bookingData) {
        if (!isWhatsAppEnabledForProperty($pdo, $propertyId)) {
            return ['skipped' => true, 'reason' => 'WhatsApp not enabled for this property'];
        }

        try {
            require_once __DIR__ . '/template_renderer.php';

            // Get property details
            $propStmt = $pdo->prepare("SELECT name, address, phone as contact_phone, whatsapp_make_booking_template FROM properties WHERE id = ? LIMIT 1");
            $propStmt->execute([$propertyId]);
            $property = $propStmt->fetch(PDO::FETCH_ASSOC);

            if (!$property) {
                return ['status' => 'error', 'message' => 'Property not found'];
            }

            // Get room details if specified
            $roomName = 'your assigned room';
            if ($roomId) {
                $roomStmt = $pdo->prepare("SELECT name FROM properties WHERE id = ? AND is_deleted = 0 LIMIT 1");
                $roomStmt->execute([$roomId]);
                $room = $roomStmt->fetch(PDO::FETCH_ASSOC);
                if ($room) {
                    $roomName = $room['name'];
                }
            }

            // Use property-level custom template if set, otherwise default
            $template = !empty($property['whatsapp_make_booking_template'])
                ? $property['whatsapp_make_booking_template']
                : getDefaultMakeBookingTemplate();

            // Build template variables from booking data
            $variables = [
                'property_name' => $property['name'] ?? 'Your Property',
                'room_name' => $roomName,
                'checkin_date' => date('d M Y', strtotime($bookingData['checkin_date'] ?? date('Y-m-d'))),
                'checkout_date' => date('d M Y', strtotime($bookingData['expected_checkout'] ?? date('Y-m-d', strtotime('+1 day')))),
                'guest_count' => intval($bookingData['no_of_guests'] ?? 1),
                'room_tariff' => number_format(floatval($bookingData['base_room_rent'] ?? 0), 2),
                'cancellation_policy' => $bookingData['cancellation_policy'] ?? 'Standard cancellation terms apply',
                'address' => $property['address'] ?? '',
                'contact_phone' => $property['contact_phone'] ?? '',
                'maps_link' => $bookingData['maps_link'] ?? '',
            ];

            // Render template with variables
            $messageText = renderWhatsappVoucherTemplate($template, $variables);

            // For now, send as direct text since Meta templates require pre-approval
            // This will be replaced with template send once templates are approved
            return sendWhatsAppDirectTextMessage($guestPhoneNumber, $messageText);
        } catch (Exception $e) {
            if (class_exists('TelescopeLogger')) {
                TelescopeLogger::log('whatsapp', 'ERROR', "Failed to send Make Booking WhatsApp: " . $e->getMessage(), "Make Booking Sender", ['error' => $e->getMessage()]);
            }
            return ['status' => 'error', 'message' => $e->getMessage()];
        }
    }
}

/**
 * Send "Booking Confirmation Voucher" WhatsApp message after a booking is confirmed.
 * Contains all practical check-in information: WiFi, house manual, notes, full booking details.
 */
if (!function_exists('sendBookingConfirmationWhatsApp')) {
    function sendBookingConfirmationWhatsApp($pdo, $guestPhoneNumber, $propertyId, $bookingId, $guestData) {
        if (!isWhatsAppEnabledForProperty($pdo, $propertyId)) {
            return ['skipped' => true, 'reason' => 'WhatsApp not enabled for this property'];
        }

        try {
            require_once __DIR__ . '/template_renderer.php';

            // Get property details and guest info
            $propStmt = $pdo->prepare("SELECT name, address, phone as contact_phone,
                                            wifi_network, wifi_password, house_manual,
                                            upi_id, checkin_time, checkout_time,
                                            whatsapp_booking_confirmation_template
                                       FROM properties WHERE id = ? LIMIT 1");
            $propStmt->execute([$propertyId]);
            $property = $propStmt->fetch(PDO::FETCH_ASSOC);

            if (!$property) {
                return ['status' => 'error', 'message' => 'Property not found'];
            }

            // Use property-level custom template if set, otherwise default
            $template = !empty($property['whatsapp_booking_confirmation_template'])
                ? $property['whatsapp_booking_confirmation_template']
                : getDefaultBookingConfirmationTemplate();

            // Get the guest/booking data
            $checkinTime = $property['checkin_time'] ?? '14:00';
            $checkoutTime = $property['checkout_time'] ?? '11:00';

            // Build template variables
            $variables = [
                'booking_id' => $bookingId,
                'guest_name' => $guestData['guest_name'] ?? 'Guest',
                'guest_phone' => $guestData['phone_number'] ?? '',
                'room_name' => $guestData['room_name'] ?? 'your room',
                'checkin_date' => date('d M Y', strtotime($guestData['checkin_date'] ?? date('Y-m-d'))),
                'checkin_time' => date('H:i', strtotime($checkinTime)),
                'checkout_date' => date('d M Y', strtotime($guestData['expected_checkout'] ?? date('Y-m-d', strtotime('+1 day')))),
                'checkout_time' => date('H:i', strtotime($checkoutTime)),
                'guest_count' => intval($guestData['no_of_guests'] ?? 1),
                'guest_breakdown' => $guestData['guest_breakdown'] ?? '',
                'room_tariff' => number_format(floatval($guestData['base_room_rent'] ?? 0), 2),
                'advance_paid' => number_format(floatval($guestData['advance_paid'] ?? 0), 2),
                'payments_list' => $guestData['payments_list'] ?? '',
                'balance_due' => number_format(floatval($guestData['pending_amount'] ?? 0), 2),
                'security_deposit' => number_format(floatval($guestData['security_deposit'] ?? 0), 2),
                'address' => $property['address'] ?? '',
                'contact_phone' => $property['contact_phone'] ?? '',
                'maps_link' => $guestData['maps_link'] ?? '',
                'upi_id' => $property['upi_id'] ?? '',
                'upi_qr_code_url' => $guestData['upi_qr_code_url'] ?? '',
                'other_notes' => $property['house_manual'] ?? '',
                'wifi_network' => $property['wifi_network'] ?? '',
                'wifi_password' => $property['wifi_password'] ?? '',
                'house_manual' => $property['house_manual'] ?? '',
                'voucher_link' => $guestData['voucher_link'] ?? '',
                'property_name' => $property['name'] ?? 'Your Property',
            ];

            // Render template with variables
            $messageText = renderWhatsappVoucherTemplate($template, $variables);

            // For now, send as direct text since Meta templates require pre-approval
            return sendWhatsAppDirectTextMessage($guestPhoneNumber, $messageText);
        } catch (Exception $e) {
            if (class_exists('TelescopeLogger')) {
                TelescopeLogger::log('whatsapp', 'ERROR', "Failed to send Booking Confirmation WhatsApp: " . $e->getMessage(), "Booking Confirmation Sender", ['error' => $e->getMessage()]);
            }
            return ['status' => 'error', 'message' => $e->getMessage()];
        }
    }
}
