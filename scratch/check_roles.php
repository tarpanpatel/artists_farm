<?php
require 'php/config/database.php';
$pdo->exec("UPDATE nav_menu_items SET title = 'Reports & Earnings' WHERE unique_key = 'dashboard_analytics'");
$pdo->exec("UPDATE nav_menu_items SET title = 'Past Bills & Receipts' WHERE unique_key = 'past_receipts_log'");
$pdo->exec("UPDATE nav_menu_items SET title = 'Menu & Pricing' WHERE unique_key = 'edit_items_group'");
$pdo->exec("UPDATE nav_menu_items SET title = 'Extra Charges & Fees' WHERE unique_key = 'misc_charges'");
$pdo->exec("UPDATE nav_menu_items SET title = 'Telegram Alerts' WHERE unique_key = 'telegram'");
$pdo->exec("UPDATE nav_menu_items SET title = 'Download Data & Excel' WHERE unique_key = 'data_export_center'");
$pdo->exec("UPDATE nav_menu_items SET title = 'Dish Recipes (Auto-Stock)' WHERE unique_key = 'beta_recipe_builder'");
$pdo->exec("UPDATE nav_menu_items SET title = 'Property Licenses' WHERE unique_key = 'license_management'");

$stmt = $pdo->query('SELECT id, title, unique_key, parent_id FROM nav_menu_items WHERE parent_id = "nav-header-admin" OR unique_key = "admin_control_group" ORDER BY display_order ASC');
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));


