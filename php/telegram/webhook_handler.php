<?php
/**
 * Shared Telegram "button tap" (callback_query) handler.
 *
 * Both receive paths - the production webhook (telegram_webhook.php, called
 * instantly by Telegram over HTTPS) and the local/dev poller
 * (php/cron/poll_telegram_updates.php, which fetches getUpdates on a short
 * interval since XAMPP has no public HTTPS endpoint for Telegram to call) -
 * parse a raw Telegram update into a $callback_query array and hand it to
 * handleTelegramCallbackQuery() here, so neither path needs its own copy of
 * the actual business logic.
 */

require_once __DIR__ . '/sender.php';
require_once __DIR__ . '/../service_requests/service_requests.php';
// Guarded the same way pairing.php guards module_manager.php - this file gets
// loaded via two different physical paths in one process on staging (its own
// copy vs the whitelisted production copy telegram.php redirects to, see
// pairing.php's own comment above for the full write-up), and neither
// guests.php nor housekeeping.php's own declarations are function_exists()-
// guarded internally, so an unguarded require here would "Cannot redeclare"
// the moment both paths get loaded in the same request.
if (!function_exists('performGuestCheckin')) {
    require_once __DIR__ . '/../guests/guests.php';
}
if (!function_exists('markRoomReady')) {
    require_once __DIR__ . '/../housekeeping/housekeeping.php';
}

if (!function_exists('handleTelegramCallbackQuery')) {
    function handleTelegramCallbackQuery($pdo, array $cq, $token = null) {
        $cq_id = $cq['id'];
        $chat_id = $cq['message']['chat']['id'] ?? null;
        $message_id = $cq['message']['message_id'] ?? null;
        $tg_user_id = $cq['from']['id'] ?? null;
        $tg_first_name = $cq['from']['first_name'] ?? 'Staff Member';
        $callback_data = $cq['data'] ?? '';
        $original_text = $cq['message']['text'] ?? '';

        // Resolve which property this group chat belongs to (via its telegram
        // config) so replies/edits use that property's own bot token and the
        // "served" notification follows its routing map instead of the legacy
        // env-constant path.
        $token = $token ?: (defined('TELEGRAM_BOT_TOKEN') ? TELEGRAM_BOT_TOKEN : null);
        $property = $chat_id ? findPropertyForTelegramChat($pdo, $chat_id, $token) : null;
        $propertyId = $property['propertyId'] ?? null;
        $propertyToken = $propertyId ? (!empty($property['config']['botToken']) ? $property['config']['botToken'] : $token) : $token;

        $staff_name = $tg_first_name;
        $stmt = $pdo->prepare("SELECT username FROM users WHERE telegram_user_id = ? LIMIT 1");
        $stmt->execute([$tg_user_id]);
        $dbStaff = $stmt->fetchColumn();
        if ($dbStaff) {
            $staff_name = $dbStaff;
        }

        if (preg_match('/^serve_item_([A-Za-z0-9\-\_]+)_(\d+)$/', $callback_data, $matches)) {
            $order_id = $matches[1];
            $item_index = intval($matches[2]);
            $cleanNumeric = intval(preg_replace('/[^0-9]/', '', $order_id));

            // Find the specific order_item by order_id and array position
            $checkStmt = $pdo->prepare("
                SELECT oi.id, oi.order_id, oi.item_status, oi.quantity, mi.name as dish_name, o.guest_id, g.guest_name, rp.name as table_no
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                JOIN menu_items mi ON oi.menu_item_id = mi.id
                LEFT JOIN guests g ON o.guest_id = g.id
                LEFT JOIN properties rp ON g.room_id = rp.id
                WHERE oi.order_id = ? OR oi.order_id = ? OR o.id = ?
                ORDER BY oi.id ASC
            ");
            $checkStmt->execute([$order_id, $cleanNumeric, $cleanNumeric]);
            $allItems = $checkStmt->fetchAll(PDO::FETCH_ASSOC);
            $itemRow = $allItems[$item_index] ?? $allItems[0] ?? null;

            // CONCURRENCY (30 Aug 2026): the "already served?" test above is advisory
            // only - it CANNOT be trusted to decide whether to write, because a Telegram
            // inline button stays tappable for everyone in the group indefinitely and the
            // KDS only refreshes every 15s, so two staff tapping the same dish seconds
            // apart both read 'not served' and both proceeded. The UPDATE is what actually
            // decides: it only matches a row that is still unserved, and rowCount() tells
            // us whether THIS tap was the one that claimed it. Without this, the second
            // tap wrote a duplicate served_logs row (a phantom second serving in the KDS
            // "Served Dishes" report) and a duplicate audit row.
            $claimed = false;
            if ($itemRow && strtolower($itemRow['item_status']) !== 'served') {
                $claimStmt = $pdo->prepare("UPDATE order_items SET item_status = 'Served' WHERE id = ? AND (item_status IS NULL OR LOWER(item_status) != 'served')");
                $claimStmt->execute([$itemRow['id']]);
                $claimed = $claimStmt->rowCount() > 0;
            }

            if ($itemRow && $claimed) {

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

                // Record in Current Guest Served Dishes (served_logs) so serves
                // done via the Telegram button also appear in the KDS table
                try {
                    if ($propertyId) {
                        $pdo->prepare("INSERT INTO served_logs (property_id, order_id, item_name, quantity, served_by, guest_name, room_number, served_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())")
                            ->execute([
                                $propertyId,
                                $itemRow['order_id'],
                                $itemRow['dish_name'],
                                $itemRow['quantity'],
                                $staff_name,
                                $itemRow['guest_name'] ?: 'Walk-in',
                                $itemRow['table_no']
                            ]);
                    }
                } catch (PDOException $es) {}

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
                    editTelegramMessageText($chat_id, $message_id, $edited_text, null, $propertyToken);
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

                if ($propertyId) {
                    // Follow the property's routing map (item_served -> kitchen group)
                    sendPropertyTelegramMessage($pdo, $propertyId, 'kitchen', $new_msg, null, 'item_served');
                } else {
                    sendAdminTelegramMessage($new_msg);
                }
                answerTelegramCallbackQuery($cq_id, "{$itemRow['quantity']}x {$itemRow['dish_name']} marked as Served!", false, $propertyToken);

            } else {
                answerTelegramCallbackQuery($cq_id, "This dish is already marked as served.", true, $propertyToken);
            }
        } elseif (preg_match('/^serve_order_(\d+)$/', $callback_data, $matches)) {
            $order_id = $matches[1];

            // Record in Current Guest Served Dishes (served_logs) for every item
            // about to be marked served (query before the status flip below).
            //
            // CONCURRENCY (30 Aug 2026): "read the unserved items, log them, then flip
            // them" is only safe if no one else can do the same thing in between - two
            // staff tapping "Serve All" on the same ticket both read the same unserved
            // list and both wrote a full set of served_logs rows, duplicating every dish
            // in the KDS "Served Dishes" report (the UPDATE below was already correctly
            // conditional, so only the logging duplicated - which made it easy to miss).
            // Selecting FOR UPDATE inside a transaction makes the second tapper wait,
            // then read an empty unserved list and log nothing.
            try {
                if ($propertyId) {
                    $pdo->beginTransaction();
                    $servedStmt = $pdo->prepare("
                        SELECT oi.quantity, mi.name as dish_name, g.guest_name, rp.name as table_no
                        FROM order_items oi
                        JOIN orders o ON oi.order_id = o.id
                        JOIN menu_items mi ON oi.menu_item_id = mi.id
                        LEFT JOIN guests g ON o.guest_id = g.id
                        LEFT JOIN properties rp ON g.room_id = rp.id
                        WHERE oi.order_id = ? AND (oi.item_status IS NULL OR LOWER(oi.item_status) != 'served')
                        FOR UPDATE
                    ");
                    $servedStmt->execute([$order_id]);
                    $insServed = $pdo->prepare("INSERT INTO served_logs (property_id, order_id, item_name, quantity, served_by, guest_name, room_number, served_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())");
                    foreach ($servedStmt->fetchAll(PDO::FETCH_ASSOC) as $si) {
                        $insServed->execute([
                            $propertyId,
                            $order_id,
                            $si['dish_name'],
                            $si['quantity'],
                            $staff_name,
                            $si['guest_name'] ?: 'Walk-in',
                            $si['table_no']
                        ]);
                    }
                    // Flip the items inside the same transaction the rows were locked in,
                    // so the log rows and the status change land together or not at all.
                    $pdo->prepare("UPDATE order_items SET item_status = 'Served' WHERE order_id = ? AND (item_status IS NULL OR LOWER(item_status) != 'served')")
                        ->execute([$order_id]);
                    $pdo->commit();
                }
            } catch (PDOException $es) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
            }

            // Mark all unserved items in this order as served (also covers the
            // no-$propertyId case, where the transactional block above is skipped).
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
                editTelegramMessageText($chat_id, $message_id, $edited_text, null, $propertyToken);
            }

            answerTelegramCallbackQuery($cq_id, "Order #{$order_id} marked as completed!", false, $propertyToken);
        } elseif (preg_match('/^fulfill_request_(\d+)$/', $callback_data, $matches)) {
            $result = fulfillServiceRequest($pdo, intval($matches[1]), $staff_name);
            if (($result['status'] ?? '') === 'success' && empty($result['already'])) {
                answerTelegramCallbackQuery($cq_id, "Service request marked fulfilled!", false, $propertyToken);
            } elseif (!empty($result['already'])) {
                answerTelegramCallbackQuery($cq_id, "Already marked fulfilled.", true, $propertyToken);
            } else {
                answerTelegramCallbackQuery($cq_id, $result['message'] ?? 'Failed to update request.', true, $propertyToken);
            }
        } elseif (preg_match('/^checkin_guest_(\d+)$/', $callback_data, $matches)) {
            $result = checkinGuestViaTelegram($pdo, intval($matches[1]), $staff_name);
            if (($result['status'] ?? '') === 'success' && empty($result['already'])) {
                answerTelegramCallbackQuery($cq_id, "Guest checked in!", false, $propertyToken);
            } elseif (!empty($result['already'])) {
                answerTelegramCallbackQuery($cq_id, "Guest is already checked in.", true, $propertyToken);
            } else {
                answerTelegramCallbackQuery($cq_id, $result['message'] ?? 'Failed to check in guest.', true, $propertyToken);
            }
        } elseif (preg_match('/^checkout_guest_(\d+)$/', $callback_data, $matches)) {
            $result = checkoutGuestViaTelegram($pdo, intval($matches[1]), $staff_name);
            if (($result['status'] ?? '') === 'success' && empty($result['already'])) {
                answerTelegramCallbackQuery($cq_id, "Guest checked out!", false, $propertyToken);
            } elseif (!empty($result['already'])) {
                answerTelegramCallbackQuery($cq_id, "Guest is already checked out.", true, $propertyToken);
            } else {
                answerTelegramCallbackQuery($cq_id, $result['message'] ?? 'Failed to check out guest.', true, $propertyToken);
            }
        } elseif (preg_match('/^room_ready_(\d+)$/', $callback_data, $matches)) {
            $result = markRoomReady($pdo, intval($matches[1]), $staff_name);
            if (($result['status'] ?? '') === 'success' && empty($result['already'])) {
                answerTelegramCallbackQuery($cq_id, "Room marked ready!", false, $propertyToken);
            } elseif (!empty($result['already'])) {
                answerTelegramCallbackQuery($cq_id, "Room is already marked ready.", true, $propertyToken);
            } else {
                answerTelegramCallbackQuery($cq_id, $result['message'] ?? 'Failed to update room.', true, $propertyToken);
            }
        }
    }
}
