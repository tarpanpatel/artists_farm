<?php
/**
 * Channex Sync Audit - Scheduled Task
 *
 * Runs daily. Cron expression written longhand, since the slash-star form
 * would close this comment:
 *   minute 20, hour 6, every day/month/weekday, then
 *   /usr/bin/php /path/to/artists_farm/php/cron/channex_sync_audit.php
 *
 * WHY THIS EXISTS, AND HOW IT DIFFERS FROM channex_outbox_health.php
 *
 * The health check watches the PLUMBING: is anything stuck, abandoned, or
 * aimed at a room with no mapping. It is fast, local, and hourly.
 *
 * This one watches the DATA, and it is the more important of the two. Every
 * pipe can be clear while the numbers on Airbnb are still wrong - a push that
 * reported success but sent nothing, a booking Channex is holding that we
 * never ingested, a room whose rate rules quietly ran out so the next push
 * would publish the flat default. None of those show up as a failure anywhere.
 *
 * The check that matters most is #1: it asks Channex what it is actually
 * publishing and compares it, night by night, against what Ground Code
 * believes. That comparison was done by hand during the 5 Sep 2026 incident
 * and is the only thing that genuinely proved the sync was correct - a task id
 * proves a request was accepted, not that the numbers agree. Automating it is
 * the difference between "we think it worked" and "we checked".
 *
 * WHAT IT ASSERTS
 *   1. Channex's published availability matches Ground Code's, per room, per
 *      night, over AUDIT_DAYS. A mismatch means a night is sellable on an OTA
 *      that is already occupied here, or closed on one that is free.
 *   2. booking_revisions/feed is empty. Anything sitting there is a confirmed
 *      reservation Channex is holding that this app has not ingested - the
 *      exact failure that hid a real Airbnb booking for days.
 *   3. No revision is stuck unacknowledged. An un-ACKed revision is redelivered
 *      forever, so a silently failing ACK looks healthy while the same booking
 *      arrives over and over.
 *   4. Rate rules extend at least RATE_COVERAGE_DAYS forward for every mapped
 *      room. Past that edge, a push falls back to the flat default_tariff and
 *      overwrites real OTA pricing - the risk that forced a hard end-date cap
 *      on the 5 Sep re-sync.
 *   5. No room holds two overlapping bookings. CLAUDE.md's hardest rule.
 *      Half-open comparison with DATE() on both sides, so a same-day turnover
 *      is correctly not an overlap - see php/config/guest_status.php.
 *
 * Silent when healthy, deliberately: a daily "all clear" is how people learn to
 * stop reading a channel. It writes a log line and pushes a phone alert only
 * when one of the five is actually false. If Channex itself cannot be reached,
 * that is reported as a problem too - "could not verify" is never "fine".
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/guest_status.php';

const AUDIT_DAYS = 120;
const RATE_COVERAGE_DAYS = 60;
const ACK_STUCK_HOURS = 2;

$logFile = __DIR__ . '/channex_sync_audit.log';
$timestamp = date('Y-m-d H:i:s');
$problems = [];

/** Expand the worker's compressed ranges back into a date => availability map,
 *  so the comparison tests the exact values a push would carry rather than a
 *  second reimplementation of the same rules that could drift from it. */
function expandRanges(array $ranges): array {
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

try {
    require_once __DIR__ . '/../channex/ari_drain_worker.php';
    require_once __DIR__ . '/../channex/ChannexClient.php';

    $from = date('Y-m-d');
    $to = date('Y-m-d', strtotime('+' . AUDIT_DAYS . ' days'));
    $worker = new AriDrainWorker($pdo);
    $client = new ChannexClient();

    // ---- 1. Published availability vs. our own ----------------------------
    // Scoped to properties with an ACTIVE channel connection, not merely a
    // Channex mapping. A mapping is created by content sync, long before (and
    // sometimes without ever) a channel goes live - and a Channex room type
    // that has never had availability pushed sits at 0, which reads as "closed
    // everywhere". Auditing those produced 8 confidently-wrong findings on the
    // very first run against staging, for three properties the owner had
    // explicitly said were not connected yet. A check that cries wolf about
    // deliberately dormant properties every morning is worse than no check: it
    // is the exact mechanism by which people stop reading alerts.
    try {
        $props = $pdo->query("
            SELECT DISTINCT m.property_id, m.channex_property_id, p.name
            FROM channex_mappings m
            JOIN properties p ON p.id = m.property_id
            JOIN channex_channel_connections c ON c.property_id = m.property_id AND c.status = 'active'
            WHERE m.channex_property_id IS NOT NULL
        ")->fetchAll(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        $props = []; // connections table not built on this environment yet
    }
    $livePropertyIds = array_column($props, 'property_id');

    foreach ($props as $prop) {
        $res = $client->get('availability', [
            'filter' => ['property_id' => $prop['channex_property_id'], 'date' => ['gte' => $from, 'lte' => $to]],
        ]);
        if (empty($res['success']) || !isset($res['data'])) {
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
            $ours = expandRanges($worker->computeCompressedAvailability(
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
                // Compare open/closed, not the exact count: Ground Code models
                // one unit per room, while a Channex room type can legitimately
                // carry a higher inventory count. Open-vs-closed is the part
                // that decides whether a night can be double-sold.
                if (($expected > 0) !== ($actual > 0)) {
                    $mismatches[] = ['date' => $date, 'ground_code' => $expected > 0 ? 'open' : 'closed', 'channex' => $actual > 0 ? 'open' : 'closed'];
                }
            }

            if (!$mismatches) continue;

            // Closed on EVERY audited night, for a room that is live on a
            // channel, is not ordinary drift - it is the signature of ARI never
            // having reached Channex at all. That exact state (AVL=0 for every
            // room, every date, on a property whose "Go Live" reported success)
            // is the 3 Sep 2026 incident, and it went unnoticed for days. It
            // means the room is unsellable on every channel it is listed on, so
            // it deserves its own name rather than being filed under "a few
            // nights disagree".
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

    // ---- 2. Undrained booking feed ---------------------------------------
    $feed = $client->get('booking_revisions/feed');
    if (empty($feed['success'])) {
        $problems[] = ['type' => 'feed_unreadable', 'error' => substr(json_encode($feed['error'] ?? 'unknown'), 0, 200)];
    } elseif (!empty($feed['data']) && is_array($feed['data'])) {
        $problems[] = [
            'type' => 'undrained_feed',
            'count' => count($feed['data']),
            'note' => 'Confirmed reservations Channex is holding that this app has not ingested. The 5-minute drain should keep this at zero.',
        ];
    }

    // ---- 3. Stuck acknowledgements ---------------------------------------
    try {
        $stmt = $pdo->prepare("
            SELECT revision_id, channex_booking_id, ack_status, ack_attempts,
                   TIMESTAMPDIFF(HOUR, created_at, NOW()) AS age_hours
            FROM channex_booking_revisions
            WHERE ack_status = 'FAILED'
               OR (ack_status = 'PENDING' AND created_at < NOW() - INTERVAL ? HOUR)
            LIMIT 25
        ");
        $stmt->execute([ACK_STUCK_HOURS]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $problems[] = [
                'type' => 'stuck_ack',
                'revision_id' => $r['revision_id'],
                'booking' => $r['channex_booking_id'],
                'ack_status' => $r['ack_status'],
                'attempts' => (int)$r['ack_attempts'],
                'age_hours' => (int)$r['age_hours'],
            ];
        }
    } catch (PDOException $e) {
        // Table not built on this environment yet - not a sync problem.
    }

    // ---- 4. Rate coverage running out ------------------------------------
    // Live properties only, same reasoning as the availability audit above: a
    // dormant property having no rate rules yet is a normal state, not a fault.
    $edge = date('Y-m-d', strtotime('+' . RATE_COVERAGE_DAYS . ' days'));
    if (!empty($livePropertyIds)) {
        $inList = implode(',', array_fill(0, count($livePropertyIds), '?'));
        $stmt = $pdo->prepare("
            SELECT m.room_id, COALESCE(r.name, p.name) AS name, MAX(rr.end_date) AS covered_to
            FROM channex_mappings m
            LEFT JOIN properties r ON r.id = m.room_id
            JOIN properties p ON p.id = m.property_id
            LEFT JOIN room_rate_rules rr ON rr.room_id = m.room_id
            WHERE m.property_id IN ($inList)
            GROUP BY m.room_id, name
            HAVING covered_to IS NULL OR covered_to < ?
        ");
        $stmt->execute(array_merge($livePropertyIds, [$edge]));
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $problems[] = [
                'type' => 'rate_coverage_expiring',
                'room' => $r['name'],
                'covered_to' => $r['covered_to'] ?? 'never',
                'note' => 'Past this date a push publishes the flat default_tariff, overwriting real OTA pricing.',
            ];
        }
    }

    // ---- 5. Overlapping bookings -----------------------------------------
    $ph = guestOccupyingStatusPlaceholders();
    $stmt = $pdo->prepare("
        SELECT a.id AS a_id, a.guest_name AS a_name, a.checkin_date AS a_in, DATE(a.expected_checkout) AS a_out,
               b.id AS b_id, b.guest_name AS b_name, b.checkin_date AS b_in, DATE(b.expected_checkout) AS b_out,
               COALESCE(p.name, CONCAT('property ', a.property_id)) AS room_name
        FROM guests a
        JOIN guests b ON b.room_id = a.room_id AND b.id > a.id
        LEFT JOIN properties p ON p.id = a.room_id
        WHERE a.room_id IS NOT NULL
          AND a.status IN ($ph) AND b.status IN ($ph)
          AND a.checkin_date < DATE(b.expected_checkout)
          AND DATE(a.expected_checkout) > b.checkin_date
          AND DATE(a.expected_checkout) >= CURDATE()
        LIMIT 25
    ");
    $stmt->execute(array_merge(guestOccupyingStatuses(), guestOccupyingStatuses()));
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $problems[] = [
            'type' => 'overlapping_bookings',
            'room' => $r['room_name'],
            'a' => "#{$r['a_id']} {$r['a_name']} {$r['a_in']}..{$r['a_out']}",
            'b' => "#{$r['b_id']} {$r['b_name']} {$r['b_in']}..{$r['b_out']}",
            'note' => 'Two stays share a night in one room. A guest will arrive to an occupied room.',
        ];
    }

    // ---- report ----------------------------------------------------------
    if (empty($problems)) {
        exit(0); // silence is the healthy state - see the doc comment
    }

    $byType = [];
    foreach ($problems as $p) $byType[$p['type']] = ($byType[$p['type']] ?? 0) + 1;
    $parts = [];
    foreach ($byType as $type => $n) $parts[] = "{$n} x {$type}";
    $summary = implode(', ', $parts);

    $line = "$timestamp - PROBLEMS: {$summary}\n";
    foreach ($problems as $p) $line .= '    ' . json_encode($p) . "\n";
    file_put_contents($logFile, $line, FILE_APPEND);

    if (class_exists('TelescopeLogger')) {
        TelescopeLogger::log(
            'channel_manager',
            'Channel Sync Drift',
            "Daily sync audit found: {$summary}. What the OTAs are publishing may not match Ground Code.",
            'channex_sync_audit.php',
            ['problems' => array_slice($problems, 0, 20), 'total' => count($problems), 'window' => "{$from}..{$to}"]
        );
    }
} catch (Throwable $e) {
    file_put_contents($logFile, "$timestamp - ERROR: " . $e->getMessage() . "\n", FILE_APPEND);
    if (class_exists('TelescopeLogger')) {
        TelescopeLogger::log('channel_manager', 'Channel Sync Audit Failed', $e->getMessage(), 'channex_sync_audit.php');
    }
}
