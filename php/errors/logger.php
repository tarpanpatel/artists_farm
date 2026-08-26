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
         */
        public static function clear() {
            return @file_put_contents(self::$logFile, '[]') !== false;
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
            // AI Assistant feature removed entirely 26 Aug 2026 (see ROADMAP.md) - its
            // 'ai_chat'/'AI Query'/'AI Outcome'/'AI Config Updated' noise-suppression entries,
            // which used to live in $routineNoise below, were removed along with it since
            // php/api/ai_assistant.php and ai_config.php (the only sources of those severities)
            // are archived to _unwanted/ai/ and can no longer log anything here. If this feature
            // is ever rebuilt, re-add whatever its routine (non-error) severities are here rather
            // than letting them alert on every normal use - see git history for the exact strings.
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

        private static function appendLog($entry) {
            $file = self::$logFile;
            $dir = dirname($file);
            if (!is_dir($dir)) {
                @mkdir($dir, 0755, true);
            }

            $logs = [];

            if (file_exists($file)) {
                $content = @file_get_contents($file);
                if (!empty($content)) {
                    $decoded = @json_decode($content, true);
                    if (is_array($decoded)) {
                        $logs = $decoded;
                    }
                }
            } else {
                @touch($file);
                @chmod($file, 0666);
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

            @file_put_contents($file, json_encode($capped, JSON_PRETTY_PRINT), LOCK_EX);
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
                'login' => 0
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
                'login' => 0
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
