<?php
/**
 * Generic Document Upload Endpoint
 * Receives a multipart/form-data file upload (image OR PDF - license
 * certificates, ID scans, etc.) and stores the ORIGINAL file as-is (no
 * resize/recompress, unlike upload_image.php's thumbnailing pipeline -
 * a legal document must stay legible/byte-identical to what was scanned).
 *
 * POST fields: document=<file>, folder=licenses|c_form (kept as a param,
 * not hardcoded, so each document-backed feature gets its own folder
 * without a new endpoint - c_form added 21 Aug 2026 for the uploaded Form
 * 'C' confirmation attached when a guest's C-Form filing is saved)
 * Response: { "status": "success", "url": "/php/uploads/documents/{tenant}/{property}/{category}/abc123.pdf", "filename", "size", "mime" }
 *
 * Mirrors upload_image.php's auth/CORS/CSRF bootstrap (database.php +
 * access_control.php) and tenant/property-scoped folder layout exactly -
 * see that file's comments for why each piece is there.
 */

// session_set_cookie_params() (27 Aug 2026, "remember me" fix - see router.php's fuller
// comment) computed inline since this runs before config/database.php is required below,
// so APP_IS_LOCAL_ENV isn't defined yet.
$__session_host = $_SERVER['SERVER_NAME'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost';
$__session_is_local = $__session_host === 'localhost' || $__session_host === '127.0.0.1' || str_contains($__session_host, '192.168.');
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

if (empty($_FILES['document']) || $_FILES['document']['error'] !== UPLOAD_ERR_OK) {
    $sizeExceeded = ($_FILES['document']['error'] ?? null) === UPLOAD_ERR_INI_SIZE || ($_FILES['document']['error'] ?? null) === UPLOAD_ERR_FORM_SIZE;
    echo json_encode(['status' => 'error', 'message' => $sizeExceeded ? 'File is too large.' : 'No document data provided']);
    exit;
}

// App-level cap, independent of (and well under) php.ini's upload_max_filesize -
// a scanned license/certificate has no reason to be this big; catches an
// accidental wrong-file selection before it eats disk space.
$MAX_BYTES = 10 * 1024 * 1024; // 10MB
if ($_FILES['document']['size'] > $MAX_BYTES) {
    echo json_encode(['status' => 'error', 'message' => 'File is too large (max 10MB).']);
    exit;
}

$folder = in_array($_POST['folder'] ?? '', ['licenses', 'c_form']) ? $_POST['folder'] : 'licenses';

$sanitizeSlug = function ($slug) {
    $clean = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$slug);
    return $clean !== '' ? $clean : 'unknown';
};
$property = getCurrentProperty($pdo, $propertyId);
$propertySlug = $sanitizeSlug($property['slug'] ?? '');
$tenantSlugStmt = $pdo->prepare("SELECT slug FROM tenants WHERE id = ? LIMIT 1");
$tenantSlugStmt->execute([$property['tenant_id'] ?? 0]);
$tenantSlug = $sanitizeSlug($tenantSlugStmt->fetchColumn());

$tmpPath = $_FILES['document']['tmp_name'];

// Verify actual file content, not the client-supplied MIME/extension (both are
// trivially spoofable) - finfo reads the real file signature.
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$detectedMime = finfo_file($finfo, $tmpPath);
finfo_close($finfo);

$mimeToExt = [
    'application/pdf' => 'pdf',
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
];
if (!isset($mimeToExt[$detectedMime])) {
    echo json_encode(['status' => 'error', 'message' => 'Unsupported file type. Please upload a PDF, JPG, PNG, or WEBP.']);
    exit;
}
$ext = $mimeToExt[$detectedMime];

$uploadDir = __DIR__ . '/documents/' . $tenantSlug . '/' . $propertySlug . '/' . $folder;
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

$filename = bin2hex(random_bytes(12)) . '.' . $ext;
$filepath = $uploadDir . '/' . $filename;

if (!move_uploaded_file($tmpPath, $filepath)) {
    echo json_encode(['status' => 'error', 'message' => 'Failed to save file to disk']);
    exit;
}

// Build URL from SCRIPT_NAME (the URL path Apache actually used to reach this
// file), not DOCUMENT_ROOT - see upload_image.php for why (Windows path-
// separator mismatch made a DOCUMENT_ROOT diff silently wrong there).
$scriptDir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/php/uploads/upload_document.php'));
$url = $scriptDir . '/documents/' . $tenantSlug . '/' . $propertySlug . '/' . $folder . '/' . $filename;

echo json_encode([
    'status' => 'success',
    'url' => $url,
    'filename' => $filename,
    'mime' => $detectedMime,
    'size' => filesize($filepath),
]);
