<?php
/**
 * Demo Data Generator
 * Populates system with realistic sample data for testing and demos
 * Each call refreshes the demo data
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../modules/module_manager.php';

function generateDemoData($pdo, $propertyId) {
    try {
        $pdo->beginTransaction();

        // 1. Demo Users (Staff with different roles)
        $demoUsers = [
            ['username' => 'demo_manager', 'name' => 'Demo Manager', 'phone' => '9876543210', 'role' => 'Manager', 'status' => 'Active'],
            ['username' => 'demo_chef', 'name' => 'Demo Chef', 'phone' => '9876543211', 'role' => 'Chef/Cook', 'status' => 'Active'],
            ['username' => 'demo_house', 'name' => 'Demo Housekeeping', 'phone' => '9876543212', 'role' => 'Housekeeping', 'status' => 'Active'],
            ['username' => 'demo_reception', 'name' => 'Demo Reception', 'phone' => '9876543213', 'role' => 'Manager/Reception', 'status' => 'Active'],
        ];

        foreach ($demoUsers as $user) {
            $userId = 'DEMO-' . uniqid();
            $stmt = $pdo->prepare("
                INSERT IGNORE INTO staff_users (id, property_id, username, full_name, phone, role, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            ");
            $stmt->execute([$userId, $propertyId, $user['username'], $user['name'], $user['phone'], $user['role'], $user['status']]);
        }

        // 2. Demo Guests (Various booking statuses)
        // Get available rooms for multi-key properties
        $roomIds = [];
        try {
            $roomStmt = $pdo->prepare("
                SELECT id FROM properties
                WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM'
                ORDER BY name ASC
            ");
            $roomStmt->execute([$propertyId]);
            $roomIds = $roomStmt->fetchAll(PDO::FETCH_COLUMN);
        } catch (Exception $e) {
            error_log("[demo_data.php] Error fetching rooms: " . $e->getMessage());
        }

        // Ensure we have all 5 demo rooms
        $requiredRooms = [
            ['name' => 'Room 101', 'slug' => 'room-101'],
            ['name' => 'Room 102', 'slug' => 'room-102'],
            ['name' => 'Room 103', 'slug' => 'room-103'],
            ['name' => 'Room 104', 'slug' => 'room-104'],
            ['name' => 'Room 105', 'slug' => 'room-105'],
        ];

        try {
            // Create any missing rooms
            foreach ($requiredRooms as $requiredRoom) {
                $checkStmt = $pdo->prepare("SELECT id FROM properties WHERE parent_property_id = ? AND name = ?");
                $checkStmt->execute([$propertyId, $requiredRoom['name']]);
                $existing = $checkStmt->fetchColumn();

                if (!$existing) {
                    $createStmt = $pdo->prepare("
                        INSERT INTO properties (parent_property_id, name, slug, property_type, is_active, created_at)
                        VALUES (?, ?, ?, 'MULTI_KEY_ROOM', 1, NOW())
                    ");
                    $createStmt->execute([$propertyId, $requiredRoom['name'], $requiredRoom['slug']]);
                    error_log("[demo_data.php] Created room: " . $requiredRoom['name']);
                }
            }

            // Re-fetch all room IDs
            $roomStmt = $pdo->prepare("
                SELECT id FROM properties
                WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM'
                ORDER BY name ASC
            ");
            $roomStmt->execute([$propertyId]);
            $roomIds = $roomStmt->fetchAll(PDO::FETCH_COLUMN);
            error_log("[demo_data.php] Total rooms available: " . count($roomIds));
        } catch (Exception $e) {
            error_log("[demo_data.php] Error managing rooms: " . $e->getMessage());
            $roomIds = [null];
        }

        // Create demo guests with back-to-back bookings across all 5 rooms
        $demoGuests = [
            // Room 101: Back-to-back bookings
            ['name' => 'John Smith', 'phone' => '9988776655', 'checkin' => date('Y-m-d'), 'checkout' => date('Y-m-d', strtotime('+3 days')), 'status' => 'Active', 'room_idx' => 0, 'per_night_charges' => 5000, 'total_charge' => 15000, 'advance' => 5000],
            ['name' => 'Mike Wilson', 'phone' => '9988776657', 'checkin' => date('Y-m-d', strtotime('+3 days')), 'checkout' => date('Y-m-d', strtotime('+6 days')), 'status' => 'Active', 'room_idx' => 0, 'per_night_charges' => 5000, 'total_charge' => 15000, 'advance' => 5000],

            // Room 102: Back-to-back bookings
            ['name' => 'Sarah Johnson', 'phone' => '9988776656', 'checkin' => date('Y-m-d', strtotime('-1 day')), 'checkout' => date('Y-m-d', strtotime('+2 days')), 'status' => 'Active', 'room_idx' => 1, 'per_night_charges' => 4500, 'total_charge' => 13500, 'advance' => 4500],
            ['name' => 'Emma Davis', 'phone' => '9988776658', 'checkin' => date('Y-m-d', strtotime('+2 days')), 'checkout' => date('Y-m-d', strtotime('+5 days')), 'status' => 'Active', 'room_idx' => 1, 'per_night_charges' => 4500, 'total_charge' => 13500, 'advance' => 4500],
            ['name' => 'Oliver Brown', 'phone' => '9988776662', 'checkin' => date('Y-m-d', strtotime('+5 days')), 'checkout' => date('Y-m-d', strtotime('+8 days')), 'status' => 'Active', 'room_idx' => 1, 'per_night_charges' => 4500, 'total_charge' => 13500, 'advance' => 4500],
        ];

        // Add bookings for rooms 103, 104, 105 if they exist (3+ rooms)
        if (count($roomIds) > 2) {
            // Room 103: Back-to-back bookings
            $demoGuests[] = ['name' => 'Alice Brown', 'phone' => '9988776659', 'checkin' => date('Y-m-d', strtotime('+7 days')), 'checkout' => date('Y-m-d', strtotime('+10 days')), 'status' => 'Active', 'room_idx' => 2, 'per_night_charges' => 3500, 'total_charge' => 10500, 'advance' => 3500];
            $demoGuests[] = ['name' => 'Bob Green', 'phone' => '9988776660', 'checkin' => date('Y-m-d', strtotime('+10 days')), 'checkout' => date('Y-m-d', strtotime('+13 days')), 'status' => 'Active', 'room_idx' => 2, 'per_night_charges' => 3500, 'total_charge' => 10500, 'advance' => 3500];

            // Room 104: Back-to-back bookings
            $demoGuests[] = ['name' => 'Carol White', 'phone' => '9988776661', 'checkin' => date('Y-m-d', strtotime('+4 days')), 'checkout' => date('Y-m-d', strtotime('+7 days')), 'status' => 'Active', 'room_idx' => 3, 'per_night_charges' => 4000, 'total_charge' => 12000, 'advance' => 4000];
            $demoGuests[] = ['name' => 'David Lee', 'phone' => '9988776663', 'checkin' => date('Y-m-d', strtotime('+7 days')), 'checkout' => date('Y-m-d', strtotime('+10 days')), 'status' => 'Active', 'room_idx' => 3, 'per_night_charges' => 4000, 'total_charge' => 12000, 'advance' => 4000];

            // Room 105: Back-to-back bookings
            $demoGuests[] = ['name' => 'Fiona Taylor', 'phone' => '9988776664', 'checkin' => date('Y-m-d', strtotime('+9 days')), 'checkout' => date('Y-m-d', strtotime('+12 days')), 'status' => 'Active', 'room_idx' => 4, 'per_night_charges' => 3800, 'total_charge' => 11400, 'advance' => 3800];
            $demoGuests[] = ['name' => 'George Harris', 'phone' => '9988776665', 'checkin' => date('Y-m-d', strtotime('+12 days')), 'checkout' => date('Y-m-d', strtotime('+15 days')), 'status' => 'Active', 'room_idx' => 4, 'per_night_charges' => 3800, 'total_charge' => 11400, 'advance' => 3800];
        }

        foreach ($demoGuests as $guest) {
            $roomIdx = min($guest['room_idx'], count($roomIds) - 1);
            $roomId = $roomIds[$roomIdx] ?? null;
            $stmt = $pdo->prepare("
                INSERT IGNORE INTO guests (property_id, guest_name, phone_number, checkin_date, expected_checkout, status, no_of_guests, room_id, per_night_charges, total_charge, advance_paid)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
            ");
            $stmt->execute([$propertyId, $guest['name'], $guest['phone'], $guest['checkin'], $guest['checkout'], $guest['status'], $roomId, $guest['per_night_charges'], $guest['total_charge'], $guest['advance']]);
        }

        // 3. Demo Food Menu Items
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
            // Find or create category
            $catStmt = $pdo->prepare("SELECT id FROM menu_categories WHERE name = ? LIMIT 1");
            $catStmt->execute([$item['category']]);
            $catId = $catStmt->fetchColumn();

            if (!$catId) {
                $stmt = $pdo->prepare("INSERT INTO menu_categories (name) VALUES (?)");
                $stmt->execute([$item['category']]);
                $catId = $pdo->lastInsertId();
            }

            $stmt = $pdo->prepare("
                INSERT IGNORE INTO menu_items (property_id, category_id, name, price, is_hidden)
                VALUES (?, ?, ?, ?, 0)
            ");
            $stmt->execute([$propertyId, $catId, $item['name'], $item['price']]);
        }

        // 4. Demo Inventory Items (using req_catalog table)
        $demoInventory = [
            ['name' => 'Chicken Breast', 'stock' => 15, 'unit' => 'kg'],
            ['name' => 'Rice', 'stock' => 50, 'unit' => 'kg'],
            ['name' => 'Eggs', 'stock' => 100, 'unit' => 'pcs'],
            ['name' => 'Milk', 'stock' => 20, 'unit' => 'litre'],
            ['name' => 'Vegetables Mix', 'stock' => 25, 'unit' => 'kg'],
            ['name' => 'Cleaning Supplies', 'stock' => 8, 'unit' => 'bottles'],
        ];

        foreach ($demoInventory as $item) {
            $stmt = $pdo->prepare("
                INSERT IGNORE INTO req_catalog (property_id, item_name, current_stock, unit_label, category_id)
                VALUES (?, ?, ?, ?, 1)
            ");
            $stmt->execute([$propertyId, $item['name'], $item['stock'], $item['unit']]);
        }

        // 5. Demo Petty Cash Entries
        $demoExpenses = [
            ['date' => date('Y-m-d'), 'category' => 'Kitchen Purchase', 'amount' => 2500, 'vendor' => 'Local Market', 'desc' => 'Fresh vegetables and groceries'],
            ['date' => date('Y-m-d', strtotime('-1 day')), 'category' => 'Maintenance', 'amount' => 1500, 'vendor' => 'Hardware Store', 'desc' => 'Repair supplies'],
            ['date' => date('Y-m-d', strtotime('-2 days')), 'category' => 'Staff Advance', 'amount' => 5000, 'vendor' => 'Cash Advance', 'desc' => 'Advance to staff member'],
            ['date' => date('Y-m-d', strtotime('-3 days')), 'category' => 'Miscellaneous', 'amount' => 800, 'vendor' => 'Utilities', 'desc' => 'Phone bill recharge'],
        ];

        foreach ($demoExpenses as $exp) {
            $expId = 'EXP-' . uniqid();
            $stmt = $pdo->prepare("
                INSERT IGNORE INTO petty_cash (id, property_id, date, category, amount, description, vendor_name, approved_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'Demo Manager')
            ");
            $stmt->execute([$expId, $propertyId, $exp['date'], $exp['category'], $exp['amount'], $exp['desc'], $exp['vendor']]);
        }

        // 6. Demo Audit Logs
        $demoLogs = [
            ['action' => 'Guest Checked In - John Smith', 'module' => 'guests'],
            ['action' => 'Food Order Created - Table 5', 'module' => 'kitchen'],
            ['action' => 'Inventory Updated - Chicken Breast', 'module' => 'inventory'],
            ['action' => 'Petty Cash Entry - Kitchen Purchase', 'module' => 'finance'],
            ['action' => 'Staff Attendance Marked - Demo Manager', 'module' => 'staff'],
        ];

        foreach ($demoLogs as $log) {
            $stmt = $pdo->prepare("
                INSERT INTO audit_logs (property_id, timestamp, user, action, status, module)
                VALUES (?, ?, 'System', ?, 'Success', ?)
            ");
            $stmt->execute([$propertyId, date('Y-m-d H:i:s'), $log['action'], $log['module']]);
        }

        $pdo->commit();
        return ['status' => 'success', 'message' => 'Demo data generated successfully'];

    } catch (Exception $e) {
        $pdo->rollBack();
        return ['status' => 'error', 'message' => $e->getMessage()];
    }
}

function clearDemoData($pdo, $propertyId) {
    try {
        $pdo->beginTransaction();

        $deletedRows = 0;

        // Delete demo staff users with demo usernames
        $stmt = $pdo->prepare("DELETE FROM staff_users WHERE property_id = ? AND username LIKE 'demo_%'");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();
        error_log("[demo_data.php] Deleted staff users: " . $stmt->rowCount());

        // Delete ALL demo guests (current and old demo data)
        $stmt = $pdo->prepare("DELETE FROM guests WHERE property_id = ? AND guest_name IN ('John Smith', 'Sarah Johnson', 'Mike Wilson', 'Emma Davis', 'Oliver Brown', 'Alice Brown', 'Bob Green', 'Carol White', 'David Lee', 'Fiona Taylor', 'George Harris')");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();
        error_log("[demo_data.php] Deleted guests: " . $stmt->rowCount());

        // Delete demo menu items by name
        $stmt = $pdo->prepare("DELETE FROM menu_items WHERE property_id = ? AND name IN ('Scrambled Eggs & Toast', 'Pancakes with Syrup', 'Oatmeal with Fruits', 'Grilled Chicken Breast', 'Fish Curry', 'Vegetable Stir Fry', 'Fresh Orange Juice', 'Coffee', 'Tea', 'Samosas (4 pcs)', 'Garlic Bread', 'Chocolate Cake', 'Ice Cream')");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();
        error_log("[demo_data.php] Deleted menu items: " . $stmt->rowCount());

        // Delete demo inventory items
        $stmt = $pdo->prepare("DELETE FROM req_catalog WHERE property_id = ? AND item_name IN ('Chicken Breast', 'Rice', 'Eggs', 'Milk', 'Vegetables Mix', 'Cleaning Supplies')");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();
        error_log("[demo_data.php] Deleted inventory items: " . $stmt->rowCount());

        // Delete demo petty cash entries
        $stmt = $pdo->prepare("DELETE FROM petty_cash WHERE property_id = ? AND id LIKE 'EXP-%'");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();
        error_log("[demo_data.php] Deleted petty cash entries: " . $stmt->rowCount());

        // Delete audit logs with demo actions (more selective than deleting all 'System' logs)
        $stmt = $pdo->prepare("DELETE FROM audit_logs WHERE property_id = ? AND (action LIKE '%Demo%' OR action LIKE '%John Smith%' OR action LIKE '%Sarah Johnson%')");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();
        error_log("[demo_data.php] Deleted audit logs: " . $stmt->rowCount());

        $pdo->commit();
        error_log("[demo_data.php] Total rows deleted: " . $deletedRows);
        return ['status' => 'success', 'message' => "Demo data cleared successfully ($deletedRows records removed)"];

    } catch (Exception $e) {
        $pdo->rollBack();
        error_log("[demo_data.php] Error clearing demo data: " . $e->getMessage());
        return ['status' => 'error', 'message' => $e->getMessage()];
    }
}

// Handle API calls
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? '';
    $propertyId = $input['property_id'] ?? null;

    if (!$propertyId) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'property_id required']);
        exit;
    }

    if ($action === 'generate') {
        $result = generateDemoData($pdo, $propertyId);
    } elseif ($action === 'clear') {
        $result = clearDemoData($pdo, $propertyId);
    } else {
        http_response_code(400);
        $result = ['status' => 'error', 'message' => 'Invalid action'];
    }

    echo json_encode($result);
}
