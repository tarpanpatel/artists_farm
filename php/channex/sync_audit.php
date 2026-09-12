<?php
/**
 * Published-availability audit - "does Channex actually agree with us?"
 *
 * EXTRACTED 12 Sep 2026 from php/cron/channex_sync_audit.php, which had carried this inline
 * since 5 Sep. Nothing about the logic changed in the move; it is here so the daily cron and
 * the owner-facing "Verify now" button on the Go Live page run the SAME comparison rather
 * than two that gradually disagree. This codebase has been bitten repeatedly by a second
 * implementation of a thing that already existed (a preview computed differently from the
 * push it previews, a doc describing a cadence the scheduler never had), so a check whose
 * whole purpose is detecting disagreement is the last place to keep two copies of.
 *
 * WHY THIS CHECK IS THE IMPORTANT ONE
 *
 * A task id proves a request was accepted. It does not prove the numbers agree. On 3 Sep
 * 2026 a property's "Go Live" reported success while Channex held AVL=0 for every room on
 * every date - unsellable on every channel it was listed on - and it went unnoticed for
 * days. Reading back what Channex actually publishes, night by night, is the only thing that
 * proves a sync is real. It was done by hand during that incident; this is that same
 * comparison, automated.
 *
 * READ-ONLY. Issues GET requests to Channex and reads the local database. Pushes nothing,
 * writes nothing, and cannot alter what any OTA is publishing - safe to run on demand, as
 * often as anyone likes.
 */

require_once __DIR__ . '/ari_drain_worker.php';
require_once __DIR__ . '/ChannexClient.php';

if (!function_exists('channexExpandAvailabilityRanges')) {
    /** {date_from,date_to,availability} ranges -> a flat date => availability map. */
    function channexExpandAvailabilityRanges(array $ranges): array {
        $out = [];
        foreach ($ranges as $r) {
            $cur = strtotime($r['date_from']);
            $end = strtotime($r['date_to']);
            while ($cur <= $end) {
                $out[date('Y-m-d', $cur)] = (int)($r['availability'] ?? 0);
                $cur = strtotime('+1 day', $cur);
            }
        }
        return $out;
    }
}

if (!function_exists('auditChannexRateCoverage')) {
    /**
     * Which live units' rate rules run out before $edgeDate.
     *
     * Past that edge a push falls back to the flat `default_tariff` and overwrites whatever
     * real pricing exists on the OTA, so a rule set quietly expiring is a genuine warning.
     *
     * EXTRACTED AND FIXED 12 Sep 2026. The version inline in channex_sync_audit.php joined
     * rules to mappings with a bare:
     *
     *     LEFT JOIN room_rate_rules rr ON rr.room_id = m.room_id
     *
     * For a SINGLE-unit property both sides are NULL, and in SQL `NULL = NULL` is NULL, not
     * true - so the join matched nothing, MAX(end_date) came back NULL, and the check reported
     * "covered_to: never" for a property that in fact had full day-of-week pricing running to
     * March 2027. It was structurally incapable of seeing rate rules for ANY single-unit
     * property, and had been filing that false alarm every morning. Reported to the owner as
     * fact before they corrected it - which is how it was found.
     *
     * The join is now NULL-safe AND property-scoped. Property-scoped matters independently:
     * the old condition matched on room_id alone, so rules belonging to a different property's
     * room could satisfy it wherever room ids collide across properties.
     *
     * Read-only. No network.
     */
    function auditChannexRateCoverage(PDO $pdo, array $livePropertyIds, string $edgeDate): array {
        if (empty($livePropertyIds)) return [];

        $inList = implode(',', array_fill(0, count($livePropertyIds), '?'));
        $stmt = $pdo->prepare("
            SELECT m.room_id, COALESCE(r.name, p.name) AS name, MAX(rr.end_date) AS covered_to
            FROM channex_mappings m
            LEFT JOIN properties r ON r.id = m.room_id
            JOIN properties p ON p.id = m.property_id
            LEFT JOIN room_rate_rules rr
                   ON rr.property_id = m.property_id
                  AND (rr.room_id = m.room_id OR (rr.room_id IS NULL AND m.room_id IS NULL))
            WHERE m.property_id IN ($inList)
            -- Group on the EXPRESSION, not the `name` alias: MySQL resolves a bare `name`
            -- to the SELECT alias, but SQLite (which the invariant suite's fixture uses)
            -- rejects it as ambiguous, since both r.name and p.name are in scope. Spelling
            -- it out works identically on both and is clearer regardless.
            GROUP BY m.room_id, COALESCE(r.name, p.name)
            HAVING covered_to IS NULL OR covered_to < ?
        ");
        $stmt->execute(array_merge($livePropertyIds, [$edgeDate]));

        $problems = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $problems[] = [
                'type' => 'rate_coverage_expiring',
                'room' => $r['name'],
                'covered_to' => $r['covered_to'] ?? 'never',
                'note' => 'Past this date a push publishes the flat default_tariff, overwriting real OTA pricing.',
            ];
        }
        return $problems;
    }
}

if (!function_exists('auditChannexPublishedAvailability')) {
    /**
     * Compares what Channex publishes against what Ground Code believes, per room, per night.
     *
     * @param int|null $onlyPropertyId Restrict to one property (the on-demand case). Null =
     *                                 every property with an ACTIVE channel, which is what the
     *                                 daily cron wants.
     * @return array{problems: array, checked: array, live_property_ids: array}
     *         `problems` is empty when healthy. `live_property_ids` is every property this
     *         call considered live - returned explicitly because callers need it INDEPENDENTLY
     *         of whether anything was wrong. (Deriving it from `problems` instead silently
     *         empties it whenever availability is healthy, which would switch off the caller's
     *         other live-property-scoped checks exactly when everything looks fine. Caught
     *         during the 12 Sep extraction, before it shipped.)
     *
     * SCOPING, and why it is not negotiable: only properties with an ACTIVE channel
     * connection are audited - not merely ones with a Channex mapping. A mapping is created
     * by content sync long before (and sometimes without ever) a channel goes live, and a
     * Channex room type that has never had availability pushed sits at 0, which reads as
     * "closed everywhere". Auditing those produced 8 confidently-wrong findings on the very
     * first run against staging, for three properties the owner had explicitly said were not
     * connected yet. A check that cries wolf about deliberately dormant properties every
     * morning is worse than no check: it is the exact mechanism by which people stop reading
     * alerts.
     */
    function auditChannexPublishedAvailability(
        PDO $pdo,
        string $from,
        string $to,
        ?int $onlyPropertyId = null,
        ?ChannexClient $client = null,
        ?AriDrainWorker $worker = null
    ): array {
        $client = $client ?? new ChannexClient();
        $worker = $worker ?? new AriDrainWorker($pdo);
        $problems = [];
        $checked = [];

        $sql = "
            SELECT DISTINCT m.property_id, m.channex_property_id, p.name
            FROM channex_mappings m
            JOIN properties p ON p.id = m.property_id
            JOIN channex_channel_connections c ON c.property_id = m.property_id AND c.status = 'active'
            WHERE m.channex_property_id IS NOT NULL
        ";
        $params = [];
        if ($onlyPropertyId !== null) {
            $sql .= " AND m.property_id = ?";
            $params[] = $onlyPropertyId;
        }
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $props = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            return ['problems' => [], 'checked' => [], 'live_property_ids' => []]; // connections table not built here yet
        }

        foreach ($props as $prop) {
            $res = $client->get('availability', [
                'filter' => ['property_id' => $prop['channex_property_id'], 'date' => ['gte' => $from, 'lte' => $to]],
            ]);
            if (empty($res['success']) || !isset($res['data'])) {
                // "Could not verify" is never "fine" - an unreachable Channex is itself a finding.
                $problems[] = [
                    'type' => 'availability_unverifiable',
                    'property_id' => (int)$prop['property_id'],
                    'property' => $prop['name'],
                    'error' => substr(json_encode($res['error'] ?? 'no data in response'), 0, 200),
                ];
                continue;
            }
            $published = $res['data'];

            $rooms = $pdo->prepare("
                SELECT m.room_id, m.channex_room_type_id, COALESCE(r.name, p.name) AS name
                FROM channex_mappings m
                LEFT JOIN properties r ON r.id = m.room_id
                JOIN properties p ON p.id = m.property_id
                WHERE m.property_id = ?
            ");
            $rooms->execute([$prop['property_id']]);

            foreach ($rooms->fetchAll(PDO::FETCH_ASSOC) as $room) {
                $ours = channexExpandAvailabilityRanges($worker->computeCompressedAvailability(
                    (int)$prop['property_id'],
                    $room['room_id'] !== null ? (int)$room['room_id'] : null,
                    $from,
                    $to
                ));
                $theirs = $published[$room['channex_room_type_id']] ?? null;
                if ($theirs === null) {
                    $problems[] = [
                        'type' => 'room_not_published',
                        'property' => $prop['name'],
                        'room' => $room['name'],
                        'note' => 'Channex returned no availability for this room type at all',
                    ];
                    continue;
                }

                $mismatches = [];
                $comparable = 0;
                $channexOpenNights = 0;
                foreach ($ours as $date => $expected) {
                    if (!array_key_exists($date, $theirs)) continue; // Channex may return a shorter window
                    $comparable++;
                    $actual = (int)$theirs[$date];
                    if ($actual > 0) $channexOpenNights++;
                    // Compare open/closed, not the exact count: Ground Code models one unit per
                    // room, while a Channex room type can legitimately carry a higher inventory
                    // count. Open-vs-closed is the part that decides whether a night can be
                    // double-sold.
                    if (($expected > 0) !== ($actual > 0)) {
                        $mismatches[] = [
                            'date' => $date,
                            'ground_code' => $expected > 0 ? 'open' : 'closed',
                            'channex' => $actual > 0 ? 'open' : 'closed',
                        ];
                    }
                }

                $checked[] = [
                    'property' => $prop['name'],
                    'room' => $room['name'],
                    'nights_checked' => $comparable,
                    'mismatched_nights' => count($mismatches),
                ];

                if (!$mismatches) continue;

                // Closed on EVERY audited night, for a room that is live on a channel, is not
                // ordinary drift - it is the signature of ARI never having reached Channex at
                // all. That exact state (AVL=0 for every room, every date, on a property whose
                // "Go Live" reported success) is the 3 Sep 2026 incident, and it went unnoticed
                // for days. It means the room is unsellable on every channel it is listed on, so
                // it deserves its own name rather than being filed under "a few nights disagree".
                if ($comparable > 0 && $channexOpenNights === 0) {
                    $problems[] = [
                        'type' => 'never_published',
                        'property' => $prop['name'],
                        'room' => $room['name'],
                        'nights_checked' => $comparable,
                        'note' => 'Live on a channel, but Channex shows this room closed on every audited night - it cannot be booked anywhere. Usually means ARI has never actually reached Channex.',
                    ];
                    continue;
                }

                $problems[] = [
                    'type' => 'availability_drift',
                    'property' => $prop['name'],
                    'room' => $room['name'],
                    'mismatched_nights' => count($mismatches),
                    'of_nights_checked' => $comparable,
                    'first_few' => array_slice($mismatches, 0, 8),
                ];
            }
        }

        return [
            'problems' => $problems,
            'checked' => $checked,
            'live_property_ids' => array_map(fn($p) => (int)$p['property_id'], $props),
        ];
    }
}
