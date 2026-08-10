<?php
/**
 * Schema Verification Cache Helper
 * Prevents redundant SHOW TABLES / SHOW COLUMNS / ALTER TABLE queries from firing on every single request.
 * Schema checks run once per cache period (default 3600 seconds) and skip execution when already verified.
 */

if (!function_exists('isSchemaVerified')) {
    function isSchemaVerified(string $key, int $ttlSeconds = 3600): bool {
        // 1. Static memory cache per PHP execution context
        static $memoryCache = [];
        if (isset($memoryCache[$key])) {
            return true;
        }

        // 2. APCu cache check (if enabled)
        if (function_exists('apcu_fetch')) {
            $success = false;
            $val = apcu_fetch('af_schema_' . $key, $success);
            if ($success && $val) {
                $memoryCache[$key] = true;
                return true;
            }
        }

        // 3. File-based cache fallback in temp directory
        $tmpDir = sys_get_temp_dir();
        $file = $tmpDir . '/af_schema_' . md5($key) . '.lock';

        if (file_exists($file) && (time() - filemtime($file) < $ttlSeconds)) {
            $memoryCache[$key] = true;
            return true;
        }

        return false;
    }
}

if (!function_exists('markSchemaVerified')) {
    function markSchemaVerified(string $key, int $ttlSeconds = 3600): void {
        if (function_exists('apcu_store')) {
            apcu_store('af_schema_' . $key, true, $ttlSeconds);
        }

        $tmpDir = sys_get_temp_dir();
        $file = $tmpDir . '/af_schema_' . md5($key) . '.lock';
        @touch($file);
    }
}
