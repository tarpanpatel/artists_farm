<?php
/**
 * Debug endpoint to check guest and room data associations
 * Access: /php/api/debug_guests.php?property_id=X
 */

require_once __DIR__ . '/../config/database.php';

$propertyId = $_GET['property_id'] ?? null;
if (!$propertyId) {
    http_response_code(400);
    echo json_encode(['error' => 'property_id required']);
    exit;
}

$data = [];

// Get all rooms for this property
try {
    $stmt = $pdo->prepare("
        SELECT id, name, slug, property_type
        FROM properties
        WHERE (id = ? OR parent_property_id = ?)
        ORDER BY property_type, name
    ");
    $stmt->execute([$propertyId, $propertyId]);
    $data['rooms'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (Exception $e) {
    $data['rooms_error'] = $e->getMessage();
}

// Get all guests for this property with room details
try {
    $stmt = $pdo->prepare("
        SELECT
            g.id,
            g.guest_name,
            g.room_id,
            g.checkin_date,
            g.expected_checkout,
            g.status,
            COALESCE(r.name, 'No Room') as room_name,
            COALESCE(r.slug, 'no-room') as room_slug
        FROM guests g
        LEFT JOIN properties r ON g.room_id = r.id
        WHERE g.property_id = ?
        ORDER BY g.checkin_date DESC
    ");
    $stmt->execute([$propertyId]);
    $guests = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $data['guests'] = $guests;
    $data['guest_count'] = count($guests);

    // Analyze issues
    $data['analysis'] = [];
    foreach ($guests as $guest) {
        if (!$guest['room_id']) {
            $data['analysis'][] = "ISSUE: {$guest['guest_name']} has NO room_id assigned";
        } elseif (!$guest['room_name']) {
            $data['analysis'][] = "ISSUE: {$guest['guest_name']} has room_id={$guest['room_id']} but room not found in DB";
        } elseif ($guest['room_number'] && $guest['room_number'] !== $guest['room_name']) {
            $data['analysis'][] = "MISMATCH: {$guest['guest_name']} room_number='{$guest['room_number']}' but room_name='{$guest['room_name']}'";
        }
    }

} catch (Exception $e) {
    $data['guests_error'] = $e->getMessage();
}

header('Content-Type: application/json');
echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
?>
