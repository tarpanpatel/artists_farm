<?php
/**
 * Telescope File-Based Independent Error Logger
 * ZERO DATABASE DEPENDENCY - Writes directly to filesystem (logs.json)
 */

if (!class_exists('TelescopeLogger')) {
    // Set timezone to Asia/Kolkata for correct Indian timestamps
    date_default_timezone_set('Asia/Kolkata');

    class TelescopeLogger {
        private static $logFile = __DIR__ . '/logs.json';

        public static function getLogFilePath() {
            return self::$logFile;
        }

        /**
         * Clear the file-backed telescope log store. Does not touch audit_logs -
         * that's real staff login/activity history, not debug telemetry.
         *
         * Goes through the same single-handle-plus-flock path as appendLog() (29
         * Aug 2026) rather than a bare file_put_contents() - a reset landing in
         * the middle of a concurrent appendLog() write used to race the same way
         * appendLog() itself did against other appendLog() calls (see that
         * method's own comment for the full write-up).
         */
        public static function clear() {
            $fp = @fopen(self::$logFile, 'c+');
            if ($fp === false) {
                return false;
            }
            $ok = false;
            if (flock($fp, LOCK_EX)) {
                $ok = ftruncate($fp, 0) && (fwrite($fp, '[]') !== false);
                fflush($fp);
                flock($fp, LOCK_UN);
            }
            fclose($fp);
            return $ok;
        }

        /**
         * Log an event entry to logs.json without requiring MySQL/PDO
         */
        public static function log($portal, $severity, $msg, $origin = 'Dashboard', $extraData = []) {
            $entry = array_merge([
                'id' => md5(uniqid(microtime(true) . rand(), true)),
                'portal' => $portal, // 'requests', 'php', 'sql', 'js', 'telegram', 'security', '404'
                'severity' => $severity, // 'Fatal Error', 'Warning', 'Notice', 'SQL Error', 'Super Admin', etc.
                'msg' => $msg,
                'origin' => $origin,
                'timestamp' => date('Y-m-d H:i:s'),
                'execution_time' => round(microtime(true) - ($_SERVER['REQUEST_TIME_FLOAT'] ?? microtime(true)), 4),
                'memory_usage' => round(memory_get_usage() / 1024 / 1024, 2) . ' MB',
                'ip' => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1',
                'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown'
            ], $extraData);

            self::appendLog($entry);
            self::maybeSendWebPushAlert($portal, $severity, $msg, $origin);
        }

        // NOTE (26 Aug 2026): a logThrottled() method briefly lived here - same as log() but
        // suppressing repeats of the same event within a 10-min cooldown, built after a stray
        // cross-tenant browser tab generated 200+ near-identical 'security' portal entries in one
        // sitting. Removed again the same day at the user's explicit request: they didn't want
        // that class of event logged AT ALL, not just throttled (the router.php property-scope
        // gate's own comment has the full context). The underlying 403/access-denial this was
        // logging was never affected either time - only what Telescope records changed. See git
        // history if a future repeat-prone security event needs the throttling approach instead.

        // NOTE (22 Aug 2026): Telegram used to also get a best-effort ping here
        // for Fatal Error/Exception/SQL Error, direct to the Telegram Bot API.
        // Removed at the user's explicit request - Telegram must not send or be
        // involved in ANY error/crash notification any more, full stop. The Web
        // Push channel below is now the only admin-alert channel. This is
        // strictly about ADMIN ALERTING - Telegram's other, unrelated job of
        // delivering real guest/business notifications (bookings, kitchen
        // orders, etc. via telegram/sender.php) is completely untouched, and
        // those sends still get logged to Telescope's own 'telegram' portal as
        // before; only the "ping the admin when something breaks" behavior is
        // gone.

        /**
         * Real OS-level push notification to whichever device(s) the root admin
         * has subscribed via the Telescope PWA (added 22 Aug 2026, "browse
         * Telescope rather than have Telegram send me things"). Deliberately
         * broader than maybeAlertAdmin() above: that one only covers the
         * narrow "PHP backend definitely broke" case (Fatal Error/Exception/
         * SQL Error) - this covers every portal's actual error-level signal,
         * including frontend JS crashes (portal 'js', severity 'ERROR'/
         * 'CRITICAL') and security-portal events, which is exactly the class
         * of error a real user hits that the narrower PHP-only alert has
         * never covered (see ErrorBoundary.tsx's crash reports, none of which
         * carry the exact strings 'Fatal Error'/'Exception'/'SQL Error').
         * Denylist, not allowlist, so a new severity string introduced later
         * defaults to "alert on it" rather than silently never alerting until
         * someone remembers to add it to a list.
         */
        private static function maybeSendWebPushAlert($portal, $severity, $msg, $origin) {
            // Whole 'ai_chat' portal never pushes (27 Aug 2026, explicit user request: "I am ok
            // with these logs, I just don't want push notifications for them"). Previously this
            // only denylisted the routine severities ('AI Query'/'AI Outcome'/'AI Config
            // Updated'), which still let 'Gemini Call Failed'/'OpenAI Call Failed'/'OpenCode Zen
            // Call Failed' (php/api/ai_assistant.php) push through - the user's ask was for the
            // whole category to be silent, not just the routine chat turns, so gating on portal
            // is simpler and matches that intent exactly. 'AI Config Updated'
            // (php/api/ai_config.php) was moved onto this same 'ai_chat' portal (was 'system')
            // so it's covered here too, and so it shows up under the same "AI Assistant" sidebar
            // category in index.php instead of being uncounted/search-only.
            if ($portal === 'ai_chat') {
                return;
            }

            $routineNoise = ['INFO', 'SUCCESS', 'Notice', 'Deprecated'];
            if ($portal !== 'security' && in_array($severity, $routineNoise, true)) {
                return;
            }

            try {
                require_once __DIR__ . '/web_push.php';
            } catch (\Throwable $e) {
                return;
            }

            if (empty(wp_load_subscriptions())) {
                return; // nobody has tapped "Enable Alerts" yet - nothing to do
            }

            // Own, shorter cooldown than the Telegram one above (60s vs 120s) -
            // this is now the PRIMARY alert channel per the user's own framing,
            // so it deliberately gets first/faster notice, in its own file so
            // the two channels' cooldowns can never block each other.
            $cooldownFile = __DIR__ . '/push_alert_cooldown.txt';
            $now = time();
            if (file_exists($cooldownFile)) {
                $last = (int) @file_get_contents($cooldownFile);
                if ($now - $last < 60) {
                    return;
                }
            }
            @file_put_contents($cooldownFile, (string) $now, LOCK_EX);

            $shortMsg = mb_substr((string) $msg, 0, 150);
            if (mb_strlen((string) $msg) > 150) {
                $shortMsg .= '…';
            }

            broadcastWebPush([
                'title' => "🚨 {$severity} — " . ($_SERVER['HTTP_HOST'] ?? 'artists-farm'),
                'body' => "[{$portal}] {$shortMsg}",
                'url' => '/php/errors/?portal=' . urlencode((string) $portal),
                'tag' => 'telescope-' . $portal,
            ]);
        }

        /**
         * Read-modify-write logs.json under a SINGLE exclusive lock held across the
         * whole cycle (29 Aug 2026, fixing the actual root cause of "Telescope
         * sometimes shows nothing" - reported as a chronic, load-dependent flakiness).
         *
         * The previous version read the file, decoded it, appended in memory, then
         * wrote it back with LOCK_EX only on the final file_put_contents() - the READ
         * was unlocked. Under real concurrent traffic (every page load logs a
         * 'requests' entry via router.php, every browser tab's JS crash beacons
         * straight to this same file, multiple staff hitting the API at once), two
         * requests could both read the same pre-append snapshot, each append their
         * own new entry to their own in-memory copy, and then both write back -
         * whichever process's write happened to land second silently overwrote the
         * first's, discarding that entry with no error anywhere (file_put_contents
         * still "succeeds": it wrote valid JSON, just without the log that lost the
         * race). This is exactly a lost-update race, and it's inherently
         * non-deterministic - it only bites under concurrent access, which is why the
         * symptom was "sometimes it works, sometimes it doesn't" rather than a
         * reproducible break.
         *
         * fopen('c+') + flock(LOCK_EX) held across the read AND the write closes this:
         * every writer must acquire the same exclusive lock before it can even read,
         * so the read a writer sees is always genuinely current (reflecting every
         * write that came before it, not a stale snapshot), and no two processes can
         * ever be inside this critical section at the same time. This does mean two
         * concurrent Telescope-logging requests briefly queue behind each other
         * (typically sub-millisecond for a file this size) rather than racing -
         * correctness over raw throughput, which is the right tradeoff for a debug
         * log that's supposed to be trustworthy.
         */
        private static function appendLog($entry) {
            $file = self::$logFile;
            $dir = dirname($file);
            if (!is_dir($dir)) {
                @mkdir($dir, 0755, true);
            }

            $isNewFile = !file_exists($file);
            $fp = @fopen($file, 'c+');
            if ($fp === false) {
                return; // Can't open/create the file at all (permissions, disk) - nothing more to do.
            }
            if ($isNewFile) {
                // Both the web server process (a real request) and a CLI cron process
                // can be the first to ever create this file - world-writable so
                // neither one locks the other out later, same as the file always did
                // before this rewrite.
                @chmod($file, 0666);
            }

            if (!flock($fp, LOCK_EX)) {
                fclose($fp);
                return;
            }

            $logs = [];
            // PHP caches stat() results per-process/per-path - a long-lived PHP-FPM
            // worker that already called filesize() on this exact path in an earlier
            // request could otherwise see a stale (pre-write) size here, even though
            // a different process rewrote the file since. clearstatcache() forces a
            // real re-stat now that the lock guarantees no other writer is mid-write.
            clearstatcache(true, $file);
            $size = filesize($file);
            if ($size > 0) {
                $content = fread($fp, $size);
                $decoded = ($content !== false && $content !== '') ? json_decode($content, true) : null;
                if (is_array($decoded)) {
                    $logs = $decoded;
                } elseif (!empty($content)) {
                    // Corrupted/non-JSON content in a non-empty file (e.g. a partial
                    // write from an interrupted request under the old unlocked code
                    // path, or an out-of-band edit) - preserve the evidence in a
                    // sibling file instead of silently discarding the whole log
                    // history on this write. Best-effort only; a failure here must
                    // never block logging the current entry.
                    @file_put_contents($file . '.corrupted-' . date('Ymd-His'), $content);
                }
            }

            // Unshift new entry to top
            array_unshift($logs, $entry);

            // Cap at 300 entries PER PORTAL, not 300 total - a single portal
            // (typically 'requests', which logs every API call at INFO level)
            // would otherwise flush out rare-but-critical entries in every
            // other portal ('js', 'php', 'sql', 'security', 'telegram', ...)
            // within minutes of ordinary traffic, silently, with no
            // indication anything was ever lost. Confirmed 18 Aug 2026: a
            // single Playwright testing session generated ~280 'requests'
            // entries in a few minutes, which had already evicted every
            // earlier 'js'/'telegram' error that same session had found only
            // moments before - Telescope is meant to be the last line of
            // defense for spotting real bugs, and a flat shared cap defeats
            // that the moment traffic volume is nontrivial.
            $perPortalCounts = [];
            $capped = [];
            foreach ($logs as $log) {
                $p = $log['portal'] ?? 'requests';
                $perPortalCounts[$p] = ($perPortalCounts[$p] ?? 0) + 1;
                if ($perPortalCounts[$p] <= 300) {
                    $capped[] = $log;
                }
            }

            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, json_encode($capped, JSON_PRETTY_PRINT));
            fflush($fp);
            flock($fp, LOCK_UN);
            fclose($fp);
        }

        /**
         * Read logs with filtering
         */
        public static function getLogs($portal = 'all', $search = '', $timeframe = 'all', $dateFrom = '', $dateTo = '') {
            $file = self::$logFile;
            if (!file_exists($file)) {
                return ['logs' => [], 'counts' => self::getEmptyCounts()];
            }

            $content = @file_get_contents($file);
            $allLogs = !empty($content) ? (@json_decode($content, true) ?: []) : [];

            $filteredLogs = [];
            $counts = [
                'requests' => 0,
                'php' => 0,
                'sql' => 0,
                'js' => 0,
                'telegram' => 0,
                'whatsapp' => 0,
                'security' => 0,
                '404' => 0,
                'audit' => 0,
                'staff_activity' => 0,
                'login' => 0,
                'ai_chat' => 0
            ];

            $now = time();

            // First pass: apply all filters
            foreach ($allLogs as $log) {
                // Check portal filter
                if ($portal !== 'all') {
                    $p = $log['portal'] ?? 'requests';
                    if ($p !== $portal) {
                        continue;
                    }
                }

                // Check timeframe filter (quick presets)
                if ($timeframe !== 'all' && !empty($log['timestamp'])) {
                    $logTime = strtotime($log['timestamp']);
                    if ($timeframe === 'today' && date('Y-m-d', $logTime) !== date('Y-m-d', $now)) {
                        continue;
                    } elseif ($timeframe === 'yesterday' && date('Y-m-d', $logTime) !== date('Y-m-d', $now - 86400)) {
                        continue;
                    } elseif ($timeframe === '7days' && $logTime < ($now - 7 * 86400)) {
                        continue;
                    }
                }

                // Check custom date range filter
                if ((!empty($dateFrom) || !empty($dateTo)) && !empty($log['timestamp'])) {
                    $logDate = date('Y-m-d', strtotime($log['timestamp']));
                    if (!empty($dateFrom) && $logDate < $dateFrom) {
                        continue;
                    }
                    if (!empty($dateTo) && $logDate > $dateTo) {
                        continue;
                    }
                }

                // Check search query
                if (!empty($search)) {
                    $searchLower = strtolower($search);
                    $msgLower = strtolower($log['msg'] ?? '');
                    $originLower = strtolower($log['origin'] ?? '');
                    $sevLower = strtolower($log['severity'] ?? '');
                    $ipLower = strtolower($log['ip'] ?? '');

                    if (
                        strpos($msgLower, $searchLower) === false &&
                        strpos($originLower, $searchLower) === false &&
                        strpos($sevLower, $searchLower) === false &&
                        strpos($ipLower, $searchLower) === false
                    ) {
                        continue;
                    }
                }

                // Log passed all filters - add to results
                $filteredLogs[] = $log;
            }

            // Second pass: count filtered logs by portal
            foreach ($filteredLogs as $log) {
                $p = $log['portal'] ?? 'requests';
                if (isset($counts[$p])) {
                    $counts[$p]++;
                }
            }

            return [
                'logs' => $filteredLogs,
                'counts' => $counts
            ];
        }

        private static function getEmptyCounts() {
            return [
                'requests' => 0,
                'php' => 0,
                'sql' => 0,
                'js' => 0,
                'telegram' => 0,
                'whatsapp' => 0,
                'security' => 0,
                '404' => 0,
                'audit' => 0,
                'staff_activity' => 0,
                'login' => 0,
                'ai_chat' => 0
            ];
        }
    }

    // Set global error and exception handlers to catch PHP failures without database dependency
    set_exception_handler(function (\Throwable $exception) {
        // Only log REAL errors, not expected/recoverable ones
        if (strpos($exception->getMessage(), 'Expected') === false) {
            TelescopeLogger::log('php', 'Exception', $exception->getMessage(), 'PHP Exception Handler', [
                'file' => $exception->getFile(),
                'line' => $exception->getLine(),
                'trace' => $exception->getTraceAsString()
            ]);
        }
    });

    set_error_handler(function ($errno, $errstr, $errfile, $errline) {
        // Skip notices and warnings in production - only log actual errors.
        // (A direct-server edit outside git briefly removed this filter,
        // which would have flooded Telescope with routine PHP notices/
        // warnings instead of just the errors worth actually looking at.)
        if ($errno === E_NOTICE || $errno === E_USER_NOTICE || $errno === E_WARNING || $errno === E_USER_WARNING) {
            return false;
        }

        $severity = 'Warning';
        if ($errno === E_ERROR || $errno === E_USER_ERROR) {
            $severity = 'Fatal Error';
        } elseif ($errno === E_DEPRECATED || $errno === E_USER_DEPRECATED) {
            $severity = 'Deprecated';
        }

        TelescopeLogger::log('php', $severity, $errstr, 'PHP Error Handler', [
            'file' => $errfile,
            'line' => $errline
        ]);
        return false;
    });

    register_shutdown_function(function () {
        $error = error_get_last();
        if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
            TelescopeLogger::log('php', 'Fatal Error', $error['message'], 'PHP Shutdown Handler', [
                'file' => $error['file'],
                'line' => $error['line']
            ]);
        }
    });
}
