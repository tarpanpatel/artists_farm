<?php
/**
 * Ground Code Resort & Kitchen Management System
 * Main Production Entry Point for XAMPP / Apache / cPanel PHP Hosting
 */

session_start();
require_once __DIR__ . '/php/config/database.php';

// Set correct content type for HTML (database.php sets application/json by default)
header('Content-Type: text/html; charset=UTF-8');

$dist_index = __DIR__ . '/dist/index.html';

// Prevent caching of the main entry point to ensure Vite HMR and new builds always load
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Cache-Control: post-check=0, pre-check=0", false);
header("Pragma: no-cache");

// Get tenant and property slugs from URL (for React)
$tenantSlug = isset($_GET['tenant_slug']) ? htmlspecialchars($_GET['tenant_slug']) : '';
$propertySlug = isset($_GET['property_slug']) ? htmlspecialchars($_GET['property_slug']) : '';
$app = isset($_GET['app']) ? htmlspecialchars($_GET['app']) : '';

// If visiting the bare root URL (no tenant/property/app specified), serve the marketing landing page
if (empty($tenantSlug) && empty($propertySlug) && empty($app)) {
    $landing_page = file_exists(__DIR__ . '/home.html') ? (__DIR__ . '/home.html') : (__DIR__ . '/index3.html');
    if (file_exists($landing_page)) {
        readfile($landing_page);
        exit();
    }
}

if (file_exists($dist_index)) {
    // Serve the production single-page application built from React
    $html = file_get_contents($dist_index);

    // Fix all relative asset paths to be absolute from /dist/ - needed because
    // the app is reachable at nested URLs (/{tenant}/{property}/...), where a
    // relative "./assets/" would resolve relative to THAT path instead of the
    // real location. Was hardcoded to "/artists_farm/dist/..." - a subfolder
    // this site has never actually been deployed under (it's served from the
    // domain root) - so every asset 404'd before this fix.
    $html = str_replace('href="./assets/', 'href="/dist/assets/', $html);
    $html = str_replace('src="./assets/', 'src="/dist/assets/', $html);
    $html = str_replace('./assets/', '/dist/assets/', $html);
    $html = str_replace('src="dist/', 'src="/dist/', $html);
    $html = str_replace('href="dist/', 'href="/dist/', $html);
    $html = str_replace('="/assets/', '="/dist/assets/', $html);

    // Point the manifest link at the dynamic per-request generator (php/manifest.php)
    // instead of the static bundled manifest.json, so a PWA installed from THIS
    // page's tenant/property reopens to the same place instead of the bare domain
    // root (which has no tenant/property context and breaks things like the
    // Public Demo Mode auto-login). Replaces whatever href is already there,
    // static or Vite-hashed.
    $manifestUrl = '/php/manifest.php?tenant_slug=' . urlencode($tenantSlug) . '&property_slug=' . urlencode($propertySlug);
    $html = preg_replace('/<link rel="manifest" href="[^"]*"\s*\/?>/', '<link rel="manifest" href="' . $manifestUrl . '" />', $html);

    // Inject tenant and property slugs into the page so React can access them
    $html = str_replace('</head>', "<script>window.__TENANT_SLUG__ = '$tenantSlug'; window.__PROPERTY_SLUG__ = '$propertySlug';</script>\n</head>", $html);

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
    <title>Ground Code Resort Management</title>
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
        <h1>🌾 Ground Code Resort System</h1>
        <p>Your PHP backend and MySQL database connection are online.</p>
        <a href="php/api/router.php" class="btn">Test API Router Endpoint &rarr;</a>
    </div>
</body>
</html>

