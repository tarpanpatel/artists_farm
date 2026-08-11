<?php
/**
 * clean_all_demo.php
 * Explicitly cleans all demo/test data from the live production database.
 */
require_once __DIR__ . '/../config/database.php';

header('Content-Type: application/json');

try {
    // Explicitly connect to the live production database
    $live_pdo = new PDO("mysql:host=$db_host;dbname=$live_db;charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    
    // 1. Delete staff users starting with demo_ or DEMO-
    $stmt1 = $live_pdo->prepare("DELETE FROM staff_users WHERE username LIKE 'demo_%' OR id LIKE 'DEMO-%'");
    $stmt1->execute();
    $deleted_staff = $stmt1->rowCount();
    
    // 2. Delete demo guests by exact name match
    $stmt2 = $live_pdo->prepare("DELETE FROM guests WHERE guest_name IN ('John Smith', 'Sarah Johnson', 'Mike Wilson', 'Emma Davis', 'Oliver Brown', 'Alice Brown', 'Bob Green', 'Carol White', 'David Lee', 'Fiona Taylor', 'George Harris', 'Robert Taylor')");
    $stmt2->execute();
    $deleted_guests = $stmt2->rowCount();
    
    // 3. Delete demo menu items by exact name match
    $stmt3 = $live_pdo->prepare("DELETE FROM menu_items WHERE name IN ('Scrambled Eggs & Toast', 'Pancakes with Syrup', 'Oatmeal with Fruits', 'Grilled Chicken Breast', 'Fish Curry', 'Vegetable Stir Fry', 'Fresh Orange Juice', 'Coffee', 'Tea', 'Samosas (4 pcs)', 'Garlic Bread', 'Chocolate Cake', 'Ice Cream')");
    $stmt3->execute();
    $deleted_menu = $stmt3->rowCount();
    
    // 4. Delete demo inventory items by exact name match
    $stmt4 = $live_pdo->prepare("DELETE FROM req_catalog WHERE item_name IN ('Chicken Breast', 'Rice', 'Eggs', 'Milk', 'Vegetables Mix', 'Cleaning Supplies')");
    $stmt4->execute();
    $deleted_inventory = $stmt4->rowCount();

    // 5. Delete demo petty cash entries
    $stmt5 = $live_pdo->prepare("DELETE FROM petty_cash WHERE id LIKE 'EXP-%'");
    $stmt5->execute();
    $deleted_petty_cash = $stmt5->rowCount();

    // 6. Delete demo audit logs
    $stmt6 = $live_pdo->prepare("DELETE FROM audit_logs WHERE action LIKE '%Demo%' OR action LIKE '%John Smith%' OR action LIKE '%Sarah Johnson%'");
    $stmt6->execute();
    $deleted_audit = $stmt6->rowCount();

    echo json_encode([
        'status' => 'success',
        'message' => "Successfully cleaned live production database: removed $deleted_staff staff users, $deleted_guests guests, $deleted_menu menu items, $deleted_inventory inventory items, $deleted_petty_cash petty cash entries, $deleted_audit audit logs."
    ]);
} catch (Exception $e) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Clean error: ' . $e->getMessage()
    ]);
}
