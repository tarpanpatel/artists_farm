<?php
/**
 * Stock & Requisitions Log Module
 * Function: Requisitions, warehouse stock fulfillment, deficit shortfalls, and kitchen purchase tracking.
 */

function handleInventoryRequests($pdo, $request_method, $action, $propertyId) {
    require_once __DIR__ . '/../config/schema_cache.php';
    require_once __DIR__ . '/../uploads/image_cleanup.php';

    // Self-heal the System Stock Catalog schema (added 17 Aug 2026) - get_inventory's
    // UNION ALL below joins req_catalog against system_stock_catalog via
    // req_catalog.system_item_id, so this table/column existing is load-bearing for
    // the whole catalog view, not optional. Found missing entirely on staging (never
    // migrated there when the feature was built locally), which made get_inventory
    // fail outright and silently render as "0 items" client-side.
    if (!isSchemaVerified('schema_system_stock_catalog')) {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS `system_stock_catalog` (
              `id` int(11) NOT NULL AUTO_INCREMENT,
              `item_name` varchar(255) NOT NULL,
              `category_id` int(11) DEFAULT 1,
              `unit_label` varchar(20) DEFAULT 'Kg',
              `image_path` text DEFAULT NULL,
              `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
              PRIMARY KEY (`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");
        } catch (PDOException $e) {}
        $reqCatalogCols = [
            "ALTER TABLE `req_catalog` ADD COLUMN IF NOT EXISTS `unit_cost` DECIMAL(10,2) DEFAULT 0.00",
            "ALTER TABLE `req_catalog` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
            "ALTER TABLE `req_catalog` ADD COLUMN IF NOT EXISTS `system_item_id` INT DEFAULT NULL",
        ];
        foreach ($reqCatalogCols as $sql) {
            try { $pdo->exec($sql); } catch (PDOException $e) {}
        }
        markSchemaVerified('schema_system_stock_catalog');
    }

    switch ($action) {
        case 'get_inventory':
            try {
                // Return merged list of system templates and property custom items.
                // Left join req_catalog with system_stock_catalog to get localized current_stock for system items
                $sql = "
                    SELECT 
                        COALESCE(r.id, CONCAT('sys_', s.id)) as id,
                        s.item_name as name,
                        s.category_id,
                        COALESCE(c.name, 'General') as category,
                        COALESCE(r.current_stock, 0) as quantity,
                        s.unit_label as unit,
                        COALESCE(s.image_path, '') as image_path,
                        'system' as source
                    FROM system_stock_catalog s
                    LEFT JOIN req_catalog r ON r.system_item_id = s.id AND r.property_id = ?
                    LEFT JOIN material_categories c ON s.category_id = c.id
                    
                    UNION ALL
                    
                    SELECT 
                        r.id,
                        r.item_name as name,
                        r.category_id,
                        COALESCE(c.name, 'General') as category,
                        r.current_stock as quantity,
                        r.unit_label as unit,
                        COALESCE(r.image_path, '') as image_path,
                        'custom' as source
                    FROM req_catalog r
                    LEFT JOIN material_categories c ON r.category_id = c.id
                    WHERE r.property_id = ? AND r.system_item_id IS NULL
                    
                    ORDER BY name ASC
                ";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([$propertyId, $propertyId]);
                $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                // If a property has no custom/system items in req_catalog yet,
                // auto-seed baseline catalog items from property_id 1 so no property ever shows 0 items
                if (empty($results) && $propertyId > 0) {
                    try {
                        $seedSql = "
                            INSERT IGNORE INTO req_catalog (property_id, item_name, category_id, current_stock, unit_label, unit_cost, image_path, is_demo)
                            SELECT ?, item_name, category_id, current_stock, unit_label, unit_cost, image_path, 1
                            FROM req_catalog
                            WHERE property_id = 1 OR property_id = (SELECT MIN(property_id) FROM (SELECT DISTINCT property_id FROM req_catalog) as t)
                        ";
                        $seedStmt = $pdo->prepare($seedSql);
                        $seedStmt->execute([$propertyId]);

                        $stmt->execute([$propertyId, $propertyId]);
                        $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    } catch (Exception $seedErr) {}
                }

                // If still empty (e.g. fresh DB before property 1 seeded), fallback to querying any property's catalog
                if (empty($results)) {
                    try {
                        $fallbackSql = "
                            SELECT 
                                r.id,
                                r.item_name as name,
                                r.category_id,
                                COALESCE(c.name, 'General') as category,
                                r.current_stock as quantity,
                                r.unit_label as unit,
                                COALESCE(r.image_path, '') as image_path,
                                'custom' as source
                            FROM req_catalog r
                            LEFT JOIN material_categories c ON r.category_id = c.id
                            ORDER BY name ASC
                        ";
                        $results = $pdo->query($fallbackSql)->fetchAll(PDO::FETCH_ASSOC);
                    } catch (Exception $fbErr) {}
                }
                
                echo json_encode(['status' => 'success', 'data' => $results]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'update_stock':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $id = $input['id'];
                    $qty = $input['quantity'];

                    if (is_string($id) && strpos($id, 'sys_') === 0) {
                        $sysId = (int)str_replace('sys_', '', $id);
                        
                        // Check if a local tracking row exists
                        $stmt = $pdo->prepare("UPDATE req_catalog SET current_stock = ? WHERE system_item_id = ? AND property_id = ?");
                        $stmt->execute([$qty, $sysId, $propertyId]);
                        
                        if ($stmt->rowCount() === 0) {
                            // Insert a new local tracking row by copying from system_stock_catalog
                            $stmtSys = $pdo->prepare("SELECT item_name, category_id, unit_label, image_path FROM system_stock_catalog WHERE id = ?");
                            $stmtSys->execute([$sysId]);
                            $sysItem = $stmtSys->fetch(PDO::FETCH_ASSOC);
                            
                            if ($sysItem) {
                                $stmtIns = $pdo->prepare("INSERT INTO req_catalog (property_id, system_item_id, item_name, category_id, current_stock, unit_label, image_path) VALUES (?, ?, ?, ?, ?, ?, ?)");
                                $stmtIns->execute([$propertyId, $sysId, $sysItem['item_name'], $sysItem['category_id'], $qty, $sysItem['unit_label'], $sysItem['image_path']]);
                            }
                        }
                    } else {
                        // Standard local item update
                        $stmt = $pdo->prepare("UPDATE req_catalog SET current_stock = ? WHERE id = ? AND property_id = ?");
                        $stmt->execute([$qty, $id, $propertyId]);
                        
                        if ($stmt->rowCount() === 0) {
                            $stmt = $pdo->prepare("UPDATE inventory_items SET quantity = ? WHERE id = ? AND property_id = ?");
                            $stmt->execute([$qty, $id, $propertyId]);
                        }
                    }
                    echo json_encode(['status' => 'success', 'message' => 'Stock quantity updated']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'get_stock_requests':
            try {

                $stmt = $pdo->prepare("SELECT id, status, date, items FROM stock_requisitions WHERE property_id = ? ORDER BY CAST(id AS UNSIGNED) DESC, created_at DESC");
                $stmt->execute([$propertyId]);
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
                    $stmt = $pdo->prepare("INSERT INTO stock_requisitions (id, property_id, status, date, items) VALUES (?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $input['id'],
                        $propertyId,
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
                        $stmt = $pdo->prepare("UPDATE stock_requisitions SET status = ?, items = ? WHERE id = ? AND property_id = ?");
                        $stmt->execute([
                            $input['status'],
                            json_encode($itemsArr),
                            $input['id'],
                            $propertyId
                        ]);
                    } else {
                        $stmt = $pdo->prepare("UPDATE stock_requisitions SET status = ? WHERE id = ? AND property_id = ?");
                        $stmt->execute([
                            $input['status'],
                            $input['id'],
                            $propertyId
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

                $stmt = $pdo->prepare("SELECT id, date, item_name as itemName, wasted_qty as wastedQty, unit, reason, reported_by as reportedBy, notes FROM kitchen_wastage_logs WHERE property_id = ? ORDER BY created_at DESC");
                $stmt->execute([$propertyId]);
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'create_wastage_log':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("INSERT INTO kitchen_wastage_logs (id, property_id, date, item_name, wasted_qty, unit, reason, reported_by, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $input['id'],
                        $propertyId,
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



                $stmt = $pdo->prepare("SELECT id, purchase_date as purchaseDate, item_name as itemName, specification, quantity, unit, total_price as totalPrice, unit_cost as unitCost, recorded_by as recordedBy, vendor_name as vendorName, settlement_status as settlementStatus, settlement_method as settlementMethod, paid_by_staff as paidByStaff FROM kitchen_purchases_log WHERE property_id = ? ORDER BY created_at DESC");
                $stmt->execute([$propertyId]);
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'create_kitchen_purchase':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {


                    $stmt = $pdo->prepare("INSERT INTO kitchen_purchases_log (id, property_id, purchase_date, item_name, specification, quantity, unit, total_price, unit_cost, recorded_by, vendor_name, settlement_status, settlement_method, paid_by_staff) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $input['id'],
                        $propertyId,
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
                        $stmtCat = $pdo->prepare("UPDATE req_catalog SET current_stock = current_stock + ? WHERE LOWER(item_name) = LOWER(?) AND property_id = ?");
                        $stmtCat->execute([$input['quantity'], $input['itemName'], $propertyId]);
                    } catch (PDOException $e2) {}

                    // Historical record in inventory_price_history
                    try {
                        $stmtHist = $pdo->prepare("INSERT INTO inventory_price_history (item_name, unit_cost, purchase_date, property_id) VALUES (?, ?, ?, ?)");
                        $stmtHist->execute([$input['itemName'], $input['unitCost'], $input['purchaseDate'], $propertyId]);
                    } catch (PDOException $eHist) {}

                    // Post to the shared financial ledger - kitchen purchases are a real
                    // operating cost and previously never reached financial_ledger at all,
                    // so the P&L Statement's "Total Expenses" silently excluded every
                    // grocery/gas/supplies bill regardless of how much was spent. Posted
                    // unconditionally at record-time (like add_petty_cash does), not
                    // gated on settlement_status - an unpaid vendor bill is still a real
                    // incurred expense, it just hasn't been settled in cash yet.
                    // $propertyId passed explicitly - postFinancialLedger() silently
                    // defaults to property 1 otherwise (see CLAUDE.md).
                    postFinancialLedger($pdo, [
                        'entry_key' => 'kitchen_purchase:' . $input['id'],
                        'direction' => 'debit',
                        'amount' => $input['totalPrice'] ?? 0,
                        'category' => 'Kitchen & Supplies',
                        'payment_method' => $input['settlementMethod'] ?? 'Farm Cash',
                        'party_type' => 'payee',
                        'party_name' => $input['vendorName'] ?? 'Unassigned Vendor',
                        'source_type' => 'kitchen_purchase',
                        'source_id' => $input['id'],
                        'description' => trim(($input['quantity'] ?? '') . ' ' . ($input['unit'] ?? '') . ' ' . ($input['itemName'] ?? '')),
                    ], $propertyId);

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
                        $stmt = $pdo->prepare("UPDATE kitchen_purchases_log SET vendor_name = ? WHERE id IN ($placeholders) AND property_id = ?");
                        $stmt->execute(array_merge([$input['vendorName']], $ids, [$propertyId]));
                    }

                    if (!empty($input['markPaid']) && !empty($ids)) {
                        $placeholders = implode(',', array_fill(0, count($ids), '?'));
                        $stmt = $pdo->prepare("UPDATE kitchen_purchases_log SET settlement_status = 'Paid', settlement_method = ?, paid_by_staff = ? WHERE id IN ($placeholders) AND property_id = ?");
                        $stmt->execute(array_merge([$input['settlementMethod'] ?? 'Farm Cash', $input['paidByStaff'] ?? ''], $ids, [$propertyId]));

                            // If Out of Pocket by Staff -> insert negative advance entry in staff_advances (reimbursement math credit)
                            if (($input['settlementMethod'] ?? '') === 'Paid Out of Pocket' && !empty($input['paidByStaff'])) {
                                $stmtAdv = $pdo->prepare("INSERT INTO staff_advances (staff_name, amount, reason, date, property_id) VALUES (?, ?, ?, ?, ?)");
                                $stmtAdv->execute([
                                    $input['paidByStaff'],
                                    -abs($input['totalAmount'] ?? 0),
                                    "Reimbursement credit for Out-of-Pocket kitchen purchase (" . count($ids) . " items)",
                                    date('Y-m-d'),
                                    $propertyId
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
                    $stmtDel = $pdo->prepare("DELETE FROM kitchen_purchases_log WHERE id = ? AND property_id = ?");
                    $stmtDel->execute([$input['id'], $propertyId]);

                    // Neutralise the ledger posting create_kitchen_purchase made -
                    // otherwise a deleted purchase keeps counting as a real expense
                    // in the P&L Statement forever. $propertyId passed explicitly
                    // (see CLAUDE.md - postFinancialLedger()/reverseFinancialSource()
                    // silently default to property 1 otherwise).
                    reverseFinancialSource($pdo, 'kitchen_purchase', (string)$input['id'], 'Kitchen purchase deleted', $propertyId);

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

                // Ensure UNIQUE constraint exists (add if missing from old schema). The
                // constraint must be per-property (name, property_id): the old global
                // `name`-only index forced category names unique across the whole
                // multi-tenant database, and the old cross-property dedupe below then
                // deleted property B's "Dairy" row whenever property A's lower-id
                // "Dairy" existed - a cross-property data-loss bug.
                if (!isSchemaVerified('schema_inventory_categories')) {
                    // Clean duplicates within each property first so the new index can install
                    try { $pdo->exec("DELETE t1 FROM material_categories t1 INNER JOIN material_categories t2 WHERE t1.property_id = t2.property_id AND t1.name = t2.name AND t1.id > t2.id"); } catch (PDOException $e) {}
                    try { $pdo->exec("ALTER TABLE `material_categories` DROP INDEX IF EXISTS `uniq_cat_name`"); } catch (PDOException $e) {}
                    try { $pdo->exec("ALTER TABLE `material_categories` ADD UNIQUE INDEX IF NOT EXISTS `uniq_cat_name_prop` (`name`, `property_id`)"); } catch (PDOException $e) {}
                    // Add is_ingredient column if missing (upgrade old schema)
                    try { $pdo->exec("ALTER TABLE `material_categories` ADD COLUMN `is_ingredient` TINYINT(1) NOT NULL DEFAULT 0"); } catch (PDOException $e) {}
                    markSchemaVerified('schema_inventory_categories');
                }

                // Clean up any duplicates within THIS property only (keep lowest ID)
                $pdo->prepare("DELETE t1 FROM material_categories t1 INNER JOIN material_categories t2 WHERE t1.property_id = ? AND t1.property_id = t2.property_id AND t1.name = t2.name AND t1.id > t2.id")->execute([$propertyId]);

                // Seed only if table is empty
                $count = $pdo->prepare("SELECT COUNT(*) FROM material_categories WHERE property_id = ?");
                $count->execute([$propertyId]);
                if ((int)$count->fetchColumn() === 0) {
                    $seed = [
                        'Bakery','Beverages & Breakfast','Chinese & Continental Sauces','Crockery & Cutlery',
                        'Dairy','Flours & Grains','Frozen / Cold','Fruits & Desserts',
                        'Housekeeping & Disposables','Kitchen Appliance Repairs','Lentils & Pulses',
                        'Non Veg','Oils & Dairy Staples','Sauce','Spices & Seasonings',
                        'Vegetables & Fresh Produce'
                    ];
                    $ins = $pdo->prepare("INSERT IGNORE INTO material_categories (name, property_id) VALUES (?, ?)");
                    foreach ($seed as $name) {
                        $ins->execute([$name, $propertyId]);
                    }
                }

                $stmt = $pdo->prepare("SELECT id, name FROM material_categories WHERE property_id = ? ORDER BY name ASC");
                $stmt->execute([$propertyId]);
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
                    $stmt = $pdo->prepare("UPDATE material_categories SET name = ? WHERE id = ? AND property_id = ?");
                    $stmt->execute([$newName, $id, $propertyId]);
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
                    $stmt = $pdo->prepare("DELETE FROM material_categories WHERE id = ? AND property_id = ?");
                    $stmt->execute([$input['id'], $propertyId]);
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
                    $stmt = $pdo->prepare("INSERT INTO material_categories (name, property_id) VALUES (?, ?)");
                    $stmt->execute([$name, $propertyId]);
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

                    // Add image_path column if missing
                    if (!isSchemaVerified('schema_inventory_catalog_image')) {
                        try { $pdo->exec("ALTER TABLE `req_catalog` ADD COLUMN `image_path` TEXT DEFAULT NULL"); } catch (Exception $e) { /* already exists */ }
                        markSchemaVerified('schema_inventory_catalog_image');
                    }

                    // Resolve category_id from material_categories
                    $catId = 1;
                    if ($categoryName && $categoryName !== 'General') {
                        $stmtCat = $pdo->prepare("SELECT id FROM material_categories WHERE name = ? AND property_id = ?");
                        $stmtCat->execute([$categoryName, $propertyId]);
                        $rowCat = $stmtCat->fetch(PDO::FETCH_ASSOC);
                        if ($rowCat) {
                            $catId = $rowCat['id'];
                        } else {
                            $insCat = $pdo->prepare("INSERT INTO material_categories (name, property_id) VALUES (?, ?)");
                            $insCat->execute([$categoryName, $propertyId]);
                            $catId = $pdo->lastInsertId();
                        }
                    }

                    $imagePath = trim($input['imagePath'] ?? '');
                    $stmtIns = $pdo->prepare("INSERT INTO req_catalog (item_name, category_id, current_stock, unit_label, image_path, property_id) VALUES (?, ?, ?, ?, ?, ?)");
                    $stmtIns->execute([$name, $catId, 0, $unit, $imagePath ?: null, $propertyId]);

                    echo json_encode(['status' => 'success', 'id' => $pdo->lastInsertId(), 'message' => 'Catalog item registered']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'delete_catalog_item':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $id = intval($input['id'] ?? 0);
                if (!$id) {
                    echo json_encode(['status' => 'error', 'message' => 'Item id is required']);
                    break;
                }
                try {
                    $stmt = $pdo->prepare("DELETE FROM req_catalog WHERE id = ? AND property_id = ?");
                    $stmt->execute([$id, $propertyId]);
                    echo json_encode(['status' => 'success', 'message' => 'Catalog item deleted']);
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
                        $stmtCat = $pdo->prepare("SELECT id FROM material_categories WHERE name = ? AND property_id = ?");
                        $stmtCat->execute([$categoryName, $propertyId]);
                        $rowCat = $stmtCat->fetch(PDO::FETCH_ASSOC);
                        if ($rowCat) {
                            $catId = $rowCat['id'];
                        } else {
                            $insCat = $pdo->prepare("INSERT INTO material_categories (name, property_id) VALUES (?, ?)");
                            $insCat->execute([$categoryName, $propertyId]);
                            $catId = $pdo->lastInsertId();
                        }
                    }
                    // Captured before the UPDATE below so a photo replacement
                    // can delete the file the old path pointed at once the
                    // new one is safely saved - see php/uploads/image_cleanup.php.
                    $oldCatalogImagePath = null;
                    if (!empty($input['imagePath'])) {
                        $oldImgStmt = $pdo->prepare("SELECT image_path FROM req_catalog WHERE id = ? AND property_id = ?");
                        $oldImgStmt->execute([$id, $propertyId]);
                        $oldCatalogImagePath = $oldImgStmt->fetchColumn() ?: null;
                    }

                    $stmtUp = $pdo->prepare("UPDATE req_catalog SET item_name = ?, category_id = ?, unit_label = ?, image_path = COALESCE(?, image_path) WHERE id = ? AND property_id = ?");
                    $stmtUp->execute([$name, $catId, $unit, !empty($input['imagePath']) ? $input['imagePath'] : null, $id, $propertyId]);

                    if (!empty($input['imagePath'])) {
                        deleteReplacedImage($oldCatalogImagePath, $input['imagePath']);
                    }

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
                        $stmtCat = $pdo->prepare("SELECT id FROM material_categories WHERE name = ? AND property_id = ?");
                        $stmtCat->execute([$categoryName, $propertyId]);
                        $rowCat = $stmtCat->fetch(PDO::FETCH_ASSOC);
                        if ($rowCat) {
                            $catId = $rowCat['id'];
                        } else {
                            $insCat = $pdo->prepare("INSERT INTO material_categories (name, property_id) VALUES (?, ?)");
                            $insCat->execute([$categoryName, $propertyId]);
                            $catId = $pdo->lastInsertId();
                        }
                    }
                    $placeholders = implode(',', array_fill(0, count($ids), '?'));
                    $stmtUp = $pdo->prepare("UPDATE req_catalog SET category_id = ? WHERE id IN ($placeholders) AND property_id = ?");
                    $stmtUp->execute(array_merge([$catId], $ids, [$propertyId]));
                    echo json_encode(['status' => 'success', 'message' => 'Categories updated successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'seed_catalog':
            try {
                if (!isSchemaVerified('schema_inventory_categories')) {
                    try { $pdo->exec("ALTER TABLE `material_categories` ADD UNIQUE INDEX IF NOT EXISTS `uniq_cat_name` (`name`)"); } catch (PDOException $e) {}
                    markSchemaVerified('schema_inventory_categories');
                }

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
                    $byName = $pdo->prepare("SELECT id FROM material_categories WHERE name = ? AND property_id = ?");
                    $byName->execute([$catName, $propertyId]);
                    $existingByName = $byName->fetch(PDO::FETCH_ASSOC);
                    if ($existingByName) {
                        $catNameToId[$catName] = $existingByName['id'];
                        continue;
                    }
                    $byId = $pdo->prepare("SELECT id FROM material_categories WHERE id = ? AND property_id = ?");
                    $byId->execute([$desiredId, $propertyId]);
                    $existingById = $byId->fetch(PDO::FETCH_ASSOC);
                    if ($existingById) {
                        $ins = $pdo->prepare("INSERT INTO material_categories (name, property_id) VALUES (?, ?)");
                        $ins->execute([$catName, $propertyId]);
                        $catNameToId[$catName] = $pdo->lastInsertId();
                    } else {
                        $ins = $pdo->prepare("INSERT INTO material_categories (id, name, property_id) VALUES (?, ?, ?)");
                        $ins->execute([$desiredId, $catName, $propertyId]);
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

                $insItem = $pdo->prepare("INSERT INTO req_catalog (item_name, category_id, current_stock, unit_label, property_id) SELECT ?, ?, 0.00, ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM req_catalog WHERE LOWER(item_name) = LOWER(?) AND property_id = ?)");
                $inserted = 0;
                $skipped = 0;
                $updated = 0;
                foreach ($catalogItems as [$name, $catName, $unit]) {
                    $resolvedCatId = $catNameToId[$catName] ?? 1;
                    $insItem->execute([$name, $resolvedCatId, $unit, $propertyId, $name, $propertyId]);
                    if ($insItem->rowCount() > 0) {
                        $inserted++;
                    } else {
                        $skipped++;
                        $upd = $pdo->prepare("UPDATE req_catalog SET category_id = ? WHERE LOWER(item_name) = LOWER(?) AND category_id != ? AND property_id = ?");
                        $upd->execute([$resolvedCatId, $name, $resolvedCatId, $propertyId]);
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
                        $pdo->prepare("UPDATE req_catalog SET category_id = ? WHERE LOWER(item_name) = LOWER(?) AND property_id = ?")->execute([$catNameToId[$catName], $itemName, $propertyId]);
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
                    $stmtCat = $pdo->prepare("SELECT id FROM material_categories WHERE name = ? AND property_id = ?");
                    $stmtCat->execute([$catName, $propertyId]);
                    $rowCat = $stmtCat->fetch(PDO::FETCH_ASSOC);
                    if ($rowCat) {
                        $stmtUp = $pdo->prepare("UPDATE req_catalog SET category_id = ? WHERE LOWER(item_name) = LOWER(?) AND property_id = ?");
                        $stmtUp->execute([$rowCat['id'], $itemName, $propertyId]);
                        if ($stmtUp->rowCount() > 0) $fixed++;
                    }
                }
                echo json_encode(['status' => 'success', 'fixed' => $fixed, 'message' => "Fixed $fixed orphan categories"]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        // Categories for the System Stock Catalog's own dropdowns (Add/Edit forms), always
        // scoped to property_id=1 - the same anchor system_stock_catalog.category_id already
        // points at (see sync_default_stock_categories/add_system_stock_item below). Deliberately
        // NOT get_material_categories: that resolves against the REQUEST's property context,
        // which for a Root Dashboard request is propertyId=0 (no real property there) - returning
        // a completely different, disconnected set of category IDs that share names but not IDs
        // with what system_stock_catalog items actually reference, so the Edit modal's dropdown
        // could never show the item's real category (found 17 Aug 2026).
        case 'get_system_stock_categories':
            try {
                $stmt = $pdo->query("SELECT id, name FROM material_categories WHERE property_id = 1 ORDER BY name ASC");
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'get_system_stock_catalog':
            try {
                $stmt = $pdo->query("
                    SELECT s.id, s.item_name as name, s.category_id, COALESCE(c.name, 'General') as category, s.unit_label as unit, s.image_path
                    FROM system_stock_catalog s
                    LEFT JOIN material_categories c ON s.category_id = c.id
                    ORDER BY c.name ASC, s.item_name ASC
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

        case 'add_system_stock_item':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $name = trim($input['name'] ?? '');
                    $category_id = $input['categoryId'] ?? 1;
                    $unit = $input['unit'] ?? 'Kg';
                    $id = $input['id'] ?? null;

                    if ($id) {
                        $stmt = $pdo->prepare("UPDATE system_stock_catalog SET item_name = ?, category_id = ?, unit_label = ? WHERE id = ?");
                        $stmt->execute([$name, $category_id, $unit, $id]);
                        echo json_encode(['status' => 'success', 'message' => 'System stock item updated']);
                    } else {
                        $stmt = $pdo->prepare("INSERT INTO system_stock_catalog (item_name, category_id, unit_label) VALUES (?, ?, ?)");
                        $stmt->execute([$name, $category_id, $unit]);
                        echo json_encode(['status' => 'success', 'id' => $pdo->lastInsertId(), 'message' => 'System stock item created']);
                    }
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'delete_system_stock_item':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $id = $input['id'] ?? null;
                if ($id) {
                    try {
                        $stmt = $pdo->prepare("DELETE FROM system_stock_catalog WHERE id = ?");
                        $stmt->execute([$id]);
                        echo json_encode(['status' => 'success', 'message' => 'System stock item deleted']);
                    } catch (PDOException $e) {
                        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                    }
                }
            }
            break;

        case 'sync_default_stock_categories':
            // Seeds system_stock_catalog with a clean starter set (17 Aug 2026), curated from
            // property 1's real 370-item catalog rather than invented - deduplicated (e.g.
            // "Chicken"/"Chicken Boneless"/"Boneless Chicken" -> one entry) and re-categorized
            // where the source data was miscategorized (e.g. Fish/Peanut/Kaju were filed under
            // "Beverages & Breakfast"). system_stock_catalog itself has no property_id (it's the
            // shared platform-wide template - see get_inventory's UNION), but its category_id
            // still joins against material_categories, which IS property-scoped - reusing
            // property 1's category rows here matches the join get_inventory already relies on
            // rather than inventing a second, parallel category scheme.
            if ($request_method === 'POST') {
                try {
                    $defaults = [
                        'Vegetables' => [['Onion','Kg'],['Potato','Kg'],['Tomato','Kg'],['Garlic','Kg'],['Ginger','Gm'],['Carrot','Kg'],['Cauliflower','Kg'],['Cabbage','Kg'],['Brinjal','Kg'],['Shimla Mirch','Kg'],['Green Chilli','Kg'],['Lemon','Kg'],['Cucumber','Kg'],['Beans','Kg'],['Green Peas','Kg']],
                        'Fruits & Desserts' => [['Apple','Kg'],['Banana','Doz'],['Mango','Pcs'],['Papaya','Pcs'],['Watermelon','Pcs'],['Orange','Kg'],['Gulab Jamun','Kg']],
                        'Non Veg' => [['Chicken','Kg'],['Mutton','Kg'],['Chicken Seekh Kebab','Kg'],['Mutton Seekh Kebab','Kg']],
                        'Dairy' => [['Butter','Kg'],['Curd','Kg'],['Ghee','Kg'],['Paneer','Kg']],
                        'Spices & Seasonings' => [['Salt','Kg'],['Haldi','Kg'],['Mirch Powder','Kg'],['Dhaniya Powder','Kg'],['Jeera','Kg'],['Garam Masala','Pcs'],['Chat Masala','Pcs'],['Kitchen King Masala','Pcs'],['Ajino Moto','Gm']],
                        'Lentils & Pulses' => [['Arhar Dal','Kg'],['Chana Dal','Kg'],['Moong Dal','Kg'],['Urad Dal','Kg'],['Masoor Dal','Kg']],
                        'Flours & Grains' => [['Atta','Kg'],['Maida','Kg'],['Besan','Kg'],['Basmati Rice','Kg'],['Poha','Kg'],['Corn Flour','Kg']],
                        'Oils & Dairy Staples' => [['Cooking Oil (Sunflower)','Ltr'],['Mustard Oil','Ltr'],['Cheese','Kg'],['Cream','Kg']],
                        'Sauce' => [['Tomato Ketchup','Kg'],['Red Chili Sauce','Kg'],['Green Chili Sauce','Kg'],['Sweet Chilli Sauce','Kg'],['Pizza Sauce','Kg']],
                        'Chinese & Continental Sauces' => [['Noodles','Kg'],['Maggi','Box'],['Chocolate Sauce','Kg'],['Bread Crumb','Kg'],['Pizza Cheese','Kg']],
                        'Beverages & Breakfast' => [['Biscuit','Kg'],['Namkeen','Kg'],['Tea Masala','Pcs']],
                        'Bakery' => [['Bread','Pack'],['Pizza Base','Kg']],
                        'Frozen / Cold' => [['Ice','Kg'],['Ice Cream','Kg'],['French Fries','Kg'],['Mozzarella Cheese','Kg'],['Sweet Corn','Kg']],
                        'Housekeeping & Disposables' => [['Garbage Bag','Kg'],['Dishwashing Liquid','Ltr'],['Surf Excel','Kg'],['Vim Bar','Kg'],['Tissue Paper','Box'],['Match Box','Pc'],['Dinner Plates','Packets']],
                        'Crockery & Cutlery' => [['Plates','Pcs'],['Bowls','Pcs'],['Cups','Pcs'],['Glasses','Pcs'],['Spoons','Pcs'],['Forks','Pcs'],['Knife','Pcs']],
                        'Kitchen Appliance Repairs' => [['Fridge','Pcs'],['Microwave Oven','Pcs'],['Mixer','Pcs'],['Exhaust Fan','Pcs'],['Kettle','Pcs']],
                        'Pool & Maintenance' => [['Pool Chlorine Tablets','Pcs']],
                    ];

                    $categoriesCreated = 0;
                    $itemsCreated = 0;
                    foreach ($defaults as $catName => $items) {
                        $catStmt = $pdo->prepare("SELECT id FROM material_categories WHERE name = ? AND property_id = 1 LIMIT 1");
                        $catStmt->execute([$catName]);
                        $catId = $catStmt->fetchColumn();
                        if (!$catId) {
                            $insCat = $pdo->prepare("INSERT INTO material_categories (name, property_id) VALUES (?, 1)");
                            $insCat->execute([$catName]);
                            $catId = $pdo->lastInsertId();
                            $categoriesCreated++;
                        }

                        foreach ($items as [$itemName, $unit]) {
                            $existsStmt = $pdo->prepare("SELECT id FROM system_stock_catalog WHERE LOWER(item_name) = LOWER(?) LIMIT 1");
                            $existsStmt->execute([$itemName]);
                            if (!$existsStmt->fetchColumn()) {
                                $insItem = $pdo->prepare("INSERT INTO system_stock_catalog (item_name, category_id, unit_label) VALUES (?, ?, ?)");
                                $insItem->execute([$itemName, $catId, $unit]);
                                $itemsCreated++;
                            }
                        }
                    }

                    echo json_encode(['status' => 'success', 'message' => "Synced $itemsCreated items across " . count($defaults) . ' categories', 'categoriesCreated' => $categoriesCreated, 'itemsCreated' => $itemsCreated]);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid inventory action']);
            break;
    }
}
