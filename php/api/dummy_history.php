<?php
/**
 * Dummy History Mode
 * When enabled, serves fixed deterministic demo data instead of randomized data.
 * Allows unauthenticated requests to switch properties into demo mode.
 */

require_once __DIR__ . '/../config/database.php';

function ensureDummyHistorySchema($pdo) {
    try {
        $pdo->exec("ALTER TABLE `properties` ADD COLUMN IF NOT EXISTS `dummy_history_enabled` TINYINT(1) NOT NULL DEFAULT 0");
    } catch (PDOException $e) {}
}

function getDummyHistoryStatus($pdo, $propertyId) {
    ensureDummyHistorySchema($pdo);
    $stmt = $pdo->prepare("SELECT dummy_history_enabled FROM properties WHERE id = ?");
    $stmt->execute([$propertyId]);
    $enabled = (bool)($stmt->fetchColumn() ?: 0);
    return ['status' => 'success', 'data' => ['enabled' => $enabled]];
}

function enableDummyHistory($pdo, $propertyId) {
    ensureDummyHistorySchema($pdo);
    $stmt = $pdo->prepare("UPDATE properties SET dummy_history_enabled = 1 WHERE id = ?");
    $stmt->execute([$propertyId]);
    return ['status' => 'success', 'message' => 'Dummy history mode enabled'];
}

function disableDummyHistory($pdo, $propertyId) {
    ensureDummyHistorySchema($pdo);
    $stmt = $pdo->prepare("UPDATE properties SET dummy_history_enabled = 0 WHERE id = ?");
    $stmt->execute([$propertyId]);
    return ['status' => 'success', 'message' => 'Dummy history mode disabled'];
}

function handleDummyHistory($pdo, $action, $propertyId) {
    if (!$propertyId) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'property_id required']);
        return;
    }

    switch ($action) {
        case 'get_dummy_history_status':
            echo json_encode(getDummyHistoryStatus($pdo, $propertyId));
            break;
        case 'enable_dummy_history':
            echo json_encode(enableDummyHistory($pdo, $propertyId));
            break;
        case 'disable_dummy_history':
            echo json_encode(disableDummyHistory($pdo, $propertyId));
            break;
        default:
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Invalid action']);
    }
}
