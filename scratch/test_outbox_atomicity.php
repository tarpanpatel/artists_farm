<?php
require_once __DIR__ . '/../php/config/database.php';
require_once __DIR__ . '/../php/channex/outbox.php';

global $pdo;

echo "=== Testing Outbox Schema and Atomicity ===\n";

ensureChannexOutboxSchema($pdo);
$tableCheck = $pdo->query("SHOW TABLES LIKE 'channex_outbox'")->fetchColumn();
echo "Table exists: " . ($tableCheck === 'channex_outbox' ? "YES (PROVED)" : "NO") . "\n";

// Test 1: Direct enqueue
$enq = enqueueOutboxItem($pdo, 1, null, 'availability', '2026-09-01', '2026-09-05', ['test' => 1]);
echo "Direct enqueue success: " . ($enq ? "YES (PROVED)" : "NO") . "\n";

// Verify row in DB
$row = $pdo->query("SELECT * FROM channex_outbox WHERE property_id = 1 AND kind = 'availability' AND date_from = '2026-09-01' ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
echo "Direct row status: " . ($row['status'] ?? 'NONE') . ", kind: " . ($row['kind'] ?? 'NONE') . "\n";

// Test 2: Rollback Atomicity
$pdo->beginTransaction();
enqueueOutboxItem($pdo, 1, null, 'availability', '2026-10-01', '2026-10-05', ['rollback_test' => 1]);
$pdo->rollBack();

$rollbackRow = $pdo->query("SELECT id FROM channex_outbox WHERE date_from = '2026-10-01'")->fetchColumn();
echo "Rollback test (row must NOT exist): " . ($rollbackRow ? "FAILED (found $rollbackRow)" : "PASSED (PROVED 0 rows)") . "\n";

// Test 3: Commit Atomicity
$pdo->beginTransaction();
enqueueOutboxItem($pdo, 1, null, 'rates', '2026-11-01', '2026-11-05', ['commit_test' => 1]);
$pdo->commit();

$commitRow = $pdo->query("SELECT id FROM channex_outbox WHERE date_from = '2026-11-01'")->fetchColumn();
echo "Commit test (row must exist): " . ($commitRow ? "PASSED (PROVED id=$commitRow)" : "FAILED") . "\n";

// Clean up test rows
$pdo->exec("DELETE FROM channex_outbox WHERE date_from IN ('2026-09-01', '2026-10-01', '2026-11-01')");
echo "=== Outbox Atomicity Tests Complete ===\n";
