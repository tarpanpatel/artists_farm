<?php
/**
 * Expenses & Cash Drawer Module
 * Function: Petty cash outflows, operational expenses, vendor payments, and desk cash drawer reconciliation.
 */

function handleFinanceRequests($pdo, $request_method, $action) {
    switch ($action) {
        case 'get_petty_cash':
            try {
                $stmt = $pdo->query("SELECT id, expense_date as date, category, description, amount, payment_mode, vendor_name as vendor FROM farm_utility_expenses ORDER BY expense_date DESC");
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
            } catch (PDOException $e) {
                try {
                    $stmt = $pdo->query("SELECT id, date, category, amount, description, vendor_name as vendor FROM petty_cash ORDER BY date DESC");
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
                    $stmt = $pdo->prepare("INSERT INTO farm_utility_expenses (expense_date, category, description, amount, payment_mode, vendor_name) VALUES (?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $input['date'] ?? date('Y-m-d'),
                        $input['category'] ?? 'Other',
                        $input['description'] ?? '',
                        $input['amount'] ?? 0,
                        $input['payment_mode'] ?? 'Cash',
                        $input['vendor'] ?? $input['vendor_name'] ?? 'Manager'
                    ]);
                    $id = $pdo->lastInsertId();
                } catch (PDOException $e) {
                    $id = 'EXP-' . time();
                    $stmt = $pdo->prepare("INSERT INTO petty_cash (id, date, category, amount, description, vendor_name, approved_by) VALUES (?, ?, ?, ?, ?, ?, 'Manager')");
                    $stmt->execute([
                        $id,
                        $input['date'] ?? date('Y-m-d'),
                        $input['category'] ?? 'Other',
                        $input['amount'] ?? 0,
                        $input['description'] ?? '',
                        $input['vendor'] ?? $input['vendor_name'] ?? 'Manager'
                    ]);
                }
                // Save/update latest price for this item
                if (!empty($input['description']) && !empty($input['amount'])) {
                    try {
                        $pdo->exec("CREATE TABLE IF NOT EXISTS `expense_item_prices` (
                            `item_name` VARCHAR(255) PRIMARY KEY,
                            `last_price` DECIMAL(10,2) NOT NULL,
                            `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
                        $stmtPrice = $pdo->prepare("INSERT INTO expense_item_prices (item_name, last_price) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_price = VALUES(last_price)");
                        $stmtPrice->execute([trim($input['description']), $input['amount']]);
                    } catch (PDOException $ePrice) {
                        // ignore price table error
                    }
                }

                echo json_encode(['status' => 'success', 'id' => $id, 'message' => 'Expense outflow recorded']);
            }
            break;

        case 'update_petty_cash':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("UPDATE farm_utility_expenses SET expense_date = ?, category = ?, description = ?, amount = ?, payment_mode = ?, vendor_name = ? WHERE id = ?");
                    $stmt->execute([
                        $input['date'] ?? date('Y-m-d'),
                        $input['category'] ?? 'Other',
                        $input['description'] ?? '',
                        $input['amount'] ?? 0,
                        $input['paymentMode'] ?? $input['payment_mode'] ?? 'Online / UPI / QR',
                        $input['paidBy'] ?? $input['vendor'] ?? 'Manager',
                        $input['id']
                    ]);
                } catch (PDOException $e) {
                    $stmt = $pdo->prepare("UPDATE petty_cash SET date = ?, category = ?, description = ?, amount = ?, vendor_name = ? WHERE id = ?");
                    $stmt->execute([
                        $input['date'] ?? date('Y-m-d'),
                        $input['category'] ?? 'Other',
                        $input['description'] ?? '',
                        $input['amount'] ?? 0,
                        $input['paidBy'] ?? $input['vendor'] ?? 'Manager',
                        $input['id']
                    ]);
                }

                // Update item price tracking
                if (!empty($input['description']) && !empty($input['amount'])) {
                    $pdo->exec("CREATE TABLE IF NOT EXISTS `expense_item_prices` (
                        `item_name` VARCHAR(255) PRIMARY KEY,
                        `last_price` DECIMAL(10,2) NOT NULL,
                        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
                    $stmtPrice = $pdo->prepare("INSERT INTO expense_item_prices (item_name, last_price) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_price = VALUES(last_price)");
                    $stmtPrice->execute([trim($input['description']), $input['amount']]);
                }

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
                try {
                    $stmt = $pdo->prepare("DELETE FROM farm_utility_expenses WHERE id = ?");
                    $stmt->execute([$id]);
                } catch (PDOException $e) {
                    $stmt = $pdo->prepare("DELETE FROM petty_cash WHERE id = ?");
                    $stmt->execute([$id]);
                }
                echo json_encode(['status' => 'success', 'message' => 'Expense entry deleted']);
            }
            break;

        case 'get_expense_item_prices':
            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS `expense_item_prices` (
                    `item_name` VARCHAR(255) PRIMARY KEY,
                    `last_price` DECIMAL(10,2) NOT NULL,
                    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                $stmt = $pdo->query("SELECT item_name, last_price FROM expense_item_prices");
                $prices = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
                echo json_encode(['status' => 'success', 'data' => $prices]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'get_expense_items':
            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS `expense_items` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `item_name` VARCHAR(255) NOT NULL UNIQUE,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

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
                    $ins = $pdo->prepare("INSERT IGNORE INTO expense_items (item_name) VALUES (?)");
                    foreach ($seed as $name) {
                        $ins->execute([$name]);
                    }
                }

                $stmt = $pdo->query("SELECT id, item_name, created_at FROM expense_items ORDER BY item_name ASC");
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
                    $pdo->exec("CREATE TABLE IF NOT EXISTS `expense_items` (
                        `id` INT AUTO_INCREMENT PRIMARY KEY,
                        `item_name` VARCHAR(255) NOT NULL UNIQUE,
                        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
                    $stmt = $pdo->prepare("INSERT INTO expense_items (item_name) VALUES (?)");
                    $stmt->execute([$name]);
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
                    $stmt = $pdo->prepare("DELETE FROM expense_items WHERE id = ? OR item_name = ?");
                    $stmt->execute([$input['id'] ?? null, $input['item_name'] ?? $input['name'] ?? null]);
                    echo json_encode(['status' => 'success', 'message' => 'Item deleted']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'get_misc_catalog':
            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS `miscellaneous_catalog` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `label` VARCHAR(255) NOT NULL UNIQUE,
                    `default_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                    `category` VARCHAR(100) NOT NULL DEFAULT 'Incidentals',
                    `description` TEXT,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                $count = $pdo->query("SELECT COUNT(*) FROM miscellaneous_catalog")->fetchColumn();
                if ((int)$count === 0) {
                    $seed = [
                        ['Pet Stay Fees', 500.00, 'Accommodation', 'Charges for pet accommodation per night'],
                        ['Decoration Fees', 1500.00, 'Events', 'Room or venue decoration setup charges'],
                        ['Extra Housekeeping', 300.00, 'Service', 'Additional housekeeping beyond standard schedule'],
                        ['Extra Cleaning', 300.00, 'Service', 'Deep cleaning or special cleaning requests'],
                        ['Laundry Service', 200.00, 'Service', 'Express laundry and pressing service'],
                        ['Late Checkout', 500.00, 'Accommodation', 'Checkout beyond standard time slot'],
                        ['Mini Bar Restock', 350.00, 'Incidentals', 'Restocking of mini bar items'],
                        ['Misc', 0.00, 'Incidentals', 'Miscellaneous charges'],
                    ];
                    $ins = $pdo->prepare("INSERT IGNORE INTO miscellaneous_catalog (label, default_amount, category, description) VALUES (?, ?, ?, ?)");
                    foreach ($seed as $row) {
                        $ins->execute($row);
                    }
                }

                $stmt = $pdo->query("SELECT id, label, default_amount, category, description FROM miscellaneous_catalog ORDER BY label ASC");
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'add_misc_charge_template':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $pdo->exec("CREATE TABLE IF NOT EXISTS `miscellaneous_catalog` (
                        `id` INT AUTO_INCREMENT PRIMARY KEY,
                        `label` VARCHAR(255) NOT NULL UNIQUE,
                        `default_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                        `category` VARCHAR(100) NOT NULL DEFAULT 'Incidentals',
                        `description` TEXT,
                        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                    $stmt = $pdo->prepare("INSERT INTO miscellaneous_catalog (label, default_amount, category, description) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE default_amount = VALUES(default_amount), category = VALUES(category), description = VALUES(description)");
                    $stmt->execute([
                        trim($input['label']),
                        $input['default_amount'] ?? $input['defaultAmount'] ?? 0.00,
                        $input['category'] ?? 'Incidentals',
                        $input['description'] ?? ''
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
                    $stmt = $pdo->prepare("DELETE FROM miscellaneous_catalog WHERE id = ? OR label = ?");
                    $stmt->execute([$input['id'] ?? null, $input['label'] ?? null]);
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
                $pdo->exec("CREATE TABLE IF NOT EXISTS `cash_drawer_entries` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `staff_id` VARCHAR(50) NOT NULL,
                    `staff_name` VARCHAR(150) NOT NULL,
                    `type` ENUM('handover','market_expense','manual_adjustment') NOT NULL,
                    `amount` DECIMAL(10,2) NOT NULL,
                    `handed_to` VARCHAR(150) DEFAULT NULL,
                    `notes` TEXT DEFAULT NULL,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

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
                            FROM guests WHERE status = 'CheckedOut'";
                        $stmtIn = $pdo->prepare($sqlIn);
                        $stmtIn->execute([':name' => $staffName, ':name2' => $staffName, ':name3' => $staffName]);
                        $cashIn = (float)$stmtIn->fetchColumn();
                    } catch (PDOException $e) {}

                    // Step 3: Cash expenses paid by this staff member
                    $cashOut = 0;
                    try {
                        $stmtOut = $pdo->prepare("SELECT COALESCE(SUM(amount), 0) FROM farm_utility_expenses WHERE vendor_name = ? AND payment_mode = 'Cash'");
                        $stmtOut->execute([$staffName]);
                        $cashOut = (float)$stmtOut->fetchColumn();
                    } catch (PDOException $e) {}

                    // Step 4: Handovers and adjustments from cash_drawer_entries
                    $handoverTotal = 0;
                    $adjustmentTotal = 0;
                    $marketExpenseTotal = 0;
                    try {
                        $stmtHand = $pdo->prepare("SELECT type, COALESCE(SUM(amount), 0) as total FROM cash_drawer_entries WHERE staff_id = ? GROUP BY type");
                        $stmtHand->execute([$staffId]);
                        $rows = $stmtHand->fetchAll(PDO::FETCH_ASSOC);
                        foreach ($rows as $r) {
                            if ($r['type'] === 'handover') $handoverTotal = (float)$r['total'];
                            if ($r['type'] === 'manual_adjustment') $adjustmentTotal = (float)$r['total'];
                            if ($r['type'] === 'market_expense') $marketExpenseTotal = (float)$r['total'];
                        }
                    } catch (PDOException $e) {}

                    $netBalance = $cashIn - $cashOut - $handoverTotal - $marketExpenseTotal + $adjustmentTotal;

                    $summaries[] = [
                        'staffId' => $staffId,
                        'staffName' => $s['full_name'] ?: $staffName,
                        'username' => $staffName,
                        'role' => $s['role'],
                        'cashCollected' => round($cashIn, 2),
                        'cashExpenses' => round($cashOut, 2),
                        'drawerHandovers' => round($handoverTotal, 2),
                        'marketExpenses' => round($marketExpenseTotal, 2),
                        'manualAdjustments' => round($adjustmentTotal, 2),
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
                    $pdo->exec("CREATE TABLE IF NOT EXISTS `cash_drawer_entries` (
                        `id` INT AUTO_INCREMENT PRIMARY KEY,
                        `staff_id` VARCHAR(50) NOT NULL,
                        `staff_name` VARCHAR(150) NOT NULL,
                        `type` ENUM('handover','market_expense','manual_adjustment') NOT NULL,
                        `amount` DECIMAL(10,2) NOT NULL,
                        `handed_to` VARCHAR(150) DEFAULT NULL,
                        `notes` TEXT DEFAULT NULL,
                        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                    $stmt = $pdo->prepare("INSERT INTO cash_drawer_entries (staff_id, staff_name, type, amount, handed_to, notes) VALUES (?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $input['staff_id'] ?? '',
                        $input['staff_name'] ?? '',
                        $input['type'] ?? 'handover',
                        $input['amount'] ?? 0,
                        $input['handed_to'] ?? null,
                        $input['notes'] ?? null,
                    ]);
                    $newId = $pdo->lastInsertId();
                    echo json_encode(['status' => 'success', 'id' => $newId, 'message' => 'Cash drawer entry recorded']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'get_drawer_entries':
            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS `cash_drawer_entries` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `staff_id` VARCHAR(50) NOT NULL,
                    `staff_name` VARCHAR(150) NOT NULL,
                    `type` ENUM('handover','market_expense','manual_adjustment') NOT NULL,
                    `amount` DECIMAL(10,2) NOT NULL,
                    `handed_to` VARCHAR(150) DEFAULT NULL,
                    `notes` TEXT DEFAULT NULL,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                $stmt = $pdo->query("SELECT * FROM cash_drawer_entries ORDER BY created_at DESC");
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'success', 'data' => []]);
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid finance action']);
            break;
    }
}
