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

if (preg_match('/^serve_item_(\d+)$/', $callback_data, $matches)) {
    $item_id = $matches[1];

    if (isset($pdo)) {
        $checkStmt = $pdo->prepare("
            SELECT oi.id, oi.order_id, oi.item_status, oi.quantity, mi.name as dish_name, o.guest_id, g.guest_name, '1' as table_no 
            FROM order_items oi 
            JOIN orders o ON oi.order_id = o.id 
            JOIN menu_items mi ON oi.menu_item_id = mi.id 
            LEFT JOIN guests g ON o.guest_id = g.id
            WHERE oi.id = ?
        ");
        $checkStmt->execute([$item_id]);
        $itemRow = $checkStmt->fetch(PDO::FETCH_ASSOC);

        if ($itemRow && strtolower($itemRow['item_status']) !== 'served') {
            
            $pdo->prepare("UPDATE order_items SET item_status = 'Served', served_at = NOW(), served_by_name = ? WHERE id = ?")
                ->execute([$staff_name, $item_id]);

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
                $pdo->prepare("UPDATE orders SET status = 'Completed' WHERE id = ?")->execute([$itemRow['order_id']]);
            }

            $remaining_text = $remaining_count > 0 ? "$remaining_count item(s) pending" : "0 (All items served!)";

            // Edit current message in Telegram to clear button
            $edited_text = "✅ <b>DISH SERVED</b>\n\n" . $original_text . "\n\n👨‍🍳 <b>Served By:</b> {$staff_name}\n🕒 <b>At:</b> " . date('h:i A');
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
}

http_response_code(200);
