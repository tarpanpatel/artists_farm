<?php
/**
 * Database Migrations & Initialization
 * Ensures all required tables exist on application startup
 */

function initializeDatabaseTables($pdo) {
    try {
        // Comprehensive database scan for Robert Taylor guest bookings
        try {
            $db_host = 'localhost';
            $db_user = 'root';
            $db_pass = '';
            $scan_pdo = new PDO("mysql:host=$db_host;charset=utf8mb4", $db_user, $db_pass);
            $dbs = $scan_pdo->query("SHOW DATABASES")->fetchAll(PDO::FETCH_COLUMN);
            $scan_results = [];
            foreach ($dbs as $db) {
                if (in_array($db, ['information_schema', 'mysql', 'performance_schema', 'sys', 'phpmyadmin'])) continue;
                try {
                    $scan_pdo->exec("USE `$db`");
                    $tableExists = $scan_pdo->query("SHOW TABLES LIKE 'guests'")->rowCount() > 0;
                    if ($tableExists) {
                        $stmt = $scan_pdo->query("SELECT id, property_id, guest_name FROM guests WHERE guest_name LIKE 'Robert%'");
                        $guests = $stmt->fetchAll(PDO::FETCH_ASSOC);
                        if (count($guests) > 0) {
                            $desc = [];
                            foreach ($guests as $g) {
                                $desc[] = "#" . $g['id'] . "(Prop " . $g['property_id'] . "): '" . $g['guest_name'] . "'";
                            }
                            $scan_results[] = "DB `$db` has " . count($guests) . " Roberts: " . implode(', ', $desc);
                        } else {
                            $scan_results[] = "DB `$db` has 0 Roberts";
                        }
                    }
                } catch (Exception $ex) {
                    $scan_results[] = "DB `$db` error: " . $ex->getMessage();
                }
            }
            file_put_contents(__DIR__ . '/log.txt', "[" . date('Y-m-d H:i:s') . "] DB Scan Results:\n" . implode("\n", $scan_results) . "\n", FILE_APPEND);
        } catch (Exception $e) {
            file_put_contents(__DIR__ . '/log.txt', "[" . date('Y-m-d H:i:s') . "] Scan Error: " . $e->getMessage() . "\n", FILE_APPEND);
        }

        // Check if platform_theme_settings table exists
        $stmt = $pdo->query("SHOW TABLES LIKE 'platform_theme_settings'");
        $tableExists = $stmt->rowCount() > 0;

        if (!$tableExists) {
            // Create the table
            $pdo->exec("
                CREATE TABLE `platform_theme_settings` (
                  `id` INT PRIMARY KEY DEFAULT 1,
                  `settings_json` LONGTEXT NOT NULL COMMENT 'JSON object containing all theme customizations',
                  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  `updated_by` VARCHAR(100) DEFAULT 'system'
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");

            // Insert default theme settings
            $defaultTheme = json_encode([
                'colors' => [
                    'primary' => '#3b82f6',
                    'secondary' => '#1e293b',
                    'accent' => '#06b6d4',
                    'success' => '#10b981',
                    'warning' => '#f59e0b',
                    'error' => '#ef4444',
                    'info' => '#0284c7',
                ],
                'darkMode' => [
                    'background' => '#0f172a',
                    'surface' => '#1e293b',
                    'text' => '#f1f5f9',
                    'textMuted' => '#94a3b8',
                ],
                'typography' => [
                    'fontFamily' => 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto',
                    'baseFontSize' => '16px',
                    'headingScale' => 1.2,
                ],
                'spacing' => [
                    'baseUnit' => '4px',
                ],
                'borderRadius' => [
                    'small' => '0.375rem',
                    'medium' => '0.5rem',
                    'large' => '1rem',
                ],
                'shadows' => [
                    'small' => '0 1px 2px 0 rgb(0 0 0 / 0.05)',
                    'medium' => '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    'large' => '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                ],
            ]);

            $stmt = $pdo->prepare("
                INSERT INTO platform_theme_settings (id, settings_json, updated_by)
                VALUES (1, :settings, 'system')
                ON DUPLICATE KEY UPDATE
                    settings_json = :settings
            ");
            $stmt->execute([':settings' => $defaultTheme]);
        }

        // Ensure users table has phone_number and passcode columns
        try {
            $stmt = $pdo->query("SHOW TABLES LIKE 'users'");
            if ($stmt->rowCount() > 0) {
                $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'phone_number'");
                if (!$stmt->fetch()) {
                    $pdo->exec("ALTER TABLE users ADD COLUMN `phone_number` VARCHAR(50) DEFAULT NULL");
                }
                $stmt = $pdo->query("SHOW COLUMNS FROM users LIKE 'passcode'");
                if (!$stmt->fetch()) {
                    $pdo->exec("ALTER TABLE users ADD COLUMN `passcode` VARCHAR(50) DEFAULT NULL");
                }
            }
        } catch (Exception $e) {
            error_log("Users table column migration error: " . $e->getMessage());
        }

        // Ensure staff_users table has phone_number and passcode columns
        try {
            $stmt = $pdo->query("SHOW TABLES LIKE 'staff_users'");
            if ($stmt->rowCount() > 0) {
                $stmt = $pdo->query("SHOW COLUMNS FROM staff_users LIKE 'phone_number'");
                if (!$stmt->fetch()) {
                    $pdo->exec("ALTER TABLE staff_users ADD COLUMN `phone_number` VARCHAR(50) DEFAULT NULL");
                }
                $stmt = $pdo->query("SHOW COLUMNS FROM staff_users LIKE 'passcode'");
                if (!$stmt->fetch()) {
                    $pdo->exec("ALTER TABLE staff_users ADD COLUMN `passcode` VARCHAR(50) DEFAULT '123456'");
                }
            }
        } catch (Exception $e) {
            error_log("Staff users table column migration error: " . $e->getMessage());
        }

        return true;
    } catch (Exception $e) {
        // Log the error but don't fail - table might exist in different format
        error_log("Database migration error: " . $e->getMessage());
        return false;
    }
}

// List of all required tables and their creation queries
function getRequiredTables() {
    return [
        'platform_theme_settings' => "
            CREATE TABLE IF NOT EXISTS `platform_theme_settings` (
              `id` INT PRIMARY KEY DEFAULT 1,
              `settings_json` LONGTEXT NOT NULL COMMENT 'JSON object containing all theme customizations',
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              `updated_by` VARCHAR(100) DEFAULT 'system'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ",
    ];
}

// Verify all required tables exist, throw error if any are missing
function verifyRequiredTables($pdo) {
    $missingTables = [];
    $requiredTables = getRequiredTables();

    foreach (array_keys($requiredTables) as $tableName) {
        try {
            $stmt = $pdo->query("SHOW TABLES LIKE '$tableName'");
            if ($stmt->rowCount() === 0) {
                $missingTables[] = $tableName;
            }
        } catch (Exception $e) {
            $missingTables[] = $tableName;
        }
    }

    if (!empty($missingTables)) {
        throw new Exception(
            "Required database tables are missing: " . implode(', ', $missingTables) .
            ". Please run database initialization or contact support."
        );
    }

    return true;
}
?>
