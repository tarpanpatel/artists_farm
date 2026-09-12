<?php
/**
 * WhatsApp Template Rendering Utilities
 * Mirrors the TypeScript logic from src/utils/whatsappVoucherTemplate.ts
 */

if (!function_exists('getDefaultMakeBookingTemplate')) {
    function getDefaultMakeBookingTemplate() {
        return "🏨 *BOOKING INVITATION*
━━━━━━━━━━━━━━━━━
📍 *Location:* {property_name}
🏠 *Unit / Room:* {room_name}
📅 *Check-In:* {checkin_date}
📅 *Check-Out:* {checkout_date}
👥 *Guests:* {guest_count}
💰 *Room Tariff:* ₹{room_tariff} per night
📋 *Cancellation Policy:*
{cancellation_policy}
🗺️ *Location:* {address}
📞 *Contact:* {contact_phone}
🧭 *Google Maps:* {maps_link}
━━━━━━━━━━━━━━━━━
Please confirm your booking or let us know if you have any questions!";
    }
}

if (!function_exists('getDefaultBookingConfirmationTemplate')) {
    function getDefaultBookingConfirmationTemplate() {
        return "🏨 *BOOKING CONFIRMATION VOUCHER*
━━━━━━━━━━━━━━━━━
🔖 *Booking ID:* {booking_id}
👤 *Guest:* {guest_name}
📱 *Mobile:* {guest_phone}
🏠 *Unit / Room:* {room_name}
📅 *Check-In:* {checkin_date} from {checkin_time}
📅 *Check-Out:* {checkout_date} until {checkout_time}
👥 *Number of Guests:* {guest_count}
👨‍👩‍👧 *Party:* {guest_breakdown}
💰 *Room Tariff:* ₹{room_tariff}
💰 *Advance Paid:* ₹{advance_paid}
🧾 *Payments:* {payments_list}
💰 *Balance Due:* ₹{balance_due}
🔐 *Security Deposit (refundable):* ₹{security_deposit}
📍 *Address:* {address}
📞 *Contact / Phone:* {contact_phone}
🧭 *Google Maps:* {maps_link}
💳 *Pay via UPI:* {upi_id}
📷 *Payment QR Code:* {upi_qr_code_url}
📝 *Notes & Instructions:* {other_notes}
📶 *WiFi:* {wifi_network}
🔑 *WiFi Password:* {wifi_password}
🏡 *House Manual:* {house_manual}
🔗 *Your booking online:* {voucher_link}
━━━━━━━━━━━━━━━━━
We look forward to welcoming you to {property_name}!";
    }
}

/**
 * Render a WhatsApp template with variable substitution.
 * Optional tokens whose value is empty get their WHOLE LINE dropped.
 */
if (!function_exists('renderWhatsappVoucherTemplate')) {
    function renderWhatsappVoucherTemplate($template, $values, $optionalTokens = [
        'maps_link',
        'contact_phone',
        'address',
        'other_notes',
        'wifi_network',
        'wifi_password',
        'house_manual',
        'voucher_link',
        'payments_list',
        'guest_breakdown',
        'guest_phone',
        'balance_due',
        'security_deposit',
        'upi_id',
        'upi_qr_code_url',
    ]) {
        $lines = explode("\n", $template);
        $keptLines = [];

        foreach ($lines as $line) {
            $isEmptyOptionalLine = false;
            foreach ($optionalTokens as $token) {
                if (strpos($line, '{' . $token . '}') !== false) {
                    if (empty($values[$token])) {
                        $isEmptyOptionalLine = true;
                        break;
                    }
                }
            }
            if (!$isEmptyOptionalLine) {
                $keptLines[] = $line;
            }
        }

        $result = implode("\n", $keptLines);

        // Substitute all values
        foreach ($values as $key => $val) {
            $result = str_replace('{' . $key . '}', (string)($val ?? ''), $result);
        }

        return $result;
    }
}
