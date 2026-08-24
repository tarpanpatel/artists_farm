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
            // Self-heal block below (seed rows + ~15 idempotent renames/deletes) used to
            // run on every single get_nav_menu call, unconditionally - this is a global,
            // unscoped nav structure the sidebar/every editor screen fetches on basically
            // every page load, so that's 15+ synchronous write queries per load, not once.
            // Gated behind isSchemaVerified() now, same pattern every other self-heal block
            // in this app already uses, instead of re-running the same no-op writes forever
            // (found 21 Aug 2026, reported as "Edit Main Menu takes ages to load").
            if (!isSchemaVerified('nav_menu_self_heal_v2')) {
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
                    ('nav-kitchen-overview', 1, 'Kitchen', 'kitchen', 'kitchen_overview', 'kitchen_overview', 'Kitchen & Food', 'Utensils', 10, '[\"Super Admin\",\"Admin\",\"Staff Kitchen\",\"Staff Supervisor\"]', 1, NULL),
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
                    // Generic "Staff" role must NOT get Kitchen access (23 Aug 2026,
                    // reported live as "staff level access is incorrect" - Staff on
                    // staging could see Take Food Order/Kitchen Live Orders/Staff Meals).
                    // This was previously "fixed" 22 Aug 2026 by hand-editing the live
                    // nav_menu_items rows on local only (not a code change, and not this
                    // seed's own INSERT literal above, which still planted "Staff" into
                    // every fresh kitchen_overview row until this same edit) - local's
                    // separate `artists_farm_resort` DB and staging/production's separate
                    // `apartment_site` DB (see database.php) never shared that one-off row
                    // edit, so staging kept the old grant. Same root cause explicitly
                    // called out by the kitchen_purchases/stock_log DELETEs above ("only
                    // done as a one-off manual DB edit on this environment"). Targeted
                    // string removal (not a full roles_json overwrite) so any other
                    // environment-specific role customization already on a row (e.g.
                    // take_food_order locally also carries legacy "Manager"/"Chef" roles
                    // not seeded anywhere in code) survives untouched.
                    $pdo->exec("UPDATE nav_menu_items SET roles_json = REPLACE(REPLACE(roles_json, '\"Staff\",', ''), ',\"Staff\"', '') WHERE unique_key IN ('kitchen_overview', 'take_food_order', 'kitchen_orders', 'staff_meals')");
                } catch (Exception $e) {}
            } catch (Exception $e) {}
                markSchemaVerified('nav_menu_self_heal_v2');
            }

            // v3 (23 Aug 2026, reported live via ROLES.md review): three more environment-drift
            // fixes, same "v2 already ran on some environments so a new version is needed to
            // re-fire" reasoning as above.
            //   1. "Past Guests" - a nav item pointing at a REMOVED feature (the old
            //      GuestHistory/"Past Guests" archive view - see GuestManagement.tsx's own comment
            //      on its now-unused focusGuestId/onClearFocusGuest props). Someone added a nav
            //      entry for it via the Nav Menu Editor at some point; the page behind it no longer
            //      exists in App.tsx's routeMap, so it was a dead link for every role that had it,
            //      "Staff" included. Doesn't exist in local's nav_menu_items at all (confirmed) -
            //      staging-only drift. Matched by title/unique_key/tab_key rather than a single
            //      known id, since its exact id is unknown from local.
            //   2. Telegram Alerts - policy is Super Admin + Admin ONLY, no exceptions. Full
            //      roles_json overwrite (not the targeted-string-removal technique the kitchen
            //      fix above uses) because the end state here is fully and unambiguously known,
            //      unlike kitchen_overview/take_food_order which deliberately preserve unrelated
            //      legacy roles (Manager/Chef) already sitting on those rows.
            //   3. Dish Recipes (Auto-Stock) - policy is Super Admin + Admin only; Staff Kitchen
            //      was incorrectly still granted this (confirmed in local's own nav_menu_items,
            //      not just staging - this one was never environment-specific).
            if (!isSchemaVerified('nav_menu_self_heal_v3')) {
                try {
                    $pdo->exec("DELETE FROM nav_menu_items WHERE LOWER(title) = 'past guests' OR unique_key LIKE '%past_guest%' OR tab_key LIKE '%past_guest%'");
                    $pdo->exec("UPDATE nav_menu_items SET roles_json = '[\"Super Admin\",\"Admin\"]' WHERE unique_key = 'telegram'");
                    $pdo->exec("UPDATE nav_menu_items SET roles_json = '[\"Super Admin\",\"Admin\"]' WHERE unique_key = 'beta_recipe_builder'");
                } catch (Exception $e) {}
                markSchemaVerified('nav_menu_self_heal_v3');
            }

            // v4 (24 Aug 2026, ROLES.md's "Staff kitchen order-status view" open
            // follow-up): a scoped-down Kitchen entry for the generic `Staff` role
            // ONLY - live orders + served orders + "Mark Served", not the full
            // Kitchen module. Deliberately its own standalone nav item rather than
            // adding "Staff" back into kitchen_overview/take_food_order's
            // roles_json - that's the single umbrella permission every other
            // Kitchen sub-page (Take Order, Menu Catalog, Requisitions, Staff
            // Meals, Recipe Builder) keys off of, so widening it would silently
            // reopen the full module the 23 Aug fix deliberately closed for Staff.
            // tab_key 'kitchen' + unique_key 'staff_kitchen_status' resolves to
            // KitchenManagement via App.tsx's live-nav-item routeMap fallback
            // (uniqueKeys not in its static routeMap fall back to the item's own
            // tabKey); KitchenManagement.tsx's own isRestrictedStaffKitchenView
            // check (activeRole === 'Staff') does the actual UI restriction once
            // there. INSERT IGNORE so re-running this after someone deletes/edits
            // the row via the Nav Menu Editor doesn't resurrect it.
            // SUPERSEDED by v5 immediately below, same day - left in place
            // unmodified (self-heal blocks never get edited after shipping, see
            // v2->v3's own precedent) purely so environments that already ran v4
            // have a historical record of what markSchemaVerified('nav_menu_self_heal_v4')
            // actually did; v5 deletes what this block inserted.
            if (!isSchemaVerified('nav_menu_self_heal_v4')) {
                try {
                    $pdo->exec("INSERT IGNORE INTO nav_menu_items
                        (id, property_id, title, tab_key, unique_key, url_slug, category, icon_name, display_order, roles_json, is_visible, parent_id)
                        VALUES
                        ('nav-staff-kitchen-status', 1, 'Kitchen Order Status', 'kitchen', 'staff_kitchen_status', 'staff_kitchen_status', 'Kitchen & Food', 'Utensils', 2, '[\"Staff\"]', 1, NULL)");
                } catch (Exception $e) {}
                markSchemaVerified('nav_menu_self_heal_v4');
            }

            // v5 (24 Aug 2026, same day correction - explicit product direction):
            // "the nav tree must never change shape for a role - a role with access
            // to Food Orders only reaches it via Kitchen > Food Orders, same as
            // every other role, so that if that role is ever granted MORE kitchen
            // access later, its menu just gains siblings under the SAME already-
            // familiar 'Kitchen' parent instead of the whole navigation shape
            // changing out from under them." v4's standalone top-level item broke
            // that rule. Fix:
            //   1. Delete the standalone 'staff_kitchen_status' row v4 inserted.
            //   2. Grant `Staff` the real "Kitchen" (kitchen_overview) parent row
            //      AND its "Food Orders" (take_food_order) child row - both are
            //      required: App.tsx's canSeeNavKey()/kitchenAccessAllowed/sidebar
            //      filtering all key off the CHILD's own roles_json, but
            //      isRouteAllowed()'s special-case bypass for the
            //      'take_food_order'/'kitchen_orders' keys deliberately checks the
            //      PARENT (kitchen_overview) row's roles instead (see that
            //      function's own 23 Aug comment) - granting only one of the two
            //      would either hide the sidebar link entirely or show it but bounce
            //      the click straight back to Dashboard.
            // KitchenManagement.tsx's isRestrictedStaffKitchenView flag (unchanged
            // from v4/24 Aug) still does the actual UI restriction once Staff is
            // inside the page - only now they arrive via the same real "Food
            // Orders" child every other kitchen-enabled role uses, landing on the
            // Live Tickets tab instead of Take Order (see that file's
            // isRestrictedStaffKitchenView-gated getInitialTab() override), rather
            // than via a synthetic shortcut item that doesn't exist for anyone else.
            // json_decode/encode round-trip (not the v2 block's string REPLACE
            // technique) so this stays correct regardless of each row's current
            // roles_json contents and never duplicates "Staff" on a re-run.
            if (!isSchemaVerified('nav_menu_self_heal_v5')) {
                try {
                    $pdo->exec("DELETE FROM nav_menu_items WHERE unique_key = 'staff_kitchen_status'");
                    foreach (['take_food_order', 'kitchen_overview'] as $grantKey) {
                        $stmt = $pdo->prepare("SELECT id, roles_json FROM nav_menu_items WHERE unique_key = ?");
                        $stmt->execute([$grantKey]);
                        $row = $stmt->fetch(PDO::FETCH_ASSOC);
                        if ($row) {
                            $roles = json_decode($row['roles_json'] ?? '[]', true) ?: [];
                            if (!in_array('Staff', $roles, true)) {
                                $roles[] = 'Staff';
                                $upd = $pdo->prepare("UPDATE nav_menu_items SET roles_json = ? WHERE id = ?");
                                $upd->execute([json_encode($roles), $row['id']]);
                            }
                        }
                    }
                } catch (Exception $e) {}
                markSchemaVerified('nav_menu_self_heal_v5');
            }
            try {
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
                    // Snapshot the pre-save roles_json per unique_key here (before the
                    // transaction below overwrites it) purely for the audit diff after
                    // the save succeeds - see that comment for why.
                    $oldRolesByKey = [];
                    try {
                        $oldRows = $pdo->query("SELECT unique_key, title, roles_json FROM nav_menu_items")->fetchAll(PDO::FETCH_ASSOC);
                        foreach ($oldRows as $r) {
                            $oldRolesByKey[$r['unique_key']] = ['title' => $r['title'], 'roles' => $r['roles_json']];
                        }
                    } catch (Exception $eSnap) {}

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

                    // Audit trail (24 Aug 2026, extending the fix applied to
                    // update_property/staff account CRUD) - this changes WHO can
                    // access WHAT across every tenant on the platform (roles_json
                    // is shared, unscoped by property - see the comment above),
                    // arguably the single most security-relevant action in this
                    // whole file, and previously had zero audit trail at all.
                    // Diffs the pre-save snapshot above against the saved payload
                    // to list exactly which nav items had a role-visibility
                    // change, rather than just "menu saved".
                    try {
                        $changedItems = [];
                        foreach ($items as $item) {
                            $uk = $item['uniqueKey'] ?? '';
                            if ($uk === '') continue;
                            $newRolesJson = json_encode($item['roles'] ?? []);
                            $old = $oldRolesByKey[$uk] ?? null;
                            if (!$old || $old['roles'] !== $newRolesJson) {
                                $changedItems[] = $item['title'] ?? $uk;
                            }
                        }
                        $auditUser = $_SESSION['username'] ?? 'System';
                        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
                        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                        $actionMsg = empty($changedItems)
                            ? 'Saved navigation menu (no role changes)'
                            : 'Saved navigation menu - role changes: ' . implode(', ', array_slice($changedItems, 0, 10)) . (count($changedItems) > 10 ? ' +' . (count($changedItems) - 10) . ' more' : '');
                        $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (property_id, action, timestamp, user, ip_address, user_agent, status, module) VALUES (?, ?, NOW(), ?, ?, ?, 'Success', 'nav_menu_permissions')");
                        $stmtAudit->execute([$propertyId, $actionMsg, $auditUser, $ip, $ua]);
                    } catch (Exception $eAudit) {}
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
                // Optional custom timestamp from the "Date & Time of Record"
                // field (src/components/KitchenManagement.tsx's Staff Meals
                // tab) - previously never sent at all, so that field was
                // decorative: logged_at always fell back to the column's own
                // DEFAULT CURRENT_TIMESTAMP regardless of what was picked
                // (found + fixed 21 Aug 2026). Validated via
                // DateTime::createFromFormat rather than trusted as-is, since
                // it's client-supplied; falls back to NOW() on anything
                // missing/malformed rather than rejecting the whole request.
                $loggedAtRaw = trim($input['logged_at'] ?? '');
                $loggedAt = date('Y-m-d H:i:s');
                if ($loggedAtRaw !== '') {
                    $parsed = DateTime::createFromFormat('Y-m-d H:i:s', $loggedAtRaw);
                    if ($parsed !== false) {
                        $loggedAt = $parsed->format('Y-m-d H:i:s');
                    }
                }
                try {

                    $stmt = $pdo->prepare("INSERT INTO staff_meal_logs (property_id, staff_names, food_description, is_leftover_buffer, logged_at) VALUES (?, ?, ?, ?, ?)");
                    $stmt->execute([$propertyId, $staffNames, $foodDescription, $isLeftover, $loggedAt]);
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
