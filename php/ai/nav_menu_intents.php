<?php
/**
 * Nav Menu Intents
 *
 * Turns whatever is currently configured in the `nav_menu_items` table into
 * "go to X" navigation intents, so the AI assistant automatically learns
 * about new screens Root Admin adds via the Nav Menu Editor without any code
 * change here.
 */

/**
 * @return array<int, array{label: string, target: array{tabKey: string, uniqueKey: string}}>
 */
function ai_build_nav_intents(PDO $pdo): array {
    $intents = [];
    try {
        $stmt = $pdo->query("SELECT title, tab_key as tabKey, unique_key as uniqueKey FROM nav_menu_items WHERE is_visible = 1 OR is_visible IS NULL");
        foreach ($stmt->fetchAll() as $row) {
            $title = trim((string) $row['title']);
            if ($title === '' || empty($row['tabKey'])) {
                continue;
            }
            $intents[] = [
                'label' => $title,
                'target' => [
                    'tabKey' => $row['tabKey'],
                    'uniqueKey' => $row['uniqueKey'] ?? '',
                ],
            ];
        }
    } catch (PDOException $e) {
        // Table not migrated yet on this install - navigation intents are optional,
        // the offline engine still handles everything else.
    }
    return $intents;
}
