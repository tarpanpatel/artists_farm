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
            self::maybeAlertAdmin($portal, $severity, $msg, $origin);
        }

        /**
         * Best-effort Telegram ping to the platform admin for the severities that mean
         * "something is actually broken" (as opposed to a routine 404 or deprecation
         * notice). Previously, a Fatal Error/SQL Error only ever reached logs.json - the
         * only way to find out was opening Telescope and looking, which for something
         * like a broken guest check-in could mean hours before anyone noticed.
         *
         * Deliberately does NOT go through telegram/sender.php - that file itself
         * require_once's this logger.php (for its own error logging), so requiring it
         * back from here would be a circular include. Talks to the Telegram Bot API
         * directly instead, which only needs the two constants below.
         *
         * Silently does nothing if TELEGRAM_BOT_TOKEN/TELEGRAM_ADMIN_CHAT_ID aren't set
         * (e.g. local XAMPP, which loads no .env - see CLAUDE.md's Telegram section) -
         * this is expected there, not a failure.
         */
        private static function maybeAlertAdmin($portal, $severity, $msg, $origin) {
            $alertWorthy = ['Fatal Error', 'Exception', 'SQL Error'];
            if (!in_array($severity, $alertWorthy, true)) {
                return;
            }

            try {
                require_once __DIR__ . '/../telegram/config.php';
            } catch (\Throwable $e) {
                return;
            }
            if (empty(TELEGRAM_BOT_TOKEN) || empty(TELEGRAM_ADMIN_CHAT_ID)) {
                return;
            }

            // Cooldown so a broken deploy fatal-erroring on every single request
            // doesn't spam dozens of identical Telegram messages per minute - one
            // alert every 2 minutes is still "found out immediately", not hours later.
            $cooldownFile = __DIR__ . '/last_alert.txt';
            $now = time();
            if (file_exists($cooldownFile)) {
                $last = (int) @file_get_contents($cooldownFile);
                if ($now - $last < 120) {
                    return;
                }
            }
            @file_put_contents($cooldownFile, (string) $now, LOCK_EX);

            $text = "🚨 *{$severity}* on " . ($_SERVER['HTTP_HOST'] ?? 'artists-farm') . "\n"
                  . "Portal: {$portal}\n"
                  . "Origin: {$origin}\n"
                  . "Message: " . mb_substr((string) $msg, 0, 500);

            $url = 'https://api.telegram.org/bot' . TELEGRAM_BOT_TOKEN . '/sendMessage';
            $payload = http_build_query([
                'chat_id' => TELEGRAM_ADMIN_CHAT_ID,
                'text' => $text,
                'parse_mode' => 'Markdown',
            ]);

            $context = stream_context_create([
                'http' => [
                    'method' => 'POST',
                    'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
                    'content' => $payload,
                    'timeout' => 3, // never let a Telegram hiccup stall the real request
                ],
            ]);

            // @-suppressed and result ignored on purpose - this must never throw back
            // into the error logger it's being called from, or fail the original request.
            @file_get_contents($url, false, $context);
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

            // Cap at last 300 log entries
            if (count($logs) > 300) {
                $logs = array_slice($logs, 0, 300);
            }

            @file_put_contents($file, json_encode($logs, JSON_PRETTY_PRINT), LOCK_EX);
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
