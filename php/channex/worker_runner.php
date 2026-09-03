<?php
/**
 * worker_runner.php
 * Standalone asynchronous background worker runner for:
 * 1. Channex Channel Manager ARI range batch drain (with debounce)
 * 2. Telegram notifications outbox queue drain
 *
 * Can be triggered via non-blocking loopback HTTP request or scheduled CLI cron.
 */

// Allow background execution even if caller disconnects immediately
ignore_user_abort(true);
set_time_limit(120);

// Flush fast 200 OK HTTP response immediately so the caller never waits
if (php_sapi_name() !== 'cli') {
    // If output buffering is active, clean it
    while (ob_get_level() > 0) {
        @ob_end_clean();
    }
    // BUG (2 Sep 2026, found in review): Content-Length was hardcoded to 25,
    // but json_encode(['status' => 'accepted']) is 21 bytes - a wrong length
    // here breaks the exact trick this header exists for (telling the server
    // the response is complete after 21 bytes so it releases the connection
    // immediately instead of waiting, per outbox.php's own note that this was
    // measured at 0.9s vs 8s on LiteSpeed). Computed from the real body now so
    // it can't drift out of sync with it again.
    $body = json_encode(['status' => 'accepted']);
    header('Content-Type: application/json');
    header('Connection: close');
    header('Content-Length: ' . strlen($body));
    echo $body;
    @ob_flush();
    @flush();

    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    }
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/outbox.php';
require_once __DIR__ . '/ari_drain_worker.php';
require_once __DIR__ . '/../telegram/sender.php';

$delay = isset($_GET['delay']) ? max(0, min(15, (int)$_GET['delay'])) : (isset($argv[1]) ? (int)$argv[1] : 5);

// Optional debounce sleep (e.g. 5-6s) in background so back-to-back edits batch together
if ($delay > 0) {
    sleep($delay);
}

// Fixed, app-owned path (found 3 Sep 2026, code review) - NOT
// sys_get_temp_dir(). On cPanel/CageFS the web SAPI (loopback HTTP trigger)
// and CLI (cron trigger) can resolve the system temp dir to two DIFFERENT
// directories, in which case the two trigger paths would take different
// lock files and this guard would silently do nothing between exactly the
// two paths it exists to serialise.
$lockFile = __DIR__ . '/worker_runner.lock';
$lockHandle = @fopen($lockFile, 'c');

// Lost-wakeup fix (found 3 Sep 2026, code review): a plain non-blocking
// attempt-once-then-exit used to drop real work - a row enqueued right
// after another runner already ran its own SELECT would sit until the
// 5-minute drain_worker_outbox safety-net cron instead of draining within
// seconds, a real availability-push delay to Airbnb/Booking.com. Retry
// acquiring for a bounded window instead of giving up immediately: whoever
// currently holds the lock is mid-drain, not stuck, so waiting briefly for
// a turn (then doing OUR OWN fresh queue read once acquired) catches
// anything that arrived after the original holder's own SELECT.
$acquired = false;
if ($lockHandle) {
    $waitDeadline = microtime(true) + 10;
    do {
        if (flock($lockHandle, LOCK_EX | LOCK_NB)) {
            $acquired = true;
            break;
        }
        usleep(250000); // 250ms
    } while (microtime(true) < $waitDeadline);
}
if (!$acquired) {
    // Either the lock file couldn't be opened at all, or another runner
    // held it for the entire wait window (genuinely still busy, not just a
    // brief overlap) - exit cleanly either way; the safety-net cron still
    // bounds how long anything can wait.
    exit(0);
}

try {
    // database.php (required above) already sets $pdo directly at its own
    // top level - there's no getDbConnection() wrapper anywhere in this
    // codebase (confirmed 1 Sep 2026, found live: every other entry point,
    // e.g. router.php, just uses $pdo straight after its own require_once
    // of this same file). Calling one here was a fatal
    // "Call to undefined function" on every single background worker run -
    // silently breaking the Channex ARI outbox drain and the Telegram
    // notifications outbox drain both, since the whole try block below
    // never got past this line.

    // 1. Process Channel Manager ARI Outbox Batch
    if (class_exists('AriDrainWorker')) {
        $worker = new AriDrainWorker($pdo);
        $worker->processBatch();
    }

    // 2. Process Telegram Notifications Outbox
    if (function_exists('drainTelegramOutbox')) {
        drainTelegramOutbox($pdo);
    }
} catch (Exception $e) {
    error_log("Background worker runner error: " . $e->getMessage());
} finally {
    if ($lockHandle) {
        flock($lockHandle, LOCK_UN);
        fclose($lockHandle);
    }
}
