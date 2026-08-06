<?php
/**
 * Front Office & Guest Management Module
 * Function: Resident registration, stay breakdown, and check-out status.
 */

function convertSnakeToCamel($array) {
    $result = [];
    foreach ($array as $key => $value) {
        $camelKey = preg_replace_callback('/_([a-z])/', function($m) { return strtoupper($m[1]); }, $key);
        $result[$camelKey] = $value;
    }
    return $result;
}

function ensureIdVerificationSchema($pdo) {
    try {
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `id_verification_status` VARCHAR(20) DEFAULT 'Pending'");
    } catch (PDOException $e) {}
    try {
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `id_verification_last_reminder_at` DATETIME DEFAULT NULL");
    } catch (PDOException $e) {}
    try {
    } catch (PDOException $e) {}
}

// Foreign-guest flag + C-Form (FRRO) filing tracking. C-Form must be filed
// within 24h of check-in for foreign nationals - is_foreign_guest is set by
// staff at registration, c_form_filed_at is stamped once staff confirms they
// submitted it on the government portal (this app doesn't file it for them).
function ensureComplianceSchema($pdo) {
    try {
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `is_foreign_guest` TINYINT(1) DEFAULT 0");
    } catch (PDOException $e) {}
    try {
        $pdo->exec("ALTER TABLE guests ADD COLUMN IF NOT EXISTS `c_form_filed_at` DATETIME DEFAULT NULL");
    } catch (PDOException $e) {}
}

function handleGuestRequests($pdo, $request_method, $action, $propertyId) {
    switch ($action) {
        case 'get_guests':
            try {
                $pdo->exec("INSERT IGNORE INTO nav_menu_items (id, property_id, title, tab_key, unique_key, category, icon_name, display_order) VALUES ('nav-history', 1, 'Guest History', 'guests', 'guest_history', 'Residents & Billing', 'History', 5)");
            } catch (Exception $e) {}
            try {
                $stmt = $pdo->prepare("
                    SELECT g.*, COALESCE(r.name, 'Unassigned') as roomNumber
                    FROM guests g
                    LEFT JOIN properties r ON g.room_id = r.id AND r.property_type = 'MULTI_KEY_ROOM'
                    WHERE g.property_id = ? AND (g.room_id IS NULL OR r.id IS NULL OR r.is_deleted = 0)
                    ORDER BY g.checkin_date DESC
                ");
                $stmt->execute([$propertyId]);
                $guests = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $guests = array_map(function($guest) {
                    unset($guest['room_number']);
                    return convertSnakeToCamel($guest);
                }, $guests);
                echo json_encode(['status' => 'success', 'data' => $guests]);
            } catch (PDOException $e) {
                try {
                    $stmt = $pdo->prepare("SELECT * FROM guests WHERE property_id = ? ORDER BY checkin_date DESC");
                    $stmt->execute([$propertyId]);
                    $guests = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    $guests = array_map(function($guest) {
                        unset($guest['room_number']);
                        return convertSnakeToCamel($guest);
                    }, $guests);
                    echo json_encode(['status' => 'success', 'data' => $guests]);
                } catch (PDOException $e2) {
                    echo json_encode(['status' => 'success', 'data' => []]);
                }
            }
            break;

        case 'add_guest':
            if ($request_method === 'POST') {
                ensureComplianceSchema($pdo);
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("INSERT INTO guests (guest_name, phone_number, checkin_date, expected_checkout, status, advance_paid, total_charge, pending_amount, base_room_rent, notes, booking_source, no_of_guests, property_id, is_foreign_guest) VALUES (?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $input['guest_name'] ?? $input['name'] ?? 'Resident Guest',
                        $input['phone_number'] ?? $input['contact'] ?? '0000000000',
                        $input['checkin_date'] ?? date('Y-m-d'),
                        $input['expected_checkout'] ?? date('Y-m-d H:i:s', strtotime('+1 day')),
                        floatval($input['advance_paid'] ?? 0),
                        floatval($input['total_charge'] ?? 0),
                        floatval($input['pending_amount'] ?? 0),
                        floatval($input['base_room_rent'] ?? 0),
                        $input['notes'] ?? '',
                        $input['booking_source'] ?? '',
                        intval($input['no_of_guests'] ?? 1),
                        $propertyId,
                        !empty($input['is_foreign_guest']) ? 1 : 0,
                    ]);
                    $newId = $pdo->lastInsertId();
                    $advance = floatval($input['advance_paid'] ?? 0);
                    if ($advance > 0) {
                        postFinancialLedger($pdo, [
                            'entry_key' => 'guest_advance:' . $newId,
                            'direction' => 'credit',
                            'amount' => $advance,
                            'category' => 'Guest Registration Advance',
                            'payment_method' => $input['payment_method'] ?? 'Cash',
                            'party_type' => 'guest',
                            'party_id' => $newId,
                            'party_name' => $input['guest_name'] ?? $input['name'] ?? 'Resident Guest',
                            'source_type' => 'guest_registration',
                            'source_id' => $newId,
                            'description' => 'Advance collected at guest registration',
                        ]);
                    }

                    // Send Telegram notification for new guest booking
                    require_once __DIR__ . '/../telegram/sender.php';
                    $guestName = $input['guest_name'] ?? $input['name'] ?? 'Resident Guest';
                    $checkinDate = $input['checkin_date'] ?? date('Y-m-d');
                    $checkoutDate = $input['expected_checkout'] ?? date('Y-m-d', strtotime('+1 day'));
                    $totalCharge = floatval($input['total_charge'] ?? 0);
                    $advancePaid = floatval($input['advance_paid'] ?? 0);
                    $pendingAmount = floatval($input['pending_amount'] ?? 0);
                    $noOfGuests = intval($input['no_of_guests'] ?? 1);
                    $phone = $input['phone_number'] ?? $input['contact'] ?? 'N/A';

                    $telegramMessage = "🏨 <b>NEW GUEST BOOKING</b>\n\n";
                    $telegramMessage .= "👤 <b>Guest Name:</b> {$guestName}\n";
                    $telegramMessage .= "📱 <b>Phone:</b> {$phone}\n";
                    $telegramMessage .= "👥 <b>No. of Guests:</b> {$noOfGuests}\n\n";
                    $telegramMessage .= "📅 <b>Check-in:</b> {$checkinDate}\n";
                    $telegramMessage .= "📅 <b>Check-out:</b> {$checkoutDate}\n\n";
                    $telegramMessage .= "💰 <b>Total Charge:</b> ₹{$totalCharge}\n";
                    $telegramMessage .= "✅ <b>Advance Paid:</b> ₹{$advancePaid}\n";
                    $telegramMessage .= "⏳ <b>Pending:</b> ₹{$pendingAmount}\n\n";
                    $telegramMessage .= "🆔 <b>Booking ID:</b> {$newId}";

                    sendPropertyTelegramMessage($pdo, $propertyId, 'admin', $telegramMessage);

                    // WhatsApp booking confirmation direct to the guest (staff-facing
                    // Telegram notification above is separate from this). Phased
                    // rollout - only fires for the tenant currently enabled, see
                    // isWhatsAppEnabledForProperty()'s docblock in sender.php.
                    require_once __DIR__ . '/../whatsapp/sender.php';
                    if (isWhatsAppEnabledForProperty($pdo, $propertyId)) {
                        $checkinDateFormatted = date('d M Y', strtotime($checkinDate));
                        $roomLabel = $input['room_number'] ?? $input['roomNumber'] ?? 'your assigned room';
                        sendWhatsAppTemplateMessage($phone, 'new_booking_cofirmation', [$guestName, $checkinDateFormatted, $roomLabel]);
                    }

                    echo json_encode(['status' => 'success', 'id' => $newId, 'message' => 'Resident registered successfully']);
                } catch (PDOException $e) {
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to register guest: ' . $e->getMessage()]);
                }
            }
            break;

        case 'update_guest':
            if ($request_method === 'POST') {
                ensureComplianceSchema($pdo);
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $guestId = $input['id'];
                    $roomId = isset($input['room_id']) && $input['room_id'] !== '' ? intval($input['room_id']) : null;
                    $newCheckin = $input['checkin_date'] ?? date('Y-m-d');
                    $newCheckout = $input['expected_checkout'] ?? date('Y-m-d H:i:s', strtotime('+1 day'));

                    $prevStmt = $pdo->prepare("SELECT no_of_guests FROM guests WHERE id = ? AND property_id = ?");
                    $prevStmt->execute([$guestId, $propertyId]);
                    $previousNoOfGuests = intval($prevStmt->fetchColumn() ?: 0);

                    if ($roomId !== null) {
                        $conflictStmt = $pdo->prepare("SELECT id FROM guests WHERE room_id = ? AND status = 'Active' AND id != ? AND property_id = ? AND checkin_date < ? AND expected_checkout > ? LIMIT 1");
                        $conflictStmt->execute([$roomId, $guestId, $propertyId, $newCheckout, $newCheckin]);
                        if ($conflictStmt->fetch()) {
                            http_response_code(409);
                            echo json_encode(['status' => 'error', 'message' => 'Selected room already has an active booking for these dates']);
                            break;
                        }
                    }

                    $totalCharge = floatval($input['total_charge'] ?? 0);
                    $advancePaid = floatval($input['advance_paid'] ?? 0);
                    $pendingAmount = max(0, $totalCharge - $advancePaid);

                    if ($roomId !== null) {
                        $stmt = $pdo->prepare("UPDATE guests SET guest_name = ?, phone_number = ?, checkin_date = ?, expected_checkout = ?, room_id = ?, no_of_guests = ?, base_room_rent = ?, total_charge = ?, advance_paid = ?, pending_amount = ?, is_foreign_guest = ? WHERE id = ? AND property_id = ?");
                        $stmt->execute([
                            $input['guest_name'] ?? $input['name'] ?? '',
                            $input['phone_number'] ?? $input['contact'] ?? '',
                            $input['checkin_date'] ?? date('Y-m-d'),
                            $input['expected_checkout'] ?? date('Y-m-d H:i:s', strtotime('+1 day')),
                            $roomId,
                            intval($input['no_of_guests'] ?? 1),
                            floatval($input['base_room_rent'] ?? 0),
                            $totalCharge,
                            $advancePaid,
                            $pendingAmount,
                            !empty($input['is_foreign_guest']) ? 1 : 0,
                            $guestId,
                            $propertyId,
                        ]);
                    } else {
                        $stmt = $pdo->prepare("UPDATE guests SET guest_name = ?, phone_number = ?, checkin_date = ?, expected_checkout = ?, no_of_guests = ?, base_room_rent = ?, total_charge = ?, advance_paid = ?, pending_amount = ?, is_foreign_guest = ? WHERE id = ? AND property_id = ?");
                        $stmt->execute([
                            $input['guest_name'] ?? $input['name'] ?? '',
                            $input['phone_number'] ?? $input['contact'] ?? '',
                            $input['checkin_date'] ?? date('Y-m-d'),
                            $input['expected_checkout'] ?? date('Y-m-d H:i:s', strtotime('+1 day')),
                            intval($input['no_of_guests'] ?? 1),
                            floatval($input['base_room_rent'] ?? 0),
                            $totalCharge,
                            $advancePaid,
                            $pendingAmount,
                            !empty($input['is_foreign_guest']) ? 1 : 0,
                            $guestId,
                            $propertyId,
                        ]);
                    }
                    echo json_encode(['status' => 'success', 'message' => 'Booking updated successfully']);

                    $newNoOfGuests = intval($input['no_of_guests'] ?? 1);
                    if ($newNoOfGuests > $previousNoOfGuests) {
                        try {
                            $roomStmt = $pdo->prepare("
                                SELECT g.guest_name, COALESCE(r.name, 'Unassigned') as room_name
                                FROM guests g
                                LEFT JOIN properties r ON g.room_id = r.id
                                WHERE g.id = ? AND g.property_id = ?
                            ");
                            $roomStmt->execute([$guestId, $propertyId]);
                            $guestInfo = $roomStmt->fetch(PDO::FETCH_ASSOC);
                            if ($guestInfo) {
                                $countStmt = $pdo->prepare("SELECT COUNT(*) FROM guest_id_documents WHERE guest_id = ? AND property_id = ?");
                                $countStmt->execute([$guestId, $propertyId]);
                                $uploadedCount = intval($countStmt->fetchColumn());
                                require_once __DIR__ . '/../telegram/sender.php';
                                $msg = "👥 <b>Guest Count Updated</b>\n\n";
                                $msg .= "👤 <b>Booking:</b> {$guestInfo['guest_name']}\n";
                                $msg .= "🚪 <b>Room:</b> {$guestInfo['room_name']}\n";
                                $msg .= "🔢 <b>Guests:</b> {$previousNoOfGuests} → {$newNoOfGuests}\n";
                                $msg .= "📋 <b>ID Documents:</b> {$uploadedCount}/{$newNoOfGuests} uploaded";
                                sendPropertyTelegramMessage($pdo, $propertyId, 'admin', $msg);
                            }
                        } catch (Exception $e) {
                            error_log("Failed to send guest-count-updated Telegram notification: " . $e->getMessage());
                        }
                    }
                } catch (PDOException $e) {
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to update guest: ' . $e->getMessage()]);
                }
            }
            break;

        case 'delete_guest':
            if ($request_method === 'POST' || $request_method === 'DELETE') {
                $input = json_decode(file_get_contents('php://input'), true);
                $guestId = $input['id'] ?? null;
                if (!$guestId) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'id is required']);
                    break;
                }
                try {
                    $stmt = $pdo->prepare("DELETE FROM guests WHERE id = ? AND property_id = ?");
                    $stmt->execute([$guestId, $propertyId]);
                    if ($stmt->rowCount() > 0) {
                        echo json_encode(['status' => 'success', 'message' => 'Booking deleted successfully']);
                    } else {
                        http_response_code(404);
                        echo json_encode(['status' => 'error', 'message' => 'Booking not found']);
                    }
                } catch (PDOException $e) {
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to delete booking: ' . $e->getMessage()]);
                }
            }
            break;

        case 'checkout_guest':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("UPDATE guests SET status = 'CheckedOut', checkout_date = ? WHERE id = ? AND property_id = ?");
                    $stmt->execute([date('Y-m-d'), $input['id'], $propertyId]);
                } catch (PDOException $e) {
                    $stmt = $pdo->prepare("UPDATE guests SET status = 'CheckedOut', check_out = ? WHERE id = ? AND property_id = ?");
                    $stmt->execute([date('Y-m-d H:i:s'), $input['id'], $propertyId]);
                }
                echo json_encode(['status' => 'success', 'message' => 'Guest checked out successfully']);
            }
            break;

        case 'mark_c_form_filed':
            if ($request_method === 'POST') {
                ensureComplianceSchema($pdo);
                $input = json_decode(file_get_contents('php://input'), true);
                $guestId = $input['id'] ?? null;
                if (!$guestId) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'id is required']);
                    break;
                }
                try {
                    // Un-filing (staff caught a mistake) just clears the timestamp again.
                    $filed = !array_key_exists('filed', $input) || !empty($input['filed']);
                    $stmt = $pdo->prepare("UPDATE guests SET c_form_filed_at = ? WHERE id = ? AND property_id = ?");
                    $stmt->execute([$filed ? date('Y-m-d H:i:s') : null, $guestId, $propertyId]);
                    echo json_encode(['status' => 'success', 'message' => $filed ? 'Marked as filed' : 'Marked as not filed']);
                } catch (PDOException $e) {
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to update C-Form status: ' . $e->getMessage()]);
                }
            }
            break;

        case 'get_id_documents':
            ensureIdVerificationSchema($pdo);
            $guestId = $_GET['guest_id'] ?? '';
            if (!$guestId) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'guest_id is required']);
                break;
            }
            $stmt = $pdo->prepare("SELECT id, guest_index, file_path, uploaded_at FROM guest_id_documents WHERE guest_id = ? AND property_id = ? ORDER BY guest_index ASC");
            $stmt->execute([$guestId, $propertyId]);
            $docs = array_map('convertSnakeToCamel', $stmt->fetchAll(PDO::FETCH_ASSOC));
            echo json_encode(['status' => 'success', 'data' => $docs]);
            break;

        case 'upload_id_document':
            ensureIdVerificationSchema($pdo);
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $guestId = $input['guest_id'] ?? null;
                $guestIndex = isset($input['guest_index']) ? intval($input['guest_index']) : null;
                $filePath = $input['file_path'] ?? null;
                if (!$guestId || $guestIndex === null || !$filePath) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'guest_id, guest_index, and file_path are required']);
                    break;
                }
                try {
                    $stmt = $pdo->prepare("
                        INSERT INTO guest_id_documents (guest_id, property_id, guest_index, file_path, uploaded_by)
                        VALUES (?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE file_path = VALUES(file_path), uploaded_at = CURRENT_TIMESTAMP, uploaded_by = VALUES(uploaded_by)
                    ");
                    $stmt->execute([$guestId, $propertyId, $guestIndex, $filePath, $_SESSION['username'] ?? '']);
                    echo json_encode(['status' => 'success', 'message' => 'ID document saved']);

                    // Live progress ping - lets the tenant follow along in Telegram as
                    // photos come in, rather than only hearing about it at completion.
                    try {
                        $guestStmt = $pdo->prepare("
                            SELECT g.guest_name, g.no_of_guests, COALESCE(r.name, 'Unassigned') as room_name
                            FROM guests g
                            LEFT JOIN properties r ON g.room_id = r.id
                            WHERE g.id = ? AND g.property_id = ?
                        ");
                        $guestStmt->execute([$guestId, $propertyId]);
                        $guestInfo = $guestStmt->fetch(PDO::FETCH_ASSOC);
                        if ($guestInfo) {
                            $required = max(1, intval($guestInfo['no_of_guests'] ?? 1));
                            $countStmt = $pdo->prepare("SELECT COUNT(*) FROM guest_id_documents WHERE guest_id = ? AND property_id = ?");
                            $countStmt->execute([$guestId, $propertyId]);
                            $uploadedCount = intval($countStmt->fetchColumn());
                            require_once __DIR__ . '/../telegram/sender.php';
                            $msg = "📸 <b>ID Document Uploaded</b>\n\n";
                            $msg .= "👤 <b>Guest:</b> {$guestInfo['guest_name']}\n";
                            $msg .= "🚪 <b>Room:</b> {$guestInfo['room_name']}\n";
                            $msg .= "✅ <b>Progress:</b> {$uploadedCount}/{$required} required ID(s) uploaded";
                            sendPropertyTelegramMessage($pdo, $propertyId, 'admin', $msg);
                        }
                    } catch (Exception $e) {
                        error_log("Failed to send ID upload Telegram notification: " . $e->getMessage());
                    }
                } catch (PDOException $e) {
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => 'Failed to save ID document: ' . $e->getMessage()]);
                }
            }
            break;

        case 'delete_id_document':
            ensureIdVerificationSchema($pdo);
            if ($request_method === 'POST' || $request_method === 'DELETE') {
                $input = json_decode(file_get_contents('php://input'), true);
                $docId = $input['id'] ?? null;
                if (!$docId) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'id is required']);
                    break;
                }
                $stmt = $pdo->prepare("DELETE FROM guest_id_documents WHERE id = ? AND property_id = ?");
                $stmt->execute([$docId, $propertyId]);
                echo json_encode(['status' => 'success', 'message' => 'ID document removed']);
            }
            break;

        case 'complete_checkin_verification':
            ensureIdVerificationSchema($pdo);
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $guestId = $input['guest_id'] ?? null;
                if (!$guestId) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'guest_id is required']);
                    break;
                }
                $stmt = $pdo->prepare("
                    SELECT g.guest_name, g.no_of_guests, COALESCE(r.name, 'Unassigned') as room_name
                    FROM guests g
                    LEFT JOIN properties r ON g.room_id = r.id
                    WHERE g.id = ? AND g.property_id = ?
                ");
                $stmt->execute([$guestId, $propertyId]);
                $guest = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$guest) {
                    http_response_code(404);
                    echo json_encode(['status' => 'error', 'message' => 'Guest not found']);
                    break;
                }
                $required = max(1, intval($guest['no_of_guests'] ?? 1));
                $docsStmt = $pdo->prepare("SELECT file_path FROM guest_id_documents WHERE guest_id = ? AND property_id = ?");
                $docsStmt->execute([$guestId, $propertyId]);
                $docPaths = $docsStmt->fetchAll(PDO::FETCH_COLUMN);
                $uploadedCount = count($docPaths);
                if ($uploadedCount < $required) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => "Only {$uploadedCount} of {$required} required ID document(s) uploaded"]);
                    break;
                }
                $pdo->prepare("UPDATE guests SET id_verification_status = 'Complete' WHERE id = ? AND property_id = ?")->execute([$guestId, $propertyId]);
                echo json_encode(['status' => 'success', 'message' => 'Check-in verification complete']);

                // Final compliance record - attaches the actual ID photos, distinct
                // from the text-only progress pings sent during upload.
                try {
                    require_once __DIR__ . '/../telegram/sender.php';
                    require_once __DIR__ . '/../telegram/templates.php';
                    $fsPaths = array_filter(array_map(function ($url) {
                        $pos = strpos($url, '/uploads/');
                        return $pos === false ? null : (__DIR__ . '/../' . substr($url, $pos + 1));
                    }, $docPaths));
                    $caption = TelegramTemplates::render($pdo, 'checkin_verification_complete', [
                        'guest_name' => $guest['guest_name'],
                        'room_name' => $guest['room_name'],
                        'doc_count' => $uploadedCount,
                    ]);
                    sendPropertyTelegramPhoto($pdo, $propertyId, 'admin', $fsPaths, $caption, 'checkin_verification_complete');
                } catch (Exception $e) {
                    error_log("Failed to send check-in completion Telegram photo notification: " . $e->getMessage());
                }
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid guest action']);
            break;
    }
}
