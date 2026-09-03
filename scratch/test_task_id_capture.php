<?php
/**
 * End-to-end: enqueue an outbox row, drain it against the LIVE Channex sandbox,
 * and confirm the returned async task_id is stored - which is what the
 * certification form and the reviewers' log lookup need.
 * Cleans up the rows it creates.
 */
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/config/schema_cache.php';
require_once 'php/channex/outbox.php';

ensureChannexOutboxSchema($pdo);

echo "=== schema: does channex_outbox have task_id? ===\n";
$cols = $pdo->query("SHOW COLUMNS FROM channex_outbox")->fetchAll(PDO::FETCH_COLUMN);
$has = in_array('task_id', $cols, true);
echo '  task_id column: ' . ($has ? "PRESENT\n" : "MISSING\n");
if (!$has) exit("Cannot continue.\n");

// Is this property even mapped to Channex? Without a mapping the adapter
// short-circuits and no task id can exist.
$mapped = 0;
try {
    $mapped = (int)$pdo->query("SELECT COUNT(*) FROM channex_mappings")->fetchColumn();
} catch (PDOException $e) {}
echo "  channex_mappings rows: $mapped\n";

echo "\n=== enqueue a rates change ===\n";
$propId = 1;
$from = date('Y-m-d', strtotime('+30 days'));
$to   = date('Y-m-d', strtotime('+32 days'));
enqueueOutboxItem($pdo, $propId, null, 'rates', $from, $to, ['action' => 'task_id_capture_test']);
$id = (int)$pdo->lastInsertId();
echo "  enqueued row id=$id ($from -> $to)\n";

echo "\n=== drain ===\n";
require_once 'php/channex/ari_drain_worker.php';
try {
    $worker = new AriDrainWorker($pdo);
    $result = $worker->processBatch();
    echo '  drain result: ' . json_encode($result) . "\n";
} catch (Throwable $e) {
    echo '  drain threw: ' . $e->getMessage() . "\n";
}

echo "\n=== row state after drain ===\n";
$row = $pdo->query("SELECT id, status, attempts, task_id, last_error FROM channex_outbox WHERE id = $id")->fetch(PDO::FETCH_ASSOC);
if (!$row) { echo "  row vanished\n"; }
else {
    foreach ($row as $k => $v) echo "  $k = " . var_export($v, true) . "\n";
    if (!empty($row['task_id'])) {
        echo "\n  => TASK ID CAPTURED: {$row['task_id']}\n";
        // Confirm it is a real task Channex knows about.
        $cfg = json_decode(file_get_contents('php/config/channex_config.json'), true);
        $ch = curl_init(rtrim($cfg['base_url'], '/') . '/tasks/' . $row['task_id']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['user-api-key: ' . $cfg['api_key'], 'Accept: application/json']);
        curl_setopt($ch, CURLOPT_TIMEOUT, 25);
        $r = curl_exec($ch); $c = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
        echo "  GET /tasks/{$row['task_id']} -> HTTP $c\n  " . substr((string)$r, 0, 300) . "\n";
    } else {
        echo "\n  => no task_id (see status/last_error above)\n";
    }
}

$pdo->exec("DELETE FROM channex_outbox WHERE payload LIKE '%task_id_capture_test%'");
echo "\ncleanup: remaining test rows = " .
    (int)$pdo->query("SELECT COUNT(*) FROM channex_outbox WHERE payload LIKE '%task_id_capture_test%'")->fetchColumn() . "\n";

