<?php
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/config/schema_cache.php';
require_once 'php/channex/outbox.php';
require_once 'php/channex/ari_drain_worker.php';

$m = $pdo->query("SELECT property_id, room_id, channex_property_id FROM channex_mappings")->fetchAll(PDO::FETCH_ASSOC);
echo "mappings:\n"; foreach ($m as $r) echo '  ' . json_encode($r) . "\n";
$propId = (int)($m[0]['property_id'] ?? 1);
$roomId = $m[0]['room_id'] !== null ? (int)$m[0]['room_id'] : null;
echo "using property_id=$propId room_id=" . var_export($roomId, true) . "\n\n";

$from = date('Y-m-d', strtotime('+30 days'));
$to   = date('Y-m-d', strtotime('+32 days'));

$pdo->prepare("INSERT INTO room_rate_rules (property_id, room_id, start_date, end_date, rate_per_night, rule_name, min_stay_arrival, stop_sell)
               VALUES (?, ?, ?, ?, 150.00, 'TASKID TEST', 2, 0)")->execute([$propId, $roomId, $from, $to]);
$ruleId = $pdo->lastInsertId();
echo "created rate rule id=$ruleId ($from -> $to, rate 150, min stay 2)\n\n";

enqueueOutboxItem($pdo, $propId, $roomId, 'rates', $from, $to, ['action' => 'taskid_real_test']);
$id = (int)$pdo->lastInsertId();
echo "enqueued outbox id=$id\n\n";

$w = new AriDrainWorker($pdo);
echo 'drain: ' . json_encode($w->processBatch()) . "\n\n";

$row = $pdo->query("SELECT id,status,attempts,task_id,last_error FROM channex_outbox WHERE id=$id")->fetch(PDO::FETCH_ASSOC);
foreach ($row as $k=>$v) echo "  $k = " . var_export($v,true) . "\n";

if (!empty($row['task_id'])) {
    echo "\n=== TASK ID CAPTURED: {$row['task_id']} ===\n";
    $cfg = json_decode(file_get_contents('php/config/channex_config.json'), true);
    $ch = curl_init(rtrim($cfg['base_url'],'/') . '/tasks/' . $row['task_id']);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['user-api-key: '.$cfg['api_key'],'Accept: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 25);
    $r = curl_exec($ch); $c = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    echo "GET /tasks/{id} -> HTTP $c\n" . substr((string)$r, 0, 400) . "\n";
}

$pdo->prepare("DELETE FROM room_rate_rules WHERE id = ?")->execute([$ruleId]);
$pdo->exec("DELETE FROM channex_outbox WHERE payload LIKE '%taskid_real_test%'");
echo "\ncleanup done\n";