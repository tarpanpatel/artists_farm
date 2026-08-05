<?php
/**
 * Staff & Payroll Matrix Module
 * Function: Staff attendance, salaries, payee allocations, and role permissions.
 * Single source of truth: staff_users table for ALL staff data (directory + permissions).
 */

function handleStaffRequests($pdo, $request_method, $action, $propertyId) {
    // Auto-create staff_users and payees tables
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS `staff_users` (
            `id` VARCHAR(50) PRIMARY KEY,
            `property_id` INT NOT NULL DEFAULT 1,
            `username` VARCHAR(100) NOT NULL,
            `full_name` VARCHAR(150) DEFAULT '',
            `role` VARCHAR(50) NOT NULL DEFAULT 'Staff',
            `phone` VARCHAR(30) DEFAULT '',
            `monthly_salary` DECIMAL(10,2) DEFAULT 0,
            `status` VARCHAR(20) DEFAULT 'Active',
            `is_financial_handler` TINYINT(1) NOT NULL DEFAULT 0,
            `passcode` VARCHAR(50) DEFAULT '1234',
            `qr_code_url` TEXT,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

        // Add new columns if upgrading from old schema (safe to run multiple times)
        $alterCols = [
            "ALTER TABLE `staff_users` ADD COLUMN IF NOT EXISTS `property_id` INT NOT NULL DEFAULT 1",
            "ALTER TABLE `staff_users` ADD COLUMN IF NOT EXISTS `full_name` VARCHAR(150) DEFAULT ''",
            "ALTER TABLE `staff_users` ADD COLUMN IF NOT EXISTS `phone` VARCHAR(30) DEFAULT ''",
            "ALTER TABLE `staff_users` ADD COLUMN IF NOT EXISTS `monthly_salary` DECIMAL(10,2) DEFAULT 0",
            "ALTER TABLE `staff_users` ADD COLUMN IF NOT EXISTS `status` VARCHAR(20) DEFAULT 'Active'",
        ];
        foreach ($alterCols as $sql) {
            try { $pdo->exec($sql); } catch (PDOException $e) {}
        }

        $pdo->exec("CREATE TABLE IF NOT EXISTS `payee_entities` (
            `id` VARCHAR(50) PRIMARY KEY,
            `property_id` INT NOT NULL DEFAULT 1,
            `name` VARCHAR(255) NOT NULL,
            `type` VARCHAR(50) NOT NULL DEFAULT 'Vendor',
            `qr_code_url` TEXT,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

        // Staff advances (Monthly Payout Calculator "+ Advance") - was localStorage-only
        // before, which meant it never synced across devices and could silently vanish.
        // This table already exists in production for a different purpose (inventory.php
        // writes negative "reimbursement credit" rows here when a staff member pays for a
        // kitchen purchase out of pocket) - CREATE baseline matches that existing schema
        // exactly, and the ALTERs below add what the advance-giving flow additionally
        // needs, rather than standing up a second, competing table.
        $pdo->exec("CREATE TABLE IF NOT EXISTS `staff_advances` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `property_id` INT NOT NULL DEFAULT 1,
            `staff_name` VARCHAR(100) NOT NULL,
            `amount` DECIMAL(10,2) NOT NULL,
            `reason` TEXT,
            `date` VARCHAR(50) NOT NULL,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
        $advanceAlterCols = [
            "ALTER TABLE `staff_advances` ADD COLUMN IF NOT EXISTS `staff_id` VARCHAR(50) DEFAULT NULL",
            "ALTER TABLE `staff_advances` ADD COLUMN IF NOT EXISTS `month_key` VARCHAR(7) DEFAULT NULL",
            "ALTER TABLE `staff_advances` ADD COLUMN IF NOT EXISTS `added_by` VARCHAR(150) DEFAULT ''",
        ];
        foreach ($advanceAlterCols as $sql) {
            try { $pdo->exec($sql); } catch (PDOException $e) {}
        }

        // Seed staff only if testing mode is enabled - production databases should start clean
        $check = $pdo->prepare("SELECT COUNT(*) FROM staff_users WHERE property_id = ?");
        $check->execute([$propertyId]);
        if ($check->fetchColumn() == 0) {
            $isTestingMode = isset($_COOKIE['artists_farm_testing_mode']) && $_COOKIE['artists_farm_testing_mode'] === '1';
            if ($isTestingMode) {
                // Only seed test data in testing mode
                $seedUsers = [
                    ['1',  'Staff A',      'staff_a',      'Super Admin',  '+91 98000 00001', 50000, 'Active', 1, '1234', ''],
                    ['2',  'Staff B',      'staff_b',      'Manager',      '+91 98000 00002', 25000, 'Active', 1, '1234', ''],
                    ['3',  'Staff C',      'staff_c',      'Admin',        '+91 98000 00003', 35000, 'Active', 0, '1234', ''],
                ];
                $stmt = $pdo->prepare("INSERT INTO staff_users (id, property_id, username, full_name, role, phone, monthly_salary, status, is_financial_handler, passcode, qr_code_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($seedUsers as $u) {
                    $stmt->execute([$u[0], $propertyId, $u[1], $u[2], $u[3], $u[4], $u[5], $u[6], $u[7], $u[8], $u[9]]);
                }
            }
        }

        // Seed payees only if testing mode is enabled
        $checkPayees = $pdo->prepare("SELECT COUNT(*) FROM payee_entities WHERE property_id = ?");
        $checkPayees->execute([$propertyId]);
        if ($checkPayees->fetchColumn() == 0) {
            $isTestingMode = isset($_COOKIE['artists_farm_testing_mode']) && $_COOKIE['artists_farm_testing_mode'] === '1';
            if ($isTestingMode) {
                $seedPayees = [
                    ['1', 'Test Vendor A', 'Vendor', ''],
                    ['2', 'Test Vendor B', 'Vendor', ''],
                ];
                $stmt = $pdo->prepare("INSERT INTO payee_entities (id, property_id, name, type, qr_code_url) VALUES (?, ?, ?, ?, ?)");
                foreach ($seedPayees as $p) {
                    $stmt->execute([$p[0], $propertyId, $p[1], $p[2], $p[3]]);
                }
            }
        }
    } catch (PDOException $e) {}

    switch ($action) {
        case 'get_staff':
        case 'get_users':
            try {
                $stmt = $pdo->prepare("SELECT id, username, full_name as fullName, role, phone, monthly_salary as monthlySalary, status, is_financial_handler as isFinancialHandler, passcode, qr_code_url as qrCodeUrl FROM staff_users WHERE property_id = ? ORDER BY CAST(id AS UNSIGNED) ASC, id ASC");
                $stmt->execute([$propertyId]);
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $data = array_map(function($r) {
                    return [
                        'id'                 => (string)$r['id'],
                        'username'           => $r['username'],
                        'fullName'           => $r['fullName'] ?: $r['username'],
                        'name'               => $r['fullName'] ?: $r['username'],
                        'role'               => $r['role'],
                        'phone'              => $r['phone'] ?? '',
                        'monthlySalary'      => (float)($r['monthlySalary'] ?? 0),
                        'status'             => $r['status'] ?? 'Active',
                        'isFinancialHandler' => (bool)$r['isFinancialHandler'],
                        'passcode'           => $r['passcode'],
                        'qrCodeUrl'          => $r['qrCodeUrl']
                    ];
                }, $rows);
                echo json_encode(['status' => 'success', 'data' => $data]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'add_user':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $username = $input['username'] ?? ($input['name'] ?? '');
                $passcode = $input['passcode'] ?? '';
                if (!preg_match('/^\d{10}$/', $username)) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'Username must be a 10-digit phone number.']);
                    break;
                }
                if (!preg_match('/^\d{6}$/', $passcode)) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'Passcode must be exactly 6 digits.']);
                    break;
                }
                try {
                    $stmt = $pdo->prepare("INSERT INTO staff_users (id, property_id, username, full_name, role, phone, phone_number, monthly_salary, status, is_financial_handler, passcode, qr_code_url)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            username = VALUES(username),
                            full_name = VALUES(full_name),
                            role = VALUES(role),
                            phone = VALUES(phone),
                            phone_number = VALUES(phone_number),
                            monthly_salary = VALUES(monthly_salary),
                            status = VALUES(status),
                            is_financial_handler = VALUES(is_financial_handler),
                            passcode = VALUES(passcode),
                            qr_code_url = VALUES(qr_code_url)");
                    $stmt->execute([
                        $input['id'] ?? ('usr-' . time()),
                        $propertyId,
                        $username,
                        $input['fullName'] ?? ($input['name'] ?? $username),
                        $input['role'] ?? 'Staff',
                        $username,
                        $username,
                        $input['monthlySalary'] ?? 0,
                        $input['status'] ?? 'Active',
                        !empty($input['isFinancialHandler']) ? 1 : 0,
                        $passcode,
                        $input['qrCodeUrl'] ?? ''
                    ]);
                    echo json_encode(['status' => 'success', 'message' => 'Staff member created successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'update_user':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    // Fetch existing user
                    $existing = null;
                    if (!empty($input['id'])) {
                    $stmtSel = $pdo->prepare("SELECT * FROM staff_users WHERE id = ? AND property_id = ?");
                    $stmtSel->execute([$input['id'], $propertyId]);
                        $existing = $stmtSel->fetch(PDO::FETCH_ASSOC);
                    }

                    $username         = $input['username'] ?? ($existing['username'] ?? 'Staff User');
                    $fullName         = $input['fullName'] ?? ($input['name'] ?? ($existing['full_name'] ?? $username));
                    $role             = $input['role'] ?? ($existing['role'] ?? 'Staff');
                    $phone            = $input['phone'] ?? ($existing['phone'] ?? '');
                    $monthlySalary    = isset($input['monthlySalary']) ? $input['monthlySalary'] : ($existing['monthly_salary'] ?? 0);
                    $status           = $input['status'] ?? ($existing['status'] ?? 'Active');
                    $isFinancialHandler = isset($input['isFinancialHandler']) ? ($input['isFinancialHandler'] ? 1 : 0) : ($existing['is_financial_handler'] ?? 0);
                    if (!empty($input['passcode']) && !preg_match('/^\d{6}$/', $input['passcode'])) {
                        http_response_code(400);
                        echo json_encode(['status' => 'error', 'message' => 'Passcode must be exactly 6 digits.']);
                        break;
                    }
                    if (!empty($input['username']) && !preg_match('/^\d{10}$/', $input['username'])) {
                        http_response_code(400);
                        echo json_encode(['status' => 'error', 'message' => 'Username must be a 10-digit phone number.']);
                        break;
                    }
                    $passcode         = !empty($input['passcode']) ? $input['passcode'] : ($existing['passcode'] ?? '1234');
                    $qrCodeUrl        = isset($input['qrCodeUrl']) && $input['qrCodeUrl'] !== '' ? $input['qrCodeUrl'] : ($existing['qr_code_url'] ?? '');
                    $phoneNumber      = $input['username'] ?? ($existing['phone_number'] ?? $username);

                    $stmt = $pdo->prepare("INSERT INTO staff_users (id, property_id, username, full_name, role, phone, phone_number, monthly_salary, status, is_financial_handler, passcode, qr_code_url)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            username = VALUES(username),
                            full_name = VALUES(full_name),
                            role = VALUES(role),
                            phone = VALUES(phone),
                            phone_number = VALUES(phone_number),
                            monthly_salary = VALUES(monthly_salary),
                            status = VALUES(status),
                            is_financial_handler = VALUES(is_financial_handler),
                            passcode = VALUES(passcode),
                            qr_code_url = VALUES(qr_code_url)");
                    $stmt->execute([
                        $input['id'],
                        $propertyId,
                        $username,
                        $fullName,
                        $role,
                        $phone,
                        $phoneNumber,
                        $monthlySalary,
                        $status,
                        $isFinancialHandler,
                        $passcode,
                        $qrCodeUrl
                    ]);
                    echo json_encode(['status' => 'success', 'message' => 'Staff member updated successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'delete_user':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("DELETE FROM staff_users WHERE id = ? AND property_id = ?");
                    $stmt->execute([$input['id'], $propertyId]);
                    echo json_encode(['status' => 'success', 'message' => 'Staff member deleted successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'get_payees':
            try {
                $stmt = $pdo->prepare("SELECT id, name, type, qr_code_url as qrCodeUrl FROM payee_entities WHERE property_id = ? ORDER BY name ASC");
                $stmt->execute([$propertyId]);
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(['status' => 'success', 'data' => $rows]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'add_payee':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("INSERT INTO payee_entities (id, property_id, name, type, qr_code_url) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), type = VALUES(type), qr_code_url = VALUES(qr_code_url)");
                    $stmt->execute([
                        $input['id'] ?? ('pay-' . time()),
                        $propertyId,
                        $input['name'],
                        $input['type'] ?? 'Vendor',
                        $input['qrCodeUrl'] ?? ''
                    ]);
                    echo json_encode(['status' => 'success', 'message' => 'Payee added successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'delete_payee':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("DELETE FROM payee_entities WHERE id = ? AND property_id = ?");
                    $stmt->execute([$input['id'], $propertyId]);
                    echo json_encode(['status' => 'success', 'message' => 'Payee deleted successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'get_staff_advances':
            try {
                // month falls back to the first 7 chars of `date` (YYYY-MM) for rows
                // that predate month_key - namely the kitchen-purchase reimbursement
                // credits inventory.php has always written directly to this table.
                $stmt = $pdo->prepare("SELECT id, staff_id as staffId, staff_name as staffName, amount, date, COALESCE(month_key, LEFT(date, 7)) as month, reason, added_by as addedBy FROM staff_advances WHERE property_id = ? ORDER BY date DESC, id DESC");
                $stmt->execute([$propertyId]);
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($rows as &$row) {
                    $row['id'] = (string)$row['id'];
                    $row['amount'] = floatval($row['amount']);
                }
                echo json_encode(['status' => 'success', 'data' => $rows]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'add_staff_advance':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("INSERT INTO staff_advances (property_id, staff_id, staff_name, amount, date, month_key, reason, added_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $propertyId,
                        $input['staffId'] ?? null,
                        $input['staffName'],
                        floatval($input['amount'] ?? 0),
                        $input['date'] ?? date('Y-m-d'),
                        $input['month'] ?? date('Y-m'),
                        $input['reason'] ?? '',
                        $input['addedBy'] ?? '',
                    ]);
                    $newId = (string)$pdo->lastInsertId();
                    echo json_encode(['status' => 'success', 'id' => $newId, 'message' => 'Advance recorded successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'delete_staff_advance':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("DELETE FROM staff_advances WHERE id = ? AND property_id = ?");
                    $stmt->execute([$input['id'], $propertyId]);
                    echo json_encode(['status' => 'success', 'message' => 'Advance deleted successfully']);
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'get_attendance':
            $count = 0;
            try { $stmt = $pdo->prepare("SELECT COUNT(*) FROM staff_attendance WHERE property_id = ?"); $stmt->execute([$propertyId]); $count = $stmt->fetchColumn(); } catch (PDOException $e) {}
            if ($count == 0) {
                $seedAttendance = [
                    ['2026-07-14','7','Present'],['2026-07-14','8','Present'],['2026-07-14','11','Present'],
                    ['2026-07-14','12','Present'],['2026-07-14','13','Present'],['2026-07-14','15','Present'],
                    ['2026-07-14','16','Present'],['2026-07-14','17','Present'],['2026-07-14','18','Present'],
                    ['2026-07-14','19','Present'],['2026-07-14','20','Present'],
                    ['2026-07-15','7','Present'],['2026-07-15','8','Present'],['2026-07-15','11','Half Day'],
                    ['2026-07-15','12','Present'],['2026-07-15','13','Absent'],['2026-07-15','15','Present'],
                    ['2026-07-15','16','Present'],['2026-07-15','17','Present'],['2026-07-15','18','Present'],
                    ['2026-07-15','19','Absent'],['2026-07-15','20','Present'],
                ];
                $stmt = $pdo->prepare("INSERT INTO staff_attendance (attendance_date, user_id, status, property_id) VALUES (?, ?, ?, ?)");
                foreach ($seedAttendance as $a) {
                    try { $stmt->execute([$a[0], $a[1], $a[2], $propertyId]); } catch (PDOException $e) {}
                }
            }
            try {
                $stmt = $pdo->prepare("SELECT a.id, a.attendance_date as date, a.user_id as staffId, u.username as staffName, a.status
                                    FROM staff_attendance a
                                    LEFT JOIN staff_users u ON a.user_id = u.id
                                    WHERE a.property_id = ?
                                    ORDER BY a.attendance_date DESC");
                $stmt->execute([$propertyId]);
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'success', 'data' => []]);
            }
            break;

        case 'log_attendance':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("INSERT INTO staff_attendance (attendance_date, user_id, status, marked_by, property_id) VALUES (?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $input['date'] ?? date('Y-m-d'),
                        $input['staffId'] ?? $input['user_id'] ?? 7,
                        $input['status'] ?? 'Present',
                        $input['marked_by'] ?? 'Tarpan',
                        $propertyId
                    ]);
                } catch (PDOException $e) {}
                echo json_encode(['status' => 'success', 'message' => 'Attendance logged successfully']);
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid staff action']);
            break;
    }
}
