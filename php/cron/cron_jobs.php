<?php
/**
 * Cron Job Registry - DB-driven config for every scheduled task under
 * php/cron/, plus the Root Admin API (get_cron_jobs/update_cron_job/
 * run_cron_job_now/get_cron_job_log) that lets Root Admin toggle a job on/off
 * or change its schedule without ever touching the server's real crontab or
 * SSH again.
 *
 * Added 25 Aug 2026, directly prompted by discovering (while diagnosing an
 * unrelated production outage) that this account's crontab had only ONE job
 * registered - check_licenses.php/check_unconverted_ota_bookings.php had
 * existed in the codebase for days, fully working, but nothing was ever
 * invoking them. That class of silent gap is exactly what this closes: going
 * forward there is exactly ONE real crontab entry, ever - dispatcher.php,
 * running every few minutes - and every individual job's enabled/schedule
 * state lives here in the DB instead, visible and editable from Root Admin.
 *
 * poll_telegram_updates.php is deliberately NOT registered here - its own
 * doc comment says it's a local/XAMPP-only substitute for the production
 * webhook and already no-ops away from localhost, so there's nothing for a
 * server-side dispatcher to usefully run.
 */

require_once __DIR__ . '/../config/schema_cache.php';

// Single source of truth for the known jobs - used both to seed the table on
// first self-heal and to validate a job_key on every write action (never
// trust a job_key from the request body alone, even though the column is
// only ever written by this file's own INSERT IGNORE below).
function getCronJobDefinitions(): array {
    return [
        [
            'job_key' => 'check_licenses',
            'name' => 'License Expiry Reminders',
            'description' => 'Sends Telegram + email reminders on the 4 Sundays before a property license expires.',
            'script_path' => 'check_licenses.php',
            'log_file' => 'license_checker.log',
            'schedule_type' => 'daily_at',
            'interval_minutes' => null,
            'daily_at_time' => '08:00:00',
        ],
        [
            'job_key' => 'cleanup_orphaned_images',
            'name' => 'Orphaned Image Cleanup',
            'description' => 'Deletes uploaded QR/menu/catalog photos no longer referenced by any property once they are 24h+ old.',
            'script_path' => 'cleanup_orphaned_images.php',
            'log_file' => 'orphaned_images_cleanup.log',
            'schedule_type' => 'daily_at',
            'interval_minutes' => null,
            'daily_at_time' => '04:00:00',
        ],
        [
            'job_key' => 'checkin_verification_reminders',
            'name' => 'Pending ID Verification Reminders',
            'description' => 'Nudges the Admin Telegram group about check-ins from before today still marked ID-verification pending.',
            'script_path' => 'checkin_verification_reminders.php',
            'log_file' => 'checkin_verification_reminders.log',
            'schedule_type' => 'daily_at',
            'interval_minutes' => null,
            'daily_at_time' => '09:00:00',
        ],
        [
            'job_key' => 'checkout_departure_reminders',
            'name' => 'Departure Day Reminders',
            'description' => 'Sends the Admin Telegram group a "Mark Checked-Out" button for every still-checked-in guest whose expected checkout date has arrived.',
            'script_path' => 'checkout_departure_reminders.php',
            'log_file' => 'checkout_departure_reminders.log',
            'schedule_type' => 'daily_at',
            'interval_minutes' => null,
            'daily_at_time' => '09:00:00',
        ],
        [
            'job_key' => 'daily_operations_digest',
            'name' => "Tomorrow's Arrivals & Departures Digest",
            'description' => 'Nightly (10pm) combined summary of every guest arriving or departing tomorrow, sent to Admin and Kitchen. Skipped for a property with neither.',
            'script_path' => 'daily_operations_digest.php',
            'log_file' => 'daily_operations_digest.log',
            'schedule_type' => 'daily_at',
            'interval_minutes' => null,
            'daily_at_time' => '22:00:00',
        ],
        [
            // SAFETY NET (2 Sep 2026, found in review): the app already
            // triggers php/channex/worker_runner.php after every booking
            // write via triggerAsyncBackgroundWorker() (sender.php) - a
            // detached CLI popen(), or a loopback curl if popen is disabled.
            // Both are best-effort and can fail silently (popen disabled by
            // hosting, a scheme-mismatch loopback, a proxy eating the
            // request) - until this was registered there was NOTHING that
            // would ever drain a stuck outbox again on its own; queued
            // Telegram messages and Channex ARI updates would just sit
            // forever unless some unrelated later request happened to
            // trigger a successful fire. Reuses worker_runner.php directly
            // (script_path resolves to php/channex/worker_runner.php,
            // outside this directory) rather than duplicating its drain
            // logic in a second copy - it already behaves correctly under
            // CLI (skips the HTTP-response block, defaults its own delay to
            // 5s with no $argv[1], same as this job's own run cadence makes
            // reasonable).
            'job_key' => 'drain_worker_outbox',
            'name' => 'Channex/Telegram Outbox Safety-Net Drain',
            'description' => 'Fallback drain for the Telegram + Channex ARI background worker, in case the app\'s own real-time trigger (popen or a loopback HTTP call) silently failed after a booking edit.',
            'script_path' => '../channex/worker_runner.php',
            'log_file' => null,
            'schedule_type' => 'interval_minutes',
            'interval_minutes' => 5,
            'daily_at_time' => null,
        ],
        [
            // Added 5 Sep 2026 after a live incident: 23 ARI pushes failed
            // silently for days (one on its 74th identical retry) with nothing
            // anywhere surfacing it. Quiet unless something is actually wrong -
            // see the script's own doc comment for why an hourly "all clear"
            // would defeat the purpose.
            'job_key' => 'channex_outbox_health',
            'name' => 'Channel Sync Health Check',
            'description' => 'Hourly check that no Channex ARI push is stuck, abandoned mid-send, or aimed at an unmapped room - so a channel silently drifting out of sync with Ground Code gets noticed in hours rather than weeks.',
            'script_path' => 'channex_outbox_health.php',
            'log_file' => 'channex_outbox_health.log',
            'schedule_type' => 'interval_minutes',
            'interval_minutes' => 60,
            'daily_at_time' => null,
        ],
        [
            // The data-level companion to channex_outbox_health above: that one
            // watches the plumbing (stuck/abandoned pushes), this one asks
            // Channex what it is actually publishing and compares it night by
            // night against Ground Code. Every pipe can be clear while the
            // numbers on Airbnb are still wrong - see the script's doc comment.
            'job_key' => 'channex_sync_audit',
            'name' => 'Channel Sync Audit (Data)',
            'description' => 'Daily audit that what the OTAs publish still matches Ground Code: availability per room per night, an empty booking feed, no stuck acknowledgements, rate rules not about to run out, and no overlapping bookings.',
            'script_path' => 'channex_sync_audit.php',
            'log_file' => 'channex_sync_audit.log',
            'schedule_type' => 'daily_at',
            'interval_minutes' => null,
            'daily_at_time' => '06:20:00',
        ],
        [
            'job_key' => 'trial_lifecycle_cadence',
            'name' => '30-Day Trial Lifecycle & Renewal Cadence',
            'description' => 'Automated Day 1/3/7/14/21/23(7-day notice)/28/30 follow-up nudges, trial expiry notices, and subscription status transitions.',
            'script_path' => 'trial_lifecycle_cadence.php',
            'log_file' => 'trial_lifecycle_cadence.log',
            'schedule_type' => 'daily_at',
            'interval_minutes' => null,
            'daily_at_time' => '08:30:00',
        ],
    ];
}

function ensureCronJobsSchema(PDO $pdo): void {
    // Bumped to v6 (5 Sep 2026) to seed channex_outbox_health and
    // channex_sync_audit. Previously v5 (2 Sep 2026) for drain_worker_outbox.
    //
    // The seed loop below only ever runs while its own version marker is
    // unset, so adding an entry to getCronJobDefinitions() above does NOTHING
    // on an already-provisioned environment without also bumping this. Caught
    // exactly that way: both new jobs were deployed, both ran correctly by
    // hand, and neither appeared in cron_jobs - so neither would ever have
    // been scheduled. If you add a job, bump this line in the same commit.
    // (INSERT IGNORE, so existing jobs' live-edited settings are untouched
    // either way - only a genuinely new job_key actually inserts.)
    if (!isSchemaVerified('schema_cron_jobs_v6')) {
        $pdo->exec("CREATE TABLE IF NOT EXISTS cron_jobs (
            job_key VARCHAR(64) PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            description TEXT,
            script_path VARCHAR(255) NOT NULL,
            enabled TINYINT(1) NOT NULL DEFAULT 1,
            schedule_type ENUM('interval_minutes','daily_at') NOT NULL DEFAULT 'daily_at',
            interval_minutes INT DEFAULT NULL,
            daily_at_time TIME DEFAULT NULL,
            last_run_at DATETIME DEFAULT NULL,
            last_run_status VARCHAR(20) DEFAULT NULL,
            last_run_message TEXT,
            last_run_duration_ms INT DEFAULT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $seedStmt = $pdo->prepare("INSERT IGNORE INTO cron_jobs (job_key, name, description, script_path, schedule_type, interval_minutes, daily_at_time) VALUES (?, ?, ?, ?, ?, ?, ?)");
        foreach (getCronJobDefinitions() as $job) {
            $seedStmt->execute([
                $job['job_key'], $job['name'], $job['description'], $job['script_path'],
                $job['schedule_type'], $job['interval_minutes'], $job['daily_at_time'],
            ]);
        }
        markSchemaVerified('schema_cron_jobs_v6');
    }
}

function cronJobRowToApi(array $row, array $def): array {
    return [
        'jobKey' => $row['job_key'],
        'name' => $row['name'],
        'description' => $row['description'],
        'enabled' => (bool)$row['enabled'],
        'scheduleType' => $row['schedule_type'],
        'intervalMinutes' => $row['interval_minutes'] !== null ? (int)$row['interval_minutes'] : null,
        'dailyAtTime' => $row['daily_at_time'],
        'lastRunAt' => $row['last_run_at'],
        'lastRunStatus' => $row['last_run_status'],
        'lastRunMessage' => $row['last_run_message'],
        'lastRunDurationMs' => $row['last_run_duration_ms'] !== null ? (int)$row['last_run_duration_ms'] : null,
        'logFile' => $def['log_file'] ?? null,
    ];
}

function handleCronJobsRequests($pdo, $request_method, $action) {
    ensureCronJobsSchema($pdo);

    if (!($_SESSION['is_platform_admin'] ?? false)) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Root Admin access required']);
        exit;
    }

    $definitions = [];
    foreach (getCronJobDefinitions() as $def) {
        $definitions[$def['job_key']] = $def;
    }

    switch ($action) {
        case 'get_cron_jobs':
            try {
                $rows = $pdo->query("SELECT * FROM cron_jobs ORDER BY name ASC")->fetchAll(PDO::FETCH_ASSOC);
                $out = [];
                foreach ($rows as $row) {
                    $out[] = cronJobRowToApi($row, $definitions[$row['job_key']] ?? []);
                }
                echo json_encode(['status' => 'success', 'data' => $out]);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'update_cron_job':
            $input = json_decode(file_get_contents('php://input'), true);
            $jobKey = $input['jobKey'] ?? '';
            if (!isset($definitions[$jobKey])) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'Unknown job_key']);
                exit;
            }
            try {
                $sets = [];
                $params = [];
                if (array_key_exists('enabled', $input)) {
                    $sets[] = 'enabled = ?';
                    $params[] = $input['enabled'] ? 1 : 0;
                }
                if (array_key_exists('scheduleType', $input) && in_array($input['scheduleType'], ['interval_minutes', 'daily_at'], true)) {
                    $sets[] = 'schedule_type = ?';
                    $params[] = $input['scheduleType'];
                }
                if (array_key_exists('intervalMinutes', $input)) {
                    // Floor of 5 minutes - anything tighter than the dispatcher's own
                    // recommended run frequency can never actually fire on time anyway.
                    $sets[] = 'interval_minutes = ?';
                    $params[] = $input['intervalMinutes'] !== null && $input['intervalMinutes'] !== ''
                        ? max(5, (int)$input['intervalMinutes'])
                        : null;
                }
                if (array_key_exists('dailyAtTime', $input)) {
                    $rawTime = trim((string)($input['dailyAtTime'] ?? ''));
                    $sets[] = 'daily_at_time = ?';
                    $params[] = ($rawTime !== '' && preg_match('/^\d{2}:\d{2}(:\d{2})?$/', $rawTime))
                        ? (strlen($rawTime) === 5 ? $rawTime . ':00' : $rawTime)
                        : null;
                }
                if (empty($sets)) {
                    echo json_encode(['status' => 'error', 'message' => 'No fields to update']);
                    exit;
                }
                $params[] = $jobKey;
                $stmt = $pdo->prepare("UPDATE cron_jobs SET " . implode(', ', $sets) . " WHERE job_key = ?");
                $stmt->execute($params);
                echo json_encode(['status' => 'success', 'message' => 'Cron job updated']);
            } catch (PDOException $e) {
                echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            }
            break;

        case 'run_cron_job_now':
            $input = json_decode(file_get_contents('php://input'), true);
            $jobKey = $input['jobKey'] ?? '';
            $def = $definitions[$jobKey] ?? null;
            if (!$def) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'Unknown job_key']);
                exit;
            }
            $result = runCronJobNow($pdo, $jobKey, $def);
            echo json_encode(['status' => 'success', 'data' => $result]);
            break;

        case 'get_cron_job_log':
            $jobKey = $_GET['jobKey'] ?? '';
            $def = $definitions[$jobKey] ?? null;
            if (!$def) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'Unknown job_key']);
                exit;
            }
            $logPath = __DIR__ . '/' . $def['log_file'];
            $tail = '';
            if (is_file($logPath)) {
                // Cheap tail - these are small, slow-growing text logs (one line per
                // run), never large enough to justify a real seek-based tail.
                $lines = file($logPath, FILE_IGNORE_NEW_LINES);
                $tail = implode("\n", array_slice($lines, -50));
            }
            echo json_encode(['status' => 'success', 'data' => ['log' => $tail]]);
            break;

        default:
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Unknown cron jobs action']);
    }
}

// Shared by both the "Run Now" API action and dispatcher.php's scheduled
// invocation - runs one job's script as its own isolated CLI subprocess
// (matching exactly how a real crontab line would invoke it, so behavior
// never differs from "as if this had its own crontab entry") and records the
// result back onto the row.
function runCronJobNow(PDO $pdo, string $jobKey, array $def): array {
    $scriptPath = __DIR__ . '/' . $def['script_path'];
    $start = microtime(true);

    if (!is_file($scriptPath)) {
        $status = 'error';
        $message = 'Script file not found: ' . $def['script_path'];
    } else {
        $phpBinary = defined('PHP_BINARY') && PHP_BINARY ? PHP_BINARY : 'php';
        $cmd = escapeshellarg($phpBinary) . ' ' . escapeshellarg($scriptPath);
        // Hard wall-clock cap via proc_open, not a bare shell_exec (found 3
        // Sep 2026, code review). shell_exec has no timeout of its own, so
        // one wedged job (a curl call hung on a dead TCP connection, a DB
        // lock wait) used to block this call indefinitely - and since
        // dispatcher.php (the only caller that matters in production) holds
        // its own file lock for its ENTIRE run, a single stuck job silently
        // disabled every OTHER scheduled job on the account until someone
        // noticed. Time blocked in a syscall doesn't count against PHP's own
        // max_execution_time either, so that never rescued it. proc_open (not
        // an external `timeout` binary) so this still works on a local
        // Windows dev box, not just Linux/cPanel.
        $maxRuntimeSeconds = 300;
        $process = @proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) {
            $status = 'error';
            $message = 'Failed to start job process';
        } else {
            stream_set_blocking($pipes[1], false);
            stream_set_blocking($pipes[2], false);
            $output = '';
            $timedOut = false;
            while (true) {
                $output .= stream_get_contents($pipes[1]);
                $output .= stream_get_contents($pipes[2]);
                $procStatus = proc_get_status($process);
                if (!$procStatus['running']) {
                    break;
                }
                if ((microtime(true) - $start) > $maxRuntimeSeconds) {
                    $timedOut = true;
                    proc_terminate($process, 9);
                    break;
                }
                usleep(150000); // 150ms poll - fine-grained enough without busy-looping
            }
            // Final drain - the process may have written more between the
            // last read above and it actually exiting/being killed.
            $output .= stream_get_contents($pipes[1]);
            $output .= stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            proc_close($process);

            $message = trim($output);
            if ($timedOut) {
                $status = 'error';
                $message = "Timed out after {$maxRuntimeSeconds}s and was killed. Output before kill: "
                    . ($message !== '' ? $message : '(none)');
            } else {
                $status = 'success';
                if ($message === '') {
                    $message = '(no output - check the job\'s own log file for details)';
                }
            }
            if (strlen($message) > 2000) {
                $message = substr($message, 0, 2000) . '... (truncated)';
            }
        }
    }

    $durationMs = (int) round((microtime(true) - $start) * 1000);
    $upd = $pdo->prepare("UPDATE cron_jobs SET last_run_at = NOW(), last_run_status = ?, last_run_message = ?, last_run_duration_ms = ? WHERE job_key = ?");
    $upd->execute([$status, $message, $durationMs, $jobKey]);

    return ['status' => $status, 'message' => $message, 'durationMs' => $durationMs];
}
