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

        // Public demo mode (12 Aug 2026): lets a designated property (e.g. the
        // luxe-stays sales demo) grant real, full access to anonymous
        // visitors without a login - see the is_public_demo check in
        // router.php, right before $is_authenticated_user is captured.
        try {
            $stmt = $pdo->query("SHOW COLUMNS FROM properties LIKE 'is_public_demo'");
            if (!$stmt->fetch()) {
                $pdo->exec("ALTER TABLE properties ADD COLUMN `is_public_demo` TINYINT(1) NOT NULL DEFAULT 0");
            }
        } catch (Exception $e) {
            error_log("properties.is_public_demo migration error: " . $e->getMessage());
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

        // Self-heal-in-reverse: drop `allow_custom_telegram_bot` (26 Aug 2026). It was added for a
        // Root-Admin "let this property use its own bot" toggle that was never actually built - no
        // control was ever rendered, and the `allowCustomBot` prop threaded down to
        // TelegramSetupWizard.tsx was declared but never read, so the value could never affect
        // anything. Removed at the user's explicit direction: the Telegram strategy is pure
        // White-Glove (Root Admin sets bot tokens centrally, property owners never touch a token),
        // which makes a per-property "allow custom bot" switch a contradiction rather than a
        // pending feature. Same one-time-drop pattern as orders.php's reminder-column removal -
        // guarded by its own SHOW COLUMNS check so it's idempotent and a no-op once applied.
        try {
            $stmt = $pdo->query("SHOW COLUMNS FROM properties LIKE 'allow_custom_telegram_bot'");
            if ($stmt->fetch()) {
                $pdo->exec("ALTER TABLE properties DROP COLUMN `allow_custom_telegram_bot`");
            }
        } catch (Exception $e) {
            error_log("Properties allow_custom_telegram_bot column drop error: " . $e->getMessage());
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
