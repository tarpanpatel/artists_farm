<?php
// Temporary category name fix script - delete after use
require_once __DIR__ . '/../config/database.php';

$updates = [
    ['old' => 'Chinese & Snacks',    'new' => 'Chinese'],
    ['old' => 'Pizzas & Sandwiches', 'new' => 'Pizza & Sandwich'],
    ['old' => 'Breads & Rice',       'new' => 'Rice & Roti'],
    ['old' => 'Breakfast & Eggs',    'new' => 'Breakfast'],
    ['old' => 'Salads & Raita',      'new' => 'Raita & Salad'],
];

$results = [];
foreach ($updates as $u) {
    $stmt = $pdo->prepare("UPDATE menu_categories SET name = ? WHERE name = ?");
    $stmt->execute([$u['new'], $u['old']]);
    $results[] = ['from' => $u['old'], 'to' => $u['new'], 'rows_updated' => $stmt->rowCount()];
}

$cats = $pdo->query("SELECT id, name FROM menu_categories ORDER BY id")->fetchAll();
echo json_encode(['updates' => $results, 'current_categories' => $cats]);
