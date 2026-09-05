<?php
/**
 * Channex Outbox Health Check - Scheduled Task
 *
 * Runs hourly. Cron expression written out longhand rather than inline,
 * because the slash-star form would close this comment:
 *   minute 0, every hour, every day/month/weekday, then
 *   /usr/bin/php /path/to/artists_farm/php/cron/channex_outbox_health.php
 *
 * WHY THIS EXISTS (added 5 Sep 2026)
 *
 * Every Channex bug found so far has been SILENT. The worst of them: 23 ARI
 * pushes sat in the outbox failing for days - one on its 74th identical retry -
 * because they carried room_id NULL against a MULTI_KEY property, which has no
 * such mapping. Nothing anywhere said so. It was found only because someone
 * happened to go looking, three weeks in, and by then the property had been
 * live on two channels the whole time.
 *
 * A failed ARI push is not cosmetic. It means the prices or the availability a
 * guest sees on Airbnb are not the ones in Ground Code - so the property is
 * either selling nights it cannot honour, or sitting closed on nights it could
 * have sold. Both cost real money and neither announces itself.
 *
 * So this asserts what should always be true and complains when it is not:
 *
 *   1. No outbox row has been failing for longer than STUCK_HOURS.
 *   2. No row has burned more than STUCK_ATTEMPTS retries.
 *   3. No row is stuck in 'sending' (a worker died mid-push).
 *   4. Every room of a mapped property still has its Channex mapping.
 *
 * Alerts go to Telescope's 'channel_manager' portal, which reaches the admin's
 * phone through the Web Push channel (see logger.php's maybeSendWebPushAlert -
 * a denylist, so this severity pushes by default). Deliberately NOT Telegram:
 * admin alerting was moved off Telegram entirely at the owner's explicit
 * request, and that decision is not this script's to reverse.
 *
 * Quiet by design: it writes a log line and pushes an alert ONLY when something
 * is actually wrong. An hourly "all clear" would train everyone to ignore it,
 * which is how the original 23 rows stayed invisible in the first place.
 */

require_once __DIR__ . '/../config/database.php';

const STUCK_HOURS = 2;
const STUCK_ATTEMPTS = 5;

$logFile = __DIR__ . '/channex_outbox_health.log';
$timestamp = date('Y-m-d H:i:s');

/** Retired rows carry next_attempt_at = NULL: permanently unsendable, deliberately
 *  parked, already understood. Re-reporting them forever would be exactly the noise
 *  this check exists to avoid. */
$notRetired = "status = 'failed' AND next_attempt_at IS NOT NULL";

try {
    $problems = [];

    // 1 + 2. Rows failing too long, or too many times.
    $stmt = $pdo->prepare("
        SELECT id, property_id, room_id, kind, date_from, date_to, attempts,
               TIMESTAMPDIFF(HOUR, created_at, NOW()) AS age_hours, last_error
        FROM channex_outbox
        WHERE ($notRetired)
          AND (TIMESTAMPDIFF(HOUR, created_at, NOW()) >= ? OR attempts >= ?)
        ORDER BY attempts DESC, id ASC
        LIMIT 50
    ");
    $stmt->execute([STUCK_HOURS, STUCK_ATTEMPTS]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $problems[] = [
            'type' => 'stuck_push',
            'outbox_id' => (int)$r['id'],
            'property_id' => (int)$r['property_id'],
            'room_id' => $r['room_id'] !== null ? (int)$r['room_id'] : null,
            'kind' => $r['kind'],
            'dates' => "{$r['date_from']}..{$r['date_to']}",
            'attempts' => (int)$r['attempts'],
            'age_hours' => (int)$r['age_hours'],
            'error' => substr((string)$r['last_error'], 0, 200),
        ];
    }

    // 3. Rows abandoned mid-flight. processBatch() flips a row to 'sending'
    //    before the API call and only moves it off that on the way out, so a
    //    worker killed in between leaves it there forever - it is not 'pending',
    //    so the normal claim query never picks it up again either.
    $stmt = $pdo->query("
        SELECT id, property_id, kind, TIMESTAMPDIFF(MINUTE, created_at, NOW()) AS age_min
        FROM channex_outbox
        WHERE status = 'sending' AND created_at < NOW() - INTERVAL 30 MINUTE
        LIMIT 20
    ");
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $problems[] = [
            'type' => 'abandoned_sending',
            'outbox_id' => (int)$r['id'],
            'property_id' => (int)$r['property_id'],
            'kind' => $r['kind'],
            'age_minutes' => (int)$r['age_min'],
        ];
    }

    // 4. A room of a connected property with no Channex mapping is a room whose
    //    availability and rates simply never reach any channel - and it fails
    //    quietly, since nothing is ever enqueued for a room nobody knows about.
    $stmt = $pdo->query("
        SELECT child.id, child.name, child.parent_property_id
        FROM properties child
        JOIN channex_mappings pm ON pm.property_id = child.parent_property_id
        LEFT JOIN channex_mappings own ON own.room_id = child.id
        WHERE child.property_type = 'MULTI_KEY_ROOM'
          AND child.is_deleted = 0
          AND own.id IS NULL
        GROUP BY child.id, child.name, child.parent_property_id
        LIMIT 50
    ");
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $problems[] = [
            'type' => 'unmapped_room',
            'room_id' => (int)$r['id'],
            'room_name' => $r['name'],
            'property_id' => (int)$r['parent_property_id'],
        ];
    }

    if (empty($problems)) {
        exit(0); // silence is the healthy state - see the doc comment
    }

    $byType = [];
    foreach ($problems as $p) {
        $byType[$p['type']] = ($byType[$p['type']] ?? 0) + 1;
    }
    $summaryParts = [];
    foreach ($byType as $type => $n) {
        $summaryParts[] = "{$n} x {$type}";
    }
    $summary = implode(', ', $summaryParts);

    $line = "$timestamp - PROBLEMS: {$summary}\n";
    foreach ($problems as $p) {
        $line .= '    ' . json_encode($p) . "\n";
    }
    file_put_contents($logFile, $line, FILE_APPEND);

    if (class_exists('TelescopeLogger')) {
        TelescopeLogger::log(
            'channel_manager',
            'Channel Sync Stuck',
            "Channex outbox health check found: {$summary}. Prices or availability on the OTAs may not match Ground Code.",
            'channex_outbox_health.php',
            ['problems' => array_slice($problems, 0, 20), 'total' => count($problems)]
        );
    }
} catch (Throwable $e) {
    file_put_contents($logFile, "$timestamp - ERROR: " . $e->getMessage() . "\n", FILE_APPEND);
    if (class_exists('TelescopeLogger')) {
        TelescopeLogger::log('channel_manager', 'Channel Sync Health Check Failed', $e->getMessage(), 'channex_outbox_health.php');
    }
}
