<?php
/**
 * Orphaned Uploaded Image Sweeper - Scheduled Task
 *
 * Run daily via cron job:
 * 0 4 * * * /usr/bin/php /path/to/artists_farm/php/cron/cleanup_orphaned_images.php
 *
 * Sweeps the three persistent, tenant/property-scoped image categories
 * upload_image.php writes to - payment_qr (property UPI QR codes),
 * food_menu (menu item photos), kitchen_stock (inventory/catalog item
 * photos) - and deletes any file on disk that no DB row references any
 * more AND is older than 24h (see cleanupOrphanedCategoryImages()'s own
 * comment for why the grace window exists).
 *
 * Deliberately separate from guest ID documents' own 24h TTL sweep
 * (guests.php's cleanupExpiredIdDocuments(), still wired into
 * router.php's own request path) - that store is TTL-only by design
 * because ID photos are meant to be temporary. These three are meant to be
 * permanent while in use, so this sweep is orphan-scan-based instead: a
 * file only gets deleted once nothing points at it, never just because
 * it's "old".
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../uploads/image_cleanup.php';

$logFile = __DIR__ . '/orphaned_images_cleanup.log';
$timestamp = date('Y-m-d H:i:s');
file_put_contents($logFile, "$timestamp - Orphaned image sweep started\n", FILE_APPEND);

try {
    $results = [];

    $results['payment_qr'] = cleanupOrphanedCategoryImages($pdo, 'payment_qr', [
        "SELECT upi_qr_code_url FROM properties WHERE upi_qr_code_url IS NOT NULL AND upi_qr_code_url != ''",
    ]);

    $results['food_menu'] = cleanupOrphanedCategoryImages($pdo, 'food_menu', [
        "SELECT image_path FROM menu_items WHERE image_path IS NOT NULL AND image_path != ''",
    ]);

    // req_catalog = each property's own catalog; system_stock_catalog = the
    // platform-wide list items get adopted from (Root Admin > System Stock).
    // A file can legitimately be referenced by either or both, so both are
    // treated as "live" - never delete a file the global catalog still
    // points at just because one property removed its own copy.
    $results['kitchen_stock'] = cleanupOrphanedCategoryImages($pdo, 'kitchen_stock', [
        "SELECT image_path FROM req_catalog WHERE image_path IS NOT NULL AND image_path != ''",
        "SELECT image_path FROM system_stock_catalog WHERE image_path IS NOT NULL AND image_path != ''",
    ]);

    $summary = [];
    foreach ($results as $category => $r) {
        $summary[] = "$category: scanned {$r['scanned']}, removed {$r['removed']}, live refs {$r['live']}";
    }
    file_put_contents($logFile, "$timestamp - Sweep completed - " . implode(' | ', $summary) . "\n", FILE_APPEND);
} catch (Exception $e) {
    file_put_contents($logFile, "$timestamp - ERROR: " . $e->getMessage() . "\n", FILE_APPEND);
}
