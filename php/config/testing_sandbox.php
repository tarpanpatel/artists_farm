<?php
/**
 * /php/config/testing_sandbox.php
 * Sandbox / Testing Mode Database Cloning & Reset Utility
 */

function clone_database_tables($pdo_sys, $live_db, $test_db) {
    try {
        $can_use_test_db = false;
        
        // Try creating or switching to $test_db
        try {
            $pdo_sys->exec("CREATE DATABASE IF NOT EXISTS `$test_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            $can_use_test_db = true;
        } catch (Exception $e_db) {
            // Check if $test_db is already accessible even if CREATE DATABASE is restricted
            try {
                $pdo_sys->exec("USE `$test_db`");
                $can_use_test_db = true;
            } catch (Exception $e_use) {
                $can_use_test_db = false;
            }
        }

        if ($can_use_test_db) {
            // Mode A: Clone into separate database ($test_db)
            $tablesStmt = $pdo_sys->query("SHOW TABLES FROM `$live_db`");
            $tables = $tablesStmt->fetchAll(PDO::FETCH_COLUMN);

            foreach ($tables as $table) {
                if (str_starts_with($table, 'test_')) continue;
                $pdo_sys->exec("DROP TABLE IF EXISTS `$test_db`.`$table`");
                $pdo_sys->exec("CREATE TABLE `$test_db`.`$table` LIKE `$live_db`.`$table`");
                $pdo_sys->exec("INSERT INTO `$test_db`.`$table` SELECT * FROM `$live_db`.`$table`");
            }
        } else {
            // Mode B: Shared hosting fallback - clone into test_ prefixed tables inside $live_db
            $tablesStmt = $pdo_sys->query("SHOW TABLES FROM `$live_db`");
            $tables = $tablesStmt->fetchAll(PDO::FETCH_COLUMN);

            $liveTables = array_filter($tables, function($t) {
                return !str_starts_with($t, 'test_');
            });

            foreach ($liveTables as $table) {
                $testTable = "test_" . $table;
                $pdo_sys->exec("DROP TABLE IF EXISTS `$live_db`.`$testTable`");
                $pdo_sys->exec("CREATE TABLE `$live_db`.`$testTable` LIKE `$live_db`.`$table`");
                $pdo_sys->exec("INSERT INTO `$live_db`.`$testTable` SELECT * FROM `$live_db`.`$table`");
            }
        }
        return true;
    } catch (Exception $e) {
        error_log("Failed to clone database from $live_db to $test_db: " . $e->getMessage());
        throw $e;
    }
}

function handle_reset_test_database($db_host, $db_user, $db_pass, $live_db, $test_db) {
    try {
        $pdo_sys = new PDO("mysql:host=$db_host;dbname=$live_db;charset=utf8mb4", $db_user, $db_pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $success = clone_database_tables($pdo_sys, $live_db, $test_db);
        if ($success) {
            echo json_encode(['status' => 'success', 'message' => 'Sandbox database successfully reset to live snapshot.']);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Could not reset sandbox database.']);
        }
    } catch (Exception $e) {
        http_response_code(200);
        echo json_encode(['status' => 'error', 'message' => 'Reset error: ' . $e->getMessage()]);
    }
}
