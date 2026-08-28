<?php
/**
 * Staff & Payroll Matrix Module
 * Function: Staff attendance, salaries, payee allocations, and role permissions.
 * Single source of truth: staff_users table for ALL staff data (directory + permissions).
 */

function handleStaffRequests($pdo, $request_method, $action, $propertyId) {
    // Auto-create staff_users and payees tables
    try {
        require_once __DIR__ . '/../config/schema_cache.php';

        if (!isSchemaVerified('schema_staff_tables')) {

        // Add new columns if upgrading from old schema (safe to run multiple times)
        $alterCols = [
            "ALTER TABLE `staff_users` ADD COLUMN IF NOT EXISTS `property_id` INT NOT NULL DEFAULT 1",
            "ALTER TABLE `staff_users` ADD COLUMN IF NOT EXISTS `full_name` VARCHAR(150) DEFAULT ''",
            "ALTER TABLE `staff_users` ADD COLUMN IF NOT EXISTS `phone` VARCHAR(30) DEFAULT ''",
            "ALTER TABLE `staff_users` ADD COLUMN IF NOT EXISTS `monthly_salary` DECIMAL(10,2) DEFAULT 0",
            "ALTER TABLE `staff_users` ADD COLUMN IF NOT EXISTS `status` VARCHAR(20) DEFAULT 'Active'",
            // "Access All Properties" - a staff member who can log into any property
            // under their own tenant instead of being locked to the one row's
            // property_id. Applies per staff `id` (same id repeats across multiple
            // property_id rows in this compound-key table) - kept in sync across
            // every row for that id, see add_user/update_user below, so login's
            // `LIMIT 1` (whichever row it happens to fetch) always sees the right
            // value regardless of which specific row comes back.
            "ALTER TABLE `staff_users` ADD COLUMN IF NOT EXISTS `access_all_properties` TINYINT(1) NOT NULL DEFAULT 0",
            // Payee entities dropped their Vendor/Third-Party `type` classification
            // in favour of a plain UPI ID field (get_payees/add_payee below select
            // and insert `upi_id` directly) - this environment's payee_entities
            // table needs the column to exist before those queries can run at all.
            // The one-off migration script that added this on staging was deleted
            // after running once there (see git history) - self-heal so any OTHER
            // environment (production, a fresh local DB) doesn't hard-fail with a
            // raw "Unknown column 'upi_id'" SQL error on first payee fetch/save.
            "ALTER TABLE `payee_entities` ADD COLUMN IF NOT EXISTS `upi_id` VARCHAR(100) DEFAULT NULL",
            // Staff's own payment QR code moved from a raw uploaded image to an
            // auto-generated one built from a UPI ID (26 Aug 2026 - same reasoning
            // as the property-level upi_id/upi_qr_code_url fields: reported as
            // "QR thing is also not done here" on the staff Edit user form). Old
            // qr_code_url column/value stays as a legacy fallback for whoever
            // already had one uploaded before this change (see get_staff/add_user/
            // update_user below) - self-heals the same way upi_id did for
            // payee_entities above.
            "ALTER TABLE `staff_users` ADD COLUMN IF NOT EXISTS `upi_id` VARCHAR(100) DEFAULT NULL",
        ];
        foreach ($alterCols as $sql) {
            try { $pdo->exec($sql); } catch (PDOException $e) {}
        }


        // Staff advances (Monthly Payout Calculator "+ Advance") - was localStorage-only
        // before, which meant it never synced across devices and could silently vanish.
        // This table already exists in production for a different purpose (inventory.php
        // writes negative "reimbursement credit" rows here when a staff member pays for a
        // kitchen purchase out of pocket) - CREATE baseline matches that existing schema
        // exactly, and the ALTERs below add what the advance-giving flow additionally
        // needs, rather than standing up a second, competing table.
        $advanceAlterCols = [
            "ALTER TABLE `staff_advances` ADD COLUMN IF NOT EXISTS `staff_id` VARCHAR(50) DEFAULT NULL",
            "ALTER TABLE `staff_advances` ADD COLUMN IF NOT EXISTS `month_key` VARCHAR(7) DEFAULT NULL",
            "ALTER TABLE `staff_advances` ADD COLUMN IF NOT EXISTS `added_by` VARCHAR(150) DEFAULT ''",
        ];
        foreach ($advanceAlterCols as $sql) {
            try { $pdo->exec($sql); } catch (PDOException $e) {}
        }
        
        markSchemaVerified('schema_staff_tables');
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
                    ['1', 'Test Vendor A', ''],
                    ['2', 'Test Vendor B', ''],
                ];
                $stmt = $pdo->prepare("INSERT INTO payee_entities (id, property_id, name, qr_code_url) VALUES (?, ?, ?, ?)");
                foreach ($seedPayees as $p) {
                    $stmt->execute([$p[0], $propertyId, $p[1], $p[2]]);
                }
            }
        }
    } catch (PDOException $e) {}

    switch ($action) {
        case 'get_staff':
        case 'get_users':
            try {
                $stmt = $pdo->prepare("SELECT id, username, full_name as fullName, role, phone, monthly_salary as monthlySalary, daily_wage as dailyWage, status, is_financial_handler as isFinancialHandler, passcode, qr_code_url as qrCodeUrl, upi_id as upiId, access_all_properties as accessAllProperties FROM staff_users WHERE property_id = ? ORDER BY CAST(id AS UNSIGNED) ASC, id ASC");
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
                        'dailyWage'          => (float)($r['dailyWage'] ?? 0),
                        'status'             => $r['status'] ?? 'Active',
                        'isFinancialHandler' => (bool)$r['isFinancialHandler'],
                        'passcode'           => $r['passcode'],
                        'qrCodeUrl'          => $r['qrCodeUrl'],
                        'upiId'              => $r['upiId'] ?? '',
                        'accessAllProperties' => (bool)($r['accessAllProperties'] ?? false),
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
                    $newStaffId = $input['id'] ?? ('usr-' . time());
                    $accessAllProperties = !empty($input['accessAllProperties']) ? 1 : 0;
                    $stmt = $pdo->prepare("INSERT INTO staff_users (id, property_id, username, full_name, role, phone, phone_number, monthly_salary, daily_wage, status, is_financial_handler, passcode, qr_code_url, upi_id, access_all_properties)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            username = VALUES(username),
                            full_name = VALUES(full_name),
                            role = VALUES(role),
                            phone = VALUES(phone),
                            phone_number = VALUES(phone_number),
                            monthly_salary = VALUES(monthly_salary),
                            daily_wage = VALUES(daily_wage),
                            status = VALUES(status),
                            is_financial_handler = VALUES(is_financial_handler),
                            passcode = VALUES(passcode),
                            qr_code_url = VALUES(qr_code_url),
                            upi_id = VALUES(upi_id),
                            access_all_properties = VALUES(access_all_properties)");
                    $stmt->execute([
                        $newStaffId,
                        $propertyId,
                        $username,
                        $input['fullName'] ?? ($input['name'] ?? $username),
                        $input['role'] ?? 'Staff',
                        $username,
                        $username,
                        $input['monthlySalary'] ?? 0,
                        $input['dailyWage'] ?? 0,
                        $input['status'] ?? 'Active',
                        !empty($input['isFinancialHandler']) ? 1 : 0,
                        $passcode,
                        $input['qrCodeUrl'] ?? '',
                        $input['upiId'] ?? '',
                        $accessAllProperties
                    ]);
                    // Keep the flag consistent across every property_id row this staff
                    // id already has (compound-key table - login's LIMIT 1 may fetch
                    // any one of them, so all rows must agree).
                    $syncStmt = $pdo->prepare("UPDATE staff_users SET access_all_properties = ? WHERE id = ?");
                    $syncStmt->execute([$accessAllProperties, $newStaffId]);
                    echo json_encode(['status' => 'success', 'message' => 'Staff member created successfully']);

                    // Audit trail (24 Aug 2026, extending the fix applied to
                    // update_property - staff account creation/role assignment is
                    // at least as security-sensitive as a property setting change,
                    // and had the exact same gap: no audit_logs write at all).
                    try {
                        $auditUser = $_SESSION['username'] ?? 'System';
                        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
                        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                        $newFullName = $input['fullName'] ?? ($input['name'] ?? $username);
                        $actionMsg = "Created staff account: {$username} ({$newFullName}), role " . ($input['role'] ?? 'Staff');
                        $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (property_id, action, timestamp, user, ip_address, user_agent, status, module) VALUES (?, ?, NOW(), ?, ?, ?, 'Success', 'staff_management')");
                        $stmtAudit->execute([$propertyId, $actionMsg, $auditUser, $ip, $ua]);
                    } catch (Exception $eAudit) {}
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
                    $dailyWage        = isset($input['dailyWage']) ? $input['dailyWage'] : ($existing['daily_wage'] ?? 0);
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
                    $upiId            = isset($input['upiId']) ? trim($input['upiId']) : ($existing['upi_id'] ?? '');
                    $phoneNumber      = $input['username'] ?? ($existing['phone_number'] ?? $username);
                    // Only overwrite when the field is actually present in the payload -
                    // same "absent means leave alone" convention as the rest of this
                    // merge, so a partial update (e.g. just changing salary) can't
                    // accidentally reset this to off.
                    $accessAllProperties = isset($input['accessAllProperties'])
                        ? ($input['accessAllProperties'] ? 1 : 0)
                        : (int)($existing['access_all_properties'] ?? 0);

                    $stmt = $pdo->prepare("INSERT INTO staff_users (id, property_id, username, full_name, role, phone, phone_number, monthly_salary, daily_wage, status, is_financial_handler, passcode, qr_code_url, upi_id, access_all_properties)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            username = VALUES(username),
                            full_name = VALUES(full_name),
                            role = VALUES(role),
                            phone = VALUES(phone),
                            phone_number = VALUES(phone_number),
                            monthly_salary = VALUES(monthly_salary),
                            daily_wage = VALUES(daily_wage),
                            status = VALUES(status),
                            is_financial_handler = VALUES(is_financial_handler),
                            passcode = VALUES(passcode),
                            qr_code_url = VALUES(qr_code_url),
                            upi_id = VALUES(upi_id),
                            access_all_properties = VALUES(access_all_properties)");
                    $stmt->execute([
                        $input['id'],
                        $propertyId,
                        $username,
                        $fullName,
                        $role,
                        $phone,
                        $phoneNumber,
                        $monthlySalary,
                        $dailyWage,
                        $status,
                        $isFinancialHandler,
                        $passcode,
                        $qrCodeUrl,
                        $upiId,
                        $accessAllProperties
                    ]);
                    // Keep the flag consistent across every property_id row this staff
                    // id has - same reasoning as add_user above.
                    if (isset($input['accessAllProperties'])) {
                        $syncStmt = $pdo->prepare("UPDATE staff_users SET access_all_properties = ? WHERE id = ?");
                        $syncStmt->execute([$accessAllProperties, $input['id']]);
                    }
                    echo json_encode(['status' => 'success', 'message' => 'Staff member updated successfully']);

                    // Audit trail (24 Aug 2026, same fix as add_user above). Role
                    // changes are called out explicitly with old->new (the single
                    // most security-relevant field here - a role escalation should
                    // never be silent), everything else just names the field.
                    try {
                        $changedFields = [];
                        if ($existing) {
                            if ((string)($existing['role'] ?? '') !== (string)$role) $changedFields[] = "Role ({$existing['role']} \u{2192} {$role})";
                            if ((string)($existing['status'] ?? '') !== (string)$status) $changedFields[] = "Status ({$existing['status']} \u{2192} {$status})";
                            if ((float)($existing['monthly_salary'] ?? 0) != (float)$monthlySalary) $changedFields[] = 'Monthly Salary';
                            if ((float)($existing['daily_wage'] ?? 0) != (float)$dailyWage) $changedFields[] = 'Daily Wage';
                            if ((int)($existing['is_financial_handler'] ?? 0) !== (int)$isFinancialHandler) $changedFields[] = 'Financial Handler Flag';
                            if ((int)($existing['access_all_properties'] ?? 0) !== (int)$accessAllProperties) $changedFields[] = 'Access All Properties';
                            if ((string)($existing['full_name'] ?? '') !== (string)$fullName) $changedFields[] = 'Full Name';
                            if ((string)($existing['username'] ?? '') !== (string)$username) $changedFields[] = 'Username/Phone';
                            if ((string)($existing['upi_id'] ?? '') !== (string)$upiId) $changedFields[] = 'UPI ID';
                        }
                        if (!empty($input['passcode'])) $changedFields[] = 'Passcode';

                        $auditUser = $_SESSION['username'] ?? 'System';
                        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
                        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                        $actionMsg = "Updated staff account {$username}: " . (empty($changedFields) ? 'no field changes' : implode(', ', $changedFields));
                        $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (property_id, action, timestamp, user, ip_address, user_agent, status, module) VALUES (?, ?, NOW(), ?, ?, ?, 'Success', 'staff_management')");
                        $stmtAudit->execute([$propertyId, $actionMsg, $auditUser, $ip, $ua]);
                    } catch (Exception $eAudit) {}
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'delete_user':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    // Fetch before deleting - purely so the audit entry below can
                    // name who was deleted instead of just an opaque id.
                    $deletedName = $input['id'] ?? '';
                    try {
                        $stmtSel = $pdo->prepare("SELECT username, full_name, role FROM staff_users WHERE id = ? AND property_id = ?");
                        $stmtSel->execute([$input['id'], $propertyId]);
                        $delRow = $stmtSel->fetch(PDO::FETCH_ASSOC);
                        if ($delRow) {
                            $deletedName = ($delRow['full_name'] ?: $delRow['username']) . " ({$delRow['role']})";
                        }
                    } catch (PDOException $eSel) {}

                    $stmt = $pdo->prepare("DELETE FROM staff_users WHERE id = ? AND property_id = ?");
                    $stmt->execute([$input['id'], $propertyId]);
                    echo json_encode(['status' => 'success', 'message' => 'Staff member deleted successfully']);

                    // Audit trail (24 Aug 2026, same fix as add_user/update_user above).
                    try {
                        $auditUser = $_SESSION['username'] ?? 'System';
                        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
                        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
                        $actionMsg = "Deleted staff account: {$deletedName}";
                        $stmtAudit = $pdo->prepare("INSERT INTO audit_logs (property_id, action, timestamp, user, ip_address, user_agent, status, module) VALUES (?, ?, NOW(), ?, ?, ?, 'Success', 'staff_management')");
                        $stmtAudit->execute([$propertyId, $actionMsg, $auditUser, $ip, $ua]);
                    } catch (Exception $eAudit) {}
                } catch (PDOException $e) {
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
            }
            break;

        case 'get_payees':
            try {
                $stmt = $pdo->prepare("SELECT id, name, upi_id as upiId, qr_code_url as qrCodeUrl FROM payee_entities WHERE property_id = ? ORDER BY name ASC");
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
                    $stmt = $pdo->prepare("INSERT INTO payee_entities (id, property_id, name, upi_id, qr_code_url) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), upi_id = VALUES(upi_id), qr_code_url = VALUES(qr_code_url)");
                    $stmt->execute([
                        $input['id'] ?? ('pay-' . time()),
                        $propertyId,
                        $input['name'],
                        $input['upiId'] ?? '',
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
            // No seeding here on purpose - this used to auto-insert 22 canned rows
            // (property 1/Jaipur's real staff IDs and names, hardcoded July 2026
            // dates) into whichever property's Attendance Calendar was opened
            // first with zero rows on file. That planted fake attendance history
            // for staff who don't work at that property into every new property
            // on the platform, silently, on a page view. A property with no
            // marked attendance yet should show nothing, not fabricated data.
            try {
                $stmt = $pdo->prepare("SELECT a.id, a.attendance_date as date, a.user_id as staffId, a.staff_name as staffName, a.status
                                    FROM staff_attendance a
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
                $staffId = $input['staffId'] ?? $input['user_id'] ?? null;
                // No fallback to a hardcoded user id here on purpose - a dev-only
                // default (user 7, "Tarpan", property 1's own Super Admin) was
                // exactly how the auto-seed bug above planted attendance for
                // staff who don't belong to the property marking it. A request
                // missing staffId is a real bug on the caller's side to surface,
                // not something to paper over with a guess.
                if ($staffId === null) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'staffId is required']);
                    break;
                }
                try {
                    $stmt = $pdo->prepare("INSERT INTO staff_attendance (attendance_date, user_id, status, marked_by, property_id) VALUES (?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $input['date'] ?? date('Y-m-d'),
                        $staffId,
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
