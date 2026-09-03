<?php
/**
 * Test PMS UI Rate Rules Save Trigger
 * Simulates saving a rate rule via POST action=save_rate_rule (as sent by RateRuleModal.tsx)
 * Verifies outbox row creation, event-driven drain execution, and status = done with task_id.
 */
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/channex/ChannexClient.php';

$testDate = '2026-12-05';
$ruleName = 'UI Test Rate Rule ' . time();

// Prepare POST payload matching RateRuleModal.tsx
$_POST = [
    'action' => 'save_rate_rule',
    'property_id' => 1,
    'rule_name' => $ruleName,
    'start_date' => $testDate,
    'end_date' => $testDate,
    'rate_per_night' => 2200.00,
    'min_stay_arrival' => 2,
    'closed_to_arrival' => 0,
    'stop_sell' => 0,
];

echo "=== Simulating UI Rate Rule Save ===\n";
ob_start();
require 'php/rates/rate_rules.php';
saveRateRule($pdo, 1);
$output = ob_get_clean();
echo "Save Response: {$output}\n";

// Check database for created rate rule
$stmt = $pdo->prepare("SELECT id, rule_name FROM room_rate_rules WHERE rule_name = ? ORDER BY id DESC LIMIT 1");
$stmt->execute([$ruleName]);
$rule = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$rule) {
    echo "FAILED: Rate rule not saved in database\n";
    exit(1);
}
$ruleId = (int)$rule['id'];
echo "Rate rule created: ID {$ruleId}\n";

// Check outbox row created for this date and verify drain processed it
$outStmt = $pdo->prepare("
    SELECT id, kind, status, attempts, task_id, last_error, payload
    FROM channex_outbox
    WHERE property_id = 1 AND kind = 'rates' AND date_from = ? AND date_to = ?
    ORDER BY id DESC LIMIT 1
");
$outStmt->execute([$testDate, $testDate]);
$outboxRow = $outStmt->fetch(PDO::FETCH_ASSOC);

echo "Outbox Row State:\n" . json_encode($outboxRow, JSON_PRETTY_PRINT) . "\n";

$isDone = ($outboxRow['status'] ?? '') === 'done';
$taskId = $outboxRow['task_id'] ?? null;

echo "\nAssertions:\n";
echo " - Outbox row status = done: " . ($isDone ? "PASS" : "FAIL ({$outboxRow['status']})") . "\n";
echo " - Outbox has valid task_id: " . ($taskId ? "PASS ({$taskId})" : "FAIL") . "\n";

if ($taskId) {
    $client = new ChannexClient();
    $taskCheck = $client->get("tasks/{$taskId}");
    $taskData = $taskCheck['data']['attributes'] ?? $taskCheck['data'] ?? [];
    $isSuccess = !empty($taskData['success']);
    echo " - Channex Sandbox Task success = true: " . ($isSuccess ? "PASS (true)" : "FAIL") . "\n";
}

// Cleanup test rule and outbox row
$pdo->prepare("DELETE FROM room_rate_rules WHERE id = ?")->execute([$ruleId]);
if ($outboxRow) {
    $pdo->prepare("DELETE FROM channex_outbox WHERE id = ?")->execute([$outboxRow['id']]);
}
echo "Cleaned up test rule {$ruleId} and outbox row.\n";

if ($isDone && $taskId && !empty($isSuccess)) {
    echo "\n=== UI RATE RULE TRIGGER: FULLY VERIFIED & WORKING ===\n";
} else {
    echo "\n=== UI RATE RULE TRIGGER: FAILED ===\n";
    exit(1);
}
