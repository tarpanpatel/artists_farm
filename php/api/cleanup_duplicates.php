<?php
/**
 * Clean up duplicate expense items in miscellaneous_catalog
 * Keeps the lowest ID for each (property_id, label) pair, deletes rest
 */

require_once __DIR__ . '/../config/database.php';

try {
    // Find duplicates: for each (property_id, label), get count and min ID
    $stmt = $pdo->query("
        SELECT property_id, label, COUNT(*) as cnt, MIN(id) as keep_id
        FROM miscellaneous_catalog
        GROUP BY property_id, label
        HAVING COUNT(*) > 1
    ");

    $duplicates = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($duplicates)) {
        echo json_encode(['status' => 'success', 'message' => 'No duplicates found', 'deleted' => 0]);
        exit;
    }

    echo "Found " . count($duplicates) . " duplicate groups:\n\n";

    $total_deleted = 0;

    foreach ($duplicates as $dup) {
        $property_id = $dup['property_id'];
        $label = $dup['label'];
        $keep_id = $dup['keep_id'];
        $count = $dup['cnt'];

        // Get all IDs for this property/label combo
        $stmt = $pdo->prepare("
            SELECT id FROM miscellaneous_catalog
            WHERE property_id = ? AND label = ?
            ORDER BY id ASC
        ");
        $stmt->execute([$property_id, $label]);
        $ids = $stmt->fetchAll(PDO::FETCH_COLUMN);

        $delete_ids = array_slice($ids, 1); // Keep first (lowest ID), delete rest

        echo "Property $property_id | Label: '$label' | Keep ID: $keep_id | Delete: " . implode(', ', $delete_ids) . "\n";

        // Delete duplicates
        $placeholders = implode(',', array_fill(0, count($delete_ids), '?'));
        $delete_stmt = $pdo->prepare("DELETE FROM miscellaneous_catalog WHERE id IN ($placeholders)");
        $delete_stmt->execute($delete_ids);

        $total_deleted += count($delete_ids);
    }

    echo "\n✓ Successfully deleted $total_deleted duplicate entries";

    echo json_encode(['status' => 'success', 'message' => "Deleted $total_deleted duplicate entries", 'deleted' => $total_deleted]);

} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
