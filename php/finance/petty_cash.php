<?php
/**
 * Expenses & Cash Drawer Module
 * Function: Petty cash outflows, operational expenses, vendor payments, and desk cash drawer reconciliation.
 */

// Import default expenses seed
$seedFile = __DIR__ . '/../seed/default_expenses.php';
if (file_exists($seedFile)) {
    require_once $seedFile;
}

function handleFinanceRequests($pdo, $request_method, $action, $propertyId) {
    require_once __DIR__ . '/../config/schema_cache.php';
    switch ($action) {
        case 'get_petty_cash':
            try {
                $stmt = $pdo->prepare("SELECT id, expense_date as date, category, description, amount, payment_mode, vendor_name as vendor FROM farm_utility_expenses WHERE property_id = ? ORDER BY expense_date DESC");
                $stmt->execute([$propertyId]);
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
            } catch (PDOException $e) {
                try {
                    $stmt = $pdo->prepare("SELECT id, date, category, amount, description, vendor_name as vendor FROM petty_cash WHERE property_id = ? ORDER BY date DESC");
                    $stmt->execute([$propertyId]);
                    echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
                } catch (PDOException $e2) {
                    echo json_encode(['status' => 'success', 'data' => []]);
                }
            }
            break;

        case 'add_petty_cash':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("INSERT INTO farm_utility_expenses (expense_date, category, description, amount, payment_mode, vendor_name, property_id) VALUES (?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $input['date'] ?? date('Y-m-d'),
                        $input['category'] ?? 'Other',
                        $input['description'] ?? '',
                        $input['amount'] ?? 0,
                        $input['payment_mode'] ?? 'Cash',
                        $input['vendor'] ?? $input['vendor_name'] ?? 'Manager',
                        $propertyId
                    ]);
                    $id = $pdo->lastInsertId();
                } catch (PDOException $e) {
                    $id = 'EXP-' . time();
                    $stmt = $pdo->prepare("INSERT INTO petty_cash (id, date, category, amount, description, vendor_name, approved_by, property_id) VALUES (?, ?, ?, ?, ?, ?, 'Manager', ?)");
                    $stmt->execute([
                        $id,
                        $input['date'] ?? date('Y-m-d'),
                        $input['category'] ?? 'Other',
                        $input['amount'] ?? 0,
                        $input['description'] ?? '',
                        $input['vendor'] ?? $input['vendor_name'] ?? 'Manager',
                        $propertyId
                    ]);
                }
                // Save/update latest price for this item
                if (!empty($input['description']) && !empty($input['amount'])) {
                    try {
                        $stmtPrice = $pdo->prepare("INSERT INTO expense_item_prices (item_name, property_id, last_price) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE last_price = VALUES(last_price)");
                        $stmtPrice->execute([trim($input['description']), $propertyId, $input['amount']]);
                    } catch (PDOException $ePrice) {
                        // ignore price table error
                    }
                }

                // Every expense is also an accounting debit. The unique entry key
                // makes retries safe and keeps the operational record authoritative.
                postFinancialLedger($pdo, [
                    'entry_key' => 'expense:' . $id,
                    'direction' => 'debit',
                    'amount' => $input['amount'] ?? 0,
                    'category' => $input['category'] ?? 'Other',
                    'payment_method' => $input['payment_mode'] ?? $input['paymentMode'] ?? 'Cash',
                    'party_type' => 'payee',
                    'party_name' => $input['vendor'] ?? $input['vendor_name'] ?? 'Manager',
                    'source_type' => 'expense',
                    'source_id' => $id,
                    'description' => $input['description'] ?? '',
                ]);

                // Attach invoice / payment-screenshot proof straight to the
                // finance Telegram chat on submit. Images arrive as base64
                // data-URIs in the POST body, are decoded to temp files, sent
                // with the full expense caption, then discarded - nothing is
                // persisted (farm_utility_expenses / petty_cash have no image
                // columns, by design).
                $proofImages = [];
                foreach (['invoice_bill_url', 'invoiceBillUrl'] as $key) {
                    if (!empty($input[$key])) { $proofImages[] = $input[$key]; break; }
                }
                foreach (['payment_screenshot_url', 'paymentScreenshotUrl'] as $key) {
                    if (!empty($input[$key])) { $proofImages[] = $input[$key]; break; }
                }
                if (!empty($proofImages)) {
                    try {
                        require_once __DIR__ . '/../telegram/sender.php';
                        require_once __DIR__ . '/../telegram/templates.php';
                        $tmpFiles = [];
                        foreach ($proofImages as $dataUri) {
                            $comma = strpos($dataUri, ',');
                            $decoded = base64_decode($comma === false ? $dataUri : substr($dataUri, $comma + 1));
                            if ($decoded === false || $decoded === '') continue;
                            $tmp = sys_get_temp_dir() . '/expense_' . bin2hex(random_bytes(8)) . '.jpg';
                            file_put_contents($tmp, $decoded);
                            $tmpFiles[] = $tmp;
                        }
                        if (!empty($tmpFiles)) {
                            $caption = TelegramTemplates::render($pdo, 'finance_operational_expense', [
                                'expense_date' => $input['date'] ?? date('Y-m-d'),
                                'category' => $input['category'] ?? 'Other',
                                'paid_by' => $input['paidBy'] ?? $input['vendor'] ?? $input['vendor_name'] ?? 'Manager',
                                'description' => $input['description'] ?? '',
                                'payment_mode' => $input['payment_mode'] ?? $input['paymentMode'] ?? 'Cash',
                                'amount' => number_format((float)($input['amount'] ?? 0), 2),
                            ]);
                            sendPropertyTelegramPhoto($pdo, $propertyId, 'finance', $tmpFiles, $caption, 'finance_operational_expense');
                        }
                        foreach ($tmpFiles as $tmp) {
                            @unlink($tmp);
                        }
                    } catch (Exception $e) {
                        error_log("Failed to send expense proof to Telegram: " . $e->getMessage());
                    }
                }

                echo json_encode(['status' => 'success', 'id' => $id, 'message' => 'Expense outflow recorded']);
            }
            break;

        case 'update_petty_cash':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                // Never overwrite accounting history: neutralise the previous
                // posting, then add the corrected value after the source update.
                reverseFinancialSource($pdo, 'expense', (string)$input['id'], 'Expense corrected');
                try {
                    $stmt = $pdo->prepare("UPDATE farm_utility_expenses SET expense_date = ?, category = ?, description = ?, amount = ?, payment_mode = ?, vendor_name = ? WHERE id = ? AND property_id = ?");
                    $stmt->execute([
                        $input['date'] ?? date('Y-m-d'),
                        $input['category'] ?? 'Other',
                        $input['description'] ?? '',
                        $input['amount'] ?? 0,
                        $input['paymentMode'] ?? $input['payment_mode'] ?? 'Online / UPI / QR',
                        $input['paidBy'] ?? $input['vendor'] ?? 'Manager',
                        $input['id'],
                        $propertyId
                    ]);
                } catch (PDOException $e) {
                    $stmt = $pdo->prepare("UPDATE petty_cash SET date = ?, category = ?, description = ?, amount = ?, vendor_name = ? WHERE id = ? AND property_id = ?");
                    $stmt->execute([
                        $input['date'] ?? date('Y-m-d'),
                        $input['category'] ?? 'Other',
                        $input['description'] ?? '',
                        $input['amount'] ?? 0,
                        $input['paidBy'] ?? $input['vendor'] ?? 'Manager',
                        $input['id'],
                        $propertyId
                    ]);
                }

                // Update item price tracking
                if (!empty($input['description']) && !empty($input['amount'])) {
                    $stmtPrice = $pdo->prepare("INSERT INTO expense_item_prices (item_name, property_id, last_price) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE last_price = VALUES(last_price)");
                    $stmtPrice->execute([trim($input['description']), $propertyId, $input['amount']]);
                }

                postFinancialLedger($pdo, [
                    'entry_key' => 'expense_revision:' . $input['id'] . ':' . uniqid(),
                    'direction' => 'debit',
                    'amount' => $input['amount'] ?? 0,
                    'category' => $input['category'] ?? 'Other',
                    'payment_method' => $input['paymentMode'] ?? $input['payment_mode'] ?? 'Cash',
                    'party_type' => 'payee',
                    'party_name' => $input['paidBy'] ?? $input['vendor'] ?? 'Manager',
                    'source_type' => 'expense',
                    'source_id' => $input['id'],
                    'description' => $input['description'] ?? '',
                ]);

                echo json_encode(['status' => 'success', 'message' => 'Expense entry updated in database']);
            }
            break;

        case 'delete_petty_cash':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $id = intval($input['id'] ?? 0);
                if (!$id) {
                    echo json_encode(['status' => 'error', 'message' => 'Expense id is required']);
                    break;
                }
                reverseFinancialSource($pdo, 'expense', (string)$id, 'Expense deleted');
                try {
                    $stmt = $pdo->prepare("DELETE FROM farm_utility_expenses WHERE id = ? AND property_id = ?");
                    $stmt->execute([$id, $propertyId]);
                } catch (PDOException $e) {
                    $stmt = $pdo->prepare("DELETE FROM petty_cash WHERE id = ? AND property_id = ?");
                    $stmt->execute([$id, $propertyId]);
                }
                echo json_encode(['status' => 'success', 'message' => 'Expense entry deleted']);
            }
            break;

        case 'get_expense_item_prices':
            try {

                $stmt = $pdo->prepare("SELECT item_name, last_price FROM expense_item_prices WHERE property_id = ?");
                $stmt->execute([$propertyId]);
                $prices = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
                echo json_encode(['status' => 'success', 'data' => $prices]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'get_expense_items':
            try {

                $count = $pdo->query("SELECT COUNT(*) FROM expense_items")->fetchColumn();
                if ((int)$count === 0) {
                    $seed = [
                        'Badminton racket','Ball','Bat','Bedsheets','Blanket','Broom','Brush','Bucket',
                        'Bulb','Carrom board','Chemical','Chess board','Cleaning Net','Curtains','Denial kit',
                        'Diesel','Dustpan','Electricity Bill','Extension Board','Fan','Filter','Gargabe bag',
                        'Glass cleaner','Hair dryer','Hardware','Internet','Light','MCB','Mop','Motor Repair',
                        'Paint','Petrol','Pillow Covers','Pipe','Primer','Pump','Putty','PVC Fittings',
                        'Roller','Room freshner','Shampoo','Shower','Soap','Stumps','Surf','Switch',
                        'Tap','Thinner','Toilet Brush','Toilet cleaner','Toilet Paper','Towels','Tube',
                        'Tube Light','Vacum','Wash basin','Washing Machine','Water Bill','Water Tank','Wiper','Wire'
                    ];
                    $ins = $pdo->prepare("INSERT IGNORE INTO expense_items (item_name, property_id) VALUES (?, ?)");
                    foreach ($seed as $name) {
                        $ins->execute([$name, $propertyId]);
                    }
                }

                $stmt = $pdo->prepare("SELECT id, item_name, created_at FROM expense_items WHERE property_id = ? ORDER BY item_name ASC");
                $stmt->execute([$propertyId]);
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'add_expense_item':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $name = trim($input['item_name'] ?? $input['name'] ?? '');
                if (empty($name)) {
                    echo json_encode(['status' => 'error', 'message' => 'Item name is required']);
                    break;
                }
                try {
                    $stmt = $pdo->prepare("INSERT INTO expense_items (item_name, property_id) VALUES (?, ?)");
                    $stmt->execute([$name, $propertyId]);
                    echo json_encode(['status' => 'success', 'id' => $pdo->lastInsertId(), 'message' => 'Item added']);
                } catch (PDOException $e) {
                    if ($e->getCode() == 23000) {
                        echo json_encode(['status' => 'error', 'message' => 'Item already exists']);
                    } else {
                        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                    }
                }
            }
            break;

        case 'delete_expense_item':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("DELETE FROM expense_items WHERE (id = ? OR item_name = ?) AND property_id = ?");
                    $stmt->execute([$input['id'] ?? null, $input['item_name'] ?? $input['name'] ?? null, $propertyId]);
                    echo json_encode(['status' => 'success', 'message' => 'Item deleted']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'get_system_misc_catalog':
            // System-wide view for Root Admin (not property-scoped)
            try {
                $stmt = $pdo->query("
                    SELECT DISTINCT category
                    FROM miscellaneous_catalog
                    WHERE is_system_default = TRUE
                    ORDER BY category ASC
                ");
                $categories = $stmt->fetchAll(PDO::FETCH_COLUMN);

                $grouped = [];
                foreach ($categories as $category) {
                    $stmt = $pdo->prepare("
                        SELECT id, label, default_amount, category, description, is_system_default
                        FROM miscellaneous_catalog
                        WHERE category = ? AND is_system_default = TRUE
                        ORDER BY label ASC
                        LIMIT 1
                    ");
                    $stmt->execute([$category]);
                    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    if ($items) {
                        $grouped[$category] = $items;
                    }
                }

                echo json_encode(['status' => 'success', 'data' => $grouped]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'get_misc_catalog':
            try {
                // Ensure table has is_system_default column

                // Add is_system_default column if it doesn't exist
                if (!isSchemaVerified('schema_misc_catalog_system_default')) {
                    try {
                        $pdo->exec("ALTER TABLE miscellaneous_catalog ADD COLUMN is_system_default BOOLEAN DEFAULT FALSE");
                    } catch (PDOException $e) {
                        // Column already exists
                    }
                    markSchemaVerified('schema_misc_catalog_system_default');
                }

                // All properties share ONE centralized expense catalog (system_expenses)
                // No per-property duplication
                $stmt = $pdo->query("
                    SELECT id, label, default_amount, category, description
                    FROM system_expenses
                    ORDER BY category ASC, label ASC
                ");
                $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

                // Group by category
                $grouped = [];
                foreach ($data as $item) {
                    $cat = $item['category'];
                    if (!isset($grouped[$cat])) {
                        $grouped[$cat] = [];
                    }
                    $grouped[$cat][] = $item;
                }

                echo json_encode(['status' => 'success', 'data' => $grouped, 'grouped' => true]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'add_misc_charge_template':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    // Ensure table has is_system_default column

                    // Add is_system_default column if it doesn't exist
                    if (!isSchemaVerified('schema_misc_catalog_system_default')) {
                        try {
                            $pdo->exec("ALTER TABLE miscellaneous_catalog ADD COLUMN is_system_default BOOLEAN DEFAULT FALSE");
                        } catch (PDOException $e) {
                            // Column already exists
                        }
                        markSchemaVerified('schema_misc_catalog_system_default');
                    }

                    // Custom items (not system defaults) are always editable and can be added
                    $stmt = $pdo->prepare("
                        INSERT INTO miscellaneous_catalog (label, default_amount, category, description, property_id, is_system_default)
                        VALUES (?, ?, ?, ?, ?, FALSE)
                        ON DUPLICATE KEY UPDATE
                        default_amount = CASE WHEN is_system_default = FALSE THEN VALUES(default_amount) ELSE default_amount END,
                        category = CASE WHEN is_system_default = FALSE THEN VALUES(category) ELSE category END,
                        description = CASE WHEN is_system_default = FALSE THEN VALUES(description) ELSE description END
                    ");
                    $stmt->execute([
                        trim($input['label']),
                        $input['default_amount'] ?? $input['defaultAmount'] ?? 0.00,
                        $input['category'] ?? 'Incidentals',
                        $input['description'] ?? '',
                        $propertyId
                    ]);
                    echo json_encode(['status' => 'success', 'message' => 'Charge template saved successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'delete_misc_charge_template':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("
                        DELETE FROM miscellaneous_catalog
                        WHERE (id = ? OR label = ?) AND property_id = ?
                    ");
                    $stmt->execute([$input['id'] ?? null, $input['label'] ?? null, $propertyId]);
                    echo json_encode(['status' => 'success', 'message' => 'Charge template deleted successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        // =====================================================================
        // CASH DRAWER (Accountability & Handover Tracking)
        // =====================================================================

        case 'get_cash_drawer_summary':
            try {
                // Auto-create the cash_drawer_entries table if it doesn't exist

                // Step 1: Get all staff members
                $staffStmt = $pdo->query("SELECT id, username, full_name, role FROM staff_users WHERE status = 'Active' ORDER BY CAST(id AS UNSIGNED) ASC");
                $staffMembers = $staffStmt->fetchAll(PDO::FETCH_ASSOC);

                $summaries = [];
                foreach ($staffMembers as $s) {
                    $staffId = $s['id'];
                    $staffName = $s['username'];

                    // Step 2: Cash collected from guests (advance + pending + food)
                    $cashIn = 0;
                    try {
                        $sqlIn = "SELECT
                            COALESCE(SUM(CASE WHEN advance_received_by = :name THEN advance_paid ELSE 0 END), 0) +
                            COALESCE(SUM(CASE WHEN pending_received_by = :name2 THEN pending_amount ELSE 0 END), 0) +
                            COALESCE(SUM(CASE WHEN food_received_by = :name3 THEN total_food ELSE 0 END), 0) as total_cash_in
                            FROM guests WHERE status = 'CheckedOut' AND property_id = :property_id";
                        $stmtIn = $pdo->prepare($sqlIn);
                        $stmtIn->execute([':name' => $staffName, ':name2' => $staffName, ':name3' => $staffName, ':property_id' => $propertyId]);
                        $cashIn = (float)$stmtIn->fetchColumn();
                    } catch (PDOException $e) {}

                    // Step 3: Cash expenses paid by this staff member
                    $cashOut = 0;
                    try {
                        $stmtOut = $pdo->prepare("SELECT COALESCE(SUM(amount), 0) FROM farm_utility_expenses WHERE vendor_name = ? AND payment_mode = 'Cash' AND property_id = ?");
                        $stmtOut->execute([$staffName, $propertyId]);
                        $cashOut = (float)$stmtOut->fetchColumn();
                    } catch (PDOException $e) {}

                    // Step 4: Handovers and adjustments from cash_drawer_entries
                    $handoverTotal = 0;
                    $adjustmentTotal = 0;
                    try {
                        $stmtHand = $pdo->prepare("SELECT type, COALESCE(SUM(amount), 0) as total FROM cash_drawer_entries WHERE staff_id = ? AND property_id = ? GROUP BY type");
                        $stmtHand->execute([$staffId, $propertyId]);
                        $rows = $stmtHand->fetchAll(PDO::FETCH_ASSOC);
                        foreach ($rows as $r) {
                            if ($r['type'] === 'handover') $handoverTotal = (float)$r['total'];
                            if ($r['type'] === 'manual_adjustment') $adjustmentTotal = (float)$r['total'];
                        }
                    } catch (PDOException $e) {}

                    // Step 5: Out-of-pocket kitchen purchases — only a thing for
                    // properties with the kitchen module enabled; a property with
                    // no food service has no kitchen_purchases_log activity to surface.
                    $outOfPocketTotal = 0;
                    if (isModuleEnabledForProperty($pdo, $propertyId, 'kitchen')) {
                        try {
                            $stmtOop = $pdo->prepare("SELECT COALESCE(SUM(total_price), 0) FROM kitchen_purchases_log WHERE paid_by_staff = ? AND settlement_method = 'Paid Out of Pocket' AND property_id = ?");
                            $stmtOop->execute([$staffName, $propertyId]);
                            $outOfPocketTotal = (float)$stmtOop->fetchColumn();
                        } catch (PDOException $e) {}
                    }

                    $netBalance = $cashIn - $cashOut - $handoverTotal + $adjustmentTotal;

                    $summaries[] = [
                        'staffId' => $staffId,
                        'staffName' => $s['full_name'] ?: $staffName,
                        'username' => $staffName,
                        'role' => $s['role'],
                        'cashCollected' => round($cashIn, 2),
                        'cashExpenses' => round($cashOut, 2),
                        'drawerHandovers' => round($handoverTotal, 2),
                        'manualAdjustments' => round($adjustmentTotal, 2),
                        'outOfPocketExpenses' => round($outOfPocketTotal, 2),
                        'netBalance' => round($netBalance, 2),
                    ];
                }

                echo json_encode(['status' => 'success', 'data' => $summaries]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'add_drawer_entry':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {

                    $stmt = $pdo->prepare("INSERT INTO cash_drawer_entries (staff_id, staff_name, type, amount, handed_to, notes, property_id) VALUES (?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $input['staff_id'] ?? '',
                        $input['staff_name'] ?? '',
                        $input['type'] ?? 'handover',
                        $input['amount'] ?? 0,
                        $input['handed_to'] ?? null,
                        $input['notes'] ?? null,
                        $propertyId
                    ]);
                    $newId = $pdo->lastInsertId();
                    $drawerType = $input['type'] ?? 'handover';
                    postFinancialLedger($pdo, [
                        'entry_key' => 'cash_drawer:' . $newId,
                        'direction' => $drawerType === 'manual_adjustment' ? 'credit' : 'debit',
                        'amount' => $input['amount'] ?? 0,
                        'category' => 'Cash Drawer ' . $drawerType,
                        'payment_method' => 'Cash',
                        'party_type' => 'staff',
                        'party_id' => $input['staff_id'] ?? '',
                        'party_name' => $input['staff_name'] ?? '',
                        'source_type' => 'cash_drawer',
                        'source_id' => $newId,
                        'description' => $input['notes'] ?? '',
                        'metadata' => ['handed_to' => $input['handed_to'] ?? null],
                    ]);
                    echo json_encode(['status' => 'success', 'id' => $newId, 'message' => 'Cash drawer entry recorded']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'get_drawer_entries':
            try {

                $stmt = $pdo->prepare("SELECT * FROM cash_drawer_entries WHERE property_id = ? ORDER BY created_at DESC");
                $stmt->execute([$propertyId]);
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'success', 'data' => []]);
            }
            break;

        case 'get_financial_ledger':
            try {
                ensureFinancialLedger($pdo);
                $month = $_GET['month'] ?? '';
                if ($month && preg_match('/^\d{4}-\d{2}$/', $month)) {
                    // financial_ledger is multi-tenant (every property's cash drawer, salary and
                    // expense entries share the table), so ALWAYS scope by the resolved property.
                    $stmt = $pdo->prepare("SELECT * FROM financial_ledger WHERE property_id = ? AND DATE_FORMAT(occurred_at, '%Y-%m') = ? ORDER BY occurred_at DESC, id DESC");
                    $stmt->execute([$propertyId, $month]);
                } else {
                    $stmt = $pdo->prepare("SELECT * FROM financial_ledger WHERE property_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 1000");
                    $stmt->execute([$propertyId]);
                }
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'record_salary_payment':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $paymentId = $input['payment_id'] ?? ('salary-' . uniqid());
                postFinancialLedger($pdo, [
                    'entry_key' => 'salary:' . $paymentId,
                    'direction' => 'debit',
                    'amount' => $input['amount'] ?? 0,
                    'category' => 'Salary Payment',
                    'payment_method' => $input['payment_method'] ?? 'Cash',
                    'party_type' => 'staff',
                    'party_id' => $input['staff_id'] ?? '',
                    'party_name' => $input['staff_name'] ?? '',
                    'source_type' => 'salary_payment',
                    'source_id' => $paymentId,
                    'description' => $input['description'] ?? '',
                ]);
                echo json_encode(['status' => 'success', 'id' => $paymentId]);
            }
            break;

        case 'record_out_of_pocket':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $creditId = 'oop-' . uniqid();
                postFinancialLedger($pdo, [
                    'entry_key' => 'out_of_pocket:' . $creditId,
                    'direction' => 'credit',
                    'amount' => $input['amount'] ?? 0,
                    'category' => 'Out of Pocket Reimbursement',
                    'payment_method' => 'Cash',
                    'party_type' => 'staff',
                    'party_id' => $input['staff_id'] ?? '',
                    'party_name' => $input['staff_name'] ?? '',
                    'source_type' => 'out_of_pocket',
                    'source_id' => $creditId,
                    'description' => $input['description'] ?? 'Kitchen purchase paid out of pocket',
                ]);
                echo json_encode(['status' => 'success', 'id' => $creditId]);
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid finance action']);
            break;
    }
}
