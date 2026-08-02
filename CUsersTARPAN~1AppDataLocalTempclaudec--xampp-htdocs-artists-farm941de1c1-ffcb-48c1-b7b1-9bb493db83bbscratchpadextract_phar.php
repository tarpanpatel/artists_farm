<?php
// PharData extraction script
ini_set('phar.readonly', 0);

try {
    $archive_path = '/public_html/deploy.tar.gz';
    $extract_path = '/public_html/';
    
    echo "Extracting archive...\n";
    
    // Create PharData object and extract
    $phar = new PharData($archive_path);
    $phar->extractTo($extract_path);
    
    echo "✅ Extraction successful!\n";
    
    // Remove archive
    if (file_exists($archive_path)) {
        unlink($archive_path);
        echo "Cleaned up archive\n";
    }
    
    // List extracted files
    echo "\nExtracted items:\n";
    $items = scandir($extract_path);
    foreach (array_slice($items, 0, 20) as $item) {
        if ($item != '.' && $item != '..') {
            echo "  - $item\n";
        }
    }
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
