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

        $res = $this->client->post('availability', ['values' => $values]);
        if (!empty($res['data']) && is_array($res['data']) && isset($res['data'][0]['id'])) {
            $res['task_id'] = $res['data'][0]['id'];
        }
        return $res;
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
                'property_id' => $r['channex_property_id'] ?? $mapping['channex_property_id'],
                'rate_plan_id' => $r['rate_plan_id'] ?? ($r['channex_rate_plan_id'] ?? $mapping['channex_rate_plan_id']),
                'date_from' => $dFrom,
                'date_to' => $dTo,
            ];

            // array_key_exists, not isset(): AriDrainWorker::computeCompressedRestrictions()
            // only sets keys for fields this push actually touches, so a key's
            // presence (even holding null, e.g. an unset min_stay on a full
            // sync) is itself the signal to include it - isset() would drop
            // null-valued keys and silently break the full-sync case, which
            // needs every declared restriction type present explicitly.
            if (array_key_exists('rate', $r)) {
                $item['rate'] = $r['rate'] !== null ? (int)round($r['rate'] * 100) : null; // minor units
            }
            if (array_key_exists('min_stay_arrival', $r)) {
                $item['min_stay_arrival'] = $r['min_stay_arrival'] !== null ? (int)$r['min_stay_arrival'] : null;
            }
            if (array_key_exists('min_stay_through', $r)) {
                $item['min_stay_through'] = $r['min_stay_through'] !== null ? (int)$r['min_stay_through'] : null;
            }
            if (array_key_exists('max_stay', $r)) {
                $item['max_stay'] = $r['max_stay'] !== null ? (int)$r['max_stay'] : null;
            }
            if (array_key_exists('stop_sell', $r)) {
                $item['stop_sell'] = (bool)$r['stop_sell'];
            }
            if (array_key_exists('closed_to_arrival', $r)) {
                $item['closed_to_arrival'] = (bool)$r['closed_to_arrival'];
            }
            if (array_key_exists('closed_to_departure', $r)) {
                $item['closed_to_departure'] = (bool)$r['closed_to_departure'];
            }

            $values[] = $item;
        }

        if (empty($values)) {
            return ['success' => true, 'message' => 'No active future dates to push'];
        }

        $res = $this->client->post('restrictions', ['values' => $values]);
        if (!empty($res['data']) && is_array($res['data']) && isset($res['data'][0]['id'])) {
            $res['task_id'] = $res['data'][0]['id'];
        }
        return $res;
    }

    public function acknowledgeRevision(string $revisionId): bool {
        if (empty($revisionId)) return false;
        $res = $this->client->post("booking_revisions/{$revisionId}/ack", []);
        return $res['success'] ?? false;
    }

    public function getClient(): ChannexClient {
        return $this->client;
    }

    public function registerWebhook(?string $callbackUrl = null, ?string $channexPropertyId = null): array {
        $cfgPath = __DIR__ . '/../config/channex_config.json';
        $cfg = is_file($cfgPath) ? (json_decode(file_get_contents($cfgPath), true) ?: []) : [];
        $secret = (string)($cfg['webhook_secret'] ?? '');

        if (!$callbackUrl) {
            $callbackUrl = (string)($cfg['webhook_callback_url'] ?? 'https://staging.ground-code.com/php/api/router.php?action=channex_webhook');
        }

        // Check existing webhooks to ensure idempotency
        $existing = $this->client->get('webhooks');
        $existingList = $existing['data'] ?? [];
        foreach ($existingList as $item) {
            $attrs = $item['attributes'] ?? [];
            if (($attrs['callback_url'] ?? '') === $callbackUrl) {
                return ['success' => true, 'data' => $item, 'action' => 'already_registered'];
            }
        }

        $payload = [
            'webhook' => [
                'callback_url' => $callbackUrl,
                'event_mask' => 'booking_new;booking_modification;booking_cancellation',
                'is_active' => true,
                'send_data' => true,
                'headers' => [
                    'X-Channex-Webhook-Secret' => $secret
                ]
            ]
        ];
        if ($channexPropertyId) {
            $payload['webhook']['property_id'] = $channexPropertyId;
        }

        return $this->client->post('webhooks', $payload);
    }

    private function getMapping(int $propertyId, ?int $roomId): ?array {
        if ($roomId === null) {
            $stmt = $this->pdo->prepare("SELECT * FROM channex_mappings WHERE property_id = ? AND room_id IS NULL LIMIT 1");
            $stmt->execute([$propertyId]);
        } else {
            $stmt = $this->pdo->prepare("SELECT * FROM channex_mappings WHERE property_id = ? AND room_id = ? LIMIT 1");
            $stmt->execute([$propertyId, $roomId]);
        }
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
}
