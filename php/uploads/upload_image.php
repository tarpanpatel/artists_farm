<?php
/**
 * Image Upload Endpoint
 * Receives a multipart/form-data image upload, resizes/crops it, saves to disk, returns URL.
 * POST fields: image=<file>, folder=menu|catalog|misc|id_documents|qr_code
 * Response: { "status": "success", "url": "/artist_farm/uploads/images/{tenant}/{property}/{category}/abc123.jpg" }
 *
 * Storage layout (11 Aug 2026 - was previously one flat shared folder per
 * category, no tenant/property isolation at all - see ROADMAP.md):
 * images/{tenant_slug}/{property_slug}/{category}/{filename}, where category
 * is food_menu/kitchen_stock/id_documents/misc depending on the `folder`
 * param. Property context comes from the same X-Property-Slug header
 * src/services/api.ts's apiFetch() already attaches to every request - no
 * frontend change needed for this to work.
 */

// Now requires database.php (previously fully standalone) to resolve tenant/property context via
// the same getCurrentPropertyId() every other endpoint uses, and picks up its session-auth +
// CORS + CSRF Origin check as a result - this endpoint had none of those before. Worth adding
// deliberately, not just as a side effect: without an auth/ownership check, an unauthenticated
// caller could name a different tenant's X-Property-Slug and have their upload routed straight
// into that tenant's folder - a targeted image-spam vector the old flat-shared-folder layout
// didn't meaningfully enable (everything went into one undifferentiated pool either way).
// database.php doesn't start the session itself - every other entry point (router.php,
// ical_sync.php, authenticate.php) does its own session_name()+session_start() before requiring
// it, so this needs the same bootstrap or $_SESSION reads below always come back empty.
// session_set_cookie_params() (27 Aug 2026, "remember me" fix - see router.php's fuller
// comment) computed inline since APP_IS_LOCAL_ENV isn't defined until database.php loads.
$__session_host = $_SERVER['SERVER_NAME'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost';
$__session_is_local = $__session_host === 'localhost' || $__session_host === '127.0.0.1' || str_contains($__session_host, '192.168.') || $__session_host === 'dev.ground-code.com';
ini_set('session.gc_maxlifetime', 86400 * 30);
session_set_cookie_params([
    'lifetime' => 86400 * 30,
    'path' => '/',
    'domain' => '',
    'secure' => !$__session_is_local,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_name('artists_farm_session');
session_start();
// Unconditionally suppresses PHP's own implicit Set-Cookie (session_start()
// queues one on every request that touches $_SESSION, new session or a refresh
// of an existing one) - see router.php's full explanation next to its own copy
// of this fix (session-fixation race between concurrent logged-out requests and
// a real login, found 27 Aug 2026, where even "just reload" didn't self-correct
// once a bad cookie had already won). appSetSessionCookie() explicitly
// (re-)issues the cookie on an actual successful login, so this is safe.
header_remove('Set-Cookie');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../security/access_control.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['status' => 'error', 'message' => 'POST required']);
    exit;
}

if (empty($_SESSION['username'])) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Authentication required.']);
    exit;
}

$propertyId = getCurrentPropertyId($pdo);
if (!isPropertyAccessAllowed($pdo, $propertyId)) {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Access denied for this property.']);
    exit;
}

if (empty($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(['status' => 'error', 'message' => 'No image data provided']);
    exit;
}

$folder = in_array($_POST['folder'] ?? '', ['menu', 'catalog', 'misc', 'id_documents', 'qr_code']) ? $_POST['folder'] : 'misc';
$isIdDocument = $folder === 'id_documents';
// A UPI QR code (bank/PhonePe/GPay-issued screenshot or photo) must never be
// center-cropped like the menu/catalog thumbnails below - cropping a QR code
// destroys its corner finder patterns and makes it unscannable. Shares the
// same "downscale only, never crop" branch as ID documents.
$isQrCode = $folder === 'qr_code';
$targetWidth = ($folder === 'catalog') ? 300 : 400;
$targetHeight = ($folder === 'catalog') ? 100 : 300;

// Category subfolder name - distinct from the internal $folder param so the on-disk layout can
// use clearer names than the API's existing menu/catalog vocabulary without a breaking API change.
$categoryFolderNames = ['menu' => 'food_menu', 'catalog' => 'kitchen_stock', 'id_documents' => 'id_documents', 'misc' => 'misc', 'qr_code' => 'payment_qr'];
$categoryFolder = $categoryFolderNames[$folder];

// Resolve tenant/property slugs for the folder path. Sanitized (alphanumeric/hyphen/underscore
// only) even though slugs come from the DB via ID lookups rather than directly from client
// input - cheap defense-in-depth against a malformed slug ever being usable for path traversal.
$sanitizeSlug = function ($slug) {
    $clean = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$slug);
    return $clean !== '' ? $clean : 'unknown';
};
$property = getCurrentProperty($pdo, $propertyId);
$propertySlug = $sanitizeSlug($property['slug'] ?? '');
$tenantSlugStmt = $pdo->prepare("SELECT slug FROM tenants WHERE id = ? LIMIT 1");
$tenantSlugStmt->execute([$property['tenant_id'] ?? 0]);
$tenantSlug = $sanitizeSlug($tenantSlugStmt->fetchColumn());

$tmpPath = $_FILES['image']['tmp_name'];
$imageInfo = @getimagesize($tmpPath);
if ($imageInfo === false) {
    echo json_encode(['status' => 'error', 'message' => 'Invalid image data']);
    exit;
}

$mimeToExt = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp'];
$ext = $mimeToExt[$imageInfo['mime']] ?? 'jpg';

// Create uploads directory - now nested per tenant/property/category instead of one flat shared
// folder per category.
$uploadDir = __DIR__ . '/images/' . $tenantSlug . '/' . $propertySlug . '/' . $categoryFolder;
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

// Generate filename
$filename = bin2hex(random_bytes(12)) . '.' . $ext;
$filepath = $uploadDir . '/' . $filename;

// Create image straight from the uploaded temp file - no base64_decode() or
// json_decode() of a giant string in between, unlike the old data-URI flow.
$imageSource = @imagecreatefromstring(file_get_contents($tmpPath));
if (!$imageSource) {
    echo json_encode(['status' => 'error', 'message' => 'Failed to create image from data']);
    exit;
}

$origWidth = imagesx($imageSource);
$origHeight = imagesy($imageSource);

if ($isIdDocument || $isQrCode) {
    // ID photos must stay legible (text/photo on a card) - downscale only if
    // oversized, never crop, unlike the menu/catalog thumbnails below. QR
    // codes need the same treatment for scannability, just a smaller cap
    // since these are already small square images.
    $maxDim = $isQrCode ? 1000 : 1600;
    if ($origWidth > $maxDim || $origHeight > $maxDim) {
        if ($origWidth >= $origHeight) {
            $canvasWidth = $maxDim;
            $canvasHeight = intval($origHeight * ($maxDim / $origWidth));
        } else {
            $canvasHeight = $maxDim;
            $canvasWidth = intval($origWidth * ($maxDim / $origHeight));
        }
    } else {
        $canvasWidth = $origWidth;
        $canvasHeight = $origHeight;
    }
} else {
    $canvasWidth = $targetWidth;
    $canvasHeight = $targetHeight;
}

$canvas = imagecreatetruecolor($canvasWidth, $canvasHeight);
if ($canvas === false) {
    imagedestroy($imageSource);
    echo json_encode(['status' => 'error', 'message' => 'Failed to create canvas']);
    exit;
}

// Enable alpha blending for PNGs
imagealphablending($canvas, false);
imagesavealpha($canvas, true);

if ($isIdDocument || $isQrCode) {
    imagecopyresampled($canvas, $imageSource, 0, 0, 0, 0, $canvasWidth, $canvasHeight, $origWidth, $origHeight);
} else {
    // Calculate crop region (center crop to match target aspect ratio)
    $targetRatio = $targetWidth / $targetHeight;
    $sourceRatio = $origWidth / $origHeight;

    if ($sourceRatio > $targetRatio) {
        // Source is wider - crop width
        $cropHeight = $origHeight;
        $cropWidth = intval($origHeight * $targetRatio);
        $cropX = intval(($origWidth - $cropWidth) / 2);
        $cropY = 0;
    } else {
        // Source is taller - crop height
        $cropWidth = $origWidth;
        $cropHeight = intval($origWidth / $targetRatio);
        $cropX = 0;
        $cropY = intval(($origHeight - $cropHeight) / 2);
    }

    imagecopyresampled($canvas, $imageSource, 0, 0, $cropX, $cropY, $targetWidth, $targetHeight, $cropWidth, $cropHeight);
}

// Save as JPEG (best compatibility). ID photos and QR codes use higher quality
// since legibility/scannability matters more than filesize for these.
$jpegQuality = ($isIdDocument || $isQrCode) ? 92 : 85;
$saved = false;
if ($ext === 'png' && !$isIdDocument) {
    $saved = imagepng($canvas, $filepath, 6); // compression level 6
} else {
    // Rename before writing, not after - filepath must point at the real file
    // on disk when we save (a save-then-rename would leave filesize()/the
    // returned URL pointing at a path that was never actually written).
    $filepath = str_replace('.png', '.jpg', $filepath);
    $filename = str_replace('.png', '.jpg', $filename);
    $saved = imagejpeg($canvas, $filepath, $jpegQuality);
}

// ID documents also get a small thumbnail alongside the full-size copy -
// the check-in modal only needs a tiny preview per upload slot, not the
// full legibility-preserving 1600px image. Downscaled from the already-
// resized $canvas (not the original source), same downscale-only/no-crop
// policy as the main image. Best-effort: a failure here doesn't fail the
// upload, the UI just falls back to the full-size file for that photo.
if ($isIdDocument && $saved) {
    $thumbMaxDim = 300;
    if ($canvasWidth > $thumbMaxDim || $canvasHeight > $thumbMaxDim) {
        if ($canvasWidth >= $canvasHeight) {
            $thumbWidth = $thumbMaxDim;
            $thumbHeight = max(1, intval($canvasHeight * ($thumbMaxDim / $canvasWidth)));
        } else {
            $thumbHeight = $thumbMaxDim;
            $thumbWidth = max(1, intval($canvasWidth * ($thumbMaxDim / $canvasHeight)));
        }
    } else {
        $thumbWidth = $canvasWidth;
        $thumbHeight = $canvasHeight;
    }
    $thumbCanvas = imagecreatetruecolor($thumbWidth, $thumbHeight);
    if ($thumbCanvas !== false) {
        imagecopyresampled($thumbCanvas, $canvas, 0, 0, 0, 0, $thumbWidth, $thumbHeight, $canvasWidth, $canvasHeight);
        $thumbDir = $uploadDir . '/thumbs';
        if (!is_dir($thumbDir)) {
            mkdir($thumbDir, 0755, true);
        }
        imagejpeg($thumbCanvas, $thumbDir . '/' . $filename, 80);
        imagedestroy($thumbCanvas);
    }
}

imagedestroy($imageSource);
imagedestroy($canvas);

if (!$saved) {
    echo json_encode(['status' => 'error', 'message' => 'Failed to save image to disk']);
    exit;
}

// Build URL from SCRIPT_NAME (the URL path Apache actually used to reach this
// file) rather than diffing against DOCUMENT_ROOT - on Windows, DOCUMENT_ROOT
// uses forward slashes while __DIR__-derived paths use backslashes, so the
// string diff never matched and silently returned an absolute filesystem path.
$scriptDir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/php/uploads/upload_image.php'));
$url = $scriptDir . '/images/' . $tenantSlug . '/' . $propertySlug . '/' . $categoryFolder . '/' . $filename;

// File size
$fileSize = filesize($filepath);

echo json_encode([
    'status' => 'success',
    'url' => $url,
    'filename' => $filename,
    'width' => $canvasWidth,
    'height' => $canvasHeight,
    'size' => $fileSize
]);
?>
