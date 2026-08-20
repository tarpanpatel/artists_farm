<?php
/**
 * Food Menu Catalog & RBAC Menu Manager Module
 * Function: Menu dish inventory, prices, categories, and custom dishes builder.
 */

function handleMenuRequests($pdo, $request_method, $action, $propertyId) {
    require_once __DIR__ . '/../config/schema_cache.php';

    // Ensure menu_items table exists
    try {
        // Upgrade image_path from VARCHAR(255) to TEXT if needed
        if (!isSchemaVerified('schema_menu_items_image')) {
            try { $pdo->exec("ALTER TABLE `menu_items` MODIFY COLUMN `image_path` TEXT DEFAULT ''"); } catch (Exception $e) {}
            markSchemaVerified('schema_menu_items_image');
        }
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

                if (empty($rows)) {
                    // Auto-seed standard starter menu items for new property
                    $defaultMenu = [
                        ['name' => 'OTC Pizza', 'category' => 'Pizza & Sandwich', 'price' => 198],
                        ['name' => 'Paneer Pizza', 'category' => 'Pizza & Sandwich', 'price' => 298],
                        ['name' => 'Veg Cheese Burger', 'category' => 'Pizza & Sandwich', 'price' => 140],
                        ['name' => 'Paneer Tikka', 'category' => 'Starters', 'price' => 260],
                        ['name' => 'Hara Bhara Kebab', 'category' => 'Starters', 'price' => 220],
                        ['name' => 'Crispy Corn', 'category' => 'Starters', 'price' => 180],
                        ['name' => 'Paneer Butter Masala', 'category' => 'Main Course', 'price' => 280],
                        ['name' => 'Dal Tadka', 'category' => 'Main Course', 'price' => 210],
                        ['name' => 'Butter Naan', 'category' => 'Rice & Roti', 'price' => 45],
                        ['name' => 'Jeera Rice', 'category' => 'Rice & Roti', 'price' => 150],
                        ['name' => 'Masala Chai', 'category' => 'Beverages', 'price' => 40],
                        ['name' => 'Cold Coffee with Ice Cream', 'category' => 'Beverages', 'price' => 120],
                        ['name' => 'Fresh Lime Soda', 'category' => 'Beverages', 'price' => 80],
                        ['name' => 'Gulab Jamun (2 Pcs)', 'category' => 'Desserts', 'price' => 90],
                    ];

                    foreach ($defaultMenu as $item) {
                        try {
                            $stmt = $pdo->prepare("INSERT INTO menu_items (property_id, category_id, name, price, is_hidden, image_path) VALUES (?, 1, ?, ?, 0, '')");
                            $stmt->execute([$propertyId, $item['name'], $item['price']]);
                        } catch (Exception $seedErr) {
                            try {
                                $stmt = $pdo->prepare("INSERT INTO menu_items (property_id, name, category, price, available, image_path) VALUES (?, ?, ?, ?, 1, '')");
                                $stmt->execute([$propertyId, $item['name'], $item['category'], $item['price']]);
                            } catch (Exception $seedErr2) {}
                        }
                    }

                    // Re-fetch after seeding
                    try {
                        $stmt = $pdo->prepare($sql);
                        $stmt->execute([$propertyId]);
                        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    } catch (PDOException $e1) {
                        $stmt = $pdo->prepare("SELECT id, name, NULL AS category_id, category, price, available, image_path FROM menu_items WHERE property_id = ? ORDER BY category ASC, name ASC");
                        $stmt->execute([$propertyId]);
                        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    }
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


                // Navigation structure is shared across every property/tenant (unlike
                // property_modules, which controls per-property feature visibility on
                // top of this shared structure) — intentionally not property_id-scoped.
                // Restore the two active staff views if they were lost from an older
                // saved navigation layout. Other historic page options deliberately
                // remain unlinked; these are the only staff pages requested in the
                // tenant sidebar.
                $pdo->exec("INSERT IGNORE INTO nav_menu_items
                    (id, property_id, title, tab_key, unique_key, url_slug, category, icon_name, display_order, roles_json, is_visible, parent_id)
                    VALUES
                    ('nav-kitchen-overview', 1, 'Kitchen', 'kitchen', 'kitchen_overview', 'kitchen_overview', 'Kitchen & Food', 'Utensils', 10, '[\"Super Admin\",\"Admin\",\"Staff Kitchen\",\"Staff Supervisor\",\"Staff\"]', 1, NULL),
                    ('nav-staff-permissions', 1, 'Staff & Permissions', 'staff', 'staff_permissions', 'staff_permissions', 'Staff & HR', 'ShieldCheck', 30, '[\"Super Admin\",\"Admin\"]', 1, NULL),
                    ('nav-attendance-calendar', 1, 'Attendance Calendar', 'staff', 'attendance_calendar', 'attendance_calendar', 'Staff & HR', 'CalendarDays', 31, '[\"Super Admin\",\"Admin\",\"Staff Supervisor\"]', 1, NULL)");
                try {
                    $pdo->exec("UPDATE nav_menu_items SET title = 'Attendance Calendar' WHERE unique_key = 'attendance_calendar'");
                    $pdo->exec("UPDATE nav_menu_items SET unique_key = 'finances', title = 'Finances', url_slug = 'finances', icon_name = 'Landmark' WHERE unique_key = 'cash_drawer'");
                    $pdo->exec("DELETE FROM nav_menu_items WHERE unique_key = 'purchase_analytics'");
                    $pdo->exec("DELETE FROM nav_menu_items WHERE unique_key = 'fulfill_stock_req'");
                    // kitchen_purchases folded into the unified Expenses page, stock_log folded
                    // into Edit Kitchen Stock (16-17 Aug 2026) - still real routes (App.tsx maps
                    // them), just no longer their own sidebar entries. Delete here so every
                    // environment's nav_menu_items converges, the same way fulfill_stock_req does
                    // above - this was previously only done as a one-off manual DB edit on this
                    // environment, which is why staging still showed all three as separate items.
                    $pdo->exec("DELETE FROM nav_menu_items WHERE unique_key = 'kitchen_purchases'");
                    $pdo->exec("DELETE FROM nav_menu_items WHERE unique_key = 'stock_log'");
                    // iCal Sync was never meant to be its own sidebar page (17 Aug 2026) - it's
                    // embedded directly in Edit Property for single properties
                    // (EditPropertyPage.tsx) and in the Units page for multi-key properties
                    // (MultiKeyPropertyOverview.tsx). Someone added it as a standalone nav item
                    // via the Nav Menu Editor UI when the feature was built; App.tsx's routeMap
                    // already redirects the 'ical_sync_manager'/'ical_sync' hashes into
                    // edit_property, so the standalone entry was always redundant, never wired
                    // to its own page.
                    $pdo->exec("DELETE FROM nav_menu_items WHERE unique_key = 'ical_sync_manager'");
                    $pdo->exec("UPDATE nav_menu_items SET title = 'Reports & Earnings' WHERE unique_key = 'dashboard_analytics'");
                    $pdo->exec("UPDATE nav_menu_items SET title = 'Past Bills & Receipts' WHERE unique_key = 'past_receipts_log'");
                    $pdo->exec("UPDATE nav_menu_items SET title = 'Menu & Pricing' WHERE unique_key = 'edit_items_group'");
                    $pdo->exec("UPDATE nav_menu_items SET title = 'Extra Charges & Fees' WHERE unique_key = 'misc_charges'");
                    $pdo->exec("UPDATE nav_menu_items SET title = 'Telegram Alerts' WHERE unique_key = 'telegram'");
                    $pdo->exec("UPDATE nav_menu_items SET title = 'Download Data & Excel' WHERE unique_key = 'data_export_center'");
                    $pdo->exec("UPDATE nav_menu_items SET title = 'Dish Recipes (Auto-Stock)' WHERE unique_key = 'beta_recipe_builder'");
                    $pdo->exec("UPDATE nav_menu_items SET title = 'Property Licenses' WHERE unique_key = 'license_management'");
                    // Renamed 21 Aug 2026 (explicit request) - "Team" parent
                    // click now goes straight here instead of a separate
                    // overview launchpad (see App.tsx's routeMap), so this
                    // is effectively the page the whole "Team" section opens
                    // into now, not just one item under it.
                    $pdo->exec("UPDATE nav_menu_items SET title = 'Team & Access' WHERE unique_key = 'staff_permissions'");
                    $pdo->exec("UPDATE nav_menu_items SET parent_id = 'nav-kitchen-overview' WHERE unique_key IN ('take_food_order', 'kitchen_orders', 'staff_meals', 'stock_requests', 'deficit_shortfalls_log', 'stock_log', 'kitchen_purchases', 'edit_food_menu', 'edit_kitchen_stock') AND (parent_id IS NULL OR parent_id = '')");
                    $pdo->exec("UPDATE nav_menu_items SET custom_url = NULL, open_in_new_tab = 0 WHERE custom_url IS NOT NULL AND (LOWER(title) = 'team' OR unique_key IN ('team', 'team_overview'))");
                    $pdo->exec("DELETE FROM nav_menu_items WHERE custom_url IS NOT NULL AND custom_url != '' AND LOWER(title) = 'team'");
                    $pdo->exec("UPDATE nav_menu_items SET url_slug = 'team' WHERE (LOWER(title) = 'team' OR unique_key IN ('team', 'team_overview')) AND (url_slug LIKE 'custom_nav%' OR url_slug = 'team_overview' OR url_slug IS NULL)");
                } catch (Exception $e) {}
                $stmt = $pdo->query("SELECT id, title, tab_key as tabKey, unique_key as uniqueKey, COALESCE(NULLIF(url_slug, ''), unique_key) as urlSlug, category, icon_name as iconName, display_order as `order`, roles_json, is_visible as isVisible, COALESCE(custom_url, '') as customUrl, IFNULL(open_in_new_tab, 0) as openInNewTab, parent_id as parentId FROM nav_menu_items ORDER BY display_order ASC");
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $data = array_map(function($r) {
                    return [
                        'id' => (string)$r['id'],
                        'title' => $r['title'],
                        'tabKey' => $r['tabKey'],
                        'uniqueKey' => $r['uniqueKey'],
                        'urlSlug' => $r['urlSlug'],
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
                    if (!isSchemaVerified('schema_nav_menu_items')) {
                        try { $pdo->exec("ALTER TABLE `nav_menu_items` ADD COLUMN `parent_id` VARCHAR(50) DEFAULT NULL"); } catch (Exception $e) {}
                        try { $pdo->exec("ALTER TABLE `nav_menu_items` ADD COLUMN `url_slug` VARCHAR(100) DEFAULT NULL"); } catch (Exception $e) {}
                        markSchemaVerified('schema_nav_menu_items');
                    }

                    // Navigation structure is shared across every property/tenant, so a
                    // save here is not scoped to $propertyId — see get_nav_menu above.
                    $pdo->beginTransaction();
                    $stmt = $pdo->prepare("INSERT INTO nav_menu_items (id, title, tab_key, unique_key, url_slug, category, icon_name, display_order, roles_json, is_visible, custom_url, open_in_new_tab, parent_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            title = VALUES(title),
                            tab_key = VALUES(tab_key),
                            unique_key = VALUES(unique_key),
                            url_slug = VALUES(url_slug),
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
                            $item['urlSlug'] ?? ($item['uniqueKey'] ?? null),
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

        case 'get_staff_meal_logs':
            try {

                $stmt = $pdo->prepare("SELECT id, staff_names, food_description, is_leftover_buffer, logged_at FROM staff_meal_logs WHERE property_id = ? ORDER BY logged_at DESC LIMIT 200");
                $stmt->execute([$propertyId]);
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'success', 'data' => []]);
            }
            break;

        case 'add_staff_meal_log':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $staffNames = trim($input['staff_names'] ?? '');
                $foodDescription = trim($input['food_description'] ?? '');
                $isLeftover = !empty($input['is_leftover_buffer']) ? 1 : 0;
                if (!$staffNames || !$foodDescription) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'staff_names and food_description are required']);
                    break;
                }
                try {

                    $stmt = $pdo->prepare("INSERT INTO staff_meal_logs (property_id, staff_names, food_description, is_leftover_buffer) VALUES (?, ?, ?, ?)");
                    $stmt->execute([$propertyId, $staffNames, $foodDescription, $isLeftover]);
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
