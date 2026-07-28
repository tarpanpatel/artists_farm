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
        }

        private static function appendLog($entry) {
            $file = self::$logFile;
            $logs = [];

            if (file_exists($file)) {
                $content = @file_get_contents($file);
                if (!empty($content)) {
                    $decoded = @json_decode($content, true);
                    if (is_array($decoded)) {
                        $logs = $decoded;
                    }
                }
            }

            // Unshift new entry to top
            array_unshift($logs, $entry);

            // Cap at last 2000 log entries to prevent file bloating
            if (count($logs) > 2000) {
                $logs = array_slice($logs, 0, 2000);
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

            $counts = [
                'requests' => 0,
                'php' => 0,
                'sql' => 0,
                'js' => 0,
                'telegram' => 0,
                'security' => 0,
                '404' => 0,
                'audit' => 0
            ];

            $filteredLogs = [];
            $now = time();

            foreach ($allLogs as $log) {
                $p = $log['portal'] ?? 'requests';
                if (isset($counts[$p])) {
                    $counts[$p]++;
                }

                // Check portal filter
                if ($portal !== 'all' && $p !== $portal) {
                    continue;
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

                $filteredLogs[] = $log;
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
                'security' => 0,
                '404' => 0,
                'audit' => 0
            ];
        }
    }

    // Set global error and exception handlers to catch PHP failures without database dependency
    set_exception_handler(function ($exception) {
        TelescopeLogger::log('php', 'Exception', $exception->getMessage(), 'PHP Exception Handler', [
            'file' => $exception->getFile(),
            'line' => $exception->getLine(),
            'trace' => $exception->getTraceAsString()
        ]);
    });

    set_error_handler(function ($errno, $errstr, $errfile, $errline) {
        $severity = 'Warning';
        if ($errno === E_ERROR || $errno === E_USER_ERROR) $severity = 'Fatal Error';
        elseif ($errno === E_NOTICE || $errno === E_USER_NOTICE) $severity = 'Notice';

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
