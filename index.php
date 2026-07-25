<?php
/**
 * Artists Farm Resort & Kitchen Management System
 * Main Production Entry Point for XAMPP / Apache / cPanel PHP Hosting
 */

$dist_index = __DIR__ . '/dist/index.html';

if (file_exists($dist_index)) {
    // Serve the production single-page application built from React
    $html = file_get_contents($dist_index);
    // Fix relative asset path references when serving dist/index.html from root folder
    $html = str_replace('./assets/', 'dist/assets/', $html);
    $html = str_replace('="/assets/', '="dist/assets/', $html);
    echo $html;
    exit();
}

// Fallback status card if dist/ is missing
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Artists Farm Resort Management</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; display: flex; height: 100vh; align-items: center; justify-content: center; margin: 0; }
        .card { background: white; padding: 2.5rem; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); max-width: 520px; text-align: center; }
        h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #0f172a; }
        p { color: #64748b; line-height: 1.6; margin-bottom: 1.5rem; }
        .badge { background: #e0f2fe; color: #0369a1; padding: 4px 12px; border-radius: 99px; font-weight: 600; font-size: 0.875rem; display: inline-block; margin-bottom: 1rem; }
        .btn { display: inline-block; background: #0284c7; color: white; padding: 0.75rem 1.5rem; text-decoration: none; border-radius: 8px; font-weight: 600; }
        .btn:hover { background: #0369a1; }
    </style>
</head>
<body>
    <div class="card">
        <span class="badge">PHP Backend Active</span>
        <h1>🌾 Artists Farm Resort System</h1>
        <p>Your PHP backend and MySQL database connection are online.</p>
        <a href="php/api/router.php" class="btn">Test API Router Endpoint &rarr;</a>
    </div>
</body>
</html>
