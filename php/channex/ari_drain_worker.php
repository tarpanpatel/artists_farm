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

        // Bucket claimed rows by property_id, room_id, and kind first.
        $byKey = [];
        foreach ($claimedRows as $row) {
            $key = "{$row['property_id']}_" . ($row['room_id'] ?? '0') . "_{$row['kind']}";
            if (!isset($byKey[$key])) {
                $byKey[$key] = [
                    'property_id' => (int)$row['property_id'],
                    'room_id' => $row['room_id'] !== null ? (int)$row['room_id'] : null,
                    'kind' => $row['kind'],
                    'rows' => [],
                ];
            }
            $byKey[$key]['rows'][] = $row;
        }

        // Within each property/room/kind bucket, only coalesce rows whose
        // date ranges actually overlap or sit immediately adjacent (no gap)
        // into a single push - two edits to unrelated, far-apart dates must
        // never be merged into one API call that claims to cover the whole
        // span between them. A prior version took a blind min()/max() across
        // every pending row sharing the same key regardless of distance, so
        // an old leftover row (e.g. a stray test date) would silently widen
        // a brand-new, single-date edit into a multi-week range - exactly
        // the "update targets the wrong date range" failures Channex's
        // certification review caught on 31 Aug 2026.
        $grouped = [];
        foreach ($byKey as $bucket) {
            $rows = $bucket['rows'];
            usort($rows, fn($a, $b) => strcmp($a['date_from'], $b['date_from']));

            $cluster = null;
            foreach ($rows as $row) {
                $gapDays = $cluster === null ? null : (strtotime($row['date_from']) - strtotime($cluster['max_date'])) / 86400;
                if ($cluster !== null && $gapDays <= 1) {
                    if ($row['date_to'] > $cluster['max_date']) $cluster['max_date'] = $row['date_to'];
                    $cluster['row_ids'][] = (int)$row['id'];
                    if ((int)$row['attempts'] > $cluster['max_attempts']) $cluster['max_attempts'] = (int)$row['attempts'];
                    continue;
                }
                if ($cluster !== null) $grouped[] = $cluster;
                $cluster = [
                    'property_id' => $bucket['property_id'],
                    'room_id' => $bucket['room_id'],
                    'kind' => $bucket['kind'],
                    'min_date' => $row['date_from'],
                    'max_date' => $row['date_to'],
                    'row_ids' => [(int)$row['id']],
                    'max_attempts' => (int)$row['attempts'],
                ];
            }
            if ($cluster !== null) $grouped[] = $cluster;
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
                    $touchedFields = $this->computeTouchedFields($rowIds);
                    $compressedRestrictions = $this->computeCompressedRestrictions($propId, $roomId, $startDate, $endDate, $touchedFields);
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

                    // Guaranteed-visibility rate push alert (4 Sep 2026, see
                    // recordRatePushAlert()'s own doc comment in outbox.php) -
                    // every rate/restriction push that actually reaches
                    // Channex gets recorded here, regardless of what enqueued
                    // it, so the app can prompt the user about it on next
                    // load even when the trigger was a script run directly
                    // against the server, not a confirm()'d UI action.
                    if ($kind !== 'availability' && function_exists('recordRatePushAlert')) {
                        recordRatePushAlert($this->pdo, $propId, $roomId, $startDate, $endDate);
                    }
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
     * Whether $scopeId (a room's own `properties` row when it's a
     * MULTI_KEY_ROOM, otherwise the property itself) has Dynamic Rules
     * pricing mode active. "Flat Base Rate" suspends every saved rate rule
     * for that scope - not just its displayed rate, but what actually gets
     * pushed to Airbnb/Booking.com too (added 4 Sep 2026 - the toggle used
     * to only affect the owner's own internal calendar display, so a rule
     * saved while "flat" was selected was silently still live on every OTA
     * and the public availability page; same fix in availability.php).
     */
    private function isDynamicPricingMode(int $scopeId): bool {
        $stmt = $this->pdo->prepare("SELECT pricing_mode FROM properties WHERE id = ?");
        $stmt->execute([$scopeId]);
        return $stmt->fetchColumn() === 'variable';
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

        // Fetch stop_sell rules - only while this scope is actually in
        // Dynamic Rules mode (see isDynamicPricingMode() above).
        if ($this->isDynamicPricingMode($scopeId)) {
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
     * Looks up which rate/restriction fields the outbox rows being drained
     * actually changed (stored by saveRateRule()/deleteRateRule() as
     * `changed_fields` on the outbox payload - see computeChannexFieldDiff()
     * in outbox.php), so the push can be scoped to just those fields instead
     * of always re-sending the full rate+restrictions state. Returns null
     * (meaning "all fields") for rows that predate that payload key or that
     * intentionally want the complete state - e.g. the Full Sync path
     * (channex_push_ari's manual_push_ari rows), which Channex's
     * certification review expects to declare every supported restriction
     * type explicitly rather than omit unset ones.
     */
    private function computeTouchedFields(array $rowIds): ?array {
        if (empty($rowIds)) return null;
        $placeholders = implode(',', array_fill(0, count($rowIds), '?'));
        $stmt = $this->pdo->prepare("SELECT payload FROM channex_outbox WHERE id IN ($placeholders)");
        $stmt->execute($rowIds);

        $allFields = ['rate_per_night', 'min_stay_arrival', 'min_stay_through', 'max_stay', 'stop_sell', 'closed_to_arrival', 'closed_to_departure'];
        $touched = [];
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $json) {
            $payload = $json ? json_decode($json, true) : null;
            if (!is_array($payload) || !isset($payload['changed_fields']) || !is_array($payload['changed_fields'])) {
                return null; // old-format or full-sync row present - push everything
            }
            foreach ($payload['changed_fields'] as $f) {
                if (in_array($f, $allFields, true)) $touched[$f] = true;
            }
        }
        return array_keys($touched);
    }

    /**
     * Compute compressed rate & restriction ranges for a date span, scoped
     * to $touchedFields (null = every field, used for full syncs).
     */
    public function computeCompressedRestrictions(int $propertyId, ?int $roomId, string $startDate, string $endDate, ?array $touchedFields = null): array {
        $scopeId = $roomId ?: $propertyId;
        $allFields = ['rate_per_night', 'min_stay_arrival', 'min_stay_through', 'max_stay', 'stop_sell', 'closed_to_arrival', 'closed_to_departure'];
        $fields = $touchedFields === null ? $allFields : array_values(array_intersect($allFields, $touchedFields));
        if (empty($fields)) $fields = $allFields; // never silently push nothing
        $includeRate = in_array('rate_per_night', $fields, true);

        // Base rate (only needed if this push actually includes rate)
        $baseTariff = 3500.0;
        if ($includeRate) {
            $propStmt = $this->pdo->prepare("SELECT default_tariff FROM properties WHERE id = ?");
            $propStmt->execute([$scopeId]);
            $baseTariff = (float)($propStmt->fetchColumn() ?: 3500);
        }

        // Fetch rules - only while this scope is actually in Dynamic Rules
        // mode. "Flat Base Rate" means every day below falls through to the
        // base tariff with no restrictions, same as if no rule existed.
        $rules = [];
        if ($this->isDynamicPricingMode($scopeId)) {
            $stmt = $this->pdo->prepare("
                SELECT *
                FROM room_rate_rules
                WHERE (room_id = ? OR (room_id IS NULL AND property_id = ?))
                  AND start_date <= ? AND end_date >= ?
                ORDER BY room_id DESC, created_at DESC
            ");
            $stmt->execute([$scopeId, $scopeId, $endDate, $startDate]);
            $rules = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

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

        // Build daily state - only the touched fields are set on each day,
        // so a rate-only push never carries stop_sell/closed_to_arrival/etc.
        $cur = strtotime($startDate);
        $end = strtotime($endDate);
        $daily = [];
        while ($cur <= $end) {
            $dStr = date('Y-m-d', $cur);
            $rule = $rulesByDate[$dStr] ?? null;
            $state = [];
            if ($includeRate) {
                $state['rate'] = $rule && $rule['rate_per_night'] !== null ? (float)$rule['rate_per_night'] : $baseTariff;
            }
            // Channex's restrictions endpoint rejects an included min_stay_arrival/
            // min_stay_through/max_stay key that's null ("should be a non null
            // value" - confirmed live 31 Aug 2026: a null-valued key produced a
            // validation warning AND Channex silently returned no task object at
            // all, so the push had no evidence to point to). 1/1/0 is the
            // "no restriction" baseline instead of null - min_stay fields are
            // documented as positive integers (a 1-night minimum is really no
            // restriction), max_stay is documented as non-negative, and 0 as
            // "no cap" cleared the warning in that same live test.
            if (in_array('min_stay_arrival', $fields, true)) {
                $state['min_stay_arrival'] = $rule && $rule['min_stay_arrival'] ? (int)$rule['min_stay_arrival'] : 1;
            }
            if (in_array('min_stay_through', $fields, true)) {
                $state['min_stay_through'] = $rule && $rule['min_stay_through'] ? (int)$rule['min_stay_through'] : 1;
            }
            if (in_array('max_stay', $fields, true)) {
                $state['max_stay'] = $rule && $rule['max_stay'] ? (int)$rule['max_stay'] : 0;
            }
            if (in_array('stop_sell', $fields, true)) {
                $state['stop_sell'] = $rule ? (bool)$rule['stop_sell'] : false;
            }
            if (in_array('closed_to_arrival', $fields, true)) {
                $state['closed_to_arrival'] = $rule ? (bool)$rule['closed_to_arrival'] : false;
            }
            if (in_array('closed_to_departure', $fields, true)) {
                $state['closed_to_departure'] = $rule ? (bool)$rule['closed_to_departure'] : false;
            }
            $daily[$dStr] = $state;
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
