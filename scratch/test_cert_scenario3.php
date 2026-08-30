<?php
/**
 * Official Channex Certification Scenario 3:
 * Trigger: Change multiple rate plans on 1 single date in one save.
 * Requirement: Exactly 1 batched call to POST /restrictions.
 * Verification: Fetch Channex task record via GET /tasks/:id, assert success: true, errors: [], values length: 3.
 */
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';
require_once 'php/channex/ChannexAdapter.php';
require_once 'php/channex/ChannexClient.php';

// Resolve live property mapping from database
$mapStmt = $pdo->prepare("SELECT channex_property_id, channex_rate_plan_id FROM channex_mappings WHERE property_id = 1 LIMIT 1");
$mapStmt->execute();
$mapping = $mapStmt->fetch(PDO::FETCH_ASSOC);
$PROP = $mapping['channex_property_id'] ?? '3041823d-4456-4068-a9b1-bb3f7b8a2662';

// Resolve rate plans dynamically from Channex Sandbox
$tempClient = new ChannexClient();
$rpList = $tempClient->get('rate_plans', ['filter[property_id]' => $PROP]);
$RP_STD = null; $RP_NRF = null; $RP_WKD = null;

foreach ($rpList['data'] ?? [] as $rp) {
    $t = strtolower($rp['attributes']['title'] ?? '');
    if (strpos($t, 'non') !== false) {
        $RP_NRF = $rp['id'];
    } elseif (strpos($t, 'week') !== false) {
        $RP_WKD = $rp['id'];
    } else {
        $RP_STD = $rp['id'];
    }
}
$RP_STD = $RP_STD ?: ($mapping['channex_rate_plan_id'] ?? 'b253a8d1-3319-4a68-bc4b-3ce8a8c4107a');

class CallCountingClient3 extends ChannexClient {
    public int $callCount = 0;
    public array $lastResponse = [];

    protected function request(string $method, string $url, ?array $body = null): array {
        $this->callCount++;
        $res = parent::request($method, $url, $body);
        $this->lastResponse = $res;
        return $res;
    }
}

$countingClient = new CallCountingClient3();
$adapter = new ChannexAdapter($pdo, $countingClient);

$testDate = '2026-11-12';
$updatePayload = [
    [
        'property_id' => $PROP,
        'rate_plan_id' => $RP_STD,
        'date_from' => $testDate,
        'date_to' => $testDate,
        'rate' => 3600.00,
        'min_stay_arrival' => 1,
    ],
    [
        'property_id' => $PROP,
        'rate_plan_id' => $RP_NRF,
        'date_from' => $testDate,
        'date_to' => $testDate,
        'rate' => 3200.00,
        'min_stay_arrival' => 1,
    ],
    [
        'property_id' => $PROP,
        'rate_plan_id' => $RP_WKD,
        'date_from' => $testDate,
        'date_to' => $testDate,
        'rate' => 4200.00,
        'min_stay_arrival' => 2,
    ],
];

echo "=== Running Scenario 3 Test (3 rate plans, 1 single date, 1 batched call) ===\n";
echo "Property: {$PROP}\n";
echo "Rate Plans: STD={$RP_STD}, NRF={$RP_NRF}, WKD={$RP_WKD}\n";

$res = $adapter->pushRestrictions(1, null, $updatePayload);

$calls = $countingClient->callCount;
$taskId = $res['task_id'] ?? ($res['data'][0]['id'] ?? null);
echo "Outbound API calls measured: {$calls}\n";
echo "Returned Task ID: " . ($taskId ?: 'NONE') . "\n";

if ($calls !== 1) {
    echo "FAILED: Expected exactly 1 batched call, got {$calls}\n";
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
echo " - Exactly 1 batched outbound call: " . ($calls === 1 ? "PASS (1)" : "FAIL") . "\n";
echo " - Task success = true:             " . ($isSuccess ? "PASS (true)" : "FAIL") . "\n";
echo " - Task errors empty:               " . ($hasNoErrors ? "PASS" : "FAIL") . "\n";
echo " - Payload values count = 3:        " . ($valuesCount === 3 ? "PASS (3)" : "FAIL ({$valuesCount})") . "\n";

if ($calls === 1 && $isSuccess && $hasNoErrors && $valuesCount === 3) {
    echo "\n=== SCENARIO 3 CERTIFICATION TEST: PASSED ===\n";
} else {
    echo "\n=== SCENARIO 3 CERTIFICATION TEST: FAILED ===\n";
    exit(1);
}
