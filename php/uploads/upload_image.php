<?php
/**
 * Image Upload Endpoint
 * Receives a multipart/form-data image upload, resizes/crops it, saves to disk, returns URL.
 * POST fields: image=<file>, folder=menu|catalog|misc|id_documents
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

if (empty($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(['status' => 'error', 'message' => 'No image data provided']);
    exit;
}

$folder = in_array($_POST['folder'] ?? '', ['menu', 'catalog', 'misc', 'id_documents']) ? $_POST['folder'] : 'misc';
$isIdDocument = $folder === 'id_documents';
$targetWidth = ($folder === 'catalog') ? 300 : 400;
$targetHeight = ($folder === 'catalog') ? 100 : 300;

$tmpPath = $_FILES['image']['tmp_name'];
$imageInfo = @getimagesize($tmpPath);
if ($imageInfo === false) {
    echo json_encode(['status' => 'error', 'message' => 'Invalid image data']);
    exit;
}

$mimeToExt = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp'];
$ext = $mimeToExt[$imageInfo['mime']] ?? 'jpg';

// Create uploads directory
$uploadDir = __DIR__ . '/images/' . $folder;
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

if ($isIdDocument) {
    // ID photos must stay legible (text/photo on a card) - downscale only if
    // oversized, never crop, unlike the menu/catalog thumbnails below.
    $maxDim = 1600;
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

if ($isIdDocument) {
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

// Save as JPEG (best compatibility). ID photos use higher quality since legibility matters.
$jpegQuality = $isIdDocument ? 92 : 85;
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
$url = $scriptDir . '/images/' . $folder . '/' . $filename;

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
