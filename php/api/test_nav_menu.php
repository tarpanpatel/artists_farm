<?php
session_start();
require_once __DIR__ . '/../config/database.php';

// Simulate being in Root Admin context
$_SESSION['username'] = 'platform_admin';

try {
    $stmt = $pdo->query("SELECT id, title, tab_key as tabKey, unique_key as uniqueKey, category, icon_name as iconName, display_order as `order`, roles_json, is_visible as isVisible, COALESCE(custom_url, '') as customUrl, IFNULL(open_in_new_tab, 0) as openInNewTab, parent_id as parentId FROM nav_menu_items ORDER BY display_order ASC");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo "Raw rows count: " . count($rows) . "\n\n";

    $data = array_map(function($r) {
        return [
            'id' => (string)$r['id'],
            'title' => $r['title'],
            'tabKey' => $r['tabKey'],
            'uniqueKey' => $r['uniqueKey'],
            'category' => $r['category'],
            'iconName' => $r['iconName'],
            'order' => (int)$r['order'],
            'roles' => json_decode($r['roles_json'] ?? '[]', true) ?: [],
            'isVisible' => (bool)$r['isVisible'],
            'customUrl' => $r['customUrl'] ?? '',
            'openInNewTab' => (bool)$r['openInNewTab'],
            'parentId' => $r['parentId'] ?: null
        ];
    }, $rows);

    echo json_encode(['status' => 'success', 'data' => $data, 'count' => count($data)], JSON_PRETTY_PRINT);
} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()], JSON_PRETTY_PRINT);
}
?>
