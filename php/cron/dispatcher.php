<?php
/**
 * Cron Dispatcher - the ONLY script that should ever get a real crontab
 * entry for this app's scheduled tasks. Run every 5 minutes:
 *
 *   0,5,10,15,20,25,30,35,40,45,50,55 * * * * /usr/local/bin/php /path/to/artists_farm/php/cron/dispatcher.php >/dev/null 2>&1
 *
 *   (written as an explicit minute list, not "*\/5", so this line survives
 *   copy-paste unmangled - a literal "*" immediately followed by "/" inside
 *   a /** *\/ PHP comment closes the comment early, which is exactly what
 *   corrupted sync_all_icals.php's own crontab line into invalid syntax
 *   before this was noticed and fixed alongside this file, 25 Aug 2026)
 *
 * Reads enabled/schedule state from the `cron_jobs` table (see
 * cron_jobs.php - also editable from Root Admin's Cron Jobs page) and runs
 * whichever registered jobs are due, each as its own isolated CLI
 * subprocess. Added 25 Aug 2026 specifically so this project never again
 * needs a human to remember to add a crontab line per job - confirmed live
 * that day that only ONE job had ever actually been registered despite
 * several existing in the codebase for days, fully working, just never
 * invoked.
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/cron_jobs.php';

ensureCronJobsSchema($pdo);

$dispatcherLog = __DIR__ . '/dispatcher.log';
$lockFile = __DIR__ . '/dispatcher.lock';
$lockHandle = fopen($lockFile, 'c');
if (!$lockHandle || !flock($lockHandle, LOCK_EX | LOCK_NB)) {
    // Another dispatcher instance is actively running. Exit immediately to prevent process stacking.
    exit(0);
}

$now = time();

$definitions = [];
foreach (getCronJobDefinitions() as $def) {
    $definitions[$def['job_key']] = $def;
}

try {
    $jobs = $pdo->query("SELECT * FROM cron_jobs WHERE enabled = 1")->fetchAll(PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    file_put_contents($dispatcherLog, date('Y-m-d H:i:s') . " - ERROR reading cron_jobs: " . $e->getMessage() . "\n", FILE_APPEND);
    exit(1);
}

foreach ($jobs as $job) {
    if (!isCronJobDue($job, $now)) {
        continue;
    }
    $def = $definitions[$job['job_key']] ?? ['script_path' => $job['script_path'], 'log_file' => null];
    try {
        $result = runCronJobNow($pdo, $job['job_key'], $def);
        file_put_contents(
            $dispatcherLog,
            date('Y-m-d H:i:s') . " - {$job['job_key']}: {$result['status']} ({$result['durationMs']}ms)\n",
            FILE_APPEND
        );
    } catch (Exception $e) {
        // One job's failure must never stop the rest of the dispatch loop -
        // each job is its own isolated subprocess, but this outer try/catch
        // also guards the bookkeeping (the UPDATE in runCronJobNow) itself.
        file_put_contents($dispatcherLog, date('Y-m-d H:i:s') . " - {$job['job_key']}: EXCEPTION " . $e->getMessage() . "\n", FILE_APPEND);
    }
}

flock($lockHandle, LOCK_UN);
fclose($lockHandle);

function isCronJobDue(array $job, int $now): bool {
    $lastRun = $job['last_run_at'] ? strtotime($job['last_run_at']) : null;

    if ($job['schedule_type'] === 'interval_minutes') {
        $interval = max(1, (int)($job['interval_minutes'] ?? 60));
        return $lastRun === null || $now >= ($lastRun + $interval * 60);
    }

    // daily_at: due once the target time has passed today, and not already
    // run since that moment today (so a job whose time already passed before
    // the dispatcher was ever set up still runs once today, then waits for
    // tomorrow - never runs twice in the same day, never skips a whole day
    // just because the exact minute was missed).
    $atTime = $job['daily_at_time'] ?: '00:00:00';
    $todayAt = strtotime(date('Y-m-d') . ' ' . $atTime);
    if ($now < $todayAt) {
        return false;
    }
    return $lastRun === null || $lastRun < $todayAt;
}
