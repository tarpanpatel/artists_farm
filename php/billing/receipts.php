<?php
/**
 * Receipts & Past Billing Archive Module
 * Function: Persistent checkout receipt storage and retrieval from billing_receipts table.
 */

function handleReceiptRequests($pdo, $request_method, $action, $propertyId) {
    require_once __DIR__ . '/../config/schema_cache.php';
    
    // Auto-create billing_receipts table
    try {
        if (!isSchemaVerified('schema_billing_receipts')) {
            // Auto-add GST columns on older schemas
            try { $pdo->exec("ALTER TABLE billing_receipts ADD COLUMN `gst_enabled` TINYINT(1) DEFAULT 0 AFTER `paid_at`"); } catch (PDOException $e) {}
            try { $pdo->exec("ALTER TABLE billing_receipts ADD COLUMN `gst_rate` DECIMAL(5,2) DEFAULT 0 AFTER `gst_enabled`"); } catch (PDOException $e) {}
            try { $pdo->exec("ALTER TABLE billing_receipts ADD COLUMN `gst_amount` DECIMAL(10,2) DEFAULT 0 AFTER `gst_rate`"); } catch (PDOException $e) {}
            try { $pdo->exec("ALTER TABLE billing_receipts ADD COLUMN `gst_cgst` DECIMAL(10,2) DEFAULT 0 AFTER `gst_amount`"); } catch (PDOException $e) {}
            try { $pdo->exec("ALTER TABLE billing_receipts ADD COLUMN `gst_sgst` DECIMAL(10,2) DEFAULT 0 AFTER `gst_cgst`"); } catch (PDOException $e) {}
            try { $pdo->exec("ALTER TABLE billing_receipts ADD COLUMN `gst_accommodation_rate` DECIMAL(5,2) DEFAULT 0 AFTER `gst_sgst`"); } catch (PDOException $e) {}
            try { $pdo->exec("ALTER TABLE billing_receipts ADD COLUMN `gst_food_rate` DECIMAL(5,2) DEFAULT 0 AFTER `gst_accommodation_rate`"); } catch (PDOException $e) {}
            try { $pdo->exec("ALTER TABLE billing_receipts ADD COLUMN `gst_accommodation_amount` DECIMAL(10,2) DEFAULT 0 AFTER `gst_food_rate`"); } catch (PDOException $e) {}
            try { $pdo->exec("ALTER TABLE billing_receipts ADD COLUMN `gst_food_amount` DECIMAL(10,2) DEFAULT 0 AFTER `gst_accommodation_amount`"); } catch (PDOException $e) {}
            // Inter-state (IGST) vs intra-state (CGST+SGST) support, plus the
            // guest/company's own GSTIN and billing name for tax invoices where the
            // guest wants it addressed to their company rather than themselves.
            try { $pdo->exec("ALTER TABLE billing_receipts ADD COLUMN `gst_tax_type` VARCHAR(15) DEFAULT 'cgst_sgst' AFTER `gst_food_amount`"); } catch (PDOException $e) {}
            try { $pdo->exec("ALTER TABLE billing_receipts ADD COLUMN `gst_igst` DECIMAL(10,2) DEFAULT 0 AFTER `gst_tax_type`"); } catch (PDOException $e) {}
            try { $pdo->exec("ALTER TABLE billing_receipts ADD COLUMN `guest_gstin` VARCHAR(20) DEFAULT NULL AFTER `gst_igst`"); } catch (PDOException $e) {}
            try { $pdo->exec("ALTER TABLE billing_receipts ADD COLUMN `guest_billing_name` VARCHAR(255) DEFAULT NULL AFTER `guest_gstin`"); } catch (PDOException $e) {}
            
            markSchemaVerified('schema_billing_receipts');
        }
    } catch (PDOException $e) {}

    switch ($action) {
        case 'get_receipts':
            try {
                $stmt = $pdo->prepare("SELECT * FROM billing_receipts WHERE property_id = ? ORDER BY created_at DESC");
                $stmt->execute([$propertyId]);
                $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
                if (empty($data)) {
                    // Fallback: try to reconstruct from audit_logs if billing_receipts is empty
                    $stmt = $pdo->prepare("SELECT * FROM audit_logs WHERE property_id = ? AND action LIKE '%Checkout%' ORDER BY timestamp DESC");
                    $stmt->execute([$propertyId]);
                    $auditData = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    echo json_encode(['status' => 'success', 'data' => $auditData]);
                } else {
                    echo json_encode(['status' => 'success', 'data' => $data]);
                }
            } catch (PDOException $e) {
                echo json_encode(['status' => 'success', 'data' => []]);
            }
            break;

        case 'save_receipt':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    // Same reasoning as add_guest in guests.php: the receipt row and its
                    // settlement ledger entry must land together or not at all, or a
                    // checkout can end up "paid" on the bill but missing from the books.
                    $pdo->beginTransaction();
                    $stmt = $pdo->prepare("INSERT INTO billing_receipts (id, property_id, guest_id, guest_name, room_number, checkin_date, checkout_date, room_rate_per_night, nights_count, room_rent, room_total, food_total, kitchen_total, misc_total, discount, grand_total, advance_paid, payment_method, status, paid_at, gst_enabled, gst_rate, gst_amount, gst_cgst, gst_sgst, gst_accommodation_rate, gst_food_rate, gst_accommodation_amount, gst_food_amount, gst_tax_type, gst_igst, guest_gstin, guest_billing_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE guest_name=VALUES(guest_name), grand_total=VALUES(grand_total), status=VALUES(status), gst_enabled=VALUES(gst_enabled), gst_rate=VALUES(gst_rate), gst_amount=VALUES(gst_amount), gst_cgst=VALUES(gst_cgst), gst_sgst=VALUES(gst_sgst), gst_accommodation_rate=VALUES(gst_accommodation_rate), gst_food_rate=VALUES(gst_food_rate), gst_accommodation_amount=VALUES(gst_accommodation_amount), gst_food_amount=VALUES(gst_food_amount), gst_tax_type=VALUES(gst_tax_type), gst_igst=VALUES(gst_igst), guest_gstin=VALUES(guest_gstin), guest_billing_name=VALUES(guest_billing_name)");
                    $stmt->execute([
                        $input['id'] ?? 'REC-' . time(),
                        $propertyId,
                        $input['guestId'] ?? '',
                        $input['guestName'] ?? '',
                        $input['roomNumber'] ?? '',
                        $input['checkinDate'] ?? '',
                        $input['checkoutDate'] ?? '',
                        $input['roomRatePerNight'] ?? 0,
                        $input['nightsCount'] ?? 0,
                        $input['roomRent'] ?? 0,
                        $input['roomTotal'] ?? 0,
                        $input['foodTotal'] ?? 0,
                        $input['kitchenTotal'] ?? 0,
                        $input['miscTotal'] ?? 0,
                        $input['discount'] ?? 0,
                        $input['grandTotal'] ?? 0,
                        $input['advancePaid'] ?? 0,
                        $input['paymentMethod'] ?? 'Cash',
                        $input['status'] ?? 'Paid',
                        $input['paidAt'] ?? date('Y-m-d H:i:s'),
                        $input['gstEnabled'] ? 1 : 0,
                        floatval($input['gstRate'] ?? 0),
                        floatval($input['gstAmount'] ?? 0),
                        floatval($input['gstCgst'] ?? 0),
                        floatval($input['gstSgst'] ?? 0),
                        floatval($input['gstAccommodationRate'] ?? 0),
                        floatval($input['gstFoodRate'] ?? 0),
                        floatval($input['gstAccommodationAmount'] ?? 0),
                        floatval($input['gstFoodAmount'] ?? 0),
                        $input['gstTaxType'] ?? 'cgst_sgst',
                        floatval($input['gstIgst'] ?? 0),
                        $input['guestGstin'] ?? null,
                        $input['guestBillingName'] ?? null
                    ]);

                    // Record only the settlement collected at checkout. Registration
                    // advances are posted by the guest module, avoiding double-counting.
                    $settlement = max(0, floatval($input['grandTotal'] ?? 0) - floatval($input['advancePaid'] ?? 0));
                    if ($settlement > 0) {
                        postFinancialLedger($pdo, [
                            'entry_key' => 'checkout_settlement:' . ($input['id'] ?? 'REC-' . time()),
                            'direction' => 'credit',
                            'amount' => $settlement,
                            'category' => 'Guest Checkout Settlement',
                            'payment_method' => $input['paymentMethod'] ?? 'Cash',
                            'party_type' => 'guest',
                            'party_id' => $input['guestId'] ?? '',
                            'party_name' => $input['guestName'] ?? '',
                            'source_type' => 'billing_receipt',
                            'source_id' => $input['id'] ?? '',
                            'description' => 'Balance collected on checkout',
                        ], $propertyId);
                    }
                    $pdo->commit();

                    // Also log to audit trail
                    try {
                        $logStmt = $pdo->prepare("INSERT INTO audit_logs (timestamp, user, action, property_id) VALUES (?, ?, ?, ?)");
                        $logStmt->execute([
                            date('Y-m-d H:i:s'),
                            $input['guestName'] ?? 'Guest',
                            'Completed Split Checkout for Guest ' . ($input['guestId'] ?? 'Room') . ' Amount: ₹' . ($input['grandTotal'] ?? 0),
                            $propertyId
                        ]);
                    } catch (PDOException $la) {}

                    echo json_encode(['status' => 'success', 'message' => 'Receipt saved successfully']);
                } catch (PDOException $e) {
                    if ($pdo->inTransaction()) {
                        $pdo->rollBack();
                    }
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid receipts action']);
            break;
    }
}
