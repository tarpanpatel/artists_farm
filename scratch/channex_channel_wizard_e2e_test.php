<?php
/**
 * End-to-end proof for the self-serve channel-connection wizard's backend,
 * driven directly against the Channex sandbox (not mocked) with a FRESH
 * local test property (never the certified "Artists Farm Jaipur" listing).
 * Cleans up everything it creates, both locally and on Channex, at the end.
 */
require __DIR__ . '/../php/config/database.php';
require __DIR__ . '/../php/channex/content_sync.php';
require __DIR__ . '/../php/channex/ChannexChannelClient.php';
require __DIR__ . '/../php/channex/channel_connections.php';

function step($label) { echo "\n=== $label ===\n"; }

$testPropertyId = null;
$channexPropertyId = null;
$channexChannelId = null;

try {
    step('0. Create a fresh local test property (tenant 1, SINGLE)');
    $slug = 'e2e-test-' . substr(md5(uniqid()), 0, 8);
    $stmt = $pdo->prepare("INSERT INTO properties (tenant_id, name, slug, property_type, default_tariff, currency, is_deleted) VALUES (1, ?, ?, 'SINGLE', 3500, 'INR', 0)");
    $stmt->execute(["E2E Channel Wizard Test " . date('His'), $slug]);
    $testPropertyId = (int)$pdo->lastInsertId();
    echo "local property_id=$testPropertyId slug=$slug\n";

    step('1. Content-sync this property to Channex (creates a fresh Channex property)');
    $syncer = new ChannexContentSyncer($pdo);
    $syncResult = $syncer->syncProperty($testPropertyId);
    echo json_encode($syncResult) . "\n";
    $mapStmt = $pdo->prepare("SELECT channex_property_id, channex_rate_plan_id FROM channex_mappings WHERE property_id = ? LIMIT 1");
    $mapStmt->execute([$testPropertyId]);
    $mapRow = $mapStmt->fetch(PDO::FETCH_ASSOC);
    $channexPropertyId = $mapRow['channex_property_id'] ?? null;
    $ratePlanId = $mapRow['channex_rate_plan_id'] ?? null;
    if (!$channexPropertyId) throw new Exception('Content sync did not produce a channex_property_id');
    echo "channex_property_id=$channexPropertyId rate_plan_id=$ratePlanId\n";

    $client = new ChannexChannelClient();

    step('2. test_connection (BookingCom, deliberately fake hotel_id - expect success:false, HTTP 200)');
    $testRes = $client->testConnection('BookingCom', ['hotel_id' => '000000']);
    echo json_encode($testRes) . "\n";

    step('3. mapping_details (BookingCom, same fake hotel_id)');
    $mapDetails = $client->getMappingDetails('BookingCom', ['hotel_id' => '000000']);
    echo json_encode($mapDetails) . "\n";
    // Expected: this will likely fail/be empty since hotel_id 000000 isn't real -
    // that's fine, this proves the CALL SHAPE works, not that a fake hotel exists.

    step('4. Resolve group_id for this property');
    $groupId = $client->resolveGroupIdForProperty($channexPropertyId);
    echo "group_id=" . ($groupId ?? 'NULL') . "\n";
    if (!$groupId) throw new Exception('Could not resolve group_id - is the fresh property actually in a group yet?');

    step('5. POST /channels - create an OpenChannel test connection (does not require a real OTA account, unlike BookingCom)');
    // OpenChannel is Channex's own test/simulator adapter (seen live in GET /channels
    // as "Certification Simulator" on this account) - using it here instead of a real
    // BookingCom hotel_id proves the full create->mapping->readiness->activate->
    // deactivate->delete lifecycle end-to-end without needing real OTA credentials.
    if (!$ratePlanId) throw new Exception('No rate plan id from content sync - cannot build rate_plans payload');
    $createRes = $client->createChannel(
        'OpenChannel',
        $groupId,
        [$channexPropertyId],
        ['hotel_code' => 'E2E-TEST-001'],
        [[
            'rate_plan_id' => $ratePlanId,
            'settings' => [
                'room_type_code' => 999001,
                'rate_plan_code' => 999002,
                'occupancy' => 2,
                'pricing_type' => 'OBP',
                'primary_occ' => true,
                'readonly' => false,
            ],
        ]],
        'E2E Test Channel'
    );
    echo json_encode($createRes) . "\n";
    if (!$createRes['success'] || empty($createRes['data']['id'])) throw new Exception('POST /channels failed');
    $channexChannelId = $createRes['data']['id'];
    echo "channex_channel_id=$channexChannelId\n";

    step('6. check_readiness (should show empty problems - room/rate mapped, channel created)');
    $readiness = $client->checkReadiness($channexChannelId);
    echo json_encode($readiness) . "\n";

    step('7. activate');
    $activateRes = $client->activateChannel($channexChannelId);
    echo json_encode($activateRes) . "\n";

    step('8. GET /channels/:id to confirm is_active is now true');
    $getRes = $client->getChannel($channexChannelId);
    echo json_encode($getRes['data']['attributes']['is_active'] ?? 'unknown') . "\n";

    step('9. deactivate (required before delete)');
    $deactivateRes = $client->deactivateChannel($channexChannelId);
    echo json_encode($deactivateRes) . "\n";

    step('10. DELETE /channels/:id');
    $deleteRes = $client->deleteChannel($channexChannelId);
    echo json_encode($deleteRes) . "\n";
    $channexChannelId = null; // cleaned up

    echo "\n=== ALL STEPS RAN - see output above for what actually succeeded vs. failed ===\n";
} catch (Throwable $e) {
    echo "\nFATAL: " . get_class($e) . ": " . $e->getMessage() . "\n";
} finally {
    step('CLEANUP');
    if ($channexChannelId) {
        $client = $client ?? new ChannexChannelClient();
        $client->deactivateChannel($channexChannelId);
        $r = $client->deleteChannel($channexChannelId);
        echo "cleanup delete channel: " . json_encode($r) . "\n";
    }
    if ($testPropertyId) {
        $pdo->prepare("DELETE FROM channex_mappings WHERE property_id = ?")->execute([$testPropertyId]);
        $pdo->prepare("DELETE FROM channex_channel_room_mappings WHERE connection_id IN (SELECT id FROM channex_channel_connections WHERE property_id = ?)")->execute([$testPropertyId]);
        $pdo->prepare("DELETE FROM channex_channel_connections WHERE property_id = ?")->execute([$testPropertyId]);
        $pdo->prepare("DELETE FROM properties WHERE id = ?")->execute([$testPropertyId]);
        echo "cleaned up local property_id=$testPropertyId and its channex_mappings rows\n";
    }
    // Note: the Channex-side PROPERTY (channex_property_id) created by content-sync
    // in step 1 is intentionally left in place, not deleted - Channex's API has no
    // property DELETE endpoint in the verified reference, only room_types/rate_plans/
    // channels. It's an orphaned test property on the sandbox account, harmless.
    if ($channexPropertyId) {
        echo "NOTE: Channex sandbox property $channexPropertyId (test property, harmless) was not deleted - no delete endpoint for properties.\n";
    }
}
