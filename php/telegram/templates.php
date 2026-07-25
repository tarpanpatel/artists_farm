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
                        return $dbContent;
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
                'requisition_stock_fulfilled' => "📦 <b>STOCK {status_title}</b>\n━━━━━━━━━━━━━━━━━━\n🆔 <b>Sheet ID:</b> #{req_id}\n👤 <b>Processed By:</b> {staff_name}\n📅 <b>Fulfillment Time:</b> {fulfillment_time}\n🟢 <b>Global Status:</b> {status_label}\n━━━━━━━━━━━━━━━━━━\n📝 <b>Items Variance Manifest:</b>\n\n{items_manifest}",
                'billing_admin_checkout_report' => "🔔 <b>PROPERTY CHECKOUT SETTLEMENT REPORT</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Guest:</b> {guest_name}\n\n🏠 <b>ACCOMMODATION LOGISTICS:</b>\n• Contract Tariff: ₹{base_rent}\n• Advance Taken: ₹{advance_paid} (By: {advance_collector})\n• Pending Settled: ₹{accommodation_pending} (By: {pending_collector})\n\n🍽️ <b>FINAL ITEMIZED KOT & EXTRAS:</b>\n{items_list}\n• Incidentals Subtotal: <b>₹{food_subtotal}</b>\n\n💳 <b>FINAL PAYOUT SPLIT DISTRIBUTION:</b>\n{split_phrases}\n👤 <i>Desk Cashier Executing: {cashier_name}</i>\n━━━━━━━━━━━━━━━━━━\n<b>GRAND TOTAL PAYABLE SETTLED: ₹{grand_total_due}</b>",
                'finance_revenue_credit' => "💰 <b>NEW FINANCIAL TRANSACTION (REVENUE CREDIT)</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Guest:</b> {guest_name}\n👤 <b>Cashier:</b> {cashier_name}\n💳 <b>Split Distribution:</b>\n{split_phrases}\n━━━━━━━━━━━━━━━━━━\n🟢 <b>TOTAL CREDITED: ₹{total_collected}</b>",
                'finance_operational_expense' => "💸 <b>NEW FINANCIAL TRANSACTION (EXPENSE)</b>\n━━━━━━━━━━━━━━━━━━\n📅 <b>Date:</b> {expense_date}\n🗂️ <b>Category:</b> {category}\n👤 <b>Paid By:</b> {paid_by}\n📝 <b>Details:</b> {description}\n💳 <b>Method:</b> {payment_mode}\n━━━━━━━━━━━━━━━━━━\n🔴 <b>DEBIT AMOUNT: ₹{amount}</b>",
                'finance_drawer_adjustment' => "🏧 <b>FINANCIAL TRANSACTION (DRAWER ADJUSTMENT)</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Staff Handler:</b> {staff_name}\n🔄 <b>Action Type:</b> {action_type}\n📝 <b>Remarks:</b> {remarks}\n━━━━━━━━━━━━━━━━━━\n💰 <b>AMOUNT MOVEMENT: ₹{amount}</b>",
                'cron_upcoming_arrivals' => "🛎️ <b>UPCOMING ARRIVALS TOMORROW</b>\n━━━━━━━━━━━━━━━━━━\n\n{arrivals_list}"
            ];

            return $defaults[$templateKey] ?? "Alert Notification ({$templateKey}) triggered.";
        }

        // =========================================================================
        // HELPER CONVENIENCE METHODS
        // =========================================================================

        public static function singleDishReady($orderId, $dishName, $qty = 1, $notes = '') {
            global $pdo;
            $instruction_note = !empty($notes) ? " (Note: {$notes})" : "";
            return self::render($pdo, 'kitchen_single_dish_ready', [
                'order_id' => $orderId,
                'qty' => $qty,
                'dish_name' => $dishName,
                'instruction_note' => $instruction_note
            ]);
        }

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

        public static function materialRequest($staffName, $itemsList = [], $customNotes = '') {
            global $pdo;
            $items_formatted = is_array($itemsList) ? implode("\n", $itemsList) : $itemsList;
            return self::render($pdo, 'requisition_material_request', [
                'staff_name' => $staffName,
                'request_time' => date('d M Y, h:i A'),
                'items_list' => !empty($items_formatted) ? $items_formatted : "• See special request below",
                'custom_notes' => !empty($customNotes) ? $customNotes : "None"
            ]);
        }

        public static function stockRequisitionFulfilled($reqId, $staffName, $statusTitle, $statusLabel, $itemsManifest = []) {
            global $pdo;
            $manifest_str = is_array($itemsManifest) ? implode("\n", $itemsManifest) : $itemsManifest;
            return self::render($pdo, 'requisition_stock_fulfilled', [
                'req_id' => $reqId,
                'staff_name' => $staffName,
                'fulfillment_time' => date('d M Y - H:i:s'),
                'status_title' => $statusTitle,
                'status_label' => $statusLabel,
                'items_manifest' => $manifest_str
            ]);
        }

        public static function adminCheckoutReport($guestName, $baseRent, $advancePaid, $advanceCollector, $pendingAmount, $pendingCollector, $itemsList, $adjustments, $foodSubtotal, $mods, $splitPhrases, $cashierName, $grandTotal) {
            global $pdo;
            $items_formatted = [];
            if (!empty($itemsList)) {
                foreach ($itemsList as $itm) {
                    $net_q = ($itm['quantity'] ?? 1) - ($itm['returned_qty'] ?? 0);
                    if ($net_q > 0) {
                        $items_formatted[] = "• " . ($itm['name'] ?? 'Item') . " (x" . $net_q . "): ₹" . number_format($net_q * ($itm['price'] ?? 0), 2);
                    }
                }
            }
            if (!empty($adjustments)) {
                foreach ($adjustments as $adj) {
                    $sign = ($adj['type'] ?? '') === 'charge' ? '+' : '-';
                    $items_formatted[] = "• [Adj] " . ($adj['reason'] ?? 'Extra') . ": " . $sign . "₹" . number_format($adj['amount'] ?? 0, 2);
                }
            }
            $items_str = !empty($items_formatted) ? implode("\n", $items_formatted) : "• No food orders recorded.";

            $splits_str = is_array($splitPhrases) ? implode("\n", array_map(fn($p) => "• " . $p, $splitPhrases)) : $splitPhrases;

            return self::render($pdo, 'billing_admin_checkout_report', [
                'guest_name' => $guestName,
                'base_rent' => number_format($baseRent, 2),
                'advance_paid' => number_format($advancePaid, 2),
                'advance_collector' => $advanceCollector,
                'accommodation_pending' => number_format($pendingAmount, 2),
                'pending_collector' => $pendingCollector,
                'items_list' => $items_str,
                'food_subtotal' => number_format($foodSubtotal, 2),
                'split_phrases' => $splits_str,
                'cashier_name' => $cashierName,
                'grand_total_due' => number_format($grandTotal, 2)
            ]);
        }

        public static function financeRevenueCredit($guestName, $cashierName, $splitPhrases, $totalCollected) {
            global $pdo;
            $splits_str = is_array($splitPhrases) ? implode("\n", array_map(fn($p) => "• " . $p, $splitPhrases)) : $splitPhrases;
            return self::render($pdo, 'finance_revenue_credit', [
                'guest_name' => $guestName,
                'cashier_name' => $cashierName,
                'split_phrases' => $splits_str,
                'total_collected' => number_format($totalCollected, 2)
            ]);
        }

        public static function financeOperationalExpense($expenseDate, $category, $paidBy, $description, $paymentMode, $amount) {
            global $pdo;
            return self::render($pdo, 'finance_operational_expense', [
                'expense_date' => $expenseDate,
                'category' => $category,
                'paid_by' => $paidBy,
                'description' => $description,
                'payment_mode' => $paymentMode,
                'amount' => number_format($amount, 2)
            ]);
        }

        public static function financeDrawerAdjustment($staffName, $actionType, $remarks, $amount) {
            global $pdo;
            return self::render($pdo, 'finance_drawer_adjustment', [
                'staff_name' => $staffName,
                'action_type' => $actionType,
                'remarks' => $remarks,
                'amount' => number_format($amount, 2)
            ]);
        }

        public static function upcomingArrivalsCron($arrivals = []) {
            global $pdo;
            $arrivals_formatted = [];
            foreach ($arrivals as $b) {
                $pax = ($b['adults'] ?? 1) . " Adult(s)" . (($b['children'] ?? 0) > 0 ? ", " . $b['children'] . " Child(ren)" : "");
                $arrivals_formatted[] = "👤 <b>Guest:</b> " . ($b['guest_name'] ?? 'Walk-in') . "\n📱 <b>Phone:</b> " . ($b['phone_number'] ?? '-') . "\n👥 <b>Pax:</b> {$pax}\n⏰ <b>Est. Time:</b> " . ($b['arrival_time'] ?? '-');
            }
            return self::render($pdo, 'cron_upcoming_arrivals', [
                'arrivals_list' => implode("\n\n", $arrivals_formatted)
            ]);
        }
    }
}
