<?php
/**
 * telegram/templates.php
 * Pure Backend TelegramTemplates Class - 0% HTML
 * Formats notification strings using database templates or safe fallbacks.
 */

if (!class_exists('TelegramTemplates')) {
    class TelegramTemplates {

        /**
         * Render a template by key with dynamic variable replacements
         */
        public static function render($pdo, string $templateKey, array $replacements = []): string {
            $content = self::getTemplateContent($pdo, $templateKey);
            
            foreach ($replacements as $var => $value) {
                $placeholder = '{' . trim($var, '{}') . '}';
                $content = str_replace($placeholder, (string)$value, $content);
            }
            
            return $content;
        }

        /**
         * Retrieve template content from system_telegram_templates table with fallback default
         */
        public static function getTemplateContent($pdo, string $templateKey): string {
            try {
                if ($pdo) {
                    $stmt = $pdo->prepare("SELECT content FROM system_telegram_templates WHERE template_key = ? LIMIT 1");
                    $stmt->execute([$templateKey]);
                    $dbContent = $stmt->fetchColumn();
                    if ($dbContent && !empty(trim($dbContent))) {
                        return self::restoreEmojis($dbContent);
                    }
                }
            } catch (Exception $e) {
                error_log("TelegramTemplates DB Fetch Error: " . $e->getMessage());
            }

            // Fallback default templates if database table is not initialized
            $defaults = [
                'kitchen_new_order' => "🍽️ <b>NEW KITCHEN ORDER</b> (#{order_id})\n👤 <b>Guest:</b> {guest_name}\n⏰ <b>AT:</b> {order_time}\n━━━━━━━━━━━━━━━━━━\n{order_items}",
                'kitchen_single_dish_ready' => "🍽️ <b>DISH READY TO SERVE</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Order Ticket:</b> #{order_id}\n• <b>{qty}x</b> {dish_name}{instruction_note}\n━━━━━━━━━━━━━━━━━━\n🏃‍♂️ <i>Staff, please collect and tap below when served.</i>",
                'requisition_material_request' => "📦 <b>MATERIAL REQUEST</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>By:</b> {staff_name}\n📅 <b>At:</b> {request_time}\n\n📝 <b>Items List Required:</b>\n{items_list}\n\n💬 <b>Special / Ad-Hoc Requests:</b>\n{custom_notes}\n━━━━━━━━━━━━━━━━━━",
                'requisition_stock_fulfilled' => "{header_title}\n━━━━━━━━━━━━━━━━━━\n🆔 <b>Sheet ID:</b> #{req_id}\n👤 <b>Processed By:</b> {staff_name}\n📅 <b>Fulfillment Time:</b> {fulfillment_time}\n🟢 <b>Global Status:</b> {status_label}\n━━━━━━━━━━━━━━━━━━\n📝 <b>Items Variance Manifest:</b>\n\n{items_manifest}",
                'finance_revenue_credit' => "💰 <b>NEW FINANCIAL TRANSACTION (REVENUE CREDIT)</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Guest:</b> {guest_name}\n👤 <b>Cashier:</b> {cashier_name}\n💳 <b>Split Distribution:</b>\n{split_phrases}\n━━━━━━━━━━━━━━━━━━\n🟢 <b>TOTAL CREDITED: ₹{total_collected}</b>",
                'finance_operational_expense' => "💸 <b>NEW FINANCIAL TRANSACTION (EXPENSE)</b>\n━━━━━━━━━━━━━━━━━━\n📅 <b>Date:</b> {expense_date}\n🗂️ <b>Category:</b> {category}\n👤 <b>Paid By:</b> {paid_by}\n📝 <b>Details:</b> {description}\n💳 <b>Method:</b> {payment_mode}\n━━━━━━━━━━━━━━━━━━\n🔴 <b>DEBIT AMOUNT: ₹{amount}</b>",
                'finance_drawer_adjustment' => "🏧 <b>FINANCIAL TRANSACTION (DRAWER ADJUSTMENT)</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Staff Handler:</b> {staff_name}\n🔄 <b>Action Type:</b> {action_type}\n📝 <b>Remarks:</b> {remarks}\n━━━━━━━━━━━━━━━━━━\n💰 <b>AMOUNT MOVEMENT: ₹{amount}</b>",
                'cron_upcoming_arrivals' => "🛎️ <b>UPCOMING ARRIVALS TOMORROW</b>\n━━━━━━━━━━━━━━━━━━\n\n{arrivals_list}",
                'checkin_verification_complete' => "✅ <b>CHECK-IN VERIFICATION COMPLETE</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Guest:</b> {guest_name}\n🚪 <b>Room:</b> {room_name}\n🪪 <b>ID Document(s):</b> {doc_count}",
                'checkin_verification_reminder' => "🪪 <b>ID VERIFICATION STILL PENDING</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Guest:</b> {guest_name}\n🚪 <b>Room:</b> {room_name}\n📅 <b>Checked In:</b> {checkin_date}\n📋 <b>Uploaded:</b> {uploaded_count}/{required_count}\n━━━━━━━━━━━━━━━━━━\n👉 <i>Open Complete Check-in for this booking to finish it.</i>",
                'service_request_created' => "🛎️ <b>NEW SERVICE REQUEST</b>\n\n🧾 <b>Type:</b> {request_type}\n🚪 <b>Room:</b> {room_name}\n📝 <b>Details:</b> {description}\n👤 <b>Requested By:</b> {requested_by}\n📅 <b>Scheduled:</b> {scheduled_at}",
                'service_request_fulfilled_edit' => "✅ <b>SERVICE REQUEST FULFILLED</b>\n\n🧾 <b>Type:</b> {request_type}\n🚪 <b>Room:</b> {room_name}\n👤 <b>Fulfilled By:</b> {staff_name}\n🕒 <b>At:</b> {fulfill_time}",
                'booking_updated' => "✏️ <b>BOOKING UPDATED</b>\n\n👤 <b>Guest:</b> {guest_name}\n🆔 <b>Booking ID:</b> {booking_id}\n\n{changes_list}",
            ];

            // Make defaults emojis bulletproof too just in case
            foreach ($defaults as $k => $val) {
                $defaults[$k] = self::restoreEmojis($val);
            }
            return $defaults[$templateKey] ?? "Alert Notification ({$templateKey}) triggered.";
        }

        public static function restoreEmojis(string $text): string {
            if (empty($text)) {
                return $text;
            }
            $replacements = [
                '/\?[^\x00-\x7F]*\s*(<b>)?PROPERTY CHECKOUT SETTLEMENT REPORT/i' => '🔔 <b>PROPERTY CHECKOUT SETTLEMENT REPORT</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Guest:(<\/b>)?/i' => '👤 <b>Guest:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?ACCOMMODATION LOGISTICS/i' => '🏠 <b>ACCOMMODATION LOGISTICS</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?FINAL ITEMIZED KOT/i' => '🍽️ <b>FINAL ITEMIZED KOT</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?FINAL PAYOUT SPLIT/i' => '💳 <b>FINAL PAYOUT SPLIT</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Desk Cashier Executing/i' => '👤 <i>Desk Cashier Executing</i>',
                '/\?[^\x00-\x7F]*\s*(<b>)?NEW FINANCIAL TRANSACTION/i' => '💰 <b>NEW FINANCIAL TRANSACTION</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Cashier:(<\/b>)?/i' => '👤 <b>Cashier:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?TOTAL CREDITED/i' => '🟢 <b>TOTAL CREDITED</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?UPCOMING ARRIVALS TOMORROW/i' => '🛎️ <b>UPCOMING ARRIVALS TOMORROW</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?DISH READY TO SERVE/i' => '🍽️ <b>DISH READY TO SERVE</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Order Ticket:(<\/b>)?/i' => '🏷️ <b>Order Ticket:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?NEW ORDER/i' => '🔔 <b>NEW ORDER</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?DISH SERVED/i' => '✅ <b>DISH SERVED</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?MATERIAL REQUEST/i' => '📦 <b>MATERIAL REQUEST</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Processed By:(<\/b>)?/i' => '👤 <b>Processed By:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Global Status:(<\/b>)?/i' => '🟢 <b>Global Status:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?STAFF MEAL REQUEST/i' => '🍱 <b>STAFF MEAL REQUEST</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?MATERIAL REQUISITION APPROVED/i' => '✅ <b>MATERIAL REQUISITION APPROVED</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?FULLY ITEMIZED SETTLEMENT BILL/i' => '🧾 <b>FULLY ITEMIZED SETTLEMENT BILL</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?KITCHEN ORDER/i' => '🍽️ <b>KITCHEN ORDER</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?STAFF DUTY MEAL DISPATCHED/i' => '🍛 <b>STAFF DUTY MEAL DISPATCHED</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?NEW MATERIAL REQUISITION SHEET/i' => '📦 <b>NEW MATERIAL REQUISITION SHEET</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?LOW STOCK WARNING ALERT/i' => '⚠️ <b>LOW STOCK WARNING ALERT</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?PETTY CASH/i' => '💰 <b>PETTY CASH</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?ORDER COMPLETED/i' => '✅ <b>ORDER COMPLETED</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?FINANCIAL TRANSACTION \(DRAWER ADJUSTMENT\)/i' => '🏧 <b>FINANCIAL TRANSACTION (DRAWER ADJUSTMENT)</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Staff Handler:(<\/b>)?/i' => '👤 <b>Staff Handler:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Action Type:(<\/b>)?/i' => '🔄 <b>Action Type:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Remarks:(<\/b>)?/i' => '📝 <b>Remarks:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?AMOUNT MOVEMENT:(<\/b>)?/i' => '💰 <b>AMOUNT MOVEMENT:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Resident:(<\/b>)?/i' => '👤 <b>Resident:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Receipt:(<\/b>)?/i' => '🆔 <b>Receipt:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Advance Paid:(<\/b>)?/i' => '💰 <b>Advance Paid:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Final Balance Due:(<\/b>)?/i' => '🔴 <b>Final Balance Due:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Total Bill:(<\/b>)?/i' => '💵 <b>Total Bill:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Payment Mode:(<\/b>)?/i' => '💳 <b>Payment Mode:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Room:(<\/b>)?/i' => '🚪 <b>Room:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?ID Document\(s\):(<\/b>)?/i' => '🪪 <b>ID Document(s):</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?ID VERIFICATION STILL PENDING/i' => '🪪 <b>ID VERIFICATION STILL PENDING</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Type:(<\/b>)?/i' => '🧾 <b>Type:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Fulfill Time:(<\/b>)?/i' => '🕒 <b>Fulfill Time:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Fulfillment Time:(<\/b>)?/i' => '📅 <b>Fulfillment Time:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Date:(<\/b>)?/i' => '📅 <b>Date:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Category:(<\/b>)?/i' => '🏷️ <b>Category:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Paid By:(<\/b>)?/i' => '👤 <b>Paid By:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Details:(<\/b>)?/i' => '📝 <b>Details:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?Method:(<\/b>)?/i' => '💳 <b>Method:</b>',
                '/\?[^\x00-\x7F]*\s*(<b>)?DEBIT AMOUNT:/i' => '🔴 <b>DEBIT AMOUNT:</b>',
                '/\?[^\x00-\x7F]*\s*(<i>)?Staff, please collect and tap below when/i' => '🏃‍♂️ <i>Staff, please collect and tap below when',
            ];
            
            foreach ($replacements as $pattern => $replacement) {
                $text = preg_replace($pattern, $replacement, $text);
            }
            return $text;
        }

        // =========================================================================
        // HELPER CONVENIENCE METHODS
        // =========================================================================

        public static function newKitchenTicket($orderId, $guestName, $items = []) {
            global $pdo;
            $items_formatted = [];
            foreach ($items as $itm) {
                $qty = $itm['qty'] ?? 1;
                $name = $itm['name'] ?? 'Dish';
                $items_formatted[] = "• <b>{$qty}x</b> {$name}";
            }
            return self::render($pdo, 'kitchen_new_order', [
                'order_id' => $orderId,
                'guest_name' => $guestName,
                'order_time' => date('h:i A'),
                'order_items' => implode("\n", $items_formatted)
            ]);
        }

    }
}
