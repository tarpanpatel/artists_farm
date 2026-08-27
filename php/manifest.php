<?php
/**
 * Dynamic PWA manifest.
 *
 * This is a multi-tenant app served at /{tenant_slug}/{property_slug}/ - a
 * single static manifest.json with start_url "/" means every install (real
 * tenant admin OR a public demo visitor) opens to the bare domain root on
 * launch, with zero tenant/property context in the URL. The frontend derives
 * which property to show entirely from window.location.pathname
 * (getPropertySlug() in src/services/api.ts), so that falls back to
 * 'default' - breaking the Public Demo Mode auto-login (which requires a
 * real property_slug on the request) and landing real tenant admins on the
 * wrong property too.
 *
 * index.php rewrites the <link rel="manifest"> href on every page to point
 * here with the CURRENT page's tenant_slug/property_slug, so whichever
 * page a visitor installs from is the page the installed icon reopens.
 */
header('Content-Type: application/manifest+json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$tenantSlug = isset($_GET['tenant_slug']) ? preg_replace('/[^a-z0-9_-]/i', '', $_GET['tenant_slug']) : '';
$propertySlug = isset($_GET['property_slug']) ? preg_replace('/[^a-z0-9_-]/i', '', $_GET['property_slug']) : '';

$startUrl = '/';
if ($tenantSlug !== '' && $propertySlug !== '') {
    $startUrl = "/$tenantSlug/$propertySlug/";
} elseif ($propertySlug !== '') {
    $startUrl = "/$propertySlug/";
}

$manifest = [
    'name' => 'Ground Code POS',
    'short_name' => 'AF POS',
    'description' => 'Ground Code POS & Owner Operations System',
    'start_url' => $startUrl,
    // Kept broad (not narrowed to $startUrl) so navigating to other routes
    // (root_dashboard, other properties a staff member has access to, etc.)
    // stays inside standalone PWA display mode instead of kicking back out
    // to a regular browser tab the moment the URL leaves $startUrl.
    'scope' => '/',
    'display' => 'standalone',
    'orientation' => 'portrait',
    'background_color' => '#0B84FF',
    'theme_color' => '#0B84FF',
    'icons' => [
        [
            'src' => '/app-icons/android-chrome-192x192.png',
            'sizes' => '192x192',
            'type' => 'image/png',
            'purpose' => 'any maskable',
        ],
        [
            'src' => '/app-icons/android-chrome-512x512.png',
            'sizes' => '512x512',
            'type' => 'image/png',
            'purpose' => 'any maskable',
        ],
    ],
];

echo json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

