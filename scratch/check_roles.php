<?php
require 'php/config/database.php';
$stmt = $pdo->query('SELECT settings_json FROM platform_theme_settings WHERE id = 1');
$row = $stmt->fetch(PDO::FETCH_ASSOC);
if ($row) {
    $settings = json_decode($row['settings_json'], true);
    $settings['typography']['fontFamily'] = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';
    $settings['typography']['baseFontSize'] = '16px';
    $newJson = json_encode($settings);
    $upd = $pdo->prepare('UPDATE platform_theme_settings SET settings_json = ? WHERE id = 1');
    $upd->execute([$newJson]);
    echo "Updated successfully!\n";
}
$stmt = $pdo->query('SELECT settings_json FROM platform_theme_settings WHERE id = 1');
print_r($stmt->fetch(PDO::FETCH_ASSOC));




