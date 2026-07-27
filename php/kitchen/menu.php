<?php
/**
 * Food Menu Catalog & RBAC Menu Manager Module
 * Function: Menu dish inventory, prices, categories, and custom dishes builder.
 */

function handleMenuRequests($pdo, $request_method, $action) {
    // Ensure menu_items table exists
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS `menu_items` (
            `id` VARCHAR(50) PRIMARY KEY,
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
                        ORDER BY COALESCE(c.sort_order, 99) ASC, m.name ASC";
                try {
                    $stmt = $pdo->query($sql);
                    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                } catch (PDOException $e1) {
                    // Fallback query for DB schema with category column directly
                    $stmt = $pdo->query("SELECT id, name, NULL AS category_id, category, price, available, image_path FROM menu_items ORDER BY category ASC, name ASC");
                    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                }

                $data = array_map(function($r) {
                    return [
                        'id' => (string)$r['id'],
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
                        $stmt = $pdo->prepare("INSERT INTO menu_items (category_id, name, price, is_hidden, image_path) VALUES (?, ?, ?, ?, ?)");
                        $stmt->execute([
                            $catId,
                            $input['name'],
                            $input['price'],
                            isset($input['available']) && !$input['available'] ? 1 : 0,
                            $input['imagePath'] ?? ''
                        ]);
                    } catch (PDOException $e1) {
                        $stmt = $pdo->prepare("INSERT INTO menu_items (id, name, category, price, available, image_path) VALUES (?, ?, ?, ?, ?, ?)");
                        $stmt->execute([
                            $input['id'] ?? ('m-' . time()),
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
                        $stmt = $pdo->prepare("UPDATE menu_items SET name = COALESCE(?, name), category_id = COALESCE(?, category_id), price = COALESCE(?, price), is_hidden = COALESCE(?, is_hidden), image_path = COALESCE(?, image_path) WHERE id = ?");
                        $stmt->execute([
                            $input['name'] ?? null,
                            $catId,
                            isset($input['price']) ? $input['price'] : null,
                            isset($input['available']) ? ($input['available'] ? 0 : 1) : null,
                            $input['imagePath'] ?? null,
                            $input['id']
                        ]);
                    } catch (PDOException $e1) {
                        $stmt = $pdo->prepare("UPDATE menu_items SET name = COALESCE(?, name), category = COALESCE(?, category), price = COALESCE(?, price), available = COALESCE(?, available), image_path = COALESCE(?, image_path) WHERE id = ?");
                        $stmt->execute([
                            $input['name'] ?? null,
                            $input['category'] ?? null,
                            isset($input['price']) ? $input['price'] : null,
                            isset($input['available']) ? ($input['available'] ? 1 : 0) : null,
                            $input['imagePath'] ?? null,
                            $input['id']
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
                    $stmt = $pdo->prepare("DELETE FROM menu_items WHERE id = ?");
                    $stmt->execute([$input['id']]);
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

                $stmt = $pdo->query("SELECT id, title, tab_key as tabKey, unique_key as uniqueKey, category, icon_name as iconName, display_order as `order`, roles_json, is_visible as isVisible, COALESCE(custom_url, '') as customUrl, IFNULL(open_in_new_tab, 0) as openInNewTab FROM nav_menu_items ORDER BY display_order ASC");
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
                        'openInNewTab' => (bool)$r['openInNewTab']
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

                    $pdo->beginTransaction();
                    $stmt = $pdo->prepare("INSERT INTO nav_menu_items (id, title, tab_key, unique_key, category, icon_name, display_order, roles_json, is_visible, custom_url, open_in_new_tab)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                            open_in_new_tab = VALUES(open_in_new_tab)");

                    foreach ($items as $idx => $item) {
                        $stmt->execute([
                            $item['id'] ?? ('nav-' . ($idx + 1)),
                            $item['title'] ?? 'Menu Item',
                            $item['tabKey'] ?? 'dashboard',
                            $item['uniqueKey'] ?? '',
                            $item['category'] ?? 'Main Sections',
                            $item['iconName'] ?? 'Grid',
                            $item['order'] ?? ($idx + 1),
                            json_encode($item['roles'] ?? []),
                            isset($item['isVisible']) ? ($item['isVisible'] ? 1 : 0) : 1,
                            $item['customUrl'] ?? null,
                            isset($item['openInNewTab']) ? ($item['openInNewTab'] ? 1 : 0) : 0
                        ]);
                    }
                    $pdo->commit();
                    echo json_encode(['status' => 'success', 'message' => 'Navigation menu saved successfully']);
                } catch (PDOException $e) {
                    if ($pdo->inTransaction()) $pdo->rollBack();
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
