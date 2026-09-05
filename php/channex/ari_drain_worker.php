<?php
/**
 * Outbox Drain Worker & ARI Range Compressor
 *
 * Processes pending items from channex_outbox, coalesces overlapping/adjacent ranges,
 * compresses contiguous dates into date_from/date_to ranges, and pushes to Channex.
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/guest_status.php';
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

            // Expand a property-wide row (room_id NULL) into its real rooms.
            //
            // ADDED 5 Sep 2026. The 3 Sep fix taught the ENQUEUE side to do
            // this (getChannexPushRoomIds() in rate_rules.php / router.php)
            // but the drain worker never learned it, so any row that reached
            // the outbox with room_id NULL against a MULTI_KEY property went
            // straight to getMapping($propId, null), found nothing (mappings
            // are per child room), and failed - forever, since retrying
            // changes nothing about the row. Found live with 23 such rows on
            // staging, one of them on its 74th identical attempt. Fixing only
            // the enqueue side left the failure mode fully armed for any
            // future code path that forgets; this closes it at the one place
            // every push has to pass through. Single-unit properties are
            // unaffected: getChannexPushRoomIds() returns [null] for them,
            // which is exactly the old behaviour.
            $pushRoomIds = [$roomId];
            if ($roomId === null && function_exists('getChannexPushRoomIds')) {
                $pushRoomIds = getChannexPushRoomIds($this->pdo, $propId);
            }

            try {
                $res = null;
                $errors = [];
                $taskIds = [];
                $sentSomething = false;

                foreach ($pushRoomIds as $pushRoomId) {
                    if ($kind === 'availability') {
                        $compressedRanges = $this->computeCompressedAvailability($propId, $pushRoomId, $startDate, $endDate);
                        $one = $this->adapter->pushAvailability($propId, $pushRoomId, $compressedRanges);
                    } else {
                        $touchedFields = $this->computeTouchedFields($rowIds);
                        $compressedRestrictions = $this->computeCompressedRestrictions($propId, $pushRoomId, $startDate, $endDate, $touchedFields);
                        $one = $this->adapter->pushRestrictions($propId, $pushRoomId, $compressedRestrictions);
                    }

                    if (empty($one['success'])) {
                        $errors[] = ($pushRoomId ?? 'property') . ': ' . json_encode($one['error'] ?? 'API reject');
                        continue;
                    }
                    // A no-op ("nothing to send for these dates") is a success
                    // but is NOT a push - see the adapter's no_op flag. Only a
                    // real API call counts towards "something reached Channex",
                    // which is what the rate-push alert below is reporting on.
                    if (empty($one['no_op'])) {
                        $sentSomething = true;
                    }
                    $tid = $one['data'][0]['id'] ?? ($one['task_id'] ?? null);
                    if ($tid) $taskIds[] = $tid;
                }

                // All-or-nothing: one room failing must not mark the row done,
                // or the remaining rooms are silently never retried.
                $res = empty($errors)
                    ? ['success' => true, 'task_id' => $taskIds ? implode(',', $taskIds) : null]
                    : ['success' => false, 'error' => implode(' | ', $errors)];

                if (!empty($res['success'])) {
                    // Channex answers an ARI push with an async task object -
                    // {"data":[{"id":"<task uuid>","type":"task"}]} - and that id
                    // is the only handle on whether the update actually applied
                    // (GET /tasks/{id} reports completed/failed plus per-record
                    // counts). It is also what the certification reviewers look
                    // up in their own logs for scenarios 1-6, so a push whose
                    // task id was discarded cannot be evidenced afterwards.
                    $taskId = $res['task_id'] ?? null;
                    $this->markRowsDone(
                        $rowIds,
                        $taskId,
                        $sentSomething ? null : 'No-op: nothing to send for these dates (no API call made)'
                    );
                    $processedCount += count($rowIds);

                    // Guaranteed-visibility rate push alert (4 Sep 2026, see
                    // recordRatePushAlert()'s own doc comment in outbox.php) -
                    // every rate/restriction push that actually reaches
                    // Channex gets recorded here, regardless of what enqueued
                    // it, so the app can prompt the user about it on next
                    // load even when the trigger was a script run directly
                    // against the server, not a confirm()'d UI action.
                    if ($kind !== 'availability' && $sentSomething && function_exists('recordRatePushAlert')) {
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
        // Occupancy statuses come from guestOccupyingStatuses() - this was a
        // hardcoded IN ('Booked', 'Active', 'CheckedIn') that missed the real
        // 'Checked In' spelling, so an in-house guest's room was computed as
        // free and pushed to the OTAs as bookable. See guest_status.php.
        $occupying = guestOccupyingStatuses();
        $stmt = $this->pdo->prepare("
            SELECT checkin_date, expected_checkout
            FROM guests
            WHERE (room_id = ? OR (room_id IS NULL AND property_id = ?))
              AND status IN (" . guestOccupyingStatusPlaceholders() . ")
              AND checkin_date <= ? AND expected_checkout >= ?
        ");
        $stmt->execute(array_merge(
            [$scopeId, $scopeId],
            $occupying,
            [$endDate . ' 23:59:59', $startDate . ' 00:00:00']
        ));
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
     *
     * Day-of-week scoped rules (4 Sep 2026, "Monday to Friday 3000,
     * Saturday and Sunday 4000" - room_rate_rules.days_of_week) are pushed
     * as ONE value per rule, covering that rule's full claimed date span
     * with Channex's own `days` param set - NOT flattened into the ordinary
     * per-day run-length compression below. A plain day-by-day compression
     * only merges literally-adjacent identical days, so an alternating
     * weekday/weekend pattern spanning months would fragment into one tiny
     * range PER CALENDAR WEEK (dozens of API values for a single recurring
     * pattern) - exactly the "separate API calls where one range update
     * would do" anti-fail Channex's own certification review flags, and
     * needlessly burns their 10-requests/minute-per-property limit. Any day
     * NOT claimed by a day-of-week-scoped rule (an unscoped rule, or no
     * rule at all) still goes through the original adjacency compression
     * unchanged.
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

        // Channex's own 2-letter day codes - shared vocabulary with
        // room_rate_rules.days_of_week (see rate_rules.php's saveRateRule())
        // and availability.php's own identical mapping for display.
        $dayCodeByIso = [1 => 'mo', 2 => 'tu', 3 => 'we', 4 => 'th', 5 => 'fr', 6 => 'sa', 7 => 'su'];

        $rulesByDate = [];
        foreach ($rules as $r) {
            $ruleDays = !empty($r['days_of_week']) ? explode(',', $r['days_of_week']) : null;
            $cur = strtotime($r['start_date']);
            $end = strtotime($r['end_date']);
            while ($cur <= $end) {
                $dStr = date('Y-m-d', $cur);
                if ($ruleDays === null || in_array($dayCodeByIso[(int)date('N', $cur)], $ruleDays, true)) {
                    if (!isset($rulesByDate[$dStr])) {
                        $rulesByDate[$dStr] = $r;
                    }
                }
                $cur = strtotime('+1 day', $cur);
            }
        }

        // Build daily state - only the touched fields are set on each day,
        // so a rate-only push never carries stop_sell/closed_to_arrival/etc.
        // Also tracks which rule (if any) claimed each day and whether that
        // rule is day-of-week scoped, for the split below.
        $cur = strtotime($startDate);
        $end = strtotime($endDate);
        $daily = [];
        $dailyScopedRuleId = []; // dStr => rule id, only set when that rule has days_of_week
        $dailyScopedRuleDays = []; // dStr => that rule's days_of_week array
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
            if ($rule && !empty($rule['days_of_week'])) {
                $dailyScopedRuleId[$dStr] = (int)$rule['id'];
                $dailyScopedRuleDays[$dStr] = explode(',', $rule['days_of_week']);
            }
            $cur = strtotime('+1 day', $cur);
        }

        $ranges = [];

        // Split off day-of-week scoped days, grouped by rule id, each
        // becoming exactly one push value with `days` set - regardless of
        // how many separate weeks it spans.
        $datesByScopedRule = [];
        $unscopedDaily = [];
        foreach ($daily as $dStr => $state) {
            if (isset($dailyScopedRuleId[$dStr])) {
                $datesByScopedRule[$dailyScopedRuleId[$dStr]][] = $dStr;
            } else {
                $unscopedDaily[$dStr] = $state;
            }
        }

        foreach ($datesByScopedRule as $ruleId => $dates) {
            sort($dates);
            $first = $dates[0];
            $last = $dates[count($dates) - 1];
            $range = array_merge(['date_from' => $first, 'date_to' => $last], $daily[$first]);
            $range['days'] = $dailyScopedRuleDays[$first];
            $ranges[] = $range;
        }

        // Run-length compression on the remaining (unscoped) composite
        // restriction state. Requires an explicit calendar-adjacency check
        // now (strtotime($dStr) - strtotime($prevDate) === 1 day), not just
        // "is the next array entry" - $unscopedDaily can have gaps where a
        // day-of-week-scoped rule above already claimed a date, so two
        // identical-state days a week apart must NOT be merged into one
        // range that would wrongly also cover the scoped days in between.
        $rangeStart = null;
        $prevDate = null;
        $prevState = null;

        foreach ($unscopedDaily as $dStr => $state) {
            $isAdjacent = $prevDate !== null && strtotime($dStr) === strtotime($prevDate) + 86400;
            if ($rangeStart === null) {
                $rangeStart = $dStr;
                $prevDate = $dStr;
                $prevState = $state;
                continue;
            }

            if ($isAdjacent && $state === $prevState) {
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

    /**
     * $note records WHY a row finished without a Channex task id - currently
     * only "nothing needed sending". Written into last_error, which is
     * otherwise NULL on a done row, so it reads as a footnote rather than a
     * failure. Added 5 Sep 2026: a rates row was found marked done with an
     * empty task_id and there was no way to tell "no dates to send" apart from
     * "sent, receipt lost", which took a live cross-check against the OTA's own
     * listing to resolve. A done row should always say which of the two it was.
     */
    private function markRowsDone(array $rowIds, ?string $taskId = null, ?string $note = null): void {
        if (empty($rowIds)) return;
        $placeholders = implode(',', array_fill(0, count($rowIds), '?'));
        $stmt = $this->pdo->prepare("UPDATE channex_outbox SET status = 'done', task_id = ?, last_error = ? WHERE id IN ($placeholders)");
        $stmt->execute(array_merge([$taskId, $note], $rowIds));
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
