<?php
/**
 * Demo Data Generator
 * Populates system with realistic sample data for testing and demos
 * Each call refreshes the demo data
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../modules/module_manager.php';

// The router starts the session when this file is require_once'd; a direct hit
// needs its own boot so the auth gate below can see $_SESSION['username'].
if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.cookie_httponly', 1);
    session_name('artists_farm_session');
    session_start();
}

// Ensure the is_demo flag exists on every table the generator writes to and
// clearDemoData() filters deletes by. Split out so both generateDemoData()
// and clearDemoData() can call it first - clearDemoData() is also reachable
// standalone (the modal's "Exit Test Mode" action), and on a property whose
// tables never had a demo cycle run against them yet, its is_demo = 1 WHERE
// clauses would otherwise fail with "Unknown column 'is_demo'" before the
// ALTER ever got a chance to run.
function ensureDemoSchema($pdo) {
    $alterCols = [
        "ALTER TABLE `staff_users` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `guests` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `menu_items` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `req_catalog` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `petty_cash` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `audit_logs` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `service_requests` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `order_items` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `staff_meal_logs` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
    ];
    foreach ($alterCols as $sql) {
        try { $pdo->exec($sql); } catch (PDOException $e) {}
    }
}

function generateDemoData($pdo, $propertyId) {
    // Check if dummy history mode is enabled
    try {
        $stmt = $pdo->prepare("SELECT dummy_history_enabled FROM properties WHERE id = ?");
        $stmt->execute([$propertyId]);
        $dummyHistoryEnabled = (bool)($stmt->fetchColumn() ?: 0);
        if ($dummyHistoryEnabled) {
            return ['status' => 'success', 'message' => 'Dummy history mode active - data is fixed'];
        }
    } catch (PDOException $e) {}

    ensureDemoSchema($pdo);

    // Always start from a clean slate.
    clearDemoData($pdo, $propertyId);

    try {
        $pdo->beginTransaction();

        // 1. Demo Users (Staff with different roles)
        // A property mid-onboarding (empty address) reads as a fresh, half-set-up
        // account, not a site that's supposedly been running for a month - fill it
        // in, but only if it's genuinely empty so this never overwrites a real
        // property's real address if the generator is ever pointed at one.
        $addrStmt = $pdo->prepare("SELECT address FROM properties WHERE id = ?");
        $addrStmt->execute([$propertyId]);
        if (empty($addrStmt->fetchColumn())) {
            $pdo->prepare("UPDATE properties SET address = ?, google_maps_link = ? WHERE id = ?")
                ->execute(['221 Ocean Drive, Candolim, North Goa, Goa 403515', 'https://maps.app.goo.gl/8xQz3vN2kP9r7T4A6', $propertyId]);
        }

        $demoUsers = [
            ['username' => 'demo_manager', 'name' => 'Demo Manager', 'phone' => '9876543210', 'role' => 'Manager', 'status' => 'Active'],
            ['username' => 'demo_chef', 'name' => 'Demo Chef', 'phone' => '9876543211', 'role' => 'Chef/Cook', 'status' => 'Active'],
            ['username' => 'demo_house', 'name' => 'Demo Housekeeping', 'phone' => '9876543212', 'role' => 'Housekeeping', 'status' => 'Active'],
            ['username' => 'demo_reception', 'name' => 'Demo Reception', 'phone' => '9876543213', 'role' => 'Manager/Reception', 'status' => 'Active'],
        ];

        foreach ($demoUsers as $user) {
            $userId = 'DEMO-' . uniqid();
            $stmt = $pdo->prepare("
                INSERT IGNORE INTO staff_users (id, property_id, username, full_name, phone, role, status, is_demo, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW())
            ");
            $stmt->execute([$userId, $propertyId, $user['username'], $user['name'], $user['phone'], $user['role'], $user['status']]);
        }

        // 2. Rooms - ensure 5 demo rooms exist with varied default tariffs
        $requiredRooms = [
            ['name' => 'Room 101', 'slug' => 'room-101', 'tariff' => 2200],
            ['name' => 'Room 102', 'slug' => 'room-102', 'tariff' => 2500],
            ['name' => 'Room 103', 'slug' => 'room-103', 'tariff' => 2000],
            ['name' => 'Room 104', 'slug' => 'room-104', 'tariff' => 1800],
            ['name' => 'Room 105', 'slug' => 'room-105', 'tariff' => 2400],
        ];

        $roomIds = [];
        foreach ($requiredRooms as $requiredRoom) {
            $checkStmt = $pdo->prepare("SELECT id FROM properties WHERE parent_property_id = ? AND name = ? AND is_deleted = 0");
            $checkStmt->execute([$propertyId, $requiredRoom['name']]);
            $existing = $checkStmt->fetchColumn();

            if (!$existing) {
                // properties.slug is globally unique, not scoped per-property, so the
                // plain 'room-101' etc. slug only survives the very first property this
                // generator ever ran against - every property after that collides with
                // the same slug already taken. Suffix with the parent property id.
                $roomSlug = $requiredRoom['slug'] . '-' . $propertyId;
                $createStmt = $pdo->prepare("
                    INSERT INTO properties (parent_property_id, name, slug, property_type, is_active, default_tariff, created_at)
                    VALUES (?, ?, ?, 'MULTI_KEY_ROOM', 1, ?, NOW())
                ");
                $createStmt->execute([$propertyId, $requiredRoom['name'], $roomSlug, $requiredRoom['tariff']]);
            } else {
                $updateStmt = $pdo->prepare("UPDATE properties SET default_tariff = ? WHERE id = ?");
                $updateStmt->execute([$requiredRoom['tariff'], $existing]);
            }
        }

        // Re-fetch all room IDs with their tariffs
        $roomStmt = $pdo->prepare("
            SELECT id, name, default_tariff FROM properties
            WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM' AND is_deleted = 0
            ORDER BY name ASC
        ");
        $roomStmt->execute([$propertyId]);
        $rooms = $roomStmt->fetchAll(PDO::FETCH_ASSOC);
        $roomIds = array_column($rooms, 'id');
        $roomTariffs = [];
        foreach ($rooms as $r) {
            $roomTariffs[(int)$r['id']] = (float)$r['default_tariff'];
        }

        if (empty($roomIds)) {
            $roomIds = [null];
            $rooms = [['id' => null, 'name' => 'N/A', 'default_tariff' => 2000]];
        }

        // 3. Demo Guests - realistic bookings across 37-day window (-30 to +7)
        $today = new DateTime('today');
        $windowStart = (clone $today)->modify('-30 days');
        $windowEnd = (clone $today)->modify('+7 days');
        $windowDays = 37;

        // Generate bookings per room: ~70% occupancy, 6-9 stays, 2-5 nights each
        $guestNames = [
            'Arjun Mehta', 'Priya Sharma', 'Rahul Verma', 'Sneha Kapoor', 'Vikram Singh',
            'Ananya Iyer', 'Karthik Reddy', 'Divya Nair', 'Rohan Joshi', 'Meera Pillai',
            'Siddharth Rao', 'Kavya Menon', 'Aditya Varma', 'Pooja Bhatt', 'Varun Malhotra'
        ];

        $allBookings = [];
        $nameIndex = 0;

        foreach ($rooms as $roomIdx => $room) {
            $roomId = $room['id'];
            $tariff = $room['default_tariff'] ?? 2000;
            $stayCount = 6 + array_rand(range(0, 3)); // 6-9 stays
            $targetOccupiedDays = (int)($windowDays * (0.65 + (array_rand([0, 5, 10, 15]) / 100))); // 65-75%
            $stayLengths = [];
            $totalNights = 0;
            for ($i = 0; $i < $stayCount; $i++) {
                $len = rand(2, 5);
                $stayLengths[] = $len;
                $totalNights += $len;
            }
            // Scale stay lengths to match target occupancy
            if ($totalNights > 0 && $targetOccupiedDays > 0) {
                $scale = min(1.0, $targetOccupiedDays / $totalNights);
                $stayLengths = array_map(function($len) use ($scale) {
                    return max(2, (int)round($len * $scale));
                }, $stayLengths);
                $totalNights = array_sum($stayLengths);
            }

            // Generate stay dates scattered across the window. $d must start as a
            // clone, not a reference to $windowStart itself - DateTime is mutable,
            // so $d->modify() below was advancing the shared $windowStart in place
            // on every call. First room in the property got a real date window;
            // every room after it saw $windowStart already past $windowEnd, so
            // $availableDays came back empty and the loop below crashed trying to
            // clone a non-existent $availableDays[0].
            $stayDates = [];
            $availableDays = [];
            for ($d = clone $windowStart; $d <= $windowEnd; $d->modify('+1 day')) {
                $availableDays[] = clone $d;
            }

            $idx = 0;
            $attempts = 0;
            while ($idx < count($stayLengths) && $attempts < 100) {
                $attempts++;
                $startOffset = rand(0, max(0, count($availableDays) - $stayLengths[$idx] - 1));
                $start = $availableDays[$startOffset];
                $end = (clone $start)->modify('+' . $stayLengths[$idx] . ' days');

                // Check overlap with existing stays
                $overlaps = false;
                foreach ($stayDates as $s) {
                    if ($start < $s['end'] && $end > $s['start']) {
                        $overlaps = true;
                        break;
                    }
                }
                if (!$overlaps) {
                    $stayDates[] = ['start' => $start, 'end' => $end, 'length' => $stayLengths[$idx]];
                    $idx++;
                }
            }

            // Sort stays by start date
            usort($stayDates, function($a, $b) { return $a['start'] <=> $b['start']; });

            foreach ($stayDates as $stay) {
                $guestName = $guestNames[$nameIndex % count($guestNames)];
                $nameIndex++;
                $phone = '9988776' . str_pad((string)(($roomIdx * 100 + $nameIndex) % 1000), 3, '0', STR_PAD_LEFT);

                $checkin = $stay['start']->format('Y-m-d');
                $checkout = $stay['end']->format('Y-m-d');
                $nights = $stay['length'];
                $totalCharge = $tariff * $nights;
                $advance = (int)($totalCharge * 0.3);

                // Status: past stays are checked out, current/future are checked in
                $status = 'Checked In';
                if ($stay['end'] <= $today) {
                    $status = 'Checked Out';
                }

                $allBookings[] = [
                    'name' => $guestName,
                    'phone' => $phone,
                    'checkin' => $checkin,
                    'checkout' => $checkout,
                    'status' => $status,
                    'room_id' => $roomId,
                    'per_night_charges' => $tariff,
                    'total_charge' => $totalCharge,
                    'advance' => $advance,
                ];
            }
        }

        // Insert all bookings
        foreach ($allBookings as $guest) {
            $stmt = $pdo->prepare("
                INSERT IGNORE INTO guests (property_id, guest_name, phone_number, checkin_date, expected_checkout, status, no_of_guests, room_id, per_night_charges, total_charge, advance_paid, is_demo)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 1)
            ");
            $stmt->execute([$propertyId, $guest['name'], $guest['phone'], $guest['checkin'], $guest['checkout'], $guest['status'], $guest['room_id'], $guest['per_night_charges'], $guest['total_charge'], $guest['advance']]);
        }

        // 4. Demo Food Menu Items
        $demoMenuItems = [
            ['category' => 'Breakfast', 'name' => 'Scrambled Eggs & Toast', 'price' => 250],
            ['category' => 'Breakfast', 'name' => 'Pancakes with Syrup', 'price' => 300],
            ['category' => 'Breakfast', 'name' => 'Oatmeal with Fruits', 'price' => 200],
            ['category' => 'Main Course', 'name' => 'Grilled Chicken Breast', 'price' => 450],
            ['category' => 'Main Course', 'name' => 'Fish Curry', 'price' => 500],
            ['category' => 'Main Course', 'name' => 'Vegetable Stir Fry', 'price' => 350],
            ['category' => 'Beverages', 'name' => 'Fresh Orange Juice', 'price' => 100],
            ['category' => 'Beverages', 'name' => 'Coffee', 'price' => 80],
            ['category' => 'Beverages', 'name' => 'Tea', 'price' => 60],
            ['category' => 'Snacks', 'name' => 'Samosas (4 pcs)', 'price' => 120],
            ['category' => 'Snacks', 'name' => 'Garlic Bread', 'price' => 150],
            ['category' => 'Desserts', 'name' => 'Chocolate Cake', 'price' => 200],
            ['category' => 'Desserts', 'name' => 'Ice Cream', 'price' => 150],
        ];

        foreach ($demoMenuItems as $item) {
            $catStmt = $pdo->prepare("SELECT id FROM menu_categories WHERE name = ? LIMIT 1");
            $catStmt->execute([$item['category']]);
            $catId = $catStmt->fetchColumn();

            if (!$catId) {
                $stmt = $pdo->prepare("INSERT INTO menu_categories (name) VALUES (?)");
                $stmt->execute([$item['category']]);
                $catId = $pdo->lastInsertId();
            }

            $stmt = $pdo->prepare("
                INSERT IGNORE INTO menu_items (property_id, category_id, name, price, is_hidden, is_demo)
                VALUES (?, ?, ?, ?, 0, 1)
            ");
            $stmt->execute([$propertyId, $catId, $item['name'], $item['price']]);
        }

        // 5. Demo Inventory Items (using req_catalog table)
        $demoInventory = [
            ['name' => 'Chicken Breast', 'stock' => 15, 'unit' => 'kg'],
            ['name' => 'Rice', 'stock' => 50, 'unit' => 'kg'],
            ['name' => 'Eggs', 'stock' => 100, 'unit' => 'pcs'],
            ['name' => 'Milk', 'stock' => 20, 'unit' => 'litre'],
            ['name' => 'Vegetables Mix', 'stock' => 25, 'unit' => 'kg'],
            ['name' => 'Cleaning Supplies', 'stock' => 8, 'unit' => 'bottles'],
            ['name' => 'Tissue Paper', 'stock' => 2, 'unit' => 'packs', 'low_stock' => true],
        ];

        foreach ($demoInventory as $item) {
            $stmt = $pdo->prepare("
                INSERT IGNORE INTO req_catalog (property_id, item_name, current_stock, unit_label, category_id, is_demo)
                VALUES (?, ?, ?, ?, 1, 1)
            ");
            $stmt->execute([$propertyId, $item['name'], $item['stock'], $item['unit']]);
        }

        // 6. Demo Petty Cash Entries - spread across -30 to +7 window
        $demoExpenses = [];
        for ($i = 0; $i < 12; $i++) {
            $daysOffset = rand(-30, 7);
            $date = (clone $today)->modify("$daysOffset days")->format('Y-m-d');
            $categories = ['Kitchen Purchase', 'Maintenance', 'Staff Advance', 'Miscellaneous', 'Utilities', 'Transport'];
            $vendors = ['Local Market', 'Hardware Store', 'Cash Advance', 'Utilities', 'Transport Co', 'Online'];
            $descs = [
                'Fresh vegetables and groceries',
                'Repair supplies',
                'Advance to staff member',
                'Phone bill recharge',
                'Local transport',
                'Cleaning supplies',
            ];
            $catIdx = array_rand($categories);
            $demoExpenses[] = [
                'date' => $date,
                'category' => $categories[$catIdx],
                'amount' => rand(200, 5000),
                'vendor' => $vendors[$catIdx],
                'desc' => $descs[$catIdx],
            ];
        }

        foreach ($demoExpenses as $exp) {
            $expId = 'EXP-' . uniqid();
            $stmt = $pdo->prepare("
                INSERT IGNORE INTO petty_cash (id, property_id, date, category, amount, description, vendor_name, approved_by, is_demo)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'Demo Manager', 1)
            ");
            $stmt->execute([$expId, $propertyId, $exp['date'], $exp['category'], $exp['amount'], $exp['desc'], $exp['vendor']]);
        }

        // 6b. Demo Staff Meal Logs - spread across the past 30 days (logs are
        // historical records only, no future dates)
        $mealDescs = ['Dal, rice, sabzi, roti', 'Chicken curry, rice', 'Leftover breakfast buffet', 'Veg thali', 'Fish curry, rice', 'Roti, sabzi, curd'];
        $mealStaffGroups = ['Demo Manager, Demo Chef', 'Demo Housekeeping, Demo Reception', 'Demo Chef', 'All Staff'];
        $mealHours = [8, 13, 20];
        for ($i = 0; $i < 14; $i++) {
            $daysOffset = rand(-30, 0);
            $loggedAt = (clone $today)->modify("$daysOffset days")->format('Y-m-d') . ' ' . sprintf('%02d:%02d:00', $mealHours[array_rand($mealHours)], rand(0, 59));
            $stmt = $pdo->prepare("
                INSERT INTO staff_meal_logs (property_id, staff_names, food_description, is_leftover_buffer, logged_at, is_demo)
                VALUES (?, ?, ?, ?, ?, 1)
            ");
            $stmt->execute([$propertyId, $mealStaffGroups[array_rand($mealStaffGroups)], $mealDescs[array_rand($mealDescs)], rand(0, 4) === 0 ? 1 : 0, $loggedAt]);
        }

        // 7. Demo Service Requests - today's open requests + historical closed ones
        $serviceRequestTypes = [
            'ac_heating_issue', 'hot_water_geyser', 'fresh_towels', 'extra_bedding',
            'tea_coffee_replenish', 'late_checkout_request', 'wifi_connectivity'
        ];

        $todayStr = $today->format('Y-m-d');
        $serviceRequests = [];
        foreach ($serviceRequestTypes as $typeId) {
            // 2-3 requests per type, some today (open), some past (closed)
            for ($i = 0; $i < rand(2, 3); $i++) {
                $daysOffset = rand(-25, 2);
                $reqDate = (clone $today)->modify("$daysOffset days")->format('Y-m-d H:i:s');
                $isToday = ($daysOffset >= -1 && $daysOffset <= 0);
                $roomId = $roomIds[array_rand($roomIds)];

                $serviceRequests[] = [
                    'property_id' => $propertyId,
                    'room_id' => $roomId,
                    'request_type' => $typeId,
                    'description' => ucwords(str_replace('_', ' ', $typeId)) . ' - Demo request',
                    'requested_by' => 'Demo Guest',
                    'status' => $isToday ? 'open' : 'resolved',
                    'scheduled_at' => $reqDate,
                    'created_at' => $reqDate,
                    'is_demo' => 1,
                ];
            }
        }

        $stmt = $pdo->prepare("
            INSERT IGNORE INTO service_requests (property_id, room_id, request_type, description, requested_by, status, scheduled_at, created_at, is_demo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        foreach ($serviceRequests as $req) {
            $stmt->execute([
                $req['property_id'],
                $req['room_id'],
                $req['request_type'],
                $req['description'],
                $req['requested_by'],
                $req['status'],
                $req['scheduled_at'],
                $req['created_at'],
                $req['is_demo']
            ]);
        }

        // 8. Demo KDS Orders - today's live orders + historical completed ones
        // Get menu item IDs for ordering
        $menuItemStmt = $pdo->prepare("SELECT id FROM menu_items WHERE property_id = ? AND is_demo = 1 LIMIT 10");
        $menuItemStmt->execute([$propertyId]);
        $menuItemIds = $menuItemStmt->fetchAll(PDO::FETCH_COLUMN);
        if (empty($menuItemIds)) {
            $menuItemIds = [1];
        }

        $kdsStatuses = ['Pending', 'Preparing', 'Ready', 'Completed'];
        $kdsOrders = [];
        for ($i = 0; $i < 15; $i++) {
            $daysOffset = rand(-25, 0);
            $orderTime = (clone $today)->modify("$daysOffset days")->format('Y-m-d H:i:s');
            $status = $kdsStatuses[array_rand($kdsStatuses)];

            // Prefer today's orders to be Pending/Preparing/Ready
            if ($daysOffset >= -1) {
                $status = $kdsStatuses[array_rand([0, 1, 2])]; // Pending, Preparing, or Ready
            }

            $kdsOrders[] = [
                'property_id' => $propertyId,
                'guest_id' => null,
                'room_number' => 'Room ' . (101 + $i % 5),
                'order_time' => $orderTime,
                'status' => $status,
                'is_demo' => 1,
            ];
        }

        $stmt = $pdo->prepare("
            INSERT IGNORE INTO orders (property_id, guest_id, order_time, status, is_demo)
            VALUES (?, ?, ?, ?, 1)
        ");
        foreach ($kdsOrders as $order) {
            $stmt->execute([$order['property_id'], $order['guest_id'], $order['order_time'], $order['status']]);
            $orderId = $pdo->lastInsertId();

            // Add 1-3 items per order
            $itemCount = rand(1, 3);
            for ($j = 0; $j < $itemCount; $j++) {
                $menuItemId = $menuItemIds[array_rand($menuItemIds)];
                $qty = rand(1, 3);
                $itemStatus = $order['status'] === 'Completed' ? 'Served' : ($order['status'] === 'Ready' ? 'Ready' : 'Pending');
                $itemStmt = $pdo->prepare("
                    INSERT INTO order_items (order_id, menu_item_id, quantity, item_status, is_demo)
                    VALUES (?, ?, ?, ?, 1)
                ");
                $itemStmt->execute([$orderId, $menuItemId, $qty, $itemStatus]);
            }
        }

        // 9. Demo Audit Logs - spread across the same 30-day window as everything
        // else, not all stamped 'now'. A property that's supposedly been running
        // for a month with an activity trail that's entirely one instant old reads
        // as obviously fake. Correlate with the real bookings/orders already
        // generated above where possible instead of inventing disconnected events.
        $demoLogs = [];
        foreach ($allBookings as $booking) {
            $demoLogs[] = ['action' => 'Guest Checked In - ' . $booking['name'], 'module' => 'guests', 'ts' => $booking['checkin'] . ' ' . sprintf('%02d:%02d:00', rand(8, 20), rand(0, 59))];
            if ($booking['status'] === 'Checked Out') {
                $demoLogs[] = ['action' => 'Guest Checked Out - ' . $booking['name'], 'module' => 'guests', 'ts' => $booking['checkout'] . ' ' . sprintf('%02d:%02d:00', rand(8, 20), rand(0, 59))];
            }
        }
        foreach ($kdsOrders as $order) {
            $demoLogs[] = ['action' => 'Food Order Created - ' . $order['room_number'], 'module' => 'kitchen', 'ts' => $order['order_time']];
        }
        $genericLogTemplates = [
            ['action' => 'Inventory Updated - Chicken Breast', 'module' => 'inventory'],
            ['action' => 'Petty Cash Entry - Kitchen Purchase', 'module' => 'finance'],
            ['action' => 'Staff Attendance Marked - Demo Manager', 'module' => 'staff'],
            ['action' => 'Service Request Created - AC Issue', 'module' => 'service_requests'],
            ['action' => 'Stock Requisition Fulfilled', 'module' => 'inventory'],
            ['action' => 'Menu Item Price Updated', 'module' => 'kitchen'],
            ['action' => 'Cash Drawer Handover', 'module' => 'finance'],
            ['action' => 'Staff Attendance Marked - Demo Chef', 'module' => 'staff'],
        ];
        foreach ($genericLogTemplates as $tpl) {
            $daysOffset = rand(-30, 0);
            $ts = (clone $today)->modify("$daysOffset days")->format('Y-m-d') . ' ' . sprintf('%02d:%02d:00', rand(8, 20), rand(0, 59));
            $demoLogs[] = ['action' => $tpl['action'], 'module' => $tpl['module'], 'ts' => $ts];
        }
        $demoLogs[] = ['action' => 'Demo Data Generated', 'module' => 'system', 'ts' => date('Y-m-d H:i:s')];

        foreach ($demoLogs as $log) {
            $stmt = $pdo->prepare("
                INSERT INTO audit_logs (property_id, timestamp, user, action, status, module, is_demo)
                VALUES (?, ?, 'System', ?, 'Success', ?, 1)
            ");
            $stmt->execute([$propertyId, $log['ts'], $log['action'], $log['module']]);
        }

        $pdo->commit();
        return ['status' => 'success', 'message' => 'Demo data generated successfully'];

    } catch (Exception $e) {
        $pdo->rollBack();
        return ['status' => 'error', 'message' => $e->getMessage()];
    }
}

function clearDemoData($pdo, $propertyId) {
    ensureDemoSchema($pdo);

    try {
        $pdo->beginTransaction();

        $deletedRows = 0;

        // Delete demo staff users
        $stmt = $pdo->prepare("DELETE FROM staff_users WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo guests
        $stmt = $pdo->prepare("DELETE FROM guests WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo menu items
        $stmt = $pdo->prepare("DELETE FROM menu_items WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo inventory items
        $stmt = $pdo->prepare("DELETE FROM req_catalog WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo petty cash entries
        $stmt = $pdo->prepare("DELETE FROM petty_cash WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo staff meal logs
        $stmt = $pdo->prepare("DELETE FROM staff_meal_logs WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo service requests
        $stmt = $pdo->prepare("DELETE FROM service_requests WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo KDS orders and their items
        $stmt = $pdo->prepare("SELECT id FROM orders WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $demoOrderIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

        if (!empty($demoOrderIds)) {
            $in = implode(',', array_fill(0, count($demoOrderIds), '?'));
            $stmt = $pdo->prepare("DELETE FROM order_items WHERE order_id IN ($in)");
            $stmt->execute($demoOrderIds);
            $deletedRows += $stmt->rowCount();

            $stmt = $pdo->prepare("DELETE FROM orders WHERE property_id = ? AND is_demo = 1");
            $stmt->execute([$propertyId]);
            $deletedRows += $stmt->rowCount();
        }

        // Delete demo audit logs
        $stmt = $pdo->prepare("DELETE FROM audit_logs WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        $pdo->commit();
        error_log("[demo_data.php] Total rows deleted: " . $deletedRows);
        return ['status' => 'success', 'message' => "Demo data cleared successfully ($deletedRows records removed)"];

    } catch (Exception $e) {
        $pdo->rollBack();
        error_log("[demo_data.php] Error clearing demo data: " . $e->getMessage());
        return ['status' => 'error', 'message' => $e->getMessage()];
    }
}

// Handle API calls. The standalone entry point only runs when this file is hit
// directly - when router.php require_once's it, the router dispatches
// generate_demo_data/clear_demo_data itself (with the session/API-key gate and
// resolved-property scoping applied). Leaving this block unguarded made it run
// for BOTH entry points and let anyone wipe/poison any property's data.
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        // Guard the direct endpoint too: require a valid session or API key.
        $api_key = getenv('API_KEY');
        $provided_key = $_SERVER['HTTP_X_API_KEY'] ?? $_GET['api_key'] ?? '';
        $is_authenticated_user = isset($_SESSION['username']);
        $authorized = $is_authenticated_user || (!empty($api_key) && $provided_key === $api_key);
        if (!$authorized) {
            http_response_code(401);
            echo json_encode(['status' => 'error', 'message' => 'Unauthorized. Valid API key or login session required.']);
            exit;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        $action = $input['action'] ?? '';
        $propertyId = $input['property_id'] ?? null;

        if (!$propertyId) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'property_id required']);
            exit;
        }

        // Pin the target to the property resolved from the request context unless
        // the caller is a platform admin (mirrors the router.php behavior).
        $resolvedPropertyId = getCurrentPropertyId($pdo);
        $targetPropertyId = $resolvedPropertyId;
        if ($propertyId && ($_SESSION['is_platform_admin'] ?? false)) {
            $targetPropertyId = $propertyId;
        }
        if (!$targetPropertyId) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'No property context for demo data']);
            exit;
        }

        if ($action === 'generate') {
            $result = generateDemoData($pdo, $targetPropertyId);
        } elseif ($action === 'clear') {
            $result = clearDemoData($pdo, $targetPropertyId);
        } else {
            http_response_code(400);
            $result = ['status' => 'error', 'message' => 'Invalid action'];
        }

        echo json_encode($result);
    }
}
