<?php
$_GET['property_slug'] = 'artists-farm';
$_GET['month'] = date('m');
$_GET['year'] = date('Y');
ob_start();
include 'availability.php';
$output = ob_get_clean();

echo "=== Public Availability Render Test ===" . PHP_EOL;
echo "Output Size: " . strlen($output) . " bytes" . PHP_EOL;
echo "Has HTML Title: " . (strpos($output, '<title>Availability & Rates') !== false ? "PASS" : "FAIL") . PHP_EOL;
echo "Has Room / Property Heading: " . (strpos($output, 'Availability & Rates') !== false ? "PASS" : "FAIL") . PHP_EOL;
echo "Has Legend: " . (strpos($output, 'Available') !== false && strpos($output, 'Booked') !== false ? "PASS" : "FAIL") . PHP_EOL;
echo "Has Tariff / Rate Info: " . (strpos($output, 'Base:') !== false || strpos($output, 'Nightly Rate') !== false || strpos($output, '₹') !== false ? "PASS" : "FAIL") . PHP_EOL;
echo "Zero PII Verification (Guest name/phone/notes): " . (strpos($output, 'guest_name') === false && strpos($output, 'phone_number') === false ? "PASS (NO PII)" : "FAIL") . PHP_EOL;
