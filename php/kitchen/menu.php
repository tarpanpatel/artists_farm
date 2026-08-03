<?php
/**
 * Food Menu Catalog & RBAC Menu Manager Module
 * Function: Menu dish inventory, prices, categories, and custom dishes builder.
 */

function handleMenuRequests($pdo, $request_method, $action, $propertyId) {
    // Ensure menu_items table exists
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS `menu_items` (
            `id` VARCHAR(50) PRIMARY KEY,
            `property_id` INT NOT NULL DEFAULT 1,
            `name` VARCHAR(255) NOT NULL,
            `category` VARCHAR(100) NOT NULL DEFAULT 'Starters',
            `price` DECIMAL(10,2) NOT NULL,
            `available` TINYINT(1) NOT NULL DEFAULT 1,
            `image_path` TEXT DEFAULT '',
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
        // Upgrade image_path from VARCHAR(255) to TEXT if needed
        try { $pdo->exec("ALTER TABLE `menu_items` MODIFY COLUMN `image_path` TEXT DEFAULT ''"); } catch (Exception $e) {}
    } catch (PDOException $e) {}

    switch ($action) {
        case 'get_menu':
            try {
                // Try query with LEFT JOIN on menu_categories (for DB schema with category_id)
                $sql = "SELECT m.id, m.name, m.category_id, COALESCE(c.name, 'Starters') AS category, m.price, (COALESCE(m.is_hidden, 0) = 0) AS available, COALESCE(m.image_path, '') AS image_path
                        FROM menu_items m
                        LEFT JOIN menu_categories c ON m.category_id = c.id
                        WHERE m.property_id = ?
                        ORDER BY COALESCE(c.sort_order, 99) ASC, m.name ASC";
                try {
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute([$propertyId]);
                    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                } catch (PDOException $e1) {
                    // Fallback query for DB schema with category column directly
                    $stmt = $pdo->prepare("SELECT id, name, NULL AS category_id, category, price, available, image_path FROM menu_items WHERE property_id = ? ORDER BY category ASC, name ASC");
                    $stmt->execute([$propertyId]);
                    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                }

                $data = array_map(function($r) {
                    return [
                        'id' => (int)$r['id'],
                        'name' => $r['name'],
                        'categoryId' => isset($r['category_id']) && $r['category_id'] !== null ? (string)$r['category_id'] : null,
                        'category' => $r['category'],
                        'price' => (float)$r['price'],
                        'available' => isset($r['available']) ? (bool)$r['available'] : true,
                        'imagePath' => $r['image_path'] ?? ''
                    ];
                }, $rows);
                echo json_encode(['status' => 'success', 'data' => $data]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'add_menu_item':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    // Dedup: skip if item with same name already exists
                    $nameCheck = $pdo->prepare("SELECT id FROM menu_items WHERE name = ? AND property_id = ? LIMIT 1");
                    $nameCheck->execute([$input['name'], $propertyId]);
                    if ($nameCheck->fetchColumn()) {
                        echo json_encode(['status' => 'success', 'message' => 'Menu item already exists, skipped']);
                        break;
                    }

                    $catId = 1;
                    if (!empty($input['category'])) {
                        $catStmt = $pdo->prepare("SELECT id FROM menu_categories WHERE name = ? LIMIT 1");
                        $catStmt->execute([$input['category']]);
                        $foundId = $catStmt->fetchColumn();
                        if ($foundId) {
                            $catId = (int)$foundId;
                        }
                    }

                    try {
                        $stmt = $pdo->prepare("INSERT INTO menu_items (property_id, category_id, name, price, is_hidden, image_path) VALUES (?, ?, ?, ?, ?, ?)");
                        $stmt->execute([
                            $propertyId,
                            $catId,
                            $input['name'],
                            $input['price'],
                            isset($input['available']) && !$input['available'] ? 1 : 0,
                            $input['imagePath'] ?? ''
                        ]);
                    } catch (PDOException $e1) {
                        $stmt = $pdo->prepare("INSERT INTO menu_items (property_id, id, name, category, price, available, image_path) VALUES (?, ?, ?, ?, ?, ?, ?)");
                        $stmt->execute([
                            $propertyId,
                            $input['id'] ?? null,
                            $input['name'],
                            $input['category'] ?? 'Starters',
                            $input['price'],
                            isset($input['available']) ? ($input['available'] ? 1 : 0) : 1,
                            $input['imagePath'] ?? ''
                        ]);
                    }
                    echo json_encode(['status' => 'success', 'message' => 'Menu item created successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'update_menu_item':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $catId = null;
                    if (!empty($input['category'])) {
                        $catStmt = $pdo->prepare("SELECT id FROM menu_categories WHERE name = ? LIMIT 1");
                        $catStmt->execute([$input['category']]);
                        $foundId = $catStmt->fetchColumn();
                        if ($foundId) $catId = (int)$foundId;
                    }

                    try {
                        $stmt = $pdo->prepare("UPDATE menu_items SET name = COALESCE(?, name), category_id = COALESCE(?, category_id), price = COALESCE(?, price), is_hidden = COALESCE(?, is_hidden), image_path = COALESCE(?, image_path) WHERE id = ? AND property_id = ?");
                        $stmt->execute([
                            $input['name'] ?? null,
                            $catId,
                            isset($input['price']) ? $input['price'] : null,
                            isset($input['available']) ? ($input['available'] ? 0 : 1) : null,
                            $input['imagePath'] ?? null,
                            $input['id'],
                            $propertyId
                        ]);
                    } catch (PDOException $e1) {
                        $stmt = $pdo->prepare("UPDATE menu_items SET name = COALESCE(?, name), category = COALESCE(?, category), price = COALESCE(?, price), available = COALESCE(?, available), image_path = COALESCE(?, image_path) WHERE id = ? AND property_id = ?");
                        $stmt->execute([
                            $input['name'] ?? null,
                            $input['category'] ?? null,
                            isset($input['price']) ? $input['price'] : null,
                            isset($input['available']) ? ($input['available'] ? 1 : 0) : null,
                            $input['imagePath'] ?? null,
                            $input['id'],
                            $propertyId
                        ]);
                    }
                    echo json_encode(['status' => 'success', 'message' => 'Menu item updated successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'delete_menu_item':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("DELETE FROM menu_items WHERE id = ? AND property_id = ?");
                    $stmt->execute([$input['id'], $propertyId]);
                    echo json_encode(['status' => 'success', 'message' => 'Menu item deleted successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'get_nav_menu':
            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS `nav_menu_items` (
                    `id` VARCHAR(50) PRIMARY KEY,
                    `property_id` INT NOT NULL DEFAULT 1,
                    `title` VARCHAR(255) NOT NULL,
                    `tab_key` VARCHAR(100) NOT NULL,
                    `unique_key` VARCHAR(100) NOT NULL,
                    `category` VARCHAR(100) DEFAULT 'Main Sections',
                    `icon_name` VARCHAR(100) DEFAULT 'Grid',
                    `display_order` INT NOT NULL DEFAULT 1,
                    `roles_json` TEXT,
                    `is_visible` TINYINT(1) DEFAULT 1,
                    `custom_url` TEXT DEFAULT NULL,
                    `open_in_new_tab` TINYINT(1) DEFAULT 0,
                    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
                // Auto-add columns if missing
                try { $pdo->exec("ALTER TABLE `nav_menu_items` ADD COLUMN `custom_url` TEXT DEFAULT NULL"); } catch (Exception $e) {}
                try { $pdo->exec("ALTER TABLE `nav_menu_items` ADD COLUMN `open_in_new_tab` TINYINT(1) DEFAULT 0"); } catch (Exception $e) {}
                try { $pdo->exec("ALTER TABLE `nav_menu_items` ADD COLUMN `parent_id` VARCHAR(50) DEFAULT NULL"); } catch (Exception $e) {}


                // Navigation structure is shared across every property/tenant (unlike
                // property_modules, which controls per-property feature visibility on
                // top of this shared structure) — intentionally not property_id-scoped.
                $stmt = $pdo->query("SELECT id, title, tab_key as tabKey, unique_key as uniqueKey, category, icon_name as iconName, display_order as `order`, roles_json, is_visible as isVisible, COALESCE(custom_url, '') as customUrl, IFNULL(open_in_new_tab, 0) as openInNewTab, parent_id as parentId FROM nav_menu_items ORDER BY display_order ASC");
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $data = array_map(function($r) {
                    return [
                        'id' => (string)$r['id'],
                        'title' => $r['title'],
                        'tabKey' => $r['tabKey'],
                        'uniqueKey' => $r['uniqueKey'],
                        'category' => $r['category'],
                        'iconName' => $r['iconName'],
                        'order' => (int)$r['order'],
                        'roles' => json_decode($r['roles_json'] ?? '[]', true) ?: [],
                        'isVisible' => (bool)$r['isVisible'],
                        'customUrl' => $r['customUrl'] ?? '',
                        'openInNewTab' => (bool)$r['openInNewTab'],
                        'parentId' => $r['parentId'] ?: null
                    ];
                }, $rows);
                echo json_encode(['status' => 'success', 'data' => $data]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'save_nav_menu':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $items = is_array($input) ? $input : ($input['items'] ?? []);
                try {
                    $pdo->exec("CREATE TABLE IF NOT EXISTS `nav_menu_items` (
                        `id` VARCHAR(50) PRIMARY KEY,
                        `property_id` INT NOT NULL DEFAULT 1,
                        `title` VARCHAR(255) NOT NULL,
                        `tab_key` VARCHAR(100) NOT NULL,
                        `unique_key` VARCHAR(100) NOT NULL,
                        `category` VARCHAR(100) DEFAULT 'Main Sections',
                        `icon_name` VARCHAR(100) DEFAULT 'Grid',
                        `display_order` INT NOT NULL DEFAULT 1,
                        `roles_json` TEXT,
                        `is_visible` TINYINT(1) DEFAULT 1,
                        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
                    try { $pdo->exec("ALTER TABLE `nav_menu_items` ADD COLUMN `parent_id` VARCHAR(50) DEFAULT NULL"); } catch (Exception $e) {}

                    // Navigation structure is shared across every property/tenant, so a
                    // save here is not scoped to $propertyId — see get_nav_menu above.
                    $pdo->beginTransaction();
                    $stmt = $pdo->prepare("INSERT INTO nav_menu_items (id, title, tab_key, unique_key, category, icon_name, display_order, roles_json, is_visible, custom_url, open_in_new_tab, parent_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            title = VALUES(title),
                            tab_key = VALUES(tab_key),
                            unique_key = VALUES(unique_key),
                            category = VALUES(category),
                            icon_name = VALUES(icon_name),
                            display_order = VALUES(display_order),
                            roles_json = VALUES(roles_json),
                            is_visible = VALUES(is_visible),
                            custom_url = VALUES(custom_url),
                            open_in_new_tab = VALUES(open_in_new_tab),
                            parent_id = VALUES(parent_id)");

                    foreach ($items as $idx => $item) {
                        $stmt->execute([
                            $item['id'] ?? ('nav-' . ((int)$idx + 1)),
                            $item['title'] ?? 'Menu Item',
                            $item['tabKey'] ?? 'dashboard',
                            $item['uniqueKey'] ?? '',
                            $item['category'] ?? 'Main Sections',
                            $item['iconName'] ?? 'Grid',
                            $item['order'] ?? ((int)$idx + 1),
                            json_encode($item['roles'] ?? []),
                            isset($item['isVisible']) ? ($item['isVisible'] ? 1 : 0) : 1,
                            $item['customUrl'] ?? null,
                            isset($item['openInNewTab']) ? ($item['openInNewTab'] ? 1 : 0) : 0,
                            $item['parentId'] ?? null
                        ]);
                    }

                    if (count($items) > 0) {
                        $keepIds = array_map(function($item) use ($pdo) {
                            return $item['id'] ?? '';
                        }, $items);
                        $keepIds = array_filter($keepIds);
                        if (count($keepIds) > 0) {
                            $placeholders = implode(',', array_fill(0, count($keepIds), '?'));
                            $delStmt = $pdo->prepare("DELETE FROM nav_menu_items WHERE id NOT IN ($placeholders)");
                            $delStmt->execute(array_values($keepIds));
                        }
                    }

                    $pdo->commit();
                    echo json_encode(['status' => 'success', 'message' => 'Navigation menu saved successfully']);
                } catch (PDOException $e) {
                    if ($pdo->inTransaction()) $pdo->rollBack();
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'dedup_menu':
            if ($request_method === 'POST') {
                try {
                    $minIds = $pdo->prepare("SELECT MIN(id) AS keep_id, name FROM menu_items WHERE property_id = ? GROUP BY name");
                    $minIds->execute([$propertyId]);
                    $keepRows = $minIds->fetchAll(PDO::FETCH_ASSOC);
                    $keepIds = array_column($keepRows, 'keep_id');
                    if (count($keepIds) > 0) {
                        $placeholders = implode(',', array_fill(0, count($keepIds), '?'));
                        $stmt = $pdo->prepare("DELETE FROM menu_items WHERE id NOT IN ($placeholders) AND property_id = ?");
                        $stmt->execute(array_merge($keepIds, [$propertyId]));
                        $removed = $stmt->rowCount();
                    } else {
                        $removed = 0;
                    }
                    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM menu_items WHERE property_id = ?");
                    $countStmt->execute([$propertyId]);
                    $count = $countStmt->fetchColumn();
                    echo json_encode(['status' => 'success', 'removed' => $removed, 'remaining' => (int)$count]);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        // ─── Recipe / BOM Engine ───
        case 'get_recipes':
            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS `dish_recipes` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `property_id` INT NOT NULL DEFAULT 1,
                    `menu_item_id` INT NOT NULL,
                    `recipe_name` VARCHAR(255) NOT NULL DEFAULT '',
                    `yield_factor` DECIMAL(10,2) NOT NULL DEFAULT 1.00,
                    `servings` INT NOT NULL DEFAULT 1,
                    `ingredients` JSON NOT NULL,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY `menu_item_idx` (`menu_item_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                $stmt = $pdo->prepare("SELECT dr.menu_item_id, dr.recipe_name, dr.yield_factor, dr.servings, dr.ingredients, COALESCE(m.name, '') AS menu_item_name
                    FROM dish_recipes dr
                    LEFT JOIN menu_items m ON dr.menu_item_id = m.id
                    WHERE dr.property_id = ?
                    ORDER BY dr.updated_at DESC");
                $stmt->execute([$propertyId]);
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $data = array_map(function($r) {
                    $ings = json_decode($r['ingredients'], true) ?: [];
                    return [
                        'menuItemId' => (int)$r['menu_item_id'],
                        'recipeName' => $r['recipe_name'],
                        'yieldFactor' => (float)$r['yield_factor'],
                        'servings' => (int)$r['servings'],
                        'ingredients' => $ings,
                        'menuItemName' => $r['menu_item_name'],
                    ];
                }, $rows);
                echo json_encode(['status' => 'success', 'data' => $data]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'save_recipe':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $pdo->exec("CREATE TABLE IF NOT EXISTS `dish_recipes` (
                        `id` INT AUTO_INCREMENT PRIMARY KEY,
                        `property_id` INT NOT NULL DEFAULT 1,
                        `menu_item_id` INT NOT NULL,
                        `recipe_name` VARCHAR(255) NOT NULL DEFAULT '',
                        `yield_factor` DECIMAL(10,2) NOT NULL DEFAULT 1.00,
                        `servings` INT NOT NULL DEFAULT 1,
                        `ingredients` JSON NOT NULL,
                        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY `menu_item_idx` (`menu_item_id`)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                    $stmt = $pdo->prepare("INSERT INTO dish_recipes (property_id, menu_item_id, recipe_name, yield_factor, servings, ingredients)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            recipe_name = VALUES(recipe_name),
                            yield_factor = VALUES(yield_factor),
                            servings = VALUES(servings),
                            ingredients = VALUES(ingredients)");
                    $stmt->execute([
                        $propertyId,
                        (int)$input['menuItemId'],
                        $input['recipeName'] ?? '',
                        (float)($input['yieldFactor'] ?? 1),
                        (int)($input['servings'] ?? 1),
                        json_encode($input['ingredients'] ?? []),
                    ]);
                    echo json_encode(['status' => 'success', 'message' => 'Recipe saved successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'delete_recipe':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("DELETE FROM dish_recipes WHERE menu_item_id = ? AND property_id = ?");
                    $stmt->execute([(int)$input['menuItemId'], $propertyId]);
                    echo json_encode(['status' => 'success', 'message' => 'Recipe deleted successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        // ─── BOM Stock Depletion Engine ───
        case 'deplete_stock':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $menuItemId = (int)$input['menuItemId'];
                    $servedQty = (int)($input['quantity'] ?? 1);

                    // Fetch the recipe for this menu item
                    $stmt = $pdo->prepare("SELECT ingredients, servings FROM dish_recipes WHERE menu_item_id = ? LIMIT 1");
                    $stmt->execute([$menuItemId]);
                    $recipe = $stmt->fetch(PDO::FETCH_ASSOC);

                    if (!$recipe) {
                        echo json_encode(['status' => 'error', 'message' => 'No recipe found for this menu item']);
                        break;
                    }

                    $ingredients = json_decode($recipe['ingredients'], true) ?: [];
                    $recipeServings = max(1, (int)$recipe['servings']);
                    $scale = $servedQty / $recipeServings;

                    $deductions = [];
                    foreach ($ingredients as $ing) {
                        $name = $ing['name'] ?? '';
                        $qty = (float)($ing['quantity'] ?? 0) * $scale;
                        if (!$name || $qty <= 0) continue;

                        // Deduct from req_catalog by matching item_name (case-insensitive)
                        $upd = $pdo->prepare("UPDATE req_catalog SET current_stock = GREATEST(0, current_stock - ?) WHERE LOWER(item_name) = LOWER(?) AND property_id = ?");
                        $upd->execute([$qty, $name, $propertyId]);

                        $deductions[] = ['item' => $name, 'deducted' => round($qty, 3)];
                    }

                    echo json_encode([
                        'status' => 'success',
                        'message' => 'Stock depleted successfully',
                        'deductions' => $deductions,
                    ]);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'get_staff_meal_options':
            try {
                $pdo->exec("CREATE TABLE IF NOT EXISTS staff_meal_options (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    property_id INT NOT NULL DEFAULT 1,
                    name VARCHAR(255) NOT NULL,
                    cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                    is_system_default TINYINT(1) DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

                $countStmt = $pdo->prepare("SELECT COUNT(*) FROM staff_meal_options WHERE property_id = ?");
                $countStmt->execute([$propertyId]);
                if ((int)$countStmt->fetchColumn() === 0) {
                    // Seed defaults on first use for this property - no hardcoded
                    // options at runtime, just a one-time starting point.
                    $seed = $pdo->prepare("INSERT INTO staff_meal_options (property_id, name, cost, is_system_default) VALUES (?, ?, ?, 1)");
                    $seed->execute([$propertyId, 'Rice, daal and sabzi', 50]);
                    $seed->execute([$propertyId, 'Chapati & Chicken Curry', 80]);
                }

                $stmt = $pdo->prepare("SELECT id, name, cost FROM staff_meal_options WHERE property_id = ? ORDER BY id ASC");
                $stmt->execute([$propertyId]);
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'success', 'data' => []]);
            }
            break;

        case 'add_staff_meal_option':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $name = trim($input['name'] ?? '');
                $cost = floatval($input['cost'] ?? 0);
                if (!$name) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'name is required']);
                    break;
                }
                try {
                    $stmt = $pdo->prepare("INSERT INTO staff_meal_options (property_id, name, cost, is_system_default) VALUES (?, ?, ?, 0)");
                    $stmt->execute([$propertyId, $name, $cost]);
                    echo json_encode(['status' => 'success', 'id' => $pdo->lastInsertId()]);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid menu action']);
            break;
    }
}
