<?php
/**
 * The scenario 1 guarantee, tested the way it actually fails: with a DIRTY
 * outbox. The drain used to claim every pending row, so unrelated queued work -
 * a rate-rule save, an inbound booking - would ride along on the operator's
 * 500-day push and take it past the required 2 API calls.
 *
 * test_scenario1_ui_push.php deliberately clears the queue first, so it passes
 * either way and proves nothing about this.
 */
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/channex/outbox.php';
require_once 'php/channex/ari_drain_worker.php';

$PROP = '4286428a-5561-4508-bd28-1f9ae55d8795';
$RT   = '4ca732c0-6f4f-457c-9c48-396f3d784590';
$RP   = '2d0dfacb-0239-4ec9-9eba-f6962ff3ecd8';
$propertyId = 1;

$pdo->exec("DELETE FROM channex_outbox WHERE status IN ('pending','sending','failed')");
$pdo->prepare("
    INSERT INTO channex_mappings (property_id, room_id, channex_property_id, channex_room_type_id, channex_rate_plan_id, sync_status)
    VALUES (?, NULL, ?, ?, ?, 'active')
    ON DUPLICATE KEY UPDATE channex_property_id = VALUES(channex_property_id)
")->execute([$propertyId, $PROP, $RT, $RP]);

// Dirty the queue the way normal use would: several unrelated pending rows.
$noise = [];
for ($i = 1; $i <= 5; $i++) {
    enqueueOutboxItem($pdo, $propertyId, null, $i % 2 ? 'rates' : 'availability',
        date('Y-m-d', strtotime("+{$i} month")), date('Y-m-d', strtotime('+' . ($i + 1) . ' month')),
        ['action' => 'unrelated_noise']);
    $noise[] = (int)$pdo->lastInsertId();
}
echo "seeded " . count($noise) . " unrelated pending rows: " . implode(', ', $noise) . "\n";

$dateFrom = date('Y-m-d');
$dateTo   = date('Y-m-d', strtotime('+500 days'));
enqueueOutboxItem($pdo, $propertyId, null, 'availability', $dateFrom, $dateTo, ['action' => 'manual_push_ari']);
$availId = (int)$pdo->lastInsertId();
enqueueOutboxItem($pdo, $propertyId, null, 'rates', $dateFrom, $dateTo, ['action' => 'manual_push_ari']);
$ratesId = (int)$pdo->lastInsertId();
echo "push rows: availability={$availId} rates={$ratesId}\n\n";

// Exactly what router.php's channex_push_ari now does.
$worker = new AriDrainWorker($pdo);
$res = $worker->processBatch(10, [$availId, $ratesId]);
echo "drain result: " . json_encode($res) . "\n\n";

$pushRows = $pdo->query("SELECT id, kind, status, task_id FROM channex_outbox WHERE id IN ({$availId},{$ratesId}) ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
foreach ($pushRows as $r) echo "  push row: " . json_encode($r) . "\n";

$noiseIn = implode(',', $noise);
$noiseRows = $pdo->query("SELECT id, status, task_id FROM channex_outbox WHERE id IN ($noiseIn) ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
$noiseUntouched = count(array_filter($noiseRows, fn($r) => $r['status'] === 'pending' && $r['task_id'] === null));
echo "\n  unrelated rows still pending & unsent: {$noiseUntouched} / " . count($noiseRows) . "\n";

$taskIds = array_unique(array_filter(array_column($pushRows, 'task_id')));
$twoCalls = (int)($res['groups'] ?? 0) === 2;
$bothDone = count(array_filter($pushRows, fn($r) => $r['status'] === 'done')) === 2;
$twoTasks = count($taskIds) === 2;
$noiseSafe = $noiseUntouched === count($noiseRows);

echo "\nexactly 2 API calls despite dirty queue: " . ($twoCalls ? "PASSED (2)" : "FAILED (got " . ($res['groups'] ?? '?') . ")") . "\n";
echo "both push rows done:                    " . ($bothDone ? "PASSED" : "FAILED") . "\n";
echo "two distinct task ids:                  " . ($twoTasks ? "PASSED" : "FAILED") . "\n";
echo "unrelated rows neither sent nor lost:   " . ($noiseSafe ? "PASSED" : "FAILED") . "\n";
echo "\n=== " . ($twoCalls && $bothDone && $twoTasks && $noiseSafe ? "PASSED" : "FAILED") . " ===\n";

$pdo->exec("DELETE FROM channex_outbox WHERE id IN ($noiseIn)");
