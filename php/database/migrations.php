<?php
/**
 * Database Migrations & Initialization
 * Ensures all required tables exist on application startup
 */

function initializeDatabaseTables($pdo) {
    try {
        // platform_theme_settings, properties, and every other table this app
        // uses are provisioned once via direct migration, not re-verified on
        // every request - see ROADMAP.md history for the cleanup. This
        // function now only handles column-level checks below.

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

        // Ensure properties table has the root-admin-controlled Telegram template
        // customization toggle
        try {
            $stmt = $pdo->query("SHOW COLUMNS FROM properties LIKE 'telegram_template_customization_enabled'");
            if (!$stmt->fetch()) {
                $pdo->exec("ALTER TABLE properties ADD COLUMN `telegram_template_customization_enabled` TINYINT(1) DEFAULT 0");
            }
        } catch (Exception $e) {
            error_log("Properties telegram_template_customization_enabled column migration error: " . $e->getMessage());
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
