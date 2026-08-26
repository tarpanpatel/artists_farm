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
    //
    // BUG (found 14 Aug 2026): a MULTI_KEY parent's own iCal Sync Manager page
    // always showed "0 Connected Feeds" even when every one of its rooms had
    // real feeds connected - each room is its own row in `properties` and a
    // feed is always connected to one specific room (see createICalSync),
    // never to the parent directly, but this query only ever matched the
    // exact id it was called with. getBlockedDates() below already expands a
    // parent to include its rooms for the calendar's sake; do the same here
    // so the management list a user actually sees when they open "iCal Sync"
    // from the parent property isn't just permanently empty.
    public function getICalSyncs($propertyId) {
        $scopeIds = [(int)$propertyId];
        $roomStmt = $this->pdo->prepare("SELECT id FROM properties WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM'");
        $roomStmt->execute([$propertyId]);
        foreach ($roomStmt->fetchAll(PDO::FETCH_COLUMN) as $roomId) {
            $scopeIds[] = (int)$roomId;
        }
        $placeholders = implode(',', array_fill(0, count($scopeIds), '?'));

        $query = "SELECT sc.*, p.name as property_name
                  FROM ical_sync_configs sc
                  LEFT JOIN properties p ON sc.property_id = p.id
                  WHERE sc.property_id IN ($placeholders)
                  ORDER BY sc.created_at DESC";

        $stmt = $this->pdo->prepare($query);
        $stmt->execute($scopeIds);
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

            // Capture which UIDs were present before this resync, so a UID that
            // disappears from the fresh feed (guest cancelled upstream) can be
            // detected below and flagged on any guests row that was converted from
            // it - see the cancellation-drift check after the insert loop.
            $oldUidStmt = $this->pdo->prepare("SELECT external_event_id FROM ical_synced_events WHERE sync_config_id = ?");
            $oldUidStmt->execute([$sync['id']]);
            $oldExternalEventIds = $oldUidStmt->fetchAll(PDO::FETCH_COLUMN);

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
                // SECURITY/CORRECTNESS (11 Aug 2026): this used to be hardcoded to
                // 'airbnb' regardless of which platform the feed actually came from -
                // every Booking.com/Google/other feed's blocks were silently
                // mislabeled. Use the sync config's own service_type/service_name
                // (set correctly when the feed was connected) instead.
                $eventData['source'] = $sync['service_type'] ?: 'other';
                $eventData['source_label'] = $sync['service_name'] ?: ucfirst($eventData['source']);

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

            // A UID present before this resync but missing from the fresh feed most
            // likely means the guest cancelled upstream. Flag (not delete/checkout)
            // any already-converted guests row for it - informational only, staff
            // decide what to do, and this never overwrites a flag already set nor
            // touches a stay that's already checked out.
            $newExternalEventIds = array_column($events, 'uid');
            $disappearedUids = array_diff($oldExternalEventIds, $newExternalEventIds);
            if (!empty($disappearedUids)) {
                try {
                    $placeholders = implode(',', array_fill(0, count($disappearedUids), '?'));
                    $cancelStmt = $this->pdo->prepare("
                        UPDATE guests SET ota_cancelled_detected_at = NOW()
                        WHERE ical_external_event_id IN ($placeholders)
                        AND ota_cancelled_detected_at IS NULL
                        AND status != 'CheckedOut'
                        AND (room_id = ? OR property_id = ?)
                    ");
                    $cancelStmt->execute([...array_values($disappearedUids), $sync['property_id'], $sync['property_id']]);
                } catch (PDOException $e) {}
            }

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
            $propertyId = intval($propertyId);
            // If this resolved to a MULTI_KEY parent, expand to include its rooms too -
            // each room is its own properties row and iCal syncs are connected per
            // room, not per parent, so a parent-scoped call would otherwise silently
            // return nothing for every multi-key property.
            $scopeIds = [$propertyId];
            $roomStmt = $this->pdo->prepare("SELECT id FROM properties WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM'");
            $roomStmt->execute([$propertyId]);
            foreach ($roomStmt->fetchAll(PDO::FETCH_COLUMN) as $roomId) {
                $scopeIds[] = (int)$roomId;
            }
            $placeholders = implode(',', array_fill(0, count($scopeIds), '?'));

            // Excludes events already claimed by a converted guests row (matched on the
            // stable iCal UID, external_event_id) - this is what makes a converted OTA
            // block permanently disappear from every calendar looking at this property,
            // including across future resyncs (resync only ever touches
            // ical_synced_events, never the guests row or its ical_external_event_id).
            // It also doubles as the double-conversion guard: once claimed, there's no
            // block left here to reconvert.
            $query = "SELECT event_start, event_end, event_title, event_data, external_event_id,
                             c.property_id as room_id, c.service_type, c.service_name
                     FROM ical_synced_events e
                     JOIN ical_sync_configs c ON e.sync_config_id = c.id
                     WHERE c.property_id IN ($placeholders)
                     AND e.sync_status = 'synced'
                     AND NOT EXISTS (
                         SELECT 1 FROM guests g
                         WHERE g.ical_external_event_id = e.external_event_id
                         AND (g.room_id = c.property_id OR g.property_id = c.property_id)
                     )
                     ORDER BY event_start ASC";

            $stmt = $this->pdo->prepare($query);
            $stmt->execute($scopeIds);
            $events = $stmt->fetchAll();

            // Parse event_data to extract booking info / resolve a real
            // platform label - shared with getUnconvertedDueBlocks() below,
            // see annotateEventSource().
            foreach ($events as &$event) {
                $this->annotateEventSource($event);
            }

            return ['status' => 'success', 'data' => $events];
        } catch (Exception $e) {
            return ['status' => 'error', 'message' => $e->getMessage()];
        }
    }

    /**
     * Resolves an ical_synced_events row's reservation_url/source/source_label
     * in place. Split out of getBlockedDates() (22 Aug 2026) so
     * getUnconvertedDueBlocks() below can share the exact same
     * platform-label-resolution logic instead of drifting out of sync with
     * its own copy.
     */
    private function annotateEventSource(array &$event): void {
        $data = json_decode($event['event_data'] ?? '', true) ?: [];
        $event['reservation_url'] = $data['reservation_url'] ?? null;
        // Prefer the sync config's own service_type/service_name (set
        // correctly when the feed was connected, see syncICalEvents()) over
        // whatever's frozen into this row's event_data - the config is the
        // live source of truth if it was ever corrected after the sync ran.
        $event['source'] = $event['service_type'] ?: ($data['source'] ?? 'unknown');
        $event['source_label'] = $event['service_name'] ?: ($data['source_label'] ?? ucfirst($event['source']));

        // The service_type enum only distinguishes google/airbnb/ical/other -
        // in real data, feeds pulled in as the generic 'ical'/'other' still
        // need a real platform label, and the external UID is a strong,
        // verifiable signal for that (confirmed live: a real synced feed here
        // is saved as service_type='ical' with a non-descriptive service_name
        // like "Property Calendar", even though every event's UID ends
        // '@airbnb.com' - Airbnb's own export format, not user-editable).
        // Only override the generic/unknown case, never a specific value
        // someone deliberately set (e.g. 'google').
        if (in_array($event['source'], ['unknown', 'ical', 'other'], true)
            && strpos($event['external_event_id'], '@airbnb.com') !== false) {
            $event['source'] = 'airbnb';
            // Only replace the label if it doesn't already say Airbnb - a
            // config named e.g. "Airbnb Calendar (Room 103)" is more useful
            // than flattening it down to the bare word "Airbnb".
            if (stripos($event['source_label'], 'airbnb') === false) {
                $event['source_label'] = 'Airbnb';
            }
        }
    }

    /**
     * Every unconverted OTA block, across every property/tenant, whose date
     * range has already begun - present (guest may be in-house right now
     * with zero booking record) or fully past (guest already left, still
     * never recorded) - used by the dashboard's "System Alerts" panel
     * (client-side, filtered from the same getBlockedDates() data a
     * property already fetches) and by
     * php/cron/check_unconverted_ota_bookings.php (which needs the
     * cross-property view this gives, unlike getBlockedDates()'s
     * single-property scope).
     *
     * Deliberately excludes purely-future blocks (event_start > now) - those
     * don't need attention yet, there's still time before the guest arrives.
     * Reuses the same "unclaimed" definition as getBlockedDates() (a guests
     * row exists claiming the external_event_id) - nothing here needs its
     * own separate "not converted" check.
     */
    public function getUnconvertedDueBlocks(): array {
        try {
            $query = "SELECT e.event_start, e.event_end, e.event_title, e.event_data, e.external_event_id,
                             c.property_id as room_id, c.service_type, c.service_name,
                             p.name as room_name, parent.name as parent_name
                     FROM ical_synced_events e
                     JOIN ical_sync_configs c ON e.sync_config_id = c.id
                     JOIN properties p ON p.id = c.property_id
                     LEFT JOIN properties parent ON parent.id = p.parent_property_id
                     WHERE e.sync_status = 'synced'
                     AND e.event_start <= NOW()
                     AND NOT EXISTS (
                         SELECT 1 FROM guests g
                         WHERE g.ical_external_event_id = e.external_event_id
                         AND (g.room_id = c.property_id OR g.property_id = c.property_id)
                     )
                     ORDER BY e.event_start ASC";

            $stmt = $this->pdo->query($query);
            $events = $stmt->fetchAll();

            $today = date('Y-m-d');
            foreach ($events as &$event) {
                $this->annotateEventSource($event);
                $endDate = substr($event['event_end'], 0, 10);
                $event['is_ongoing'] = $endDate >= $today;
                $event['days_overdue'] = $event['is_ongoing'] ? 0 : (int)floor((strtotime($today) - strtotime($endDate)) / 86400);
            }

            return ['status' => 'success', 'data' => $events];
        } catch (Exception $e) {
            return ['status' => 'error', 'message' => $e->getMessage()];
        }
    }

    /**
     * Self-healing create of the dedupe table
     * php/cron/check_unconverted_ota_bookings.php uses to avoid re-sending
     * the same Telegram alert every run - see that file. Not needed by any
     * HTTP action (the dashboard only reads getBlockedDates(), it never
     * writes here), so this is called explicitly (constructor-side self-heal
     * would add an extra isSchemaVerified() check to every single
     * get_blocked_dates/get_ical_syncs request for a table those requests
     * never touch) - once from the cron itself, and once from this file's
     * own HTTP dispatch below so it also self-heals the moment anyone opens
     * iCal Sync Manager, per CLAUDE.md's "Self-Healing DB Schema" rule,
     * rather than depending solely on the cron having run at least once.
     */
    public function ensureNotificationSchema(): void {
        require_once __DIR__ . '/../config/schema_cache.php';
        if (isSchemaVerified('schema_ota_unconverted_notifications')) return;
        try {
            $this->pdo->exec("
                CREATE TABLE IF NOT EXISTS `ota_unconverted_notifications` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `external_event_id` VARCHAR(255) NOT NULL,
                    `property_id` INT NOT NULL,
                    `first_detected_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    `last_notified_at` TIMESTAMP NULL,
                    `notify_count` INT NOT NULL DEFAULT 0,
                    UNIQUE KEY `unique_block_property` (`external_event_id`, `property_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");
            markSchemaVerified('schema_ota_unconverted_notifications');
        } catch (PDOException $e) {}
    }
}

// Only handle as an HTTP request when actually invoked over HTTP - the cron
// worker (php/cron/sync_all_icals.php) requires this file for the
// ICalSyncManager class definition alone and must not trigger this dispatch.
if (php_sapi_name() === 'cli') {
    return;
}

// SECURITY (11 Aug 2026): this endpoint is never routed through router.php, so it never got the
// property-ownership gate added there - it had ZERO auth check at all (confirmed live: a plain,
// cookie-less request returned another property's connected calendar feeds, including OTA sync
// config, in full). Session bootstrap must match router.php exactly so the same login cookie is
// recognized. Uses session_set_cookie_params() (27 Aug 2026, "remember me" fix - see router.php's
// fuller comment); database.php is already required above so APP_IS_LOCAL_ENV is available here.
ini_set('session.gc_maxlifetime', 86400 * 30);
session_set_cookie_params([
    'lifetime' => 86400 * 30,
    'path' => '/',
    'domain' => '',
    'secure' => !APP_IS_LOCAL_ENV,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_name('artists_farm_session');
session_start();
require_once __DIR__ . '/../security/access_control.php';

// Handle API requests
$action = $_GET['action'] ?? '';

// Get current property ID from request context
require_once __DIR__ . '/../config/property_resolver.php';
$currentPropertyId = getCurrentPropertyId($pdo);

if (empty($_SESSION['username'])) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['status' => 'error', 'message' => 'Authentication required.']);
    exit;
}
if (!isPropertyAccessAllowed($pdo, $currentPropertyId)) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['status' => 'error', 'message' => 'Access denied for this property.']);
    exit;
}

$manager = new ICalSyncManager($pdo);
// Self-heals the unconverted-OTA-notification dedupe table even if
// check_unconverted_ota_bookings.php's cron has never run on this
// environment yet - see ensureNotificationSchema()'s own doc comment.
$manager->ensureNotificationSchema();

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
