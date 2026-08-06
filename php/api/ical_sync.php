<?php
/**
 * iCal Sync Management API
 * Handles calendar syncs with Google Calendar, Airbnb, and other OTAs
 */

require_once __DIR__ . '/../config/database.php';

class ICalSyncManager {
    private $pdo;

    public function __construct($pdo) {
        $this->pdo = $pdo;
    }

    // Scoped to the current property - this was previously unfiltered and leaked
    // every property's connected feeds (IDs included) to every other property's
    // iCal Sync Manager page, which also made the unscoped update/delete/test
    // actions below exploitable by ID once a client had seen a foreign ID here.
    public function getICalSyncs($propertyId) {
        $query = "SELECT sc.*, p.name as property_name
                  FROM ical_sync_configs sc
                  LEFT JOIN properties p ON sc.property_id = p.id
                  WHERE sc.property_id = :property_id
                  ORDER BY sc.created_at DESC";

        $stmt = $this->pdo->prepare($query);
        $stmt->execute([':property_id' => $propertyId]);
        $syncs = $stmt->fetchAll();
        return ['status' => 'success', 'data' => $syncs];
    }

    public function getProperties() {
        $query = "SELECT id, name as property_name FROM properties WHERE is_active = 1 ORDER BY name";
        $stmt = $this->pdo->query($query);
        $properties = $stmt->fetchAll();
        return ['status' => 'success', 'data' => $properties];
    }

    public function createICalSync($data, $currentPropertyId = null) {
        try {
            // Prefer explicitly provided property_id, fall back to current property context
            $propertyId = 0;

            if (!empty($data['property_id'])) {
                $propertyId = intval($data['property_id']);
            } elseif ($currentPropertyId > 0) {
                $propertyId = $currentPropertyId;
            }

            if ($propertyId <= 0) {
                return ['status' => 'error', 'message' => 'Invalid property: ' . $propertyId];
            }

            // Validate iCal URL
            $icalUrl = $data['ical_url'] ?? null;
            if (!$icalUrl || !filter_var($icalUrl, FILTER_VALIDATE_URL)) {
                return ['status' => 'error', 'message' => 'Invalid iCal URL'];
            }

            $query = "INSERT INTO ical_sync_configs
                      (property_id, service_type, service_name, ical_url, api_key, sync_enabled, sync_direction)
                      VALUES (:property_id, :service_type, :service_name, :ical_url, :api_key, :sync_enabled, :sync_direction)";

            $stmt = $this->pdo->prepare($query);
            $stmt->execute([
                ':property_id' => $propertyId,
                ':service_type' => $data['service_type'] ?? 'ical',
                ':service_name' => $data['service_name'] ?? 'Imported Calendar',
                ':ical_url' => $icalUrl,
                ':api_key' => $data['api_key'] ?? null,
                ':sync_enabled' => $data['sync_enabled'] ? 1 : 0,
                ':sync_direction' => $data['sync_direction'] ?? 'bidirectional',
            ]);

            return ['status' => 'success', 'message' => 'iCal sync created', 'id' => $this->pdo->lastInsertId()];
        } catch (Exception $e) {
            return ['status' => 'error', 'message' => $e->getMessage()];
        }
    }

    // $propertyId is the current property from the request context, not whatever
    // the client sent - a sync can't be re-pointed at a different property_id via
    // this call, and the WHERE clause below rejects touching another property's row.
    public function updateICalSync($data, $propertyId) {
        try {
            $query = "UPDATE ical_sync_configs SET
                      service_type = :service_type,
                      service_name = :service_name,
                      ical_url = :ical_url,
                      api_key = :api_key,
                      sync_enabled = :sync_enabled,
                      sync_direction = :sync_direction
                      WHERE id = :id AND property_id = :property_id";

            $stmt = $this->pdo->prepare($query);
            $stmt->execute([
                ':id' => intval($data['id']),
                ':property_id' => $propertyId,
                ':service_type' => $data['service_type'],
                ':service_name' => $data['service_name'],
                ':ical_url' => $data['ical_url'] ?? null,
                ':api_key' => $data['api_key'] ?? null,
                ':sync_enabled' => $data['sync_enabled'] ? 1 : 0,
                ':sync_direction' => $data['sync_direction'],
            ]);

            if ($stmt->rowCount() === 0) {
                return ['status' => 'error', 'message' => 'Sync configuration not found'];
            }

            return ['status' => 'success', 'message' => 'iCal sync updated'];
        } catch (Exception $e) {
            return ['status' => 'error', 'message' => $e->getMessage()];
        }
    }

    public function deleteICalSync($data, $propertyId) {
        try {
            $query = "DELETE FROM ical_sync_configs WHERE id = :id AND property_id = :property_id";
            $stmt = $this->pdo->prepare($query);
            $stmt->execute([':id' => intval($data['id']), ':property_id' => $propertyId]);

            if ($stmt->rowCount() === 0) {
                return ['status' => 'error', 'message' => 'Sync configuration not found'];
            }

            return ['status' => 'success', 'message' => 'iCal sync deleted'];
        } catch (Exception $e) {
            return ['status' => 'error', 'message' => $e->getMessage()];
        }
    }

    public function testSync($data, $propertyId) {
        try {
            $query = "SELECT * FROM ical_sync_configs WHERE id = :id AND property_id = :property_id";
            $stmt = $this->pdo->prepare($query);
            $stmt->execute([':id' => intval($data['id']), ':property_id' => $propertyId]);
            $sync = $stmt->fetch();

            if (!$sync) {
                return ['status' => 'error', 'message' => 'Sync configuration not found'];
            }

            $result = $this->testServiceConnection($sync);

            if ($result['status'] === 'success') {
                $updateQuery = "UPDATE ical_sync_configs SET last_sync = NOW() WHERE id = :id";
                $updateStmt = $this->pdo->prepare($updateQuery);
                $updateStmt->execute([':id' => intval($data['id'])]);
            }

            return $result;
        } catch (Exception $e) {
            return ['status' => 'error', 'message' => $e->getMessage()];
        }
    }

    private function testServiceConnection($sync) {
        switch ($sync['service_type']) {
            case 'ical':
                return $this->testICalConnection($sync);
            case 'google':
                return $this->testGoogleConnection($sync);
            case 'airbnb':
                return $this->testAirbnbConnection($sync);
            default:
                return ['status' => 'error', 'message' => 'Unknown service type'];
        }
    }

    private function testICalConnection($sync) {
        if (empty($sync['ical_url'])) {
            return ['status' => 'error', 'message' => 'iCal URL not configured'];
        }

        $context = stream_context_create([
            'http' => [
                'timeout' => 5,
                'header' => "User-Agent: ArtistsFarm-iCalSync/1.0\r\n"
            ]
        ]);

        $response = @file_get_contents($sync['ical_url'], false, $context);

        if ($response === false) {
            return ['status' => 'error', 'message' => 'Failed to fetch iCal feed'];
        }

        if (strpos($response, 'BEGIN:VCALENDAR') === false) {
            return ['status' => 'error', 'message' => 'Invalid iCal format'];
        }

        return ['status' => 'success', 'message' => 'iCal feed is valid and accessible'];
    }

    private function testGoogleConnection($sync) {
        if (empty($sync['api_key'])) {
            return ['status' => 'error', 'message' => 'Google API key not configured'];
        }

        return ['status' => 'success', 'message' => 'Google Calendar connection configured'];
    }

    private function testAirbnbConnection($sync) {
        if (empty($sync['api_key'])) {
            return ['status' => 'error', 'message' => 'Airbnb API key not configured'];
        }

        return ['status' => 'success', 'message' => 'Airbnb connection configured'];
    }

    // $propertyId is optional because this is also called internally right after
    // create/updateICalSync already verified ownership on that same row - the
    // direct 'sync_ical_events' HTTP action always passes it.
    public function syncICalEvents($syncId, $propertyId = null) {
        try {
            $query = "SELECT * FROM ical_sync_configs WHERE id = :id" . ($propertyId !== null ? " AND property_id = :property_id" : "");
            $stmt = $this->pdo->prepare($query);
            $params = [':id' => intval($syncId)];
            if ($propertyId !== null) {
                $params[':property_id'] = $propertyId;
            }
            $stmt->execute($params);
            $sync = $stmt->fetch();

            if (!$sync) {
                return ['status' => 'error', 'message' => 'Sync configuration not found'];
            }

            if (empty($sync['ical_url'])) {
                return ['status' => 'error', 'message' => 'No iCal URL configured'];
            }

            // Fetch the iCal feed
            $context = stream_context_create([
                'http' => [
                    'timeout' => 10,
                    'header' => "User-Agent: ArtistsFarm-iCalSync/1.0\r\n"
                ]
            ]);

            $icalData = @file_get_contents($sync['ical_url'], false, $context);
            if ($icalData === false) {
                return ['status' => 'error', 'message' => 'Failed to fetch iCal feed'];
            }

            // Parse iCal events
            $events = $this->parseICalEvents($icalData);

            if (empty($events)) {
                return ['status' => 'success', 'message' => 'No events found in feed', 'count' => 0];
            }

            // Clear old events for this sync
            $deleteQuery = "DELETE FROM ical_synced_events WHERE sync_config_id = :sync_id";
            $stmt = $this->pdo->prepare($deleteQuery);
            $stmt->execute([':sync_id' => $sync['id']]);

            // Insert new events
            $insertQuery = "INSERT INTO ical_synced_events
                           (sync_config_id, external_event_id, event_title, event_start, event_end, event_data, sync_status)
                           VALUES (:sync_id, :event_id, :title, :start, :end, :data, 'synced')";

            $insertStmt = $this->pdo->prepare($insertQuery);
            $count = 0;

            foreach ($events as $event) {
                // Store full event data including booking_id
                $eventData = $event;
                $eventData['source'] = 'airbnb'; // Mark source

                $insertStmt->execute([
                    ':sync_id' => $sync['id'],
                    ':event_id' => $event['uid'],
                    ':title' => $event['summary'],
                    ':start' => $event['dtstart'],
                    ':end' => $event['dtend'],
                    ':data' => json_encode($eventData),
                ]);
                $count++;
            }

            // Update last_sync timestamp
            $updateQuery = "UPDATE ical_sync_configs SET last_sync = NOW() WHERE id = :id";
            $updateStmt = $this->pdo->prepare($updateQuery);
            $updateStmt->execute([':id' => $sync['id']]);

            return ['status' => 'success', 'message' => "Synced $count events", 'count' => $count];
        } catch (Exception $e) {
            return ['status' => 'error', 'message' => $e->getMessage()];
        }
    }

    private function parseICalEvents($icalData) {
        $events = [];
        $lines = explode("\n", $icalData);
        $currentEvent = null;

        foreach ($lines as $line) {
            $line = rtrim($line);

            if ($line === 'BEGIN:VEVENT') {
                $currentEvent = [];
            } elseif ($line === 'END:VEVENT' && $currentEvent) {
                if (!empty($currentEvent['uid'])) {
                    // Ensure both dates exist and are in proper format
                    if (!empty($currentEvent['dtstart'])) {
                        $currentEvent['dtstart'] = $this->formatICalDate($currentEvent['dtstart']);
                    }
                    if (!empty($currentEvent['dtend'])) {
                        $currentEvent['dtend'] = $this->formatICalDate($currentEvent['dtend']);
                    } else {
                        // If no end date, use start date
                        $currentEvent['dtend'] = $currentEvent['dtstart'];
                    }

                    // Extract reservation URL from description
                    $currentEvent['reservation_url'] = $this->extractReservationUrl($currentEvent['description'] ?? '');

                    if (!empty($currentEvent['dtstart'])) {
                        $events[] = $currentEvent;
                    }
                }
                $currentEvent = null;
            } elseif ($currentEvent !== null && strpos($line, ':') !== false) {
                // Split on first colon only
                $colonPos = strpos($line, ':');
                $key = substr($line, 0, $colonPos);
                $value = substr($line, $colonPos + 1);

                // Extract just the key part (remove parameters like TZID)
                if (strpos($key, ';') !== false) {
                    $key = substr($key, 0, strpos($key, ';'));
                }

                $key = strtolower(trim($key));
                $value = trim($value);

                if (!empty($value)) {
                    $currentEvent[$key] = $value;
                }
            }
        }

        return $events;
    }

    private function extractReservationUrl($description) {
        // Extract URL from DESCRIPTION field
        // Format: "Reservation URL: https://www.airbnb.com/hosting/reservations/details/XXXXX\nPhone Number..."
        if (empty($description)) {
            return null;
        }

        // Look for Reservation URL in description
        if (preg_match('/Reservation URL:\s*(https?:\/\/[^\s\n]+)/', $description, $matches)) {
            return trim($matches[1]);
        }

        return null;
    }

    private function formatICalDate($dateStr) {
        // Convert iCal format (20260815T000000Z or 20260815) to MySQL DATETIME format
        $dateStr = trim($dateStr);

        // Remove timezone indicator
        $dateStr = str_replace('Z', '', $dateStr);

        // Handle VALUE=DATE format (just YYYYMMDD)
        if (strlen($dateStr) === 8) {
            return substr($dateStr, 0, 4) . '-' . substr($dateStr, 4, 2) . '-' . substr($dateStr, 6, 2) . ' 00:00:00';
        }

        // Handle YYYYMMDDTHHMMSS format
        if (strlen($dateStr) >= 15 && strpos($dateStr, 'T') !== false) {
            [$date, $time] = explode('T', $dateStr);
            return substr($date, 0, 4) . '-' . substr($date, 4, 2) . '-' . substr($date, 6, 2) . ' ' .
                   substr($time, 0, 2) . ':' . substr($time, 2, 2) . ':' . substr($time, 4, 2);
        }

        return $dateStr;
    }

    public function getBlockedDates($propertyId) {
        try {
            $query = "SELECT event_start, event_end, event_title, event_data, external_event_id
                     FROM ical_synced_events e
                     JOIN ical_sync_configs c ON e.sync_config_id = c.id
                     WHERE c.property_id = :property_id
                     AND e.sync_status = 'synced'
                     ORDER BY event_start ASC";

            $stmt = $this->pdo->prepare($query);
            $stmt->execute([':property_id' => intval($propertyId)]);
            $events = $stmt->fetchAll();

            // Parse event_data to extract booking info
            foreach ($events as &$event) {
                $data = json_decode($event['event_data'], true);
                $event['reservation_url'] = $data['reservation_url'] ?? null;
                $event['source'] = $data['source'] ?? 'unknown';

                // Determine if this is an Airbnb event
                if (strpos($event['external_event_id'], '@airbnb.com') !== false) {
                    $event['source'] = 'airbnb';
                }
            }

            return ['status' => 'success', 'data' => $events];
        } catch (Exception $e) {
            return ['status' => 'error', 'message' => $e->getMessage()];
        }
    }
}

// Only handle as an HTTP request when actually invoked over HTTP - the cron
// worker (php/cron/sync_all_icals.php) requires this file for the
// ICalSyncManager class definition alone and must not trigger this dispatch.
if (php_sapi_name() === 'cli') {
    return;
}

// Handle API requests
$action = $_GET['action'] ?? '';

// Get current property ID from request context
require_once __DIR__ . '/../config/property_resolver.php';
$currentPropertyId = getCurrentPropertyId($pdo);

$manager = new ICalSyncManager($pdo);

$response = ['status' => 'error', 'message' => 'Invalid action'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    switch ($action) {
        case 'get_ical_syncs':
            $response = $manager->getICalSyncs($currentPropertyId);
            break;
        case 'get_properties':
            $response = $manager->getProperties();
            break;
        case 'get_blocked_dates':
            $response = $manager->getBlockedDates($currentPropertyId);
            break;
    }
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;

    switch ($action) {
        case 'create_ical_sync':
            $response = $manager->createICalSync($data, $currentPropertyId);
            // Auto-sync events after creating
            if ($response['status'] === 'success' && !empty($response['id'])) {
                error_log("Auto-syncing iCal events for sync ID: {$response['id']}");
                $syncResult = $manager->syncICalEvents($response['id'], $currentPropertyId);
                $response['sync_status'] = $syncResult['status'];
                $response['sync_message'] = $syncResult['message'] ?? '';
            }
            break;
        case 'update_ical_sync':
            $response = $manager->updateICalSync($data, $currentPropertyId);
            // Auto-sync events after updating
            if ($response['status'] === 'success' && !empty($data['id'])) {
                error_log("Auto-syncing iCal events for sync ID: {$data['id']}");
                $syncResult = $manager->syncICalEvents($data['id'], $currentPropertyId);
                $response['sync_status'] = $syncResult['status'];
                $response['sync_message'] = $syncResult['message'] ?? '';
            }
            break;
        case 'delete_ical_sync':
            $response = $manager->deleteICalSync($data, $currentPropertyId);
            break;
        case 'test_ical_sync':
            $response = $manager->testSync($data, $currentPropertyId);
            break;
        case 'sync_ical_events':
            $id = intval($_POST['id'] ?? $_GET['id'] ?? 0);
            $response = $manager->syncICalEvents($id, $currentPropertyId);
            break;
        case 'get_blocked_dates':
            $response = $manager->getBlockedDates($currentPropertyId);
            break;
    }
}

header('Content-Type: application/json');
echo json_encode($response);
?>
