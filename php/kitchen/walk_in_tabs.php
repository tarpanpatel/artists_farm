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
        // BEFORE the early return below, not after it. unit_price has its own
        // independent schema key, and every environment that already ran this
        // function has `schema_walk_in_tabs` cached as verified - so a call
        // placed after the return would never execute there, the column would
        // never be added, and every query selecting oi.unit_price would fail
        // into a `catch (PDOException) { items = [] }` and silently serve
        // EMPTY order items. (Caught in review before shipping, 13 Sep 2026.)
        ensureOrderItemUnitPriceColumn($pdo);
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

// order_items.unit_price - what the dish ACTUALLY sold for, captured at the
// moment it was ordered (13 Sep 2026).
//
// Before this, every bill total was recomputed live from menu_items.price.
// That was survivable while a bill's grand_total was frozen at billing time
// and nothing ever recalculated it - but the past-bills editor (Sep 2026) both
// recalculates and re-displays, so raising a dish's price silently re-priced
// every historical bill containing it, and a past bill's own line items could
// stop adding up to the total it was actually paid at.
//
// Nullable on purpose: rows written before this column existed have no
// recoverable sale price, so every read falls back to the live menu price for
// those (COALESCE below). New rows never need that fallback.
if (!function_exists('ensureOrderItemUnitPriceColumn')) {
    function ensureOrderItemUnitPriceColumn($pdo) {
        if (isSchemaVerified('schema_order_items_unit_price')) return;
        try {
            $cols = $pdo->query("SHOW COLUMNS FROM order_items")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('unit_price', $cols)) {
                $pdo->exec("ALTER TABLE order_items ADD COLUMN unit_price DECIMAL(10,2) NULL DEFAULT NULL");
            }
            markSchemaVerified('schema_order_items_unit_price');
        } catch (Exception $e) {
            error_log("order_items unit_price column migration error: " . $e->getMessage());
        }
    }
}

// The price one dish sold at, for a NEW order_items row: whatever the menu
// says right now. Read once at insert so it can never drift afterwards.
if (!function_exists('currentMenuItemPrice')) {
    function currentMenuItemPrice($pdo, $menuItemId, $propertyId) {
        $s = $pdo->prepare("SELECT price FROM menu_items WHERE id = ? AND property_id = ?");
        $s->execute([$menuItemId, $propertyId]);
        $p = $s->fetchColumn();
        return $p === false ? null : (float)$p;
    }
}

// Aggregates every order linked to one tab into a single item list (same
// dish ordered twice across two separate KOTs collapses into one line with
// the combined quantity, same as a real running tab would read on one bill).
if (!function_exists('getWalkInTabItems')) {
    function getWalkInTabItems($pdo, $tabId) {
        $stmt = $pdo->prepare("
            SELECT oi.menu_item_id, m.name,
                   COALESCE(oi.unit_price, m.price, 0) as price,
                   SUM(oi.quantity) as quantity
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN menu_items m ON oi.menu_item_id = m.id
            WHERE o.walk_in_tab_id = ?
            GROUP BY oi.menu_item_id, m.name, COALESCE(oi.unit_price, m.price, 0)
            ORDER BY MIN(oi.id)
        ");
        $stmt->execute([$tabId]);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $subtotal = 0;
        foreach ($items as &$it) {
            $it['menu_item_id'] = (int)($it['menu_item_id'] ?? 0);
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
                $stmt = $pdo->prepare("SELECT id, label, status, opened_at, billed_at, payment_method, discount, gst_enabled, gst_rate, gst_amount, grand_total FROM walk_in_tabs WHERE property_id = ? AND status = 'billed' ORDER BY billed_at DESC LIMIT 100");
                $stmt->execute([$propertyId]);
                $history = $stmt->fetchAll(PDO::FETCH_ASSOC);
                // One grouped query for every tab's items, not getWalkInTabItems()
                // per row (13 Sep 2026) - at LIMIT 100 that was 100 extra round
                // trips on each open of the past-bills drawer.
                $itemsByTab = [];
                if (!empty($history)) {
                    $tabIds = array_column($history, 'id');
                    $ph = implode(',', array_fill(0, count($tabIds), '?'));
                    $iStmt = $pdo->prepare("
                        SELECT o.walk_in_tab_id, oi.menu_item_id, m.name,
                               COALESCE(oi.unit_price, m.price, 0) as price,
                               SUM(oi.quantity) as quantity
                        FROM orders o
                        JOIN order_items oi ON oi.order_id = o.id
                        LEFT JOIN menu_items m ON oi.menu_item_id = m.id
                        WHERE o.walk_in_tab_id IN ($ph)
                        GROUP BY o.walk_in_tab_id, oi.menu_item_id, m.name, COALESCE(oi.unit_price, m.price, 0)
                        ORDER BY MIN(oi.id)
                    ");
                    $iStmt->execute($tabIds);
                    foreach ($iStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                        $tId = (int)$row['walk_in_tab_id'];
                        $price = (float)$row['price'];
                        $qty = (int)$row['quantity'];
                        $itemsByTab[$tId][] = [
                            'menu_item_id' => (int)($row['menu_item_id'] ?? 0),
                            'name' => $row['name'],
                            'price' => $price,
                            'quantity' => $qty,
                            'lineTotal' => $price * $qty,
                        ];
                    }
                }
                foreach ($history as &$tab) {
                    $items = $itemsByTab[(int)$tab['id']] ?? [];
                    $tab['items'] = $items;
                    $tab['subtotal'] = (float)array_sum(array_column($items, 'lineTotal'));
                    $tab['discount'] = (float)($tab['discount'] ?? 0);
                    $tab['gst_rate'] = (float)($tab['gst_rate'] ?? 0);
                    $tab['gst_amount'] = (float)($tab['gst_amount'] ?? 0);
                    $tab['grand_total'] = (float)($tab['grand_total'] ?? 0);
                    $tab['gst_enabled'] = !empty($tab['gst_enabled']);
                }
                echo json_encode(['status' => 'success', 'data' => $history]);
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
                } catch (Throwable $e) {
                    // Throwable, not PDOException (13 Sep 2026): postFinancialLedger()
                    // can raise a plain Exception, which would otherwise escape this
                    // handler with the transaction still OPEN and never rolled back -
                    // the same defect found in update_walk_in_tab and
                    // delete_walk_in_tab. A repo-wide sweep found no third instance.
                    if ($pdo->inTransaction()) {
                        $pdo->rollBack();
                    }
                    error_log('bill_walk_in_tab failed: ' . $e->getMessage());
                    echo json_encode(['status' => 'error', 'message' => 'Failed to bill tab']);
                }
            }
            break;

        case 'update_walk_in_tab':
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

                    $label = isset($input['label']) ? (trim((string)$input['label']) ?: null) : $tab['label'];
                    $paymentMethod = $input['payment_method'] ?? 'Cash';
                    $discount = max(0, (float)($input['discount'] ?? 0));
                    $gstEnabled = !empty($input['gst_enabled']);
                    $gstRate = $gstEnabled ? (float)($input['gst_rate'] ?? 5) : 0;

                    $pdo->beginTransaction();

                    // If items array is provided in update payload, sync order_items for this tab
                    if (isset($input['items']) && is_array($input['items'])) {
                        $orderStmt = $pdo->prepare("SELECT id FROM orders WHERE walk_in_tab_id = ? ORDER BY id ASC");
                        $orderStmt->execute([$tabId]);
                        $orderIds = $orderStmt->fetchAll(PDO::FETCH_COLUMN);

                        if (empty($orderIds)) {
                            $createOrder = $pdo->prepare("INSERT INTO orders (property_id, walk_in_tab_id, order_time, status) VALUES (?, ?, NOW(), 'Fulfilled')");
                            $createOrder->execute([$propertyId, $tabId]);
                            $primaryOrderId = $pdo->lastInsertId();
                        } else {
                            $primaryOrderId = $orderIds[0];
                            if (count($orderIds) > 1) {
                                $extraOrderIds = array_slice($orderIds, 1);
                                $inClause = implode(',', array_fill(0, count($extraOrderIds), '?'));
                                $pdo->prepare("DELETE FROM order_items WHERE order_id IN ($inClause)")->execute($extraOrderIds);
                                $pdo->prepare("DELETE FROM orders WHERE id IN ($inClause)")->execute($extraOrderIds);
                            }
                            $pdo->prepare("DELETE FROM order_items WHERE order_id = ?")->execute([$primaryOrderId]);
                        }

                        // unit_price is carried across the delete-and-reinsert so an
                        // edit that only changes a QUANTITY keeps the price that line
                        // actually sold at, instead of silently re-pricing it at
                        // today's menu (13 Sep 2026).
                        $insItem = $pdo->prepare("INSERT INTO order_items (property_id, order_id, menu_item_id, quantity, item_status, unit_price) VALUES (?, ?, ?, ?, 'Fulfilled', ?)");
                        foreach ($input['items'] as $it) {
                            $mId = !empty($it['menu_item_id']) ? (int)$it['menu_item_id'] : (!empty($it['id']) ? (int)$it['id'] : null);
                            $qty = max(1, (int)($it['quantity'] ?? 1));
                            if (!$mId && !empty($it['name'])) {
                                $findM = $pdo->prepare("SELECT id FROM menu_items WHERE property_id = ? AND name = ? LIMIT 1");
                                $findM->execute([$propertyId, $it['name']]);
                                $mId = $findM->fetchColumn() ?: null;
                            }
                            // A menu item is NOT invented from a bill edit any more
                            // (13 Sep 2026). It used to INSERT one with a hardcoded
                            // 'Starters' category and available = 1, so a typo while
                            // correcting a bill published a new orderable dish.
                            // An unrecognised name is a client mistake - say so.
                            if (!$mId) {
                                throw new RuntimeException(
                                    'Unknown dish "' . (string)($it['name'] ?? '') . '". Add it to the menu first, then edit this bill.'
                                );
                            }
                            // The id came from the client, so confirm it belongs to
                            // THIS property before billing against its price.
                            $priceNow = currentMenuItemPrice($pdo, $mId, $propertyId);
                            if ($priceNow === null) {
                                throw new RuntimeException('That dish does not belong to this property.');
                            }
                            // Keep the original sale price when the client echoed one
                            // back for a line that already existed; price new lines at
                            // today's menu.
                            $unitPrice = (isset($it['price']) && $it['price'] !== '' && $it['price'] !== null)
                                ? (float)$it['price']
                                : $priceNow;
                            if ($mId) {
                                $insItem->execute([$propertyId, $primaryOrderId, $mId, $qty, $unitPrice]);
                            }
                        }
                    }

                    $agg = getWalkInTabItems($pdo, $tabId);
                    $subtotal = $agg['subtotal'];
                    // An already-billed tab must never end up at zero through an
                    // edit - that is a paid bill silently becoming free. Same guard
                    // bill_walk_in_tab has always had; update_walk_in_tab shipped
                    // without it (13 Sep 2026).
                    if ($tab['status'] === 'billed' && $subtotal <= 0) {
                        $pdo->rollBack();
                        http_response_code(400);
                        echo json_encode([
                            'status' => 'error',
                            'message' => 'A billed tab must keep at least one item. Delete the bill instead if it should not exist.',
                        ]);
                        break;
                    }
                    $afterDiscount = max(0, $subtotal - $discount);
                    $gstAmount = $gstEnabled ? round($afterDiscount * ($gstRate / 100), 2) : 0;
                    $grandTotal = round($afterDiscount + $gstAmount, 2);

                    $upd = $pdo->prepare("UPDATE walk_in_tabs SET label = ?, payment_method = ?, discount = ?, gst_enabled = ?, gst_rate = ?, gst_amount = ?, grand_total = ? WHERE id = ? AND property_id = ?");
                    $upd->execute([$label, $paymentMethod, $discount, $gstEnabled ? 1 : 0, $gstRate, $gstAmount, $grandTotal, $tabId, $propertyId]);

                    // Sync financial_ledger entry if the tab was billed
                    if ($tab['status'] === 'billed') {
                        $ledgerKey = 'walk_in_tab_bill:' . $tabId;
                        $checkLedger = $pdo->prepare("SELECT id FROM financial_ledger WHERE entry_key = ? AND property_id = ?");
                        $checkLedger->execute([$ledgerKey, $propertyId]);
                        if ($checkLedger->fetch()) {
                            $updLedger = $pdo->prepare("UPDATE financial_ledger SET amount = ?, payment_method = ?, party_name = ? WHERE entry_key = ? AND property_id = ?");
                            $updLedger->execute([$grandTotal, $paymentMethod, $label ?: 'Walk-in', $ledgerKey, $propertyId]);
                        } else {
                            postFinancialLedger($pdo, [
                                'entry_key' => $ledgerKey,
                                'direction' => 'credit',
                                'amount' => $grandTotal,
                                'category' => 'Kitchen POS Sales',
                                'payment_method' => $paymentMethod,
                                'party_type' => 'walk_in_tab',
                                'party_id' => (string)$tabId,
                                'party_name' => $label ?: 'Walk-in',
                                'source_type' => 'walk_in_tab',
                                'source_id' => (string)$tabId,
                                'description' => 'Walk-in tab billed',
                            ], $propertyId);
                        }
                    }
                    $pdo->commit();

                    echo json_encode([
                        'status' => 'success',
                        'message' => 'Tab updated successfully',
                        'bill' => [
                            'tabId' => $tabId,
                            'label' => $label,
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
                } catch (RuntimeException $eBad) {
                    // Deliberate rejections raised above (unknown dish, wrong
                    // property) - the message is meant for the user.
                    if ($pdo->inTransaction()) {
                        $pdo->rollBack();
                    }
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => $eBad->getMessage()]);
                } catch (Throwable $e) {
                    // Throwable, not PDOException (13 Sep 2026): postFinancialLedger
                    // can raise a plain Exception, which previously escaped this
                    // handler with the transaction still OPEN and no rollback.
                    if ($pdo->inTransaction()) {
                        $pdo->rollBack();
                    }
                    error_log('update_walk_in_tab failed: ' . $e->getMessage());
                    echo json_encode(['status' => 'error', 'message' => 'Failed to update tab']);
                }
            }
            break;

        case 'delete_walk_in_tab':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true) ?? [];
                $tabId = (int)($input['tab_id'] ?? 0);
                if ($tabId <= 0) {
                    echo json_encode(['status' => 'error', 'message' => 'tab_id is required']);
                    break;
                }

                try {
                    $tabStmt = $pdo->prepare("SELECT id, status FROM walk_in_tabs WHERE id = ? AND property_id = ?");
                    $tabStmt->execute([$tabId, $propertyId]);
                    $tab = $tabStmt->fetch(PDO::FETCH_ASSOC);
                    if (!$tab) {
                        echo json_encode(['status' => 'error', 'message' => 'Tab not found']);
                        break;
                    }

                    $pdo->beginTransaction();
                    // REVERSE the ledger entry, never DELETE it (13 Sep 2026).
                    // The original hard-deleted the row, so a bill already counted
                    // in a closed cash drawer could vanish from the books with no
                    // trace it had ever existed. reverseFinancialSource() is the
                    // convention everywhere else in this codebase: money moves by
                    // appending an opposite entry, so the history stays readable.
                    reverseFinancialSource($pdo, 'walk_in_tab', (string)$tabId, 'Walk-in bill deleted', $propertyId);

                    // Unlink any orders connected to this tab
                    $pdo->prepare("UPDATE orders SET walk_in_tab_id = NULL WHERE walk_in_tab_id = ?")->execute([$tabId]);

                    // Delete the tab record
                    $pdo->prepare("DELETE FROM walk_in_tabs WHERE id = ? AND property_id = ?")->execute([$tabId, $propertyId]);
                    $pdo->commit();

                    echo json_encode(['status' => 'success', 'message' => 'Walk-in bill deleted successfully']);
                } catch (Throwable $e) {
                    if ($pdo->inTransaction()) {
                        $pdo->rollBack();
                    }
                    error_log('delete_walk_in_tab failed: ' . $e->getMessage());
                    echo json_encode(['status' => 'error', 'message' => 'Failed to delete walk-in bill']);
                }
            }
            break;
    }
}
