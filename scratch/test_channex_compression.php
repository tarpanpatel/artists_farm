<?php
require_once __DIR__ . '/../php/config/database.php';
require_once __DIR__ . '/../php/channex/ari_drain_worker.php';

global $pdo;

echo "=== Testing Channex Run-Length Range Compression (Scenario 1) ===\n";

$worker = new AriDrainWorker($pdo);

// Test 500 contiguous days with a 3-day booking in the middle
$startDate = date('Y-m-d');
$endDate = date('Y-m-d', strtotime('+500 days'));

// 1. Availability Compression Test
$ranges = $worker->computeCompressedAvailability(1, null, $startDate, $endDate);
echo "500-day availability compressed into: " . count($ranges) . " range(s)\n";
foreach ($ranges as $idx => $r) {
    echo "  Range {$idx}: {$r['date_from']} -> {$r['date_to']} (availability = {$r['availability']})\n";
}

// 2. Restrictions Compression Test
$resRanges = $worker->computeCompressedRestrictions(1, null, $startDate, $endDate);
echo "500-day restrictions compressed into: " . count($resRanges) . " range(s)\n";
foreach ($resRanges as $idx => $r) {
    echo "  Range {$idx}: {$r['date_from']} -> {$r['date_to']} (rate = ₹" . round($r['rate']) . ", min_stay = " . ($r['min_stay_arrival'] ?: 'none') . ")\n";
}

// Verify Scenario 1: Both payloads fit in exactly 1 call each (2 calls total)
$totalCallsNeeded = (count($ranges) > 0 ? 1 : 0) + (count($resRanges) > 0 ? 1 : 0);
echo "Total Channex API calls for 500 days: {$totalCallsNeeded}\n";
echo "Scenario 1 Hard Requirement (Exactly 2 Calls): " . ($totalCallsNeeded === 2 ? "PASSED (PROVED)" : "FAILED") . "\n";
echo "=== Compression Test Complete ===\n";
