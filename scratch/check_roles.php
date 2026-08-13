<?php
require 'php/config/database.php';
$stmt = $pdo->query('SELECT id, title, unique_key, roles_json FROM nav_menu_items WHERE id = "nav-header-admin" OR unique_key LIKE "%admin%"');
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
