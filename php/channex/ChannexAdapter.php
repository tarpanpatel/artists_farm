<?php
/**
 * Channex Adapter Implementation
 *
 * Implements ChannelManagerAdapter for Channex.io.
 * Handles ARI push batching, payload formatting, minor-unit conversions,
 * range compression, and booking revision acknowledgements.
 */

require_once __DIR__ . '/ChannelManagerAdapter.php';
require_once __DIR__ . '/ChannexClient.php';
require_once __DIR__ . '/content_sync.php';

class ChannexAdapter implements ChannelManagerAdapter {
    private PDO $pdo;
    private ChannexClient $client;
    private ChannexContentSyncer $syncer;

    public function __construct(PDO $pdo, ?ChannexClient $client = null) {
        $this->pdo = $pdo;
        $this->client = $client ?? new ChannexClient();
        $this->syncer = new ChannexContentSyncer($this->pdo, $this->client);
        ensureChannexMappingsSchema($this->pdo);
    }

    public function syncContent(int $propertyId): array {
        return $this->syncer->syncProperty($propertyId);
    }

    public function pushAvailability(int $propertyId, ?int $roomId, array $ranges): array {
        $mapping = $this->getMapping($propertyId, $roomId);
        if (!$mapping) {
            $this->syncContent($propertyId);
            $mapping = $this->getMapping($propertyId, $roomId);
            if (!$mapping) {
                return ['success' => false, 'error' => "No Channex mapping found for property {$propertyId} room " . ($roomId ?: 'null')];
            }
        }

        $today = date('Y-m-d');
        $values = [];

        foreach ($ranges as $r) {
            $dFrom = max($today, $r['date_from']);
            $dTo = $r['date_to'];
            if ($dFrom > $dTo) continue;

            $values[] = [
                'property_id' => $mapping['channex_property_id'],
                'room_type_id' => $mapping['channex_room_type_id'],
                'date_from' => $dFrom,
                'date_to' => $dTo,
                'availability' => (int)($r['availability'] ?? 0),
            ];
        }

        if (empty($values)) {
            return ['success' => true, 'message' => 'No active future dates to push'];
        }

        return $this->client->post('availability', ['values' => $values]);
    }

    public function pushRestrictions(int $propertyId, ?int $roomId, array $restrictions): array {
        $mapping = $this->getMapping($propertyId, $roomId);
        if (!$mapping) {
            $this->syncContent($propertyId);
            $mapping = $this->getMapping($propertyId, $roomId);
            if (!$mapping) {
                return ['success' => false, 'error' => "No Channex mapping found for property {$propertyId} room " . ($roomId ?: 'null')];
            }
        }

        $today = date('Y-m-d');
        $values = [];

        foreach ($restrictions as $r) {
            $dFrom = max($today, $r['date_from']);
            $dTo = $r['date_to'];
            if ($dFrom > $dTo) continue;

            $item = [
                'property_id' => $mapping['channex_property_id'],
                'rate_plan_id' => $mapping['channex_rate_plan_id'],
                'date_from' => $dFrom,
                'date_to' => $dTo,
            ];

            if (isset($r['rate']) && $r['rate'] !== null) {
                $item['rate'] = (int)round($r['rate'] * 100); // minor units
            }
            if (isset($r['min_stay_arrival']) && $r['min_stay_arrival'] !== null) {
                $item['min_stay_arrival'] = (int)$r['min_stay_arrival'];
            }
            if (isset($r['min_stay_through']) && $r['min_stay_through'] !== null) {
                $item['min_stay_through'] = (int)$r['min_stay_through'];
            }
            if (isset($r['max_stay']) && $r['max_stay'] !== null) {
                $item['max_stay'] = (int)$r['max_stay'];
            }
            if (isset($r['stop_sell'])) {
                $item['stop_sell'] = (bool)$r['stop_sell'];
            }
            if (isset($r['closed_to_arrival'])) {
                $item['closed_to_arrival'] = (bool)$r['closed_to_arrival'];
            }
            if (isset($r['closed_to_departure'])) {
                $item['closed_to_departure'] = (bool)$r['closed_to_departure'];
            }

            $values[] = $item;
        }

        if (empty($values)) {
            return ['success' => true, 'message' => 'No active future dates to push'];
        }

        return $this->client->post('restrictions', ['values' => $values]);
    }

    public function acknowledgeRevision(string $revisionId): bool {
        if (empty($revisionId)) return false;
        $res = $this->client->post("booking_revisions/{$revisionId}/ack", []);
        return $res['success'] ?? false;
    }

    private function getMapping(int $propertyId, ?int $roomId): ?array {
        $stmt = $this->pdo->prepare("SELECT * FROM channex_mappings WHERE property_id = ? AND (room_id = ? OR (room_id IS NULL AND ? IS NULL)) LIMIT 1");
        $stmt->execute([$propertyId, $roomId, $roomId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
}
