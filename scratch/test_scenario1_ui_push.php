<?php
/**
 * Certification scenario 1, through the code path the UI's "Push Availability &
 * Rates" button actually runs: 500 days must leave in EXACTLY 2 Channex calls
 * (one availability, one rates). A per-date or per-rate-plan push looks fine on
 * screen and fails certification outright, so count the calls - do not trust the
 * button turning green.
 */
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/channex/outbox.php';
require_once 'php/channex/ari_drain_worker.php';

$PROP = '4286428a-5561-4508-bd28-1f9ae55d8795';
$RT   = '4ca732c0-6f4f-457c-9c48-396f3d784590';
$RP   = '2d0dfacb-0239-4ec9-9eba-f6962ff3ecd8';
$propertyId = 1;

// The drain claims every pending row, not only the two we are about to add, so a
// leftover row from an earlier test would inflate the call count and make a
// correct implementation look broken.
$cleared = $pdo->exec("DELETE FROM channex_outbox WHERE status IN ('pending','sending','failed')");
echo "cleared {$cleared} stale outbox row(s)\n";

$pdo->prepare("
    INSERT INTO channex_mappings (property_id, room_id, channex_property_id, channex_room_type_id, channex_rate_plan_id, sync_status)
    VALUES (?, NULL, ?, ?, ?, 'active')
    ON DUPLICATE KEY UPDATE channex_property_id = VALUES(channex_property_id)
")->execute([$propertyId, $PROP, $RT, $RP]);

$dateFrom = date('Y-m-d');
$dateTo   = date('Y-m-d', strtotime('+500 days'));
echo "pushing {$dateFrom} -> {$dateTo} (501 days)\n\n";

// Exactly what router.php's channex_push_ari does.
enqueueOutboxItem($pdo, $propertyId, null, 'availability', $dateFrom, $dateTo, ['action' => 'manual_push_ari']);
$availId = (int)$pdo->lastInsertId();
enqueueOutboxItem($pdo, $propertyId, null, 'rates', $dateFrom, $dateTo, ['action' => 'manual_push_ari']);
$ratesId = (int)$pdo->lastInsertId();
echo "enqueued rows: availability={$availId} rates={$ratesId}\n";

$worker = new AriDrainWorker($pdo);
$res = $worker->processBatch();
echo "drain: " . json_encode($res) . "\n\n";

$rows = $pdo->query("SELECT id, kind, status, task_id, last_error FROM channex_outbox WHERE id IN ({$availId}, {$ratesId}) ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
foreach ($rows as $r) echo "  " . json_encode($r) . "\n";

$taskIds = array_filter(array_column($rows, 'task_id'));
$allDone = count($rows) === 2 && count(array_filter($rows, fn($r) => $r['status'] === 'done')) === 2;
$twoCalls = (int)($res['groups'] ?? 0) === 2;
$twoTasks = count(array_unique($taskIds)) === 2;

echo "\n";
echo "exactly 2 API calls (groups):      " . ($twoCalls ? "PASSED (2)" : "FAILED (got " . ($res['groups'] ?? '?') . ")") . "\n";
echo "both rows done:                    " . ($allDone ? "PASSED" : "FAILED") . "\n";
echo "two distinct task ids captured:    " . ($twoTasks ? "PASSED (" . implode(', ', $taskIds) . ")" : "FAILED (" . implode(', ', $taskIds) . ")") . "\n";
echo "\n=== Scenario 1: " . ($twoCalls && $allDone && $twoTasks ? "PASSED" : "FAILED") . " ===\n";
