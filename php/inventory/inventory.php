<?php
/**
 * Stock & Requisitions Log Module
 * Function: Requisitions, warehouse stock fulfillment, deficit shortfalls, and kitchen purchase tracking.
 */

function handleInventoryRequests($pdo, $request_method, $action) {
    switch ($action) {
        case 'get_inventory':
            try {
                // Try req_catalog first (full catalog with categories)
                $sql = "SELECT r.id, r.item_name as name, r.category_id, COALESCE(c.name, 'General') as category, r.current_stock as quantity, r.unit_label as unit 
                        FROM req_catalog r 
                        LEFT JOIN material_categories c ON r.category_id = c.id 
                        ORDER BY r.item_name ASC";
                $stmt = $pdo->query($sql);
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
            } catch (PDOException $e) {
                try {
                    // Fallback to inventory_items table
                    $sql = "SELECT id, name, category, quantity, unit FROM inventory_items ORDER BY name ASC";
                    $stmt = $pdo->query($sql);
                    echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
                } catch (PDOException $e2) {
                    // Auto-create req_catalog table if both are missing
                    $pdo->exec("CREATE TABLE IF NOT EXISTS `req_catalog` (
                        `id` INT AUTO_INCREMENT PRIMARY KEY,
                        `item_name` VARCHAR(255) NOT NULL,
                        `category_id` INT DEFAULT 1,
                        `current_stock` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                        `unit_label` VARCHAR(20) NOT NULL DEFAULT 'Kg'
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                    $stmt = $pdo->query("SELECT id, item_name as name, 'General' as category, current_stock as quantity, unit_label as unit FROM req_catalog ORDER BY item_name ASC");
                    echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
                }
            }
            break;

        case 'update_stock':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("UPDATE req_catalog SET current_stock = ? WHERE id = ?");
                    $stmt->execute([$input['quantity'], $input['id']]);
                } catch (PDOException $e) {
                    $stmt = $pdo->prepare("UPDATE inventory_items SET quantity = ? WHERE id = ?");
                    $stmt->execute([$input['quantity'], $input['id']]);
                }
                echo json_encode(['status' => 'success', 'message' => 'Stock quantity updated']);
            }
            break;

        case 'get_stock_requests':
            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS `stock_requisitions` (
                    `id` VARCHAR(50) PRIMARY KEY,
                    `status` VARCHAR(50) NOT NULL DEFAULT 'PENDING',
                    `date` VARCHAR(100) NOT NULL,
                    `items` JSON NOT NULL,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                // Seed default data if empty
                $count = $pdo->query("SELECT COUNT(*) FROM stock_requisitions")->fetchColumn();
                if ($count == 0) {
                    $pdo->exec("INSERT INTO `stock_requisitions` (`id`, `status`, `date`, `items`) VALUES
                        ('1166', 'PENDING', '21 Jul 2026 - 10:21 PM', '[\"Green Pea (x1 Kg)\", \"Hari Mirchi (x1 Kg)\"]'),
                        ('1165', 'PENDING', '21 Jul 2026 - 09:05 PM', '[\"Black Pepper (x1 Pcs)\", \"Basmati Rice (x1 Pc)\"]'),
                        ('1164', 'PENDING', '21 Jul 2026 - 08:53 PM', '[\"Ajino Moto (x1 Gm)\"]')");
                }

                $stmt = $pdo->query("SELECT id, status, date, items FROM stock_requisitions ORDER BY CAST(id AS UNSIGNED) DESC, created_at DESC");
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($rows as &$row) {
                    $row['items'] = json_decode($row['items'], true) ?: [];
                }
                echo json_encode(['status' => 'success', 'data' => $rows]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'create_stock_request':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("INSERT INTO stock_requisitions (id, status, date, items) VALUES (?, ?, ?, ?)");
                    $stmt->execute([
                        $input['id'],
                        $input['status'] ?? 'PENDING',
                        $input['date'],
                        json_encode($input['items'] ?? [])
                    ]);
                    echo json_encode(['status' => 'success', 'message' => 'Stock request created']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'update_stock_request_status':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $itemsArr = array_values(array_filter($input['items'] ?? [], function($v) { return !empty($v); }));
                    if (!empty($itemsArr)) {
                        $stmt = $pdo->prepare("UPDATE stock_requisitions SET status = ?, items = ? WHERE id = ?");
                        $stmt->execute([
                            $input['status'],
                            json_encode($itemsArr),
                            $input['id']
                        ]);
                    } else {
                        $stmt = $pdo->prepare("UPDATE stock_requisitions SET status = ? WHERE id = ?");
                        $stmt->execute([
                            $input['status'],
                            $input['id']
                        ]);
                    }
                    echo json_encode(['status' => 'success', 'message' => 'Stock request updated in MySQL']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'get_wastage_logs':
            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS `kitchen_wastage_logs` (
                    `id` VARCHAR(50) PRIMARY KEY,
                    `date` VARCHAR(50) NOT NULL,
                    `item_name` VARCHAR(255) NOT NULL,
                    `wasted_qty` DECIMAL(10,2) NOT NULL,
                    `unit` VARCHAR(20) NOT NULL,
                    `reason` VARCHAR(100) NOT NULL,
                    `reported_by` VARCHAR(100) NOT NULL,
                    `notes` TEXT,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                $stmt = $pdo->query("SELECT id, date, item_name as itemName, wasted_qty as wastedQty, unit, reason, reported_by as reportedBy, notes FROM kitchen_wastage_logs ORDER BY created_at DESC");
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'create_wastage_log':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("INSERT INTO kitchen_wastage_logs (id, date, item_name, wasted_qty, unit, reason, reported_by, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $input['id'],
                        $input['date'] ?? date('Y-m-d'),
                        $input['itemName'],
                        $input['wastedQty'],
                        $input['unit'] ?? 'Kg',
                        $input['reason'],
                        $input['reportedBy'],
                        $input['notes'] ?? ''
                    ]);
                    echo json_encode(['status' => 'success', 'message' => 'Wastage log recorded']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'get_kitchen_purchases':
            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS `kitchen_purchases_log` (
                    `id` VARCHAR(50) PRIMARY KEY,
                    `purchase_date` VARCHAR(50) NOT NULL,
                    `item_name` VARCHAR(255) NOT NULL,
                    `specification` VARCHAR(255) DEFAULT 'N/A',
                    `quantity` DECIMAL(10,3) NOT NULL,
                    `unit` VARCHAR(20) NOT NULL,
                    `total_price` DECIMAL(10,2) NOT NULL,
                    `unit_cost` DECIMAL(10,2) NOT NULL,
                    `recorded_by` VARCHAR(100) NOT NULL,
                    `vendor_name` VARCHAR(100) DEFAULT 'Unassigned Vendor',
                    `settlement_status` VARCHAR(50) NOT NULL DEFAULT 'Unpaid',
                    `settlement_method` VARCHAR(100) DEFAULT 'Farm Cash',
                    `paid_by_staff` VARCHAR(100) DEFAULT '',
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                $pdo->exec("CREATE TABLE IF NOT EXISTS `inventory_price_history` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `item_name` VARCHAR(255) NOT NULL,
                    `unit_cost` DECIMAL(10,2) NOT NULL,
                    `purchase_date` VARCHAR(50) NOT NULL,
                    `recorded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                $pdo->exec("CREATE TABLE IF NOT EXISTS `staff_advances` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `staff_name` VARCHAR(100) NOT NULL,
                    `amount` DECIMAL(10,2) NOT NULL,
                    `reason` TEXT,
                    `date` VARCHAR(50) NOT NULL,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                $stmt = $pdo->query("SELECT id, purchase_date as purchaseDate, item_name as itemName, specification, quantity, unit, total_price as totalPrice, unit_cost as unitCost, recorded_by as recordedBy, vendor_name as vendorName, settlement_status as settlementStatus, settlement_method as settlementMethod, paid_by_staff as paidByStaff FROM kitchen_purchases_log ORDER BY created_at DESC");
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'create_kitchen_purchase':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $pdo->exec("CREATE TABLE IF NOT EXISTS `kitchen_purchases_log` (
                        `id` VARCHAR(50) PRIMARY KEY,
                        `purchase_date` VARCHAR(50) NOT NULL,
                        `item_name` VARCHAR(255) NOT NULL,
                        `specification` VARCHAR(255) DEFAULT 'N/A',
                        `quantity` DECIMAL(10,3) NOT NULL,
                        `unit` VARCHAR(20) NOT NULL,
                        `total_price` DECIMAL(10,2) NOT NULL,
                        `unit_cost` DECIMAL(10,2) NOT NULL,
                        `recorded_by` VARCHAR(100) NOT NULL,
                        `vendor_name` VARCHAR(100) DEFAULT 'Unassigned Vendor',
                        `settlement_status` VARCHAR(50) NOT NULL DEFAULT 'Unpaid',
                        `settlement_method` VARCHAR(100) DEFAULT 'Farm Cash',
                        `paid_by_staff` VARCHAR(100) DEFAULT '',
                        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                    $pdo->exec("CREATE TABLE IF NOT EXISTS `inventory_price_history` (
                        `id` INT AUTO_INCREMENT PRIMARY KEY,
                        `item_name` VARCHAR(255) NOT NULL,
                        `unit_cost` DECIMAL(10,2) NOT NULL,
                        `purchase_date` VARCHAR(50) NOT NULL,
                        `recorded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                    $stmt = $pdo->prepare("INSERT INTO kitchen_purchases_log (id, purchase_date, item_name, specification, quantity, unit, total_price, unit_cost, recorded_by, vendor_name, settlement_status, settlement_method, paid_by_staff) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $input['id'],
                        $input['purchaseDate'],
                        $input['itemName'],
                        $input['specification'] ?? 'N/A',
                        $input['quantity'],
                        $input['unit'],
                        $input['totalPrice'],
                        $input['unitCost'],
                        $input['recordedBy'],
                        $input['vendorName'] ?? 'Unassigned Vendor',
                        $input['settlementStatus'] ?? 'Unpaid',
                        $input['settlementMethod'] ?? 'Farm Cash',
                        $input['paidByStaff'] ?? ''
                    ]);

                    // Sync Master Catalog unit_cost in req_catalog if exists
                    try {
                        $stmtCat = $pdo->prepare("UPDATE req_catalog SET current_stock = current_stock + ? WHERE LOWER(item_name) = LOWER(?)");
                        $stmtCat->execute([$input['quantity'], $input['itemName']]);
                    } catch (PDOException $e2) {}

                    // Historical record in inventory_price_history
                    try {
                        $stmtHist = $pdo->prepare("INSERT INTO inventory_price_history (item_name, unit_cost, purchase_date) VALUES (?, ?, ?)");
                        $stmtHist->execute([$input['itemName'], $input['unitCost'], $input['purchaseDate']]);
                    } catch (PDOException $eHist) {}

                    echo json_encode(['status' => 'success', 'message' => 'Kitchen purchase logged & synced with Master Catalog']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'bulk_update_kitchen_purchases':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $ids = $input['ids'] ?? [];
                try {
                    if (!empty($input['vendorName']) && !empty($ids)) {
                        $placeholders = implode(',', array_fill(0, count($ids), '?'));
                        $stmt = $pdo->prepare("UPDATE kitchen_purchases_log SET vendor_name = ? WHERE id IN ($placeholders)");
                        $stmt->execute(array_merge([$input['vendorName']], $ids));
                    }

                    if (!empty($input['markPaid']) && !empty($ids)) {
                        $placeholders = implode(',', array_fill(0, count($ids), '?'));
                        $stmt = $pdo->prepare("UPDATE kitchen_purchases_log SET settlement_status = 'Paid', settlement_method = ?, paid_by_staff = ? WHERE id IN ($placeholders)");
                        $stmt->execute(array_merge([$input['settlementMethod'] ?? 'Farm Cash', $input['paidByStaff'] ?? ''], $ids));

                        // If Out of Pocket by Staff -> insert negative advance entry in staff_advances (reimbursement math credit)
                        if (($input['settlementMethod'] ?? '') === 'Paid Out of Pocket' && !empty($input['paidByStaff'])) {
                            $stmtAdv = $pdo->prepare("INSERT INTO staff_advances (staff_name, amount, reason, date) VALUES (?, ?, ?, ?)");
                            $stmtAdv->execute([
                                $input['paidByStaff'],
                                -abs($input['totalAmount'] ?? 0),
                                "Reimbursement credit for Out-of-Pocket kitchen purchase (" . count($ids) . " items)",
                                date('Y-m-d')
                            ]);
                        }
                    }

                    echo json_encode(['status' => 'success', 'message' => 'Purchases bulk updated']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'delete_kitchen_purchase':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmtDel = $pdo->prepare("DELETE FROM kitchen_purchases_log WHERE id = ?");
                    $stmtDel->execute([$input['id']]);

                    // Immutable Audit Log trace
                    try {
                        $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (timestamp, user, action) VALUES (?, ?, ?)");
                        $stmtAudit->execute([
                            date('Y-m-d H:i:s'),
                            $input['user'] ?? 'Admin',
                            "Deleted Kitchen Purchase record #" . $input['id'] . " (" . ($input['itemName'] ?? 'Item') . ")"
                        ]);
                    } catch (PDOException $ea) {}

                    echo json_encode(['status' => 'success', 'message' => 'Kitchen purchase record deleted and audit logged']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'get_material_categories':
            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS `material_categories` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `name` VARCHAR(100) NOT NULL,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                // Ensure UNIQUE constraint exists (add if missing from old schema)
                try { $pdo->exec("ALTER TABLE `material_categories` ADD UNIQUE INDEX IF NOT EXISTS `uniq_cat_name` (`name`)"); } catch (PDOException $e) {}

                // Clean up any existing duplicates (keep lowest ID)
                $pdo->exec("DELETE t1 FROM material_categories t1 INNER JOIN material_categories t2 WHERE t1.name = t2.name AND t1.id > t2.id");

                // Seed only if table is empty
                $count = $pdo->query("SELECT COUNT(*) FROM material_categories")->fetchColumn();
                if ((int)$count === 0) {
                    $seed = [
                        'Bakery','Beverages & Breakfast','Chinese & Continental Sauces','Crockery & Cutlery',
                        'Dairy','Flours & Grains','Frozen / Cold','Fruits & Desserts',
                        'Housekeeping & Disposables','Kitchen Appliance Repairs','Lentils & Pulses',
                        'Non Veg','Oils & Dairy Staples','Sauce','Spices & Seasonings',
                        'Vegetables & Fresh Produce'
                    ];
                    $ins = $pdo->prepare("INSERT IGNORE INTO material_categories (name) VALUES (?)");
                    foreach ($seed as $name) {
                        $ins->execute([$name]);
                    }
                }

                $stmt = $pdo->query("SELECT id, name FROM material_categories ORDER BY name ASC");
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'update_material_category':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $newName = trim($input['name'] ?? '');
                $id = $input['id'] ?? null;
                if (empty($newName) || empty($id)) {
                    echo json_encode(['status' => 'error', 'message' => 'id and name are required']);
                    break;
                }
                try {
                    $stmt = $pdo->prepare("UPDATE material_categories SET name = ? WHERE id = ?");
                    $stmt->execute([$newName, $id]);
                    echo json_encode(['status' => 'success', 'message' => 'Category renamed']);
                } catch (PDOException $e) {
                    if ($e->getCode() == 23000) {
                        echo json_encode(['status' => 'error', 'message' => 'Category name already exists']);
                    } else {
                        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                    }
                }
            }
            break;

        case 'delete_material_category':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("DELETE FROM material_categories WHERE id = ?");
                    $stmt->execute([$input['id']]);
                    echo json_encode(['status' => 'success', 'message' => 'Category deleted']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'add_material_category':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $name = trim($input['name'] ?? '');
                if (empty($name)) {
                    echo json_encode(['status' => 'error', 'message' => 'Category name is required']);
                    break;
                }
                try {
                    $pdo->exec("CREATE TABLE IF NOT EXISTS `material_categories` (
                        `id` INT AUTO_INCREMENT PRIMARY KEY,
                        `name` VARCHAR(100) NOT NULL UNIQUE,
                        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
                    $stmt = $pdo->prepare("INSERT INTO material_categories (name) VALUES (?)");
                    $stmt->execute([$name]);
                    echo json_encode(['status' => 'success', 'id' => $pdo->lastInsertId(), 'message' => 'Category added']);
                } catch (PDOException $e) {
                    if ($e->getCode() == 23000) {
                        echo json_encode(['status' => 'error', 'message' => 'Category already exists']);
                    } else {
                        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                    }
                }
            }
            break;

        case 'add_catalog_item':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $name = trim($input['name'] ?? '');
                $categoryName = trim($input['category'] ?? 'General');
                $price = floatval($input['price'] ?? 0);
                $packSize = floatval($input['packSize'] ?? 1);
                $unit = trim($input['unit'] ?? 'Kg');
                if (empty($name)) {
                    echo json_encode(['status' => 'error', 'message' => 'Item name is required']);
                    break;
                }
                try {
                    $pdo->exec("CREATE TABLE IF NOT EXISTS `req_catalog` (
                        `id` INT AUTO_INCREMENT PRIMARY KEY,
                        `item_name` VARCHAR(255) NOT NULL,
                        `category_id` INT DEFAULT 1,
                        `current_stock` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                        `unit_label` VARCHAR(20) NOT NULL DEFAULT 'Kg'
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                    // Resolve category_id from material_categories
                    $catId = 1;
                    if ($categoryName && $categoryName !== 'General') {
                        $stmtCat = $pdo->prepare("SELECT id FROM material_categories WHERE name = ?");
                        $stmtCat->execute([$categoryName]);
                        $rowCat = $stmtCat->fetch(PDO::FETCH_ASSOC);
                        if ($rowCat) {
                            $catId = $rowCat['id'];
                        } else {
                            $insCat = $pdo->prepare("INSERT INTO material_categories (name) VALUES (?)");
                            $insCat->execute([$categoryName]);
                            $catId = $pdo->lastInsertId();
                        }
                    }

                    $stmtIns = $pdo->prepare("INSERT INTO req_catalog (item_name, category_id, current_stock, unit_label) VALUES (?, ?, ?, ?)");
                    $stmtIns->execute([$name, $catId, 0, $unit]);

                    echo json_encode(['status' => 'success', 'id' => $pdo->lastInsertId(), 'message' => 'Catalog item registered']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'update_catalog_item':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $id = intval($input['id'] ?? 0);
                $name = trim($input['name'] ?? '');
                $categoryName = trim($input['category'] ?? 'General');
                $price = floatval($input['price'] ?? 0);
                $unit = trim($input['unit'] ?? 'Kg');
                if (!$id || empty($name)) {
                    echo json_encode(['status' => 'error', 'message' => 'Item id and name are required']);
                    break;
                }
                try {
                    $catId = 1;
                    if ($categoryName && $categoryName !== 'General') {
                        $stmtCat = $pdo->prepare("SELECT id FROM material_categories WHERE name = ?");
                        $stmtCat->execute([$categoryName]);
                        $rowCat = $stmtCat->fetch(PDO::FETCH_ASSOC);
                        if ($rowCat) {
                            $catId = $rowCat['id'];
                        } else {
                            $insCat = $pdo->prepare("INSERT INTO material_categories (name) VALUES (?)");
                            $insCat->execute([$categoryName]);
                            $catId = $pdo->lastInsertId();
                        }
                    }
                    $stmtUp = $pdo->prepare("UPDATE req_catalog SET item_name = ?, category_id = ?, unit_label = ? WHERE id = ?");
                    $stmtUp->execute([$name, $catId, $unit, $id]);
                    echo json_encode(['status' => 'success', 'message' => 'Catalog item updated']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'bulk_update_catalog_category':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $ids = $input['ids'] ?? [];
                $categoryName = trim($input['category'] ?? 'General');
                if (empty($ids)) {
                    echo json_encode(['status' => 'error', 'message' => 'No items selected']);
                    break;
                }
                try {
                    $catId = 1;
                    if ($categoryName && $categoryName !== 'General') {
                        $stmtCat = $pdo->prepare("SELECT id FROM material_categories WHERE name = ?");
                        $stmtCat->execute([$categoryName]);
                        $rowCat = $stmtCat->fetch(PDO::FETCH_ASSOC);
                        if ($rowCat) {
                            $catId = $rowCat['id'];
                        } else {
                            $insCat = $pdo->prepare("INSERT INTO material_categories (name) VALUES (?)");
                            $insCat->execute([$categoryName]);
                            $catId = $pdo->lastInsertId();
                        }
                    }
                    $placeholders = implode(',', array_fill(0, count($ids), '?'));
                    $stmtUp = $pdo->prepare("UPDATE req_catalog SET category_id = ? WHERE id IN ($placeholders)");
                    $stmtUp->execute(array_merge([$catId], $ids));
                    echo json_encode(['status' => 'success', 'message' => 'Categories updated successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'seed_catalog':
            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS `req_catalog` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `item_name` VARCHAR(255) NOT NULL,
                    `category_id` INT DEFAULT 1,
                    `current_stock` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                    `unit_label` VARCHAR(20) NOT NULL DEFAULT 'Kg'
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
                $pdo->exec("CREATE TABLE IF NOT EXISTS `material_categories` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `name` VARCHAR(100) NOT NULL,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
                try { $pdo->exec("ALTER TABLE `material_categories` ADD UNIQUE INDEX IF NOT EXISTS `uniq_cat_name` (`name`)"); } catch (PDOException $e) {}

                $desiredCategories = [
                    1  => 'Spices & Seasonings',
                    2  => 'Flours & Grains',
                    3  => 'Lentils & Pulses',
                    4  => 'Oils & Dairy Staples',
                    5  => 'Vegetables & Fresh Produce',
                    6  => 'Fruits & Desserts',
                    7  => 'Chinese & Continental Sauces',
                    8  => 'Beverages & Breakfast',
                    9  => 'Housekeeping & Disposables',
                    10 => 'Dairy',
                    11 => 'Bakery',
                    12 => 'Frozen / Cold',
                    13 => 'Sauce',
                    14 => 'Non Veg',
                    15 => 'Vegetables',
                    16 => 'Crockery & Cutlery',
                    17 => 'Disposables',
                    18 => 'Kitchen Appliance Repairs',
                ];

                $catNameToId = [];
                foreach ($desiredCategories as $desiredId => $catName) {
                    $byName = $pdo->prepare("SELECT id FROM material_categories WHERE name = ?");
                    $byName->execute([$catName]);
                    $existingByName = $byName->fetch(PDO::FETCH_ASSOC);
                    if ($existingByName) {
                        $catNameToId[$catName] = $existingByName['id'];
                        continue;
                    }
                    $byId = $pdo->prepare("SELECT id FROM material_categories WHERE id = ?");
                    $byId->execute([$desiredId]);
                    $existingById = $byId->fetch(PDO::FETCH_ASSOC);
                    if ($existingById) {
                        $ins = $pdo->prepare("INSERT INTO material_categories (name) VALUES (?)");
                        $ins->execute([$catName]);
                        $catNameToId[$catName] = $pdo->lastInsertId();
                    } else {
                        $ins = $pdo->prepare("INSERT INTO material_categories (id, name) VALUES (?, ?)");
                        $ins->execute([$desiredId, $catName]);
                        $catNameToId[$catName] = $desiredId;
                    }
                }

                $catalogItems = [
                    ['Aachar', 'Spices & Seasonings', 'Kg'], ['Ajino Moto', 'Spices & Seasonings', 'Gm'], ['Chhola Masala', 'Spices & Seasonings', 'Kg'],
                    ['Dalchini', 'Spices & Seasonings', 'Gms'], ['Degi Mirchi Powder', 'Spices & Seasonings', 'Kg'], ['Dhaniya', 'Spices & Seasonings', 'Kg'],
                    ['Dhaniya Powder', 'Spices & Seasonings', 'Kg'], ['Doda Elaichi', 'Spices & Seasonings', 'Kg'], ['Haldi', 'Spices & Seasonings', 'Kg'],
                    ['Jeera', 'Spices & Seasonings', 'Kg'], ['Mirchi', 'Spices & Seasonings', 'Kg'], ['Mirchi Red', 'Spices & Seasonings', 'Kg'],
                    ['Mix Aachar', 'Spices & Seasonings', 'Kg'], ['Salt', 'Spices & Seasonings', 'Kg'], ['Strawberries', 'Spices & Seasonings', 'Packets'],
                    ['Chiku', 'Spices & Seasonings', 'Packets'], ['Amla', 'Spices & Seasonings', 'Packets'], ['Ragi Flour', 'Spices & Seasonings', 'Gm'],
                    ['Jwar Atta', 'Spices & Seasonings', 'Packets'], ['White Flour', 'Spices & Seasonings', 'Packets'], ['oats', 'Spices & Seasonings', 'Packets'],
                    ['Mirch Powder', 'Spices & Seasonings', 'Pcs'], ['Jeera powder', 'Spices & Seasonings', 'Pcs'], ['Garam Masala', 'Spices & Seasonings', 'Pcs'],
                    ['Black Pepper', 'Spices & Seasonings', 'Pcs'], ['Kitchen king Masala', 'Spices & Seasonings', 'Pcs'], ['Chat Masala', 'Spices & Seasonings', 'Pcs'],
                    ['Chilli flake', 'Spices & Seasonings', 'Gms'], ['Tea Masala', 'Spices & Seasonings', 'Pcs'], ['Basmati Rice', 'Spices & Seasonings', 'Pc'],
                    ['LPG Gas Cylinder', 'Spices & Seasonings', 'Pc'],
                    ['Atta', 'Flours & Grains', 'Kg'], ['Bajara Atta', 'Flours & Grains', 'Kg'], ['Basan', 'Flours & Grains', 'Kg'],
                    ['Guest Rice', 'Flours & Grains', 'Kg'], ['Maida', 'Flours & Grains', 'Kg'], ['Poha', 'Flours & Grains', 'Kg'],
                    ['Staff Rice', 'Flours & Grains', 'Kg'], ['Black Flour', 'Flours & Grains', 'Kg'], ['papad', 'Flours & Grains', 'Packets'],
                    ['Corn flour', 'Flours & Grains', 'Kg'], ['Sev tomato', 'Flours & Grains', 'Kg'],
                    ['Masoor Dal', 'Lentils & Pulses', 'Kg'], ['Moong Mogar Dal', 'Lentils & Pulses', 'Kg'], ['Urad Dal', 'Lentils & Pulses', 'Kg'],
                    ['Moong dal', 'Lentils & Pulses', 'Kg'], ['Chana dal', 'Lentils & Pulses', 'Kg'], ['Arhar dal', 'Lentils & Pulses', 'Kg'],
                    ['Cheese', 'Oils & Dairy Staples', 'Kg'], ['Cream', 'Oils & Dairy Staples', 'Kg'], ['Diced Cheese', 'Oils & Dairy Staples', 'Kg'],
                    ['Mustard Oil', 'Oils & Dairy Staples', 'Liter'], ['Oil', 'Oils & Dairy Staples', 'Kg'], ['Slice Cheese', 'Oils & Dairy Staples', 'Kg'],
                    ['Garlic Chila Huaa', 'Vegetables & Fresh Produce', 'Kg'], ['Gobhi', 'Vegetables & Fresh Produce', 'Kg'], ['Green Mirchi Small', 'Vegetables & Fresh Produce', 'Kg'],
                    ['Green Pea', 'Vegetables & Fresh Produce', 'Kg'], ['Hari Mirchi', 'Vegetables & Fresh Produce', 'Kg'], ['Mint', 'Vegetables & Fresh Produce', 'Kg'],
                    ['Shimla Mirch Red', 'Vegetables & Fresh Produce', 'Kg'],
                    ['Apple', 'Fruits & Desserts', 'Kg'], ['Banana', 'Fruits & Desserts', 'Doz'], ['Coconut Powder', 'Fruits & Desserts', 'Kg'],
                    ['Gulab Jamun', 'Fruits & Desserts', 'Kg'], ['Jam Jam', 'Fruits & Desserts', 'Kg'], ['Oranges', 'Fruits & Desserts', 'Kg'],
                    ['Mango', 'Fruits & Desserts', 'Pcs'], ['Papaya', 'Fruits & Desserts', 'Pcs'], ['Watermelon', 'Fruits & Desserts', 'Pcs'],
                    ['Bread Crumb', 'Chinese & Continental Sauces', 'Kg'], ['Chocolate Sauce', 'Chinese & Continental Sauces', 'Kg'], ['Noodles', 'Chinese & Continental Sauces', 'Kg'],
                    ['Pizza Cheese', 'Chinese & Continental Sauces', 'Kg'], ['Thousand Sauce', 'Chinese & Continental Sauces', 'Kg'], ['Maggi', 'Chinese & Continental Sauces', 'Box'],
                    ['Aarmant', 'Beverages & Breakfast', 'Kg'], ['Biscuit', 'Beverages & Breakfast', 'Kg'], ['Bowl', 'Beverages & Breakfast', 'Kg'],
                    ['Fish', 'Beverages & Breakfast', 'Kg'], ['Kaju', 'Beverages & Breakfast', 'Kg'], ['Kala Chana', 'Beverages & Breakfast', 'Kg'],
                    ['Magaj', 'Beverages & Breakfast', 'Kg'], ['Namkeen', 'Beverages & Breakfast', 'Kg'], ['Palak', 'Beverages & Breakfast', 'Kg'],
                    ['Peanut', 'Beverages & Breakfast', 'Kg'], ['Tash Patti', 'Beverages & Breakfast', 'Kg'],
                    ['Black Polish', 'Housekeeping & Disposables', 'Kg'], ['Cylinder', 'Housekeeping & Disposables', 'Kg'], ['Dish Wash', 'Housekeeping & Disposables', 'Kg'],
                    ['Garbage Bag', 'Housekeeping & Disposables', 'Kg'], ['Glass Water', 'Housekeeping & Disposables', 'Kg'], ['Happy Birthday Name', 'Housekeeping & Disposables', 'Kg'],
                    ['Juna', 'Housekeeping & Disposables', 'Kg'], ['Match Box', 'Housekeeping & Disposables', 'Kg'], ['Other', 'Housekeeping & Disposables', 'Kg'],
                    ['Pink Balloon', 'Housekeeping & Disposables', 'Pack'], ['Plate', 'Housekeeping & Disposables', 'Kg'], ['Red Balloon', 'Housekeeping & Disposables', 'Kg'],
                    ['Sugar', 'Housekeeping & Disposables', 'Kg'], ['Surf Excel', 'Housekeeping & Disposables', 'Kg'], ['Tissue', 'Housekeeping & Disposables', 'Kg'],
                    ['Vim Bar', 'Housekeeping & Disposables', 'Kg'], ['RO', 'Housekeeping & Disposables', 'Pcs'],
                    ['Butter', 'Dairy', 'Kg'], ['Curd', 'Dairy', 'Kg'], ['Ghee', 'Dairy', 'Kg'],
                    ['Milk', 'Dairy', 'Liter'], ['Paneer', 'Dairy', 'Kg'], ['Amul Butter', 'Dairy', 'Gms'],
                    ['Bread', 'Bakery', 'Pack'], ['Pizza Base', 'Bakery', 'Kg'],
                    ['French Fries', 'Frozen / Cold', 'Kg'], ['Ice', 'Frozen / Cold', 'Kg'], ['Ice Cream', 'Frozen / Cold', 'Kg'],
                    ['Mozzarella Cheese', 'Frozen / Cold', 'Kg'], ['Spring Roll Sheet', 'Frozen / Cold', 'Kg'],
                    ['Sweet Corn', 'Frozen / Cold', 'Kg'], ['Cheese Slice', 'Frozen / Cold', 'Packets'],
                    ['Green Chili Sauce', 'Sauce', 'Kg'], ['Pizza Sauce', 'Sauce', 'Kg'], ['Red Chili Sauce', 'Sauce', 'Kg'],
                    ['Sweet Chili Sauce', 'Sauce', 'Kg'], ['Tomato Ketchup', 'Sauce', 'Kg'], ['Ketchup', 'Sauce', 'Packets'],
                    ['Sweet Chilli Sauce', 'Sauce', 'Kg'],
                    ['Chicken', 'Non Veg', 'Kg'], ['Chicken Boneless', 'Non Veg', 'Kg'], ['Chicken Seekh Kabab', 'Non Veg', 'Kg'],
                    ['Eggs', 'Non Veg', 'Pc'], ['Mutton', 'Non Veg', 'Kg'], ['Boneless Chicken', 'Non Veg', 'Kg'],
                    ['Mutton Seekh Kabab', 'Non Veg', 'Kg'],
                    ['Arbi', 'Vegetables', 'Kg'], ['Beans', 'Vegetables', 'Kg'], ['Bhindi', 'Vegetables', 'Kg'],
                    ['Brinjal', 'Vegetables', 'Kg'], ['Cabbage', 'Vegetables', 'Kg'], ['Carrot', 'Vegetables', 'Kg'],
                    ['Cauliflower', 'Vegetables', 'Kg'], ['Garlic', 'Vegetables', 'Kg'], ['Ginger', 'Vegetables', 'Gms'],
                    ['Green Mirchi Big', 'Vegetables', 'Kg'], ['Karela', 'Vegetables', 'Kg'], ['Khira', 'Vegetables', 'Kg'],
                    ['Lemon', 'Vegetables', 'Kg'], ['Matar', 'Vegetables', 'Kg'], ['Mirchi Choti', 'Vegetables', 'Kg'],
                    ['Onion', 'Vegetables', 'Kg'], ['Potato', 'Vegetables', 'Kg'], ['Shimla Mirch', 'Vegetables', 'Kg'],
                    ['Tomato', 'Vegetables', 'Kg'], ['Shimla Mirchi', 'Vegetables', 'Kg'], ['Hari Mirchi choti', 'Vegetables', 'Kg'],
                    ['Hari mirchi Big', 'Vegetables', 'Kg'], ['Kaddu', 'Vegetables', 'Kg'], ['Sukha Mrchi', 'Vegetables', 'Kg'],
                    ['Loki', 'Vegetables', 'Kg'],
                    ['Plates', 'Crockery & Cutlery', 'Pcs'], ['Bowls', 'Crockery & Cutlery', 'Pcs'], ['Cups', 'Crockery & Cutlery', 'Pcs'],
                    ['Glasses', 'Crockery & Cutlery', 'Pcs'], ['Spoons', 'Crockery & Cutlery', 'Pcs'], ['Forks', 'Crockery & Cutlery', 'Pcs'],
                    ['Knife', 'Crockery & Cutlery', 'Pcs'],
                    ['Quarter plates', 'Disposables', 'Pcs'], ['Pizza Plates', 'Disposables', 'Pcs'], ['Dinner Plates', 'Disposables', 'Pcs'],
                    ['Water Glass', 'Disposables', 'Pcs'], ['Tissue paper', 'Disposables', 'Pcs'],
                    ['Fridge', 'Kitchen Appliance Repairs', 'Pcs'], ['Mixer', 'Kitchen Appliance Repairs', 'Pcs'], ['Air fryer', 'Kitchen Appliance Repairs', 'Pcs'],
                    ['Exhaust fan', 'Kitchen Appliance Repairs', 'Pcs'], ['Microwave Oven', 'Kitchen Appliance Repairs', 'Pcs'], ['Kettle', 'Kitchen Appliance Repairs', 'Pcs'],
                    ['Sandwich Maker', 'Kitchen Appliance Repairs', 'Pcs']
                ];

                $insItem = $pdo->prepare("INSERT INTO req_catalog (item_name, category_id, current_stock, unit_label) SELECT ?, ?, 0.00, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM req_catalog WHERE LOWER(item_name) = LOWER(?))");
                $inserted = 0;
                $skipped = 0;
                $updated = 0;
                foreach ($catalogItems as [$name, $catName, $unit]) {
                    $resolvedCatId = $catNameToId[$catName] ?? 1;
                    $insItem->execute([$name, $resolvedCatId, $unit, $name]);
                    if ($insItem->rowCount() > 0) {
                        $inserted++;
                    } else {
                        $skipped++;
                        $upd = $pdo->prepare("UPDATE req_catalog SET category_id = ? WHERE LOWER(item_name) = LOWER(?) AND category_id != ?");
                        $upd->execute([$resolvedCatId, $name, $resolvedCatId]);
                        if ($upd->rowCount() > 0) $updated++;
                    }
                }

                $orphanMap = [
                    'Cooking Oil (Sunflower)' => 'Oils & Dairy Staples',
                    'Dishwashing Liquid' => 'Housekeeping & Disposables',
                    'Paneer (Fresh)' => 'Dairy',
                    'Pool Chlorine Tablets' => 'Housekeeping & Disposables',
                ];
                foreach ($orphanMap as $itemName => $catName) {
                    if (isset($catNameToId[$catName])) {
                        $pdo->prepare("UPDATE req_catalog SET category_id = ? WHERE LOWER(item_name) = LOWER(?)")->execute([$catNameToId[$catName], $itemName]);
                    }
                }

                echo json_encode(['status' => 'success', 'inserted' => $inserted, 'skipped' => $skipped, 'updated' => $updated, 'message' => "Seed complete: $inserted inserted, $skipped existed (categories corrected: $updated)"]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'fix_orphan_categories':
            try {
                $orphanMap = [
                    'Cooking Oil (Sunflower)' => 'Oils & Dairy Staples',
                    'Dishwashing Liquid' => 'Housekeeping & Disposables',
                    'Paneer (Fresh)' => 'Dairy',
                    'Pool Chlorine Tablets' => 'Housekeeping & Disposables',
                ];
                $fixed = 0;
                foreach ($orphanMap as $itemName => $catName) {
                    $stmtCat = $pdo->prepare("SELECT id FROM material_categories WHERE name = ?");
                    $stmtCat->execute([$catName]);
                    $rowCat = $stmtCat->fetch(PDO::FETCH_ASSOC);
                    if ($rowCat) {
                        $stmtUp = $pdo->prepare("UPDATE req_catalog SET category_id = ? WHERE LOWER(item_name) = LOWER(?)");
                        $stmtUp->execute([$rowCat['id'], $itemName]);
                        if ($stmtUp->rowCount() > 0) $fixed++;
                    }
                }
                echo json_encode(['status' => 'success', 'fixed' => $fixed, 'message' => "Fixed $fixed orphan categories"]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid inventory action']);
            break;
    }
}
