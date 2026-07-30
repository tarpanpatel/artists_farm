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

        // Seed staff for current property if empty - each property gets its own set
        $check = $pdo->prepare("SELECT COUNT(*) FROM staff_users WHERE property_id = ?");
        $check->execute([$propertyId]);
        if ($check->fetchColumn() == 0) {
            $seedUsers = [
                ['7',  'Tarpan',       'Tarpan',       'Super Admin',  '+91 98281 36850', 50000, 'Active', 1, '1234', 'assets/img/qrs/qr_1784184027_6a587cdb702ba.png'],
                ['8',  'Kamlesh',      'Kamlesh',      'Staff Supervisor', '+91 98281 12020', 25000, 'Active', 1, '1234', ''],
                ['11', 'Rohit',        'Rohit',        'Admin',        '+91 98281 11111', 35000, 'Active', 0, '1234', ''],
                ['12', 'Abhijeet',     'Abhijeet',     'Staff Kitchen','+91 98281 12121', 22000, 'Active', 0, '1234', ''],
                ['13', 'Subrata',      'Subrata',      'Admin',        '+91 98281 13131', 30000, 'Active', 0, '1234', ''],
                ['15', 'Rana Das',     'Rana Das',     'Staff',        '+91 98281 22222', 20000, 'Active', 0, '1234', ''],
                ['16', 'Samar Sil',    'Samar Sil',    'Staff',        '+91 98281 23232', 18000, 'Active', 0, '1234', ''],
                ['17', 'Ashish Mandal','Ashish Mandal','Staff',        '+91 98281 14141', 32000, 'Active', 0, '1234', ''],
                ['18', 'Kinkar Sarkar','Kinkar Sarkar','Staff',        '+91 98281 19191', 18000, 'Active', 0, '1234', ''],
                ['19', 'Ramesh',       'Ramesh',       'Staff',        '+91 98281 21212', 18000, 'Active', 0, '1234', ''],
                ['20', 'Pranay',       'Pranay',       'Staff',        '+91 98281 20202', 18000, 'Active', 0, '1234', ''],
            ];
            $stmt = $pdo->prepare("INSERT INTO staff_users (id, property_id, username, full_name, role, phone, monthly_salary, status, is_financial_handler, passcode, qr_code_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            foreach ($seedUsers as $u) {
                $stmt->execute([$u[0], $propertyId, $u[1], $u[2], $u[3], $u[4], $u[5], $u[6], $u[7], $u[8], $u[9]]);
            }
        }

        // Seed default initial payees for current property if empty
        $checkPayees = $pdo->prepare("SELECT COUNT(*) FROM payee_entities WHERE property_id = ?");
        $checkPayees->execute([$propertyId]);
        if ($checkPayees->fetchColumn() == 0) {
            $seedPayees = [
                ['1', 'Nandkishore', 'Third Party', 'assets/img/qrs/qr_1784183993_6a587cb9bcfe4.png'],
                ['2', 'Raju', 'Vendor', ''],
                ['3', 'Disposable Shop', 'Vendor', '']
            ];
            $stmt = $pdo->prepare("INSERT INTO payee_entities (id, property_id, name, type, qr_code_url) VALUES (?, ?, ?, ?, ?)");
            foreach ($seedPayees as $p) {
                $stmt->execute([$p[0], $propertyId, $p[1], $p[2], $p[3]]);
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
                try {
                    $stmt = $pdo->prepare("INSERT INTO staff_users (id, property_id, username, full_name, role, phone, monthly_salary, status, is_financial_handler, passcode, qr_code_url)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            username = VALUES(username),
                            full_name = VALUES(full_name),
                            role = VALUES(role),
                            phone = VALUES(phone),
                            monthly_salary = VALUES(monthly_salary),
                            status = VALUES(status),
                            is_financial_handler = VALUES(is_financial_handler),
                            passcode = VALUES(passcode),
                            qr_code_url = VALUES(qr_code_url)");
                    $stmt->execute([
                        $input['id'] ?? ('usr-' . time()),
                        $propertyId,
                        $input['username'] ?? ($input['name'] ?? 'Staff'),
                        $input['fullName'] ?? ($input['name'] ?? $input['username'] ?? 'Staff'),
                        $input['role'] ?? 'Staff',
                        $input['phone'] ?? '',
                        $input['monthlySalary'] ?? 0,
                        $input['status'] ?? 'Active',
                        !empty($input['isFinancialHandler']) ? 1 : 0,
                        $input['passcode'] ?? '1234',
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
                    $passcode         = !empty($input['passcode']) ? $input['passcode'] : ($existing['passcode'] ?? '1234');
                    $qrCodeUrl        = isset($input['qrCodeUrl']) && $input['qrCodeUrl'] !== '' ? $input['qrCodeUrl'] : ($existing['qr_code_url'] ?? '');

                    $stmt = $pdo->prepare("INSERT INTO staff_users (id, property_id, username, full_name, role, phone, monthly_salary, status, is_financial_handler, passcode, qr_code_url)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            username = VALUES(username),
                            full_name = VALUES(full_name),
                            role = VALUES(role),
                            phone = VALUES(phone),
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
