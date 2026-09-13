<?php
/**
 * Receipts & Past Billing Archive Module
 * Function: Persistent checkout receipt storage and retrieval from billing_receipts table.
 */

require_once __DIR__ . '/../security/input_validator.php';

function validateReceiptInput(array $input): array {
    $validated = [];
    if (isset($input['guestName']) && trim((string)$input['guestName']) !== '') {
        $validated['guestName'] = InputValidator::validateString($input['guestName'], 1, 255);
    }
    if (isset($input['roomNumber']) && trim((string)$input['roomNumber']) !== '') {
        $validated['roomNumber'] = InputValidator::validateString($input['roomNumber'], 1, 50);
    }
    if (isset($input['payment_method']) && trim((string)$input['payment_method']) !== '') {
        $validated['payment_method'] = InputValidator::validateString($input['payment_method'], 1, 50);
    }
    if (isset($input['grandTotal']) && $input['grandTotal'] !== null && $input['grandTotal'] !== '') {
        $validated['grandTotal'] = InputValidator::validateFloat($input['grandTotal'], 0);
    }
    if (isset($input['roomTotal']) && $input['roomTotal'] !== null && $input['roomTotal'] !== '') {
        $validated['roomTotal'] = InputValidator::validateFloat($input['roomTotal'], 0);
    }
    if (isset($input['foodTotal']) && $input['foodTotal'] !== null && $input['foodTotal'] !== '') {
        $validated['foodTotal'] = InputValidator::validateFloat($input['foodTotal'], 0);
    }
    return $validated;
}

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
            try { $pdo->exec("ALTER TABLE billing_receipts ADD COLUMN `cash_amount` DECIMAL(10,2) DEFAULT 0 AFTER `payment_method`"); } catch (PDOException $e) {}
            try { $pdo->exec("ALTER TABLE billing_receipts ADD COLUMN `upi_amount` DECIMAL(10,2) DEFAULT 0 AFTER `cash_amount`"); } catch (PDOException $e) {}
            try { $pdo->exec("ALTER TABLE billing_receipts ADD COLUMN `card_amount` DECIMAL(10,2) DEFAULT 0 AFTER `upi_amount`"); } catch (PDOException $e) {}
            try { $pdo->exec("ALTER TABLE billing_receipts ADD COLUMN `bank_transfer_amount` DECIMAL(10,2) DEFAULT 0 AFTER `card_amount`"); } catch (PDOException $e) {}
            try { $pdo->exec("ALTER TABLE billing_receipts ADD COLUMN `split_details` TEXT DEFAULT NULL AFTER `bank_transfer_amount`"); } catch (PDOException $e) {}
            // payment_method started as a single word ("Cash"/"UPI"/...) but a
            // split-tender receipt now stores a summary like "Cash (₹3000) +
            // UPI (₹2000) + Card (₹1000) + Bank Transfer (₹500)" (64+ chars) -
            // the original VARCHAR(50) silently truncated it (or hard-failed
            // the whole checkout under STRICT_TRANS_TABLES). Found 8 Sep 2026.
            try { $pdo->exec("ALTER TABLE billing_receipts MODIFY COLUMN `payment_method` VARCHAR(191)"); } catch (PDOException $e) {}

            markSchemaVerified('schema_billing_receipts');
        }
    } catch (PDOException $e) {}

    switch ($action) {
        case 'get_receipts':
            try {
                $stmt = $pdo->prepare("SELECT * FROM billing_receipts WHERE property_id = ? ORDER BY created_at DESC");
                $stmt->execute([$propertyId]);
                $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
                if (!is_array($data)) $data = [];

                // Also include billed walk-in guest tabs so all bills generated at the property appear here
                try {
                    require_once __DIR__ . '/../kitchen/walk_in_tabs.php';
                    ensureWalkInTabSchema($pdo);
                    $tabStmt = $pdo->prepare("SELECT * FROM walk_in_tabs WHERE property_id = ? AND status = 'billed' ORDER BY billed_at DESC");
                    $tabStmt->execute([$propertyId]);
                    $walkInTabs = $tabStmt->fetchAll(PDO::FETCH_ASSOC);

                    if (!empty($walkInTabs)) {
                        $tabIds = array_column($walkInTabs, 'id');
                        $inPlaceholders = implode(',', array_fill(0, count($tabIds), '?'));

                        $itemsStmt = $pdo->prepare("
                            SELECT o.walk_in_tab_id, oi.menu_item_id, m.name,
                                   COALESCE(oi.unit_price, m.price, 0) as price,
                                   SUM(oi.quantity) as quantity
                            FROM orders o
                            JOIN order_items oi ON oi.order_id = o.id
                            LEFT JOIN menu_items m ON m.id = oi.menu_item_id
                            WHERE o.walk_in_tab_id IN ($inPlaceholders)
                            GROUP BY o.walk_in_tab_id, oi.menu_item_id, m.name, COALESCE(oi.unit_price, m.price, 0)
                        ");
                        $itemsStmt->execute($tabIds);
                        $allItems = $itemsStmt->fetchAll(PDO::FETCH_ASSOC);

                        $groupedItems = [];
                        foreach ($allItems as $it) {
                            $tId = (int)$it['walk_in_tab_id'];
                            if (!isset($groupedItems[$tId])) $groupedItems[$tId] = [];
                            $groupedItems[$tId][] = $it;
                        }

                        foreach ($walkInTabs as $tab) {
                            $tId = (int)$tab['id'];
                            $items = [];
                            $subtotal = 0;
                            if (isset($groupedItems[$tId])) {
                                foreach ($groupedItems[$tId] as $it) {
                                    $qty = (int)$it['quantity'];
                                    $price = (float)$it['price'];
                                    $lineTotal = round($qty * $price, 2);
                                    $subtotal += $lineTotal;
                                    $items[] = [
                                        'name' => $it['name'] ?: 'Dish',
                                        'quantity' => $qty,
                                        'unitPrice' => $price,
                                        'total' => $lineTotal,
                                    ];
                                }
                            }
                            $grandTotal = floatval($tab['grand_total'] ?? 0);
                            $foodTotal = $subtotal > 0 ? $subtotal : $grandTotal;
                            $paymentMethod = $tab['payment_method'] ?: 'Cash';
                            $isUpiPayment = (stripos($paymentMethod, 'upi') !== false || stripos($paymentMethod, 'online') !== false);
                            $isCardPayment = (stripos($paymentMethod, 'card') !== false);
                            $billedAt = $tab['billed_at'] ?: $tab['opened_at'];

                            $data[] = [
                                'id' => 'W-' . $tId,
                                'property_id' => $propertyId,
                                'guest_id' => '',
                                'guest_name' => $tab['label'] ?: 'Walk-in Guest',
                                'room_number' => 'Walk-in',
                                'checkin_date' => $tab['opened_at'],
                                'checkout_date' => $billedAt,
                                'room_rate_per_night' => 0,
                                'nights_count' => 0,
                                'room_rent' => 0,
                                'room_total' => 0,
                                'food_total' => $foodTotal,
                                'kitchen_total' => $foodTotal,
                                'misc_total' => 0,
                                'discount' => floatval($tab['discount'] ?? 0),
                                'grand_total' => $grandTotal,
                                'advance_paid' => 0,
                                'payment_method' => $paymentMethod,
                                // Cash is the fallback bucket, not a fourth empty one:
                                // an unrecognised payment_method used to leave cash,
                                // upi AND card all at 0 while grand_total was positive,
                                // so any report summing the three under-counted real
                                // takings with nothing to show it had (13 Sep 2026).
                                'cash_amount' => ($isUpiPayment || $isCardPayment) ? 0 : $grandTotal,
                                'upi_amount' => $isUpiPayment ? $grandTotal : 0,
                                'card_amount' => $isCardPayment ? $grandTotal : 0,
                                'bank_transfer_amount' => 0,
                                'split_details' => '',
                                'status' => 'Paid',
                                'paid_at' => $billedAt,
                                'created_at' => $billedAt,
                                'gst_enabled' => intval($tab['gst_enabled'] ?? 0),
                                'gst_rate' => floatval($tab['gst_rate'] ?? 0),
                                'gst_amount' => floatval($tab['gst_amount'] ?? 0),
                                'food_items' => json_encode($items),
                                'source_type' => 'walk_in_tab',
                                'walk_in_tab_id' => $tId,
                            ];
                        }
                    }
                } catch (Exception $eTab) {
                    error_log("Failed to include walk_in_tabs in get_receipts: " . $eTab->getMessage());
                }

                usort($data, function($a, $b) {
                    $dateA = $a['paid_at'] ?? $a['created_at'] ?? $a['checkout_date'] ?? '';
                    $dateB = $b['paid_at'] ?? $b['created_at'] ?? $b['checkout_date'] ?? '';
                    return strcmp((string)$dateB, (string)$dateA);
                });
                echo json_encode(['status' => 'success', 'data' => $data]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'success', 'data' => []]);
            }
            break;

        case 'save_receipt':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true) ?? [];
                try {
                    $input = array_merge($input, validateReceiptInput($input));
                } catch (Exception $eVal) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => $eVal->getMessage()]);
                    break;
                }
                try {
                    // Same reasoning as add_guest in guests.php: the receipt row and its
                    // settlement ledger entry must land together or not at all, or a
                    // checkout can end up "paid" on the bill but missing from the books.
                    $pdo->beginTransaction();

                    // ONE reference for this checkout - the receipt's primary key AND
                    // every ledger entry_key below (13 Sep 2026). Two problems were
                    // fixed by hoisting it here:
                    //
                    //  1. It was 'REC-' . time(), computed separately in three places.
                    //     billing_receipts.id is the PRIMARY KEY and this INSERT ends
                    //     in ON DUPLICATE KEY UPDATE, so two id-less checkouts in the
                    //     same second would collide and the second would OVERWRITE the
                    //     first guest's receipt. financial_ledger.entry_key is likewise
                    //     globally unique, where the collision instead made INSERT
                    //     IGNORE silently drop a real collected payment.
                    //  2. Computed separately, the receipt row and the ledger entry
                    //     could disagree about which id this checkout even had.
                    //
                    // A real receipt id from the client is still used verbatim, so the
                    // idempotent-retry behaviour of both writes is unchanged.
                    $settlementRef = $input['id'] ?? ('REC-' . $propertyId . '-' . uniqid('', true));

                    $stmt = $pdo->prepare("INSERT INTO billing_receipts (id, property_id, guest_id, guest_name, room_number, checkin_date, checkout_date, room_rate_per_night, nights_count, room_rent, room_total, food_total, kitchen_total, misc_total, discount, grand_total, advance_paid, payment_method, cash_amount, upi_amount, card_amount, bank_transfer_amount, split_details, status, paid_at, gst_enabled, gst_rate, gst_amount, gst_cgst, gst_sgst, gst_accommodation_rate, gst_food_rate, gst_accommodation_amount, gst_food_amount, gst_tax_type, gst_igst, guest_gstin, guest_billing_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE guest_name=VALUES(guest_name), grand_total=VALUES(grand_total), payment_method=VALUES(payment_method), cash_amount=VALUES(cash_amount), upi_amount=VALUES(upi_amount), card_amount=VALUES(card_amount), bank_transfer_amount=VALUES(bank_transfer_amount), split_details=VALUES(split_details), status=VALUES(status), gst_enabled=VALUES(gst_enabled), gst_rate=VALUES(gst_rate), gst_amount=VALUES(gst_amount), gst_cgst=VALUES(gst_cgst), gst_sgst=VALUES(gst_sgst), gst_accommodation_rate=VALUES(gst_accommodation_rate), gst_food_rate=VALUES(gst_food_rate), gst_accommodation_amount=VALUES(gst_accommodation_amount), gst_food_amount=VALUES(gst_food_amount), gst_tax_type=VALUES(gst_tax_type), gst_igst=VALUES(gst_igst), guest_gstin=VALUES(guest_gstin), guest_billing_name=VALUES(guest_billing_name)");
                    $stmt->execute([
                        $settlementRef,
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
                        floatval($input['cashAmount'] ?? 0),
                        floatval($input['upiAmount'] ?? 0),
                        floatval($input['cardAmount'] ?? 0),
                        floatval($input['bankTransferAmount'] ?? 0),
                        isset($input['splitDetails']) ? (is_string($input['splitDetails']) ? $input['splitDetails'] : json_encode($input['splitDetails'])) : null,
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
                    //
                    // grandTotal is ALREADY net of advance - ReceiptEditModal.tsx's
                    // only real sender computes it as grandTargetDue = subtotal
                    // (itself built from lodgingPendingDue = roomCharges - advancePaid)
                    // + GST, then sends BOTH that and advancePaid separately. Subtracting
                    // advancePaid again here double-counted it - found 8 Sep 2026 (a
                    // ₹4,000 swing on a real worked example, and in one edge case a real
                    // ₹0 settlement that silently skipped the whole block below even
                    // though real cash/UPI had been collected and was still recorded on
                    // the receipt itself). This has been wrong since before split-tender
                    // existed; split-tender just made the inconsistency visible by
                    // computing the true figure a different way (summing the splits).
                    $settlement = round(max(0, floatval($input['grandTotal'] ?? 0)), 2);
                    if ($settlement > 0) {
                        $cashAmt = floatval($input['cashAmount'] ?? 0);
                        $upiAmt = floatval($input['upiAmount'] ?? 0);
                        $cardAmt = floatval($input['cardAmount'] ?? 0);
                        $btAmt = floatval($input['bankTransferAmount'] ?? 0);
                        $providedSum = round($cashAmt + $upiAmt + $cardAmt + $btAmt, 2);

                        // The frontend's isSplitMatching gate is UI-only - re-verified
                        // here since a stale client, a replayed request, or a hand-
                        // crafted call could post whatever amount it likes against a
                        // real bill (found 8 Sep 2026 - nothing server-side checked
                        // this before). Skipped only when no per-method breakdown was
                        // sent at all (0 across all four), so an older/hypothetical
                        // caller with no breakdown still falls through to the
                        // single-method branch below unaffected.
                        if ($providedSum > 0 && abs($providedSum - $settlement) > 0.01) {
                            if ($pdo->inTransaction()) {
                                $pdo->rollBack();
                            }
                            http_response_code(422);
                            echo json_encode(['status' => 'error', 'message' => "Payment amounts (₹{$providedSum}) do not match the amount due (₹{$settlement})"]);
                            break;
                        }

                        $splitCount = ($cashAmt > 0 ? 1 : 0) + ($upiAmt > 0 ? 1 : 0) + ($cardAmt > 0 ? 1 : 0) + ($btAmt > 0 ? 1 : 0);

                        // $settlementRef is built once near the INSERT above - see its
                        // note there for why it must not be time-based.
                        if ($splitCount > 1) {
                            $receiptId = $settlementRef;
                            $splits = [
                                'Cash' => $cashAmt,
                                'UPI' => $upiAmt,
                                'Card' => $cardAmt,
                                'Bank Transfer' => $btAmt
                            ];
                            foreach ($splits as $mode => $amt) {
                                if ($amt > 0) {
                                    postFinancialLedger($pdo, [
                                        'entry_key' => 'checkout_settlement:' . $receiptId . ':' . strtolower(str_replace(' ', '_', $mode)),
                                        'direction' => 'credit',
                                        'amount' => $amt,
                                        'category' => 'Guest Checkout Settlement',
                                        'payment_method' => $mode,
                                        'party_type' => 'guest',
                                        'party_id' => $input['guestId'] ?? '',
                                        'party_name' => $input['guestName'] ?? '',
                                        'source_type' => 'billing_receipt',
                                        // $settlementRef, not `?? ''` - this is the id
                                        // actually stored as billing_receipts.id, so an
                                        // id-less checkout no longer writes a ledger row
                                        // whose source_id is EMPTY and can never be tied
                                        // back to its receipt (or reversed by
                                        // reverseFinancialSource). Identical to the old
                                        // value whenever the client sent a receipt id.
                                        'source_id' => $settlementRef,
                                        'description' => 'Split checkout collected (' . $mode . ')',
                                    ], $propertyId);
                                }
                            }
                        } else {
                            postFinancialLedger($pdo, [
                                // $settlementRef - see the note where it is built above.
                                'entry_key' => 'checkout_settlement:' . $settlementRef,
                                'direction' => 'credit',
                                'amount' => $settlement,
                                'category' => 'Guest Checkout Settlement',
                                'payment_method' => $input['paymentMethod'] ?? 'Cash',
                                'party_type' => 'guest',
                                'party_id' => $input['guestId'] ?? '',
                                'party_name' => $input['guestName'] ?? '',
                                'source_type' => 'billing_receipt',
                                // $settlementRef - see the note in the split branch above.
                                'source_id' => $settlementRef,
                                'description' => 'Balance collected on checkout',
                            ], $propertyId);
                        }
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
