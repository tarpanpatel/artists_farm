<?php
/**
 * /telegram/telegram_webhook.php
 * Webhook Handler calculating dynamic remaining items for ticket status
 */

ini_set('display_errors', 0);
error_reporting(E_ALL);

require_once __DIR__ . "/../config/database.php";
require_once __DIR__ . "/sender.php";

$rawContent = file_get_contents("php://input");
$update = json_decode($rawContent, true);

if (!$update || !isset($update['callback_query'])) {
    http_response_code(200); 
    exit;
}

$cq = $update['callback_query'];
$cq_id = $cq['id'];
$chat_id = $cq['message']['chat']['id'] ?? null;
$message_id = $cq['message']['message_id'] ?? null;
$tg_user_id = $cq['from']['id'] ?? null;
$tg_first_name = $cq['from']['first_name'] ?? 'Staff Member';
$callback_data = $cq['data'] ?? '';
$original_text = $cq['message']['text'] ?? '';

$staff_name = $tg_first_name;
if (isset($pdo)) {
    $stmt = $pdo->prepare("SELECT username FROM users WHERE telegram_user_id = ? LIMIT 1");
    $stmt->execute([$tg_user_id]);
    $dbStaff = $stmt->fetchColumn();
    if ($dbStaff) {
        $staff_name = $dbStaff;
    }
}

if (preg_match('/^serve_item_(\d+)_(\d+)$/', $callback_data, $matches)) {
    $order_id = $matches[1];
    $item_index = intval($matches[2]);

    if (isset($pdo)) {
        // Find the specific order_item by order_id and array position
        $checkStmt = $pdo->prepare("
            SELECT oi.id, oi.order_id, oi.item_status, oi.quantity, mi.name as dish_name, o.guest_id, g.guest_name, g.room_number as table_no
            FROM order_items oi 
            JOIN orders o ON oi.order_id = o.id 
            JOIN menu_items mi ON oi.menu_item_id = mi.id 
            LEFT JOIN guests g ON o.guest_id = g.id
            WHERE oi.order_id = ?
            ORDER BY oi.id ASC
        ");
        $checkStmt->execute([$order_id]);
        $allItems = $checkStmt->fetchAll(PDO::FETCH_ASSOC);
        $itemRow = $allItems[$item_index] ?? null;

        if ($itemRow && strtolower($itemRow['item_status']) !== 'served') {
            
            $pdo->prepare("UPDATE order_items SET item_status = 'Served' WHERE id = ?")
                ->execute([$itemRow['id']]);

            // Immutable Audit Log trace
            try {
                $guestName = $itemRow['guest_name'] ?: 'Walk-in';
                $actionText = "{$staff_name} marked {$itemRow['quantity']}x {$itemRow['dish_name']} served for guest {$guestName}";
                $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (timestamp, user, action) VALUES (?, ?, ?)");
                $stmtAudit->execute([
                    date('Y-m-d H:i:s'),
                    $staff_name,
                    $actionText
                ]);
            } catch (PDOException $ea) {}

            // Calculate actual remaining unserved items for this order ticket
            $remStmt = $pdo->prepare("
                SELECT COUNT(*) 
                FROM order_items 
                WHERE order_id = ? AND (item_status IS NULL OR LOWER(item_status) != 'served')
            ");
            $remStmt->execute([$itemRow['order_id']]);
            $remaining_count = intval($remStmt->fetchColumn());

            // Automatically mark the entire order completed if all items are served
            if ($remaining_count === 0) {
                $pdo->prepare("UPDATE orders SET status = 'Completed', served_at = NOW(), served_by_name = ? WHERE id = ?")
                    ->execute([$staff_name, $itemRow['order_id']]);
            }

            $remaining_text = $remaining_count > 0 ? "$remaining_count item(s) pending" : "0 (All items served!)";

            // Edit current message in Telegram to clear button
            $editTplStmt = $pdo->prepare("SELECT content FROM system_telegram_templates WHERE template_key = 'webhook_dish_served_edit' LIMIT 1");
            $editTplStmt->execute();
            $editTplContent = $editTplStmt->fetchColumn();
            if ($editTplContent) {
                $edited_text = str_replace(
                    ['{original_text}', '{staff_name}', '{serve_time}'],
                    [$original_text, $staff_name, date('h:i A')],
                    $editTplContent
                );
            } else {
                $edited_text = "✅ <b>DISH SERVED</b>\n\n" . $original_text . "\n\n👨‍🍳 <b>Served By:</b> {$staff_name}\n🕒 <b>At:</b> " . date('h:i A');
            }
            if ($chat_id && $message_id) {
                editTelegramMessageText($chat_id, $message_id, $edited_text, null); 
            }

            $tplStmt = $pdo->prepare("SELECT content FROM system_telegram_templates WHERE template_key = 'item_served' LIMIT 1");
            $tplStmt->execute();
            $templateContent = $tplStmt->fetchColumn();

            if ($templateContent) {
                $new_msg = str_replace(
                    ['{item_name}', '{quantity}', '{guest_name}', '{table_no}', '{served_by}', '{remaining_items}'],
                    [
                        htmlspecialchars($itemRow['dish_name']),
                        $itemRow['quantity'],
                        htmlspecialchars($itemRow['guest_name'] ?: 'Walk-in'),
                        $itemRow['table_no'],
                        $staff_name,
                        $remaining_text
                    ],
                    $templateContent
                );
            } else {
                $new_msg = "✅ <b>DISH SERVED</b>\n\n"
                         . "<b>Dish:</b> " . htmlspecialchars($itemRow['dish_name']) . " x" . $itemRow['quantity'] . "\n"
                         . "<b>Guest:</b> " . htmlspecialchars($itemRow['guest_name'] ?: 'Walk-in') . " (Table " . $itemRow['table_no'] . ")\n"
                         . "<b>Served By:</b> {$staff_name}\n"
                         . "<b>Remaining Items:</b> {$remaining_text}\n\n"
                         . "<i>Item delivery confirmed.</i>";
            }

            sendAdminTelegramMessage($new_msg);
            answerTelegramCallbackQuery($cq_id, "{$itemRow['quantity']}x {$itemRow['dish_name']} marked as Served!");
            
        } else {
            answerTelegramCallbackQuery($cq_id, "This dish is already marked as served.", true);
        }
    }
} elseif (preg_match('/^serve_order_(\d+)$/', $callback_data, $matches)) {
    $order_id = $matches[1];

    if (isset($pdo)) {
        // Mark all unserved items in this order as served
        $pdo->prepare("UPDATE order_items SET item_status = 'Served' WHERE order_id = ? AND (item_status IS NULL OR LOWER(item_status) != 'served')")
            ->execute([$order_id]);

        $pdo->prepare("UPDATE orders SET status = 'Completed', served_at = NOW(), served_by_name = ? WHERE id = ?")
            ->execute([$staff_name, $order_id]);

        // Audit log
        try {
            $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (timestamp, user, action) VALUES (?, ?, ?)");
            $stmtAudit->execute([
                date('Y-m-d H:i:s'),
                $staff_name,
                "Staff member {$staff_name} marked entire order #{$order_id} as served via Telegram callback"
            ]);
        } catch (PDOException $ea) {}

        // Edit message to remove button
        $editTplStmt2 = $pdo->prepare("SELECT content FROM system_telegram_templates WHERE template_key = 'webhook_order_completed' LIMIT 1");
        $editTplStmt2->execute();
        $editTplContent2 = $editTplStmt2->fetchColumn();
        if ($editTplContent2) {
            $edited_text = str_replace(
                ['{original_text}', '{staff_name}', '{serve_time}'],
                [$original_text, $staff_name, date('h:i A')],
                $editTplContent2
            );
        } else {
            $edited_text = "✅ <b>ORDER COMPLETED</b>\n\n" . $original_text . "\n\n👨‍🍳 <b>Fulfilled By:</b> {$staff_name}\n🕒 <b>At:</b> " . date('h:i A');
        }
        if ($chat_id && $message_id) {
            editTelegramMessageText($chat_id, $message_id, $edited_text, null);
        }

        answerTelegramCallbackQuery($cq_id, "Order #{$order_id} marked as completed!");
    }
}

http_response_code(200);
