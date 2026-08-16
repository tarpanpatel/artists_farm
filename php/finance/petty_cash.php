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
    require_once __DIR__ . '/../config/guest_status.php';

    // Non-destructive column addition for time tracking
    try {
        $pdo->exec("ALTER TABLE farm_utility_expenses ADD COLUMN IF NOT EXISTS expense_time VARCHAR(10) DEFAULT '12:00'");
        $pdo->exec("ALTER TABLE petty_cash ADD COLUMN IF NOT EXISTS expense_time VARCHAR(10) DEFAULT '12:00'");
    } catch (Exception $eCol) {}

    switch ($action) {
        case 'get_petty_cash':
            try {
                $stmt = $pdo->prepare("SELECT id, expense_date as date, COALESCE(expense_time, '12:00') as time, category, description, amount, payment_mode, vendor_name as vendor FROM farm_utility_expenses WHERE property_id = ? ORDER BY expense_date DESC, id DESC");
                $stmt->execute([$propertyId]);
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
            } catch (PDOException $e) {
                try {
                    $stmt = $pdo->prepare("SELECT id, date, COALESCE(expense_time, '12:00') as time, category, amount, description, vendor_name as vendor FROM petty_cash WHERE property_id = ? ORDER BY date DESC, id DESC");
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
                $timeVal = !empty($input['time']) ? $input['time'] : date('H:i');
                try {
                    $stmt = $pdo->prepare("INSERT INTO farm_utility_expenses (expense_date, expense_time, category, description, amount, payment_mode, vendor_name, property_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $input['date'] ?? date('Y-m-d'),
                        $timeVal,
                        $input['category'] ?? 'Other',
                        $input['description'] ?? '',
                        $input['amount'] ?? 0,
                        $input['payment_mode'] ?? $input['paymentMode'] ?? 'Cash',
                        $input['vendor'] ?? $input['vendor_name'] ?? 'Manager',
                        $propertyId
                    ]);
                    $id = $pdo->lastInsertId();
                } catch (PDOException $e) {
                    $id = 'EXP-' . time();
                    $stmt = $pdo->prepare("INSERT INTO petty_cash (id, date, expense_time, category, amount, description, vendor_name, approved_by, property_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'Manager', ?)");
                    $stmt->execute([
                        $id,
                        $input['date'] ?? date('Y-m-d'),
                        $timeVal,
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
                ], $propertyId);

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
                ], $propertyId);

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

        case 'get_system_expense_catalog':
            try {
                $stmt = $pdo->query("
                    SELECT id, label, default_amount, category, description
                    FROM system_expenses
                    ORDER BY category ASC, label ASC
                ");
                $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $grouped = [];
                foreach ($data as $item) {
                    $cat = $item['category'];
                    if (!isset($grouped[$cat])) $grouped[$cat] = [];
                    $grouped[$cat][] = $item;
                }
                echo json_encode(['status' => 'success', 'data' => $grouped, 'grouped' => true]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'add_system_expense_item':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $label = trim($input['label'] ?? '');
                    $amount = $input['default_amount'] ?? $input['defaultAmount'] ?? 0.00;
                    $category = $input['category'] ?? 'Incidentals';
                    $description = $input['description'] ?? '';
                    $id = $input['id'] ?? null;

                    if ($id) {
                        $stmt = $pdo->prepare("
                            UPDATE system_expenses SET label = ?, default_amount = ?, category = ?, description = ?
                            WHERE id = ?
                        ");
                        $stmt->execute([$label, $amount, $category, $description, $id]);
                    } else {
                        $stmt = $pdo->prepare("
                            INSERT INTO system_expenses (label, default_amount, category, description)
                            VALUES (?, ?, ?, ?)
                            ON DUPLICATE KEY UPDATE
                            default_amount = VALUES(default_amount), category = VALUES(category), description = VALUES(description)
                        ");
                        $stmt->execute([$label, $amount, $category, $description]);
                    }
                    echo json_encode(['status' => 'success', 'message' => 'System expense item saved successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'delete_system_expense_item':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("DELETE FROM system_expenses WHERE id = ? OR label = ?");
                    $stmt->execute([$input['id'] ?? null, $input['label'] ?? null]);
                    echo json_encode(['status' => 'success', 'message' => 'System expense item deleted successfully', 'rows_deleted' => $stmt->rowCount()]);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'get_bills_catalog':
            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS `bills_catalog` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `label` VARCHAR(255) NOT NULL UNIQUE,
                    `default_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                    `description` TEXT DEFAULT NULL,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

                // Auto-seed with 10 common bill types if table is empty
                $countStmt = $pdo->query("SELECT COUNT(*) FROM bills_catalog");
                if ((int)$countStmt->fetchColumn() === 0) {
                    $defaults = [
                        ['Electricity Bill', 'Monthly electricity charges'],
                        ['Water Bill', 'Municipal water supply charges'],
                        ['Internet / Broadband', 'Monthly internet/broadband plan'],
                        ['Gas / LPG Bill', 'LPG cylinder or piped gas charges'],
                        ['Telephone / Mobile', 'Landline or mobile phone bill'],
                        ['Municipal Property Tax', 'Annual or quarterly property tax'],
                        ['Insurance Premium', 'Property or asset insurance premium'],
                        ['Garbage / Waste Disposal', 'Municipal waste disposal charges'],
                        ['Cable / DTH', 'Cable TV or DTH subscription'],
                        ['Software Subscription', 'SaaS or software license renewal'],
                    ];
                    $ins = $pdo->prepare("INSERT IGNORE INTO bills_catalog (label, description) VALUES (?, ?)");
                    foreach ($defaults as $d) {
                        $ins->execute($d);
                    }
                }

                $stmt = $pdo->query("SELECT id, label, default_amount, description FROM bills_catalog ORDER BY label ASC");
                $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(['status' => 'success', 'data' => $data]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'add_bill_item':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $label = trim($input['label'] ?? '');
                    $description = trim($input['description'] ?? '');
                    $id = $input['id'] ?? null;

                    if ($label === '') {
                        echo json_encode(['status' => 'error', 'message' => 'Bill name is required']);
                        break;
                    }

                    if ($id) {
                        $stmt = $pdo->prepare("UPDATE bills_catalog SET label = ?, description = ? WHERE id = ?");
                        $stmt->execute([$label, $description, $id]);
                    } else {
                        $stmt = $pdo->prepare("INSERT INTO bills_catalog (label, description) VALUES (?, ?) ON DUPLICATE KEY UPDATE description = VALUES(description)");
                        $stmt->execute([$label, $description]);
                    }
                    echo json_encode(['status' => 'success', 'message' => 'Bill item saved successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'delete_bill_item':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("DELETE FROM bills_catalog WHERE id = ? OR label = ?");
                    $stmt->execute([$input['id'] ?? null, $input['label'] ?? null]);
                    echo json_encode(['status' => 'success', 'message' => 'Bill item deleted', 'rows_deleted' => $stmt->rowCount()]);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;


        case 'get_misc_catalog':
            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS `miscellaneous_catalog` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `property_id` INT NOT NULL DEFAULT 1,
                    `label` VARCHAR(255) NOT NULL,
                    `default_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                    `category` VARCHAR(100) NOT NULL DEFAULT 'Services',
                    `description` TEXT,
                    `is_system_default` BOOLEAN DEFAULT FALSE,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY `unique_item_label_prop` (property_id, label)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                // Purge legacy operational expense items mistakenly seeded into guest miscellaneous_catalog
                $pdo->exec("
                    DELETE FROM miscellaneous_catalog
                    WHERE category IN ('Appliances', 'Staff Expenses', 'Staff Benefits', 'Utilities', 'Cleaning Supplies', 'Room Supplies', 'Furniture & Décor', 'Maintenance & Repairs')
                       OR (is_system_default = TRUE AND category NOT IN ('Guest Charges', 'Transport', 'Event & Services', 'Services', 'Incidentals', 'Accommodation'))
                ");

                $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM miscellaneous_catalog WHERE property_id = ? OR property_id = 1");
                $cntStmt->execute([$propertyId]);
                if ($cntStmt->fetchColumn() == 0) {
                    $defaultGuestCharges = [
                        ['label' => 'Extra Bed / Mattress', 'default_amount' => 500.00, 'category' => 'Guest Charges'],
                        ['label' => 'Late Check-out Fee', 'default_amount' => 1000.00, 'category' => 'Guest Charges'],
                        ['label' => 'Early Check-in Fee', 'default_amount' => 500.00, 'category' => 'Guest Charges'],
                        ['label' => 'Airport / Station Pick-up', 'default_amount' => 1500.00, 'category' => 'Transport'],
                        ['label' => 'Airport / Station Drop', 'default_amount' => 1500.00, 'category' => 'Transport'],
                        ['label' => 'Decoration & Event Setup', 'default_amount' => 2000.00, 'category' => 'Event & Services'],
                        ['label' => 'Pet Stay Fee', 'default_amount' => 500.00, 'category' => 'Guest Charges'],
                        ['label' => 'Extra Housekeeping', 'default_amount' => 300.00, 'category' => 'Services'],
                        ['label' => 'Laundry Service', 'default_amount' => 250.00, 'category' => 'Services'],
                        ['label' => 'Room Damage / Replacement', 'default_amount' => 0.00, 'category' => 'Incidentals'],
                        ['label' => 'Miscellaneous Charge', 'default_amount' => 0.00, 'category' => 'Incidentals'],
                    ];
                    $ins = $pdo->prepare("INSERT IGNORE INTO miscellaneous_catalog (property_id, label, default_amount, category, is_system_default) VALUES (?, ?, ?, ?, TRUE)");
                    foreach ($defaultGuestCharges as $chg) {
                        $ins->execute([$propertyId, $chg['label'], $chg['default_amount'], $chg['category']]);
                    }
                }

                $stmt = $pdo->prepare("
                    SELECT id, label, default_amount, category, description, is_system_default
                    FROM miscellaneous_catalog
                    WHERE property_id = ? OR property_id = 1
                    ORDER BY category ASC, label ASC
                ");
                $stmt->execute([$propertyId]);
                $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

                echo json_encode(['status' => 'success', 'data' => $data]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'add_misc_charge_template':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $label = trim($input['label'] ?? '');
                    $amount = $input['default_amount'] ?? $input['defaultAmount'] ?? 0.00;
                    $category = $input['category'] ?? 'Services';
                    $description = $input['description'] ?? '';
                    $id = $input['id'] ?? null;

                    if ($id) {
                        $stmt = $pdo->prepare("
                            UPDATE miscellaneous_catalog SET label = ?, default_amount = ?, category = ?, description = ?
                            WHERE id = ? AND (property_id = ? OR property_id = 1)
                        ");
                        $stmt->execute([$label, $amount, $category, $description, $id, $propertyId]);
                    } else {
                        $stmt = $pdo->prepare("
                            INSERT INTO miscellaneous_catalog (property_id, label, default_amount, category, description)
                            VALUES (?, ?, ?, ?, ?)
                            ON DUPLICATE KEY UPDATE
                            default_amount = VALUES(default_amount), category = VALUES(category), description = VALUES(description)
                        ");
                        $stmt->execute([$propertyId, $label, $amount, $category, $description]);
                    }
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
                    $stmt = $pdo->prepare("DELETE FROM miscellaneous_catalog WHERE (id = ? OR label = ?) AND (property_id = ? OR property_id = 1)");
                    $stmt->execute([$input['id'] ?? null, $input['label'] ?? null, $propertyId]);
                    echo json_encode(['status' => 'success', 'message' => 'Charge template deleted successfully', 'rows_deleted' => $stmt->rowCount()]);
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

                // Step 1: Get all staff members - property_id filter added 11 Aug 2026:
                // this had none at all, so every property's Cash Drawer page listed
                // every active staff member on the entire platform, across every
                // tenant, not just this property's own staff. The per-staff
                // financial calculations below (Steps 2-5) were already correctly
                // property_id-scoped, so this never leaked financial totals across
                // tenants - just exposed who exists (names, roles, usernames) on
                // every other tenant's account.
                $staffStmt = $pdo->prepare("SELECT id, username, full_name, role FROM staff_users WHERE status = 'Active' AND property_id = ? ORDER BY CAST(id AS UNSIGNED) ASC");
                $staffStmt->execute([$propertyId]);
                $staffMembers = $staffStmt->fetchAll(PDO::FETCH_ASSOC);

                $summaries = [];
                foreach ($staffMembers as $s) {
                    $staffId = $s['id'];
                    // BUG (found 14 Aug 2026): this was $s['username'] (the
                    // login, e.g. a phone number) - but every place that
                    // actually WRITES advance_received_by/pending_received_by/
                    // food_received_by/vendor_name (e.g. BookingDetailsModal.tsx's
                    // "Advance Received By" dropdown: `staff.filter(isFinancialHandler)
                    // .map(s => ({ value: s.name, ... }))`) stores the staff
                    // member's full NAME, never their username. Steps 2 and 3
                    // below compare against this value, so they could never
                    // match anyone - "Total Cash Collected" silently showed ₹0
                    // for every property, real or demo, regardless of how much
                    // cash staff had actually collected.
                    $staffName = $s['full_name'] ?: $s['username'];

                    // Step 2: Cash collected from guests (advance + pending + food)
                    // BUG (found 14 Aug 2026): only ever matched the LEGACY
                    // status string ('CheckedOut', no space) - a real checkout
                    // (see guests.php's checkout handler) writes
                    // GUEST_STATUS_CHECKED_OUT ('Checked Out', with a space)
                    // instead, so this has been silently returning 0 for
                    // every property's actual checkouts, not just demo data.
                    // Check both so genuinely-old rows still written with the
                    // legacy value keep counting too.
                    $cashIn = 0;
                    try {
                        $sqlIn = "SELECT
                            COALESCE(SUM(CASE WHEN advance_received_by = :name THEN advance_paid ELSE 0 END), 0) +
                            COALESCE(SUM(CASE WHEN pending_received_by = :name2 THEN pending_amount ELSE 0 END), 0) +
                            COALESCE(SUM(CASE WHEN food_received_by = :name3 THEN total_food ELSE 0 END), 0) as total_cash_in
                             FROM guests WHERE status IN (:status, :status_legacy) AND property_id = :property_id";
                        $stmtIn = $pdo->prepare($sqlIn);
                        $stmtIn->execute([':status' => GUEST_STATUS_CHECKED_OUT, ':status_legacy' => GUEST_STATUS_CHECKEDOUT_LEGACY, ':name' => $staffName, ':name2' => $staffName, ':name3' => $staffName, ':property_id' => $propertyId]);
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
                    ], $propertyId);
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
                ], $propertyId);
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
                ], $propertyId);
                echo json_encode(['status' => 'success', 'id' => $creditId]);
            }
            break;

        case 'get_property_custom_expenses':
            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS `property_custom_expenses` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `property_id` VARCHAR(100) NOT NULL,
                    `label` VARCHAR(255) NOT NULL,
                    `category` VARCHAR(100) NOT NULL,
                    `default_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                    `description` TEXT DEFAULT NULL,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY `idx_prop_label_cat` (`property_id`, `label`, `category`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

                $stmt = $pdo->prepare("SELECT id, label, default_amount, category, description FROM property_custom_expenses WHERE property_id = ? ORDER BY category ASC, label ASC");
                $stmt->execute([$propertyId]);
                $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(['status' => 'success', 'data' => $data]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'add_property_custom_expense':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $label = trim($input['label'] ?? '');
                    $category = trim($input['category'] ?? 'Other');
                    $amount = $input['default_amount'] ?? $input['defaultAmount'] ?? 0.00;
                    $description = trim($input['description'] ?? '');
                    $id = $input['id'] ?? null;

                    if ($label === '') {
                        echo json_encode(['status' => 'error', 'message' => 'Item name is required']);
                        break;
                    }

                    if ($id) {
                        $stmt = $pdo->prepare("UPDATE property_custom_expenses SET label = ?, category = ?, default_amount = ?, description = ? WHERE id = ? AND property_id = ?");
                        $stmt->execute([$label, $category, $amount, $description, $id, $propertyId]);
                    } else {
                        $stmt = $pdo->prepare("INSERT INTO property_custom_expenses (property_id, label, category, default_amount, description) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE category = VALUES(category), default_amount = VALUES(default_amount), description = VALUES(description)");
                        $stmt->execute([$propertyId, $label, $category, $amount, $description]);
                    }
                    echo json_encode(['status' => 'success', 'message' => 'Property custom expense saved successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'delete_property_custom_expense':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("DELETE FROM property_custom_expenses WHERE id = ? AND property_id = ?");
                    $stmt->execute([$input['id'] ?? null, $propertyId]);
                    echo json_encode(['status' => 'success', 'message' => 'Property custom expense deleted successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid finance action']);
            break;
    }
}
