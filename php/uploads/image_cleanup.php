<?php
/**
 * Shared helpers for cleaning up orphaned uploaded images (property QR
 * codes, menu item photos, kitchen/catalog item photos) - the
 * persistent-asset counterpart to guests.php's deleteIdDocumentFiles()/
 * cleanupExpiredIdDocuments() for the temporary ID-document store.
 *
 * IMPORTANT difference from the ID-document cleanup: these images are meant
 * to live forever WHILE something still references them (a property's
 * current QR code, a menu item's current photo, ...), so cleanup here is
 * orphan-scan-based (delete only once no DB row points at the file any
 * more), never plain TTL-based - a blind "delete anything older than 24h"
 * would delete the QR code a property is actively using the day after they
 * upload it.
 *
 * Added 25 Aug 2026 - upload_image.php generates a brand-new random filename
 * on every upload and has never known about (or deleted) whatever file a
 * save was about to replace; update_property/menu.php/inventory.php's own
 * UPDATE statements were all plain column overwrites with no lookup of the
 * previous value either. Every QR-code/menu-photo/catalog-photo replacement
 * left the old file behind on disk forever (confirmed live, not a
 * hypothetical - see the "QR code replacement" question this was built to
 * answer).
 *
 * Two layers, matching the existing ID-document pattern's own two layers:
 *   1. deleteReplacedImage() - called at the exact moment a save replaces
 *      one of these URLs, for the instant/common case.
 *   2. cleanupOrphanedCategoryImages() - a daily cron sweep (see
 *      php/cron/cleanup_orphaned_images.php) that catches anything layer 1
 *      missed: files from before this fix existed, a browser tab closed
 *      mid-upload before the save request fired, an item/property later
 *      deleted outright, etc.
 */

// Resolves a stored image URL (as saved in a DB column, e.g.
// "/artist_farm/php/uploads/images/{tenant}/{property}/payment_qr/abc123.jpg")
// back to its real filesystem path. Anchored on finding "/uploads/" in the
// string (same technique as guests.php's deleteIdDocumentFiles) so it works
// no matter which directory the calling file lives in.
function resolveUploadedImageFsPath(?string $url): ?string {
    if (!$url) {
        return null;
    }
    $pos = strpos($url, '/uploads/');
    if ($pos === false) {
        return null;
    }
    return __DIR__ . '/../' . substr($url, $pos + 1);
}

// Best-effort delete of the file an old URL pointed at - but only when a
// replacement is actually happening (a new value is present and different
// from the old one). Never fires on a save that left the field untouched,
// or cleared it back to what it already was. Safe to call with either value
// empty/null.
function deleteReplacedImage(?string $oldUrl, ?string $newUrl): void {
    if (!$oldUrl || $oldUrl === $newUrl) {
        return;
    }
    $fsPath = resolveUploadedImageFsPath($oldUrl);
    if ($fsPath && is_file($fsPath)) {
        @unlink($fsPath);
    }
}

// Orphan sweep for one upload_image.php category folder (payment_qr/
// food_menu/kitchen_stock) across every tenant/property at once. A file is
// deleted only if BOTH:
//   - its filename doesn't appear in any of the supplied "live" SQL queries
//     (each expected to SELECT a single column of stored image URLs, one row
//     per still-in-use reference, across ALL properties/tenants), AND
//   - it's older than $graceHours (default 24, matching the ID-document
//     TTL's own window) - a safety margin against deleting a file that was
//     just uploaded but whose owning record hasn't been saved yet (upload,
//     then save, are two separate HTTP requests in every one of these
//     screens - a closed tab or a failed second request must not turn into
//     an immediate deletion of a file the user might still complete).
// Matches by basename only (upload_image.php names files
// bin2hex(random_bytes(12)) - collision-proof in practice), not full path,
// since the same physical file can be reachable via different URL prefixes
// depending on how a request arrived (SCRIPT_NAME-derived, per
// upload_image.php's own comment on that).
function cleanupOrphanedCategoryImages(PDO $pdo, string $categoryFolder, array $liveUrlQueries, int $graceHours = 24): array {
    $liveFilenames = [];
    foreach ($liveUrlQueries as $sql) {
        try {
            $stmt = $pdo->query($sql);
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $url) {
                if ($url) {
                    $liveFilenames[basename($url)] = true;
                }
            }
        } catch (Exception $e) {
            // A missing table/column shouldn't abort the whole sweep - just
            // treat that one reference source as empty for this run.
        }
    }

    $baseDir = __DIR__ . '/images';
    // Fixed depth by design: images/{tenant}/{property}/{category}/{file} -
    // a double wildcard covers every tenant/property without needing a
    // recursive directory walk.
    $pattern = $baseDir . '/*/*/' . $categoryFolder . '/*';
    $files = glob($pattern) ?: [];
    $cutoff = time() - ($graceHours * 3600);

    $scanned = 0;
    $removed = 0;
    foreach ($files as $file) {
        if (!is_file($file)) {
            continue;
        }
        $scanned++;
        if (isset($liveFilenames[basename($file)])) {
            continue;
        }
        if (filemtime($file) >= $cutoff) {
            continue;
        }
        if (@unlink($file)) {
            $removed++;
        }
    }

    return ['scanned' => $scanned, 'removed' => $removed, 'live' => count($liveFilenames)];
}
