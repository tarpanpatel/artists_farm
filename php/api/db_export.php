<?php
/**
 * Live database export - lets a platform admin download a full mysqldump of
 * the production database straight from the Root Dashboard, so local dev can
 * be kept in sync without needing SSH access. See deploy/pull-live-data.ps1
 * for the equivalent SSH-based approach - this is the browser-triggered one.
 */

function handleExportDatabaseDump($pdo, $db_host, $db_user, $db_pass, $db_name) {
    if (empty($_SESSION['is_platform_admin'])) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Platform admin access required.']);
        return;
    }

    if (!function_exists('shell_exec') || stripos((string) ini_get('disable_functions'), 'shell_exec') !== false) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'shell_exec is disabled on this server - export unavailable.']);
        return;
    }

    $mysqldump = trim((string) shell_exec('which mysqldump 2>/dev/null'));
    if (!$mysqldump) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'mysqldump binary not found on server.']);
        return;
    }

    // Escapeshellarg everything - $db_pass in particular could contain shell
    // metacharacters (it's a real password, not a generated token).
    $cmd = sprintf(
        '%s -h%s -u%s -p%s --routines --triggers --single-transaction %s 2>&1',
        escapeshellarg($mysqldump),
        escapeshellarg($db_host),
        escapeshellarg($db_user),
        escapeshellarg($db_pass),
        escapeshellarg($db_name)
    );

    $dump = shell_exec($cmd);
    if ($dump === null || $dump === '' || stripos($dump, 'mysqldump: Error') !== false || stripos($dump, 'Access denied') !== false) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'mysqldump failed: ' . substr((string) $dump, 0, 500)]);
        error_log('export_database_dump failed: ' . substr((string) $dump, 0, 1000));
        return;
    }

    $filename = 'artists_farm_live_' . date('Y-m-d_His') . '.sql';
    header('Content-Type: application/sql');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . strlen($dump));
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    echo $dump;
}
