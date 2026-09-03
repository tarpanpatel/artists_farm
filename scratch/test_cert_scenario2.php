<?php
/**
 * Official Channex Certification Scenario 2:
 * Trigger: Change 1 rate plan on 1 single date.
 * Requirement: Exactly 1 call to POST /restrictions.
 * Verification: Fetch Channex task record via GET /tasks/:id, assert success: true, errors: [], values length: 1.
 */
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/channex/ChannexAdapter.php';
require_once 'php/channex/ChannexClient.php';

// Read live mapping from database for Property 1
$mapStmt = $pdo->prepare("SELECT channex_property_id, channex_rate_plan_id FROM channex_mappings WHERE property_id = 1 LIMIT 1");
$mapStmt->execute();
$mapping = $mapStmt->fetch(PDO::FETCH_ASSOC);
$PROP = $mapping['channex_property_id'] ?? '3041823d-4456-4068-a9b1-bb3f7b8a2662';
$RP_STD = $mapping['channex_rate_plan_id'] ?? 'b253a8d1-3319-4a68-bc4b-3ce8a8c4107a';

$adapter = new ChannexAdapter($pdo);
$client = $adapter->getClient();

// Use an instrumented client to count exact outbound API calls
class CallCountingClient extends ChannexClient {
    public int $callCount = 0;
    public array $lastResponse = [];

    protected function request(string $method, string $url, ?array $body = null): array {
        $this->callCount++;
        $res = parent::request($method, $url, $body);
        $this->lastResponse = $res;
        return $res;
    }
}

$countingClient = new CallCountingClient();
$adapter = new ChannexAdapter($pdo, $countingClient);

$testDate = '2026-11-10';
$updatePayload = [
    [
        'property_id' => $PROP,
        'rate_plan_id' => $RP_STD,
        'date_from' => $testDate,
        'date_to' => $testDate,
        'rate' => 175.00,
        'min_stay_arrival' => 1,
    ]
];

echo "=== Running Scenario 2 Test (1 rate plan, 1 single date) ===\n";
$res = $adapter->pushRestrictions(1, null, $updatePayload);

$calls = $countingClient->callCount;
$taskId = $res['data'][0]['id'] ?? ($res['task_id'] ?? null);
echo "Outbound API calls measured: {$calls}\n";
echo "Returned Task ID: " . ($taskId ?: 'NONE') . "\n";

if ($calls !== 1) {
    echo "FAILED: Expected exactly 1 call, got {$calls}\n";
    exit(1);
}
if (!$taskId) {
    echo "FAILED: No task ID returned in response: " . json_encode($res) . "\n";
    exit(1);
}

// Fetch task record from Channex Sandbox
echo "Fetching task record GET /tasks/{$taskId}...\n";
// Wait briefly if needed for Channex task persistence
$taskCheck = [];
for ($attempt = 0; $attempt < 3; $attempt++) {
    if ($attempt > 0) usleep(800000);
    $taskCheck = $countingClient->get("tasks/{$taskId}");
    if (!empty($taskCheck['success']) || !empty($taskCheck['data']['id'])) {
        break;
    }
}
echo "Task Record Verbatim:\n" . json_encode($taskCheck, JSON_PRETTY_PRINT) . "\n";

$taskData = $taskCheck['data']['attributes'] ?? $taskCheck['data'] ?? [];
$isSuccess = !empty($taskData['success']);
$taskErrors = $taskData['errors'] ?? [];
$hasNoErrors = empty($taskErrors);
$payloadValues = $taskData['payload']['values'] ?? [];
$valuesCount = count($payloadValues);

echo "\nAssertions:\n";
echo " - Exactly 1 outbound call: " . ($calls === 1 ? "PASS (1)" : "FAIL") . "\n";
echo " - Task success = true:     " . ($isSuccess ? "PASS (true)" : "FAIL") . "\n";
echo " - Task errors empty:       " . ($hasNoErrors ? "PASS" : "FAIL") . "\n";
echo " - Payload values count = 1: " . ($valuesCount === 1 ? "PASS (1)" : "FAIL ({$valuesCount})") . "\n";

if ($calls === 1 && $isSuccess && $hasNoErrors && $valuesCount === 1) {
    echo "\n=== SCENARIO 2 CERTIFICATION TEST: PASSED ===\n";
} else {
    echo "\n=== SCENARIO 2 CERTIFICATION TEST: FAILED ===\n";
    exit(1);
}
