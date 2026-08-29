<?php
/**
 * Walk-in Tabs - food prepared for someone not staying in a room (a diner at
 * the restaurant, a local walk-in). A tab groups every order placed for the
 * same table/customer while it's open, then bills the whole thing at once -
 * the walk-in equivalent of a guest's stay-then-checkout, minus everything
 * that's actually about a room (no dates, no advance, no ID verification).
 *
 * Deliberately its own table rather than reusing `guests`: `guests` has a
 * cluster of NOT NULL stay fields (checkin_date, expected_checkout,
 * phone_number) and feeds room calendars / occupancy / ADR / guest-count
 * stats throughout the app - a walk-in row there would need to be faked into
 * every one of those, and a single missed filter would quietly corrupt a
 * hospitality metric with phantom "room nights" that were never a room.
 * Billing likewise never touches `billing_receipts` for the same reason
 * (that table backs Past Receipts Log/ADR/ALOS) - the bill snapshot lives on
 * this row instead, and settlement posts to financial_ledger directly under
 * 'Kitchen POS Sales', not the guest-checkout categories.
 */

require_once __DIR__ . '/../config/schema_cache.php';
require_once __DIR__ . '/../security/input_validator.php';

function validateWalkInTabInput(array $input): array {
    $validated = [];
    if (isset($input['label']) && trim((string)$input['label']) !== '') {
        $validated['label'] = InputValidator::validateString($input['label'], 1, 150);
    }
    if (isset($input['payment_method']) && trim((string)$input['payment_method']) !== '') {
        $validated['payment_method'] = InputValidator::validateString($input['payment_method'], 1, 50);
    }
    if (isset($input['discount']) && $input['discount'] !== null && $input['discount'] !== '') {
        $validated['discount'] = InputValidator::validateFloat($input['discount'], 0);
    }
    if (isset($input['gst_rate']) && $input['gst_rate'] !== null && $input['gst_rate'] !== '') {
        $validated['gst_rate'] = InputValidator::validateFloat($input['gst_rate'], 0, 100);
    }
    return $validated;
}

if (!function_exists('ensureWalkInTabSchema')) {
    function ensureWalkInTabSchema($pdo) {
        if (isSchemaVerified('schema_walk_in_tabs')) return;
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS walk_in_tabs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                property_id INT NOT NULL,
                label VARCHAR(150) DEFAULT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'open',
                opened_at DATETIME NOT NULL,
                billed_at DATETIME DEFAULT NULL,
                payment_method VARCHAR(30) DEFAULT NULL,
                discount DECIMAL(10,2) DEFAULT 0,
                gst_enabled TINYINT(1) DEFAULT 0,
                gst_rate DECIMAL(5,2) DEFAULT 0,
                gst_amount DECIMAL(10,2) DEFAULT 0,
                grand_total DECIMAL(10,2) DEFAULT NULL,
                is_demo TINYINT(1) NOT NULL DEFAULT 0,
                INDEX idx_property_status (property_id, status)
            )");

            $cols = $pdo->query("SHOW COLUMNS FROM orders")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('walk_in_tab_id', $cols)) {
                $pdo->exec("ALTER TABLE orders ADD COLUMN walk_in_tab_id INT NULL DEFAULT NULL");
            }
            markSchemaVerified('schema_walk_in_tabs');
        } catch (Exception $e) {
            error_log("walk_in_tabs schema migration error: " . $e->getMessage());
        }
    }
}

// Aggregates every order linked to one tab into a single item list (same
// dish ordered twice across two separate KOTs collapses into one line with
// the combined quantity, same as a real running tab would read on one bill).
if (!function_exists('getWalkInTabItems')) {
    function getWalkInTabItems($pdo, $tabId) {
        $stmt = $pdo->prepare("
            SELECT m.name, m.price, SUM(oi.quantity) as quantity
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN menu_items m ON oi.menu_item_id = m.id
            WHERE o.walk_in_tab_id = ?
            GROUP BY oi.menu_item_id, m.name, m.price
            ORDER BY MIN(oi.id)
        ");
        $stmt->execute([$tabId]);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $subtotal = 0;
        foreach ($items as &$it) {
            $it['price'] = (float)($it['price'] ?? 0);
            $it['quantity'] = (int)($it['quantity'] ?? 0);
            $it['lineTotal'] = $it['price'] * $it['quantity'];
            $subtotal += $it['lineTotal'];
        }
        return ['items' => $items, 'subtotal' => $subtotal];
    }
}

function handleWalkInTabRequests($pdo, $request_method, $action, $propertyId) {
    ensureWalkInTabSchema($pdo);

    switch ($action) {
        case 'get_walk_in_tabs':
            try {
                $stmt = $pdo->prepare("SELECT id, label, status, opened_at FROM walk_in_tabs WHERE property_id = ? AND status = 'open' ORDER BY opened_at DESC");
                $stmt->execute([$propertyId]);
                $tabs = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($tabs as &$tab) {
                    $agg = getWalkInTabItems($pdo, $tab['id']);
                    $tab['items'] = $agg['items'];
                    $tab['subtotal'] = $agg['subtotal'];
                }
                echo json_encode(['status' => 'success', 'data' => $tabs]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'success', 'data' => []]);
            }
            break;

        case 'get_walk_in_tab_history':
            try {
                $stmt = $pdo->prepare("SELECT id, label, status, opened_at, billed_at, payment_method, discount, gst_enabled, gst_rate, gst_amount, grand_total FROM walk_in_tabs WHERE property_id = ? AND status = 'billed' ORDER BY billed_at DESC LIMIT 50");
                $stmt->execute([$propertyId]);
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'success', 'data' => []]);
            }
            break;

        case 'open_walk_in_tab':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true) ?? [];
                try {
                    $input = array_merge($input, validateWalkInTabInput($input));
                } catch (Exception $eVal) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => $eVal->getMessage()]);
                    break;
                }
                $label = trim((string)($input['label'] ?? '')) ?: null;
                try {
                    $stmt = $pdo->prepare("INSERT INTO walk_in_tabs (property_id, label, status, opened_at) VALUES (?, ?, 'open', NOW())");
                    $stmt->execute([$propertyId, $label]);
                    echo json_encode(['status' => 'success', 'tab_id' => (int)$pdo->lastInsertId()]);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => 'Failed to open tab']);
                }
            }
            break;

        // Closes a tab and settles it in one shot - same reasoning as
        // add_guest/save_receipt: the tab's billed state and its ledger
        // entry must land together or not at all.
        case 'bill_walk_in_tab':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true) ?? [];
                try {
                    $input = array_merge($input, validateWalkInTabInput($input));
                } catch (Exception $eVal) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => $eVal->getMessage()]);
                    break;
                }
                $tabId = (int)($input['tab_id'] ?? 0);
                $paymentMethod = $input['payment_method'] ?? 'Cash';
                $discount = max(0, (float)($input['discount'] ?? 0));
                $gstEnabled = !empty($input['gst_enabled']);
                $gstRate = $gstEnabled ? (float)($input['gst_rate'] ?? 5) : 0;

                if ($tabId <= 0) {
                    echo json_encode(['status' => 'error', 'message' => 'tab_id is required']);
                    break;
                }

                try {
                    $tabStmt = $pdo->prepare("SELECT id, label, status FROM walk_in_tabs WHERE id = ? AND property_id = ?");
                    $tabStmt->execute([$tabId, $propertyId]);
                    $tab = $tabStmt->fetch(PDO::FETCH_ASSOC);

                    if (!$tab) {
                        echo json_encode(['status' => 'error', 'message' => 'Tab not found']);
                        break;
                    }
                    if ($tab['status'] !== 'open') {
                        echo json_encode(['status' => 'error', 'message' => 'This tab has already been billed']);
                        break;
                    }

                    $agg = getWalkInTabItems($pdo, $tabId);
                    $subtotal = $agg['subtotal'];
                    if ($subtotal <= 0) {
                        echo json_encode(['status' => 'error', 'message' => 'Tab has no billable items']);
                        break;
                    }

                    $afterDiscount = max(0, $subtotal - $discount);
                    $gstAmount = $gstEnabled ? round($afterDiscount * ($gstRate / 100), 2) : 0;
                    $grandTotal = round($afterDiscount + $gstAmount, 2);

                    $pdo->beginTransaction();
                    $updStmt = $pdo->prepare("UPDATE walk_in_tabs SET status = 'billed', billed_at = NOW(), payment_method = ?, discount = ?, gst_enabled = ?, gst_rate = ?, gst_amount = ?, grand_total = ? WHERE id = ?");
                    $updStmt->execute([$paymentMethod, $discount, $gstEnabled ? 1 : 0, $gstRate, $gstAmount, $grandTotal, $tabId]);

                    postFinancialLedger($pdo, [
                        'entry_key' => 'walk_in_tab_bill:' . $tabId,
                        'direction' => 'credit',
                        'amount' => $grandTotal,
                        'category' => 'Kitchen POS Sales',
                        'payment_method' => $paymentMethod,
                        'party_type' => 'walk_in_tab',
                        'party_id' => (string)$tabId,
                        'party_name' => $tab['label'] ?: 'Walk-in',
                        'source_type' => 'walk_in_tab',
                        'source_id' => (string)$tabId,
                        'description' => 'Walk-in tab billed',
                    ], $propertyId);
                    $pdo->commit();

                    echo json_encode([
                        'status' => 'success',
                        'bill' => [
                            'tabId' => $tabId,
                            'label' => $tab['label'],
                            'items' => $agg['items'],
                            'subtotal' => $subtotal,
                            'discount' => $discount,
                            'gstEnabled' => $gstEnabled,
                            'gstRate' => $gstRate,
                            'gstAmount' => $gstAmount,
                            'grandTotal' => $grandTotal,
                            'paymentMethod' => $paymentMethod,
                        ],
                    ]);
                } catch (PDOException $e) {
                    if ($pdo->inTransaction()) {
                        $pdo->rollBack();
                    }
                    echo json_encode(['status' => 'error', 'message' => 'Failed to bill tab']);
                }
            }
            break;
    }
}
