<?php
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/config/schema_cache.php';
require_once 'php/channex/outbox.php';
require_once 'php/channex/ari_drain_worker.php';

$cols = $pdo->query("SHOW COLUMNS FROM channex_mappings")->fetchAll(PDO::FETCH_COLUMN);
echo "mapping cols: " . implode(', ', $cols) . "\n\n";

$REAL_PROP = '4286428a-5561-4508-bd28-1f9ae55d8795';
$REAL_RT   = '4ca732c0-6f4f-457c-9c48-396f3d784590';
$REAL_RP   = '2d0dfacb-0239-4ec9-9eba-f6962ff3ecd8';

$pdo->exec("DELETE FROM channex_mappings");
$sets = ['property_id' => 1, 'room_id' => null, 'channex_property_id' => $REAL_PROP];
if (in_array('channex_room_type_id', $cols, true)) $sets['channex_room_type_id'] = $REAL_RT;
if (in_array('channex_rate_plan_id', $cols, true)) $sets['channex_rate_plan_id'] = $REAL_RP;
$k = implode(',', array_keys($sets));
$q = implode(',', array_fill(0, count($sets), '?'));
$pdo->prepare("INSERT INTO channex_mappings ($k) VALUES ($q)")->execute(array_values($sets));
echo "mapped local property 1 -> real sandbox UUIDs\n\n";

$from = date('Y-m-d', strtotime('+30 days'));
$to   = date('Y-m-d', strtotime('+32 days'));
$pdo->prepare("INSERT INTO room_rate_rules (property_id, room_id, start_date, end_date, rate_per_night, rule_name, min_stay_arrival)
               VALUES (1, NULL, ?, ?, 150.00, 'TASKID REAL', 2)")->execute([$from, $to]);
$ruleId = $pdo->lastInsertId();

enqueueOutboxItem($pdo, 1, null, 'rates', $from, $to, ['action' => 'taskid_v2']);
$id = (int)$pdo->lastInsertId();
echo "enqueued outbox id=$id\n";

$w = new AriDrainWorker($pdo);
echo 'drain: ' . json_encode($w->processBatch()) . "\n\n";

$row = $pdo->query("SELECT id,status,attempts,task_id,last_error FROM channex_outbox WHERE id=$id")->fetch(PDO::FETCH_ASSOC);
foreach ($row as $kk=>$vv) echo "  $kk = " . var_export($vv,true) . "\n";

if (!empty($row['task_id'])) {
    $cfg = json_decode(file_get_contents('php/config/channex_config.json'), true);
    $ch = curl_init(rtrim($cfg['base_url'],'/') . '/tasks/' . $row['task_id']);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['user-api-key: '.$cfg['api_key'],'Accept: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 25);
    $r = curl_exec($ch); $c = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    echo "\n*** TASK ID: {$row['task_id']} ***\nGET /tasks -> HTTP $c\n" . substr((string)$r, 0, 500) . "\n";
}

$pdo->prepare("DELETE FROM room_rate_rules WHERE id = ?")->execute([$ruleId]);
$pdo->exec("DELETE FROM channex_outbox WHERE payload LIKE '%taskid_v2%'");
echo "\ncleanup done (mapping left pointing at the real sandbox property)\n";