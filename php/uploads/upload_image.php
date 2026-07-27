<?php
/**
 * Image Upload Endpoint
 * Receives base64 image data, resizes/crops it, saves to disk, returns URL.
 * POST body: { "image": "data:image/png;base64,...", "folder": "menu" | "catalog" }
 * Response: { "status": "success", "url": "/artist_farm/uploads/images/menu/abc123.jpg" }
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['status' => 'error', 'message' => 'POST required']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (empty($input['image'])) {
    echo json_encode(['status' => 'error', 'message' => 'No image data provided']);
    exit;
}

$folder = in_array($input['folder'] ?? '', ['menu', 'catalog', 'misc']) ? $input['folder'] : 'misc';
$targetWidth = ($input['folder'] === 'catalog') ? 300 : 400;
$targetHeight = ($input['folder'] === 'catalog') ? 100 : 300;

// Parse data URI
$dataUri = $input['image'];
if (!preg_match('/^data:image\/(\w+);base64,/', $dataUri, $matches)) {
    echo json_encode(['status' => 'error', 'message' => 'Invalid data URI format']);
    exit;
}

$ext = strtolower($matches[1]);
if ($ext === 'jpeg') $ext = 'jpg';
if (!in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'])) {
    $ext = 'jpg';
}

$base64Data = substr($dataUri, strpos($dataUri, ',') + 1);
$binaryData = base64_decode($base64Data);
if ($binaryData === false) {
    echo json_encode(['status' => 'error', 'message' => 'Failed to decode base64 data']);
    exit;
}

// Create uploads directory
$uploadDir = __DIR__ . '/images/' . $folder;
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

// Generate filename
$filename = bin2hex(random_bytes(12)) . '.' . $ext;
$filepath = $uploadDir . '/' . $filename;

// Create image from binary
$imageSource = @imagecreatefromstring($binaryData);
if (!$imageSource) {
    echo json_encode(['status' => 'error', 'message' => 'Failed to create image from data']);
    exit;
}

$origWidth = imagesx($imageSource);
$origHeight = imagesy($imageSource);

// Center-crop then resize
$canvas = imagecreatetruecolor($targetWidth, $targetHeight);
if ($canvas === false) {
    imagedestroy($imageSource);
    echo json_encode(['status' => 'error', 'message' => 'Failed to create canvas']);
    exit;
}

// Enable alpha blending for PNGs
imagealphablending($canvas, false);
imagesavealpha($canvas, true);

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

// Save as JPEG (best compatibility) with quality 85
$saved = false;
if ($ext === 'png') {
    $saved = imagepng($canvas, $filepath, 6); // compression level 6
} else {
    $saved = imagejpeg($canvas, $filepath, 85);
    $filepath = str_replace('.png', '.jpg', $filepath);
    $filename = str_replace('.png', '.jpg', $filename);
}

imagedestroy($imageSource);
imagedestroy($canvas);

if (!$saved) {
    echo json_encode(['status' => 'error', 'message' => 'Failed to save image to disk']);
    exit;
}

// Build URL - relative to site root
$siteRoot = dirname(dirname(__DIR__));
$docRoot = $_SERVER['DOCUMENT_ROOT'] ?? '';
$relativePath = str_replace($docRoot, '', $filepath);
$url = '/' . ltrim(str_replace('\\', '/', str_replace($docRoot, '', $filepath)), '/');

// File size
$fileSize = filesize($filepath);

echo json_encode([
    'status' => 'success',
    'url' => $url,
    'filename' => $filename,
    'width' => $targetWidth,
    'height' => $targetHeight,
    'size' => $fileSize
]);
?>
