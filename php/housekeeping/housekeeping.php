<?php
/**
 * housekeeping/housekeeping.php
 * Per-room "needs cleaning" tracking, added 28 Aug 2026 alongside the
 * Telegram "Mark Room Ready" action button (see also the "Mark Checked-In" /
 * "Mark Checked-Out" buttons in guests.php - all three were built together).
 *
 * Only ever meaningful for a room a guest actually checked out of
 * (guests.room_id) - SINGLE properties have no room-selection UI so room_id
 * stays NULL there, meaning this never fires for them. RoomsManagement.tsx
 * (multi-key rooms only) is deliberately the only place this status is
 * surfaced in the app, for the same reason.
 */

require_once __DIR__ . '/../telegram/sender.php';
require_once __DIR__ . '/../telegram/templates.php';
require_once __DIR__ . '/../config/schema_cache.php';

// Shares the same schema_cache key as router.php's own `properties` self-heal
// block (schema_properties_table_v6) - whichever entry point runs first (a
// normal router.php request, or webhook_handler.php reached standalone via
// telegram_webhook.php/poll_telegram_updates.php, neither of which boots
// router.php) adds the columns and marks it verified for both.
if (!function_exists('ensureHousekeepingSchema')) {
    function ensureHousekeepingSchema($pdo) {
        if (isSchemaVerified('schema_properties_table_v6')) return;
        try {
            $cols = $pdo->query("SHOW COLUMNS FROM properties")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('housekeeping_status', $cols)) {
                $pdo->exec("ALTER TABLE properties ADD COLUMN `housekeeping_status` VARCHAR(20) NOT NULL DEFAULT 'Ready'");
            }
            if (!in_array('housekeeping_telegram_chat_id', $cols)) {
                $pdo->exec("ALTER TABLE properties ADD COLUMN `housekeeping_telegram_chat_id` VARCHAR(64) DEFAULT NULL");
            }
            if (!in_array('housekeeping_telegram_message_id', $cols)) {
                $pdo->exec("ALTER TABLE properties ADD COLUMN `housekeeping_telegram_message_id` INT DEFAULT NULL");
            }
        } catch (Exception $e) {}
        markSchemaVerified('schema_properties_table_v6');
    }
}

// Called right after a guest checkout (from any path - the app's own
// checkout_guest action or the Telegram "Mark Checked-Out" button, both of
// which now go through performGuestCheckout() in guests.php) for whichever
// room they were staying in. Flips the room to 'Dirty' and sends a "Needs
// Cleaning" alert carrying the Mark Room Ready button. No-op if the guest
// had no room_id (SINGLE properties / walk-ins) or the room is already
// marked Dirty (no duplicate alert for back-to-back checkouts before anyone
// cleans - can't happen under the "1 room = 1 active booking" rule anyway,
// but stay defensive).
if (!function_exists('markRoomDirtyAfterCheckout')) {
    function markRoomDirtyAfterCheckout($pdo, $propertyId, $roomId) {
        if (empty($roomId)) return;
        ensureHousekeepingSchema($pdo);
        try {
            $stmt = $pdo->prepare("SELECT id, name, housekeeping_status FROM properties WHERE id = ?");
            $stmt->execute([$roomId]);
            $room = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$room || $room['housekeeping_status'] === 'Dirty') return;

            $pdo->prepare("UPDATE properties SET housekeeping_status = 'Dirty' WHERE id = ?")->execute([$roomId]);

            $message = TelegramTemplates::render($pdo, 'room_needs_cleaning', [
                'room_name' => $room['name'],
            ]);
            $replyMarkup = ['inline_keyboard' => [[
                ['text' => '🧹 Mark Room Ready', 'callback_data' => "room_ready_{$roomId}"]
            ]]];
            $sendResult = sendPropertyTelegramMessage($pdo, $propertyId, 'admin', $message, $replyMarkup, 'room_needs_cleaning');
            $decoded = is_string($sendResult) ? json_decode($sendResult, true) : null;
            if (!empty($decoded['ok']) && !empty($decoded['result'])) {
                $pdo->prepare("UPDATE properties SET housekeeping_telegram_chat_id = ?, housekeeping_telegram_message_id = ? WHERE id = ?")
                    ->execute([$decoded['result']['chat']['id'], $decoded['result']['message_id'], $roomId]);
            }
        } catch (Throwable $e) {
            error_log("markRoomDirtyAfterCheckout failed: " . $e->getMessage());
        }
    }
}

// Shared by the Telegram "Mark Room Ready" tap (callback_data room_ready_{id})
// and the manual toggle in RoomsManagement.tsx (set_room_ready action below) -
// both flip the same column and edit the same alert message.
if (!function_exists('markRoomReady')) {
    function markRoomReady($pdo, $roomId, $staffName) {
        ensureHousekeepingSchema($pdo);
        $stmt = $pdo->prepare("SELECT id, name, parent_property_id, housekeeping_status, housekeeping_telegram_chat_id, housekeeping_telegram_message_id FROM properties WHERE id = ?");
        $stmt->execute([$roomId]);
        $room = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$room) {
            return ['status' => 'error', 'message' => 'Room not found'];
        }
        if ($room['housekeeping_status'] !== 'Dirty') {
            return ['status' => 'success', 'already' => true, 'message' => 'Room is already marked Ready'];
        }

        $pdo->prepare("UPDATE properties SET housekeeping_status = 'Ready' WHERE id = ?")->execute([$roomId]);

        if (!empty($room['housekeeping_telegram_chat_id']) && !empty($room['housekeeping_telegram_message_id'])) {
            // The room row itself doesn't carry its own Telegram config - the
            // parent multi-key property does (same property_id that sent the
            // original "Needs Cleaning" alert via markRoomDirtyAfterCheckout).
            $propertyIdForToken = $room['parent_property_id'] ?: $room['id'];
            $config = getPropertyTelegramConfig($pdo, $propertyIdForToken);
            $botToken = !empty($config['botToken']) ? $config['botToken'] : (defined('TELEGRAM_BOT_TOKEN') ? TELEGRAM_BOT_TOKEN : null);
            $editedText = "✅ <b>ROOM READY</b>\n\n🚪 <b>Room:</b> " . htmlspecialchars($room['name']) . "\n🧹 <b>Cleaned By:</b> {$staffName}\n🕒 <b>At:</b> " . date('h:i A');
            editTelegramMessageText($room['housekeeping_telegram_chat_id'], $room['housekeeping_telegram_message_id'], $editedText, null, $botToken);
        }

        return ['status' => 'success', 'already' => false, 'message' => 'Room marked ready'];
    }
}

// --- HTTP actions (router.php dispatches here) ---
if (!function_exists('handleHousekeepingActions')) {
    function handleHousekeepingActions($pdo, $request_method, $action, $propertyId) {
        ensureHousekeepingSchema($pdo);

        switch ($action) {
            case 'get_housekeeping_statuses':
                $stmt = $pdo->prepare("SELECT id, housekeeping_status FROM properties WHERE (parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM') OR id = ?");
                $stmt->execute([$propertyId, $propertyId]);
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $map = [];
                foreach ($rows as $r) {
                    $map[$r['id']] = $r['housekeeping_status'];
                }
                echo json_encode(['status' => 'success', 'data' => $map]);
                break;

            case 'set_room_ready':
                if ($request_method === 'POST') {
                    $input = json_decode(file_get_contents('php://input'), true) ?: [];
                    $roomId = intval($input['room_id'] ?? 0);
                    if (!$roomId) {
                        http_response_code(400);
                        echo json_encode(['status' => 'error', 'message' => 'room_id is required']);
                        break;
                    }
                    $staffName = trim($input['staff_name'] ?? 'Staff');
                    echo json_encode(markRoomReady($pdo, $roomId, $staffName));
                }
                break;

            default:
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'Invalid housekeeping action']);
                break;
        }
    }
}
