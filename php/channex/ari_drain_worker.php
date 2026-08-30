<?php
/**
 * Outbox Drain Worker & ARI Range Compressor
 *
 * Processes pending items from channex_outbox, coalesces overlapping/adjacent ranges,
 * compresses contiguous dates into date_from/date_to ranges, and pushes to Channex.
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/outbox.php';
require_once __DIR__ . '/ChannexAdapter.php';

class AriDrainWorker {
    private PDO $pdo;
    private ChannexAdapter $adapter;

    public function __construct(PDO $pdo, ?ChannexAdapter $adapter = null) {
        $this->pdo = $pdo;
        $this->adapter = $adapter ?? new ChannexAdapter($this->pdo);
        ensureChannexOutboxSchema($this->pdo);
    }

    /**
     * Run a single drain cycle.
     *
     * @param int $limit Max rows to claim per cycle
     * @param int[]|null $specificIds Optional list of specific outbox row IDs to claim
     * @return array Summary of processed items
     */
    public function processBatch(int $limit = 50, ?array $specificIds = null): array {
        // Claim pending rows
        $this->pdo->beginTransaction();

        if (!empty($specificIds)) {
            $cleanIds = array_values(array_filter(array_map('intval', $specificIds), fn($id) => $id > 0));
            if (empty($cleanIds)) {
                $this->pdo->commit();
                return ['processed' => 0, 'groups' => 0];
            }
            $idPlaceholders = implode(',', array_fill(0, count($cleanIds), '?'));
            $claimStmt = $this->pdo->prepare("
                SELECT id, property_id, room_id, kind, date_from, date_to, attempts
                FROM channex_outbox
                WHERE id IN ($idPlaceholders)
                ORDER BY id ASC
                FOR UPDATE
            ");
            $claimStmt->execute($cleanIds);
        } else {
            $claimStmt = $this->pdo->prepare("
                SELECT id, property_id, room_id, kind, date_from, date_to, attempts
                FROM channex_outbox
                WHERE status = 'pending'
                   OR (status = 'failed' AND next_attempt_at IS NOT NULL AND next_attempt_at <= NOW())
                   OR (status = 'sending' AND created_at < NOW() - INTERVAL 5 MINUTE)
                ORDER BY id ASC
                LIMIT ?
                FOR UPDATE
            ");
            $claimStmt->bindValue(1, $limit, PDO::PARAM_INT);
            $claimStmt->execute();
        }

        $claimedRows = $claimStmt->fetchAll(PDO::FETCH_ASSOC);

        if (empty($claimedRows)) {
            $this->pdo->commit();
            return ['processed' => 0, 'groups' => 0];
        }

        $rowIds = array_column($claimedRows, 'id');
        $idPlaceholders = implode(',', array_fill(0, count($rowIds), '?'));
        $updateStmt = $this->pdo->prepare("UPDATE channex_outbox SET status = 'sending' WHERE id IN ($idPlaceholders)");
        $updateStmt->execute($rowIds);
        $this->pdo->commit();

        // Group claimed rows by property_id, room_id, and kind
        $grouped = [];
        foreach ($claimedRows as $row) {
            $key = "{$row['property_id']}_" . ($row['room_id'] ?? '0') . "_{$row['kind']}";
            if (!isset($grouped[$key])) {
                $grouped[$key] = [
                    'property_id' => (int)$row['property_id'],
                    'room_id' => $row['room_id'] !== null ? (int)$row['room_id'] : null,
                    'kind' => $row['kind'],
                    'min_date' => $row['date_from'],
                    'max_date' => $row['date_to'],
                    'row_ids' => [],
                    'max_attempts' => 0,
                ];
            }
            if ($row['date_from'] < $grouped[$key]['min_date']) $grouped[$key]['min_date'] = $row['date_from'];
            if ($row['date_to'] > $grouped[$key]['max_date']) $grouped[$key]['max_date'] = $row['date_to'];
            $grouped[$key]['row_ids'][] = (int)$row['id'];
            if ($row['attempts'] > $grouped[$key]['max_attempts']) $grouped[$key]['max_attempts'] = (int)$row['attempts'];
        }

        $today = date('Y-m-d');
        $processedCount = 0;

        foreach ($grouped as $group) {
            $propId = $group['property_id'];
            $roomId = $group['room_id'];
            $kind = $group['kind'];
            $startDate = max($today, $group['min_date']);
            $endDate = max($startDate, $group['max_date']);
            $rowIds = $group['row_ids'];
            $attempts = $group['max_attempts'] + 1;

            try {
                if ($kind === 'availability') {
                    $compressedRanges = $this->computeCompressedAvailability($propId, $roomId, $startDate, $endDate);
                    $res = $this->adapter->pushAvailability($propId, $roomId, $compressedRanges);
                } else {
                    $compressedRestrictions = $this->computeCompressedRestrictions($propId, $roomId, $startDate, $endDate);
                    $res = $this->adapter->pushRestrictions($propId, $roomId, $compressedRestrictions);
                }

                if (!empty($res['success'])) {
                    // Channex answers an ARI push with an async task object -
                    // {"data":[{"id":"<task uuid>","type":"task"}]} - and that id
                    // is the only handle on whether the update actually applied
                    // (GET /tasks/{id} reports completed/failed plus per-record
                    // counts). It is also what the certification reviewers look
                    // up in their own logs for scenarios 1-6, so a push whose
                    // task id was discarded cannot be evidenced afterwards.
                    $taskId = $res['data'][0]['id'] ?? ($res['task_id'] ?? null);
                    $this->markRowsDone($rowIds, $taskId);
                    $processedCount += count($rowIds);
                } else {
                    $this->markRowsFailed($rowIds, $attempts, json_encode($res['error'] ?? 'API reject'));
                }
            } catch (Exception $e) {
                $this->markRowsFailed($rowIds, $attempts, $e->getMessage());
            }
        }

        return ['processed' => $processedCount, 'groups' => count($grouped)];
    }

    /**
     * Compute compressed availability ranges for a date span.
     */
    public function computeCompressedAvailability(int $propertyId, ?int $roomId, string $startDate, string $endDate): array {
        // Fetch active bookings and hold blocks
        $scopeId = $roomId ?: $propertyId;
        $stmt = $this->pdo->prepare("
            SELECT checkin_date, expected_checkout
            FROM guests
            WHERE (room_id = ? OR (room_id IS NULL AND property_id = ?))
              AND status IN ('Booked', 'Active', 'CheckedIn')
              AND checkin_date <= ? AND expected_checkout >= ?
        ");
        $stmt->execute([$scopeId, $scopeId, $endDate . ' 23:59:59', $startDate . ' 00:00:00']);
        $bookings = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $bookedDays = [];
        foreach ($bookings as $b) {
            $cur = strtotime(substr($b['checkin_date'], 0, 10));
            $end = strtotime(substr($b['expected_checkout'], 0, 10));
            while ($cur < $end) {
                $bookedDays[date('Y-m-d', $cur)] = true;
                $cur = strtotime('+1 day', $cur);
            }
        }

        // Fetch stop_sell rules
        $ruleStmt = $this->pdo->prepare("
            SELECT start_date, end_date, stop_sell
            FROM room_rate_rules
            WHERE (room_id = ? OR (room_id IS NULL AND property_id = ?))
              AND stop_sell = 1
              AND start_date <= ? AND end_date >= ?
        ");
        $ruleStmt->execute([$scopeId, $scopeId, $endDate, $startDate]);
        foreach ($ruleStmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $cur = strtotime($r['start_date']);
            $end = strtotime($r['end_date']);
            while ($cur <= $end) {
                $bookedDays[date('Y-m-d', $cur)] = true;
                $cur = strtotime('+1 day', $cur);
            }
        }

        // Generate daily state
        $cur = strtotime($startDate);
        $end = strtotime($endDate);
        $daily = [];
        while ($cur <= $end) {
            $dStr = date('Y-m-d', $cur);
            $daily[$dStr] = isset($bookedDays[$dStr]) ? 0 : 1;
            $cur = strtotime('+1 day', $cur);
        }

        // Run-length range compression
        return $this->compressDailyValues($daily, 'availability');
    }

    /**
     * Compute compressed rate & restriction ranges for a date span.
     */
    public function computeCompressedRestrictions(int $propertyId, ?int $roomId, string $startDate, string $endDate): array {
        $scopeId = $roomId ?: $propertyId;

        // Base rate
        $propStmt = $this->pdo->prepare("SELECT default_tariff FROM properties WHERE id = ?");
        $propStmt->execute([$scopeId]);
        $baseTariff = (float)($propStmt->fetchColumn() ?: 3500);

        // Fetch rules
        $stmt = $this->pdo->prepare("
            SELECT *
            FROM room_rate_rules
            WHERE (room_id = ? OR (room_id IS NULL AND property_id = ?))
              AND start_date <= ? AND end_date >= ?
            ORDER BY room_id DESC, created_at DESC
        ");
        $stmt->execute([$scopeId, $scopeId, $endDate, $startDate]);
        $rules = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $rulesByDate = [];
        foreach ($rules as $r) {
            $cur = strtotime($r['start_date']);
            $end = strtotime($r['end_date']);
            while ($cur <= $end) {
                $dStr = date('Y-m-d', $cur);
                if (!isset($rulesByDate[$dStr])) {
                    $rulesByDate[$dStr] = $r;
                }
                $cur = strtotime('+1 day', $cur);
            }
        }

        // Build daily state
        $cur = strtotime($startDate);
        $end = strtotime($endDate);
        $daily = [];
        while ($cur <= $end) {
            $dStr = date('Y-m-d', $cur);
            $rule = $rulesByDate[$dStr] ?? null;
            $daily[$dStr] = [
                'rate' => $rule && $rule['rate_per_night'] !== null ? (float)$rule['rate_per_night'] : $baseTariff,
                'min_stay_arrival' => $rule ? ($rule['min_stay_arrival'] ? (int)$rule['min_stay_arrival'] : null) : null,
                'min_stay_through' => $rule ? ($rule['min_stay_through'] ? (int)$rule['min_stay_through'] : null) : null,
                'max_stay' => $rule ? ($rule['max_stay'] ? (int)$rule['max_stay'] : null) : null,
                'stop_sell' => $rule ? (bool)$rule['stop_sell'] : false,
                'closed_to_arrival' => $rule ? (bool)$rule['closed_to_arrival'] : false,
                'closed_to_departure' => $rule ? (bool)$rule['closed_to_departure'] : false,
            ];
            $cur = strtotime('+1 day', $cur);
        }

        // Run-length compression on composite restriction state
        $ranges = [];
        $rangeStart = null;
        $prevDate = null;
        $prevState = null;

        foreach ($daily as $dStr => $state) {
            if ($rangeStart === null) {
                $rangeStart = $dStr;
                $prevDate = $dStr;
                $prevState = $state;
                continue;
            }

            if ($state === $prevState) {
                $prevDate = $dStr;
            } else {
                $ranges[] = array_merge(['date_from' => $rangeStart, 'date_to' => $prevDate], $prevState);
                $rangeStart = $dStr;
                $prevDate = $dStr;
                $prevState = $state;
            }
        }

        if ($rangeStart !== null) {
            $ranges[] = array_merge(['date_from' => $rangeStart, 'date_to' => $prevDate], $prevState);
        }

        return $ranges;
    }

    /**
     * Generic run-length range compressor for scalar daily values.
     */
    private function compressDailyValues(array $daily, string $valueKey): array {
        $ranges = [];
        $rangeStart = null;
        $prevDate = null;
        $prevVal = null;

        foreach ($daily as $dStr => $val) {
            if ($rangeStart === null) {
                $rangeStart = $dStr;
                $prevDate = $dStr;
                $prevVal = $val;
                continue;
            }

            if ($val === $prevVal) {
                $prevDate = $dStr;
            } else {
                $ranges[] = [
                    'date_from' => $rangeStart,
                    'date_to' => $prevDate,
                    $valueKey => $prevVal,
                ];
                $rangeStart = $dStr;
                $prevDate = $dStr;
                $prevVal = $val;
            }
        }

        if ($rangeStart !== null) {
            $ranges[] = [
                'date_from' => $rangeStart,
                'date_to' => $prevDate,
                $valueKey => $prevVal,
            ];
        }

        return $ranges;
    }

    private function markRowsDone(array $rowIds, ?string $taskId = null): void {
        if (empty($rowIds)) return;
        $placeholders = implode(',', array_fill(0, count($rowIds), '?'));
        $stmt = $this->pdo->prepare("UPDATE channex_outbox SET status = 'done', task_id = ?, last_error = NULL WHERE id IN ($placeholders)");
        $stmt->execute(array_merge([$taskId], $rowIds));
    }

    private function markRowsFailed(array $rowIds, int $attempts, string $error): void {
        if (empty($rowIds)) return;
        $status = $attempts >= 5 ? 'failed' : 'pending';
        $backoffMinutes = (int)pow(2, min($attempts, 6)); // 2, 4, 8, 16, 32 mins
        $nextAttempt = date('Y-m-d H:i:s', strtotime("+{$backoffMinutes} minutes"));

        $placeholders = implode(',', array_fill(0, count($rowIds), '?'));
        $stmt = $this->pdo->prepare("
            UPDATE channex_outbox
            SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ?
            WHERE id IN ($placeholders)
        ");
        $stmt->execute(array_merge([$status, $attempts, $nextAttempt, substr($error, 0, 1000)], $rowIds));
    }
}
