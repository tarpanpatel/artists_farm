<?php
require 'php/config/database.php';
$stmt = $pdo->query('SELECT id, title, tab_key, unique_key, custom_url, is_visible FROM nav_menu_items WHERE custom_url IS NOT NULL AND custom_url != ""');
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
